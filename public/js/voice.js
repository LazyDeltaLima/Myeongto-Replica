// Operator voice lines (local NAS patch, docs/LOCAL-PATCH.md), in Korean or Japanese, or off:
//   * 오퍼레이터 선택 (select) when the player picks up or selects an own operator;
//   * 배치 (deploy) when the player buys an operator in the shop;
//   * 작전 개시 (start) when a battle starts: one operator of the own board, at random [ASSUMED: who speaks];
//   * 작전 중 (skill) when an operator's skill starts.
//
// Files: data/assets.json audio.voice = { kr|jp: { [charId]: { start, select, deploy, skill: [url…] } } }
// (tools/assets/voice.mjs, downloaded with the rest of the audio). The choice and the voice volume are a per-browser
// preference (`sp.pref.voice`); the voice plays through the audio manager's master gain (mute applies, the SFX slider
// does not). The background resource download (resources.js) only takes the files of the chosen language (voiceWanted).
//
// Overlap follows the official battle voice table (excel/audio_data.json `battleVoice`, VOICE_TYPES below): one voice
// at a time, 0.1 s crossfade. A new line plays when its priority is above the playing line's, or equal and the type
// says overlapIfSamePriority (then it takes over); otherwise it is dropped — never queued. A type with a cooldown
// stays quiet that long after it last played [ASSUMED: per operator]. Types used here:
//   BATTLE_START 100 (start), PLACE_CHAR 20 (deploy), FOCUS_CHAR 10 (select), SKILL_ACTIVE 70 (a MANUAL skill — the engine auto-operates them in this mode),
//   SKILL_PASSIVE_IMP 60 / _NOR 50 (an AUTO skill with SP cost ≥ / < minSpCostForImportantPassiveSkill 10, cooldown 10 s).
// So a select never cuts a skill line, a manual skill cuts any line, and two auto skills never cut each other.
// The line is drawn at random from the role's files (the official banks weigh them equally).
//
//   <VoiceSetting />           the settings row (ui/settings.js)
//   voiceForPiece(piece)       screens/game.js: a picked-up / selected piece
//   voiceForBuy(slot)          screens/game.js: a shop slot bought
//   voiceBattleStart(priv)     screens/game.js: a battle phase began
//   audio.onUnitSkill          set here; audio.js calls it on a battle 'skill' start

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, loadPref, savePref } from './store.js';
import { audio, unitSoundClass } from './audio.js';
import { data } from './data.js';

const PREF = 'voice';
/** Voice languages offered (manifest audio.voice keys) with their labels. */
export const VOICE_LANGS = Object.freeze([['off', '关闭'], ['kr', '韩语'], ['jp', '日语']]);
/** audio_data.json battleVoice.voiceTypeOptions (the types this mode plays): priority, overlapIfSamePriority, cooldown s. */
export const VOICE_TYPES = Object.freeze({
  BATTLE_START: { priority: 100, overlap: true, cooldown: 0 },
  PLACE_CHAR: { priority: 20, overlap: true, cooldown: 0 },
  FOCUS_CHAR: { priority: 10, overlap: true, cooldown: 0 },
  SKILL_ACTIVE: { priority: 70, overlap: true, cooldown: 0 },
  SKILL_PASSIVE_IMP: { priority: 60, overlap: false, cooldown: 10 },
  SKILL_PASSIVE_NOR: { priority: 50, overlap: false, cooldown: 10 },
});
const CROSSFADE_S = 0.1;                  // battleVoice.crossfade
const MIN_SP_IMPORTANT_PASSIVE = 10;      // battleVoice.minSpCostForImportantPassiveSkill

/** @param {any} raw @returns {{ lang: 'off'|'kr'|'jp', vol: number }} */
export function sanitizeVoice(raw) {
  const lang = VOICE_LANGS.some(([id]) => id === raw?.lang) ? raw.lang : 'kr';
  const vol = Number.isFinite(raw?.vol) ? Math.max(0, Math.min(1, Math.round(raw.vol * 100) / 100)) : 0.8;
  return { lang, vol };
}

export const voiceStore = createStore(sanitizeVoice(loadPref(PREF, null)));
voiceStore.subscribe((s) => {
  savePref(PREF, sanitizeVoice(s));
  applyGain();
});

/**
 * Whether the background download keeps a browser-resources.json entry: a voice file only in the chosen language.
 * @param {{ p: string }} f
 */
export function voiceWanted(f) {
  const m = /^\/assets\/audio\/voice\/([^/]+)\//.exec(f?.p || '');
  return !m || m[1] === voiceStore.get().lang;
}

/**
 * The line URLs of one operator and role in the chosen language ([] when off or missing).
 * @param {any} manifest data/assets.json
 * @param {string} charId
 * @param {'start'|'select'|'deploy'|'skill'} role
 * @param {string} [lang]
 */
export function voiceUrls(manifest, charId, role, lang = voiceStore.get().lang) {
  const list = lang === 'off' ? null : manifest?.audio?.voice?.[lang]?.[charId]?.[role];
  return Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u) : [];
}

/**
 * Voice type of a skill start: SKILL_ACTIVE for a MANUAL skill, SKILL_PASSIVE_IMP / _NOR for an AUTO one by its SP
 * cost; null for a PASSIVE skill (never starts) or an unknown record.
 * @param {{ skillType?: string, spCost?: number }|null|undefined} skill
 */
export function skillVoiceType(skill) {
  if (!skill) return null;
  if (skill.skillType === 'MANUAL') return 'SKILL_ACTIVE';
  if (skill.skillType === 'AUTO') return (Number(skill.spCost) || 0) >= MIN_SP_IMPORTANT_PASSIVE ? 'SKILL_PASSIVE_IMP' : 'SKILL_PASSIVE_NOR';
  return null;
}

/**
 * Whether a new line of `type` may play now (official battleVoice rules, header).
 * @param {string} type VOICE_TYPES key
 * @param {{ type: string }|null} playing the line playing now (null: silence)
 * @param {number|undefined} lastAt seconds when this type last played for this operator
 * @param {number} now seconds
 */
export function voiceAllowed(type, playing, lastAt, now) {
  const t = VOICE_TYPES[type];
  if (!t) return false;
  if (t.cooldown > 0 && Number.isFinite(lastAt) && now - lastAt < t.cooldown) return false;
  if (!playing) return true;
  const p = VOICE_TYPES[playing.type]?.priority ?? 0;
  return t.priority > p || (t.priority === p && t.overlap);
}

let gain = null;
let current = null;            // { type, token, src?, g? } — the line playing (or loading)
const lastPlayed = new Map();  // `${type}:${charId}` → seconds

function applyGain() {
  if (!gain || !audio.ctx) return;
  try { gain.gain.setTargetAtTime(voiceStore.get().vol ** 2, audio.ctx.currentTime, 0.03); } catch { /* ignore */ }
}

function ensureGain() {
  if (gain || !audio.ctx || !audio.master) return gain;
  try {
    gain = audio.ctx.createGain();
    gain.gain.value = voiceStore.get().vol ** 2;
    gain.connect(audio.master);
  } catch { gain = null; }
  return gain;
}

/** Fade the playing line out over the crossfade and forget it. */
function stopCurrent() {
  const c = current;
  current = null;
  if (!c?.src) return;
  try {
    const t = audio.ctx.currentTime;
    c.g.gain.setValueAtTime(c.g.gain.value, t);
    c.g.gain.linearRampToValueAtTime(0, t + CROSSFADE_S);
    c.src.stop(t + CROSSFADE_S);
  } catch { try { c.src.stop(); } catch { /* already ended */ } }
}

/**
 * Play one line of an operator. Never throws.
 * @param {string} charId
 * @param {'start'|'select'|'deploy'|'skill'} role
 * @param {string} type VOICE_TYPES key
 */
export function playVoice(charId, role, type) {
  try {
    const s = voiceStore.get();
    if (s.lang === 'off' || s.vol <= 0 || !audio.ctx || audio.volumes.muted || typeof charId !== 'string') return;
    const now = audio.ctx.currentTime;
    const key = `${type}:${charId}`;
    if (!voiceAllowed(type, current, lastPlayed.get(key), now)) return;
    const urls = voiceUrls(audio.getManifest(), charId, role, s.lang);
    if (!urls.length || !ensureGain()) return;
    const url = urls[Math.floor(Math.random() * urls.length)];
    stopCurrent();
    lastPlayed.set(key, now);
    const token = {};
    current = { type, token };
    audio._buffer(url).then((buf) => {
      if (!buf || current?.token !== token) { if (current?.token === token) current = null; return; } // failed, or replaced
      const t = audio.ctx.currentTime;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + CROSSFADE_S);
      g.connect(gain);
      const src = audio.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      src.onended = () => { try { g.disconnect(); } catch { /* ignore */ } if (current?.src === src) current = null; };
      current.src = src;
      current.g = g;
      src.start(t);
    }, () => { if (current?.token === token) current = null; });
  } catch (err) { console.warn('[voice]', err); }
}

/** Voice key (charId, the model id like audio.js units) of a chess id; null for an item / token / DIY slot. */
export function chessVoiceId(chessId) {
  const rec = typeof chessId === 'string' ? data.lookup('chess', chessId) : null;
  return rec?.assets?.spine || rec?.charId || null;
}

/**
 * The operator of a board / bench piece (screens/game.js pieceDragStart / pieceClick): its select line.
 * @param {{ kind?: string, id?: string }|null|undefined} piece
 */
export function voiceForPiece(piece) {
  if (!piece || piece.kind === 'item' || piece.kind === 'token') return;
  const id = chessVoiceId(piece.id);
  if (id) playVoice(id, 'select', 'FOCUS_CHAR');
}

/**
 * A shop slot the player just bought (screens/game.js buy): the operator's deploy line.
 * @param {{ kind?: string, id?: string }|null|undefined} slot
 */
export function voiceForBuy(slot) {
  if (!slot || slot.kind === 'item') return;
  const id = chessVoiceId(slot.id);
  if (id) playVoice(id, 'deploy', 'PLACE_CHAR');
}

/**
 * A battle phase began (screens/game.js phase changes): 작전 개시 by one operator of the own board, at random among
 * those that have the line.
 * @param {{ board?: Array<{ kind?: string, id?: string }> }|null|undefined} priv
 */
export function voiceBattleStart(priv) {
  const lang = voiceStore.get().lang;
  const m = audio.getManifest();
  const ids = [...new Set((Array.isArray(priv?.board) ? priv.board : [])
    .filter((p) => p?.kind === 'chess').map((p) => chessVoiceId(p.id)).filter(Boolean))]
    .filter((id) => voiceUrls(m, id, 'start', lang).length);
  if (ids.length) playVoice(ids[Math.floor(Math.random() * ids.length)], 'start', 'BATTLE_START');
}

// a battle 'skill' start (audio.js handleBattleEvents): operators only — summons and enemies have no lines. The voice
// type comes from the equipped skill (UnitInfo defId = chessId, skillIndex).
audio.onUnitSkill = (u) => {
  if (!u || unitSoundClass(u) !== 'char') return;
  const rec = data.lookup('chess', u.defId);
  const skill = (Number.isInteger(u.skillIndex) ? rec?.skills?.find((k) => k.index === u.skillIndex) : null) ?? rec?.skill;
  const type = skillVoiceType(skill);
  if (type) playVoice(u.def, 'skill', type);
};

/** Settings row (ui/settings.js): voice language and volume. */
export function VoiceSetting() {
  const s = useStore((x) => x, Object.is, voiceStore);
  const set = (patch) => voiceStore.set(sanitizeVoice({ ...voiceStore.get(), ...patch }));
  const pct = Math.round(s.vol * 100);
  return html`<div class="set-row">
      <span class="set-row__label">干员语音<${MicroLabel}>VOICE<//></span>
      <div class="set-seg" role="radiogroup">
        ${VOICE_LANGS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.lang === id ? 'true' : 'false'}
          class=${s.lang === id ? 'is-on' : ''} onClick=${() => setVoiceLang(id)}>${label}</button>`)}
      </div>
    </div>
    ${s.lang === 'off' ? null : html`<label class="set-row">
      <span class="set-row__label">语音音量<${MicroLabel}>VOICE VOLUME<//></span>
      <input class="set-range" type="range" min="0" max="100" step="5" value=${pct} style=${`--pct:${pct}%`}
        onInput=${(e) => set({ vol: Number(e.currentTarget.value) / 100 })} />
      <span class="set-row__val num">${pct}</span>
    </label>`}`;
}

/** Choose the voice language (settings row, resources.js consent card): saved, the playing line stops, the download
 *  list is re-filtered. */
export function setVoiceLang(id) {
  if (voiceStore.get().lang === id || !VOICE_LANGS.some(([x]) => x === id)) return;
  voiceStore.set(sanitizeVoice({ ...voiceStore.get(), lang: id }));
  onLangChange();
}

let langListeners = [];
/** resources.js: re-filter the download list when the language changes. */
export function onVoiceLangChange(fn) { langListeners.push(fn); }
function onLangChange() {
  stopCurrent();
  for (const fn of langListeners) { try { fn(); } catch { /* ignore */ } }
}

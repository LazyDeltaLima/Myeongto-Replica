// Operator voice: language choice and the 休整期 lines (local patch, docs/LOCAL-PATCH.md), on top of upstream's
// 干员战斗语音 (#73, public/js/audio.js voice / VoiceGate: 行动出发 / 行动开始 / 部署 / 作战中1-4 / 结算 in battle, its own
// channel and the 干员语音 volume slider).
//   * Language: Korean (`audio.voice`, the build's dub — fetch-assets --voice-lang=kr), Japanese (`audio.voiceJp`, the
//     twin of tools/assets/voice.mjs) or off, per browser (`sp.pref.voice`). audio.voice() reads the table given by
//     `audio.voiceTable` below. The background resource download (resources.js) only takes the chosen dub (voiceWanted).
//   * 休整期 lines (upstream keeps the prep silent; the owner wants them): 选中干员 `select` when the player picks up or
//     selects an own operator, 部署 `place` when the player buys one in the shop or takes one from a reward offer. They
//     go through the same gate as the battle lines.
//   * The official scheduling (voicePolicy.js, owner 2026-10-06): no global gap, priority / same-priority overlap /
//     cooldown by the official voice type, a random 作战中, 行动开始 once per battle, no 部署 burst at the battle start.
//
//   <VoiceSetting />           the settings row (ui/settings.js): language
//   voiceForPiece(piece)       screens/game.js: a picked-up / selected piece
//   voiceForBuy(slot)          screens/game.js: a shop slot bought / a reward picked
//   holdResultVoice(line)      screens/game.js onResult: the own battle's 结算 line, kept instead of played
//   playMatchEndVoice(res, me) screens/result.js: the kept line on a won settlement, if the player was not knocked out
//
// 结算 lines (owner 2026-10-07, from play on the official client): upstream says the 3星 / 非3星 / 高难 / 失败 line at
// the end of every battle; the official game is silent at a round's end and speaks only on the settlement after the
// boss is down (作战结束). A player knocked out during the run hears nothing. The line and the speaker stay upstream's
// pick (resultVoiceSlot / resultSpeaker) for the last battle the player fought; 行动失败 never goes with a win (a lost
// Hidden Core round after the cleared boss) → the 非3星 line.

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, loadPref, savePref, store } from './store.js';
import { audio } from './audio.js';
import { data } from './data.js';
import { OfficialVoiceGate, createVoicePolicy } from './voicePolicy.js';

const PREF = 'voice';
/** Voice languages offered with their labels: off, the build's dub (audio.voice) and the Japanese twin (audio.voiceJp). */
export const VOICE_LANGS = Object.freeze([['off', '关闭'], ['kr', '韩语'], ['jp', '日语']]);

/** @param {any} raw @returns {{ lang: 'off'|'kr'|'jp' }} */
export function sanitizeVoice(raw) {
  return { lang: VOICE_LANGS.some(([id]) => id === raw?.lang) ? raw.lang : 'kr' };
}

export const voiceStore = createStore(sanitizeVoice(loadPref(PREF, null)));
voiceStore.subscribe((s) => savePref(PREF, sanitizeVoice(s)));

/**
 * The voice table of a language in the manifest (null when off).
 * @param {any} manifest data/assets.json
 * @param {string} [lang]
 */
export function voiceTableOf(manifest, lang = voiceStore.get().lang) {
  if (lang === 'off') return null;
  return (lang === 'jp' ? manifest?.audio?.voiceJp : manifest?.audio?.voice) || null;
}
audio.voiceTable = () => voiceTableOf(audio.getManifest());

// the official battle voice rules (voicePolicy.js): its gate replaces upstream's VoiceGate, its policy drives the
// 作战中 / 行动开始 / opening-deployment choices in audio.js handleBattleEvents
audio.voiceGate = new OfficialVoiceGate();
audio.voicePolicy = createVoicePolicy({
  skillOf: (u) => {
    const rec = typeof u?.defId === 'string' ? data.lookup('chess', u.defId) : null;
    return (Number.isInteger(u?.skillIndex) ? rec?.skills?.find((k) => k.index === u.skillIndex) : null) ?? rec?.skill ?? null;
  },
  slotsOf: (charId) => Object.keys(audio.voiceTable?.()?.[charId] || {}),
});

/**
 * Whether the background download keeps a browser-resources.json entry: a voice file only in the chosen language.
 * @param {{ p: string }} f
 */
export function voiceWanted(f) {
  const m = /^\/assets\/audio\/voice\/([^/]+)\//.exec(f?.p || '');
  return !m || m[1] === voiceStore.get().lang;
}

/** Voice key (charId, the model id like audio.js units) of a chess id; null for an item / token / DIY slot. */
export function chessVoiceId(chessId) {
  const rec = typeof chessId === 'string' ? data.lookup('chess', chessId) : null;
  return rec?.assets?.spine || rec?.charId || null;
}

/**
 * The operator of a board / bench piece (screens/game.js pieceDragStart / pieceClick): its 选中干员 line.
 * @param {{ kind?: string, id?: string, uid?: string|number }|null|undefined} piece
 */
export function voiceForPiece(piece) {
  if (!piece || piece.kind === 'item' || piece.kind === 'token') return;
  const id = chessVoiceId(piece.id);
  if (id) audio.voice(id, 'select', { unitKey: `prep:${piece.uid ?? id}` });
}

/**
 * A shop slot the player just bought / a reward offer taken (screens/game.js buy, pickReward): its 部署 line.
 * @param {{ kind?: string, id?: string }|null|undefined} slot
 */
export function voiceForBuy(slot) {
  if (!slot || slot.kind === 'item') return;
  const id = chessVoiceId(slot.id);
  if (id) audio.voice(id, 'place', { unitKey: `prep:${id}` });
}

let heldResult = null;
// a new match (or leaving one) empties m.public / m.result: a line kept from the last run never reaches the next
store.subscribe((s, prev) => { if (!s.match?.public && !s.match?.result && (prev?.match?.public || prev?.match?.result)) heldResult = null; });

/** Keep the own battle's 结算 line (screens/game.js onResult) for the settlement. @param {{ charId: string, slot: string }|null} line */
export function holdResultVoice(line) {
  if (line && typeof line.charId === 'string' && typeof line.slot === 'string') heldResult = { charId: line.charId, slot: line.slot };
}

/**
 * The settlement's line (pure): the kept line on a win when the player is still in; null otherwise.
 * @param {{ charId: string, slot: string }|null} held
 * @param {{ victory?: boolean, players?: Array<{ playerId?: string, alive?: boolean }> }|null} res normalizeResult()
 * @param {string|null|undefined} myId
 */
export function matchEndVoice(held, res, myId) {
  if (!held || !res?.victory) return null;
  const me = Array.isArray(res.players) ? res.players.find((p) => p && p.playerId === myId) : null;
  if (!me || me.alive === false) return null;
  return { charId: held.charId, slot: held.slot === 'resultLose' ? 'resultTwo' : held.slot };
}

/** screens/result.js: say the kept line once (the settlement screen mounted). */
export function playMatchEndVoice(res, myId) {
  const line = matchEndVoice(heldResult, res, myId);
  heldResult = null;
  if (line) audio.voice(line.charId, line.slot);
}

/** Settings row (ui/settings.js): the voice language (the volume is upstream's 干员语音 slider). */
export function VoiceSetting() {
  const s = useStore((x) => x, Object.is, voiceStore);
  return html`<div class="set-row">
      <span class="set-row__label">语音语言<${MicroLabel}>VOICE LANGUAGE<//></span>
      <div class="set-seg" role="radiogroup">
        ${VOICE_LANGS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.lang === id ? 'true' : 'false'}
          class=${s.lang === id ? 'is-on' : ''} onClick=${() => setVoiceLang(id)}>${label}</button>`)}
      </div>
    </div>`;
}

/** Choose the voice language (settings row, resources.js consent card): saved, the playing line stops, the download
 *  list is re-filtered. */
export function setVoiceLang(id) {
  if (voiceStore.get().lang === id || !VOICE_LANGS.some(([x]) => x === id)) return;
  voiceStore.set(sanitizeVoice({ ...voiceStore.get(), lang: id }));
  try { audio._stopVoice(); } catch { /* ignore */ }
  for (const fn of langListeners) { try { fn(); } catch { /* ignore */ } }
}

const langListeners = [];
/** resources.js: re-filter the download list when the language changes. */
export function onVoiceLangChange(fn) { langListeners.push(fn); }

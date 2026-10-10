// Operator voice: language choice and the 休整期 lines (local patch, docs/LOCAL-PATCH.md), on top of upstream's
// 干员战斗语音 (#73, public/js/audio.js voice / VoiceGate: 行动出发 / 行动开始 / 部署 / 作战中1-4 / 结算 in battle, its own
// channel and the 干员语音 volume slider).
//   * Language: Korean (`audio.voice`, the build's dub — fetch-assets --voice-lang=kr), Japanese (`audio.voiceJp`, the
//     twin of tools/assets/voice.mjs) or off, per browser (`sp.pref.voice`). audio.voice() reads the table given by
//     `audio.voiceTable` below. The background resource download (resources.js) only takes the chosen dub (voiceWanted).
//   * 选中干员 `select` (upstream keeps the prep silent; the owner wants it): when the player taps an own operator on the
//     board / bench — again on a tap of the one already selected — and a battle unit. Not when a drag to place starts,
//     and no 部署 `place` line when an operator is bought / rewarded (only its deploy SFX) — the owner's 卫戍协议 videos,
//     2026-10-08. The 部署 line when the player places one from the bench on the board (voiceForPlace, 2-5 2026-10-08). They go through the same gate as the battle lines (a 选中 line never cuts a skill line: priority).
//   * The official scheduling (voicePolicy.js, owner 2026-10-06; client code 2026-10-10): no global gap, priority /
//     same-priority overlap / cooldown per official voice type (shared by every operator, from the line's end), a random
//     作战中; at each battle start a random own piece's 部署 (行动出发 once, at the match's first battle); 行动开始 when an
//     official route preview cursor of the battle's start appears (voiceForRoutePreview).
//
//   <VoiceSetting />           the settings row (ui/settings.js): language
//   voiceForPiece(piece, shown) screens/game.js: a tapped board / bench piece (shown = the record it shows: 自选 / 补位)
//   voiceForPlace(unit, uid)   screens/game.js: an operator the player placed from the bench on the board (部署)
//   voiceForUnit(info, id)     screens/game.js: a tapped battle unit
//   voiceForRoutePreview(ids)  screens/game.js: a battle-start route preview cursor appeared (render/fxroute.js) → 行动开始
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
import { unitForm } from '../../shared/standIn.js';
import { t, N_ } from '../../shared/i18n.js';

const PREF = 'voice';
/** Voice languages offered with their labels: off, the build's dub (audio.voice) and the Japanese twin (audio.voiceJp). */
export const VOICE_LANGS = Object.freeze([['off', N_('关闭')], ['kr', N_('韩语')], ['jp', N_('日语')]]);

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
  skillOf: (u) => unitSkillOf(typeof u?.defId === 'string' ? data.lookup('chess', u.defId) : null, u?.def, u?.skillIndex, data.get('backups')),
  slotsOf: (charId) => Object.keys(audio.voiceTable?.()?.[charId] || {}),
  // the battle start's speaker is one of the player's own pieces (AutoChessGameModeVoicePlugin._OnBattleStarted reads the
  // own battleChessInsts) — a teammate's operator on a shared field never says it
  own: (u) => { const me = store.get()?.me?.playerId; return u?.ownerId == null || !me || u.ownerId === me; },
});
// a match entered or left is a new game (VoicePlayer.OnGameReset): 行动出发 and the first 行动开始 come again
store.subscribe((s, prev) => { if (!!s.match?.public !== !!prev?.match?.public) audio.voicePolicy?.newGame?.(); });

/**
 * The skill record a battle unit fights with (voicePolicy `skillOf`: its official voice type — 自动 60 / 50 with the 10 s
 * cooldown, 手动 70). `rec` is the unit's chess record (UnitInfo `defId`); when the unit's model `def` (UnitInfo `spine` —
 * the operator who fields it) is another character, the chess is a 自选 slot (0.2.0: `charId` null, no skills of its own)
 * or a 补位 chess (its record holds the replaced operator's skills) → the skill of that character's form at the chess's
 * status (data/backups.json — the form shared/diy.js / shared/standIn.js compose the fielded record from), by the unit's
 * skill index. 2026-10-08: 望 S1 / S2, 维什戴尔 S1, 阿斯卡纶 S1 (AUTO) were typed SKILL_ACTIVE.
 * @param {any} rec data/chess.json record @param {string|null|undefined} def @param {number|null|undefined} skillIndex
 * @param {any} backups data/backups.json
 */
export function unitSkillOf(rec, def, skillIndex, backups) {
  if (!rec) return null;
  const byIndex = (list) => (Number.isInteger(skillIndex) && Array.isArray(list) ? list.find((k) => k && k.index === skillIndex) ?? null : null);
  if (typeof def === 'string' && def.startsWith('char_') && def !== rec.charId) {
    const form = unitForm(backups, def, rec.status);
    if (form) return byIndex(form.skills);
  }
  return byIndex(rec.skills) ?? rec.skill ?? null;
}

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
 * The operator of a board / bench piece the player tapped (screens/game.js pieceClick): its 选中干员 line.
 * `shown` = the record the own piece shows (screens/game.js ownShown): a filled 自选 slot's operator (0.2.0: the slot's
 * chess record has no charId / assets), a 补位 piece's stand-in (its own voice bank — the 预备干员 have none, so it is
 * silent like its battle unit, voiceForUnit) — without it the chess record's operator.
 * @param {{ kind?: string, id?: string, uid?: string|number }|null|undefined} piece
 * @param {{ charId?: string|null, assets?: { spine?: string|null }|null }|null} [shown]
 */
export function voiceForPiece(piece, shown = null) {
  if (!piece || piece.kind === 'item' || piece.kind === 'token') return;
  const id = shown && typeof shown === 'object' ? shown.assets?.spine || shown.charId || null : chessVoiceId(piece.id);
  if (typeof id === 'string' && id.startsWith('char_')) audio.voice(id, 'select', { unitKey: `prep:${piece.uid ?? id}` });
}

/**
 * An operator the player placed from the bench on the board (screens/game.js: a committed direction-wheel placement whose
 * piece then drops in on its tile — render/app.js pieceDeploy): its 部署 line. User re-report 2026-10-08 2-5 「오퍼가 보드에
 * 배치될 때 배치 대사가 안 나옴」, owner decision 2026-10-08: bench → board only (not a move on the board, a return to the
 * bench, the lineup dropping in again after a battle, the server's auto placement). Client: the prep's piece manager
 * AutoChessDummyManager `_OnCharacterPlaced(placeToBattle, placeToHand)` → `_PlayAudioWhenCharacterPlaced` (names only —
 * that its sound includes the line is [추정], from the maintainer's play). Not a summon's (no voice bank).
 * @param {{ kind?: string, spine?: string|null, defId?: string|null }|null|undefined} unit render piece info
 * @param {string|number|null} [uid]
 */
export function voiceForPlace(unit, uid = null) {
  if (!unit || unit.kind === 'item' || unit.kind === 'token') return;
  const id = unit.spine || (typeof unit.defId === 'string' ? chessVoiceId(unit.defId) : null);
  if (typeof id === 'string' && id.startsWith('char_')) audio.voice(id, 'place', { unitKey: `prep:${uid ?? id}` });
}

/**
 * A battle unit the player tapped (screens/game.js pieceClick, also on a re-tap): an operator's 选中干员 line — not an
 * enemy's, a summon's or a device's.
 * @param {{ side?: string, kind?: string, spine?: string|null, defId?: string|null }|null|undefined} info render UnitInfo
 * @param {string|number|null} [unitId]
 */
export function voiceForUnit(info, unitId = null) {
  if (!info || info.side === 'enemy' || info.kind === 'token' || info.kind === 'device') return;
  const id = info.spine || (typeof info.defId === 'string' ? chessVoiceId(info.defId) : null);
  if (typeof id === 'string' && id.startsWith('char_')) audio.voice(id, 'select', { unitKey: `battle:${unitId ?? id}` });
}

/**
 * An official route preview cursor of the battle's start appeared on a field of the player's own (render/fxroute.js
 * createBattleCursors onSpawn → render/app.js 'routePreview' → screens/game.js): 行动开始 — the client's
 * VoicePlayer._OnPreviewCursorSpawn (RVA 0xD7FA40), once per cursor spawn: the first time at once, later only after 3 s
 * without an enemy on the field (audio.noEnemyMs), said by a random card but the last one who said it; when that line
 * cannot play, once more by a random card (its retry without a voice query). [추정] the cards (m_cardDataList, the battle
 * deck) = the operators on the own board. The boss-prep route preview (our feature) never calls this (관리자 결정
 * (2026-10-10)).
 * @param {string[]} cards charIds of the own board's operators
 */
export function voiceForRoutePreview(cards) {
  const pol = audio.voicePolicy;
  if (!pol?.encounter) return;
  const list = (Array.isArray(cards) ? cards : []).filter((c) => typeof c === 'string' && c.startsWith('char_'));
  const id = pol.encounter(list, audio.noEnemyMs());
  if (!id) return;
  const opts = { unitKey: `enc:${id}`, type: 'ENCOUNTER_ENEMY' };
  let said = audio.voice(id, 'faceEnemy', opts) ? id : null;
  if (!said) { const other = pol.anyCard(list); if (other && audio.voice(other, 'faceEnemy', opts)) said = other; }
  pol.encountered(said);
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
      <span class="set-row__label">${t('语音语言')}<${MicroLabel}>VOICE LANGUAGE<//></span>
      <div class="set-seg" role="radiogroup">
        ${VOICE_LANGS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${s.lang === id ? 'true' : 'false'}
          class=${s.lang === id ? 'is-on' : ''} onClick=${() => setVoiceLang(id)}>${t(label)}</button>`)}
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

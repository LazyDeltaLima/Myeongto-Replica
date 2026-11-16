// 名片干员 (after upstream 0.3.3): the portrait on a Doctor's seat card in the waiting room (screens/room.js) — the
// operator the player picked (room.card; everybody sees it as room.state seats[].card), else one of the 5★/6★ operators
// chosen by the player id, the same on every client. The rules are pure: the screen passes the chess records
// (ui/assetUrls.js chessPortraitUrl turns the operator into its portrait; without the art the card keeps its avatar
// frame). The pick itself lives in `cardStore` (a pref; ui/cardSync.js sends it).
// [ASSUMED·자료 없음] The event's card shows the account's assistant (名片形象): this remake has no accounts, so the pick
// is made on one's own seat card and kept in this browser (CARD_PREF 'room.card').
// [ASSUMED·자료 없음] With no pick, a 5★/6★ operator is chosen by hash32(playerId) — a remake rule, so that every card has
// art as in the event's room and every client draws the same one.

import { createStore, loadPref, savePref } from '../store.js';
import { isLocalDiyPick } from '../../../shared/local-diy.js';
import { ownerSkin } from './skins.js';

/** 名片干员: the player's own pick (a localStorage pref, sent as room.card). */
export const CARD_PREF = 'room.card';

/** The store field of the pick and its sync state field (ui/cardSync.js). */
export const CARD_KEY = 'card';
export const CARD_SYNC_KEY = 'cardSync';

/** A stored pick as the store holds it: a charId string, '' for none (默认). */
export function parseStoredCard(v) {
  return typeof v === 'string' ? v : '';
}

/** This browser's pick and its sync state (survives room / match resets). */
export const cardStore = createStore({ [CARD_KEY]: parseStoredCard(loadPref(CARD_PREF, '')), [CARD_SYNC_KEY]: 'idle' });

/**
 * Pick the 名片干员 ('' = 默认): persisted at once, the sync sends it.
 * @param {string} charId
 */
export function setCard(charId) {
  const next = parseStoredCard(charId);
  try { savePref(CARD_PREF, next); } catch { /* private mode: the session keeps it */ }
  cardStore.set({ [CARD_KEY]: next });
}

/** FNV-1a of a string (the default portrait: the same operator for a player on every client). */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= /** @type {number} */ (ch.codePointAt(0)); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * The operators a seat card can show — the server's room.card whitelist (server/lobby.js cardCharIds): one record per
 * charId of the visible, non-自选 chess records (the golden form first, for its E2 art), then the 自选 picks this server
 * offers (`backups.diy.ownedPool` ∩ shared/local-diy.js, named and rated by `backups.diy.operators` — those operators have
 * no chess record of their own), 6★ first, then by name.
 * @param {any[]} chessList chess.json records
 * @param {any} [backups] backups.json
 * @returns {any[]}
 */
export function cardOperators(chessList, backups = null) {
  const by = new Map();
  for (const c of Array.isArray(chessList) ? chessList : []) {
    if (!c || c.isDiy || c.visible === false || typeof c.charId !== 'string') continue;
    const prev = by.get(c.charId);
    if (!prev || (c.isGolden && !prev.isGolden)) by.set(c.charId, c);
  }
  const diy = backups && typeof backups === 'object' ? backups.diy : null;
  const pool = diy && Array.isArray(diy.ownedPool) ? diy.ownedPool : [];
  const ops = diy && diy.operators && typeof diy.operators === 'object' ? diy.operators : {};
  for (const id of pool) {
    if (typeof id !== 'string' || !id || by.has(id) || !isLocalDiyPick(id)) continue;
    const rec = ops[id];
    by.set(id, { charId: id, name: rec && typeof rec.name === 'string' ? rec.name : id, rarity: rec && Number.isFinite(rec.rarity) ? rec.rarity : 0,
      assets: { portrait: `${id}_2`, avatar: `${id}_2` } }); // the E2 art (ui/assetUrls.js reads '_2' as portraitE2)
  }
  return [...by.values()].sort((a, b) => ((b.rarity ?? 0) - (a.rarity ?? 0)) || String(a.name).localeCompare(String(b.name), 'ko'));
}

/**
 * What the seat cards draw from: the pickable operators by charId and the default pool (5★/6★ chess records, by charId
 * so every client orders it the same).
 * @param {any[]} list cardOperators()
 * @param {{ pending?: boolean }} [opts] pending: the 自选 pool (backups) is still loading — a pick not in the list yet
 *   waits for it instead of drawing a default operator for a moment
 */
export function cardContext(list, { pending = false } = {}) {
  return {
    pending,
    byChar: new Map(list.map((c) => [c.charId, c])),
    pool: list.filter((c) => (c.rarity ?? 0) >= 5 && c.chessId).sort((a, b) => (a.charId < b.charId ? -1 : a.charId > b.charId ? 1 : 0)),
  };
}

/**
 * The operator on a seat card: the player's pick (one's own seat shows the local pick at once, the others the server's
 * seats[].card), else one of the pool chosen by the player id [ASSUMED, see the header]. null for an empty seat, a bot,
 * or before the data loads.
 * @param {any} seat room.state seat
 * @param {{ byChar: Map<string, any>, pool: any[], pending?: boolean }} ctx cardContext()
 * @param {{ myId?: any, myCard?: string }} [own]
 * @returns {{ chess: any, picked: boolean } | null}
 */
export function seatOperator(seat, { byChar, pool, pending = false }, { myId, myCard } = {}) {
  if (!seat || seat.playerId == null || seat.isBot) return null;
  const pick = (seat.playerId === myId ? myCard : seat.card) || '';
  const rec = pick && byChar ? byChar.get(pick) : null;
  if (rec) return { chess: rec, picked: true };
  if (pick && pending) return null;
  if (!Array.isArray(pool) || !pool.length) return null;
  return { chess: pool[hash32(seat.playerId) % pool.length], picked: false };
}

/**
 * The picture a seat card draws: the first of `srcs` that has not failed to load in this card (`failed`); null when none
 * is left, and the card shows its avatar frame.
 * @param {(string | null | undefined)[]} srcs in order of preference
 * @param {readonly string[]} [failed]
 * @returns {string | null}
 */
export function seatArtSrc(srcs, failed = []) {
  for (const src of Array.isArray(srcs) ? srcs : []) if (src && !failed.includes(src)) return src;
  return null;
}

/**
 * The skin a seat card's operator wears (upstream ui/seatArt.js seatCardSkin; docs/rules/ui.md 「스킨 고르기」): one's own
 * card this browser's choice at once (`localSkins`), another Doctor's the choice the seat published (room.state
 * seats[].skins) unless 其他玩家的皮肤 is off, and nobody's without the skin data (`pack`). null = the default portrait.
 * An AI seat and an empty one wear nothing.
 * @param {any} seat room.state seat @param {string|null|undefined} charId the card's operator
 * @param {{ myId?: any, localSkins?: Record<string, string>, otherSkins?: boolean, pack?: boolean }} [ctx]
 * @returns {string|null}
 */
export function seatCardSkin(seat, charId, { myId = null, localSkins = {}, otherSkins = true, pack = false } = {}) {
  if (!seat || seat.isBot || seat.playerId == null || !charId) return null;
  return ownerSkin(charId, { ownerId: seat.playerId, myId, players: [seat], localSkins, otherSkins, pack });
}

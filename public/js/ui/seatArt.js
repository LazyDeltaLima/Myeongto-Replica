// 名片干员 (after upstream 0.3.3): the portrait on a Doctor's seat card in the waiting room (screens/room.js) — the
// operator the player picked (room.card; everybody sees it as room.state seats[].card), else one of the 5★/6★ operators
// of the room's season chosen by the player id, the same on every client. The rules are pure: the screen passes
// data/cards.json (shared/cardOperators.js; ui/seatCards.js) (ui/assetUrls.js chessPortraitUrl turns the operator into its portrait; without the art the card keeps its avatar
// frame). The pick itself lives in `cardStore` (a pref; ui/cardSync.js sends it).
// [ASSUMED·자료 없음] The event's card shows the account's assistant (名片形象): this remake has no accounts, so the pick
// is made on one's own seat card and kept in this browser (CARD_PREF 'room.card').
// [ASSUMED·자료 없음] With no pick, a 5★/6★ operator is chosen by hash32(playerId) — a remake rule, so that every card has
// art as in the event's room and every client draws the same one.

import { createStore, loadPref, savePref } from '../store.js';
import { ownerSkin } from './skins.js';
import { illustEntry } from '../illust-res.js';

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
 * The operators a seat card can show (data/cards.json, shared/cardOperators.js — the server's room.card whitelist, any
 * room's season: maintainer request 2026-11-18): those of a season in `seasons` (the ones the server offers), named in
 * the current locale (`localeName`, the overlays' Chinese → name map: the same names the chess records show), 6★ first,
 * then by name.
 * @param {any} file data/cards.json
 * @param {{ seasons?: readonly string[], localeName?: (zh: string) => string }} [opts]
 * @returns {any[]}
 */
export function cardOperators(file, { seasons = [], localeName = (zh) => zh } = {}) {
  const ops = file && Array.isArray(file.operators) ? file.operators : [];
  const out = [];
  for (const o of ops) {
    if (!o || typeof o.charId !== 'string' || !Array.isArray(o.seasons) || !o.seasons.some((s) => seasons.includes(s))) continue;
    out.push({ ...o, name: localeName(o.name) });
  }
  return out.sort((a, b) => ((b.rarity ?? 0) - (a.rarity ?? 0)) || String(a.name).localeCompare(String(b.name), 'ko'));
}

/**
 * What the seat cards draw from: the pickable operators by charId and the default pool — the operators whose `pool`
 * names the room's season (5★ / 6★ chess records of it), by charId so every client orders it the same. Another season's
 * operators never join the pool: a card nobody picked shows the same operator whatever seasons the server offers.
 * @param {any[]} list cardOperators()
 * @param {{ pending?: boolean, season?: string }} [opts] pending: data/cards.json is still loading — a pick waits for it
 *   instead of drawing a default operator for a moment. season: the room's season (the page's data season)
 */
export function cardContext(list, { pending = false, season = '' } = {}) {
  return {
    pending,
    byChar: new Map(list.map((c) => [c.charId, c])),
    pool: list.filter((c) => Array.isArray(c.pool) && c.pool.includes(season)).sort((a, b) => (a.charId < b.charId ? -1 : a.charId > b.charId ? 1 : 0)),
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
 * The seat card's pictures as `{ src, frame }` (frame: the 立绘's RectTransform, room.css draws it by that; null for a
 * 180×360 portrait): the first of `pics` whose src has not failed in this card, else null (the avatar frame).
 * @param {({ src?: string|null, frame?: any } | null | undefined)[]} pics in order of preference
 * @param {readonly string[]} [failed]
 * @returns {{ src: string, frame: { x: number, y: number, w: number, h: number } | null } | null}
 */
export function seatPicture(pics, failed = []) {
  for (const p of Array.isArray(pics) ? pics : []) {
    if (p && typeof p.src === 'string' && p.src && !failed.includes(p.src)) return { src: p.src, frame: rectOf(p.frame) };
  }
  return null;
}

const rectOf = (f) => (f && typeof f === 'object' && [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 0 && f.h > 0
  ? { x: f.x, y: f.y, w: f.w, h: f.h } : null);

/**
 * The seat card's 立绘 of operator record `chess`: the local art (data/local-assets.json `chararts`, keyed by tmplId /
 * charId; the chosen copy, illustEntry) by its RectTransform frame (`rect`, tools/local-extract/chararts_extract.py
 * illust_rect: the frame the official player card draws it by, docs/rules/ui.md 「명함 오퍼레이터」). null without the
 * art or the frame: the card falls back to the 180×360 portrait.
 * @param {any} local data/local-assets.json @param {any} chess @param {boolean} [hi] the original-resolution copy
 * @returns {{ src: string, frame: { x: number, y: number, w: number, h: number } } | null}
 */
export function seatIllust(local, chess, hi) {
  const id = (typeof chess?.tmplId === 'string' && chess.tmplId) || chess?.charId;
  const e = typeof id === 'string' && id ? local?.groups?.chararts?.[id] : null;
  const frame = rectOf(e?.rect);
  const src = frame ? illustEntry(e, hi)?.path : null;
  return typeof src === 'string' && src ? { src, frame } : null;
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

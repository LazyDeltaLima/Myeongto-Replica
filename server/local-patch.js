// Local patch, server side: the room chat, chat factions, the SP_MAX_BOTS cap and the co-op leader HP, kept out of
// the upstream files so that merging upstream releases stays conflict-free. lobby.js only calls the hooks below, one
// line each (the leader HP needs none — see below):
//
//   onMessage(lobby, session, msg)   first line of Lobby.onMessage: answers room.chat / room.chatFaction, null otherwise
//   onJoin(lobby, room, session)     a member joined, resumed or took a spectator seat: the recent lines + the factions
//   onMatchEnd(lobby, room)          the match ended: factions are cleared (they last one match)
//   botCap(room)                     Lobby.addBot: the refusal when SP_MAX_BOTS is reached, else null
//   maxBotsSetting()                 room.state `maxBots` (null when unset)
//   debugPageHidden(path)            server/index.js static route: the effect / sound debug page only with SP_DEBUG_PAGE=1
//
// 선발 오퍼레이터 (甄选 / DIY picks, shared/diy.js): no hook line — SharedPool / PlayerState are wrapped at import below.
// A player's picks (loadout entries with `diy`) are pool entries of their own: cap = the tier's copies × the players who
// picked that operator (each sees only their own picks, so two pickers each keep a full private share in effect); a
// shop roll offers a pick only to the players who picked it; effect rolls (机变, 信标 …) and bots never see one.
//
// Room chat (co-op rooms only): one line from a human of the room — a player, or a spectator (`spectator: true`) — in the
// lobby or during the match, broadcast to every connected member (Lobby.broadcastRoom) and kept in the room's short
// history (CHAT_HISTORY lines, sent to whoever joins or resyncs). Nothing outlives the room.
// Chat faction: a seated player's nation tag (shared/local.js CHAT_FACTIONS) on their lines and avatar, announced as a
// `kind: 'faction'` line and sent as room.factions; shares the chat cooldown; spectators have none.
//
// Co-op leader HP (local decision 2026-10-05): the shared Final Assault / Hidden Core pool is bloodPoint × the players
// alive when that boss round starts — upstream keeps one bloodPoint whatever the team size (DESIGN §20.10; issue #113
// asks for this). A human who left is eliminated (Match.onLeave → _quit), so they are not counted; AI teammates are.
// The pool is computed on the server only (Match.startFinalAssault → finalAssault.bossPoolHp → GameData.bossPoolShare),
// so wrapping bossPoolShare here, at import, covers it (audit.js reads the same function). Solo stays upstream's.

import { ERR, MAX_SEATS } from '../shared/constants.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, CHAT_HISTORY, chatFaction } from '../shared/local.js';
import { sendSession } from './net.js';
import { GameData } from './match/gamedata.js';
import { SharedPool } from './match/pool.js';
import { PlayerState } from './match/PlayerState.js';
import { Match } from './match/Match.js';
import { diyPicks, diyEquipRefused } from '../shared/diy.js';

const OK = Object.freeze({ ok: true });

/** Players a co-op leader pool is sized for: the alive count (omitted ⇒ a full team, as upstream), 1…MAX_SEATS. */
export function coopPoolPlayers(aliveCount) {
  const n = Math.floor(Number(aliveCount));
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_SEATS, n) : MAX_SEATS;
}

const upstreamPoolShare = GameData.prototype.bossPoolShare;
/** Co-op: upstream's full-team share (bossHpScale.coop) × coopPoolPlayers; solo: upstream's. */
GameData.prototype.bossPoolShare = function bossPoolShare(aliveCount) {
  if (this.isSolo) return upstreamPoolShare.call(this, aliveCount);
  return upstreamPoolShare.call(this) * coopPoolPlayers(aliveCount);
};
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

// one line of printable text — the cleaning of net.js sanitizeName (keep in sync) with another cap
const STRIP_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const hexEscape = (n) => '\\u' + n.toString(16).padStart(4, '0');
const STRIP_RE = new RegExp('[' + STRIP_RANGES.map(([a, b]) => (a === b ? hexEscape(a) : `${hexEscape(a)}-${hexEscape(b)}`)).join('') + ']', 'g');
const LONE_SURROGATE_RE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** @param {unknown} raw @param {number} max @returns {string | null} */
export function sanitizeText(raw, max) {
  if (typeof raw !== 'string') return null;
  let s = raw.normalize('NFC').replace(LONE_SURROGATE_RE, '').replace(/\s+/g, ' ').replace(STRIP_RE, '').replace(/ {2,}/g, ' ').trim();
  s = [...s].slice(0, max).join('').trim();
  return s.length > 0 ? s : null;
}

/** SP_MAX_BOTS: AI teammates a room may hold, or null when only the seats limit them (unset). */
export function maxBotsSetting(env = process.env) {
  const n = Number.parseInt(env.SP_MAX_BOTS ?? '', 10);
  return n >= 0 ? n : null;
}

/** Lobby.addBot: the refusal once the room holds SP_MAX_BOTS AI teammates (0 = none at all), else null. */
export function botCap(room) {
  const maxBots = maxBotsSetting();
  if (maxBots == null || room.seats.filter((s) => s && s.isBot).length < maxBots) return null;
  return fail(ERR.ROOM_FULL, maxBots === 0 ? 'AI teammates are disabled on this server' : `at most ${maxBots} AI teammate(s) per room`);
}

/** @type {WeakMap<object, { log: any[], seq: number, factions: Map<string, string> }>} per room */
const rooms = new WeakMap();
function chatOf(room) {
  let c = rooms.get(room);
  if (!c) rooms.set(room, (c = { log: [], seq: 0, factions: new Map() }));
  return c;
}
const factionsMsg = (c) => ({ t: 'room.factions', factions: Object.fromEntries(c.factions) });

/** First line of Lobby.onMessage: this patch's messages; null for everything else. */
export function onMessage(lobby, session, msg) {
  if (msg.t === 'room.chat') return chat(lobby, session, msg);
  if (msg.t === 'room.chatFaction') return pickFaction(lobby, session, msg);
  return null;
}

function chat(lobby, session, { text }) {
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (room.mode === 'solo') return fail(ERR.BAD_MSG, 'co-op rooms only');
  const spectator = room.spectatorOf?.(session.playerId) || null;
  const seat = room.seatOf(session.playerId) || spectator;
  if (!seat || seat.isBot) return fail(ERR.NOT_IN_ROOM);
  const line = sanitizeText(text, CHAT_MAX_LEN);
  if (!line) return fail(ERR.BAD_MSG, 'empty message');
  const now = lobby.now();
  if (now - (session.lastChatAt ?? -Infinity) < CHAT_COOLDOWN_MS) return fail(ERR.RATE);
  session.lastChatAt = now;
  push(lobby, room, seat, spectator ? { text: line, at: now, spectator: true } : { text: line, at: now });
  return OK;
}

function pickFaction(lobby, session, { faction }) {
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (room.spectatorOf?.(session.playerId)) return fail(ERR.SPECTATOR);
  if (room.mode === 'solo') return fail(ERR.BAD_MSG, 'co-op rooms only');
  const seat = room.seatOf(session.playerId);
  if (!seat || seat.isBot) return fail(ERR.NOT_IN_ROOM);
  if (!chatFaction(faction)) return fail(ERR.BAD_MSG, 'unknown chat faction');
  const c = chatOf(room);
  if (c.factions.get(seat.playerId) === faction) return OK;
  const now = lobby.now();
  if (now - (session.lastChatAt ?? -Infinity) < CHAT_COOLDOWN_MS) return fail(ERR.RATE);
  session.lastChatAt = now;
  c.factions.set(seat.playerId, faction);
  push(lobby, room, seat, { kind: 'faction', text: '', at: now });
  lobby.broadcastRoom(room, factionsMsg(c));
  return OK;
}

/** Append one line (stamped with the sender's current faction) to the room's history and broadcast it. */
function push(lobby, room, seat, line) {
  const c = chatOf(room);
  const msg = { seq: ++c.seq, playerId: seat.playerId, name: seat.name, faction: c.factions.get(seat.playerId) ?? null, ...line };
  c.log.push(msg);
  if (c.log.length > CHAT_HISTORY) c.log.splice(0, c.log.length - CHAT_HISTORY);
  lobby.broadcastRoom(room, { t: 'room.chat', ...msg });
}

/** A member joined, resumed or took a spectator seat: the room's recent lines and the factions (nothing when empty). */
export function onJoin(lobby, room, session) {
  const c = rooms.get(room);
  if (!c) return;
  if (c.log.length) sendSession(session, { t: 'room.chatlog', lines: c.log });
  if (c.factions.size) sendSession(session, factionsMsg(c));
}

/** The match ended: the factions last one match. */
export function onMatchEnd(lobby, room) {
  const c = rooms.get(room);
  if (!c || !c.factions.size) return;
  c.factions.clear();
  lobby.broadcastRoom(room, factionsMsg(c));
}

// ---- 선발 오퍼레이터 (甄选 / DIY picks) ----------------------------------------------------------------------

/** Whether a pick's bonds are all off this match (Match.disabledBonds + staticInactiveBonds, the pool's ban rule). */
export function diyBanned(m, id) {
  const off = new Set([...(m.disabledBonds || []), ...(m.staticInactiveBonds || [])]);
  const bonds = m.gd.chess(id)?.bonds;
  return Array.isArray(bonds) && bonds.length > 0 && bonds.every((b) => off.has(b));
}

// 信标 (eff_acarm109 / eff_acgarm109) "无法装备给自编干员" — official KR: 선발 오퍼레이터는 장착 불가. Upstream never had 甄选 picks,
// so its equip never checked it: a pick carrying a beacon was destroyed and sent to a teammate (shared/diy.js diyEquipRefused).
const upstreamEquip = PlayerState.prototype.equip;
PlayerState.prototype.equip = function equip(itemUid, targetUid, replaceUid = null) {
  const i = this.find(itemUid), t = this.find(targetUid);
  if (i && t && i.piece.kind === 'item' && t.piece.kind === 'chess' && diyEquipRefused(this.gd.item(i.piece.id), this.gd.chess(t.piece.id))) {
    return { error: ERR.BAD_TARGET, detail: '无法装备给自编干员' };
  }
  return upstreamEquip.call(this, itemUid, targetUid, replaceUid);
};

/** The picks' pool entries of a match, sized by who picked them (created lazily: the players exist before the pool). */
export function refreshDiyPool(m) {
  const pool = m && m.pool;
  if (!pool || !m.players) return;
  if (!pool.diyEntries) pool.diyEntries = new Set();
  const pickers = new Map();
  for (const ps of m.players.values()) for (const id of ps.diyOwned || []) pickers.set(id, (pickers.get(id) || 0) + 1);
  for (const id of new Set([...pickers.keys(), ...pool.diyEntries])) {
    // banned like any operator (pool.js drawDisabledBonds skips invisible chess): every bond of the pick switched off
    // this match (drawn or mode-off) ⇒ no copies — a 炎 pick (望 / 赤刃明霄陈) never shows while 炎 is banned
    const cap = diyBanned(m, id) ? 0 : (m.gd.poolCopies(id) || 0) * (pickers.get(id) || 0);
    const e = pool.entries.get(id);
    if (!e) {
      if (cap > 0) { pool.entries.set(id, { cap, left: cap, tier: m.gd.tierOf(id) }); pool.diyEntries.add(id); }
      continue;
    }
    const held = e.cap - e.left;          // never below the copies players already hold (left + held = cap)
    e.cap = Math.max(cap, held);
    e.left = e.cap - held;
  }
}

// 갱신 버튼 강조 (refresh boost): m.private shop.refreshBoost = the player's strategy acts on its NEXT manual refresh, so
// the client makes the refresh button's border glow (public/js/ui/shopBar.js, css/refresh-boost.css). Mirrors the
// conditions of the band handlers in server/sim/content/bands/meta.js:
//   杜遥夜 band_first_self_refresh_present_char   the round's first 2 manual refreshes
//   梓兰   band_shop_refresh_copy_max_lv_char      every manual refresh
//   佩佩   up_shop_next_refresh_must_present_bond_char  a special refresh is pending (after a listed level-up)
//   贾维   refresh_shop_count_gain_coin_bond_char_chess the next refresh completes refresh_count, round cap not reached
export function refreshBoost(ps) {
  const band = ps.bandId ? ps.gd.band(ps.bandId) : null;
  const c = (k) => (Number.isFinite(ps.counters?.[k]) ? ps.counters[k] : 0);
  const n = (v, d) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
  for (const b of (band && Array.isArray(band.buffs) ? band.buffs : [])) {
    const bb = b?.bb || {};
    switch (b?.key) {
      case 'band_first_self_refresh_present_char': if ((ps.round?.refreshes || 0) < 2) return true; break;
      case 'band_shop_refresh_copy_max_lv_char': return true;
      case 'up_shop_next_refresh_must_present_bond_char': if (c('band:pepe:special') > 0) return true; break;
      case 'refresh_shop_count_gain_coin_bond_char_chess': {
        const every = n(bb.refresh_count, 0);
        const used = c('band:chiave:r') === ps.m?.round ? c('band:chiave') : 0;
        if (every > 0 && (c('band:chiave:refreshes') + 1) % every === 0 && used < n(bb.max_count, Infinity)) return true;
        break;
      }
      default: break;
    }
  }
  return false;
}

const upstreamPrivateView = PlayerState.prototype.privateView;
PlayerState.prototype.privateView = function privateView() {
  const v = upstreamPrivateView.call(this);
  try { if (v && v.shop) v.shop.refreshBoost = refreshBoost(this); } catch { /* display only */ }
  return v;
};

// 디버그용 재화 고정 (local.sh only): SP_DEBUG_FUNDS=<0..999> pins every human player's funds to that value — buying,
// refreshing and levelling never lower it (bots keep real funds). Deployed servers leave it unset.
export function debugFunds(env = process.env) {
  const raw = env.SP_DEBUG_FUNDS;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}
const FIXED_FUNDS = debugFunds();
if (FIXED_FUNDS != null) {
  console.warn(`[local-patch] SP_DEBUG_FUNDS: human players' funds fixed at ${FIXED_FUNDS} (debug only)`);
  Object.defineProperty(PlayerState.prototype, 'funds', {
    configurable: true,
    get() { return this.isBot ? (this._funds ?? 0) : FIXED_FUNDS; },
    set(v) { this._funds = v; },
  });
}

const upstreamSetLoadout = PlayerState.prototype.setLoadout;
PlayerState.prototype.setLoadout = function setLoadout(loadout) {
  const r = upstreamSetLoadout.call(this, loadout);
  const picks = diyPicks(this.loadout, (id) => this.gd.chess(id));
  this.diyOwned = new Set([...picks[5], ...picks[6]].filter(Boolean));
  refreshDiyPool(this.m);
  return r;
};

const upstreamRollChessSlot = PlayerState.prototype._rollChessSlot;
PlayerState.prototype._rollChessSlot = function _rollChessSlot() {
  const pool = this.m.pool;
  if (!pool) return upstreamRollChessSlot.call(this);
  if (!pool.diyEntries) refreshDiyPool(this.m);
  const prev = pool.diyFor;
  pool.diyFor = this;                     // this roll may offer this player's own picks
  try { return upstreamRollChessSlot.call(this); } finally { pool.diyFor = prev; }
};

// Everything rolled FOR a player opens that player's picks (owner's call 2026-10-05: "선발 오퍼레이터는 위, 전략, 아이템
// 효과로도 나와야 해, 밴 되지 않는 이상"): the promotion reward and pool-rolled pick-one offers, and every effect run for the
// player — 特质 (余 SERVER_MOST_BOND …), strategies, items, 机变 cards (ctx.rollChess / ctx.rollPool → SharedPool.roll).
// Other players' rolls never see them; a banned pick has no copies (refreshDiyPool).
function asPicker(ps, fn) {
  const pool = ps && ps.m && ps.m.pool;
  if (!pool) return fn();
  if (!pool.diyEntries) refreshDiyPool(ps.m);
  const prev = pool.diyFor;
  pool.diyFor = ps;
  try { return fn(); } finally { pool.diyFor = prev; }
}
const upstreamPushRewardOffer = PlayerState.prototype.pushRewardOffer;
PlayerState.prototype.pushRewardOffer = function pushRewardOffer(...args) { return asPicker(this, () => upstreamPushRewardOffer.apply(this, args)); };
for (const name of ['dispatch', 'dispatchItem', '_applyCard']) {
  const upstream = Match.prototype[name];
  if (typeof upstream !== 'function') continue;
  Match.prototype[name] = function picksOpen(ps, ...rest) { return asPicker(ps, () => upstream.call(this, ps, ...rest)); };
}

const upstreamEligible = SharedPool.prototype._eligible;
SharedPool.prototype._eligible = function _eligible(opts) {
  const el = upstreamEligible.call(this, opts);
  if (!this.diyEntries || !this.diyEntries.size) return el;
  const mine = this.diyFor && this.diyFor.diyOwned;
  return el.filter(([id]) => !this.diyEntries.has(id) || (mine && mine.has(id)));
};

const upstreamTierShares = SharedPool.prototype.tierShares;
SharedPool.prototype.tierShares = function tierShares(maxTier) {
  if (!this.diyEntries || !this.diyEntries.size) return upstreamTierShares.call(this, maxTier);
  const saved = [...this.diyEntries].map((id) => [id, this.entries.get(id)]);  // the shared odds leave the picks out
  for (const [id] of saved) this.entries.delete(id);
  try { return upstreamTierShares.call(this, maxTier); } finally { for (const [id, e] of saved) if (e) this.entries.set(id, e); }
};

// ---- debug page (/debug.html) ----------------------------------------------------------------------------------

/** The effect / sound debug page and its scripts (public/debug.html, js/debug.js; /fxlab.html redirects to it). */
const DEBUG_PATHS = new Set(['/debug.html', '/fxlab.html', '/js/debug.js']);
/**
 * Whether a static request is the debug page on a server that does not serve it: only `SP_DEBUG_PAGE=1` (local.sh)
 * serves it; deployed servers (OCI / NAS) answer 404.
 */
export function debugPageHidden(decodedPath, env = process.env) {
  return DEBUG_PATHS.has(String(decodedPath).toLowerCase()) && env.SP_DEBUG_PAGE !== '1';
}

// ---- /healthz through the reverse proxy ------------------------------------------------------------------------

/**
 * Whether a request came through the reverse proxy (Caddy on OCI, cloudflared on the NAS: both add X-Forwarded-For).
 * Such a /healthz answer keeps only what the page needs (`build` for public/js/ui/buildGuard.js) and leaves the player /
 * room counters to the in-container checks (Dockerfile HEALTHCHECK, oci/deploy.sh `docker exec … wget`).
 */
export const proxiedRequest = (req) => !!(req && req.headers && req.headers['x-forwarded-for']);

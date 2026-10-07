// Local patch, server side: the room chat, chat factions, the SP_MAX_BOTS cap and the co-op leader HP, kept out of
// the upstream files so that merging upstream releases stays conflict-free. lobby.js only calls the hooks below, one
// line each (the leader HP needs none — see below):
//
//   onMessage(lobby, session, msg)   first line of Lobby.onMessage: answers room.chat / room.chatFaction, null otherwise
//   onJoin(lobby, room, session)     a member joined, resumed or took a spectator seat: the recent lines + the factions
//   onMatchEnd(lobby, room)          the match ended: one [stats] log line (local-stats.js), factions are cleared (they last one match)
//   botCap(room)                     Lobby.addBot: the refusal when SP_MAX_BOTS is reached, else null
//   maxBotsSetting()                 room.state `maxBots` (null when unset)
//   debugPageHidden(path)            server/index.js static route: the effect / sound debug page only with SP_DEBUG_PAGE=1
//   dbg.funds / dbg.addDiy           (via onMessage) the in-game debug panel, local debug mode only — see debugMode below
//
// 선발 오퍼레이터: since 0.2.0 upstream's 自选 framework (shared/diy.js, server/match/player/diy.js) with our five
// operators as its only candidates (tools/build-data.mjs local patch); nothing of it is wrapped here.
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

import { logMatchStats } from './local-stats.js';
import { ERR, MAX_SEATS } from '../shared/constants.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, CHAT_HISTORY, chatFaction } from '../shared/local.js';
import { sendSession } from './net.js';
import { GameData } from './match/gamedata.js';
import { PlayerState } from './match/PlayerState.js';
import { Match } from './match/Match.js';
import { diySlotIds, isDiyModule } from '../shared/diy.js';
import { localDiyPool } from '../shared/local-diy.js';

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
  if (msg.t === 'dbg.funds' || msg.t === 'dbg.addDiy') return debugMessage(lobby, session, msg); // local debug mode only
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
  logMatchStats(lobby, room); // one [stats] log line per finished match (server/local-stats.js)
  const c = rooms.get(room);
  if (!c || !c.factions.size) return;
  c.factions.clear();
  lobby.broadcastRoom(room, factionsMsg(c));
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
// The in-game debug panel (below) toggles the pin per player: `ps.debugFundsPin` = the pinned value, null = real funds,
// undefined = the env default (FIXED_FUNDS). The accessor is installed only in local debug mode — at startup when
// SP_DEBUG_FUNDS is set, else on the first dbg.funds — so a deployed server keeps upstream's plain `funds` field.
let fundsPinInstalled = false;
function installFundsPin() {
  if (fundsPinInstalled) return;
  fundsPinInstalled = true;
  Object.defineProperty(PlayerState.prototype, 'funds', {
    configurable: true,
    get() { const pin = fundsPinOf(this); return pin == null ? (this._funds ?? 0) : pin; },
    set(v) { this._funds = v; },
  });
}
const fundsPinOf = (ps) => (ps.isBot ? null : ps.debugFundsPin === undefined ? FIXED_FUNDS : ps.debugFundsPin);
if (FIXED_FUNDS != null && debugMode()) {
  console.warn(`[local-patch] SP_DEBUG_FUNDS: human players' funds fixed at ${FIXED_FUNDS} (debug only)`);
  installFundsPin();
}

// The round-start dialog's 获得 (public/js/ui/phaseArt.js useRoundGold): the funds Match.startRound credited each player
// (income + pending + onRoundStart grants), sent as m.private `roundGold { round, gain }`. The client cannot diff its
// funds: m.private (new funds) goes out before the throttled m.public (phase ROUND_START), so its baseline was already
// the new value (0 on every round), and a debug-pinned player's funds never change. While pinned, the gross credit counts.
const upstreamMatchStartRound = Match.prototype.startRound;
Match.prototype.startRound = function startRound(r) {
  const list = Array.isArray(this.order) ? this.order : [];
  for (const ps of list) if (ps) ps._roundGold = { round: r, gain: 0, on: true };
  try { return upstreamMatchStartRound.call(this, r); } finally { for (const ps of list) if (ps && ps._roundGold) ps._roundGold.on = false; }
};
const upstreamAddFunds = PlayerState.prototype.addFunds;
PlayerState.prototype.addFunds = function addFunds(n, opts) {
  const got = upstreamAddFunds.call(this, n, opts);
  const rg = this._roundGold;
  if (rg && rg.on) rg.gain += fundsPinOf(this) == null || !fundsPinInstalled ? got : Math.trunc(Number(n) || 0);
  return got;
};
const upstreamRoundGoldView = PlayerState.prototype.privateView;
PlayerState.prototype.privateView = function privateView() {
  const v = upstreamRoundGoldView.call(this);
  try { if (v && this._roundGold) v.roundGold = { round: this._roundGold.round, gain: Math.max(0, this._roundGold.gain) }; } catch { /* display only */ }
  return v;
};

// ---- debug page (/debug.html) ----------------------------------------------------------------------------------

/** The effect / sound debug page and its scripts (public/debug.html, js/debug.js, js/debug/*: the sandbag arena;
 *  /fxlab.html redirects to it). */
const DEBUG_PATHS = new Set(['/debug.html', '/fxlab.html', '/js/debug.js']);
const DEBUG_DIR = '/js/debug/';
/**
 * Whether a static request is the debug page on a server that does not serve it: only `SP_DEBUG_PAGE=1` (local.sh)
 * serves it; deployed servers (OCI / NAS) answer 404.
 */
export function debugPageHidden(decodedPath, env = process.env) {
  const p = String(decodedPath).toLowerCase();
  return (DEBUG_PATHS.has(p) || p.startsWith(DEBUG_DIR)) && env.SP_DEBUG_PAGE !== '1';
}

// ---- /healthz through the reverse proxy ------------------------------------------------------------------------

/**
 * Whether a request came through the reverse proxy (Caddy on OCI, cloudflared on the NAS: both add X-Forwarded-For).
 * Such a /healthz answer keeps only what the page needs (`build` for public/js/ui/buildGuard.js) and leaves the player /
 * room counters to the in-container checks (Dockerfile HEALTHCHECK, oci/deploy.sh `docker exec … wget`).
 */
export const proxiedRequest = (req) => !!(req && req.headers && req.headers['x-forwarded-for']);

// ---- local debug mode: the in-game debug panel (public/js/ui/debugPanel.js) --------------------------------------
//
// Local debug mode = SP_DEBUG_PAGE=1 or a valid SP_DEBUG_FUNDS, and NODE_ENV is not 'production'. 
// local.sh sets both; the OCI / NAS compose files set neither and the Docker image sets NODE_ENV=production, so a
// deployed server is never in it. Only then:
//   m.private.debug = { fundsPin, pinValue, candidates }   (privateView wrapper, installed at import) — the client
//                     renders the panel only when this is present
//   dbg.funds { on }        the sender's funds pinned to pinValue (SP_DEBUG_FUNDS, else 99) or back to real funds
//                           (they keep the pinned value and move normally from there)
//   dbg.addDiy { charId, tier, golden?, skill?, module? }
//                           one of the 自选 candidates (data/backups.json diy.ownedPool) into the sender's hand: it takes
//                           the tier's slot already holding that operator, else a free slot of the tier (both taken by
//                           others ⇒ refused), sets the pick there (PlayerState.setDiy — skill 0-2, module: a uniEquipId
//                           of the elite form or 'none'), then gains the slot's chess (normal, or the elite with
//                           `golden`) through PlayerState.acquireChess (merges, onGain, m.private), prep only, refused with
//                           a full hand unless it completes a merge; no stock copies are taken (the shop is unchanged).
// Outside debug mode both messages are refused as BAD_MSG (the server never trusts the client's panel).

export const DEBUG_PIN_DEFAULT = 99;

/** Whether this server runs in local debug mode (see above). */
export function debugMode(env = process.env) {
  if (env.NODE_ENV === 'production') return false;
  return env.SP_DEBUG_PAGE === '1' || debugFunds(env) != null;
}

const MODULE_NONE = 'none';
const formKey = (tier, elite) => (elite ? `2/60/7/${tier === 6 ? 3 : 1}` : '2/1/4/0');

/**
 * The 自选 candidates offered by the panel: [{ charId, name, tiers: { 5|6: { skills: [{ index, name }], modules: [{ id,
 * name, type }] } } }] — skills of the normal form, modules of the tier's elite form (plus 'none', isDiyModule only).
 */
export function debugCandidates(gd) {
  const b = gd?.raw?.backups;
  const pool = Array.isArray(b?.diy?.ownedPool) ? localDiyPool(b.diy.ownedPool) : []; // the five offered, in the picker's order (shared/local-diy.js)
  return pool.map((charId) => {
    const u = b.units?.[charId];
    if (!u || !u.forms) return null;
    const tiers = {};
    for (const t of [5, 6]) {
      const nf = u.forms[formKey(t, false)], ef = u.forms[formKey(t, true)];
      if (!nf) continue;
      tiers[t] = {
        skills: (nf.skills || []).map((sk, i) => ({ index: i, name: sk?.name || '' })),
        modules: [{ id: MODULE_NONE, name: '', type: '' }, ...(ef?.modules || []).filter(isDiyModule).map((m) => ({ id: m.uniEquipId, name: m.name || m.uniEquipId, type: m.typeName || '' }))],
      };
    }
    return { charId, name: u.name || charId, tiers };
  }).filter(Boolean);
}

/** The slot base id a debug add of `charId` at `tier` uses for player `ps` (see dbg.addDiy above), or null. */
export function debugDiySlot(ps, charId, tier) {
  const ids = diySlotIds(ps.m.gd.raw).filter((id) => ps.m.gd.raw.backups?.diy?.slots?.[id]?.tier === tier);
  const cur = ps.diy || {};
  return ids.find((id) => cur[id]?.charId === charId) || ids.find((id) => !cur[id]) || null;
}

/** m.private.debug of a human player (debug mode only). */
export function debugView(ps) {
  if (!ps || ps.isBot) return null;
  if (!ps.m.debugCandidates) ps.m.debugCandidates = debugCandidates(ps.gd);
  return { fundsPin: fundsPinOf(ps) != null, pinValue: FIXED_FUNDS ?? DEBUG_PIN_DEFAULT, candidates: ps.m.debugCandidates };
}

/**
 * A debug intent of a match player. `env` decides debug mode (tests pass their own).
 * @returns {{ ok: true } | { error: string, detail?: string }}
 */
export function debugIntent(m, playerId, msg, env = process.env) {
  if (!debugMode(env)) return fail(ERR.BAD_MSG, 'debug mode is off');
  const ps = m && m.players && m.players.get(playerId);
  if (!ps || ps.isBot || ps.left || ps.spectator) return fail(ERR.NOT_IN_ROOM);
  if (m.disposed || m.ended) return fail(ERR.WRONG_PHASE);
  if (msg.t === 'dbg.funds') {
    installFundsPin();
    if (Object.hasOwn(ps, 'funds')) { const v = ps.funds; delete ps.funds; ps._funds = v; } // created before the accessor
    if (msg.on) ps.debugFundsPin = FIXED_FUNDS ?? DEBUG_PIN_DEFAULT;
    else { ps._funds = ps.funds; ps.debugFundsPin = null; }
    ps.dirty();
    return OK;
  }
  if (msg.t === 'dbg.addDiy') {
    const tier = msg.tier;
    const cand = debugCandidates(m.gd).find((c) => c.charId === msg.charId);
    if (!cand || !cand.tiers[tier]) return fail(ERR.BAD_TARGET, 'no 自选 operator');
    const g = ps._gate({ allowWhenReady: true }); if (g) return g;
    const slotId = debugDiySlot(ps, msg.charId, tier);
    if (!slotId) return fail(ERR.BAD_TARGET, `both 自选 slots of tier ${tier} are taken`);
    const prev = ps.diy?.[slotId] || null;
    const skillIndex = msg.skill ?? prev?.skillIndex ?? 0;
    if (!cand.tiers[tier].skills.some((x) => x.index === skillIndex)) return fail(ERR.BAD_TARGET, `skill ${skillIndex} not available`);
    const mod = msg.module ?? (prev?.uniEquipId ?? MODULE_NONE);
    if (!cand.tiers[tier].modules.some((x) => x.id === mod)) return fail(ERR.BAD_TARGET, `module ${mod} not available`);
    const slot = m.gd.raw.backups.diy.slots[slotId];
    const chessId = msg.golden ? slot.goldenId : slotId;
    if (!ps.hand.includes(null) && !ps.completesChessMerge(chessId)) return fail(ERR.HAND_FULL);
    const before = ps.diy;
    if (!ps.setDiy({ ...before, [slotId]: { charId: msg.charId, skillIndex, uniEquipId: mod === MODULE_NONE ? null : mod } })) return fail(ERR.BAD_TARGET, 'pick refused');
    const piece = ps.acquireChess(chessId, { source: 'grant', fromPool: false });
    if (!piece) { ps.setDiy(before); return fail(ERR.HAND_FULL); }
    ps.dirty();
    return OK;
  }
  return fail(ERR.BAD_MSG);
}

function debugMessage(lobby, session, msg) {
  if (!debugMode()) return fail(ERR.BAD_MSG, 'debug mode is off');
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (!room.match) return fail(ERR.WRONG_PHASE, 'no running match');
  const res = debugIntent(room.match, session.playerId, msg);
  try { room.match.flush?.(); } catch { /* the next push carries it */ }
  return res;
}

if (debugMode()) {
  console.warn('[local-patch] local debug mode: in-game debug panel on (dbg.funds / dbg.addDiy)');
  const upstreamView = PlayerState.prototype.privateView;
  PlayerState.prototype.privateView = function privateView() {
    const v = upstreamView.call(this);
    try { if (v) v.debug = debugView(this); } catch { /* display only */ }
    return v;
  };
}

// Local patch, server side: the room chat, chat factions, the SP_MAX_BOTS caps and the co-op leader HP, kept out of
// the upstream files so that merging upstream releases stays conflict-free. lobby.js only calls the hooks below, one
// line each (the leader HP needs none — see below):
//
//   onMessage(lobby, session, msg)   first line of Lobby.onMessage: answers room.chat / room.chatFaction, null otherwise
//   onJoin(lobby, room, session)     a member joined, resumed or took a spectator seat: the recent lines + the factions
//   onMatchEnd(lobby, room)          the match ended: one [stats] log line (local-stats.js), factions are cleared (they last one match)
//   chatFactionOf(room, playerId)    Match opts.factionOf: the player's faction for m.result (the result screen's player colors)
//   botCap(room, lobby, session)     Lobby.addBot: the refusal when SP_MAX_BOTS / _TOTAL / _PER_ADDR is reached, else null
//   maxBotsSetting()                 room.state `maxBots` (null when unset)
//   largeBots()                      Lobby.addBot / start, room.state `largeBots`: AI teammates in an 8-player room, local debug mode only
//   welcomeInfo(lobby)               Lobby.welcomeInfo: `feedback: true` while the feedback inbox is on (local-feedback.js)
//   identify(lobby, session, info)   Lobby.identify (net.js, every hello): the browser id, its [id] log line, `welcome.bid`
//                                    (local-moderation.js)
//   roomEntry(lobby, room, session, event)  a human entered a room (created, joined, spectating, reserved, matched): its
//                                    [room] log line with the browser id and the network key (local-moderation.js)
//   fb.send                         (via onMessage) the settlement screen's feedback, kept in SP_FEEDBACK_DIR (local-feedback.js)
//   debugPageHidden(path)            server/index.js static route: the effect / sound debug page only with SP_DEBUG_PAGE=1
//   room.setConsole                  (via onMessage) 콘솔 모드 of a solo room, before its match: room.state `console`
//   onMatchCreate(room, match)       Lobby.startMatch, before match.start(): a console room's match is a console match
//   con.*                            (via onMessage) the in-game console — server/local-console.js (console matches, and
//                                    every match in local debug mode)
//
// 선발 오퍼레이터: since 0.2.0 upstream's 自选 framework (shared/diy.js, server/match/player/diy.js) with our
// operators as its only candidates (tools/build-data.mjs local patch); nothing of it is wrapped here.
//
// Room chat (co-op rooms only): one line from a human of the room — a player, or a spectator (`spectator: true`) — in the
// lobby or during the match, broadcast to every connected member (Lobby.broadcastRoom) and kept in the room's short
// history (CHAT_HISTORY lines, sent to whoever joins or resyncs). Nothing outlives the room. Every line is logged ([chat],
// local-moderation.js). A line of a chat-banned browser (local-moderation.js chatMute) is shadowed: its sender gets it as
// usual — now and in the history it resyncs, from any session of the same browser — and nobody else ever does (maintainer decision 2026-11-18: the ban covers
// chat only and does not tell the banned player).
// Chat faction: a seated player's nation tag (shared/local.js CHAT_FACTIONS) on their lines and avatar, announced as a
// `kind: 'faction'` line and sent as room.factions; shares the chat cooldown; spectators have none.
//
// Co-op leader HP: since 0.2.0 upstream's own rule (gamedata.js bossPoolShareOf, PR #209 — the same bloodPoint × alive
// players this file used to wrap in; removed here so it is not applied twice).

import { logMatchStats } from './local-stats.js';
import { FeedbackInbox } from './local-feedback.js';
import { Moderation } from './local-moderation.js';
import { ERR, MAX_SEATS } from '../shared/constants.js';
import { CHAT_MAX_LEN, CHAT_COOLDOWN_MS, CHAT_HISTORY, seasonChatFaction } from '../shared/local.js';
import { sendSession } from './net.js';
import { PlayerState } from './match/PlayerState.js';
import { Match } from './match/Match.js';
import { consoleMessage, debugMode, fundsPinActive, fundsPinOf, isConsoleMessage } from './local-console.js';

export { debugFunds, debugMode, DEBUG_PIN_DEFAULT } from './local-console.js';

const OK = Object.freeze({ ok: true });

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

/**
 * AI teammates in an 8-player room (local debug mode only, for testing the mode without eight browsers): the room takes
 * them like a 4-seat co-op room and starts with LARGE_MIN_PLAYERS seats or more taken, humans and AI together. A deployed
 * server keeps the rule of server/lobby.js (that many Doctors, no AI seat).
 */
export function largeBots(env = process.env) {
  return debugMode(env);
}

/**
 * SP_MAX_BOTS_TOTAL / SP_MAX_BOTS_PER_ADDR: the server's AI-teammate budget (the bots run on one Node thread), or null
 * when unset. Only bots of rooms with a connected seated human count (`liveBots`): a room whose humans all dropped
 * parks at its next untimed prep or is abandoned when the 10-minute reconnect window ends, so it does not hold the
 * budget; a returning human may push the count past the cap by that room's bots, never more.
 */
export function botBudgetSetting(name, env = process.env) {
  const n = Number.parseInt(env[name] ?? '', 10);
  return n >= 0 ? n : null;
}

/** AI teammates of a room that cost CPU now: its bots while one of its seated humans is connected, else 0. */
export function liveBots(room) {
  let bots = 0, online = false;
  for (const s of room.seats) {
    if (!s || s.left) continue;
    if (s.isBot) bots++;
    else if (s.connected) online = true;
  }
  return online ? bots : 0;
}

/**
 * Lobby.addBot: the refusal once the room holds SP_MAX_BOTS AI teammates (0 = none at all), or the server
 * (SP_MAX_BOTS_TOTAL) or the host's network (SP_MAX_BOTS_PER_ADDR, rooms it created; local peers exempt, net.js
 * clientAddress) has its live bots; else null.
 */
export function botCap(room, lobby = null, session = null) {
  const maxBots = maxBotsSetting();
  if (maxBots != null && room.seats.filter((s) => s && s.isBot).length >= maxBots) {
    return fail(ERR.ROOM_FULL, maxBots === 0 ? 'AI teammates are disabled on this server' : `at most ${maxBots} AI teammate(s) per room`);
  }
  if (!lobby) return null;
  const total = botBudgetSetting('SP_MAX_BOTS_TOTAL');
  const key = session?.limitKey || null;
  const perAddr = key ? botBudgetSetting('SP_MAX_BOTS_PER_ADDR') : null;
  if (total == null && perAddr == null) return null;
  let all = 0, mine = 0;
  for (const r of lobby.rooms.values()) {
    const n = liveBots(r);
    all += n;
    if (key && r.ownerKey === key) mine += n;
  }
  if (total != null && all >= total) {
    lobby.limitWarn?.(`AI teammate budget (${total}) reached`);
    return fail(ERR.BOT_LIMIT, `at most ${total} AI teammates on this server`);
  }
  if (perAddr != null && mine >= perAddr) {
    lobby.limitWarn?.(`AI teammate limit (${perAddr}) reached for ${session.addr}`);
    return fail(ERR.BOT_LIMIT, `at most ${perAddr} AI teammates from your network`);
  }
  return null;
}

/**
 * @type {WeakMap<object, { log: any[], seq: number, factions: Map<string, string>, shadow: Map<number, string|null> }>} per
 * room; `shadow`: seq → sender's browser id of the shadowed lines (header 「Room chat」), seen by their sender only
 */
const rooms = new WeakMap();
function chatOf(room) {
  let c = rooms.get(room);
  if (!c) rooms.set(room, (c = { log: [], seq: 0, factions: new Map(), shadow: new Map() }));
  return c;
}
const factionsMsg = (c) => ({ t: 'room.factions', factions: Object.fromEntries(c.factions) });

/** First line of Lobby.onMessage: this patch's messages; null for everything else. */
export function onMessage(lobby, session, msg) {
  if (msg.t === 'room.chat') return chat(lobby, session, msg);
  if (msg.t === 'room.chatFaction') return pickFaction(lobby, session, msg);
  if (msg.t === 'room.setConsole') return setConsole(lobby, session, msg);
  if (isConsoleMessage(msg.t)) return consoleMessage(lobby, session, msg); // console matches, local debug mode
  if (msg.t === 'fb.send') return feedbackOf(lobby).submit(session, msg, liveConsoleFeedback(lobby, session));
  return null;
}

/**
 * 콘솔 모드 (room.setConsole { on }): a solo room's own player turns the console on or off before the match; kept across
 * the room's matches, sent as room.state `console` (server/lobby.js toState). The match it starts is a console match
 * (onMatchCreate). Co-op rooms never have it (maintainer decision 2026-11-15).
 */
function setConsole(lobby, session, { on }) {
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (room.mode !== 'solo') return fail(ERR.BAD_TARGET, 'solo rooms only');
  const seat = room.seatOf(session.playerId);
  if (!seat || seat.isBot) return fail(ERR.NOT_IN_ROOM);
  if (room.match) return fail(ERR.ROOM_STARTED);
  lobby.dropReplay?.(room, session.playerId);
  if (!!room.console !== !!on) {
    room.console = !!on;
    lobby.broadcastState(room);
  }
  return OK;
}

/** Lobby.startMatch, before match.start(): the match of a console room is a console match (server/local-console.js). */
export function onMatchCreate(room, match) {
  if (room && match && room.mode === 'solo' && room.console === true) match.console = true;
}

/**
 * A feedback report sent during a console match (the console's 「✎ 제보」): the match is still running, so local-feedback.js
 * gets it as the sender's live match — with the console log — instead of a finished one. Null otherwise.
 */
function liveConsoleFeedback(lobby, session) {
  const room = lobby.roomOf?.(session);
  const m = room?.match;
  if (!m || m.console !== true || m.ended) return null;
  const seat = room.seatOf?.(session.playerId);
  if (!seat || seat.isBot) return null;
  return { key: `${room.code}#${room.matchCount}`, console: Array.isArray(m.consoleLog) ? m.consoleLog : [] };
}

/** The lobby's feedback inbox (SP_FEEDBACK_DIR; off when unset) — made on first use, or the one a test put there. */
export function feedbackOf(lobby) {
  if (!lobby.feedback) lobby.feedback = FeedbackInbox.fromEnv(process.env, lobby.log);
  return lobby.feedback;
}

/** The lobby's chat moderation (SP_MODERATION_DIR) — made on first use, or the one a test put there. */
export function moderationOf(lobby) {
  if (!lobby.moderation) lobby.moderation = Moderation.fromEnv(process.env, lobby.log);
  return lobby.moderation;
}

/** Lobby.identify (net.js, every hello): the browser id to send back in `welcome.bid` (local-moderation.js). */
export function identify(lobby, session, info) {
  return moderationOf(lobby).identify(session, info);
}

/** A human entered a room: one [room] line (local-moderation.js logRoom). @param {string} event */
export function roomEntry(lobby, room, session, event) {
  moderationOf(lobby).logRoom(room, session, event);
}

/** Extra welcome fields of this patch (Lobby.welcomeInfo). */
export function welcomeInfo(lobby) {
  return feedbackOf(lobby).welcomeInfo();
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
  const mod = moderationOf(lobby);
  const mute = mod.chatMute(session);
  mod.logChat(room, session, { text: line, spectator: !!spectator, mute });
  push(lobby, room, seat, spectator ? { text: line, at: now, spectator: true } : { text: line, at: now }, mute ? session : null);
  return OK;
}

function pickFaction(lobby, session, { faction }) {
  const room = lobby.roomOf(session);
  if (!room) return fail(ERR.NOT_IN_ROOM);
  if (room.spectatorOf?.(session.playerId)) return fail(ERR.SPECTATOR);
  if (room.mode === 'solo') return fail(ERR.BAD_MSG, 'co-op rooms only');
  const seat = room.seatOf(session.playerId);
  if (!seat || seat.isBot) return fail(ERR.NOT_IN_ROOM);
  if (!seasonChatFaction(faction, room.season)) return fail(ERR.BAD_MSG, 'not a chat faction of this season'); // shared/local.js chatFactionsOf
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

/**
 * Append one line (stamped with the sender's current faction) to the room's history and broadcast it — or, a shadowed
 * line (`only` = its sender's session, header 「Room chat」), send it to its sender alone.
 */
function push(lobby, room, seat, line, only = null) {
  const c = chatOf(room);
  const msg = { seq: ++c.seq, playerId: seat.playerId, name: seat.name, faction: c.factions.get(seat.playerId) ?? null, ...line };
  c.log.push(msg);
  if (only) c.shadow.set(msg.seq, only.browserId || null);
  if (c.log.length > CHAT_HISTORY) for (const old of c.log.splice(0, c.log.length - CHAT_HISTORY)) c.shadow.delete(old.seq);
  if (only) sendSession(only, { t: 'room.chat', ...msg });
  else lobby.broadcastRoom(room, { t: 'room.chat', ...msg });
}

/** A member joined, resumed or took a spectator seat: the room's recent lines and the factions (nothing when empty). */
export function onJoin(lobby, room, session) {
  const c = rooms.get(room);
  if (!c) return;
  const mine = (l) => l.playerId === session.playerId || (!!session.browserId && c.shadow.get(l.seq) === session.browserId);
  const lines = c.shadow.size ? c.log.filter((l) => !c.shadow.has(l.seq) || mine(l)) : c.log;
  if (lines.length) sendSession(session, { t: 'room.chatlog', lines });
  if (c.factions.size) sendSession(session, factionsMsg(c));
}

/** The chat faction a room's player picked, or null (Match opts.factionOf: m.result players[].faction, read before the clear below). */
export function chatFactionOf(room, playerId) {
  const c = room ? rooms.get(room) : null;
  return (c && c.factions.get(playerId)) ?? null;
}

/** The match ended: the factions last one match. */
export function onMatchEnd(lobby, room) {
  if (!room.lastSummary?.console) logMatchStats(lobby, room); // one [stats] log line per finished match (server/local-stats.js); a console match keeps no record
  feedbackOf(lobby).noteMatchEnd(room); // its players may send feedback from the settlement screen
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
  return bandBuffs(ps).some((b) => buffBoosts(ps, b));
}

const bandBuffs = (ps) => {
  const band = ps.bandId ? ps.gd.band(ps.bandId) : null;
  return band && Array.isArray(band.buffs) ? band.buffs : [];
};

/** Whether this band buff acts on the player's next manual refresh. */
function buffBoosts(ps, b) {
  const bb = b?.bb || {};
  const c = (k) => (Number.isFinite(ps.counters?.[k]) ? ps.counters[k] : 0);
  const n = (v, d) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
  switch (b?.key) {
    case 'band_first_self_refresh_present_char': return (ps.round?.refreshes || 0) < 2;
    case 'band_shop_refresh_copy_max_lv_char': return true;
    case 'up_shop_next_refresh_must_present_bond_char': return c('band:pepe:special') > 0;
    case 'refresh_shop_count_gain_coin_bond_char_chess': {
      const every = n(bb.refresh_count, 0);
      const used = c('band:chiave:r') === ps.m?.round ? c('band:chiave') : 0;
      return every > 0 && (c('band:chiave:refreshes') + 1) % every === 0 && used < n(bb.max_count, Infinity);
    }
    default: return false;
  }
}

// 특수 상품 연출: the client plays card_whole_refresh_special instead of _normal when the shop's goods it is showing are
// special — a pick-one reward offer (the client's AutoChessBattleShopMainView._RenderUnfoldView: on a
// refreshSeq change, isSpecialRecruit = the server's isSpecialGoods != NORMAL — COMB / BUFF; the same flag refuses 刷新 /
// 冻结 with 「请选择奖励」, AutoChessBattleUIController._OnShopRefresh). Our offers (晋升奖励 = COMB, a strategy's /
// item's / 特质's offer = BUFF) take the shop row in the same way, so each queued offer gets a number the view sends as
// shop.rewardOffer.seq: a new one plays the special clip once (ui/shopBar.js, docs/rules/ui.md 「상점 화면」). A strategy's
// 「特殊刷新」 refresh (杜遥夜 / 梓兰 / 佩佩) leaves normal goods and plays the normal clip.
for (const k of ['pushRewardOffer', 'pushItemOffer']) {
  const upstream = PlayerState.prototype[k];
  PlayerState.prototype[k] = function pushOffer(...args) {
    const offer = upstream.apply(this, args);
    if (offer) offer.seq = this.offerSeq = (Number(this.offerSeq) || 0) + 1;
    return offer;
  };
}

const upstreamPrivateView = PlayerState.prototype.privateView;
PlayerState.prototype.privateView = function privateView() {
  const v = upstreamPrivateView.call(this);
  try { if (v && v.shop) v.shop.refreshBoost = refreshBoost(this); } catch { /* display only */ }
  if (v && v.shop && v.shop.rewardOffer) v.shop.rewardOffer.seq = Number(this.offers?.[0]?.seq) || 0;
  return v;
};

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
  if (rg && rg.on) rg.gain += fundsPinOf(this) == null || !fundsPinActive() ? got : Math.trunc(Number(n) || 0);
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
 * Whether a static request is the debug page on a server that does not serve it: only `SP_DEBUG_PAGE=1`
 * serves it; deployed servers answer 404.
 */
export function debugPageHidden(decodedPath, env = process.env) {
  const p = String(decodedPath).toLowerCase();
  return (DEBUG_PATHS.has(p) || p.startsWith(DEBUG_DIR)) && env.SP_DEBUG_PAGE !== '1';
}

// ---- /healthz through the reverse proxy ------------------------------------------------------------------------

/**
 * Whether a request came through a reverse proxy (it adds X-Forwarded-For). Such a /healthz answer keeps only what the
 * page needs (`build` for public/js/ui/buildGuard.js) and leaves the player / room counters to checks made from inside
 * the container (Dockerfile HEALTHCHECK, the deploy script).
 */
export const proxiedRequest = (req) => !!(req && req.headers && req.headers['x-forwarded-for']);

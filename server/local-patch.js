// Local NAS patch, server side: the room chat, chat factions, the SP_MAX_BOTS cap and the co-op leader HP, kept out of
// the upstream files so that merging upstream releases stays conflict-free. lobby.js only calls the hooks below, one
// line each (the leader HP needs none — see below):
//
//   onMessage(lobby, session, msg)   first line of Lobby.onMessage: answers room.chat / room.chatFaction, null otherwise
//   onJoin(lobby, room, session)     a member joined, resumed or took a spectator seat: the recent lines + the factions
//   onMatchEnd(lobby, room)          the match ended: factions are cleared (they last one match)
//   botCap(room)                     Lobby.addBot: the refusal when SP_MAX_BOTS is reached, else null
//   maxBotsSetting()                 room.state `maxBots` (null when unset)
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

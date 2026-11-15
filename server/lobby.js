// server/lobby.js — rooms, seats, host, AI seats, ready/start, reconnect, and room → Match wiring
// (DESIGN §2, §6.1 LOBBY, §8.1). Implements the handler interface consumed by server/net.js.
//
// Rules (the choices where DESIGN is silent are marked ▸):
//   * Rooms are keyed by 4-letter codes from an unambiguous alphabet (no I/O, letters only). Join codes are
//     case-insensitive.
//   * 'solo' rooms hold exactly one human and never bots. 'coop' rooms have 4 seats (humans + AI bots).
//     Humans and bots take the lowest free seat index; seat indexes never compact.
//   * The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19; shared/constants.js LARGE_SEATS): room.create
//     { mode: 'coop', size: 8 } (or room.setSize, below) makes a co-op room of 8 seats (room.state `size`; every other room is 4). It holds humans
//     only — room.addBot is refused (ROOM_FULL) and a handed-over AI seat is dropped — and room.start needs at least
//     LARGE_MIN_PLAYERS (5) Doctors seated (SEATS_OPEN; maintainer decision 2026-11-01, until then all eight), connected and
//     ready like any start. The new match of a passed vote (the briefing's reroll, the in-match restart) needs them too:
//     short of five — someone left the match — the room goes back to LOBBY instead (maintainer decision 2026-11-02). Local debug mode (server/local-patch.js largeBots) lets AI seats count toward it for testing
//     (room.state `largeBots`). The match gets `size` 8 and its seats (its numbers: config.eightPlayer, scaled by the head
//     count — server/match/gamedata.js largeAt).
//   * ▸ Being in a LOBBY room and sending room.create / room.join implicitly leaves it. While your room is
//     in a match, create/join of another room fails with ROOM_STARTED (send g.leave or room.leave first).
//   * Host-only: room.setDifficulty, room.setRuleset, room.setAiPicksLast, room.setSize, room.addBot, room.removeBot, room.kick,
//     room.start. ▸ Changing the difficulty, the ruleset, the AI-picks-last option (co-op only) or the size un-readies the
//     other humans.
//   * room.setSize { size } (maintainer decision 2026-11-02): the host of a co-op room switches it between 4 and 8 seats
//     before the match (refused while matchmaking: ERR.MATCHING, the queue is the size's). 4 → 8 frees the AI seats (the
//     8-player mode has none; local debug mode keeps them); 8 → 4 is refused while more than four seats are taken
//     (ROOM_FULL) and moves the seated players into the first four seats in seat order. Spectators stay.
//   * 규칙 모드 (shared/ruleset.js, maintainer decisions 2026-10-15, 2026-10-18): every room has a ruleset — classic
//     (the official rules), casual (this remake's conveniences) or custom (the host's settings, `custom`). room.create
//     { ruleset?, custom? } picks it (default classic), the host changes it before the match with room.setRuleset
//     { preset, custom? } (refused while the room is matchmaking: ERR.MATCHING; a custom room matchmakes alone,
//     filled by quick players — server/matchmaking.js), room.state carries it, the drain hand-over keeps it and every match of the room (a briefing reroll's too) gets it.
//   * 规程等级 (maintainer decision 2026-11-08; shared/seasons.js `soloGrades`, shared/constants.js MAX_GRADE): a solo room
//     of such a season has a `grade` (room.state, the hand-over) — 1–20 or 极速模拟 (FAST_GRADE) — chosen by room.create /
//     room.setDifficulty { grade } (absent: the first grade of the difficulty asked), every grade open (no unlocks). Its
//     difficulty is the grade's, and its matches play `mode_single_<grade>` (modeIdFor). A grade in any other room is
//     BAD_MSG. A season with `noLargeRoom` (规程 until it comes, maintainer decision 2026-11-11) refuses 8 seats:
//     room.create / room.setSize answer BAD_MSG (room.queue too, server/matchmaking.js); its custom ruleset is open.
//     ▸ room.start requires every other human to be connected and ready; the host's start counts as the host's
//     ready (the host may still toggle room.ready for display).
//   * room.kick {seat, playerId} (community report #17, owner approved): before the match only, the host removes another
//     human like an AI seat (an AI seat stays room.removeBot's; never the host itself). `playerId` names the player the
//     host confirmed: a seat that changed hands meanwhile (left, someone else joined) is refused with BAD_TARGET. The
//     seat is freed at once and the player gets `room.closed {reason:'kicked'}` — now, or on the next resume when
//     offline (with the result replay, as the grace timeout) —, so the reconnect token no longer leads back to the seat
//     (it stays the player's identity: net.js sessions belong to players, not seats). ▸ No ban: the player may join
//     again with the code.
//   * Host migration: when the host leaves (or is removed), the lowest-seat remaining human (connected
//     ones first) becomes host. A room without humans is disposed (bots never keep a room alive).
//   * Disconnect in LOBBY: the seat shows connected=false and is freed after `lobbyGraceMs` (60 s); a
//     session that comes back after that gets `room.closed {reason:'timeout'}`.
//     Disconnect in a match: the seat is kept and match.onDisconnect(playerId) is called.
//   * Reconnect: `hello` with a known token (reconnect window, 10 min, see net.js) rebinds the session;
//     the lobby then broadcasts room.state and, in a match, calls match.onReconnect(playerId).
//     Solo runs (下半: "休整期及机变阶段没有时间限制…24小时内随时返回", research 01 §1 / 06 §17): a session that drops
//     while its solo room's match runs stays resumable for the official `config.constants.singleReconnectTime`
//     (86400 s; option `soloReconnectWindowMs` overrides it) instead of the 10-minute window — the untimed solo match
//     simply waits (net.js session.resumeWindowMs, set at every disconnect). Only after that does expiry turn into
//     match.onLeave ('abandoned'). The extension outlives the match, so a run that ended meanwhile (e.g. a server-run
//     Final Assault) still shows its result on the player's return.
//     A repeated hello on a live connection is a full resync: room.state goes to the requester only
//     (broadcast only when the seat visibly changed, e.g. a rename in LOBBY); the heavy part (match.onReconnect,
//     or the result replay below) runs at most once per `resyncMinGapMs` per session — extra requests inside
//     that window coalesce into one deferred resync, so hello spam cannot amplify into ~15 KB per request.
//   * Result replay: the match's final m.public and each human's m.result are kept after the match ends. A
//     human who resyncs (resume after a drop, a reloaded tab, a repeated hello) while the room is back in LOBBY
//     gets room.state followed by those two frames again, until they act in the room (ready, difficulty, the
//     AI-picks-last option, AI seats, start), leave it, or a new match starts. A human removed by the lobby grace
//     gets them right after `room.closed {timeout}` on their next resume (Match.onReconnect cannot do this: the
//     lobby drops the match reference at onEnd and disposes it on the next macrotask).
//   * Per-network limits (internet clients only, see net.js clientAddress): at most `maxRoomsPerAddr` rooms
//     created from one network may exist at once and at most `maxMatchesPerAddr` matches started from one
//     network may run at once (room.create / room.start → ERR.RATE). Without them a socket loop could fill
//     `maxRooms` or keep hundreds of unattended matches simulating for the whole reconnect window.
//   * Permanent departure during a match (room.leave, g.leave, reconnect window expired): the seat is
//     marked departed (shown as connected=false), match.onLeave(playerId) is called, and the seat is freed
//     when the match ends. 'g.leave' is handled here and never reaches match.handle().
//   * All other 'g.*' messages go to room.match.handle(playerId, msg); its {ok}/{error} becomes the reply.
//   * Match lifecycle: room.start → new Match({...}) → room.state (inMatch=true) → match.start(). The match gets
//     `matchNo` = the room's match number (1, 2, …): with the seed it keeps battleIds unique across the room's
//     matches, so a late b.progress / b.result of the previous match is ignored by the next one (DESIGN §14).
//     onEnd(summary) → room back to LOBBY (departed seats freed, humans un-readied, disconnected humans
//     get the lobby grace), dispose() on the next macrotask. Players can start again.
//   * room.closed reasons: 'timeout' (removed after lobby grace), 'kicked' (room.kick, room.removeSpectator), 'empty' (a
//     spectator whose room lost its last player), 'shutdown' (server stopping), 'newVersion' (a draining server closed
//     its waiting room; `moved: true` when the room was handed to the new server — server/local-generation.js).
//   * Deploy handoff (server/local-generation.js): roomSnapshot(room) is a waiting room as the new server rebuilds it
//     (settings, seats, host, AI seats, each human's reconnect token); adoptRoom(snapshot) rebuilds it there with every
//     human disconnected (net.js SessionRegistry.adopt) for a longer lobby grace, so each player's reloaded page resumes
//     its seat with its old token like a reconnect. ▸ The room keeps its code unless the new server already uses it.
//   * Operator loadout (DESIGN §16): room.loadout { entries } is checked strictly against the game data
//     (shared/protocol.js checkLoadout: known visible chess, a skill index legal for the normal AND the elite status, a
//     module of the elite or 'none'; any bad entry rejects the whole message, nothing is stored). ▸ It is stored on the
//     session (it follows the player into every room they create/join, and survives a resume) and on the seat; the
//     match receives seats[].loadout (bots: none — they fight with the defaults). ▸ Accepted any time: in a LOBBY room
//     (or outside a room) it simply replaces the stored one; while the room's match runs it is also handed to
//     match.setLoadout(playerId, loadout), which accepts it during INFO_CHECK / BAND_DRAFT (the 干员调配 entries of the
//     briefing and the strategy draft, maintainer decision 2026-10-14) and refuses it afterwards (WRONG_PHASE: the
//     match's loadout is locked, the stored one applies to the next match).
//     ▸ Its `ops` (0.2.2: the per-operator 潜能 / 练度, shared/protocol.js checkLoadoutOps — an operator of the 干员调配
//     roster or the 自选 owned pool, strict like the entries) travel with it: session.ops / seat.ops / seats[].ops and
//     match.setLoadout(playerId, loadout, ops); a message without `ops` sets none (every operator 潜能 6, 精英2 Lv.60).
//   * Operator ownership (干员持有, 0.2.0 补位, owner's decision 2026-10-05): room.ownership { notOwned } — the base chess
//     ids the player marked as not owned — is checked leniently (shared/protocol.js checkNotOwned: anything that is not
//     a droppable NORMAL chess is dropped, never the whole list; only a malformed list is BAD_MSG) and stored on the
//     session and the seat like the loadout. The match receives seats[].notOwned when it starts (bots: none — they own
//     every operator) and keeps it for its whole length: the setting is out of match ("局外设置，下一局生效"), so while
//     the room's match runs a new list is only stored for the next match (ROOM_STARTED 'stored for the next match',
//     never handed to the match). A spectator's list stays on its session.
//   * 自选编队 (0.2.0 DIY, the owner's decisions of 2026-10-05): room.diy { picks } — the player's picks for the four DIY
//     slots ({ [slotBaseId]: { charId, skillIndex?, uniEquipId? } | null }) — is checked leniently (shared/protocol.js
//     checkDiyPicks against the game data and the kit registry, server/sim/content/kits/index.js KITTED_CHARS: an
//     illegal pick — an operator without a kit, another tier's prototype, a prototype off its locked skill, a second slot
//     of one owned operator, the same operator twice in a tier, an unknown slot / skill / module — is dropped, never the
//     whole roster; only malformed picks are BAD_MSG) and stored on the session and the seat exactly like the
//     not-owned list: the match receives seats[].diy when it starts (bots: none — they field no 自选 piece [ASSUMED]),
//     and a change while it runs reaches it during its briefing / strategy draft (match.setDiy, 맹약별 선발 프리셋 —
// maintainer decision 2026-10-09), else is stored for the next match (ROOM_STARTED 'stored for the next match'). Every
//     `welcome` carries `diyKitted` (welcomeInfo): the operators a DIY slot may field, so the client's picker offers
//     exactly what the server accepts.
//   * These three settings are kept per 卫戍协议 season (maintainer decision 2026-11-01, shared/seasons.js): room.loadout /
//     room.ownership / room.diy name the season they belong to (`season`, absent = the default; one the server does not
//     offer → BAD_MSG), are checked against that season's data and stored on the session under it (settingsOf: the
//     default season's in the session's own fields, another's in session.seasonal). A seat takes those of its room's
//     season (humanSeat); a message of another season than the room's is only stored on the session (OK), never on the
//     seat or the match.
//   * 名片干员 (after upstream 0.3.3, the seat cards of the waiting room): room.card { charId } — the operator whose
//     portrait fills the player's seat card, '' for none — is kept only when it is a visible, non-自选 chess charId of the
//     data or a 自选 pick this server offers (cardCharIds; the room's season's data, outside a room the default season's;
//     another id: BAD_MSG, the stored one stays). Stored on the session (it follows the player into the next room) and
//     the seat; the room's members see it as room.state seats[].card (human seats with a card only). Checked again when
//     the player takes a seat (humanSeat): a card the room's season lacks is left off the seat, never cleared from the
//     session. Cosmetic: any phase, spectators too (stored on the session), never handed to a match. [ASSUMED·자료 없음:
//     the event's card shows the account's assistant (名片形象); this remake has no accounts, so the pick is made on
//     one's own seat card and kept in the browser — ui/seatArt.js]
//   * Spectator seats (community report #26, owner's decision 2026-10-04 — a remake feature, the official room has none):
//     room.spectate { code } takes one of a co-op room's spectator seats (`spectatorSeats`, below), in its lobby or while its
//     match runs (▸ solo rooms: ROOM_FULL). A spectator is not a player: never in `seats`, never counted for the 1–4 players
//     or the start gate, never host, never keeps a room alive (a room whose last human leaves closes with room.closed
//     {empty} for its spectators). It receives room.state (`spectators: [{ playerId, name, connected }]`) and every match
//     broadcast (m.public, m.ticker, m.emote, b.pool — public data); the match registers it (opts.spectators /
//     addSpectator) and shows it fields like an eliminated player (b.start watch / m.field), never an m.private. It may
//     only g.watch (the heavy bucket, like every watcher), g.leave / room.leave, and room.loadout / room.ownership /
//     room.diy (stored for its session, never handed to the match); anything else → SPECTATOR (▸ emotes too). Host: room.removeSpectator { playerId } any
//     time → room.closed {kicked} to it. A room.join a co-op room refuses for want of a player seat (ROOM_FULL, ROOM_STARTED,
//     MATCHING) carries `room` { players, seats, round, spectators, spectatorSeats } in its error frame, so an invited page
//     can offer a spectator seat instead (maintainer decision 2026-11-14). A spectator in a LOBBY room may take a free player seat with room.join of the same
//     code; a player never switches to spectating in place (ALREADY). Disconnect / grace / reconnect / expiry work as for
//     a player seat (the seat is kept and given back on resume).
//   * room.setSpectatorSeats { seats } (maintainer decision 2026-11-05): the host of a co-op room picks SPECTATOR_SEATS (2–6,
//     default MIN_SPECTATORS) before the match, kept across its matches and the drain hand-over (room.state `spectatorSeats`).
//     Refused below the spectators already seated (ROOM_FULL); nobody's ready changes: it is no rule of the match.
//   * Seat reservation (maintainer decision 2026-11-04, a remake feature): room.reserveSeat { on } — a spectator asks for
//     the next free player seat, or takes the request back; first asked, first seated, kept until it is taken back or its
//     spectator seat goes (room.state `spectators[].reserved`: the place in that order). Refused while the room is
//     matchmaking (ERR.MATCHING), as room.join is; a player gets ALREADY. fillReservedSeats seats the connected ones
//     whenever seats are free outside a match: a match's end (before a vote's new match and its seat count, so the
//     spectator plays it without room.start's ready check — the reservation was the agreement) and a seat freed in LOBBY
//     (a human gone, an AI removed, the size raised). Only free seats: an AI seat stays the host's to remove. A dropped
//     spectator is skipped and keeps the place. Being seated keeps the session's replay (a result screen still owed).
//   * 랜덤 매칭 (maintainer decisions 2026-10-13, a remake feature): room.queue / room.queueRoom / room.unqueue /
//     room.queueAccept / room.queueVote go to the Matchmaker (server/matchmaking.js, its header has the rules): a per-difficulty co-op
//     queue of single players and co-op rooms with empty seats; a confirmed group of four gets the oldest queued room
//     of the group (or a room of its own: queue order = seat order, the first is host) and a match started at once.
//     While a room is queued (room.state `matching`) room.join of it, room.setDifficulty, room.addBot and room.start are
//     refused (ERR.MATCHING); a human leaving it in LOBBY, or its disposal, cancels the room's entry (removeMember /
//     disposeRoom → onRoomChange). Its session events come from onHello / onDisconnect / onExpire / shutdown here.
//   * Seat log (maintainer decision 2026-10-17: a "could not reconnect" report had nothing to go on): one info line per
//     seated human (player or spectator) who drops, comes back (and after how long), leaves a running match, or whose
//     reconnect window expires — `[lobby] <code> <name> (<playerId>) <event>`, with `R<round> <phase>` during a match.
//     A resume whose room is gone says why (the room.closed notice). Players outside rooms are not logged.

import { randomBytes, randomInt } from 'node:crypto';
import { DIFFICULTIES, ERR, LARGE_MIN_PLAYERS, LARGE_SEATS, MAX_SEATS, MIN_SPECTATORS, ROOM_CODE_LEN, SPECTATOR_SEATS, firstGrade, gradeDifficulty, isGrade, modeIdFor, seatsOf } from '../shared/constants.js';
import { checkLoadout, checkLoadoutOps, cultivationCharIds, checkNotOwned, checkDiyPicks } from '../shared/protocol.js';
import { encode, isDroppable, isErrCode, sendRaw, sendSession } from './net.js';
import { getData as defaultGetData, lookup } from './data.js';
import { Match as DefaultMatch } from './match/Match.js';
import * as localPatch from './local-patch.js'; // local patch: room chat, chat factions, SP_MAX_BOTS
import { isLocalDiyPick } from '../shared/local-diy.js'; // local patch: the 自选 picks offered
import { KITTED_CHARS } from './sim/content/kits/index.js';
import { Matchmaker } from './matchmaking.js';
import { resolveRuleset, sameRuleset, rulesetWire } from '../shared/ruleset.js';
import { DEFAULT_SEASON, offeredSeasons, seasonFeature, seasonOf } from '../shared/seasons.js';
import { BOT_NAMES } from '../shared/botNames.js';

/** Room code alphabet: uppercase letters without I and O (and no digits, so no 0/1). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Tunables. */
export const LOBBY_DEFAULTS = Object.freeze({
  lobbyGraceMs: 60_000,   // disconnected humans keep their lobby seat this long
  maxRooms: 1000,
  maxRoomsPerAddr: 16,    // rooms created from one client network that may exist at once (0 = unlimited)
  maxMatchesPerAddr: 8,   // matches started from one client network that may run at once (0 = unlimited)
  resyncMinGapMs: 1000,   // heavy resyncs (match state / result replay) per session at most this often on repeated hellos
  soloReconnectWindowMs: null, // a dropped solo run stays resumable this long (null = data singleReconnectTime, 24 h)
});

/** Official `singleReconnectTime` (s) when the data lacks it (constData, research 01 §1). */
export const SOLO_RECONNECT_FALLBACK_SEC = 86_400;

/** Display names for AI teammates (shared/botNames.js: the client shows them in its language). */
export { BOT_NAMES };

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });
/** What a draining generation refuses (server/local-generation.js): everything that would bring a player into a room. */
const DRAIN_REFUSED = new Set(['room.create', 'room.join', 'room.spectate', 'room.queue', 'room.queueRoom', 'room.queueAccept', 'room.queueVote']);
const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @typedef {{ seat: number, playerId: string, name: string, isBot: boolean, ready: boolean,
 *             connected: boolean, left: boolean, awayAt?: number, loadout?: Record<string, { skill: number, module: string|null }> | null,
 *             ops?: Readonly<Record<string, { potential: number, cultivate: number }>> | null,
 *             notOwned?: readonly string[] | null, diy?: Readonly<Record<string, DiyLoadout>> | null }} Seat
 * @typedef {{ charId: string, skillIndex: number, uniEquipId: string|null }} DiyLoadout
 */

/** Deep-frozen copy of a checked loadout (shared by the session, the seat and the match's PlayerState). */
function freezeLoadout(loadout) {
  const out = {};
  for (const [id, e] of Object.entries(loadout || {})) out[id] = Object.freeze({ skill: e.skill, module: e.module ?? null });
  return Object.freeze(out);
}

/** Deep-frozen copy of checked operator settings (0.2.2 潜能 / 练度; shared by the session, the seat and the match). */
function freezeOps(ops) {
  const out = {};
  for (const [id, e] of Object.entries(ops || {})) out[id] = Object.freeze({ potential: e.potential, cultivate: e.cultivate });
  return Object.freeze(out);
}

/** The charIds a player may set a potential / 练度 for, per data object (shared/protocol.js cultivationCharIds). */
const OPS_IDS = new WeakMap();
function opsCharIds(data) {
  if (!data || typeof data !== 'object') return new Set();
  let ids = OPS_IDS.get(data);
  if (!ids) { ids = cultivationCharIds(data.chess, data.backups); OPS_IDS.set(data, ids); }
  return ids;
}

/** The operator charIds a seat card may show (room.card's whitelist; the client's picker list is ui/seatArt.js
 * cardOperators): the visible, non-自选 chess records plus the 自选 picks this server offers (`backups.diy.ownedPool`
 * filtered by shared/local-diy.js — operators with no chess record of their own). */
const CARD_IDS = new WeakMap();
function cardCharIds(data) {
  if (!data || typeof data !== 'object') return new Set();
  let ids = CARD_IDS.get(data);
  if (ids) return ids;
  ids = new Set();
  const chess = data.chess && typeof data.chess === 'object' ? data.chess : null;
  if (chess) for (const c of Object.values(chess)) if (c && !c.isDiy && c.visible !== false && typeof c.charId === 'string') ids.add(c.charId);
  const pool = data.backups?.diy?.ownedPool;
  if (Array.isArray(pool)) for (const id of pool) if (typeof id === 'string' && id && isLocalDiyPick(id)) ids.add(id);
  CARD_IDS.set(data, ids);
  return ids;
}

/** Deep-frozen copy of checked 自选 picks (shared by the session, the seat and the match's PlayerState). */
function freezeDiy(picks) {
  const out = {};
  for (const [id, p] of Object.entries(picks || {})) out[id] = Object.freeze({ charId: p.charId, skillIndex: p.skillIndex, uniEquipId: p.uniEquipId ?? null });
  return Object.freeze(out);
}

/**
 * Where a session keeps its loadout / ops / notOwned / diy of a season (header): the default season's in the session's
 * own fields (they predate seasons), another's in session.seasonal[season].
 */
function settingsOf(session, season) {
  if (season === DEFAULT_SEASON) return session;
  session.seasonal ??= {};
  return (session.seasonal[season] ??= { loadout: null, ops: null, notOwned: null, diy: null });
}

/** One room: 4 seat slots (8 in the 8-player mode), host, difficulty, optional running match. */
export class Room {
  /**
   * @param {string} code @param {'solo'|'coop'} mode @param {string} difficulty @param {number} now
   * @param {number} [size] a co-op room's seat count (ROOM_SIZES; header), 4 otherwise
   */
  constructor(code, mode, difficulty, now, size = MAX_SEATS) {
    this.code = code;
    this.mode = mode;
    /** seat count: 4, or 8 for an 8-player co-op room */
    this.size = mode === 'coop' ? seatsOf(size) : MAX_SEATS;
    this.difficulty = difficulty;
    /**
     * 「AI 队友最后选择」 (room.setAiPicksLast, GitHub #338; co-op only, off by default): the match's strategy and 机变 drafts
     * put every human seat before every AI seat (Match opts.aiPicksLast). Kept across the room's matches.
     */
    this.aiPicksLast = false;
    /** 규칙 모드 (shared/ruleset.js): { preset, options }, the default preset until room.create / room.setRuleset picks one */
    this.ruleset = resolveRuleset(null);
    /** the 卫戍协议 season (shared/seasons.js) whose data the room's matches run on; set by room.create */
    this.season = DEFAULT_SEASON;
    /** 规程等级 (header): a solo room of a season with `soloGrades` plays this grade's mode, else null */
    this.grade = null;
    /** 랜덤 매칭: the room's humans wait in the queue for its empty seats (server/matchmaking.js queueRoom) */
    this.matching = false;
    /** @type {string | null} */
    this.hostId = null;
    /** @type {(Seat | null)[]} */
    this.seats = new Array(this.size).fill(null);
    /** @type {{ playerId: string, name: string, connected: boolean, reservedSeq?: number }[]} spectator seats, ≤ spectatorSeats (header) */
    this.spectators = [];
    /** how many spectator seats the room has (room.setSpectatorSeats, header) */
    this.spectatorSeats = MIN_SPECTATORS;
    /** the last seat reservation's number: `reservedSeq` orders them (header) */
    this.reserveSeq = 0;
    /** @type {any} running Match instance */
    this.match = null;
    /** @type {{ live: boolean, ended: boolean, disposed: boolean, match: any } | null} */
    this.matchCtx = null;
    this.matchCount = 0;
    /** @type {any} summary passed to onEnd by the last match */
    this.lastSummary = null;
    /**
     * Frames of the last match's end, replayed on resync to humans who have not moved on yet.
     * @type {{ publicFrame: string | null, frames: Map<string, string>, pending: Set<string> } | null}
     */
    this.replay = null;
    /** @type {string | null} per-network limit key of the creator (net.js clientAddress) */
    this.ownerKey = null;
    /** @type {string | null} per-network limit key of whoever started the running match */
    this.matchKey = null;
    this.createdAt = now;
    this.disposed = false;
  }

  /** @param {string} playerId @returns {Seat | null} */
  seatOf(playerId) {
    for (const s of this.seats) if (s && s.playerId === playerId) return s;
    return null;
  }

  /** @param {string} playerId @returns {{ playerId: string, name: string, connected: boolean } | null} */
  spectatorOf(playerId) { return this.spectators.find((s) => s.playerId === playerId) || null; }

  /** The spectators with a seat reservation, first asked first (header). */
  reservedSpectators() { return this.spectators.filter((s) => s.reservedSeq).sort((a, b) => a.reservedSeq - b.reservedSeq); }

  /** Lowest free seat index, or -1. */
  freeSeat() { return this.seats.indexOf(null); }

  /**
   * What a refused room.join of a co-op room carries (`room` of the error frame, header 「Spectator seats」): the seats
   * taken / the seat count, the running match's round (0 in LOBBY), the spectator seats taken / offered — so the
   * invited page can offer a spectator seat instead (ui/inviteSpectate.js).
   */
  joinRefusalInfo() {
    return {
      players: this.seats.filter((s) => s && !s.left).length,
      seats: this.seats.length,
      round: this.match ? (this.match.round ?? 0) : 0,
      spectators: this.spectators.length,
      spectatorSeats: this.spectatorSeats,
    };
  }

  /** Humans that have not departed, in seat order. @returns {Seat[]} */
  activeHumans() { return this.seats.filter((s) => s && !s.isBot && !s.left); }

  /**
   * An 8-seat room that may not start yet: fewer than LARGE_MIN_PLAYERS Doctors, or an AI seat (header; local debug
   * mode: AI seats count toward the five — server/local-patch.js largeBots). room.start, and the new match of a vote.
   */
  seatsOpen() {
    if (this.size <= MAX_SEATS) return false;
    const humans = this.activeHumans().length;
    const bots = this.seats.filter((s) => s && s.isBot).length;
    return localPatch.largeBots() ? humans + bots < LARGE_MIN_PLAYERS : humans < LARGE_MIN_PLAYERS || bots > 0;
  }

  /** `room.state` frame (DESIGN §8.1) plus `inMatch`. */
  toState() {
    const reserved = this.reservedSpectators();
    return {
      t: 'room.state',
      code: this.code,
      hostId: this.hostId,
      mode: this.mode,
      size: this.size,
      difficulty: this.difficulty,
      ruleset: this.ruleset,
      aiPicksLast: this.aiPicksLast,
      ...(this.console ? { console: true } : {}), // local patch: 콘솔 모드 of a solo room (room.setConsole, local-patch.js)
      // the season, only when it is not the default (shared/seasons.js): the page loads that season's data
      ...(this.season !== DEFAULT_SEASON ? { season: this.season } : {}),
      // 规程等级 (header), only in a graded room
      ...(this.grade !== null ? { grade: this.grade } : {}),
      matching: this.matching,
      inMatch: !!this.match,
      // the room's match number (DESIGN §14): a briefing reroll replaces the match while inMatch stays true
      matchNo: this.matchCount,
      maxBots: localPatch.maxBotsSetting(), // local patch
      ...(this.size > MAX_SEATS && localPatch.largeBots() ? { largeBots: true } : {}), // AI seats in an 8-player room (local debug)
      seats: this.seats.map((s) => (s
        ? { seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, ready: s.ready, connected: s.connected && !s.left,
          // 名片干员 (room.card): only a human seat with a card carries the key
          ...(!s.isBot && s.card ? { card: s.card } : {}) }
        : null)),
      spectatorSeats: this.spectatorSeats,
      spectators: this.spectators.map((s) => ({ playerId: s.playerId, name: s.name, connected: s.connected,
        ...(s.reservedSeq ? { reserved: reserved.indexOf(s) + 1 } : {}) })),
    };
  }
}

/** Room registry + lobby message handlers. Pass an instance as the `handler` of net.js Network. */
export class Lobby {
  /**
   * @param {{
   *   registry: import('./net.js').SessionRegistry,
   *   log?: { info: Function, warn: Function, error: Function, debug?: Function },
   *   MatchClass?: new (opts: object) => any,
   *   getData?: (opts?: { season?: string }) => object,
   *   now?: () => number,
   *   seedFn?: () => number,
   *   options?: Partial<typeof LOBBY_DEFAULTS>,
   * }} opts
   */
  constructor({ registry, log = noopLog, MatchClass = DefaultMatch, getData = defaultGetData, now = Date.now, seedFn, options = {} }) {
    this.registry = registry;
    this.log = log;
    this.MatchClass = MatchClass;
    this.getData = getData;
    this.now = now;
    this.seedFn = seedFn || (() => randomInt(2 ** 32));
    this.opts = { ...LOBBY_DEFAULTS, ...options };
    /** the seasons a room may name (shared/seasons.js): the public ones and SP_SEASONS, or options.seasons */
    this.seasons = new Set(Array.isArray(this.opts.seasons) ? this.opts.seasons : offeredSeasons(process.env.SP_SEASONS));
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, NodeJS.Timeout>} lobby grace timers by playerId */
    this.graceTimers = new Map();
    /** @type {Map<string, NodeJS.Timeout>} deferred (coalesced) resyncs by playerId */
    this.resyncTimers = new Map();
    /** per-network limit warnings: at most one log line per 10 s (the rest are counted) */
    this.limitLog = { at: -Infinity, suppressed: 0 };
    /** 랜덤 매칭 (header) */
    this.queue = new Matchmaker(this, { Room, options: this.opts });
  }

  /** @param {string} code @returns {Room | null} */
  getRoom(code) { return this.rooms.get(String(code).toUpperCase()) || null; }

  /** Counters for /healthz. */
  stats() {
    let matches = 0;
    let humans = 0;
    let bots = 0;
    let spectators = 0;
    for (const r of this.rooms.values()) {
      if (r.match) matches++;
      for (const s of r.seats) if (s && !s.left) (s.isBot ? bots++ : humans++);
      spectators += r.spectators.length;
    }
    return { rooms: this.rooms.size, matches, humans, bots, spectators };
  }

  // ---------------------------------------------------------------------------------------------------
  // net.js handler interface
  // ---------------------------------------------------------------------------------------------------

  /**
   * After `welcome`: resend room state / match state for resumed (or repeated) hellos.
   * @param {import('./net.js').Session} session
   * @param {{ resumed: boolean, repeat: boolean }} info
   */
  onHello(session, { resumed, repeat }) {
    if (!this.roomOf(session)?.match) this.sendQueueCounts(session); // the lobby's matchmaking counts (matchmaking.js header)
    if (!resumed && !repeat) return;
    this.queue.onResume(session);
    const room = this.roomOf(session);
    if (!room) {
      if (resumed && session.notice) this.log.info(`[lobby] ${session.name} (${session.playerId}) back, room gone: ${session.notice}`);
      if (session.notice) {
        const info = session.noticeInfo?.for === session.notice ? { ...session.noticeInfo, for: undefined } : null;
        sendSession(session, { t: 'room.closed', reason: session.notice, ...info });
        session.notice = null;
        session.noticeInfo = null;
      }
      if (session.pendingResult) {
        for (const frame of session.pendingResult) if (frame) sendRaw(session.ws, frame);
        session.pendingResult = null;
      }
      return;
    }
    session.notice = null;
    // A result kept for a seat that dropped during its match (onMatchEnd) must survive this resume too: the room may be
    // emptied and disposed meanwhile, and its replay dies with it (disposeRoom clears room.replay). Hold the frames and
    // send them after this resume's state, in the order a player who stayed connected gets them (room.state, m.public
    // RESULT, m.result) — unless the room still replays them itself (runResync), so they never come twice.
    const kept = session.pendingResult;
    session.pendingResult = null;
    // a player seat, or a spectator seat (header): both carry `connected` / `name`
    const seat = room.seatOf(session.playerId) || room.spectatorOf(session.playerId);
    this.clearGrace(session.playerId);
    // Only a visible change (reconnect, rename, new host) is broadcast; a plain resync (repeated hello on a
    // live socket) answers the requester alone, so hello spam cannot amplify into room-wide traffic.
    let changed = !seat.connected;
    if (changed) this.seatLog(room, session, Number.isFinite(seat.awayAt) ? `back after ${Math.round((this.now() - seat.awayAt) / 1000)} s` : 'back');
    else if (resumed && !repeat) this.seatLog(room, session, 'back on a new socket (the old one had not closed)');
    seat.connected = true;
    if (!room.match && seat.name !== session.name) { seat.name = session.name; changed = true; }
    if (!room.hostId) { this.migrateHost(room); changed = true; }
    if (changed) this.broadcastState(room);
    else this.sendState(room, session);
    // the room no longer replays this player's result (disposed, or its replay dropped): the kept frames are the only copy
    if (kept && !room.match && !this.replayFor(room, session.playerId)) for (const frame of kept) if (frame) sendRaw(session.ws, frame);
    this.resync(session, !resumed);
  }

  /**
   * Validated client message from an identified session.
   * @param {import('./net.js').Session} session
   * @param {any} msg
   * @returns {{ ok: true } | { error: string, detail?: string }}
   */
  onMessage(session, msg) {
    const local = localPatch.onMessage(this, session, msg); if (local) return local; // local patch
    if (this.generation?.draining && DRAIN_REFUSED.has(msg.t)) return fail(ERR.NEW_VERSION); // server/local-generation.js
    switch (msg.t) {
      case 'room.create': return this.create(session, msg);
      case 'room.join': return this.join(session, msg);
      case 'room.leave': return this.leave(session);
      case 'room.ready': return this.ready(session, msg);
      case 'room.setDifficulty': return this.setDifficulty(session, msg);
      case 'room.setRuleset': return this.setRuleset(session, msg);
      case 'room.setAiPicksLast': return this.setAiPicksLast(session, msg);
      case 'room.setSize': return this.setSize(session, msg);
      case 'room.addBot': return this.addBot(session);
      case 'room.removeBot': return this.removeBot(session, msg);
      case 'room.kick': return this.kick(session, msg);
      case 'room.start': return this.start(session);
      case 'room.loadout': return this.loadout(session, msg);
      case 'room.ownership': return this.ownership(session, msg);
      case 'room.diy': return this.diy(session, msg);
      case 'room.card': return this.card(session, msg);
      case 'room.spectate': return this.spectate(session, msg);
      case 'room.removeSpectator': return this.removeSpectator(session, msg);
      case 'room.reserveSeat': return this.reserveSeat(session, msg);
      case 'room.setSpectatorSeats': return this.setSpectatorSeats(session, msg);
      case 'room.queue': return this.queue.queue(session, msg);
      case 'room.queueRoom': return this.queue.queueRoom(session);
      case 'room.unqueue': return this.queue.unqueue(session);
      case 'room.queueAccept': return this.queue.accept(session, msg);
      case 'room.queueVote': return this.queue.vote(session);
      default:
        if (typeof msg.t === 'string' && msg.t.startsWith('g.')) return this.routeGame(session, msg);
        return fail(ERR.BAD_MSG, `unhandled type ${String(msg.t).slice(0, 32)}`);
    }
  }

  /** The session's socket closed. @param {import('./net.js').Session} session */
  onDisconnect(session) {
    this.clearResync(session.playerId); // the next resume resyncs immediately
    this.queue.onDisconnect(session);
    const room = this.roomOf(session);
    // a solo run may be resumed within singleReconnectTime (24 h); everything else keeps the registry's window
    session.resumeWindowMs = room && room.match && room.mode === 'solo' ? this.soloResumeWindowMs() : null;
    if (!room) return;
    const player = room.seatOf(session.playerId);
    const seat = player || room.spectatorOf(session.playerId);
    seat.connected = false;
    seat.awayAt = this.now(); // the room's `awayMin` (server/local-rooms.js): how long ago it lost its last connection
    this.seatLog(room, session, player ? 'dropped' : 'dropped (spectator)');
    // a spectator's seat is kept like a player's (nothing to tell the match: it plays no field)
    if (room.match) { if (player) this.callMatch(room, 'onDisconnect', session.playerId); } else this.startGrace(room, seat);
    this.broadcastState(room);
  }

  /** The session's reconnect window elapsed (already removed from the registry). */
  onExpire(session) {
    session.notice = null;
    session.pendingResult = null;
    this.clearResync(session.playerId);
    this.queue.onExpire(session);
    const code = session.roomCode;
    session.roomCode = null;
    const room = code ? this.rooms.get(code) : null;
    if (!room) return;
    if (room.seatOf(session.playerId) || room.spectatorOf(session.playerId)) this.seatLog(room, session, 'reconnect window expired, removed');
    this.removeMember(room, session.playerId);
  }

  /**
   * Dispose every room (notifying members with room.closed) — used on server shutdown.
   * @param {string} [reason]
   */
  shutdown(reason = 'shutdown') {
    this.queue.shutdown();
    for (const room of [...this.rooms.values()]) this.disposeRoom(room, reason);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    for (const t of this.resyncTimers.values()) clearTimeout(t);
    this.resyncTimers.clear();
  }

  // ---------------------------------------------------------------------------------------------------
  // room.* handlers
  // ---------------------------------------------------------------------------------------------------

  create(session, { mode, difficulty, ruleset, custom, size, season = DEFAULT_SEASON, grade }) {
    if (size === LARGE_SEATS && mode !== 'coop') return fail(ERR.BAD_MSG, 'only a co-op room has 8 seats');
    if (!this.seasons.has(season)) return fail(ERR.BAD_MSG, 'season not offered');
    if (seasonFeature(season, 'noLargeRoom') && size === LARGE_SEATS) return fail(ERR.BAD_MSG, 'no 8-player room in this season yet');
    const graded = mode === 'solo' && seasonFeature(season, 'soloGrades');
    if (grade !== undefined && !graded) return fail(ERR.BAD_MSG, 'only a graded solo room has a grade');
    const roomGrade = graded ? (grade ?? firstGrade(difficulty)) : null;
    if (roomGrade !== null) difficulty = gradeDifficulty(roomGrade);
    const cur = this.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (this.rooms.size >= this.opts.maxRooms) return fail(ERR.INTERNAL, 'too many rooms');
    const key = session.limitKey || null;
    if (key && this.opts.maxRoomsPerAddr > 0) {
      // The room being left disappears with this create when the creator is its only human (a spectator is none).
      const leaving = cur && cur.ownerKey === key && cur.activeHumans().length === 1 && !cur.spectatorOf(session.playerId) ? 1 : 0;
      if (this.countRooms((r) => r.ownerKey === key) - leaving >= this.opts.maxRoomsPerAddr) {
        this.limitWarn(`room limit (${this.opts.maxRoomsPerAddr}) reached for ${session.addr}`);
        return fail(ERR.RATE, 'too many rooms from your network');
      }
    }
    const code = this.genCode();
    if (!code) return fail(ERR.INTERNAL, 'no room code available');
    if (cur) this.removeMember(cur, session.playerId);
    const room = new Room(code, mode, difficulty, this.now(), size);
    room.ruleset = resolveRuleset({ preset: ruleset, custom });
    room.season = season;
    room.grade = roomGrade;
    room.ownerKey = key;
    room.seats[0] = this.humanSeat(0, session, season);
    room.hostId = session.playerId;
    this.rooms.set(code, room);
    session.roomCode = code;
    session.notice = null;
    session.pendingResult = null;
    this.log.info(`[lobby] ${code} created (${mode}${room.size > MAX_SEATS ? room.size : ''}/${difficulty}${roomGrade !== null ? `#${roomGrade}` : ''}/${room.ruleset.preset}) by ${session.name}`);
    this.broadcastState(room);
    return OK;
  }

  join(session, { code }) {
    const norm = String(code).trim().toUpperCase();
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined;
    if (!room) return fail(ERR.ROOM_NOT_FOUND);
    const cur = this.roomOf(session);
    // idempotent for members; a spectator of this room goes on below: it may take a free player seat (header)
    if (cur === room && !room.spectatorOf(session.playerId)) { this.sendState(room, session); return OK; }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    // a co-op room that has no player seat for this one says how full it is: the page may offer a spectator seat
    const refused = (code, detail) => (room.mode === 'solo' ? fail(code, detail) : { ...fail(code, detail), room: room.joinRefusalInfo() });
    if (room.match) return refused(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo room');
    if (room.matching) return refused(ERR.MATCHING, 'the room is matchmaking');
    const idx = room.freeSeat();
    if (idx < 0) return refused(ERR.ROOM_FULL);
    if (cur) this.removeMember(cur, session.playerId);
    room.seats[idx] = this.humanSeat(idx, session, room.season);
    session.roomCode = room.code;
    session.notice = null;
    session.pendingResult = null;
    if (!room.hostId) room.hostId = session.playerId;
    this.broadcastState(room);
    localPatch.onJoin(this, room, session); // local patch
    return OK;
  }

  leave(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.match) this.seatLog(room, session, 'left the match');
    this.removeMember(room, session.playerId);
    return OK;
  }

  /**
   * room.spectate: one of a co-op room's spectator seats, in its lobby or during its match (header). In a
   * running match the match registers the spectator and resends what it may see (Match.addSpectator).
   */
  spectate(session, { code }) {
    const norm = String(code).trim().toUpperCase();
    const room = norm.length === ROOM_CODE_LEN ? this.rooms.get(norm) : undefined;
    if (!room) return fail(ERR.ROOM_NOT_FOUND);
    const cur = this.roomOf(session);
    if (cur === room) {
      if (!room.spectatorOf(session.playerId)) return fail(ERR.ALREADY, 'seated as a player');
      this.sendState(room, session);
      return OK;
    }
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo room');
    if (room.spectators.length >= room.spectatorSeats) return fail(ERR.ROOM_FULL, 'no free spectator seat');
    if (cur) this.removeMember(cur, session.playerId);
    room.spectators.push({ playerId: session.playerId, name: session.name, connected: session.connected });
    session.roomCode = room.code;
    session.notice = null;
    session.pendingResult = null;
    this.broadcastState(room);
    localPatch.onJoin(this, room, session); // local patch
    if (room.match) this.callMatch(room, 'addSpectator', session.playerId);
    return OK;
  }

  /** room.removeSpectator (host, any time): the spectator gets room.closed {kicked} and its seat is freed. */
  removeSpectator(session, { playerId }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (!room.spectatorOf(playerId)) return fail(ERR.BAD_TARGET, 'not a spectator of this room');
    const target = this.registry.byId(playerId);
    const wasHere = !!target && target.roomCode === room.code;
    const replay = this.replayFor(room, playerId);
    this.removeMember(room, playerId);
    if (wasHere) {
      // like room.kick: now, or on the next resume (with the result replay, as after the grace timeout)
      if (target.connected) sendSession(target, { t: 'room.closed', reason: 'kicked' });
      else { target.notice = 'kicked'; target.pendingResult = replay; }
    }
    return OK;
  }

  /** room.setSpectatorSeats (host, before the match): how many spectator seats the room has (header). */
  setSpectatorSeats(session, { seats }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'solo rooms have no spectator seats');
    if (seats < room.spectators.length) return fail(ERR.ROOM_FULL, `${room.spectators.length} spectators seated`);
    this.dropReplay(room, session.playerId);
    if (room.spectatorSeats !== seats) {
      room.spectatorSeats = seats;
      this.broadcastState(room);
    }
    return OK;
  }

  /** room.reserveSeat: a spectator asks for the next free player seat, or takes that back (header). */
  reserveSeat(session, { on }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    const s = room.spectatorOf(session.playerId);
    if (!s) return fail(ERR.ALREADY, 'seated as a player');
    if (on === !!s.reservedSeq) return OK;
    if (on) {
      if (room.matching) return fail(ERR.MATCHING, 'the room is matchmaking');
      s.reservedSeq = ++room.reserveSeq;
      this.fillReservedSeats(room);
    } else delete s.reservedSeq;
    this.broadcastState(room);
    return OK;
  }

  /**
   * Seat the connected spectators with a reservation on the free seats, first asked first (header). The caller
   * broadcasts the state (startMatch does). Not removeMember + room.join: that would drop the replay of the result screen.
   */
  fillReservedSeats(room) {
    if (room.match || room.matching || room.disposed) return;
    for (const s of room.reservedSpectators()) {
      const idx = room.freeSeat();
      if (idx < 0) return;
      const session = this.registry.byId(s.playerId);
      if (!s.connected || !session || session.roomCode !== room.code) continue;
      room.spectators.splice(room.spectators.indexOf(s), 1);
      room.seats[idx] = this.humanSeat(idx, session, room.season);
      this.seatLog(room, session, 'took a reserved seat');
    }
  }

  ready(session, { ready }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const seat = room.seatOf(session.playerId);
    if (seat.ready !== ready) {
      seat.ready = ready;
      this.broadcastState(room);
    }
    return OK;
  }

  setDifficulty(session, { difficulty, grade }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (grade !== undefined && room.grade === null) return fail(ERR.BAD_MSG, 'only a graded solo room has a grade');
    // a graded room (header): the grade, or the first one of the difficulty; its difficulty follows
    const nextGrade = room.grade !== null ? (grade ?? firstGrade(difficulty)) : null;
    if (nextGrade !== null) difficulty = gradeDifficulty(nextGrade);
    if (room.matching && room.difficulty !== difficulty) return fail(ERR.MATCHING, 'cancel the matchmaking first');
    this.dropReplay(room, session.playerId);
    if (room.difficulty !== difficulty || room.grade !== nextGrade) {
      room.difficulty = difficulty;
      room.grade = nextGrade;
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      this.broadcastState(room);
    }
    return OK;
  }

  /**
   * lobby.queueCounts (server/matchmaking.js header) to every connected session outside a running match.
   * @param {object} [counts] Matchmaker.countsMsg(): `counts` / `counts8` (+ `seasons`)
   */
  broadcastQueueCounts(counts = this.queue.countsMsg()) {
    const frame = encode({ t: 'lobby.queueCounts', ...counts });
    for (const session of this.registry.all()) {
      if (!session.connected || this.roomOf(session)?.match) continue;
      sendRaw(session.ws, frame);
    }
  }

  /** lobby.queueCounts to one session (hello, back from a match). @param {any} session */
  sendQueueCounts(session) {
    if (session && session.connected) sendSession(session, { t: 'lobby.queueCounts', ...this.queue.countsMsg() });
  }

  /** 규칙 모드 (header): host-only, before the match; a queued room keeps its ruleset (its queue is the ruleset's). */
  setRuleset(session, { preset, custom }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    const next = resolveRuleset({ preset, custom });
    const changed = !sameRuleset(room.ruleset, next);
    if (room.matching && changed) return fail(ERR.MATCHING, 'cancel the matchmaking first');
    this.dropReplay(room, session.playerId);
    if (changed) {
      room.ruleset = next;
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      this.broadcastState(room);
    }
    return OK;
  }

  /** 「AI 队友最后选择」 (GitHub #338): host-only, before the match, co-op rooms only (a solo room has no AI seat). */
  setAiPicksLast(session, { on }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'solo rooms have no AI teammates');
    this.dropReplay(room, session.playerId);
    if (room.aiPicksLast !== on) {
      room.aiPicksLast = on;
      for (const s of room.seats) if (s && !s.isBot && s.playerId !== room.hostId) s.ready = false;
      this.broadcastState(room);
    }
    return OK;
  }

  /** The room's size (header: room.setSize): host-only, before the match, co-op rooms only. */
  setSize(session, { size }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode === 'solo') return fail(ERR.BAD_TARGET, 'a solo room has one seat');
    if (size === LARGE_SEATS && seasonFeature(room.season, 'noLargeRoom')) return fail(ERR.BAD_MSG, 'no 8-player room in this season yet');
    if (room.matching && room.size !== size) return fail(ERR.MATCHING, 'cancel the matchmaking first');
    this.dropReplay(room, session.playerId);
    if (room.size === size) return OK;
    const taken = room.seats.filter(Boolean);
    // the 8-player mode has no AI teammates (local debug mode aside: server/local-patch.js largeBots)
    const keep = size > MAX_SEATS && !localPatch.largeBots() ? taken.filter((s) => !s.isBot) : taken;
    if (keep.length > size) return fail(ERR.ROOM_FULL, `${keep.length} seats taken`);
    // seat indexes stay unless a seat is beyond the new size: then everybody moves up, in seat order
    const fits = keep.every((s) => s.seat < size);
    room.size = size;
    room.seats = new Array(size).fill(null);
    keep.forEach((s, i) => { s.seat = fits ? s.seat : i; room.seats[s.seat] = s; });
    for (const s of keep) if (!s.isBot && s.playerId !== room.hostId) s.ready = false;
    this.log.info(`[lobby] ${room.code} size → ${size}${keep.length < taken.length ? ` (${taken.length - keep.length} AI seat(s) freed)` : ''}`);
    this.fillReservedSeats(room);
    this.broadcastState(room);
    return OK;
  }

  addBot(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    if (room.mode === 'solo') return fail(ERR.ROOM_FULL, 'solo rooms cannot have AI teammates');
    if (room.size > MAX_SEATS && !localPatch.largeBots()) return fail(ERR.ROOM_FULL, 'the 8-player mode has no AI teammates');
    if (room.matching) return fail(ERR.MATCHING, 'matchmaking fills the seats with Doctors');
    const capped = localPatch.botCap(room, this, session); if (capped) return capped; // local patch: SP_MAX_BOTS(_TOTAL/_PER_ADDR)
    const idx = room.freeSeat();
    if (idx < 0) return fail(ERR.ROOM_FULL);
    const used = new Set(room.seats.filter((s) => s && s.isBot).map((s) => s.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || `AI·${idx + 1}`;
    room.seats[idx] = { seat: idx, playerId: this.newBotId(room), name, isBot: true, ready: true, connected: true, left: false };
    this.broadcastState(room);
    return OK;
  }

  removeBot(session, { seat }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const target = room.seats[seat];
    if (!target || !target.isBot) return fail(ERR.BAD_TARGET, 'seat does not hold an AI');
    room.seats[seat] = null;
    this.fillReservedSeats(room);
    this.broadcastState(room);
    return OK;
  }

  /** Host removes another human before the match (header: room.kick). */
  kick(session, { seat, playerId }) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    this.dropReplay(room, session.playerId);
    const target = room.seats[seat];
    if (!target || target.left) return fail(ERR.BAD_TARGET, 'seat holds no player');
    if (target.playerId !== playerId) return fail(ERR.BAD_TARGET, 'seat changed hands'); // the confirmed player left meanwhile
    if (target.isBot) return fail(ERR.BAD_TARGET, 'seat holds an AI (room.removeBot)');
    if (target.playerId === session.playerId) return fail(ERR.BAD_TARGET, 'cannot kick yourself');
    const kicked = this.registry.byId(target.playerId);
    const wasHere = !!kicked && kicked.roomCode === room.code;
    const replay = this.replayFor(room, target.playerId);
    this.removeMember(room, target.playerId);
    if (wasHere) {
      if (kicked.connected) sendSession(kicked, { t: 'room.closed', reason: 'kicked' });
      else { kicked.notice = 'kicked'; kicked.pendingResult = replay; }
    }
    this.log.info(`[lobby] ${room.code} ${target.name} removed by the host`);
    return OK;
  }

  start(session) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.matching) return fail(ERR.MATCHING, 'cancel the matchmaking first');
    const humans = room.activeHumans();
    for (const s of humans) {
      if (s.playerId !== room.hostId && (!s.connected || !s.ready)) return fail(ERR.NOT_READY);
    }
    const bots = room.seats.filter((s) => s && s.isBot);
    if (humans.length < 1 || (room.mode === 'solo' && (humans.length !== 1 || bots.length > 0))) {
      return fail(ERR.BAD_MSG, 'invalid seat configuration');
    }
    // the 8-player mode starts with LARGE_MIN_PLAYERS Doctors or more (header)
    if (room.seatsOpen()) return fail(ERR.SEATS_OPEN, `${humans.length}/${LARGE_MIN_PLAYERS}+ Doctors`);
    const key = session.limitKey || null;
    if (key && this.opts.maxMatchesPerAddr > 0 && this.countRooms((r) => !!r.match && r.matchKey === key) >= this.opts.maxMatchesPerAddr) {
      this.limitWarn(`match limit (${this.opts.maxMatchesPerAddr}) reached for ${session.addr}`);
      return fail(ERR.RATE, 'too many running matches from your network');
    }
    const late = this.restartNotice?.startRefusal(); // the deploy countdown's last minutes (local-restart.js)
    if (late) return late;
    return this.startMatch(room, key);
  }

  /**
   * room.loadout (DESIGN §16): check the operator loadout — and its per-operator 潜能 / 练度 `ops` (0.2.2) — against the
   * game data, store both on the session and the seat, and — while a match runs — hand them to the match (accepted
   * during its briefing and strategy draft, see the header). Either part refused: nothing is stored.
   */
  loadout(session, { entries, ops, season = DEFAULT_SEASON }) {
    if (!this.seasons.has(season)) return fail(ERR.BAD_MSG, 'season not offered');
    const data = this.safeData(season);
    const res = checkLoadout(entries, (id) => lookup('chess', id, data));
    if (!res || res.error) return fail(res && isErrCode(res.error) ? res.error : ERR.BAD_MSG, res && res.detail);
    const ids = opsCharIds(data);
    const resOps = checkLoadoutOps(ops, (id) => ids.has(id));
    if (!resOps || resOps.error) return fail(resOps && isErrCode(resOps.error) ? resOps.error : ERR.BAD_MSG, resOps && resOps.detail);
    const loadout = freezeLoadout(res.loadout);
    const opsSet = freezeOps(resOps.ops);
    const kept = settingsOf(session, season);
    kept.loadout = loadout;
    kept.ops = opsSet;
    const room = this.roomOf(session);
    if (!room || room.season !== season) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) { seat.loadout = loadout; seat.ops = opsSet; }
    if (!room.match || !seat) return OK; // a spectator's loadout stays on its session, never reaching the match
    if (typeof room.match.setLoadout !== 'function') return fail(ERR.ROOM_STARTED, 'stored for the next match');
    let r;
    try {
      r = room.match.setLoadout(session.playerId, loadout, opsSet);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.setLoadout threw`, e);
      return fail(ERR.INTERNAL);
    }
    if (r && typeof r === 'object' && r.error) {
      return fail(isErrCode(r.error) ? r.error : ERR.INTERNAL, typeof r.detail === 'string' ? r.detail : undefined);
    }
    return OK;
  }

  /**
   * room.ownership (0.2.0 补位): keep the droppable chess of the not-owned list, store it on the session and the seat
   * (see the header). A running match never takes it: it keeps the list its seat had at its start.
   */
  ownership(session, { notOwned, season = DEFAULT_SEASON }) {
    if (!this.seasons.has(season)) return fail(ERR.BAD_MSG, 'season not offered');
    const data = this.safeData(season);
    const res = checkNotOwned(notOwned, (id) => lookup('chess', id, data));
    if (!res || res.error) return fail(ERR.BAD_MSG, res && res.detail);
    const list = Object.freeze(res.notOwned.slice());
    settingsOf(session, season).notOwned = list;
    const room = this.roomOf(session);
    if (!room || room.season !== season) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) seat.notOwned = list;
    if (room.match && seat) return fail(ERR.ROOM_STARTED, 'stored for the next match');
    return OK;
  }

  /**
   * room.diy (0.2.0 自选编队): keep the legal picks (checkDiyPicks against the data and KITTED_CHARS), store them on the
   * session and the seat (see the header). A running match takes them only while its briefing or strategy draft runs
   * (match.setDiy, 맹약별 선발 프리셋 — maintainer decision 2026-10-09); otherwise it keeps the picks its seat had at its start
   * and these wait for the next match (ROOM_STARTED).
   */
  diy(session, { picks, season = DEFAULT_SEASON }) {
    if (!this.seasons.has(season)) return fail(ERR.BAD_MSG, 'season not offered');
    const res = checkDiyPicks(picks, { data: this.safeData(season), kitted: KITTED_CHARS.filter(isLocalDiyPick) }); // local patch: our picks only
    if (!res || !('ok' in res)) return fail(ERR.BAD_MSG, res && res.detail);
    const kept = freezeDiy(res.picks);
    settingsOf(session, season).diy = kept;
    const room = this.roomOf(session);
    if (!room || room.season !== season) return OK;
    const seat = room.seatOf(session.playerId);
    if (seat) seat.diy = kept;
    if (room.match && seat) {
      let r = null;
      try { r = typeof room.match.setDiy === 'function' ? room.match.setDiy(session.playerId, kept) : null; } catch (e) { this.log.error(`[lobby] ${room.code} match.setDiy threw`, e); }
      if (!r || r.error) return fail(ERR.ROOM_STARTED, 'stored for the next match');
    }
    return OK;
  }

  /**
   * 名片干员 (room.card, header): the operator on the player's seat card, '' for none — a charId of cardCharIds for the
   * room's season (outside a room the default season's). Kept on the session and the seat; a change is broadcast to the
   * room. Cosmetic: accepted in any phase, never touches a match.
   */
  card(session, { charId }) {
    const room = this.roomOf(session);
    if (charId && !cardCharIds(this.safeData(room ? room.season : DEFAULT_SEASON)).has(charId)) return fail(ERR.BAD_MSG, 'unknown operator');
    session.card = charId || null;
    const seat = room ? room.seatOf(session.playerId) : null;
    if (seat && !seat.isBot && seat.card !== session.card) {
      seat.card = session.card;
      this.broadcastState(room);
    }
    return OK;
  }

  /** Extra fields of every `welcome` (net.js): the operators a 自选 slot may field (shared/diy.js `kitted`). */
  /**
   * The first pong of every socket (net.js connectInfo, before any hello): `seasons` = the 卫戍协议 seasons rooms may name
   * (shared/seasons.js), only when there are several — the title and the lobby then show the season picker.
   */
  connectInfo() {
    return this.seasons.size > 1 ? { seasons: [...this.seasons] } : null;
  }

  welcomeInfo() {
    // + a running restart countdown (local-restart.js, set by server/index.js)
    return { diyKitted: KITTED_CHARS.filter(isLocalDiyPick), ...this.restartNotice?.welcomeInfo(), ...this.generation?.welcomeInfo(), ...localPatch.welcomeInfo(this) }; // local patch: the picker offers our picks only; feedback
  }

  // ---------------------------------------------------------------------------------------------------
  // Match wiring
  // ---------------------------------------------------------------------------------------------------

  /** @param {Room} room @param {string | null} [key] per-network limit key of the starter */
  startMatch(room, key = null) {
    const host = room.seatOf(room.hostId);
    if (host) host.ready = true;
    const seats = room.seats.filter(Boolean).map((s) => ({
      seat: s.seat, playerId: s.playerId, name: s.name, isBot: s.isBot, connected: s.connected,
      // DESIGN §16: the human's checked operator loadout and (0.2.2) per-operator 潜能 / 练度 (bots fight with the defaults)
      loadout: s.isBot ? null : s.loadout || null,
      ops: s.isBot ? null : s.ops || null,
      // 0.2.0 补位: the chess the human marked as not owned (bots own every operator)
      notOwned: s.isBot ? null : s.notOwned || null,
      // 0.2.0 自选编队: the human's checked DIY picks (bots field no 自选 piece [ASSUMED])
      diy: s.isBot ? null : s.diy || null,
    }));
    // lastPublic / results: the latest m.public broadcast and the m.result frames (encoded), kept for the replay.
    const ctx = { live: true, ended: false, disposed: false, match: null, lastPublic: null, sharedResult: null, results: new Map() };
    let seed = 0;
    try { seed = this.seedFn() >>> 0; } catch { seed = randomInt(2 ** 32); }
    try {
      const match = new this.MatchClass({
        roomCode: room.code,
        mode: room.mode,
        // the room size: 8 = the 8-player mode (config.eightPlayer)
        size: room.size,
        difficulty: room.difficulty,
        modeId: modeIdFor(room.mode, room.difficulty, room.grade),
        // 규칙 모드 (shared/ruleset.js): fixed for the match
        ruleset: room.ruleset,
        // 「AI 队友最后选择」 (GitHub #338): fixed for the match
        aiPicksLast: room.mode !== 'solo' && room.aiPicksLast === true,
        seats,
        // the spectator seats (header): watched like eliminated players, never players
        spectators: room.spectators.map((s) => s.playerId),
        seed,
        // the room's match number: with the seed it keeps battleIds unique across the room's matches (DESIGN §14)
        matchNo: room.matchCount + 1,
        data: this.safeData(room.season),
        // the 卫戍协议 season (shared/seasons.js): its data above, its rule switches
        season: room.season,
        log: this.log,
        now: this.now,
        send: (playerId, msg) => (ctx.live ? this.matchSend(room, ctx, playerId, msg) : false),
        broadcast: (msg) => { if (ctx.live) this.matchBroadcast(room, ctx, msg); },
        onEnd: (summary) => this.onMatchEnd(room, ctx, summary),
        factionOf: (playerId) => localPatch.chatFactionOf(room, playerId), // local patch: the result screen's player colors
      });
      ctx.match = match;
      room.match = match;
      room.matchCtx = ctx;
      room.matchKey = key;
      room.replay = null;
      room.matchCount++;
      this.log.info(`[lobby] ${room.code} match #${room.matchCount} starting (${room.mode}${room.size > MAX_SEATS ? room.size : ''}/${room.difficulty}/${room.ruleset.preset}, ${seats.length} seats, seed ${seed})`);
      this.broadcastState(room);
      localPatch.onMatchCreate(room, match); // local patch: a console room's match is a console match (local-console.js)
      match.start();
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match failed to start`, e);
      if (room.matchCtx === ctx) { room.match = null; room.matchCtx = null; room.matchKey = null; }
      this.disposeMatchCtx(ctx);
      this.broadcastState(room);
      return fail(ERR.INTERNAL, 'match failed to start');
    }
    return OK;
  }

  /**
   * onEnd callback: return the room to LOBBY and dispose the match on the next macrotask. The briefing's vote
   * (Match phases.js maybeEndInfo) ends a match before its first round with reason 'reroll', the in-match 重新开始 vote
   * (Match restart.js) any time after with reason 'restart' — a new match with a new seed starts at once, without
   * room.start's ready check (the vote was the agreement; back to the room only when the restart countdown refuses new
   * matches, or when an 8-seat room is left with fewer than LARGE_MIN_PLAYERS Doctors because someone left the match —
   * Room.seatsOpen, maintainer decision 2026-11-02); neither was settled, so no lastSummary ([stats] line) and no replay (a restarted match is the page's
   * 中途退出 record, public/js/main.js). The chat factions are cleared either way (players pick
   * one after seeing the banned bonds, maintainer 2026-10-09).
   */
  onMatchEnd(room, ctx, summary) {
    if (ctx.ended || !ctx.live || room.matchCtx !== ctx || room.disposed) return;
    ctx.ended = true;
    const vote = summary?.reason === 'reroll' || summary?.reason === 'restart';
    const key = room.matchKey;
    room.lastSummary = vote ? null : summary ?? null;
    room.match = null;
    room.matchCtx = null;
    room.matchKey = null;
    room.replay = vote ? null : this.buildReplay(room, ctx);
    setImmediate(() => this.disposeMatchCtx(ctx));
    this.log.info(`[lobby] ${room.code} match #${room.matchCount} ended${summary?.reason === 'restart' ? ` (restart vote, round ${summary.round})` : ''}`);
    localPatch.onMatchEnd(this, room); // local patch: chat factions last one match
    // back outside a match: the matchmaking counts they missed while playing (matchmaking.js header)
    if (!vote) for (const s of room.activeHumans()) this.sendQueueCounts(this.registry.byId(s.playerId));
    this.generation?.onMatchEnd(room); // a draining server keeps this room for its settlement screen
    for (let i = 0; i < room.seats.length; i++) {
      const s = room.seats[i];
      if (!s || s.isBot) continue;
      if (s.left) { room.seats[i] = null; continue; }
      s.ready = false;
      if (!s.connected) this.startGrace(room, s);
    }
    for (const s of room.spectators) if (!s.connected) this.startGrace(room, s);
    // A seat that dropped during the match never got its m.result (sendSession drops frames of a disconnected session),
    // and the room's replay dies with the room: when no connected human is left it is disposed right below (reason
    // 'empty', no room.closed notice), so the returning client got nothing and sat on the paused board. Keep the frames
    // on the session itself; onHello hands them over whether the room still exists or not (← upstream PR #912).
    for (const s of room.seats) {
      if (!s || s.isBot || s.left || s.connected) continue;
      const session = this.registry.byId(s.playerId);
      const frames = session ? this.replayFor(room, s.playerId) : null;
      if (frames && frames.length) session.pendingResult = frames;
    }
    const host = room.hostId ? room.seatOf(room.hostId) : null;
    if (!host || host.isBot || host.left) this.migrateHost(room);
    if (room.activeHumans().length === 0) {
      this.disposeRoom(room, 'empty');
      return;
    }
    // after the departed seats went, before the new match of a vote counts them (header)
    this.fillReservedSeats(room);
    if (vote && room.seatsOpen()) {
      this.log.info(`[lobby] ${room.code} back to the room: ${room.activeHumans().length}/${LARGE_MIN_PLAYERS}+ Doctors for an 8-seat match`);
      this.broadcastState(room);
    } else if (vote && !this.restartNotice?.startRefusal()) {
      // the old match goes now: the new one may reuse nothing of it (startMatch broadcasts the room.state)
      this.disposeMatchCtx(ctx);
      this.startMatch(room, key);
    } else this.broadcastState(room);
  }

  /** Match unicast; m.result frames are also kept for the replay. */
  matchSend(room, ctx, playerId, msg) {
    if (msg && msg.t === 'm.result') {
      const data = encode(msg);
      if (data != null) ctx.results.set(playerId, data);
    }
    return this.sendToPlayer(room, playerId, msg);
  }

  /** Match broadcast; the latest m.public and a broadcast m.result are also kept for the replay. */
  matchBroadcast(room, ctx, msg) {
    const data = this.broadcastRoom(room, msg);
    if (data == null) return;
    if (msg.t === 'm.public') ctx.lastPublic = data;
    else if (msg.t === 'm.result') ctx.sharedResult = data;
  }

  /**
   * Replay record for the humans still seated when a match ends (null when the match produced no m.result,
   * e.g. it was abandoned: those clients then see "simulation closed").
   * @param {Room} room @returns {Room['replay']}
   */
  buildReplay(room, ctx) {
    const frames = new Map();
    for (const s of [...room.seats, ...room.spectators]) {
      if (!s || s.isBot || s.left) continue;
      const frame = ctx.results.get(s.playerId) || ctx.sharedResult;
      if (frame) frames.set(s.playerId, frame);
    }
    if (frames.size === 0) return null;
    return { publicFrame: ctx.lastPublic, frames, pending: new Set(frames.keys()) };
  }

  /** The replay frames still owed to a player (null when they moved on). @returns {string[] | null} */
  replayFor(room, playerId) {
    const r = room.replay;
    if (!r || !r.pending.has(playerId)) return null;
    return [r.publicFrame, r.frames.get(playerId)].filter(Boolean);
  }

  /** The player moved on from the result screen (acted in the room, left): stop replaying it. */
  dropReplay(room, playerId) {
    const r = room.replay;
    if (!r || !r.pending.delete(playerId)) return;
    r.frames.delete(playerId);
    if (r.pending.size === 0) room.replay = null;
  }

  /**
   * The heavy part of a resync — full match state (match.onReconnect) or, back in LOBBY, the result replay.
   * Immediate after a (re)connect; for repeated hellos on a live socket at most once per resyncMinGapMs
   * (requests inside the window coalesce into one deferred resync).
   * @param {import('./net.js').Session} session @param {boolean} coalesce
   */
  resync(session, coalesce) {
    const pid = session.playerId;
    if (coalesce) {
      if (this.resyncTimers.has(pid)) return; // the scheduled resync answers this request too
      const wait = (Number.isFinite(session.resyncAt) ? session.resyncAt : -Infinity) + this.opts.resyncMinGapMs - this.now();
      if (wait > 0) {
        const t = setTimeout(() => { this.resyncTimers.delete(pid); this.runResync(session); }, wait);
        t.unref?.();
        this.resyncTimers.set(pid, t);
        return;
      }
    } else {
      this.clearResync(pid);
    }
    this.runResync(session);
  }

  /** @param {import('./net.js').Session} session */
  runResync(session) {
    if (!session.connected || this.registry.byId(session.playerId) !== session) return;
    const room = this.roomOf(session);
    if (!room) return;
    session.resyncAt = this.now();
    localPatch.onJoin(this, room, session); // local patch
    if (room.match) {
      this.callMatch(room, room.spectatorOf(session.playerId) ? 'addSpectator' : 'onReconnect', session.playerId);
      return;
    }
    const frames = this.replayFor(room, session.playerId);
    if (frames) for (const frame of frames) sendRaw(session.ws, frame);
  }

  clearResync(playerId) {
    const t = this.resyncTimers.get(playerId);
    if (t) { clearTimeout(t); this.resyncTimers.delete(playerId); }
  }

  /** Log a per-network limit refusal without letting a refusal loop flood the log. */
  limitWarn(text) {
    const now = this.now();
    if (now - this.limitLog.at < 10_000) { this.limitLog.suppressed++; return; }
    const more = this.limitLog.suppressed ? ` (+${this.limitLog.suppressed} similar refusals)` : '';
    this.limitLog.at = now;
    this.limitLog.suppressed = 0;
    this.log.warn(`[lobby] ${text}${more}`);
  }

  /** One seat-log line (header 「Seat log」). @param {Room} room @param {import('./net.js').Session} session @param {string} event */
  seatLog(room, session, event) {
    const m = room.match;
    const at = m ? ` (R${m.round ?? 0} ${m.phase ?? '?'})` : '';
    this.log.info(`[lobby] ${room.code} ${session.name} (${session.playerId}) ${event}${at}`);
  }

  /** Number of rooms matching a predicate. */
  countRooms(pred) {
    let n = 0;
    for (const r of this.rooms.values()) if (pred(r)) n++;
    return n;
  }

  /** Route a 'g.*' intent to the running match. */
  routeGame(session, msg) {
    const room = this.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (!room.match) return fail(ERR.WRONG_PHASE, 'no running match');
    if (msg.t === 'g.leave') {
      this.seatLog(room, session, 'left the match');
      this.removeMember(room, session.playerId);
      return OK;
    }
    // a spectator only watches (header): nothing else of it ever reaches the match
    if (msg.t !== 'g.watch' && room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    let res;
    try {
      res = room.match.handle(session.playerId, msg);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) threw`, e);
      return fail(ERR.INTERNAL);
    }
    if (res && typeof res.then === 'function') {
      // Contract violation (handle must be synchronous): never let the rejection go unhandled.
      this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) returned a Promise; it must be synchronous`);
      Promise.resolve(res).catch((e) => this.log.error(`[lobby] ${room.code} match.handle(${msg.t}) rejected`, e));
      return OK;
    }
    if (res && typeof res === 'object' && res.error) {
      return fail(isErrCode(res.error) ? res.error : ERR.INTERNAL, typeof res.detail === 'string' ? res.detail : undefined);
    }
    return OK;
  }

  /** Call an optional match hook without letting it throw. onLeave falls back to onDisconnect. */
  callMatch(room, method, ...args) {
    const m = room.match;
    if (!m) return undefined;
    let fn = m[method];
    if (typeof fn !== 'function' && method === 'onLeave') fn = m.onDisconnect;
    if (typeof fn !== 'function') return undefined;
    try {
      return fn.apply(m, args);
    } catch (e) {
      this.log.error(`[lobby] ${room.code} match.${method} threw`, e);
      return undefined;
    }
  }

  disposeMatchCtx(ctx) {
    if (ctx.disposed) return;
    ctx.disposed = true;
    ctx.live = false;
    try { ctx.match?.dispose?.(); } catch (e) { this.log.error('[lobby] match.dispose threw', e); }
  }

  /** The game data (of a season other than the default: that season's, shared/seasons.js), never throwing. */
  safeData(season = DEFAULT_SEASON) {
    try { return season === DEFAULT_SEASON ? this.getData() : this.getData({ season }); } catch (e) { this.log.error('[lobby] getData failed', e); return Object.freeze({}); }
  }

  /** How long a dropped solo run stays resumable (ms): the option, else data singleReconnectTime, else 24 h. */
  soloResumeWindowMs() {
    const o = this.opts.soloReconnectWindowMs;
    if (typeof o === 'number' && Number.isFinite(o) && o > 0) return o;
    const sec = this.safeData()?.config?.constants?.singleReconnectTime;
    return (typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec : SOLO_RECONNECT_FALLBACK_SEC) * 1000;
  }

  // ---------------------------------------------------------------------------------------------------
  // Membership helpers
  // ---------------------------------------------------------------------------------------------------

  /** The session's current room (self-heals stale `roomCode`). @returns {Room | null} */
  roomOf(session) {
    if (!session.roomCode) return null;
    const room = this.rooms.get(session.roomCode);
    const seat = room ? room.seatOf(session.playerId) : null;
    if (room && !seat && room.spectatorOf(session.playerId)) return room; // a spectator seat
    if (!room || !seat || seat.left || seat.isBot) { session.roomCode = null; return null; }
    return room;
  }

  /** A playerId for a new AI seat of the room. */
  newBotId(room) {
    let playerId;
    do playerId = 'ai_' + randomBytes(4).toString('hex'); while (room.seatOf(playerId));
    return playerId;
  }

  /** A human's seat with the session's settings of the room's season (header). @returns {Seat} */
  humanSeat(idx, session, season = DEFAULT_SEASON) {
    const kept = season === DEFAULT_SEASON ? session : session.seasonal?.[season] || {};
    return {
      seat: idx, playerId: session.playerId, name: session.name, isBot: false, ready: false, connected: session.connected, left: false,
      loadout: kept.loadout || null,
      ops: kept.ops || null,
      notOwned: kept.notOwned || null,
      diy: kept.diy || null,
      // 名片干员 (room.card, header): the session's card when the room's season has that operator
      card: session.card && cardCharIds(this.safeData(season)).has(session.card) ? session.card : null,
    };
  }

  /**
   * Remove a human from a room permanently (leave, grace timeout, expiry, switching rooms).
   * In LOBBY the seat is freed; during a match it is marked departed and match.onLeave is called.
   * @param {Room} room @param {string} playerId
   */
  removeMember(room, playerId) {
    const session = this.registry.byId(playerId);
    if (session && session.roomCode === room.code) session.roomCode = null;
    this.clearGrace(playerId);
    this.dropReplay(room, playerId);
    if (this.freeSpectatorSeat(room, playerId)) return;
    const seat = room.seatOf(playerId);
    if (!seat || seat.isBot || seat.left || room.disposed) return;
    if (room.match) {
      seat.left = true;
      seat.connected = false;
      seat.ready = false;
      this.callMatch(room, 'onLeave', playerId);
    } else {
      room.seats[seat.seat] = null;
      this.queue.onRoomChange(room, playerId, seat.name); // a queued room lost a human: its 랜덤 매칭 entry is cancelled
    }
    if (room.disposed) return; // onLeave may have ended the match and emptied the room
    if (room.hostId === playerId) this.migrateHost(room);
    if (room.activeHumans().length === 0) this.disposeRoom(room, 'empty');
    else {
      this.fillReservedSeats(room); // no-op during a match: the seat stays the departed player's until it ends
      this.broadcastState(room);
    }
  }

  /**
   * Free a spectator seat (removeMember): the match forgets the spectator; never a host change or a disposal — a
   * spectator neither holds the host nor keeps a room alive. @returns {boolean} true when it was a spectator seat
   */
  freeSpectatorSeat(room, playerId) {
    const i = room.spectators.findIndex((s) => s.playerId === playerId);
    if (i < 0) return false;
    room.spectators.splice(i, 1);
    if (room.disposed) return true;
    this.callMatch(room, 'removeSpectator', playerId);
    this.broadcastState(room);
    return true;
  }

  /** Lowest-seat connected human becomes host (else lowest-seat human, else null). */
  migrateHost(room) {
    const humans = room.activeHumans();
    const pick = humans.find((s) => s.connected) || humans[0] || null;
    const prev = room.hostId;
    room.hostId = pick ? pick.playerId : null;
    if (pick && prev !== pick.playerId) this.log.info(`[lobby] ${room.code} host → ${pick.name}`);
  }

  startGrace(room, seat, ms = this.opts.lobbyGraceMs) {
    const playerId = seat.playerId;
    this.clearGrace(playerId);
    const t = setTimeout(() => {
      this.graceTimers.delete(playerId);
      if (room.disposed || room.match) return;
      const s = room.seatOf(playerId) || room.spectatorOf(playerId);
      if (!s || s.connected) return;
      const session = this.registry.byId(playerId);
      if (session && session.roomCode === room.code) {
        session.notice = 'timeout';
        session.pendingResult = this.replayFor(room, playerId); // still shown after room.closed on resume
      }
      this.removeMember(room, playerId);
    }, ms);
    t.unref?.();
    this.graceTimers.set(playerId, t);
  }

  clearGrace(playerId) {
    const t = this.graceTimers.get(playerId);
    if (t) { clearTimeout(t); this.graceTimers.delete(playerId); }
  }

  /**
   * Delete a room, detach its members (room.closed unless the room simply emptied) and dispose its match.
   * @param {Room} room @param {string} reason @param {object | null} [info] extra fields of the room.closed frame
   */
  disposeRoom(room, reason, info = null) {
    if (room.disposed) return;
    room.disposed = true;
    this.queue.onRoomChange(room, null);
    if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    const ctx = room.matchCtx;
    room.match = null;
    room.matchCtx = null;
    room.matchKey = null;
    room.replay = null;
    for (const s of room.seats) {
      if (!s || s.isBot) continue;
      this.clearGrace(s.playerId);
      const session = this.registry.byId(s.playerId);
      if (!session || session.roomCode !== room.code) continue;
      session.roomCode = null;
      if (s.left || reason === 'empty') continue;
      if (session.connected) sendSession(session, { t: 'room.closed', reason, ...info });
      else { session.notice = reason; session.noticeInfo = info ? { ...info, for: reason } : null; }
    }
    // spectators did not leave: they are told whatever closed the room (its last human leaving included)
    for (const s of room.spectators) {
      this.clearGrace(s.playerId);
      const session = this.registry.byId(s.playerId);
      if (!session || session.roomCode !== room.code) continue;
      session.roomCode = null;
      if (session.connected) sendSession(session, { t: 'room.closed', reason, ...info });
      else { session.notice = reason; session.noticeInfo = info ? { ...info, for: reason } : null; }
    }
    if (ctx) this.disposeMatchCtx(ctx);
    this.log.info(`[lobby] ${room.code} disposed (${reason})`);
  }

  // ---------------------------------------------------------------------------------------------------
  // Deploy handoff (header; server/local-generation.js)
  // ---------------------------------------------------------------------------------------------------

  /** A token net.js does not know: a session the deploy's previous server handed over with its room, or null. */
  adoptSession(token) { return this.generation?.adopt(token) ?? null; }

  /** A waiting room as the new server rebuilds it (adoptRoom). Departed seats and humans without a session are left out. */
  roomSnapshot(room) {
    const person = (s) => {
      const session = this.registry.byId(s.playerId);
      return session && session.roomCode === room.code ? { playerId: s.playerId, name: s.name, token: session.token } : null;
    };
    return {
      code: room.code, mode: room.mode, size: room.size, difficulty: room.difficulty, ruleset: rulesetWire(room.ruleset), aiPicksLast: room.aiPicksLast,
      ...(room.season !== DEFAULT_SEASON ? { season: room.season } : {}),
      ...(room.grade !== null ? { grade: room.grade } : {}),
      ...(room.console ? { console: true } : {}), // local patch: 콘솔 모드
      hostId: room.hostId,
      spectatorSeats: room.spectatorSeats,
      seats: room.seats.map((s) => {
        if (!s || s.left) return null;
        if (s.isBot) return { seat: s.seat, playerId: s.playerId, name: s.name, isBot: true };
        const p = person(s);
        return p ? { seat: s.seat, isBot: false, ...p } : null;
      }),
      spectators: room.spectators.map((s) => {
        const p = person(s);
        return p && s.reservedSeq ? { ...p, reservedSeq: s.reservedSeq } : p;
      }).filter(Boolean),
    };
  }

  /**
   * Rebuild a handed-over waiting room (roomSnapshot of the previous server): its humans get sessions with their own
   * tokens, disconnected, and keep their seats for `graceMs` (the lobby grace) — their pages resume them on hello.
   * @param {any} snap @param {number} [graceMs] @returns {Room | null} null when nothing could be taken
   */
  adoptRoom(snap, graceMs = this.opts.lobbyGraceMs) {
    const mode = snap?.mode === 'solo' ? 'solo' : snap?.mode === 'coop' ? 'coop' : null;
    if (!mode || !DIFFICULTIES.includes(snap.difficulty) || !Array.isArray(snap.seats)) return null;
    if (this.rooms.size >= this.opts.maxRooms) return null;
    const asked = typeof snap.code === 'string' ? snap.code.toUpperCase() : '';
    const code = asked.length === ROOM_CODE_LEN && [...asked].every((c) => CODE_ALPHABET.includes(c)) && !this.rooms.has(asked) ? asked : this.genCode();
    if (!code) return null;
    const now = this.now();
    const room = new Room(code, mode, snap.difficulty, now, snap.size);
    room.ruleset = resolveRuleset(snap.ruleset);
    room.aiPicksLast = mode === 'coop' && snap.aiPicksLast === true;
    room.console = mode === 'solo' && snap.console === true; // local patch: 콘솔 모드
    if (SPECTATOR_SEATS.includes(snap.spectatorSeats)) room.spectatorSeats = snap.spectatorSeats;
    // a season this server does not offer: the room goes on in the default one
    room.season = this.seasons.has(seasonOf(snap.season)) ? seasonOf(snap.season) : DEFAULT_SEASON;
    if (mode === 'solo' && seasonFeature(room.season, 'soloGrades')) {
      room.grade = isGrade(snap.grade) ? snap.grade : firstGrade(snap.difficulty);
      room.difficulty = gradeDifficulty(room.grade);
    }
    const ids = new Map(); // the previous server's playerId → this one's
    const take = (p) => {
      const session = this.registry.adopt(p);
      if (!session) return null;
      session.roomCode = code;
      ids.set(p.playerId, session.playerId);
      return session;
    };
    for (const s of snap.seats) {
      if (!s || !Number.isInteger(s.seat) || s.seat < 0 || s.seat >= room.size || room.seats[s.seat]) continue;
      if (s.isBot) {
        if (mode === 'coop' && room.size === MAX_SEATS && typeof s.playerId === 'string' && typeof s.name === 'string') {
          room.seats[s.seat] = { seat: s.seat, playerId: s.playerId, name: s.name, isBot: true, ready: true, connected: true, left: false };
        }
        continue;
      }
      if (mode === 'solo' && room.activeHumans().length) continue;
      const session = take(s);
      if (session) room.seats[s.seat] = { ...this.humanSeat(s.seat, session, room.season), awayAt: now };
    }
    if (!room.activeHumans().length) return null;
    for (const p of Array.isArray(snap.spectators) ? snap.spectators : []) {
      if (mode !== 'coop' || room.spectators.length >= room.spectatorSeats) break;
      const session = p && take(p);
      if (!session) continue;
      const reservedSeq = Number.isInteger(p.reservedSeq) && p.reservedSeq > 0 ? p.reservedSeq : 0;
      room.spectators.push({ playerId: session.playerId, name: session.name, connected: false, awayAt: now, ...(reservedSeq ? { reservedSeq } : {}) });
      room.reserveSeq = Math.max(room.reserveSeq, reservedSeq);
    }
    room.hostId = ids.get(snap.hostId) ?? null;
    if (!room.hostId || !room.seatOf(room.hostId)) this.migrateHost(room);
    this.rooms.set(code, room);
    for (const s of [...room.seats, ...room.spectators]) if (s && !s.isBot) this.startGrace(room, s, graceMs);
    this.log.info(`[lobby] ${code} adopted (${mode}/${room.difficulty}/${room.ruleset.preset}, ${room.activeHumans().length} human(s))`);
    return room;
  }

  genCode() {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LEN; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------------------------------

  /** Connected, non-departed human sessions of a room — its spectators included (room.state, match broadcasts). */
  *memberSessions(room) {
    for (const s of [...room.seats, ...room.spectators]) {
      if (!s || s.isBot || s.left) continue;
      const session = this.registry.byId(s.playerId);
      if (session && session.connected && session.roomCode === room.code) yield session;
    }
  }

  broadcastState(room) {
    if (room.disposed) return;
    const data = encode(room.toState());
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data);
  }

  sendState(room, session) {
    sendSession(session, room.toState());
  }

  /** Match broadcast: encode once, send to every connected member. @returns {string | null} the encoded frame */
  broadcastRoom(room, msg) {
    if (room.disposed) return null;
    const data = encode(msg);
    if (data == null) { this.log.error(`[lobby] ${room.code} unserializable broadcast ${msg && msg.t}`); return null; }
    const droppable = isDroppable(msg);
    for (const session of this.memberSessions(room)) sendRaw(session.ws, data, { droppable });
    return data;
  }

  /** Match unicast. @returns {boolean} */
  sendToPlayer(room, playerId, msg) {
    if (room.disposed) return false;
    const seat = room.seatOf(playerId) || room.spectatorOf(playerId);
    if (!seat || seat.isBot || seat.left) return false;
    const session = this.registry.byId(playerId);
    if (!session || session.roomCode !== room.code) return false;
    return sendSession(session, msg);
  }
}

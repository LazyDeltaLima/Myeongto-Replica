// server/matchmaking.js — 랜덤 매칭: a per-difficulty queue of co-op players that the lobby turns into a full room and a
// match, or seats in a public room (공개방) that fits them (a remake feature; the upstream design left a matchmaking queue
// out of scope, docs/design/overview.md). The lobby (server/lobby.js) owns one Matchmaker and routes room.queue /
// room.unqueue / room.queueAccept / room.queueVote to it, plus its session and room events (disconnect, resume, expiry,
// a public room that changed, a player seated in a room, shutdown).
//
// Rules (maintainer decisions 2026-10-13):
//   * One queue per difficulty and 규칙 모드 (shared/ruleset.js rulesetKey; maintainer decision 2026-10-15: the players of
//     a match share the room's rules), co-op only, classic and casual (QUEUE_PRESETS). Its entries are single players
//     (maintainer decision 2026-11-20: the rooms' 빈자리 매칭, room.queueRoom, is gone — a room that wants Doctors is
//     made public instead, see 공개방 below):
//     - room.queue { difficulty, ruleset? } queues the player alone (ruleset absent = the default, classic; switching
//       either moves the entry to the back of the other queue); a player in a LOBBY room leaves the room (like
//       room.create), one whose room is in a match is refused (ROOM_STARTED).
//     room.unqueue leaves the queue (reason 'left'). Every waiting player gets room.queueState whenever its queue
//     changes (`count` = the humans waiting in that queue, `ruleset` = its preset).
//   * Waiting counts in the lobby (maintainer decision 2026-10-15): lobby.queueCounts { counts: { [ruleset]:
//     { [difficulty]: humans } } } (every preset and difficulty, zeros included; waiting entries only, not a group being
//     confirmed) goes to every connected Doctor outside a running match — at most once per `countsMinGapMs` (1 s) and
//     only when the counts changed — and to each one on hello (Lobby.sendQueueCounts).
//   * A group is always four humans (maintainer decision 2026-10-13: no AI fill, no smaller group). Formation walks the
//     queue in order and takes the first entries whose humans add up to exactly four, preferring the oldest entries
//     (an entry that does not fit is skipped, not dropped). An entry with an offline human is skipped.
//   * A formed group is confirmed: every human gets room.matchFound and answers room.queueAccept { accept } within
//     `queueConfirmMs` (15 s). All accepted → the match starts at once (no ready check: the confirmation was it) in a
//     new co-op room of the queue's difficulty and ruleset, seated in queue order (the first is the host).
//     A human who declines, or has not answered when the time runs out, takes their entry out of the queue; the other
//     entries go back to the front of their queue, in their old order, keeping their waiting time.
//   * A waiting single player whose socket closes is skipped by group formation and leaves the queue after
//     `queueGraceMs` (10 s; a phone switching apps keeps its place); a resume within that time resends the queue state
//     (or the pending room.matchFound). The reconnect window expiring removes the entry at once. A player who takes a
//     seat in a room some other way (the public room list, an invitation link, a key, a room of their own) leaves the
//     queue then (reason 'room'; Lobby.join / Lobby.create / Lobby.spectate → onSeated; an answer pending for a group is a decline).
//   * Limits: at most `maxQueuedPerAddr` waiting single players from one client network (internet clients only, net.js
//     clientAddress; twice that to join an 8-player queue, so a whole 8-seat group can come from one network — the
//     count is over every queue; room.queue → ERR.RATE); no queue entry, no public room offer and no match start
//     during the deploy countdown's last minutes (server/local-restart.js startRefusal → ERR.RESTARTING; a group that
//     completes then is dissolved with reason 'restarting').
//   * The queue lives in memory: a server restart forgets it (the client's queue screen closes on the new `welcome`).
//   * The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19) has queues of its own: room.queue { size: 8 }
//     waits for a group of exactly eight humans (no AI fill, like the four), matched into
//     an 8-seat room; every message about such a queue carries `size: 8`, and lobby.queueCounts its `counts8` beside
//     `counts` (the 4-player queues, unchanged).
//   * 「바로 시작」 vote of an 8-player queue (maintainer decision 2026-11-02): while LARGE_MIN_PLAYERS (5) or more online
//     humans wait in it, any of them may propose starting now (room.queueVote). Every waiting entry of the queue joins the
//     vote — a group with `vote` — and its humans get room.matchFound { vote: true, need, declined, no, by } and answer
//     room.queueAccept { accept } within `queueVoteMs` (15 s; the proposer has voted yes). When every human has answered
//     or the time runs out: the entries whose humans all voted yes start together, the way a group of eight does
//     (launch), if they are LARGE_MIN_PLAYERS or more; every other entry goes back to the front of the queue in its old
//     order and keeps waiting for eight (room.queueState `vote: 'started'`, `started` = the humans who went). Fewer yes:
//     everyone goes back (`vote: 'failed'`) and the queue takes no new proposal for `queueVoteCooldownMs` (30 s; RATE).
//     A no or a silence never takes anybody out of the queue; leaving it (room.unqueue, a seat taken in a room, the
//     reconnect window expiring) takes that entry out and the vote goes on without it. Entries joining meanwhile, and a
//     player answering a public room's offer, wait outside the vote. A 4-player queue has no vote (BAD_TARGET), and
//     neither has a group of eight being confirmed.
//   * Every 卫戍协议 season (shared/seasons.js) has queues of its own (maintainer decision 2026-11-01): room.queue
//     { season } (absent = the default season; one the server does not offer → BAD_MSG), matched into a room of that
//     season (or offered a public room of it). A message about a queue of another season than the default
//     carries its `season`; lobby.queueCounts keeps `counts` / `counts8` for the default season and adds
//     `seasons: { [id]: { counts, counts8 } }` for the other offered ones (absent while only the default is offered).
//   * 快速匹配 (maintainer decisions 2026-11-07): room.queue { difficulty, quick: true, season? } queues a single player
//     for any ruleset and room size of that difficulty and season (its "pool"). The quick players wait in a queue of
//     their own; when any queue of the pool changes, formation first walks the pool's regular queues (classic / casual
//     × 4 / 8 seats, the queue with the longest-waiting entry first) and completes the first one it can with the fewest
//     quick players (as many of the queue's own humans as fit, then the oldest quick players; an 8-player queue
//     included); only then do four quick players alone form a group of their own, a classic 4-seat
//     room. A group's ruleset and size are its regular queue's, and its members are seated regular first, quick after
//     (the host of a new room is a regular player). A quick player never joins a 「바로 시작」 vote (an 8-player queue
//     starts with quick players only at eight). Messages about a quick entry carry `quick: true` and no ruleset or
//     size; its room.queueState `count` is every human waiting in the pool; room.matchFound names the group's ruleset
//     and size (with `quick: true` for the quick members); lobby.queueCounts adds `quick: { [difficulty]: humans }`
//     (the quick queues alone; seasons[id].quick for another season). Network limit: `maxQueuedPerAddr`, the 4-seat one.
//   * 공개방 (maintainer decisions 2026-11-20; server/lobby.js 「공개방」 has the room side): a public co-op room is a
//     candidate for the waiting players of its difficulty and season — in LOBBY, its host connected, a free seat or an
//     AI seat (a Doctor who comes in takes the last AI added's seat) not held by another offer, the player not kicked
//     from it in the last 10 minutes (Lobby.kickedFrom) and not having declined it in the last `publicSkipMs` (5 min).
//     A regular player needs the room's preset and size too; a quick player only the difficulty, so a custom public
//     room is the quick players' alone (its settings, `custom`, ride on the offer).
//     Order (the same decisions): a group the queue's humans complete at once comes first (formation above, as before);
//     then every waiting player left, the longest-waiting first, is offered the candidate with the most humans (the
//     earliest `publicSince` on a tie). Walked again whenever a queue of the pool changes (tryPool) and whenever a
//     public room changes (Lobby.broadcastState / disposeRoom → onRoom: made public, its settings, a seat freed, its
//     host back, its match over).
//     An offer goes to that player alone: room.matchFound with `room` { code, host: { name, no }, ruleset, custom?,
//     size, seats } (Lobby.roomCard; `players` 1) answered with room.queueAccept within `queueConfirmMs`. It holds one
//     of the room's seats for matchmaking only (the list's join is never refused for it). Accepted → Lobby.join, the
//     player leaves the queue without a notice and takes the seat; the room full or started meanwhile → that refusal
//     is the answer's error, the player keeps waiting and the queue is walked again (no skip). Declined or silent →
//     the player keeps waiting and that room is skipped for `publicSkipMs` (unlike a group, where a decline leaves the
//     queue). An offer whose room stops fitting (made private, its settings, its match, its disposal) is withdrawn:
//     room.queueState queued:true again. The room's host starts the match as usual (the room's auto start aside).
//     lobby.queueCounts adds `rooms: { [season]: n }`, the public rooms in LOBBY of every offered season (the hub's
//     「공개방 N」).
//     Every season's public rooms (maintainer decisions 2026-11-20, the list's season drop-down): room.queue
//     { anySeason: true } makes the public rooms of the difficulty in every offered season the player's candidates;
//     the player still waits in (and groups with) the queue of its `season`. Queued again into the same queue, the
//     entry keeps its place and takes the new `anySeason`. A room of another season seats the player in that season
//     (the client switches its season as an invitation does). The entry's room.queueState says `anySeason: true`, so
//     the client's waiting and confirmation name the target.

import { ERR, LARGE_MIN_PLAYERS, LARGE_SEATS, MAX_SEATS, DIFFICULTIES, seatsOf } from '../shared/constants.js';
import { QUEUE_PRESETS, resolveRuleset, rulesetKey } from '../shared/ruleset.js';
import { sendSession } from './net.js';
import { DEFAULT_SEASON } from '../shared/seasons.js';
import { roomEntry } from './local-patch.js';

export const QUEUE_DEFAULTS = Object.freeze({
  queueConfirmMs: 15_000,  // a formed group's room.queueAccept window
  queueGraceMs: 10_000,    // a disconnected waiting single player keeps the place this long
  maxQueuedPerAddr: 4,     // waiting single players from one client network (0 = unlimited)
  countsMinGapMs: 1_000,   // lobby.queueCounts at most this often (header)
  queueVoteMs: 15_000,     // a 「바로 시작」 vote's room.queueAccept window (header)
  queueVoteCooldownMs: 30_000, // a queue takes no new proposal this long after a failed vote
  publicSkipMs: 300_000,   // a public room a player declined (or let run out) is not offered to them again this long (header)
});

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

/**
 * @typedef {{ key: string, playerId: string, difficulty: string,
 *   ruleset: string | null, cap: number, season: string, quick: boolean, pool: string, qk: string, joinedAt: number,
 *   limitKey: string | null, group: Group | null, offer: Offer | null, accepting?: boolean, offline: NodeJS.Timeout | null,
 *   anySeason: boolean }} Entry
 *   a single player; key = the playerId; qk = its queue;
 *   cap = the room size it waits for (4, or 8 for the 8-player mode; 0 for a quick player); season = its 卫戍协议 season;
 *   quick = a 快速匹配 player (ruleset null); pool = its difficulty and season (header); offer = a public room offered
 *   to it (header 「공개방」), `accepting` while Lobby.join seats it there; anySeason = the public rooms of every season
 *   are its candidates (header 「공개방」)
 * @typedef {{ room: import('./lobby.js').Room, deadline: number, timer: NodeJS.Timeout | null }} Offer
 * @typedef {{ id: number, difficulty: string, ruleset: string, cap: number, season: string, pool: string, qk: string, members: Entry[], ids: string[],
 *   accepted: Set<string>, deadline: number, timer: NodeJS.Timeout | null,
 *   vote: { by: string | null, declined: Set<string> } | null }} Group
 *   vote: a 「바로 시작」 vote (header; `by` = the proposer's name, `declined` = who voted no), null for a group of four / eight;
 *   ruleset / cap / qk = the regular queue it completes (a group of quick players alone: classic, 4, their queue)
 */

/** A queue's key: its difficulty, ruleset key (shared/ruleset.js rulesetKey), room size (the 8-player queues) and season. */
const queueKey = (difficulty, ruleset, cap = MAX_SEATS, season = DEFAULT_SEASON) =>
  `${difficulty}|${ruleset}${cap > MAX_SEATS ? `|${cap}` : ''}${season !== DEFAULT_SEASON ? `|${season}` : ''}`;
/** The `size` and `season` fields of a queue message: only for the 8-player queues / another season (header). */
const sizeOf = (entry) => ({ ...(entry.cap > MAX_SEATS ? { size: entry.cap } : {}), ...(entry.season !== DEFAULT_SEASON ? { season: entry.season } : {}) });
/** A 快速匹配 pool (header): every queue of one difficulty and season. */
const poolKey = (difficulty, season = DEFAULT_SEASON) => `${difficulty}${season !== DEFAULT_SEASON ? `|${season}` : ''}`;
/** The quick players' queue of a pool. */
const quickOf = (pool) => `quick|${pool}`;
/** A group of quick players alone plays the classic 4-seat rules (maintainer decision 2026-11-07). */
const QUICK_RULESET = 'classic';
/** The queue fields of a message about an entry: its ruleset and size, or `quick` (header). */
const tagOf = (entry) => (entry.quick
  ? { quick: true, ...(entry.season !== DEFAULT_SEASON ? { season: entry.season } : {}) }
  : { ruleset: entry.ruleset, ...sizeOf(entry) });

export class Matchmaker {
  /**
   * @param {import('./lobby.js').Lobby} lobby
   * @param {{ Room: typeof import('./lobby.js').Room, options?: Partial<Record<keyof typeof QUEUE_DEFAULTS, number>> & Record<string, unknown> }} deps
   *   `options`: the lobby's options (the queue's keys of them are read)
   */
  constructor(lobby, { Room, options = {} }) {
    this.lobby = lobby;
    this.Room = Room;
    this.opts = { ...QUEUE_DEFAULTS, ...options };
    /** @type {Map<string, Entry[]>} waiting entries by queue key (difficulty|ruleset), in queue order */
    this.queues = new Map();
    /** @type {Map<string, Entry>} every entry (waiting or in a group) by key */
    this.entries = new Map();
    /** @type {Map<string, Set<string>>} pool → the keys of its queues (header: 快速匹配) */
    this.pools = new Map();
    /** @type {Map<string, string>} queue key → its pool */
    this.qkPool = new Map();
    this.groupSeq = 0;
    /** lobby.queueCounts pacing (header): the last counts sent (JSON), when, and the pending send */
    this.countsSent = null;
    this.countsAt = -Infinity;
    /** @type {NodeJS.Timeout | null} */
    this.countsTimer = null;
    /** @type {Map<string, number>} queue key → when it takes a 「바로 시작」 proposal again (after a failed vote) */
    this.voteCooldown = new Map();
    /** @type {Map<import('./lobby.js').Room, Set<Entry>>} the public rooms' pending offers (header 「공개방」) */
    this.offers = new Map();
    /** @type {Map<string, Map<string, number>>} playerId → room code → until when that room is skipped (a declined offer) */
    this.skips = new Map();
    /** @type {Set<NodeJS.Timeout>} the walks due when a skip runs out */
    this.skipTimers = new Set();
  }

  /** Counters for /healthz-style status: humans waiting / confirming (a group's, or a public room's offer). */
  stats() {
    let waiting = 0;
    let confirming = 0;
    for (const e of this.entries.values()) {
      if (e.group || e.offer) confirming += this.size(e); else waiting += this.size(e);
    }
    return { waiting, confirming };
  }

  // ---------------------------------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------------------------------

  /**
   * room.queue { difficulty, ruleset?, size?, quick?, season?, anySeason? } — a single player (quick: any ruleset and
   * size; anySeason: every season's public rooms, header).
   */
  queue(session, { difficulty, ruleset: preset, size, quick = false, season = DEFAULT_SEASON, anySeason = false }) {
    const lobby = this.lobby;
    if (!lobby.seasons.has(season)) return fail(ERR.BAD_MSG, 'season not offered');
    const ruleset = quick ? null : rulesetKey(preset);
    const cap = quick ? 0 : seatsOf(size);
    const pool = poolKey(difficulty, season);
    const qk = quick ? quickOf(pool) : queueKey(difficulty, ruleset, cap, season);
    const cur = lobby.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    const had = this.entries.get(session.playerId);
    if (had?.group || had?.offer) return fail(ERR.ALREADY, 'a match was found: answer it first');
    if (had && had.qk === qk) {
      // the same queue: its place kept, the public rooms' season range taken (header 「공개방」)
      this.sendState(had);
      if (had.anySeason !== !!anySeason) { had.anySeason = !!anySeason; this.tryPool(had.pool); }
      return OK;
    }
    const late = lobby.restartNotice?.startRefusal();
    if (late) return late;
    const key = session.limitKey || null;
    if (key && this.opts.maxQueuedPerAddr > 0 && !had) {
      // an 8-player queue takes a whole 8-seat group from one network: twice the limit (maintainer decision 2026-10-19)
      const limit = this.opts.maxQueuedPerAddr * (cap > MAX_SEATS ? cap / MAX_SEATS : 1);
      let n = 0;
      for (const e of this.entries.values()) if (e.playerId && e.limitKey === key) n++;
      if (n >= limit) {
        lobby.limitWarn(`queue limit (${limit}) reached for ${session.addr}`);
        return fail(ERR.RATE, 'too many queued players from your network');
      }
    }
    if (cur) lobby.removeMember(cur, session.playerId);
    session.notice = null;
    session.pendingResult = null;
    if (had) this.drop(had, null); // moved to another queue: no queued:false in between
    /** @type {Entry} */
    const entry = { key: session.playerId, playerId: session.playerId, difficulty, ruleset, cap, season, quick: !!quick, pool, qk, joinedAt: lobby.now(), limitKey: key, group: null, offer: null, offline: null, anySeason: !!anySeason };
    this.enlist(entry);
    if (had) this.broadcastQueue(had.qk);
    this.broadcastQueue(qk);
    this.tryPool(pool);
    return OK;
  }

  /** room.unqueue — idempotent; inside a pending group it is a decline (a public room's offer just goes with the entry). */
  unqueue(session) {
    const entry = this.entryOf(session);
    if (!entry) return OK;
    if (entry.group) return this.decline(entry.group, entry, 'left');
    this.drop(entry, 'left');
    this.broadcastQueue(entry.qk);
    return OK;
  }

  /** room.queueVote {} — propose 「바로 시작」 in an 8-player queue of LARGE_MIN_PLAYERS or more (header). */
  vote(session) {
    const entry = this.entryOf(session);
    if (!entry) return fail(ERR.WRONG_PHASE, 'not queued');
    if (entry.group || entry.offer) return fail(ERR.ALREADY, entry.group?.vote ? 'a vote is running' : 'a match was found: answer it first');
    if (entry.cap <= MAX_SEATS) return fail(ERR.BAD_TARGET, 'only an 8-player queue votes');
    const late = this.lobby.restartNotice?.startRefusal();
    if (late) return late;
    if (this.lobby.now() < (this.voteCooldown.get(entry.qk) ?? -Infinity)) return fail(ERR.RATE, 'a vote just failed');
    const q = this.queueOf(entry.qk);
    this.dropSeated(q);
    const live = q.filter((e) => this.available(e));
    const humans = live.reduce((n, e) => n + this.size(e), 0);
    if (!live.includes(entry) || humans < LARGE_MIN_PLAYERS) return fail(ERR.WRONG_PHASE, `${humans}/${LARGE_MIN_PLAYERS} Doctors waiting`);
    this.form(live, session.playerId);
    return OK;
  }

  /** room.queueAccept { accept } */
  accept(session, { accept }) {
    const entry = this.entryOf(session);
    if (entry?.offer) return this.answerOffer(entry, accept);
    const group = entry?.group;
    if (!group) return fail(ERR.WRONG_PHASE, 'no match to answer');
    if (group.vote) {
      // a 「바로 시작」 vote: a no keeps the place in the queue (header)
      if (accept) { group.accepted.add(session.playerId); group.vote.declined.delete(session.playerId); }
      else { group.vote.declined.add(session.playerId); group.accepted.delete(session.playerId); }
      return this.voteAnswered(group);
    }
    if (!accept) return this.decline(group, entry, 'declined');
    group.accepted.add(session.playerId);
    if (group.ids.every((id) => group.accepted.has(id))) return this.launch(group);
    this.sendFound(group);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Session and room events (from the lobby)
  // ---------------------------------------------------------------------------------------------------

  onDisconnect(session) {
    const entry = this.entries.get(session.playerId);
    // a group member may come back before its deadline; a player with a public room's offer has the grace like a
    // waiting one (dropping the entry withdraws the offer)
    if (!entry || entry.group) return;
    this.clearOffline(entry);
    entry.offline = setTimeout(() => {
      entry.offline = null;
      if (this.entries.get(entry.key) !== entry || entry.group) return;
      this.drop(entry, 'offline');
      this.broadcastQueue(entry.qk);
    }, this.opts.queueGraceMs);
    entry.offline.unref?.();
  }

  /** A resumed or repeated hello: resend what the player is waiting for. */
  onResume(session) {
    const entry = this.entryOf(session);
    if (!entry) return;
    this.clearOffline(entry);
    if (entry.group) this.sendFound(entry.group, session.playerId);
    else if (entry.offer) this.sendOffer(entry);
    else { this.sendState(entry, session.playerId); this.tryPool(entry.pool); }
  }

  onExpire(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return;
    if (entry.group) { this.decline(entry.group, entry, 'offline'); return; }
    this.drop(entry, null);
    this.broadcastQueue(entry.qk);
  }

  /**
   * The session took a seat in a room (Lobby.join / create / spectate, before the room's state goes out; header): its entry leaves the
   * queue — silently when it is a public room offer being accepted, else with reason 'room' (a group it was answering:
   * a decline). @param {import('./net.js').Session} session
   */
  onSeated(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return;
    if (entry.accepting) { this.unlist(entry); this.broadcastQueue(entry.qk); return; }
    if (entry.group) { this.decline(entry.group, entry, 'room'); return; }
    this.drop(entry, 'room');
    this.broadcastQueue(entry.qk);
  }

  /**
   * A room changed (Lobby.broadcastState, disposeRoom; header 「공개방」): its offers that no longer fit are withdrawn,
   * and while it is a candidate its pool is walked again. @param {import('./lobby.js').Room} room
   */
  onRoom(room) {
    const pools = new Set();
    for (const e of [...(this.offers.get(room) ?? [])]) {
      if (this.offerable(room) && this.candidate(room, e) && this.fits(room, e)) continue;
      this.clearOffer(e);
      this.sendState(e);
      pools.add(e.pool);
    }
    if (this.offerable(room)) {
      pools.add(poolKey(room.difficulty, room.season));
      // the players of another season's pool who take every season's public rooms (header 「공개방」)
      for (const e of this.entries.values()) if (e.anySeason && !e.group && e.difficulty === room.difficulty) pools.add(e.pool);
    }
    for (const p of pools) this.tryPool(p);
  }

  shutdown() {
    for (const e of this.entries.values()) {
      this.clearOffline(e);
      this.clearOffer(e);
      if (e.group?.timer) { clearTimeout(e.group.timer); e.group.timer = null; }
    }
    this.entries.clear();
    this.queues.clear();
    this.pools.clear();
    this.qkPool.clear();
    this.offers.clear();
    this.skips.clear();
    for (const t of this.skipTimers) clearTimeout(t);
    this.skipTimers.clear();
    if (this.countsTimer) { clearTimeout(this.countsTimer); this.countsTimer = null; }
  }

  // ---------------------------------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------------------------------

  /**
   * Form every group the pool allows (header): each regular queue's group of four (eight in an 8-player queue), filled
   * up with the pool's quick players, the queue with the longest-waiting entry first; then four quick players alone;
   * then offer the players left the public rooms that fit them (offerRooms).
   * @param {string} pool
   */
  tryPool(pool) {
    const quickKey = quickOf(pool);
    for (;;) {
      const qks = [...(this.pools.get(pool) ?? [])];
      for (const qk of qks) this.dropSeated(this.queueOf(qk));
      const quick = this.queueOf(quickKey).filter((e) => this.available(e));
      const regular = qks.filter((qk) => qk !== quickKey)
        .map((qk) => this.queueOf(qk).filter((e) => this.available(e)))
        .filter((live) => live.length)
        .sort((a, b) => a[0].joinedAt - b[0].joinedAt);
      let members = null;
      let spec = null;
      for (const live of regular) {
        members = this.pickWith(live, quick, live[0].cap);
        if (members) { spec = live[0]; break; }
      }
      if (!members && quick.length >= MAX_SEATS) {
        members = quick.slice(0, MAX_SEATS);
        spec = { ruleset: QUICK_RULESET, cap: MAX_SEATS, qk: quickKey };
      }
      if (!members) break;
      this.form(members, null, spec);
    }
    this.offerRooms(pool);
  }

  // ---------------------------------------------------------------------------------------------------
  // 공개방 offers (header)
  // ---------------------------------------------------------------------------------------------------

  /**
   * Offer the pool's waiting players, the longest-waiting first, the public room that fits each best: the most humans,
   * then the earliest `publicSince` (header 「공개방」). @param {string} pool
   */
  offerRooms(pool) {
    const lobby = this.lobby;
    const waiting = [...(this.pools.get(pool) ?? [])].flatMap((qk) => this.queueOf(qk)).filter((e) => this.available(e));
    if (!waiting.length || lobby.restartNotice?.startRefusal()) return;
    // the pool's difficulty, in every season: an anySeason player takes the other seasons' rooms too (candidate)
    const rooms = [...lobby.rooms.values()].filter((r) => this.offerable(r) && r.difficulty === waiting[0].difficulty);
    if (!rooms.length) return;
    waiting.sort((a, b) => a.joinedAt - b.joinedAt);
    const now = lobby.now();
    for (const e of waiting) {
      const best = rooms
        .filter((r) => this.candidate(r, e) && this.fits(r, e) && this.openSeats(r) > 0 && !this.skipped(e.playerId, r.code, now) && !lobby.kickedFrom(r, e.playerId))
        .sort((a, b) => b.activeHumans().length - a.activeHumans().length || a.publicSince - b.publicSince)[0];
      if (best) this.offer(e, best);
    }
  }

  /** A public room matchmaking may offer (header): co-op, in LOBBY, its host connected. @param {import('./lobby.js').Room} room */
  offerable(room) {
    if (!room.public || room.mode !== 'coop' || room.match || room.disposed || this.lobby.rooms.get(room.code) !== room) return false;
    const host = room.hostId ? room.seatOf(room.hostId) : null;
    return !!host && host.connected;
  }

  /**
   * Whether the room is in the entry's range (header 「공개방」): its difficulty, and its season unless the entry takes
   * every season's rooms (anySeason). @param {import('./lobby.js').Room} room @param {Entry} entry
   */
  candidate(room, entry) {
    return room.difficulty === entry.difficulty && (entry.anySeason || room.season === entry.season);
  }

  /**
   * Whether the room's rules suit the entry (header): a regular player the room's preset and size, a quick player any
   * (candidate has checked the room's difficulty and season). @param {import('./lobby.js').Room} room @param {Entry} entry
   */
  fits(room, entry) {
    if (entry.quick) return true;
    return rulesetKey(room.ruleset) === entry.ruleset && room.size === entry.cap;
  }

  /** The seats matchmaking may still offer: the free ones and the AI ones, less the pending offers. */
  openSeats(room) {
    const open = room.seats.filter((s) => !s || s.isBot).length;
    return open - (this.offers.get(room)?.size ?? 0);
  }

  /** Was this room declined by the player within `publicSkipMs`? */
  skipped(playerId, code, now) {
    const m = this.skips.get(playerId);
    if (!m) return false;
    const until = m.get(code);
    if (until == null) return false;
    if (until > now) return true;
    m.delete(code);
    if (!m.size) this.skips.delete(playerId);
    return false;
  }

  /** @param {Entry} entry @param {import('./lobby.js').Room} room */
  offer(entry, room) {
    const ms = this.opts.queueConfirmMs;
    /** @type {Offer} */
    const offer = { room, deadline: this.lobby.now() + ms, timer: null };
    entry.offer = offer;
    let set = this.offers.get(room);
    if (!set) { set = new Set(); this.offers.set(room, set); }
    set.add(entry);
    offer.timer = setTimeout(() => { offer.timer = null; if (entry.offer === offer) this.refuseOffer(entry); }, ms);
    offer.timer.unref?.();
    this.lobby.log.info(`[queue] ${room.code} offered to ${this.lobby.registry.byId(entry.playerId)?.name ?? entry.playerId} (${entry.playerId}, ${entry.quick ? 'quick' : entry.ruleset})`);
    this.sendOffer(entry);
    this.noteCounts();
  }

  /** room.queueAccept of an offer (header): accepted → Lobby.join; declined → the room is skipped. */
  answerOffer(entry, accept) {
    if (!accept) { this.refuseOffer(entry); return OK; }
    const { room } = /** @type {Offer} */ (entry.offer);
    this.clearOffer(entry);
    const session = this.lobby.registry.byId(entry.playerId);
    if (!session) return fail(ERR.WRONG_PHASE);
    entry.accepting = true;
    let res;
    try { res = this.lobby.join(session, { code: room.code }, { viaQueue: true }); } finally { entry.accepting = false; }
    if (!('error' in res)) return OK;
    // full or started meanwhile: the player waits on, the queue is walked again (no skip, header)
    if (this.entries.get(entry.key) === entry) { this.sendState(entry); this.tryPool(entry.pool); }
    return fail(res.error, res.detail);
  }

  /** A declined or silent offer: the player waits on, that room is skipped for `publicSkipMs` (header). @param {Entry} entry */
  refuseOffer(entry) {
    const code = entry.offer?.room.code;
    this.clearOffer(entry);
    if (code) {
      let m = this.skips.get(entry.playerId);
      if (!m) { m = new Map(); this.skips.set(entry.playerId, m); }
      const until = this.lobby.now() + this.opts.publicSkipMs;
      m.set(code, until);
      // the room may be offered again when the skip runs out: walk the pool then. The timer ends the skip it set
      // itself: a Node timer counts from the event loop's cached time, so under load it fires before the wall clock
      // reaches `until` and skipped() would still say skipped, with no later walk to offer the room again.
      const t = setTimeout(() => {
        this.skipTimers.delete(t);
        const cur = this.skips.get(entry.playerId);
        if (cur && cur.get(code) === until) { cur.delete(code); if (!cur.size) this.skips.delete(entry.playerId); }
        if (this.entries.get(entry.key) === entry) this.tryPool(entry.pool);
      }, this.opts.publicSkipMs);
      t.unref?.();
      this.skipTimers.add(t);
    }
    this.sendState(entry);
    this.tryPool(entry.pool);
  }

  /** Take the entry's offer back (its seat is free for matchmaking again). @param {Entry} entry */
  clearOffer(entry) {
    const offer = entry.offer;
    if (!offer) return;
    if (offer.timer) clearTimeout(offer.timer);
    entry.offer = null;
    const set = this.offers.get(offer.room);
    if (set) { set.delete(entry); if (!set.size) this.offers.delete(offer.room); }
    this.noteCounts();
  }

  /** room.matchFound of an offer (header) to its player. @param {Entry} entry */
  sendOffer(entry) {
    const { room, deadline } = /** @type {Offer} */ (entry.offer);
    const card = this.lobby.roomCard(room);
    sendSession(this.lobby.registry.byId(entry.playerId), {
      t: 'room.matchFound', difficulty: room.difficulty, ruleset: card.ruleset.preset, ...sizeOf({ cap: room.size, season: room.season }),
      ...(entry.quick ? { quick: true } : {}), ...(card.custom ? { custom: card.custom } : {}),
      players: 1, accepted: 0, mine: false, inMs: Math.max(0, deadline - this.lobby.now()), room: card,
    });
  }

  /**
   * A regular queue's group, completed with the fewest quick players (header): the queue's own entries as pickFour
   * takes them for `cap` minus n humans, then the n oldest quick players, for n = 0, 1, … (a group needs one of the
   * queue's entries; quick players alone are tryPool's last step).
   * @param {Entry[]} regular @param {Entry[]} quick @param {number} cap @returns {Entry[] | null}
   */
  pickWith(regular, quick, cap) {
    const own = regular.reduce((n, e) => n + this.size(e), 0);
    for (let need = Math.max(0, cap - own); need <= Math.min(quick.length, cap - 1); need++) {
      const part = this.pickFour(regular, cap - need);
      if (part) return [...part, ...quick.slice(0, need)];
    }
    return null;
  }

  /**
   * The first entries, in queue order, whose humans add up to exactly `cap` (MAX_SEATS; 8 in an 8-player queue — the
   * earliest entries win: a depth-first search that tries taking each entry before skipping it).
   * @param {Entry[]} list @param {number} [cap] @returns {Entry[] | null}
   */
  pickFour(list, cap = MAX_SEATS) {
    const sizes = list.map((e) => this.size(e));
    const out = [];
    const dfs = (i, left) => {
      if (left === 0) return true;
      for (let j = i; j < list.length; j++) {
        if (sizes[j] > left || sizes[j] < 1) continue;
        out.push(list[j]);
        if (dfs(j + 1, left - sizes[j])) return true;
        out.pop();
      }
      return false;
    };
    return dfs(0, cap) ? out : null;
  }

  /**
   * @param {Entry[]} members
   * @param {string | null} [voteBy] the proposer of a 「바로 시작」 vote (header): the group is that vote, the proposer's yes counted
   * @param {{ ruleset: string | null, cap: number, qk: string }} [spec] the queue the group completes (tryPool)
   */
  form(members, voteBy = null, spec = members[0]) {
    const { difficulty, season, pool } = members[0];
    const { ruleset, cap, qk } = spec;
    const ms = voteBy ? this.opts.queueVoteMs : this.opts.queueConfirmMs;
    /** @type {Group} */
    const group = { id: ++this.groupSeq, difficulty, ruleset: /** @type {string} */ (ruleset), cap, season, pool, qk, members, ids: members.flatMap((e) => this.ids(e)), accepted: new Set(),
      deadline: this.lobby.now() + ms, timer: null,
      vote: voteBy ? { by: this.lobby.registry.byId(voteBy)?.name ?? null, declined: new Set() } : null };
    if (voteBy) group.accepted.add(voteBy);
    for (const e of members) {
      const q = this.queueOf(e.qk);
      q.splice(q.indexOf(e), 1);
      e.group = group;
      this.clearOffline(e);
    }
    group.timer = setTimeout(() => { group.timer = null; this.expire(group); }, ms);
    group.timer.unref?.();
    const quick = members.filter((e) => e.quick).length;
    this.lobby.log.info(`[queue] ${difficulty}/${ruleset}${cap > MAX_SEATS ? `/${cap}` : ''}${season !== DEFAULT_SEASON ? `/${season}` : ''} group #${group.id}: ${group.ids.length} player(s)${quick ? ` (${quick} quick)` : ''}, ${voteBy ? 'voting' : 'confirming'}`);
    this.sendFound(group);
    for (const k of new Set(members.map((e) => e.qk))) this.broadcastQueue(k);
  }

  /** The confirmation window ran out: entries with a silent human leave, the others go back to the front. */
  expire(group) {
    if (!this.live(group)) return;
    if (group.vote) { this.resolveVote(group); return; }
    const done = (e) => this.ids(e).every((id) => group.accepted.has(id));
    const stay = group.members.filter(done);
    for (const e of group.members) if (!done(e)) this.drop(e, 'timeout');
    this.dissolve(group, stay);
  }

  /** A member declined (or left / expired): its entry leaves the queue, every other entry goes back to the front. */
  decline(group, entry, reason) {
    if (!this.live(group)) return OK;
    if (group.vote) {
      // leaving during a 「바로 시작」 vote: the entry goes, the vote goes on without it (header)
      const ids = this.ids(entry);
      this.drop(entry, reason);
      group.members = group.members.filter((e) => e !== entry);
      group.ids = group.ids.filter((id) => !ids.includes(id));
      if (!group.members.length) { this.endGroup(group); return OK; }
      return this.voteAnswered(group);
    }
    this.drop(entry, reason);
    this.dissolve(group, group.members.filter((e) => e !== entry));
    return OK;
  }

  /**
   * @param {Group} group @param {Entry[]} back entries returned to the front of the queue, in their old order
   * @param {object | null} [extra] fields of the room.queueState those entries get (a 「바로 시작」 vote's outcome)
   */
  dissolve(group, back, extra = null) {
    this.endGroup(group);
    for (const e of back) e.group = null;
    const qks = new Set([...back.map((e) => e.qk), quickOf(group.pool)]); // the quick players' count is the pool's
    for (const k of qks) {
      const q = this.queueOf(k);
      q.unshift(...back.filter((e) => e.qk === k)); // in front first: a stable sort keeps them ahead of a same-ms newcomer
      q.sort((a, b) => a.joinedAt - b.joinedAt);
      for (const e of q) this.sendState(e, undefined, back.includes(e) ? extra : null);
    }
    this.noteCounts();
    this.tryPool(group.pool);
  }

  /** A vote answer or a leaver: the vote ends once every human of it has answered, else the count goes out. */
  voteAnswered(group) {
    const no = group.vote.declined;
    if (group.ids.every((id) => group.accepted.has(id) || no.has(id))) this.resolveVote(group);
    else this.sendFound(group);
    return OK;
  }

  /**
   * The end of a 「바로 시작」 vote (header): the all-yes entries start if they hold LARGE_MIN_PLAYERS humans, every other
   * entry waits on; fewer yes: everyone waits on and the queue's proposals cool down.
   */
  resolveVote(group) {
    if (!this.live(group)) return;
    const yes = group.members.filter((e) => this.ids(e).every((id) => group.accepted.has(id)));
    const humans = yes.reduce((n, e) => n + this.size(e), 0);
    if (humans < LARGE_MIN_PLAYERS) {
      this.voteCooldown.set(group.qk, this.lobby.now() + this.opts.queueVoteCooldownMs);
      this.lobby.log.info(`[queue] group #${group.id}: vote failed (${humans}/${group.ids.length} yes)`);
      this.dissolve(group, group.members, { vote: 'failed' });
      return;
    }
    const rest = group.members.filter((e) => !yes.includes(e));
    this.lobby.log.info(`[queue] group #${group.id}: vote passed (${humans}/${group.ids.length} yes), starting`);
    const late = !!this.lobby.restartNotice?.startRefusal(); // launch dissolves the yes entries then ('restarting')
    group.members = yes;
    group.ids = yes.flatMap((e) => this.ids(e));
    this.launch(group);
    if (rest.length) this.dissolve({ ...group, members: rest }, rest, late ? null : { vote: 'started', started: humans });
  }

  /** Every human accepted: seat them in a new room, in queue order, and start its match (header). */
  launch(group) {
    const lobby = this.lobby;
    this.endGroup(group);
    const late = lobby.restartNotice?.startRefusal();
    const code = late ? null : lobby.rooms.size >= lobby.opts.maxRooms ? null : lobby.genCode();
    if (!code) {
      for (const e of group.members) this.drop(e, late ? 'restarting' : 'full');
      return OK;
    }
    // who moves where is read before any room changes; the entries go first, so the moves below cancel nothing
    const movers = group.members.flatMap((e) => this.ids(e));
    for (const e of group.members) this.unlist(e);
    const room = new this.Room(code, 'coop', group.difficulty, lobby.now(), group.cap);
    room.ruleset = resolveRuleset(group.ruleset);
    room.season = group.season;
    const seated = [];
    for (const playerId of movers) {
      const session = lobby.registry.byId(playerId);
      const cur = session && lobby.roomOf(session);
      if (!session || (cur && cur.match)) continue;
      const idx = room.freeSeat();
      if (idx < 0) break;
      if (cur) lobby.removeMember(cur, playerId);
      room.seats[idx] = lobby.humanSeat(idx, session, room.season);
      session.roomCode = code;
      session.notice = null;
      session.pendingResult = null;
      seated.push(session);
      roomEntry(lobby, room, session, 'matched');
    }
    if (!seated.length) return OK;
    room.ownerKey = seated[0].limitKey || null;
    room.hostId = seated[0].playerId;
    lobby.rooms.set(code, room);
    const humans = room.activeHumans().length;
    lobby.log.info(`[lobby] ${code} matched (coop${group.cap > MAX_SEATS ? group.cap : ''}/${group.difficulty}/${group.ruleset}${group.season !== DEFAULT_SEASON ? `/${group.season}` : ''}, ${humans} player(s), group #${group.id})`);
    lobby.startMatch(room, room.ownerKey);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------------

  /** Add a new entry to the maps and the back of its queue (registered in its pool). @param {Entry} entry */
  enlist(entry) {
    this.entries.set(entry.key, entry);
    this.queueOf(entry.qk).push(entry);
    let qks = this.pools.get(entry.pool);
    if (!qks) { qks = new Set(); this.pools.set(entry.pool, qks); }
    qks.add(entry.qk);
    this.qkPool.set(entry.qk, entry.pool);
  }

  /** @param {string} qk a queue key (difficulty|ruleset) */
  queueOf(qk) {
    let q = this.queues.get(qk);
    if (!q) { q = []; this.queues.set(qk, q); }
    return q;
  }

  /** The entry the session waits in. @returns {Entry | null} */
  entryOf(session) { return this.entries.get(session.playerId) || null; }

  /** The entry's humans (one: the queue holds single players). @param {Entry} entry @returns {string[]} */
  ids(entry) { return [entry.playerId]; }

  size(_entry) { return 1; }

  live(group) { return group.members.some((e) => this.entries.get(e.key) === e && e.group === group); }

  endGroup(group) {
    if (group.timer) { clearTimeout(group.timer); group.timer = null; }
  }

  online(entry) {
    return this.ids(entry).every((id) => {
      const session = this.lobby.registry.byId(id);
      return !!session && session.connected;
    });
  }

  /** A waiting entry group formation and the offers may take: online, no public room offer pending. @param {Entry} entry */
  available(entry) { return !entry.offer && this.online(entry); }

  /** Waiting single players who sit in a room now (a room taken without Lobby.join) leave the queue. */
  dropSeated(q) {
    for (const e of [...q]) {
      const session = this.lobby.registry.byId(e.playerId);
      if (session && this.lobby.roomOf(session)) this.drop(e, 'room');
    }
  }

  clearOffline(entry) {
    if (entry.offline) { clearTimeout(entry.offline); entry.offline = null; }
  }

  /** Take an entry out of the maps and its queue (its public room offer withdrawn). */
  unlist(entry) {
    this.clearOffline(entry);
    this.clearOffer(entry);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (!entry.group) {
      const q = this.queueOf(entry.qk);
      const i = q.indexOf(entry);
      if (i >= 0) q.splice(i, 1);
    }
    this.noteCounts();
    entry.group = null;
  }

  /**
   * Remove an entry for good, telling its player why (reason null: nobody to tell).
   * @param {Entry} entry @param {string | null} reason
   */
  drop(entry, reason) {
    this.unlist(entry);
    if (!reason) return;
    sendSession(this.lobby.registry.byId(entry.playerId), { t: 'room.queueState', queued: false, difficulty: entry.difficulty, ...tagOf(entry), reason });
  }

  /** @param {Entry} entry @param {string} [only] one of its humans @param {object | null} [extra] more fields (dissolve) */
  sendState(entry, only, extra = null) {
    const now = this.lobby.now();
    const waited = Math.max(0, now - entry.joinedAt);
    let count = 0;
    // a quick player's count is every human waiting in the pool (header)
    for (const k of entry.quick ? this.pools.get(entry.pool) ?? [] : [entry.qk]) for (const e of this.queueOf(k)) count += this.size(e);
    // anySeason: the target the player queued for, so the waiting and the confirmation can name it (ui/matchQueue.js)
    const msg = { t: 'room.queueState', queued: true, difficulty: entry.difficulty, ...tagOf(entry), ...(entry.anySeason ? { anySeason: true } : {}), count, waitedMs: waited, ...extra };
    for (const id of only ? [only] : this.ids(entry)) sendSession(this.lobby.registry.byId(id), msg);
  }

  /**
   * Resend the state of a queue's waiting entries, and of the quick players of its pool (their count is the pool's).
   * An entry holding a public room's offer is skipped: a queueState closes the client's confirmation while the offer
   * still runs (ui/matchQueue.js) — it gets its state when the offer ends (refuseOffer / answerOffer / withdrawn).
   * @param {string} qk
   */
  broadcastQueue(qk) {
    for (const e of this.queueOf(qk)) if (!e.offer) this.sendState(e);
    const pool = this.qkPool.get(qk);
    if (pool != null && quickOf(pool) !== qk) for (const e of this.queueOf(quickOf(pool))) if (!e.offer) this.sendState(e);
    this.noteCounts();
  }

  /**
   * The humans waiting in every queue of a room size (header): { [ruleset]: { [difficulty]: n } }, every preset and
   * difficulty listed. @param {number} [cap] 4, or 8 for the 8-player queues @param {string} [season]
   * @returns {Record<string, Record<string, number>>}
   */
  counts(cap = MAX_SEATS, season = DEFAULT_SEASON) {
    /** @type {Record<string, Record<string, number>>} */
    const out = {};
    for (const p of QUEUE_PRESETS) out[p] = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
    for (const q of this.queues.values()) {
      for (const e of q) {
        if (e.group || e.quick || e.cap !== cap || e.season !== season || !out[e.ruleset] || !(e.difficulty in out[e.ruleset])) continue;
        out[e.ruleset][e.difficulty] += this.size(e);
      }
    }
    return out;
  }

  /** The quick players waiting per difficulty of a season (header). @param {string} [season] @returns {Record<string, number>} */
  quickCounts(season = DEFAULT_SEASON) {
    /** @type {Record<string, number>} */
    const out = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
    for (const d of DIFFICULTIES) for (const e of this.queues.get(quickOf(poolKey(d, season))) ?? []) if (!e.group) out[d] += 1;
    return out;
  }

  /**
   * The fields of lobby.queueCounts (header): the default season's `counts` / `counts8` / `quick`, the other offered
   * seasons' `seasons`.
   */
  countsMsg() {
    const msg = { counts: this.counts(), counts8: this.counts(LARGE_SEATS), quick: this.quickCounts() };
    const others = [...this.lobby.seasons].filter((id) => id !== DEFAULT_SEASON);
    if (others.length) msg.seasons = Object.fromEntries(others.map((id) => [id, { counts: this.counts(MAX_SEATS, id), counts8: this.counts(LARGE_SEATS, id), quick: this.quickCounts(id) }]));
    msg.rooms = this.lobby.publicRoomCounts(); // the hub's 「공개방 N」 (header 「공개방」)
    return msg;
  }

  /** A queue changed: send lobby.queueCounts when the counts did, at most once per countsMinGapMs (header). */
  noteCounts() {
    if (this.countsTimer) return;
    const wait = Math.max(0, this.countsAt + this.opts.countsMinGapMs - this.lobby.now());
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      const msg = this.countsMsg();
      const json = JSON.stringify(msg);
      if (json === this.countsSent) return;
      this.countsSent = json;
      this.countsAt = this.lobby.now();
      this.lobby.broadcastQueueCounts(msg);
    }, wait);
    this.countsTimer.unref?.();
  }

  /** room.matchFound to every human of the group (or one), with the accept count so far. @param {Group} group @param {string} [only] */
  sendFound(group, only) {
    const inMs = Math.max(0, group.deadline - this.lobby.now());
    const quick = new Set(group.members.filter((e) => e.quick).map((e) => e.playerId));
    for (const id of only ? [only] : group.ids) {
      sendSession(this.lobby.registry.byId(id), {
        t: 'room.matchFound', difficulty: group.difficulty, ruleset: group.ruleset, ...sizeOf(group), ...(quick.has(id) ? { quick: true } : {}), players: group.ids.length,
        accepted: group.accepted.size, mine: group.accepted.has(id), inMs,
        // a 「바로 시작」 vote (header): the yes it needs, the noes so far, this human's no, the proposer
        ...(group.vote ? { vote: true, need: LARGE_MIN_PLAYERS, declined: group.vote.declined.size, no: group.vote.declined.has(id), by: group.vote.by } : {}),
      });
    }
  }
}

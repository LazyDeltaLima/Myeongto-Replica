// server/matchmaking.js — 랜덤 매칭: a per-difficulty queue of co-op players (and co-op rooms with empty seats) that the
// lobby turns into a full room and a match (a remake feature; the upstream design left a matchmaking queue out of scope,
// docs/design/overview.md). The lobby (server/lobby.js) owns one Matchmaker and routes room.queue / room.queueRoom /
// room.unqueue / room.queueAccept to it, plus its session and room events (disconnect, resume, expiry, a member leaving
// a queued room, a room's disposal, shutdown).
//
// Rules (maintainer decisions 2026-10-13):
//   * One queue per difficulty and 규칙 모드 (shared/ruleset.js rulesetKey; maintainer decision 2026-10-15: the players of
//     a match share the room's rules), co-op only, classic and casual only (QUEUE_PRESETS: a custom room is refused,
//     BAD_TARGET, maintainer decision 2026-10-18). Its entries are single players or rooms ("parties"):
//     - room.queue { difficulty, ruleset? } queues the player alone (ruleset absent = the default, classic; switching
//       either moves the entry to the back of the other queue); a player in a LOBBY room leaves the room (like
//       room.create), one whose room is in a match is refused (ROOM_STARTED).
//     - room.queueRoom {} (the host of a co-op LOBBY room with 1–3 humans) queues the room's humans together for the
//       room's difficulty and ruleset, under the gate of room.start: every other human connected and ready (NOT_READY). The room's
//       AI seats are freed (matchmaking fills the seats with humans only). While the room is queued (room.state
//       `matching`) nobody may join it (ERR.MATCHING; spectating is fine) and the host may not change the difficulty or
//       the ruleset, add an AI seat or start (ERR.MATCHING); a human leaving the room (leave, kick, the lobby grace, a resume window
//       expiring) or its disposal cancels the room's entry (reason 'changed' to the others, `by` = who left).
//     room.unqueue (any queued member, maintainer decision 2026-10-13) leaves the queue — for a room, the whole room: the
//     sender gets reason 'left', the other members 'party' with `by` = the sender's name (the same decision: the others
//     see who cancelled). Every waiting player gets room.queueState whenever its queue changes (`count` = the humans
//     waiting in that queue, `party` = queued with a room, `ruleset` = its preset).
//   * Waiting counts in the lobby (maintainer decision 2026-10-15): lobby.queueCounts { counts: { [ruleset]:
//     { [difficulty]: humans } } } (every preset and difficulty, zeros included; waiting entries only, not a group being
//     confirmed) goes to every connected Doctor outside a running match — at most once per `countsMinGapMs` (1 s) and
//     only when the counts changed — and to each one on hello (Lobby.sendQueueCounts).
//   * A group is always four humans (maintainer decision 2026-10-13: no AI fill, no smaller group). Formation walks the
//     queue in order and takes the first entries whose humans add up to exactly four, preferring the oldest entries
//     (an entry that does not fit is skipped, not dropped). An entry with an offline human is skipped.
//   * A formed group is confirmed: every human gets room.matchFound and answers room.queueAccept { accept } within
//     `queueConfirmMs` (15 s). All accepted → the match starts at once (no ready check: the confirmation was it):
//     - with a room in the group, in the first (oldest) such room: its members keep their seats, the others take its
//       free seats in queue order (players of another queued room leave that room, which closes empty); its host stays
//       the host;
//     - otherwise in a new co-op room of the queue's difficulty and ruleset, seated in queue order (the first is the host).
//     A human who declines, or has not answered when the time runs out, takes their entry out of the queue (a room
//     leaves whole: the other members get 'partyDeclined' with `by`, or 'partyTimeout' when they had accepted); the other
//     entries go back to the front of their queue, in their old order, keeping their waiting time.
//   * A waiting single player whose socket closes is skipped by group formation and leaves the queue after
//     `queueGraceMs` (10 s; a phone switching apps keeps its place); a resume within that time resends the queue state
//     (or the pending room.matchFound). The reconnect window expiring removes the entry at once. A single player who
//     ended up in a room some other way (an invitation link) is dropped when a group would take them (reason 'room').
//     A queued room's offline human is the room's business: the lobby grace (60 s) removes them, which cancels the entry.
//   * Limits: at most `maxQueuedPerAddr` waiting single players from one client network (internet clients only, net.js
//     clientAddress; room.queue → ERR.RATE; queued rooms are already capped by the lobby's room limits); no queue entry
//     and no match start during the deploy countdown's last minutes (server/local-restart.js startRefusal →
//     ERR.RESTARTING; a group that completes then is dissolved with reason 'restarting').
//   * The queue lives in memory: a server restart forgets it (the client's queue screen closes on the new `welcome`).
//   * The 8-player mode (maintainer decisions 2026-10-16, 2026-10-19) has queues of its own: room.queue { size: 8 } and
//     room.queueRoom of an 8-seat room wait for a group of exactly eight humans (no AI fill, like the four), matched into
//     an 8-seat room; every message about such a queue carries `size: 8`, and lobby.queueCounts its `counts8` beside
//     `counts` (the 4-player queues, unchanged).

import { ERR, LARGE_SEATS, MAX_SEATS, DIFFICULTIES, seatsOf } from '../shared/constants.js';
import { QUEUE_PRESETS, resolveRuleset, rulesetKey } from '../shared/ruleset.js';
import { sendSession } from './net.js';

export const QUEUE_DEFAULTS = Object.freeze({
  queueConfirmMs: 15_000,  // a formed group's room.queueAccept window
  queueGraceMs: 10_000,    // a disconnected waiting single player keeps the place this long
  maxQueuedPerAddr: 4,     // waiting single players from one client network (0 = unlimited)
  countsMinGapMs: 1_000,   // lobby.queueCounts at most this often (header)
});

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

/**
 * @typedef {{ key: string, playerId: string | null, room: import('./lobby.js').Room | null, difficulty: string,
 *   ruleset: string, cap: number, qk: string, joinedAt: number, limitKey: string | null, group: Group | null,
 *   offline: NodeJS.Timeout | null }} Entry
 *   a single player (playerId) or a queued room (room); key = the playerId, or 'room:' + the room code; qk = its queue;
 *   cap = the room size it waits for (4, or 8 for the 8-player mode)
 * @typedef {{ id: number, difficulty: string, ruleset: string, cap: number, qk: string, members: Entry[], ids: string[],
 *   accepted: Set<string>, deadline: number, timer: NodeJS.Timeout | null }} Group
 */

const roomKey = (room) => `room:${room.code}`;
/** A queue's key: its difficulty, ruleset key (shared/ruleset.js rulesetKey) and room size (the 8-player queues). */
const queueKey = (difficulty, ruleset, cap = MAX_SEATS) => (cap > MAX_SEATS ? `${difficulty}|${ruleset}|${cap}` : `${difficulty}|${ruleset}`);
/** The `size` field of a queue message: only for the 8-player queues (header). */
const sizeOf = (cap) => (cap > MAX_SEATS ? { size: cap } : {});

export class Matchmaker {
  /**
   * @param {import('./lobby.js').Lobby} lobby
   * @param {{ Room: typeof import('./lobby.js').Room, options?: Partial<typeof QUEUE_DEFAULTS> }} deps
   */
  constructor(lobby, { Room, options = {} }) {
    this.lobby = lobby;
    this.Room = Room;
    this.opts = { ...QUEUE_DEFAULTS, ...options };
    /** @type {Map<string, Entry[]>} waiting entries by queue key (difficulty|ruleset), in queue order */
    this.queues = new Map();
    /** @type {Map<string, Entry>} every entry (waiting or in a group) by key */
    this.entries = new Map();
    this.groupSeq = 0;
    /** lobby.queueCounts pacing (header): the last counts sent (JSON), when, and the pending send */
    this.countsSent = null;
    this.countsAt = -Infinity;
    /** @type {NodeJS.Timeout | null} */
    this.countsTimer = null;
  }

  /** Counters for /healthz-style status: humans waiting / confirming. */
  stats() {
    let waiting = 0;
    let confirming = 0;
    for (const e of this.entries.values()) {
      if (e.group) confirming += this.size(e); else waiting += this.size(e);
    }
    return { waiting, confirming };
  }

  // ---------------------------------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------------------------------

  /** room.queue { difficulty, ruleset?, size? } — a single player. */
  queue(session, { difficulty, ruleset: preset, size }) {
    const ruleset = rulesetKey(preset);
    const cap = seatsOf(size);
    const qk = queueKey(difficulty, ruleset, cap);
    const lobby = this.lobby;
    const cur = lobby.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    const had = this.entries.get(session.playerId);
    if (had?.group) return fail(ERR.ALREADY, 'a match was found: answer it first');
    if (had && had.qk === qk) { this.sendState(had); return OK; }
    const late = lobby.restartNotice?.startRefusal();
    if (late) return late;
    const key = session.limitKey || null;
    if (key && this.opts.maxQueuedPerAddr > 0 && !had) {
      let n = 0;
      for (const e of this.entries.values()) if (e.playerId && e.limitKey === key) n++;
      if (n >= this.opts.maxQueuedPerAddr) {
        lobby.limitWarn(`queue limit (${this.opts.maxQueuedPerAddr}) reached for ${session.addr}`);
        return fail(ERR.RATE, 'too many queued players from your network');
      }
    }
    if (cur) lobby.removeMember(cur, session.playerId); // a queued room of theirs is cancelled by onRoomChange
    session.notice = null;
    session.pendingResult = null;
    if (had) this.drop(had, null); // moved to another queue: no queued:false in between
    /** @type {Entry} */
    const entry = { key: session.playerId, playerId: session.playerId, room: null, difficulty, ruleset, cap, qk, joinedAt: lobby.now(), limitKey: key, group: null, offline: null };
    this.entries.set(entry.key, entry);
    this.queueOf(qk).push(entry);
    if (had) this.broadcastQueue(had.qk);
    this.broadcastQueue(qk);
    this.tryForm(qk);
    return OK;
  }

  /** room.queueRoom {} — the host queues the room's humans for its empty seats (header). */
  queueRoom(session) {
    const lobby = this.lobby;
    const room = lobby.roomOf(session);
    if (!room) return fail(ERR.NOT_IN_ROOM);
    if (room.spectatorOf(session.playerId)) return fail(ERR.SPECTATOR);
    if (room.hostId !== session.playerId) return fail(ERR.NOT_HOST);
    if (room.match) return fail(ERR.ROOM_STARTED);
    if (room.mode !== 'coop') return fail(ERR.BAD_TARGET, 'co-op rooms only');
    // the custom 규칙 모드 never matchmakes (maintainer decision 2026-10-18; shared/ruleset.js QUEUE_PRESETS)
    if (!QUEUE_PRESETS.includes(room.ruleset.preset)) return fail(ERR.BAD_TARGET, 'the custom ruleset has no matchmaking');
    const had = this.entries.get(roomKey(room));
    if (had) { this.sendState(had); return OK; }
    const humans = room.activeHumans();
    if (humans.length >= room.size) return fail(ERR.ROOM_FULL, 'no seat to fill');
    for (const s of humans) {
      if (s.playerId !== room.hostId && (!s.connected || !s.ready)) return fail(ERR.NOT_READY);
    }
    const late = lobby.restartNotice?.startRefusal();
    if (late) return late;
    for (const s of room.seats) if (s && s.isBot) room.seats[s.seat] = null; // humans only fill the seats
    for (const s of humans) lobby.dropReplay(room, s.playerId);
    /** @type {Entry} */
    const ruleset = rulesetKey(room.ruleset);
    const entry = { key: roomKey(room), playerId: null, room, difficulty: room.difficulty, ruleset, cap: room.size, qk: queueKey(room.difficulty, ruleset, room.size),
      joinedAt: lobby.now(), limitKey: session.limitKey || null, group: null, offline: null };
    this.entries.set(entry.key, entry);
    this.queueOf(entry.qk).push(entry);
    room.matching = true;
    lobby.log.info(`[queue] ${room.code} queued (${humans.length} player(s), ${entry.difficulty}/${ruleset}${room.size > MAX_SEATS ? `/${room.size}` : ''})`);
    lobby.broadcastState(room);
    this.broadcastQueue(entry.qk);
    this.tryForm(entry.qk);
    return OK;
  }

  /** room.unqueue — idempotent; inside a pending group it is a decline. */
  unqueue(session) {
    const entry = this.entryOf(session);
    if (!entry) return OK;
    if (entry.group) return this.decline(entry.group, entry, 'left', { byId: session.playerId });
    this.drop(entry, 'left', { byId: session.playerId });
    this.broadcastQueue(entry.qk);
    return OK;
  }

  /** room.queueAccept { accept } */
  accept(session, { accept }) {
    const entry = this.entryOf(session);
    const group = entry?.group;
    if (!group) return fail(ERR.WRONG_PHASE, 'no match to answer');
    if (!accept) return this.decline(group, entry, 'declined', { byId: session.playerId });
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
    // a group member may come back before its deadline; a queued room's member has the lobby grace (header)
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
    else { this.sendState(entry, session.playerId); this.tryForm(entry.qk); }
  }

  onExpire(session) {
    const entry = this.entries.get(session.playerId); // a queued room's member: the lobby's removeMember follows
    if (!entry) return;
    if (entry.group) { this.decline(entry.group, entry, 'offline'); return; }
    this.drop(entry, null);
    this.broadcastQueue(entry.qk);
  }

  /**
   * A queued room lost a human (lobby removeMember in LOBBY) or is being disposed: its entry is cancelled. The one who
   * left gets queued:false at once (no toast), the others reason 'changed' with `by` = the leaver's name.
   * @param {import('./lobby.js').Room} room @param {string | null} goneId @param {string} [goneName]
   */
  onRoomChange(room, goneId, goneName) {
    const entry = this.entries.get(roomKey(room));
    if (!entry || entry.room !== room) return;
    if (goneId) sendSession(this.lobby.registry.byId(goneId), { t: 'room.queueState', queued: false, difficulty: entry.difficulty, ruleset: entry.ruleset, ...sizeOf(entry.cap), reason: 'left' });
    const reason = room.disposed ? null : 'changed';
    const why = { by: goneName ?? null };
    if (entry.group) { this.decline(entry.group, entry, reason, why); return; }
    this.drop(entry, reason, why);
    this.broadcastQueue(entry.qk);
  }

  shutdown() {
    for (const e of this.entries.values()) {
      this.clearOffline(e);
      if (e.group?.timer) { clearTimeout(e.group.timer); e.group.timer = null; }
      if (e.room) e.room.matching = false;
    }
    this.entries.clear();
    this.queues.clear();
    if (this.countsTimer) { clearTimeout(this.countsTimer); this.countsTimer = null; }
  }

  // ---------------------------------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------------------------------

  /** Form every group of four (eight in an 8-player queue) the queue allows (header). @param {string} qk */
  tryForm(qk) {
    const q = this.queueOf(qk);
    this.dropSeated(q);
    for (;;) {
      const live = q.filter((e) => this.online(e));
      const members = live.length ? this.pickFour(live, live[0].cap) : null;
      if (!members) break;
      this.form(members);
    }
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

  /** @param {Entry[]} members */
  form(members) {
    const { difficulty, ruleset, cap, qk } = members[0];
    const q = this.queueOf(qk);
    /** @type {Group} */
    const group = { id: ++this.groupSeq, difficulty, ruleset, cap, qk, members, ids: members.flatMap((e) => this.ids(e)), accepted: new Set(),
      deadline: this.lobby.now() + this.opts.queueConfirmMs, timer: null };
    for (const e of members) {
      q.splice(q.indexOf(e), 1);
      e.group = group;
      this.clearOffline(e);
    }
    group.timer = setTimeout(() => { group.timer = null; this.expire(group); }, this.opts.queueConfirmMs);
    group.timer.unref?.();
    const rooms = members.filter((e) => e.room).length;
    this.lobby.log.info(`[queue] ${difficulty}/${ruleset} group #${group.id}: ${group.ids.length} player(s) in ${members.length} entr${members.length === 1 ? 'y' : 'ies'} (${rooms} room(s)), confirming`);
    this.sendFound(group);
    this.broadcastQueue(qk);
  }

  /** The confirmation window ran out: entries with a silent human leave, the others go back to the front. */
  expire(group) {
    if (!this.live(group)) return;
    const done = (e) => this.ids(e).every((id) => group.accepted.has(id));
    const stay = group.members.filter(done);
    for (const e of group.members) if (!done(e)) this.drop(e, 'timeout', { accepted: group.accepted });
    this.dissolve(group, stay);
  }

  /** A member declined (or left / expired): its entry leaves the queue, every other entry goes back to the front. */
  decline(group, entry, reason, why = {}) {
    if (!this.live(group)) return OK;
    this.drop(entry, reason, why);
    this.dissolve(group, group.members.filter((e) => e !== entry));
    return OK;
  }

  /** @param {Group} group @param {Entry[]} back entries returned to the front of the queue, in their old order */
  dissolve(group, back) {
    this.endGroup(group);
    const q = this.queueOf(group.qk);
    for (const e of back) e.group = null;
    q.unshift(...back);
    q.sort((a, b) => a.joinedAt - b.joinedAt);
    this.broadcastQueue(group.qk);
    this.tryForm(group.qk);
  }

  /** Every human accepted: seat them in the group's first queued room (or a new room) and start its match (header). */
  launch(group) {
    const lobby = this.lobby;
    this.endGroup(group);
    const late = lobby.restartNotice?.startRefusal();
    const host = group.members.find((e) => e.room && !e.room.disposed && !e.room.match) || null;
    const code = late ? null : host ? host.room.code : lobby.rooms.size >= lobby.opts.maxRooms ? null : lobby.genCode();
    if (!code) {
      for (const e of group.members) this.drop(e, late ? 'restarting' : 'full');
      return OK;
    }
    // who moves where is read before any room changes; the entries go first, so the moves below cancel nothing
    const movers = group.members.filter((e) => e !== host).flatMap((e) => this.ids(e));
    for (const e of group.members) this.unlist(e);
    const room = host ? host.room : new this.Room(code, 'coop', group.difficulty, lobby.now(), group.cap);
    if (!host) room.ruleset = resolveRuleset(group.ruleset);
    const seated = [];
    for (const playerId of movers) {
      const session = lobby.registry.byId(playerId);
      const cur = session && lobby.roomOf(session);
      if (!session || (cur && (cur.match || cur === room))) continue;
      const idx = room.freeSeat();
      if (idx < 0) break;
      if (cur) lobby.removeMember(cur, playerId);
      room.seats[idx] = lobby.humanSeat(idx, session);
      session.roomCode = code;
      session.notice = null;
      session.pendingResult = null;
      seated.push(session);
    }
    if (!host) {
      if (!seated.length) return OK;
      room.ownerKey = seated[0].limitKey || null;
      room.hostId = seated[0].playerId;
      lobby.rooms.set(code, room);
    }
    const humans = room.activeHumans().length;
    lobby.log.info(`[lobby] ${code} matched (coop${group.cap > MAX_SEATS ? group.cap : ''}/${group.difficulty}/${group.ruleset}, ${humans} player(s)${host ? `, ${seated.length} joined the room` : ''}, group #${group.id})`);
    lobby.startMatch(room, room.ownerKey);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------------

  /** @param {string} qk a queue key (difficulty|ruleset) */
  queueOf(qk) {
    let q = this.queues.get(qk);
    if (!q) { q = []; this.queues.set(qk, q); }
    return q;
  }

  /** The entry the session waits in: its queued room's (a seated human), else its own. @returns {Entry | null} */
  entryOf(session) {
    const room = this.lobby.roomOf(session);
    if (room && room.seatOf(session.playerId)) {
      const e = this.entries.get(roomKey(room));
      if (e && e.room === room) return e;
    }
    return this.entries.get(session.playerId) || null;
  }

  /** The entry's humans (a room's: its seated humans in seat order). @param {Entry} entry @returns {string[]} */
  ids(entry) { return entry.room ? entry.room.activeHumans().map((s) => s.playerId) : [entry.playerId]; }

  size(entry) { return entry.room ? entry.room.activeHumans().length : 1; }

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

  /** Waiting single players who sit in a room now (an invitation link) leave the queue. */
  dropSeated(q) {
    for (const e of [...q]) {
      if (!e.playerId) continue;
      const session = this.lobby.registry.byId(e.playerId);
      if (session && this.lobby.roomOf(session)) this.drop(e, 'room');
    }
  }

  clearOffline(entry) {
    if (entry.offline) { clearTimeout(entry.offline); entry.offline = null; }
  }

  /** Take an entry out of the maps and its queue (a queued room: room.state `matching` false). */
  unlist(entry) {
    this.clearOffline(entry);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    if (!entry.group) {
      const q = this.queueOf(entry.qk);
      const i = q.indexOf(entry);
      if (i >= 0) q.splice(i, 1);
    }
    this.noteCounts();
    entry.group = null;
    if (entry.room) entry.room.matching = false;
  }

  /**
   * Remove an entry for good, telling its humans why (reason null: nobody to tell). In a room, the members other than
   * the one who acted (byId) hear who it was: 'left' → 'party', 'declined' → 'partyDeclined' (`by` = that member's
   * name); a 'timeout' tells the members who had accepted 'partyTimeout'; `by` (a leaver's name) rides along otherwise.
   * @param {Entry} entry @param {string | null} reason
   * @param {{ byId?: string, by?: string | null, accepted?: Set<string> }} [why]
   */
  drop(entry, reason, { byId = null, by = null, accepted = null } = {}) {
    const ids = this.ids(entry);
    const name = byId ? this.nameOf(entry, byId) : by;
    this.unlist(entry);
    if (entry.room && !entry.room.disposed) this.lobby.broadcastState(entry.room);
    if (!reason) return;
    for (const id of ids) {
      let code = reason;
      if (entry.room && byId && id !== byId) code = reason === 'declined' ? 'partyDeclined' : 'party';
      else if (entry.room && reason === 'timeout' && accepted?.has(id)) code = 'partyTimeout';
      const msg = { t: 'room.queueState', queued: false, difficulty: entry.difficulty, ruleset: entry.ruleset, ...sizeOf(entry.cap), reason: code };
      if (name != null && id !== byId && code !== 'partyTimeout') msg.by = name;
      sendSession(this.lobby.registry.byId(id), msg);
    }
  }

  /** A queued human's display name: the room seat's, else the session's. */
  nameOf(entry, playerId) {
    return entry.room?.seatOf(playerId)?.name ?? this.lobby.registry.byId(playerId)?.name ?? null;
  }

  /** @param {Entry} entry @param {string} [only] one of its humans */
  sendState(entry, only) {
    const now = this.lobby.now();
    const waited = Math.max(0, now - entry.joinedAt);
    let count = 0;
    for (const e of this.queueOf(entry.qk)) count += this.size(e);
    const msg = { t: 'room.queueState', queued: true, difficulty: entry.difficulty, ruleset: entry.ruleset, ...sizeOf(entry.cap), count, waitedMs: waited, party: !!entry.room };
    for (const id of only ? [only] : this.ids(entry)) sendSession(this.lobby.registry.byId(id), msg);
  }

  /** @param {string} qk */
  broadcastQueue(qk) {
    for (const e of this.queueOf(qk)) this.sendState(e);
    this.noteCounts();
  }

  /**
   * The humans waiting in every queue of a room size (header): { [ruleset]: { [difficulty]: n } }, every preset and
   * difficulty listed. @param {number} [cap] 4, or 8 for the 8-player queues
   * @returns {Record<string, Record<string, number>>}
   */
  counts(cap = MAX_SEATS) {
    /** @type {Record<string, Record<string, number>>} */
    const out = {};
    for (const p of QUEUE_PRESETS) out[p] = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0]));
    for (const q of this.queues.values()) {
      for (const e of q) {
        if (e.group || e.cap !== cap || !out[e.ruleset] || !(e.difficulty in out[e.ruleset])) continue;
        out[e.ruleset][e.difficulty] += this.size(e);
      }
    }
    return out;
  }

  /** A queue changed: send lobby.queueCounts when the counts did, at most once per countsMinGapMs (header). */
  noteCounts() {
    if (this.countsTimer) return;
    const wait = Math.max(0, this.countsAt + this.opts.countsMinGapMs - this.lobby.now());
    this.countsTimer = setTimeout(() => {
      this.countsTimer = null;
      const counts = this.counts();
      const counts8 = this.counts(LARGE_SEATS);
      const json = JSON.stringify([counts, counts8]);
      if (json === this.countsSent) return;
      this.countsSent = json;
      this.countsAt = this.lobby.now();
      this.lobby.broadcastQueueCounts(counts, counts8);
    }, wait);
    this.countsTimer.unref?.();
  }

  /** room.matchFound to every human of the group (or one), with the accept count so far. @param {Group} group @param {string} [only] */
  sendFound(group, only) {
    const inMs = Math.max(0, group.deadline - this.lobby.now());
    for (const id of only ? [only] : group.ids) {
      sendSession(this.lobby.registry.byId(id), {
        t: 'room.matchFound', difficulty: group.difficulty, ruleset: group.ruleset, ...sizeOf(group.cap), players: group.ids.length,
        accepted: group.accepted.size, mine: group.accepted.has(id), inMs,
      });
    }
  }
}

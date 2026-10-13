// server/matchmaking.js — 랜덤 매칭: a per-difficulty queue of co-op players (and co-op rooms with empty seats) that the
// lobby turns into a full room and a match (a remake feature; the upstream design left a matchmaking queue out of scope,
// docs/design/overview.md). The lobby (server/lobby.js) owns one Matchmaker and routes room.queue / room.queueRoom /
// room.unqueue / room.queueAccept to it, plus its session and room events (disconnect, resume, expiry, a member leaving
// a queued room, a room's disposal, shutdown).
//
// Rules (maintainer decisions 2026-10-13):
//   * One queue per difficulty, co-op only. Its entries are single players or rooms ("parties"):
//     - room.queue { difficulty } queues the player alone (switching difficulty moves the entry to the back of the other
//       queue); a player in a LOBBY room leaves the room (like room.create), one whose room is in a match is refused
//       (ROOM_STARTED).
//     - room.queueRoom {} (the host of a co-op LOBBY room with 1–3 humans) queues the room's humans together for the
//       room's difficulty, under the gate of room.start: every other human connected and ready (NOT_READY). The room's
//       AI seats are freed (matchmaking fills the seats with humans only). While the room is queued (room.state
//       `matching`) nobody may join it (ERR.MATCHING; spectating is fine) and the host may not change the difficulty,
//       add an AI seat or start (ERR.MATCHING); a human leaving the room (leave, kick, the lobby grace, a resume window
//       expiring) or its disposal cancels the room's entry (reason 'changed' to the others).
//     room.unqueue (any queued member) leaves the queue — for a room, the whole room: the sender gets reason 'left', the
//     other members 'party'. Every waiting player gets room.queueState whenever its queue changes (`count` = the humans
//     waiting for that difficulty, `party` = queued with a room).
//   * A group is always four humans (maintainer decision 2026-10-13: no AI fill, no smaller group). Formation walks the
//     queue in order and takes the first entries whose humans add up to exactly four, preferring the oldest entries
//     (an entry that does not fit is skipped, not dropped). An entry with an offline human is skipped.
//   * A formed group is confirmed: every human gets room.matchFound and answers room.queueAccept { accept } within
//     `queueConfirmMs` (15 s). All accepted → the match starts at once (no ready check: the confirmation was it):
//     - with a room in the group, in the first (oldest) such room: its members keep their seats, the others take its
//       free seats in queue order (players of another queued room leave that room, which closes empty); its host stays
//       the host;
//     - otherwise in a new co-op room, seated in queue order (the first is the host).
//     A human who declines, or has not answered when the time runs out, takes their entry out of the queue (a room
//     leaves whole: the others get reason 'party'); the other entries go back to the front of their queue, in their old
//     order, keeping their waiting time.
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

import { ERR, MAX_SEATS } from '../shared/constants.js';
import { sendSession } from './net.js';

export const QUEUE_DEFAULTS = Object.freeze({
  queueConfirmMs: 15_000,  // a formed group's room.queueAccept window
  queueGraceMs: 10_000,    // a disconnected waiting single player keeps the place this long
  maxQueuedPerAddr: 4,     // waiting single players from one client network (0 = unlimited)
});

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

/**
 * @typedef {{ key: string, playerId: string | null, room: import('./lobby.js').Room | null, difficulty: string,
 *   joinedAt: number, limitKey: string | null, group: Group | null, offline: NodeJS.Timeout | null }} Entry
 *   a single player (playerId) or a queued room (room); key = the playerId, or 'room:' + the room code
 * @typedef {{ id: number, difficulty: string, members: Entry[], ids: string[], accepted: Set<string>,
 *   deadline: number, timer: NodeJS.Timeout | null }} Group
 */

const roomKey = (room) => `room:${room.code}`;

export class Matchmaker {
  /**
   * @param {import('./lobby.js').Lobby} lobby
   * @param {{ Room: typeof import('./lobby.js').Room, options?: Partial<typeof QUEUE_DEFAULTS> }} deps
   */
  constructor(lobby, { Room, options = {} }) {
    this.lobby = lobby;
    this.Room = Room;
    this.opts = { ...QUEUE_DEFAULTS, ...options };
    /** @type {Map<string, Entry[]>} waiting entries by difficulty, in queue order */
    this.queues = new Map();
    /** @type {Map<string, Entry>} every entry (waiting or in a group) by key */
    this.entries = new Map();
    this.groupSeq = 0;
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

  /** room.queue { difficulty } — a single player. */
  queue(session, { difficulty }) {
    const lobby = this.lobby;
    const cur = lobby.roomOf(session);
    if (cur && cur.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    const had = this.entries.get(session.playerId);
    if (had?.group) return fail(ERR.ALREADY, 'a match was found: answer it first');
    if (had && had.difficulty === difficulty) { this.sendState(had); return OK; }
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
    if (had) this.drop(had, null); // moved to another difficulty: no queued:false in between
    /** @type {Entry} */
    const entry = { key: session.playerId, playerId: session.playerId, room: null, difficulty, joinedAt: lobby.now(), limitKey: key, group: null, offline: null };
    this.entries.set(entry.key, entry);
    this.queueOf(difficulty).push(entry);
    if (had) this.broadcastQueue(had.difficulty);
    this.broadcastQueue(difficulty);
    this.tryForm(difficulty);
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
    const had = this.entries.get(roomKey(room));
    if (had) { this.sendState(had); return OK; }
    const humans = room.activeHumans();
    if (humans.length >= MAX_SEATS) return fail(ERR.ROOM_FULL, 'no seat to fill');
    for (const s of humans) {
      if (s.playerId !== room.hostId && (!s.connected || !s.ready)) return fail(ERR.NOT_READY);
    }
    const late = lobby.restartNotice?.startRefusal();
    if (late) return late;
    for (const s of room.seats) if (s && s.isBot) room.seats[s.seat] = null; // humans only fill the seats
    for (const s of humans) lobby.dropReplay(room, s.playerId);
    /** @type {Entry} */
    const entry = { key: roomKey(room), playerId: null, room, difficulty: room.difficulty, joinedAt: lobby.now(), limitKey: session.limitKey || null, group: null, offline: null };
    this.entries.set(entry.key, entry);
    this.queueOf(entry.difficulty).push(entry);
    room.matching = true;
    lobby.log.info(`[queue] ${room.code} queued (${humans.length} player(s), ${entry.difficulty})`);
    lobby.broadcastState(room);
    this.broadcastQueue(entry.difficulty);
    this.tryForm(entry.difficulty);
    return OK;
  }

  /** room.unqueue — idempotent; inside a pending group it is a decline. */
  unqueue(session) {
    const entry = this.entryOf(session);
    if (!entry) return OK;
    if (entry.group) return this.decline(entry.group, entry, 'left', session.playerId);
    this.drop(entry, 'left', session.playerId);
    this.broadcastQueue(entry.difficulty);
    return OK;
  }

  /** room.queueAccept { accept } */
  accept(session, { accept }) {
    const entry = this.entryOf(session);
    const group = entry?.group;
    if (!group) return fail(ERR.WRONG_PHASE, 'no match to answer');
    if (!accept) return this.decline(group, entry, 'declined', session.playerId);
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
      this.broadcastQueue(entry.difficulty);
    }, this.opts.queueGraceMs);
    entry.offline.unref?.();
  }

  /** A resumed or repeated hello: resend what the player is waiting for. */
  onResume(session) {
    const entry = this.entryOf(session);
    if (!entry) return;
    this.clearOffline(entry);
    if (entry.group) this.sendFound(entry.group, session.playerId);
    else { this.sendState(entry, session.playerId); this.tryForm(entry.difficulty); }
  }

  onExpire(session) {
    const entry = this.entries.get(session.playerId); // a queued room's member: the lobby's removeMember follows
    if (!entry) return;
    if (entry.group) { this.decline(entry.group, entry, 'offline', null); return; }
    this.drop(entry, null);
    this.broadcastQueue(entry.difficulty);
  }

  /**
   * A queued room lost a human (lobby removeMember in LOBBY) or is being disposed: its entry is cancelled. The one who
   * left gets queued:false at once (no toast), the others reason 'changed'.
   * @param {import('./lobby.js').Room} room @param {string | null} goneId
   */
  onRoomChange(room, goneId) {
    const entry = this.entries.get(roomKey(room));
    if (!entry || entry.room !== room) return;
    if (goneId) sendSession(this.lobby.registry.byId(goneId), { t: 'room.queueState', queued: false, difficulty: entry.difficulty, reason: 'left' });
    const reason = room.disposed ? null : 'changed';
    if (entry.group) { this.decline(entry.group, entry, reason, null); return; }
    this.drop(entry, reason);
    this.broadcastQueue(entry.difficulty);
  }

  shutdown() {
    for (const e of this.entries.values()) {
      this.clearOffline(e);
      if (e.group?.timer) { clearTimeout(e.group.timer); e.group.timer = null; }
      if (e.room) e.room.matching = false;
    }
    this.entries.clear();
    this.queues.clear();
  }

  // ---------------------------------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------------------------------

  /** Form every group of four the difficulty's queue allows (header). */
  tryForm(difficulty) {
    const q = this.queueOf(difficulty);
    this.dropSeated(q);
    for (;;) {
      const members = this.pickFour(q.filter((e) => this.online(e)));
      if (!members) break;
      this.form(members);
    }
  }

  /**
   * The first entries, in queue order, whose humans add up to exactly MAX_SEATS (the earliest entries win: a depth-first
   * search that tries taking each entry before skipping it). @param {Entry[]} list @returns {Entry[] | null}
   */
  pickFour(list) {
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
    return dfs(0, MAX_SEATS) ? out : null;
  }

  /** @param {Entry[]} members */
  form(members) {
    const difficulty = members[0].difficulty;
    const q = this.queueOf(difficulty);
    /** @type {Group} */
    const group = { id: ++this.groupSeq, difficulty, members, ids: members.flatMap((e) => this.ids(e)), accepted: new Set(),
      deadline: this.lobby.now() + this.opts.queueConfirmMs, timer: null };
    for (const e of members) {
      q.splice(q.indexOf(e), 1);
      e.group = group;
      this.clearOffline(e);
    }
    group.timer = setTimeout(() => { group.timer = null; this.expire(group); }, this.opts.queueConfirmMs);
    group.timer.unref?.();
    const rooms = members.filter((e) => e.room).length;
    this.lobby.log.info(`[queue] ${difficulty} group #${group.id}: ${group.ids.length} player(s) in ${members.length} entr${members.length === 1 ? 'y' : 'ies'} (${rooms} room(s)), confirming`);
    this.sendFound(group);
    this.broadcastQueue(difficulty);
  }

  /** The confirmation window ran out: entries with a silent human leave, the others go back to the front. */
  expire(group) {
    if (!this.live(group)) return;
    const done = (e) => this.ids(e).every((id) => group.accepted.has(id));
    const stay = group.members.filter(done);
    for (const e of group.members) if (!done(e)) this.drop(e, 'timeout');
    this.dissolve(group, stay);
  }

  /** A member declined (or left / expired): its entry leaves the queue, every other entry goes back to the front. */
  decline(group, entry, reason, byId) {
    if (!this.live(group)) return OK;
    this.drop(entry, reason, byId);
    this.dissolve(group, group.members.filter((e) => e !== entry));
    return OK;
  }

  /** @param {Group} group @param {Entry[]} back entries returned to the front of the queue, in their old order */
  dissolve(group, back) {
    this.endGroup(group);
    const q = this.queueOf(group.difficulty);
    for (const e of back) e.group = null;
    q.unshift(...back);
    q.sort((a, b) => a.joinedAt - b.joinedAt);
    this.broadcastQueue(group.difficulty);
    this.tryForm(group.difficulty);
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
    const room = host ? host.room : new this.Room(code, 'coop', group.difficulty, lobby.now());
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
    lobby.log.info(`[lobby] ${code} matched (coop/${group.difficulty}, ${humans} player(s)${host ? `, ${seated.length} joined the room` : ''}, group #${group.id})`);
    lobby.startMatch(room, room.ownerKey);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------------

  queueOf(difficulty) {
    let q = this.queues.get(difficulty);
    if (!q) { q = []; this.queues.set(difficulty, q); }
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
      const q = this.queueOf(entry.difficulty);
      const i = q.indexOf(entry);
      if (i >= 0) q.splice(i, 1);
    }
    entry.group = null;
    if (entry.room) entry.room.matching = false;
  }

  /**
   * Remove an entry for good, telling its humans why (reason null: nobody to tell). A room's other members hear 'party'
   * when one of them (byId) left or declined.
   */
  drop(entry, reason, byId = null) {
    const ids = this.ids(entry);
    this.unlist(entry);
    if (entry.room && !entry.room.disposed) this.lobby.broadcastState(entry.room);
    if (!reason) return;
    for (const id of ids) {
      const why = byId && id !== byId && entry.room ? 'party' : reason;
      sendSession(this.lobby.registry.byId(id), { t: 'room.queueState', queued: false, difficulty: entry.difficulty, reason: why });
    }
  }

  /** @param {Entry} entry @param {string} [only] one of its humans */
  sendState(entry, only) {
    const now = this.lobby.now();
    const waited = Math.max(0, now - entry.joinedAt);
    let count = 0;
    for (const e of this.queueOf(entry.difficulty)) count += this.size(e);
    const msg = { t: 'room.queueState', queued: true, difficulty: entry.difficulty, count, waitedMs: waited, party: !!entry.room };
    for (const id of only ? [only] : this.ids(entry)) sendSession(this.lobby.registry.byId(id), msg);
  }

  broadcastQueue(difficulty) {
    for (const e of this.queueOf(difficulty)) this.sendState(e);
  }

  /** room.matchFound to every human of the group (or one), with the accept count so far. @param {Group} group @param {string} [only] */
  sendFound(group, only) {
    const inMs = Math.max(0, group.deadline - this.lobby.now());
    for (const id of only ? [only] : group.ids) {
      sendSession(this.lobby.registry.byId(id), {
        t: 'room.matchFound', difficulty: group.difficulty, players: group.ids.length,
        accepted: group.accepted.size, mine: group.accepted.has(id), inMs,
      });
    }
  }
}

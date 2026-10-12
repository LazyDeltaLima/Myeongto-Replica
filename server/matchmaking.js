// server/matchmaking.js — 랜덤 매칭: a per-difficulty queue of co-op players that the lobby turns into a room and a match
// (a remake feature; the upstream design left a matchmaking queue out of scope, docs/design/overview.md). The lobby
// (server/lobby.js) owns one Matchmaker and routes room.queue / room.unqueue / room.queueFallback / room.queueAccept to
// it, plus its session events (disconnect, resume, expiry, shutdown).
//
// Rules (maintainer decisions 2026-10-13):
//   * One queue per difficulty, co-op only. room.queue { difficulty } enters it (switching difficulty moves the entry to
//     the back of the other queue); a player in a LOBBY room leaves the room (like room.create), one whose room is in a
//     match is refused (ROOM_STARTED). room.unqueue leaves it. Every waiting player gets room.queueState whenever its
//     queue changes.
//   * Four connected waiting players, in queue order, form a group. ▸ A player who has waited `queueFallbackMs` (60 s)
//     may choose a fallback with room.queueFallback { fallback }: 'bots' (start now, the empty seats filled with AI
//     teammates) or 'humans' (start as soon as one more player chose a fallback, without AI); null keeps waiting for
//     four. Only players who chose a fallback join a smaller group: two or three of them start together (AI-filled only
//     when every one of them chose 'bots'); a lone 'bots' player starts with three AI teammates. The AI seats obey the
//     server's AI budgets (SP_MAX_BOTS / _TOTAL / _PER_ADDR, server/local-patch.js botCap) — a budget that is used up
//     leaves the seats empty instead of refusing the match.
//   * A formed group is confirmed: every member gets room.matchFound and answers room.queueAccept { accept } within
//     `queueConfirmMs` (15 s). All accepted → the lobby creates a co-op room with the members seated in queue order (the
//     first is the host), adds the AI seats and starts the match at once (no ready check: the confirmation was it). A
//     member who declines, or has not answered when the time runs out, leaves the queue (room.queueState { queued:
//     false, reason }); the others go back to the front of their queue, in their old order, keeping their waiting time
//     and fallback.
//   * A waiting player whose socket closes is skipped by group formation and leaves the queue after `queueGraceMs`
//     (10 s; a phone switching apps keeps its place); a resume within that time resends the queue state (or the pending
//     room.matchFound). The reconnect window expiring removes the entry at once. A player who ended up in a room some
//     other way (an invitation link) is dropped when a group would take them (reason 'room').
//   * Limits: at most `maxQueuedPerAddr` waiting players from one client network (internet clients only, net.js
//     clientAddress; room.queue → ERR.RATE); no queue entry and no match start during the deploy countdown's last
//     minutes (server/local-restart.js startRefusal → ERR.RESTARTING; a group that completes then is dissolved with
//     reason 'restarting').
//   * The queue lives in memory: a server restart forgets it (the client's queue screen closes on the new `welcome`).

import { ERR, MAX_SEATS } from '../shared/constants.js';
import { sendSession } from './net.js';
import * as localPatch from './local-patch.js';

export const QUEUE_DEFAULTS = Object.freeze({
  queueConfirmMs: 15_000,  // a formed group's room.queueAccept window
  queueFallbackMs: 60_000, // waiting time before room.queueFallback is accepted
  queueGraceMs: 10_000,    // a disconnected waiting player keeps the place this long
  maxQueuedPerAddr: 4,     // waiting players from one client network (0 = unlimited)
});

export const QUEUE_FALLBACKS = Object.freeze(['bots', 'humans']);

const OK = Object.freeze({ ok: true });
const fail = (code, detail) => (detail ? { error: code, detail } : { error: code });

/**
 * @typedef {{ playerId: string, difficulty: string, joinedAt: number, fallback: string | null, limitKey: string | null,
 *   group: Group | null, offline: NodeJS.Timeout | null }} Entry
 * @typedef {{ id: number, difficulty: string, members: Entry[], bots: number, accepted: Set<string>,
 *   deadline: number, timer: NodeJS.Timeout | null }} Group
 */

export class Matchmaker {
  /**
   * @param {import('./lobby.js').Lobby} lobby
   * @param {{ Room: typeof import('./lobby.js').Room, botNames: readonly string[], newBotId: (room: any) => string,
   *   options?: Partial<typeof QUEUE_DEFAULTS> }} deps
   */
  constructor(lobby, { Room, botNames, newBotId, options = {} }) {
    this.lobby = lobby;
    this.Room = Room;
    this.botNames = botNames;
    this.newBotId = newBotId;
    this.opts = { ...QUEUE_DEFAULTS, ...options };
    /** @type {Map<string, Entry[]>} waiting entries by difficulty, in queue order */
    this.queues = new Map();
    /** @type {Map<string, Entry>} every entry (waiting or in a group) by playerId */
    this.entries = new Map();
    this.groupSeq = 0;
  }

  /** Counters for /healthz-style status. */
  stats() {
    let waiting = 0;
    for (const q of this.queues.values()) waiting += q.length;
    return { waiting, confirming: this.entries.size - waiting };
  }

  // ---------------------------------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------------------------------

  /** room.queue { difficulty } */
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
      for (const e of this.entries.values()) if (e.limitKey === key) n++;
      if (n >= this.opts.maxQueuedPerAddr) {
        lobby.limitWarn(`queue limit (${this.opts.maxQueuedPerAddr}) reached for ${session.addr}`);
        return fail(ERR.RATE, 'too many queued players from your network');
      }
    }
    if (cur) lobby.removeMember(cur, session.playerId);
    session.notice = null;
    session.pendingResult = null;
    if (had) this.drop(had, null); // moved to another difficulty: no queued:false in between
    /** @type {Entry} */
    const entry = { playerId: session.playerId, difficulty, joinedAt: lobby.now(), fallback: null, limitKey: key, group: null, offline: null };
    this.entries.set(entry.playerId, entry);
    this.queueOf(difficulty).push(entry);
    if (had) this.broadcastQueue(had.difficulty);
    this.broadcastQueue(difficulty);
    this.tryForm(difficulty);
    return OK;
  }

  /** room.unqueue — idempotent; inside a pending group it is a decline. */
  unqueue(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return OK;
    if (entry.group) return this.decline(entry.group, entry, 'left');
    this.drop(entry, 'left');
    this.broadcastQueue(entry.difficulty);
    return OK;
  }

  /** room.queueFallback { fallback: 'bots' | 'humans' | null } */
  setFallback(session, { fallback }) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return fail(ERR.NOT_IN_ROOM, 'not queued');
    if (entry.group) return fail(ERR.WRONG_PHASE, 'a match was found');
    if (fallback != null && this.lobby.now() - entry.joinedAt < this.opts.queueFallbackMs) return fail(ERR.WRONG_PHASE, 'keep waiting a little longer');
    entry.fallback = fallback ?? null;
    this.sendState(entry);
    this.tryForm(entry.difficulty);
    return OK;
  }

  /** room.queueAccept { accept } */
  accept(session, { accept }) {
    const entry = this.entries.get(session.playerId);
    const group = entry?.group;
    if (!group) return fail(ERR.WRONG_PHASE, 'no match to answer');
    if (!accept) return this.decline(group, entry, 'declined');
    group.accepted.add(entry.playerId);
    if (group.accepted.size === group.members.length) return this.launch(group);
    this.sendFound(group);
    return OK;
  }

  // ---------------------------------------------------------------------------------------------------
  // Session events (from the lobby)
  // ---------------------------------------------------------------------------------------------------

  onDisconnect(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry || entry.group) return; // a group member may come back before its deadline
    this.clearOffline(entry);
    entry.offline = setTimeout(() => {
      entry.offline = null;
      if (this.entries.get(entry.playerId) !== entry || entry.group) return;
      this.drop(entry, 'offline');
      this.broadcastQueue(entry.difficulty);
    }, this.opts.queueGraceMs);
    entry.offline.unref?.();
  }

  /** A resumed or repeated hello: resend what the player is waiting for. */
  onResume(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return;
    this.clearOffline(entry);
    if (entry.group) this.sendFound(entry.group, entry);
    else { this.sendState(entry); this.tryForm(entry.difficulty); }
  }

  onExpire(session) {
    const entry = this.entries.get(session.playerId);
    if (!entry) return;
    if (entry.group) { this.decline(entry.group, entry, 'offline'); return; }
    this.drop(entry, null);
    this.broadcastQueue(entry.difficulty);
  }

  shutdown() {
    for (const e of this.entries.values()) {
      this.clearOffline(e);
      if (e.group?.timer) { clearTimeout(e.group.timer); e.group.timer = null; }
    }
    this.entries.clear();
    this.queues.clear();
  }

  // ---------------------------------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------------------------------

  /** Form every group the difficulty's queue allows (header). */
  tryForm(difficulty) {
    const q = this.queueOf(difficulty);
    this.dropSeated(q);
    for (;;) {
      const ready = q.filter((e) => this.online(e));
      if (ready.length >= MAX_SEATS) { this.form(ready.slice(0, MAX_SEATS), 0); continue; }
      const willing = ready.filter((e) => e.fallback);
      if (willing.length >= 2) {
        this.form(willing, willing.every((e) => e.fallback === 'bots') ? MAX_SEATS - willing.length : 0);
        continue;
      }
      if (willing.length === 1 && willing[0].fallback === 'bots') { this.form(willing, MAX_SEATS - 1); continue; }
      break;
    }
  }

  /** @param {Entry[]} members @param {number} bots */
  form(members, bots) {
    const difficulty = members[0].difficulty;
    bots = Math.min(bots, localPatch.maxBotsSetting() ?? bots); // the per-room cap shows in room.matchFound already
    const q = this.queueOf(difficulty);
    /** @type {Group} */
    const group = { id: ++this.groupSeq, difficulty, members, bots, accepted: new Set(), deadline: this.lobby.now() + this.opts.queueConfirmMs, timer: null };
    for (const e of members) {
      q.splice(q.indexOf(e), 1);
      e.group = group;
      this.clearOffline(e);
    }
    group.timer = setTimeout(() => { group.timer = null; this.expire(group); }, this.opts.queueConfirmMs);
    group.timer.unref?.();
    this.lobby.log.info(`[queue] ${difficulty} group #${group.id}: ${members.length} player(s) + ${bots} AI, confirming`);
    this.sendFound(group);
    this.broadcastQueue(difficulty);
  }

  /** The confirmation window ran out: the silent members leave, the others go back to the front. */
  expire(group) {
    if (!this.live(group)) return;
    const stay = group.members.filter((e) => group.accepted.has(e.playerId));
    for (const e of group.members) if (!group.accepted.has(e.playerId)) this.drop(e, 'timeout');
    this.dissolve(group, stay);
  }

  /** A member declined (or left / expired): it leaves the queue, every other member goes back to the front. */
  decline(group, entry, reason) {
    if (!this.live(group)) return OK;
    this.drop(entry, reason);
    this.dissolve(group, group.members.filter((e) => e !== entry));
    return OK;
  }

  /** @param {Group} group @param {Entry[]} back members returned to the front of the queue, in their old order */
  dissolve(group, back) {
    this.endGroup(group);
    const q = this.queueOf(group.difficulty);
    for (const e of back) e.group = null;
    q.unshift(...back);
    q.sort((a, b) => a.joinedAt - b.joinedAt);
    this.broadcastQueue(group.difficulty);
    this.tryForm(group.difficulty);
  }

  /** Every member accepted: create the room and start its match (header). */
  launch(group) {
    const lobby = this.lobby;
    this.endGroup(group);
    const late = lobby.restartNotice?.startRefusal();
    const code = late || lobby.rooms.size >= lobby.opts.maxRooms ? null : lobby.genCode();
    if (!code) {
      for (const e of group.members) this.drop(e, late ? 'restarting' : 'full');
      return OK;
    }
    const sessions = [];
    for (const e of group.members) {
      this.entries.delete(e.playerId);
      e.group = null;
      const session = lobby.registry.byId(e.playerId);
      const cur = session && lobby.roomOf(session);
      if (!session || (cur && cur.match)) continue;
      if (cur) lobby.removeMember(cur, e.playerId);
      sessions.push(session);
    }
    if (!sessions.length) return OK;
    const room = new this.Room(code, 'coop', group.difficulty, lobby.now());
    room.ownerKey = sessions[0].limitKey || null;
    sessions.forEach((session, idx) => {
      room.seats[idx] = lobby.humanSeat(idx, session);
      session.roomCode = code;
      session.notice = null;
      session.pendingResult = null;
    });
    room.hostId = sessions[0].playerId;
    lobby.rooms.set(code, room);
    let bots = 0;
    for (let n = 0; n < group.bots; n++) {
      const idx = room.freeSeat();
      if (idx < 0 || localPatch.botCap(room, lobby, sessions[0])) break;
      const used = new Set(room.seats.filter((s) => s && s.isBot).map((s) => s.name));
      const name = this.botNames.find((x) => !used.has(x)) || `AI·${idx + 1}`;
      room.seats[idx] = { seat: idx, playerId: this.newBotId(room), name, isBot: true, ready: true, connected: true, left: false };
      bots++;
    }
    lobby.log.info(`[lobby] ${code} matched (coop/${group.difficulty}, ${sessions.length} player(s) + ${bots} AI, group #${group.id})`);
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

  live(group) { return group.members.some((e) => this.entries.get(e.playerId) === e && e.group === group); }

  endGroup(group) {
    if (group.timer) { clearTimeout(group.timer); group.timer = null; }
  }

  online(entry) {
    const session = this.lobby.registry.byId(entry.playerId);
    return !!session && session.connected;
  }

  /** Waiting players who sit in a room now (an invitation link) leave the queue. */
  dropSeated(q) {
    for (const e of [...q]) {
      const session = this.lobby.registry.byId(e.playerId);
      if (session && this.lobby.roomOf(session)) this.drop(e, 'room');
    }
  }

  clearOffline(entry) {
    if (entry.offline) { clearTimeout(entry.offline); entry.offline = null; }
  }

  /** Remove an entry for good, telling its player why (reason null: nobody to tell). */
  drop(entry, reason) {
    this.clearOffline(entry);
    if (this.entries.get(entry.playerId) === entry) this.entries.delete(entry.playerId);
    if (!entry.group) {
      const q = this.queueOf(entry.difficulty);
      const i = q.indexOf(entry);
      if (i >= 0) q.splice(i, 1);
    }
    entry.group = null;
    if (reason) sendSession(this.lobby.registry.byId(entry.playerId), { t: 'room.queueState', queued: false, difficulty: entry.difficulty, reason });
  }

  /** @param {Entry} entry */
  sendState(entry) {
    const now = this.lobby.now();
    const waited = Math.max(0, now - entry.joinedAt);
    sendSession(this.lobby.registry.byId(entry.playerId), {
      t: 'room.queueState', queued: true, difficulty: entry.difficulty,
      count: this.queueOf(entry.difficulty).length, waitedMs: waited,
      fallbackInMs: Math.max(0, this.opts.queueFallbackMs - waited), fallback: entry.fallback,
    });
  }

  broadcastQueue(difficulty) {
    for (const e of this.queueOf(difficulty)) this.sendState(e);
  }

  /** room.matchFound to every member (or one), with the accept count so far. @param {Group} group @param {Entry} [only] */
  sendFound(group, only) {
    const inMs = Math.max(0, group.deadline - this.lobby.now());
    for (const e of only ? [only] : group.members) {
      sendSession(this.lobby.registry.byId(e.playerId), {
        t: 'room.matchFound', difficulty: group.difficulty, players: group.members.length, bots: group.bots,
        accepted: group.accepted.size, mine: group.accepted.has(e.playerId), inMs,
      });
    }
  }
}

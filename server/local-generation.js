// The server's generation for deploys without cutting running matches (docs/rules/ui.md 「무중단 배포」; the deploy
// script and the reverse proxy are not in this repository). Two servers may run side by side during a deploy: the new
// one takes every new visitor, the old one keeps only the matches that were running on it and ends its own process once
// none of them needs it any more.
//
//   gen       SP_GEN (a short name, e.g. `a` / `b`): the slot this server runs in. Unset = a single server (local runs,
//             npm start): no cookie, always 'accept', never drains by itself — everything below is inert.
//   state     'standby' (up, but the proxy sends no new visitor here) → 'accept' (new visitors) → 'drain' (no new room,
//             join, spectate, queue or match start; the running matches go on). The start state is SP_GEN_START
//             ('standby' | 'accept', default 'accept'). The deploy script moves it with the same signal as the restart
//             countdown: `accept` / `drain` / `standby` in the restart file + SIGUSR2 (server/http/boot.js).
//   cookie    every page (/ and *.html) carries `sp_gen=<gen>`: the proxy sends a page's later requests to the server it
//             came from. The page drops the cookie when it moves on (public/js/ui/generation.js).
//   routing   GET /healthz/accept → 200 while 'accept', else 503 (the proxy's health check for new visitors).
//             /healthz (inside) `gen` + `genState`; through the proxy `gen` + `draining`.
//   welcome   `gen: { id, state }`; going to 'drain' sends `server.gen { id, state }` to every socket.
//   drain     at once: every room without a running match is closed with room.closed {reason:'newVersion'} (the page
//             shows the notice and reloads onto the new server after 3 s), the matchmaking queue is dropped. Then a
//             check every 15 s ends the process (onDrained) when no room still needs this server:
//               * a running match while one of its seated humans is connected, or its last human dropped less than
//                 AWAY_MIN (10) minutes ago (a phone app switch); a match with no drop time known: under STALE_MIN (60)
//               * a room whose match ended during the drain, while a human is connected and for END_GRACE_MIN (10)
//                 minutes after the end (the settlement screen; the page moves on when it leaves it)
//             A run parked longer is not waited for (maintainer decision 2026-10-14, the same rule as the restart
//             countdown's wait). At DRAIN_CUT_MIN (150) the restart countdown starts for what is left (30 minutes,
//             server/local-restart.js), and the process ends when it is due: at most DRAIN_MAX_MIN (180) minutes.
//   handoff   SP_GEN_HANDOFF_DIR (a folder both servers of the deploy share; unset = no handoff) carries the waiting
//             rooms over (maintainer decision 2026-10-17: a reload for the new version brings the room's players back
//             together there). A draining server writes each waiting room it closes — and each room whose match ends
//             during the drain, once it is back in its lobby — as one file `<gen>-<ms>-<code>.json` (Lobby.roomSnapshot:
//             settings, seats, host, AI seats, every human's reconnect token; 0600, written whole then renamed) and
//             closes it with room.closed {reason:'newVersion', moved:true}. The other server reads the folder when a
//             hello brings a token it does not know (HandoffInbox; again only when the folder changed or RESCAN_MS
//             passed): the file holding that token is taken and deleted, the room is rebuilt there with its code (unless
//             it is in use) and every human disconnected for HANDOFF_GRACE_MIN (3) minutes (Lobby.adoptRoom), and the
//             hello resumes its seat like a reconnect — so do the others' hellos after their reloads. A file older than
//             HANDOFF_MAX_MIN (30) is deleted unread. A draining server takes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { ERR, PHASE } from '../shared/constants.js';
import { roomRow } from './local-rooms.js';

export const GEN_STATES = Object.freeze(['standby', 'accept', 'drain']);
export const AWAY_MIN = 10;
export const STALE_MIN = 60;
export const END_GRACE_MIN = 10;
export const DRAIN_CUT_MIN = 150;
export const DRAIN_MAX_MIN = 180;
export const DRAIN_CHECK_MS = 15_000;
export const HANDOFF_GRACE_MIN = 3;
export const HANDOFF_MAX_MIN = 30;
export const RESCAN_MS = 2000;
/** At most this many handoff files are read in one scan. */
const HANDOFF_MAX_FILES = 200;
/** The cookie that keeps a page on the server it came from. */
export const GEN_COOKIE = 'sp_gen';
const COOKIE_MAX_AGE_S = 24 * 3600;

/** SP_GEN → the generation name, or null (unset or not a short lowercase name). */
export function genName(env = process.env) {
  const s = String(env.SP_GEN ?? '').trim();
  return /^[a-z0-9]{1,8}$/.test(s) ? s : null;
}

/** The restart file's text → a generation state ('accept' | 'drain' | 'standby'), null when it is something else. */
export function parseGenControl(text) {
  const s = String(text ?? '').trim().toLowerCase();
  return GEN_STATES.includes(s) ? s : null;
}

/** Does this room still need the server (header 「drain」)? @param {any} room @param {number} now */
export function roomNeedsServer(room, now, endedAt = null) {
  const r = roomRow(room, now);
  if (r.phase === PHASE.LOBBY) {
    return endedAt != null && r.connected > 0 && now - endedAt < END_GRACE_MIN * 60_000;
  }
  if (r.connected > 0) return true;
  if (r.awayMin != null) return r.awayMin < AWAY_MIN;
  return r.matchMin != null && r.matchMin < STALE_MIN;
}

/** The handoff folder, read side (header 「handoff」): which file holds which token. */
export class HandoffInbox {
  /** @param {string} dir @param {() => number} now */
  constructor(dir, now) {
    this.dir = dir;
    this.now = now;
    this.mtime = null;
    this.scanAt = -Infinity;
    /** @type {Map<string, { file: string, at: number, from: string, room: any }>} token → its file */
    this.byToken = new Map();
  }

  /** The handoff file that holds `token`, or null. */
  find(token) {
    if (typeof token !== 'string' || !token) return null;
    this.refresh();
    const e = this.byToken.get(token);
    if (!e) return null;
    if (this.now() - e.at > HANDOFF_MAX_MIN * 60_000) { this.drop(e); return null; }
    return e;
  }

  refresh() {
    let st;
    try { st = fs.statSync(this.dir); } catch { return; }
    const now = this.now();
    if (st.mtimeMs === this.mtime && now - this.scanAt < RESCAN_MS) return;
    this.mtime = st.mtimeMs;
    this.scanAt = now;
    this.byToken.clear();
    let names;
    try { names = fs.readdirSync(this.dir).filter((n) => n.endsWith('.json')).slice(0, HANDOFF_MAX_FILES); } catch { return; }
    for (const name of names) {
      const file = path.join(this.dir, name);
      let doc = null;
      try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* a broken file is dropped below */ }
      const e = doc?.v === 1 && Number.isFinite(doc.at) && doc.room && typeof doc.room === 'object'
        ? { file, at: doc.at, from: String(doc.from ?? '?'), room: doc.room } : null;
      if (!e || now - e.at > HANDOFF_MAX_MIN * 60_000) { unlink(file); continue; }
      const people = [...(Array.isArray(e.room.seats) ? e.room.seats : []), ...(Array.isArray(e.room.spectators) ? e.room.spectators : [])];
      for (const p of people) if (p && !p.isBot && typeof p.token === 'string') this.byToken.set(p.token, e);
    }
  }

  /** Forget a file and delete it (taken, or too old). */
  drop(e) {
    unlink(e.file);
    for (const [token, x] of this.byToken) if (x === e) this.byToken.delete(token);
  }
}

function unlink(file) {
  try { fs.unlinkSync(file); } catch { /* gone already */ }
}

export class Generation {
  /**
   * @param {{ lobby: import('./lobby.js').Lobby, network: import('./net.js').Network,
   *           restart?: import('./local-restart.js').RestartNotice | null, log?: { info: Function },
   *           env?: Record<string, string | undefined>, checkMs?: number }} opts
   */
  constructor({ lobby, network, restart = null, log = { info() {} }, env = process.env, checkMs = DRAIN_CHECK_MS }) {
    this.lobby = lobby;
    this.network = network;
    this.restart = restart;
    this.log = log;
    this.checkMs = checkMs;
    /** @type {string | null} */
    this.id = genName(env);
    const start = String(env.SP_GEN_START ?? '').trim().toLowerCase();
    /** @type {'standby' | 'accept' | 'drain'} */
    this.state = this.id && start === 'standby' ? 'standby' : 'accept';
    /** @type {number | null} lobby clock ms when the drain began */
    this.drainAt = null;
    /** @type {Map<string, number>} room code → when its match ended during the drain */
    this.endedAt = new Map();
    /** called once when the drained server is no longer needed (server/http/boot.js ends the process) */
    this.onDrained = null;
    this.done = false;
    /** @type {NodeJS.Timeout | null} */
    this.timer = null;
    /** @type {string | null} the folder the waiting rooms are handed over through (header 「handoff」) */
    this.handoffDir = this.id ? String(env.SP_GEN_HANDOFF_DIR ?? '').trim() || null : null;
    this.inbox = this.handoffDir ? new HandoffInbox(this.handoffDir, () => this.lobby.now()) : null;
  }

  get draining() { return this.state === 'drain'; }

  /** Move to `state` (the restart file's word). Only a named generation moves; drain is one-way. */
  set(state) {
    if (!this.id) { this.log.info(`[gen] no SP_GEN: "${state}" ignored`); return false; }
    if (!GEN_STATES.includes(state) || state === this.state) return false;
    if (this.draining) { this.log.info(`[gen] ${this.id} is draining: "${state}" ignored`); return false; }
    this.state = /** @type {any} */ (state);
    this.log.info(`[gen] ${this.id} → ${state}`);
    if (state === 'drain') this.beginDrain();
    return true;
  }

  beginDrain() {
    const lobby = this.lobby;
    this.drainAt = lobby.now();
    lobby.queue?.shutdown();
    let closed = 0, moved = 0;
    for (const room of [...lobby.rooms.values()]) {
      if (room.match) continue;
      const handed = this.handOff(room);
      lobby.disposeRoom(room, 'newVersion', handed ? { moved: true } : null);
      closed++;
      if (handed) moved++;
    }
    const sent = this.broadcast();
    this.log.info(`[gen] ${this.id} drain: ${lobby.rooms.size} match(es) go on, ${closed} waiting room(s) closed (${moved} handed over), ${sent} socket(s) told`);
    this.timer = setInterval(() => this.check(), this.checkMs);
    this.timer.unref?.();
    this.check();
  }

  /** Lobby.onMatchEnd: a room whose match ended during the drain keeps the server for the settlement screen. */
  onMatchEnd(room) {
    if (!this.draining) return;
    this.endedAt.set(room.code, this.lobby.now());
    // its players move on from the settlement screen: the room waits for them on the new server (header 「handoff」),
    // written once the lobby has put it back in LOBBY (departed seats freed)
    setImmediate(() => { if (!room.disposed && !room.match) this.handOff(room); });
  }

  /** Write a waiting room for the new server (header 「handoff」). @returns {boolean} whether it was written */
  handOff(room) {
    if (!this.handoffDir) return false;
    try {
      const snap = this.lobby.roomSnapshot(room);
      if (!snap.seats.some((s) => s && !s.isBot)) return false;
      const at = this.lobby.now();
      const file = path.join(this.handoffDir, `${this.id}-${at}-${room.code}.json`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify({ v: 1, from: this.id, at, room: snap }), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      this.log.info(`[gen] ${this.id} handed ${room.code} over`);
      return true;
    } catch (e) {
      this.log.info(`[gen] ${this.id} could not hand ${room.code} over: ${e?.message || e}`);
      return false;
    }
  }

  /**
   * net.js does not know this hello's token: the room another server handed over with it, rebuilt here (header
   * 「handoff」). @returns {import('./net.js').Session | null} the token's session
   */
  adopt(token) {
    if (!this.inbox || this.draining) return null;
    const e = this.inbox.find(token);
    if (!e) return null;
    this.inbox.drop(e);
    const room = this.lobby.adoptRoom(e.room, HANDOFF_GRACE_MIN * 60_000);
    const as = room && room.code !== e.room.code ? ` as ${room.code}` : '';
    this.log.info(`[gen] ${this.id} took ${e.room.code}${as} from ${e.from}${room ? '' : ' — nothing to take'}`);
    return room ? this.lobby.registry.byToken(token) : null;
  }

  /** The rooms that still need this server. */
  waitingRooms() {
    const now = this.lobby.now();
    return [...this.lobby.rooms.values()].filter((r) => roomNeedsServer(r, now, this.endedAt.get(r.code) ?? null));
  }

  /** The drain's periodic check (header). */
  check() {
    if (!this.draining || this.done) return;
    const now = this.lobby.now();
    const waiting = this.waitingRooms().length;
    if (!waiting) { this.finish('no room needs this server'); return; }
    const r = this.restart;
    if (r && r.at == null && now - this.drainAt >= DRAIN_CUT_MIN * 60_000) {
      this.log.info(`[gen] ${this.id} drain: ${waiting} room(s) left after ${DRAIN_CUT_MIN} min — restart countdown`);
      r.schedule(DRAIN_MAX_MIN - DRAIN_CUT_MIN);
    }
    if (r && r.at != null && r.inMs() === 0) this.finish(`${waiting} room(s) left at the end of the countdown`);
  }

  finish(why) {
    this.done = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.log.info(`[gen] ${this.id} drained (${why}) — stopping`);
    this.onDrained?.();
  }

  /** Room starts are refused while draining (Lobby / matchmaking through RestartNotice.startRefusal). */
  refusal() { return this.draining ? { error: ERR.NEW_VERSION } : null; }

  /** Extra welcome fields: the generation of a named server. */
  welcomeInfo() { return this.id ? { gen: { id: this.id, state: this.state } } : null; }

  /** Tell every socket that has said hello. */
  broadcast() {
    const msg = { t: 'server.gen', id: this.id, state: this.state };
    let n = 0;
    for (const conn of this.network.conns.values()) {
      if (conn.session && !conn.closing && this.network.reply(conn, msg)) n++;
    }
    return n;
  }

  /** The Set-Cookie value for a page, null for an unnamed server. @param {boolean} secure */
  cookie(secure) {
    if (!this.id) return null;
    return `${GEN_COOKIE}=${this.id}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; SameSite=Lax${secure ? '; Secure' : ''}`;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

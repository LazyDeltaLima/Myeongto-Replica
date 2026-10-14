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

import { ERR, PHASE } from '../shared/constants.js';
import { roomRow } from './local-rooms.js';

export const GEN_STATES = Object.freeze(['standby', 'accept', 'drain']);
export const AWAY_MIN = 10;
export const STALE_MIN = 60;
export const END_GRACE_MIN = 10;
export const DRAIN_CUT_MIN = 150;
export const DRAIN_MAX_MIN = 180;
export const DRAIN_CHECK_MS = 15_000;
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
    let closed = 0;
    for (const room of [...lobby.rooms.values()]) {
      if (room.match) continue;
      lobby.disposeRoom(room, 'newVersion');
      closed++;
    }
    const sent = this.broadcast();
    this.log.info(`[gen] ${this.id} drain: ${lobby.rooms.size} match(es) go on, ${closed} waiting room(s) closed, ${sent} socket(s) told`);
    this.timer = setInterval(() => this.check(), this.checkMs);
    this.timer.unref?.();
    this.check();
  }

  /** Lobby.onMatchEnd: a room whose match ended during the drain keeps the server for the settlement screen. */
  onMatchEnd(room) {
    if (this.draining) this.endedAt.set(room.code, this.lobby.now());
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

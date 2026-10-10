// The server-restart countdown before a deploy (docs/rules/ui.md 「서버 재시작 예고」; the deploy script is not in this
// repository). The deploy script builds the new image while this server keeps running, then starts the countdown and
// recreates the container when it ends; this module only announces it — it never stops the server itself.
//
//   trigger   SIGUSR2 (server/http/boot.js) → read restartFile(): the minutes until the restart (`30`), or `0` / `cancel`
//             to call it off. Inside the container: echo 30 > /tmp/stronghold-restart && kill -USR2 1
//   message   server.restart { inMs, mark? } to every connected socket — at the start and at each RESTART_MARKS_MIN mark
//             (`mark` = those minutes: the client toasts them); { inMs: null } = called off. A socket that says hello
//             during the countdown gets `restart: { inMs }` in its welcome (the client toasts the minutes left once).
//             inMs is relative: the client works on its own clock.
//   /healthz  restartInSec (internal answers only; null when nothing is planned) — the deploy script waits on it.
//   room.start  refused (ERR.RESTARTING) in the last RESTART_FINAL_MIN (5) minutes — SP_RESTART_NO_START_MIN overrides, 0 = off.
// The countdown is forgotten STALE_MS after it ended (a deploy that died after the countdown): everyone gets { inMs: null }.

import os from 'node:os';
import path from 'node:path';
import { ERR } from '../shared/constants.js';
import { RESTART_FINAL_MIN } from '../shared/local.js';

/** The minutes before the restart at which every connected player is told again (the first notice comes at the start). */
export const RESTART_MARKS_MIN = Object.freeze([30, 10, 5, 3, 1]);
const STALE_MS = 10 * 60_000;
const MAX_MINUTES = 24 * 60;

/**
 * How many minutes before the restart room.start is refused (ERR.RESTARTING): RESTART_FINAL_MIN (maintainer 2026-10-09:
 * 「재시작 직전 5분 전에 판을 막고」), or SP_RESTART_NO_START_MIN when set (0 = never).
 */
export function noStartMinutes(env = process.env) {
  if (env.SP_RESTART_NO_START_MIN == null || env.SP_RESTART_NO_START_MIN === '') return RESTART_FINAL_MIN;
  const n = Number(env.SP_RESTART_NO_START_MIN);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The file SIGUSR2 reads (SP_RESTART_FILE, else <tmpdir>/stronghold-restart — /tmp is the container's tmpfs). */
export const restartFile = (env = process.env) => env.SP_RESTART_FILE || path.join(os.tmpdir(), 'stronghold-restart');

/** The file's text → minutes until the restart (> 0), 0 to cancel, null when unreadable. */
export function parseRestartFile(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (s === 'cancel' || s === 'off') return 0;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= MAX_MINUTES ? n : null;
}

export class RestartNotice {
  /**
   * @param {{ network: import('./net.js').Network, log?: { info: Function }, now?: () => number,
   *           marks?: readonly number[], noStartMin?: number }} opts
   */
  constructor({ network, log = { info() {} }, now = Date.now, marks = RESTART_MARKS_MIN, noStartMin = noStartMinutes() }) {
    this.network = network;
    this.noStartMs = noStartMin * 60_000;
    this.log = log;
    this.now = now;
    this.marks = marks;
    /** @type {number | null} wall-clock ms of the restart */
    this.at = null;
    /** @type {NodeJS.Timeout[]} */
    this.timers = [];
  }

  /** ms until the restart (0 once it is due), null when none is planned. */
  inMs() { return this.at == null ? null : Math.max(0, this.at - this.now()); }

  /** Start (or move) the countdown: the restart comes `minutes` from now; 0 calls it off. */
  schedule(minutes) {
    if (!(minutes > 0)) { this.cancel(); return; }
    this.clearTimers();
    const ms = Math.round(minutes * 60_000);
    this.at = this.now() + ms;
    this.log.info(`[restart] server restart in ${minutes} min`);
    this.broadcast(Math.ceil(minutes));
    for (const m of this.marks) {
      const wait = ms - m * 60_000;
      if (wait > 1000) this.later(wait, () => this.broadcast(m));
    }
    this.later(ms + STALE_MS, () => { this.log.info('[restart] countdown ended without a restart — cleared'); this.cancel(); });
  }

  /** Call the countdown off (tells everyone when one was running). */
  cancel() {
    this.clearTimers();
    if (this.at == null) return;
    this.at = null;
    this.log.info('[restart] server restart cancelled');
    this.broadcast(null);
  }

  /** Lobby.start: the refusal when a new match would start within noStartMin of the restart, else null. */
  startRefusal() {
    const inMs = this.inMs();
    return this.noStartMs > 0 && inMs != null && inMs <= this.noStartMs ? { error: ERR.RESTARTING } : null;
  }

  /** Extra welcome fields (Lobby.welcomeInfo): the running countdown, nothing otherwise. */
  welcomeInfo() {
    const inMs = this.inMs();
    return inMs == null ? null : { restart: { inMs } };
  }

  /** Tell every socket that has said hello. @param {number | null} mark minutes for the toast; null = state only */
  broadcast(mark) {
    const inMs = this.inMs();
    const msg = inMs == null ? { t: 'server.restart', inMs: null } : { t: 'server.restart', inMs, ...(mark ? { mark } : null) };
    let n = 0;
    for (const conn of this.network.conns.values()) {
      if (conn.session && !conn.closing && this.network.reply(conn, msg)) n++;
    }
    return n;
  }

  close() { this.clearTimers(); }

  later(ms, fn) {
    const timer = setTimeout(fn, ms);
    timer.unref?.();
    this.timers.push(timer);
  }

  clearTimers() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}

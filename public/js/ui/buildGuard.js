// public/js/ui/buildGuard.js — the "this page is running an outdated build" guard.
//
// WHY: every module a page imports lives in its module map for the whole page lifetime, so a deploy can never reach an
// already-open tab — not even a client-only one, which is served `Cache-Control: no-cache` and would be picked up by a
// reload. A client-only battle fix shipped exactly that way and stayed invisible on the reporting player's page: the
// nginx log shows the page loaded the PRE-fix module blob and made no module request at all for the rest of the session.
//
// HOW: the server stamps a short hash of the runtime it serves into `/healthz.build` (server/http/buildTag.js).
// The first successful check of a page records that tag as "the build this page runs" — IN MEMORY, because one page is
// one set of loaded modules: nothing must survive a reload, and a duplicated tab must not inherit the first tab's tag.
// A later check reporting a DIFFERENT tag means the server changed under this page:
//   * outside a match the page reloads itself, once;
//   * during a match the guard never throws the player's game away — `onStale` fires (the connection banner offers
//     刷新页面) and the reload happens by itself as soon as the match, settlement screen included, is over.
// A check that cannot read a build (`/healthz` down or restarting, no `build` field, no answer in time) is 'unknown' and
// NEVER reloads: a restarting server must not turn a playing page into the browser's error page. A new tag is acted on
// only after two checks in a row report the SAME one, so a deploy that is still copying files cannot ping-pong a page.
//
// Kept dependency-free and injectable (fetch / reload / inMatch / timers) so test/ui/buildGuard.test.js can drive it.

/** How often a page re-asks the server for its build tag. */
export const BUILD_CHECK_MS = 60_000;
/** Give up on a `/healthz` that does not answer: a request left hanging must not stop the guard from ever checking again. */
export const BUILD_FETCH_TIMEOUT_MS = 5_000;
/** How many checks in a row must report the same NEW build before the page acts on it. */
export const BUILD_CONFIRMATIONS = 2;
/** burst(): the extra checks right after a known restart, this far apart — the new server is already up when it says welcome. */
export const BURST_CHECK_MS = 3_000;
export const BURST_CHECKS = 4;

/**
 * @typedef {(url: string, init: RequestInit) => Promise<{ ok: boolean, json: () => Promise<unknown> } | null | undefined>} BuildFetch
 * @typedef {(fn: (...args: unknown[]) => void, ms: number) => unknown} SetTimer  setTimeout / setInterval (or a test's clock)
 * @typedef {(handle: unknown) => void} ClearTimer  clearTimeout / clearInterval
 */

/**
 * Fetch `/healthz` and return its `build` tag (null when unavailable, not reported, or too slow). Never throws.
 * @param {BuildFetch} fetchFn @param {{ timeoutMs?: number, setTimeout?: SetTimer, clearTimeout?: ClearTimer }} [o]
 * @returns {Promise<string|null>}
 */
export async function fetchBuild(fetchFn, o = {}) {
  const timeoutMs = Number.isFinite(o.timeoutMs) && /** @type {number} */ (o.timeoutMs) > 0 ? /** @type {number} */ (o.timeoutMs) : BUILD_FETCH_TIMEOUT_MS;
  const setT = o.setTimeout || ((/** @type {(...args: unknown[]) => void} */ fn, /** @type {number} */ ms) => globalThis.setTimeout(fn, ms));
  const clearT = o.clearTimeout || ((/** @type {unknown} */ h) => globalThis.clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (h)));
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  /** @type {unknown} */
  let timer = null;
  /** @type {Promise<never>} */
  const tooSlow = new Promise((_, reject) => {
    timer = setT(() => { try { ctrl?.abort(); } catch { /* ignore */ } reject(new Error('timeout')); }, timeoutMs);
  });
  try {
    const res = await Promise.race([fetchFn('/healthz', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined }), tooSlow]);
    if (!res || !res.ok) return null;
    const body = /** @type {{ build?: unknown } | null} */ (await res.json());
    return body && typeof body.build === 'string' && body.build ? body.build : null;
  } catch {
    return null;
  } finally {
    if (timer != null) clearT(timer);
  }
}

/**
 * One check, against the build this page already knows.
 * @param {{ fetchFn?: BuildFetch, known?: string|null, timeoutMs?: number, setTimeout?: SetTimer, clearTimeout?: ClearTimer }} [o]
 * @returns {Promise<{ status: 'first'|'current'|'new'|'unknown', build: string|null }>}
 */
export async function checkBuildOnce(o = {}) {
  const fetchFn = o.fetchFn || ((/** @type {string} */ url, /** @type {RequestInit} */ init) => globalThis.fetch(url, init));
  const build = await fetchBuild(fetchFn, o);
  if (!build) return { status: 'unknown', build: null };            // unreachable / not reported: never a reload
  if (!o.known) return { status: 'first', build };
  return { status: o.known === build ? 'current' : 'new', build };
}

/**
 * Watch for a new build.
 * @param {{ fetchFn?: BuildFetch, reload?: () => void, inMatch?: () => boolean, intervalMs?: number, timeoutMs?: number,
 *           setInterval?: SetTimer, clearInterval?: ClearTimer, setTimeout?: SetTimer, clearTimeout?: ClearTimer,
 *           onStale?: (info: { build: string, known: string|null, waiting: boolean }) => void }} [o]
 * @returns {{ stop: () => void, check: () => Promise<object>, burst: (n?: number) => Promise<void>, stale: () => boolean, known: () => string|null }}
 */
export function startBuildGuard(o = {}) {
  const fetchFn = o.fetchFn || ((/** @type {string} */ url, /** @type {RequestInit} */ init) => globalThis.fetch(url, init));
  const reload = o.reload || (() => globalThis.location.reload());
  const inMatch = typeof o.inMatch === 'function' ? o.inMatch : () => false;
  const setIv = o.setInterval || ((/** @type {(...args: unknown[]) => void} */ fn, /** @type {number} */ ms) => globalThis.setInterval(fn, ms));
  const clearIv = o.clearInterval || ((/** @type {unknown} */ h) => globalThis.clearInterval(/** @type {ReturnType<typeof setInterval>} */ (h)));
  const intervalMs = Number.isFinite(o.intervalMs) && /** @type {number} */ (o.intervalMs) > 0 ? /** @type {number} */ (o.intervalMs) : BUILD_CHECK_MS;
  /** @type {string | null} */
  let known = null;      // the build this page runs — memory only (one page == one set of loaded modules)
  /** @type {string | null} */
  let candidate = null;  // the last new build seen; needs BUILD_CONFIRMATIONS checks in a row to be acted on
  let seen = 0;          // consecutive checks that reported `candidate`
  let stale = false;     // a new build is confirmed → reload as soon as no match is on screen
  let pending = false;
  /** @type {unknown} */
  let timer = null;
  let stopped = false;

  const stopTimer = () => { if (timer != null) { clearIv(timer); timer = null; } };
  const reloadNow = () => { stopped = true; stopTimer(); reload(); };

  const check = async () => {
    if (stopped) return { status: 'stopped', build: null };
    if (pending) return { status: 'pending', build: null };
    pending = true;
    let r;
    try { r = await checkBuildOnce({ fetchFn, known, timeoutMs: o.timeoutMs, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout }); }
    finally { pending = false; }
    if (stopped) return { status: 'stopped', build: null };
    if (r.status === 'unknown') { candidate = null; seen = 0; return r; }   // review: a failed check never reloads
    if (r.status === 'first') { known = r.build; return r; }
    if (r.status === 'current') { candidate = null; seen = 0; return r; }
    // a different build: only BUILD_CONFIRMATIONS checks in a row with the SAME tag count (a deploy that is still
    // copying files exposes a tag that keeps moving, and must not ping-pong the page)
    if (candidate !== r.build) { candidate = r.build; seen = 1; } else { seen++; }
    if (seen < BUILD_CONFIRMATIONS) return { status: 'new', build: r.build };
    const first = !stale;
    stale = true;
    const waiting = inMatch();
    if (first) { try { o.onStale?.({ build: /** @type {string} */ (r.build), known, waiting }); } catch { /* ignore */ } }
    if (!waiting) reloadNow();
    return { status: 'stale', build: r.build, known };
  };

  const tick = () => { check().catch(() => {}); };
  check().catch(() => {});
  timer = setIv(tick, intervalMs);
  // A restart the page heard of (ui/restartNotice.js onRestarted) is over: check now and a few times BURST_CHECK_MS apart
  // instead of waiting up to two intervals. The same rules hold — two agreeing checks, never on 'unknown', a match waits.
  const setT = o.setTimeout || ((/** @type {(...args: unknown[]) => void} */ fn, /** @type {number} */ ms) => globalThis.setTimeout(fn, ms));
  const burst = async (n = BURST_CHECKS) => {
    for (let i = 0; i < n && !stopped && !stale; i++) {
      if (i > 0) await new Promise((r) => setT(r, BURST_CHECK_MS));
      if (stopped || stale) break;
      await check().catch(() => {});
    }
  };
  return {
    stop: () => { stopped = true; stopTimer(); },
    check,
    burst,
    stale: () => stale,
    known: () => known,
  };
}

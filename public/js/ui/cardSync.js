// 名片干员 sync (ui/seatArt.js; server/lobby.js header 「名片干员」): `room.card { charId }` after every `welcome` (new or
// resumed session — the server keeps it on the session, so joining a room needs no resend) and after every pick. RATE /
// TIMEOUT / OFFLINE → tried again later; anything else (an operator the server's data does not have: BAD_MSG) is logged and
// left — the card then shows the default operator. `cardSync` ∈ 'idle' | 'sending' | 'synced' | 'error' mirrors it into
// the store. Cosmetic: no phase gate, so a pick during a match is never refused for its phase.

import { cardStore, CARD_KEY, CARD_SYNC_KEY } from './seatArt.js';

/** How long a refused send (RATE / TIMEOUT / OFFLINE) waits before it is tried again (ms). */
export const CARD_RETRY_MS = 1500;

/**
 * @typedef {{ status: string, request: (type: string, body: object) => Promise<unknown>,
 *   on: (event: string, fn: () => void) => (() => void) | undefined }} CardNet  the client net (net.js), the members used here
 * @typedef {{ net: CardNet, target?: typeof cardStore,
 *   timers?: { setTimeout: (fn: () => void, ms: number) => unknown, clearTimeout: (handle: unknown) => void } }} CardSyncDeps
 */

/**
 * Wire the 名片干员 sync once (main.js). Dependencies are injectable for tests.
 * @param {CardSyncDeps} deps
 */
export function installCardSync({ net, target = cardStore, timers } = /** @type {CardSyncDeps} */ ({})) {
  const T = timers || { setTimeout: (/** @type {() => void} */ fn, /** @type {number} */ ms) => globalThis.setTimeout(fn, ms), clearTimeout: (/** @type {unknown} */ id) => globalThis.clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (id)) };
  /** @type {unknown} */
  let timer = null;
  let seq = 0;
  /** @type {string | null} */
  let lastSent = null; // the pick the server accepted on this session
  const setState = (/** @type {string} */ s) => { if (target.get()[CARD_SYNC_KEY] !== s) target.set({ [CARD_SYNC_KEY]: s }); };
  const later = (/** @type {number} */ ms) => { T.clearTimeout(timer); timer = T.setTimeout(() => { timer = null; void send(); }, ms); };

  async function send() {
    if (net.status !== 'online') { setState('idle'); return; } // the next welcome sends it
    const charId = String(target.get()[CARD_KEY] || '');
    if (charId === lastSent) { setState('synced'); return; }
    const my = ++seq;
    setState('sending');
    try {
      await net.request('room.card', { charId });
      if (my !== seq) return;
      lastSent = charId;
      setState('synced');
    } catch (err) {
      if (my !== seq) return;
      const code = err && (/** @type {{ code?: unknown }} */ (err)).code;
      if (code === 'RATE' || code === 'TIMEOUT' || code === 'OFFLINE') later(CARD_RETRY_MS);
      else { console.warn('[card] room.card refused', code, err && (/** @type {{ detail?: unknown }} */ (err)).detail); setState('error'); }
    }
  }

  const offWelcome = net.on('welcome', () => { lastSent = null; seq++; later(50); });
  const offStore = target.subscribe((s, prev) => { if (s[CARD_KEY] !== prev[CARD_KEY]) later(0); });
  return {
    send,
    dispose() { T.clearTimeout(timer); offWelcome?.(); offStore?.(); },
  };
}

// The deploy's server generation, page side (server/local-generation.js; docs/rules/ui.md 「무중단 배포」). During a deploy
// two servers run side by side: the old one keeps the matches that run on it, the new one takes everyone else. This
// page stays on the server it came from until it can move without throwing a game away:
//
//   * welcome `gen: { id }` names the server; the socket reconnects with `/ws?gen=<id>` and the build guard asks
//     `/healthz?gen=<id>` (genUrl), so the proxy keeps THIS tab on its server even when another tab changed the
//     browser-wide `sp_gen` cookie (the page and its files follow the cookie).
//   * the server starts draining (server.gen { state: 'drain' }, or a welcome that says so), a waiting room is closed for
//     the new version (room.closed {reason:'newVersion'}), or a request is refused with NEW_VERSION → the page moves:
//     the banner says so, and MOVE_DELAY_MS (3 s, maintainer decision 2026-10-14) later the page drops the cookie and
//     reloads onto the new server. A match on screen (settlement included) waits for its end without a banner (the
//     old server keeps serving it, the player has nothing to do; maintainer decision 2026-10-17): once it is over the
//     banner shows and the page moves MOVE_DELAY_MS later.
//   * a waiting room the old server handed over to the new one (room.closed {reason:'newVersion', moved:true},
//     server/local-generation.js 「handoff」) stays on screen while the page moves; the reloaded page resumes its seat
//     there with its old reconnect token.
//   * what the page shows (maintainer decision 2026-10-17: a plain reload read as a lost connection): while it moves,
//     ui.genMove 'soon' / 'room' (its room moves too) — the 「서버가 새 버전으로 업데이트됩니다」 dialog
//     (ui/updateNotice.js); right before the reload the page leaves MOVED_KEY in sessionStorage (its version, whether
//     it had a room), and the reloaded page tells the player it is the new version now (takeMoved → ui.updated).
//   * another tab of this browser that plays a match on the same old server keeps the cookie (a reload of that tab, or
//     the files it still loads, must reach the old server): before moving, the page asks the other tabs over the
//     BroadcastChannel CHANNEL; a tab in a match on that server answers busy and this page waits (banner), asking again
//     every TAB_RETRY_MS, until that match is over (maintainer decision 2026-10-14).
// A page from an unnamed server (local runs) never gets `gen` and nothing here acts.

import { store } from '../store.js';
import { APP_VERSION } from '../../../shared/constants.js';

export const MOVE_DELAY_MS = 3000;
export const TAB_ASK_MS = 300;
export const TAB_RETRY_MS = 10_000;
export const MATCH_POLL_MS = 2000;
export const CHANNEL = 'sp-gen';
export const GEN_COOKIE = 'sp_gen';
/** sessionStorage: the move the page made, read once by the reloaded page (takeMoved). */
export const MOVED_KEY = 'sp-gen-moved';
/** A move left longer ago than this is not reported (a tab restored much later). */
export const MOVED_MAX_MS = 5 * 60_000;

/**
 * The move the previous page of this tab made (header), once: `{ from, room }` — the version it ran and whether it was
 * in a room — or null. @param {Storage | null} [storage] @param {number} [now]
 */
export function takeMoved(storage = globalThis.sessionStorage ?? null, now = Date.now()) {
  let raw;
  try { raw = storage?.getItem(MOVED_KEY) ?? null; storage?.removeItem(MOVED_KEY); } catch { return null; }
  let m;
  try { m = raw ? JSON.parse(raw) : null; } catch { return null; }
  if (!m || typeof m.from !== 'string' || !Number.isFinite(m.at) || now - m.at < 0 || now - m.at > MOVED_MAX_MS) return null;
  return { from: m.from.slice(0, 20), room: m.room === true };
}

/** The page's generation (the last installGeneration's), for genUrl's default. */
let current = null;

/** This page's server generation (welcome `gen.id`), null on an unnamed server. */
export const pageGen = () => current;

/** `url` with this page's `?gen=` (or `&gen=`) when the server is named. @param {string} url */
export function genUrl(url, gen = current) {
  if (!gen) return url;
  return `${url}${url.includes('?') ? '&' : '?'}gen=${encodeURIComponent(gen)}`;
}

/**
 * @param {{ net: { on: Function, url: string | null }, inMatch: () => boolean, wsUrl: () => string,
 *           reload?: () => void, dropCookie?: () => void, makeChannel?: (name: string) => any,
 *           remember?: (moved: { from: string, room: boolean, at: number }) => void, inRoom?: () => boolean,
 *           setTimeout?: Function, clearTimeout?: Function }} deps
 */
export function installGeneration({ net, inMatch, wsUrl, reload, dropCookie, makeChannel, remember, inRoom, setTimeout: setT, clearTimeout: clearT }) {
  const doReload = reload || (() => globalThis.location.reload());
  const keep = remember || ((m) => globalThis.sessionStorage?.setItem(MOVED_KEY, JSON.stringify(m)));
  const hasRoom = inRoom || (() => !!store.get().room);
  const forget = dropCookie || (() => { globalThis.document.cookie = `${GEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`; });
  const later = setT || ((fn, ms) => globalThis.setTimeout(fn, ms));
  const cancel = clearT || ((h) => globalThis.clearTimeout(h));
  let channel = null;
  try {
    channel = (makeChannel || ((name) => (typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null)))(CHANNEL);
  } catch { channel = null; }
  let gen = null;       // this install's generation (welcome `gen.id`)
  let moving = false;   // a move is under way (the delay, a match, another tab)
  let gone = false;     // reloading
  let timer = null;
  let busySeen = false;
  let roomMoved = false; // the old server handed this page's waiting room over (header)

  const setMove = (genMove) => { if (store.get().ui.genMove !== genMove) store.patch('ui', { genMove }); };
  const soon = () => setMove(roomMoved ? 'room' : 'soon');
  const wait = (ms, fn) => { cancel(timer); timer = later(fn, ms); };

  // another tab asks whether a match runs here on its server
  if (channel) {
    channel.onmessage = (ev) => {
      const m = ev?.data;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ask' && gen && m.gen === gen && inMatch()) channel.postMessage({ t: 'busy', gen, id: m.id });
      else if (m.t === 'busy' && m.id === askId) busySeen = true;
    };
  }
  let askId = null;
  const otherTabBusy = () => new Promise((resolve) => {
    if (!channel || !gen) { resolve(false); return; }
    askId = `${Date.now()}-${Math.random()}`;
    busySeen = false;
    try { channel.postMessage({ t: 'ask', gen, id: askId }); } catch { resolve(false); return; }
    later(() => resolve(busySeen), TAB_ASK_MS);
  });

  let waitedMatch = false; // the move waited for a match: its end shows the banner before the reload

  const step = async () => {
    if (gone) return;
    if (inMatch()) { waitedMatch = true; setMove('match'); wait(MATCH_POLL_MS, step); return; }
    if (waitedMatch) { waitedMatch = false; soon(); wait(MOVE_DELAY_MS, step); return; }
    if (await otherTabBusy()) { setMove('tab'); wait(TAB_RETRY_MS, step); return; }
    gone = true;
    soon();
    try { forget(); } catch { /* ignore */ }
    try { keep({ from: APP_VERSION, room: roomMoved || hasRoom(), at: Date.now() }); } catch { /* ignore */ }
    doReload();
  };

  /** The server says this page should move (header). */
  const move = () => {
    if (moving || !gen) return;
    moving = true;
    if (!inMatch()) soon();
    wait(MOVE_DELAY_MS, step);
  };

  net.on('welcome', (msg) => {
    const id = typeof msg?.gen?.id === 'string' && /^[a-z0-9]{1,8}$/.test(msg.gen.id) ? msg.gen.id : null;
    gen = id;
    current = id;
    net.url = id ? genUrl(wsUrl(), id) : null;
    if (id && msg.gen.state === 'drain') move();
  });
  net.on('server.gen', (msg) => { if (msg?.state === 'drain') move(); });
  net.on('room.closed', (msg) => {
    if (msg?.reason !== 'newVersion') return;
    if (msg.moved === true) { roomMoved = true; if (moving && !inMatch() && store.get().ui.genMove === 'soon') soon(); }
    move();
  });
  net.on('error', (msg) => { if (msg?.code === 'NEW_VERSION') move(); });

  return {
    /** tests: what the page is doing */
    state: () => ({ gen, moving, gone }),
    close: () => { cancel(timer); try { channel?.close(); } catch { /* ignore */ } if (current === gen) current = null; gen = null; },
  };
}

// Field view loader: mounts the Pixi render engine (public/js/render/app.js → createFieldView, DESIGN §9)
// into a host element, falling back to the DOM view (fallbackField.js) when the engine is missing, times
// out or throws. Every call into the view goes through a guard so a render bug can never crash the HUD.
// The shared asset store gets the game data's copy of the asset manifest (`seedAssets`, public issue #8 item 5), and the
// prep cameras the HUD bands they keep clear (`hudBands`; the folded shop's band: public issue #5).
//
// An engine that only lost the race to the clock keeps loading behind the simplified view (`late`, the game screen's
// hook): when it arrives it replaces that view, with no second loading screen and no new download of what it already
// has (a slow phone line in a player's report opened the field in the simplified view twice before the engine came).
//
// `?render=fallback` (or globalThis.__SP_RENDER__ = 'fallback') skips the engine (dev / mock harness);
// `?render=engine` never falls back silently (errors are logged and the fallback still mounts).

// relative, like every other client module (the import map only resolves to this same URL; no bare specifier here)
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { createFallbackView } from './fallbackField.js';
import { data } from '../data.js';
import { audio } from '../audio.js';
import { settingsStore } from './settings.js';
import { noteRender, mountTimer } from '../diag.js';

const LOAD_TIMEOUT_MS = 12000;
/**
 * A view that fell back to the DOM view while the page is on screen mounts the engine again this long after (one of the
 * two retries in a row): the first try may have lost the race only to an empty cache (an iPhone's Safari tab, whose
 * cache is not the home-screen app's), and what it fetched is there by now.
 */
const FALLBACK_RETRY_MS = 5000;
/**
 * How long a simplified view waits for its late engine (mountFieldView `late`) before giving it up for the retries above.
 * [ASSUMED] 60 s: well past the slowest load in the reports (the engine 65 s after the first try, but over three tries).
 */
const LATE_MAX_MS = 60000;
/** The simplified view stays on top this long after its late engine took over, while the game screen enters the engine. */
const SWAP_HOLD_MS = 150;
const METHODS = ['setStage', 'setCamera', 'setPrep', 'enterBattle', 'pushSnapshot', 'pushEvents', 'highlightTiles', 'on', 'resize', 'destroy'];
// direction-step hooks (ui/facingWheel.js): optional — the wheel falls back to the engine's dev hooks when absent;
// setPen (enemy preview pen list), prepField ({ kind, side, mirror } of the Final Assault prep), stripesUnder (the view
// stripes range previews under the units itself) — render/app.js; the DOM fallback lacks them (→ null)
const OPTIONAL = ['pieceScreenRect', 'setSettings', 'off', 'tileScreen', 'holdPiece', 'setPieceDir', 'setPen', 'prepField', 'stripesUnder'];

/**
 * Camera padding (px) that keeps the field clear of the DOM HUD (top bar + bond strip, team panel, shop bar /
 * combat switcher, effects column). Sizes follow the rem scale of css/theme.css.
 * The Final Assault prep ('bossPrep') has the prep HUD (shop bar below) on the boss field: prep padding; the enemy pen
 * ('pen') is viewed with the shop collapsed.
 * @param {string} kind 'prep'|'bossPrep'|'pen'|'normal'|'unite'|'boss'|'hidden'
 * @param {{ width: number, height: number }} size
 */
export function hudPadding(kind, size) {
  let rem = 100;
  try { rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 100; } catch { /* ignore */ }
  const h = size?.height || 1080;
  const clampH = (v) => Math.min(v, h * 0.4);
  if (kind === 'prep' || kind === 'bossPrep') return { top: clampH(rem * 1.95), bottom: clampH(rem * 3.2), left: rem * 2.25, right: rem * 0.9 };
  if (kind === 'boss' || kind === 'hidden' || kind === 'unite') return { top: clampH(rem * 1.9), bottom: clampH(rem * 0.95), left: rem * 2.1, right: rem * 0.95 };
  return { top: clampH(rem * 1.95), bottom: clampH(rem * 1.0), left: rem * 2.25, right: rem * 1.05 };
}

/**
 * HUD geometry (rem) the prep cameras keep clear (they mirror the CSS; test/ui/playtest5-ui.test.js checks the rules):
 * the bond strip's bottom edge (css/screens/game.css .gm__bonds top 1.36rem + a .bslot: disc .52rem + name ≈
 * 2.15rem measured) and the shop bar's top edge above the viewport's bottom (css/screens/game-shop.css .shopbar
 * bottom .2rem + .shopbar__row padding .1rem ×2 + card height 2.24rem, plus its 2 px + 1 px borders). The shop bar
 * sits on the viewport's bottom edge even on a notched phone (css/devices.css, DESIGN §18.1).
 * The folded shop (public issue #5): the tab's top edge (.shopbar-tab bottom .2rem + padding .08rem ×2 + its .44rem
 * button, plus its 2 px + 1 px borders; it sits inside the HUD layer, above the bottom safe-area inset) and the corner
 * buttons' top edge (css/screens/game.css .gm__corner bottom .24rem + a .56rem row — the fallback when the corner
 * cannot be measured: on phones its buttons grow to 34 px and below 768 CSS px of width they wrap into two rows,
 * css/devices.css).
 */
export const HUD_REM = Object.freeze({
  bondStripBottom: 2.16, shopBarTop: 2.64, shopBarBorderPx: 3, shopTabTop: 0.8, shopTabBorderPx: 3, cornerTop: 0.8,
});

/**
 * CSS px of HUD along the top edge (top bar + bond strip) and the bottom edge of the viewport during prep — the own
 * board ('prep') or the Final Assault half ('bossPrep'); null for every other camera. The prep camera keeps the bench /
 * temp rows and the field's back row clear of them (render/projection.js clearHud; user playtest #5 item 9: the rem
 * floor of 40 px makes the HUD relatively taller on phones in landscape and the shop bar covered the bench).
 * The bottom band is the shop bar's — also for an eliminated player's own board (no shop bar: the band only costs size
 * there, while a camera following the bar's presence would have to re-frame whenever it appears, e.g. when the private
 * state arrives after the prep camera was set) — unless `opts.shop === false`: the player folded the shop (收起) and the
 * own prep board moved to the official shop-collapsed camera (public issue #5: the board did not grow; screens/game.js
 * asks for it only while a folded bar is shown). Its band is the higher of the folded tab (bottom right) and the corner
 * buttons' hit areas (交流 / ⚙ / 📖 / ⛶, bottom left, measured by `cornerBand`: on a narrow phone two rows of 34 px buttons
 * with 44 px touch areas) — under the official collapsed camera the bench's left pads reach under the corner, and with
 * the tab alone it would cover bench pad 0 at the user's 756×366 Android and the near edge of pads 0–2 at 844×390; both
 * are 1-D bands like the bar's, so every bench pad stays fully pressable. Scouting a
 * teammate's board uses the 'normal' camera: no band. An armed shop card (two-tap buy, css/screens/game-shop.css
 * .scard.is-armed) rises 4 px above the bar's top on a phone and covers the bench pads' near corners by ≈ 3 px while it
 * stays armed — less than under the unchanged official camera at 1920×1080 (13 px above the bar, ≈ 11 px over the pads).
 * @param {string} kind
 * @param {{ width: number, height: number }} size
 * @param {{ shop?: boolean }} [opts] `shop: false` = the folded shop's band
 * @returns {{ top: number, bottom: number }|null}
 */
export function hudBands(kind, size, opts) {
  if (kind !== 'prep' && kind !== 'bossPrep') return null;
  const folded = !!opts && opts.shop === false;
  const h = size?.height || 1080;
  let rem = 100;
  let safeTop = 0;
  let safeBottom = 0;
  let corner = 0;
  try {
    rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 100;
    // the HUD layer starts below the top safe-area inset and ends above the bottom one (css/devices.css .gm__hud)
    const hud = document.querySelector('.gm__hud')?.getBoundingClientRect();
    safeTop = Math.max(0, hud?.top || 0);
    if (folded) {
      if (hud && hud.bottom > 0) safeBottom = Math.max(0, h - hud.bottom);
      corner = cornerBand(h);
    }
  } catch { /* ignore */ }
  const bottom = folded
    ? Math.max(safeBottom + rem * HUD_REM.shopTabTop + HUD_REM.shopTabBorderPx, corner || safeBottom + rem * HUD_REM.cornerTop)
    : rem * HUD_REM.shopBarTop + HUD_REM.shopBarBorderPx;
  return {
    top: Math.min(h * 0.4, safeTop + rem * HUD_REM.bondStripBottom),
    bottom: Math.min(h * 0.4, bottom),
  };
}

/**
 * CSS px from the viewport's bottom edge (`h` high) up to the top of the corner buttons' hit areas (交流 / ⚙ / 📖 / ⛶,
 * .gm__corner), 0 when they are not on the page. On a touch screen every one of them takes taps from an invisible area
 * of at least --tap-min (44 px) centred on it (css/devices.css touch targets), 5 px above a 34 px phone button — a bench
 * pad edge there is not pressable.
 * @param {number} h
 */
function cornerBand(h) {
  const btns = document.querySelectorAll('.gm__corner .gm__gear, .gm__corner .ewheel__btn');
  if (!btns || !btns.length) return 0;
  const root = document.documentElement;
  const tap = root?.classList?.contains('sp-coarse') ? parseFloat(getComputedStyle(root).getPropertyValue('--tap-min')) || 0 : 0;
  let top = Infinity;
  for (const b of btns) {
    const r = b.getBoundingClientRect();
    if (r && r.height > 0) top = Math.min(top, r.top + r.height / 2 - Math.max(r.height, tap) / 2);
  }
  return top < Infinity ? Math.max(0, h - top) : 0;
}

function renderPref() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('render');
    if (q === 'fallback' || q === 'engine') return q;
  } catch { /* ignore */ }
  return globalThis.__SP_RENDER__ === 'fallback' ? 'fallback' : 'auto';
}

function abortError(signal) {
  return signal?.reason ?? new DOMException('Field view initialization cancelled', 'AbortError');
}

function checkActive(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function withTimeout(p, ms, what, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (done, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      done(value);
    };
    const onAbort = () => finish(reject, abortError(signal));
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(reject, Object.assign(new Error(`${what} timed out`), { timeout: true })), ms);
    // Keep a rejection handler attached even when cancellation wins before this promise settles.
    Promise.resolve(p).then((value) => finish(resolve, value), (err) => finish(reject, err));
    if (signal?.aborted) onAbort();
  });
}

/**
 * Wrap a view so no method can throw into the UI (each failing method is logged once).
 * @param {any} view
 * @param {'engine'|'fallback'} kind
 */
export function guardView(view, kind) {
  const warned = new Set();
  const safe = { kind, raw: view };
  for (const name of [...METHODS, ...OPTIONAL]) {
    safe[name] = (...args) => {
      const fn = view && view[name];
      if (typeof fn !== 'function') return name === 'on' ? () => {} : null;
      try {
        const out = fn.apply(view, args);
        if (out && typeof out.then === 'function') out.catch((err) => { if (!warned.has(name)) { warned.add(name); console.warn(`[field] ${name} failed`, err); } });
        if (name === 'on') return typeof out === 'function' ? out : () => { try { view.off?.(args[0], args[1]); } catch { /* ignore */ } };
        return out;
      } catch (err) {
        if (!warned.has(name)) { warned.add(name); console.warn(`[field] ${kind} view ${name} failed`, err); }
        return name === 'on' ? () => {} : null;
      }
    };
  }
  return safe;
}

/**
 * Hand the game data's copies of /data/assets.json and /data/local-assets.json (data.js 'assets' / 'local': the match
 * screen waits for them, gameComponents GAME_FILES) to the asset store, now or when they land: it then never downloads
 * the manifest a second time — after a page reload (a phone browser discarding a background tab, Chrome's Memory Saver)
 * that second download was the one createFieldView waited ≤ 4 s for, and a slow or failed one left every operator the
 * image-less placeholder (public issue #8 item 5). Without a copy the store fetches and retries by itself.
 * @param {{ seed?: (m: any) => boolean, seedLocal?: (m: any) => boolean }} store public/js/assets.js store
 */
export function seedAssets(store) {
  if (!store) return;
  const give = (name, fn) => {
    if (typeof fn !== 'function') return;
    const now = data.get(name);
    if (now) { fn(now); return; }
    // still loading (or failed): adopt it if it lands; a later success of the store's own fetch makes this a no-op
    Promise.resolve(data.load(name)).then((m) => { if (m) fn(m); }, () => {});
  };
  give('assets', store.seed?.bind(store));
  give('local', store.seedLocal?.bind(store));
}

/**
 * The simplified view of a mount whose engine is still loading (`late`): in a layer of its own above the engine's
 * elements, which stay hidden until the engine takes over (css/screens/game.css `.fh-late`); its destroy removes both.
 * @param {HTMLElement} host
 * @param {object} opts
 */
function lateFallback(host, opts) {
  const layer = host.ownerDocument?.createElement?.('div');
  if (!layer) return createFallbackView(host, opts);
  layer.className = 'fh-fallback';
  host.appendChild(layer);
  host.classList?.add('fh-late');
  const view = createFallbackView(layer, opts);
  const destroy = view.destroy;
  view.destroy = function destroyLate(...args) {
    try { return destroy?.apply(this, args); } finally { layer.remove(); host.classList?.remove('fh-late'); }
  };
  return view;
}

/**
 * Create a field view in `host`: the render engine when available, else the DOM fallback.
 * @param {HTMLElement} host
 * @param {{ signal?: AbortSignal, late?: boolean }} [options] `signal` cancels a pending mount without creating a
 *   fallback. `late`: when the engine only ran out of time, the returned fallback carries `upgrade`, a promise of the
 *   guarded engine view once it is ready (null if it fails), and `cancelUpgrade()`; the caller swaps the views.
 * @returns {Promise<ReturnType<typeof guardView>>}
 */
export async function mountFieldView(host, { signal, late = false } = {}) {
  checkActive(signal);
  const pref = renderPref();
  const opts = { data, assets: data.get('assets'), audio, settings: settingsStore.get(), padding: hudPadding, hud: hudBands };
  if (pref !== 'fallback') {
    const controller = new AbortController();
    const onAbort = () => controller.abort(abortError(signal));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    let engineView = null;
    /** `late`: the engine view still on its way after the race was lost */
    let upgrade = null;
    const dispose = (view) => { try { view?.destroy?.(); } catch { /* ignore */ } };
    const timing = mountTimer(); // the report's `mount:` line (diag.js): which stage a slow field load spent its time in
    // the factory's stages count while the race runs; what arrives after it was lost is noted as `late` only
    let racing = true;
    const stages = { step: (name, cut) => { if (racing) timing.step(name, cut); }, late: (name) => timing.late(name), done: (kind) => timing.done(kind) };
    // A factory that ignores cancellation still belongs to this attempt when it eventually returns.
    // `deadline`: the engine cuts its optional waits (art, 3D board) to fit this race instead of losing it
    const start = (mod, budget) => {
      if (typeof mod?.createFieldView !== 'function') throw new Error('createFieldView missing');
      return Promise.resolve(mod.createFieldView(host, { ...opts, signal: controller.signal, deadline: Date.now() + budget, timing: stages })).then((view) => {
        if (controller.signal.aborted) dispose(view); else engineView = view;
        return view;
      });
    };
    const complete = (view) => {
      const missing = METHODS.filter((k) => typeof view?.[k] !== 'function');
      if (missing.length) throw new Error(`view lacks ${missing.join(', ')}`);
      return view;
    };
    try {
      checkActive(controller.signal);
      // the shared asset store (public/js/assets.js) keeps its Spine cache across remounts (next match, reconnect)
      const am = await withTimeout(import('../assets.js'), LOAD_TIMEOUT_MS, 'asset store import', controller.signal).catch(() => {
        checkActive(controller.signal);
        return null;
      });
      checkActive(controller.signal);
      timing.step('store');
      if (am?.assets && typeof am.assets.ready === 'function') {
        opts.assets = am.assets;
        seedAssets(am.assets);
      }
      const imported = import('../render/app.js');
      const mod = await withTimeout(imported, LOAD_TIMEOUT_MS, 'render engine import', controller.signal).catch((err) => {
        // the engine's own waits get a full budget again once it is in (art and 3D board before it shows)
        if (late && err?.timeout) {
          upgrade = imported.then((m) => start(m, LOAD_TIMEOUT_MS));
          upgrade.catch(() => {}); // settled below (or dropped with the attempt)
        }
        throw err;
      });
      checkActive(controller.signal);
      timing.step('engine');
      const pending = start(mod, LOAD_TIMEOUT_MS);
      const view = await withTimeout(pending, LOAD_TIMEOUT_MS, 'createFieldView', controller.signal).catch((err) => {
        if (late && err?.timeout) upgrade = pending;
        throw err;
      });
      checkActive(controller.signal);
      complete(view);
      timing.done('engine');
      return guardView(view, 'engine');
    } catch (err) {
      racing = false;
      timing.done(signal?.aborted ? 'cancelled' : 'fallback');
      if (upgrade && !signal?.aborted) {
        console.warn('[field] render engine still loading, using the simplified view meanwhile:', err?.message || err);
        noteRender('simplified view', `${err?.message || err}; the engine keeps loading`);
        let fallback;
        try {
          fallback = guardView(lateFallback(host, { ...opts, assets: data.get('assets') }), 'fallback');
        } catch (e) {
          upgrade = null;
          controller.abort();
          dispose(engineView);
          throw e;
        }
        let handedOver = false;
        fallback.upgrade = upgrade.then((view) => {
          checkActive(controller.signal);
          complete(view);
          handedOver = true;
          timing.late('engine');
          return guardView(view, 'engine');
        }).catch((e) => {
          // once handed over, aborting would destroy the engine (its factory listens to this signal until destroy)
          controller.abort();
          dispose(engineView);
          if (!signal?.aborted) {
            console.warn('[field] late render engine unavailable:', e?.message || e);
            noteRender('engine late failed', String(e?.message || e));
          }
          return null;
        }).finally(() => signal?.removeEventListener('abort', onAbort));
        fallback.cancelUpgrade = () => { if (!handedOver) controller.abort(); };
        return fallback;
      }
      upgrade = null;
      controller.abort();
      dispose(engineView);
      checkActive(signal);
      console.warn('[field] render engine unavailable, using the simplified view:', err?.message || err);
      noteRender('simplified view', String(err?.message || err));
    } finally {
      if (!upgrade) signal?.removeEventListener('abort', onAbort);
    }
  }
  checkActive(signal);
  return guardView(createFallbackView(host, { ...opts, assets: data.get('assets') }), 'fallback');
}

/**
 * Preact hook: mount a field view into `hostRef`; returns { view, kind, upgrading } (view null while loading). A mount
 * that ran out of time shows the DOM view while its engine keeps loading (`upgrading`), and the engine replaces it when it
 * arrives — a new view object, which screens/game.js enters afresh (the DOM view stays on top for SWAP_HOLD_MS meanwhile).
 * A view that fell back to the DOM view otherwise (or whose late engine failed or took longer than LATE_MAX_MS) is
 * mounted again FALLBACK_RETRY_MS later while the page is on screen, and when the page comes back online or is shown
 * again, at most twice in a row (upstream 0.2.4); the 3D board's own retries inside the engine are render/app/retry3d.js.
 * @param {{ current: HTMLElement|null }} hostRef
 */
export function useFieldView(hostRef) {
  const [state, setState] = useState({ view: null, kind: 'loading', upgrading: false });
  const [attempt, setAttempt] = useState(0);
  const retries = useRef(0);
  const viewRef = useRef(null);
  useEffect(() => {
    let dead = false, retrying = false, retryTimer = 0, lateTimer = 0, holdTimer = 0, upgrading = false;
    let retiring = null; // the DOM view a late engine replaced, still on top for SWAP_HOLD_MS
    const host = hostRef.current;
    if (!host) return undefined;
    setState({ view: null, kind: 'loading', upgrading: false });
    const controller = new AbortController();
    const awaitUpgrade = (fallback) => {
      upgrading = true;
      lateTimer = setTimeout(() => fallback.cancelUpgrade?.(), LATE_MAX_MS);
      fallback.upgrade.then((engine) => {
        clearTimeout(lateTimer);
        upgrading = false;
        if (dead || viewRef.current !== fallback) { engine?.destroy(); return; }
        if (!engine) {
          setState({ view: fallback, kind: 'fallback', upgrading: false });
          retryTimer = setTimeout(onRetry, FALLBACK_RETRY_MS);
          return;
        }
        noteRender('engine late', 'replaced the simplified view');
        viewRef.current = engine;
        retries.current = 0;
        globalThis.__SP_VIEW__ = engine;
        setState({ view: engine, kind: 'engine', upgrading: false });
        retiring = fallback;
        holdTimer = setTimeout(() => { retiring?.destroy(); retiring = null; }, SWAP_HOLD_MS);
      });
    };
    mountFieldView(host, { signal: controller.signal, late: true }).then((view) => {
      if (dead) { view.cancelUpgrade?.(); view.destroy(); return; }
      viewRef.current = view;
      if (view.kind === 'engine') retries.current = 0;
      globalThis.__SP_VIEW__ = view; // dev / E2E introspection (view.raw.stats?.())
      setState({ view, kind: view.kind, upgrading: !!view.upgrade });
      if (view.kind === 'fallback') {
        if (view.upgrade) awaitUpgrade(view);
        else retryTimer = setTimeout(onRetry, FALLBACK_RETRY_MS);
      }
    }, (err) => { if (!dead && !controller.signal.aborted) console.error('[field] mount failed', err); });
    const unsub = settingsStore.subscribe((s) => viewRef.current?.setSettings?.(s));
    const onResize = () => viewRef.current?.resize();
    // A temporary network/vendor failure must not pin this mounted match to fallback forever. Retry once a moment later
    // and on a useful user event, at most twice in succession; the effect cleanup disposes the old view before creating
    // its successor. A hidden page waits for visibilitychange; a late engine still on its way is waited for instead.
    const onRetry = (e) => {
      if (dead || retrying || upgrading || viewRef.current?.kind !== 'fallback' || renderPref() === 'fallback'
        || document.visibilityState !== 'visible' || globalThis.navigator?.onLine === false || retries.current >= 2) return;
      retrying = true; retries.current++;
      noteRender('engine retry', `${retries.current}/2 ${e?.type || 'timer'}`); // the bug report's render events (diag.js)
      setAttempt((n) => n + 1);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('online', onRetry);
    document.addEventListener('visibilitychange', onRetry);
    return () => {
      dead = true;
      clearTimeout(retryTimer);
      clearTimeout(lateTimer);
      clearTimeout(holdTimer);
      controller.abort();
      unsub();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('online', onRetry);
      document.removeEventListener('visibilitychange', onRetry);
      // the dev hook must not keep the destroyed view — and through its host the whole detached match screen — alive
      if (viewRef.current && globalThis.__SP_VIEW__ === viewRef.current) globalThis.__SP_VIEW__ = null;
      viewRef.current?.cancelUpgrade?.();
      viewRef.current?.destroy();
      viewRef.current = null;
      retiring?.destroy();
      retiring = null;
    };
  }, [attempt]);
  return state;
}

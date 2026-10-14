// Match code preload: while the player is in the lobby, download the code the match screen will import — the render
// engine, the browser battle simulation, three.js and Pixi — so entering a match only runs it.
//
// The server lists those files flat (GET /preload.json, server/http/preload.js): the browser would otherwise find each
// module's imports only after that module arrived, about fifteen dependent request rounds that started when the match
// screen mounted, and on a phone line stalling a second or more per round they outlasted the field view's limit
// (ui/fieldHost.js) — the match opened in the simplified view and mounted the engine again. Here every module is asked
// for at once as a <link rel="modulepreload"> (fetched and parsed into the page's module map, not run), resolved beside
// this module so the URLs are the ones the page's own imports use (also under /b/<tag>/r/, server/http/buildTag.js);
// a browser without modulepreload only warms its HTTP cache with a plain fetch (the versioned URLs are immutable). Pixi
// and pixi-spine are classic scripts (render/app/pixi.js), warmed by a fetch too: Safari ignores index.html's
// rel="prefetch" for them. Once per page; a failed list fetch is retried on the next call.
//
//   preloadMatchCode()   // idempotent; starts after the page is idle

export const PRELOAD_URL = '/preload.json';

let started = false;

/** Whether this browser fetches `<link rel="modulepreload">` (Safari 17+, Chrome 66+, Firefox 115+). */
function modulePreloadSupported(doc) {
  try { return !!doc.createElement('link').relList?.supports?.('modulepreload'); } catch { return false; }
}

/**
 * Ask for every file of the list. @param {{ modules?: unknown, scripts?: unknown }} list
 * @param {{ doc?: Document, fetchFn?: typeof fetch, base?: string }} [env]
 * @returns {number} requests started
 */
export function preloadFiles(list, { doc = globalThis.document, fetchFn = (...a) => globalThis.fetch(...a), base = import.meta.url } = {}) {
  const specs = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && /^\.\.?\//.test(s) && s.endsWith('.js')) : []);
  // the body is read to the end: an abandoned response would not be stored in the HTTP cache
  const warm = (url) => { try { Promise.resolve(fetchFn(url, { priority: 'low' })).then((r) => r?.arrayBuffer?.(), () => {}).catch(() => {}); } catch { /* ignore */ } };
  const links = !!doc?.head && modulePreloadSupported(doc);
  let n = 0;
  for (const spec of specs(list?.modules)) {
    const url = new URL(spec, base).href;
    if (links) {
      const link = doc.createElement('link');
      link.rel = 'modulepreload';
      link.href = url;
      doc.head.appendChild(link);
    } else warm(url);
    n++;
  }
  for (const spec of specs(list?.scripts)) { warm(new URL(spec, base).href); n++; }
  return n;
}

/** Download the match screen's code in the background (once per page). */
export function preloadMatchCode() {
  if (started || typeof globalThis.document === 'undefined') return;
  started = true;
  const go = async () => {
    try {
      const res = await globalThis.fetch(PRELOAD_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      preloadFiles(await res.json());
    } catch (err) {
      started = false; // the next call tries again
      console.warn('[preload] match code list unavailable:', err?.message || err);
    }
  };
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(() => { go(); }, { timeout: 2500 });
  else setTimeout(go, 600);
}

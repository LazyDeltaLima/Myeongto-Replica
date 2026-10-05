// Resource service worker (local patch): answers game art requests from the Cache Storage 'sp-res', and fetches
// what is not there yet on demand — upstream art from jsDelivr / GitHub raw rather than from this server — so the NAS
// upload carries little of the art, and a picture seen once never pops in late again (no round trip, no revalidation).
//
// The list is /assets/browser-resources.json (tools/build-browser-resources.mjs): { p, s, h, u? } per file. A request
// for a listed file that is not cached is fetched from its sources — jsDelivr, then GitHub raw for upstream art (`u`),
// then this server — and kept (and answered) only when its size and SHA-256 match the list; a file that no source
// delivers intact is answered by this server as before, uncached. Every player gets this, with or without the
// pre-download consent (public/js/resources.js, which also downloads the rest of the list in the background after it).
// A cached file carries its hash in X-SP-Hash, so the page's reconcile can adopt what this worker stored.
//
// Only same-origin GET /assets/…, /img/emotes/… and /media/… (extension-less audio, shared/media.js) are looked at;
// unlisted files, Range requests and query strings go to the server untouched.
// Defence in depth (security review 2026-10-04): page loads (navigations) are never answered from the cache, only the
// asset file types below are, and every cached answer carries nosniff and a sandboxing CSP — so even a planted cache
// entry could never run as a page of this origin.
// Classic script (no import): module service workers are not available everywhere yet. Path / source rules are kept in
// sync with public/js/resources.js (validEntry, sourcesOf).

const CACHE = 'sp-res';
const INDEX = '/assets/browser-resources.json';
const INDEX_TTL_MS = 5 * 60e3;    // revalidate the list this often (a cheap 304 when unchanged)
const TIMEOUT_MS = 30000;
// keep in sync with shared/media.js AUDIO_EXTS (the order the server tries them)
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav'];
// the file types the game's art, models and audio use (never html / svg / xml / js)
const SERVED = /\.(png|webp|jpe?g|gif|atlas|skel|json|obj|mp3|m4a|aac|ogg|oga|opus|wav)$/i;
const SAFE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" };
const PATH_RE = /^\/(assets|img\/emotes)\/[^?#%\\]+$/;
const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const JSDELIVR_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\//;
const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', json: 'application/json',
  atlas: 'text/plain', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac' };
const typeOf = (p) => TYPES[p.slice(p.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';

/** A cached file, re-wrapped with the safety headers (keeps its Content-Type). */
function safe(hit) {
  const headers = new Headers(hit.headers);
  for (const [k, v] of Object.entries(SAFE_HEADERS)) headers.set(k, v);
  return new Response(hit.body, { status: 200, headers });
}

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// caches.match with cacheName never creates the cache (caches.open would recreate it after the page dropped it)
const lookup = (path) => caches.match(path, { cacheName: CACHE });

// ---- the list ------------------------------------------------------------------------------------------------------

let index = null;        // Map path → { p, s, h, u? }, or null while unknown / when the server has none
let indexAt = 0;
let indexLoading = null;

function sourcesOf(f) {
  if (typeof f.u !== 'string') return [f.p];
  if (JSDELIVR_RE.test(f.u)) return [f.u, f.p];
  const m = RAW_RE.exec(f.u);
  if (!m) return [f.p];
  const [, owner, repo, branch, path] = m;
  const mirror = owner === 'ArknightsAssets' && branch === 'voice' ? null : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
  return [mirror, f.u, f.p].filter(Boolean);
}
const validEntry = (f) => !!f && typeof f.p === 'string' && PATH_RE.test(f.p) && !f.p.split('/').some((x) => x === '.' || x === '..')
  && Number.isInteger(f.s) && f.s >= 0 && typeof f.h === 'string' && /^[0-9a-f]{64}$/.test(f.h);

async function loadIndex() {
  try {
    const res = await fetch(INDEX, { cache: 'no-cache' });
    if (res.status === 404) { index = null; indexAt = Date.now(); return; }
    if (!res.ok) return;
    const j = await res.json();
    if (!j || !Array.isArray(j.files)) return;
    index = new Map(j.files.filter(validEntry).map((f) => [f.p, f]));
    indexAt = Date.now();
  } catch { /* offline: keep the last list */ }
}
async function getIndex() {
  if (!indexAt || Date.now() - indexAt > INDEX_TTL_MS) {
    indexLoading ||= loadIndex().finally(() => { indexLoading = null; });
    if (!indexAt) await indexLoading;   // the first request waits for the list; later ones use the last one meanwhile
  }
  return index;
}

// ---- on-demand fetch ----------------------------------------------------------------------------------------------

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Fetch one listed file from its sources, keep it when intact; null when no source delivered it intact. */
async function fetchListed(f) {
  for (const url of sourcesOf(f)) {
    try {
      const external = !url.startsWith('/');
      const res = await fetch(url, { cache: 'no-store', ...(external ? { mode: 'cors', credentials: 'omit' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.s || (await sha256(buf)) !== f.h) continue;
      const headers = { 'Content-Type': typeOf(f.p), 'Content-Length': String(buf.byteLength), 'X-SP-Hash': f.h };
      try { await (await caches.open(CACHE)).put(f.p, new Response(buf, { headers })); } catch { /* quota: answer anyway */ }
      return new Response(buf, { status: 200, headers });
    } catch { /* next source */ }
  }
  return null;
}

const inflight = new Map();   // path → Promise<Response|null>: one fetch per file however many requests ask for it

async function fromListed(f) {
  let p = inflight.get(f.p);
  if (!p) { p = fetchListed(f).finally(() => inflight.delete(f.p)); inflight.set(f.p, p); }
  const res = await p;
  return res ? safe(res.clone()) : null;
}

const decode = (p) => { try { return decodeURIComponent(p); } catch { return p; } };

async function answer(request, path) {
  const candidates = path.startsWith('/media/')
    ? AUDIO_EXTS.map((ext) => '/assets/audio/' + path.slice('/media/'.length) + ext)
    : SERVED.test(path) ? [path] : [];
  for (const c of candidates) {
    const hit = await lookup(c);
    if (hit) return safe(hit);
  }
  if (candidates.length) {
    const list = await getIndex();
    const f = list && candidates.map((c) => list.get(decode(c))).find(Boolean);
    if (f) { const res = await fromListed(f); if (res) return res; }
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range') || req.mode === 'navigate' || req.destination === 'document') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search) return;
  const path = url.pathname;
  if (path === INDEX || !(path.startsWith('/assets/') || path.startsWith('/media/') || path.startsWith('/img/emotes/'))) return;
  event.respondWith(answer(req, path).catch(() => fetch(req)));
});

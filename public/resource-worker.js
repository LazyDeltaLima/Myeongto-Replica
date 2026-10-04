// Resource service worker (local NAS patch): answers game art requests from the Cache Storage that public/js/resources.js
// fills in the background (hash-checked copies of the files listed in /assets/browser-resources.json), so a picture
// that was downloaded once never pops in late again — no network round trip, not even a revalidation.
//
// Only same-origin GET /assets/…, /img/emotes/… and /media/… (extension-less audio, shared/media.js) are looked at; a file not in the
// cache (not downloaded yet, failed, or a Range request) goes to the server as before. This worker never downloads
// anything itself and never caches what it serves from the network: the page decides what is in the cache.
// Defence in depth (security review 2026-10-04): page loads (navigations) are never answered from the cache, only the
// asset file types below are, and every cached answer carries nosniff and a sandboxing CSP — so even a planted cache
// entry could never run as a page of this origin.
// Classic script (no import): module service workers are not available everywhere yet.

const CACHE = 'sp-res';
const INDEX = '/assets/browser-resources.json';
// keep in sync with shared/media.js AUDIO_EXTS (the order the server tries them)
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav'];
// the file types the game's art, models and audio use (never html / svg / xml / js)
const SERVED = /\.(png|webp|jpe?g|gif|atlas|skel|json|obj|mp3|m4a|aac|ogg|oga|opus|wav)$/i;
const SAFE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'" };

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

async function fromCache(request, path) {
  if (path.startsWith('/media/')) {
    const stem = '/assets/audio/' + path.slice('/media/'.length);
    for (const ext of AUDIO_EXTS) {
      const hit = await lookup(stem + ext);
      if (hit) return safe(hit);
    }
  } else if (SERVED.test(path)) {
    const hit = await lookup(path);
    if (hit) return safe(hit);
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
  event.respondWith(fromCache(req, path).catch(() => fetch(req)));
});

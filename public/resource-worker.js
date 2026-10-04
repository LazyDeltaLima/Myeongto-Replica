// Resource service worker (local NAS patch): answers game art requests from the Cache Storage that public/js/resources.js
// fills in the background (hash-checked copies of the files listed in /assets/browser-resources.json), so a picture
// that was downloaded once never pops in late again — no network round trip, not even a revalidation.
//
// Only same-origin GET /assets/…, /img/emotes/… and /media/… (extension-less audio, shared/media.js) are looked at; a file not in the
// cache (not downloaded yet, failed, or a Range request) goes to the server as before. This worker never downloads
// anything itself and never caches what it serves from the network: the page decides what is in the cache.
// Classic script (no import): module service workers are not available everywhere yet.

const CACHE = 'sp-res';
const INDEX = '/assets/browser-resources.json';
// keep in sync with shared/media.js AUDIO_EXTS (the order the server tries them)
const AUDIO_EXTS = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav'];

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function fromCache(request, path) {
  const cache = await caches.open(CACHE);
  if (path.startsWith('/media/')) {
    const stem = '/assets/audio/' + path.slice('/media/'.length);
    for (const ext of AUDIO_EXTS) {
      const hit = await cache.match(stem + ext);
      if (hit) return hit;
    }
  } else {
    const hit = await cache.match(path);
    if (hit) return hit;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search) return;
  const path = url.pathname;
  if (path === INDEX || !(path.startsWith('/assets/') || path.startsWith('/media/') || path.startsWith('/img/emotes/'))) return;
  event.respondWith(fromCache(req, path).catch(() => fetch(req)));
});

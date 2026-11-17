// The resource cache is spread over several caches (public/js/resource-entries.js shardOf): Chrome refuses Cache.keys()
// on one cache with too many entries ("Operation too large"), and the page's reconcile then threw before it set a phase,
// so the download stopped and the settings' 资源 tab and the skin picker stayed hidden (docs/rules/render.md
// 「리소스 캐시는 여러 개로 나눔」). These run the page module against a Cache Storage whose caches refuse keys() past a
// size, as Chrome's do.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { shardOf, CACHE_SHARDS, SHARD_NAMES, META_CACHE, LEGACY_CACHE } from '../public/js/resource-entries.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = 'docs/rules/render.md 「리소스 캐시는 여러 개로 나눔」';
const ORIGIN = 'https://x.test';
const sha = (s) => createHash('sha256').update(s).digest('hex');

/** A Cache Storage of named caches; a cache with more than `maxKeys` entries refuses keys() as Chrome does. */
function cacheStorage(maxKeys) {
  const named = new Map();
  const urlOf = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;
  const make = () => {
    const m = new Map(); // url → { body, headers }
    return {
      m,
      keys: async () => {
        if (m.size > maxKeys) throw new DOMException("Failed to execute 'keys' on 'Cache': Operation too large.", 'AbortError');
        return [...m.keys()].map((url) => ({ url }));
      },
      match: async (r) => { const e = m.get(urlOf(r)); return e && new Response(e.body, { headers: e.headers }); },
      put: async (r, res) => { m.set(urlOf(r), { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
      delete: async (r) => m.delete(urlOf(r)),
    };
  };
  return {
    named,
    open: async (n) => { if (!named.has(n)) named.set(n, make()); return named.get(n); },
    has: async (n) => named.has(n),
    delete: async (n) => named.delete(n),
    /** path → hash of a cache's files (the records left out) */
    files: (n) => Object.fromEntries([...(named.get(n)?.m ?? [])].filter(([u]) => !u.includes('/__sp_res_')).map(([u, e]) => [new URL(u).pathname, e.headers['x-sp-hash']])),
  };
}

/** Run one page load of a fresh resources.js against `storage` with `list`; the files' bodies are `bodies`. */
async function load(storage, list, bodies, tag) {
  const { store } = await import(pathToFileURL(path.join(ROOT, 'public/js/store.js')).href);
  const fetched = [];
  const prefs = new Map([['sp.pref.resources', JSON.stringify({ consent: 'yes', at: Date.now() })]]);
  const saved = { window: globalThis.window, location: globalThis.location, caches: globalThis.caches, fetch: globalThis.fetch, localStorage: globalThis.localStorage,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  const before = store.get();
  globalThis.window = { isSecureContext: true, caches: storage };
  globalThis.location = { origin: ORIGIN };
  globalThis.caches = storage;
  globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
  Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
  globalThis.fetch = async (u) => {
    if (u === '/assets/browser-resources.json') return new Response(JSON.stringify(list));
    fetched.push(u.split('?')[0]);
    const file = u.split('?')[0];
    return file in bodies ? new Response(bodies[file]) : new Response('', { status: 404 });
  };
  store.set({ session: { entered: true }, room: null });
  const restore = () => {
    store.set(before);
    for (const k of ['window', 'location', 'caches', 'fetch', 'localStorage']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete globalThis.navigator;
  };
  try {
    const res = await import(pathToFileURL(path.join(ROOT, 'public/js/resources.js')).href + '?' + tag);
    await res.installResources();
    const quiet = () => res.resStore.get().phase === 'running' || res.resourceStatus().cleanup.legacyLeft || res.resourceStatus().cleanup.left;
    for (let i = 0; i < 200 && (quiet() || storage.named.has(LEGACY_CACHE)); i++) await new Promise((r) => setTimeout(r, 20));
    return { res, fetched, restore };
  } catch (err) { restore(); throw err; }
}

describe('resource cache shards', () => {
  test('the page and the worker keep a path in the same cache', () => {
    const ctx = { self: { addEventListener: () => {}, location: { origin: ORIGIN } }, caches: {}, URL, Response, Headers, AbortSignal, crypto: globalThis.crypto };
    vm.runInNewContext(readFileSync(path.join(ROOT, 'public/resource-worker.js'), 'utf8'), ctx);
    assert.equal(vm.runInContext('CACHE_SHARDS', ctx), CACHE_SHARDS, `the worker's CACHE_SHARDS is resource-entries.js's — ${RULE}`);
    let n = 0;
    for (const p of ['/assets/a.png', '/assets/audio/voice/char_002_amiya/CN_001.mp3', '/img/emotes/x.webp', '/assets/한글/파일.png', '/assets/spine/skin/a b/c.skel']) {
      for (let i = 0; i < 400; i++) {
        const q = p.replace(/(\.\w+)$/, `_${i}$1`);
        assert.equal(vm.runInContext(`cacheOf(${JSON.stringify(q)})`, ctx), SHARD_NAMES[shardOf(q)], `${q}: the worker looks in another cache than the page stores in — ${RULE}`);
        n++;
      }
    }
    assert.equal(n, 2000);
    const counts = new Array(CACHE_SHARDS).fill(0);
    for (let i = 0; i < 32000; i++) counts[shardOf(`/assets/x/${i}.png`)]++;
    assert.ok(Math.max(...counts) < 2400, `the shards share the files evenly: ${counts.join(' ')}`);
  });

  test('the worker answers from the old single cache until the page moved the file, and stores in the shard', async () => {
    const named = new Map([[LEGACY_CACHE, new Map([['/assets/a.png', { body: 'a', h: sha('a') }]])]]);
    const opened = [];
    const handlers = {};
    const ctx = {
      self: { location: { origin: ORIGIN }, addEventListener: (k, f) => { handlers[k] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
      caches: {
        match: async (p, { cacheName }) => { const e = named.get(cacheName)?.get(p); return e && new Response(e.body, { headers: { 'X-SP-Hash': e.h } }); },
        open: async (n) => { opened.push(n); if (!named.has(n)) named.set(n, new Map()); return { put: async (p, r) => named.get(n).set(p, { body: await r.text(), h: r.headers.get('X-SP-Hash') }) }; },
      },
      fetch: async (u) => (u === '/assets/browser-resources.json'
        ? new Response(JSON.stringify({ files: [{ p: '/assets/a.png', s: 1, h: sha('a') }, { p: '/assets/b.png', s: 2, h: sha('bb') }] }))
        : new Response(u === '/assets/b.png' ? 'bb' : 'server')),
      Response, Headers, URL, AbortSignal, crypto: globalThis.crypto, decodeURIComponent,
    };
    vm.runInNewContext(readFileSync(path.join(ROOT, 'public/resource-worker.js'), 'utf8'), ctx);
    const request = async (p) => {
      let out = /** @type {any} */ (null);
      handlers.fetch({ request: { method: 'GET', mode: 'cors', destination: '', url: ORIGIN + p, headers: new Headers() }, respondWith: (r) => { out = r; } });
      return out ? (await out).text() : null;
    };
    assert.equal(await request('/assets/a.png'), 'a', `a file still in the old cache is served from it — ${RULE}`);
    assert.equal(await request('/assets/b.png'), 'bb');
    assert.deepEqual(opened, [SHARD_NAMES[shardOf('/assets/b.png')]], 'a file the worker fetched is stored in its shard, never in the old cache');
    assert.equal(named.get(SHARD_NAMES[shardOf('/assets/b.png')]).get('/assets/b.png').h, sha('bb'));
  });

  for (const refuses of [true, false]) {
    test(`the old single cache is emptied into the shards and deleted (${refuses ? 'its keys refused' : 'its keys read'})`, async () => {
      const storage = cacheStorage(refuses ? 3 : 1000);
      const list = { version: 'v2', files: [
        { p: '/assets/a.png', s: 1, h: sha('a') },     // stored by the page (in the record)
        { p: '/assets/b.png', s: 2, h: sha('bb') },    // stored by the worker on demand (not in the record)
        { p: '/assets/c.png', s: 3, h: sha('ccc') },   // changed by the deploy: the old copy is dropped, downloaded again
        { p: '/assets/d.png', s: 4, h: sha('dddd') },  // never cached
      ] };
      const bodies = { '/assets/a.png': 'a', '/assets/b.png': 'bb', '/assets/c.png': 'ccc', '/assets/d.png': 'dddd' };
      const old = await storage.open(LEGACY_CACHE);
      const put = (p, body, h) => old.put(p, new Response(body, { headers: { 'X-SP-Hash': h } }));
      await put('/assets/a.png', 'a', sha('a'));
      await put('/assets/b.png', 'bb', sha('bb'));
      await put('/assets/c.png', 'old', sha('old'));
      await put('/assets/gone.png', 'g', sha('g')); // left the list
      await old.put('/__sp_res_state__', new Response(JSON.stringify({ '/assets/a.png': sha('a'), '/assets/c.png': sha('old'), '/assets/gone.png': sha('g') })));
      const { res, fetched, restore } = await load(storage, list, bodies, `legacy-${refuses}`);
      try {
        assert.notEqual(res.resStore.get().phase, 'off', `the page reconciles over the old cache whatever its size — ${RULE}`);
        assert.equal(storage.named.has(LEGACY_CACHE), false, 'the old cache is deleted once emptied');
        const kept = {};
        for (const n of SHARD_NAMES) Object.assign(kept, storage.files(n));
        assert.deepEqual(kept, { '/assets/a.png': sha('a'), '/assets/b.png': sha('bb'), '/assets/c.png': sha('ccc'), '/assets/d.png': sha('dddd') });
        for (const [p, h] of Object.entries(kept)) assert.ok(storage.files(SHARD_NAMES[shardOf(p)])[p] === h, `${p} is in its own shard`);
        assert.deepEqual(fetched.sort(), ['/assets/c.png', '/assets/d.png'], 'what the old cache held with the listed hash is moved, not downloaded again');
        const state = JSON.parse(storage.named.get(META_CACHE).m.get(ORIGIN + '/__sp_res_state__').body);
        assert.deepEqual(Object.keys(state).sort(), ['/assets/a.png', '/assets/b.png', '/assets/c.png', '/assets/d.png'], 'the record moved to the meta cache');
        assert.equal(res.resourceStatus().cleanup.moved, 2);
      } finally { restore(); }
    });
  }

  test('a shard that refuses its keys leaves the others reconciled and the download running, and no clean mark', async () => {
    const files = Array.from({ length: 40 }, (_, i) => ({ p: `/assets/f${i}.png`, s: 1, h: sha(String(i % 10)) }));
    const bodies = Object.fromEntries(files.map((f, i) => [f.p, String(i % 10)]));
    const big = SHARD_NAMES[shardOf(files[0].p)];
    const storage = cacheStorage(1000);
    const c = await storage.open(big);
    for (let i = 0; i < 1001; i++) await c.put(`/assets/junk${i}.png`, new Response('j', { headers: { 'X-SP-Hash': sha('j') } }));
    const { res, restore } = await load(storage, { version: 'v1', files }, bodies, 'refused');
    try {
      assert.equal(res.resStore.get().phase, 'done', `a refused keys() does not stop the page — ${RULE}`);
      assert.equal(res.resourceStatus().reconcile.refused, 1);
      assert.equal(storage.named.get(META_CACHE).m.has(ORIGIN + '/__sp_res_clean__'), false, 'the next load scans again');
    } finally { restore(); }
  });
});

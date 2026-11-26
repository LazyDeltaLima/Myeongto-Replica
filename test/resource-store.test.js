// The resource store is an IndexedDB database (public/js/resource-entries.js DB_NAME, public/js/resource-db.js, the worker's
// own copy), not the Cache Storage: code a filter puts in front of a site's service worker (an ad blocker's) deleted every
// cache of the site on each of its restarts, and every player who runs it downloaded the whole list again
// (docs/rules/render.md 「리소스 저장소는 IndexedDB」). These run the page module and the worker against a fake IndexedDB
// and the old Cache Storage (test/helpers/fake-indexeddb.js).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { oldShardOf, OLD_SHARD_NAMES, OLD_META_CACHE, OLD_SINGLE_CACHE, OLD_CACHES, FILES_STORE, HASHES_STORE, META_STORE } from '../public/js/resource-entries.js';
import { openResourceDb, readHashes, putFiles } from '../public/js/resource-db.js';
import { fakeIndexedDB, oldCacheStorage } from './helpers/fake-indexeddb.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = 'docs/rules/render.md 「리소스 저장소는 IndexedDB」';
const ORIGIN = 'https://x.test';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const WORKER = readFileSync(path.join(ROOT, 'public/resource-worker.js'), 'utf8');

/** The worker in a context of its own, over `idb` (null: a worker without indexedDB) and `caches`; `request(p)` → body or null. */
function worker(idb, caches, fetch) {
  const handlers = {};
  const ctx = {
    self: { location: { origin: ORIGIN }, addEventListener: (k, f) => { handlers[k] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
    ...(idb ? { indexedDB: idb.indexedDB } : {}), caches, fetch,
    Response, Headers, URL, AbortSignal, crypto: globalThis.crypto, decodeURIComponent, DOMException, TextEncoder,
  };
  vm.runInNewContext(WORKER, ctx);
  const request = async (p) => {
    let out = null;
    handlers.fetch({ request: { method: 'GET', mode: 'cors', destination: '', url: ORIGIN + p, headers: new Headers() }, respondWith: (r) => { out = r; } });
    return out ? (await out).text() : null;
  };
  return { ctx, request };
}

/** Cache Storage that refuses any write but the old caches' own clean-up: the store must not go back to it. */
function noCacheWrites(storage) {
  return { ...storage, open: async (n) => {
    if (!OLD_CACHES.includes(n)) throw new Error(`caches.open(${n}): the store is the database now — ${RULE}`);
    const c = await storage.open(n);
    return { ...c, put: async () => { throw new Error(`a put into the old cache ${n} — ${RULE}`); } };
  } };
}

/** Run one page load of a fresh resources.js with `list`; the files' bodies are `bodies`. */
async function load({ idb, caches }, list, bodies, tag) {
  const { store } = await import(pathToFileURL(path.join(ROOT, 'public/js/store.js')).href);
  const fetched = [];
  const prefs = new Map([['sp.pref.resources', JSON.stringify({ consent: 'yes', at: Date.now() })]]);
  const keys = ['window', 'location', 'caches', 'indexedDB', 'fetch', 'localStorage'];
  const saved = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const before = store.get();
  globalThis.window = { isSecureContext: true };
  globalThis.location = { origin: ORIGIN };
  globalThis.caches = caches;
  globalThis.indexedDB = idb.indexedDB;
  globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
  Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
  globalThis.fetch = async (u) => {
    if (u === '/assets/browser-resources.json') return new Response(JSON.stringify(list));
    const file = u.split('?')[0];
    fetched.push(file);
    return file in bodies ? new Response(bodies[file]) : new Response('', { status: 404 });
  };
  store.set({ session: { entered: true }, room: null });
  const restore = () => {
    store.set(before);
    for (const k of keys) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  };
  try {
    const res = await import(pathToFileURL(path.join(ROOT, 'public/js/resources.js')).href + '?' + tag);
    await res.installResources();
    const busy = () => res.resStore.get().phase === 'running' || res.resourceStatus().cleanup.legacyLeft !== undefined || res.resourceStatus().cleanup.left;
    for (let i = 0; i < 300 && busy(); i++) await new Promise((r) => setTimeout(r, 20));
    return { res, fetched, restore };
  } catch (err) { restore(); throw err; }
}

describe('resource store (IndexedDB)', () => {
  test('the page and the worker create the same stores and read each other\'s files; the old shard rule is the same', async () => {
    const idb = fakeIndexedDB();
    const w = worker(idb, oldCacheStorage(), async () => new Response(''));
    for (const p of ['/assets/a.png', '/assets/audio/voice/char_002_amiya/CN_001.mp3', '/assets/한글/파일.png', '/assets/spine/skin/a b/c.skel']) {
      assert.equal(vm.runInContext(`oldCacheOf(${JSON.stringify(p)})`, w.ctx), OLD_SHARD_NAMES[oldShardOf(p)], `${p}: the worker looks in another old cache than the page moves from — ${RULE}`);
    }
    await vm.runInContext(`store('/assets/w.png', ${JSON.stringify(sha('w'))}, 'image/png', new TextEncoder().encode('w').buffer)`, w.ctx);
    assert.deepEqual(idb.files().get('/assets/w.png'), { h: sha('w'), body: 'w' }, 'the worker stores the bytes and the hash together');
    globalThis.indexedDB = idb.indexedDB;
    try {
      const db = await openResourceDb();
      for (const n of [FILES_STORE, HASHES_STORE, META_STORE]) assert.ok(db.objectStoreNames.contains(n), `${n}: the page's upgradeResourceDb and the worker's agree — ${RULE}`);
      assert.deepEqual([...(await readHashes(db))], [['/assets/w.png', sha('w')]], 'the page reads the hash the worker stored');
      await putFiles(db, [{ p: '/assets/p.png', h: sha('p'), t: 'image/png', b: new TextEncoder().encode('p').buffer }]);
    } finally { delete globalThis.indexedDB; }
    const list = { files: [{ p: '/assets/p.png', s: 1, h: sha('p') }] };
    const w2 = worker(idb, oldCacheStorage(), async (u) => (u === '/assets/browser-resources.json' ? new Response(JSON.stringify(list)) : new Response('server')));
    assert.equal(await w2.request('/assets/p.png'), 'p', 'the worker serves what the page stored');
  });

  test('the worker answers from the database, then from the old caches the page still moves, and stores in the database only', async () => {
    const idb = fakeIndexedDB();
    idb.seed('/assets/new.png', 'n', sha('n'));
    const old = oldCacheStorage();
    await old.seed(OLD_SHARD_NAMES[oldShardOf('/assets/a.png')], '/assets/a.png', 'a', sha('a'));
    await old.seed(OLD_SINGLE_CACHE, '/assets/s.png', 's', sha('s'));
    const list = { files: [{ p: '/assets/a.png', s: 1, h: sha('a') }, { p: '/assets/b.png', s: 2, h: sha('bb') }, { p: '/assets/s.png', s: 1, h: sha('s') }, { p: '/assets/new.png', s: 1, h: sha('n') }] };
    const w = worker(idb, noCacheWrites(old), async (u) => (u === '/assets/browser-resources.json' ? new Response(JSON.stringify(list)) : new Response(u === '/assets/b.png' ? 'bb' : 'server')));
    assert.equal(await w.request('/assets/new.png'), 'n');
    assert.equal(await w.request('/assets/a.png'), 'a', `a file still in an old shard is served from it — ${RULE}`);
    assert.equal(await w.request('/assets/s.png'), 's', 'and one in the old single cache');
    assert.equal(await w.request('/assets/b.png'), 'bb');
    assert.deepEqual(idb.files().get('/assets/b.png'), { h: sha('bb'), body: 'bb' }, 'a file the worker fetched is stored in the database with its hash');
    assert.equal(idb.files().size, 2);
  });

  test('a worker without indexedDB (a phone\'s worker woken in the background) answers from the old caches and the network, storing nothing', async () => {
    const old = oldCacheStorage();
    await old.seed(OLD_SHARD_NAMES[oldShardOf('/assets/a.png')], '/assets/a.png', 'a', sha('a'));
    const list = { files: [{ p: '/assets/a.png', s: 1, h: sha('a') }, { p: '/assets/b.png', s: 2, h: sha('bb') }] };
    const w = worker(null, noCacheWrites(old), async (u) => (u === '/assets/browser-resources.json' ? new Response(JSON.stringify(list)) : new Response(u === '/assets/b.png' ? 'bb' : 'server')));
    assert.equal(await w.request('/assets/a.png'), 'a');
    assert.equal(await w.request('/assets/b.png'), 'bb', `no database: the file is fetched and answered all the same — ${RULE}`);
  });

  for (const refuses of [true, false]) {
    test(`the old caches are moved into the database and deleted (the single cache's keys ${refuses ? 'refused' : 'read'})`, async () => {
      const idb = fakeIndexedDB();
      const old = oldCacheStorage(refuses ? 2 : 1000);
      const list = { version: 'v2', files: [
        { p: '/assets/a.png', s: 1, h: sha('a') },     // in a shard, recorded by the page
        { p: '/assets/b.png', s: 2, h: sha('bb') },    // in a shard, stored by the worker on demand (not in the record)
        { p: '/assets/c.png', s: 3, h: sha('ccc') },   // changed by the deploy: the old copy is dropped, downloaded again
        { p: '/assets/d.png', s: 4, h: sha('dddd') },  // never cached
        { p: '/assets/e.png', s: 1, h: sha('e') },     // in the old single cache
        { p: '/assets/f.png', s: 1, h: sha('f') },     // in the record, but gone from every cache: downloaded again
      ] };
      const bodies = { '/assets/a.png': 'a', '/assets/b.png': 'bb', '/assets/c.png': 'ccc', '/assets/d.png': 'dddd', '/assets/e.png': 'e', '/assets/f.png': 'f' };
      const shard = (p) => OLD_SHARD_NAMES[oldShardOf(p)];
      await old.seed(shard('/assets/a.png'), '/assets/a.png', 'a', sha('a'));
      await old.seed(shard('/assets/b.png'), '/assets/b.png', 'bb', sha('bb'));
      await old.seed(shard('/assets/c.png'), '/assets/c.png', 'old', sha('old'));
      await old.seed(shard('/assets/gone.png'), '/assets/gone.png', 'g', sha('g')); // left the list
      for (const p of ['/assets/e.png', '/assets/x.png', '/assets/y.png']) await old.seed(OLD_SINGLE_CACHE, p, p === '/assets/e.png' ? 'e' : 'z', p === '/assets/e.png' ? sha('e') : sha('z'));
      const record = { '/assets/a.png': sha('a'), '/assets/c.png': sha('old'), '/assets/gone.png': sha('g'), '/assets/e.png': sha('e'), '/assets/f.png': sha('f') };
      (await old.open(OLD_META_CACHE)).m.set(ORIGIN + '/__sp_res_state__', { body: JSON.stringify(record), headers: {} });
      const { res, fetched, restore } = await load({ idb, caches: noCacheWrites(old) }, list, bodies, `migrate-${refuses}`);
      try {
        assert.equal(res.resStore.get().phase, 'done');
        assert.deepEqual([...old.named.keys()], [], `every old cache is deleted once emptied — ${RULE}`);
        assert.deepEqual(Object.fromEntries([...idb.files()].map(([p, v]) => [p, v.body])), bodies, 'the database holds the listed files');
        assert.deepEqual(fetched.sort(), ['/assets/c.png', '/assets/d.png', '/assets/f.png'], 'what an old cache held with the listed hash is moved, not downloaded again');
        assert.equal(res.resourceStatus().cleanup.moved, 3);
      } finally { restore(); }
    });
  }

  test('an outside caches.delete() of every cache (an ad blocker\'s service-worker code) loses nothing: the next load downloads nothing', async () => {
    const idb = fakeIndexedDB();
    const caches = oldCacheStorage();
    const files = Array.from({ length: 6 }, (_, i) => ({ p: `/assets/f${i}.png`, s: 1, h: sha(String(i)) }));
    const bodies = Object.fromEntries(files.map((f, i) => [f.p, String(i)]));
    const first = await load({ idb, caches: noCacheWrites(caches) }, { version: 'v1', files }, bodies, 'adblock-1');
    first.restore();
    assert.equal(first.fetched.length, 6);
    for (const n of await caches.keys()) await caches.delete(n); // what that code does on each restart of the blocker
    const again = await load({ idb, caches: noCacheWrites(caches) }, { version: 'v1', files }, bodies, 'adblock-2');
    try {
      assert.deepEqual(again.fetched, [], `the files are still stored — ${RULE}`);
      assert.equal(again.res.resStore.get().phase, 'done');
      assert.equal(again.res.resourceStatus().reconcile.keys, 6);
    } finally { again.restore(); }
  });
});

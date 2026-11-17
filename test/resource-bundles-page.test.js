// The page's side of the resource bundles (public/js/resources.js sanitizeBundles / readBundle; docs/rules/render.md
// 「리소스 묶음 받기」): a bundle whose missing members are at least half its bytes is read first, cut by the listed
// sizes as its bytes arrive, and each member stored under its own path after its own hash check; a failed bundle, a
// member that does not match and a bundle cut short by a match fall back to the files one by one.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cacheStorageOver } from './helpers/fake-cache-storage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RULE = 'docs/rules/render.md 「리소스 묶음 받기」';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ORIGIN = 'https://x.test';
let instance = 0;
/** a module instance of its own: the resource state is the module's */
const fresh = () => import(pathToFileURL(path.join(ROOT, 'public/js/resources.js')).href + `?bundles${++instance}`);

/** A list entry with its body (`b`, kept out of the list). */
const file = (p, body, extra = {}) => ({ p, s: Buffer.byteLength(body), h: sha(body), b: body, ...extra });
const listOf = (files, bundles) => ({ version: `v${instance}`, files: files.map(({ b, ...f }) => f), bundles });
const bundleOf = (p, files, members) => ({ p, s: members.reduce((n, i) => n + files[i].s, 0), m: members });

/** A body that arrives in chunks of `size` bytes (members cut across chunks); `stall` = stop after that many chunks until aborted. */
function chunked(text, size, { stall = Infinity, signal } = {}) {
  const bytes = Buffer.from(text);
  let at = 0, sent = 0;
  return new Response(new ReadableStream({
    pull(c) {
      if (at >= bytes.length) { c.close(); return undefined; }
      if (sent >= stall) {
        return new Promise((_, reject) => signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; c.error(e); reject(e); }));
      }
      c.enqueue(new Uint8Array(bytes.subarray(at, at + size)));
      at += size; sent++;
      return undefined;
    },
  }));
}

/** The browser globals installResources needs, a cache in a Map, and `fetch` answered by `serve(u, opts)`. */
async function withPage(serve, run, { cached = new Map(), prefs = new Map([['sp.pref.resources', JSON.stringify({ consent: 'yes', at: Date.now() })]]) } = {}) {
  const { store } = await import(pathToFileURL(path.join(ROOT, 'public/js/store.js')).href);
  const entries = new Map(cached); // url → { h, body }
  let stateJson = {};
  const urlOf = (r) => (typeof r === 'string' ? ORIGIN + r : r.url);
  const cache = {
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    match: async (r) => {
      const u = urlOf(r);
      if (u === ORIGIN + '/__sp_res_state__') return new Response(JSON.stringify(stateJson));
      return entries.has(u) ? new Response(entries.get(u).body, { headers: { 'X-SP-Hash': entries.get(u).h } }) : undefined;
    },
    delete: async (r) => entries.delete(urlOf(r)),
    put: async (r, resp) => {
      const u = urlOf(r);
      if (u === ORIGIN + '/__sp_res_state__') stateJson = await resp.json();
      else if (u.startsWith(ORIGIN + '/assets/')) entries.set(u, { h: resp.headers.get('X-SP-Hash'), body: await resp.text() });
    },
  };
  const fakeCaches = cacheStorageOver(cache);
  const saved = { window: globalThis.window, location: globalThis.location, caches: globalThis.caches, fetch: globalThis.fetch, localStorage: globalThis.localStorage,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  const before = store.get();
  const fetched = [];
  try {
    globalThis.window = { isSecureContext: true, caches: fakeCaches };
    globalThis.location = { origin: ORIGIN };
    globalThis.caches = fakeCaches;
    globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
    Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
    globalThis.fetch = async (u, opts) => { if (u !== '/assets/browser-resources.json') fetched.push(u); return serve(u, opts); };
    store.set({ session: { entered: true }, room: null });
    const res = await fresh();
    const idle = async (ms = 15000) => { for (let t = 0; t < ms && res.resStore.get().phase === 'running'; t += 30) await new Promise((r) => setTimeout(r, 30)); };
    await run({ res, store, fetched, entries, idle });
  } finally {
    store.set(before);
    for (const k of ['window', 'location', 'caches', 'fetch', 'localStorage']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete globalThis.navigator;
  }
}

/** Answers the list, a bundle (joined members' bodies, or `bundleBody`), and files by path whatever their query. */
const server = (list, files, { bundleBody, chunk = 3, stall, status } = {}) => (u, opts) => {
  if (u === '/assets/browser-resources.json') return new Response(JSON.stringify(list));
  const b = (list.bundles || []).find((x) => x.p === u);
  if (b) return status ? new Response('', { status }) : chunked(bundleBody ?? b.m.map((i) => files[i].b).join(''), chunk, { stall, signal: opts?.signal });
  const f = files.find((x) => x.p === u.split('?')[0] || x.u === u);
  return f ? new Response(f.b) : new Response('', { status: 404 });
};

describe('resource bundles in the page', () => {
  test('sanitizeBundles: a bundle path, this server\'s valid members in ascending order, sizes adding up', async () => {
    const { sanitizeBundles } = await fresh();
    const files = [file('/assets/a/1.json', 'aa'), file('/assets/a/2.json', 'bbb'), file('/assets/a/3.png', 'c', { u: 'https://cdn.jsdelivr.net/gh/o/r@b/3.png' }),
      { p: '/js/x.js', s: 1, h: sha('x') }, file('/assets/a/4.json', 'dddd')];
    const ok = sanitizeBundles([bundleOf('/assets/bundles/text-a-000000000000.pack', files, [0, 1, 4])], files);
    assert.deepEqual(ok.map((b) => [b.p, b.s, b.m.map((f) => f.p)]), [['/assets/bundles/text-a-000000000000.pack', 9, ['/assets/a/1.json', '/assets/a/2.json', '/assets/a/4.json']]],
      'members are the list entries by their index in `files` as listed (before the page filters it)');
    const bad = [
      bundleOf('/assets/packs/x.pack', files, [0, 1]), bundleOf('/assets/bundles/x.zip', files, [0, 1]),
      bundleOf('/assets/bundles/x.pack', files, [0, 2]), bundleOf('/assets/bundles/x.pack', files, [0, 3]),
      bundleOf('/assets/bundles/x.pack', files, [1, 0]), bundleOf('/assets/bundles/x.pack', files, [0]),
      { ...bundleOf('/assets/bundles/x.pack', files, [0, 1]), s: 6 }, { p: '/assets/bundles/x.pack', s: 5, m: [0, 1.5] }, null,
    ];
    assert.deepEqual(sanitizeBundles(bad, files), [], 'a jsDelivr member, an invalid entry, a wrong order or sum, a single member: no bundle (its files go one by one)');
    assert.deepEqual(sanitizeBundles(undefined, files), []);
  });

  test('a bundle is read once and cut into its files; a member that does not match and the files outside it go one by one', async () => {
    const files = [
      file('/assets/local/fx/a/1.json', 'first'), file('/assets/local/fx/a/2.json', 'second-file'), file('/assets/local/fx/a/3.json', ''),
      file('/assets/local/fx/a/4.json', 'fourth'), file('/assets/local/ui/lone.png', 'lone'),
      file('/assets/spine/op/x/x.png', 'up', { u: 'https://cdn.jsdelivr.net/gh/o/r@b/x.png' }),
    ];
    const P = '/assets/bundles/text-local.fx.a-0123456789ab.pack';
    const list = listOf(files, [bundleOf(P, files, [0, 1, 2, 3])]);
    // the bundle serves other bytes for member 4 (same length): only that member is fetched again, as a file
    const body = files[0].b + files[1].b + files[2].b + 'FOURTH';
    await withPage(server(list, files, { bundleBody: body, chunk: 4 }), async ({ res, fetched, entries, idle }) => {
      await res.installResources();
      await idle();
      assert.equal(fetched.filter((u) => u === P).length, 1, `the bundle is read once (${RULE})`);
      assert.deepEqual(fetched.filter((u) => u !== P).sort(), ['/assets/local/fx/a/4.json' + res.PAST_WORKER, '/assets/local/ui/lone.png' + res.PAST_WORKER, 'https://cdn.jsdelivr.net/gh/o/r@b/x.png'].sort(),
        'no member of the bundle is fetched as a file but the one whose bytes did not match');
      for (const f of files) assert.deepEqual(entries.get(ORIGIN + f.p), { h: f.h, body: f.b }, `${f.p}: stored under its own path with the listed hash`);
      const st = res.resourceStatus();
      assert.equal(st.download.failed, 0);
      assert.deepEqual(st.download.bundles, { listed: 1, fetched: 1, stopped: 0, failed: 0, members: 3 });
      assert.equal(res.resStore.get().bytesDone, res.resStore.get().bytesTotal);
    });
  });

  test('a failed bundle, and one whose missing files are under half its bytes, are not read: their files go one by one', async () => {
    const files = [file('/assets/local/fx/a/1.json', 'a'.repeat(10)), file('/assets/local/fx/a/2.json', 'b'.repeat(10)),
      file('/assets/local/fx/b/1.json', 'c'.repeat(30)), file('/assets/local/fx/b/2.json', 'd'.repeat(5)), file('/assets/local/fx/b/3.json', 'e'.repeat(5))];
    const A = '/assets/bundles/text-local.fx.a-aaaaaaaaaaaa.pack', B = '/assets/bundles/text-local.fx.b-bbbbbbbbbbbb.pack';
    const list = listOf(files, [bundleOf(A, files, [0, 1]), bundleOf(B, files, [2, 3, 4])]);
    const cached = new Map([[ORIGIN + files[2].p, { h: files[2].h, body: files[2].b }]]); // the game fetched b/1 on demand: b's missing 10 of 40 bytes
    const serve = (u, o) => (u === A ? new Response('', { status: 404 }) : server(list, files)(u, o));
    await withPage(serve, async ({ res, fetched, entries, idle }) => {
      await res.installResources();
      await idle();
      assert.ok(!fetched.includes(B), `a bundle with under half its bytes missing is not read (${RULE})`);
      assert.deepEqual(fetched.filter((u) => u !== A).sort(), [files[0].p, files[1].p, files[3].p, files[4].p].map((p) => p + res.PAST_WORKER).sort(),
        'the failed bundle\'s files and the other bundle\'s missing ones as files');
      for (const f of files) assert.equal(entries.get(ORIGIN + f.p)?.h, f.h);
      assert.equal(res.resourceStatus().download.bundles.failed, 1);
    }, { cached });
  });

  test('a match cuts a bundle short: what arrived stays stored, the rest follows one file at a time', async () => {
    const files = ['1', '2', '3', '4'].map((n) => file(`/assets/local/fx/a/${n}.json`, n.repeat(6)));
    const P = '/assets/bundles/text-local.fx.a-cccccccccccc.pack';
    const list = listOf(files, [bundleOf(P, files, [0, 1, 2, 3])]);
    // 2 chunks of 5 bytes, then nothing until the read is aborted: member 1 (6 bytes) is whole, member 2 not
    await withPage(server(list, files, { chunk: 5, stall: 2 }), async ({ res, store, fetched, entries, idle }) => {
      await res.installResources();
      for (let t = 0; t < 2000 && !entries.has(ORIGIN + files[0].p); t += 20) await new Promise((r) => setTimeout(r, 20));
      assert.ok(entries.has(ORIGIN + files[0].p), 'the first member is stored as soon as its bytes are in');
      store.set({ session: { entered: true }, room: { inMatch: true } }); // a match starts
      await idle();
      assert.equal(fetched.filter((u) => u === P).length, 1, `the bundle is not read again during the match (${RULE})`);
      assert.deepEqual(fetched.filter((u) => u !== P).sort(), files.slice(1).map((f) => f.p + res.PAST_WORKER).sort(), 'its files left go as files');
      for (const f of files) assert.equal(entries.get(ORIGIN + f.p)?.h, f.h);
      assert.deepEqual(res.resourceStatus().download.bundles, { listed: 1, fetched: 0, stopped: 1, failed: 0, members: 1 });
    });
  });

  test('the files go FILE_SLOTS at once outside a match and one at a time during one', async () => {
    const files = Array.from({ length: 40 }, (_, i) => file(`/assets/x/${i}.png`, `p${i}`, { u: `https://cdn.jsdelivr.net/gh/o/r@b/x/${i}.png` }));
    const list = listOf(files);
    const base = server(list, files);
    let now = 0, peak = 0;
    const slow = async (u, opts) => {
      if (u === '/assets/browser-resources.json') return base(u, opts);
      now++; peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 60));
      now--;
      return base(u, opts);
    };
    await withPage(slow, async ({ res, store, fetched, entries, idle }) => {
      assert.ok(res.FILE_SLOTS > 1, 'more than one file at once outside a match');
      await res.installResources();
      for (let t = 0; t < 3000 && fetched.length < 2 * res.FILE_SLOTS; t += 10) await new Promise((r) => setTimeout(r, 10));
      assert.equal(peak, res.FILE_SLOTS, `outside a match the download keeps FILE_SLOTS files in flight: the workers and limit() both come from it (${RULE})`);
      store.set({ session: { entered: true }, room: { inMatch: true } }); // a match starts
      for (let t = 0; t < 3000 && now > 1; t += 5) await new Promise((r) => setTimeout(r, 5)); // the files already asked for end
      peak = now;
      await idle();
      assert.ok(peak <= 1, `one file at a time during a match, ${peak} seen (${RULE})`);
      assert.equal(fetched.length, files.length, 'every file was fetched once');
      for (const f of files) assert.equal(entries.get(ORIGIN + f.p)?.h, f.h);
    });
  });
});

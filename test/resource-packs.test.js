// The skin data is a pack of the resource list (tools/build-browser-resources.mjs `packs`, public/js/resources.js): its
// files are downloaded only by a player who chose it, and the cache deletes them only when that player turns it off —
// a pack filter on the delete side would remove, on every visit, what the game fetched on demand (docs/rules/render.md
// 「스킨 모델 소재」). The skin models come from fexli/ArknightsResource (tools/fetch-skin-models.mjs matchSkins), the skins'
// avatars and portraits from yuanyan3060/ArknightsGameResource (tools/fetch-skin-art.mjs planArt).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const RULE = 'docs/rules/render.md 「스킨 모델 소재」';

describe('resource packs', () => {
  test('a file under a pack prefix is downloaded only when chosen and deleted only when turned off', async () => {
    const { sanitizePacks, packOf, resourceWanted, resourceKept } = await mod('public/js/resources.js');
    const packs = sanitizePacks({ skin: ['/assets/spine/skin/', '/assets/local/spine/skin/', 'https://x/', '/js/'], Bad: ['/assets/x/'], none: [] });
    assert.deepEqual(packs, { skin: ['/assets/spine/skin/', '/assets/local/spine/skin/'] }, 'only /assets/…/ prefixes of lower-case names');
    const skin = { p: '/assets/spine/skin/char_1_a/char_1_a_boc_1/front/char_1_a_boc_1.skel' };
    const base = { p: '/assets/spine/op/char_1_a/front/char_1_a.skel' };
    assert.equal(packOf(skin.p, packs), 'skin');
    assert.equal(packOf(base.p, packs), null);
    for (const chosen of [{}, { skin: false }, null]) assert.equal(resourceWanted(skin, packs, chosen), false, `not downloaded: ${JSON.stringify(chosen)}`);
    assert.equal(resourceWanted(skin, packs, { skin: true }), true);
    assert.equal(resourceWanted(base, packs, {}), true, 'a file in no pack is always downloaded');
    assert.equal(resourceKept(skin, packs, {}), true, `a pack never chosen deletes nothing (${RULE})`);
    assert.equal(resourceKept(skin, packs, { skin: false }), false, 'turned off: its files leave the cache');
    assert.equal(resourceKept(base, packs, { skin: false }), true);
  });

  test('installResources: the skin pack downloads on its own choice, keeps what is cached, and deletes only on off', async () => {
    const res = await mod('public/js/resources.js');
    const { store } = await mod('public/js/store.js');
    const sha = (s) => createHash('sha256').update(s).digest('hex');
    const origin = 'https://x.test';
    const raw = (n) => `https://raw.githubusercontent.com/fexli/ArknightsResource/${'a'.repeat(40)}/spine/${n}`;
    const SK = '/assets/spine/skin/o/o_s_1/front/';
    const list = {
      version: 'v1', packs: { skin: ['/assets/spine/skin/', '/assets/local/spine/skin/'] },
      files: [
        { p: '/assets/ui/a.png', s: 1, h: sha('a') },
        { p: SK + 'o_s_1.skel', s: 4, h: sha('skel'), u: raw('o/o_s_1/Front/o_s_1.skel') },
        { p: SK + 'o_s_1.png', s: 3, h: sha('png'), u: raw('o/o_s_1/Front/o_s_1.png') },
        { p: '/assets/local/spine/skin/o/o_s_1/illust/o_s_1.webp', s: 4, h: sha('webp') },
      ],
    };
    const entries = new Map([[origin + SK + 'o_s_1.skel', sha('skel')]]); // the game fetched it on demand once
    let stateJson = {};
    const urlOf = (r) => (typeof r === 'string' ? origin + r : r.url);
    const cache = {
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      match: async (r) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') return new Response(JSON.stringify(stateJson));
        return entries.has(u) ? new Response('x', { headers: { 'X-SP-Hash': entries.get(u) } }) : undefined;
      },
      delete: async (r) => entries.delete(urlOf(r)),
      put: async (r, resp) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') stateJson = await resp.json();
        else if (u.startsWith(origin + '/assets/')) entries.set(u, resp.headers.get('X-SP-Hash'));
      },
    };
    const fetched = [];
    const bodies = { [`https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@${'a'.repeat(40)}/spine/o/o_s_1/Front/o_s_1.png`]: 'png', '/assets/local/spine/skin/o/o_s_1/illust/o_s_1.webp': 'webp', '/assets/ui/a.png': 'a' };
    const fakeCaches = { open: async () => cache, delete: async () => true };
    const prefs = new Map();
    const saved = { window: globalThis.window, location: globalThis.location, caches: globalThis.caches, fetch: globalThis.fetch, localStorage: globalThis.localStorage,
      navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
    const before = store.get();
    const idle = async () => { for (let i = 0; i < 100 && (res.resStore.get().phase === 'running' || res.resourceStatus().cleanup.left); i++) await new Promise((r) => setTimeout(r, 30)); };
    try {
      globalThis.window = { isSecureContext: true, caches: fakeCaches };
      globalThis.location = { origin };
      globalThis.caches = fakeCaches;
      globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
      Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
      globalThis.fetch = async (u) => {
        if (u === '/assets/browser-resources.json') return new Response(JSON.stringify(list));
        fetched.push(u);
        return u in bodies ? new Response(bodies[u]) : new Response('', { status: 404 });
      };
      store.set({ session: { entered: true }, room: null });
      await res.installResources();
      assert.equal(res.resourceStatus().reconcile.stale, 0, `the skin model the game fetched on demand stays cached while the pack was never chosen (${RULE})`);
      assert.equal(res.resourceStatus().download.queued, 1, 'only the file in no pack is still to download');
      assert.equal(res.resStore.get().phase, 'ask', 'nothing starts before the consent');
      await res.setResourcePack('skin', true);
      await idle();
      assert.deepEqual(fetched.sort(), ['/assets/local/spine/skin/o/o_s_1/illust/o_s_1.webp', `https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@${'a'.repeat(40)}/spine/o/o_s_1/Front/o_s_1.png`].sort(),
        'choosing the pack downloads its files (the model from jsDelivr), without the general consent and without the file in no pack');
      assert.equal(entries.size, 3);
      assert.deepEqual(JSON.parse(prefs.get('sp.pref.resourcePacks')), { skin: true });
      await res.setResourcePack('skin', false);
      await idle();
      assert.deepEqual([...entries.keys()], [], 'turned off: every cached file of the pack is deleted');
    } finally {
      store.set(before);
      for (const k of ['window', 'location', 'caches', 'fetch', 'localStorage']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete globalThis.navigator;
    }
  });

  test('the resource tab: sizes in no pack and per pack apart, a paused pack waits, the skin row\'s state', async () => {
    const { store } = await mod('public/js/store.js');
    const sha = (s) => createHash('sha256').update(s).digest('hex');
    const origin = 'https://x.test';
    const SK = '/assets/local/spine/skin/o/o_s_1/illust/';
    const list = {
      version: 'v2', packs: { skin: ['/assets/spine/skin/', '/assets/local/spine/skin/'] },
      files: [
        { p: '/assets/ui/a.png', s: 1, h: sha('a') }, { p: '/assets/ui/b.png', s: 2, h: sha('bb') },
        { p: SK + 'one.webp', s: 3, h: sha('one') }, { p: SK + 'two.webp', s: 5, h: sha('twoxx') },
      ],
    };
    const bodies = { '/assets/ui/a.png': 'a', '/assets/ui/b.png': 'bb', [SK + 'one.webp']: 'one', [SK + 'two.webp']: 'twoxx' };
    const entries = new Map([[origin + '/assets/ui/a.png', sha('a')]]); // one general file the game fetched on demand
    let stateJson = {};
    const urlOf = (r) => (typeof r === 'string' ? origin + r : r.url);
    const cache = {
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      match: async (r) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') return new Response(JSON.stringify(stateJson));
        return entries.has(u) ? new Response('x', { headers: { 'X-SP-Hash': entries.get(u) } }) : undefined;
      },
      delete: async (r) => entries.delete(urlOf(r)),
      put: async (r, resp) => {
        const u = urlOf(r);
        if (u === origin + '/__sp_res_state__') stateJson = await resp.json();
        else if (u.startsWith(origin + '/assets/')) entries.set(u, resp.headers.get('X-SP-Hash'));
      },
    };
    const fetched = [];
    const fakeCaches = { open: async () => cache, delete: async () => true };
    const prefs = new Map([['sp.pref.resourcePacks', JSON.stringify({ skin: true })]]); // chosen on an earlier visit
    const saved = { window: globalThis.window, location: globalThis.location, caches: globalThis.caches, fetch: globalThis.fetch, localStorage: globalThis.localStorage,
      navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
    const before = store.get();
    try {
      globalThis.window = { isSecureContext: true, caches: fakeCaches };
      globalThis.location = { origin };
      globalThis.caches = fakeCaches;
      globalThis.localStorage = { getItem: (k) => prefs.get(k) ?? null, setItem: (k, v) => prefs.set(k, String(v)) };
      Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: async () => {} } }, configurable: true });
      globalThis.fetch = async (u) => {
        if (u === '/assets/browser-resources.json') return new Response(JSON.stringify(list));
        fetched.push(u);
        return u in bodies ? new Response(bodies[u]) : new Response('', { status: 404 });
      };
      store.set({ session: { entered: true }, room: null });
      // a module instance of its own: the pack choice is read when the module loads
      const res = await import(pathToFileURL(path.join(ROOT, 'public/js/resources.js')).href + '?tab');
      const idle = async () => { for (let i = 0; i < 100 && res.resStore.get().phase === 'running'; i++) await new Promise((r) => setTimeout(r, 30)); };
      assert.deepEqual(res.resStore.get().chosen, { skin: true });
      res.pauseResourcePack('skin', true);
      await res.installResources();
      await idle();
      const r = res.resStore.get();
      assert.deepEqual(r.sizes, { '': { total: 3, left: 2 }, skin: { total: 8, left: 8 } },
        'the tab shows the files in no pack and the skin pack apart (the consent card\'s pendingBytes counts both)');
      assert.equal(r.pendingBytes, 10);
      assert.deepEqual(fetched, [], 'paused: the chosen pack waits, and nothing in no pack starts without the consent');
      assert.equal(res.skinPackState(r), 'paused');
      res.pauseResourcePack('skin', false);
      await idle();
      assert.deepEqual(fetched.sort(), [SK + 'one.webp', SK + 'two.webp'], 'resumed: the pack\'s files, still not the general ones');
      assert.deepEqual(res.resStore.get().sizes, { '': { total: 3, left: 2 }, skin: { total: 8, left: 0 } });
      assert.equal(res.skinPackState(res.resStore.get()), 'done');
      await res.acceptResources();
      await idle();
      assert.deepEqual(res.resStore.get().sizes[''], { total: 3, left: 0 }, 'the general consent downloads the rest');
      assert.ok(fetched.includes('/assets/ui/b.png'));
    } finally {
      store.set(before);
      for (const k of ['window', 'location', 'caches', 'fetch', 'localStorage']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete globalThis.navigator;
    }
  });

  test('skinPackState: what the skin row shows', async () => {
    const { skinPackState } = await mod('public/js/resources.js');
    const r = (o) => ({ sizes: { skin: { total: 8, left: 3 } }, chosen: { skin: true }, paused: {}, phase: 'running', runGroups: ['', 'skin'], ...o });
    assert.equal(skinPackState(r({ chosen: {} })), 'off');
    assert.equal(skinPackState(r({ chosen: { skin: false } })), 'off');
    assert.equal(skinPackState(r()), 'running');
    assert.equal(skinPackState(r({ runGroups: [''] })), 'left', 'a run of other files only');
    assert.equal(skinPackState(r({ phase: 'error' })), 'left');
    assert.equal(skinPackState(r({ paused: { skin: true } })), 'paused');
    assert.equal(skinPackState(r({ sizes: { skin: { total: 8, left: 0 } }, paused: { skin: true } })), 'done');
  });
});

describe('tools/fetch-skin-models.mjs matchSkins', () => {
  const blobs = (paths) => paths.map(([p, size]) => ({ path: p, size }));
  const side = (dir, name, sideName, size = 10) => ['skel', 'atlas', 'png'].map((e) => [`${dir}/${sideName}/${name}.${e}`, e === 'skel' ? size : 1]);
  test('an exact folder (any case, # → _), a renamed folder by its letters and skeleton sizes, never the default model', async () => {
    const { matchSkins, listPath } = await mod('tools/fetch-skin-models.mjs');
    const skins = {
      'char_1_a@boc#1': { owner: 'char_1_a', prefab: 'char_1_a_boc#1', front: {}, back: {} },
      'tok_a_winter#1': { owner: 'tok_a', prefab: 'tok_a_winter#1', front: {} },
      'tok_a_sweep#1': { owner: 'tok_a', prefab: 'tok_a_sweep#1', front: {} },
    };
    const tree = blobs([
      ...side('char_1_a/char_1_a_BOC_1', 'char_1_a_BOC_1', 'Front'), ...side('char_1_a/char_1_a_BOC_1', 'char_1_a_BOC_1', 'Back'),
      ...side('tok_a/tok_a', 'tok_a', 'Spine', 7), ...side('tok_a/tok_a_winter_2', 'tok_a_winter_2', 'Spine', 9),
    ]);
    const { found, missing } = matchSkins(skins, tree, (key) => (key === 'tok_a_winter#1' ? [9] : key === 'tok_a_sweep#1' ? [7] : [10, 10]));
    assert.deepEqual(found['char_1_a@boc#1'], { dir: 'char_1_a/char_1_a_BOC_1', sides: ['Front', 'Back'] });
    assert.deepEqual(found['tok_a_winter#1'], { dir: 'tok_a/tok_a_winter_2', sides: ['Spine'], alias: true });
    assert.deepEqual(Object.keys(missing), ['tok_a_sweep#1'], 'the default model has its skeleton size but is not the skin: drawn with the default model');
    assert.equal(listPath('tok_a/tok_a_winter_2/Spine/tok_a_winter_2.png'), '/assets/spine/skin/tok_a/tok_a_winter_2/front/tok_a_winter_2.png');
  });

  test('two folders that could be the skin stop the run', async () => {
    const { matchSkins } = await mod('tools/fetch-skin-models.mjs');
    const tree = blobs([...side('tok_a/tok_a_winter_2', 'tok_a_winter_2', 'Spine', 9), ...side('tok_a/tok_a_winter_3', 'tok_a_winter_3', 'Spine', 9)]);
    assert.throws(() => matchSkins({ 'tok_a_winter#1': { owner: 'tok_a', prefab: 'tok_a_winter#1', front: {} } }, tree, () => [9]), /2 folders/);
  });
});

describe('tools/fetch-skin-art.mjs planArt', () => {
  const skins = {
    'char_1_a@boc#1': { owner: 'char_1_a', prefab: 'char_1_a_boc#1' },
    'tok_a_winter#1': { owner: 'tok_a', prefab: 'tok_a_winter#1' },
    'tok_b_sale#2': { owner: 'tok_b', prefab: 'tok_b_sale#2' },
  };
  const table = {
    'char_1_a@boc#1': { avatarId: 'char_1_a_boc#1', portraitId: 'char_1_a_boc#1' },
    'tok_a_winter#1': { avatarId: 'tok_a_winter#1', portraitId: null },
    'tok_b_sale#2': { avatarId: 'tok_b_sale#2' },
  };
  const blobs = ['avatar/char_1_a_boc#1.png', 'portrait/char_1_a_boc#1.png', 'avatar/TOK_A_winter#1.png'].map((p) => ({ path: p, size: 1, sha: 'x' }));

  test('the record\'s avatar and portrait ids, any case, under the extractor\'s path without `#`; a picture the repository lacks is missing', async () => {
    const { planArt, rawUrl } = await mod('tools/fetch-skin-art.mjs');
    const { validPath } = await mod('public/js/resources.js');
    const { want, missing } = planArt(skins, table, blobs);
    assert.deepEqual(want.map((w) => [w.key, w.kind, w.repoPath, w.path]), [
      ['char_1_a@boc#1', 'avatar', 'avatar/char_1_a_boc#1.png', '/assets/spine/skin/char_1_a/char_1_a_boc-1/avatar/char_1_a_boc-1.png'],
      ['char_1_a@boc#1', 'portrait', 'portrait/char_1_a_boc#1.png', '/assets/spine/skin/char_1_a/char_1_a_boc-1/portrait/char_1_a_boc-1.png'],
      ['tok_a_winter#1', 'avatar', 'avatar/TOK_A_winter#1.png', '/assets/spine/skin/tok_a/tok_a_winter-1/avatar/tok_a_winter-1.png'],
    ], `a summon skin's record has no portrait: nothing to take (${RULE})`);
    assert.deepEqual(missing, { 'tok_b_sale#2': ['avatar'] }, 'drawn with the default avatar');
    for (const w of want) assert.ok(validPath(w.path), `${w.path}: a path the resource list keeps`);
    assert.equal(rawUrl('r'.repeat(40), 'avatar/char_1_a_boc#1.png'),
      `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/${'r'.repeat(40)}/avatar/char_1_a_boc%231.png`, 'the `#` of a repository name is escaped in its URL');
  });

  test('a skin the table lacks, a name the file rule does not know and two files that differ only in case stop the run', async () => {
    const { planArt } = await mod('tools/fetch-skin-art.mjs');
    assert.throws(() => planArt({ 'x@y#1': { owner: 'x', prefab: 'x_y#1' } }, {}, blobs), /not in skin_table/);
    assert.throws(() => planArt({ 'x@y#1': { owner: 'x', prefab: 'x-y#1' } }, { 'x@y#1': { avatarId: 'x_y' } }, [{ path: 'avatar/x_y.png', size: 1, sha: 'x' }]), /no file name rule/);
    const twins = [{ path: 'avatar/AB.png', size: 1, sha: 'x' }, { path: 'avatar/ab.png', size: 1, sha: 'y' }];
    assert.throws(() => planArt({ k: { owner: 'o', prefab: 'o_p' } }, { k: { avatarId: 'Ab' } }, twins), /only in case/);
  });
});

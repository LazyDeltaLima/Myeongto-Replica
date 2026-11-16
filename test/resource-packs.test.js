// The skin data is a pack of the resource list (tools/build-browser-resources.mjs `packs`, public/js/resources.js): its
// files are downloaded only by a player who chose it, and the cache deletes them only when that player turns it off —
// a pack filter on the delete side would remove, on every visit, what the game fetched on demand (docs/rules/render.md
// 「스킨 모델 소재」). The skin models come from fexli/ArknightsResource (tools/fetch-skin-models.mjs matchSkins).

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

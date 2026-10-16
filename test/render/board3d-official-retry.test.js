// test/render/board3d-official-retry.test.js — an official stage scene that could not be loaded whole is not drawn
// (2026-10-11 maintainer report 「일부 유저가 3D 렌더링이 제대로 안 된다」): a texture that failed to load (a dropped request
// on a phone) was kept for the page and its material sampled black — opaque parts black, cut-out ones gone, no baked
// light. official.js loadOfficialScene now rejects while something is missing and loads only that again on `retry`
// (`partial` settles for what loaded); board3d/scene.js keeps the procedural board meanwhile and tries again after
// OFFICIAL_RETRY_MS, the last try partial.
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadOfficialScene, resetOfficialScenes } from '../../public/js/render/board3d/official.js';
import { BoardScene, OFFICIAL_RETRY_MS, WARM_MAX_MS } from '../../public/js/render/board3d/scene.js';
import { resolveUvTable } from '../../public/js/render/board3d/atlas.js';

const STAGE = 'act1autochess_m01';
const DOC = {
  groups: [],
  materials: { sand: { textures: { _MainTex: { file: 'map_sand.png' } } }, rock: { textures: { _MainTex: { file: 'map_rock.png' } } } },
  lightmaps: [{ light: { file: 'lm0_light.png' }, mask: { file: 'lm0_mask.png' } }],
};

/** An asset store whose images in `failing` fail (until taken out of it); counts the image requests per URL. */
function fakeAssets({ failing = new Set(), listed = true } = {}) {
  const asked = new Map();
  return {
    failing, asked,
    local: async () => ({}),
    localUrl: (g, n) => (listed && g === `scene/${STAGE}` || g === 'scene/tex' ? `/assets/local/${g}/${n}.webp` : null),
    image: async (u, o) => {
      asked.set(u, (asked.get(u) || 0) + 1);
      if (failing.has(u.replace(/^.*\//, '').replace(/\.webp$/, ''))) return null;
      return { width: 4, height: 4, retry: !!o?.retry };
    },
  };
}

let realFetch;
beforeEach(() => {
  resetOfficialScenes();
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/scene.webp')) return { ok: true, json: async () => DOC };
    if (String(url).endsWith('/geom.webp')) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    return { ok: false };
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('official.js loadOfficialScene: a scene is drawn whole or not at all', () => {
  test('every texture loaded: the scene with its textures and lightmaps', async () => {
    const data = await loadOfficialScene(fakeAssets(), STAGE);
    assert.equal(data.stageId, STAGE);
    assert.deepEqual(Object.keys(data.textures).sort(), ['map_rock.png', 'map_sand.png']);
    assert.ok(data.lightmaps[0].light && data.lightmaps[0].mask);
  });

  test('a missing texture rejects; retry asks only for what failed and then resolves', async () => {
    const assets = fakeAssets({ failing: new Set(['map_rock', 'lm0_mask']) });
    await assert.rejects(loadOfficialScene(assets, STAGE), /incomplete: 2 missing/);
    await assert.rejects(loadOfficialScene(assets, STAGE), /incomplete/, 'a plain call keeps the failure (no request storm)');
    assert.equal(assets.asked.get('/assets/local/scene/tex/map_rock.webp'), 1);
    assets.failing.clear();
    const data = await loadOfficialScene(assets, STAGE, { retry: true });
    assert.ok(data.textures['map_rock.png'] && data.lightmaps[0].mask);
    assert.equal(assets.asked.get('/assets/local/scene/tex/map_rock.webp'), 2);
    assert.equal(data.textures['map_rock.png'].retry, true, 'the failed image is asked for with retry');
    assert.equal(await loadOfficialScene(assets, STAGE), data, 'a complete scene stays cached');
    assert.equal(await loadOfficialScene(assets, STAGE, { retry: true }), data, 'and is not loaded again on retry');
  });

  test('partial settles for what loaded (a file the server lacks never comes)', async () => {
    const assets = fakeAssets({ failing: new Set(['map_rock']) });
    const data = await loadOfficialScene(assets, STAGE, { retry: true, partial: true });
    assert.ok(data.textures['map_sand.png']);
    assert.equal(data.textures['map_rock.png'], undefined);
  });

  test('scene.json or geom.bin that failed to load is tried again; a stage without a scene resolves null', async () => {
    const assets = fakeAssets();
    const fetchOk = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('network'); };
    await assert.rejects(loadOfficialScene(assets, STAGE), /incomplete/);
    globalThis.fetch = fetchOk;
    assert.equal((await loadOfficialScene(assets, STAGE, { retry: true })).stageId, STAGE);
    assert.equal(await loadOfficialScene(fakeAssets({ listed: false }), 'act1autochess_m99'), null);
  });
});

function stubRenderer() {
  return {
    domElement: { addEventListener() {}, removeEventListener() {} },
    shadowMap: { enabled: true, needsUpdate: false },
    capabilities: { getMaxAnisotropy: () => 8 },
    info: { render: { calls: 0, triangles: 0 }, memory: { textures: 0, geometries: 0 } },
    setClearColor() {}, setPixelRatio() {}, setSize() {}, render() {}, dispose() {},
  };
}
const fakePack = () => ({ key: 'test', images: { D: { width: 4, height: 4 } }, meshes: { gate: {} }, tiles: null, uv: resolveUvTable(null), materials: {} });
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

describe('board3d/scene.js: an incomplete official scene keeps the procedural board and is tried again', () => {
  test('the retry schedule exists and ends with a partial try', () => {
    assert.ok(OFFICIAL_RETRY_MS.length >= 3 && OFFICIAL_RETRY_MS.every((ms) => ms > 0));
  });

  test('rejections are tried again with retry, the last one partial; a stage without a scene stays procedural', async () => {
    const calls = [];
    const notes = [];
    const board = new BoardScene(THREE, fakePack(), {
      renderer: stubRenderer(), officialRetryMs: [1, 1],
      loadOfficial: async (id, o) => { calls.push(o); if (!o.partial) throw new Error('incomplete'); return null; },
      onOfficialMissing: (id, why, n) => notes.push([id, n]),
    });
    board.setStage({ id: STAGE, rows: ['000'], devices: [] });
    for (let i = 0; i < 20 && calls.length < 3; i++) await tick(5);
    await tick(5);
    assert.deepEqual(calls, [{ retry: false, partial: false }, { retry: true, partial: false }, { retry: true, partial: true }]);
    assert.deepEqual(notes, [[STAGE, 1], [STAGE, 2]]);
    assert.equal(board.official, false);
    assert.equal(board.officialData.get(STAGE), null);
    board.destroy();
  });

  test('destroy cancels a pending retry', async () => {
    let calls = 0;
    const board = new BoardScene(THREE, fakePack(), {
      renderer: stubRenderer(), officialRetryMs: [20],
      loadOfficial: async () => { calls++; throw new Error('incomplete'); },
    });
    board.setStage({ id: STAGE, rows: ['000'], devices: [] });
    await tick(5);
    assert.equal(calls, 1);
    board.destroy();
    await tick(40);
    assert.equal(calls, 1);
  });
});

// An iPhone report (2026-10-16) saw the field stall for seconds right after it appeared, when the official scene arrived:
// swapped in at once, its first frame compiled every shader, uploaded every texture and drew the shadow map together.
// The loaded scene is now built off screen and warmed (compileAsync, textures one per frame) while the procedural board
// stays; then it replaces the board.
describe('board3d/scene.js: a loaded official scene is warmed off screen before it replaces the board', () => {
  const SCENE = { stageId: STAGE, doc: { groups: [], materials: {} }, buffer: new ArrayBuffer(0), textures: {}, lightmaps: [] };
  const warming = () => {
    let release;
    const R = { ...stubRenderer(), compiled: [], compileAsync(obj, cam, target) { this.compiled.push({ obj, cam, target }); return new Promise((r) => { release = r; }); } };
    return { R, release: () => release() };
  };

  test('the procedural board stays until the shaders are ready; the scene is loaded once and swapped in', async () => {
    const { R, release } = warming();
    let loads = 0;
    const seen = [];
    const board = new BoardScene(THREE, fakePack(), { renderer: R, loadOfficial: async () => { loads++; return SCENE; }, onOfficial: (o) => seen.push(o?.stageId ?? null) });
    const stage = { id: STAGE, rows: ['000'], devices: [] };
    board.setStage(stage);
    await tick(5);
    assert.equal(R.compiled.length, 1, 'compiled off screen');
    assert.ok(R.compiled[0].target === board.scene && R.compiled[0].cam === board.camera, 'with the board scene\'s lights and camera');
    assert.equal(board.official, false, 'still procedural while warming');
    board.stageKey = null; board.setStage(stage);   // an area rebuild meanwhile neither swaps nor loads again
    assert.equal(board.official, false);
    assert.equal(loads, 1);
    release();
    await tick(15);
    assert.equal(board.official, true, 'swapped in once warm');
    assert.deepEqual(seen, [STAGE]);
    assert.equal(loads, 1);
    assert.equal(board._officialWarm, null, 'the warmed build was taken');
    board.destroy();
  });

  test('a renderer without compileAsync swaps it in at once; WARM_MAX_MS bounds a warm that never ends', async () => {
    assert.ok(WARM_MAX_MS >= 1000 && WARM_MAX_MS <= 15000);
    const board = new BoardScene(THREE, fakePack(), { renderer: stubRenderer(), loadOfficial: async () => SCENE });
    board.setStage({ id: STAGE, rows: ['000'], devices: [] });
    await tick(5);
    assert.equal(board.official, true);
    board.destroy();
  });

  test('destroyed while warming: the warmed build is disposed, nothing is swapped in', async () => {
    const { R, release } = warming();
    const board = new BoardScene(THREE, fakePack(), { renderer: R, loadOfficial: async () => SCENE });
    board.setStage({ id: STAGE, rows: ['000'], devices: [] });
    await tick(5);
    board.destroy();
    release();
    await tick(15);
    assert.equal(board.official, false);
    assert.equal(board._officialWarm, null);
  });
});

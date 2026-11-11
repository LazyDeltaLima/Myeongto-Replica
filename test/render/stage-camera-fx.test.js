// test/render/stage-camera-fx.test.js — the camera effect of the level on the board (2026-11-11, docs/rules/fx.md 「규정
// 전장의 화면·맵 이펙트」): 规程's ice stages' level prefabs name screen_ICEWILD_frost_01 in MapGraphic `_effectSettings.
// cameraEffect` (tools/local-extract/scene_extract.py writes it into the scene's `map`); the official scene hands it to
// render/app.js (onOfficial `camera`), which has the effect layer hold it (fxgame.js setStageCamera) in prep and battle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const FROST = 'screen_ICEWILD_frost_01';

async function layerWith(files) {
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  const frame = () => { layer.update(1 / 60, { dist: 20 }, { width: 100, height: 100 }); return seen.splice(0).filter((p) => /^camera/.test(p.kind)).map((p) => `${p.kind} ${p.names[0]}`); };
  return { layer, frame };
}

test('the level\'s camera effect is held with no enemy and no battle views, again after a clear(), off with the next level', async () => {
  const fetch0 = globalThis.fetch;
  try {
    // (one file: the layer caches the index per process) the name as MapGraphic writes it, the extracted one lower-cased:
    // found by name, without case
    const { layer, frame } = await layerWith({ '/assets/local/fx/index.json': { bundles: { screen: ['screen_icewild_frost_01'] } } });
    assert.deepEqual(frame(), [], 'no level camera: nothing');
    layer.setStageCamera(['screen_not_extracted']);
    assert.deepEqual(frame(), [], 'one not extracted: nothing');
    layer.setStageCamera([FROST]);
    assert.deepEqual(frame(), [`camera ${FROST}`], 'on in prep (no views, no enemy bindings)');
    assert.deepEqual(frame(), [], 'held');
    layer.clear();
    assert.deepEqual(frame(), [`camera ${FROST}`], 'a phase change drops the live one: started again');
    layer.setStageCamera([]);
    assert.deepEqual(frame(), [`cameraOff ${FROST}`], 'another level: off');
  } finally { globalThis.fetch = fetch0; }
});

test('the official scene hands its map\'s cameraEffect to the app, which sets it on the effect layer', () => {
  assert.match(read('public/js/render/board3d/official.js'), /camera: typeof doc\.map\?\.cameraEffect === 'string' && doc\.map\.cameraEffect \? doc\.map\.cameraEffect : null,/);
  assert.match(read('public/js/render/board3d/scene.js'), /camera: built\.camera \?\? null \}\);/);
  assert.match(read('public/js/render/app.js'), /fxGame\.setStageCamera\(info\?\.camera \? \[info\.camera\] : \[\]\);/);
  assert.match(read('tools/local-extract/scene_extract.py'), /sc\.map\['cameraEffect'\] = cam/);
});

const SCENE = (id) => new URL(`public/assets/local/scene/${id}/scene.json`, ROOT);
test('the extracted 规程 scenes: the ice stages name the frost effect, the others none', { skip: !existsSync(SCENE('act3autochess_m09')) && 'no extracted scenes' }, () => {
  for (const id of ['act3autochess_m09', 'act3autochess_m11']) assert.equal(JSON.parse(readFileSync(SCENE(id), 'utf8')).map?.cameraEffect, FROST, id);
  for (const id of ['act3autochess_m01', 'act3autochess_m10']) if (existsSync(SCENE(id))) assert.equal(JSON.parse(readFileSync(SCENE(id), 'utf8')).map?.cameraEffect, undefined, id);
  const idx = JSON.parse(readFileSync(new URL('public/assets/local/fx/index.json', ROOT), 'utf8'));
  assert.ok(Object.values(idx.bundles).some((b) => b.some((n) => n.toLowerCase() === FROST.toLowerCase())), 'the frost effect extracted');
});

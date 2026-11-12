// test/render/stage-tile-fx.test.js — the map effects of a stage's tiles (2026-11-12, docs/rules/fx.md 「규정 전장의 화면·맵 이펙트」):
// a client tile prefab's `_effect` plays on its tile while the map stands (EN and CN `[uc]tiles.ab`: tile_duel_grassland →
// mapeff_079_dikuai_01, tile_mire → mapeff_mud_ground_01). render/app.js hands the stage's tiles (fxgame.js stageTileFx) to the
// effect layer (setStageTiles), which lays one per tile on the floor layer, pinned and `tiled` (fxplayer.js TileBatch), in prep
// and battle alike, again after a clear().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFxLayer, stageTileFx, TILE_FX } from '../../public/js/render/fxgame.js';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const stages = (p) => { const d = JSON.parse(read(p)); return Array.isArray(d) ? d : Object.values(d.stages || d); };
const stage = (list, id) => list.find((s) => (s.id || s.stageId) === id);

test('stageTileFx: 规程 m09\'s 16 草地 and m06\'s 12 泥沼, act2autochess_m02\'s 泥沼, none elsewhere — at their glyphs', () => {
  const act3 = stages('data/seasons/act3autochess/stages.json'), act2 = stages('data/stages.json');
  const count = (st, name) => stageTileFx(st).filter((t) => t.name === name).length;
  assert.equal(count(stage(act3, 'act3autochess_m09'), 'mapeff_079_dikuai_01'), 16);
  assert.equal(count(stage(act3, 'act3autochess_m06'), 'mapeff_mud_ground_01'), 12);
  const m02 = stage(act2, 'act2autochess_m02');
  const mire = Object.entries(m02.tiles).filter(([, d]) => d.tileKey === 'tile_mire').map(([g]) => g);
  const glyphs = m02.rows.reduce((n, line) => n + [...line].filter((g) => mire.includes(g)).length, 0);
  assert.ok(glyphs > 0 && count(m02, 'mapeff_mud_ground_01') === glyphs, `m02: ${glyphs} mire tiles`);
  for (const t of stageTileFx(stage(act3, 'act3autochess_m09'))) assert.equal(stage(act3, 'act3autochess_m09').tiles[stage(act3, 'act3autochess_m09').rows[t.y][t.x]].tileKey, 'tile_duel_grassland');
  for (const st of [...act3, ...act2]) {
    const keys = new Set(Object.values(st.tiles || {}).map((d) => d.tileKey));
    if (!keys.has('tile_mire') && !keys.has('tile_duel_grassland')) assert.deepEqual(stageTileFx(st), [], st.id);
  }
  assert.deepEqual(stageTileFx(null), []);
  assert.deepEqual(Object.keys(TILE_FX).sort(), ['tile_duel_grassland', 'tile_mire']);
});

test('setStageTiles: one per tile on the floor layer, held, laid again after a clear(), off with the next stage; not extracted: none', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const files = { '/assets/local/fx/index.json': { bundles: { mapeff: ['mapeff_079_dikuai_01'] } } };
    globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const frame = async () => {
      layer.update(1 / 60, { dist: 20 }, { width: 100, height: 100 });
      await new Promise((r) => setTimeout(r, 5));
      return seen.splice(0).filter((p) => p.kind === 'spawn' && p.tag === 'stageTile').map((p) => p.names[0]).sort();
    };
    assert.deepEqual(await frame(), [], 'no stage: nothing');
    layer.setStageTiles([
      { bundle: 'mapeff', name: 'mapeff_079_dikuai_01', x: 3, y: 4 }, { bundle: 'mapeff', name: 'mapeff_079_dikuai_01', x: 4, y: 4 },
      { bundle: 'mapeff', name: 'mapeff_mud_ground_01', x: 5, y: 4 },   // not extracted
    ]);
    assert.deepEqual(await frame(), ['mapeff_079_dikuai_01', 'mapeff_079_dikuai_01'], 'one per tile, the extracted ones');
    assert.deepEqual(await frame(), [], 'held (a dry layer\'s spawn gives no entry: not tried again until a clear())');
    layer.clear();
    assert.deepEqual(await frame(), ['mapeff_079_dikuai_01', 'mapeff_079_dikuai_01'], 'a clear() drops them: laid again');
    layer.setStageTiles([]);
    layer.clear();
    assert.deepEqual(await frame(), [], 'another stage without tile effects: none');
  } finally { globalThis.fetch = fetch0; }
});

test('render/app.js hands every stage it shows to the layer', () => {
  const app = read('public/js/render/app.js');
  assert.match(app, /import \{ createFxLayer, stageTileFx(, stageCannons)? \} from '\.\/fxgame\.js';/);
  assert.match(app, /stageRec = st;\n {4}tiles\.setStage\(st\);\n {4}fxGame\.setStageTiles\(stageTileFx\(st\)\);/);
});

test('every TILE_FX prefab is in the extracted effect index (the 泥沼 from EN/CN pkgrps/btl_pfb_fx_mapeff_4.ab, 2026-11-12)', (t) => {
  let index;
  try { index = JSON.parse(read('public/assets/local/fx/index.json')); } catch { return t.skip('no extracted effects'); }
  for (const [key, [bundle, name]] of Object.entries(TILE_FX)) {
    assert.ok((index.bundles?.[bundle] || []).includes(name), `${key}: ${bundle}/${name} extracted`);
    const def = JSON.parse(read(`public/assets/local/fx/${bundle}/${name}.json`));
    assert.ok(def.nodes?.length > 1, `${name}: a tree`);
  }
  assert.equal(index.sources?.['mapeff/mapeff_mud_ground_01']?.pack, 'pkgrps/btl_pfb_fx_mapeff_4.ab');
});

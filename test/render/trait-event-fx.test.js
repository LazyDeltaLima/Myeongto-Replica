// test/render/trait-event-fx.test.js — 规程's 特质 effect (docs/rules/fx.md 「규정 특질 발동 이펙트」): in the prep the server's
// m.trait { uid, fx } (main.js → render/fxtrait.js queue → render/app.js frame) plays the prefab once over the piece's
// view as soon as it exists; in a battle the sim's ['tplfx', holder, prefab] plays it (fxgame.js tplFx, the `map`
// bundle). Its own file: the effect layer caches the index per process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { pushTraitFx, drainTraitFx, traitFxPending, clearTraitFx, WAIT_MS } from '../../public/js/render/fxtrait.js';
import { TRAIT_FX_BUNDLE } from '../../shared/traitFx.js';

const src = (p) => readFileSync(new URL(`../../public/js/${p}`, import.meta.url), 'utf8');
const macrotask = () => new Promise((r) => setImmediate(r));
const NAMES = ['map_v079_buff01', 'map_v079_buff02', 'map_v079_buff03', 'map_v079_buff04'];
const view = (uid, id = 100 + uid) => ({ id, uid, info: { id, side: 'player' }, x: 1, y: 1, z: 0, alive: true, facing: 1 });

function recorder() {
  const played = [];
  return { played, fx: { statusOnce: (v, b, n) => played.push([v.uid, b, n]) } };
}

test('a queued m.trait waits for its piece\'s view, plays once over it, and goes', () => {
  clearTraitFx();
  const { played, fx } = recorder();
  pushTraitFx({ uid: 5, fx: 'map_v079_buff01' }, 1000);
  assert.ok(traitFxPending());
  drainTraitFx(new Map(), fx, true, 1100); // the m.private with the bought piece has not come yet
  assert.deepEqual(played, []);
  const views = new Map([['p:5', view(5)]]);
  drainTraitFx(views, fx, true, 1200);
  assert.deepEqual(played, [[5, TRAIT_FX_BUNDLE, 'map_v079_buff01']]);
  assert.ok(!traitFxPending());
  drainTraitFx(views, fx, true, 1300);
  assert.equal(played.length, 1, 'once');
});

test('a battle on screen plays none; a piece that never shows is dropped after WAIT_MS; malformed frames are ignored', () => {
  clearTraitFx();
  const { played, fx } = recorder();
  const views = new Map([['p:5', view(5)]]);
  pushTraitFx({ uid: 5, fx: 'map_v079_buff03' }, 0);
  drainTraitFx(views, fx, false, 10);
  assert.deepEqual(played, []);
  pushTraitFx({ uid: 6, fx: 'map_v079_buff04' }, 0);
  drainTraitFx(views, fx, true, WAIT_MS + 1);
  assert.deepEqual(played, [], 'both too old');
  assert.ok(!traitFxPending());
  for (const m of [null, {}, { uid: '5', fx: 'map_v079_buff01' }, { uid: 5, fx: 'common_heal_hit_01' }, { uid: 5 }]) pushTraitFx(m, 0);
  assert.ok(!traitFxPending());
  pushTraitFx({ uid: 5, fx: 'map_v079_buff02' }, 0);
  drainTraitFx(new Map([['p:5', { ...view(5), alive: false }]]), fx, true, 1);
  assert.deepEqual(played, [], 'not over a leaving view');
  clearTraitFx();
});

test('main.js queues m.trait in the game; the field view drains the queue every prep frame', () => {
  const main = src('main.js');
  assert.match(main, /net\.on\('m\.trait', \(msg\) => \{ if \(selectRoute\(store\.get\(\)\) === 'game'\) pushTraitFx\(msg\); \}\)/);
  assert.match(src('render/app.js'), /if \(traitFxPending\(\)\) drainTraitFx\(views, fxGame, mode === 'prep'\)/);
});

test('through the effect layer: m.trait\'s statusOnce and the battle\'s tplfx both play the `map` prefab on the unit', async () => {
  const files = { '/assets/local/fx/index.json': { bundles: { map: NAMES } } };
  for (const n of NAMES) files[`/assets/local/fx/map/${n}.json`] = { nodes: [{}] };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(`${p.kind}:${p.tag ?? ''} ${p.names.join('+')} on ${p.on ?? p.by}`) });
    await macrotask();
    const v = view(5, 7);
    clearTraitFx();
    pushTraitFx({ uid: 5, fx: 'map_v079_buff01' });
    drainTraitFx(new Map([['p:5', v]]), layer, true);
    layer.onEvent(['tplfx', 7, 'map_v079_buff03', null], new Map([[7, v]]));
    await macrotask();
    assert.deepEqual(seen, ['statusEnd: map_v079_buff01 on 7', 'spawn:tplfx map_v079_buff03 on 7']);
  } finally { globalThis.fetch = fetch0; clearTraitFx(); }
});

const FX = new URL('../../public/assets/local/fx/', import.meta.url);
test('the extracted prefabs: four, at the head, each with its type\'s icon', { skip: !existsSync(new URL('map/map_v079_buff01.json', FX)) && 'effects not extracted' }, () => {
  const idx = JSON.parse(readFileSync(new URL('index.json', FX), 'utf8'));
  const icons = { map_v079_buff01: ['map_v079_obj_01', 'map_v079_obj_02'], map_v079_buff02: ['map_v079_obj_03', 'map_v079_obj_04'], map_v079_buff03: ['map_v079_obj_05', 'map_v079_obj_06'], map_v079_buff04: ['map_v079_obj_07', 'map_v079_obj_08'] };
  for (const n of NAMES) {
    assert.ok(idx.bundles.map.includes(n), n);
    const d = JSON.parse(readFileSync(new URL(`map/${n}.json`, FX), 'utf8'));
    assert.equal(d.spawn, 4, `${n}: _spawnLocation head`);
    const tex = Object.values(d.materials).map((m) => m.tex?._MainTex?.img?.replace(/_[0-9a-f]{8}\.webp$/, '')).filter((x) => /^map_v079_obj/.test(x)).sort();
    assert.deepEqual(tex, icons[n], n);
  }
});

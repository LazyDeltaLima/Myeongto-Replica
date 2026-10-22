// local patch (docs/LOCAL-PATCH.md 「정예 기물 금빛」): the prep elite glow (render/fxgolden.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncGoldenFx, GOLDEN_FX } from '../public/js/render/fxgolden.js';

function fakeFx(ready = true) {
  const calls = [];
  return {
    calls,
    statusReady: (b, n) => ready && b === GOLDEN_FX[0] && n === GOLDEN_FX[1],
    statusOn(v, b, n, key, frac, hold, under) { (v._fxStatusOn ||= new Set()).add(key); calls.push(['on', v.id, key, under]); },
    statusOff(v, key) { v._fxStatusOn?.delete(key); calls.push(['off', v.id, key]); },
  };
}
const view = (o) => ({ id: o.id, flags: 0, prep: true, golden: true, isEnemy: false, isToken: false, alive: true, remove: false, destroyed: false, ...o });

test('the official golden effect id (battle_misc_table effectConfig.goldenEffectId)', () => {
  assert.deepEqual([...GOLDEN_FX], ['trap', 'trap_acgarm_buff_loop_01']);
});

test('prep: only a live elite ally operator glows, split behind the model', () => {
  const views = new Map([
    ['a', view({ id: 'a' })],
    ['b', view({ id: 'b', golden: false })],
    ['c', view({ id: 'c', isToken: true })],
    ['d', view({ id: 'd', isEnemy: true })],
  ]);
  const fx = fakeFx();
  syncGoldenFx(views, fx, true);
  assert.deepEqual(fx.calls, [['on', 'a', 'golden', true]]);
  syncGoldenFx(views, fx, true);
  assert.equal(fx.calls.length, 1, 'started once');
});

test('battle (not prep) or a removed view: the glow ends; nothing before the prefab is listed', () => {
  const v = view({ id: 'a' });
  const views = new Map([['a', v]]);
  const fx = fakeFx();
  syncGoldenFx(views, fx, true);
  syncGoldenFx(views, fx, false);
  assert.deepEqual(fx.calls.at(-1), ['off', 'a', 'golden']);
  const none = fakeFx(false);
  syncGoldenFx(new Map([['x', view({ id: 'x' })]]), none, true);
  assert.equal(none.calls.length, 0);
});

// maintainer decision 2026-10-17: while the glow cannot play (quality 'low', or the prefab not installed) the prep elite
// piece gets the ground ring instead (`goldenFallback`, render/elite-mark.js); never in battle, never on others
test('the ground ring stands in for the glow only while it cannot play, in the prep, on a live elite ally operator', () => {
  const views = new Map([
    ['a', view({ id: 'a' })],
    ['b', view({ id: 'b', golden: false })],
    ['c', view({ id: 'c', isToken: true })],
    ['d', view({ id: 'd', isEnemy: true })],
  ]);
  const flags = () => [...views.values()].map((v) => v.goldenFallback);
  syncGoldenFx(views, fakeFx(false), true);
  assert.deepEqual(flags(), [true, false, false, false], 'not ready (quality low): the ring');
  syncGoldenFx(views, fakeFx(false), false);
  assert.deepEqual(flags(), [false, false, false, false], 'battle: none');
  syncGoldenFx(views, fakeFx(true), true);
  assert.deepEqual(flags(), [false, false, false, false], 'the official glow plays: no ring');
  syncGoldenFx(views, null, true);
  assert.equal(views.get('a').goldenFallback, true, 'no effect layer at all: the ring');
});

test('elite marks: the ring lies outside the official facing ring; the badge is the official 精二 chevrons', async () => {
  const { ELITE_RING, ELITE_BADGE } = await import('../public/js/render/elite-mark.js');
  const { FACING } = await import('../public/js/render/facing.js');
  assert.ok(ELITE_RING.r > FACING.ring / 2, `ring ${ELITE_RING.r} vs facing ${FACING.ring / 2}`);
  assert.equal(ELITE_BADGE.ui, 'eliteLarge/elite_2_large');
  const { DEFAULT_SETTINGS, sanitizeSettings } = await import('../public/js/ui/gameLogic/settings.js');
  assert.equal(DEFAULT_SETTINGS.eliteBadge, false, 'the badge is off by default (official look)');
  assert.equal(sanitizeSettings({ eliteBadge: true }).eliteBadge, true);
  assert.equal(sanitizeSettings({ eliteBadge: 'yes' }).eliteBadge, false);
});

// the glow's place (official recording 2026-10-08): fxplayer FxInstance drops the root node's own position (opts.atSpawn)
// and hands each quad renderer its m_Pivot (uPivot, opts.pivot) — the elite glow's bao band pivot x .95 runs behind the unit;
// both on for every effect by the maintainer's decision 2026-10-08, false opts out
test('fxplayer: by default the root position is dropped and the quad renderers get their uPivot; false keeps the old way', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const k = (s) => ({ m: 0, s });
  const ps = { dur: 1, loop: true, delay: k(0), speedMul: 0.8, space: 0, scaling: 1, prewarm: true, life: k(0.6), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
    size: k(1.8), rot: k(-1.5708), max: 1, gravity: k(0), flipRot: 0, rate: k(1), bursts: [], mods: {},
    render: { mode: 0, mesh: null, mat: 'm', lengthScale: 2, velScale: 0, align: 2, pivot: [0.95, 0, 0], order: 0, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } };
  const def = { name: 'glow', duration: 4, materials: { m: mat }, clips: [], geoms: {}, lib: null,
    nodes: [node('glow', -1, { pos: [0, 0, -0.25] }), node('static_offset', 0, { pos: [0, 0, -0.34] }), node('bao', 1, { pos: [0.019, -0.397, 0.15], ps })] };
  const uPivot = (inst) => inst.systems[0].material.uniforms.uPivot.value;
  const dflt = new fxp.FxInstance(def, { quality: 'high' });
  assert.deepEqual(dflt.nodes[0].position.toArray(), [0, 0, 0], 'the root position is the caller\'s');
  assert.deepEqual(dflt.nodes[1].position.toArray(), [0, 0, -0.34], 'children keep theirs (static_offset)');
  assert.deepEqual(dflt.nodes[2].position.toArray(), [0.019, -0.397, 0.15]);
  assert.ok(Math.abs(uPivot(dflt).x - 0.95) < 1e-6 && uPivot(dflt).y === 0, `uPivot ${uPivot(dflt).x},${uPivot(dflt).y}`);
  dflt.dispose();
  const keep = new fxp.FxInstance(def, { quality: 'high', atSpawn: false });
  assert.deepEqual(keep.nodes[0].position.toArray(), [0, 0, -0.25], 'atSpawn false keeps the root position');
  assert.ok(uPivot(keep).x > 0.9, 'and still pivots');
  keep.dispose();
  const flat = new fxp.FxInstance(def, { quality: 'high', pivot: false });
  assert.deepEqual(uPivot(flat).toArray(), [0, 0, 0], 'pivot false: no pivot');
  assert.deepEqual(flat.nodes[0].position.toArray(), [0, 0, 0]);
  flat.dispose();
});

test('fxgame: no effect opts out of the pivot / root drop / order-0 ahead split (maintainer decisions 2026-10-08: every effect)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const calls = src.split('\n').filter((l) => /new mod\.fxp\.FxInstance\(/.test(l));
  assert.ok(calls.length >= 5, `FxInstance calls ${calls.length}`);
  for (const l of calls) assert.doesNotMatch(l, /\b(atSpawn|pivot|ahead):/, l.trim());
});

// maintainer report 2026-10-08 (「금빛 띠가 오퍼레이터 뒤에 있어. 실제 인게임에선 위에 있었어」, the recording: the band washes over the boots):
// with opts.ahead an order-0 system whose node lies in front of the unit is split to the front, one behind stays back
test('fxplayer: by default (ahead) a split order-0 system in front of the unit goes to FX_FRONT; behind it, or ahead false, FX_BACK', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const k = (s) => ({ m: 0, s });
  const ps = (order) => ({ dur: 1, loop: true, delay: k(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: k(1), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
    size: k(1), rot: k(0), max: 1, gravity: k(0), flipRot: 0, rate: k(1), bursts: [], mods: {},
    render: { mode: 0, mesh: null, mat: 'm', lengthScale: 2, velScale: 0, align: 2, pivot: [0, 0, 0], order, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } });
  const def = { name: 'glow', duration: 4, materials: { m: mat }, clips: [], geoms: {}, lib: null,
    nodes: [node('glow', -1, { pos: [0, 0, -0.25] }), node('static_offset', 0, { pos: [0, 0, -0.34] }),
      node('bao', 1, { pos: [0.019, -0.397, 0.15], ps: ps(0) }), node('bao (1)', 1, { pos: [0, 0.609, 0.152], ps: ps(0) }), node('glow_back', 1, { pos: [0, -0.4, 0], ps: ps(-1) })] };
  const layers = (opts) => { const i = new fxp.FxInstance(def, { quality: 'high', split: true, ...opts }); const m = i.systems.map((s) => s.mesh.layers.mask); i.dispose(); return m; };
  const F = 1 << fxp.FX_FRONT, B = 1 << fxp.FX_BACK;
  assert.deepEqual(layers({ ahead: true }), [F, B, B], 'the band in front of the feet over the model; the one behind and order -1 stay back');
  assert.deepEqual(layers({}), [F, B, B], 'the default (every split effect, maintainer decision 2026-10-08)');
  assert.deepEqual(layers({ ahead: false }), [B, B, B], 'ahead false: order 0 behind as before');
  assert.deepEqual(layers({ ahead: true, facing: -1 }), [F, B, B], 'mirrored the same');
});

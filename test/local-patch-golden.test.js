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

// the glow's place (official recording 2026-10-08): fxplayer FxInstance opts.atSpawn drops the root node's own position,
// opts.pivot hands each quad renderer its m_Pivot (uPivot) — the elite glow's bao band pivot x .95 runs behind the unit
test('fxplayer: atSpawn drops only the root position, pivot sets the quad renderers\' uPivot; neither by default', async () => {
  const fxp = await import('../public/js/render/fxplayer.js');
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const k = (s) => ({ m: 0, s });
  const ps = { dur: 1, loop: true, delay: k(0), speedMul: 0.8, space: 0, scaling: 1, prewarm: true, life: k(0.6), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
    size: k(1.8), rot: k(-1.5708), max: 1, gravity: k(0), flipRot: 0, rate: k(1), bursts: [], mods: {},
    render: { mode: 0, mesh: null, mat: 'm', lengthScale: 2, velScale: 0, align: 2, pivot: [0.95, 0, 0], order: 0, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } };
  const def = { name: 'glow', duration: 4, materials: { m: mat }, clips: [], geoms: {}, lib: null,
    nodes: [node('glow', -1, { pos: [0, 0, -0.25] }), node('static_offset', 0, { pos: [0, 0, -0.34] }), node('bao', 1, { pos: [0.019, -0.397, 0.15], ps })] };
  const plain = new fxp.FxInstance(def, { quality: 'high' });
  assert.deepEqual(plain.nodes[0].position.toArray(), [0, 0, -0.25], 'kept by default');
  assert.deepEqual(plain.systems[0].material.uniforms.uPivot.value.toArray(), [0, 0], 'no pivot by default');
  plain.dispose();
  const spawn = new fxp.FxInstance(def, { quality: 'high', atSpawn: true });
  assert.deepEqual(spawn.nodes[0].position.toArray(), [0, 0, 0], 'the root position is the caller\'s');
  assert.deepEqual(spawn.nodes[1].position.toArray(), [0, 0, -0.34], 'children keep theirs (static_offset)');
  assert.deepEqual(spawn.nodes[2].position.toArray(), [0.019, -0.397, 0.15]);
  assert.deepEqual(spawn.systems[0].material.uniforms.uPivot.value.toArray(), [0, 0], 'atSpawn alone: no pivot');
  spawn.dispose();
  const piv = new fxp.FxInstance(def, { quality: 'high', pivot: true });
  assert.deepEqual(piv.nodes[0].position.toArray(), [0, 0, -0.25], 'pivot alone: the root stays');
  const u = piv.systems[0].material.uniforms.uPivot.value;
  assert.ok(Math.abs(u.x - 0.95) < 1e-6 && u.y === 0, `uPivot ${u.x},${u.y}`);
  piv.dispose();
});

test('fxgame: the elite glow (under) asks for atSpawn and pivot; other status effects do not', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const call = src.split('\n').find((l) => /new mod\.fxp\.FxInstance\(def, \{[^}]*\bhold\b/.test(l));
  assert.ok(call, 'playStatus FxInstance call');
  assert.match(call, /atSpawn: !!under, pivot: !!under/);
});

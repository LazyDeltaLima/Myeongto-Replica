// test/render/fx-clip-values.test.js — effect bundle I (2026-10-22, docs/rules/fx.md 「추출기가 못 읽던 모양」): an effect's
// clip moving a particle module's value (emission rate, shape radius, size, gravity, start / trail colour, looping), a
// trail's length, a MeshRenderer's switch or an FxUVTweener's speed — tracks the player kept at the authored value
// (fx_extract.py ANIMATED_VALUES → fxplayer.js PS_ANIM / UVT_ANIM).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mm = (s) => ({ m: 0, s });
const sys = (over = {}) => ({
  dur: 5, loop: false, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(5), speed: mm(0),
  color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1000, gravity: mm(0), flipRot: 0, rate: mm(0), bursts: [], mods: {},
  shape: { type: 10, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
  render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 }, ...over,
});
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const step = (v) => [[0, 0, 0, 0, 0], [1, 0, 0, 0, v]];   // 0 until t = 1, then v
const ramp = (k) => [[0, 0, 0, k, 0]];                    // k · t

async function make(nodes, tracks, extra = {}) {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = {
    name: 'c', duration: 5, nodes: [node('root', -1), ...nodes], geoms: {}, lib: { texture: () => null },
    clips: [{ name: 'c', len: 5, loop: false, tracks }],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: { _MainTex: { img: 't', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} } }, ...extra,
  };
  return { fxp, def, inst: new fxp.FxInstance(def, { quality: 'high' }) };
}

test('a clip moves the emission rate: nothing until it rises, then particles (the definition stays shared and unchanged)', async () => {
  const { fxp, def, inst } = await make([node('p', 0, { ps: sys() })], [{ node: 1, prop: 'ps:EmissionModule.rateOverTime.scalar', type: 198, curves: [step(60)] }]);
  for (let i = 0; i < 25; i++) inst.update(1 / 30);
  assert.equal(inst.systems[0].n, 0, 'rate 0 for the first second');
  for (let i = 0; i < 30; i++) inst.update(1 / 30);
  assert.ok(inst.systems[0].n > 20, `then 60 a second (${inst.systems[0].n})`);
  assert.equal(def.nodes[1].ps.rate.s, 0, 'the shared definition is untouched');
  const other = new fxp.FxInstance(def, { quality: 'high' });
  assert.equal(other.systems[0].ps.rate.s, 0);
});

test('a clip moves the shape radius, the start colour and looping of its own system', async () => {
  const { inst } = await make([node('p', 0, { ps: sys({ rate: mm(200) }) })], [
    { node: 1, prop: 'ps:ShapeModule.radius.value', type: 198, curves: [step(3)] },
    { node: 1, prop: 'ps:InitialModule.startColor.maxColor.g', type: 198, curves: [step(0.25)] },
    { node: 1, prop: 'ps:looping', type: 198, curves: [step(1)] },
  ]);
  for (let i = 0; i < 40; i++) inst.update(1 / 30);
  const s = inst.systems[0];
  assert.equal(s.ps.shape.radius, 3);
  assert.deepEqual(s.ps.color.a, [1, 0.25, 1, 1]);
  assert.equal(s.ps.loop, true);
  let far = 0;
  for (let i = 0; i < s.n; i++) far = Math.max(far, Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1]));
  assert.ok(far > 2.9, 'the later particles leave the wider circle');
});

test('a clip on a module the system lacks binds nothing; one on a trail sets its own length', async () => {
  const trailR = { time: 1, width: 1, widthCurve: [[0, 1, 0, 0]], grad: { c: [[0, 1, 1, 1], [1, 1, 1, 1]], a: [[0, 1], [1, 1]], mode: 0 }, mat: 'm', order: 0, minDist: 0.1 };
  const { def, inst } = await make([node('p', 0, { ps: sys() }), node('t', 0, { trailR })], [
    { node: 1, prop: 'ps:SizeModule.curve.scalar', type: 198, curves: [step(2)] },
    { node: 2, prop: 'trail:time', type: 96, curves: [step(0.2)] },
  ]);
  assert.equal(inst.clipTracks.length, 1, 'no SizeModule on the system: no track');
  for (let i = 0; i < 40; i++) inst.update(1 / 30);
  assert.equal(inst.trails[0].tr.time, 0.2);
  assert.equal(def.nodes[2].trailR.time, 1, 'the shared trail definition is untouched');
});

test('a clip switches a MeshRenderer off and on (m_Enabled)', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2]);
  const { inst } = await make([node('m', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 } })], [{ node: 1, prop: 'mr:enabled', type: 23, curves: [step(1)] }], { geoms: { g } });
  inst.update(1 / 30);
  assert.equal(inst.meshObjs[1].visible, false);
  for (let i = 0; i < 40; i++) inst.update(1 / 30);
  assert.equal(inst.meshObjs[1].visible, true);
});

test('a clip moving an FxUVTweener speed: the offset sums speed × time frame by frame', async () => {
  const { inst } = await make([node('p', 0, { ps: sys({ rate: mm(10) }), uvt: { maps: [['_MainTex', 0.2, 0]] } })], [
    { node: 1, prop: 'uvt:xspeed', type: 114, curves: [ramp(1)] },   // xspeed = t → offset 2 · t² / 2 = t²
  ]);
  for (let i = 0; i < 60; i++) inst.update(1 / 60);
  const z = inst.systems[0].material.uniforms.uMainST.value.z;
  assert.ok(Math.abs(z - 1) < 0.05, `offset ≈ t² at t = 1 (${z.toFixed(3)})`);
});

test('(2026-10-23) a clip switching a VelocityModule on: the particles keep still until it does (velOL `on` 0)', async () => {
  const velOL = { x: mm(2), y: mm(0), z: mm(0), world: false, radial: mm(0), orbZ: mm(0), speedMul: mm(1), on: 0 };
  const { inst } = await make([node('p', 0, { ps: sys({ bursts: [{ t: 0, n: mm(5), cycles: 1, interval: 0, p: 1 }], mods: { velOL } }) })],
    [{ node: 1, prop: 'ps:VelocityModule.enabled', type: 198, curves: [step(1)] }]);
  const xs = () => [...Array(inst.systems[0].n)].map((_, i) => inst.systems[0].pos[i * 3]);
  inst.update(1 / 30);
  const x0 = xs();
  for (let i = 0; i < 24; i++) inst.update(1 / 30);
  assert.ok(xs().every((x, i) => Math.abs(x - x0[i]) < 1e-6), 'off: no velocity over lifetime');
  for (let i = 0; i < 30; i++) inst.update(1 / 30);
  assert.ok(xs().every((x, i) => x - x0[i] > 0.5), 'on: they move along x');
});

test('fx_extract.py clip_modules: only a system a clip switches the module on for keeps its switched-off VelocityModule', () => {
  const out = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools/local-extract')
import fx_extract as fe
nodes = [{'ps': {'mods': {}}, '_velOff': {'x': 1}}, {'ps': {'mods': {}}, '_velOff': {'x': 2}}]
fe.clip_modules(nodes, [{'tracks': [{'node': 1, 'prop': 'ps:VelocityModule.enabled'}]}])
print(json.dumps(nodes))`], { cwd: ROOT, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), [{ ps: { mods: {} } }, { ps: { mods: { velOL: { x: 2, on: 0 } } } }]);
});

test('fx_extract.py names the clip bindings of those values (ANIMATED_VALUES: Mecanim crc32 and legacy paths)', () => {
  const out = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'tools/local-extract')
import fx_extract as fe
print(json.dumps([fe.ANIMATED_CRC.get((198, fe.crc32('EmissionModule.rateOverTime.scalar'))),
                  fe.ANIMATED_CRC.get((96, fe.crc32('m_Time'))), fe.ANIMATED_CRC.get((114, fe.crc32('secondYSpeed'))),
                  fe.ANIMATED_CRC.get((23, fe.crc32('m_Enabled'))), fe.ANIMATED_CRC.get((198, fe.crc32('VelocityModule.enabled')))]))
clip = {'m_Name': 'l', 'm_WrapMode': 0, 'm_FloatCurves': [{'path': '', 'attribute': 'ShapeModule.radius.value', 'classID': 198,
        'curve': {'m_Curve': [{'time': 0, 'value': 1, 'inSlope': 0, 'outSlope': 0}, {'time': 1, 'value': 2, 'inSlope': 0, 'outSlope': 0}]}}]}
print(json.dumps(fe.legacy_clip(clip, {fe.crc32(''): 0, '': 0})['tracks'][0]['prop'] if fe.legacy_clip(clip, {'': 0}) else None))`], { cwd: ROOT, encoding: 'utf8' });
  const [named, legacy] = out.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(named, ['ps:EmissionModule.rateOverTime.scalar', 'trail:time', 'uvt:secondYSpeed', 'mr:enabled',
    'ps:VelocityModule.enabled']);
  assert.equal(legacy, 'ps:ShapeModule.radius.value');
});

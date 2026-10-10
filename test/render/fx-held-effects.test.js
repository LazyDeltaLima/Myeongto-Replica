// test/render/fx-held-effects.test.js — an effect's meshes and looping clips last as long as the effect (render/fxplayer.js
// holdMeshes / clipLoops; user report 2026-10-10: self buffs that vanish). A prefab with meshes was done on its first frame
// when it had no looping particle system (浊心斯卡蒂 S2 skadi2_skill_02_buff: three meshes, no clip), and a clip with Unity's
// loop flag (m_LoopTime → fx_extract.py `loop`) was held on its last frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
const def = (extra = {}) => ({ name: 't', duration: 0, materials: { m: mat }, clips: [], geoms: new Proxy({}, { get: () => tri() }), lib: { texture: () => new THREE.Texture() },
  nodes: [node('t', -1), node('ring', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 } })], ...extra });
// a clip curve segment is [t, c3, c2, c1, c0] (fx_extract.py): x = t from 0 to 1 s, y = z = 0
const lin = [[-3.4e38, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 0, 0, 0, 1]], zero = [[-3.4e38, 0, 0, 0, 0], [0, 0, 0, 0, 0], [1, 0, 0, 0, 0]];
const clip = (loop) => ({ name: 'c', len: 1, loop, tracks: [{ node: 1, prop: 'pos', type: 4, curves: [lin, zero, zero] }] });

test('a mesh effect lives until it is stopped', () => {
  const inst = new fxp.FxInstance(def(), { quality: 'high' });
  assert.equal(inst.done, false);
  inst.update(10);
  assert.equal(inst.done, false, 'held while its owner keeps it');
  inst.stop();
  assert.equal(inst.done, true);
  inst.dispose();
});

test('a looping clip repeats and does not end the effect; a plain clip holds its last frame', () => {
  const loop = new fxp.FxInstance(def({ clips: [clip(true)] }), { quality: 'high' });
  loop.update(1.25);
  assert.ok(Math.abs(loop.nodes[1].position.x - 0.25) < 0.05, `looped: ${loop.nodes[1].position.x}`);
  const once = new fxp.FxInstance(def({ clips: [clip(false)] }), { quality: 'high' });
  once.update(1.25);
  assert.ok(Math.abs(once.nodes[1].position.x - 1) < 0.05, `held: ${once.nodes[1].position.x}`);
  loop.dispose(); once.dispose();
});

test('a particle-only effect still ends by itself (one-shots without a caller end)', () => {
  const k = (s) => ({ m: 0, s });
  const ps = { dur: 0.5, loop: false, delay: k(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: k(0.2), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
    size: k(1), rot: k(0), max: 4, gravity: k(0), flipRot: 0, rate: k(10), bursts: [], mods: {},
    render: { mode: 0, mesh: null, mat: 'm', lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } };
  const inst = new fxp.FxInstance(def({ nodes: [node('t', -1), node('p', 0, { ps })] }), { quality: 'high' });
  for (let i = 0; i < 20; i++) inst.update(0.1);
  assert.equal(inst.done, true);
  inst.dispose();
});

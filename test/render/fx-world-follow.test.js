// test/render/fx-world-follow.test.js — world-space particles and trails stay where they were made when the effect's root
// turns, not only when it moves (2026-11-16, maintainer comparison with an official 호른 (char_4039_horn) recording: her
// shells' smoke and sparks rose up to 0.8 tile above the path the shell flew; the official ones stay on it). A projectile's
// root turns along its flight every frame (fx/face.js bodyTurn); render/fxplayer.js FxInstance.followWorld moved what a
// world-space system keeps in the root's frame by the root's move only, so the points behind a lob swung up as its nose
// fell. docs/rules/fx.md 「공식 전투 이펙트」 `worldSpace` 줄, 「함정」.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HORN = path.join(ROOT, 'public/assets/local/fx/horn');
const WHY = 'FxInstance.followWorld must map the root\'s last frame into this one, turn included (docs/rules/fx.md 「함정」 followWorld)';

const mm = (s) => ({ m: 0, s });
const sys = (over = {}) => ({
  dur: 1, loop: true, delay: mm(0), speedMul: 1, space: 1, scaling: 1, prewarm: false, life: mm(5), speed: mm(0),
  color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 100, gravity: mm(0), flipRot: 0, rate: mm(20), bursts: [], mods: {},
  shape: { type: 10, radius: 0, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
  render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 }, ...over,
});
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { m: { shader: 'Torappu/Particles/Additive', tex: { _MainTex: { img: 't', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} } };

/** World positions of every live particle of the world-space systems and every TrailRenderer point of `inst`. */
function worldPoints(THREE, inst) {
  inst.object.updateMatrixWorld(true);
  const out = [], v = new THREE.Vector3();
  for (const s of inst.systems) {
    if (!s.world) continue;
    for (let i = 0; i < s.n; i++) out.push(v.set(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]).applyMatrix4(s.root.matrixWorld).clone());
  }
  for (const t of inst.trails) {
    const N = t.ring.length / 4;
    for (let k = 0; k < t.count; k++) { const h = ((t.head + k) % N) * 4; out.push(v.set(t.ring[h], t.ring[h + 1], t.ring[h + 2]).applyMatrix4(t.root.matrixWorld).clone()); }
  }
  return out;
}

test('a still world-space particle and trail point stay put while the root turns, moves and scales', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const trailR = { time: 5, width: 0.2, widthCurve: [[0, 1, 0, 0]], grad: { c: [[0, 1, 1, 1]], a: [[0, 1]], mode: 0 }, align: 0, texMode: 0, minDist: 0.01, emitting: true, mat: 'm', order: 0 };
  const def = { name: 'follow', duration: 5, geoms: {}, lib: { texture: () => null }, clips: [], materials: MAT,
    nodes: [node('root', -1), node('ps', 0, { pos: [0.5, 0, 0], ps: sys() }), node('tr', 0, { pos: [0.5, 0, 0], trailR })] };
  const inst = new FxInstance(def, { quality: 'high' });
  const scene = new THREE.Group();
  scene.add(inst.object);
  inst.update(0.1);
  const before = worldPoints(THREE, inst);
  assert.ok(before.length >= 2, 'it made particles and a trail point');
  const n0 = inst.systems[0].n;
  // turn 60° about the board's up axis and 30° about x, move and grow it; emission off so only the old points are compared
  inst.systems[0].ps.rate = mm(0);
  inst.trails[0].node.visible = false;
  inst.object.position.set(2, -1, 0.5);
  inst.object.rotation.set(Math.PI / 6, 0, Math.PI / 3);
  inst.object.scale.setScalar(1.5);
  inst.update(1 / 60);
  const after = worldPoints(THREE, inst);
  assert.equal(inst.systems[0].n, n0);
  for (let i = 0; i < before.length; i++) {
    assert.ok(before[i].distanceTo(after[i]) < 1e-6, `point ${i} moved ${before[i].distanceTo(after[i])} — ${WHY}`);
  }
  inst.dispose();
});

test('a world-space particle keeps its world velocity while the root turns', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const def = { name: 'vel', duration: 5, geoms: {}, lib: { texture: () => null }, clips: [], materials: MAT,
    nodes: [node('root', -1), node('ps', 0, { ps: sys({ speed: mm(1), max: 1, rate: mm(100) }) })] };
  const inst = new FxInstance(def, { quality: 'high' });
  new THREE.Group().add(inst.object);
  inst.update(0.05);
  const s = inst.systems[0];
  assert.equal(s.n, 1);
  const world = () => { inst.object.updateMatrixWorld(true); return new THREE.Vector3(s.vel[0], s.vel[1], s.vel[2]).transformDirection(s.root.matrixWorld); };
  const v0 = world();
  inst.object.rotation.set(0, 0, Math.PI / 2);
  inst.update(1 / 60);
  assert.ok(v0.distanceTo(world()) < 1e-6, `its velocity turned with the root — ${WHY}`);
  inst.dispose();
});

test('호른\'s shell trails (평타, S3) stay on a lob\'s path: the official smoke sits at most about 0.12 tile above it', async (t) => {
  const names = ['horn_attack_01_trail_02', 'horn_skill_03_trail_02'];
  if (!names.every((n) => existsSync(path.join(HORN, `${n}.json`)))) { t.skip('no extracted 호른 effects (npm run setup)'); return; }
  const THREE = await import('../../public/vendor/three.module.js');
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const { bodyTurn } = await import('../../public/js/render/fx/face.js');
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  // the arena scene's lob (research: 4 tiles, muzzle 0.7, hit 0.45, raise 0.3), flown in the S3 recording's 0.75 s
  const X = 4, z0 = 0.7, z1 = 0.45, H = 0.3, dur = 0.75, dt = 1 / 60;
  const zAt = (k) => z0 + (z1 - z0) * k + 4 * H * k * (1 - k);
  for (const name of names) {
    const def = JSON.parse(readFileSync(path.join(HORN, `${name}.json`), 'utf8'));
    def.geoms = new Proxy({}, { get: () => tri() });
    def.lib = { texture: () => new THREE.Texture() };
    const inst = new FxInstance(def, { quality: 'high' });
    new THREE.Group().add(inst.object);
    for (let k = 0; k < 1;) {
      k = Math.min(1, k + dt / dur);
      inst.object.position.set(X * k, 0, zAt(k));
      bodyTurn(inst, THREE, [X, 0, (z1 - z0) + 4 * H * (1 - 2 * k)]);
      inst.update(dt);
    }
    const pts = worldPoints(THREE, inst);
    assert.ok(pts.length > 20, `${name}: its smoke and trails ran (${pts.length} points)`);
    // the noise and force of its sparks (suikuai) move them a little: well under the 0.6–0.8 tile the turn added
    const worst = Math.max(...pts.map((p) => p.z - zAt(Math.min(1, Math.max(0, p.x / X)))));
    assert.ok(worst < 0.3, `${name}: a point ${worst.toFixed(2)} above the path — ${WHY}`);
    inst.dispose();
  }
});

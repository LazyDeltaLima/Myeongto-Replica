// test/render/fx-particle-trail.test.js — the trail module's points and strips as the official client's TrailModule::Update and
// ParticleSystemTrailGeometryJob make them (docs/rules/fx.md 「입자 꼬리」): render/fxplayer.js ParticleSystem.updateTrails.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const K = (v) => ({ m: 0, s: v });
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
const line = (a, b) => [[0, a, b - a, b - a], [1, b, b - a, b - a]];
const curve = (a, b) => ({ m: 1, s: 1, c: line(a, b) });
const WHITE = { m: 0, a: [1, 1, 1, 1] };
const trail = (o = {}) => ({ mode: 0, ratio: 1, life: K(1), minDist: 0, texMode: 0, world: false, die: true, sizeWidth: false, inherit: false,
  colorOL: null, width: null, colorOT: WHITE, ribbons: 1, ...o });

/** `n` particles at t = 0 moving at 1 / s along +z, living `life`. */
function ps(tm, { n = 1, rate = 0, life = 5, scaling = 1, space = 0, max = 200, speed = 1, size = 1 } = {}) {
  return { dur: 5, loop: false, delay: K(0), speedMul: 1, space, scaling, life: typeof life === 'number' ? K(life) : life, speed: K(speed), color: WHITE,
    size: K(size), rot: K(0), max, gravity: K(0), rate: K(rate), bursts: n ? [{ t: 0, n: K(n), cycles: 1, interval: 0, p: 1 }] : [],
    mods: { trail: tm }, render: { mode: 0, mat: 'm', mesh: null, lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0, trailMat: 'm' } };
}

async function make(nodes) {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 't', duration: 0, materials: { m: MAT }, clips: [], geoms: {}, lib: { texture: () => new THREE.Texture() }, nodes };
  return { inst: new fxp.FxInstance(def, { quality: 'high' }), THREE };
}
const one = async (tm, opt) => { const { inst } = await make([node('t', -1), node('p', 0, { ps: ps(tm, opt) })]); return { inst, s: inst.systems[0] }; };
const run = (inst, n, dt = 0.02) => { for (let k = 0; k < n; k++) inst.update(dt); };

// a strip vertex of StripBatch: position 0, uv 3, colour 5, width 9; two vertices a point
const SV = 18;
const pointsOf = (s) => { const b = s.trailBatch, A = b.vb.array; return Array.from({ length: b.n }, (_, k) => { const o = k * 2 * SV; return { z: A[o + 2], x: A[o], y: A[o + 1], u: A[o + 3], col: A[o + 5], w: A[o + 9] }; }); };

test('a trail keeps its whole lifetime: not the last few points', async () => {
  const { inst, s } = await one(trail({ life: K(0.2) }));   // lifetime = 0.2 × the particle's 5 s = 1 s
  run(inst, 60);   // 1.2 s at 1 unit / s
  const P = pointsOf(s), z0 = s.pos[2];
  assert.ok(P.length > 30, `${P.length} points`);
  assert.ok(Math.abs(P[0].z - z0) < 1e-5, 'the particle first');
  assert.ok(Math.abs(z0 - P.at(-1).z - 1) < 1e-3, `the tail is 1 s behind: ${z0 - P.at(-1).z}`);
  inst.dispose();
});

test('the end of a trail slides to where its lifetime ends, between two points', async () => {
  const { inst, s } = await one(trail({ life: K(0.02), minDist: 0.03 }));   // lifetime 0.1 s, a point at most every 0.04 s
  for (let k = 0; k < 40; k++) {
    inst.update(0.02);
    if (k < 10) continue;
    const P = pointsOf(s);
    assert.ok(Math.abs(s.pos[2] - P.at(-1).z - 0.1) < 1e-3, `frame ${k}: ${s.pos[2] - P.at(-1).z}`);
  }
  inst.dispose();
});

test('more records than a trail holds (a fast screen): it thins out and keeps its length', async () => {
  const { inst, s } = await one(trail({ life: K(0.2) }));   // 1 s: room for 62 points, at most 47
  assert.equal(s.histK, 47);
  run(inst, 300, 1 / 240);   // 1.25 s at 240 Hz
  const P = pointsOf(s);
  assert.ok(P.length <= 48);
  assert.ok(Math.abs(s.pos[2] - P.at(-1).z - 1) < 1e-3, `${s.pos[2] - P.at(-1).z}`);
  for (let k = 2; k < P.length; k++) assert.ok(P[k].z < P[k - 1].z, 'in order, none repeated');   // (the first record can lie on the particle)
  inst.dispose();
});

test('a short trail holds only what its life needs', async () => {
  const { s, inst } = await one(trail({ life: K(0.02) }));   // 0.1 s at 60 records a second
  assert.equal(s.histK, 8);
  inst.dispose();
});

test('ratio chooses once per particle whether it has a trail', async () => {
  const { inst, s } = await one(trail({ ratio: 0.5 }), { n: 180 });
  const withTrail = () => { const out = []; for (let i = 0; i < s.n; i++) if (s.histN[i]) out.push(s.uid[i]); return out; };
  run(inst, 3);
  const a = withTrail();
  assert.ok(a.length > 180 * 0.3 && a.length < 180 * 0.7, `about half: ${a.length}`);
  run(inst, 10);
  assert.deepEqual(withTrail(), a, 'the same ones');
  inst.dispose();
});

test('the trail\'s lifetime curve is read at the particle\'s age', async () => {
  const { inst, s } = await one(trail({ life: curve(1, 0) }), { life: 2 });   // lifetime = (1 − age / 2) × 2 s
  run(inst, 75);   // 1.5 s: lifetime 0.5 s, not the 2 s of the curve's start
  const P = pointsOf(s);
  assert.ok(Math.abs(s.pos[2] - P.at(-1).z - 0.5) < 0.03, `${s.pos[2] - P.at(-1).z}`);
  inst.dispose();
});

test('width and colour along the trail go by the share of its length, not by the point\'s number', async () => {
  const { inst, s } = await one(trail({ width: curve(0, 1) }));
  run(inst, 25);       // 0.5 s at speed 1
  s.vel[2] = 0.1;
  run(inst, 25);       // 0.5 s at speed 0.1: half the points on a tenth of the way
  const P = pointsOf(s), total = P[0].z - P.at(-1).z;
  const mid = Math.floor(P.length / 2);   // about where the speed changed
  const walked = (P[0].z - P[mid].z) / total;
  assert.ok(walked < 0.2, `${walked}`);
  assert.ok(Math.abs(P[mid].w - walked) < 1e-3, `width ${P[mid].w} at ${walked}`);
  inst.dispose();
});

test('texture modes: Stretch by length, Tile per unit from the first point, the two per-segment modes by number', async () => {
  const by = async (texMode) => {
    const { inst, s } = await one(trail({ texMode, life: K(0.2) }));
    run(inst, 25); s.vel[2] = 0.1; run(inst, 25);
    const P = pointsOf(s); inst.dispose();
    return P;
  };
  let P = await by(0), last = P.length - 1;
  assert.equal(P[0].u, 0); assert.ok(Math.abs(P[last].u - 1) < 1e-5);
  P = await by(1); last = P.length - 1;
  assert.equal(P[0].u, 0); assert.ok(Math.abs(P[last].u - (P[0].z - P[last].z)) < 1e-4, 'the distance from the particle');
  P = await by(2); last = P.length - 1;
  assert.ok(Math.abs(P[5].u - 5 / last) < 1e-5);
  P = await by(3);
  assert.equal(P[5].u, 5);
});

test('the width takes the size when asked, and ∛(x·y·z) of the transform scale by the scaling mode', async () => {
  const sys = (scaling) => ps(trail({ sizeWidth: true, width: K(0.5) }), { size: 0.4, scaling });
  const { inst } = await make([node('t', -1), node('top', 0, { scale: [2, 2, 2] }),
    node('hier', 1, { ps: sys(0), scale: [8, 1, 1] }),
    node('local', 1, { ps: sys(1), scale: [8, 1, 1] }),
    node('shape', 1, { ps: sys(2), scale: [8, 1, 1] })]);
  run(inst, 5);
  const [h, l, a] = inst.systems.map((s) => pointsOf(s)[0].w);
  assert.ok(Math.abs(h - 0.5 * 0.4 * 4) < 1e-5, `Hierarchy: its node's and its parent's, ∛(16 × 2 × 2) = 4: ${h}`);
  assert.ok(Math.abs(l - 0.5 * 0.4 * 2) < 1e-5, `Local: its own, 8^⅓ = 2: ${l}`);
  assert.ok(Math.abs(a - 0.5 * 0.4) < 1e-5, `Shape: none: ${a}`);
  inst.dispose();
});

test('a world-space trail over a local simulation: its points in the root\'s frame, staying where they were made', async () => {
  const { inst } = await make([node('t', -1), node('p', 0, { pos: [3, 0, 0], ps: ps(trail({ world: true, minDist: 0 }), { speed: 0 }) })]);
  const s = inst.systems[0];
  const mesh = s.trailBatch.mesh;
  run(inst, 3);
  assert.ok(Math.abs(pointsOf(s)[0].x - 3) < 1e-5, `the node's place, in the root's frame: ${pointsOf(s)[0].x}`);
  s.node.position.x = 4;
  run(inst, 3);
  const P = pointsOf(s);
  assert.ok(Math.abs(P[0].x - 4) < 1e-5 && Math.abs(P.at(-1).x - 3) < 1e-5, `${P[0].x} … ${P.at(-1).x}`);
  assert.ok(mesh.parent === s.root);
  inst.dispose();
});

test('the root moves: what world-space trails hold stays where it was made', async () => {
  const { inst } = await make([node('t', -1), node('p', 0, { ps: ps(trail(), { space: 1, speed: 0 }) })]);
  const s = inst.systems[0];
  run(inst, 3);
  const root = s.root;
  root.position.x += 2;
  run(inst, 3);
  const P = pointsOf(s);
  assert.ok(Math.abs(P[0].x - P.at(-1).x) < 1e-4, `no streak between the particle and its old points: ${P[0].x} … ${P.at(-1).x}`);
  inst.dispose();
});

test('a ribbon runs through every particle, past 48, and stays with a local simulation whatever its worldSpace says', async () => {
  const { inst } = await make([node('t', -1), node('p', 0, { pos: [3, 0, 0], ps: ps(trail({ mode: 1, world: true, life: K(1) }), { n: 0, rate: 100, life: 5, max: 1000 }) })]);
  const s = inst.systems[0];
  run(inst, 60);
  assert.ok(s.n > 100, `${s.n} particles`);
  assert.equal(s.trailBatch.n, s.n);
  assert.ok(s.trailBatch.mesh.parent === s.node);
  inst.dispose();
});

test('a still particle records no more points than its first', async () => {
  const { inst, s } = await one(trail({ minDist: 0 }), { speed: 0 });
  run(inst, 10);
  assert.equal(s.histN[0], 1);
  inst.dispose();
});

test('a particle system with per-particle trails grows its history with its room', async () => {
  const { inst, s } = await one(trail(), { n: 0 });
  s.time = 0;
  s.emit(s.room + 10);
  assert.ok(s.hist.length === s.room * s.histK * 4 && s.histN.length === s.room);
  inst.dispose();
});

test('a dead particle\'s kept trail ends as a live one does', async () => {
  const { inst, s } = await one(trail({ die: false, life: K(1), texMode: 0 }), { life: 0.5 });
  run(inst, 40);   // 0.8 s: dead since 0.5 s, its last points 0.3 s old, lifetime 0.5 s
  assert.equal(s.n, 0);
  const P = pointsOf(s);
  assert.ok(P.length > 2);
  assert.ok(Math.abs(P.at(-1).z - 0.3) < 0.03, `the end 0.5 s back from now, the particle having moved 0.5: ${P.at(-1).z}`);
  run(inst, 30);   // 1.4 s: every point older than the lifetime
  assert.equal(s.ghosts.length, 0);
  inst.dispose();
});

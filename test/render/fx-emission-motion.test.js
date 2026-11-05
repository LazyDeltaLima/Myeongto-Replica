// test/render/fx-emission-motion.test.js — emission and particle motion the player had skipped (2026-10-26, effect bundle U;
// docs/rules/fx.md 「방출·입자 운동 — 거리당 방출·미리 데우기·궤도·노이즈」): tools/local-extract/fx_extract.py carries the rate over
// distance (`dist`), the velocity module's orbit / offset (`orbX` / `orbY` / `orbOff`), the shape's ordered arc / edge
// (`arcMode` / `arcSpread` / `arcSpeed`, `radMode` …), the donut's tube (`donut`), the random start offset (`randPos`) and the
// noise module's axes / octaves / amounts; render/fxplayer.js plays them, with `prewarm`, the cone volume's `length`, the
// radial speed, the speed modifier and the spherized direction it had carried without playing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const K = (v) => ({ m: 0, s: v });
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
const VEL = { x: K(0), y: K(0), z: K(0), world: false, radial: K(0), orbZ: K(0), speedMul: K(1) };

/** A particle system: a burst of `n` at t = 0 (none with `n` 0), living 5 s, no gravity. */
function ps(mods, { space = 0, speed = 0, n = 4, rate = 0, dur = 5, loop = false, life = 5, shape, ...rest } = {}) {
  return { dur, loop, delay: K(0), speedMul: 1, space, life: K(life), speed: K(speed), color: { m: 0, a: [1, 1, 1, 1] },
    size: K(0.2), rot: K(0), max: 200, gravity: K(0), rate: K(rate), bursts: n ? [{ t: 0, n: K(n), cycles: 1, interval: 0, p: 1 }] : [],
    shape, mods, render: { mode: 0, mat: 'm', mesh: null, lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0 }, ...rest };
}
const ring = (extra = {}) => ({ type: 11, radius: 1, angle: 0, arc: 0, thick: 1, length: 0, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], ...extra });

async function make(nodes) {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 't', duration: 0, materials: { m: MAT }, clips: [], geoms: {}, lib: { texture: () => new THREE.Texture() }, nodes };
  return new fxp.FxInstance(def, { quality: 'high' });
}
const near = (a, b, msg, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);
const angles = (s) => Array.from({ length: s.n }, (_, i) => Math.round(Math.atan2(s.pos[i * 3 + 1], s.pos[i * 3]) / Math.PI * 180 + 360) % 360).sort((a, b) => a - b);

test('rate over distance: a world-space system emits per unit the effect moves, spread back along the move; still, nothing', async () => {
  const inst = await make([node('t', -1), node('w', 0, { ps: ps({}, { space: 1, n: 0, dist: K(4) }) }),
    node('s', 0, { ps: ps({}, { space: 1, n: 0, rate: 0 }) })]);
  inst.update(0.05);   // the first frame only notes where the emitter is
  const w = inst.systems[0];
  assert.equal(w.n, 0);
  for (let k = 0; k < 3; k++) { inst.object.position.x += 0.5; inst.update(0.05); }   // 1.5 units: 6 particles
  assert.equal(w.n, 6);
  const xs = Array.from({ length: w.n }, (_, i) => w.pos[i * 3]).sort((a, b) => a - b);
  near(xs[xs.length - 1], 0, 'the newest on the emitter');
  assert.ok(xs[0] < -1, `the oldest left behind: ${xs[0]}`);
  for (let k = 0; k < 3; k++) inst.update(0.05);
  assert.equal(w.n, 6, 'still: no more');
  inst.dispose();
});

test('prewarm: a looping system starts its particles\' longest life in, not one cycle (official Simulate window); without it, empty', async () => {
  const inst = await make([node('t', -1), node('p', 0, { ps: ps({}, { n: 0, rate: 10, dur: 1, loop: true, life: 2, prewarm: true }) }),
    node('c', 0, { ps: ps({}, { n: 0, rate: 10, dur: 1, loop: true, life: 2 }) }),
    // the 重构体's crystals: one particle per life, far longer than the cycle — standing from the first frame
    node('s', 0, { ps: ps({}, { n: 0, rate: 0.125, dur: 1, loop: true, life: 8, prewarm: true }) }),
    // a life shorter than the cycle: the window is that life
    node('q', 0, { ps: ps({}, { n: 0, rate: 10, dur: 5, loop: true, life: 1, prewarm: true }) })]);
  inst.update(0.01);
  const [p, c, s, q] = inst.systems;
  assert.ok(p.n >= 19 && p.n <= 21, `two seconds of 10 / s: ${p.n}`);
  assert.ok(c.n <= 1, `cold: ${c.n}`);
  assert.equal(s.n, 1, 'rate x life = 1 stands at once');
  assert.ok(q.n >= 9 && q.n <= 11, `its one-second life: ${q.n}`);
  let older = 0;
  for (let i = 0; i < p.n; i++) if (p.age[i] > 1.5) older++;
  assert.ok(older >= 4, `aged through the window: ${older}`);
  inst.dispose();
});

test('velocity module: the orbit turns about z, radial pushes out, the speed modifier scales (−1 runs backward)', async () => {
  const q = Math.PI / 2;
  const inst = await make([node('t', -1),
    node('o', 0, { ps: ps({ velOL: { ...VEL, orbZ: K(q) } }, { n: 1, shape: ring() }) }),
    node('r', 0, { ps: ps({ velOL: { ...VEL, radial: K(1) } }, { n: 1, shape: ring() }) }),
    node('m', 0, { ps: ps({ velOL: { ...VEL, speedMul: K(-1) } }, { n: 1, speed: 2 }) })]);
  for (let k = 0; k < 100; k++) inst.update(0.01);   // 1 s
  const [o, r, m] = inst.systems;
  near(o.pos[0], 0, 'a quarter turn: x', 1e-2); near(o.pos[1], 1, 'a quarter turn: y', 1e-2);
  near(Math.hypot(o.pos[0], o.pos[1]), 1, 'on its circle');
  near(r.pos[0], 2, '1 / s outward for 1 s', 1e-2);
  near(m.pos[2], -2, 'start speed 2 along +z, × −1', 1e-2);
  inst.dispose();
});

test('shape: BurstSpread spreads one burst evenly round the arc; a spread snaps random places to its steps', async () => {
  const inst = await make([node('t', -1),
    node('b', 0, { ps: ps({}, { n: 4, shape: ring({ arc: 360, arcMode: 3, arcSpread: 0 }) }) }),
    node('s', 0, { ps: ps({}, { n: 40, shape: ring({ arc: 360, arcMode: 0, arcSpread: 0.25 }) }) })]);
  inst.update(0.01);
  const [b, s] = inst.systems;
  assert.deepEqual(angles(b), [0, 90, 180, 270]);
  assert.ok(angles(s).every((a) => a % 90 === 0), `quarters only: ${angles(s)}`);
  inst.dispose();
});

test('shape: a cone volume emits up its length; a donut round its tube', async () => {
  const cone = { type: 8, radius: 0, angle: 0, arc: 360, thick: 1, length: 2, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1] };
  const inst = await make([node('t', -1), node('c', 0, { ps: ps({}, { n: 60, shape: cone }) }),
    node('d', 0, { ps: ps({}, { n: 60, shape: ring({ type: 17, arc: 360, thick: 0, donut: 0.2 }) }) })]);
  inst.update(0.001);
  const [c, d] = inst.systems;
  const zs = Array.from({ length: c.n }, (_, i) => c.pos[i * 3 + 2]);
  assert.ok(Math.min(...zs) >= 0 && Math.max(...zs) <= 2 + 1e-6, 'within the length');
  assert.ok(Math.max(...zs) > 1.5 && Math.min(...zs) < 0.5, `through it: ${Math.min(...zs)}…${Math.max(...zs)}`);
  for (let i = 0; i < d.n; i++) {
    const rr = Math.hypot(d.pos[i * 3], d.pos[i * 3 + 1]);
    near(Math.hypot(rr - 1, d.pos[i * 3 + 2]), 0.2, 'on the tube (thickness 0)');
  }
  inst.dispose();
});

test('noise: damping divides the strength by the frequency; the particles of one place move alike', async () => {
  const noise = (damping) => ({ str: K(1), freq: 2, scroll: K(0), damping });
  const inst = await make([node('t', -1), node('d', 0, { ps: ps({ noise: noise(true) }, { n: 3 }) }),
    node('u', 0, { ps: ps({ noise: noise(false) }, { n: 3 }) })]);
  const [d, u] = inst.systems;
  u.nOff = d.nOff;   // one field: each system's offset is random
  inst.update(0.1);
  const len = (s, i) => Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
  assert.ok(len(u, 0) > 1e-4, `the noise moved them: ${len(u, 0)}`);
  near(len(d, 0) / len(u, 0), 0.5, 'strength ÷ frequency 2', 1e-6);
  near(len(u, 1), len(u, 0), 'one field: the same place moves the same', 1e-9);
  inst.dispose();
});

test('noise: the gradient noise is the official client\'s (its x / y derivatives × the frequency)', async () => {
  const { perlinD } = await import('../../public/js/render/fxplayer.js');
  for (const [p, f, a, b] of [[[37.15734, 23.21262, -54.97436], 0.37, -0.12021, -0.15386], [[57.86321, 55.77093, 18.4707], 0.37, -0.29497, 0.20339],
    [[-25.31521, -51.57318, 31.95455], 1, 0.66523, 0.34181], [[3.40575, -52.85387, -37.17501], 0.37, 0.25536, 0.08866]]) {
    const d = perlinD(p[0], p[1], p[2], f);
    near(d[0], a, `∂x at ${p}`, 2e-4); near(d[1], b, `∂y at ${p}`, 2e-4);
  }
});

test('noise: the Low and Medium qualities are the official client\'s Perlin1D and Perlin2D', async () => {
  const { perlin1, perlin2 } = await import('../../public/js/render/fxplayer.js');
  const P1 = [[[-2.8572,3.5863,25.4526],1.0,-2.54931,0.0],[[-2.061,0.4705,5.2431],1.0,2.16457,0.0],[[-18.9204,0.7145,7.793],1.0,2.25294,0.0],[[17.5786,-24.3526,-11.7959],1.0,-1.14058,0.0],[[-24.5598,18.5787,11.6063],0.37,-0.59957,0.0],[[-27.4872,28.9316,27.8855],0.37,-0.97653,0.0],[[9.2354,6.9338,-20.5504],0.37,-0.44345,0.0],[[-29.1,1.7029,-26.4269],0.37,0.99074,0.0],[[-18.5875,-15.4834,-28.195],2.5,4.3019,0.0],[[-2.1639,-3.5681,20.5456],2.5,-3.77407,0.0],[[1.1474,8.4175,-0.0136],2.5,-3.04349,0.0],[[9.747,-2.5602,-13.3102],2.5,-4.5182,0.0]];
  const P2 = [[[-2.8572,3.5863,25.4526],1.0,-0.12723,-0.95785],[[-2.061,0.4705,5.2431],1.0,-0.07094,-0.00511],[[-18.9204,0.7145,7.793],1.0,-0.10263,-1.04457],[[17.5786,-24.3526,-11.7959],1.0,0.0,0.29638],[[-24.5598,18.5787,11.6063],0.37,0.0,0.15757],[[-27.4872,28.9316,27.8855],0.37,0.0,0.0],[[9.2354,6.9338,-20.5504],0.37,0.0,0.0],[[-29.1,1.7029,-26.4269],0.37,-0.1128,0.00572],[[-18.5875,-15.4834,-28.195],2.5,-0.62356,1.17009],[[-2.1639,-3.5681,20.5456],2.5,-2.49416,0.05774],[[1.1474,8.4175,-0.0136],2.5,3.22518,0.08913],[[9.747,-2.5602,-13.3102],2.5,0.0,0.0]];
  for (const [fn, list] of [[perlin1, P1], [perlin2, P2]]) {
    for (const [p, f, a, b] of list) {
      const d = fn(p[0], p[1], p[2], f);
      near(d[0], a, `${fn.name} x at ${p} × ${f}`, 2e-3); near(d[1], b, `${fn.name} y at ${p} × ${f}`, 2e-3);
    }
  }
});

test('noise: `qual` picks the quality; the scroll runs along the last axis it reads', async () => {
  const noise = { str: K(1), freq: 1, scroll: K(3), damping: false };
  const inst = await make([node('t', -1),
    node('a', 0, { ps: ps({ noise: { ...noise, qual: 0 } }) }), node('b', 0, { ps: ps({ noise: { ...noise, qual: 1 } }) }), node('c', 0, { ps: ps({ noise }) })]);
  inst.update(0.05);
  const [a, b, c] = inst.systems, out = { x: 0, y: 0, z: 0, w: 0, set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; } };
  const fx = await import('../../public/js/render/fxplayer.js');
  for (const [s, pn, sx, sy, sz] of [[a, fx.perlin1, 1, 0, 0], [b, fx.perlin2, 0, 1, 0], [c, fx.perlinD, 0, 0, 1]]) {
    s.pos[0] = 1.3; s.pos[1] = -2.1; s.pos[2] = 0.7; s.nOff = [0.25, 0.5, 0.75]; s.nScroll = 0.4;
    const x = 1.55, y = -1.6, z = 1.45, sc = 0.4;
    const r1 = [...pn(z + sx * sc, y + sy * sc, x + sz * sc, 1)], r2 = [...pn(x + 100 + sx * sc, z + sy * sc, y + sz * sc, 1)], r3 = [...pn(y + sx * sc, x + 100 + sy * sc, z + sz * sc, 1)];
    s.noiseAt(0, 0.1, 0.5, out);
    near(out.x, r3[0] - r2[1], 'x'); near(out.y, r1[0] - r3[1], 'y'); near(out.z, r2[0] - r1[1], 'z');
  }
  inst.dispose();
});

test('shape: a sphere\'s radius is even over the shell\'s volume, round its arc and in its order; a hemisphere\'s the same over +z', async () => {
  const sph = (extra) => ring({ type: 0, arc: 360, thick: 1, ...extra });
  const inst = await make([node('t', -1),
    node('v', 0, { ps: ps({}, { n: 150, shape: sph({}) }) }),
    node('k', 0, { ps: ps({}, { n: 150, shape: sph({ thick: 0.5 }) }) }),
    node('a', 0, { ps: ps({}, { n: 150, shape: sph({ arc: 90 }) }) }),
    node('b', 0, { ps: ps({}, { n: 4, shape: sph({ arcMode: 3 }) }) }),
    node('h', 0, { ps: ps({}, { n: 150, shape: sph({ type: 2, arc: 90 }) }) })]);
  inst.update(0.001);
  const [v, k, a, b, h] = inst.systems;
  const len = (s, i) => Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
  const radii = (s) => Array.from({ length: s.n }, (_, i) => len(s, i)).sort((x, y) => x - y);
  // even over the volume: half the points outside ∛½ = 0.794 of the radius (a plain 1 − rand has its median at 0.5)
  const med = radii(v)[75];
  assert.ok(med > 0.68 && med < 0.9, `the median radius: ${med}`);
  assert.ok(radii(k)[0] >= 0.5 - 1e-3, `thickness 0.5 stays in the outer half: ${radii(k)[0]}`);
  const kMed = radii(k)[75];
  assert.ok(kMed > 0.76 && kMed < 0.9, `∛lerp(⅛, 1, ½) = 0.825: ${kMed}`);
  const quad = (s) => Array.from({ length: s.n }, (_, i) => [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]]);
  assert.ok(quad(a).every(([x, y]) => x >= -1e-6 && y >= -1e-6), 'arc 90°: the first quadrant only');
  assert.deepEqual(angles(b), [0, 90, 180, 270], 'BurstSpread round the circle');
  assert.ok(quad(h).every(([x, y, z]) => x >= -1e-6 && y >= -1e-6 && z >= -1e-6), 'the hemisphere: +z, its arc too');
  inst.dispose();
});

test('shape order: Loop turns 360° a second whatever the arc and wraps at its end; BurstSpread includes both ends of a part arc / an edge', async () => {
  const inst = await make([node('t', -1),
    node('l', 0, { ps: ps({}, { n: 0, rate: 1, loop: true, dur: 5, shape: ring({ arc: 180, arcMode: 1, arcSpread: 0, arcSpeed: K(1) }) }) }),
    node('b', 0, { ps: ps({}, { n: 3, shape: ring({ arc: 180, arcMode: 3, arcSpread: 0 }) }) }),
    node('e', 0, { ps: ps({}, { n: 3, shape: ring({ type: 12, radius: 2, radMode: 3, radSpread: 0 }) }) })]);
  const [l, b, e] = inst.systems;
  for (let k = 0; k < 125; k++) inst.update(0.01);   // 1.25 s: the first particle at 1 s → 360° mod 180° = 0
  assert.equal(l.n, 1);
  near(Math.atan2(l.pos[1], l.pos[0]) / Math.PI * 180, 0, 'one turn, wrapped at 180°', 1);
  for (let k = 0; k < 25; k++) inst.update(0.01);   // 1.5 s: the next at 1.5 s → 540° mod 180° = 0, 1.25 s would be 90°
  assert.deepEqual(angles(b), [0, 90, 180]);
  const xs = Array.from({ length: e.n }, (_, i) => Math.round(e.pos[i * 3] * 100) / 100).sort((x, y) => x - y);
  assert.deepEqual(xs, [-2, 0, 2]);
  inst.dispose();
});

test('random position moves the start point by exactly its amount; drag slows by drag × π(size/2)² × speed²', async () => {
  const lim = (drag) => ({ mag: K(1e4), dampen: 0, drag: K(drag) });
  const inst = await make([node('t', -1), node('p', 0, { ps: ps({}, { n: 20, shape: ring({ type: 12, radius: 0, randPos: 0.3 }) }) }),
    node('g', 0, { ps: ps({ limit: lim(2) }, { n: 1, speed: 4 }) })]);
  inst.update(0.001);
  const [p, g] = inst.systems;
  for (let i = 0; i < p.n; i++) near(Math.hypot(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]), 0.3, 'on the sphere of 0.3', 1e-3);
  const v0 = Math.hypot(g.vel[0], g.vel[1], g.vel[2]);
  inst.update(0.01);
  const v1 = Math.hypot(g.vel[0], g.vel[1], g.vel[2]);
  near(v0 - v1, 2 * Math.PI * 0.1 * 0.1 * v0 * v0 * 0.01, 'size 0.2: radius 0.1', 1e-3);
  inst.dispose();
});


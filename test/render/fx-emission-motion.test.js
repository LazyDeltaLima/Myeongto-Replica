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

test('prewarm: a looping system starts one cycle in; without it, empty', async () => {
  const inst = await make([node('t', -1), node('p', 0, { ps: ps({}, { n: 0, rate: 10, dur: 1, loop: true, life: 2, prewarm: true }) }),
    node('c', 0, { ps: ps({}, { n: 0, rate: 10, dur: 1, loop: true, life: 2 }) })]);
  inst.update(0.01);
  const [p, c] = inst.systems;
  assert.ok(p.n >= 9 && p.n <= 11, `one cycle of 10 / s: ${p.n}`);
  assert.ok(c.n <= 1, `cold: ${c.n}`);
  let older = 0;
  for (let i = 0; i < p.n; i++) if (p.age[i] > 0.5) older++;
  assert.ok(older >= 4, `aged through the cycle: ${older}`);
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
  inst.update(0.1);
  const [d, u] = inst.systems;
  const len = (s, i) => Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
  assert.ok(len(u, 0) > 1e-4, `the noise moved them: ${len(u, 0)}`);
  near(len(d, 0) / len(u, 0), 0.5, 'strength ÷ frequency 2', 1e-6);
  near(len(u, 1), len(u, 0), 'one field: the same place moves the same', 1e-9);
  inst.dispose();
});

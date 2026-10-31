// test/render/fx-particle-refill.test.js — a full particle system refills as its particle dies (2026-10-31, maintainer
// report: 시빌라이트 에테르나's S3 buff cetsyr_skill_03_buff_01 showed its one-particle planes for a while, then nothing for
// up to 2.5 s, over and over). render/fxplayer.js advance: a full system lets go of the particles the step ends before it
// emits, and a particle emitted within a step is aged from its own moment in it (Unity's sub-frame emission).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const mm = (s) => ({ m: 0, s });
const sys = (over = {}) => ({
  dur: 1, loop: true, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(1), speed: mm(0),
  color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1, gravity: mm(0), flipRot: 0, rate: mm(1), bursts: [], mods: {},
  shape: { type: 10, radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0] },
  render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 }, ...over,
});
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });

/** The frames (of `secs` s at 60 fps, after the first emission) on which the one system of `ps` drew nothing. */
async function emptyFrames(ps, secs = 12) {
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const def = {
    name: 'refill', duration: 1, geoms: {}, lib: { texture: () => null }, clips: [],
    nodes: [node('root', -1), node('plane', 0, { ps: sys(ps) })],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: { _MainTex: { img: 't', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} } },
  };
  const inst = new FxInstance(def, { quality: 'high' });
  const s = inst.systems[0];
  let seen = false, empty = 0;
  for (let i = 0; i < secs * 60; i++) {
    inst.update(1 / 60);
    if (s.n) seen = true; else if (seen) empty++;
  }
  inst.dispose();
  return { seen, empty };
}

test('a one-particle system whose life is its emission period never stands empty (cetsyr_skill_03_buff_01 plane_boli_01)', async () => {
  for (const ps of [
    { life: mm(1), rate: mm(1), speedMul: 0.4 },   // plane_boli_01: 2.5 s a particle
    { life: mm(4), rate: mm(1), speedMul: 1.2 },   // beijing_qian: four emission periods
    { life: mm(2), rate: mm(2) },                  // cetsyr_skill_03_trail_01 ball_01
    { life: mm(3), rate: mm(2) },                  // ball_01_black: six emission periods
  ]) {
    const { seen, empty } = await emptyFrames(ps);
    assert.ok(seen, 'it emitted');
    assert.equal(empty, 0, `${JSON.stringify(ps)}: born again as it dies`);
  }
});

test('a particle emitted within a step is aged from its moment in it, and moves only for that part', async () => {
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const def = {
    name: 'sub', duration: 1, geoms: {}, lib: { texture: () => null }, clips: [],
    nodes: [node('root', -1), node('p', 0, { ps: sys({ max: 100, rate: mm(10), life: mm(5), speed: mm(1) }) })],
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: { _MainTex: { img: 't', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} } },
  };
  const inst = new FxInstance(def, { quality: 'high' });
  const s = inst.systems[0];
  inst.update(0.25);   // 2.5 particles due: two emitted, 0.05 s and 0.15 s ago
  assert.equal(s.n, 2);
  const ages = [s.age[0], s.age[1]].sort((a, b) => a - b);
  assert.ok(Math.abs(ages[0] - 0.05) < 1e-6 && Math.abs(ages[1] - 0.15) < 1e-6, `ages ${ages}`);
  for (let i = 0; i < s.n; i++) {
    const d = Math.hypot(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
    assert.ok(d <= s.age[i] * 1 + 1.001 + 1e-6, `moved ${d} at speed 1 for ${s.age[i]} s (shape radius 1)`);
  }
  inst.dispose();
});

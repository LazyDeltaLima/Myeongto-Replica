// test/render/fx-drawing.test.js — drawing order and sheets the player had skipped (2026-10-27, effect bundle V;
// docs/rules/fx.md 「그리기 순서·시트 — 정렬·무작위 줄·여러 메시·사용자 스트림」): tools/local-extract/fx_extract.py carries the renderer's
// sorting layer (`layer`), sort mode (`sortMode`), whether its custom streams reach the shader (`ownStreams`), its further
// meshes (`meshes`) and flip (`flip`), the trail module's split ribbons (`split`); render/fxplayer.js plays them, with the
// random sheet row (`uv.rowMode`), the trail's texture mode and dieWithParticles and Shape scaling it had carried unplayed.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const K = (v) => ({ m: 0, s: v });
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
// the player's instance row (fxplayer.js IV): position 0, size 3, custom1 13, custom2 17, sheet uv 21; 28 floats
const IV = 28, IV_POS = 0, IV_SIZE = 3, IV_C1 = 13, IV_UV = 21;

/** A particle system: `n` at t = 0 or `rate` a second, start speed 1 along +z (no shape), living `life` s. */
function ps(mods, { n = 20, rate = 0, life = 5, render = {}, shape, ...rest } = {}) {
  return { dur: 5, loop: false, delay: K(0), speedMul: 1, space: 0, life: K(life), speed: K(1), color: { m: 0, a: [1, 1, 1, 1] },
    size: K(0.2), rot: K(0), max: 200, gravity: K(0), rate: K(rate), bursts: n ? [{ t: 0, n: K(n), cycles: 1, interval: 0, p: 1 }] : [],
    shape, mods, render: { mode: 0, mat: 'm', mesh: null, lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0, ...render }, ...rest };
}

async function make(nodes, geoms = {}) {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 't', duration: 0, materials: { m: MAT }, clips: [], geoms, lib: { texture: () => new THREE.Texture() }, nodes };
  return { inst: new fxp.FxInstance(def, { quality: 'high' }), THREE, fxp };
}
const rows = (s, off, n = s.geometry.instanceCount) => Array.from({ length: n }, (_, k) => s.ib.array[k * IV + off]);

test('a single-row sheet: rowMode 1 takes a row at random per particle, rowMode 0 the set row', async () => {
  const uv = (rowMode) => ({ tx: 4, ty: 4, frame: K(0), start: K(0), cycles: 1, anim: 1, row: 2, rowMode });
  const { inst } = await make([node('t', -1), node('r', 0, { ps: ps({ uv: uv(1) }, { n: 60 }) }), node('c', 0, { ps: ps({ uv: uv(0) }) })]);
  inst.update(0.02);
  const [r, c] = inst.systems;
  const rv = new Set(rows(r, IV_UV + 1)), cv = new Set(rows(c, IV_UV + 1));
  assert.equal(rv.size, 4, `every row: ${[...rv]}`);
  assert.deepEqual([...cv], [1 - 3 / 4], 'row 2 of 4 (uv v from the bottom)');
  inst.dispose();
});

test('sort modes: oldest / youngest in front drawn last, by distance far first; none in emission order', async () => {
  const sys = (sortMode) => ps({}, { n: 0, rate: 20, render: { sortMode } });
  const { inst, THREE } = await make([node('t', -1), node('o', 0, { ps: sys(2) }), node('y', 0, { ps: sys(3) }),
    node('d', 0, { ps: sys(1) }), node('n', 0, { ps: sys(0) })]);
  const [o, y, d, n] = inst.systems;
  d.camP = new THREE.Vector3(0, 0, 10); d.camF = new THREE.Vector3(0, 0, -1);   // as onBeforeRender leaves them
  for (let k = 0; k < 30; k++) inst.update(0.02);
  const z = (s) => rows(s, IV_POS + 2);   // speed 1 along +z: z = age
  const asc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v), desc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
  assert.ok(o.geometry.instanceCount > 5);
  assert.ok(asc(z(o)), `oldest last: ${z(o)}`);
  assert.ok(desc(z(y)), `youngest last: ${z(y)}`);
  assert.ok(asc(z(d)), `the camera at z 10: the far (young, near z 0) first: ${z(d)}`);
  assert.ok(desc(z(n)), `none: the newest last as emitted: ${z(n)}`);
  inst.dispose();
});

test('custom streams: laid out as streamed — custom2 first, none when the renderer streams no custom data', async () => {
  const custom = [null, { v: [K(1), K(2), K(3), K(4)] }];
  const { inst } = await make([node('t', -1),
    node('a', 0, { ps: ps({ custom }, { n: 1, render: { ownStreams: 1, streams: [0, 1, 3, 4, 37, 38] } }) }),
    node('b', 0, { ps: ps({ custom }, { n: 1, render: { ownStreams: 0, streams: [0, 1, 3, 4] } }) }),
    node('c', 0, { ps: ps({ custom }, { n: 1, render: { ownStreams: 1, streams: [0, 1, 3, 4, 34, 38] } }) })]);
  inst.update(0.02);
  const cd = (s) => Array.from(s.ib.array.subarray(IV_C1, IV_C1 + 8));
  const [a, b, c] = inst.systems;
  assert.deepEqual(cd(a), [1, 2, 3, 1, 2, 3, 4, 0], 'Custom2XYZ then Custom2XYZW');
  assert.deepEqual(cd(b), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(cd(c), [0, 0, 0, 0, 1, 2, 3, 4], 'Custom1XYZW then Custom2XYZW: as it was');
  inst.dispose();
});

test('flip and several meshes: the flipped share mirrored, each particle drawing one of the meshes', async () => {
  const { THREE } = await make([node('t', -1)]);
  const geo = (k) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, k, 0, 0, 0, k, 0], 3)); return g; };
  const { inst } = await make([node('t', -1), node('f', 0, { ps: ps({}, { n: 10, render: { flip: [1, 0, 0] } }) }),
    node('m', 0, { ps: ps({}, { n: 90, render: { mode: 4, mesh: 'a', meshes: ['b', 'c'] } }) })], { a: geo(1), b: geo(2), c: geo(3) });
  inst.update(0.02);
  const [f, m] = inst.systems;
  assert.ok(rows(f, IV_SIZE).every((v) => v < 0), 'x mirrored');
  assert.ok(rows(f, IV_SIZE + 1).every((v) => v > 0), 'y as it is');
  const counts = [m.geometry.instanceCount, ...m.more.map((x) => x.g.instanceCount)];
  assert.equal(counts.reduce((x, y) => x + y), 90);
  assert.ok(counts.every((v) => v > 10), `each mesh drawn: ${counts}`);
  inst.dispose();
});

test('sorting layer: before Default under, after it over, whatever the order', async () => {
  const { inst, fxp } = await make([node('t', -1), node('b', 0, { ps: ps({}, { render: { layer: -2, order: 50 } }) }),
    node('d', 0, { ps: ps({}, { render: { order: 3 } }) }), node('f', 0, { ps: ps({}, { render: { layer: 3, order: -50 } }) })]);
  const [b, d, f] = inst.systems.map((s) => s.mesh.renderOrder);
  assert.ok(b < d && d < f, `${b} < ${d} < ${f}`);
  assert.equal(fxp.sortingOrder({ layer: 1, order: -2 }), fxp.LAYER_ORDER - 2);
  assert.ok(fxp.hasBackOrder({ nodes: [{ mesh: { layer: -2, order: 4 } }] }));
  assert.ok(!fxp.hasBackOrder({ nodes: [{ mesh: { layer: 1, order: -4 } }] }));
  inst.dispose();
});

test('trails that outlive their particle (dieWithParticles off) stay until their points expire', async () => {
  const trail = (die) => ({ mode: 0, ratio: 1, life: K(1), minDist: 0.01, texMode: 1, world: false, die, sizeWidth: false, inherit: false,
    colorOL: null, width: null, colorOT: { m: 0, a: [1, 1, 1, 1] }, ribbons: 1 });
  const sys = (die) => ps({ trail: trail(die) }, { n: 3, life: 0.3, dur: 0.2, render: { trailMat: 'm' } });
  const { inst } = await make([node('t', -1), node('g', 0, { ps: sys(false) }), node('d', 0, { ps: sys(true) })]);
  const [g, d] = inst.systems;
  for (let k = 0; k < 20; k++) inst.update(0.02);   // 0.4 s: the particles are dead, their trails 0.3 s long (life × 1)
  assert.equal(g.n, 0); assert.equal(d.n, 0);
  assert.equal(g.ghosts.length, 3, 'kept');
  assert.ok(g.alive && !d.alive);
  for (let k = 0; k < 30; k++) inst.update(0.02);   // 1 s on: every point older than 0.3 s
  assert.equal(g.ghosts.length, 0);
  assert.ok(!g.alive);
  inst.dispose();
});

test('Shape scaling: the node\'s scale reaches the start positions, not the particles', async () => {
  const ring = { type: 11, radius: 1, angle: 0, arc: 0, thick: 1, length: 0, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], arc0: 360 };
  const { inst, THREE } = await make([node('t', -1),
    node('s', 0, { scale: [0.5, 0.5, 0.5], ps: ps({}, { n: 8, scaling: 2, shape: ring }) }),
    node('h', 0, { scale: [0.5, 0.5, 0.5], ps: ps({}, { n: 8, scaling: 0, shape: ring }) })]);
  inst.update(0.001);
  const [s, h] = inst.systems;
  const r = (x) => Math.hypot(x.pos[0], x.pos[1]);
  assert.ok(Math.abs(r(s) - 0.5) < 0.01, `on a ring of 0.5 in an unscaled frame: ${r(s)}`);
  assert.ok(Math.abs(r(h) - 1) < 0.01, `Hierarchy: radius 1 in the scaled node: ${r(h)}`);
  const sc = new THREE.Vector3();
  s.mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  assert.ok(Math.abs(sc.x - 1) < 1e-6, `the particles unscaled: ${sc.x}`);
  inst.dispose();
});

// (2026-10-27, the official engine's quads — rules/fx.md 「그리기 순서·시트」 「엔진의 사각형」)
const IV_VEL = 25;

test('the quads take velocity + animated velocity (the engine gathers both): VelocityOverLifetime reaches iVel', async () => {
  const vol = { on: 1, x: K(3), y: K(0), z: K(0) };
  const { inst } = await make([node('t', -1), node('v', 0, { ps: ps({ velOL: vol }, { n: 4, render: { mode: 1 } }) })]);
  inst.update(0.02); inst.update(0.02);
  const [s] = inst.systems;
  assert.ok(rows(s, IV_VEL).every((v) => Math.abs(v - 3) < 1e-6), `x = the animated 3: ${rows(s, IV_VEL)}`);
  assert.ok(rows(s, IV_VEL + 2).every((v) => Math.abs(v - 1) < 1e-6), `z = the start speed 1: ${rows(s, IV_VEL + 2)}`);
  inst.dispose();
});

test('freeform stretching and Velocity alignment reach the shader; the Velocity frame follows the scene\'s handedness and facing', async () => {
  const { inst } = await make([node('t', -1), node('f', 0, { ps: ps({}, { render: { mode: 1, free: 1, rotw: 1 } }) }),
    node('s', 0, { ps: ps({}, { render: { mode: 1 } }) }), node('v', 0, { ps: ps({}, { render: { mode: 0, align: 4 }, space: 1 }) })]);
  inst.update(0.02);
  const [f, s, v] = inst.systems, u = v.material.uniforms;
  assert.equal(f.material.uniforms.uFree.value, true);
  assert.equal(s.material.uniforms.uFree.value, false);
  assert.equal(f.material.uniforms.uRotW.value, true, 'rotateWithStretchDirection (effect bundle X2)');
  assert.equal(s.material.uniforms.uRotW.value, false);
  // the engine's freeform quad: the camera-position-facing quad, turned (+ toward its stretch), drawn out along the 3D velocity
  const fs = f.material.vertexShader;
  assert.match(fs, /float a = -iRot\.z \+ \(uRotW \? atan\(-d\.y, -d\.x\) : 0\.0\);/);
  assert.match(fs, /off \+= \(uLengthScale \+ sqrt\(vl\) \* uVelScale - 1\.0\) \* dot\(off, vh\) \* vh;/);
  assert.equal(u.uAlign.value, 4);
  assert.equal(u.uHand.value, -1, 'the Unity frame (z = −height) against the board: one flip');
  assert.deepEqual(u.uUX.value.toArray(), [1, 0, 0]);
  assert.equal(u.uWSign.value, 1);
  inst.dispose();
  const { inst: left } = await (async () => {
    const THREE = await import('../../public/vendor/three.module.js');
    const fxp = await import('../../public/js/render/fxplayer.js');
    const def = { name: 't', duration: 0, materials: { m: MAT }, clips: [], geoms: {}, lib: { texture: () => new THREE.Texture() },
      nodes: [node('t', -1), node('v', 0, { ps: ps({}, { render: { mode: 0, align: 4 }, space: 1 }) })] };
    return { inst: new fxp.FxInstance(def, { quality: 'high', facing: -1 }) };
  })();
  left.update(0.02);
  assert.equal(left.systems[0].material.uniforms.uWSign.value, -1, 'facing left: a world-space system\'s particles carry the mirror');
  left.dispose();
});

test('a 3D-rotated Velocity quad turns by -x, -y, -z in the velocity frame (蕾缪安 S3 mark wedges: rotX 90° lays it along the velocity)', async () => {
  const IV_ROT = 6;
  const { inst } = await make([node('t', -1),
    node('v', 0, { ps: ps({}, { n: 4, rotX: K(Math.PI / 2), rotY: K(0), render: { mode: 0, align: 4, pivot: [0, 0.33, 0] } }) })]);
  inst.update(0.02);
  const [v] = inst.systems;
  assert.ok(rows(v, IV_ROT).every((x) => Math.abs(x - Math.PI / 2) < 1e-6), `iRot.x = rotX: ${rows(v, IV_ROT)}`);
  // the engine's 3D-rotation quad, v = +x, rotX 90°: corners (−1,−1,0) (−1,1,0) (1,1,0) (1,−1,0) for the unit quad — the
  // corner (x, y, 0) turned by Ry(−y)·Rx(−x)·Rz(−z) in the frame (right, up, normal = v̂)
  const sh = v.material.vertexShader, at = sh.indexOf('uAlign == 4');
  assert.ok(at > 0 && /vec3 lc = rotZXY\(-iRot\) \* vec3\(c, 0\.0\);/.test(sh.slice(at, at + 2000)), 'the Velocity branch turns the corner in 3D');
  assert.match(sh.slice(at, at + 2000), /rt \* lc\.x \+ cross\(nw, rt\) \* \(uHand \* lc\.y\) \+ nw \* lc\.z/);
  inst.dispose();
});

test('oldest in front: the engine key max(0, 100 − age fraction) × start lifetime puts the longer-lived behind', async () => {
  const { inst } = await make([node('t', -1), node('o', 0, { ps: ps({}, { n: 0, rate: 0, render: { sortMode: 2 } }) })]);
  const [o] = inst.systems;
  inst.update(0.02);
  o.n = 3;
  o.age.set([0.5, 0.1, 0.1]); o.life.set([1, 1, 2]);
  o.pos.set([0, 0, 0, 0, 0, 1, 0, 0, 2]);
  o.draw(0.02);
  // keys: 99.5 × 1, 99.9 × 1, 99.95 × 2 → drawn first the largest: the long-lived (z 2), then the young (z 1), the old last
  assert.deepEqual(rows(o, IV_POS + 2, 3), [2, 1, 0]);
  inst.dispose();
});

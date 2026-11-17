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

test('a single-row sheet\'s set row is clamped to the sheet and its cell is row × tx + ⌊frac × tx⌋', async () => {
  // the official client clamps rowMode 0's row to 0 … ty − 1 and hands the geometry the ratio (row + frac) / ty, whose cell
  // is ⌊ratio × tx × ty⌋. Cause and rule: docs/rules/fx.md 「그리기 순서·시트」 시트 프레임
  const uv = (row, frame) => ({ tx: 4, ty: 4, frame: K(frame), start: K(0), cycles: 1, anim: 1, row, rowMode: 0 });
  const { inst } = await make([node('t', -1), node('o', 0, { ps: ps({ uv: uv(7, 0) }, { n: 1 }) }),
    node('n', 0, { ps: ps({ uv: uv(-2, 0) }, { n: 1 }) }), node('m', 0, { ps: ps({ uv: uv(1, 0.75) }, { n: 1 }) })]);
  inst.update(0.02);
  const [o, n, m] = inst.systems;
  assert.equal(frameOf(o, 0, 4, 4), 12, 'row 7 of a 4-row sheet draws the last row, cell 12 (fx.md 「그리기 순서·시트」)');
  assert.equal(frameOf(n, 0, 4, 4), 0, 'a negative row draws the first row');
  assert.equal(frameOf(m, 0, 4, 4), 7, 'row 1, frame 0.75 of 4 columns: cell 1 × 4 + 3');
  inst.dispose();
});

// docs/rules/fx.md 「그리기 순서·시트」 시작 프레임: the official client's frac(frame + start), start being a share of the sheet
const frameOf = (s, k, tx, ty) => { const a = s.ib.array, o = k * IV + IV_UV; return Math.round(a[o] * tx) + tx * Math.round((1 - a[o + 1]) * ty - 1); };

test('a sheet\'s start frame is a share of the sheet: 0.5 of 16 is frame 8, 0.9999 the last, a random one reaches all of them', async () => {
  const uv = (start, frame = K(0), cycles = 1) => ({ tx: 4, ty: 4, frame, start, cycles, anim: 0 });
  const { inst } = await make([node('t', -1),
    node('h', 0, { ps: ps({ uv: uv(K(0.5)) }, { n: 1 }) }),
    node('l', 0, { ps: ps({ uv: uv(K(0.9999)) }, { n: 1 }) }),
    node('r', 0, { ps: ps({ uv: uv({ m: 3, s: 0.9999, n: 0 }) }, { n: 190 }) }),
    node('w', 0, { ps: ps({ uv: uv(K(0.5), K(0.75)) }, { n: 1 }) }),
    node('c', 0, { ps: ps({ uv: uv(K(0), K(0.25), 2) }, { n: 1 }) }),
    node('b', 0, { ps: ps({ uv: { tx: 4, ty: 2, frame: K(0.5), start: K(0), cycles: 1, anim: 0 } }, { n: 1 }) })]);
  inst.update(0.02);
  const [h, l, r, w, c, b] = inst.systems;
  assert.equal(frameOf(h, 0, 4, 4), 8);
  assert.equal(frameOf(l, 0, 4, 4), 15);
  const seen = new Set(Array.from({ length: r.geometry.instanceCount }, (_, k) => frameOf(r, k, 4, 4)));
  assert.equal(seen.size, 16, `every frame: ${[...seen]}`);
  // a constant frame and start are frac(cycles × frame + start) with no 0.999999 (the client's timeMode 1 Speed only; the
  // data is all timeMode 0, the extractor stops on another): with it a frame on a cell edge drew the cell before, and
  // 하루카's skin bubble `ribbon R` (4 × 2, frame 0.5) drew cell 3 — a green leaf over the material's offset — for cell 4.
  // Cause and rule: docs/rules/fx.md 「그리기 순서·시트」 시트 프레임
  assert.equal(frameOf(w, 0, 4, 4), 4, 'frame + start wraps past the end: frac(0.75 + 0.5) × 16, no 0.999999 (fx.md 「그리기 순서·시트」)');
  assert.equal(frameOf(c, 0, 4, 4), 8, 'a constant frame with a constant start takes the cycles: frac(0.25 × 2) × 16, no 0.999999');
  assert.equal(frameOf(b, 0, 4, 2), 4, 'frame 0.5 of a 4 × 2 sheet is cell 4, not 3 (하루카 skin `ribbon R`; fx.md 「그리기 순서·시트」)');
  inst.dispose();
});

test('a curve sheet frame reads the curve at frac(age × cycles): a whole age × cycles reads it at 0', async () => {
  // the official client's Lifetime sheet templates read a frame curve at frac(max(age, 0) × cycles) with no 0.999999 (that
  // is in timeMode 1 Speed only): with it, age 0.5 × cycles 2 read the curve at 0.999999 and drew the last cell for the first.
  // Cause and rule: docs/rules/fx.md 「그리기 순서·시트」 시트 프레임
  const lin = { m: 1, s: 1, c: [[0, 0, 1, 1], [1, 1, 1, 1]] };
  const uv = { tx: 4, ty: 4, frame: lin, start: K(0), cycles: 2, anim: 0 };
  const { inst } = await make([node('t', -1),
    node('e', 0, { ps: ps({ uv }, { n: 1, life: 0.04 }) }),
    node('q', 0, { ps: ps({ uv }, { n: 1, life: 0.08 }) })]);
  inst.update(0.02);
  const [e, q] = inst.systems;
  assert.equal(frameOf(e, 0, 4, 4), 0, 'age 0.5 × cycles 2 reads the curve at 0, not at 0.999999 (fx.md 「그리기 순서·시트」)');
  assert.equal(frameOf(q, 0, 4, 4), 8, 'age 0.25 × cycles 2 reads the curve at 0.5: frame 8 of 16');
  inst.dispose();
});

test('a sheet\'s random start and random frame draw apart from the particle\'s size', async () => {
  const { inst } = await make([node('t', -1),
    node('s', 0, { ps: ps({ uv: { tx: 2, ty: 2, frame: K(0), start: { m: 3, s: 0.9999, n: 0 }, cycles: 1, anim: 0 } }, { n: 190 }) }),
    node('f', 0, { ps: ps({ uv: { tx: 2, ty: 2, frame: { m: 3, s: 0.9999, n: 0 }, start: K(0), cycles: 1, anim: 0 } }, { n: 190 }) })]);
  inst.update(0.02);
  for (const s of inst.systems) {
    const low = new Set();
    for (let k = 0; k < s.geometry.instanceCount; k++) if (s.rnd[k * 4 + 2] < 0.25) low.add(frameOf(s, k, 2, 2));
    assert.ok(low.size >= 3, `particles with a low size draw reach most frames: ${[...low]}`);
  }
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

test('a mesh particle\'s alignment reaches the shader: View, World and Velocity take the basis of their job, Local the node\'s (official mesh jobs)', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const mesh = (align, mods = {}) => ({ ps: ps(mods, { render: { mode: 4, mesh: 'b', align } }) });
  const { inst } = await make([node('t', -1), node('v', 0, mesh(0)), node('w', 0, mesh(1)), node('l', 0, mesh(2)), node('f', 0, mesh(3)), node('s', 0, mesh(4)),
    node('x', 0, mesh(0, { rotOL: { x: K(1), y: K(0), z: K(0) } }))], { b: new THREE.BoxGeometry(1, 1, 1) });
  inst.update(0.05);
  const [v, w, l, f, s, x] = inst.systems, al = (o) => o.material.uniforms.uAlign.value;
  assert.deepEqual([al(v), al(w), al(l), al(s)], [0, 1, 2, 4]);
  assert.equal(al(f), 2, 'a mesh\'s Facing job is unread: Local (fx_coverage reports one)');
  assert.equal(al(x), 2, 'separate-axes rotation over life forces Local (PrepareForRender)');
  assert.ok(s.velAlign && !v.velAlign && s.rootTurn && w.rootTurn && !v.rootTurn && !l.rootTurn);
  w.draw(0);
  const M = w.material.uniforms.uSys.value.elements;
  assert.ok(Math.abs(Math.hypot(M[0], M[1], M[2]) - 1) < 1e-6, 'the root\'s turn reaches a World mesh with no scale on it');
  const sh = v.material.vertexShader, at = sh.indexOf('uMode == 4');
  assert.match(sh.slice(at, at + 2400), /vec3 off = vb \* \(uSysS \* p\);/, 'the scale inside the basis (the mesh matrix helper)');
  inst.dispose();
});

test('the alignment\'s basis does not depend on the simulation space: world-space Local takes the node\'s turn, local-space World does not (official client)', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const turn = [0, 0, Math.SQRT1_2, Math.SQRT1_2];   // z 90°
  const sys = (space, mode, align) => ({ ps: ps({}, { space, render: { mode, mesh: mode === 4 ? 'b' : null, align } }) });
  const { inst } = await make([node('t', -1, { rot: turn }), node('m', 0, { scale: [2, 2, 2], ...sys(1, 4, 2) }), node('q', 0, sys(1, 0, 2)), node('l', 0, sys(0, 4, 2)),
    node('lq', 0, sys(0, 0, 2)), node('w', 0, sys(0, 0, 1)), node('ww', 0, sys(1, 0, 1)), node('axes', 0, { ps: ps({ rotOL: { x: K(1), y: K(0), z: K(0) } }, { space: 1, render: { mode: 4, mesh: 'b', align: 0 } }) })],
  { b: new THREE.BoxGeometry(1, 1, 1) });
  inst.update(0.05);
  const [m, q, l, lq, w, ww, axes] = inst.systems, al = (o) => o.material.uniforms.uAlign.value;
  assert.deepEqual([al(m), al(q), al(axes)], [5, 5, 5], 'Local over a world-space simulation, whatever forced the Local');
  assert.deepEqual([al(l), al(lq)], [2, 2], 'a local-space Local has the node\'s turn in its model matrix');
  assert.equal(al(w), 6, 'World over a local-space simulation');
  assert.equal(al(ww), 1, 'a world-space World is in the root\'s frame already');
  m.draw(0);
  const M = m.material.uniforms.uSys.value.elements;
  assert.ok(Math.abs(M[0]) < 1e-6 && Math.abs(M[1] - 1) < 1e-6 && Math.abs(M[4] + 1) < 1e-6, `the node's turn in the root's frame: ${[M[0], M[1], M[4]]}`);
  assert.ok(Math.abs(M[12] - 2) < 1e-6, 'the system\'s scale inside the basis');
  w.draw(0);
  assert.ok(w.rootTurn && w.quadScaled);
  const sh = m.material.vertexShader;
  assert.match(sh, /if \(uAlign == 5\) \{ p = mat3\(uSys\) \* \(uSysS \* p\);/);
  assert.match(sh, /if \(uAlign == 5\) p = mat3\(uSys\) \* p;/);
  assert.match(sh, /uMode == 0 && uAlign == 6/);
  inst.dispose();
});

test('a MeshRenderer node keeps its node\'s transform: it never takes a mesh particle\'s alignment path (락락\'s and 쉐라\'s drones came out a whole tile wide)', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const { inst } = await make([node('t', -1), node('m', 0, { scale: [0.3, 0.2, 0.3], mesh: { mesh: 'b', mat: 'm', order: 0, more: ['m'] } })], { b: new THREE.PlaneGeometry(1, 1) });
  const main = inst.meshMats[1], more = inst.meshMore[1][0];
  assert.equal(main.uniforms.uMode.value, 4);
  assert.equal(main.uniforms.uAlign.value, 2, 'Local: the shader\'s other alignments draw the mesh by the camera, without the node\'s scale or turn');
  assert.equal(more.uniforms.uAlign.value, 2, 'a further material of the renderer too');
  inst.dispose();
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
  const sh = v.material.vertexShader, at = sh.indexOf('uMode == 0 && uAlign == 4');
  assert.ok(at > 0 && /vec3 lc = uSysS \* \(rotZXY\(-iRot\) \* vec3\(c, 0\.0\)\);/.test(sh.slice(at, at + 2000)), 'the Velocity branch turns the corner in 3D');
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

// (2026-11-04, the official engine's billboard dispatchers — rules/fx.md 「그리기 순서·시트」 변환 크기)
test('the system\'s transform scale reaches its View, stretched, Velocity and world-space aligned quads, by scaling mode', async () => {
  const { inst } = await make([node('t', -1), node('p', 0, { scale: [2, 2, 2] }),
    node('v', 1, { ps: ps({}, { n: 2, scaling: 0 }) }),
    node('l', 1, { scale: [1, 3, 1], ps: ps({}, { n: 2, scaling: 1 }) }),
    node('s', 1, { ps: ps({}, { n: 2, scaling: 2 }) }),
    node('a', 1, { ps: ps({}, { n: 2, scaling: 0, render: { align: 2 } }) }),
    node('w', 1, { ps: ps({}, { n: 2, scaling: 0, space: 1, render: { align: 2 } }) }),
    node('h', 1, { ps: ps({}, { n: 2, scaling: 0, render: { mode: 2 } }) }),
    node('r', 1, { ps: ps({}, { n: 2, scaling: 0, render: { mode: 1 } }) })]);
  inst.update(0.02);
  const [v, l, s, a, w, h, r] = inst.systems;
  const S = (x) => (x.material.uniforms.uSysOn.value ? x.material.uniforms.uSys.value.elements.slice(12, 15) : null);
  assert.deepEqual(S(v), [2, 2, 2], 'Hierarchy: its parents\' scale');
  assert.deepEqual(S(l), [1, 3, 1], 'Local: its own scale only');
  assert.equal(S(s), null, 'Shape: none on the particles');
  assert.equal(S(a), null, 'a local-space aligned quad takes it from its model matrix');
  assert.deepEqual(S(w), [2, 2, 2], 'a world-space aligned quad here');
  assert.equal(S(h), null, 'horizontal billboards: not read');
  assert.deepEqual(S(r), [2, 2, 2], 'stretched');
  const sh = r.material.vertexShader;
  assert.match(sh, /vec3 L = vh \* \(uLengthScale \* uSysS\.x \* iSize\.y\) \+ vv \* uVelScale;/, 'lengthScale × S.x, velocityScale not');
  assert.match(sh, /vec3 W = sysView\(/, 'the width through the scaled camera basis');
  assert.match(sh, /vec3 off = uMode == 0 && uAlign == 0 \? sysView\(vec3\(rc, 0\.0\)\)/, 'a View quad');
  // the Unity frame → scene turn: the effect root's (z = −height), without its length
  const e = v.material.uniforms.uSys.value.elements;
  assert.deepEqual([...e.slice(0, 3), ...e.slice(4, 7), ...e.slice(8, 11)], [1, 0, 0, 0, 1, 0, 0, 0, -1]);
  // a clip-driven scale is followed, sent when it changes
  inst.nodes[1].scale.set(3, 3, 3);
  inst.update(0.02);
  assert.deepEqual(S(v), [3, 3, 3]);
  inst.dispose();
});

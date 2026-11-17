// test/render/fx-strip-sides.test.js — a strip's sides as the official engine's line builder makes them (StoreLineData and
// the line / trail vertex writers; docs/rules/fx.md 「그리기 순서·시트」 입자 꼬리 「띠 법선」): render/fxplayer.js
// StripBatch.strip → stripSides, for TrailRenderer, LineRenderer and particle trails alike (a TransformZ trail in its node's
// plane, stripPlane). Before, every point took the perpendicular of its two neighbours' difference: a corner between long
// segments came out pinched (no mitre) and a run of short segments was not smoothed as the engine smooths it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const SV = 18, SV_SIZE = 9, SV_ROT = 12;   // a strip vertex of StripBatch: width at 9, side at 12; two vertices a point
const RULE = 'docs/rules/fx.md 「그리기 순서·시트」 (띠 법선: StoreLineData)';
// (the engine clamps a side's edge-line slope at ±10⁵: a vertical edge meets 10⁻⁵ off)

function line(width = 0.5) {
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const lineR = { pts: [[0, 0, 0], [1, 0, 0]], world: true, loop: false, width, widthCurve: [], grad: { c: [[0, 1, 1, 1], [1, 1, 1, 1]], a: [[0, 1], [1, 1]], mode: 0 }, align: 0, texMode: 0, mat: 'm', order: 0 };
  const def = { name: 'l', duration: 0.3, materials: { m: { shader: 'Mobile/Particles/Additive', tex: {} } }, clips: [], geoms: {},
    lib: { texture: () => new THREE.Texture() }, nodes: [node('l', -1), node('a', 0, { lineR })] };
  return new fxp.FxInstance(def, { quality: 'high' });
}

// a camera 10 above the board looking straight down, the board's +y up the screen: view x, y = the board's x, y
function camera() {
  const c = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  c.position.set(0, 0, 10); c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateMatrixWorld(true);
  return c;
}

/** The sides of the line's points (the first vertex of each), and whether they came from the line builder. */
function sides(inst, path) {
  inst.setPath(path.map(([x, y]) => ({ x, y, z: 0 })));
  inst.update(0.01);
  const b = inst.lines[0].batch, D = b.vb.array;
  return Array.from({ length: b.n }, (_, k) => { const o = k * 2 * SV; return { on: D[o + SV_SIZE + 1], x: D[o + SV_ROT + 1], y: D[o + SV_ROT + 2] }; });
}
const near = (s, x, y, what) => assert.ok(Math.hypot(s.x - x, s.y - y) < 1e-4, `${what}: (${s.x}, ${s.y}), want (${x}, ${y}) — ${RULE}`);

test('before any camera: the tangent\'s perpendicular in the shader (no sides written)', () => {
  const inst = line();
  for (const s of sides(inst, [[0, 0], [1, 0], [3, 0]])) assert.equal(s.on, 0);
  inst.dispose();
});

test('a straight line: every side the unit perpendicular, as before', () => {
  const inst = line();
  inst.lines[0].batch.mesh.onBeforeRender(null, null, camera());   // drawn once: the batch knows its camera
  const S = sides(inst, [[0, 0], [1, 0], [3, 0]]);
  for (const s of S) { assert.equal(s.on, 1, RULE); near(s, 0, 1, 'straight'); }
  inst.dispose();
});

test('a right angle between long segments: the corner takes the mitre (√2), the ends their own segment\'s normal', () => {
  const inst = line(0.5);   // W = 0.5; the arms (2) are longer than 2W, the mitre limit is 3
  inst.lines[0].batch.mesh.onBeforeRender(null, null, camera());
  const S = sides(inst, [[0, 0], [2, 0], [2, 2]]);
  near(S[0], 0, 1, 'first point: its segment along +x');
  near(S[1], -1, 1, 'corner: where the two edges meet (the old perpendicular of the neighbours was 1 long, pinched)');
  near(S[2], -1, 0, 'last point: its segment along +y');
  inst.dispose();
});

test('a right angle between segments shorter than the width: the normals pulled to their mean, no mitre spike', () => {
  const inst = line(0.5);   // arms 0.2 ≤ W: each short segment sets both its normals to their mean
  inst.lines[0].batch.mesh.onBeforeRender(null, null, camera());
  const S = sides(inst, [[0, 0], [0.2, 0], [0.2, 0.2]]);
  const h = Math.SQRT1_2;
  near(S[0], -h, h, 'first point');
  near(S[1], -h, h, 'corner (limit 1: the segment before it is short)');
  near(S[2], -h, h, 'last point');
  inst.dispose();
});

// a TransformZ trail (`alignment` 1, TrailRenderer): its sides in its node's x-y plane, the engine's frame [x, y, −z] of the
// renderer's world matrix (TrailRendererGeometryJob.Initialize), no camera, no perspective
function trail(rot = [0, 0, 0, 1], scale = [1, 1, 1], width = 0.5) {
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const trailR = { time: 10, width, widthCurve: [], grad: { c: [[0, 1, 1, 1], [1, 1, 1, 1]], a: [[0, 1], [1, 1]], mode: 0 }, align: 1, texMode: 0, minDist: 0.01, emitting: true, mat: 'm', order: 0 };
  const def = { name: 't', duration: 30, materials: { m: { shader: 'Mobile/Particles/Additive', tex: {} } }, clips: [], geoms: {},
    lib: { texture: () => new THREE.Texture() }, nodes: [node('t', -1), node('a', 0, { rot, scale, trailR })] };
  return new fxp.FxInstance(def, { quality: 'high' });
}
const SV_TAN = 15;
/** Walk the trail's node through `path` (its parent's frame); the sides of its points, newest first, in that frame. */
function planeSides(inst, path) {
  const o = inst.nodes[1];
  for (const [x, y, z = 0] of path) { o.position.set(x, y, z); inst.update(0.01); }
  const b = inst.trails[0].batch, D = b.vb.array;
  return Array.from({ length: b.n }, (_, k) => { const i = k * 2 * SV; return { on: D[i + SV_SIZE + 1], x: D[i + SV_TAN], y: D[i + SV_TAN + 1], z: D[i + SV_TAN + 2] }; });
}
const near3 = (s, x, y, z, what) => assert.ok(Math.hypot(s.x - x, s.y - y, s.z - z) < 1e-4, `${what}: (${s.x}, ${s.y}, ${s.z}), want (${x}, ${y}, ${z}) — ${RULE} TransformZ`);

test('a TransformZ trail: the corner\'s mitre in its node\'s plane, no camera needed (before: the tangent × the node\'s z, no mitre)', () => {
  const inst = trail();
  // node unturned: its plane is x-y. The walk (0,0) → (2,0) → (2,2) → (2,4); newest first, the live head (2,4) and its
  // recorded twin first (TrailRenderer FlattenRingbuffer), so the corner's mitre limit reads the long segment two back
  const S = planeSides(inst, [[0, 0], [2, 0], [2, 2], [2, 4]]);
  assert.equal(S.length, 5);
  for (const s of S) assert.equal(s.on, 2, `the plane's sides, flagged for the shader — ${RULE}`);
  // the engine's normal of a point = (newer − older point) · −1 turned +90° in the plane (z = −1, no perspective); stored
  // negated (the +1 vertex takes v = 1, the engine's +normal side v = 0) — the side of the old cross(tangent, z) on a straight run
  for (const k of [0, 1, 2]) near3(S[k], -1, 0, 0, `point ${k} on the run along y`);
  near3(S[3], -1, 1, 0, 'corner (2,0): where the two edges meet, √2 long');
  near3(S[4], 0, 1, 0, 'oldest (0,0): its segment runs +x');
  inst.dispose();
});

test('a TransformZ trail on a turned node: its sides lie across the node\'s z, whatever the path\'s depth', () => {
  const h = Math.SQRT1_2;
  const inst = trail([h, 0, 0, h]);   // 90° about x: the node's y = +z, its z = −y; its plane is x-z
  const S = planeSides(inst, [[0, 0, 0], [2, 0, 0], [4, 0, 0]]);
  for (const s of S) { assert.equal(s.on, 2); assert.ok(Math.abs(s.y) < 1e-6, `no part along the node's z (y): ${s.y} — ${RULE}`); near3(s, 0, 0, 1, 'straight along x: the node\'s y'); }
  inst.dispose();
});

test('a TransformZ trail takes its node\'s scale: the engine writes the vertices back through the scaled frame', () => {
  const inst = trail(undefined, [2, 2, 1]);
  for (const s of planeSides(inst, [[0, 0], [2, 0], [4, 0]])) near3(s, 0, 2, 0, 'twice as wide');
  inst.dispose();
  const flat = trail(undefined, [0, 1, 1]);   // a zero axis (the engine's SVD inverse): no width
  for (const s of planeSides(flat, [[0, 0], [2, 0], [4, 0]])) near3(s, 0, 0, 0, 'degenerate frame');
  flat.dispose();
});

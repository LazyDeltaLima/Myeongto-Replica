// test/render/fx-mesh-shape.test.js — effect bundle I (2026-10-22, docs/rules/fx.md 「추출기가 못 읽던 모양」): a particle
// system with a Mesh shape (ShapeModule type 6, the client's 79 systems — mostly the range outlines' sparkles) emits from
// its mesh's vertices / edges / triangles along the surface normal (it was one point), tinted by the vertex colours with
// m_UseMeshColors; stretched billboards and mesh particles take their renderer's pivot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYER = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');

const mm = (s) => ({ m: 0, s });
const sys = (shape, n = 400, speed = 1) => ({
  dur: 1, loop: false, delay: mm(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: mm(1), speed: mm(speed),
  color: { m: 0, a: [1, 1, 1, 1] }, size: mm(0.1), rot: mm(0), max: 1000, gravity: mm(0), flipRot: 0, rate: mm(0),
  bursts: [{ t: 0, n: mm(n) }], mods: {},
  shape: { radius: 1, angle: 0, arc: 360, thick: 1, length: 1, pos: [0, 0, 0], rotE: [0, 0, 0], scale: [1, 1, 1], box: [0, 0, 0], ...shape },
  render: { mode: 0, mat: 'm', mesh: null, align: 0, pivot: [0, 0, 0], order: 0 },
});
const node = (name, parent, ps) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...(ps ? { ps } : {}) });

async function play(nodes, geoms) {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = {
    name: 'm', duration: 1, nodes: [node('root', -1), ...nodes], clips: [], geoms, lib: { texture: () => null },
    materials: { m: { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} } },
  };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  inst.update(1 / 30);
  return inst;
}

/** A 2 × 1 rectangle in the XY plane (two triangles, Unity's front toward −z), red on the left, blue on the right. */
async function rect() {
  const THREE = await import('../../public/vendor/three.module.js');
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('vcol', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1], 4));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

test('a Mesh shape emits from its vertices, edges or triangles (placementMode 0 / 1 / 2), not from one point', async () => {
  const g = await rect();
  const inst = await play([
    node('v', 0, sys({ type: 6, mesh: 'r', place: 0, meshCol: true })),
    node('e', 0, sys({ type: 6, mesh: 'r', place: 1, meshCol: true })),
    node('t', 0, sys({ type: 6, mesh: 'r', place: 2, meshCol: true }, 400, 0)),
  ], { r: g });
  const pts = (s) => Array.from({ length: s.n }, (_, i) => [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]]);
  const [v, e, t] = inst.systems;
  const corner = ([x, y]) => Math.abs(Math.abs(x) - 1) < 1e-6 && (Math.abs(y) < 1e-6 || Math.abs(y - 1) < 1e-6);
  assert.ok(v.n > 100 && pts(v).every(corner), 'vertices: the four corners');
  // the triangles' edges: the outline and the diagonal (−1, 0)–(1, 1)
  const onEdge = ([x, y]) => Math.abs(Math.abs(x) - 1) < 1e-6 || Math.abs(y) < 1e-6 || Math.abs(y - 1) < 1e-6 || Math.abs(y - (x + 1) / 2) < 1e-6;
  assert.ok(pts(e).every(onEdge) && pts(e).some(([x, y]) => !corner([x, y])), 'edges: along them');
  const inside = ([x, y, z]) => x >= -1 - 1e-6 && x <= 1 + 1e-6 && y >= -1e-6 && y <= 1 + 1e-6 && Math.abs(z) < 1e-6;
  assert.ok(pts(t).every(inside), 'triangles: on the surface');
  const left = pts(t).filter(([x]) => x < 0).length;
  assert.ok(left > 0.35 * t.n && left < 0.65 * t.n, `spread over the area (${left}/${t.n} on the left half)`);
  // the vertex colours tint the start colour (red left, blue right)
  for (let i = 0; i < v.n; i++) {
    const x = v.pos[i * 3], r = v.col0[i * 4], b = v.col0[i * 4 + 2];
    assert.ok(x < 0 ? r > 0.99 && b < 0.01 : b > 0.99 && r < 0.01, 'vertex colour');
  }
  // the direction = the surface normal (from the triangles' winding: Unity's front, −z)
  for (let i = 0; i < v.n; i++) assert.ok(Math.abs(v.vel[i * 3 + 2] + 1) < 1e-6, 'along the normal');
});

test('a Mesh shape without m_UseMeshColors keeps the start colour; one whose mesh did not load stays a point', async () => {
  const g = await rect();
  const inst = await play([node('a', 0, sys({ type: 6, mesh: 'r', place: 2, meshCol: false })), node('b', 0, sys({ type: 6, mesh: 'gone', place: 2 }))], { r: g, gone: null });
  const [a, b] = inst.systems;
  for (let i = 0; i < a.n; i++) assert.ok(a.col0[i * 4] === 1 && a.col0[i * 4 + 2] === 1);
  for (let i = 0; i < b.n; i++) assert.ok(b.pos[i * 3] === 0 && b.pos[i * 3 + 1] === 0);
});

test('stretched billboards and mesh particles take their renderer\'s pivot (uPivot x / y / z)', async () => {
  const ps = sys({ type: 4 });
  ps.render = { ...ps.render, mode: 4, mesh: 'r', pivot: [0.2, 0.5, -0.3] };
  const inst = await play([node('m', 0, ps)], { r: await rect() });
  assert.deepEqual(inst.systems[0].material.uniforms.uPivot.value.toArray().map((x) => +x.toFixed(4)), [0.2, 0.5, -0.3]);
  assert.match(PLAYER, /vec3 p = rm \* \(\(transformed \+ uPivot\) \* iSize\);/);
  assert.match(PLAYER, /vec2 off = d \* \(\(position\.x - uPivot\.y\) \* len\) \+ vec2\(-d\.y, d\.x\) \* \(\(position\.y \+ uPivot\.x\) \* iSize\.x\);/);
});

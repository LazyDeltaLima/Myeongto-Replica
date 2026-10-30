// test/render/fx-shared-buffers.test.js — an effect ending never releases the attributes it shares (render/fxplayer.js
// disposeOwn). three.js deletes the GL buffer of every attribute of a disposed geometry (WebGLGeometries onGeometryDispose):
// a particle system's instanced geometry borrows QUAD's (or a library mesh's) index, positions and uvs, so one ending
// deleted them under every other live effect, whose draws then failed (`drawElementsInstanced: no buffer is bound to
// enabled attribute`, 르무엔's attack trail on; #10 investigation). The same holds when a particle system or a strip batch
// grows its buffers (2026-10-30) and for the constant attributes every strip batch shares.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
const tri = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.setIndex([0, 1, 2]); return g; })();
const k = (s) => ({ m: 0, s });
const ps = (mode) => ({ dur: 1, loop: true, delay: k(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: k(0.5), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
  size: k(1), rot: k(0), max: 4, gravity: k(0), flipRot: 0, rate: k(10), bursts: [], mods: {},
  render: { mode, mesh: mode === 4 ? 'g' : null, mat: 'm', lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } });
const def = () => ({ name: 't', duration: 0, materials: { m: mat }, clips: [], geoms: { g: tri }, lib: { texture: () => new THREE.Texture() },
  nodes: [node('t', -1), node('quad', 0, { ps: ps(0) }), node('meshps', 0, { ps: ps(4) }), node('ring', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 } })] });

/** What three.js would release on each geometry's dispose: its index and attributes at that moment. */
function released(inst) {
  const out = [];
  const geos = [...inst.systems.map((s) => s.geometry), ...inst.meshGeos.map(([g]) => g)];
  for (const g of geos) g.addEventListener('dispose', () => { out.push(g, ...(g.index ? [g.index] : []), ...Object.values(g.attributes)); });
  return { geos, out };
}

test('an ended effect releases only its own buffers: another live effect keeps the shared quad and mesh ones', () => {
  const a = new fxp.FxInstance(def(), { quality: 'high' }), b = new fxp.FxInstance(def(), { quality: 'high' });
  assert.equal(a.systems.length, 2);
  assert.equal(a.meshGeos.length, 1, 'the mesh node geometry is tracked');
  const shared = new Set();
  for (const g of [...b.systems.map((s) => s.geometry), ...b.meshGeos.map(([x]) => x)]) {
    if (g.index) shared.add(g.index);
    for (const at of Object.values(g.attributes)) shared.add(at);
  }
  shared.add(tri.index); for (const at of Object.values(tri.attributes)) shared.add(at);
  const { geos, out } = released(a);
  a.dispose();
  assert.equal(out.filter((x) => geos.includes(x)).length, geos.length, 'every geometry of the ended effect is disposed (the mesh node one too)');
  const freed = out.filter((x) => !geos.includes(x));
  assert.ok(freed.length > 0, 'its own instance buffers go');
  assert.deepEqual(freed.filter((x) => shared.has(x)), [], 'no attribute the other effect or the library mesh uses');
  assert.ok(b.systems[0].geometry.getAttribute('position') && b.systems[0].geometry.index, 'the live effect keeps its quad');
  b.dispose();
});

// 2026-10-30: a particle system's arrays and instance buffers start small and grow as emission needs (ParticleSystem.grow);
// strip batches start with room for 64 points and share one set of constant attributes (StripBatch); an empty one is hidden
const big = () => {
  const d = def();
  d.nodes = [node('t', -1), node('meshps', 0, { ps: { ...ps(4), max: 100, mods: { trail: { mode: 1 } }, render: { ...ps(4).render, trailMat: 'm' } } })];
  return d;
};

test('a particle system grows past its first room: the particles kept, the old geometry released without what it shares', () => {
  const inst = new fxp.FxInstance(big(), { quality: 'high' });
  const sys = inst.systems[0];
  assert.equal(sys.max, 100);
  assert.ok(sys.room < sys.max, `starts with less room than max (${sys.room})`);
  sys.time = 0;
  sys.emit(sys.room);
  const n0 = sys.n, life0 = sys.life.slice(0, n0), rnd0 = sys.rnd.slice(0, n0 * 4), uid0 = sys.uid.slice(0, n0);
  const g0 = sys.geometry, ib0 = sys.ib, keep = [g0.index, ...Object.values(g0.attributes).filter((a) => !a.isInterleavedBufferAttribute)];
  const freed = [];
  g0.addEventListener('dispose', () => { freed.push(...(g0.index ? [g0.index] : []), ...Object.values(g0.attributes)); });
  sys.emit(60);
  assert.equal(sys.n, n0 + 60);
  assert.ok(sys.room >= sys.n && sys.room <= sys.max);
  for (const k of ['pos', 'vel', 'age', 'life', 'size0', 'rot', 'col0', 'rnd', 'uid', 'hist']) assert.ok(sys[k].length >= sys.room, k);
  assert.deepEqual(sys.life.slice(0, n0), life0); assert.deepEqual(sys.rnd.slice(0, n0 * 4), rnd0); assert.deepEqual(sys.uid.slice(0, n0), uid0);
  assert.ok(sys.mesh.geometry === sys.geometry && sys.geometry !== g0, 'the mesh draws the new geometry');
  assert.ok(sys.ib !== ib0 && sys.ib.array.length === sys.room * 28);
  assert.ok(freed.length > 0 && freed.every((a) => a.isInterleavedBufferAttribute && a.data === ib0), 'only the old instance rows are released');
  for (const a of keep) assert.ok(a && Object.values(sys.geometry.attributes).concat(sys.geometry.index).includes(a), 'the shared mesh attributes moved over');
  sys.emit(500);
  assert.equal(sys.n, sys.max, 'never past max');
  assert.equal(sys.room, sys.max);
  inst.dispose();
});

test('strip batches grow to their cap and never release the constant attributes they share', () => {
  const a = new fxp.FxInstance(big(), { quality: 'high' }), b = new fxp.FxInstance(big(), { quality: 'high' });
  const ba = a.systems[0].trailBatch, bb = b.systems[0].trailBatch;
  assert.equal(ba.cap, 101);
  assert.equal(ba.room, 64);
  const consts = ['iUV', 'iC1', 'iC2', 'iPos'];
  for (const k of consts) assert.ok(ba.geometry.getAttribute(k) === bb.geometry.getAttribute(k), `${k} shared`);
  const pts = new Float32Array(101 * 3).map((_, i) => i), w = new Float32Array(101).fill(1), c = new Float32Array(101 * 4).fill(0.5), u = new Float32Array(101).map((_, i) => i / 100);
  ba.begin(); ba.strip(pts, 40, w, c, u);
  const first = ba.vb.array.slice(0, 40 * 2 * 18), g0 = ba.geometry, freed = [];
  g0.addEventListener('dispose', () => { freed.push(g0.index, ...Object.values(g0.attributes)); });
  ba.strip(pts, 50, w, c, u); ba.end();
  assert.equal(ba.room, 101, 'twice the room, at most the cap'); assert.equal(ba.n, 90); assert.equal(ba.ni, 39 * 6 + 49 * 6);
  assert.ok(ba.mesh.geometry === ba.geometry && ba.geometry !== g0);
  assert.deepEqual(ba.vb.array.slice(0, 40 * 2 * 18), first, 'the frame\'s first strip kept');
  assert.equal(ba.geometry.drawRange.count, ba.ni);
  assert.ok(freed.length > 0 && freed.every((x) => !consts.some((k) => bb.geometry.getAttribute(k) === x)), 'growing keeps the shared attributes');
  ba.begin(); ba.strip(pts, 101, w, c, u); ba.end();
  assert.equal(ba.n, 101);
  ba.strip(pts, 2, w, c, u);
  assert.equal(ba.n, 101, 'nothing past the cap');
  assert.equal(ba.mesh.visible, true, 'a batch with strips is drawn');
  ba.begin(); ba.end();
  assert.equal(ba.mesh.visible, true, 'empty before its first draw: drawn, so three.js takes its bounding sphere (the draw order) when it always did');
  ba.geometry.computeBoundingSphere();   // what three.js's first draw does
  ba.begin(); ba.end();
  assert.equal(ba.mesh.visible, false, 'an empty batch is not drawn at all');
  const gone = [];
  ba.geometry.addEventListener('dispose', () => { gone.push(...Object.values(ba.geometry.attributes)); });
  a.dispose();
  for (const k of consts) assert.ok(!gone.includes(bb.geometry.getAttribute(k)), `${k} not released with the ended effect`);
  b.dispose();
});

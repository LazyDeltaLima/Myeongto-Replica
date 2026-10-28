// test/render/fx-shared-buffers.test.js — an effect ending never releases the attributes it shares (render/fxplayer.js
// disposeOwn). three.js deletes the GL buffer of every attribute of a disposed geometry (WebGLGeometries onGeometryDispose):
// a particle system's instanced geometry borrows QUAD's (or a library mesh's) index, positions and uvs, so one ending
// deleted them under every other live effect, whose draws then failed (`drawElementsInstanced: no buffer is bound to
// enabled attribute`, 르무엔's attack trail on; #10 investigation).

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

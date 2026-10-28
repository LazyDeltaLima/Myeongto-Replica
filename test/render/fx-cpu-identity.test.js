// test/render/fx-cpu-identity.test.js — the effect player's CPU trims of 2026-10-28 (mobile perf; docs/rules/fx.md
// 「공식 전투 이펙트」, 성능 2) give the same numbers as before:
//   - perlinD (the noise module's gradient noise) unrolled: compared with its earlier form, kept below as it was, on random
//     points — every result the same double;
//   - the shader's scalar uniforms packed (PACKED_GLSL): every name the shader reads through a define still holds exactly
//     what code and clips write through `uniforms.<name>.value`, and nothing else moved with it;
//   - a ribbon's particle order from a keyed native sort (ParticleSystem.ageOrder): the comparator sort's order.
// The pixels themselves (old and new player on the same seeded scene, read back) were compared in a browser; that tool is in
// the maintainer's notes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

// ---- perlinD as it was before the trim (verbatim) ----
const PERM = Uint8Array.from([151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180]);
const GRAD = Int8Array.from([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1,1,1,0,-1,1,0,0,-1,1,0,-1,-1]);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10), dfade = (t) => 30 * t * t * (t * (t - 2) + 1);
function perlinDBefore(x, y, z, f) {
  x *= f; y *= f; z *= f;
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  x -= X; y -= Y; z -= Z;
  const xi = X & 255, yi = Y & 255, zi = Z & 255, P = PERM;
  const u = fade(x), v = fade(y), w = fade(z), du = dfade(x), dv = dfade(y);
  const c = [0, 0, 0, 0, 0, 0, 0, 0], cx = [0, 0, 0, 0, 0, 0, 0, 0], cy = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const i = k & 1, j = (k >> 1) & 1, l = k >> 2;
    const h = P[(P[(P[(xi + i) & 255] + yi + j) & 255] + zi + l) & 255] & 15, g = h * 3;
    c[k] = GRAD[g] * (x - i) + GRAD[g + 1] * (y - j) + GRAD[g + 2] * (z - l); cx[k] = GRAD[g]; cy[k] = GRAD[g + 1];
  }
  const tri = (a) => {
    const x00 = a[0] + u * (a[1] - a[0]), x10 = a[2] + u * (a[3] - a[2]), x01 = a[4] + u * (a[5] - a[4]), x11 = a[6] + u * (a[7] - a[6]);
    const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
    return y0 + w * (y1 - y0);
  };
  const ex = (j, l) => c[1 + 2 * j + 4 * l] - c[2 * j + 4 * l], ey = (i, l) => c[i + 2 + 4 * l] - c[i + 4 * l];
  const by = (a00, a10, a01, a11, s, t) => { const p0 = a00 + s * (a10 - a00), p1 = a01 + s * (a11 - a01); return p0 + t * (p1 - p0); };
  const gx = tri(cx) + du * by(ex(0, 0), ex(1, 0), ex(0, 1), ex(1, 1), v, w);
  const gy = tri(cy) + dv * by(ey(0, 0), ey(1, 0), ey(0, 1), ey(1, 1), u, w);
  return [gx * f, gy * f];
}

/** mulberry32 */
function seeded(s) {
  let h = s | 0;
  return () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('perlinD gives the same doubles as before the trim (random points, lattice points, negative and wrapped coordinates)', () => {
  const r = seeded(20261028);
  const pts = [[0, 0, 0, 1], [1, 1, 1, 1], [-1, -0, 255.5, 0.5], [256, -256, 512, 2], [1e-9, -1e-9, 3, 7]];
  for (let k = 0; k < 50000; k++) pts.push([(r() - 0.5) * 2000, (r() - 0.5) * 2000, (r() - 0.5) * 2000, r() * 6]);
  for (let k = 0; k < 2000; k++) pts.push([Math.round((r() - 0.5) * 600), Math.round((r() - 0.5) * 600), Math.round((r() - 0.5) * 600), 1]);
  let bad = 0;
  for (const [x, y, z, f] of pts) {
    const a = perlinDBefore(x, y, z, f), b = fxp.perlinD(x, y, z, f);
    if (!Object.is(a[0], b[0]) || !Object.is(a[1], b[1])) bad++;
  }
  assert.equal(bad, 0, `${bad} of ${pts.length} points differ`);
});

// ---- the packed scalar uniforms ----

/** The defines of the effect shader: name → [packed uniform, bit | axis]. */
function packedDefines(src) {
  const out = new Map();
  for (const m of src.matchAll(/^\s*#define (u\w+) \(\(uPFlags & (\d+)\) != 0\)$/gm)) out.set(m[1], ['uPFlags', Number(m[2])]);
  for (const m of src.matchAll(/^\s*#define (u\w+) (uPInt|uPF\d)\.([xyzw])$/gm)) out.set(m[1], [m[2], m[3]]);
  return out;
}

/** What the shader reads for `name`: the define resolved on the packed uniforms. */
function shaderValue(u, [packed, at]) {
  if (packed === 'uPFlags') return (u.uPFlags.value & at) !== 0;
  return u[packed].value[at];
}

const tri = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)); g.setIndex([0, 1, 2]); return g; })();
const k0 = (s) => ({ m: 0, s });
const ps = (mode, extra = {}) => ({ dur: 1, loop: true, delay: k0(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: k0(0.5), speed: k0(0), color: { m: 0, a: [1, 1, 1, 1] },
  size: k0(1), rot: k0(0), max: 4, gravity: k0(0), flipRot: 0, rate: k0(10), bursts: [], mods: {},
  render: { mode, mesh: mode === 4 ? 'g' : null, mat: 'm', lengthScale: 3.5, velScale: 0.25, align: 4, pivot: [0, 0, 0], order: 0, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4], free: true, rotw: true, ...extra } });
const mat = { shader: 'Torappu/Particles/Disturb(CustomData)', tex: {}, floats: { _Opacity: 0.625, _RimPower: 3, _BaselineZ: -0.5, _AddFactor: 1.5 }, colors: {} };
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const def = () => ({ name: 't', duration: 0, materials: { m: mat }, clips: [], geoms: { g: tri }, lib: { texture: () => new THREE.Texture() },
  nodes: [node('t', -1), node('quad', 0, { ps: ps(0) }), node('stretched', 0, { ps: ps(1) }), node('meshps', 0, { ps: ps(4) }), node('ring', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 } })] });

test('the shader reads every packed scalar by its old name; none is still declared on its own', () => {
  const m = fxp.programVariants()[0].children[0].material;
  for (const src of [m.vertexShader, m.fragmentShader]) {
    const d = packedDefines(src);
    assert.ok(d.size >= 39, `the defines (${d.size})`);
    for (const name of d.keys()) assert.doesNotMatch(src, new RegExp(`uniform\\s+\\w+\\s+${name}\\s*;`), `${name} declared besides its define`);
    // each bit / component holds one name
    const seen = new Set();
    for (const [p, at] of d.values()) { const k = `${p}.${at}`; assert.ok(!seen.has(k), `${k} twice`); seen.add(k); }
  }
  assert.deepEqual([...packedDefines(m.vertexShader)], [...packedDefines(m.fragmentShader)], 'the two stages pack alike');
});

test('a material\'s scalar uniforms: what code writes through the old name is what the shader reads, and only there', () => {
  const inst = new fxp.FxInstance(def(), { quality: 'high', floor: 0.25 });
  const mats = [...inst.systems.map((s) => s.material), ...inst.meshMatList];
  assert.ok(mats.length >= 4);
  const d = packedDefines(mats[0].fragmentShader);
  // the values the player set up (FxInstance / ParticleSystem / useMeshAttrs / makeMaterial) arrive
  const s0 = inst.systems[0].material.uniforms, s1 = inst.systems[1].material.uniforms;
  assert.equal(shaderValue(s0, d.get('uMode')), 0); assert.equal(shaderValue(s1, d.get('uMode')), 1);
  assert.equal(shaderValue(s0, d.get('uAlign')), 4); assert.equal(shaderValue(s0, d.get('uFree')), true); assert.equal(shaderValue(s0, d.get('uRotW')), true);
  assert.equal(shaderValue(s1, d.get('uLengthScale')), 3.5); assert.equal(shaderValue(s1, d.get('uVelScale')), 0.25);
  assert.equal(shaderValue(s0, d.get('uOpacity')), 0.625); assert.equal(shaderValue(s0, d.get('uAddFactor')), 1.5);
  assert.equal(shaderValue(s0, d.get('uCustom')), true, 'a (CustomData) material');
  for (const m of mats) {
    const u = m.uniforms;
    for (const [name, at] of d) {
      assert.equal(shaderValue(u, at), u[name].value, `${name} reads back what the shader sees`);
      const before = new Map([...d.keys()].map((n) => [n, u[n].value]));
      const v = at[0] === 'uPFlags' ? !before.get(name) : at[0] === 'uPInt' ? (before.get(name) + 3) | 0 : before.get(name) * -1.75 + 0.3125;
      u[name].value = v;
      assert.equal(u[name].value, v, `${name} keeps a written value`);
      assert.equal(shaderValue(u, at), v, `${name} reaches the shader`);
      for (const [n2, at2] of d) if (n2 !== name) assert.equal(shaderValue(u, at2), before.get(n2), `writing ${name} moved ${n2}`);
      u[name].value = before.get(name);
      assert.equal(shaderValue(u, at), before.get(name));
    }
  }
  inst.dispose();
});

test('uvRotation\'s four angles: the shader\'s uRot0..3 are the material\'s uRot vectors', () => {
  const m = fxp.programVariants()[0].children[0].material, u = m.uniforms;
  for (let k = 0; k < 4; k++) assert.ok(u[`uRot${k}`].value === u.uRot.value[k], `uRot${k}`);
  assert.match(m.fragmentShader, /uniform vec4 uRot0;/);
  assert.doesNotMatch(m.fragmentShader, /uRot\[/);
});

// ---- a ribbon's order (ParticleSystem.ageOrder) ----

test('a ribbon\'s order from the keyed sort is the comparator sort\'s: oldest first, equal ages in index order', () => {
  const inst = new fxp.FxInstance(def(), { quality: 'high' });
  const sys = inst.systems[0];
  const r = seeded(7);
  for (let round = 0; round < 300; round++) {
    const n = 1 + Math.floor(r() * Math.min(sys.max, 4));
    const pool = [0, 1e-45, 2e-40, 1 / 60, 2 / 60, 0.5, 0.5000001, 3, 1e6, r() * 2, r()];
    const age = new Float32Array(sys.max);
    for (let i = 0; i < n; i++) age[i] = pool[Math.floor(r() * pool.length)];
    sys.age = age;
    const want = Array.from({ length: n }, (_, i) => i).sort((x, y) => age[y] - age[x]);
    const got = [];
    assert.equal(sys.ageOrder(got, n), true);
    assert.deepEqual(got, want, `ages ${[...age.subarray(0, n)]}`);
  }
  // a big system (the extracted ribbons hold up to 1000): many ties and many ages
  const big = { max: 1000, age: new Float32Array(1000) };
  for (let i = 0; i < 1000; i++) big.age[i] = Math.floor(r() * 40) / 30;
  const got = [];
  assert.equal(sys.ageOrder.call(big, got, 1000), true);
  assert.deepEqual(got, Array.from({ length: 1000 }, (_, i) => i).sort((x, y) => big.age[y] - big.age[x]));
  // a negative or non-finite age: left to the comparator sort
  for (const bad of [-1, NaN, Infinity]) {
    const o = { max: 4, age: Float32Array.from([0.1, bad, 0.2, 0]) };
    assert.equal(sys.ageOrder.call(o, [], 4), false, String(bad));
  }
  inst.dispose();
});

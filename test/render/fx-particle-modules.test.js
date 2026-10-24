// test/render/fx-particle-modules.test.js — particle modules and shader pass states the player had skipped (2026-10-22,
// docs/rules/fx.md 「입자 모듈 — 충돌·속도 상속·속도별 크기」·「셰이더 패스 상태 — 컬링·깊이 쓰기·블렌드」):
// tools/local-extract/fx_extract.py reads InheritVelocityModule (`mods.inherit`), SizeBySpeedModule (`mods.sizeBySpeed`) and
// CollisionModule against planes (`mods.collide`, the planes as nodes), and render/fxplayer.js runs them; renderState gives a
// material the culling / depth write / source factor its shader's pass reads (the client's m_ParsedForm), and mesh geometry
// takes that culling. Unity's Default-Particle (Legacy Alpha Blended Premultiply) is read on the systems that emit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');

const K = (v) => ({ m: 0, s: v });
const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const MAT = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };

/** A particle system: `n` particles at t = `at` from the node's origin along +z at `speed`, no gravity, living 5 s. */
function ps(mods, { space = 0, speed = 2, n = 4, at = 0, size = 0.2, mode = 0 } = {}) {
  return { dur: 5, loop: false, delay: K(0), speedMul: 1, space, life: K(5), speed: K(speed), color: { m: 0, a: [1, 1, 1, 1] },
    size: K(size), rot: K(0), max: 50, gravity: K(0), rate: K(0), bursts: [{ t: at, n: K(n), cycles: 1, interval: 0, p: 1 }],
    mods, render: { mode, mat: 'm', mesh: mode === 4 ? 'g' : null, lengthScale: 2, velScale: 0, align: 0, pivot: [0, 0, 0], order: 0 } };
}

async function make(nodes, materials = { m: MAT }) {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  const def = { name: 't', duration: 0, materials, clips: [], geoms: new Proxy({}, { get: () => tri() }), lib: { texture: () => new THREE.Texture() }, nodes };
  return { THREE, fxp, inst: new fxp.FxInstance(def, { quality: 'high' }) };
}

test('renderState: the culling / depth write / source factor each pass reads (client shader states)', async () => {
  const { renderState } = await import('../../public/js/render/fxplayer.js');
  const f = { _CullMode: 2, _ZWrite: 1, _SrcBlend: 1 };
  assert.deepEqual(renderState('Torappu/Particles/Disturb/Disturb Origin', f), { cull: 2, zwrite: false, src: 1 });   // _ZWrite 1 unread
  assert.deepEqual(renderState('Torappu/Particles/Disturb/Disturb Anchor', { _CullMode: 0, _SrcBlend: 5 }), { cull: 0, zwrite: false, src: 5 });
  assert.deepEqual(renderState('Torappu/Particles/Additive', f), { cull: 0, zwrite: false, src: 5 });   // left-over values
  assert.deepEqual(renderState('Torappu/Particles/AlphaBlend(ZWrite)', { _CullMode: 2, _ZWrite: 4 }), { cull: 2, zwrite: true, src: 5 });
  assert.equal(renderState('Torappu/Particles/Ram/Disturb(CustomData)', { _CullMode: 1 }).cull, 1);
  assert.equal(renderState('Torappu/Particles-L2D/Ram/Disturb(CustomData)', { _CullMode: 2 }).cull, 2);
  assert.equal(renderState('Torappu/Particles/Rim/Rim Tint (Add)', {}).cull, 2);   // fixed Cull Back
  assert.equal(renderState('Torappu/Particles/Rim/Rim Texture (AlphaBlend)', { _CullMode: 0 }).cull, 2);
  assert.equal(renderState('Torappu/Particles/Disturb/Disturb GrabPass', { _CullMode: 2 }).cull, 0);
  assert.equal(renderState('Torappu/Particles/Dissolve/Dissolve Add Double', { _CullMode: 2 }).cull, 0);
  assert.equal(renderState('Torappu/Particles/Dissolve/Dissolve Double', { _CullMode: 2 }).cull, 2);
  assert.equal(renderState('Legacy Shaders/Particles/Alpha Blended Premultiply', {}).src, 1);
});

test('culling: mesh renderers and mesh particles take their pass\'s side; billboards keep both', async () => {
  const mats = {
    rim: { shader: 'Torappu/Particles/Rim/Rim Tint (Add)', tex: {}, floats: {}, colors: {} },
    front: { shader: 'Torappu/Particles/Ram/Disturb(CustomData)', tex: {}, floats: { _CullMode: 1 }, colors: {} },
    add: { shader: 'Torappu/Particles/Additive', tex: {}, floats: { _CullMode: 2 }, colors: {} },
    m: { shader: 'Torappu/Particles/Disturb/Disturb Origin', tex: {}, floats: { _CullMode: 2 }, colors: {} },
  };
  const mesh = (mat) => ({ mesh: { mesh: 'g', mat, order: 0 } });
  const { THREE, inst } = await make([node('t', -1), node('a', 0, mesh('rim')), node('b', 0, mesh('front')), node('c', 0, mesh('add')),
    node('d', 0, { ps: ps({}) }), node('e', 0, { ps: ps({}, { mode: 4 }) })], mats);
  assert.deepEqual(inst.meshMats.slice(1, 4).map((m) => m.side), [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]);
  assert.deepEqual(inst.systems.map((s) => s.material.side), [THREE.DoubleSide, THREE.FrontSide]);
  inst.dispose();
});

test('blend: Default-Particle premultiplies without a tint; Disturb Origin One Zero draws opaque; AlphaBlend(ZWrite) writes depth', async () => {
  const mats = {
    m: { shader: 'Legacy Shaders/Particles/Alpha Blended Premultiply', tex: {}, floats: {}, colors: { _Color: [1, 1, 1, 1] } },
    o: { shader: 'Torappu/Particles/Disturb/Disturb Origin', tex: {}, floats: { _SrcBlend: 1, _DstBlend: 0, _ZTest: 4 }, colors: {} },
    z: { shader: 'Torappu/Particles/AlphaBlend(ZWrite)', tex: {}, floats: { _ZWrite: 4, _ZTest: 4 }, colors: {} },
    l: { shader: 'Legacy Shaders/Particles/Alpha Blended', tex: {}, floats: { _SrcBlend: 1, _DstBlend: 0 }, colors: { _TintColor: [0.5, 0.5, 0.5, 0.5] } },
  };
  const { THREE, inst } = await make([node('t', -1), node('p', 0, { ps: ps({}) }), node('o', 0, { mesh: { mesh: 'g', mat: 'o', order: 0 } }),
    node('z', 0, { mesh: { mesh: 'g', mat: 'z', order: 0 } }), node('l', 0, { mesh: { mesh: 'g', mat: 'l', order: 0 } })], mats);
  const p = inst.systems[0].material;
  assert.equal(p.uniforms.uPremul.value, true);
  assert.deepEqual(p.uniforms.uTint.value.toArray(), [1, 1, 1, 1]);
  assert.deepEqual([p.blendSrc, p.blendDst], [THREE.OneFactor, THREE.OneMinusSrcAlphaFactor]);
  const o = inst.meshMats[2];
  assert.deepEqual([o.blendSrc, o.blendDst, o.blendDstAlpha, o.depthWrite], [THREE.OneFactor, THREE.ZeroFactor, THREE.ZeroFactor, false]);
  assert.deepEqual([inst.meshMats[3].depthWrite, inst.meshMats[3].depthTest], [true, true]);
  const l = inst.meshMats[4];   // by name, not its left-over _DstBlend 0
  assert.deepEqual([l.blendSrc, l.blendDst, l.uniforms.uPremul.value], [THREE.SrcAlphaFactor, THREE.OneMinusSrcAlphaFactor, false]);
  inst.dispose();
});

test('collision: particles flying into a plane turn back (× bounce, − dampen) and stay in front of it', async () => {
  // plane node at z = 1 with its +y turned to −z (x −90°): the particles fly +z from z = 0 at 2 / s
  const plane = node('plane', 0, { pos: [0, 0, 1], rot: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
  const co = { planes: [1], dampen: K(0.5), bounce: K(1), lifeLoss: K(0), minKill: 0, maxKill: 10000, radius: 1 };
  const { inst } = await make([node('t', -1), plane, node('p', 0, { ps: ps({ collide: co }) })]);
  const s = inst.systems[0];
  assert.equal(s.planes.length, 1);
  for (let k = 0; k < 20; k++) inst.update(0.05);   // 1 s: they reach the plane at ≈ 0.45 s
  assert.equal(s.n, 4);
  for (let i = 0; i < s.n; i++) {
    assert.ok(Math.abs(s.vel[i * 3 + 2] + 1) < 1e-4, `turned back at half speed: ${s.vel[i * 3 + 2]}`);
    assert.ok(s.pos[i * 3 + 2] < 1, `in front of the plane: ${s.pos[i * 3 + 2]}`);
  }
  inst.dispose();
});

test('collision: lifetime loss and kill speed end particles at the plane; without a plane node nothing collides', async () => {
  const plane = node('plane', 0, { pos: [0, 0, 1], rot: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
  const kill = { planes: [1], dampen: K(0), bounce: K(1), lifeLoss: K(0), minKill: 0, maxKill: 1, radius: 1 };
  const life = { planes: [1], dampen: K(0), bounce: K(1), lifeLoss: K(1), minKill: 0, maxKill: 10000, radius: 1 };
  const none = { planes: [9], dampen: K(0), bounce: K(1), lifeLoss: K(0), minKill: 0, maxKill: 1, radius: 1 };
  const { inst } = await make([node('t', -1), plane, node('a', 0, { ps: ps({ collide: kill }) }), node('b', 0, { ps: ps({ collide: life }) }),
    node('c', 0, { ps: ps({ collide: none }) })]);
  for (let k = 0; k < 20; k++) inst.update(0.05);
  assert.deepEqual(inst.systems.map((s) => s.n), [0, 0, 4]);
  inst.dispose();
});

test('inherit velocity: a world-space system\'s particles take the moving emitter\'s velocity × k at birth; a local one does not', async () => {
  const inh = { mode: 0, k: K(0.5) };
  const { inst } = await make([node('t', -1), node('w', 0, { ps: ps({ inherit: inh }, { space: 1, speed: 0, at: 0.1 }) }),
    node('l', 0, { ps: ps({ inherit: inh }, { space: 0, speed: 0, at: 0.1 }) })]);
  for (let k = 0; k < 3; k++) { inst.object.position.x += 0.5; inst.update(0.05); }   // the effect flies +x at 10 / s
  const [w, l] = inst.systems;
  assert.equal(w.n, 4);
  for (let i = 0; i < w.n; i++) assert.ok(Math.abs(w.vel[i * 3] - 5) < 1e-3, `10 × 0.5 along x: ${w.vel[i * 3]}`);
  for (let i = 0; i < l.n; i++) assert.equal(l.vel[i * 3], 0);
  inst.dispose();
});

test('limit velocity: the limit clamps VelocityOverLifetime too (패신저 T2\'s lightning); without a limit it runs free', async () => {
  // start speed 0, 5 / s along x over the life, limit 0.5 with dampen 1: the clamped ones stop at 0.5 / s
  const velOL = { x: K(5), y: K(0), z: K(0), world: false, radial: K(0), orbZ: K(0), speedMul: K(1) };
  const limit = { mag: K(0.5), dampen: 1, drag: K(0) };
  const { inst } = await make([node('t', -1), node('l', 0, { ps: ps({ velOL, limit }, { speed: 0 }) }),
    node('f', 0, { ps: ps({ velOL }, { speed: 0 }) })]);
  for (let k = 0; k < 20; k++) inst.update(0.05);   // 1 s
  const [l, f] = inst.systems;
  assert.equal(l.n, 4);
  for (let i = 0; i < l.n; i++) {
    assert.ok(Math.abs(l.pos[i * 3] - 0.5) < 1e-3, `0.5 / s for 1 s: ${l.pos[i * 3]}`);
    assert.ok(Math.abs(l.vel[i * 3] - 0.5) < 1e-4, `the drawn velocity is the clamped total: ${l.vel[i * 3]}`);
    assert.ok(Math.abs(f.pos[i * 3] - 5) < 1e-3, `5 / s for 1 s: ${f.pos[i * 3]}`);
  }
  inst.dispose();
});

test('size by speed: the curve at the speed\'s place in its range scales the drawn size', async () => {
  const sbs = { x: { m: 1, s: 1, c: [[0, 0, 1, 1], [1, 1, 1, 1]] }, range: [0, 10] };
  const { inst } = await make([node('t', -1), node('p', 0, { ps: ps({ sizeBySpeed: sbs }, { speed: 5, size: 0.4 }) })]);
  inst.update(0.05);
  const s = inst.systems[0];
  assert.equal(s.n, 4);
  const D = s.ib.array;
  for (let i = 0; i < s.n; i++) assert.ok(Math.abs(D[i * 28 + 3] - 0.2) < 1e-4, `0.4 × curve(5 / 10): ${D[i * 28 + 3]}`);
  inst.dispose();
});

test('extract: the modules and Default-Particle as read from the client (when extracted)', (t) => {
  const f = (b, n) => path.join(FX, b, `${n}.json`);
  const files = [f('bpipe', 'bpipe_skill_03_start_02_right'), f('mint', 'mint_skill_01_range'), f('blaze2', 'blaze2_skill_03_buff_02')];
  if (!files.every(existsSync)) { t.skip('no local effect extract'); return; }
  const [bp, mint, bl] = files.map((x) => JSON.parse(readFileSync(x, 'utf8')));
  const mods = (d, k) => d.nodes.filter((n) => n.ps?.mods?.[k]).map((n) => n.ps.mods[k]);
  const co = mods(bp, 'collide');
  assert.ok(co.length > 0, 'bagpipe S3 casings collide');
  for (const c of co) for (const k of c.planes) assert.ok(bp.nodes[k], 'a plane is a node of the prefab');
  assert.ok(mods(mint, 'sizeBySpeed').length > 0, 'mint S1 range stars: size by speed');
  const shaders = bl.nodes.filter((n) => n.ps).map((n) => bl.materials[n.ps.render.mat]?.shader);
  assert.ok(shaders.includes('Legacy Shaders/Particles/Alpha Blended Premultiply'), 'blaze2 S3 buff emits Default-Particle');
});

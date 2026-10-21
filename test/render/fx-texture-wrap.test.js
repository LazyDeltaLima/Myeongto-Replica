// test/render/fx-texture-wrap.test.js — the effect textures' Unity wrap modes (2026-10-22, docs/rules/fx.md 「텍스처 반복 방식」):
// tools/local-extract/fx_extract.py writes tex/wrap.json ({ file: [u, v] } for the textures that do not repeat) and
// render/fxplayer.js FxLibrary gives each texture its own mode. Before, every texture repeated: 烛煌 S3's flame (Clamp,
// tiled ×4 and scrolled along its pillar) covered the whole pillar instead of passing along it as one streak.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FX = path.join(ROOT, 'public/assets/local/fx');

async function lib(wrapOf) {
  const THREE = await import('../../public/vendor/three.module.js');
  const { FxLibrary } = await import('../../public/js/render/fxplayer.js');
  const l = new FxLibrary('/x/');
  l.loader = { load: () => new THREE.Texture() };
  l.wrapOf = wrapOf;
  return { THREE, l };
}

test('a texture takes its listed wrap per axis; an unlisted one repeats', async () => {
  const { THREE, l } = await lib({ 'c.webp': [1, 1], 'u.webp': [0, 1], 'm.webp': [2, 1], 'o.webp': [3, 0] });
  const c = l.texture('c.webp'), u = l.texture('u.webp'), m = l.texture('m.webp'), o = l.texture('o.webp'), r = l.texture('r.webp');
  assert.deepEqual([c.wrapS, c.wrapT], [THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping]);
  assert.deepEqual([u.wrapS, u.wrapT], [THREE.RepeatWrapping, THREE.ClampToEdgeWrapping]);
  assert.deepEqual([m.wrapS, m.wrapT], [THREE.MirroredRepeatWrapping, THREE.ClampToEdgeWrapping]);
  assert.deepEqual([o.wrapS, o.wrapT], [THREE.MirroredRepeatWrapping, THREE.RepeatWrapping]);
  assert.deepEqual([r.wrapS, r.wrapT], [THREE.RepeatWrapping, THREE.RepeatWrapping]);
});

test('without a wrap file every texture repeats, as before', async () => {
  const { l } = await lib(undefined);
  const prev = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  try {
    assert.deepEqual(await l.wraps(), {});
  } finally {
    globalThis.fetch = prev;
  }
});

test('extract: 烛煌 S3 flame texture is Clamp and its pillars draw it (when extracted)', (t) => {
  const wf = path.join(FX, 'tex/wrap.json'), hit = path.join(FX, 'blaze2/blaze2_skill_03_hit.json');
  if (!existsSync(wf) || !existsSync(hit)) { t.skip('no local effect extract'); return; }
  const wrap = JSON.parse(readFileSync(wf, 'utf8'));
  for (const v of Object.values(wrap)) assert.ok(Array.isArray(v) && v.length === 2 && (v[0] || v[1]), 'only non-repeating textures are listed');
  const def = JSON.parse(readFileSync(hit, 'utf8'));
  const img = def.materials['skill3_hit 4_503a5f25'].tex._MainTex.img;
  assert.deepEqual(wrap[img], [1, 1]);
});

test('uv tween: a map the client keeps to its fraction (protect*UV / an Advance\'s tweenRepeat) wraps into [0, 1); another grows', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const fxp = await import('../../public/js/render/fxplayer.js');
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
  const mat = { shader: 'Torappu/Particles/Disturb/Disturb Origin', tex: { _MainTex: { img: 'x.webp', tiling: [1, 1], offset: [0, 0] }, _DisturTex: { img: 'y.webp', tiling: [1, 1], offset: [0, 0] } }, floats: {}, colors: {} };
  const def = { name: 't', duration: 0, materials: { m: mat }, clips: [], geoms: new Proxy({}, { get: () => tri() }), lib: { texture: () => new THREE.Texture() },
    nodes: [node('t', -1), node('ring', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 }, uvt: { maps: [['_MainTex', 0.6, -0.4, 1], ['_DisturTex', 0.6, 0]] } })] };
  const inst = new fxp.FxInstance(def, { quality: 'high' });
  inst.update(2.5);
  const u = inst.meshMats[1].uniforms;
  assert.ok(Math.abs(u.uMainST.value.z - 0.5) < 1e-6, `main x frac(1.5) = 0.5: ${u.uMainST.value.z}`);
  assert.ok(Math.abs(u.uMainST.value.w - 0) < 1e-6, `main y frac(−1) = 0: ${u.uMainST.value.w}`);
  assert.ok(Math.abs(u.uDisturbST.value.z - 1.5) < 1e-6, `noise grows: ${u.uDisturbST.value.z}`);
  inst.dispose();
});

test('shader: the scroll terms take their fraction and the UVTween family its whole scrolled uv (client DXBC)', async () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');
  assert.match(src, /uv \+= fract\(uMainSpeed \* uTime\)/);
  assert.match(src, /if \(uFracUV\) uv = fract\(uv\)/);
  assert.match(src, /uFracUV: \{ value: disMode === 0 && tween \}/);
  assert.doesNotMatch(src, /[+] u(Main|Disturb|Dissolve)Speed \* uTime/);
});

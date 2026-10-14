// test/render/fx-uv-tween.test.js — texture flow the client drives outside the particle systems (render/fxplayer.js,
// 2026-10-14). FxUVTweener / FxUVTweenerAdvance move a renderer's texture offsets by 2 × speed per second (fx_extract.py
// `uvt`); Disturb Origin / Anchor name their noise _DisturTex (it was never read) and Anchor scrolls by _UVTween — without
// them about 400 materials stood still (스펙터 디 언체인드's 3×3 circle, 글래디아's water).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('../../public/vendor/three.module.js');
const fxp = await import('../../public/js/render/fxplayer.js');

const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
const tex = (offset = [0, 0]) => ({ img: 'x.webp', tiling: [1, 2], offset });
const tri = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); g.setIndex([0, 1, 2]); return g; };
const def = (mat, ring = {}, extra = {}) => ({ name: 't', duration: 0, materials: { m: mat }, clips: [], geoms: new Proxy({}, { get: () => tri() }),
  lib: { texture: () => new THREE.Texture() }, nodes: [node('t', -1), node('ring', 0, { mesh: { mesh: 'g', mat: 'm', order: 0 }, ...ring })], ...extra });
const origin = { shader: 'Torappu/Particles/Disturb/Disturb Origin', tex: { _MainTex: tex([0.25, 0]), _DisturTex: tex() },
  floats: { _IntensityU: 0.33, _IntensityV: 0.83 }, colors: { _MainColor: [0.27, 0.6, 1, 0.74] } };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

test('FxUVTweener: the main and second textures\' offsets grow by the extracted 2 × speed per second, from 0 without keepInitOffset', () => {
  const inst = new fxp.FxInstance(def(origin, { uvt: { maps: [['_MainTex', 0.2, 0.24], ['_DisturTex', 0.04, 0.1]] } }), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  inst.update(1.5);
  near(u.uMainST.value.z, 0.3, 'main x'); near(u.uMainST.value.w, 0.36, 'main y');
  near(u.uMainST.value.x, 1, 'tiling kept'); near(u.uMainST.value.y, 2, 'tiling kept');
  near(u.uDisturbST.value.z, 0.06, 'noise x'); near(u.uDisturbST.value.w, 0.15, 'noise y');
  inst.dispose();
});

test('FxUVTweener: keepInitOffset starts from the material\'s offset; an Advance without tweenRepeat stops at tweenAnmTime', () => {
  const keep = new fxp.FxInstance(def(origin, { uvt: { maps: [['_MainTex', 0.2, 0]], keep: 1 } }), { quality: 'high' });
  keep.update(1);
  near(keep.meshMats[1].uniforms.uMainST.value.z, 0.45, 'from 0.25');
  const once = new fxp.FxInstance(def(origin, { uvt: { maps: [['_MainTex', 0.2, 0]], until: 0.5 } }), { quality: 'high' });
  once.update(2);
  near(once.meshMats[1].uniforms.uMainST.value.z, 0.1, 'stopped at 0.5 s');
  keep.dispose(); once.dispose();
});

test('FxUVTweener: a texture the material lacks is not touched, and a clip track on the same texture takes it over', () => {
  const none = new fxp.FxInstance(def(origin, { uvt: { maps: [['_DissolveTex', 1, 1]] } }), { quality: 'high' });
  none.update(1);
  assert.equal(none.meshMats[1].userData.uvt, undefined);
  // a clip that writes _MainTex_ST.z (the Animator's property block wins over the material the script moves)
  const seg = [[-3.4e38, 0, 0, 0, 0.5], [0, 0, 0, 0, 0.5], [1, 0, 0, 0, 0.5]];
  const clip = { name: 'c', len: 1, loop: true, tracks: [{ node: 1, prop: 'mat:_MainTex_ST.z', type: 22, curves: [seg] }] };
  const clipped = new fxp.FxInstance(def(origin, { uvt: { maps: [['_MainTex', 1, 1]] } }, { clips: [clip] }), { quality: 'high' });
  clipped.update(0.5);
  const st = clipped.meshMats[1].uniforms.uMainST.value;
  near(st.z, 0.5, 'the clip value'); near(st.w, 0, 'the y offset is the clip-less material\'s, unmoved');
  none.dispose(); clipped.dispose();
});

test('Disturb Origin: its _DisturTex noise is read, before the main tiling, and the colour takes _MainColor.a once more', () => {
  const inst = new fxp.FxInstance(def(origin), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  assert.equal(u.uHasDisturb.value, true);
  assert.equal(u.uDisMode.value, 1);
  assert.equal(u.uACtrl.value, 1);
  near(u.uDisturbStr.value.x, 0.33, 'IntensityU'); near(u.uDisturbStr.value.y, 0.83, 'IntensityV');
  near(u.uDisAnchor.value.x, 0, 'no anchor');
  inst.dispose();
});

test('Disturb Anchor: _UVTween scrolls the main (xy) and noise (zw) uv, the anchors centre the noise, the toggles / _WEIGHT_ON switch the extras', () => {
  const anchor = { shader: 'Torappu/Particles/Disturb/Disturb Anchor', keywords: ['_WEIGHT_ON'],
    tex: { _MainTex: tex(), _DisturTex: tex(), _DisturTex_02: tex(), _WeightTex: tex(), _DissolveTex: tex() },
    floats: { _IntensityU: 0.1, _IntensityV: 0.2, _AnchorU: 0.5, _AnchorV: 0.4, _MainColorACtrl: 1, _ToggleUseDisturb2: 1, _IntensityU_02: 0.3,
      _AnchorU_02: 0.5, _ToggleUseDissolve: 0 },
    colors: { _MainColor: [1, 1, 1, 1], _UVTween: [0.1, -0.2, 0.3, 0.4] } };
  const inst = new fxp.FxInstance(def(anchor), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  assert.equal(u.uDisMode.value, 2);
  near(u.uMainSpeed.value.x, 0.1, 'main u'); near(u.uMainSpeed.value.y, -0.2, 'main v');
  near(u.uDisturbSpeed.value.x, 0.3, 'noise u'); near(u.uDisturbSpeed.value.y, 0.4, 'noise v');
  near(u.uDisAnchor.value.x, 0.5, 'anchor u'); near(u.uDisAnchor.value.y, 0.4, 'anchor v');
  assert.equal(u.uHasDisturb.value, true, 'the first noise always');
  assert.equal(u.uHasDisturb2.value, true); near(u.uDisturb2Str.value.x, 0.3, 'IntensityU_02');
  assert.equal(u.uHasWeight.value, true);
  assert.equal(u.uHasDissolve.value, false, '_ToggleUseDissolve 0');
  near(u.uACtrl.value, 1, 'ACtrl');
  const off = new fxp.FxInstance(def({ ...anchor, keywords: null, floats: { ...anchor.floats, _ToggleUseDisturb2: 0 } }), { quality: 'high' });
  assert.equal(off.meshMats[1].uniforms.uHasDisturb2.value, false);
  assert.equal(off.meshMats[1].uniforms.uHasWeight.value, false);
  inst.dispose(); off.dispose();
});

test('the other shaders keep their old distortion path', () => {
  const custom = { shader: 'Torappu/Particles/Disturb/Disturb(CustomData)', tex: { _MainTex: tex(), _DisturbTex: tex() }, floats: {}, colors: {} };
  const inst = new fxp.FxInstance(def(custom), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  assert.equal(u.uDisMode.value, 0);
  assert.equal(u.uACtrl.value, 0);
  assert.equal(u.uHasDisturb.value, true);
  inst.dispose();
});

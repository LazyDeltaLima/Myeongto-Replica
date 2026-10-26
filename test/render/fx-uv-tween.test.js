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

test('Dissolve AB / Add UVTween: _UVTween scrolls the main (xy) and dissolve (zw) uv; elsewhere _UVTween and the U·V speeds are leftovers', () => {
  const uvtw = (kind) => ({ shader: `Torappu/Particles/Dissolve/Dissolve ${kind} UVTween`, tex: { _MainTex: tex(), _DissolveTex: tex() },
    floats: { _Amount: 0.2, _BorderWidth: 0.3, _MainUSpeed: 5 }, colors: { _TintColor: [0.5, 0.5, 0.5, 0.5], _UVTween: [0.5, -0.25, 0.1, 0.2] } });
  for (const kind of ['AB', 'Add']) {
    const inst = new fxp.FxInstance(def(uvtw(kind)), { quality: 'high' });
    const u = inst.meshMats[1].uniforms;
    near(u.uMainSpeed.value.x, 0.5, `${kind} main u`); near(u.uMainSpeed.value.y, -0.25, `${kind} main v`);
    near(u.uDissolveSpeed.value.x, 0.1, `${kind} dissolve u`); near(u.uDissolveSpeed.value.y, 0.2, `${kind} dissolve v`);
    inst.update(2);
    near(u.uTime.value, 2, 'the shader clock runs');
    inst.dispose();
  }
  // the client's Additive / AlphaBlend declare _TintColor / _MainTex only: a leftover _UVTween or _MainUSpeed moves nothing
  const plain = new fxp.FxInstance(def({ shader: 'Torappu/Particles/Additive', tex: { _MainTex: tex() }, floats: { _MainUSpeed: 0.7, _DissolveVSpeed: 1 },
    colors: { _UVTween: [1, 1, 1, 1] } }), { quality: 'high' });
  const p = plain.meshMats[1].uniforms;
  near(p.uMainSpeed.value.x, 0, 'no main speed'); near(p.uDissolveSpeed.value.y, 0, 'no dissolve speed');
  // the (CustomData) family declares them
  const custom = new fxp.FxInstance(def({ shader: 'Torappu/Particles/Dissolve/Dissolve(CustomData)', tex: { _MainTex: tex() }, floats: { _MainUSpeed: 0.7 }, colors: {} }), { quality: 'high' });
  near(custom.meshMats[1].uniforms.uMainSpeed.value.x, 0.7, 'CustomData main speed');
  plain.dispose(); custom.dispose();
});

test('Mask (AlphaBlend): _AddTex is added through its own _AddTex_ST, and its clip scrolls that', () => {
  const mask = { shader: 'Torappu/Particles/Mask/Mask (AlphaBlend)', tex: { _MainTex: tex(), _MaskTex: tex(), _AddTex: tex() },
    floats: { _AddFactor: 0.5 }, colors: { _TintColor: [1, 0.2, 0, 1] } };
  const seg = [[-3.4e38, 0, 0, 0, 0], [0, 0, 0, 2 / 3, 0], [3, 0, 0, 0, 2]];
  const clip = { name: 'c', len: 3, loop: true, tracks: [{ node: 1, prop: 'mat:_AddTex_ST.z', type: 22, curves: [seg] }] };
  const inst = new fxp.FxInstance(def(mask, {}, { clips: [clip] }), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  assert.equal(u.uHasAdd.value, true);
  near(u.uAddFactor.value, 0.5, 'AddFactor');
  inst.update(1.5);
  near(u.uAddST.value.z, 1, 'scrolled by the clip');
  const plain = new fxp.FxInstance(def({ shader: 'Torappu/Particles/AlphaBlend', tex: { _MainTex: tex(), _AddTex: tex() }, floats: {}, colors: {} }), { quality: 'high' });
  assert.equal(plain.meshMats[1].uniforms.uHasAdd.value, false, 'only the Mask shader adds');
  inst.dispose(); plain.dispose();
});

test('clip tracks on _IntensityU/V, _AnchorU/V, _RimPower and the Double family\'s _DissolveTex_02_ST drive their uniforms', () => {
  const anchor = { shader: 'Torappu/Particles/Disturb/Disturb Anchor', tex: { _MainTex: tex(), _DisturTex: tex() }, floats: { _IntensityU: 0.1 }, colors: {} };
  const flat = (v) => [[[-3.4e38, 0, 0, 0, v], [0, 0, 0, 0, v], [1, 0, 0, 0, v]]];
  const tracks = (props) => ({ name: 'c', len: 1, loop: true, tracks: Object.entries(props).map(([prop, v]) => ({ node: 1, prop: `mat:${prop}`, type: 22, curves: flat(v) })) });
  const a = new fxp.FxInstance(def(anchor, {}, { clips: [tracks({ _IntensityU: 0.6, _IntensityV: 0.7, _AnchorU: 0.2, _AnchorV: 0.3 })] }), { quality: 'high' });
  a.update(0.5);
  const u = a.meshMats[1].uniforms;
  near(u.uDisturbStr.value.x, 0.6, 'IntensityU'); near(u.uDisturbStr.value.y, 0.7, 'IntensityV');
  near(u.uDisAnchor.value.x, 0.2, 'AnchorU'); near(u.uDisAnchor.value.y, 0.3, 'AnchorV');
  const o = new fxp.FxInstance(def(origin, {}, { clips: [tracks({ _AnchorU: 0.2 })] }), { quality: 'high' });
  o.update(0.5);
  near(o.meshMats[1].uniforms.uDisAnchor.value.x, 0, 'Disturb Origin has no anchor');
  const dbl = { shader: 'Torappu/Particles/Dissolve/Dissolve Add Double', tex: { _MainTex: tex(), _DissolveTex_01: tex(), _DissolveTex_02: tex() }, floats: {}, colors: {} };
  const d = new fxp.FxInstance(def(dbl, {}, { clips: [tracks({ '_DissolveTex_02_ST.z': 0.4 })] }), { quality: 'high' });
  d.update(0.5);
  near(d.meshMats[1].uniforms.uDissolve2ST.value.z, 0.4, 'second dissolve offset');
  const rim = { shader: 'Torappu/Particles/Rim/Rim Texture (Add)', tex: { _MainTex: tex() }, floats: { _RimPower: 1 }, colors: {} };
  const r = new fxp.FxInstance(def(rim, {}, { clips: [tracks({ _RimPower: 3 })] }), { quality: 'high' });
  r.update(0.5);
  near(r.meshMats[1].uniforms.uRimPower.value, 3, 'RimPower');
  a.dispose(); o.dispose(); d.dispose(); r.dispose();
});

test('FxUVRotation: a Disturb(CustomData) material gets its _Rotation0..3 = (cos, −sin, sin, cos) per angle; other shaders ignore it', () => {
  const cd = { shader: 'Torappu/Particles/Ram/Disturb(CustomData)', tex: { _MainTex: tex(), _RamTex: tex() }, floats: {}, colors: {} };
  const inst = new fxp.FxInstance(def(cd, { uvr: [-90, 0, 45, 0] }), { quality: 'high' });
  const u = inst.meshMats[1].uniforms;
  assert.equal(u.uUVRot.value, true);
  const r = u.uRot.value;
  near(r[0].x, 0, 'cos −90°'); near(r[0].y, 1, '−sin −90°'); near(r[0].z, -1, 'sin −90°'); near(r[0].w, 0, 'cos');
  near(r[1].x, 1, 'off: identity'); near(r[1].w, 1, 'off: identity');
  near(r[2].x, Math.SQRT1_2, '45°'); near(r[2].z, Math.SQRT1_2, '45°');
  const other = new fxp.FxInstance(def(origin, { uvr: [90, 0, 0, 0] }), { quality: 'high' });
  assert.equal(other.meshMats[1].uniforms.uUVRot.value, false, 'Disturb Origin has no _HG_UV_ROTATION branch');
  inst.dispose(); other.dispose();
});

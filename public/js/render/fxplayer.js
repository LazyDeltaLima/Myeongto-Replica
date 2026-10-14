// render/fxplayer.js — official battle effects (local patch, docs/LOCAL-PATCH.md): plays the effect prefabs that
// tools/local-extract/fx_extract.py exported from a local client (public/assets/local/fx/**) in a three.js scene that
// uses the battlefield camera (render/projection.js — Arknights' own 30° / 40° camera, so the effects keep their framing).
//
// An effect = a node tree (Unity transforms) with particle systems, plain meshes and its Mecanim clips. The whole tree is
// simulated in Unity's battle frame (x = col, y = row, z = −height) under a root that mirrors z, so every module keeps
// Unity's own semantics (shapes, alignments, euler order ZXY) and the scene sees board coordinates.
//
// Subset of Unity's particle system: start values (constant / curve / random two curves / random two constants), rate
// and bursts, shapes (sphere, hemisphere, cone, box, circle, edge, rectangle, donut), velocity / force / limit velocity /
// noise (cheap), color / size / rotation over lifetime, texture sheet frames, custom data (two vec4 streams), local or
// world simulation; renderers billboard / stretched / horizontal / vertical / mesh. Not drawn: trails, sub emitters,
// collisions. Shaders: one uber shader standing in for the Torappu particle shaders (main texture with UV scroll,
// distortion, dissolve with edge, colour ramp, the material's blend factors); the renderers' FxUVTweener scripts move their
// textures' offsets (uvTween, 2026-10-14).
//
// Cost control (DESIGN §17.3 rules): one draw call per particle system (instanced, skipped while it has no particle),
// particle arrays preallocated and reused, no per-frame allocation, curves flattened to typed arrays at load, a
// system's instance data in one interleaved buffer (one upload, by the used range), trail strips uploaded by the used
// range, a global particle budget per quality ('high' 6000 / 'medium' 2500 / 'low' 0 = the procedural FX only),
// emission scaled by quality, at most PLAYER_CAP effects alive (the oldest is ended; an ended instance reports
// done — render/fxgame.js keeps its own caps per kind below it: MAX_INSTANCES short, MAX_LASTING lasting), textures
// and meshes shared. A speed-up must not change the picture: bench/fx/compare.mjs renders every effect with the git
// version and the working file and compares the pixels.
//
//   const lib = new FxLibrary('/assets/local/fx/');  const def = await lib.load('chen3', 'chen3_skill_01_start_01');
//   const fx = new FxInstance(def, { quality });  scene.add(fx.object);  fx.object.position.set(col, row, 0);
//   each frame: fx.update(dtSeconds, camera);  if (fx.done) { scene.remove(fx.object); fx.dispose(); }

import * as THREE from '../../vendor/three.module.js';
import { faceTurn } from './fx/face.js';

export const QUALITY = Object.freeze({
  high: { budget: 6000, emission: 1 },
  medium: { budget: 2500, emission: 0.6 },
  low: { budget: 0, emission: 0 },
});
/** Short effects (hits, casts, trails) alive at once — render/fxgame.js trimLive ends the oldest past it. */
export const MAX_INSTANCES = 24;
/** Lasting effects (buff loops, skill walls / zones: render/fxgame.js isLasting) alive at once besides them (2026-10-10:
 * 余 S3's wall alone is 2 per tile + 2 ends — 44 across the boss field). */
export const MAX_LASTING = 48;
/** The player's own backstop over every instance (a caller without its own cap, or two views at once). */
const PLAYER_CAP = MAX_INSTANCES + MAX_LASTING + 8;
const GRAVITY = new THREE.Vector3(0, 0, 9.81); // Unity battle frame: +z is down (z = −height)
/** Particle systems alive (registered by their constructor, removed by dispose). */
const systems = new Set();
/** Particles of the registered systems, kept by emit / kill / dispose (summing every system on each emit call was 12% of
 *  the player's CPU in a crowded scene). */
let liveParticles = 0;

// ---------------------------------------------------------------- curves

/** Hermite AnimationCurve [[t, v, in, out]…] at t. */
export function evalCurve(keys, t) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1;
  while (i < n && keys[i][0] < t) i++;
  const a = keys[i - 1], b = keys[i];
  const dt = b[0] - a[0];
  if (dt <= 0) return b[1];
  const s = (t - a[0]) / dt;
  const out = Number.isFinite(a[3]) ? a[3] : 0, inn = Number.isFinite(b[2]) ? b[2] : 0;
  if (!Number.isFinite(a[3]) || !Number.isFinite(b[2])) return a[1]; // stepped key
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a[1] + (s3 - 2 * s2 + s) * dt * out + (-2 * s3 + 3 * s2) * b[1] + (s3 - s2) * dt * inn;
}

// Curves and gradients are flattened into Float64Arrays when an effect is loaded (prepareCurves): the per-particle
// evaluations read one typed array instead of nested key arrays. The arithmetic and its order are the ones of evalCurve /
// evalGradient, so the results are the same numbers.

/** Keys [[t, v, in, out]…] → [n, t0, v0, in0, out0, t1, …]; a missing or non-finite tangent becomes NaN (a stepped key). */
function flatKeys(keys) {
  const f = new Float64Array(1 + keys.length * 4);
  f[0] = keys.length;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], o = 1 + i * 4;
    f[o] = k[0]; f[o + 1] = k[1];
    f[o + 2] = Number.isFinite(k[2]) ? k[2] : NaN; f[o + 3] = Number.isFinite(k[3]) ? k[3] : NaN;
  }
  return f;
}

/** evalCurve over flatKeys data. */
function evalFlat(f, t) {
  const n = f[0];
  if (!n) return 0;
  if (t <= f[1]) return f[2];
  const z = 1 + (n - 1) * 4;
  if (t >= f[z]) return f[z + 1];
  let i = 1;
  while (i < n && f[1 + i * 4] < t) i++;
  const a = 1 + (i - 1) * 4, b = a + 4;
  const dt = f[b] - f[a];
  if (dt <= 0) return f[b + 1];
  const s = (t - f[a]) / dt;
  const out = f[a + 3], inn = f[b + 2];
  if (!Number.isFinite(out) || !Number.isFinite(inn)) return f[a + 1]; // stepped key
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * f[a + 1] + (s3 - 2 * s2 + s) * dt * out + (-2 * s3 + 3 * s2) * f[b + 1] + (s3 - s2) * dt * inn;
}

/** Gradient keys [[t, …w values]…] → [n, t0, …, t1, …]. */
function flatGradKeys(keys, w) {
  const f = new Float64Array(1 + keys.length * w);
  f[0] = keys.length;
  for (let i = 0; i < keys.length; i++) for (let k = 0; k < w; k++) f[1 + i * w + k] = keys[i][k];
  return f;
}

const isKeyList = (a) => Array.isArray(a) && Array.isArray(a[0]);

/** Attach the flat forms to every MinMaxCurve ({m, s, c?, d?}: cf / df) and Gradient ({c, a, mode}: cf / af) below o. */
function prepareCurves(o) {
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { for (const x of o) prepareCurves(x); return; }
  if (typeof o.m === 'number' && 's' in o) {
    if (Array.isArray(o.c)) o.cf = flatKeys(o.c);
    if (Array.isArray(o.d)) o.df = flatKeys(o.d);
  } else if (isKeyList(o.c) && isKeyList(o.a) && 'mode' in o) {
    o.cf = flatGradKeys(o.c, 4); o.af = flatGradKeys(o.a, 2);
  }
  for (const k in o) if (k !== 'cf' && k !== 'df' && k !== 'af') prepareCurves(o[k]);
}

/** MinMaxCurve {m, s, n?, c?, d?} at normalized time t with the particle's random r. */
export function evalMM(mm, t, r) {
  if (!mm) return 0;
  switch (mm.m) {
    case 1: return mm.s * (mm.cf ? evalFlat(mm.cf, t) : evalCurve(mm.c, t));
    case 2: {
      const a = mm.df ? evalFlat(mm.df, t) : evalCurve(mm.d, t), b = mm.cf ? evalFlat(mm.cf, t) : evalCurve(mm.c, t);
      return mm.s * (a + (b - a) * r);
    }
    case 3: return mm.n + (mm.s - mm.n) * r;
    default: return mm.s;
  }
}

/** evalGradient over the flat colour / alpha keys. */
function evalGradientFlat(g, t, out) {
  const c = g.cf, a = g.af, nc = c[0], na = a[0];
  if (t <= c[1]) { out[0] = c[2]; out[1] = c[3]; out[2] = c[4]; } else {
    const z = 1 + (nc - 1) * 4;
    if (t >= c[z]) { out[0] = c[z + 1]; out[1] = c[z + 2]; out[2] = c[z + 3]; } else {
      let i = 1;
      while (i < nc && c[1 + i * 4] < t) i++;
      const p = 1 + (i - 1) * 4, q = p + 4, s = g.mode === 1 ? 1 : (t - c[p]) / Math.max(1e-6, c[q] - c[p]);
      out[0] = c[p + 1] + (c[q + 1] - c[p + 1]) * s; out[1] = c[p + 2] + (c[q + 2] - c[p + 2]) * s; out[2] = c[p + 3] + (c[q + 3] - c[p + 3]) * s;
    }
  }
  if (t <= a[1]) out[3] = a[2]; else {
    const z = 1 + (na - 1) * 2;
    if (t >= a[z]) out[3] = a[z + 1]; else {
      let i = 1;
      while (i < na && a[1 + i * 2] < t) i++;
      const p = 1 + (i - 1) * 2, q = p + 2, s = g.mode === 1 ? 1 : (t - a[p]) / Math.max(1e-6, a[q] - a[p]);
      out[3] = a[p + 1] + (a[q + 1] - a[p + 1]) * s;
    }
  }
  return out;
}

function evalGradient(g, t, out) {
  if (g.cf) return evalGradientFlat(g, t, out);
  const c = g.c, a = g.a;
  let i = 1;
  if (t <= c[0][0]) { out[0] = c[0][1]; out[1] = c[0][2]; out[2] = c[0][3]; } else if (t >= c[c.length - 1][0]) {
    const k = c[c.length - 1]; out[0] = k[1]; out[1] = k[2]; out[2] = k[3];
  } else {
    while (i < c.length && c[i][0] < t) i++;
    const p = c[i - 1], q = c[i], s = g.mode === 1 ? 1 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
    out[0] = p[1] + (q[1] - p[1]) * s; out[1] = p[2] + (q[2] - p[2]) * s; out[2] = p[3] + (q[3] - p[3]) * s;
  }
  if (t <= a[0][0]) out[3] = a[0][1]; else if (t >= a[a.length - 1][0]) out[3] = a[a.length - 1][1]; else {
    i = 1;
    while (i < a.length && a[i][0] < t) i++;
    const p = a[i - 1], q = a[i], s = g.mode === 1 ? 1 : (t - p[0]) / Math.max(1e-6, q[0] - p[0]);
    out[3] = p[1] + (q[1] - p[1]) * s;
  }
  return out;
}

const gradA = [0, 0, 0, 0], gradB = [0, 0, 0, 0];   // evalMG mode 3 (random between two gradients)

/** MinMaxGradient at t with random r → out [r, g, b, a]. */
export function evalMG(mg, t, r, out) {
  if (!mg) { out[0] = out[1] = out[2] = out[3] = 1; return out; }
  switch (mg.m) {
    case 1: return evalGradient(mg.g, t, out);
    case 2: for (let k = 0; k < 4; k++) out[k] = mg.b[k] + (mg.a[k] - mg.b[k]) * r; return out;
    case 3: {
      const a = evalGradient(mg.h, t, gradA), b = evalGradient(mg.g, t, gradB);
      for (let k = 0; k < 4; k++) out[k] = a[k] + (b[k] - a[k]) * r;
      return out;
    }
    case 4: return evalGradient(mg.g, r, out);
    default: out[0] = mg.a[0]; out[1] = mg.a[1]; out[2] = mg.a[2]; out[3] = mg.a[3]; return out;
  }
}

/** Mecanim streamed key list [[t, c0, c1, c2, c3]…] at t. */
function evalClipCurve(keys, t) {
  if (!keys || !keys.length) return 0;
  let k = keys[0];
  for (let i = 1; i < keys.length && keys[i][0] <= t; i++) k = keys[i];
  const dt = Math.max(0, t - k[0]);
  return ((k[1] * dt + k[2]) * dt + k[3]) * dt + k[4];
}

// ---------------------------------------------------------------- shader

const BLEND = { 0: THREE.ZeroFactor, 1: THREE.OneFactor, 2: THREE.DstColorFactor, 3: THREE.SrcColorFactor,
  4: THREE.OneMinusDstColorFactor, 5: THREE.SrcAlphaFactor, 6: THREE.OneMinusSrcColorFactor, 7: THREE.DstAlphaFactor,
  8: THREE.OneMinusDstAlphaFactor, 9: THREE.SrcAlphaSaturateFactor, 10: THREE.OneMinusSrcAlphaFactor };

const VERT = /* glsl; i18n-ignore: the Chinese is in shader comments */`
  attribute vec3 iPos; attribute vec3 iSize; attribute vec3 iRot; attribute vec4 iColor; attribute vec4 iC1; attribute vec4 iC2;
  attribute vec4 iUV; attribute vec3 iVel;
  attribute vec4 vcol; uniform bool uVCol; uniform bool uRim;
  uniform int uMode; uniform float uLengthScale; uniform float uVelScale; uniform int uAlign; uniform vec2 uPivot;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  // local patch: vH = the board height (scene z) of the fragment — what lies under the floor is cut (FRAG uFloor; the
  // official map's opaque ground hides it by depth); vN / vVP = view-space normal / position of a mesh (the Rim shaders)
  varying float vH; varying vec3 vN; varying vec3 vVP;
  // the scene height of a view-space offset (the camera has no scale: the inverse view rotation is its transpose)
  float hOfView(vec3 off) { return (vec4(off, 0.0) * viewMatrix).z; }
  // 2026-10-14: a SkinnedMeshRenderer (THREE.SkinnedMesh: three defines USE_SKINNING and binds the bone texture)
  #include <skinning_pars_vertex>
  mat3 rotZXY(vec3 e) {  // Unity euler order: Z, then X, then Y (applied to column vectors as Ry * Rx * Rz)
    float cx = cos(e.x), sx = sin(e.x), cy = cos(e.y), sy = sin(e.y), cz = cos(e.z), sz = sin(e.z);
    mat3 rx = mat3(1., 0., 0., 0., cx, sx, 0., -sx, cx);
    mat3 ry = mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy);
    mat3 rz = mat3(cz, sz, 0., -sz, cz, 0., 0., 0., 1.);
    return ry * rx * rz;
  }
  void main() {
    vUv = iUV.xy + uv * iUV.zw; vColor = iColor * (uVCol ? vcol : vec4(1.0)); vC1 = iC1; vC2 = iC2;  // local patch: mesh vertex colours
    vN = vec3(0.0, 0.0, 1.0); vVP = vec3(0.0, 0.0, -1.0);
    if (uMode == 6) {                       // trail strip: camera-facing ribbon, iVel = tangent, iRot.x = side, iSize.x = width
      vec4 cv = modelViewMatrix * vec4(position, 1.0);
      vec3 tv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = length(tv.xy) > 1e-6 ? normalize(tv.xy) : vec2(1.0, 0.0);
      vec2 so = vec2(-d.y, d.x) * iRot.x * iSize.x * 0.5;
      cv.xy += so;
      vH = (modelMatrix * vec4(position, 1.0)).z + hOfView(vec3(so, 0.0));
      gl_Position = projectionMatrix * cv;
      return;
    }
    if (uMode == 4) {                       // mesh particle (Unity rotates by -angle around z for 2D rotation)
      mat3 rm = rotZXY(vec3(iRot.x, iRot.y, -iRot.z));
      vec3 transformed = position;
      #include <skinbase_vertex>
      #include <skinning_vertex>
      vec3 p = rm * (transformed * iSize);
      vH = (modelMatrix * vec4(iPos + p, 1.0)).z;
      if (uRim) { vN = normalMatrix * (rm * (normal / max(abs(iSize), vec3(1e-4)))); vVP = (modelViewMatrix * vec4(iPos + p, 1.0)).xyz; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + p, 1.0);
      return;
    }
    // quad corner, -0.5..0.5; local patch: + the renderer's pivot (m_Pivot, in particle sizes) when the instance asks for it
    // (FxInstance opts.pivot, default on): the quad's centre sits pivot x size from the particle, turned with it (elite glow bao: pivot x
    // .95 at rotation -90 deg, its gold band runs from the feet back behind the unit, official recording 2026-10-08;
    // [ASSUMED] the sign: + puts that band behind the unit as recorded, - would put it in front of the feet).
    // Billboards / aligned / horizontal quads only (stretched and mesh particles: not yet)
    vec2 c = (position.xy + uPivot) * iSize.xy;
    float cr = cos(-iRot.z), sr = sin(-iRot.z);
    if (uMode == 1) {                       // stretched billboard: along the view-space velocity
      vec4 cv = modelViewMatrix * vec4(iPos, 1.0);
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = length(vv.xy) > 1e-5 ? normalize(vv.xy) : vec2(1.0, 0.0);
      // local patch (maintainer video 2026-10-07, 锏 S3: long thin slash lines): the length is the size's y × lengthScale, the
      // width its x (3D start size 0.15 × 3.6 drew short fat petals the other way round); equal for a uniform size
      float len = iSize.y * uLengthScale + length(iVel) * uVelScale;
      vec2 off = d * (position.x * len) + vec2(-d.y, d.x) * (position.y * iSize.x);
      vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(vec3(off, 0.0));
      gl_Position = projectionMatrix * vec4(cv.xyz + vec3(off, 0.0), 1.0);
      return;
    }
    vec2 rc = vec2(c.x * cr - c.y * sr, c.x * sr + c.y * cr);
    if (uMode == 2 || (uMode == 0 && (uAlign == 1 || uAlign == 2))) {
      // horizontal billboard (Unity: in the world XZ plane) / world- or local-aligned quad (XY plane of that space)
      vec3 p = uMode == 2 ? vec3(rc.x, 0.0, rc.y) : vec3(rc, 0.0);
      vH = (modelMatrix * vec4(iPos + p, 1.0)).z;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + p, 1.0);
      return;
    }
    vec4 cv = modelViewMatrix * vec4(iPos, 1.0);   // camera-facing (vertical billboards approximated)
    vH = (modelMatrix * vec4(iPos, 1.0)).z + hOfView(vec3(rc, 0.0));
    gl_Position = projectionMatrix * vec4(cv.xyz + vec3(rc, 0.0), 1.0);
  }`;

const FRAG = /* glsl; i18n-ignore: the Chinese is in shader comments */`
  uniform sampler2D uMain; uniform vec4 uMainST; uniform vec2 uMainSpeed; uniform vec4 uTint; uniform float uOpacity;
  uniform bool uHasDisturb; uniform sampler2D uDisturb; uniform vec4 uDisturbST; uniform vec2 uDisturbSpeed; uniform vec2 uDisturbStr;
  uniform float uDisturbMain; uniform float uDisturbDissolve;
  uniform bool uHasDissolve; uniform sampler2D uDissolve; uniform vec4 uDissolveST; uniform vec2 uDissolveSpeed;
  uniform float uAmount; uniform float uBorder; uniform bool uVCMajor;
  uniform bool uHasDissolve2; uniform sampler2D uDissolve2; uniform vec4 uDissolve2ST; uniform float uAmount2; uniform float uBorder2;
  uniform bool uRim; uniform float uRimPower; uniform float uFloor;
  varying float vH; varying vec3 vN; varying vec3 vVP;
  uniform bool uHasRam; uniform sampler2D uRam; uniform vec4 uRamST; uniform bool uCustom; uniform float uTime; uniform bool uAdditive;
  uniform int uDisMode; uniform vec2 uDisAnchor; uniform float uACtrl;
  uniform bool uHasDisturb2; uniform sampler2D uDisturb2; uniform vec4 uDisturb2ST; uniform vec2 uDisturb2Str; uniform vec2 uDisturb2Anchor;
  uniform bool uHasWeight; uniform sampler2D uWeight; uniform vec4 uWeightST;
  uniform bool uHasAdd; uniform sampler2D uAdd; uniform vec4 uAddST; uniform sampler2D uMask; uniform float uAddFactor;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  void main() {
    if (vH < uFloor) discard;   // local patch: under the floor (FxInstance opts.floor)
    vec2 dis = vec2(0.0);
    vec2 uv;
    if (uDisMode == 0) {
      uv = vUv * uMainST.xy + uMainST.zw + uMainSpeed * uTime;
      // custom data (Torappu (CustomData) shaders, streams Custom1XYZW + Custom2XYZW): custom1.xy = main uv offset,
      // custom1.zw = extra distortion, custom2.x = dissolve amount — [ASSUMED] from the curves, tuned by eye
      if (uCustom) uv += vC1.xy;
      if (uHasDisturb) {
        vec2 duv = vUv * uDisturbST.xy + uDisturbST.zw + uDisturbSpeed * uTime;
        // local patch (client DXBC): the noise's red channel times the strength, not centred
        vec2 n = vec2(texture2D(uDisturb, duv).r);
        dis = n * (uDisturbStr + (uCustom ? vC1.zw : vec2(0.0)));
        uv += dis * uDisturbMain;
      }
    } else {
      // 2026-10-14 (client DXBC): Disturb Origin (1) / Disturb Anchor (2) — the noise (.r − _Anchor, × the _WEIGHT_ON weight
      // texture's rg; Anchor's second noise when _ToggleUseDisturb2) × _Intensity moves the renderer's own uv before the
      // main texture's tiling / offset; Anchor scrolls the main uv by _UVTween.xy and the noise uv by .zw (uMainSpeed /
      // uDisturbSpeed)
      if (uHasDisturb) {
        vec2 n = vec2(texture2D(uDisturb, vUv * uDisturbST.xy + uDisturbST.zw + uDisturbSpeed * uTime).r) - uDisAnchor;
        vec2 n2 = uHasDisturb2 ? vec2(texture2D(uDisturb2, vUv * uDisturb2ST.xy + uDisturb2ST.zw).r) - uDisturb2Anchor : vec2(0.0);
        if (uHasWeight) { vec2 w = texture2D(uWeight, vUv * uWeightST.xy + uWeightST.zw).rg; n *= w; n2 *= w; }
        dis = n * uDisturbStr + n2 * uDisturb2Str;
      }
      uv = (vUv + dis) * uMainST.xy + uMainST.zw + uMainSpeed * uTime;
    }
    vec4 tex = texture2D(uMain, uv);
    // 2026-10-14 (client DXBC): Mask (AlphaBlend) — main + 2 · _AddFactor · _AddTex(own uv) · _MaskTex.a(main uv)
    if (uHasAdd) tex += 2.0 * uAddFactor * texture2D(uAdd, vUv * uAddST.xy + uAddST.zw) * texture2D(uMask, uv).a;
    vec4 col = tex * uTint * vColor;
    // 2026-10-14 (client DXBC): Disturb Origin multiplies by _MainColor.a once more, Anchor by lerp(1, _MainColor.a,
    // _MainColorACtrl) (uTint carries the ×2)
    if (uACtrl != 0.0) col *= 1.0 + uACtrl * (uTint.a * 0.5 - 1.0);
    // local patch (maintainer report 2026-10-07, 赤刃明霄陈 S3's range too bright): the Ram family multiplies by _RamTex sampled at
    // the renderer's own uv through its tiling / offset — all of rgba (the client's DXBC: Ram/Disturb(CustomData),
    // Ram/Add, Ram/AlphaBlend) — not a ramp looked up by the dissolve edge as assumed before
    if (uHasRam) col *= texture2D(uRam, vUv * uRamST.xy + uRamST.zw);
    // dissolve: the shaders declare no edge colour, so _BorderWidth is the softness of the cut [ASSUMED]
    float e = 1.0;
    if (uHasDissolve) {
      vec2 suv = uDisMode == 0 ? vUv * uDissolveST.xy + uDissolveST.zw + uDissolveSpeed * uTime + dis * uDisturbDissolve
        : (vUv + dis) * uDissolveST.xy + uDissolveST.zw;   // Anchor: the moved uv through _DissolveTex_ST (client DXBC)
      float d = texture2D(uDissolve, suv).r;
      // local patch (client DXBC): saturate((d − amount + border · (1 − roundEven(amount + .5))) / border) — at amount 0
      // the border is added, so nothing is cut (the dark texels were holes before)
      float amt = uAmount + (uCustom ? vC2.x : 0.0);
      float bw = max(uBorder, 1e-3);
      e = clamp((d - amt + bw * (1.0 - roundEven(amt + 0.5))) / bw, 0.0, 1.0);
      // … (VertexColor Major): amount = 1 − vertex alpha, alpha = cut · texture alpha · tint alpha (vertex alpha not multiplied),
      // colour = 2 · texture · vertex colour
      if (uVCMajor) { e = clamp((d - (1.0 - vColor.a) + vColor.a * bw) / bw, 0.0, 1.0); col.a = tex.a * uTint.a * 0.5; col.rgb = tex.rgb * 2.0 * vColor.rgb; } // (no tint rgb)
      col.a *= e;
      // local patch: the … Double family cuts by a second texture with its own amount / border too [ASSUMED: alpha × both]
      if (uHasDissolve2) {
        float d2 = texture2D(uDissolve2, vUv * uDissolve2ST.xy + uDissolve2ST.zw + uDissolveSpeed * uTime + dis * uDisturbDissolve).r;
        // 2026-10-14 (client DXBC): the second cut adds its border like the first
        float bw2 = max(uBorder2, 1e-3);
        col.a *= clamp((d2 - uAmount2 + bw2 * (1.0 - roundEven(uAmount2 + 0.5))) / bw2, 0.0, 1.0);
      }
    }
    // local patch: Torappu/Particles/Rim — opaque at the silhouette, clear facing the camera [ASSUMED: alpha × (1 − |N·V|)^power]
    // (client DXBC, 2026-10-07: the rim term scales the colour as well as the alpha)
    if (uRim) { float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(-vVP))), 0.0, 1.0), uRimPower); col *= rim; }
    col.a *= uOpacity;
    if (col.a < 0.002) discard;
    gl_FragColor = col;
  }`;

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.needsUpdate = true;

function makeMaterial(m, lib) {
  const f = m?.floats || {}, c = m?.colors || {}, t = m?.tex || {};
  const shader = String(m?.shader || '');
  const tex = (k) => (t[k] ? lib.texture(t[k].img) : null);
  const st = (k) => (t[k] ? new THREE.Vector4(t[k].tiling[0], t[k].tiling[1], t[k].offset[0], t[k].offset[1]) : new THREE.Vector4(1, 1, 0, 0));
  // the Torappu particle shaders' neutral colour is 0.5 (shader property defaults): colour = 2 · tint · vertex · texture
  const tint = /CustomData|Disturb|Ram/.test(shader) ? (c._MainColor || [0.5, 0.5, 0.5, 0.5]) : (c._TintColor || c._MainColor || c._Color || [0.5, 0.5, 0.5, 0.5]);
  const tintMul = /Rim Tint/.test(shader) ? 1 : 2; // local patch (client DXBC): Rim Tint has no ×2 (Rim Texture, Additive … do)
  // blend: Additive / Dissolve Add = SrcAlpha One, AlphaBlend / … AB = SrcAlpha OneMinusSrcAlpha, the (CustomData) family
  // reads its `_DstBlend` enum (Add 1 / AlphaBlend 10). Materials also carry _SrcBlend/_DstBlend left over from Unity's
  // Standard shader: never read for the fixed families
  let additive;
  if (/AlphaBlend|\bAB\b/.test(shader)) additive = false;
  else if (/Additive|Add\b|Add /.test(shader)) additive = true;
  else additive = (f._DstBlend ?? 1) === 1;
  const src = 5, dst = additive ? 1 : 10;
  // 2026-10-14: Disturb Origin / Anchor name their noise _DisturTex (it was never read: no distortion, no flow)
  const disKey = t._DisturbTex ? '_DisturbTex' : t._NoiseTex ? '_NoiseTex' : '_DisturTex';
  const disturb = tex(disKey);
  const disMode = /Disturb Origin/.test(shader) ? 1 : /Disturb Anchor/.test(shader) ? 2 : 0;
  // 2026-10-14 (client DXBC): Disturb Anchor and Dissolve AB / Add UVTween scroll by _UVTween × _Time.y — main uv by .xy, the
  // noise (Anchor) or dissolve (UVTween) uv by .zw. No other particle shader declares it (nor _Speed / _FlowStrength, which
  // only Flipbook / GrabPass shaders read and no extracted material uses): there they are values left from another shader
  const tween = disMode === 2 || /UVTween/.test(shader);
  const uvTween = tween && Array.isArray(c._UVTween) ? c._UVTween : [0, 0, 0, 0];
  // 2026-10-14 (client DXBC): Mask (AlphaBlend) adds _AddTex (its own uv through _AddTex_ST, which its clips scroll) × the
  // _MaskTex alpha × _AddFactor × 2 to the main texture [ASSUMED: which sampler is which — the second uv's _ST is the one the
  // clips move]
  const add = /\/Mask\//.test(shader) ? tex('_AddTex') : null;
  // 2026-10-14 (client shader properties): only the (CustomData) family declares _Main / _Dissolve / _DisturbU·VSpeed —
  // Additive, AlphaBlend, the Dissolve and Disturb Origin / Anchor materials carry them left from another shader (they scrolled before)
  const sp = (v) => (/CustomData/.test(shader) && v) || 0;
  const disturb2 = disMode === 2 && (f._ToggleUseDisturb2 || 0) > 0 ? tex('_DisturTex_02') : null;
  const weight = disMode === 2 && (m?.keywords || []).includes('_WEIGHT_ON') ? tex('_WeightTex') : null;
  // local patch: the … Double family dissolves by _DissolveTex_01 / _02, each with its own _Amount_0N / _BorderWidth_0N (its
  // clips animate those; the materials' plain _Amount / _BorderWidth are left over from another shader)
  const double = !t._DissolveTex && !!t._DissolveTex_01;
  const dissolve = double ? tex('_DissolveTex_01') : tex('_DissolveTex');
  const dissolve2 = double ? tex('_DissolveTex_02') : null;
  const toggles = /Disturb Anchor/.test(shader), useTex = /Dissolve\(CustomData\)/.test(shader); // local patch
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
    side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: BLEND[src], blendDst: BLEND[dst],
    // local patch (maintainer 2026-10-07: black squares on 비르투오사's hit, 望's link): the alpha channel of a see-through canvas
    // (render/fxgame.js, premultiplied) — additive light never covers what is under it (a texture without alpha has a black
    // background: it added to the alpha before and composited as a black square), alpha blend is the premultiplied "over"
    blendSrcAlpha: additive ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uMain: { value: tex('_MainTex') || WHITE }, uMainST: { value: st('_MainTex') },
      uMainSpeed: { value: tween ? new THREE.Vector2(uvTween[0], uvTween[1]) : new THREE.Vector2(sp(f._MainUSpeed), sp(f._MainVSpeed)) },
      uHasAdd: { value: !!add }, uAdd: { value: add || WHITE }, uAddST: { value: st('_AddTex') },
      uMask: { value: tex('_MaskTex') || WHITE }, uAddFactor: { value: f._AddFactor ?? 1 },
      uTint: { value: new THREE.Vector4(tint[0] * tintMul, tint[1] * tintMul, tint[2] * tintMul, tint[3] * tintMul) },
      uOpacity: { value: f._Opacity ?? 1 },
      // local patch (client DXBC, 2026-10-07): only Disturb Anchor declares the _ToggleUse* switches (and Dissolve(CustomData)
      // _UseDissolveTex) — elsewhere they are values left over from another shader, and dissolve / disturb always run
      // 2026-10-14 (client DXBC): Anchor's first noise always runs; _ToggleUseDisturb2 switches its second one (uHasDisturb2)
      uHasDisturb: { value: !!disturb }, uDisturb: { value: disturb || WHITE },
      uDisturbST: { value: st(disKey) },
      uDisturbSpeed: { value: disMode === 2 ? new THREE.Vector2(uvTween[2], uvTween[3]) : new THREE.Vector2(sp(f._DisturbUSpeed), sp(f._DisturbVSpeed)) },
      uDisMode: { value: disMode }, uDisAnchor: { value: new THREE.Vector2(disMode === 2 ? f._AnchorU || 0 : 0, disMode === 2 ? f._AnchorV || 0 : 0) },
      uACtrl: { value: disMode === 1 ? 1 : disMode === 2 ? f._MainColorACtrl || 0 : 0 },
      uHasDisturb2: { value: !!disturb2 }, uDisturb2: { value: disturb2 || WHITE }, uDisturb2ST: { value: st('_DisturTex_02') },
      uDisturb2Str: { value: new THREE.Vector2(f._IntensityU_02 || 0, f._IntensityV_02 || 0) },
      uDisturb2Anchor: { value: new THREE.Vector2(f._AnchorU_02 || 0, f._AnchorV_02 || 0) },
      uHasWeight: { value: !!weight }, uWeight: { value: weight || WHITE }, uWeightST: { value: st('_WeightTex') },
      uDisturbStr: { value: new THREE.Vector2(f._IntensityU || 0, f._IntensityV || 0) },
      uDisturbMain: { value: f._DisturbInfluenceMainUV ?? 1 }, uDisturbDissolve: { value: f._DisturbInfluenceDissolveUV ?? 0 },
      uHasDissolve: { value: !!dissolve && (toggles ? (f._ToggleUseDissolve ?? 1) !== 0 : useTex ? (f._UseDissolveTex ?? 1) !== 0 : true) }, uDissolve: { value: dissolve || WHITE },
      uDissolveST: { value: st(double ? '_DissolveTex_01' : '_DissolveTex') },
      uDissolveSpeed: { value: disMode === 0 && tween ? new THREE.Vector2(uvTween[2], uvTween[3]) : new THREE.Vector2(sp(f._DissolveUSpeed), sp(f._DissolveVSpeed)) },
      // local patch (client DXBC): Dissolve(CustomData)'s amount is _DissolveIntensity (no _Amount), … (VertexColor Major) has none:
      // its vertex alpha is the amount (uVCMajor)
      uAmount: { value: (double ? f._Amount_01 : useTex ? f._DissolveIntensity : f._Amount) || 0 }, uVCMajor: { value: /VertexColor Major/.test(shader) }, uBorder: { value: (double ? f._BorderWidth_01 : f._BorderWidth) || 0 },
      uHasDissolve2: { value: !!dissolve2 }, uDissolve2: { value: dissolve2 || WHITE }, uDissolve2ST: { value: st('_DissolveTex_02') },
      uAmount2: { value: f._Amount_02 || 0 }, uBorder2: { value: f._BorderWidth_02 || 0 },
      // local patch: vertex colours / Rim — turned on by the geometry's owner (useMeshAttrs); the floor (FxInstance opts.floor)
      uVCol: { value: false }, uRim: { value: false }, uRimPower: { value: f._RimPower ?? 1 }, uFloor: { value: -1e9 },
      uHasRam: { value: !!t._RamTex }, uRam: { value: tex('_RamTex') || WHITE }, uRamST: { value: st('_RamTex') },
      uCustom: { value: (f._HGCustomVertexStream ?? (/CustomData/.test(shader) ? 1 : 0)) !== 0 },
      uTime: { value: 0 }, uAdditive: { value: additive },
      uMode: { value: 0 }, uLengthScale: { value: 2 }, uVelScale: { value: 0 }, uAlign: { value: 0 }, uPivot: { value: new THREE.Vector2() },
    },
  });
  mat.userData.order = m?.queue ?? 3000;
  mat.userData.rim = /\/Rim\//.test(shader);
  // local patch: whether the material tests depth (`_ZTest` 4 LessEqual …; 0 Disabled / 8 Always do not) — the floor cut
  // applies only to those: the client's map hides what they draw under the ground by depth [ASSUMED: 0 = Disabled is used]
  mat.userData.ztest = !(f._ZTest === 0 || f._ZTest === 8);
  // local patch (maintainer report 2026-10-08): … and against the map's raised tiles / crates (render/fxgame.js occluders —
  // the only depth in an effect canvas: every effect renderer writes none, as before)
  mat.depthTest = mat.userData.ztest;
  return mat;
}

/** 2026-10-14: the uniform holding a texture's tiling / offset, by the material's texture name. */
const TEX_ST = { _MainTex: 'uMainST', _AddTex: 'uAddST', _DisturbTex: 'uDisturbST', _NoiseTex: 'uDisturbST', _DisturTex: 'uDisturbST', _DisturTex_02: 'uDisturb2ST',
  _DissolveTex: 'uDissolveST', _DissolveTex_01: 'uDissolveST', _DissolveTex_02: 'uDissolve2ST', _RamTex: 'uRamST', _WeightTex: 'uWeightST' };

/**
 * 2026-10-14 (client Torappu.Fx.FxUVTweener / FxUVTweenerAdvance, `Update` RVA 0x34C5F90 / 0x34C5780): a renderer's
 * script that moves its material's texture offsets — each named texture's offset grows by 2 × speed per second (SPEED_SCALE
 * 2), from the material's own offset with `keepInitOffset`, else from 0 (`OnEnable`), until `tweenAnmTime` for an Advance
 * without `tweenRepeat` (fx_extract.py `uvt`). The fractional wrap of `protect*UV` / `tweenRepeat` changes nothing on
 * repeating textures. Kept on `mat.userData.uvt`, moved by setTime; a texture a clip track drives is left to the clip
 * (bindTrack0 — the Animator's property block wins over the material) [ASSUMED: a shared material (`useSharedMaterial`) moves
 * as an own one].
 */
function uvTween(mat, uvt, m) {
  if (!mat || !uvt || !Array.isArray(uvt.maps)) return;
  const list = [];
  for (const [name, vx, vy] of uvt.maps) {
    const u = TEX_ST[name] && m?.tex?.[name] ? mat.uniforms[TEX_ST[name]] : null;
    if (!u || list.some((e) => e.u === u)) continue;
    list.push({ u, z0: uvt.keep ? u.value.z : 0, w0: uvt.keep ? u.value.w : 0, vx: +vx || 0, vy: +vy || 0, until: uvt.until > 0 ? uvt.until : Infinity });
  }
  if (list.length) mat.userData.uvt = list;
}

/** The renderer's time (seconds since its branch started) into its material: the shader clock and the uvTween offsets. */
function setTime(mat, t) {
  mat.uniforms.uTime.value = t;
  const uvt = mat.userData.uvt;
  if (!uvt) return;
  for (const e of uvt) {
    const s = Math.max(0, Math.min(t, e.until));
    e.u.value.z = e.z0 + e.vx * s;
    e.u.value.w = e.w0 + e.vy * s;
  }
}

/**
 * local patch: a mesh's own attributes on the instanced geometry `g` of `src` — its vertex colours (most slash / ring meshes
 * fade their edges by vertex alpha) and, for a Rim material, its normals (computed once on the shared geometry).
 */
function useMeshAttrs(g, src, mat) {
  if (src.getAttribute('vcol')) { g.setAttribute('vcol', src.getAttribute('vcol')); mat.uniforms.uVCol.value = true; }
  if (mat.userData.rim) {
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    g.setAttribute('normal', src.getAttribute('normal'));
    mat.uniforms.uRim.value = true;
  }
}

// ---------------------------------------------------------------- library (shared textures, meshes, defs)

/** A file name in a URL: names can hold '#' (skin texture names, e.g. `…_sale#10_…`) that would end the path. */
const seg = (name) => encodeURIComponent(name);

export class FxLibrary {
  constructor(base = '/assets/local/fx/') {
    this.base = base;
    this.defs = new Map();
    this.textures = new Map();
    this.meshes = new Map();
    this.loader = new THREE.TextureLoader();
  }

  texture(name) {
    if (!this.textures.has(name)) {
      const tx = this.loader.load(this.base + 'tex/' + seg(name));
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
      tx.colorSpace = THREE.NoColorSpace;
      tx.flipY = true;    // PNGs are top-down; Unity's uv v = 0 is the bottom row
      this.textures.set(name, tx);
    }
    return this.textures.get(name);
  }

  async mesh(key) {
    if (!this.meshes.has(key)) {
      this.meshes.set(key, fetch(this.base + 'mesh/' + seg(key) + '.json').then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!d) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
        if (d.uv?.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv.length === (d.pos.length / 3) * 2 ? d.uv : d.uv.filter((_, i) => i % 4 < 2), 2));
        g.setIndex(d.idx);
        // local patch: vertex colours (0–255 from the extract) → vcol, used by the shader's uVCol
        const nv = d.pos.length / 3;
        if (d.col?.length === nv * 4) {
          const mx = d.col.reduce((a, v) => (v > a ? v : a), 0);
          g.setAttribute('vcol', new THREE.Float32BufferAttribute(mx > 1.001 ? d.col.map((v) => v / 255) : d.col, 4));
        }
        // 2026-10-14: a skinned mesh's 4 bone indices / weights per vertex and its bones' bind poses (FxInstance n.skin)
        if (d.bi?.length === nv * 4 && d.bw?.length === nv * 4 && d.bind?.length) {
          g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(d.bi, 4));
          g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.bw, 4));
          g.userData.bind = d.bind;
        }
        return g;
      }).catch(() => null));
    }
    return this.meshes.get(key);
  }

  /** Load an effect definition (+ its meshes); null when the file is missing. */
  async load(bundle, prefab) {
    const key = `${bundle}/${prefab}`;
    if (!this.defs.has(key)) {
      this.defs.set(key, (async () => {
        const r = await fetch(`${this.base}${seg(bundle)}/${seg(prefab)}.json`);
        if (!r.ok) return null;
        const def = await r.json();
        for (const n of def.nodes) {
          if (n.ps) prepareCurves(n.ps);
          if (n.trailR) { prepareCurves(n.trailR); if (n.trailR.widthCurve?.length) n.trailR.wf = flatKeys(n.trailR.widthCurve); }
        }
        def.geoms = {};
        const keys = new Set();
        for (const n of def.nodes) {
          if (n.ps?.render?.mesh) keys.add(n.ps.render.mesh);
          if (n.mesh?.mesh) keys.add(n.mesh.mesh);
          if (n.skin?.mesh) keys.add(n.skin.mesh);
        }
        await Promise.all([...keys].map(async (k) => { def.geoms[k] = await this.mesh(k); }));
        def.lib = this;
        return def;
      })().catch(() => null));
    }
    return this.defs.get(key);
  }

  /**
   * Free what this library uploaded (its view is gone: render/fxgame.js destroy): every texture and mesh geometry is
   * disposed — the renderers drop their GL copies and their 'dispose' listeners, which otherwise kept the renderer and its
   * WebGL context reachable through the library — and the caches are emptied. A load still in flight may fill them again
   * (nothing draws it any more).
   */
  dispose() {
    for (const tx of this.textures.values()) { try { tx.dispose(); } catch { /* ignore */ } }
    for (const p of this.meshes.values()) Promise.resolve(p).then((g) => g?.dispose(), () => {});
    this.textures.clear();
    this.meshes.clear();
    this.defs.clear();
  }
}

const QUAD = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

// ---------------------------------------------------------------- trails

// one strip vertex = 18 floats in one buffer: position 3, uv 2, iColor 4, iSize 3 (x = width), iRot 3 (x = side),
// iVel 3 (the tangent)
const SV = 18, SV_UV = 3, SV_COL = 5, SV_SIZE = 9, SV_ROT = 12, SV_TAN = 15;
const STRIP_ATTRS = [['position', 3, 0], ['uv', 2, SV_UV], ['iColor', 4, SV_COL], ['iSize', 3, SV_SIZE], ['iRot', 3, SV_ROT], ['iVel', 3, SV_TAN]];

/** A batch of camera-facing strips drawn with one material in one draw call (rebuilt every frame; small counts). Only
 *  what a frame writes goes to the GPU: a ribbon batch holds max + 1 points but draws at most TRAIL_PTS, and the whole
 *  buffers were sent every frame before (2.8–3.5 MB per frame in a crowded scene). */
class StripBatch {
  constructor(material, cap = 256) {
    this.cap = cap;
    const g = new THREE.BufferGeometry();
    const vb = new THREE.InterleavedBuffer(new Float32Array(cap * 2 * SV), SV);
    vb.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size, offset] of STRIP_ATTRS) g.setAttribute(name, new THREE.InterleavedBufferAttribute(vb, size, offset));
    this.vb = vb;
    for (const [name, n, v] of [['iUV', 4, [0, 0, 1, 1]], ['iC1', 4, [0, 0, 0, 0]], ['iC2', 4, [0, 0, 0, 0]], ['iPos', 3, [0, 0, 0]]]) {
      const arr = new Float32Array(cap * 2 * n);
      for (let i = 0; i < cap * 2; i++) arr.set(v, i * n);
      g.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    this.index = new THREE.BufferAttribute(new Uint16Array(cap * 6), 1);
    this.index.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.index);
    g.setDrawRange(0, 0);
    this.geometry = g;
    material.uniforms.uMode.value = 6;
    this.material = material;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.n = 0; this.ni = 0;
  }

  begin() { this.n = 0; this.ni = 0; }

  /** One strip: pts = flat [x, y, z, …], per point width w[], colour c[] (4 each), u[] along the trail. */
  strip(pts, count, w, c, u) {
    if (count < 2 || this.n + count > this.cap) return;
    const D = this.vb.array, I = this.index.array;
    for (let k = 0; k < count; k++) {
      const a = Math.max(0, k - 1), b = Math.min(count - 1, k + 1);
      const tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
      for (let side = 0; side < 2; side++) {
        const o = ((this.n + k) * 2 + side) * SV;
        D[o] = pts[k * 3]; D[o + 1] = pts[k * 3 + 1]; D[o + 2] = pts[k * 3 + 2];
        D[o + SV_TAN] = tx; D[o + SV_TAN + 1] = ty; D[o + SV_TAN + 2] = tz;
        D[o + SV_ROT] = side ? 1 : -1; D[o + SV_SIZE] = w[k];
        D[o + SV_UV] = u[k]; D[o + SV_UV + 1] = side;
        D[o + SV_COL] = c[k * 4]; D[o + SV_COL + 1] = c[k * 4 + 1]; D[o + SV_COL + 2] = c[k * 4 + 2]; D[o + SV_COL + 3] = c[k * 4 + 3];
      }
      if (k > 0) {
        const v0 = (this.n + k - 1) * 2, v1 = v0 + 2, j = this.ni;
        I[j] = v0; I[j + 1] = v0 + 1; I[j + 2] = v1; I[j + 3] = v0 + 1; I[j + 4] = v1 + 1; I[j + 5] = v1;
        this.ni += 6;
      }
    }
    this.n += count;
  }

  end() {
    if (this.ni) {   // an empty batch draws nothing and sends nothing
      this.vb.clearUpdateRanges(); this.vb.addUpdateRange(0, this.n * 2 * SV); this.vb.needsUpdate = true;
      this.index.clearUpdateRanges(); this.index.addUpdateRange(0, this.ni); this.index.needsUpdate = true;
    }
    // stays visible while empty (draw range 0): hiding it changed other draws' pixels in the look check (GL state)
    this.geometry.setDrawRange(0, this.ni);
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

const TRAIL_PTS = 48;
const TRAIL_KEEP = TRAIL_PTS - 1;   // points a TrailRenderer records (its live head is the last one drawn)
const trailPts = new Float32Array(TRAIL_PTS * 3), trailW = new Float32Array(TRAIL_PTS), trailC = new Float32Array(TRAIL_PTS * 4), trailU = new Float32Array(TRAIL_PTS);

/** A TrailRenderer: a ribbon behind its node's motion (sampled in the effect root's space). */
class TrailRenderer {
  constructor(tr, node, root, def) {
    this.tr = tr; this.node = node; this.root = root;
    this.batch = new StripBatch(makeMaterial(def.materials[tr.mat], def.lib), TRAIL_PTS);
    this.batch.mesh.renderOrder = tr.order || 0;
    root.add(this.batch.mesh);
    this.ring = new Float64Array(TRAIL_KEEP * 4);   // recorded points x, y, z, t; the oldest at `head`
    this.head = 0; this.count = 0;
    this.time = 0;
  }

  update(dt, sinceStart) {
    this.time += dt;
    setTime(this.batch.material, sinceStart);
    // local patch (m_IsActive): switched off by a clip — not drawn, its points dropped [ASSUMED: cleared, not kept for the next on]
    if (this.off) { this.count = 0; this.batch.begin(); this.batch.end(); return; }
    const tr = this.tr, R = this.ring;
    this.node.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    tmpM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
    const p = tmpV.set(0, 0, 0).applyMatrix4(tmpM);
    const last = ((this.head + this.count - 1) % TRAIL_KEEP) * 4;
    if (this.node.visible && (!this.count || Math.hypot(p.x - R[last], p.y - R[last + 1], p.z - R[last + 2]) >= tr.minDist)) {
      if (this.count === TRAIL_KEEP) { this.head = (this.head + 1) % TRAIL_KEEP; this.count--; }
      const w = ((this.head + this.count) % TRAIL_KEEP) * 4;
      R[w] = p.x; R[w + 1] = p.y; R[w + 2] = p.z; R[w + 3] = this.time;
      this.count++;
    }
    while (this.count && this.time - R[this.head * 4 + 3] > tr.time) { this.head = (this.head + 1) % TRAIL_KEEP; this.count--; }
    // newest first: the live head, then the recorded points
    const n = this.count + 1;
    this.batch.begin();
    if (n >= 2) {
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        if (k === 0) { trailPts[0] = p.x; trailPts[1] = p.y; trailPts[2] = p.z; } else {
          const h = ((this.head + this.count - k) % TRAIL_KEEP) * 4;
          trailPts[k * 3] = R[h]; trailPts[k * 3 + 1] = R[h + 1]; trailPts[k * 3 + 2] = R[h + 2];
        }
        trailW[k] = tr.width * (tr.wf ? evalFlat(tr.wf, u) : tr.widthCurve?.length ? evalCurve(tr.widthCurve, u) : 1);
        evalGradient(tr.grad, u, tmpC);
        trailC.set(tmpC, k * 4);
        trailU[k] = tr.texMode === 1 ? k * tr.minDist : u;
      }
      this.batch.strip(trailPts, n, trailW, trailC, trailU);
    }
    this.batch.end();
  }

  get alive() { return this.count > 0; }

  /** Move the recorded points by (x, y, z) in root space (FxInstance.update: the root moved; Unity trails are world space). */
  shift(x, y, z) {
    const R = this.ring;
    for (let k = 0; k < this.count; k++) { const h = ((this.head + k) % TRAIL_KEEP) * 4; R[h] += x; R[h + 1] += y; R[h + 2] += z; }
  }

  dispose() { this.batch.dispose(); }
}

// local patch (maintainer report 2026-10-07: 蕾缪안 S3's aiming beams were missing) ---------------- line renderer
/**
 * A Unity LineRenderer (fx_extract.py lineR): a view-facing strip through fixed points of its node (local space; a
 * world-space line's points come from a client script — drawn in the effect's space [ASSUMED]). Width = widthMultiplier
 * (a clip may animate it: 'width') × widthCurve; colour = colorGradient along the line; u: Stretch 0..1, Tile = distance,
 * Distribute / Repeat per segment = the segment index. Unity keeps the object (its last clip frame) until its owner
 * destroys it: alive while the instance is not stopped.
 */
class LineRenderer {
  constructor(ln, node, root, def) {
    this.tr = ln; this.node = node; this.root = root;
    this.ends = null;   // 2026-10-10: FxInstance.setLine
    this.w = ln.width;
    const n = ln.pts.length + (ln.loop ? 1 : 0);
    this.n = Math.min(n, TRAIL_PTS);
    this.batch = new StripBatch(makeMaterial(def.materials[ln.mat], def.lib), this.n);
    this.batch.mesh.renderOrder = ln.order || 0;
    root.add(this.batch.mesh);
  }

  update(dt, sinceStart) {
    const ln = this.tr, n = this.n;
    setTime(this.batch.material, sinceStart);
    this.batch.begin();
    let shown = true;
    for (let o = this.node; o && o !== this.root; o = o.parent) if (!o.visible) { shown = false; break; }
    if (shown && n >= 2 && this.w > 0) {
      this.node.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      if (ln.world) tmpM.identity(); else tmpM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
      // 2026-10-10: a LineEffectEmitterDynamic line (FxInstance.setLine) — its first / last point at two scene points
      // (client _UpdateMountPoint: SetPosition(0, start) / SetPosition(1, end) each frame), the ones between spread evenly
      const ends = this.ends;
      if (ends) tmpM2.copy(this.root.matrixWorld).invert();
      let total = 0;
      for (let k = 0; k < n; k++) {
        const q = ln.pts[k % ln.pts.length];
        const f = n > 1 ? k / (n - 1) : 0;
        const p = ends
          ? tmpV.set(ends[0].x + (ends[1].x - ends[0].x) * f, ends[0].y + (ends[1].y - ends[0].y) * f, ends[0].z + (ends[1].z - ends[0].z) * f).applyMatrix4(tmpM2)
          : tmpV.set(q[0], q[1], q[2]).applyMatrix4(tmpM);
        trailPts[k * 3] = p.x; trailPts[k * 3 + 1] = p.y; trailPts[k * 3 + 2] = p.z;
        if (k) total += Math.hypot(p.x - trailPts[k * 3 - 3], p.y - trailPts[k * 3 - 2], p.z - trailPts[k * 3 - 1]);
        trailU[k] = total;   // the distance so far (u below)
      }
      for (let k = 0; k < n; k++) {
        const f = total > 0 ? trailU[k] / total : k / (n - 1);
        trailW[k] = this.w * (ln.widthCurve?.length ? evalCurve(ln.widthCurve, f) : 1);
        evalGradient(ln.grad, f, tmpC);
        trailC.set(tmpC, k * 4);
        trailU[k] = ln.texMode === 1 ? trailU[k] : ln.texMode === 2 ? k / (n - 1) : ln.texMode === 3 ? k : f;
      }
      this.batch.strip(trailPts, n, trailW, trailC, trailU);
    }
    this.batch.end();
  }

  dispose() { this.batch.dispose(); }
}

// ---------------------------------------------------------------- particle system

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
const emitM = new THREE.Matrix4();   // ParticleSystem.emit: node → root for a world-space system
// one particle's instance data = 28 floats in one buffer (one upload per system and frame, was eight):
// iPos 3, iSize 3, iRot 3, iColor 4, iC1 4, iC2 4, iUV 4, iVel 3
const IV = 28, IV_POS = 0, IV_SIZE = 3, IV_ROT = 6, IV_COL = 9, IV_C1 = 13, IV_C2 = 17, IV_UV = 21, IV_VEL = 25;
const INSTANCE_ATTRS = [['iPos', 3, IV_POS], ['iSize', 3, IV_SIZE], ['iRot', 3, IV_ROT], ['iColor', 4, IV_COL], ['iC1', 4, IV_C1],
  ['iC2', 4, IV_C2], ['iUV', 4, IV_UV], ['iVel', 3, IV_VEL]];
const tmpC = [0, 0, 0, 0], tmpC2 = [0, 0, 0, 0];
const D2R = Math.PI / 180;

class ParticleSystem {
  constructor(ps, node, root, def, opts) {
    this.ps = ps;
    this.node = node;           // THREE.Object3D of its node
    this.root = root;           // effect root (Unity frame)
    this.q = opts.q;
    this.world = ps.space === 1;
    const max = Math.max(1, Math.min(ps.max || 1000, opts.cap || 400));
    this.max = max;
    this.n = 0;
    this.time = -(evalMM(ps.delay, 0, Math.random()) || 0);
    this.emitAcc = 0;
    this.burstDone = (ps.bursts || []).map(() => 0);
    this.stopped = false;
    this.cycle = 0;
    // particle state (SoA)
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.age = new Float32Array(max);
    this.life = new Float32Array(max); this.size0 = new Float32Array(max * 3); this.rot = new Float32Array(max * 3);
    this.rotVel = new Float32Array(max); this.col0 = new Float32Array(max * 4); this.rnd = new Float32Array(max * 4);
    const geomSrc = ps.render.mode === 4 && def.geoms[ps.render.mesh] ? def.geoms[ps.render.mesh] : QUAD;
    const g = new THREE.InstancedBufferGeometry();
    g.index = geomSrc.index;
    g.setAttribute('position', geomSrc.getAttribute('position'));
    if (geomSrc.getAttribute('uv')) g.setAttribute('uv', geomSrc.getAttribute('uv'));
    const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(max * IV), IV, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    for (const [name, size, offset] of INSTANCE_ATTRS) g.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, size, offset));
    this.ib = ib;
    g.instanceCount = 0;
    this.geometry = g;
    // a trail-only system (renderer mode None / no particle material) draws only its trails
    const drawParticles = ps.render.mat && ps.render.mode !== 5;
    const mat = makeMaterial(def.materials[ps.render.mat] || null, def.lib);
    mat.uniforms.uMode.value = ps.render.mode === 3 ? 0 : ps.render.mode;
    mat.uniforms.uLengthScale.value = ps.render.lengthScale ?? 2;
    mat.uniforms.uVelScale.value = ps.render.velScale ?? 0;
    mat.uniforms.uAlign.value = ps.render.align ?? 0;
    if (opts.pivot && Array.isArray(ps.render.pivot)) mat.uniforms.uPivot.value.set(+ps.render.pivot[0] || 0, +ps.render.pivot[1] || 0); // local patch (FxInstance opts.pivot, default on)
    if (geomSrc !== QUAD) useMeshAttrs(g, geomSrc, mat); // local patch
    this.material = mat;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = (ps.render.order || 0) + (mat.userData.order - 3000) / 100;
    this.draws = !!drawParticles;
    this.mesh.visible = false;   // drawn while it has particles (update)
    (this.world ? root : node).add(this.mesh);
    // particle trails (TrailModule): a short position history per particle (mode 0) or one ribbon through them (mode 1)
    const tm = ps.mods.trail;
    if (tm && typeof tm === 'object' && ps.render.trailMat && def.materials[ps.render.trailMat]) {
      this.tm = tm;
      this.histK = 10;
      this.hist = new Float32Array(max * this.histK * 4);  // x, y, z, age at record
      this.histN = new Uint8Array(max);
      const cap = Math.min(4000, tm.mode === 1 ? max + 1 : max * (this.histK + 1));
      this.trailBatch = new StripBatch(makeMaterial(def.materials[ps.render.trailMat], def.lib), cap);
      this.trailBatch.mesh.renderOrder = this.mesh.renderOrder;
      (this.world || tm.world ? root : node).add(this.trailBatch.mesh);
      this.order = [];                                          // ribbon order, reused
      this.olderFirst = (x, y) => this.age[y] - this.age[x];
    }
    this.listed = true;                                         // counted in liveParticles until dispose
    systems.add(this);
  }

  get alive() { return this.n > 0 || (!this.stopped && (this.ps.loop || this.time < this.ps.dur)); }

  /**
   * local patch (m_IsActive, maintainer's decision 2026-10-08 「공식과 동일하게」): its GameObject switched off by a clip — Unity clears
   * the system and stops it; switched on again it plays from its start (playOnAwake).
   */
  setActive(on) {
    if (on) {
      this.time = -(evalMM(this.ps.delay, 0, Math.random()) || 0);
      this.emitAcc = 0; this.burstDone.fill(0); this.stopped = false; this.cycle = 0;
    } else { this.stopped = true; while (this.n) this.kill(this.n - 1); }
  }

  emit(count) {
    const ps = this.ps;
    const room = Math.min(count, this.max - this.n, this.q.budget - liveParticles);
    if (room <= 0) return;
    if (this.listed) liveParticles += room;
    // world space: the node → root transform, the same for every particle of this call
    if (this.world) {
      this.node.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      emitM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
    }
    for (let k = 0; k < room; k++) {
      const i = this.n++;
      const r = this.rnd;
      for (let j = 0; j < 4; j++) r[i * 4 + j] = Math.random();
      const t01 = ps.dur > 0 ? Math.min(1, Math.max(0, this.time / ps.dur)) : 0;
      this.age[i] = 0;
      this.life[i] = Math.max(0.01, evalMM(ps.life, t01, Math.random()));
      const sp = evalMM(ps.speed, t01, Math.random());
      const s = evalMM(ps.size, t01, Math.random());
      this.size0[i * 3] = s;
      this.size0[i * 3 + 1] = ps.sizeY ? evalMM(ps.sizeY, t01, Math.random()) : s;
      this.size0[i * 3 + 2] = ps.sizeZ ? evalMM(ps.sizeZ, t01, Math.random()) : s;
      const flip = Math.random() < (ps.flipRot || 0) ? -1 : 1;
      this.rot[i * 3] = ps.rotX ? evalMM(ps.rotX, t01, Math.random()) : 0;
      this.rot[i * 3 + 1] = ps.rotY ? evalMM(ps.rotY, t01, Math.random()) : 0;
      this.rot[i * 3 + 2] = evalMM(ps.rot, t01, Math.random()) * flip;
      evalMG(ps.color, t01, Math.random(), tmpC);
      this.col0.set(tmpC, i * 4);
      // position + direction from the shape (local space of the node)
      const p = tmpV.set(0, 0, 0), d = tmpV2.set(0, 0, 1);
      shapeSample(ps.shape, p, d);
      if (this.world) { p.applyMatrix4(emitM); d.transformDirection(emitM); }
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      if (this.histN) this.histN[i] = 0;
      this.vel[i * 3] = d.x * sp; this.vel[i * 3 + 1] = d.y * sp; this.vel[i * 3 + 2] = d.z * sp;
    }
  }

  kill(i) {
    const last = --this.n;
    if (this.listed) liveParticles--;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3); this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.size0.copyWithin(i * 3, last * 3, last * 3 + 3); this.rot.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.col0.copyWithin(i * 4, last * 4, last * 4 + 4); this.rnd.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.age[i] = this.age[last]; this.life[i] = this.life[last]; this.rotVel[i] = this.rotVel[last];
    if (this.hist) {
      const K = this.histK * 4;
      this.hist.copyWithin(i * K, last * K, last * K + K);
      this.histN[i] = this.histN[last];
    }
  }

  update(dt, sinceStart) {
    const ps = this.ps, m = ps.mods;
    dt *= ps.speedMul || 1;
    setTime(this.material, sinceStart);
    // emission
    const prev = this.time;
    this.time += dt;
    if (!this.stopped && this.time >= 0) {
      let t = this.time;
      if (ps.loop && ps.dur > 0 && t >= ps.dur) {
        t %= ps.dur;
        if (t < prev % ps.dur) this.burstDone.fill(0);
      }
      if (t <= ps.dur || ps.loop) {
        const t01 = ps.dur > 0 ? Math.min(1, t / ps.dur) : 0;
        const rate = evalMM(ps.rate, t01, Math.random()) * this.q.emission;
        this.emitAcc += rate * dt;
        const whole = Math.floor(this.emitAcc);
        if (whole > 0) { this.emitAcc -= whole; this.emit(whole); }
        const bursts = ps.bursts;
        if (bursts) {
          for (let k = 0; k < bursts.length; k++) {
            const b = bursts[k], cycles = b.cycles || 1;
            while (this.burstDone[k] < cycles && t >= b.t + this.burstDone[k] * (b.interval || 0)) {
              this.burstDone[k]++;
              if (Math.random() <= (b.p ?? 1)) this.emit(Math.max(0, Math.round(evalMM(b.n, 0, Math.random()) * Math.max(this.q.emission, b.t === 0 ? 1 : 0))));
            }
          }
        }
      }
    }
    // simulate
    const grav = evalMM(ps.gravity, 0, 0);
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const a = this.age[i] / this.life[i], r = this.rnd[i * 4];
      let vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      if (grav) { vx += GRAVITY.x * grav * dt; vy += GRAVITY.y * grav * dt; vz += GRAVITY.z * grav * dt; }
      if (m.force) { vx += evalMM(m.force.x, a, r) * dt; vy += evalMM(m.force.y, a, r) * dt; vz += evalMM(m.force.z, a, r) * dt; }
      if (m.limit) {
        const lim = evalMM(m.limit.mag, a, r), sp = Math.hypot(vx, vy, vz);
        if (sp > lim && sp > 0) { const k = 1 - (m.limit.dampen || 0) * (1 - lim / sp); vx *= k; vy *= k; vz *= k; }
        const drag = evalMM(m.limit.drag, a, r);
        if (drag) { const k = Math.max(0, 1 - drag * dt); vx *= k; vy *= k; vz *= k; }
      }
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      let ox = 0, oy = 0, oz = 0;
      if (m.velOL) { ox = evalMM(m.velOL.x, a, r); oy = evalMM(m.velOL.y, a, r); oz = evalMM(m.velOL.z, a, r); }
      if (m.noise) {
        const s = evalMM(m.noise.str, a, r), f = m.noise.freq || 0.5, ph = this.rnd[i * 4 + 1] * 50;
        ox += Math.sin((this.age[i] + ph) * f * 6.28) * s; oy += Math.cos((this.age[i] + ph * 1.3) * f * 6.28) * s;
      }
      this.pos[i * 3] += (vx + ox) * dt; this.pos[i * 3 + 1] += (vy + oy) * dt; this.pos[i * 3 + 2] += (vz + oz) * dt;
      if (m.rotOL) this.rot[i * 3 + 2] += evalMM(m.rotOL.z, a, r) * dt;
    }
    // instance data, uploaded by the used range in one call
    const n = this.n, D = this.ib.array;
    for (let i = 0; i < n; i++) {
      const a = this.age[i] / this.life[i], r = this.rnd[i * 4 + 2], o = i * IV;
      D[o + IV_POS] = this.pos[i * 3]; D[o + IV_POS + 1] = this.pos[i * 3 + 1]; D[o + IV_POS + 2] = this.pos[i * 3 + 2];
      D[o + IV_VEL] = this.vel[i * 3]; D[o + IV_VEL + 1] = this.vel[i * 3 + 1]; D[o + IV_VEL + 2] = this.vel[i * 3 + 2];
      let sx = 1, sy = 1, sz = 1;
      if (m.sizeOL) { sx = evalMM(m.sizeOL.x, a, r); sy = m.sizeOL.y ? evalMM(m.sizeOL.y, a, r) : sx; sz = m.sizeOL.z ? evalMM(m.sizeOL.z, a, r) : sx; }
      D[o + IV_SIZE] = this.size0[i * 3] * sx; D[o + IV_SIZE + 1] = this.size0[i * 3 + 1] * sy; D[o + IV_SIZE + 2] = this.size0[i * 3 + 2] * sz;
      D[o + IV_ROT] = this.rot[i * 3]; D[o + IV_ROT + 1] = this.rot[i * 3 + 1]; D[o + IV_ROT + 2] = this.rot[i * 3 + 2];
      for (let k = 0; k < 4; k++) D[o + IV_COL + k] = this.col0[i * 4 + k];
      if (m.colorOL) { evalMG(m.colorOL, a, this.rnd[i * 4 + 3], tmpC2); for (let k = 0; k < 4; k++) D[o + IV_COL + k] *= tmpC2[k]; }
      const cd = m.custom;
      for (let s2 = 0; s2 < 2; s2++) {
        const c = o + (s2 ? IV_C2 : IV_C1), e = cd?.[s2];
        for (let k = 0; k < 4; k++) D[c + k] = e?.v?.[k] ? evalMM(e.v[k], a, r) : 0;
        if (e?.col) { evalMG(e.col, a, r, tmpC2); for (let k = 0; k < 4; k++) D[c + k] = tmpC2[k]; }
      }
      if (m.uv) {
        const tx = m.uv.tx || 1, ty = m.uv.ty || 1, frames = m.uv.anim === 1 ? tx : tx * ty;
        const f = Math.floor((evalMM(m.uv.frame, (a * (m.uv.cycles || 1)) % 1, r) + evalMM(m.uv.start, 0, r) / frames) * frames) % frames;
        const col = f % tx, row = m.uv.anim === 1 ? (m.uv.row || 0) : Math.floor(f / tx);
        D[o + IV_UV] = col / tx; D[o + IV_UV + 1] = 1 - (row + 1) / ty; D[o + IV_UV + 2] = 1 / tx; D[o + IV_UV + 3] = 1 / ty;
      } else { D[o + IV_UV] = 0; D[o + IV_UV + 1] = 0; D[o + IV_UV + 2] = 1; D[o + IV_UV + 3] = 1; }
    }
    if (n) { this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, n * IV); this.ib.needsUpdate = true; }
    this.geometry.instanceCount = n;
    this.mesh.visible = this.draws && n > 0;
    if (this.trailBatch) this.updateTrails(sinceStart);
  }

  /** Trail width at u (0 = the particle, 1 = the tail) for particle i. */
  trailWidth(i, u) {
    const tm = this.tm;
    return (tm.width ? evalMM(tm.width, u, this.rnd[i * 4]) : 1) * (tm.sizeWidth ? this.ib.array[i * IV + IV_SIZE] : 1);
  }

  /** Trail colour at u for particle i → out. */
  trailColour(i, u, out) {
    const tm = this.tm;
    evalMG(tm.colorOT, u, this.rnd[i * 4 + 1], out);
    if (tm.colorOL) { evalMG(tm.colorOL, this.age[i] / this.life[i], this.rnd[i * 4 + 2], tmpC2); for (let k = 0; k < 4; k++) out[k] *= tmpC2[k]; }
    if (tm.inherit) { const D = this.ib.array, o = i * IV + IV_COL; for (let k = 0; k < 4; k++) out[k] *= D[o + k]; }
    return out;
  }

  updateTrails(sinceStart) {
    const tm = this.tm, K = this.histK, H = this.hist, n = this.n, b = this.trailBatch;
    setTime(b.material, sinceStart);
    b.begin();
    if (tm.mode === 1) {
      // ribbon: the particles from the oldest to the newest (a stable sort, ties keep their index order)
      const order = this.order;
      order.length = n;
      for (let i = 0; i < n; i++) order[i] = i;
      order.sort(this.olderFirst);
      const m = Math.min(n, TRAIL_PTS);
      for (let k = 0; k < m; k++) {
        const i = order[k], u = m > 1 ? k / (m - 1) : 0;
        trailPts[k * 3] = this.pos[i * 3]; trailPts[k * 3 + 1] = this.pos[i * 3 + 1]; trailPts[k * 3 + 2] = this.pos[i * 3 + 2];
        trailW[k] = this.trailWidth(i, u);
        trailC.set(this.trailColour(i, u, tmpC), k * 4);
        trailU[k] = u;
      }
      b.strip(trailPts, m, trailW, trailC, trailU);
    } else {
      for (let i = 0; i < n; i++) {
        if (Math.random() > (tm.ratio ?? 1) && this.histN[i] === 0 && this.age[i] > 0.05) continue;
        // record a point when the particle moved far enough; forget points older than the trail's lifetime
        const base = i * K * 4;
        let cnt = this.histN[i];
        const px = this.pos[i * 3], py = this.pos[i * 3 + 1], pz = this.pos[i * 3 + 2];
        const lx = cnt ? H[base + (cnt - 1) * 4] : Infinity, ly = cnt ? H[base + (cnt - 1) * 4 + 1] : 0, lz = cnt ? H[base + (cnt - 1) * 4 + 2] : 0;
        if (!cnt || Math.hypot(px - lx, py - ly, pz - lz) >= tm.minDist) {
          if (cnt === K) { H.copyWithin(base, base + 4, base + K * 4); cnt--; }
          H[base + cnt * 4] = px; H[base + cnt * 4 + 1] = py; H[base + cnt * 4 + 2] = pz; H[base + cnt * 4 + 3] = this.age[i];
          cnt++;
        }
        const tl = evalMM(tm.life, 0, this.rnd[i * 4 + 3]) * this.life[i];
        let drop = 0;
        while (drop < cnt && this.age[i] - H[base + drop * 4 + 3] > tl) drop++;
        if (drop) { H.copyWithin(base, base + drop * 4, base + cnt * 4); cnt -= drop; }
        this.histN[i] = cnt;
        // newest first: the particle, then its history
        const m = Math.min(cnt + 1, TRAIL_PTS);
        trailPts[0] = px; trailPts[1] = py; trailPts[2] = pz;
        for (let k = 1; k < m; k++) {
          const h = base + (cnt - k) * 4;
          trailPts[k * 3] = H[h]; trailPts[k * 3 + 1] = H[h + 1]; trailPts[k * 3 + 2] = H[h + 2];
        }
        for (let k = 0; k < m; k++) {
          const u = m > 1 ? k / (m - 1) : 0;
          trailW[k] = this.trailWidth(i, u);
          trailC.set(this.trailColour(i, u, tmpC), k * 4);
          trailU[k] = u;
        }
        b.strip(trailPts, m, trailW, trailC, trailU);
      }
    }
    b.end();
  }

  stop() { this.stopped = true; }

  dispose() {
    if (this.listed) { liveParticles -= this.n; this.listed = false; }
    systems.delete(this);
    this.n = 0;
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.trailBatch?.dispose();
  }
}

const SCALE = new THREE.Vector3(), shapeE = new THREE.Euler(), shapeV = new THREE.Vector3();
function shapeSample(sh, p, d) {
  if (!sh) return;
  const rand = Math.random;
  const r = (sh.radius || 0) * (1 - (sh.thick ?? 1) * rand());
  switch (sh.type) {
    case 0: case 1: { // sphere
      const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(th), s * Math.sin(th), u); p.copy(d).multiplyScalar(r);
      break;
    }
    case 2: case 3: { // hemisphere (+z)
      const u = rand(), th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(th), s * Math.sin(th), u); p.copy(d).multiplyScalar(r);
      break;
    }
    case 4: case 7: case 8: case 9: { // cone along +z
      const th = rand() * (sh.arc ?? 360) * D2R, rr = r;
      const bx = Math.cos(th), by = Math.sin(th);
      p.set(bx * rr, by * rr, 0);
      const ang = (sh.angle || 0) * D2R, k = (sh.radius ? rr / sh.radius : rand());
      d.set(bx * Math.sin(ang * k), by * Math.sin(ang * k), Math.cos(ang * k)).normalize();
      break;
    }
    case 5: case 15: case 16: // box: +z
      p.set((rand() - 0.5) * (sh.scale?.[0] ?? 1), (rand() - 0.5) * (sh.scale?.[1] ?? 1), (rand() - 0.5) * (sh.scale?.[2] ?? 1));
      d.set(0, 0, 1);
      break;
    case 10: case 11: { // circle in XY, outward
      const th = rand() * (sh.arc ?? 360) * D2R;
      d.set(Math.cos(th), Math.sin(th), 0); p.copy(d).multiplyScalar(sh.type === 11 ? sh.radius : r);
      break;
    }
    case 12: // edge along x, +y
      p.set((rand() * 2 - 1) * (sh.radius || 0), 0, 0); d.set(0, 1, 0);
      break;
    case 17: { // donut
      const th = rand() * Math.PI * 2;
      p.set(Math.cos(th) * sh.radius, Math.sin(th) * sh.radius, 0); d.set(Math.cos(th), Math.sin(th), 0);
      break;
    }
    case 18: // rectangle in XY, +z
      p.set((rand() - 0.5) * (sh.scale?.[0] ?? 1), (rand() - 0.5) * (sh.scale?.[1] ?? 1), 0); d.set(0, 0, 1);
      break;
    default: break;
  }
  // the box family (5 Box, 15 BoxShell, 16 BoxEdge) and the rectangle took the scale as their size above — once (user
  // decision 2026-10-08, re-report: BoxShell / BoxEdge were scaled twice — 望 S3's lizi_l lines spread ±2 × ±4.5
  // tiles instead of ±1 × ±1.5; 58 systems of 36 prefabs)
  if (sh.type !== 5 && sh.type !== 15 && sh.type !== 16 && sh.type !== 18 && sh.scale) p.multiply(SCALE.set(sh.scale[0], sh.scale[1], sh.scale[2]));
  if (sh.rotE && (sh.rotE[0] || sh.rotE[1] || sh.rotE[2])) {
    tmpQ.setFromEuler(shapeE.set(sh.rotE[0] * D2R, sh.rotE[1] * D2R, sh.rotE[2] * D2R, 'YXZ'));
    p.applyQuaternion(tmpQ); d.applyQuaternion(tmpQ);
  }
  if (sh.pos) { p.x += sh.pos[0] ?? 0; p.y += sh.pos[1] ?? 0; p.z += sh.pos[2] ?? 0; }
  if (sh.randDir) d.lerp(shapeV.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(), sh.randDir).normalize();
}

// ---------------------------------------------------------------- effect instance

const live = [];
/** Clip tracks on material properties: the uniform each drives, and a colour component → vector axis. */
const CLIP_UNIFORM = { _Amount: 'uAmount', _Opacity: 'uOpacity', _BorderWidth: 'uBorder', _TintColor: 'uTint', _MainColor: 'uTint', _Color: 'uTint',
  // local patch: the … Double dissolve's two amounts / borders
  _Amount_01: 'uAmount', _Amount_02: 'uAmount2', _BorderWidth_01: 'uBorder', _BorderWidth_02: 'uBorder2',
  // local patch: textures' tiling / offset (a line's scrolling dots / flow)
  _MainTex_ST: 'uMainST', _DissolveTex_ST: 'uDissolveST', _DisturbTex_ST: 'uDisturbST', _NoiseTex_ST: 'uDisturbST', _DissolveIntensity: 'uAmount',
  // 2026-10-14: Disturb Origin / Anchor's noise textures and strengths
  _DisturTex_ST: 'uDisturbST', _DisturTex_02_ST: 'uDisturb2ST', _MainColorACtrl: 'uACtrl',
  // 2026-10-14: the tracks no uniform took before — the Double family's second dissolve tiling, Rim's power, Mask's added texture
  _DissolveTex_02_ST: 'uDissolve2ST', _RimPower: 'uRimPower', _AddTex_ST: 'uAddST' };
/** 2026-10-14: float tracks that drive one axis of a vector uniform (Disturb Origin / Anchor's strengths and anchors). */
const CLIP_COMP = { _IntensityU: ['uDisturbStr', 'x'], _IntensityV: ['uDisturbStr', 'y'], _AnchorU: ['uDisAnchor', 'x'], _AnchorV: ['uDisAnchor', 'y'],
  _IntensityU_02: ['uDisturb2Str', 'x'], _IntensityV_02: ['uDisturb2Str', 'y'], _AnchorU_02: ['uDisturb2Anchor', 'x'], _AnchorV_02: ['uDisturb2Anchor', 'y'] };
/**
 * local patch: a renderer whose node rests more than this far under the ground (board height, tiles) is cut at the floor
 * (FxInstance opts.floor): the client's map hides it by depth (surtr_skill_03_range gx_glow 0.42 under, 5 tiles away;
 * lemuen_skill_03_crosshair_range ring01/02; mudrok/blemsh range guangmang). Renderers on the ground whose particles merely
 * sink a little (texas2 S3's smoke) are left whole [ASSUMED: whether the client's ground hides those is not known].
 */
const UNDER_FLOOR = 0.25;
/** local patch: an order-0 mesh at least this tall (tiles, board height) wraps the unit — drawn in front (FxInstance split). */
const WRAP_H = 0.3;
/** local patch: … unless it starts more than this far behind the unit (rows, +y) — it stands behind her, not around her. */
const WRAP_BEHIND = 0.5;
const tmpBox = new THREE.Box3();
/**
 * local patch: whether the order-0 mesh `mesh` wraps the unit at `obj`'s origin (its source geometry's bounds through its
 * node, in `obj`'s space): taller than WRAP_H and reaching the unit's own tile row. 蛇屠箱 / 마터호른 S2's domes do (front,
 * official video); 赤刃明霄陈 S3's dragon head `longtou` lies 0.8–1.6 rows behind her (back — official capture: the dragon
 * is behind her) [추정: the client sorts order 0 by distance; the Spine's own sort point is not known].
 */
function wrapsUnit(mesh, obj) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  if (!pos) return false;
  tmpBox.setFromBufferAttribute(pos);
  tmpM.copy(obj.matrixWorld).invert().multiply(mesh.matrixWorld);
  tmpBox.applyMatrix4(tmpM);
  return tmpBox.max.z - tmpBox.min.z > WRAP_H && tmpBox.min.y <= WRAP_BEHIND;
}
/** local patch (FxInstance opts.ahead): rows in front of the unit (−y, nearer the camera) where an order-0 system counts as ahead. */
const AHEAD_Y = 0.1;
/** Whether `node` sits more than AHEAD_Y in front of `obj`'s origin (the unit's feet), in `obj`'s frame. */
function aheadOf(node, obj) {
  node.getWorldPosition(tmpV);
  obj.worldToLocal(tmpV);
  return tmpV.y < -AHEAD_Y;
}
/** local patch: three.js layers of a split instance's renderers (FxInstance opts.split) — behind / in front of the units. */
export const FX_BACK = 1, FX_FRONT = 2;
const CLIP_AXIS = { r: 'x', g: 'y', b: 'z', a: 'w', x: 'x', y: 'y', z: 'z', w: 'w' };
// local patch: a clip's GameObject m_IsActive binding (Mecanim type 1, crc32('m_IsActive'); the extract keeps it as 'attr:…')
const ACTIVE_PROP = 'attr:2086281974';
const clipE = new THREE.Euler();
const IDENTITY16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export class FxInstance {
  /**
   * @param {any} def FxLibrary.load result
   * @param {{ quality?: 'high'|'medium'|'low', facing?: 1|-1, dir?: {x: number, y: number}|null, body?: string|null, speed?: number, delays?: boolean, scale?: number, floor?: number|null, split?: boolean, atSpawn?: boolean, pivot?: boolean, hold?: number|null, ahead?: boolean }} [opts]
   *   facing / dir / body (maintainer decision 2026-10-11 「공식대로」): the effect turns as the client's `ParticleEffect.FaceTo`
   *   (RVA 0xCB1DC0) does by its root `face` record (render/fx/face.js faceTurn) — `dir` = the direction it is played with
   *   (default ±x by `facing`, the owner's drawn side), `body` = the four-way facing of the unit it is created on (for
   *   `_useBodyRotation`); it is mirrored only by a FollowMountPoint with `_followScaleSign` (the Spine flip, `facing`). A
   *   prefab without the record (no ParticleEffect root: trails, lines) keeps the old mirror by `facing`.
   *   speed / delays (maintainer decision 2026-10-11): nothing is drawn until the root FxDelay `_delayTime` (effect time)
   *   plus `_delayToPlay` (game time × `speed`, the playback speed it runs at) have passed, and a branch with its own FxDelay
   *   (node `delay`, game time) or a `_subFXDelayConfigs` entry (node `sdelay`, effect time) starts that much later
   *   (`FxDelay.OnEnable` RVA 0x34C1650 / `Effect._DelayToActiveGameObject`); `delays: false` plays everything at once.
   *   local patch: floor = the board height of the ground under it (default 0): what lies more than 0.05 below is not drawn
   *   (null: no cut); split = each renderer on layer FX_FRONT or FX_BACK by its Unity sorting (sortingOrder > 0, or 0 with a
   *   negative sorting fudge = in front of the units, whose Spine renderers are Default / order 0 and write no depth) —
   *   without it everything stays on layer 0; atSpawn (default on; false keeps it) = drop the root node's own position (the
   *   caller's placement replaces it); pivot (default on; false ignores it) = billboard / aligned / horizontal quads use their
   *   renderer's pivot (uPivot) — on for every effect by the maintainer's decision 2026-10-08 (docs/LOCAL-PATCH.md 「정예 기물 금빛」);
   *   ahead (default on, with split; false keeps order 0 behind) = an order-0 particle system whose node lies in front of the unit
   *   goes to FX_FRONT — the elite glow first, every split effect by the maintainer's decision 2026-10-08
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.hold = opts.hold ?? null; // local patch: freeze the effect at this time (s) — a mark that stays once shown
    this.q = QUALITY[opts.quality] || QUALITY.high;
    this.time = 0;
    this.object = new THREE.Group();            // placed in board coordinates by the caller
    const unity = new THREE.Group();            // Unity battle frame: mirror z (z = −height)
    const facing = opts.facing || 1;
    const turn = faceTurn(def?.face, opts.dir || { x: facing, y: 0 }, opts.body ?? null);
    this.turn = turn;
    // the mirror: by FollowMountPoint `_followScaleSign` (its point's scale sign = the Spine flip) when the prefab has its
    // face record, else (no ParticleEffect root) the old rule — mirrored when its owner faces left
    const mirror = turn ? (def?.mount?.followScaleSign ? facing : 1) : facing;
    unity.scale.set(mirror * (opts.scale || 1), opts.scale || 1, -(opts.scale || 1));
    this.object.add(unity);
    this.unity = unity;
    this.nodes = [];
    this.systems = [];
    this.meshMats = [];
    this.trails = [];
    this.lines = [];   // local patch: LineRenderers
    if (!def || !this.q.budget) { this.empty = true; return; }
    const speed = Number(opts.speed) > 0 ? Number(opts.speed) : 1;
    const delays = opts.delays !== false;
    const f = def.face || {};
    // the root's wait (effect seconds): FxDelay `_delayTime` ÷ the speed in game time = `_delayTime` here; `_delayToPlay`
    // is game time (`_randomPlayDelay`: a random part of it)
    this.wait = delays ? (Number(f.fxDelay) > 0 ? Number(f.fxDelay) : 0)
      + (Number(f.delay) > 0 ? (f.rnd ? Math.random() : 1) * Number(f.delay) * speed : 0) : 0;
    if (this.wait > 0) unity.visible = false;
    const t0 = [];   // each node's start (effect seconds after the root shows): its own and its parents' branch delays
    const skins = [];
    this.skeletons = [];
    this.branches = [];
    def.nodes.forEach((n, i) => {
      const o = new THREE.Group();
      o.name = n.name;
      // local patch (opts.atSpawn, default on — every effect, maintainer decision 2026-10-08): an effect the client instantiates at
      // a spawn point drops its root's own position (Unity Instantiate(prefab, position, …) overwrites it) — the elite glow's
      // root z −0.25 lifted the whole glow a quarter tile; 104 prefabs have one, mostly projectile trails, which flew 0.4–0.65
      // tile off their shot's line (空弦 archet, 丰川祥子 oblvns).
      // [ASSUMED] (the client code is native): the recording's band height matches with it dropped, not with it kept. The child
      // static_offset stays — the client's ParticleEffect names it (CHILD_NAME_STATIC_OFFSET). `_overwriteHeight` /
      // `_heightOffset` are C# (decompile check 2026-10-10: Effect._InitLocationFromEntity sets localPosition.z =
      // −(entity height + offset) only when the flag is on — of the pool's prefabs only thorn2_skill_01_range has it)
      if (n.pos && !(opts.atSpawn !== false && n.parent < 0)) o.position.set(n.pos[0], n.pos[1], n.pos[2]);
      if (n.rot) o.quaternion.set(n.rot[0], n.rot[1], n.rot[2], n.rot[3]);
      if (n.scale) o.scale.set(n.scale[0], n.scale[1], n.scale[2]);
      o.visible = n.active !== false;
      (n.parent >= 0 ? this.nodes[n.parent] : unity).add(o);
      this.nodes[i] = o;
      const own = !delays || n.parent < 0 ? 0 : (Number(n.delay) > 0 ? Number(n.delay) * speed : 0) + (Number(n.sdelay) > 0 ? Number(n.sdelay) : 0);
      t0[i] = (n.parent >= 0 ? t0[n.parent] || 0 : 0) + own;
      o.userData.t0 = t0[i];
      if (own > 0 && o.visible) { o.visible = false; this.branches.push({ o, at: t0[i], on: false }); }
      // 2026-10-14: a SkinnedMeshRenderer (n.skin) is drawn like a mesh, by its bones (bound below, once every node exists)
      const mr = n.mesh || n.skin;
      const src = mr && def.geoms[mr.mesh];
      if (src && (!n.skin || src.userData.bind)) {
        const mat = makeMaterial(def.materials[mr.mat], def.lib);
        mat.uniforms.uMode.value = 4;
        const g = new THREE.InstancedBufferGeometry();
        g.index = src.index;
        g.setAttribute('position', src.getAttribute('position'));
        if (src.getAttribute('uv')) g.setAttribute('uv', src.getAttribute('uv'));
        if (n.skin) { g.setAttribute('skinIndex', src.getAttribute('skinIndex')); g.setAttribute('skinWeight', src.getAttribute('skinWeight')); }
        useMeshAttrs(g, src, mat); // local patch
        const one = (name, v) => g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(v), v.length));
        one('iPos', [0, 0, 0]); one('iSize', [1, 1, 1]); one('iRot', [0, 0, 0]); one('iColor', [1, 1, 1, 1]);
        one('iC1', [0, 0, 0, 0]); one('iC2', [0, 0, 0, 0]); one('iUV', [0, 0, 1, 1]); one('iVel', [0, 0, 0]);
        g.instanceCount = 1;
        const mesh = n.skin ? new THREE.SkinnedMesh(g, mat) : new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = mr.order || 0;
        o.add(mesh);
        if (n.skin) skins.push({ mesh, skin: n.skin, bind: src.userData.bind });
        this.meshMats[i] = mat;
        mat.userData.t0 = t0[i];
      }
    });
    // Unity skins in world space: Σ weight · bone.localToWorld · bindpose · vertex — the renderer's own transform is not used.
    // A SkinnedMesh bound with an identity bind matrix in 'attached' mode gives the same (bone.matrixWorld · boneInverse, then
    // back through the mesh's own matrix); that matrix is the effect root's, not the node's — a node may be flattened to scale
    // 0 (水月 S2's tentacle `2`: y 0), which would collapse the mesh. Its node still switches it on and off
    for (const k of skins) {
      const bones = k.skin.bones.map((b) => this.nodes[b]);
      if (bones.some((b) => !b)) { k.mesh.visible = false; continue; }
      const sk = new THREE.Skeleton(bones, bones.map((_, j) => new THREE.Matrix4().fromArray(k.bind[j] || IDENTITY16)));
      this.skeletons.push(sk);   // its bone texture is freed with the effect (dispose)
      k.mesh.bind(sk, new THREE.Matrix4());
      k.mesh.updateMatrixWorld = function () { this.matrixWorld.copy(unity.matrixWorld); this.bindMatrixInverse.copy(this.matrixWorld).invert(); };
    }
    if (turn) this.applyTurn(turn);
    def.nodes.forEach((n, i) => {
      if (n.trailR) this.trails.push(new TrailRenderer(n.trailR, this.nodes[i], unity, def));
      if (n.lineR && def.materials[n.lineR.mat]) this.lines.push(new LineRenderer(n.lineR, this.nodes[i], unity, def)); // local patch
      if (n.ps && (n.ps.render?.mat || n.ps.render?.trailMat)) {
        // per-system cap: the extract's max, shared out of the quality budget
        this.systems.push(new ParticleSystem(n.ps, this.nodes[i], unity, def, { q: this.q, cap: Math.ceil(this.q.budget / 8), pivot: opts.pivot !== false }));
      }
      // 2026-10-14: the node's FxUVTweener moves its renderer's material (Unity GetComponent<Renderer>: a node has one)
      if (n.uvt) {
        const o = this.nodes[i];
        const sys = this.systems.find((s) => s.node === o), ln = this.lines.find((t) => t.node === o), tr = this.trails.find((t) => t.node === o);
        if (this.meshMats[i]) uvTween(this.meshMats[i], n.uvt, def.materials[(n.mesh || n.skin).mat]);
        else if (sys) uvTween(sys.material, n.uvt, def.materials[n.ps.render.mat]);
        else if (ln) uvTween(ln.batch.material, n.uvt, def.materials[n.lineR.mat]);
        else if (tr) uvTween(tr.batch.material, n.uvt, def.materials[n.trailR.mat]);
      }
    });
    // local patch (maintainer report, maintainer's decision 2026-10-08): every clip of the prefab plays — a nested sub-prefab has
    // its own Animator (缄默德克萨斯 S2's texas2_birth_02_start: the root + 4 slashes; clips[0] alone left the slashes frozen
    // on their material defaults). The extract resolves each clip's nodes into the whole tree; each starts when its branch shows
    // (2026-10-11: the sub-prefabs' own FxDelay 0–0.3 s, node `delay` — bindTrack `off`) and the effect's clip time is the longest
    this.clips = def.clips || [];
    this.clipLen = this.clips.reduce((m, c) => Math.max(m, c.len || 0), 0);
    this.meshMatList = this.meshMats.filter(Boolean);
    // local patch: the floor cut and the per-renderer layers
    if (opts.floor !== null) {
      const cut = (opts.floor || 0) - 0.05;
      unity.updateMatrixWorld(true);
      const under = (node) => node.getWorldPosition(tmpV).z - this.object.position.z < -UNDER_FLOOR;
      const setFloor = (m, node) => { if (m.userData.ztest && under(node)) m.uniforms.uFloor.value = cut; };
      this.meshMats.forEach((m, i) => { if (m) setFloor(m, this.nodes[i]); });
      for (const s of this.systems) { setFloor(s.material, s.node); if (s.trailBatch) setFloor(s.trailBatch.material, s.node); }
      for (const t of this.trails) setFloor(t.batch.material, t.node);
      for (const t of this.lines) setFloor(t.batch.material, t.node); // local patch
    }
    this.layerN = [0, 0, 0];
    if (opts.split) {
      const put = (mesh, front) => { const k = front ? FX_FRONT : FX_BACK; mesh.layers.set(k); this.layerN[k]++; };
      this.object.updateMatrixWorld(true);
      def.nodes.forEach((n, i) => {
        if (this.meshMats[i]) {
          const mesh = this.nodes[i].children.find((c) => c.isMesh && c.material === this.meshMats[i]);
          // local patch (maintainer report 2026-10-07, video: 蛇屠箱's S2 hex dome covers her): an order-0 mesh that stands up
          // around the unit (a dome / shell, > WRAP_H tall) is in front — the client sorts order 0 by distance; a flat
          // ground decal stays behind
          const order = (n.mesh || n.skin).order || 0;
          if (mesh) put(mesh, order > 0 || (!order && wrapsUnit(mesh, this.object)));
        }
      });
      // local patch (opts.ahead, maintainer report 2026-10-08: the elite glow's gold band covers the legs in the game; every split
      // effect by the maintainer's decision 2026-10-08 — 19 caster / ground prefabs): an order-0 system whose node lies in front of
      // the unit (nearer the camera) is drawn over it — the client sorts order 0 by distance [ASSUMED for all but the glow:
      // in front of / behind every unit at once, not sorted per unit]
      for (const s of this.systems) {
        const r = s.ps.render, o = r.order || 0;
        const front = o > 0 || (o === 0 && ((r.fudge || 0) < 0 || (opts.ahead !== false && aheadOf(s.node, this.object))));
        if (s.draws) put(s.mesh, front); else s.mesh.layers.set(front ? FX_FRONT : FX_BACK);
        if (s.trailBatch) put(s.trailBatch.mesh, front);
      }
      for (const t of this.trails) put(t.batch.mesh, (t.tr.order || 0) > 0);
      for (const t of this.lines) put(t.batch.mesh, (t.tr.order || 0) > 0); // local patch
    } else this.layerN[0] = 1;
    // (2026-10-10, user report: buff effects that vanish) a clip with Unity's loop flag (fx_extract.py `loop` = the clip's
    // m_LoopTime) repeats — it was held on its last frame, and an effect whose only motion was such a clip ended with it
    this.clipTracks = this.clips.flatMap((c) => c.tracks.map((tr) => this.bindTrack(tr, c.len || 0)).filter(Boolean)
      .map((b) => (c.loop && c.len > 0 ? Object.assign(b, { loop: true }) : b)));
    this.clipLoops = this.clips.some((c) => c.loop && c.len > 0);
    for (const b of this.clipTracks) if (b.off > 0) this.clipLen = Math.max(this.clipLen, b.off + (b.len || 0)); // a delayed branch's clip ends later
    // …and a mesh renderer is drawn while its effect lives (Unity keeps a MeshRenderer on until the effect object goes): a
    // prefab with meshes ends only when it is stopped (a buff with its owner, a one-shot at its caller's `until`) — the skill
    // buffs (浊心斯卡蒂 S2, 寒芒克洛丝 S2, 号角 S3 …: meshes only, no clip, no particles) were done on their first frame
    this.holdMeshes = this.meshMatList.length > 0;
    // local patch (m_IsActive, maintainer's decision 2026-10-08 「공식과 동일하게」 — report: 缄默德克萨斯 S3's falling blades are
    // switched off as they land): the particle systems / trails under a node a clip switches on and off follow it (meshes and
    // lines follow by their node's visibility). And those under a node inactive from the start (maintainer 2026-10-08 「일단 꺼봐」):
    // in 164 of the 166 such prefabs nothing in the prefab switches the node on (maintainer's notes 2026-10-08, the
    // workspace root) — 아르케토 S3's stray `smoke` lives on, switched on, in archet_skill_03_start_01
    const switched = new Set(this.clipTracks.filter((b) => b.kind === 'active').map((b) => b.o));
    const under = (o) => { for (let p = o; p && p !== unity; p = p.parent) if (switched.has(p) || !p.visible) return true; return false; };
    this.gated = [...this.systems, ...this.trails].filter((x) => under(x.node)).map((x) => ({ x, on: true }));
    this.clipV = [];
    live.push(this);
    while (live.length > PLAYER_CAP) live[0].dispose(); // the oldest goes (dispose removes it from `live`)
  }

  /**
   * ParticleEffect.FaceTo on the prefab's named children (faceTurn): 'rotation_y' / 'rotation_z' 180° (FLIP_TWO_SIDE; unflipped:
   * identity, as the client sets it), 'rotation_z' by `z` degrees (FOUR_DIRECTION / FIXED_DIRECTION), 'body' by `any`
   * degrees about z (ANY_DIR). The first node of the name anywhere in the tree (the prefabs keep them under static_offset).
   */
  applyTurn(turn) {
    const named = (name) => this.nodes.find((o) => o && o.name === name);
    const ry = named('rotation_y'), rz = named('rotation_z');
    if (turn.flip != null) {
      if (ry) ry.rotation.set(0, turn.flip ? Math.PI : 0, 0);
      if (rz) rz.rotation.set(0, 0, turn.flip ? Math.PI : 0);
    }
    if (turn.z != null && rz) rz.rotation.set(0, 0, (turn.z * Math.PI) / 180);
    if (turn.any != null) { const b = named('body'); if (b) b.rotation.set(0, 0, (turn.any * Math.PI) / 180); }
  }

  /** What a clip track drives, resolved once (applyClip runs every frame). */
  bindTrack(tr, len) {
    const o = this.nodes[tr.node];
    if (!o) return null;
    const r = this.bindTrack0(tr, len, o);
    if (r) r.off = o.userData.t0 || 0;   // its branch's start (a nested sub-prefab's Animator starts when it shows)
    return r;
  }

  bindTrack0(tr, len, o) {
    if (tr.prop === 'pos' || tr.prop === 'scale' || tr.prop === 'quat' || tr.prop === 'euler') return { tr, o, kind: tr.prop, len };
    if (tr.prop === 'width') { const ln = this.lines.find((t) => t.node === o); return ln ? { tr, o, kind: 'width', ln, len } : null; } // local patch
    if (tr.prop === ACTIVE_PROP && tr.type === 1) return { tr, o, kind: 'active', len }; // local patch: m_IsActive
    if (!tr.prop.startsWith('mat:')) return null;
    const mat = this.meshMats[tr.node] || this.systems.find((s) => s.node === o)?.material
      || this.trails.find((t) => t.node === o)?.batch.material || this.lines.find((t) => t.node === o)?.batch.material;
    if (!mat) return null;
    const [name, comp0] = tr.prop.slice(4).split('.');
    const uname = CLIP_UNIFORM[name] || CLIP_COMP[name]?.[0], comp = comp0 || CLIP_COMP[name]?.[1];
    if (/^_Anchor/.test(name) && mat.uniforms.uDisMode?.value !== 2) return null;   // only Disturb Anchor declares them
    const u = mat.uniforms[uname];
    if (!u) return null;
    if (mat.userData.uvt) mat.userData.uvt = mat.userData.uvt.filter((e) => e.u !== u); // uvTween: the clip's property block wins
    const k = uname === 'uTint' ? 2 : 1;   // the material tint carries the shaders' ×2 (makeMaterial)
    return comp ? { tr, o, kind: 'matComp', u, axis: CLIP_AXIS[comp], k, len } : { tr, o, kind: 'mat', u, len };
  }

  /** local patch: whether layer k (0, or FX_BACK / FX_FRONT of a split instance) has a renderer of this effect. */
  hasLayer(k) { return !this.empty && (this.layerN?.[k] || 0) > 0; }

  /**
   * 2026-10-10: a line effect's two ends (client LineEffectEmitterDynamic, fx_extract.py `lineDyn`): every LineRenderer of it
   * runs from point `a` to `b` ({x, y, z} in the coordinates the effect's object sits in) from now on; null = its authored points.
   */
  setLine(a, b) {
    const ends = a && b ? [{ x: +a.x || 0, y: +a.y || 0, z: +a.z || 0 }, { x: +b.x || 0, y: +b.y || 0, z: +b.z || 0 }] : null;
    for (const t of this.lines) t.ends = ends;
  }

  /** Game seconds × speed (effect seconds) before the effect and its last delayed branch start (0 when nothing waits). */
  get lead() { return (this.wait || 0) + (this.branches || []).reduce((m, b) => Math.max(m, b.at), 0); }

  /** End emission (looping buffs); `now` also removes the live particles. */
  stop(now = false) {
    this.stopping = true;
    for (const s of this.systems) { s.stop(); if (now) while (s.n) s.kill(s.n - 1); }
    if (now) this.time = Infinity;
  }

  /**
   * 2026-10-11 (user report: projectiles that vanish late — 언더플로우, 애쉬락): a projectile's `_mainEffect` as its projectile
   * stops (`Projectile.OnProjectileStop` RVA 0x5FC1A0 → `ClearMainEffectIfNot` 0x5F9550 → `Effect.FinishMe` 0xC88FE0):
   * `ProjectileEffect.OnFinish` (0xCB42B0) stops the effect's first particle system with its children (`Awake` 0xCB3A00:
   * GetComponentInChildren<ParticleSystem> — the active ones, depth first: the extract's node order) and switches off its
   * `_inactiveOnFinish` nodes (fx_extract.py `offFinish`: the bullet, shell, arrow head …), whose particles go with them. The
   * rest keeps running until the caller ends it `finish` s later (the pool's recycle). [ASSUMED: a system the extract
   * dropped (no material) is not counted as the first one]
   */
  finishMain() {
    if (this.empty || this.disposed || this.offFinish) return;
    const nodes = this.def.nodes;
    const activeIn = (i) => { for (let k = i; k >= 0; k = nodes[k].parent) if (nodes[k].active === false) return false; return true; };
    const within = (o, top) => { for (let p = o; p && p !== this.unity; p = p.parent) if (p === top) return true; return false; };
    const first = nodes.findIndex((n, i) => n.ps && activeIn(i));
    if (first >= 0) for (const s of this.systems) if (within(s.node, this.nodes[first])) s.stop();
    this.offFinish = (this.def.offFinish || []).map((i) => this.nodes[i]).filter(Boolean);
    for (const o of this.offFinish) {
      o.visible = false;
      for (const s of this.systems) if (within(s.node, o)) { s.stop(); while (s.n) s.kill(s.n - 1); }
    }
  }

  get done() {
    if (this.empty || this.disposed) return true;
    // ended while it waited for its FxDelay: it never shows (the client's FinishMe recycles it hidden)
    if (this.wait > 0) return !!this.stopping;
    if (!this.stopping && this.branches.some((b) => !b.on)) return false;
    const clipDone = !this.clips.length || this.stopping || (this.time >= this.clipLen && !this.clipLoops);
    return clipDone && this.systems.every((s) => !s.alive) && this.trails.every((t) => !t.alive || this.time > this.clipLen + t.tr.time)
      && (!this.lines.length || !!this.stopping) // local patch: a line stays until its effect is ended
      && (!this.holdMeshes || !!this.stopping);
  }

  update(dt) {
    // disposed: ended here (PLAYER_CAP) while its owner still holds it — it must not keep simulating unseen
    if (this.empty || this.disposed) return;
    if (this.wait > 0) { // its root FxDelay / _delayToPlay: nothing drawn or run yet
      if (this.stopping) return;
      const w = Math.min(this.wait, dt);
      this.wait -= w; dt -= w;
      if (this.wait > 1e-9) return;
      this.wait = 0;
      this.unity.visible = true;
    }
    if (this.hold != null && !this.stopping && this.time + dt > this.hold) dt = Math.max(0, this.hold - this.time); // local patch
    this.time += dt;
    if (this.clipTracks.length) this.applyClip(this.time);
    for (const b of this.branches) { // a delayed branch shows at its start (its systems start then — the gate below)
      if (this.time < b.at) b.o.visible = false;
      else if (!b.on) { b.on = true; b.o.visible = true; }
    }
    if (this.offFinish) for (const o of this.offFinish) o.visible = false;   // finishMain: off for good
    for (const g of this.gated) { // local patch: m_IsActive — on only while every node above it is
      let on = true;
      for (let p = g.x.node; p && p !== this.unity; p = p.parent) if (!p.visible) { on = false; break; }
      if (on === g.on) continue;
      g.on = on;
      if (g.x instanceof ParticleSystem) { if (!on || !this.stopping) g.x.setActive(on); } else g.x.off = !on;
    }
    this.followWorld();
    for (const s of this.systems) s.update(dt, this.time - (s.node.userData.t0 || 0));
    for (const t of this.trails) t.update(dt, this.time - (t.node.userData.t0 || 0));
    for (const t of this.lines) t.update(dt, this.time - (t.node.userData.t0 || 0)); // local patch
    for (const m of this.meshMatList) setTime(m, this.time - (m.userData.t0 || 0));
  }

  /**
   * local patch: Unity's world-space particles and trails stay where they were made when the effect moves (赤刃明霄陈 S3's
   * 剑气 carries its trail across the board: the dragon's body and tail are its trails). They are kept in root space here,
   * so when the root has moved since the last frame they are moved back by that much. A still effect: no change.
   */
  followWorld() {
    const root = this.unity;
    root.updateWorldMatrix(true, false);
    const e = root.matrixWorld.elements;
    const prev = this.rootAt || (this.rootAt = [e[12], e[13], e[14]]);
    if (prev[0] === e[12] && prev[1] === e[13] && prev[2] === e[14]) return;
    const off = tmpV.set(prev[0], prev[1], prev[2]).applyMatrix4(tmpM.copy(root.matrixWorld).invert());
    prev[0] = e[12]; prev[1] = e[13]; prev[2] = e[14];
    for (const s of this.systems) {
      if (!s.world) continue;
      for (let i = 0; i < s.n; i++) { s.pos[i * 3] += off.x; s.pos[i * 3 + 1] += off.y; s.pos[i * 3 + 2] += off.z; }
    }
    for (const t of this.trails) t.shift(off.x, off.y, off.z);
  }

  /** Every clip's tracks at effect time t, each held on its own clip's last frame. */
  applyClip(t) {
    const v = this.clipV;
    for (const b of this.clipTracks) {
      const tb = Math.max(0, t - (b.off || 0));
      const curves = b.tr.curves, tc = b.loop ? tb % b.len : Math.min(tb, b.len);
      v.length = curves.length;
      for (let i = 0; i < curves.length; i++) v[i] = evalClipCurve(curves[i], tc);
      const o = b.o;
      switch (b.kind) {
        case 'pos': o.position.set(v[0], v[1], v[2]); break;
        case 'scale': o.scale.set(v[0], v[1], v[2]); break;
        case 'quat': o.quaternion.set(v[0], v[1], v[2], v[3]).normalize(); break;
        case 'euler': o.quaternion.setFromEuler(clipE.set(v[0] * D2R, v[1] * D2R, v[2] * D2R, 'YXZ')); break;
        case 'matComp': if (b.u.value?.isVector4 || b.u.value?.isVector2) b.u.value[b.axis] = v[0] * b.k; break;
        case 'width': b.ln.w = v[0]; break; // local patch
        case 'active': o.visible = v[0] > 0.5; break; // local patch: m_IsActive
        default: b.u.value = v[0];
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.systems) s.dispose();
    for (const t of this.trails) t.dispose();
    for (const t of this.lines) t.dispose(); // local patch
    for (const m of this.meshMats) m?.dispose();
    for (const sk of this.skeletons || []) sk.dispose();
    this.object.removeFromParent();
    const i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
  }
}

/** Live particle count (diagnostics / tests). */
export const fxStats = () => ({ particles: liveParticles, instances: live.length });

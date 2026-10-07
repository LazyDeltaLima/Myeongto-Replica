// render/fxplayer.js — official battle effects (local patch, docs/LOCAL-PATCH.md): plays the effect prefabs that
// tools/local-extract/fx_extract.py exported from a local client (public/assets/local/fx/**) in a three.js scene that
// uses the battlefield camera (render/projection.js — Arknights' own 30° / 40° camera, so the effects keep their framing).
//
// An effect = a node tree (Unity transforms) with particle systems, plain meshes and one Mecanim clip. The whole tree is
// simulated in Unity's battle frame (x = col, y = row, z = −height) under a root that mirrors z, so every module keeps
// Unity's own semantics (shapes, alignments, euler order ZXY) and the scene sees board coordinates.
//
// Subset of Unity's particle system: start values (constant / curve / random two curves / random two constants), rate
// and bursts, shapes (sphere, hemisphere, cone, box, circle, edge, rectangle, donut), velocity / force / limit velocity /
// noise (cheap), color / size / rotation over lifetime, texture sheet frames, custom data (two vec4 streams), local or
// world simulation; renderers billboard / stretched / horizontal / vertical / mesh. Not drawn: trails, sub emitters,
// collisions. Shaders: one uber shader standing in for the Torappu particle shaders (main texture with UV scroll,
// distortion, dissolve with edge, colour ramp, the material's blend factors).
//
// Cost control (DESIGN §17.3 rules): one draw call per particle system (instanced, skipped while it has no particle),
// particle arrays preallocated and reused, no per-frame allocation, curves flattened to typed arrays at load, a
// system's instance data in one interleaved buffer (one upload, by the used range), trail strips uploaded by the used
// range, a global particle budget per quality ('high' 6000 / 'medium' 2500 / 'low' 0 = the procedural FX only),
// emission scaled by quality, at most MAX_INSTANCES effects alive (the oldest is ended; an ended instance reports
// done), textures and meshes shared. A speed-up must not change the picture: bench/fx/compare.mjs
// renders every effect with the git version and the working file and compares the pixels.
//
//   const lib = new FxLibrary('/assets/local/fx/');  const def = await lib.load('chen3', 'chen3_skill_01_start_01');
//   const fx = new FxInstance(def, { quality });  scene.add(fx.object);  fx.object.position.set(col, row, 0);
//   each frame: fx.update(dtSeconds, camera);  if (fx.done) { scene.remove(fx.object); fx.dispose(); }

import * as THREE from '../../vendor/three.module.js';

export const QUALITY = Object.freeze({
  high: { budget: 6000, emission: 1 },
  medium: { budget: 2500, emission: 0.6 },
  low: { budget: 0, emission: 0 },
});
export const MAX_INSTANCES = 24;
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
  uniform int uMode; uniform float uLengthScale; uniform float uVelScale; uniform int uAlign;
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  // local patch: vH = the board height (scene z) of the fragment — what lies under the floor is cut (FRAG uFloor; the
  // official map's opaque ground hides it by depth); vN / vVP = view-space normal / position of a mesh (the Rim shaders)
  varying float vH; varying vec3 vN; varying vec3 vVP;
  // the scene height of a view-space offset (the camera has no scale: the inverse view rotation is its transpose)
  float hOfView(vec3 off) { return (vec4(off, 0.0) * viewMatrix).z; }
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
      vec3 p = rm * (position * iSize);
      vH = (modelMatrix * vec4(iPos + p, 1.0)).z;
      if (uRim) { vN = normalMatrix * (rm * (normal / max(abs(iSize), vec3(1e-4)))); vVP = (modelViewMatrix * vec4(iPos + p, 1.0)).xyz; }
      gl_Position = projectionMatrix * modelViewMatrix * vec4(iPos + p, 1.0);
      return;
    }
    vec2 c = position.xy * iSize.xy;        // quad corner, -0.5..0.5
    float cr = cos(-iRot.z), sr = sin(-iRot.z);
    if (uMode == 1) {                       // stretched billboard: along the view-space velocity
      vec4 cv = modelViewMatrix * vec4(iPos, 1.0);
      vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
      vec2 d = length(vv.xy) > 1e-5 ? normalize(vv.xy) : vec2(1.0, 0.0);
      // local patch (user video 2026-10-07, 锏 S3: long thin slash lines): the length is the size's y × lengthScale, the
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
  varying vec2 vUv; varying vec4 vColor; varying vec4 vC1; varying vec4 vC2;
  void main() {
    if (vH < uFloor) discard;   // local patch: under the floor (FxInstance opts.floor)
    vec2 uv = vUv * uMainST.xy + uMainST.zw + uMainSpeed * uTime;
    // custom data (Torappu (CustomData) shaders, streams Custom1XYZW + Custom2XYZW): custom1.xy = main uv offset,
    // custom1.zw = extra distortion, custom2.x = dissolve amount — [ASSUMED] from the curves, tuned by eye
    if (uCustom) uv += vC1.xy;
    vec2 dis = vec2(0.0);
    if (uHasDisturb) {
      vec2 duv = vUv * uDisturbST.xy + uDisturbST.zw + uDisturbSpeed * uTime;
      // local patch (client DXBC): the noise's red channel times the strength, not centred
      vec2 n = vec2(texture2D(uDisturb, duv).r);
      dis = n * (uDisturbStr + (uCustom ? vC1.zw : vec2(0.0)));
      uv += dis * uDisturbMain;
    }
    vec4 tex = texture2D(uMain, uv);
    vec4 col = tex * uTint * vColor;
    // local patch (user report 2026-10-07, 赤刃明霄陈 S3's range too bright): the Ram family multiplies by _RamTex sampled at
    // the renderer's own uv through its tiling / offset — all of rgba (the client's DXBC: Ram/Disturb(CustomData),
    // Ram/Add, Ram/AlphaBlend) — not a ramp looked up by the dissolve edge as assumed before
    if (uHasRam) col *= texture2D(uRam, vUv * uRamST.xy + uRamST.zw);
    // dissolve: the shaders declare no edge colour, so _BorderWidth is the softness of the cut [ASSUMED]
    float e = 1.0;
    if (uHasDissolve) {
      vec2 suv = vUv * uDissolveST.xy + uDissolveST.zw + uDissolveSpeed * uTime + dis * uDisturbDissolve;
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
        col.a *= clamp((d2 - uAmount2) / max(uBorder2, 1e-3), 0.0, 1.0);
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
  const disturb = tex('_DisturbTex') || tex('_NoiseTex');
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
    // local patch (user 2026-10-07: black squares on 비르투오사's hit, 望's link): the alpha channel of a see-through canvas
    // (render/fxgame.js, premultiplied) — additive light never covers what is under it (a texture without alpha has a black
    // background: it added to the alpha before and composited as a black square), alpha blend is the premultiplied "over"
    blendSrcAlpha: additive ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uMain: { value: tex('_MainTex') || WHITE }, uMainST: { value: st('_MainTex') },
      uMainSpeed: { value: new THREE.Vector2(f._MainUSpeed || 0, f._MainVSpeed || 0) },
      uTint: { value: new THREE.Vector4(tint[0] * tintMul, tint[1] * tintMul, tint[2] * tintMul, tint[3] * tintMul) },
      uOpacity: { value: f._Opacity ?? 1 },
      // local patch (client DXBC, 2026-10-07): only Disturb Anchor declares the _ToggleUse* switches (and Dissolve(CustomData)
      // _UseDissolveTex) — elsewhere they are values left over from another shader, and dissolve / disturb always run
      uHasDisturb: { value: !!disturb && (!toggles || (f._ToggleUseDisturb2 ?? 1) !== 0) }, uDisturb: { value: disturb || WHITE },
      uDisturbST: { value: st(t._DisturbTex ? '_DisturbTex' : '_NoiseTex') },
      uDisturbSpeed: { value: new THREE.Vector2(f._DisturbUSpeed || 0, f._DisturbVSpeed || 0) },
      uDisturbStr: { value: new THREE.Vector2(f._IntensityU || 0, f._IntensityV || 0) },
      uDisturbMain: { value: f._DisturbInfluenceMainUV ?? 1 }, uDisturbDissolve: { value: f._DisturbInfluenceDissolveUV ?? 0 },
      uHasDissolve: { value: !!dissolve && (toggles ? (f._ToggleUseDissolve ?? 1) !== 0 : useTex ? (f._UseDissolveTex ?? 1) !== 0 : true) }, uDissolve: { value: dissolve || WHITE },
      uDissolveST: { value: st(double ? '_DissolveTex_01' : '_DissolveTex') },
      uDissolveSpeed: { value: new THREE.Vector2(f._DissolveUSpeed || 0, f._DissolveVSpeed || 0) },
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
      uMode: { value: 0 }, uLengthScale: { value: 2 }, uVelScale: { value: 0 }, uAlign: { value: 0 },
    },
  });
  mat.userData.order = m?.queue ?? 3000;
  mat.userData.rim = /\/Rim\//.test(shader);
  // local patch: whether the material tests depth (`_ZTest` 4 LessEqual …; 0 Disabled / 8 Always do not) — the floor cut
  // applies only to those: the client's map hides what they draw under the ground by depth [ASSUMED: 0 = Disabled is used]
  mat.userData.ztest = !(f._ZTest === 0 || f._ZTest === 8);
  // local patch (user report 2026-10-08): … and against the map's raised tiles / crates (render/fxgame.js occluders —
  // the only depth in an effect canvas: every effect renderer writes none, as before)
  mat.depthTest = mat.userData.ztest;
  return mat;
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
        }
        await Promise.all([...keys].map(async (k) => { def.geoms[k] = await this.mesh(k); }));
        def.lib = this;
        return def;
      })().catch(() => null));
    }
    return this.defs.get(key);
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
    this.batch.material.uniforms.uTime.value = sinceStart;
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

// local patch (user report 2026-10-07: 蕾缪안 S3's aiming beams were missing) ---------------- line renderer
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
    this.w = ln.width;
    const n = ln.pts.length + (ln.loop ? 1 : 0);
    this.n = Math.min(n, TRAIL_PTS);
    this.batch = new StripBatch(makeMaterial(def.materials[ln.mat], def.lib), this.n);
    this.batch.mesh.renderOrder = ln.order || 0;
    root.add(this.batch.mesh);
  }

  update(dt, sinceStart) {
    const ln = this.tr, n = this.n;
    this.batch.material.uniforms.uTime.value = sinceStart;
    this.batch.begin();
    let shown = true;
    for (let o = this.node; o && o !== this.root; o = o.parent) if (!o.visible) { shown = false; break; }
    if (shown && n >= 2 && this.w > 0) {
      this.node.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      if (ln.world) tmpM.identity(); else tmpM.copy(this.root.matrixWorld).invert().multiply(this.node.matrixWorld);
      let total = 0;
      for (let k = 0; k < n; k++) {
        const q = ln.pts[k % ln.pts.length];
        const p = tmpV.set(q[0], q[1], q[2]).applyMatrix4(tmpM);
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

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
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
    this.material.uniforms.uTime.value = sinceStart;
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
    b.material.uniforms.uTime.value = sinceStart;
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
  if (sh.type !== 5 && sh.type !== 18 && sh.scale) p.multiply(SCALE.set(sh.scale[0], sh.scale[1], sh.scale[2]));
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
  _MainTex_ST: 'uMainST', _DissolveTex_ST: 'uDissolveST', _DisturbTex_ST: 'uDisturbST', _NoiseTex_ST: 'uDisturbST', _DissolveIntensity: 'uAmount' };
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
/** local patch: three.js layers of a split instance's renderers (FxInstance opts.split) — behind / in front of the units. */
export const FX_BACK = 1, FX_FRONT = 2;
const CLIP_AXIS = { r: 'x', g: 'y', b: 'z', a: 'w', x: 'x', y: 'y', z: 'z', w: 'w' };
const clipE = new THREE.Euler();

export class FxInstance {
  /**
   * @param {any} def FxLibrary.load result
   * @param {{ quality?: 'high'|'medium'|'low', facing?: 1|-1, scale?: number, floor?: number|null, split?: boolean }} [opts]
   *   local patch: floor = the board height of the ground under it (default 0): what lies more than 0.05 below is not drawn
   *   (null: no cut); split = each renderer on layer FX_FRONT or FX_BACK by its Unity sorting (sortingOrder > 0, or 0 with a
   *   negative sorting fudge = in front of the units, whose Spine renderers are Default / order 0 and write no depth) —
   *   without it everything stays on layer 0
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.hold = opts.hold ?? null; // local patch: freeze the effect at this time (s) — a mark that stays once shown
    this.q = QUALITY[opts.quality] || QUALITY.high;
    this.time = 0;
    this.object = new THREE.Group();            // placed in board coordinates by the caller
    const unity = new THREE.Group();            // Unity battle frame: mirror z (z = −height)
    unity.scale.set((opts.facing || 1) * (opts.scale || 1), opts.scale || 1, -(opts.scale || 1));
    this.object.add(unity);
    this.unity = unity;
    this.nodes = [];
    this.systems = [];
    this.meshMats = [];
    this.trails = [];
    this.lines = [];   // local patch: LineRenderers
    if (!def || !this.q.budget) { this.empty = true; return; }
    def.nodes.forEach((n, i) => {
      const o = new THREE.Group();
      o.name = n.name;
      if (n.pos) o.position.set(n.pos[0], n.pos[1], n.pos[2]);
      if (n.rot) o.quaternion.set(n.rot[0], n.rot[1], n.rot[2], n.rot[3]);
      if (n.scale) o.scale.set(n.scale[0], n.scale[1], n.scale[2]);
      o.visible = n.active !== false;
      (n.parent >= 0 ? this.nodes[n.parent] : unity).add(o);
      this.nodes[i] = o;
      if (n.mesh && def.geoms[n.mesh.mesh]) {
        const mat = makeMaterial(def.materials[n.mesh.mat], def.lib);
        mat.uniforms.uMode.value = 4;
        const g = new THREE.InstancedBufferGeometry();
        const src = def.geoms[n.mesh.mesh];
        g.index = src.index;
        g.setAttribute('position', src.getAttribute('position'));
        if (src.getAttribute('uv')) g.setAttribute('uv', src.getAttribute('uv'));
        useMeshAttrs(g, src, mat); // local patch
        const one = (name, v) => g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(v), v.length));
        one('iPos', [0, 0, 0]); one('iSize', [1, 1, 1]); one('iRot', [0, 0, 0]); one('iColor', [1, 1, 1, 1]);
        one('iC1', [0, 0, 0, 0]); one('iC2', [0, 0, 0, 0]); one('iUV', [0, 0, 1, 1]); one('iVel', [0, 0, 0]);
        g.instanceCount = 1;
        const mesh = new THREE.Mesh(g, mat);
        mesh.frustumCulled = false;
        mesh.renderOrder = n.mesh.order || 0;
        o.add(mesh);
        this.meshMats[i] = mat;
      }
    });
    def.nodes.forEach((n, i) => {
      if (n.trailR) this.trails.push(new TrailRenderer(n.trailR, this.nodes[i], unity, def));
      if (n.lineR && def.materials[n.lineR.mat]) this.lines.push(new LineRenderer(n.lineR, this.nodes[i], unity, def)); // local patch
      if (n.ps && (n.ps.render?.mat || n.ps.render?.trailMat)) {
        // per-system cap: the extract's max, shared out of the quality budget
        this.systems.push(new ParticleSystem(n.ps, this.nodes[i], unity, def, { q: this.q, cap: Math.ceil(this.q.budget / 8) }));
      }
    });
    this.clip = def.clips?.[0] || null;
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
          // local patch (user report 2026-10-07, video: 蛇屠箱's S2 hex dome covers her): an order-0 mesh that stands up
          // around the unit (a dome / shell, > WRAP_H tall) is in front — the client sorts order 0 by distance; a flat
          // ground decal stays behind
          if (mesh) put(mesh, (n.mesh.order || 0) > 0 || (!(n.mesh.order || 0) && wrapsUnit(mesh, this.object)));
        }
      });
      for (const s of this.systems) {
        const r = s.ps.render, o = r.order || 0, front = o > 0 || (o === 0 && (r.fudge || 0) < 0);
        if (s.draws) put(s.mesh, front); else s.mesh.layers.set(front ? FX_FRONT : FX_BACK);
        if (s.trailBatch) put(s.trailBatch.mesh, front);
      }
      for (const t of this.trails) put(t.batch.mesh, (t.tr.order || 0) > 0);
      for (const t of this.lines) put(t.batch.mesh, (t.tr.order || 0) > 0); // local patch
    } else this.layerN[0] = 1;
    this.clipTracks = this.clip ? this.clip.tracks.map((tr) => this.bindTrack(tr)).filter(Boolean) : [];
    this.clipV = [];
    live.push(this);
    while (live.length > MAX_INSTANCES) live[0].dispose(); // the oldest goes (dispose removes it from `live`)
  }

  /** What a clip track drives, resolved once (applyClip runs every frame). */
  bindTrack(tr) {
    const o = this.nodes[tr.node];
    if (!o) return null;
    if (tr.prop === 'pos' || tr.prop === 'scale' || tr.prop === 'quat' || tr.prop === 'euler') return { tr, o, kind: tr.prop };
    if (tr.prop === 'width') { const ln = this.lines.find((t) => t.node === o); return ln ? { tr, o, kind: 'width', ln } : null; } // local patch
    if (!tr.prop.startsWith('mat:')) return null;
    const mat = this.meshMats[tr.node] || this.systems.find((s) => s.node === o)?.material
      || this.trails.find((t) => t.node === o)?.batch.material || this.lines.find((t) => t.node === o)?.batch.material;
    if (!mat) return null;
    const [name, comp] = tr.prop.slice(4).split('.');
    const uname = CLIP_UNIFORM[name];
    const u = mat.uniforms[uname];
    if (!u) return null;
    const k = uname === 'uTint' ? 2 : 1;   // the material tint carries the shaders' ×2 (makeMaterial)
    return comp ? { tr, o, kind: 'matComp', u, axis: CLIP_AXIS[comp], k } : { tr, o, kind: 'mat', u };
  }

  /** local patch: whether layer k (0, or FX_BACK / FX_FRONT of a split instance) has a renderer of this effect. */
  hasLayer(k) { return !this.empty && (this.layerN?.[k] || 0) > 0; }

  /** End emission (looping buffs); `now` also removes the live particles. */
  stop(now = false) {
    this.stopping = true;
    for (const s of this.systems) { s.stop(); if (now) while (s.n) s.kill(s.n - 1); }
    if (now) this.time = Infinity;
  }

  get done() {
    if (this.empty || this.disposed) return true;
    const clipDone = !this.clip || this.time >= this.clip.len || this.stopping;
    return clipDone && this.systems.every((s) => !s.alive) && this.trails.every((t) => !t.alive || this.time > (this.clip?.len || 0) + t.tr.time)
      && (!this.lines.length || !!this.stopping); // local patch: a line stays until its effect is ended
  }

  update(dt) {
    // disposed: ended here (MAX_INSTANCES) while its owner still holds it — it must not keep simulating unseen
    if (this.empty || this.disposed) return;
    if (this.hold != null && !this.stopping && this.time + dt > this.hold) dt = Math.max(0, this.hold - this.time); // local patch
    this.time += dt;
    if (this.clip) this.applyClip(Math.min(this.time, this.clip.len));
    this.followWorld();
    for (const s of this.systems) s.update(dt, this.time);
    for (const t of this.trails) t.update(dt, this.time);
    for (const t of this.lines) t.update(dt, this.time); // local patch
    for (const m of this.meshMatList) m.uniforms.uTime.value = this.time;
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

  applyClip(t) {
    const v = this.clipV;
    for (const b of this.clipTracks) {
      const curves = b.tr.curves;
      v.length = curves.length;
      for (let i = 0; i < curves.length; i++) v[i] = evalClipCurve(curves[i], t);
      const o = b.o;
      switch (b.kind) {
        case 'pos': o.position.set(v[0], v[1], v[2]); break;
        case 'scale': o.scale.set(v[0], v[1], v[2]); break;
        case 'quat': o.quaternion.set(v[0], v[1], v[2], v[3]).normalize(); break;
        case 'euler': o.quaternion.setFromEuler(clipE.set(v[0] * D2R, v[1] * D2R, v[2] * D2R, 'YXZ')); break;
        case 'matComp': if (b.u.value?.isVector4) b.u.value[b.axis] = v[0] * b.k; break;
        case 'width': b.ln.w = v[0]; break; // local patch
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
    this.object.removeFromParent();
    const i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
  }
}

/** Live particle count (diagnostics / tests). */
export const fxStats = () => ({ particles: liveParticles, instances: live.length });

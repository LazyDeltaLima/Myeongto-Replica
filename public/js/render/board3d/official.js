// render/board3d/official.js — the official per-stage board scenes (DESIGN §15.1): the client's prebuilt Unity scene
// of each autochess stage, exported by tools/local-extract/scene_extract.py into scene/<stageId>/ (merged draw groups
// in board space + baked lightmaps / shadowmasks) and scene/tex/ (theme textures: map_autochesssand, map_kxmr, …).
//
//   const data = await loadOfficialScene(assets, stageId)   // null when the stage has no extracted scene
//   const built = buildOfficialScene(THREE, data, focus)    // → { meshes: [Mesh], materials, dispose() }
//   built.setArea(rects)                                    // show the hidden sets of the field(s) in play
//   built.update(t)                                         // animated materials (water)
//   built.devices?.mesh(key, x, y, z) → Mesh | null          // a runtime device model (scene/devices), e.g. 射击台
//
// Devices: the client instantiates the mode's traps from the level data on top of the scene (the scene only holds their
// sockets: the 射击台 tile is an empty frame or a zigzag mark without its platform). scene_extract.py --devices exports
// their prefab meshes (pkgrps/btl_pfb_tokens_*.ab → arts/maps/common/trap) to scene/devices/, loaded with every stage;
// shaded like Torappu/Scene/Trap/Shadow: albedo × (_Ambient + _Diffuse · N·L · main light) — lit at run time, no lightmap.
//
// Hidden sets: the level's MapHiddenSettings keys (HIDDEN@1 left normal field, @2 right normal field, @3 boss
// field) are saved hidden and shown by the client for the part of the map in play; a group tagged with a key is
// visible while its tile rect (scene.json hidden[key].tiles) overlaps one of the built areas (layout.js AREAS).
//
// Shading follows the Torappu scene shaders closely enough for the board: albedo (× _Color, the desert theme's
// vertex-colour sand blend toward _BlendColor) × (baked indirect light (RGBM lightmap) + the mixed main light × N·L ×
// its shadowmask) + emission. Without a lightmap (water, UI quads, backgrounds) the main light plus the scene ambient
// apply. The same focus falloff as the procedural board (materials.js addFocus) dims everything outside the active field.
//
// Colour space: the client is a Gamma-space Unity project (globalgamemanagers PlayerSettings m_ActiveColorSpace 0),
// so the scene shaders multiply and add the stored (sRGB-encoded) values as they are and write the result unconverted;
// the lightmaps are LightmapRGBM (Texture2D m_LightmapFormat 2), decoded the gamma way, 5 · a · rgb. These shaders do
// the same: textures and colours untouched (NoColorSpace, no sRGB → linear), no output conversion (no
// colorspace_fragment). Doing the maths in linear space instead made every product darker and more saturated (the
// sand orange-brown and grimy, the _BlendColor tint far too strong) — DESIGN §15.1.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function fetchJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}
async function fetchBin(url) {
  try { const r = await fetch(url); return r.ok ? await r.arrayBuffer() : null; } catch { return null; }
}

const cache = new Map();

/** Group key of a stage scene in data/local-assets.json. */
export const sceneGroup = (stageId) => `scene/${stageId}`;
/** The device models' pseudo stage (scene/devices: scene_extract.py --devices). */
export const DEVICES_ID = 'devices';
/** Stage device roles drawn with an official model (scene/devices keys). */
export const OFFICIAL_DEVICE = Object.freeze({ crate: 'trap_1105_accrate', platform: 'trap_1106_achplat' });

/** Is an official scene listed for `stageId`? (manifest only) */
export function officialSceneListed(assets, stageId) {
  if (!assets || typeof assets.localUrl !== 'function' || !stageId) return false;
  const u = assets.localUrl(sceneGroup(stageId), 'scene');
  return typeof u === 'string' && u.length > 0;
}

/**
 * Load scene.json + geom.bin + every texture the scene uses (cached per stage). Textures come from the manifest
 * (scene/tex/<name>, scene/<stage>/lm*), images through assets.image (the browser resource cache).
 * @returns {Promise<object|null>}
 */
export function loadOfficialScene(assets, stageId) {
  if (!stageId) return Promise.resolve(null);
  if (cache.has(stageId)) return cache.get(stageId);
  const p = (async () => {
    if (!assets || typeof assets.localUrl !== 'function' || typeof assets.image !== 'function') return null;
    try { await assets.local?.(); } catch { return null; }
    const url = (g, n) => { const u = assets.localUrl(g, n); return typeof u === 'string' && u ? encodeURI(u) : null; };
    const g = sceneGroup(stageId);
    const sUrl = url(g, 'scene'), bUrl = url(g, 'geom');
    if (!sUrl || !bUrl) return null;
    const [doc, buf] = await Promise.all([fetchJson(sUrl), fetchBin(bUrl)]);
    if (!isObj(doc) || !buf || !Array.isArray(doc.groups)) return null;
    const wanted = new Map();  // url → [slot setters]
    const want = (u, set) => { if (!u) return; if (!wanted.has(u)) wanted.set(u, []); wanted.get(u).push(set); };
    const textures = {};
    for (const m of Object.values(doc.materials || {})) {
      for (const tx of Object.values(m.textures || {})) {
        if (!tx.file) continue;
        const name = tx.file.replace(/\.png$/, '');
        want(url('scene/tex', name), (img) => { textures[tx.file] = img; });
      }
    }
    const lightmaps = (doc.lightmaps || []).map(() => ({}));
    (doc.lightmaps || []).forEach((lm, i) => {
      for (const k of ['light', 'mask']) {
        const f = lm?.[k]?.file;
        if (f) want(url(g, f.replace(/\.png$/, '')), (img) => { lightmaps[i][k] = img; });
      }
    });
    await Promise.all([...wanted.entries()].map(async ([u, sets]) => {
      const img = await assets.image(u).catch(() => null);
      if (img && (img.width || img.naturalWidth) > 0) for (const s of sets) s(img);
    }));
    // the runtime device models (scene/devices), shared by every stage; null on an older extract (none listed)
    const devices = stageId === DEVICES_ID ? null : await loadOfficialScene(assets, DEVICES_ID);
    return { stageId, doc, buffer: buf, textures, lightmaps, devices };
  })().catch((err) => { console.warn('[board3d] official scene load failed', stageId, err); return null; });
  cache.set(stageId, p);
  return p;
}

/**
 * Undo scene_extract.py dzs for the range `r` ([byte offset, count]) of `buffer`: the bytes come shuffled by
 * significance (all low bytes, then the next…), each value is a zigzag delta from the previous one of the same
 * component (mod 2^16 / 2^32). `w` 2 → Uint16Array, 4 → Uint32Array.
 */
export function unDzs(buffer, r, w, comps) {
  const n = r[1], src = new Uint8Array(buffer, r[0], n * w);
  const out = w === 2 ? new Uint16Array(n) : new Uint32Array(n);
  const prev = new Array(comps).fill(0);
  for (let i = 0, c = 0; i < n; i++) {
    const z = w === 2 ? src[i] | (src[n + i] << 8) : (src[i] | (src[n + i] << 8) | (src[2 * n + i] << 16) | (src[3 * n + i] << 24)) >>> 0;
    const d = (z >>> 1) ^ -(z & 1);
    const v = w === 2 ? (prev[c] + d) & 0xffff : (prev[c] + d) >>> 0;
    prev[c] = v;
    out[i] = v;
    if (++c === comps) c = 0;
  }
  return out;
}

/** Forget cached scenes (tests / hot reload). */
export function resetOfficialScenes() { cache.clear(); }

// ---- shaders -------------------------------------------------------------------------------------------------------

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec2 uv1;
attribute vec4 color;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vColor;
uniform vec4 uMainST;
uniform vec4 uUv1ST;
void main() {
  vUv = uv * uMainST.xy + uMainST.zw;
  vUv1 = uv1 * uUv1ST.xy + uUv1ST.zw;
  vColor = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform sampler2D uNormal;
uniform sampler2D uEmission;
uniform sampler2D uLight;
uniform sampler2D uMask;
uniform vec4 uColor;
uniform vec3 uEmissionColor;
uniform sampler2D uGloss;    // TX_…_M as a three.js roughness map: G = 1 − smoothness
uniform vec3 uBlendColor;
uniform float uBlendStrength;
uniform vec2 uBlendRange;    // _BlendRangeCtrl.xy
uniform vec3 uLightDir;      // towards the light (board space)
uniform vec3 uLightColor;    // gamma-space colour × intensity
uniform vec3 uAmbient;
uniform float uSmoothness;   // _Glossiness, or _GlossMapScale with the gloss map
uniform float uMetallic;
uniform float uSpecHighlights;
uniform vec3 uRefl[6];       // reflection probe: mean colour per cube face, board +x −x +y −y +z −z
uniform float uCutoff;
uniform float uBumpScale;
uniform float uLmGain;
uniform float uDirectGain;
uniform float uEmissionGain;
uniform float uOpacity;
uniform vec2 uTrap;          // Torappu/Scene/Trap/Shadow: _Ambient, _Diffuse
uniform vec4 uFocus;
uniform float uFocusDim;
uniform float uFocusSoft;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vColor;

vec3 perturb(vec3 n, vec3 mapN) {
  // screen-space tangent frame (no tangents exported)
  vec3 q0 = dFdx(vWorld), q1 = dFdy(vWorld);
  vec2 st0 = dFdx(vUv), st1 = dFdy(vUv);
  vec3 q1perp = cross(q1, n), q0perp = cross(n, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float scale = det == 0.0 ? 0.0 : inversesqrt(det);
  return normalize(T * (mapN.x * scale) + B * (mapN.y * scale) + n * mapN.z);
}

vec3 reflCube(vec3 d) {
  vec3 d2 = d * d;
  return d2.x * (d.x >= 0.0 ? uRefl[0] : uRefl[1]) + d2.y * (d.y >= 0.0 ? uRefl[2] : uRefl[3]) + d2.z * (d.z >= 0.0 ? uRefl[4] : uRefl[5]);
}

void main() {
  vec4 albedo = texture2D(uMap, vUv) * uColor;
  #ifdef ALPHATEST
    if (albedo.a < uCutoff) discard;
  #endif
  #ifdef VERTEX_BLEND
    // _HG_VERTEX_COLOR_BLEND_ON: the vertex-painted sand (vertex colour, grey) covers the albedo with _BlendColor
    float bm = clamp((vColor.r - uBlendRange.x) / max(uBlendRange.y - uBlendRange.x, 1e-4), 0.0, 1.0) * uBlendStrength;
    albedo.rgb = mix(albedo.rgb, uBlendColor, clamp(bm, 0.0, 1.0));
  #endif
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  #ifdef NORMALMAP
    vec3 mapN = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
    mapN.xy *= uBumpScale;
    n = perturb(n, normalize(mapN));
  #endif
  vec3 l = normalize(uLightDir);
  vec3 v = normalize(cameraPosition - vWorld);
  float nl = max(dot(n, l), 0.0);
  vec3 giDiffuse;
  float atten;
  #ifdef LIGHTMAP
    vec4 lm = texture2D(uLight, vUv1);
    giDiffuse = lm.rgb * (5.0 * lm.a) * uLmGain;  // Unity DecodeLightmapRGBM, gamma space (linear space: 34.49 · a^2.2)
    atten = texture2D(uMask, vUv1).r;             // shadowmask of the mixed main light
  #else
    giDiffuse = uAmbient;
    atten = 1.0;
  #endif
  vec3 lightCol = uLightColor * atten * uDirectGain;
  // Unity Standard BRDF1_Unity_PBS, gamma space (Torappu/Scene/StandardRealtimeShadow carries the Standard
  // properties): dielectric specular 0.2209 (unity_ColorSpaceDielectricSpec), Disney diffuse, GGX + Smith joint,
  // sqrt of the specular term, surface reduction 1 − 0.28 · roughness · perceptual roughness
  float smoothness = uSmoothness;
  #ifdef GLOSSMAP
    smoothness *= 1.0 - texture2D(uGloss, vUv).g;
  #endif
  float oneMinusRefl = 0.7790837 * (1.0 - uMetallic);
  vec3 specColor = mix(vec3(0.2209163), albedo.rgb, uMetallic);
  vec3 diffColor = albedo.rgb * oneMinusRefl;
  float pr = 1.0 - smoothness;
  float rough = max(pr * pr, 0.002);
  vec3 h = normalize(l + v);
  float nv = abs(dot(n, v)), nh = max(dot(n, h), 0.0), lh = max(dot(l, h), 0.0);
  float fd90 = 0.5 + 2.0 * lh * lh * pr;
  float diffTerm = (1.0 + (fd90 - 1.0) * pow(1.0 - nl, 5.0)) * (1.0 + (fd90 - 1.0) * pow(1.0 - nv, 5.0)) * nl;
  float lambdaV = nl * (nv * (1.0 - rough) + rough), lambdaL = nv * (nl * (1.0 - rough) + rough);
  float vis = 0.5 / (lambdaV + lambdaL + 1e-5);
  float a2 = rough * rough, dd = (nh * a2 - nh) * nh + 1.0;
  float ggx = RECIPROCAL_PI * a2 / (dd * dd + 1e-7);
  float specTerm = max(0.0, sqrt(max(1e-4, vis * ggx * PI)) * nl) * uSpecHighlights;
  float surfaceReduction = 1.0 - 0.28 * rough * pr;
  float grazing = clamp(smoothness + (1.0 - oneMinusRefl), 0.0, 1.0);
  vec3 outgoing = diffColor * (giDiffuse + lightCol * diffTerm)
    + specTerm * lightCol * (specColor + (1.0 - specColor) * pow(1.0 - lh, 5.0))
    + surfaceReduction * reflCube(reflect(-v, n)) * mix(specColor, vec3(grazing), pow(1.0 - nv, 5.0));
  #ifdef EMISSION
    outgoing += texture2D(uEmission, vUv).rgb * uEmissionColor * uEmissionGain;
  #endif
  #ifdef UNLIT
    outgoing = albedo.rgb;
  #endif
  #ifdef TRAP
    // a runtime trap model (scene/devices): the Trap/Shadow material's flat ambient + diffuse terms [ASSUMED: the shader
    // source is compiled; its properties are _Ambient / _Diffuse / _ShadowStrength only]
    outgoing = albedo.rgb * (uTrap.x + uTrap.y * nl * uLightColor * uDirectGain);
  #endif
  vec2 fd = max(vec2(0.0), max(uFocus.xy - vWorld.xy, vWorld.xy - uFocus.zw));
  outgoing *= mix(uFocusDim, 1.0, 1.0 - smoothstep(0.0, uFocusSoft, length(fd)));
  gl_FragColor = vec4(outgoing, albedo.a * uOpacity);  // gamma-space result: written as is (no colorspace_fragment)
  #include <fog_fragment>
}`;

/** Simplified Torappu/Scene/StylizedWater: deep tint × _WaterColor × _WaterColorIntensity at the deep colour's alpha
 * over the sea floor, scrolling wave normals, sky glint. */
const WATER_FRAG = /* glsl */`
#include <common>
uniform sampler2D uWaves;
uniform vec4 uDeep;
uniform vec4 uShallow;
uniform vec3 uWaterTint;     // _WaterColor × _WaterColorIntensity
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uTime;
uniform vec2 uWaveTiling;
uniform vec4 uFocus;
uniform float uFocusDim;
uniform float uFocusSoft;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vColor;
void main() {
  vec2 p = vWorld.xy * 0.5;
  vec3 w1 = texture2D(uWaves, p * uWaveTiling + vec2(0.03, 0.017) * uTime).xyz * 2.0 - 1.0;
  vec3 w2 = texture2D(uWaves, p * uWaveTiling * 1.7 - vec2(0.021, 0.034) * uTime).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3((w1.xy + w2.xy) * 0.35, 1.0));
  // the official shader blends shallow → deep by scene depth; around the board the water is deep: the deep colour
  vec3 base = uDeep.rgb * uWaterTint * (1.0 + 0.08 * n.x);
  float spec = pow(max(dot(reflect(-normalize(uLightDir), n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  vec3 col = base * (0.55 + 0.45 * max(dot(n, normalize(uLightDir)), 0.0)) + uLightColor * spec * 0.35;
  vec2 fd = max(vec2(0.0), max(uFocus.xy - vWorld.xy, vWorld.xy - uFocus.zw));
  col *= mix(uFocusDim, 1.0, 1.0 - smoothstep(0.0, uFocusSoft, length(fd)));
  gl_FragColor = vec4(col, uDeep.a);
}`;

/** Tunables (checked against the official screenshots; see DESIGN §15.1). */
export const OFFICIAL_LIGHTING = Object.freeze({ lmGain: 1.0, directGain: 1.0, emissionGain: 1.0, ambientGain: 1.0 });

function texture(THREE, img, { repeat = false, aniso = 1 } = {}) {
  if (!img) return null;
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.NoColorSpace;  // gamma-space shading: sampled as stored (colour maps and data maps alike)
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A material / light colour as Unity's gamma-space shaders use it: the stored value, unconverted. */
const raw = (THREE, c) => (c ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace) : new THREE.Color(1, 1, 1));

/**
 * Build three.js meshes for a loaded official scene (board space, static: matrixAutoUpdate off).
 * @param {any} THREE
 * @param {object} data loadOfficialScene result
 * @param {object} focus materials.js focusUniforms (shared with the procedural board)
 * @param {{ aniso?: number }} [opts]
 */
export function buildOfficialScene(THREE, data, focus, opts = {}) {
  const T = THREE;
  const { doc, buffer } = data;
  const aniso = opts.aniso || 1;
  const texCache = new Map();
  let texSrc = data.textures;  // the textures of the doc being built (the stage's, then the devices')
  const tex = (file, o) => {
    if (!file || !texSrc?.[file]) return null;
    const k = `${file}|${!!o?.repeat}`;
    if (!texCache.has(k)) texCache.set(k, texture(T, texSrc[file], { ...o, aniso }));
    return texCache.get(k);
  };
  let matSrc = doc.materials;
  const lms = (data.lightmaps || []).map((lm) => ({
    light: texture(T, lm.light),
    mask: texture(T, lm.mask),
  }));
  const main = (doc.lights || []).find((l) => l.active && l.type === 1) || null;
  const lightDir = main ? new T.Vector3(-main.dir[0], -main.dir[1], -main.dir[2]).normalize() : new T.Vector3(0.4, 0.4, 0.8).normalize();
  const lightColor = main ? raw(T, main.color).multiplyScalar(main.intensity) : new T.Color(1, 1, 1);
  const S = doc.settings || {};
  // the reflection probe the scene's statics sample (scene_extract.py reflection: a baked ReflectionProbe, else the
  // generated skybox reflection × m_ReflectionIntensity; mean colour per cube face); older extracts: the ambient sky
  const R = doc.reflection;
  const refl = Array.isArray(R?.faces) && R.faces.length === 6
    ? R.faces.map((c) => new T.Vector3(c[0], c[1], c[2]).multiplyScalar(R.intensity ?? 1))
    : new Array(6).fill(0).map(() => new T.Vector3(...(S.ambientSky || [0.3, 0.3, 0.3]).slice(0, 3)).multiplyScalar(S.ambientIntensity ?? 1));
  const ambient = S.ambientSky ? raw(T, S.ambientSky).multiplyScalar((S.ambientIntensity ?? 1) * OFFICIAL_LIGHTING.ambientGain) : new T.Color(0.3, 0.3, 0.3);

  const materials = new Map();
  const animated = [];
  // q: a version-2 group's uv ranges ({ uv0, uv1: [sx, sy, ox, oy] }, u16 normalized → uv); folded into uMainST /
  // uUv1ST, so a quantized group gets a material of its own (same program, no extra draw calls)
  const materialFor = (name, lmIndex, q = null) => {
    const key = `${matSrc === doc.materials ? '' : 'dev:'}${name}|${lmIndex}${q ? `|${q.uv0}|${q.uv1}` : ''}`;
    if (materials.has(key)) return materials.get(key);
    const q0 = q?.uv0 || [1, 1, 0, 0], q1 = q?.uv1 || [1, 1, 0, 0];
    const info = matSrc?.[name] || { shader: null, keywords: [], textures: {}, floats: {}, colors: {} };
    const kw = new Set(info.keywords || []);
    const F = info.floats || {}, C = info.colors || {}, X = info.textures || {};
    const shader = info.shader || '';
    let mat;
    if (/StylizedWater/.test(shader)) {
      const waves = tex(X._BumpMap?.file, { repeat: true });
      mat = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
        uniforms: {
          uMainST: { value: new T.Vector4(...q0) }, uUv1ST: { value: new T.Vector4(...q1) }, uWaves: { value: waves },
          uDeep: { value: new T.Vector4(...(C._DeepWaterColor || [0, 0.27, 0.4, 0.67])) },
          uShallow: { value: new T.Vector4(...(C._ShallowWaterColor || [0.39, 1, 0.7, 0.5])) },
          uWaterTint: { value: new T.Vector3(...(C._WaterColor || [1, 1, 1]).slice(0, 3)).multiplyScalar(F._WaterColorIntensity ?? 1) },
          uLightDir: { value: lightDir }, uLightColor: { value: lightColor }, uTime: { value: 0 },
          uWaveTiling: { value: new T.Vector2(...(X._BumpMap?.scale || [0.6, 0.37])) },
          ...focus,
        },
      });
      animated.push(mat);
    } else {
      const mainTex = tex(X._MainTex?.file);
      const st = X._MainTex ? [...X._MainTex.scale, ...X._MainTex.offset] : [1, 1, 0, 0];
      const particle = /Particles|Unlit|DynamicWaterTile/.test(shader);
      const blend = !/Scene\/Trap/.test(shader) && (kw.has('_ALPHABLEND_ON') || particle || (F._Mode ?? 0) >= 2);
      const defines = {};
      if (kw.has('_ALPHATEST_ON')) defines.ALPHATEST = 1;
      if (kw.has('_HG_VERTEX_COLOR_BLEND_ON')) defines.VERTEX_BLEND = 1;
      const normal = kw.has('_NORMALMAP') ? tex(X._BumpMap?.file) : null;
      if (normal) defines.NORMALMAP = 1;
      const emission = kw.has('_EMISSION') ? tex(X._EmissionMap?.file) : null;
      if (emission) defines.EMISSION = 1;
      const lm = lmIndex >= 0 ? lms[lmIndex] : null;
      if (lm && lm.light && lm.mask) defines.LIGHTMAP = 1;
      if (particle) defines.UNLIT = 1;
      const trap = /Scene\/Trap/.test(shader);
      if (trap) defines.TRAP = 1;
      // Standard metallic workflow: _METALLICGLOSSMAP → smoothness = map × _GlossMapScale (the export keeps the
      // smoothness only; the desert / Kazimierz / Syracuse maps have metallic ≈ 0), else _Glossiness / _Metallic
      const gloss = kw.has('_METALLICGLOSSMAP') ? tex(X._MetallicGlossMap?.file) : null;
      if (gloss) defines.GLOSSMAP = 1;
      const color = particle && C._TintColor ? C._TintColor.map((v, i) => (i < 3 ? v * 2 : v * 2)) : (C._Color || [1, 1, 1, 1]);
      const col = raw(T, color);
      mat = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, defines,
        transparent: blend, depthWrite: !blend, side: particle ? T.DoubleSide : T.FrontSide,
        uniforms: {
          // (q · s0 + o0) · st.xy + st.zw
          uMainST: { value: new T.Vector4(q0[0] * st[0], q0[1] * st[1], q0[2] * st[0] + st[2], q0[3] * st[1] + st[3]) },
          uUv1ST: { value: new T.Vector4(...q1) },
          uMap: { value: mainTex }, uNormal: { value: normal }, uEmission: { value: emission },
          uLight: { value: lm?.light || null }, uMask: { value: lm?.mask || null },
          uColor: { value: new T.Vector4(col.r, col.g, col.b, color[3] ?? 1) },
          uEmissionColor: { value: raw(T, C._EmissionColor || [1, 1, 1]) },
          uBlendColor: { value: raw(T, C._BlendColor || [1, 1, 1]) },
          uBlendStrength: { value: F._BlendStrength ?? 1 },
          uBlendRange: { value: new T.Vector2(...(C._BlendRangeCtrl || [0, 1]).slice(0, 2)) },
          uGloss: { value: gloss },
          uSmoothness: { value: gloss ? (F._GlossMapScale ?? 1) : (F._Glossiness ?? 0.5) },
          uMetallic: { value: gloss ? 0 : (F._Metallic ?? 0) },
          uSpecHighlights: { value: F._SpecularHighlights ?? 1 },
          uRefl: { value: refl },
          uLightDir: { value: lightDir }, uLightColor: { value: lightColor }, uAmbient: { value: ambient },
          uCutoff: { value: F._Cutoff ?? 0.5 }, uBumpScale: { value: F._BumpScale ?? 1 },
          uLmGain: { value: OFFICIAL_LIGHTING.lmGain }, uDirectGain: { value: OFFICIAL_LIGHTING.directGain },
          uEmissionGain: { value: OFFICIAL_LIGHTING.emissionGain }, uOpacity: { value: 1 },
          uTrap: { value: new T.Vector2(F._Ambient ?? 0.85, F._Diffuse ?? 0.2) },
          ...focus,
        },
      });
      if (!mainTex) mat.uniforms.uMap.value = null;
      mat.userData.blend = blend;
    }
    mat.extensions = { derivatives: true };
    mat.userData.official = name;
    materials.set(key, mat);
    return mat;
  };

  const meshes = [];
  // geom.bin version 2 (scene_extract.py pack_geometry): u16 positions on the scene grid doc.quant.pos (the mesh
  // matrix maps them back: translate (x0, y0, z0), uniform scale span), i8 normals, u16 uvs per group range (g.q),
  // optional one-colour groups and u16 indices; version 1: f32 attributes, u32 indices
  const geometryOf = (D, buf, g) => {
    const qp = D.version >= 2 && Array.isArray(D.quant?.pos) ? D.quant.pos : null;
    const dz = new Set(Array.isArray(D.quant?.dzs) ? D.quant.dzs : []);
    const geo = new T.BufferGeometry();
    const q = qp && g.q ? g.q : null;
    if (q) {
      // the dzs arrays are delta + zigzag + byte-shuffled (scene_extract.py dzs): decoded into fresh arrays
      const u16 = (k, comps) => (dz.has(k) ? unDzs(buf, g[k], 2, comps) : new Uint16Array(buf, g[k][0], g[k][1]));
      geo.setAttribute('position', new T.BufferAttribute(u16('pos', 3), 3, true));
      geo.setAttribute('normal', new T.BufferAttribute(new Int8Array(buf, g.nrm[0], g.nrm[1]), 4, true));
      geo.setAttribute('uv', new T.BufferAttribute(u16('uv0', 2), 2, true));
      geo.setAttribute('uv1', new T.BufferAttribute(u16('uv1', 2), 2, true));
    } else {
      const f32 = (r) => new Float32Array(buf, r[0], r[1]);
      geo.setAttribute('position', new T.BufferAttribute(f32(g.pos), 3));
      geo.setAttribute('normal', new T.BufferAttribute(f32(g.nrm), 3));
      geo.setAttribute('uv', new T.BufferAttribute(f32(g.uv0), 2));
      geo.setAttribute('uv1', new T.BufferAttribute(f32(g.uv1), 2));
    }
    let col;
    if (g.col) col = new Uint8Array(buf, g.col[0], g.col[1]);
    else {
      col = new Uint8Array(g.vertices * 4);
      const c = Array.isArray(g.colConst) ? g.colConst : [255, 255, 255, 255];
      for (let i = 0; i < col.length; i += 4) col.set(c, i);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 4, true));
    const iw = q && g.idxType === 'u16' ? 2 : 4;
    const idx = q && dz.has('idx') ? unDzs(buf, g.idx, iw, 1) : new (iw === 2 ? Uint16Array : Uint32Array)(buf, g.idx[0], g.idx[1]);
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return { geo, q, qpos: qp };
  };
  for (const g of doc.groups) {
    if (!g || !g.vertices || !g.indices) continue;
    const { geo, q, qpos } = geometryOf(doc, buffer, g);
    const mat = materialFor(g.material, g.lightmap, q);
    const mesh = new T.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    if (q) {
      mesh.position.set(qpos[0], qpos[1], qpos[2]);
      mesh.scale.setScalar(qpos[3]);
    }
    mesh.updateMatrix();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = mat.transparent ? 2 : -1;
    mesh.name = `official:${g.material}:${g.lightmap}${g.hidden ? `:${g.hidden}` : ''}`;
    mesh.userData.hidden = g.hidden || null;
    // Torappu/Scene/DynamicWaterTile: the tide warning tiles (the client shows them only while a tide is announced)
    if (/DynamicWaterTile/.test(doc.materials?.[g.material]?.shader || '')) { mesh.visible = false; mesh.userData.tideWarning = true; }
    meshes.push(mesh);
  }
  // runtime device models (scene/devices, loaded with the stage as data.devices): shared geometry and materials, lit
  // with this stage's main light (their materials are built from the devices' own material table and textures)
  let devices = null;
  const devGeos = [];
  const DV = data.devices;
  if (DV && isObj(DV.doc) && Array.isArray(DV.doc.groups) && DV.buffer) {
    texSrc = DV.textures || {};
    matSrc = DV.doc.materials || {};
    const parts = new Map();  // device key → [{ geo, mat, qpos }]
    for (const g of DV.doc.groups) {
      if (!g || !g.vertices || !g.indices || !g.device) continue;
      const { geo, q, qpos } = geometryOf(DV.doc, DV.buffer, g);
      devGeos.push(geo);
      if (!parts.has(g.device)) parts.set(g.device, []);
      parts.get(g.device).push({ geo, mat: materialFor(g.material, -1, q), qpos: q ? qpos : null });
    }
    texSrc = data.textures;
    matSrc = doc.materials;
    const info = isObj(DV.doc.devices) ? DV.doc.devices : {};
    devices = {
      has: (key) => parts.has(key),
      /** [[x0, y0, z0], [x1, y1, z1]] of the model around its tile centre (z from the ground). */
      bounds: (key) => (Array.isArray(info[key]?.bounds) ? info[key].bounds : null),
      /** The standing surface's height (a 射击台's plate), null when not recorded. */
      top: (key) => (parts.has(key) && Number.isFinite(info[key]?.top) ? info[key].top : null),
      /**
       * A Group holding the device's model, its origin at the tile centre on the ground. `fade`: materials of its own
       * (uOpacity, blended) sharing the uniforms (light, focus) — the caller disposes them (group.userData.materials).
       */
      mesh(key, { fade = false } = {}) {
        const list = parts.get(key);
        if (!list) return null;
        const grp = new T.Group();
        grp.userData.materials = [];
        for (const p of list) {
          let mat = p.mat;
          if (fade) {
            mat = new T.ShaderMaterial({
              vertexShader: p.mat.vertexShader, fragmentShader: p.mat.fragmentShader, defines: { ...p.mat.defines },
              uniforms: { ...p.mat.uniforms, uOpacity: { value: 1 } }, transparent: true,
            });
            mat.extensions = { derivatives: true };
            grp.userData.materials.push(mat);
          }
          const m = new T.Mesh(p.geo, mat);
          if (p.qpos) { m.position.set(p.qpos[0], p.qpos[1], p.qpos[2]); m.scale.setScalar(p.qpos[3]); }
          m.name = `official-device:${key}`;
          grp.add(m);
        }
        return grp;
      },
    };
  }
  const hiddenTiles = doc.hidden || {};
  const overlaps = (t, a) => !!t && t[0] <= a.r1 && t[1] >= a.r0 && t[2] <= a.c1 && t[3] >= a.c0;
  const hl = Number(doc.map?.highlandHeight);
  return {
    stageId: data.stageId,
    highland: Number.isFinite(hl) && hl > 0 ? hl : null,
    meshes,
    materials: [...materials.values()],
    setArea(rects) {
      const list = Array.isArray(rects) ? rects : [];
      for (const m of meshes) {
        const k = m.userData.hidden;
        if (k && !m.userData.tideWarning) m.visible = list.some((a) => overlaps(hiddenTiles[k]?.tiles, a));
      }
    },
    lightDir, lightColor,
    devices,
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const g of devGeos) g.dispose();
      for (const m of materials.values()) m.dispose();
      for (const t of texCache.values()) t.dispose();
      for (const l of lms) { l.light?.dispose(); l.mask?.dispose(); }
    },
    update(t) { for (const m of animated) m.uniforms.uTime.value = t; },
  };
}

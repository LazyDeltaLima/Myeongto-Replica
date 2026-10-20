// render/board3d/official.js — the official per-stage board scenes (docs/local/official-scenes.md): the client's prebuilt Unity scene
// of each autochess stage, exported by tools/local-extract/scene_extract.py into scene/<stageId>/ (merged draw groups
// in board space + baked lightmaps / shadowmasks) and scene/tex/ (theme textures: map_autochesssand, map_kxmr, …).
//
//   const data = await loadOfficialScene(assets, stageId, { retry, partial })   // null when the stage has no extracted
//                                                           // scene; rejects while it could not be loaded whole
//   const built = buildOfficialScene(THREE, data, focus)    // → { meshes: [Mesh], materials, dispose() }
//   built.setArea(rects)                                    // show the hidden sets of the field(s) in play
//   built.update(t)                                         // animated materials (water)
//   built.devices?.mesh(key, x, y, z) → Mesh | null          // a runtime device model (scene/devices), e.g. 射击台, 特制水上平台
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
// sand orange-brown and grimy, the _BlendColor tint far too strong) — docs/local/official-scenes.md.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function fetchJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}
// revalidated like scene.json: the server sends geom.bin with max-age, and a cached older buffer under a newer
// scene.json puts its ranges out of bounds (unDzs RangeError) after a re-extract
async function fetchBin(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.arrayBuffer() : null; } catch { return null; }
}

// stageId → Promise<{ data, missing }>: `data` null = no scene listed for the stage (kept for good); `missing` = what
// failed to load (scene.json / geom.bin / images / the device models) — such a result is loaded again on `retry`
const cache = new Map();

/** Group key of a stage scene in data/local-assets.json. */
export const sceneGroup = (stageId) => `scene/${stageId}`;
/** The device models' pseudo stage (scene/devices: scene_extract.py --devices). */
export const DEVICES_ID = 'devices';
/** Stage device roles drawn with an official model (scene/devices keys). */
// (特制水上平台 — 战场#05's water platforms — upstream 205f3bb7 found them missing on the official scene; 封印的地面
// trap_1107_acblock has no model in the client: nothing to draw)
export const OFFICIAL_DEVICE = Object.freeze({ crate: 'trap_1105_accrate', platform: 'trap_1106_achplat', waterPlatform: 'trap_040_canoe', mound: 'trap_032_mound' });

/** Is an official scene listed for `stageId`? (manifest only) */
export function officialSceneListed(assets, stageId) {
  if (!assets || typeof assets.localUrl !== 'function' || !stageId) return false;
  const u = assets.localUrl(sceneGroup(stageId), 'scene');
  return typeof u === 'string' && u.length > 0;
}

/**
 * Load scene.json + geom.bin + every texture the scene uses (cached per stage). Textures come from the manifest
 * (scene/tex/<name>, scene/<stage>/lm*), images through assets.image (the browser resource cache).
 *
 * A scene that could not be loaded whole — a dropped request on a phone, an image the browser could not decode — is
 * not drawn: a material whose texture is missing samples black (opaque parts turn black, cut-out ones vanish, a missing
 * lightmap drops the baked light), so the promise rejects and the caller keeps the procedural board meanwhile.
 * `retry` loads again only what failed (assets.image retry; loaded images stay cached). `partial` (the caller's last
 * try: a file the manifest lists but the server lacks never comes) settles for the scene without what is missing.
 * @param {{ retry?: boolean, partial?: boolean }} [opts]
 * @returns {Promise<object|null>} null when the stage has no extracted scene
 */
export function loadOfficialScene(assets, stageId, { retry = false, partial = false } = {}) {
  if (!stageId) return Promise.resolve(null);
  return loadScene(assets, stageId, retry).then(({ data, missing }) => {
    if (missing.length && !(partial && data)) throw new Error(`official scene ${stageId} incomplete: ${missing.length} missing (${missing[0]})`);
    return data;
  });
}

/** The cached load of a stage scene → { data, missing: [what failed] }; a result with something missing is loaded again on `retry`. */
function loadScene(assets, stageId, retry) {
  const prev = cache.get(stageId);
  if (prev && !retry) return prev;
  const p = (prev || Promise.resolve(null)).then((r) => {
    if (r && !r.missing.length) return r;
    return loadSceneOnce(assets, stageId, retry);
  });
  cache.set(stageId, p);
  return p;
}

async function loadSceneOnce(assets, stageId, retry) {
  try {
    if (!assets || typeof assets.localUrl !== 'function' || typeof assets.image !== 'function') return { data: null, missing: [] };
    let manifest = null;
    try { manifest = await assets.local?.(retry ? { retry: true } : undefined); } catch { manifest = null; }
    const url = (g, n) => { const u = assets.localUrl(g, n); return typeof u === 'string' && u ? encodeURI(u) : null; };
    const g = sceneGroup(stageId);
    const sUrl = url(g, 'scene'), bUrl = url(g, 'geom');
    // not listed: no scene on this host — unless the manifest itself could not be read (then try again)
    if (!sUrl || !bUrl) return { data: null, missing: isObj(manifest) || typeof assets.local !== 'function' ? [] : ['local-art manifest'] };
    const [doc, buf] = await Promise.all([fetchJson(sUrl), fetchBin(bUrl)]);
    if (!isObj(doc) || !Array.isArray(doc.groups)) return { data: null, missing: [sUrl] };
    if (!buf) return { data: null, missing: [bUrl] };
    const missing = [];
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
      const img = await (retry ? assets.image(u, { retry: true }) : assets.image(u)).catch(() => null);
      if (img && (img.width || img.naturalWidth) > 0) for (const s of sets) s(img);
      else missing.push(u);
    }));
    // the runtime device models (scene/devices), shared by every stage; null on an older extract (none listed)
    let devices = null;
    if (stageId !== DEVICES_ID) {
      const d = await loadScene(assets, DEVICES_ID, retry);
      devices = d.data;
      missing.push(...d.missing);
    }
    return { data: { stageId, doc, buffer: buf, textures, lightmaps, devices }, missing };
  } catch (err) {
    console.warn('[board3d] official scene load failed', stageId, err);
    return { data: null, missing: [String(err?.message || err)] };
  }
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

/**
 * The seam of a wide 联防 field (setWide): the stage's scene draws up to x 18.5 and its copy from there. Cut there, the
 * rocks, cliffs and props around the island showed half a boulder next to half of another (maintainer screen check
 * 2026-10-20), so a piece of the scene — triangles joined by shared vertices or positions — that stays off the 联防 rows
 * (`rows`) and is at most `maxW` tiles wide is drawn whole by the side its centre falls on; the rest (the field, its
 * walls, the sand floor and the sea) is cut at the seam as before. `bias` keeps the key (centre x + bias) above 0, the
 * value of a piece that is cut. [ASSUMED] — no official scene has a wide field.
 */
export const WIDE_KEY = Object.freeze({ rows: Object.freeze([8.5, 12.5]), maxW: 14, bias: 100 });

/**
 * The seam key per vertex (WIDE_KEY): `pos` the vertex positions (`comps` per vertex, `toBoard(i)` → [x, y] of vertex
 * i on the board), `idx` the triangle indices. Returns a Float32Array: centre x + bias of the vertex's piece, or 0 for a
 * piece cut at the seam.
 * @param {ArrayLike<number>} pos @param {ArrayLike<number>} idx @param {number} n @param {(i: number) => number[]} toBoard
 */
export function wideKeys(pos, idx, n, toBoard) {
  const par = new Int32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let i = 0; i + 2 < idx.length; i += 3) { join(idx[i], idx[i + 1]); join(idx[i], idx[i + 2]); }
  // split normals / uvs make several vertices of one corner: the same position joins them
  const at = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos[3 * i]},${pos[3 * i + 1]},${pos[3 * i + 2]}`;
    const j = at.get(k);
    if (j === undefined) at.set(k, i); else join(i, j);
  }
  const box = new Map(); // root → [x0, x1, y0, y1]
  const xy = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const [x, y] = toBoard(i);
    xy[2 * i] = x; xy[2 * i + 1] = y;
    const r = find(i), b = box.get(r);
    if (!b) box.set(r, [x, x, y, y]);
    else { if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x; if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y; }
  }
  const [r0, r1] = WIDE_KEY.rows;
  const keyOf = new Map();
  for (const [r, b] of box) keyOf.set(r, b[1] - b[0] <= WIDE_KEY.maxW && (b[3] < r0 || b[2] > r1) ? (b[0] + b[1]) / 2 + WIDE_KEY.bias : 0);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = keyOf.get(find(i));
  return out;
}

/** Give a stage mesh's geometry its seam keys (`aKey`, wideKeys) once; the copies share the geometry. */
function keyGeometry(mesh) {
  const geo = mesh.geometry;
  if (geo.userData.wideKeyed) return;
  const p = geo.getAttribute('position'), index = geo.getIndex();
  if (!p || !index) return;
  const a = p.array, norm = p.normalized && a instanceof Uint16Array ? 1 / 65535 : 1, e = mesh.matrix.elements;
  const v = [0, 0];
  const toBoard = (i) => {
    const x = a[3 * i] * norm, y = a[3 * i + 1] * norm, z = a[3 * i + 2] * norm;
    v[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; v[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    return v;
  };
  geo.setAttribute('aKey', new p.constructor(wideKeys(a, index.array, p.count, toBoard), 1)); // (a BufferAttribute)
  geo.userData.wideKeyed = true;
}

// ---- shaders -------------------------------------------------------------------------------------------------------

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec2 uv1;
attribute vec4 color;
attribute float aKey;        // the wide field's seam key (setWide wideKeys): 0 = cut by the fragment's x
varying float vKey;
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
  vKey = aKey;
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
uniform vec2 uClipX;         // world x drawn (the two copies of the scene on a wide unite field meet at x 18.5: setWide)
uniform float uKeyShift;     // the copy's shift (setWide), added to a whole piece's key
varying float vKey;
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
  float clipX = vKey > 0.5 ? vKey - ${WIDE_KEY.bias.toFixed(1)} + uKeyShift : vWorld.x;
  if (clipX < uClipX.x || clipX > uClipX.y) discard;
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
uniform vec2 uClipX;         // world x drawn (the two copies of the scene on a wide unite field meet at x 18.5: setWide)
uniform float uKeyShift;     // the copy's shift (setWide), added to a whole piece's key
varying float vKey;
varying vec2 vUv;
varying vec2 vUv1;
varying vec3 vNormalW;
varying vec3 vWorld;
varying vec4 vColor;
void main() {
  float clipX = vKey > 0.5 ? vKey - ${WIDE_KEY.bias.toFixed(1)} + uKeyShift : vWorld.x;
  if (clipX < uClipX.x || clipX > uClipX.y) discard;
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

/**
 * Tunables (checked against the official screenshots; see docs/local/official-scenes.md). local patch (LOCAL-PATCH.md 「공식 맵 렌더링」,
 * 2026-10-07): the maintainer found the board slightly brighter than the KR client — matched regions of the same stage: plain
 * sand official/ours 0.964 in luma, the lit sand tops 0.92 (ours clipped: 13.6 % of pixels R ≥ 250 vs 5.0 %), stone /
 * crate / rocks ≈ 1. [추정] the cause (the scene's AE_Survivaloasis profile — shadowTint, heightFog — is native code):
 * the direct light −10 %, the lightmap −3 %.
 */
export const OFFICIAL_LIGHTING = Object.freeze({ lmGain: 0.97, directGain: 0.9, emissionGain: 1.0, ambientGain: 1.0 });

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
  // the x range the stage's meshes draw (setWide), shared by every stage material; the device models draw everywhere
  const OPEN = 1e4;
  const clipStage = { value: new T.Vector2(-OPEN, OPEN) };
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
          uClipX: matSrc === doc.materials ? clipStage : { value: new T.Vector2(-OPEN, OPEN) }, uKeyShift: { value: 0 },
          ...focus,
        },
      });
      animated.push(mat);
    } else {
      const mainTex = tex(X._MainTex?.file);
      const st = X._MainTex ? [...X._MainTex.scale, ...X._MainTex.offset] : [1, 1, 0, 0];
      const particle = /Particles|Unlit|DynamicWaterTile/.test(shader);
      // Unity's built-in Unlit/Texture (the 土石结构 and 特制水上平台 device models): the texture as is, opaque, culled
      const unlitTex = shader === 'Unlit/Texture';
      const blend = !/Scene\/Trap/.test(shader) && !unlitTex && (kw.has('_ALPHABLEND_ON') || particle || (F._Mode ?? 0) >= 2);
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
        transparent: blend, depthWrite: !blend, side: particle && !unlitTex ? T.DoubleSide : T.FrontSide,
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
          uClipX: matSrc === doc.materials ? clipStage : { value: new T.Vector2(-OPEN, OPEN) }, uKeyShift: { value: 0 },
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
  const showHidden = (list, rects) => {
    for (const m of list) {
      const k = m.userData.hidden;
      if (k && !m.userData.tideWarning) m.visible = rects.some((a) => overlaps(hiddenTiles[k]?.tiles, a));
    }
  };
  // the 8-player mode's wide 联防 field (setWide): a second copy of the island `shift` columns to the right, drawn from
  // x 18.5 (the old right spawn, where the added halves end — shared/wideField.js) while the stage's own stops there;
  // the pieces around the field go whole to one side (WIDE_KEY)
  const SEAM = 18.5;
  let wide = null; // { halves, shift, group, meshes, materials }
  let area = [];
  const dropWide = () => {
    if (!wide) return;
    wide.group.parent?.remove(wide.group);
    for (const mt of wide.materials) mt.dispose();
    wide = null;
    clipStage.value.set(-OPEN, OPEN);
  };
  return {
    stageId: data.stageId,
    highland: Number.isFinite(hl) && hl > 0 ? hl : null,
    meshes,
    materials: [...materials.values()],
    setArea(rects) {
      area = Array.isArray(rects) ? rects : [];
      showHidden(meshes, area);
      // the copy's hidden sets by the stage tiles under it (the area moved back by the shift)
      if (wide) showHidden(wide.meshes, area.map((a) => ({ ...a, c0: a.c0 - wide.shift, c1: a.c1 - wide.shift })));
    },
    /**
     * Draw the island for a wide 联防 field of `halves` (3 | 4: the copy 8 / 16 columns right, from x 18.5), or as the
     * stage alone (0). Returns the copy's Group to add to the scene (null when there is none); its meshes share the
     * geometry, its materials share every uniform but the clip and the key shift (the copy's are disposed with it).
     * The pieces of scenery around the field are drawn whole by one side (WIDE_KEY, wideKeys) [ASSUMED].
     * @param {number} halves
     */
    setWide(halves) {
      const shift = halves === 3 || halves === 4 ? 8 * (halves - 2) : 0;
      if ((wide?.shift || 0) === shift) return wide ? wide.group : null;
      dropWide();
      if (!shift) return null;
      const clipCopy = { value: new T.Vector2(SEAM, OPEN) };
      const own = new Map();
      const copyOf = (mt) => {
        if (!own.has(mt)) {
          const c = mt.clone();
          c.uniforms = { ...mt.uniforms, uClipX: clipCopy, uKeyShift: { value: shift } };
          c.userData = { ...mt.userData };
          own.set(mt, c);
        }
        return own.get(mt);
      };
      for (const m of meshes) keyGeometry(m);
      const group = new T.Group();
      group.name = `official-wide:${halves}`;
      group.position.set(shift, 0, 0);
      group.updateMatrix();
      const copies = meshes.map((m) => {
        const c = new T.Mesh(m.geometry, copyOf(m.material));
        c.matrixAutoUpdate = false;
        c.matrix.copy(m.matrix);
        c.castShadow = m.castShadow; c.receiveShadow = m.receiveShadow;
        c.renderOrder = m.renderOrder;
        c.visible = m.visible;
        c.name = `${m.name}:wide`;
        c.userData = { ...m.userData };
        group.add(c);
        return c;
      });
      clipStage.value.set(-OPEN, SEAM);
      wide = { halves, shift, group, meshes: copies, materials: [...own.values()] };
      if (area.length) this.setArea(area);
      return group;
    },
    lightDir, lightColor,
    devices,
    dispose() {
      dropWide();
      for (const m of meshes) m.geometry.dispose();
      for (const g of devGeos) g.dispose();
      for (const m of materials.values()) m.dispose();
      for (const t of texCache.values()) t.dispose();
      for (const l of lms) { l.light?.dispose(); l.mask?.dispose(); }
    },
    update(t) { for (const m of animated) m.uniforms.uTime.value = t; },
  };
}

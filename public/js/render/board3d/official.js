// render/board3d/official.js — the official per-stage board scenes (DESIGN §15.1): the client's prebuilt Unity scene
// of each autochess stage, exported by tools/local-extract/scene_extract.py into scene/<stageId>/ (merged draw groups
// in board space + baked lightmaps / shadowmasks) and scene/tex/ (theme textures: map_autochesssand, map_kxmr, …).
//
//   const data = await loadOfficialScene(assets, stageId)   // null when the stage has no extracted scene
//   const built = buildOfficialScene(THREE, data, focus)    // → { meshes: [Mesh], materials, dispose() }
//   built.setArea(rects)                                    // show the hidden sets of the field(s) in play
//   built.update(t)                                         // animated materials (water)
//
// Hidden sets: the level's MapHiddenSettings keys (HIDDEN@1 left normal field, @2 right normal field, @3 boss
// field) are saved hidden and shown by the client for the part of the map in play; a group tagged with a key is
// visible while its tile rect (scene.json hidden[key].tiles) overlaps one of the built areas (layout.js AREAS).
//
// Shading follows the Torappu scene shaders closely enough for the board: albedo (× _Color, the desert theme's
// vertex-colour sand blend toward _BlendColor) × (baked indirect light (RGBM lightmap, Unity's linear decode
// 34.49 · a^2.2) + the mixed main light × N·L × its shadowmask) + emission. Without a lightmap (water, UI quads,
// backgrounds) the main light plus the scene ambient apply. The same focus falloff as the procedural board
// (materials.js addFocus) dims everything outside the active field.

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
    return { stageId, doc, buffer: buf, textures, lightmaps };
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
uniform vec3 uBlendColor;
uniform float uBlendStrength;
uniform vec3 uLightDir;      // towards the light (board space)
uniform vec3 uLightColor;    // linear, × intensity
uniform vec3 uAmbient;
uniform float uCutoff;
uniform float uBumpScale;
uniform float uLmGain;
uniform float uDirectGain;
uniform float uEmissionGain;
uniform float uOpacity;
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

void main() {
  vec4 albedo = texture2D(uMap, vUv) * uColor;
  #ifdef ALPHATEST
    if (albedo.a < uCutoff) discard;
  #endif
  #ifdef VERTEX_BLEND
    albedo.rgb = mix(albedo.rgb, albedo.rgb * uBlendColor * 2.0, clamp(vColor.r * uBlendStrength, 0.0, 1.0));
  #endif
  vec3 n = normalize(vNormalW);
  if (!gl_FrontFacing) n = -n;
  #ifdef NORMALMAP
    vec3 mapN = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
    mapN.xy *= uBumpScale;
    n = perturb(n, normalize(mapN));
  #endif
  float ndl = max(dot(n, normalize(uLightDir)), 0.0);
  vec3 light;
  #ifdef LIGHTMAP
    vec4 lm = texture2D(uLight, vUv1);
    vec3 indirect = lm.rgb * (34.493242 * pow(max(lm.a, 0.0), 2.2));
    float mask = texture2D(uMask, vUv1).r;
    light = indirect * uLmGain + uLightColor * ndl * mask * uDirectGain;
  #else
    light = uAmbient + uLightColor * ndl * uDirectGain;
  #endif
  vec3 outgoing = albedo.rgb * light;
  #ifdef EMISSION
    outgoing += texture2D(uEmission, vUv).rgb * uEmissionColor * uEmissionGain;
  #endif
  #ifdef UNLIT
    outgoing = albedo.rgb;
  #endif
  vec2 fd = max(vec2(0.0), max(uFocus.xy - vWorld.xy, vWorld.xy - uFocus.zw));
  outgoing *= mix(uFocusDim, 1.0, 1.0 - smoothstep(0.0, uFocusSoft, length(fd)));
  gl_FragColor = vec4(outgoing, albedo.a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Simplified Torappu/Scene/StylizedWater: deep / shallow tint, scrolling wave normals, sky glint. */
const WATER_FRAG = /* glsl */`
#include <common>
uniform sampler2D uWaves;
uniform vec4 uDeep;
uniform vec4 uShallow;
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
  // the official shader blends shallow → deep by scene depth; the board's channels are deep: mostly the deep colour
  vec3 base = mix(uShallow.rgb, uDeep.rgb, 0.86 + 0.1 * n.x);
  float spec = pow(max(dot(reflect(-normalize(uLightDir), n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  vec3 col = base * (0.55 + 0.45 * max(dot(n, normalize(uLightDir)), 0.0)) + uLightColor * spec * 0.35;
  vec2 fd = max(vec2(0.0), max(uFocus.xy - vWorld.xy, vWorld.xy - uFocus.zw));
  col *= mix(uFocusDim, 1.0, 1.0 - smoothstep(0.0, uFocusSoft, length(fd)));
  gl_FragColor = vec4(col, clamp(uDeep.a + 0.2, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Tunables (checked against the official screenshots; see DESIGN §15.1). */
export const OFFICIAL_LIGHTING = Object.freeze({ lmGain: 1.0, directGain: 1.0, emissionGain: 1.0, ambientGain: 1.0 });

function texture(THREE, img, { srgb = true, repeat = false, aniso = 1 } = {}) {
  if (!img) return null;
  const t = new THREE.Texture(img);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const lin = (THREE, c) => (c ? new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) : new THREE.Color(1, 1, 1));

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
  const tex = (file, o) => {
    if (!file || !data.textures[file]) return null;
    const k = `${file}|${o?.srgb !== false}|${!!o?.repeat}`;
    if (!texCache.has(k)) texCache.set(k, texture(T, data.textures[file], { ...o, aniso }));
    return texCache.get(k);
  };
  const lms = (data.lightmaps || []).map((lm) => ({
    light: texture(T, lm.light, { srgb: true }),
    mask: texture(T, lm.mask, { srgb: false }),
  }));
  const main = (doc.lights || []).find((l) => l.active && l.type === 1) || null;
  const lightDir = main ? new T.Vector3(-main.dir[0], -main.dir[1], -main.dir[2]).normalize() : new T.Vector3(0.4, 0.4, 0.8).normalize();
  const lightColor = main ? lin(T, main.color).multiplyScalar(main.intensity) : new T.Color(1, 1, 1);
  const S = doc.settings || {};
  const ambient = S.ambientSky ? lin(T, S.ambientSky).multiplyScalar((S.ambientIntensity ?? 1) * OFFICIAL_LIGHTING.ambientGain) : new T.Color(0.3, 0.3, 0.3);

  const materials = new Map();
  const animated = [];
  // q: a version-2 group's uv ranges ({ uv0, uv1: [sx, sy, ox, oy] }, u16 normalized → uv); folded into uMainST /
  // uUv1ST, so a quantized group gets a material of its own (same program, no extra draw calls)
  const materialFor = (name, lmIndex, q = null) => {
    const key = `${name}|${lmIndex}${q ? `|${q.uv0}|${q.uv1}` : ''}`;
    if (materials.has(key)) return materials.get(key);
    const q0 = q?.uv0 || [1, 1, 0, 0], q1 = q?.uv1 || [1, 1, 0, 0];
    const info = doc.materials?.[name] || { shader: null, keywords: [], textures: {}, floats: {}, colors: {} };
    const kw = new Set(info.keywords || []);
    const F = info.floats || {}, C = info.colors || {}, X = info.textures || {};
    const shader = info.shader || '';
    let mat;
    if (/StylizedWater/.test(shader)) {
      const waves = tex(X._BumpMap?.file, { srgb: false, repeat: true });
      mat = new T.ShaderMaterial({
        vertexShader: VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
        uniforms: {
          uMainST: { value: new T.Vector4(...q0) }, uUv1ST: { value: new T.Vector4(...q1) }, uWaves: { value: waves },
          uDeep: { value: new T.Vector4(...(C._DeepWaterColor || [0, 0.27, 0.4, 0.67])) },
          uShallow: { value: new T.Vector4(...(C._ShallowWaterColor || [0.39, 1, 0.7, 0.5])) },
          uLightDir: { value: lightDir }, uLightColor: { value: lightColor }, uTime: { value: 0 },
          uWaveTiling: { value: new T.Vector2(...(X._BumpMap?.scale || [0.6, 0.37])) },
          ...focus,
        },
      });
      // the shader takes linear colours: convert the material's sRGB ones
      for (const u of ['uDeep', 'uShallow']) {
        const v = mat.uniforms[u].value, c = new T.Color().setRGB(v.x, v.y, v.z, T.SRGBColorSpace);
        v.set(c.r, c.g, c.b, v.w);
      }
      animated.push(mat);
    } else {
      const mainTex = tex(X._MainTex?.file);
      const st = X._MainTex ? [...X._MainTex.scale, ...X._MainTex.offset] : [1, 1, 0, 0];
      const particle = /Particles|Unlit|DynamicWaterTile/.test(shader);
      const blend = kw.has('_ALPHABLEND_ON') || particle || (F._Mode ?? 0) >= 2;
      const defines = {};
      if (kw.has('_ALPHATEST_ON')) defines.ALPHATEST = 1;
      if (kw.has('_HG_VERTEX_COLOR_BLEND_ON')) defines.VERTEX_BLEND = 1;
      const normal = kw.has('_NORMALMAP') ? tex(X._BumpMap?.file, { srgb: false }) : null;
      if (normal) defines.NORMALMAP = 1;
      const emission = kw.has('_EMISSION') ? tex(X._EmissionMap?.file) : null;
      if (emission) defines.EMISSION = 1;
      const lm = lmIndex >= 0 ? lms[lmIndex] : null;
      if (lm && lm.light && lm.mask) defines.LIGHTMAP = 1;
      if (particle) defines.UNLIT = 1;
      const color = particle && C._TintColor ? C._TintColor.map((v, i) => (i < 3 ? v * 2 : v * 2)) : (C._Color || [1, 1, 1, 1]);
      const col = lin(T, color);
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
          uEmissionColor: { value: lin(T, C._EmissionColor || [1, 1, 1]) },
          uBlendColor: { value: lin(T, C._BlendColor || [1, 1, 1]) },
          uBlendStrength: { value: F._BlendStrength ?? 1 },
          uLightDir: { value: lightDir }, uLightColor: { value: lightColor }, uAmbient: { value: ambient },
          uCutoff: { value: F._Cutoff ?? 0.5 }, uBumpScale: { value: F._BumpScale ?? 1 },
          uLmGain: { value: OFFICIAL_LIGHTING.lmGain }, uDirectGain: { value: OFFICIAL_LIGHTING.directGain },
          uEmissionGain: { value: OFFICIAL_LIGHTING.emissionGain }, uOpacity: { value: 1 },
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
  const qpos = doc.version >= 2 && Array.isArray(doc.quant?.pos) ? doc.quant.pos : null;
  const dzs = new Set(Array.isArray(doc.quant?.dzs) ? doc.quant.dzs : []);
  for (const g of doc.groups) {
    if (!g || !g.vertices || !g.indices) continue;
    const geo = new T.BufferGeometry();
    const q = qpos && g.q ? g.q : null;
    if (q) {
      // the dzs arrays are delta + zigzag + byte-shuffled (scene_extract.py dzs): decoded into fresh arrays
      const u16 = (k, comps) => (dzs.has(k) ? unDzs(buffer, g[k], 2, comps) : new Uint16Array(buffer, g[k][0], g[k][1]));
      geo.setAttribute('position', new T.BufferAttribute(u16('pos', 3), 3, true));
      geo.setAttribute('normal', new T.BufferAttribute(new Int8Array(buffer, g.nrm[0], g.nrm[1]), 4, true));
      geo.setAttribute('uv', new T.BufferAttribute(u16('uv0', 2), 2, true));
      geo.setAttribute('uv1', new T.BufferAttribute(u16('uv1', 2), 2, true));
    } else {
      const f32 = (r) => new Float32Array(buffer, r[0], r[1]);
      geo.setAttribute('position', new T.BufferAttribute(f32(g.pos), 3));
      geo.setAttribute('normal', new T.BufferAttribute(f32(g.nrm), 3));
      geo.setAttribute('uv', new T.BufferAttribute(f32(g.uv0), 2));
      geo.setAttribute('uv1', new T.BufferAttribute(f32(g.uv1), 2));
    }
    let col;
    if (g.col) col = new Uint8Array(buffer, g.col[0], g.col[1]);
    else {
      col = new Uint8Array(g.vertices * 4);
      const c = Array.isArray(g.colConst) ? g.colConst : [255, 255, 255, 255];
      for (let i = 0; i < col.length; i += 4) col.set(c, i);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 4, true));
    const iw = q && g.idxType === 'u16' ? 2 : 4;
    const idx = q && dzs.has('idx') ? unDzs(buffer, g.idx, iw, 1) : new (iw === 2 ? Uint16Array : Uint32Array)(buffer, g.idx[0], g.idx[1]);
    geo.setIndex(new T.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
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
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      for (const m of materials.values()) m.dispose();
      for (const t of texCache.values()) t.dispose();
      for (const l of lms) { l.light?.dispose(); l.mask?.dispose(); }
    },
    update(t) { for (const m of animated) m.uniforms.uTime.value = t; },
  };
}

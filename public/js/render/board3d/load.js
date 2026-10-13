// render/board3d/load.js — loading of three.js and the official board art (local-client extraction, DESIGN §13/§15).
//
//   const THREE = await loadThree()            // '/vendor/three.module.js' (tools/vendor.mjs), null when missing
//   const pack = await loadBoardPack(assets)   // null when the board art is not installed (→ 2D board)
//   → { key, images: { D, N?, R?, E?, common?, commonE?, BG?, wind?, gate?, waterN?, caustics?, noise? },
//       meshes: { crate?, blower?, bgPlane?, gate: { startDown?, startUp?, startBack?, endDown?, endUp? } },
//       tiles, uv, materials: { theme?, fx? } }
//
// Everything is optional except the diffuse atlas: a missing map or mesh only drops that feature (e.g. no normal
// map → flat shading of the atlas; no crate mesh → a procedural box). URLs come from data/local-assets.json only
// (assets.localUrl) — nothing is guessed. Results are cached per page; a failed load is not kept for good: `{ retry: true }`
// loads again what failed (a dropped request on a phone, an image that could not be decoded under memory pressure).
//
//   const r = await loadBoard3d(assets, { retry })   // both of the above → { status: 'ok', THREE, pack }
//                                                    // | { status: 'retry', why } (worth trying again later)
//                                                    // | { status: 'never', why } (this host has no board art)

import { resolveUvTable } from './atlas.js';
import { parseObj } from './obj.js';

// beside this module, as fxgame.js / fxplayer.js import it: one three.js for the page, also under its versioned
// /b/<tag>/r/ URLs (server/http/buildTag.js)
export const THREE_URL = new URL('../../../vendor/three.module.js', import.meta.url).href;

let threePromise = null;
let threeFailed = false;
let threeTry = 0;
/**
 * Dynamic import of the vendored three.js ESM build (browser only); null when unavailable. `retry` imports again after a
 * failed import (under another URL: a browser may keep the failed module record of the first one).
 */
export function loadThree(url = THREE_URL, { retry = false } = {}) {
  if (threePromise && retry && threeFailed) threePromise = null;
  if (!threePromise) {
    threeFailed = false;
    const u = threeTry++ ? `${url}?retry=${threeTry - 1}` : url;
    threePromise = import(/* @vite-ignore */ u).then((m) => (m && m.WebGLRenderer ? m : null), () => null)
      .then((m) => { if (!m) threeFailed = true; return m; });
  }
  return threePromise;
}

/**
 * Can this browser run the 3D board? (WebGL2 — three r163+ requires it.) Software / blocklisted GPUs ("major
 * performance caveat") count as unavailable unless `allowSlow` (an explicit `?board=3d`).
 */
export function webgl2Available(allowSlow = false) {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', allowSlow ? {} : { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch { return false; }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Manifest key → pack slot. */
export const PACK_IMAGES = Object.freeze({
  D: ['map/autochess', 'TX_autochessi_D'],
  N: ['map/autochess', 'TX_autochessi_N_rgb'],
  R: ['map/autochess', 'TX_autochessi_M_rough'],
  E: ['map/autochess', 'TX_autochessi_E'],
  common: ['map/autochess', 'TX_autochessi_common_D'],
  commonE: ['map/autochess', 'TX_autochessi_common_E'],
  BG: ['map/autochess', 'TX_autochessi_BG'],
  wind: ['map/common', 'TX_wind_device'],
  gate: ['map/fx', '[opt]merged_textures'],
  waterN: ['map/water', '[ucp]TX_water_normal'],
  caustics: ['map/water', 'TX_Caustics256'],
  noise: ['map/water', 'T_noise_clouds_01'],
});

export const PACK_MESHES = Object.freeze({
  crate: ['mesh/s_common_box_01', 'pCube2'],
  blower: ['mesh/s_wind_device', 'S_wild_wind_device'],
  bgPlane: ['mesh/s_background_common', 'pPlane1'],
});

/** The official gate / objective boxes: prefab node → pack slot (meshes resolved through map/fx/prefab.json). */
export const GATE_NODES = Object.freeze({
  startDown: 'Start_down', startUp: 'Start_up', startBack: 'Start_back', endDown: 'Start_down1', endUp: 'Start_up1',
});

let cached = null;
let cachedFailed = false;

/**
 * Does the local-art manifest list the board atlas? Reads the manifest only (no images): decides whether the
 * ~2 MB three.js build is worth downloading at all (most hosts have no local-client art → 2D board, no three).
 */
export async function boardArtListed(assets, opts) {
  return (await boardArtState(assets, opts)) === 'yes';
}

/**
 * 'yes' (the manifest lists the board atlas), 'no' (a manifest without it, or no asset store: this host has no board
 * art) or 'unknown' (the manifest could not be read — maybe a dropped request; `retry` asks for it again).
 */
export async function boardArtState(assets, { retry = false } = {}) {
  if (!assets || typeof assets.local !== 'function' || typeof assets.localUrl !== 'function') return 'no';
  let manifest;
  try { manifest = await assets.local(retry ? { retry: true } : undefined); } catch { manifest = null; }
  const u = assets.localUrl(...PACK_IMAGES.D);
  if (typeof u === 'string' && u.length > 0) return 'yes';
  return isObj(manifest) ? 'no' : 'unknown';
}

/**
 * three.js and the board pack for the 3D board (render/app.js): `{ status: 'ok', THREE, pack }`, `{ status: 'retry', why }`
 * when something failed to load (`retry: true` on the next call loads it again) or `{ status: 'never', why }` when this
 * host has no board art. three.js (~2 MB) is fetched only when the manifest lists the board atlas.
 * @param {any} assets @param {{ retry?: boolean, threeUrl?: string }} [opts]
 */
export async function loadBoard3d(assets, { retry = false, threeUrl = THREE_URL } = {}) {
  const art = await boardArtState(assets, { retry });
  if (art === 'no') return { status: 'never', why: 'no board art on this server' };
  if (art === 'unknown') return { status: 'retry', why: 'local-art manifest unavailable' };
  const ready = Promise.resolve(typeof assets.ready === 'function' ? assets.ready() : null).catch(() => null);
  const [THREE, pack] = await Promise.all([loadThree(threeUrl, { retry }), ready.then(() => loadBoardPack(assets, { retry }))]);
  if (!THREE) return { status: 'retry', why: 'three.js failed to load' };
  if (!pack) return { status: 'retry', why: 'board art failed to load' };
  return { status: 'ok', THREE, pack };
}

async function fetchText(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.text() : null; } catch { return null; }
}
async function fetchJson(url) {
  try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}

/**
 * Load the board pack through the asset store of public/js/assets.js (needs local(), localUrl(), image()). `retry`
 * loads again after a result of null (and asks the store for the images that failed again).
 * @returns {Promise<object|null>}
 */
export function loadBoardPack(assets, { retry = false } = {}) {
  if (cached && retry && cachedFailed) cached = null;
  if (cached) return cached;
  cachedFailed = false;
  cached = (async () => {
    if (!assets || typeof assets.local !== 'function' || typeof assets.localUrl !== 'function' || typeof assets.image !== 'function') return null;
    const manifest = await assets.local().catch(() => null);
    if (!isObj(manifest)) return null;
    const url = (g, n) => { const u = assets.localUrl(g, n); return typeof u === 'string' && u ? encodeURI(u) : null; };
    const dUrl = url(...PACK_IMAGES.D);
    if (!dUrl) return null;
    const images = {};
    await Promise.all(Object.entries(PACK_IMAGES).map(async ([k, [g, n]]) => {
      const u = url(g, n);
      if (!u) return;
      const img = await (retry ? assets.image(u, { retry: true }) : assets.image(u)).catch(() => null);
      if (img && (img.width || img.naturalWidth) > 0) images[k] = img;
    }));
    if (!images.D) return null;
    const dir = dUrl.replace(/\/[^/]*$/, '');
    const [tiles, theme, fxMats, fxPrefab] = await Promise.all([
      fetchJson(`${dir}/tiles.json`),
      (async () => { const u = url('map/autochess', 'materials'); return u ? fetchJson(u) : null; })(),
      (async () => { const u = url('map/fx', 'materials'); return u ? fetchJson(u) : null; })(),
      (async () => { const u = url('map/fx', 'prefab'); return u ? fetchJson(u) : null; })(),
    ]);
    const meshes = { gate: {} };
    await Promise.all(Object.entries(PACK_MESHES).map(async ([k, [g, n]]) => {
      const u = url(g, n);
      const text = u ? await fetchText(u) : null;
      const m = text ? parseObj(text) : null;
      if (m) meshes[k] = m;
    }));
    const prefab = Array.isArray(fxPrefab) ? fxPrefab : [];
    await Promise.all(Object.entries(GATE_NODES).map(async ([slot, node]) => {
      const rec = prefab.find((p) => p && p.name === node && (node !== 'Start_back' || p.parent === '[opt]start_box'));
      const key = rec && typeof rec.mesh === 'string' ? rec.mesh : node;
      const u = url('map/fx', key);
      const text = u ? await fetchText(u) : null;
      const m = text ? parseObj(text) : null;
      if (m) meshes.gate[slot] = { mesh: m, material: rec && Array.isArray(rec.materials) ? rec.materials[0] || null : null };
    }));
    return {
      key: `${dUrl}#${tiles?.version || 0}`,
      images, meshes, tiles: isObj(tiles) ? tiles : null, uv: resolveUvTable(isObj(tiles) ? tiles : null),
      materials: { theme: isObj(theme) ? theme : null, fx: isObj(fxMats) ? fxMats : null },
    };
  })().catch((err) => { console.warn('[board3d] art load failed', err); return null; })
    .then((pack) => { if (!pack) cachedFailed = true; return pack; });
  return cached;
}

/** Forget the cached pack (tests / hot reload). */
export function resetBoardPack() { cached = null; cachedFailed = false; threePromise = null; threeFailed = false; threeTry = 0; }

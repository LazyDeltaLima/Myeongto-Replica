// A season's entry animation played from the official clip: the hub panel of 卫戍协议：规程 opens with its legacy
// Animation clip autochess_entry_season_on (3.17 s), whose first 2.57 s are a film (canvas_front/entry_anim_season_on,
// under the black cover cover_black_in) and whose last second brings the hub in. tools/local-extract/season_ui.py
// writes the film's RectTransform tree, its images and materials and every keyframe of the clip to
// `season/<id>/entry/film` (data/local-assets.json); this module lays the tree out as Unity does (anchors, pivots and
// sizes in the 1280×720 canvas, expanded to the screen), evaluates the keyframes as Unity's Hermite curves, and plays
// the hub's part of the clip on the title screen instead (titleReveal: the backdrop, the logo, the login box, the
// corners and the side text, marked `data-reveal` in screens/title.js). ui/entryFilm.js runs it before the title.
//
// What the clip and the prefab give is drawn as they give it. The materials are not shaders here: what each draws is
// read from its shader properties at extraction (season_ui.py material_draw) and drawn in CSS — a flipbook sheet (the
// frame from the image colour's r), a circle, a dissolve sweep, additive blending. [ASSUMED·화면] Matched to an official
// recording (규정, CN, 2026-11): the circles of mat_shape_circle_soft are thin lines in their colour (the teal rings),
// those of mat_shape_circle_tile_add a faint scan-line band; the scan-line map of mat_entry_map_dissolve glows while
// its sweep crosses the middle; the particle systems of ui_particle are three thin teal rays turning through the map's
// marker from 1.2 s to 1.85 s; the loading bar's flare (a sprite of another bundle) is a soft red glow.
import { data, localAsset } from '../data.js';
import { seasonOf, DEFAULT_SEASON } from '../../../shared/seasons.js';

/**
 * The film file season_ui.py writes (`season/<id>/entry/film`), the fields this module reads.
 * @typedef {number | number[]} KeyValue  a key's value: a number, or a vector (scale)
 * @typedef {[number, KeyValue, KeyValue | null, KeyValue | null]} CurveKey  [time, value, inSlope, outSlope]; a null
 *   slope is an infinite one (a stepped key)
 * @typedef {{ p: string, a: string, k: CurveKey[] }} ClipCurve  the attribute `a` of the node at path `p`
 * @typedef {{ type: number, color: number[], sprite?: string | null, mat?: string }} FilmImage  a node's Image: its
 *   colour (rgba), its sprite (null: a sprite of another bundle, not carried) and its material
 * @typedef {{ p: string, active: boolean, alpha?: number, img?: FilmImage, mask?: boolean, particles?: boolean }} FilmNodeBase
 * @typedef {FilmNodeBase & { amin: number[], amax: number[], pos: number[], size: number[], piv: number[],
 *   scale: number[] }} FilmRectNode  a node with a RectTransform
 * @typedef {FilmNodeBase & { amin?: undefined }} FilmBareNode  a particle system without a RectTransform
 * @typedef {FilmRectNode | FilmBareNode} FilmNode
 * @typedef {{ add?: boolean, kind: 'sheet', cols: number, rows: number, tint: number[], tex: string }} SheetMaterial
 * @typedef {{ add?: boolean, kind: 'ring', inStep: number, inSmooth: number, outStep: number, outSmooth: number,
 *   lines: boolean, tex?: undefined }} RingMaterial
 * @typedef {{ add?: boolean, kind: 'dissolve', masked: boolean, tex?: undefined }} DissolveMaterial
 * @typedef {{ add?: boolean, kind?: never, tex?: undefined }} PlainMaterial  (no kind: a plain image)
 * @typedef {SheetMaterial | RingMaterial | DissolveMaterial | PlainMaterial} FilmMaterial  what a material draws
 * @typedef {{ w: number, h: number, border?: number[] }} FilmSprite
 * @typedef {{ version: number, canvas: number[], film: string, cover: string, nodes: FilmNode[],
 *   materials: Record<string, FilmMaterial>, sprites: Record<string, FilmSprite>, curves: ClipCurve[],
 *   [key: string]: unknown }} ClipFilmData
 * @typedef {{ [attr: string]: number } & { scale?: number[] }} ClipValues  one node's animated values at a second
 * @typedef {{ url: string, im: HTMLImageElement }} FilmPicture
 * @typedef {{ id: string, film: ClipFilmData, url: (n: string) => string | undefined,
 *   tinted: (n: string, rgb: number[]) => string | undefined }} LoadedFilm  a film with its pictures loaded
 * @typedef {{ left: number, top: number, w: number, h: number }} FilmBox
 * @typedef {{ [K in keyof CSSStyleDeclaration]: CSSStyleDeclaration[K] extends string ? K : never }[keyof CSSStyleDeclaration]} StyleKey
 * @typedef {{ n: FilmNode, el: HTMLDivElement, set: (k: StyleKey, v: string) => void,
 *   paint: null | ((col: number[]) => void), kids: NodeRec[], rays: HTMLDivElement[] | null,
 *   map?: (x: number, y: number) => number[], box?: FilmBox }} NodeRec  one laid-out node of the film
 */

/** The clip second the film switches itself off (canvas_front/entry_anim_season_on m_IsActive → 0). */
export const FILM_OFF = 2.5667;
/** The clip's length: the hub is in (_OnAnimEnd). */
export const FILM_END = 3.1667;
/**
 * [ASSUMED·화면] The entry cue (EventPlayUI ON_AUTOCHESS_LOAD3 at clip 0 s, autochess_b_ui_load_3) is heard 0.25 s
 * into the film in the official recording (the cue's file against its soundtrack, r 0.75); the hub music is not heard
 * before the recording ends (3.1 s in), so it starts as the clip ends.
 */
export const FILM_AUDIO = Object.freeze({ sfxAt: 0.25, bgmAt: FILM_END });

const RAYS = Object.freeze({ from: 1.15, full: 1.3, fade: 1.65, to: 1.85, angles: [-12, -38, -62], turn: -20, color: '40,200,180', alpha: 0.75 });

// ---- curves ---------------------------------------------------------------------------------------------------------

/**
 * Unity's AnimationCurve between keyframes [time, value, inSlope, outSlope] (a Hermite spline; a null tangent — an
 * infinite one — holds the left key's value: a stepped key such as m_IsActive). `pick` reads one axis of a vector key.
 * Before the first key the first value, after the last the last.
 * @param {CurveKey[]} keys @param {number} t @param {(v: KeyValue | null) => number | null} [pick] (a value is never
 *   null; a slope is null where the key's is)
 * @returns {number}
 */
export function evalCurve(keys, t, pick = /** @type {(v: KeyValue | null) => number | null} */ ((v) => v)) {
  if (!keys.length) return 0;
  if (t <= keys[0][0]) return /** @type {number} */ (pick(keys[0][1]));
  const last = keys[keys.length - 1];
  if (t >= last[0]) return /** @type {number} */ (pick(last[1]));
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const v0 = /** @type {number} */ (pick(k0[1])), v1 = /** @type {number} */ (pick(k1[1])), m0 = pick(k0[3]), m1 = pick(k1[2]);
  if (m0 == null || m1 == null) return v0;
  const dt = k1[0] - k0[0];
  if (dt <= 0) return v1;
  const s = (t - k0[0]) / dt, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 * dt + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1 * dt;
}

/** @param {number} a @returns {(v: KeyValue | null) => number | null} */
const axis = (a) => (v) => (Array.isArray(v) ? v[a] : v);

/**
 * Every animated value of the clip at second t: Map path → { attribute: value, scale: [x, y] }.
 * @param {ClipCurve[]} curves @param {number} t
 */
export function sampleClip(curves, t) {
  /** @type {Map<string, ClipValues>} */
  const out = new Map();
  for (const c of curves) {
    let o = out.get(c.p);
    if (!o) out.set(c.p, (o = {}));
    if (c.a === 'scale') o.scale = [evalCurve(c.k, t, axis(0)), evalCurve(c.k, t, axis(1))];
    else o[c.a] = evalCurve(c.k, t);
  }
  return out;
}

/**
 * A RectTransform in its parent's rect (pw × ph, Unity units, y up), with the clip's overrides `o`: the CSS box
 * (left / top from the parent's top left) and the pivot.
 * @param {{ amin: number[], amax: number[], pos: number[], size: number[], piv: number[] }} n
 * @param {number} pw @param {number} ph @param {ClipValues} [o]
 */
export function rectOf(n, pw, ph, o = {}) {
  const pos = [o['m_AnchoredPosition.x'] ?? n.pos[0], o['m_AnchoredPosition.y'] ?? n.pos[1]];
  const sd = [o['m_SizeDelta.x'] ?? n.size[0], o['m_SizeDelta.y'] ?? n.size[1]];
  const w = Math.max(0, (n.amax[0] - n.amin[0]) * pw + sd[0]);
  const h = Math.max(0, (n.amax[1] - n.amin[1]) * ph + sd[1]);
  const px = (n.amin[0] + (n.amax[0] - n.amin[0]) * n.piv[0]) * pw + pos[0];
  const py = (n.amin[1] + (n.amax[1] - n.amin[1]) * n.piv[1]) * ph + pos[1];
  const left = px - n.piv[0] * w, bottom = py - n.piv[1] * h;
  return { left, top: ph - bottom - h, w, h };
}

/**
 * The canvas scale of a 1280×720 canvas expanded to a vw × vh screen (CanvasScaler Expand) and its size in units.
 * @param {number} vw @param {number} vh @param {number[]} [canvas]
 */
export function canvasFit(vw, vh, canvas = [1280, 720]) {
  const s = Math.min(vw / canvas[0], vh / canvas[1]);
  return { s, w: vw / s, h: vh / s };
}

// ---- loading --------------------------------------------------------------------------------------------------------

/** @type {Map<string, Promise<LoadedFilm | null>>} */
const filmCache = new Map();
/** @param {string} url @returns {Promise<HTMLImageElement>} */
const loadImg = (url) => new Promise((resolve, reject) => {
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error(`load ${url}`));
  im.src = url;
});
/** @param {number[] | undefined} c */
const isWhite = (c) => !c || (c[0] > 0.999 && c[1] > 0.999 && c[2] > 0.999);

/**
 * A picture multiplied by a colour (Unity's Image colour), as a data URL; made once per picture and colour.
 * @param {HTMLImageElement} im @param {number[]} rgb
 */
function tint(im, rgb) {
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const x = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] *= rgb[0]; d.data[i + 1] *= rgb[1]; d.data[i + 2] *= rgb[2]; }
  x.putImageData(d, 0, 0);
  return cv.toDataURL();
}

/** True when the season has an extracted entry film (data/local-assets.json loaded). @param {unknown} season */
export function hasClipFilm(season) {
  const id = seasonOf(season);
  return id !== DEFAULT_SEASON && !!localAsset(`season/${id}/entry`, 'film');
}

/**
 * The season's film with every picture loaded (and the tinted copies made), or null: no extract, a file that failed,
 * or not within `timeoutMs`. A film that loaded once is kept for the page.
 * @param {unknown} season @param {number} [timeoutMs]
 * @returns {Promise<LoadedFilm | null>}
 */
export function loadClipFilm(season, timeoutMs = 3000) {
  const id = seasonOf(season);
  if (!filmCache.has(id)) {
    const p = (/** @type {() => Promise<LoadedFilm | null>} */ (async () => {
      await data.load('local');
      const group = `season/${id}/entry`;
      const url = localAsset(group, 'film');
      if (!url) return null;
      const film = /** @type {ClipFilmData | null} */ (await (await fetch(url)).json());
      if (film?.version !== 1) return null;
      const names = new Set(Object.keys(film.sprites || {}));
      for (const m of Object.values(film.materials || {})) if (m.tex) names.add(m.tex);
      /** @type {Map<string, FilmPicture>} */
      const images = new Map();
      await Promise.all([...names].map(async (n) => {
        const u = localAsset(group, n);
        if (!u) throw new Error(`no ${n}`);
        images.set(n, { url: u, im: await loadImg(u) });
      }));
      /** @type {Map<string, string>} */
      const tinted = new Map();
      /** @param {string} name @param {number[]} rgb */
      const tinted1 = (name, rgb) => {
        const key = `${name}|${rgb.join(',')}`;
        if (!tinted.has(key)) tinted.set(key, tint(/** @type {FilmPicture} */ (images.get(name)).im, rgb));
        return tinted.get(key);
      };
      for (const n of film.nodes) {
        const img = n.img, m = img && film.materials[/** @type {string} */ (img.mat)];
        if (img?.sprite && !isWhite(img.color) && m?.kind !== 'dissolve') tinted1(img.sprite, img.color);
        if (m?.kind === 'sheet' && !isWhite(m.tint)) tinted1(m.tex, m.tint);
      }
      return { id, film, url: (n) => images.get(n)?.url, tinted: (n, rgb) => (isWhite(rgb) ? images.get(n)?.url : tinted1(n, rgb)) };
    }))().catch((err) => { console.warn('[film] not loaded', err); filmCache.delete(id); return null; });
    filmCache.set(id, p);
  }
  const p = /** @type {Promise<LoadedFilm | null>} */ (filmCache.get(id));
  return Promise.race([p, /** @type {Promise<null>} */ (new Promise((r) => setTimeout(() => r(null), timeoutMs)))]);
}

// ---- the film -------------------------------------------------------------------------------------------------------

const CSS = `.spa-clip{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.spa-clip__stage{position:absolute;left:0;top:0;transform-origin:0 0}
.spa-clip__n,.spa-clip__i{position:absolute;box-sizing:border-box}
.spa-clip__i{inset:0;background-size:100% 100%;background-repeat:no-repeat}
.spa-clip__i--add{mix-blend-mode:plus-lighter}
.spa-clip__ray{position:absolute;left:0;top:0;width:3200px;height:1.5px;margin:-.75px 0 0 -1600px;
  background:linear-gradient(90deg,transparent,rgb(var(--c)) 30%,rgb(var(--c)) 70%,transparent)}`;

/**
 * Writes a style property only when its text changed (a frame touches only what moved).
 * @param {HTMLElement} el @returns {(k: StyleKey, v: string) => void}
 */
function setter(el) {
  /** @type {Record<string, string>} */
  const last = {};
  return (k, v) => { if (last[k] !== v) { last[k] = v; el.style[k] = v; } };
}

/**
 * Draws one node's Image into `el` (its child, under its children): what the prefab and the material say.
 * @param {LoadedFilm} loaded @param {FilmNode} node @param {HTMLDivElement} el
 * @returns {null | ((col: number[]) => void)} the per-frame colour update, null when nothing draws
 */
function drawImage(loaded, node, el) {
  const { film } = loaded;
  const img = node.img;
  if (!img) return null;
  const m = /** @type {FilmMaterial} */ (film.materials[/** @type {string} */ (img.mat)] || {});
  const st = el.style;
  if (m.add) el.classList.add('spa-clip__i--add');
  const set = setter(el);
  const rgb = (/** @type {number[]} */ c) => `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)}`;
  if (m.kind === 'sheet') {
    const frames = m.cols * m.rows;
    st.backgroundImage = `url("${loaded.tinted(m.tex, m.tint)}")`;
    st.backgroundSize = `${m.cols * 100}% ${m.rows * 100}%`;
    return (c) => {
      const f = Math.min(frames - 1, Math.max(0, Math.floor(c[0] * frames + 1e-4)));
      const x = m.cols > 1 ? ((f % m.cols) / (m.cols - 1)) * 100 : 0, y = m.rows > 1 ? (Math.floor(f / m.cols) / (m.rows - 1)) * 100 : 0;
      set('backgroundPosition', `${x}% ${y}%`);
      set('opacity', String(c[3]));
    };
  }
  if (m.kind === 'ring') {
    const p = (/** @type {number} */ r) => `${((r / 0.5) * 100).toFixed(2)}%`;
    const soft = !m.lines && m.inSmooth > 0.02;
    const c0 = rgb(img.color);
    if (m.lines) { // a faint scan-line band
      st.background = `radial-gradient(circle closest-side,transparent ${p(m.inStep - m.inSmooth)},rgba(${c0},.15) ${p(m.inStep)},rgba(${c0},.15) ${p(m.outStep)},transparent ${p(m.outStep + m.outSmooth)})`;
      st.maskImage = st.webkitMaskImage = 'repeating-linear-gradient(0deg,#000 0 2px,transparent 2px 4px)';
    } else if (soft) { // a thin line in its colour
      st.background = `radial-gradient(circle closest-side,transparent calc(${p(m.inStep)} - 1px),rgb(${c0}) ${p(m.inStep)},transparent calc(${p(m.inStep)} + 1px))`;
    } else {
      st.background = `radial-gradient(circle closest-side,transparent ${p(m.inStep - m.inSmooth)},rgb(${c0}) ${p(m.inStep)},rgb(${c0}) ${p(m.outStep)},transparent ${p(m.outStep + m.outSmooth)})`;
    }
    const k = soft ? Math.min(1, img.color[3] * 5) / Math.max(1e-6, img.color[3]) : 1;
    return (c) => set('opacity', String(Math.min(1, c[3] * k)));
  }
  if (img.sprite === null) { // the loading bar's flare: a sprite of another bundle
    st.background = `radial-gradient(ellipse 50% 50% at 50% 50%,rgb(${rgb(img.color)}),transparent)`;
    return (c) => set('opacity', String(c[3]));
  }
  if (!img.sprite) { // an Image without a sprite: a quad in its colour
    st.background = `rgb(${rgb(img.color)})`;
    return (c) => set('opacity', String(c[3]));
  }
  const meta = /** @type {Partial<FilmSprite>} */ (film.sprites[img.sprite] || {});
  const url = m.kind === 'dissolve' ? loaded.url(img.sprite) : loaded.tinted(img.sprite, img.color);
  const [bl, bb, br, bt] = (meta.border || [0, 0, 0, 0]).map((v) => Math.round(v));
  if ((img.type === 1 || img.type === 2) && bl + bb + br + bt > 0) { // Sliced, or Tiled with borders: the ends once
    st.borderStyle = 'solid';
    st.borderImage = `url("${url}") ${bt} ${br} ${bb} ${bl} fill / ${bt}px ${br}px ${bb}px ${bl}px ${img.type === 2 ? 'repeat' : 'stretch'}`;
  } else if (img.type === 2) { // Tiled
    st.backgroundImage = `url("${url}")`;
    st.backgroundRepeat = 'repeat';
    st.backgroundSize = `${meta.w}px ${meta.h}px`;
    st.backgroundPosition = 'center';
  } else st.backgroundImage = `url("${url}")`;
  if (m.kind === 'dissolve' && m.masked) { // the sweep's scan-line glow, brightest mid-way
    st.maskImage = st.webkitMaskImage = 'repeating-linear-gradient(0deg,#000 0 2px,transparent 2px 3px)';
    return (c) => set('opacity', String(Math.max(0, 1 - Math.abs(c[2] - 0.5) * 2) * c[3]));
  }
  const animTint = !isWhite(img.color) ? null : true;
  return (c) => {
    set('opacity', String(c[3]));
    if (animTint && c[0] < 0.999) set('filter', `brightness(${c[0].toFixed(3)})`);
    else if (animTint) set('filter', '');
  };
}

/**
 * Builds the film in `host` (filling it). render(t) shows clip second t; the film is off from FILM_OFF on.
 * @param {HTMLElement} host @param {LoadedFilm} loaded
 */
export function mountClipFilm(host, loaded) {
  const { film } = loaded;
  if (!document.getElementById('spa-clip-style')) {
    const s = document.createElement('style');
    s.id = 'spa-clip-style';
    s.textContent = CSS;
    document.head.append(s);
  }
  const box = document.createElement('div');
  box.className = 'spa-clip';
  const stage = document.createElement('div');
  stage.className = 'spa-clip__stage';
  box.append(stage);
  const filmCurves = film.curves.filter((c) => c.p === film.cover || c.p === film.film || c.p.startsWith(film.film + '/'));
  const parentOf = (/** @type {string} */ p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  /** @type {Map<string, NodeRec>} */
  const byPath = new Map();
  /** @type {NodeRec[]} */
  const roots = [];
  for (const n of film.nodes) {
    const el = document.createElement('div');
    el.className = 'spa-clip__n';
    if (n.mask || n.p.endsWith('/mask')) el.style.overflow = 'hidden';
    /** @type {NodeRec} */
    const rec = { n, el, set: setter(el), paint: null, kids: [], rays: null };
    if (n.img) {
      const i = document.createElement('div');
      i.className = 'spa-clip__i';
      rec.paint = drawImage(loaded, n, i);
      if (rec.paint) el.append(i);
    }
    if (n.p.endsWith('/ui_particle')) {
      rec.rays = RAYS.angles.map(() => { const r = document.createElement('div'); r.className = 'spa-clip__ray'; r.style.setProperty('--c', RAYS.color); el.append(r); return r; });
    }
    const parent = byPath.get(parentOf(n.p));
    if (parent) { parent.kids.push(rec); parent.el.append(el); } else { roots.push(rec); stage.append(el); }
    byPath.set(n.p, rec);
  }
  const marker = byPath.get(`${film.film}/part_1/back_desc/desc`);
  host.append(box);

  /**
   * lays one node out; `map` turns a point of the parent's box into stage units (for the rays' anchor)
   * @param {NodeRec} rec @param {number} pw @param {number} ph @param {Map<string, ClipValues>} a
   * @param {(x: number, y: number) => number[]} map
   */
  function layout(rec, pw, ph, a, map) {
    const n = rec.n;
    if (!n.amin) { rec.set('display', 'none'); return; } // a particle system without a RectTransform
    const o = /** @type {ClipValues} */ (a.get(n.p) || {});
    const active = o.m_IsActive !== undefined ? o.m_IsActive > 0.5 : n.active;
    rec.set('display', active ? '' : 'none');
    if (!active) return;
    const r = rectOf(/** @type {FilmRectNode} */ (n), pw, ph, o); // (narrowed by the amin test under strict only)
    rec.set('left', `${r.left}px`); rec.set('top', `${r.top}px`); rec.set('width', `${r.w}px`); rec.set('height', `${r.h}px`);
    const sc = o.scale || /** @type {FilmRectNode} */ (n).scale || [1, 1];
    const ox = /** @type {FilmRectNode} */ (n).piv[0] * r.w, oy = (1 - /** @type {FilmRectNode} */ (n).piv[1]) * r.h;
    rec.set('transformOrigin', `${ox}px ${oy}px`);
    rec.set('transform', sc[0] !== 1 || sc[1] !== 1 ? `scale(${sc[0]},${sc[1]})` : '');
    const cg = o.m_Alpha ?? n.alpha;
    rec.set('opacity', cg === undefined ? '' : String(cg));
    if (rec.paint) {
      const c = /** @type {FilmImage} */ (n.img).color;
      rec.paint([o['m_Color.r'] ?? c[0], o['m_Color.g'] ?? c[1], o['m_Color.b'] ?? c[2], o['m_Color.a'] ?? c[3]]);
    }
    rec.map = (x, y) => map(r.left + ox + (x - ox) * sc[0], r.top + oy + (y - oy) * sc[1]);
    rec.box = r;
    for (const k of rec.kids) layout(k, r.w, r.h, a, rec.map);
  }
  /** @param {number} t */
  function rays(t) {
    const rec = [...byPath.values()].find((x) => x.rays);
    if (!rec?.rays || !rec.map || !marker?.map) return;
    const env = t < RAYS.from || t > RAYS.to ? 0 : t < RAYS.full ? (t - RAYS.from) / (RAYS.full - RAYS.from)
      : t > RAYS.fade ? (RAYS.to - t) / (RAYS.to - RAYS.fade) : 1;
    // the marker's centre in stage units, then in ui_particle's box (a box that is only moved, never scaled)
    const m = marker.map(/** @type {FilmBox} */ (marker.box).w / 2, /** @type {FilmBox} */ (marker.box).h / 2);
    const o = rec.map(0, 0);
    rec.rays.forEach((el, i) => {
      el.style.opacity = String(env * RAYS.alpha);
      el.style.transform = `translate(${m[0] - o[0]}px,${m[1] - o[1]}px) rotate(${RAYS.angles[i] + RAYS.turn * (t - RAYS.from)}deg)`;
    });
  }
  let vw = 0, vh = 0, fit = canvasFit(1, 1);
  return {
    /** @param {number} t */
    render(t) {
      const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
      if (w !== vw || h !== vh) {
        vw = w; vh = h; fit = canvasFit(w, h, film.canvas);
        stage.style.width = `${fit.w}px`; stage.style.height = `${fit.h}px`; stage.style.transform = `scale(${fit.s})`;
      }
      const a = sampleClip(filmCurves, t);
      for (const r of roots) layout(r, fit.w, fit.h, a, (x, y) => [x, y]);
      rays(t);
      box.style.display = t >= FILM_OFF ? 'none' : '';
    },
    destroy() { box.remove(); },
  };
}

// ---- the hub's part, on the title screen ----------------------------------------------------------------------------

/**
 * The clip's hub nodes → the title screen's parts (`data-reveal` in screens/title.js) and the resting anchoredPosition.y
 * a moving one ends at (its offset from there moves the part).
 */
/** @type {Readonly<Record<string, { p: string, restY?: number }>>} */
export const REVEAL = Object.freeze({
  back: { p: 'canvas_back' },
  logo: { p: 'title_effect/root_title', restY: 155 },
  bottom: { p: 'canvas_front/bottom_view', restY: 0 },
  top: { p: 'top_menu' },
  side: { p: 'canvas_center/panel_left' },
});

/**
 * The hub's part of the clip played on the title screen's parts: render(t) sets their opacity / scale / offset from
 * the clip, clear() hands them back. Parts that are not on the screen are skipped.
 * @param {ClipFilmData} film @param {ParentNode} [root]
 */
export function titleReveal(film, root = document) {
  const curves = film.curves.filter((c) => Object.values(REVEAL).some((r) => r.p === c.p));
  /** @type {Set<HTMLElement>} */
  const touched = new Set();
  return {
    /** @param {number} t */
    render(t) {
      const a = sampleClip(curves, t);
      const { s } = canvasFit(innerWidth, innerHeight, film.canvas);
      for (const [key, spec] of Object.entries(REVEAL)) {
        const o = a.get(spec.p);
        if (!o) continue;
        for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(`[data-reveal="${key}"]`))) {
          touched.add(el);
          if (o.m_Alpha !== undefined) el.style.opacity = String(Math.max(0, Math.min(1, o.m_Alpha)));
          const dy = spec.restY !== undefined && o['m_AnchoredPosition.y'] !== undefined ? -(o['m_AnchoredPosition.y'] - spec.restY) * s : 0;
          const sc = o.scale ? o.scale[0] : 1;
          el.style.transform = dy || sc !== 1 ? `translateY(${dy.toFixed(2)}px) scale(${sc.toFixed(4)})` : '';
        }
      }
    },
    clear() {
      for (const el of touched) { el.style.opacity = ''; el.style.transform = ''; }
      touched.clear();
    },
  };
}

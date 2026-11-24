// A later season's hub backdrop with its red rays moving, as the official hub draws them (maintainer decision 2026-11-08;
// docs/rules/ui.md 「새 시즌 「규정」의 타이틀·허브 그림과 로고」). The client scrolls the rays' first dissolve texture
// by _Dissolve_Speed × _Time (a 10 s loop); the composed JPEG (ui/seasonArt.js seasonBackdrop) is one moment of it.
// tools/local-extract/season_ui.py also writes the layers under the rays (`base`), the ones over them (`front`), the
// rays' meshes and material values (`rays`) and their dissolve textures (`tex_<name>`); this draws them in one WebGL
// canvas of the backdrop's size, laid out by the same CSS as the JPEG (object-fit: cover), with the same arithmetic as
// season_ui.py draw_mesh.
//
// The JPEG stays under the canvas: it is what reduced motion, a browser without WebGL, a lost context or the time
// before the pieces have loaded show. The canvas starts at the JPEG's moment (`rays.time`), so the swap is not seen.
// Per frame: three draw calls (the base, every ray copy of one material in one buffer, the front), no allocation, at
// most 60 a second; the context is released when the screen goes.
import { useEffect, useRef } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { useData } from '../data.js';
import { reducedMotion } from './device.js';
import { seasonBackdrop, seasonRaysArt } from './seasonArt.js';

/** @import { Bag } from './gameLogic/shared.js' */

/** The shortest frame step, in ms: the official client's 60 fps (a 120 Hz screen draws every other frame). */
export const RAYS_FRAME_MS = 1000 / 60 - 2;

/**
 * The texture offset of a dissolve at shader time `t` (s): offset + speed × t, brought into [0, 1) on a repeating axis
 * (the same sample; float32 keeps its precision however long the page stays open). An axis that clamps is left as is.
 * @param {{ offset: number[], speed: number[], wrap: number[] }} d @param {number} axis @param {number} t
 */
export function dissolveOffset(d, axis, t) {
  const v = d.offset[axis] + d.speed[axis] * t;
  return d.wrap[axis] === 0 ? v - Math.floor(v) : v;
}

/** @param {unknown} v */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
/**
 * @param {unknown} a
 * @param {number} [n]
 */
const nums = (a, n) => Array.isArray(a) && (n === undefined || a.length === n) && a.every(finite);

/**
 * Whether `doc` is a rays file this page can draw (season_ui.py rays_doc, version 1): every draw names a mesh it has
 * and at most two dissolves, every mesh has matching positions, uv and in-range triangles. A file that fails keeps the
 * JPEG.
 * @param {any} doc @returns {boolean}
 */
export function validRays(doc) {
  if (!doc || doc.version !== 1 || !nums(doc.size, 2) || !finite(doc.time) || !doc.meshes || typeof doc.meshes !== 'object') return false;
  for (const m of Object.values(doc.meshes)) {
    const n = Array.isArray(m?.pos) ? m.pos.length / 2 : 0;
    if (!n || !Number.isInteger(n) || !nums(m.pos) || !nums(m.uv, n * 2) || !Array.isArray(m.tri) || m.tri.length % 3
      || !m.tri.every((/** @type {unknown} */ i) => Number.isInteger(i) && /** @type {number} */ (i) >= 0 && /** @type {number} */ (i) < n)) return false;
  }
  if (!Array.isArray(doc.draws) || !doc.draws.length) return false;
  return doc.draws.every((/** @type {Bag | null} */ d) => d && doc.meshes[d.mesh] && Array.isArray(d.matrix) && d.matrix.length === 2 && d.matrix.every((/** @type {unknown} */ r) => nums(r, 3))
    && nums(d.rgb, 3) && finite(d.alpha) && Array.isArray(d.dissolve) && d.dissolve.length <= 2
    && d.dissolve.every((/** @type {Bag | null} */ x) => x && typeof x.tex === 'string' && nums(x.wrap, 2) && x.wrap.every((/** @type {unknown} */ w) => w === 0 || w === 1)
      && nums(x.scale, 2) && nums(x.offset, 2) && nums(x.speed, 2) && finite(x.threshold) && finite(x.smoothness) && x.smoothness > 0
      && typeof x.invert === 'boolean'));
}

/**
 * The draws of one material joined into vertex batches (each under 65 536 vertices, 16-bit indices): positions moved to
 * the backdrop's pixels by each copy's matrix (y down), then uv.
 * @param {any} doc a validRays file
 * @returns {Array<{ material: any, verts: Float32Array, index: Uint16Array }>}
 */
export function raysBatches(doc) {
  /** @type {Map<string, Array<{ material: any, draws: any[], n: number }>>} */
  const byMaterial = new Map();
  for (const d of doc.draws) {
    const key = JSON.stringify([d.rgb, d.alpha, d.dissolve]);
    const n = doc.meshes[d.mesh].pos.length / 2;
    const list = byMaterial.get(key) || [];
    let last = list[list.length - 1];
    if (!last || last.n + n > 65536) { last = { material: d, draws: [], n: 0 }; list.push(last); }
    last.draws.push(d); last.n += n;
    byMaterial.set(key, list);
  }
  const out = [];
  for (const list of byMaterial.values()) {
    for (const b of list) {
      const verts = new Float32Array(b.n * 4);
      const index = new Uint16Array(b.draws.reduce((s, d) => s + doc.meshes[d.mesh].tri.length, 0));
      let v = 0, k = 0;
      for (const d of b.draws) {
        const m = doc.meshes[d.mesh], [r0, r1] = d.matrix, base = v / 4;
        for (let i = 0; i < m.pos.length; i += 2) {
          const x = m.pos[i], y = m.pos[i + 1];
          verts[v++] = r0[0] * x + r0[1] * y + r0[2];
          verts[v++] = r1[0] * x + r1[1] * y + r1[2];
          verts[v++] = m.uv[i];
          verts[v++] = m.uv[i + 1];
        }
        for (const i of m.tri) index[k++] = base + i;
      }
      out.push({ material: b.material, verts, index });
    }
  }
  return out;
}

const VERT = `attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
  vUv = aUv;
}`;
const PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const FRAG_IMAGE = `${PRECISION}uniform sampler2D uTex;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv); }`;
// Torappu/UI/UI-Fx-Common's pixel stage as season_ui.py draws it: colour, alpha = Π smoothstep over the two dissolve
// textures (r · a, inverted when asked) at uv · scale + offset + speed × time; an unused slot passes 1
const FRAG_RAYS = `${PRECISION}uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform vec4 uSt1;
uniform vec4 uSt2;
uniform vec3 uCut1;
uniform vec3 uCut2;
uniform vec4 uColor;
varying vec2 vUv;
float cut(sampler2D t, vec4 st, vec3 c) {
  vec4 v = texture2D(t, vUv * st.xy + st.zw);
  float d = mix(v.r * v.a, 1.0 - v.r * v.a, c.z);
  return smoothstep(c.x, c.x + c.y, d);
}
void main() {
  float a = cut(uTex1, uSt1, uCut1) * cut(uTex2, uSt2, uCut2);
  gl_FragColor = vec4(uColor.rgb, clamp(a * uColor.a, 0.0, 1.0));
}`;

/**
 * @param {any} gl
 * @param {string} frag
 */
function program(gl, frag) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.bindAttribLocation(p, 1, 'aUv');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`season rays: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** @param {number} n */
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;

/**
 * @param {any} gl @param {TexImageSource | null} image null = a white texel
 * @param {{ flip?: boolean, wrap?: number[] }} [o] flip: rows from v = 0 up (Unity's uv); wrap per axis, 0 repeat
 */
function texture(gl, image, { flip = false, wrap = [1, 1] } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap[0] === 0 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap[1] === 0 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * The drawing of a validRays file into `gl` (a canvas of the file's size): draw(time) paints one frame at shader time
 * `time` (s) — the base, every batch of ray copies, the front: three draw calls here, nothing allocated. Null when this
 * context cannot draw it (WebGL 1 with a repeating texture that is not a power of two).
 * @param {any} gl @param {any} doc
 * @param {{ base: TexImageSource, front: TexImageSource, textures: Map<string, any> }} images textures by entry name
 * @returns {{ draw(time: number): void } | null}
 */
export function raysRenderer(gl, doc, { base, front, textures }) {
  const [W, H] = doc.size;
  const names = [...textures.keys()], texImages = [...textures.values()];
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const wraps = new Map();
  for (const d of doc.draws) for (const x of d.dissolve) wraps.set(x.tex, x.wrap);
  // WebGL 1 repeats only power-of-two textures: a repeating one of another size keeps the JPEG
  if (!webgl2 && names.some((n, i) => wraps.get(n).includes(0) && !(pow2(texImages[i].width) && pow2(texImages[i].height)))) return null;

  const pImage = program(gl, FRAG_IMAGE), pRays = program(gl, FRAG_RAYS);
  /**
   * @param {unknown} p
   * @param {string} n
   */
  const loc = (p, n) => gl.getUniformLocation(p, n);
  const uImg = { size: loc(pImage, 'uSize'), tex: loc(pImage, 'uTex') };
  const uRay = {
    size: loc(pRays, 'uSize'), tex1: loc(pRays, 'uTex1'), tex2: loc(pRays, 'uTex2'), st1: loc(pRays, 'uSt1'), st2: loc(pRays, 'uSt2'),
    cut1: loc(pRays, 'uCut1'), cut2: loc(pRays, 'uCut2'), color: loc(pRays, 'uColor'),
  };
  const tBase = texture(gl, base), tFront = texture(gl, front), white = texture(gl, null);
  const tex = new Map(names.map((n, i) => [n, texture(gl, texImages[i], { flip: true, wrap: wraps.get(n) })]));
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0, W, 0, 1, 0, 0, H, 0, 1, W, H, 1, 1]), gl.STATIC_DRAW);
  const batches = raysBatches(doc).map((b) => {
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, b.verts, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, b.index, gl.STATIC_DRAW);
    const slots = [0, 1].map((i) => b.material.dissolve[i] || null);
    return { vb, ib, count: b.index.length, m: b.material, slots, tex: slots.map((x) => (x ? tex.get(x.tex) : white)) };
  });
  gl.useProgram(pImage); gl.uniform2f(uImg.size, W, H); gl.uniform1i(uImg.tex, 0);
  gl.useProgram(pRays); gl.uniform2f(uRay.size, W, H); gl.uniform1i(uRay.tex1, 0); gl.uniform1i(uRay.tex2, 1);
  gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
  gl.viewport(0, 0, W, H);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  /**
   * @param {unknown} t
   * @param {boolean} blend
   */
  const image = (t, blend) => {
    if (blend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    gl.useProgram(pImage);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  /** @param {number} time */
  const draw = (time) => {
    image(tBase, false);
    gl.enable(gl.BLEND);
    gl.useProgram(pRays);
    for (const b of batches) {
      const d1 = b.slots[0], d2 = b.slots[1];
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, b.tex[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b.tex[1]);
      if (d1) gl.uniform4f(uRay.st1, d1.scale[0], d1.scale[1], dissolveOffset(d1, 0, time), dissolveOffset(d1, 1, time));
      else gl.uniform4f(uRay.st1, 1, 1, 0, 0);
      if (d2) gl.uniform4f(uRay.st2, d2.scale[0], d2.scale[1], dissolveOffset(d2, 0, time), dissolveOffset(d2, 1, time));
      else gl.uniform4f(uRay.st2, 1, 1, 0, 0);
      // an unused slot samples white (r · a = 1) under a cut that passes it whole
      gl.uniform3f(uRay.cut1, d1 ? d1.threshold : -1, d1 ? d1.smoothness : 1, d1?.invert ? 1 : 0);
      gl.uniform3f(uRay.cut2, d2 ? d2.threshold : -1, d2 ? d2.smoothness : 1, d2?.invert ? 1 : 0);
      gl.uniform4f(uRay.color, b.m.rgb[0], b.m.rgb[1], b.m.rgb[2], b.m.alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
    }
    image(tFront, true);
  };

  return { draw };
}

/**
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
const loadImage = (url) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error(`season rays: ${url} did not load`));
  im.src = url;
});

/**
 * Draw the moving backdrop into `canvas`: loads the pieces, draws the first frame, then shows the canvas (it stays
 * hidden — the JPEG under it — on any failure). destroy() stops and releases the context.
 * @param {HTMLCanvasElement} canvas @param {{ rays: string, base: string, front: string, url: (name: string) => string | null }} art
 * @returns {{ destroy(): void }}
 */
export function startRays(canvas, art) {
  let gone = false, raf = 0;
  /** @type {any} */
  let gl = null;
  const lose = () => { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already lost */ } };
  const destroy = () => {
    gone = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    canvas.style.visibility = 'hidden';
    lose();
    gl = null;
  };
  (async () => {
    const doc = await fetch(art.rays).then((r) => (r.ok ? r.json() : null));
    if (gone || !validRays(doc)) return;
    const names = [...new Set(doc.draws.flatMap((/** @type {Bag} */ d) => d.dissolve.map((/** @type {Bag} */ x) => x.tex)))];
    const urls = names.map((n) => art.url(n));
    if (urls.some((u) => !u)) return;
    const [base, front, ...texImages] = await Promise.all([art.base, art.front, .../** @type {string[]} */ (urls)].map(loadImage));
    if (gone) return;
    const [W, H] = doc.size;
    canvas.width = W; canvas.height = H;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' };
    gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) return;
    const r = raysRenderer(gl, doc, { base, front, textures: new Map(names.map((n, i) => [n, texImages[i]])) });
    if (!r) { lose(); gl = null; return; }
    canvas.addEventListener('webglcontextlost', () => { if (!gone) destroy(); });
    const draw = r.draw;
    const t0 = performance.now();
    let last = -Infinity;
    draw(doc.time);
    canvas.style.visibility = '';
    /** @param {number} now */
    const step = (now) => {
      raf = requestAnimationFrame(step);
      if (now - last < RAYS_FRAME_MS) return;
      last = now;
      draw(doc.time + (now - t0) / 1000);
    };
    raf = requestAnimationFrame(step);
  })().catch(() => { if (!gone) destroy(); });
  return { destroy };
}

const HIDDEN = Object.freeze({ visibility: 'hidden' });

/**
 * The canvas over the JPEG: hidden until its first frame is drawn (startRays).
 * @param {{ art: Parameters<typeof startRays>[1], cls: string, reveal?: string }} p
 */
function RaysCanvas({ art, cls, reveal }) {
  const ref = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  useEffect(() => {
    const layer = ref.current ? startRays(ref.current, art) : null;
    return () => layer?.destroy();
  }, [art.rays, art.base, art.front]);
  return html`<canvas ref=${ref} class=${`${cls} season-rays`} data-reveal=${reveal} style=${HIDDEN} aria-hidden="true"></canvas>`;
}

/**
 * A later season's hub backdrop for the title screen and the lobby hub: its JPEG, and over it the moving canvas when
 * the extract has the pieces and the page allows motion. `cls` is the screen's backdrop class (both get it), `reveal`
 * the entry clip's part (screens/title.js `data-reveal`). Nothing when the season has no backdrop of its own.
 * @param {{ season: unknown, cls: string, reveal?: string }} props
 */
export function SeasonBackdrop({ season, cls, reveal }) {
  useData('local');
  const src = seasonBackdrop(season);
  if (!src) return null;
  const art = reducedMotion() ? null : seasonRaysArt(season);
  return html`<img key=${src} class=${cls} data-reveal=${reveal} src=${src} alt="" draggable=${false} />${art
    ? html`<${RaysCanvas} key=${art.rays} art=${art} cls=${cls} reveal=${reveal} />` : null}`;
}

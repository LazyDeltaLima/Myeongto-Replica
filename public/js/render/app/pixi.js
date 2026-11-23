// public/js/render/app/pixi.js — load PIXI and pixi-spine once (one module-level promise), and fit PIXI to the field
// view: Texture.WHITE from a buffer (installBufferWhite), the canvases PIXI draws watched for a lost 2D context.

import { watchCanvas } from '../../diag.js';

// beside this module (the page's /b/<tag>/r/ URLs too, server/http/buildTag.js), where index.html prefetches them
const VENDOR = { pixi: new URL('../../../vendor/pixi.min.js', import.meta.url).href, spine: new URL('../../../vendor/pixi-spine.js', import.meta.url).href };

/** @type {Promise<any> | null} */
let pixiPromise = null;

/** @param {string} src @returns {Promise<void>} */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

const noop = () => {};
export const WHITE_SIZE = 16;

/**
 * PIXI's `Texture.WHITE` is a 16×16 canvas. Every HP / SP bar fill is a tinted sprite of it (render/hud-bars.js), it is
 * the default of `Graphics` fills, and the impostor atlas erases its cells with it (render/impostor.js). Reports #27·#28
 * (an Android Chrome, Adreno): bars gone, damage numbers gone and operator models a collage of other operators', with
 * every image-sourced texture intact — canvas-sourced textures came up transparent (inferred from the screenshots). A buffer does not
 * depend on a canvas: the same 16×16 opaque white, premultiplied (`alphaMode` PMA — the buffer default NPM would switch
 * the blend state between a bar and its image plate on every HUD and split its batches). It replaces `_WHITE` itself,
 * so PIXI's own defaults read it too; protected against `destroy` as PIXI protects its own. Idempotent.
 * docs/rules/render.md 「캔버스 텍스처가 투명하게 올라감」.
 * @param {any} P PIXI
 */
export function installBufferWhite(P) {
  const T = P?.Texture;
  if (!T || typeof T.fromBuffer !== 'function' || T._WHITE?.spBuffer) return;
  const n = WHITE_SIZE;
  const tex = T.fromBuffer(new Uint8Array(n * n * 4).fill(255), n, n, {
    alphaMode: P.ALPHA_MODES.PMA, scaleMode: P.SCALE_MODES.LINEAR, mipmap: P.MIPMAP_MODES.OFF,
  });
  for (const o of [tex, tex.baseTexture]) { o.destroy = noop; o.on = noop; o.once = noop; o.emit = noop; }
  tex.spBuffer = true;
  T._WHITE = tex;
}

/**
 * The canvases PIXI creates (bitmap font pages of the damage numbers, Text) report a lost 2D context to the bug report
 * (diag.js watchCanvas): Chrome may drop a canvas's 2D context and give it back blank, and a texture uploaded from it
 * afterwards is transparent. Idempotent. @param {any} P PIXI
 */
export function watchPixiCanvases(P) {
  const A = P?.settings?.ADAPTER;
  if (!A || typeof A.createCanvas !== 'function' || A.createCanvas.spWatched) return;
  const make = A.createCanvas;
  /** @this {any} @param {...any} args */
  const wrapped = function (...args) { const c = make.apply(this, args); watchCanvas(c, 'pixi canvas'); return c; };
  wrapped.spWatched = true;
  A.createCanvas = wrapped;
}

/** @param {any} P */
function fit(P) { installBufferWhite(P); watchPixiCanvases(P); return P; }

/** Make sure PIXI and PIXI.spine exist (classic scripts; loaded once), fitted (installBufferWhite, watchPixiCanvases). */
export function ensurePixi() {
  if (globalThis.PIXI && globalThis.PIXI.spine) return Promise.resolve(fit(globalThis.PIXI));
  if (!pixiPromise) {
    pixiPromise = (async () => {
      if (!globalThis.PIXI) await loadScript(VENDOR.pixi);
      if (!globalThis.PIXI?.spine) await loadScript(VENDOR.spine);
      if (!globalThis.PIXI || !globalThis.PIXI.spine) throw new Error('PIXI / pixi-spine unavailable');
      return fit(globalThis.PIXI);
    })();
    pixiPromise.catch(() => { pixiPromise = null; });
  }
  return pixiPromise;
}

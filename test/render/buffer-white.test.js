// PIXI's Texture.WHITE drawn from a buffer, not a canvas (reports #27·#28: on one Android Chrome the textures drawn from
// a canvas came up transparent — HP / SP bar fills, damage numbers, the impostor eraser — while image textures stayed).
// The vendored PIXI in a sandbox, fitted the way the field view gets it (render/app/pixi.js ensurePixi).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WHY = 'Texture.WHITE must be the buffer white (docs/rules/render.md 「캔버스 텍스처가 투명하게 올라감」)';

/** The vendored PIXI in a sandbox; `made` counts the canvases its adapter creates. */
function loadPixi() {
  const noop = function () {};
  const made = { canvases: 0 };
  const canvas = () => { made.canvases++; return { width: 0, height: 0, style: {}, getContext: () => ({ fillRect: noop }), addEventListener: noop }; };
  const ctx = {
    console, setTimeout, clearTimeout, performance, URL, navigator: { userAgent: '' }, location: { href: 'http://x/' },
    document: { createElement: canvas, addEventListener: noop },
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, fetch: () => Promise.reject(new Error('offline')),
    Image: noop, WebGLRenderingContext: noop, HTMLCanvasElement: noop, HTMLImageElement: noop, HTMLVideoElement: noop, ImageBitmap: noop,
  };
  ctx.globalThis = ctx.window = ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${readFileSync(path.join(ROOT, 'public/vendor/pixi.min.js'), 'utf8')};globalThis.PIXI = PIXI;`, ctx);
  return { P: ctx.PIXI, made };
}

const { ensurePixi, installBufferWhite, WHITE_SIZE } = await import('../../public/js/render/app/pixi.js');

test('the field view\'s PIXI draws Texture.WHITE from a 16×16 premultiplied white buffer', async () => {
  const { P, made } = loadPixi();
  P.spine = {}; // pixi-spine "loaded": ensurePixi takes the PIXI already on the page
  const had = globalThis.PIXI;
  globalThis.PIXI = P;
  try {
    const got = await ensurePixi();
    assert.ok(got === P);
  } finally { globalThis.PIXI = had; }
  const before = made.canvases;
  const W = P.Texture.WHITE;
  assert.equal(made.canvases, before, `${WHY}: reading it drew a canvas`);
  const base = W.baseTexture;
  assert.ok(base.resource instanceof P.BufferResource, `${WHY}: its source is ${base.resource?.constructor?.name}`);
  assert.equal(base.width, WHITE_SIZE);
  assert.equal(base.height, WHITE_SIZE);
  assert.equal(base.alphaMode, P.ALPHA_MODES.PMA, 'premultiplied like the image plates it batches with (NPM would split the HUD batches)');
  assert.equal(base.scaleMode, P.SCALE_MODES.LINEAR);
  const data = base.resource.data;
  assert.equal(data.length, WHITE_SIZE * WHITE_SIZE * 4);
  assert.ok(data.every((v) => v === 255), 'opaque white');
  // PIXI's own defaults read the same texture: a Graphics fill
  assert.ok(new P.Graphics()._fillStyle.texture === W, 'a Graphics fill draws the buffer white');
  // protected like PIXI's own: a view's teardown cannot free it
  W.destroy(true);
  assert.ok(P.Texture.WHITE === W && W.baseTexture === base && base.resource, 'destroy leaves it');
  installBufferWhite(P);
  assert.ok(P.Texture.WHITE === W, 'installed once');
});

test('the canvases PIXI creates (bitmap font pages, Text) are watched for a lost 2D context', async () => {
  const { P } = loadPixi();
  const seen = [];
  const A = P.settings.ADAPTER;
  const orig = A.createCanvas;
  A.createCanvas = function (...a) {
    const c = orig.apply(this, a);
    c.addEventListener = (type) => seen.push(type);
    return c;
  };
  const { watchPixiCanvases } = await import('../../public/js/render/app/pixi.js');
  watchPixiCanvases(P);
  const once = A.createCanvas;
  watchPixiCanvases(P);
  assert.ok(A.createCanvas === once, 'wrapped once');
  A.createCanvas(4, 4);
  assert.deepEqual(seen, ['contextlost', 'contextrestored']);
});

// Same-picture trims of the unit update (mobile performance, desktop CPU profile of UnitView.update): pixi-spine's
// per-slot colour goes through a direct rgb2hex that gives PIXI's own number, and a facing marker under a still camera
// keeps its projected corners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { fastRgb2hex, installFastRgb2hex } = await import('../../public/js/render/spine.js');

/** The vendored PIXI in a sandbox with just enough of a browser to load (its Color needs no DOM). */
function loadPixi() {
  const noop = function () {};
  const ctx = {
    console, setTimeout, clearTimeout, performance, URL, navigator: { userAgent: '' }, location: { href: 'http://x/' },
    document: { createElement: () => ({ getContext: () => null, style: {} }), addEventListener: noop },
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, fetch: () => Promise.reject(new Error('offline')),
    Image: noop, WebGLRenderingContext: noop, HTMLCanvasElement: noop, HTMLImageElement: noop, HTMLVideoElement: noop, ImageBitmap: noop,
  };
  ctx.globalThis = ctx.window = ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${readFileSync(path.join(ROOT, 'public/vendor/pixi.min.js'), 'utf8')};globalThis.PIXI = PIXI;`, ctx);
  return ctx.PIXI;
}

test('fastRgb2hex gives PIXI.utils.rgb2hex\'s number for the slot colours pixi-spine passes', () => {
  const P = loadPixi();
  const slow = P.utils.rgb2hex;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cases = [[1, 1, 1], [0, 0, 0], [1, 0.5, 0.25], [0.999, 0.001, 0.5], [1.2, -0.1, 0.7], [NaN, 0.5, 1], [0.5, 0.5, 0.5, 0.3]];
  for (let i = 0; i < 4000; i++) cases.push([rnd() * 1.2 - 0.1, rnd(), rnd() ** 3]);
  for (const c of cases) {
    assert.equal(fastRgb2hex(c, slow), slow(c), `array ${c}`);
    // (a Float32Array of this realm is not one to the sandboxed PIXI: compared through the same values as an array)
    const f = Float32Array.from(c);
    assert.equal(fastRgb2hex(f, slow), slow(Array.from(f)), `Float32Array ${c}`);
  }
  // anything else is PIXI's own
  for (const v of [0xff8800, '#ff8800']) assert.equal(fastRgb2hex(v, slow), slow(v));
  installFastRgb2hex(P);
  const once = P.utils.rgb2hex;
  installFastRgb2hex(P);
  assert.ok(once.fast && P.utils.rgb2hex === once, 'installed once');
  assert.equal(P.utils.rgb2hex([1, 0.5, 0.25]), slow([1, 0.5, 0.25]));
});

test('a facing marker keeps its corners until the camera, the unit or the direction moves', async () => {
  const fake = installFakePixi();
  const { FacingMarker } = await import('../../public/js/render/facing.js');
  class SimpleMesh extends fake.P.Container { constructor(t, v) { super(); this.texture = t; this.vertices = v; } }
  const m = new FacingMarker({ ...fake.P, SimpleMesh }, { ring: {}, arrow: {} });
  let calls = 0;
  const cam = { version: 1, shift: 0, project(x, y, z, o) { calls++; o.x = x + this.shift; o.y = y; return o; } };
  m.update(cam, 2, 3, 0, [1, 0], 1);
  const first = calls;
  assert.equal(first, 8);
  m.update(cam, 2, 3, 0, [1, 0], 0.5);
  assert.equal(calls, first, 'nothing moved: no projection');
  assert.equal(m.root.alpha, 0.5, 'the alpha still follows the unit');
  cam.shift = 10; cam.version++;
  m.update(cam, 2, 3, 0, [1, 0], 1);
  assert.equal(calls, 2 * first, 'the camera moved');
  assert.ok(Math.abs(m.ring.vertices[0] - (2 - 0.352 + 10)) < 1e-6);
  m.update(cam, 2, 3, 0, [0, 1], 1);
  m.update(cam, 2.5, 3, 0, [0, 1], 1);
  assert.equal(calls, 4 * first, 'a turn and a step re-project');
});

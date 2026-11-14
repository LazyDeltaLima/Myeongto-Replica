// test/render/fx-submit.browser.test.js — the effect canvases' own draw submission (render/fxsubmit.js, docs/rules/render.md
// 「이펙트 그리기 전용 경로」) draws what three.js draws: every default-skin extracted effect, played on its own at a few frames,
// drawn once by renderer.render and once by FxSubmit.render, the two pictures compared pixel for pixel (0 differences). It
// also asserts the route really ran — the passes drawn by FxSubmit itself, a skinned mesh handed to three.js in its place —
// so it cannot pass by sending everything to three.js.
//
// Opt-in (starts Chrome, needs the extracted effects): RENDER_E2E=1 node --test test/render/fx-submit.browser.test.js
// (FX_SUBMIT_FILTER=<part of bundle/prefab> for a subset)

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets/local/fx/index.json'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the extracted effects)';
const FILTER = process.env.FX_SUBMIT_FILTER || '';

describe('FxSubmit draws the effects as three.js does', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: 'new', protocolTimeout: 1800000, args: ['--no-first-run', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('every default-skin effect at frames 10, 40 and 100: the same pixels', { timeout: 1800000 }, async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const out = await page.evaluate(async (filter) => {
      const THREE = await import('/vendor/three.module.js');
      const fxp = await import('/js/render/fxplayer.js');
      const { FxSubmit } = await import('/js/render/fxsubmit.js');
      const { isVariant } = await import('/js/render/fxmap.js');
      const { fitCamera, syncThreeCamera } = await import('/js/render/projection.js');
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (u, o) => nativeFetch(typeof u === 'string' ? u.replace(/#/g, '%23') : u, o);
      let texLoaded = 0, texTotal = 0;
      THREE.DefaultLoadingManager.onProgress = (url, loaded, total) => { texLoaded = loaded; texTotal = total; };
      const texLoad = THREE.TextureLoader.prototype.load;
      THREE.TextureLoader.prototype.load = function (url, ...rest) { return texLoad.call(this, String(url).replace(/#/g, '%23'), ...rest); };
      let s = 1;
      Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const SIZE = 256, FRAMES = [10, 40, 100];
      const canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
      // as the game's effect canvases (fxgame.js ensure)
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0x000000, 0);
      const gl = renderer.getContext();
      const camera = new THREE.PerspectiveCamera();
      syncThreeCamera(fitCamera({ r0: 8, r1: 12, c0: 3, c1: 7 }, { width: SIZE, height: SIZE }, { tilt: 30, dist: 13, margin: 0.3, headroom: 1.4 }), camera, SIZE, SIZE);
      const variants = fxp.programVariants();
      for (const v of variants) renderer.compile(v, camera);
      const sub = new FxSubmit(THREE, renderer, { probes: variants });
      while (sub.warm());
      const scene = new THREE.Scene();
      const idx = await (await fetch('/assets/local/fx/index.json')).json();
      const lib = new fxp.FxLibrary('/assets/local/fx/');
      const defs = [];
      for (const [b, ps] of Object.entries(idx.bundles)) for (const p of ps) {
        if (isVariant(p) || (filter && !`${b}/${p}`.includes(filter))) continue;
        const def = await lib.load(b, p);
        if (def) defs.push([`${b}/${p}`, def]);
      }
      // each built once: its textures start loading
      for (const [, def] of defs) { const fx = new fxp.FxInstance(def, { quality: 'high' }); fx.dispose(); }
      await new Promise((resolve) => { const check = () => (texLoaded >= texTotal ? resolve() : setTimeout(check, 200)); setTimeout(check, 500); });
      const a = new Uint8Array(SIZE * SIZE * 4), c = new Uint8Array(SIZE * SIZE * 4);
      const mismatches = [];
      let captures = 0, lit = 0;
      for (const [key, def] of defs) {
        const fx = new fxp.FxInstance(def, { quality: 'high' });
        fx.object.position.set(5, 10, 0);
        scene.add(fx.object);
        for (let f = 1; f <= FRAMES.at(-1); f++) {
          fx.update(1 / 60);
          if (!FRAMES.includes(f)) continue;
          sub.yieldToThree();
          renderer.autoClear = true;
          renderer.render(scene, camera);
          gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, a);
          // until its programs link it draws through three.js: wait for them (warm() started them)
          for (let w = 0; w < 200 && sub.stats.own === 0; w++) {
            sub.render(scene, camera, true);
            if (sub.stats.own === 0) await new Promise((r) => setTimeout(r, 25));
          }
          sub.render(scene, camera, true);
          gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, c);
          captures++;
          let px = 0, max = 0, on = false;
          for (let i = 0; i < a.length; i += 4) {
            const d = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i + 1] - c[i + 1]), Math.abs(a[i + 2] - c[i + 2]), Math.abs(a[i + 3] - c[i + 3]));
            if (d) { px++; if (d > max) max = d; }
            if (a[i + 3]) on = true;
          }
          if (on) lit++;
          if (px) mismatches.push({ key, frame: f, px, max });
        }
        fx.stop(true); fx.dispose(); scene.remove(fx.object);
      }
      return { effects: defs.length, captures, lit, mismatches: mismatches.slice(0, 40), nMismatch: mismatches.length, stats: sub.stats, failed: [...sub.failed] };
    }, FILTER);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ...out, mismatches: out.mismatches.slice(0, 10) }));
    assert.equal(out.nMismatch, 0, `FxSubmit draws other pixels than three.js (docs/rules/render.md 「이펙트 그리기 전용 경로」): ${JSON.stringify(out.mismatches.slice(0, 10))}`);
    assert.deepEqual(out.failed, [], 'every program variant linked');
    if (!FILTER) {
      // the sweep ran: the extracted effects (2,300 default skins in 2026-11), most of them drawing something, drawn here
      assert.ok(out.effects > 1500, `effects swept: ${out.effects}`);
      assert.ok(out.lit > out.captures / 2, `captures with pixels: ${out.lit} of ${out.captures}`);
      assert.ok(out.stats.own >= out.captures, `passes FxSubmit drew itself: ${out.stats.own} of ${out.captures}`);
      assert.ok((out.stats.objects || 0) > 0, 'a skinned mesh went to three.js in its place (drawThree)');
    }
  });
});

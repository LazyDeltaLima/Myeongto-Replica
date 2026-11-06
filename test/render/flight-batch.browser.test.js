// test/render/flight-batch.browser.test.js — the shots 逻各斯 S3 holds, drawn together (fxplayer.js FlightBatch): for every official
// enemy trail, the same frame drawn with separate renderers and merged gives the same picture, with fewer draw calls. The
// instances fly in piles, in different directions and at different depths, as the held shots of one field do.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/flight-batch.browser.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const INDEX = path.join(ROOT, 'public/assets/local/fx/enemy-index.json');
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(INDEX);
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the extracted effects)';

describe('FlightBatch keeps the picture of the flights it merges', { skip }, () => {
  let srv, browser;
  before(async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: 'new', protocolTimeout: 120000, args: ['--no-first-run', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('every enemy trail in piles: the pixels of the separate and the merged draws', async () => {
    const { bundles } = JSON.parse(readFileSync(INDEX, 'utf8'));
    const trails = Object.entries(bundles).flatMap(([b, list]) => list.filter((n) => /trail|taril/.test(n)).map((n) => [b, n]));
    assert.ok(trails.length > 30, `${trails.length} trails`);
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const out = await page.evaluate(async (list) => {
      const THREE = await import('/vendor/three.module.js');
      const { FxLibrary, FxInstance, FlightBatch } = await import('/js/render/fxplayer.js');
      const W = 640, H = 360;
      const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0, 0);
      const gl = renderer.getContext();
      const cam = new THREE.PerspectiveCamera(40, W / H, 0.3, 100);
      cam.up.set(0, 0, 1); cam.position.set(4, -7, 9); cam.lookAt(4, 2, 0); cam.updateMatrixWorld(true);
      const lib = new FxLibrary('/assets/local/fx/');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const pixels = () => { const a = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
      // a seeded stream, the same for every run of the page
      let s = 12345;
      Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const rows = [];
      for (const [bundle, name] of list) {
        const def = await lib.load(bundle, name).catch(() => null);
        if (!def) continue;
        const scene = new THREE.Scene();
        const insts = [];
        for (let i = 0; i < 12; i++) {
          // piles: some on one spot's line (the same shooter's shots), the others spread, each flying its own way
          const a = (i * 2.399) % (Math.PI * 2);
          const inst = new FxInstance(def, { quality: 'high', dir: { x: Math.cos(a), y: Math.sin(a) } });
          inst.object.position.set(i < 6 ? 2 + i * 0.12 : (i % 3) * 2.5, i < 6 ? 2 : (i % 2) * 3, 0.3);
          scene.add(inst.object);
          insts.push({ inst, a });
        }
        // the textures of this prefab (three.js counts what is in flight)
        renderer.render(scene, cam);
        for (let w = 0; w < 400 && [...lib.textures.values()].some((t) => !t.image); w++) await sleep(25);
        await sleep(30);
        for (let f = 0; f < 45; f++) {
          for (const { inst, a } of insts) {
            inst.object.position.x += Math.cos(a) * 0.5 / 60; inst.object.position.y += Math.sin(a) * 0.5 / 60;   // a held shot's 0.5 tiles/s
            inst.update(1 / 60);
          }
        }
        const batch = new FlightBatch(scene);
        renderer.info.autoReset = true;
        renderer.render(scene, cam);
        const a = pixels(), callsA = renderer.info.render.calls;
        const merged = batch.sync(insts.map((x) => x.inst), cam);
        renderer.render(scene, cam);
        const b = pixels(), callsB = renderer.info.render.calls;
        let max = 0, off = 0, lit = 0;
        for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > 8) off++; if (a[i] > 8) lit++; }
        rows.push({ name, merged, callsA, callsB, max, off, lit });
        batch.dispose();
        for (const { inst } of insts) inst.dispose();
      }
      lib.dispose?.();
      return rows;
    }, trails);
    assert.deepEqual(errors, []);
    assert.ok(out.length > 30, `${out.length} drawn`);
    const bad = out.filter((r) => r.off > 0);
    const A = out.reduce((n, r) => n + r.callsA, 0), B = out.reduce((n, r) => n + r.callsB, 0);
    console.log(`${out.length} trails × 12: draw calls ${A} → ${B}; largest channel difference ${Math.max(...out.map((r) => r.max))}/255`);
    assert.ok(B < A * 0.75, `draw calls ${A} → ${B}`);
    const bolt = out.find((r) => r.name === 'common_magic_trail_01_m');   // the caster's bolt, the most common shot: its mesh keeps a draw each
    assert.ok(bolt && bolt.callsB <= 4 + 12 && bolt.callsA >= 5 * 12, JSON.stringify(bolt));
    assert.deepEqual(bad.map((r) => r.name), [], 'the picture stays');
  });

  test('36 of the caster\'s bolt: the frame with separate and with merged draws', async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${srv.port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const r = await page.evaluate(async () => {
      const THREE = await import('/vendor/three.module.js');
      const { FxLibrary, FxInstance, FlightBatch } = await import('/js/render/fxplayer.js');
      const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
      const gl = renderer.getContext();
      const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 100);
      cam.up.set(0, 0, 1); cam.position.set(4, -7, 9); cam.lookAt(4, 2, 0); cam.updateMatrixWorld(true);
      const lib = new FxLibrary('/assets/local/fx/');
      const def = await lib.load('common', 'common_magic_trail_01_m');
      const scene = new THREE.Scene(), batch = new FlightBatch(scene), insts = [];
      for (let i = 0; i < 36; i++) {
        const inst = new FxInstance(def, { quality: 'high', dir: { x: Math.cos(i), y: Math.sin(i) } });
        inst.object.position.set((i % 6) * 1.3, Math.floor(i / 6) * 0.9, 0.3);
        scene.add(inst.object);
        insts.push(inst);
      }
      renderer.render(scene, cam);
      for (let w = 0; w < 400 && [...lib.textures.values()].some((t) => !t.image); w++) await new Promise((res) => setTimeout(res, 25));
      for (let f = 0; f < 120; f++) for (const x of insts) x.update(1 / 60);
      const run = (merge) => {
        let ms = 0, calls = 0;
        for (let f = 0; f < 240; f++) {
          for (const x of insts) x.update(1 / 60);
          const t0 = performance.now();
          if (merge) batch.sync(insts, cam); else batch.sync([], cam);
          renderer.render(scene, cam);
          gl.finish();
          ms += performance.now() - t0;
          calls = renderer.info.render.calls;
        }
        return { calls, ms: Math.round((ms / 240) * 1000) / 1000 };
      };
      run(false);   // warm
      return { separate: run(false), merged: run(true) };
    });
    console.log(JSON.stringify(r));
    assert.ok(r.merged.calls < r.separate.calls / 3, JSON.stringify(r));
  });
});

// test/render/tile-batch.browser.test.js — one prefab laid on many tiles, drawn together (fxplayer.js TileBatch): the same frame
// drawn with separate renderers and merged. 规程's 悲惨之雨 floor (44 tiles, 4 renderers: a view-facing system, a local-aligned
// quad and two mesh particles, material clips) keeps its picture; the battlefield's 草地 (16 tiles: two wall meshes and two
// particle systems, each pair of one sorting order) differs only where neighbouring tiles' walls meet — there the pairs blend in
// another order (each renderer's copies far to near, then the next renderer; apart, three.js sorted all of them by depth); the
// 泥沼 (12 tiles, m06's and act2autochess_m02's count: a floor mesh and two particle systems, when it is extracted).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/tile-batch.browser.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FX = (b, n) => path.join(ROOT, `public/assets/local/fx/${b}/${n}.json`);
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(FX('pfx_enemy_20', 'enemy_acspider_debuff_ground_01')) && existsSync(FX('mapeff', 'mapeff_079_dikuai_01'));
const MUD = existsSync(FX('mapeff', 'mapeff_mud_ground_01'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the extracted 悲惨之雨 floor and 草地 effects)';

describe('TileBatch keeps the picture of the copies it merges', { skip }, () => {
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

  test('the 悲惨之雨 floor on 44 tiles, the 草地 on 16 and the 泥沼 on 12: separate and merged draws', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const out = await page.evaluate(async (mud) => {
      const THREE = await import('/vendor/three.module.js');
      const { FxLibrary, FxInstance, TileBatch } = await import('/js/render/fxplayer.js');
      const W = 960, H = 540;
      const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
      renderer.setClearColor(0, 0);
      const gl = renderer.getContext();
      const cam = new THREE.PerspectiveCamera(40, W / H, 0.3, 100);
      cam.up.set(0, 0, 1); cam.position.set(5, -8, 10); cam.lookAt(5, 2, 0); cam.updateMatrixWorld(true);
      const lib = new FxLibrary('/assets/local/fx/');
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const pixels = () => { const a = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
      let s = 12345;
      Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const rows = {};
      for (const [bundle, name, nr, nc] of [['pfx_enemy_20', 'enemy_acspider_debuff_ground_01', 4, 11], ['mapeff', 'mapeff_079_dikuai_01', 4, 4], ...(mud ? [['mapeff', 'mapeff_mud_ground_01', 3, 4]] : [])]) {
        const def = await lib.load(bundle, name);
        const scene = new THREE.Scene(), insts = [];
        for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
          const inst = new FxInstance(def, { quality: 'high', floor: 0, pinned: true });
          inst.object.position.set(c, r, 0);
          scene.add(inst.object);
          insts.push(inst);
        }
        renderer.render(scene, cam);
        for (let w = 0; w < 400 && [...lib.textures.values()].some((t) => !t.image); w++) await sleep(25);
        await sleep(30);
        const batch = new TileBatch();
        const shots = [];
        for (let f = 1; f <= 200; f++) {
          for (const i of insts) i.update(1 / 60);
          if (f !== 30 && f !== 90 && f !== 200) continue;
          renderer.info.autoReset = true;
          renderer.render(scene, cam);
          const a = pixels(), callsA = renderer.info.render.calls;
          const merged = batch.sync(insts, cam);
          renderer.render(scene, cam);
          batch.restore();
          const b = pixels(), callsB = renderer.info.render.calls;
          let max = 0, off = 0, lit = 0;
          for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > 8) off++; if (a[i] > 8) lit++; }
          shots.push({ f, merged, callsA, callsB, max, off, lit });
        }
        rows[name] = shots;
        batch.dispose();
        for (const i of insts) i.dispose();
      }
      return rows;
    }, MUD);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(out));
    for (const r of out.enemy_acspider_debuff_ground_01) {
      assert.equal(r.callsA, 176); assert.equal(r.callsB, 4); assert.equal(r.merged, 176);
      assert.equal(r.off, 0, `the floor keeps its picture (frame ${r.f}, largest channel difference ${r.max})`);
    }
    for (const r of out.mapeff_079_dikuai_01) {
      assert.equal(r.callsA, 64); assert.equal(r.callsB, 4);
      assert.ok(r.off < r.lit * 0.05, `草地: ${r.off} channels of ${r.lit} lit differ (frame ${r.f}) — only where tiles meet`);
    }
    for (const r of out.mapeff_mud_ground_01 || []) {
      // apart: up to 36 (a bubble system with no live particle draws nothing), merged: 3, the same picture
      assert.ok(r.callsA <= 36 && r.callsA >= 30 && r.merged === r.callsA, `泥沼 apart: ${r.callsA} calls, ${r.merged} merged`);
      assert.equal(r.callsB, 3);
      assert.equal(r.off, 0, `泥沼 keeps its picture (frame ${r.f}, largest channel difference ${r.max})`);
    }
  });
});

// test/render/logos-shot-slow.browser.test.js — 逻各斯 S3 on the debug arena's real view at its 2× speed: an enemy's official
// trail flies with the sim's shot while the skill slows it (it used to fly on at full speed and be gone in 0.3 game s, with
// the sim's shot still in the air for 6 s) and leaves when the skill's end clears the shot.
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/logos-shot-slow.browser.test.js

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME) && existsSync(path.join(ROOT, 'public/assets/local/fx/enemy-modes.json'));
const skip = enabled ? false : 'set RENDER_E2E=1 (needs Chrome and the extracted effects)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('逻各斯 S3: the enemy shots drawn fly with the sim', { skip }, () => {
  let srv, browser;
  before(async () => {
    process.env.SP_DEBUG_PAGE = '1';
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: 'new', protocolTimeout: 30000, args: ['--no-first-run'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  test('a shot 3 tiles out advances at the sim\'s 5 % speed while slowed; the skill\'s end leaves no trail', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://127.0.0.1:${srv.port}/debug.html?op=char_4133_logos&elite=1&skill=3&attack=1&enemy=enemy_1023_jmage&dir=RIGHT`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !!globalThis.__debug?.arena?.battle?.(), { timeout: 30000 });
    await sleep(1500);
    await page.evaluate(() => {
      const d = globalThis.__debug, s = d.st;
      s.autoBags = false; s.bags = [{ row: s.opTile.row, col: s.opTile.col + 3 }];
      d.restart();
      d.arena.setSpeed(2);
    });
    await sleep(4000);   // the trail's prefab is loaded by its first shots
    await page.evaluate(() => globalThis.__debug.arena.castNow());
    const read = () => page.evaluate(() => {
      const d = globalThis.__debug, bt = d.arena.battle(), g = d.arena.stats().view.fxGame;
      return { t: bt.time, on: !!d.arena.op().skill?.active, ks: g.trailAt.map((a) => a[a.length - 1]), clocks: g.trailClocks, sim: bt.projectiles.list.filter((x) => x.source?.side === 'enemy').length };
    });
    await sleep(3000);
    const a = await read();
    assert.ok(a.on && a.sim >= 1, `the skill runs with a shot held: ${JSON.stringify(a)}`);
    assert.ok(a.ks.length >= 1, `a held shot's trail is in the air, not gone at its old speed: ${JSON.stringify(a)}`);
    await sleep(1000);
    const b = await read();
    // the sim: 10 tiles / s × 0.05 over 3 tiles = 1 / 6 of the way per game second
    // (the same shot: the newest of the first reading, the next one up in the second — an older one may have landed, a newer left)
    const ka = Math.min(...a.ks), kb = Math.min(...b.ks.filter((k) => k > ka));
    const rate = (kb - ka) / (b.t - a.t);
    assert.ok(Math.abs(rate - 1 / 6) < 0.05, `flight per game s ${rate} (${JSON.stringify([a, b])})`);
    // its main effect plays at the same 5 % (the client's ForceApplyPlaybackSpeedMultiplier); the same shot by its k
    const of = (r, k) => r.clocks.find((c) => c && Math.abs(c.k - k) < 0.011);
    const ca = of(a, ka), cb = of(b, kb);
    assert.ok(ca && cb && ca.moveScale === 0.05 && cb.moveScale === 0.05, `held effects: ${JSON.stringify([ca, cb])}`);
    const play = (cb.time - ca.time) / (b.t - a.t);
    assert.ok(Math.abs(play - 0.05) < 0.02, `effect time per game s ${play}`);
    // no new shot near the end; the view plays the sim's events a moment later
    await page.waitForFunction(() => globalThis.__debug.arena.op().skill.timeLeft < 1, { timeout: 40000, polling: 50 });
    await page.evaluate(() => { const d = globalThis.__debug; for (const e of d.arena.bags()) d.arena.battle().applyStatus(e, 'stun', { duration: 99, source: null }); });
    const held = await read();
    assert.ok(held.ks.length >= 1, `shots in the air as it ends: ${JSON.stringify(held)}`);
    await page.waitForFunction(() => !globalThis.__debug.arena.op().skill?.active, { timeout: 5000, polling: 50 });
    await sleep(600);
    const end = await read();
    assert.deepEqual([end.sim, end.ks.length], [0, 0], `cleared together: ${JSON.stringify(end)}`);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

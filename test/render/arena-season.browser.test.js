// test/render/arena-season.browser.test.js — the debug arena with ?season=<id>: the pieces of a season that is not public yet can
// be chosen and fought on the real view (the page and its simulation both read that season's files).
//
// Opt-in (starts Chrome): RENDER_E2E=1 node --test test/render/arena-season.browser.test.js

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
const OPS = ['char_325_bison', 'char_4221_ju', 'char_4222_taraxa', 'char_455_nothin'];

describe('the arena reads a hidden season', { skip }, () => {
  let srv, browser;
  before(async () => {
    process.env.SP_DEBUG_PAGE = '1';
    const puppeteer = (await import('puppeteer-core')).default;
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: 'new', protocolTimeout: 60000, args: ['--no-first-run'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  const open = async (query) => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://127.0.0.1:${srv.port}/debug.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__debug?.arena?.battle?.(), { timeout: 45000 });
    return { page, errors };
  };

  for (const id of OPS) {
    test(`?season=next: ${id} stands in the battle and casts S2`, async () => {
      const { page, errors } = await open(`season=next&op=${id}&skill=2`);
      // (the page restarts its battle once as its panels settle: cast on the battle that runs)
      await page.evaluate(() => { const a = globalThis.__debug.arena; a.setSpeed(2); });
      await page.waitForFunction(() => {
        const a = globalThis.__debug.arena, u = a.op();
        if (!u?.skill) return false;
        if (u.skill.active) return true;
        a.fillSp(); a.castNow();
        return !!u.skill.active;
      }, { timeout: 20000, polling: 200 });
      const r = await page.evaluate(() => {
        const d = globalThis.__debug, u = d.arena.op();
        return { char: u.def?.charId ?? u.charId, url: location.search, stat: [...(d.arena.errors || [])] };
      });
      assert.equal(r.char, id);
      assert.match(r.url, /season=next/, 'the page keeps the season in its address');
      assert.deepEqual(errors, []);
      assert.deepEqual(r.stat, [], 'no error of the simulation');
      await page.close();
    });
  }

  test('no season: the same address has no such piece', async () => {
    const { page, errors } = await open(`op=${OPS[0]}`);
    const char = await page.evaluate(() => globalThis.__debug.st.op?.charId);
    assert.notEqual(char, OPS[0]);
    assert.deepEqual(errors, []);
    await page.close();
  });
});

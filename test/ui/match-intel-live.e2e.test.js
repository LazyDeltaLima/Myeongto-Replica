// The strategy-draft intel dialog against a real server in both seasons.
// SP_E2E=1 CHROME_PATH=<Chrome> node --test test/ui/match-intel-live.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, preparePage } from '../e2e/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = path.join(ROOT, 'test/e2e/out');

describe('live draft intel: docs/rules/ui.md 「전략 선택 중 적 정보·전장 다시 보기」', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
  let srv;
  let browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  for (const season of ['act2autochess', 'act3autochess']) test(`${season}: real boss and season battlefield disclosure`, { timeout: 120000 }, async () => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await preparePage(page);
    await page.setViewport({ width: 1600, height: 900 });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('sp.name', 'HUD Host'); sessionStorage.setItem('sp.entered', '1'); });
    const request = (t, fields = {}) => page.evaluate(({ t, fields }) => globalThis.__SP__.net.request(t, fields), { t, fields });
    const waitPhase = (phase) => page.waitForFunction((p) => globalThis.__SP__?.store.get().match.public?.phase === p, { timeout: 20000 }, phase);
    try {
      await page.goto(`${srv.url}/?lang=zh&board=2d`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'));
      await request('room.create', { mode: 'coop', difficulty: 'HARD', season, ruleset: 'classic' });
      await request('room.setSpectatorSeats', { seats: 6 });
      await request('room.setAiPicksLast', { on: true });
      await request('room.addBot');
      const code = await page.evaluate(() => globalThis.__SP__.store.get().room.code);
      await request('room.start');
      await waitPhase('INFO_CHECK');
      await request('g.infoReady');
      await waitPhase('BAND_DRAFT');
      await page.waitForSelector('[data-testid="match-intel-open"]');
      await page.click('[data-testid="match-intel-open"]');
      await page.waitForSelector('.intel-dlg .brief-eboss__name');
      const room = srv.lobby.getRoom(code);
      assert.equal(await page.$eval('.intel-dlg .brief-eboss__name', (el) => el.textContent), room.match.gd.boss(room.match.bossId).name);
      assert.equal(!!(await page.$('.intel-dlg .is-unknown')), season === 'act2autochess', 'season disclosure matches the briefing');
      if (season === 'act3autochess') assert.equal(await page.$eval('.intel-dlg .brief-stage__name', (el) => el.textContent), room.match.gd.stage(room.match.stageId).name);
      await page.screenshot({ path: path.join(OUT, `match-intel-live-${season}.png`) });
      await page.click('[data-testid="match-intel-close"]');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
});

// The in-match 重新开始 vote's banner in the mock match, headless Chrome, the DOM field (no art / WebGL needed): another seat's
// proposal shows 反对 / 同意, this seat's answer leaves the banner without buttons, 反对 and 取消投票 close it. The vote's rules are
// test/match/restart-vote.test.js; public/dev/game-mock.js only opens, gathers and closes.
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/restart-vote.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('the restart vote banner', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  const BANNER = '[data-testid="restart-vote"]';
  /** The banner's buttons by their text, [] without a banner. */
  const buttons = (page) => page.$$eval(`${BANNER} button`, (els) => els.map((el) => el.textContent.trim()));
  const press = (page, text) => page.$$eval(`${BANNER} button`, (els, want) => els.find((el) => el.textContent.includes(want)).click(), text);
  const gone = (page) => page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 5000 }, BANNER);
  /** A vote `by` proposed, as m.public brings it. */
  const open = (page, by) => page.evaluate((who) => {
    const m = globalThis.__MOCK__;
    m.S().pub.restartVote = { by: who, yes: [who], deadline: Date.now() + 30_000, ms: 30_000 };
    m.pushPublic();
  }, by);

  test('another seat\'s proposal: 同意 leaves the banner without buttons, 反对 closes it; this seat\'s: 取消投票 closes it', async () => {
    const page = await browser.newPage();
    try {
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await page.setViewport({ width: 1280, height: 720 });
      // `lang=zh`: the texts below are the source language's (a first visit opens in Korean)
      await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=PREP&lang=zh`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.ff-piece');
      assert.equal(await page.$(BANNER), null, 'no vote, no banner');

      await open(page, 'p3');
      await page.waitForSelector(`${BANNER} button`);
      assert.deepEqual(await buttons(page), ['反对', '同意']);
      await press(page, '同意');
      await page.waitForFunction((sel) => document.querySelector(sel) && !document.querySelector(`${sel} button`), { timeout: 5000 }, BANNER);
      const yes = await page.evaluate(() => globalThis.__MOCK__.S().pub.restartVote.yes);
      assert.deepEqual(yes.sort(), ['p1', 'p3']);
      assert.match(await page.$eval(`${BANNER} .rvote__n`, (el) => el.textContent), /^2\/3$/, 'two of the three human seats');

      await page.evaluate(() => { delete globalThis.__MOCK__.S().pub.restartVote; globalThis.__MOCK__.pushPublic(); });
      await gone(page);
      await open(page, 'p4');
      await page.waitForSelector(`${BANNER} button`);
      await press(page, '反对');
      await gone(page);

      await open(page, 'p1');
      await page.waitForSelector(`${BANNER} button`);
      assert.deepEqual(await buttons(page), ['取消投票']);
      await press(page, '取消投票');
      await gone(page);
      assert.deepEqual(problems, []);
    } finally { await page.close(); }
  });
});

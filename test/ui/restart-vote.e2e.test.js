// The in-match 重新开始 vote's banner in the mock match, headless Chrome, the DOM field (no art / WebGL needed): another seat's
// proposal shows 反对 / 同意, this seat's answer leaves the banner without buttons, 反对 and 取消投票 close it. The vote's rules are
// test/match/restart-vote.test.js; public/dev/game-mock.js only opens, gathers and closes.
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/restart-vote.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../e2e/browser.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('the restart vote banner', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
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
  test('return-to-room option opens the correct vote at desktop and phone sizes', async () => {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(e.message));
    try {
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 844, height: 390, isMobile: true, hasTouch: true, isLandscape: true },
        { width: 740, height: 360, isMobile: true, hasTouch: true, isLandscape: true },
        { width: 667, height: 375, isMobile: true, hasTouch: true, isLandscape: true },
      ]) {
        await page.setViewport(viewport);
        await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=PREP&lang=ko`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.ff-piece');
        await page.click('.gtop__exit');
        await page.waitForSelector('[data-testid="restart-room"]');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => document.querySelector('.exit-modal').getAnimations().every((a) => a.playState !== 'running'));
        assert.equal(await page.$eval('[data-testid="restart-room"]', (el) => el.textContent.trim()), '대기실 복귀 투표');
        const fits = await page.$eval('.exit-modal', (el) => {
          const box = el.getBoundingClientRect();
          const buttons = [...el.querySelectorAll('.modal__actions button')];
          const rects = buttons.map((button) => button.getBoundingClientRect());
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
            && rects.every((rect) => rect.left >= box.left && rect.right <= box.right && rect.bottom <= innerHeight)
            && rects.every((rect) => Math.abs(rect.top - rects[0].top) < 1)
            && (!matchMedia('(pointer: coarse)').matches || rects.every((rect) => rect.height >= 44));
        });
        assert.ok(fits, `${viewport.width}×${viewport.height}: exit actions fit in one row, with touch targets at least 44px tall`);
        await page.click('[data-testid="restart-room"]');
        await page.waitForSelector(BANNER);
        assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().pub.restartVote.target), 'room');
        assert.match(await page.$eval(BANNER, (el) => el.textContent), /대기실 복귀를 제안했습니다/);
      }
      assert.deepEqual(problems, []);
    } finally { await page.close(); }
  });

});

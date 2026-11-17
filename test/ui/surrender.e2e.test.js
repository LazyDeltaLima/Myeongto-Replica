import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../e2e/browser.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const BUTTON = '[data-testid="surrender-button"]';
const VOTE = '[data-testid="surrender-vote"]';

describe('battle surrender UI', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] }, { lang: 'ko' });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  async function open(page, phase = 'COMBAT') {
    await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=${phase}&lang=ko`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(BUTTON);
    await page.waitForSelector('.bload', { hidden: true });
  }
  async function seed(page, { mine = false, restart = false } = {}) {
    await page.evaluate(({ mine, restart }) => {
      const mock = globalThis.__MOCK__;
      const pub = mock.S().pub;
      const f = pub.fields[0];
      f.players = ['p1', 'p3', 'ai_2'];
      f.surrenderVote = { by: mine ? 'p1' : 'p3', yes: [mine ? 'p1' : 'p3'], voters: ['p1', 'p3'], deadline: Date.now() + 30000, ms: 30000 };
      if (restart) pub.restartVote = { by: 'p4', yes: ['p4'], deadline: Date.now() + 30000, ms: 30000 };
      mock.pushPublic();
    }, { mine, restart });
    await page.waitForSelector(VOTE);
  }
  const clickText = (page, selector, text) => page.$$eval(selector, (els, label) => els.find(el => el.textContent.includes(label)).click(), text);

  test('personal field asks first: cancel preserves combat; confirm ends only its own field', async () => {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await open(page);
      await page.click(BUTTON);
      await page.waitForSelector('.modal');
      assert.match(await page.$eval('.modal', e => e.textContent), /이번 전투를 포기할까요/);
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().pub.fields[0].live), true);
      await clickText(page, '.modal button', '취소');
      await page.waitForSelector('.modal', { hidden: true });
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().pub.fields[0].live), true);
      await page.click(BUTTON);
      await page.waitForSelector('.modal');
      await clickText(page, '.modal button', '전투 포기');
      await page.waitForSelector(BUTTON, { hidden: true });
      assert.deepEqual(await page.evaluate(() => globalThis.__MOCK__.S().pub.fields.map(f => f.live)), [false, true, true, true]);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test('shared vote uses restart design, counts only its humans, rejection/cancellation continue combat and unanimity ends it', async () => {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      await open(page, 'UNITE');
      await seed(page);
      assert.equal(await page.$eval(`${VOTE} .rvote__n`, el => el.textContent), '1/2');
      assert.equal(await page.$$eval(`${VOTE} .rvote__pips i`, els => els.length), 2);
      await clickText(page, `${VOTE} button`, '반대');
      await page.waitForSelector(VOTE, { hidden: true });
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().pub.fields[0].live), true);
      await page.click(BUTTON);
      await page.waitForSelector(VOTE);
      assert.match(await page.$eval(VOTE, el => el.textContent), /전투 포기를 제안했습니다/);
      await clickText(page, `${VOTE} button`, '투표 취소');
      await page.waitForSelector(VOTE, { hidden: true });
      await seed(page);
      await clickText(page, `${VOTE} button`, '동의');
      await page.waitForSelector(BUTTON, { hidden: true });
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().pub.fields[0].live), false);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });

  test('two vote banners do not overlap; vote controls fit desktop and landscape phone; nonparticipants see neither control', async () => {
    const page = await browser.newPage();
    try {
      for (const viewport of [{ width: 1600, height: 900 }, { width: 844, height: 390 }]) {
        await page.setViewport(viewport);
        await open(page, 'UNITE'); await seed(page, { restart: true });
        const layout = await page.evaluate(() => {
          const a = document.querySelector('[data-testid="restart-vote"]').getBoundingClientRect();
          const banner = document.querySelector('[data-testid="surrender-vote"]');
          const b = banner.getBoundingClientRect();
          return { separate: b.top >= a.bottom, fits: [...banner.querySelectorAll('button')].every(el => {
            const r = el.getBoundingClientRect(); return r.left >= b.left && r.right <= b.right && r.right <= innerWidth;
          }) };
        });
        assert.ok(layout.separate); assert.ok(layout.fits);
      }
      await page.evaluate(() => {
        const mock = globalThis.__MOCK__; mock.S().pub.fields[0].players = ['p3', 'p4']; mock.pushPublic();
      });
      await page.waitForSelector(VOTE, { hidden: true });
      assert.equal(await page.$(BUTTON), null);
    } finally { await page.close(); }
  });
});

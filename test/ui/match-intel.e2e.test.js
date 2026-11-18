// The real briefing/draft components in the deterministic UI harness. Opt-in:
// SP_E2E=1 CHROME_PATH=<system Chrome> node --test test/ui/match-intel.e2e.test.js
// No extracted map art is required: the missing-preview state is also a supported state.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../e2e/browser.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('strategy-draft enemy intel', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv;
  let browser;
  const problems = [];
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); assert.deepEqual(problems, []); });

  async function open(phase = 'BAND_DRAFT', ruleset = 'casual', season = null, lang = 'zh') {
    const page = await browser.newPage();
    page.on('pageerror', (e) => problems.push(e.message));
    await page.setViewport({ width: 1600, height: 900 });
    const query = new URLSearchParams({ phase, ruleset, lang, shot: '1', render: 'fallback' });
    if (season) query.set('season', season);
    await page.goto(`http://127.0.0.1:${srv.port}/dev/game-mock.html?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(phase === 'INFO_CHECK' ? '.brief-eboss__name' : '[data-testid="match-intel-open"]');
    return page;
  }
  const intel = (page, selector) => page.$eval(selector, (el) => ({
    boss: el.querySelector('.brief-eboss__name').textContent,
    abilities: [...el.querySelectorAll('.brief-eboss__desc li')].map((x) => x.textContent),
    types: [...el.querySelectorAll('.brief-etype')].map((x) => x.textContent),
    stage: el.querySelector('.brief-stage__name').textContent,
    pool: el.querySelector('.brief-stage__pool')?.textContent ?? null,
  }));
  async function show(page) {
    await page.click('[data-testid="match-intel-open"]');
    await page.waitForSelector('.intel-dlg');
  }

  test('the dialog repeats the briefing; close, Escape and backdrop preserve draft picks', async () => {
    const briefing = await open('INFO_CHECK');
    const expected = await intel(briefing, '.brief__left');
    await briefing.close();
    const page = await open();
    const picks = await page.evaluate(() => JSON.stringify(globalThis.__MOCK__.S().pub.draft.picks));
    await show(page);
    assert.deepEqual(await intel(page, '.intel-dlg'), expected);
    await page.click('[data-testid="match-intel-close"]');
    await page.waitForFunction(() => !document.querySelector('.intel-dlg'));
    await show(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.intel-dlg'));
    await show(page);
    await page.mouse.click(3, 3);
    await page.waitForFunction(() => !document.querySelector('.intel-dlg'));
    assert.equal(await page.evaluate(() => JSON.stringify(globalThis.__MOCK__.S().pub.draft.picks)), picks);
    await page.click('[data-testid="match-info-open"]');
    await page.waitForSelector('.minfo-dlg:not(.intel-dlg)');
    await page.close();
  });

  test('敌方情报 | 盟约信息 share one row, untruncated on phones; each dialog is titled as its button', async () => {
    const page = await open('BAND_DRAFT', 'casual', null, 'ko');
    const row = () => page.$$eval('.draft-order__infos > .btn', (els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      const label = el.querySelector('.btn__label');
      return { id: el.dataset.testid, text: label.textContent.trim(), top: Math.round(r.top), clipped: label.scrollWidth > label.clientWidth + 1 };
    }));
    for (const [width, height] of [[1600, 900], [844, 390], [740, 360]]) {
      await page.setViewport({ width, height });
      const btns = await row();
      assert.deepEqual(btns.map((b) => [b.id, b.text]), [['match-intel-open', '적 정보'], ['match-info-open', '맹약 정보']],
        'docs/rules/ui.md 「전략 선택 중 적 정보·전장 다시 보기」: 적 정보 | 맹약 정보');
      assert.equal(btns[0].top, btns[1].top, `one row at ${width}x${height}`);
      assert.ok(btns.every((b) => !b.clipped), `labels not cut at ${width}x${height}: ${JSON.stringify(btns)}`);
    }
    await page.setViewport({ width: 1600, height: 900 });
    for (const [btn, dlg, title] of [['match-intel-open', '.intel-dlg', '적 정보'], ['match-info-open', '.minfo-dlg:not(.intel-dlg)', '맹약 정보']]) {
      await page.click(`[data-testid="${btn}"]`);
      await page.waitForSelector(`${dlg} .modal__title`);
      assert.equal(await page.$eval(`${dlg} .modal__title`, (el) => el.textContent.trim()), title);
      // the section below names it already: the title is for screen readers only (maintainer decision 2026-11-18)
      assert.ok(await page.$eval(`${dlg} .modal__title`, (el) => el.classList.contains('sr-only') && el.getBoundingClientRect().width <= 1), `${title}: title hidden`);
      await page.keyboard.press('Escape');
      await page.waitForFunction((sel) => !document.querySelector(sel), {}, dlg);
    }
    await page.close();
  });

  test('classic Alliance hides its battlefield; Regulation keeps its season disclosure', async () => {
    const page = await open('BAND_DRAFT', 'classic');
    await show(page);
    await page.waitForSelector('.intel-dlg [data-testid="brief-stage-unknown"]');
    assert.equal(await page.$('.intel-dlg .brief-stage__map'), null);
    assert.equal(await page.$eval('.intel-dlg .brief-stage__name', (el) => el.textContent.trim()), '未知战场');
    await page.close();
    const regulation = await open('BAND_DRAFT', 'classic', 'act3autochess');
    await show(regulation);
    assert.equal(await regulation.$('.intel-dlg .is-unknown'), null);
    assert.ok((await regulation.$eval('.intel-dlg .brief-stage__name', (el) => el.textContent.trim())).length > 0);
    await regulation.close();
  });

  test('the footer stays visible on desktop and phones; a turn change closes the dialog', async () => {
    const page = await open();
    await show(page);
    for (const [width, height] of [[1600, 900], [844, 390], [740, 360], [375, 812]]) {
      await page.setViewport({ width, height });
      const fits = await page.$eval('.intel-dlg', (el) => {
        const r = el.getBoundingClientRect();
        const b = el.querySelector('.modal__body');
        const close = el.querySelector('[data-testid="match-intel-close"]').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
          && close.top >= 0 && close.bottom <= innerHeight && b.scrollWidth <= b.clientWidth + 1
          && (innerWidth > 900 || b.scrollHeight <= b.clientHeight + 1);
      });
      assert.ok(fits, `dialog and footer fit ${width}x${height}; mobile intel stays in one view (docs/rules/ui.md 「전략 선택 중 적 정보·전장 다시 보기」)`);
    }
    await page.evaluate(() => { const m = globalThis.__MOCK__; m.S().pub.draft.turn = 'p4'; m.pushPublic(); });
    await page.waitForFunction(() => !document.querySelector('.intel-dlg'));
    await page.close();
  });
});

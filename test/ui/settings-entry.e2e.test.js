// Browser check of the settings entry of the lobby and the room (GitHub #238 — 设置 was reachable only from the title
// screen and a running match; opt-in, ~15 s):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/settings-entry.e2e.test.js
//
// After 开始 the lobby's top bar carries a 设置 square left of 全屏 (ui/settings.js SettingsButton, ui/device.js
// FullscreenButton; 玩法说明 sat there until maintainer request 2026-11-18), and so does the
// room's after 创建同盟; each opens the very settings modal of the title screen (language, sound, 快捷键 …) and closes
// with Esc or 完成, leaving the screen as it was. No console / page errors. The modal itself and its contents are covered
// by the title screen's tests; this file is about the entry. Not in the modal, deliberately: background music in a
// hidden tab and the board style (the owner's decision of 2026-10-07 on #238).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../e2e/browser.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the settings entry of the lobby and the room', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** Is the 设置 button the sibling right before the 全屏 square of `screen`'s top bar, and is 玩法说明 gone from it? */
  const settingsBeforeFs = (page, screen) => page.evaluate((s) => {
    const btn = document.querySelector(`${s} [data-testid="settings-btn"]`);
    const fs = document.querySelector(`${s} [data-testid="fs-btn"]`);
    const bar = document.querySelector(s);
    if (!bar || [...bar.querySelectorAll('button')].some((b) => /玩法说明/.test(b.getAttribute('aria-label') || b.textContent))) return false;
    // the lobby's are squares (the gear alone, named by aria-label), the room's carry the word
    return !!btn && !!fs && btn.nextElementSibling === fs && /全屏/.test(fs.getAttribute('aria-label')) && fs.querySelector('svg.btn__icon') != null && /设置/.test(btn.textContent || btn.getAttribute('aria-label')) && btn.querySelector('svg.btn__icon') != null;
  }, screen);
  const modalText = (page) => page.evaluate(() => document.querySelector('.modal')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
  /**
   * The modal's text over all its tabs (ui/settings.js SETTINGS_TABS: each tab shows its own rows); ends on the first tab.
   * `noHints`: without the rows' explanations (.set-hint) — the declined options are looked for among the options, and the
   * side camera's hint names the board (棋盘) without being a board-style option.
   */
  const allTabsText = (page, noHints = false) => page.evaluate(async (bare) => {
    const tabs = [...document.querySelectorAll('.modal .set-tabs button')];
    let text = '';
    for (const b of tabs) {
      b.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      const m = document.querySelector('.modal')?.cloneNode(true);
      if (bare) m?.querySelectorAll('.set-hint').forEach((h) => h.remove());
      text += ` ${m?.textContent ?? ''}`;
    }
    tabs[0]?.click();
    return text.replace(/\s+/g, ' ').trim();
  }, noHints);

  test('the lobby: 设置 left of 玩法说明 opens the settings modal; Esc closes it; the room has the same entry', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('input', { timeout: 15000 });
    await page.type('input', '测试博士');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /开始/.test(b.textContent))?.click());
    await page.waitForSelector('.lobby-screen', { timeout: 15000 });
    await sleep(500);

    assert.ok(await settingsBeforeFs(page, '.lobby-screen .topbar__tools'), '设置 sits right before 全屏 in the lobby\'s top bar, 玩法说明 is gone');
    assert.equal(await modalText(page), null, 'closed until asked');
    await page.click('.lobby-screen [data-testid="settings-btn"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    const text = await allTabsText(page);
    assert.match(text, /设置/);
    assert.match(text, /背景音乐/);
    assert.match(text, /快捷键/);
    const options = await allTabsText(page, true);
    assert.doesNotMatch(options, /棋盘/, 'no board-style option (declined)');
    assert.doesNotMatch(options, /后台/, 'no background-music option (declined)');
    await page.keyboard.press('Escape');
    await sleep(300);
    assert.equal(await modalText(page), null, 'Esc closes it');
    assert.ok(await page.$('.lobby-screen'), 'the lobby is still there');

    // the room: 同盟模拟 → 选择同盟方式 → 创建同盟 → the same button, closed with 完成
    await page.click('.hub-entry--coop');
    await page.waitForSelector('.ally-create__go', { timeout: 5000 });
    await page.click('.ally-create__go');
    await page.waitForSelector('.room-screen', { timeout: 15000 });
    await sleep(500);
    assert.ok(await settingsBeforeFs(page, '.room-screen .topbar__left'), '设置 sits right before 全屏 in the room\'s top bar, 玩法说明 is gone');
    await page.click('.room-screen [data-testid="settings-btn"]');
    await page.waitForSelector('.modal', { timeout: 5000 });
    assert.match(await allTabsText(page), /背景音乐/);
    await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => /完成/.test(b.textContent))?.click());
    await sleep(300);
    assert.equal(await modalText(page), null, '完成 closes it');
    assert.ok(await page.$('.room-screen'), 'the room is still there');
    assert.deepEqual(problems, []);
    await page.close();
  });
});

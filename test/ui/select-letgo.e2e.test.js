// A piece the player let go of is no longer selected, so the 出售 / 撤退 shortcuts (X / Q) never act on it: Esc and a
// press outside the field (the chat, the player list) deselect it like a press on the field; the underframe's own
// buttons and the piece's card keep it. A report: X after a press on the chat sold the operator selected before it.
// Mock match, the DOM field (no art / WebGL needed), headless Chrome.
// SP_E2E=1 CHROME_PATH=/path/to/chrome node --test test/ui/select-letgo.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('a let-go piece is not sold by X', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH to run' }, () => {
  let srv, browser, page, problems;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
    page = await browser.newPage();
    problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`${srv.url}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ff-piece');
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const funds = () => page.evaluate(() => globalThis.__MOCK__.S().priv.funds);
  const benchOps = () => page.evaluate(() => globalThis.__MOCK__.S().priv.hand.filter((p) => p && p.kind === 'chess').map((p) => p.uid));
  const has = (uid) => page.evaluate((u) => globalThis.__MOCK__.S().priv.hand.some((p) => p?.uid === u), uid);
  async function select(uid) {
    await page.click(`.ff-piece[data-uid="${uid}"]`);
    await page.waitForSelector(`.uframe[data-uid="${uid}"] .uframe__btn--sell`);
  }
  async function xSellsNothing(uid, why) {
    const before = await funds();
    await page.keyboard.press('KeyX');
    await sleep(400);
    assert.equal(await funds(), before, `${why}: X sold nothing`);
    assert.ok(await has(uid), `${why}: the piece is still on the bench`);
  }

  test('Esc and a press outside the field deselect; the card keeps the selection', async () => {
    const [a, b, c] = await benchOps();
    assert.ok(c != null, 'the mock bench has three operators');

    // Esc: the card and the selection go together
    await select(a);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.uframe[data-uid]', { hidden: true });
    await xSellsNothing(a, 'after Esc');

    // a press on the chat (outside the field)
    await select(a);
    await page.click('.gchat');
    await page.waitForSelector('.uframe[data-uid]', { hidden: true });
    await page.keyboard.press('Escape'); // (closes the chat if the press opened it)
    await xSellsNothing(a, 'after a press on the chat');

    // a press on the piece's card keeps it (the card takes presses only on its bond cells — the official card lets the
    // rest through to the field —, so: a bond cell, whose popup opens): X sells that piece, and only it
    await select(b);
    await page.click('.dpanel .dbond');
    await page.waitForSelector('.bpop');
    assert.ok(await page.$(`.uframe[data-uid="${b}"]`), 'a press on the card keeps the selection');
    const f0 = await funds();
    await page.keyboard.press('KeyX');
    await page.waitForFunction((u) => !globalThis.__MOCK__.S().priv.hand.some((p) => p?.uid === u), {}, b);
    assert.ok(await funds() > f0, 'X sold the selected piece');
    assert.ok(await has(a) && await has(c), 'and nothing else');
    await page.keyboard.press('Escape'); // the bond popup
    await page.waitForSelector('.bpop', { hidden: true });

    // the underframe's own 出售 still works
    await select(c);
    await page.click('.uframe__btn--sell');
    await page.waitForFunction((u) => !globalThis.__MOCK__.S().priv.hand.some((p) => p?.uid === u), {}, c);
    assert.deepEqual(problems, []);
  });
});

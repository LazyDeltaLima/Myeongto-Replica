// Browser check of the shop folding while a piece is held, on the in-match mock harness (the test idea and its first form
// are upstream's issue602-deploy-fold.e2e.test.js, GPL-3.0; here with this fork's official side camera):
//   SP_E2E=1 CHROME_PATH=… node --test test/ui/deploy-fold.e2e.test.js
//
// Picking up a hand piece, an operator or equipment, folds the shop bar (the screen's `is-collapsed`) and keeps it folded
// through the dropped operator's direction wheel; while a piece is held the 展开商店 tab is gone (docs/rules/ui.md
// 「기물을 고르고 집을 때의 측면 카메라」). Cancelling the drag or the wheel gives the player's own folded state back: the drag
// never writes it. On the render engine the camera flies to the official side camera with the pickup, a resting finger's
// drop target follows it, and the exact shop camera comes back afterwards.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser, loadingScreenGone } from '../e2e/browser.mjs';
import { SIDE_BY } from '../../public/js/render/projection.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('the shop folds while a piece is held and restores afterwards', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** Open the mock PREP match with a free deploy slot (one board operator sold, like facing.e2e.test.js). */
  async function openPage(viewport) {
    const page = await browser.newPage();
    if (viewport) await page.setViewport(viewport);
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('.ff-piece');
    await loadingScreenGone(page);
    const initial = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__MOCK__.S().priv)));
    const sell = initial.board.find((p) => p.kind === 'chess' && !p.golden);
    await page.click(`.ff-piece[data-uid="${sell.uid}"]`);
    await page.waitForSelector('.uframe__btn--sell');
    await page.click('.uframe__btn--sell');
    await page.waitForFunction((uid) => !globalThis.__MOCK__.S().priv.board.some((p) => p.uid === uid), {}, sell.uid);
    await page.keyboard.press('Escape'); // lets go of whatever the sale left selected
    await sleep(200);
    const ready = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__MOCK__.S().priv)));
    const chess = ready.hand.find((p) => p?.kind === 'chess');
    const item = ready.hand.find((p) => p?.kind === 'item');
    const tile = [[9, 9], [9, 8], [12, 6], [11, 7], [10, 7], [9, 7]].find(([r, c]) => !ready.board.some((p) => p.row === r && p.col === c));
    assert.ok(chess && item && tile, 'a hand operator, a hand item and a free tile exist');
    const center = async (sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const folded = () => page.evaluate(() => ({
      cls: document.querySelector('.gm')?.classList.contains('is-collapsed') ?? null,
      tab: !!document.querySelector('.shopbar-tab__btn'),
    }));
    /** Press the piece and nudge it: the drag starts (facing.e2e.test.js uses the same gesture). */
    const pickup = async (piece) => {
      const from = await center(`.ff-piece[data-uid="${piece.uid}"]`);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 20, from.y, { steps: 4 });
      await sleep(120);
    };
    const cancelDrag = async () => { await page.mouse.up(); await sleep(300); };
    const dropOn = async (row, col) => {
      const to = await center(`.ff-tile[data-row="${row}"][data-col="${col}"]`);
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await sleep(80);
      await page.mouse.up();
    };
    return { page, problems, chess, item, tile, folded, pickup, cancelDrag, dropOn };
  }

  test('picking up an operator folds the shop; cancelling the drag restores it (phone viewport)', async () => {
    const h = await openPage({ width: 844, height: 390 });
    assert.deepEqual(await h.folded(), { cls: false, tab: false }, 'the shop starts open');

    await h.pickup(h.chess);
    assert.deepEqual(await h.folded(), { cls: true, tab: false }, 'the shop folds as the operator is picked up, with no tab to open it');
    await h.cancelDrag();
    assert.deepEqual(await h.folded(), { cls: false, tab: false }, 'a cancelled drag opens it again');

    // the player folds by hand: the drag must not undo it
    await h.page.click('.funds__collapse');
    await h.page.waitForSelector('.shopbar-tab__btn');
    await h.pickup(h.chess);
    assert.deepEqual(await h.folded(), { cls: true, tab: false }, 'folded by hand, then picked up: folded, the tab gone while held');
    await h.cancelDrag();
    assert.deepEqual(await h.folded(), { cls: true, tab: true }, 'the hand-made fold survives the cancelled drag, its tab back');
    await h.page.click('.shopbar-tab__btn');
    await sleep(200);

    assert.deepEqual(h.problems, []);
    await h.page.close();
  });

  test('it stays folded through the direction wheel and unfolds when the wheel is cancelled', async () => {
    const h = await openPage({ width: 1600, height: 900 });
    await h.pickup(h.chess);
    assert.equal((await h.folded()).cls, true, 'folded on pickup');
    await h.dropOn(...h.tile);
    await h.page.waitForSelector('.fwheel__dia', { timeout: 5000 });
    await sleep(200);
    assert.deepEqual(await h.folded(), { cls: true, tab: false }, 'the direction wheel keeps the shop folded');
    await h.page.keyboard.press('Escape');
    await h.page.waitForFunction(() => !document.querySelector('.fwheel'));
    await sleep(300);
    assert.deepEqual(await h.folded(), { cls: false, tab: false }, 'cancelling the wheel restores the open shop');
    assert.deepEqual(h.problems, []);
    await h.page.close();
  });

  // The camera flies with the pickup while the finger may rest, so the drop target is the tile under the finger under the
  // NEW camera (render/drag.js refresh). Touch input: a resting mouse gets Chrome's synthetic moves when the layout changes
  // (the shop bar folding), a finger does not.
  test('engine (touch): the side camera, a resting finger\'s target follows it, the exact shop camera returns', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, hasTouch: true });
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => globalThis.__SP_VIEW__?.raw?.stats?.().mode === 'prep', { timeout: 30000 });
    await loadingScreenGone(page);
    await sleep(1500);
    const cam = () => page.evaluate(() => JSON.stringify(globalThis.__SP_VIEW__.raw.debug.cam.params()));
    const shopCam = await cam();
    const priv = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__MOCK__.S().priv)));
    const chess = priv.hand.find((p) => p?.kind === 'chess');
    const from = await page.evaluate((uid) => {
      const v = globalThis.__SP_VIEW__;
      const d = v.raw.debug;
      const r = v.pieceScreenRect(uid);
      const c = d.app.view.getBoundingClientRect();
      for (const f of [0.7, 0.8, 0.9, 0.6, 0.97, 0.5]) {
        const y = r.top + r.height * f;
        if (d.pick.pieceAt(r.left + r.width / 2 - c.left, y - c.top)?.uid === uid) return { x: r.left + r.width / 2, y };
      }
      return null;
    }, chess.uid);
    // where the pointer comes to rest: board tile (10, 6) as the shop camera shows it
    const P = await page.evaluate(() => { const t = globalThis.__SP_VIEW__.tileScreen(10, 6); return { x: t.x, y: t.y }; });
    assert.ok(from && P, 'the hand piece and the tile are on screen');
    const t = page.touchscreen;
    await t.touchStart(from.x, from.y);
    // one move: the drag starts with the finger already on P (its target judged under the shop camera), then it rests
    await t.touchMove(P.x, P.y);
    await sleep(800); // the flight (0.25 s) runs and ends under the resting finger
    const s = await page.evaluate((P, uid) => {
      const d = globalThis.__SP_VIEW__.raw.debug;
      const rect = d.app.view.getBoundingClientRect();
      const g = d.pick.groundTile(P.x - rect.left, P.y - rect.top);
      return {
        under: g ? [g.row, g.col] : null, target: d.tiles.highlights.get('dragTarget')?.tiles?.[0] || null,
        dragging: d.drag.dragging, held: !!d.views.get(`p:${uid}`),
        folded: document.querySelector('.gm')?.classList.contains('is-collapsed') ?? null, tab: !!document.querySelector('.shopbar-tab__btn'), cam: JSON.stringify(d.cam.params()),
      };
    }, P, chess.uid);
    assert.equal(s.dragging, true);
    assert.equal(s.folded, true, 'the shop is folded');
    assert.equal(s.tab, false, 'no tab while a piece is held');
    assert.equal(JSON.parse(s.cam).yaw, SIDE_BY.yaw, 'the official side camera');
    assert.equal(JSON.parse(shopCam).yaw, 0, 'the shop camera has no side turn');
    assert.ok(s.under, 'the resting finger still points at the board');
    assert.ok(s.under[0] !== 10 || s.under[1] !== 6, `the flight moved another tile under the resting finger (${s.under})`);
    await t.touchEnd();
    await sleep(500);
    if (await page.$('.fwheel')) {
      assert.equal(await page.evaluate(() => document.querySelector('.gm')?.classList.contains('is-collapsed')), true, 'the wheel keeps the side camera and the fold');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.fwheel'));
    }
    await sleep(800);
    assert.equal(await cam(), shopCam, 'back on exactly the shop camera');
    assert.equal(await page.evaluate(() => document.querySelector('.gm')?.classList.contains('is-collapsed')), false);
    assert.deepEqual(problems, []);
    await page.close();
  });

  test('picking up equipment folds the shop too, and releasing it restores the player\'s state', async () => {
    const h = await openPage({ width: 1600, height: 900 });
    await h.pickup(h.item);
    assert.deepEqual(await h.folded(), { cls: true, tab: false }, 'equipment pickup folds the shop (no direction wheel for items)');
    await h.cancelDrag();
    assert.deepEqual(await h.folded(), { cls: false, tab: false }, 'released without equipping: open again');
    assert.deepEqual(h.problems, []);
    await h.page.close();
  });
});

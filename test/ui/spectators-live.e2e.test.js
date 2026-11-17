// Real room.state -> game HUD in both seasons; real spectator sockets, never a mock roster.
// SP_E2E=1 CHROME_PATH=<Chrome> node --test test/ui/spectators-live.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser, preparePage, loadingScreenGone } from '../e2e/browser.mjs';
import { TestClient } from '../helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const OUT = path.join(ROOT, 'test/e2e/out');

describe('in-game spectators: docs/rules/ui.md 「플레이 중 관전자 수·명단」', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
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

  for (const season of ['act2autochess', 'act3autochess']) test(`${season}: live join/leave/reconnect, four visible rows, no horizontal scrolling`, { timeout: 120000 }, async () => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const clients = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await preparePage(page);
    await page.setViewport({ width: 1600, height: 900 });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('sp.name', 'HUD Host'); sessionStorage.setItem('sp.entered', '1'); });
    const request = (t, fields = {}) => page.evaluate(({ t, fields }) => globalThis.__SP__.net.request(t, fields), { t, fields });
    const waitPhase = (phase) => page.waitForFunction((p) => globalThis.__SP__?.store.get().match.public?.phase === p, { timeout: 20000 }, phase);
    const waitCount = (n) => page.waitForFunction((value) => document.querySelector('[data-testid="spectators-count"]')?.textContent === String(value), { timeout: 10000 }, n);
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
      const room = srv.lobby.getRoom(code);
      const bandId = await page.$eval('.dband:not(.is-taken)', (el) => el.dataset.band);
      await request('g.band', { bandId });
      if (season === 'act3autochess') { await waitPhase('DIY_CHOOSE'); await request('g.diyReady'); }
      await waitPhase('PREP');
      await loadingScreenGone(page);
      await waitCount(0);
      await page.click('[data-testid="spectators-open"]');
      await page.waitForSelector('.spectators__empty');

      const people = ['로도스박사', '민트박사', '작전분석가', '가나다라마바사아자차카타', '박사다섯'];
      for (let i = 0; i < people.length; i++) {
        const client = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
        const welcome = await client.hello(people[i]);
        clients.push({ client, welcome, name: people[i] });
        assert.equal((await client.request({ t: 'room.spectate', code })).t, 'ok');
        await waitCount(i + 1);
        if (i === 3) {
          const four = await page.$eval('.spectators__list', (el) => ({ height: el.clientHeight, scroll: el.scrollHeight, rows: el.children.length }));
          assert.equal(four.rows, 4);
          assert.ok(four.scroll <= four.height + 1, 'four names fit without scrolling');
        }
      }
      const expected = room.toState().spectators.map((s) => ({ id: s.playerId, name: s.name }));
      const names = () => page.$$eval('.spectators__row', (rows) => rows.map((el) => ({ id: el.dataset.playerId, name: el.querySelector('.spectators__name').textContent })));
      assert.deepEqual(await names(), expected, 'names come from actual room.state spectators');
      const dimensions = await page.$eval('.spectators__list', (el) => ({ height: el.clientHeight, scroll: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth, row: el.firstElementChild.getBoundingClientRect().height }));
      assert.ok(Math.abs(dimensions.height - dimensions.row * 4) <= 2, 'four visible rows');
      assert.ok(dimensions.scroll > dimensions.height, 'the fifth name scrolls vertically');
      assert.ok(dimensions.scrollWidth <= dimensions.width, 'long names never cause horizontal scrolling');
      const clearsControls = () => page.$eval('.spectators__dialog', (el) => {
        const popup = el.getBoundingClientRect();
        const icon = document.querySelector('[data-testid="spectators-open"]').getBoundingClientRect();
        const separate = (a, b) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
        const ready = document.querySelector('.readybtn')?.getBoundingClientRect();
        const enemy = document.querySelector('[data-testid="check-enemy"]').getBoundingClientRect();
        const aligned = icon.left >= enemy.right + 6 && icon.left <= enemy.right + 16 && Math.abs(icon.top + icon.height / 2 - enemy.top - enemy.height / 2) < 2;
        return aligned && (!ready || icon.right + 8 <= ready.left) && [...document.querySelectorAll('.gtop__meta, .readybtn, .toolbtn, [data-testid="check-enemy"]')].every((button) => {
          const control = button.getBoundingClientRect();
          return separate(popup, control) && separate(icon, control);
        });
      });
      assert.ok(await clearsControls(), 'spectator icon must align right of enemy preview and clear ping / 准备就绪 (docs/rules/ui.md 「플레이 중 관전자 수·명단」)');
      await page.evaluate(async () => { const { switchLang } = await globalThis.__SP__.import('./ui/lang.js'); await switchLang('ko'); });
      await page.waitForFunction(() => document.querySelector('.spectators__head h3')?.textContent.includes('관전자'));
      await page.waitForFunction(() => !document.querySelector('.parb'));

      // A retained disconnected seat stays in the roster, like the room's spectator list, without a duplicate on reconnect.
      await clients[2].client.terminate();
      await page.waitForSelector(`.spectators__row[data-player-id="${clients[2].welcome.playerId}"].is-offline`);
      await waitCount(5);
      const rejoined = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      await rejoined.hello(clients[2].name, clients[2].welcome.token);
      clients[2].client = rejoined;
      await page.waitForFunction((id) => !document.querySelector(`.spectators__row[data-player-id="${id}"]`)?.classList.contains('is-offline'), {}, clients[2].welcome.playerId);
      assert.deepEqual(await names(), expected);

      for (const [width, height] of [[1920, 1080], [1600, 900], [1280, 720], [1024, 768], [844, 390], [740, 360], [667, 375]]) {
        await page.setViewport({ width, height });
        await page.evaluate(() => globalThis.__SP__.store.patch('connection', { ping: 9999 }));
        await page.waitForFunction(() => document.querySelector('.gtop__meta')?.textContent.includes('9999'));
        const bounds = await page.$eval('.spectators__dialog', (el) => {
          const r = el.getBoundingClientRect();
          const list = el.querySelector('.spectators__list');
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom,
            overflow: list.scrollWidth > list.clientWidth, overflowX: getComputedStyle(el).overflowX };
        });
        assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height && !bounds.overflow && bounds.overflowX === 'hidden', `spectator popup fits ${width}x${height}: ${JSON.stringify(bounds)}`);
        assert.ok(await clearsControls(), `spectator icon aligns right of the enemy preview and clears ping / 准备就绪 at ${width}x${height} (docs/rules/ui.md 「플레이 중 관전자 수·명단」)`);
        await page.evaluate(() => globalThis.__SP__.store.patch('connection', { ping: 128 }));
        await page.waitForFunction(() => document.querySelector('.gtop__meta')?.textContent.includes('128'));
        await page.screenshot({ path: path.join(OUT, `spectators-live-${season}-${width}.png`) });
        if (width === 1600) await page.screenshot({ path: path.join(OUT, `spectators-live-${season}-desktop.jpg`), quality: 90 });
        if (width === 740) await page.screenshot({ path: path.join(OUT, `spectators-live-${season}-mobile.png`) });
      }
      await page.setViewport({ width: 1600, height: 900 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.spectators__dialog'));
      await page.click('[data-testid="spectators-open"]');
      await page.click('.readybtn');
      // Follow the normal unused-funds / overflow confirmation before expecting combat.
      for (let i = 0; i < 2; i++) {
        await page.waitForFunction(() => document.querySelector('.bcd__btn.is-ok') || document.querySelector('.modal__actions .btn--primary') || globalThis.__SP__.store.get().match.private?.ready || globalThis.__SP__.store.get().match.public?.phase === 'COMBAT');
        const confirm = await page.$('.bcd__btn.is-ok, .modal__actions .btn--primary');
        if (!confirm) break;
        await confirm.click();
      }
      await waitPhase('COMBAT');
      await waitCount(5);
      if (!(await page.$('.spectators__dialog'))) await page.click('[data-testid="spectators-open"]');
      assert.deepEqual(await names(), expected, 'the live roster remains available during combat');
      assert.ok(await clearsControls(), 'combat roster also clears ping and controls');
      for (let i = clients.length - 1; i >= 0; i--) {
        assert.equal((await clients[i].client.request({ t: 'room.leave' })).t, 'ok');
        await waitCount(i);
      }
      await page.waitForSelector('.spectators__empty');
      assert.deepEqual(errors, []);
    } finally {
      for (const c of clients) await c.client.close();
      await context.close();
    }
  });
});

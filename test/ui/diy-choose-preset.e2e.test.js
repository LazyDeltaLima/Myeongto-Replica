// 3/3 确定自选编队's 自选预设 box against a real server and two humans (docs/rules/ui.md 「규정 선발 편성 확정 화면」
// 「프리셋 상자와 준비」, docs/rules/diy.md 「규정 선발 프리셋 — 시즌별 저장과 3/3 선택」): the lineup the box picks is the
// one the match holds.
//   1. A preset picked in the box, then 准备就绪 at once: the ready waits for the lineup (before, it overtook the co-op
//      room.chatFaction round trip and the room.diy behind it, so the match refused the lineup — the cards kept the old
//      one and the toast blamed the strategy draft).
//   2. A chat faction picked during the step applies its preset: the box shows that roster, the one the cards hold
//      (before, it showed the strategy's link or its own last pick).
//   3. A lineup the match refused while the seat was ready goes again after 取消准备.
//
//   SP_E2E=1 CHROME_PATH=<Chrome> node --test test/ui/diy-choose-preset.e2e.test.js
// A second human (a socket client) stays unready so the step waits; its timer is cleared so a slow machine cannot end it.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser, preparePage } from '../e2e/browser.mjs';
import { TestClient } from '../helpers/wsClient.js';
import { CHAT_FACTIONS } from '../../shared/local.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const S5A = 'chess_char_5_diy1_a';
const S5B = 'chess_char_5_diy2_a';
const CHEN3 = 'char_1050_chen3';
const ASCLN = 'char_4132_ascln';
// the browser's 盟约 rosters: 不使用预设 = 赤刃明霄陈 in the first 5阶 slot; 炎国 = 阿斯卡纶 there; 萨尔贡 = 赤刃明霄陈 in the second
const pick = (charId) => ({ charId, skillIndex: 0, uniEquipId: null });
const BASE = { [S5A]: pick(CHEN3) };
const YAN = { [S5A]: pick(ASCLN) };
const SARGON = { [S5B]: pick(CHEN3) };
const charsOf = (lineup) => Object.fromEntries(Object.entries(lineup || {}).map(([slot, p]) => [slot, p.charId]));

describe('3/3 自选预设 box: the lineup it shows is the match\'s (real server)', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
  let srv;
  let browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('preset then 准备就绪 at once; a chat faction; a refused lineup after 取消准备', { timeout: 150000 }, async () => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await preparePage(page);
    await page.setViewport({ width: 1600, height: 900 });
    await page.evaluateOnNewDocument((picks, presets) => {
      localStorage.setItem('sp.name', 'Preset Host');
      sessionStorage.setItem('sp.entered', '1');
      localStorage.setItem('sp.pref.diy', JSON.stringify({ v: 1, picks }));
      localStorage.setItem('sp.pref.diyPresets', JSON.stringify({ v: 3, presets, base: picks, active: null, links: {} }));
    }, BASE, { yan: YAN, sargon: SARGON });
    const request = (t, fields = {}) => page.evaluate(({ t, fields }) => globalThis.__SP__.net.request(t, fields), { t, fields });
    // the 自选编队 sync state (ui/loadoutSync.js loadoutStore diySync)
    const waitSync = (v) => page.waitForFunction(async (want) => (await globalThis.__SP__.import('./ui/loadoutSync.js')).loadoutStore.get().diySync === want,
      { timeout: 5000, polling: 100 }, v);
    const waitPhase = (phase, timeout = 30000) => page.waitForFunction((p) => globalThis.__SP__?.store.get().match.public?.phase === p, { timeout }, phase);
    const guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    try {
      await page.goto(`${srv.url}/?lang=zh&board=2d`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'));
      await request('room.create', { mode: 'coop', difficulty: 'HARD', season: 'act2autochess', ruleset: 'classic' });
      const code = await page.evaluate(() => globalThis.__SP__.store.get().room.code);
      const hostId = await page.evaluate(() => globalThis.__SP__.store.get().me.playerId);
      await guest.hello('Preset Guest');
      assert.equal((await guest.request({ t: 'room.join', code })).t, 'ok');
      assert.equal((await guest.request({ t: 'room.ready', ready: true })).t, 'ok');
      await request('room.start');
      await waitPhase('INFO_CHECK');
      const room = srv.lobby.getRoom(code);
      const match = room.match;
      const ps = match.players.get(hostId);
      await waitSync('synced'); // the room's season sends the picks again; the briefing takes them
      assert.deepEqual(charsOf(ps.diyLineup), charsOf(BASE), 'the match took the browser\'s picks');
      await request('g.infoReady');
      assert.equal((await guest.request({ t: 'g.infoReady' })).t, 'ok');
      await waitPhase('BAND_DRAFT');
      // strategies built around no chat faction: their pick applies 不使用预设 (the roster in use already)
      const bonds = new Set(CHAT_FACTIONS.map((f) => f.bond));
      const plain = match.gd.bandIds().filter((id) => match.gd.bandAllowed(id) && !(match.gd.band(id)?.bondIds || []).some((b) => bonds.has(b)));
      for (let n = 0; n < 2; n++) {
        const turn = match.draftTurn();
        const bandId = plain.find((id) => !match.bandTaken(id, turn));
        if (turn === hostId) await request('g.band', { bandId });
        else assert.equal((await guest.request({ t: 'g.band', bandId })).t, 'ok');
        await new Promise((r) => setTimeout(r, 300));
      }
      await waitPhase('DIY_CHOOSE', 40000);
      match.setDeadline(0); // the unready guest keeps the step open; no timer may end it on a slow machine
      const box = '[data-testid="diy-choose-preset"] [data-testid="draft-preset-select"]';
      await page.waitForSelector(`${box}:not([disabled])`, { visible: true, timeout: 15000 });
      assert.equal(await page.$eval(box, (el) => el.dataset.value), 'base', 'the box shows the roster in use');

      // 1) 炎国 in the box (its room.chatFaction held back 1.5 s), 准备就绪 at once: the ready waits, the match takes 炎国
      await page.evaluate(() => {
        const net = globalThis.__SP__.net;
        const real = net.request;
        net.request = function (t, ...rest) {
          if (t !== 'room.chatFaction') return real.call(this, t, ...rest);
          net.request = real;
          return new Promise((r) => setTimeout(r, 1500)).then(() => real.call(this, t, ...rest));
        };
      });
      await page.click(box);
      await page.click('.draft-preset__opt[data-preset="yan"]');
      assert.equal(await page.$eval('[data-testid="diy-choose-ready"]', (el) => el.disabled), true, '准备就绪 waits while the box applies');
      await page.click('[data-testid="diy-choose-ready"]');
      await page.waitForSelector(`${box}:not([disabled])`, { timeout: 10000 });
      await waitSync('synced');
      assert.equal(ps.diyChooseReady, false, 'the click during the apply did not ready the seat');
      assert.deepEqual(charsOf(ps.diyLineup), charsOf(YAN), 'the match holds 炎国\'s lineup');
      assert.equal(await page.$eval(box, (el) => el.dataset.value), 'yan');
      await page.waitForFunction((slot) => !!document.querySelector(`[data-testid="diy-choose-card"][data-slot="${slot}"]`), { timeout: 5000 }, S5A);

      // 2) a chat faction picked now (萨尔贡) applies its preset: the box shows it, the match holds it
      await new Promise((r) => setTimeout(r, 900)); // the chat cooldown
      assert.equal(await page.evaluate(async () => (await globalThis.__SP__.import('./ui/factionPick.js')).chooseFaction('sargon')), true);
      await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.value === 'sargon', { timeout: 5000 }, box)
        .catch(() => assert.fail('the 3/3 box must show the roster in use (diyPresetStore active), not its last pick or the strategy link — docs/rules/ui.md 「규정 선발 편성 확정 화면」'));
      await waitSync('synced');
      assert.deepEqual(charsOf(ps.diyLineup), charsOf(SARGON), 'the match holds 萨尔贡\'s lineup');

      // 3) ready; a lineup sent meanwhile is refused ('locked'); 取消准备 sends it again and the match takes it
      await page.click('[data-testid="diy-choose-ready"]');
      await page.waitForFunction(() => !!globalThis.__SP__.store.get().match.private?.diyChoose?.ready, { timeout: 5000 });
      await page.evaluate(async (picks) => (await globalThis.__SP__.import('./ui/loadoutSync.js')).setDiyPicks(picks), BASE);
      await waitSync('locked');
      assert.deepEqual(charsOf(ps.diyLineup), charsOf(SARGON), 'refused while ready');
      await page.waitForSelector('[data-testid="diy-choose-ready"]:not([disabled])', { timeout: 5000 });
      await page.click('[data-testid="diy-choose-ready"]'); // 取消准备
      await waitSync('synced')
        .catch(() => assert.fail('取消准备 must send the lineup the match refused while ready (loadoutSync.js resendDiySync) — docs/rules/ui.md 「규정 선발 편성 확정 화면」'));
      assert.equal(ps.diyChooseReady, false);
      assert.deepEqual(charsOf(ps.diyLineup), charsOf(BASE), 'the refused lineup reached the match after 取消准备');
      assert.deepEqual(errors, []);
    } finally {
      await guest.close();
      await context.close();
    }
  });
});

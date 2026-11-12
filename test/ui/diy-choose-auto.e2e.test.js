// 规程's 确定自选编队 (PHASE.DIY_CHOOSE) in a real browser against the real server: a single human with an AI teammate — a
// step with no deadline (server/match/match/diyChoose.js, infra.js soloUntimed) — gets past it with no input, because
// the page brings its 自选编队's first two per tier and readies by itself until the step has a screen of its own
// (screens/game.js GameScreen, ui/gameLogic/draft.js autoDiyChoice). The step shows the strategy draft's screen, so the
// automatic choice must live where that screen is mounted too: inside the match screen it never ran and the match
// waited for ever. Opt-in: SP_E2E=1 (and a Chrome, CHROME_PATH).
//
//   SP_E2E=1 node --test test/ui/diy-choose-auto.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../e2e/browser.mjs';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME) && hasGeneratedData();
const SEASON = 'act3autochess';

describe('规程 确定自选编队: a lone human gets past the step by itself (real server, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;
  const savedSeasons = process.env.SP_SEASONS;

  before(async () => {
    process.env.SP_SEASONS = SEASON; // the hidden season, offered as a local server offers it
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await launchBrowser(puppeteer, { executablePath: CHROME, headless: true, args: ['--no-sandbox'], protocolTimeout: 60000 });
  });

  after(async () => {
    await browser?.close();
    await srv?.close();
    if (savedSeasons === undefined) delete process.env.SP_SEASONS;
    else process.env.SP_SEASONS = savedSeasons;
  });

  test('co-op with one AI teammate: briefing → strategy → 确定自选编队 → 协议启动 with no 准备就绪 sent by the test', { timeout: 120000 }, async () => {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(`${base}/?lang=zh`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.title-login input', { timeout: 30000 });
    await page.click('.title-login input');
    await page.keyboard.type('Tester');
    await page.evaluate(() => [...document.querySelectorAll('.title-login button')].find((b) => b.textContent.includes('开始'))?.click());
    await page.waitForFunction(() => !document.querySelector('.title-login'), { timeout: 20000 });

    // the room and the steps before 确定自选编队 through the page's own connection
    const phase = () => page.evaluate(() => globalThis.__SP__.store.get().match?.public?.phase ?? null);
    await page.evaluate(async (season) => {
      const { net } = globalThis.__SP__;
      await net.request('room.create', { mode: 'coop', difficulty: 'NORMAL', season });
      await net.request('room.addBot', {});
      await net.request('room.start', {});
    }, SEASON);
    await page.waitForFunction(() => globalThis.__SP__.store.get().match?.public?.phase === 'INFO_CHECK', { timeout: 30000 });
    await page.evaluate(() => globalThis.__SP__.net.request('g.infoReady', {}));
    await page.waitForFunction(() => {
      const s = globalThis.__SP__.store.get();
      return s.match?.public?.phase === 'BAND_DRAFT' && s.match.public.draft?.turn === s.me.playerId;
    }, { timeout: 30000 });
    // the first strategy the server takes (one the teammate took, or the mode leaves out, is refused)
    const bandId = await page.evaluate(async () => {
      const { net, data } = globalThis.__SP__;
      for (const id of Object.keys(data.get('bands') || {})) {
        try { await net.request('g.band', { bandId: id }); return id; } catch { /* the next one */ }
      }
      return null;
    });
    assert.ok(bandId, 'a strategy to pick');

    // the step comes, and then passes without the test sending g.diyChoose / g.diyReady
    await page.waitForFunction(() => {
      const p = globalThis.__SP__.store.get().match?.public?.phase;
      return p && p !== 'BAND_DRAFT';
    }, { timeout: 30000 });
    const passed = await page.waitForFunction(() => {
      const p = globalThis.__SP__.store.get().match?.public?.phase;
      return p && !['INFO_CHECK', 'BAND_DRAFT', 'DIY_CHOOSE'].includes(p);
    }, { timeout: 15000 }).then(() => true, () => false);
    assert.ok(passed, `the match stays in ${await phase()}: the page never readied 确定自选编队`);
    assert.deepEqual(problems, []);
    await page.close();
  });
});

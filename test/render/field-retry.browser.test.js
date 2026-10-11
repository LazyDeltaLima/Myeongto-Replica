// The field hook mounts the render engine again after it fell back to the DOM view (upstream 0.2.4 `6bfc0827`,
// public/js/ui/fieldHost.js useFieldView): on `online` / `visibilitychange`, at most twice in a row, never with
// `?render=fallback`. Opt-in, needs Chrome:
//   RENDER_E2E=1 CHROME_PATH=… node --test test/render/field-retry.browser.test.js
// This is upstream's 「field hook retries a failed Pixi download」 case of test/render/recovery.browser.test.js; its
// live-battle case (a whole solo match driven through upstream's room flow) is not taken. The game screen's side — a
// replacement view re-enters the prep camera and the battle (screens/game.js `enteredViewRef`) — is a screen check.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const enabled = process.env.RENDER_E2E === '1' && existsSync(CHROME);

describe('field hook retry after a fallback', { skip: !enabled && 'set RENDER_E2E=1 (and have Chrome) to run' }, () => {
  let srv, browser;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    const P = (await import('puppeteer-core')).default;
    browser = await P.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--enable-gpu', '--ignore-gpu-blocklist'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  for (const forced of [false, true]) test(`a failed Pixi download is retried once the page is online again; forced fallback=${forced}`, async () => {
    const page = await browser.newPage(); let pixiRequests = 0, failing = true;
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const pixi = new URL(req.url()).pathname === '/vendor/pixi.min.js';
        if (pixi) pixiRequests++;
        if (pixi && failing) void req.abort('failed'); else void req.continue();
      });
      await page.goto(`http://127.0.0.1:${srv.port}/?${forced ? 'render=fallback&' : ''}board=2d`);
      await page.evaluate(async () => {
        const { render, h } = await import('/vendor/preact.module.js');
        const { useRef, useEffect } = await import('/vendor/hooks.module.js');
        const { useFieldView } = await import('/js/ui/fieldHost.js');
        const { data } = await import('/js/data.js');
        await data.loadAll('stages', 'chess', 'assets', 'local');
        function Harness() {
          const host = useRef(null), state = useFieldView(host);
          useEffect(() => {
            if (!state.view) return;
            state.view.setStage(data.lookup('stages', 'act2autochess_m01'));
            state.view.setPrep({ playerId: 'p', board: [], hand: [] });
          }, [state.view]);
          return h('div', { ref: host, id: 'recovery-host', style: 'width:100vw;height:100vh' });
        }
        render(h(Harness), document.getElementById('app'));
        window.__unmount = () => render(null, document.getElementById('app'));
      });
      await page.waitForFunction(() => window.__SP_VIEW__?.kind === 'fallback', { timeout: 30000 });
      const before = pixiRequests; failing = false;
      await page.evaluate(() => {
        window.__firstView = window.__SP_VIEW__;
        for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('online'));
      });
      if (forced) {
        assert.equal(await page.evaluate(() => window.__SP_VIEW__ === window.__firstView), true);
        assert.equal(pixiRequests, before, 'an explicit fallback never asks for the engine again');
      } else {
        await page.waitForFunction(() => window.__SP_VIEW__?.kind === 'engine', { timeout: 20000 });
        assert.equal(pixiRequests, before + 1, 'one retry after the failed download');
        const result = await page.evaluate(() => {
          const view = window.__SP_VIEW__;
          for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange'));
          return { same: view === window.__SP_VIEW__, canvases: document.querySelectorAll('#recovery-host canvas').length >= 1, field: view.raw.stats().mode };
        });
        assert.deepEqual(result, { same: true, canvases: true, field: 'prep' }, 'an engine view is never replaced');
      }
      await page.evaluate(() => window.__unmount());
      assert.equal(await page.evaluate(() => window.__SP_VIEW__), null, 'unmount releases the view');
    } finally { await page.close(); }
  });
});

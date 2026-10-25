// Real-server browser E2E — the room chat log keeps following new lines once it holds KEEP (60) lines (maintainer
// report 2026-10-25: while typing in a co-op room, new lines of the others stopped scrolling into view). The oldest
// line leaving the top made Chrome's scroll anchoring shift scrollTop, and ChatLog read that scroll as the reader
// scrolling up; .chat__log has overflow-anchor: none (public/css/chat.css).
//
//   SP_E2E=1 node --test test/ui/chat-scroll.e2e.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client, sleep, hasChrome, startRealServer } from '../e2e/client.mjs';
import { TestClient } from '../helpers/wsClient.js';
import { CHAT_COOLDOWN_MS } from '../../shared/local.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome();

describe('room chat auto-scroll (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome)' }, () => {
  test('a full log (60 lines) still follows the others\' lines while the player types', { timeout: 4 * 60 * 1000 }, async () => {
    const srv = await startRealServer({});
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'chat-scroll' });
    let other = null;
    try {
      await host.open('?lang=zh');
      await host.enter('凯尔希');
      await host.click('.mode-card', '同盟模拟');
      await host.click('.diff-card', '标准模拟');
      await host.click('.create-box button', '创建同盟');
      const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      other = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      await other.hello('华法琳');
      assert.equal((await other.request({ t: 'room.join', code: room.code })).t, 'ok');
      await host.page.waitForSelector('.chat__log', { timeout: 10000 });
      const gap = () => host.page.evaluate(() => {
        const el = document.querySelector('.chat__log');
        return { gap: el.scrollHeight - el.scrollTop - el.clientHeight, n: el.children.length };
      });
      const say = async (text) => {
        assert.equal((await other.request({ t: 'room.chat', text })).t, 'ok');
        await sleep(CHAT_COOLDOWN_MS + 100);
      };
      // lines of different heights, past the 60 the client keeps
      for (let i = 0; i < 64; i++) await say(`line ${i} ${'说'.repeat((i % 3) * 30)}`);
      const full = await gap();
      assert.equal(full.n, 60);
      assert.ok(full.gap < 2, `full log at the bottom (gap ${full.gap}px)`);
      await host.click('.chat__input');
      await host.page.keyboard.type('typing');
      for (let i = 0; i < 3; i++) {
        await say(`while typing ${i}`);
        await host.page.keyboard.type(' ab');
        await sleep(300);
        const g = await gap();
        assert.ok(g.gap < 2, `line ${i} while typing scrolled into view (gap ${g.gap}px)`);
      }
    } finally {
      other?.close?.();
      await host.close();
      await srv.stop();
    }
  });
});

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

test('message times update in place, open on hover and focus, and appear in the pinned feed', {
  skip: !ENABLED && 'set SP_E2E=1 (Chrome)', timeout: 60_000,
}, async () => {
  const srv = await startRealServer({});
  const P = (await import('puppeteer-core')).default;
  const host = new Client(P, srv.base, 'host', { prefix: 'chat-time' });
  let other = null;
  try {
    await host.open('?lang=zh');
    const { page } = host;
    await page.emulateTimezone('Asia/Seoul');
    await host.enter('채팅 테스트');
    await host.click('.mode-card', '同盟模拟');
    await host.click('.ally-create__go', '创建同盟');
    const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
    await page.evaluate(async () => {
      const { switchLang } = await globalThis.__SP__.import('./ui/lang.js');
      await switchLang('ko');
    });
    other = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    await other.hello('친구');
    assert.equal((await other.request({ t: 'room.join', code: room.code })).t, 'ok');
    await page.waitForSelector('.chat__log');
    const time = '.chat__log .chat__time';
    assert.equal(await page.$(time), null);

    assert.equal((await other.request({ t: 'room.chat', text: 'first message' })).t, 'ok');
    await page.waitForSelector(time);
    const first = await page.$eval(time, (el) => ({ label: el.textContent, at: el.getAttribute('datetime') }));
    assert.equal(first.label, '방금 전');

    await page.hover(time);
    await page.waitForSelector('.tooltip.is-shown');
    const exact = await page.$eval('.tooltip.is-shown', (el) => el.textContent);
    assert.match(exact, /\d{4}년 \d{1,2}월 \d{1,2}일 (오전|오후) \d{1,2}:\d{2} (GMT\+9|KST)/);
    await page.hover('.chat__input');
    await page.waitForSelector('.tooltip.is-shown', { hidden: true });
    await page.focus('.chat__x');
    await page.keyboard.press('Tab');
    await page.waitForSelector(`${time}:focus`);
    await page.waitForSelector('.tooltip.is-shown');
    assert.equal(await page.$eval('.tooltip.is-shown', (el) => el.textContent), exact);
    assert.equal(await page.$eval(time, (el) => document.getElementById(el.getAttribute('aria-describedby'))?.textContent), exact);

    const realNow = await page.evaluateHandle(() => Date.now);
    await page.evaluate((at) => { Date.now = () => Date.parse(at) + 60_000; }, first.at);
    await page.waitForFunction((s) => document.querySelector(s)?.textContent === '1분 전', {}, time);
    await page.evaluate((now) => { Date.now = now; }, realNow);
    await realNow.dispose();
    await sleep(CHAT_COOLDOWN_MS);
    assert.equal((await other.request({ t: 'room.chat', text: 'second message' })).t, 'ok');
    await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, {}, time);
    assert.deepEqual(await page.$$eval('.chat__log .chat__line .chat__text', (lines) => lines.map((line) => line.textContent)), ['first message', 'second message']);

    const secondAt = await page.$$eval(time, (times) => times[1].getAttribute('datetime'));
    assert.notEqual(secondAt, first.at);
    assert.equal((await other.request({ t: 'room.ready', ready: true })).t, 'ok');
    await page.evaluate(async () => {
      const { net } = globalThis.__SP__;
      await net.request('room.addBot', {});
      await net.request('room.start', {});
    });
    await host.click('.gchat__btn');
    const matchLineTimes = '.chat--game .chat__log .chat__time';
    await page.waitForSelector(matchLineTimes);
    assert.deepEqual(await page.$$eval(matchLineTimes, (times) => times.map((el) => el.getAttribute('datetime'))), [first.at, secondAt]);
    await page.hover(matchLineTimes);
    await page.waitForSelector('.tooltip.is-shown');
    assert.equal(await page.$eval('.tooltip.is-shown', (el) => el.textContent), exact);
    await page.click(matchLineTimes);
    assert.equal(await page.$('.chat--game .chat__menu'), null);
    await page.evaluate(async () => {
      const { settingsStore } = await globalThis.__SP__.import('./ui/settings.js');
      settingsStore.set({ chatPinRecent: true });
    });
    await host.click('.gchat__btn');
    const pinnedTimes = '.gchat__pop.is-pinned .chat__time';
    await page.waitForSelector(pinnedTimes);
    assert.deepEqual(await page.$$eval(pinnedTimes, (times) => times.map((el) => el.getAttribute('datetime'))), [first.at, secondAt]);
    assert.equal(await page.$(`${pinnedTimes}[tabindex]`), null);
    const setAge = (at, age) => page.evaluate((iso, ms) => { Date.now = () => Date.parse(iso) + ms; }, at, age);
    await setAge(first.at, 30 * 60_000 - 1);
    await page.waitForFunction((s) => document.querySelector(s)?.textContent === '29분 전', {}, pinnedTimes);
    await setAge(first.at, 30 * 60_000);
    await page.waitForFunction((s, at) => {
      const times = [...document.querySelectorAll(s)];
      return times.length === 1 && times[0].getAttribute('datetime') === at;
    }, {}, pinnedTimes, secondAt);

    await host.click('.gchat__btn');
    const sent = await page.evaluate((at) => new Intl.DateTimeFormat('ko', {
      hour: 'numeric', minute: '2-digit',
    }).format(Date.parse(at)), first.at);
    await page.waitForFunction((s, label) => document.querySelector(s)?.textContent === label, {}, matchLineTimes, sent);
    await page.hover(matchLineTimes);
    await page.waitForSelector('.tooltip.is-shown');
    assert.equal(await page.$eval('.tooltip.is-shown', (el) => el.textContent), exact);
  } finally {
    other?.close?.();
    await host.close();
    await srv.stop();
  }
});

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
      await host.click('.ally-create__go', '创建同盟');
      const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      other = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      await other.hello('华法琳');
      assert.equal((await other.request({ t: 'room.join', code: room.code })).t, 'ok');
      await host.page.waitForSelector('.chat__log', { timeout: 10000 });
      const gap = () => host.page.evaluate(() => {
        const el = document.querySelector('.chat__log');
        return { gap: el.scrollHeight - el.scrollTop - el.clientHeight, n: el.querySelectorAll('.chat__line').length };
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

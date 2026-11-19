// Real-server browser E2E — spectator seats (community report #26, a remake feature: the official room has none). The
// lobby's 观战 takes a spectator seat; the room lists it under 观战席 (the host's ✕ frees one — that spectator is told
// room.closed {kicked}); the spectator's room view has 观战中 instead of the ready button; in the match it has no shop,
// no ready toggle, no emote wheel and reads 观战中 (never "你已被淘汰"), is shown the first player's board in 休整期 by
// itself and the first field in battle, never holds an m.private, sends nothing but g.watch (plus its own room.spectate /
// room.loadout), gets its seat back after a reload, and 离开观战 returns it to the lobby.
// A spectator's seat reservation: asked in the room or the match, taken on a restart vote or a match's end.
// An invitation link to a full room (maintainer decision 2026-11-14): the refused auto-join opens the 观战 offer
// (ui/inviteSpectate.js) with the room line, and taking it seats the page as a spectator with a reservation.
// Server side: test/lobby.test.js, test/match/spectator.test.js, test/match/lobby-integration.test.js,
// test/lobby-invite-spectate.test.js.
//
//   SP_E2E=1 node --test test/ui/spectator.e2e.test.js
//
// Screenshots: test/e2e/out/spectator-*.png.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client, ROOT, sleep, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';
import { TestClient } from '../helpers/wsClient.js';

const ENABLED = process.env.SP_E2E === '1' && hasChrome() && existsSync(path.join(ROOT, 'public/assets'));
const ALLOWED = new Set(['room.spectate', 'room.loadout', 'g.watch', 'g.leave', 'room.leave']);

/** Past the title; the offer to download the game's resources covers the room's bar buttons, so it is declined. */
const enter = async (c, name) => {
  await c.enter(name);
};

/** The spectator's own view of the store: still a spectator, never a private view. */
const specState = (c) => c.page.evaluate(() => {
  const s = globalThis.__SP__.store.get();
  return {
    spectating: !!s.room?.spectators?.some((x) => x.playerId === s.me.playerId),
    priv: s.match.private != null,
    battle: s.match.battle ? { watch: !!s.match.battle.watch, authoritative: !!s.match.battle.authoritative, fieldId: s.match.battle.fieldId } : null,
    field: s.match.field ? { fieldId: s.match.field.fieldId, prep: !!s.match.field.prep } : null,
  };
});

describe('spectator seats (community report #26, real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('观战 from the lobby → 观战席 in the room → the match: watching only, no private view, resume, 离开观战', { timeout: 6 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 1, combatSpeed: 4, startRound: 1, kit: 3, autoPlace: true } });
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'spectator' });
    const spec = new Client(P, srv.base, 'spec', { prefix: 'spectator', w: 1280, h: 720 });
    let extra = null;
    try {
      await host.open('?lang=zh');
      await enter(host, '凯尔希');
      await host.click('.mode-card', '同盟模拟');
      await host.click('.ally-create__go', '创建同盟');
      const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      await host.click('.seat--empty button', '添加 AI 队友');

      // the lobby's 观战 entry
      await spec.open('?lang=zh');
      await spec.hookRequests();
      await enter(spec, '阿米娅');
      await spec.click('.join-row input');
      await spec.page.keyboard.type(room.code);
      await spec.click('.join-row button', '观战');
      await spec.page.waitForSelector('.room-screen [data-testid="spectator-roster"]', { timeout: 10000 });
      const roomView = await spec.page.evaluate(() => ({
        bar: document.querySelector('.room-bar__right .rs-go')?.textContent || '',
        barDisabled: !!document.querySelector('.room-bar__right .rs-go')?.disabled,
        status: document.querySelector('.room-bar__status')?.textContent || '',
        seats: [...document.querySelectorAll('.seat__name')].map((e) => e.textContent),
      }));
      assert.match(roomView.bar, /入座/, 'two player seats are free');
      assert.equal(roomView.barDisabled, false);
      assert.match(roomView.status, /观战中/);
      assert.ok(!roomView.seats.includes('阿米娅'), 'never in a player seat');
      await spec.shot('room-spectator');

      // a second spectator (a bare socket) — the host's ✕ removes it: room.closed {kicked}
      extra = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      await extra.hello('华法琳');
      assert.equal((await extra.request({ t: 'room.spectate', code: room.code })).t, 'ok');
      await host.page.waitForFunction(() => /观战席2/.test(document.querySelector('.specbar__label')?.textContent || '') && !!(document.querySelector('[data-testid="spectator-roster"]')?.textContent || ''), { timeout: 8000 });
      await host.click('[data-testid="spectator-roster"]');
      await host.page.waitForFunction(() => document.querySelectorAll('.specbar__list .specbar__who').length === 2, { timeout: 8000 });
      await host.shot('room-host-specbar');
      await host.click('.specbar__who button[aria-label*="华法琳"]');
      assert.equal((await extra.waitFor('room.closed', () => true, 5000)).reason, 'kicked');
      await host.page.waitForFunction(() => document.querySelectorAll('.specbar__who').length === 1, { timeout: 8000 });

      // the match: a spectator is no player to wait for
      await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      for (const c of [host, spec]) await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
      await spec.page.waitForSelector('.brief__foot .btn--primary', { timeout: 30000 }); // (the phase comes before its screen)
      assert.match(await spec.page.evaluate(() => document.querySelector('.brief__foot .btn--primary')?.textContent || ''), /观战中/);
      await host.click('.brief__foot .btn--primary', '准备就绪');
      const t0 = Date.now();
      for (;;) {
        const s = await host.st();
        if (s.phase === 'PREP') break;
        assert.ok(Date.now() - t0 < 120000, `host stuck in ${s.phase}`);
        if (s.phase === 'DIY_CHOOSE' && !s.diyReady) await host.passDiyChoose(); // 3/3 确定自选编队
        if (s.phase === 'BAND_DRAFT' && s.draft?.turn === s.me) {
          await host.click('.dband:not(.is-taken)', null, { nth: 2, optional: true, timeout: 2000 });
          await sleep(200);
          await host.click('.draft-detail__btns .btn--primary', '确认选择', { optional: true, timeout: 2000 });
        }
        await sleep(300);
      }
      // 休整期: the first player's board by itself, read-only; no shop / ready / 交流
      await spec.waitFor((s) => s.phase === 'PREP', 'spectator in prep', 30000);
      await spec.page.waitForSelector('.gm__watching', { timeout: 10000 });
      await spec.page.waitForSelector('.gm__dead--spectator', { timeout: 10000 });
      const prep = await spec.page.evaluate(() => ({
        watching: document.querySelector('.gm__watching')?.textContent || '',
        back: [...document.querySelectorAll('.gm__watching button')].length,
        pill: document.querySelector('.gm__dead')?.textContent || '',
        shop: !!document.querySelector('.shopbar, .shopbar-tab'),
        ready: !!document.querySelector('.readybtn'),
        emote: !!document.querySelector('.ewheel'),
      }));
      assert.match(prep.watching, /凯尔希/, 'the host\'s board is shown');
      assert.equal(prep.back, 0, 'no 返回自己 — a spectator has no board');
      assert.match(prep.pill, /观战中/);
      assert.doesNotMatch(prep.pill, /淘汰/);
      assert.deepEqual([prep.shop, prep.ready, prep.emote], [false, false, false]);
      const sp1 = await specState(spec);
      assert.deepEqual([sp1.spectating, sp1.priv], [true, false]);
      assert.equal(sp1.field?.prep, true);
      await sleep(1200);
      await spec.shot('prep');

      // battle: the first field, a display replica (watch), never the authority
      await host.click('.readybtn', null, { timeout: 10000 });
      await spec.waitFor((s) => s.phase === 'COMBAT', 'combat', 60000);
      await spec.page.waitForFunction(() => !!globalThis.__SP__.store.get().match.battle?.watch, { timeout: 20000 });
      const sp2 = await specState(spec);
      assert.deepEqual([sp2.priv, sp2.battle.watch, sp2.battle.authoritative], [false, true, false]);
      // the auto-observed field reads "👁 name" (as for an eliminated player), with no 返回战场 — never "你已被淘汰"
      await spec.page.waitForSelector('.chud__observe, .chud .obinfo', { timeout: 10000 }); // (.obinfo: with the extracted art)
      const hud = await spec.page.evaluate(() => ({
        text: document.querySelector('.chud')?.textContent || '',
        back: !!document.querySelector('.team__back'),
        emote: !!document.querySelector('.ewheel'),
      }));
      assert.match(hud.text, /凯尔希/);
      assert.doesNotMatch(hud.text, /淘汰/);
      assert.deepEqual([hud.back, hud.emote], [false, false]);
      await sleep(1500);
      await spec.shot('battle');

      // a reload: the seat comes back with the match
      await spec.page.reload({ waitUntil: 'domcontentloaded' });
      await spec.page.waitForFunction(() => !!globalThis.__SP__ && !!globalThis.__SP__.store.get().match.public, { timeout: 30000 });
      const sp3 = await specState(spec);
      assert.deepEqual([sp3.spectating, sp3.priv], [true, false]);

      // 离开观战: back to the lobby, the match goes on
      await spec.click('.gtop__exit', null, { timeout: 15000 });
      await spec.click('.modal button', '离开观战');
      await spec.page.waitForSelector('.lobby-screen', { timeout: 10000 });
      await host.page.waitForFunction(() => (globalThis.__SP__.store.get().room?.spectators || []).length === 0, { timeout: 8000 });
      const sent = await spec.requests();
      assert.deepEqual([...new Set(sent.map((r) => r[0]))].filter((t) => !ALLOWED.has(t)), [], 'a spectator sends no player action');
      assert.deepEqual(problemsOf([host, spec]), []);
    } finally {
      await extra?.terminate().catch(() => {});
      for (const c of [host, spec]) await c.close();
      await srv.stop();
    }
  });

  // Seat reservation (server/lobby.js header, maintainer decision 2026-11-04; server side: test/lobby-seat-reserve.test.js).
  const SP = '[data-testid="seat-reserve"]';
  const reservedOf = (c) => c.page.evaluate(() => {
    const s = globalThis.__SP__.store.get();
    return s.room?.spectators?.find((x) => x.playerId === s.me.playerId)?.reserved ?? 0;
  });
  const seatedNow = (c) => c.page.evaluate(() => {
    const s = globalThis.__SP__.store.get();
    return !!s.room?.seats?.some((x) => x && x.playerId === s.me.playerId);
  });
  /** A full room: the host's page, a guest on a bare socket and two AI seats, the spectator's page in the 观战席. */
  const fullRoom = async (host, spec, srv) => {
    await host.open('?lang=zh');
    await enter(host, '凯尔希');
    await host.click('.mode-card', '同盟模拟');
    await host.click('.ally-create__go', '创建同盟');
    const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
    await host.click('.seat--empty button', '添加 AI 队友');
    await host.click('.seat--empty button', '添加 AI 队友');
    const guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    await guest.hello('华法琳');
    assert.equal((await guest.request({ t: 'room.join', code: room.code })).t, 'ok');
    assert.equal((await guest.request({ t: 'room.ready', ready: true })).t, 'ok');
    await spec.open('?lang=zh');
    await spec.hookRequests();
    await enter(spec, '阿米娅');
    await spec.click('.join-row input');
    await spec.page.keyboard.type(room.code);
    await spec.click('.join-row button', '观战');
    await spec.page.waitForSelector('.room-screen [data-testid="spectator-roster"]', { timeout: 10000 });
    return guest;
  };
  /** Through the briefing and the strategy draft to the first 休整期, for every page that plays. */
  const toPrep = async (players) => {
    for (const c of players) await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
    for (const c of players) await c.click('.brief__foot .btn--primary', '准备就绪');
    const t0 = Date.now();
    for (;;) {
      const all = await Promise.all(players.map((c) => c.st()));
      if (all.every((s) => s.phase === 'PREP')) return;
      assert.ok(Date.now() - t0 < 120000, `stuck in ${all.map((s) => s.phase).join(', ')}`);
      for (let i = 0; i < players.length; i++) {
        if (all[i].phase === 'DIY_CHOOSE' && !all[i].diyReady) await players[i].passDiyChoose(); // 3/3 确定自选编队
        if (all[i].phase !== 'BAND_DRAFT' || all[i].draft?.turn !== all[i].me) continue;
        await players[i].click('.dband:not(.is-taken)', null, { nth: i + 1, optional: true, timeout: 2000 });
        await sleep(200);
        await players[i].click('.draft-detail__btns .btn--primary', '确认选择', { optional: true, timeout: 2000 });
      }
      await sleep(300);
    }
  };

  test('reserve from the room and the match; a restart vote seats the spectator, who then plays', { timeout: 6 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 1, combatSpeed: 4, startRound: 1, kit: 3, autoPlace: true } });
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'seat-reserve' });
    const spec = new Client(P, srv.base, 'spec', { prefix: 'seat-reserve', w: 1280, h: 720 });
    let guest = null;
    try {
      guest = await fullRoom(host, spec, srv);
      // the host's seat count: only the host has the pick, the others read it in the strip
      await host.click('.specseats__btn');
      await host.click('.specseats__menu [data-seats="3"]');
      await host.page.waitForFunction(() => !document.querySelector('.specseats__menu'), { timeout: 8000 });
      await spec.page.waitForFunction(() => /\/3/.test(document.querySelector('.specbar__label')?.textContent || ''), { timeout: 8000 });
      assert.equal(await spec.page.evaluate(() => !!document.querySelector('.specseats')), false);
      // the room: no free seat, so the toggle stands where 入座 stands while one is free
      await spec.click(`.room-bar__right ${SP}`, '预约座位');
      await spec.page.waitForFunction(() => /已预约座位/.test(document.querySelector('.room-bar__status')?.textContent || ''), { timeout: 8000 });
      assert.equal(await reservedOf(spec), 1);
      await host.page.waitForSelector('.specbar__res', { timeout: 8000 });
      assert.match(await host.page.evaluate(() => document.querySelector('.specbar__res').textContent), /预约 1/);
      await spec.shot('room-reserved');
      await host.shot('room-host-sees');

      // the match: the guest leaves, its seat stays taken until the match ends
      await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await guest.waitFor('m.public', (p) => p.phase === 'INFO_CHECK', 30000);
      assert.equal((await guest.request({ t: 'room.leave' })).t, 'ok');
      await toPrep([host]);
      await spec.waitFor((s) => s.phase === 'PREP', 'spectator in prep', 30000);
      assert.equal(await seatedNow(spec), false);

      // the corner's toggle takes it back and asks again; the exit dialog has the same one (for the briefing and the draft)
      await spec.click(`.gm__corner ${SP}`, '取消预约');
      await spec.page.waitForFunction((sel) => document.querySelector(sel)?.textContent.includes('预约座位'), { timeout: 8000 }, `.gm__corner ${SP}`);
      assert.equal(await reservedOf(spec), 0);
      await spec.click('.gtop__exit', null, { timeout: 15000 });
      await spec.click(`.modal ${SP}`, '预约座位');
      await spec.page.waitForSelector('.modal [data-testid="seat-reserved"]', { timeout: 8000 });
      assert.equal(await reservedOf(spec), 1);
      await spec.shot('exit-modal-reserved');
      await spec.click('.modal button', '取消');
      await sleep(600);
      await spec.shot('prep-pill-reserved');

      // the host, alone among the voters, restarts: the spectator is in the new match
      await host.click('.gtop__exit', null, { timeout: 15000 });
      await host.click('[data-testid="restart-propose"]');
      await spec.page.waitForFunction(() => {
        const s = globalThis.__SP__.store.get();
        return s.room?.matchNo === 2 && s.room.seats.some((x) => x && x.playerId === s.me.playerId);
      }, { timeout: 20000 });
      assert.equal((await specState(spec)).spectating, false);
      await toPrep([host, spec]);
      await spec.page.waitForSelector('.readybtn', { timeout: 15000 });
      const played = await spec.page.evaluate(() => {
        const s = globalThis.__SP__.store.get();
        return { priv: !!s.match.private, pill: !!document.querySelector('.gm__dead'), shop: !!document.querySelector('.shopbar, .shopbar-tab'), toggle: !!document.querySelector('[data-testid="seat-reserve"]') };
      });
      assert.deepEqual(played, { priv: true, pill: false, shop: true, toggle: false });
      await sleep(1200);
      await spec.shot('playing-after-restart');
      assert.deepEqual(problemsOf([host, spec]), []);
    } finally {
      await guest?.terminate().catch(() => {});
      for (const c of [host, spec]) await c.close();
      await srv.stop();
    }
  });

  test('six spectators with the longest names keep the status line one line; 名单 opens them whole, the host\'s ✕ and 预约 n in view', { timeout: 3 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 1 } });
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'seat-reserve' });
    const socks = [];
    try {
      await host.open('?lang=zh');
      await enter(host, '凯尔希');
      await host.click('.mode-card', '同盟模拟');
      await host.click('.ally-create__go', '创建同盟');
      const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      for (let i = 0; i < 3; i++) await host.click('.seat--empty button', '添加 AI 队友');
      // the line with no spectator: its height, which six must not change (maintainer decision 2026-11-08: the names
      // in the line wrapped it onto three and pushed the seat cards up)
      const lineH = () => host.page.evaluate(() => document.querySelector('.rs-hint').getBoundingClientRect().height);
      const bare = await lineH();
      await host.click('.specseats__btn');
      await host.click('.specseats__menu [data-seats="6"]');
      await host.page.waitForFunction(() => globalThis.__SP__.store.get().room?.spectatorSeats === 6, { timeout: 8000 });
      for (let i = 0; i < 6; i++) {
        const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
        socks.push(c);
        await c.hello(`아주긴이름을가진박사님${i}`); // NAME_MAX_LEN characters, as wide as they come
        assert.equal((await c.request({ t: 'room.spectate', code: room.code })).t, 'ok');
        assert.equal((await c.request({ t: 'room.reserveSeat', on: true })).t, 'ok');
      }
      const R = '[data-testid="spectator-roster"]';
      await host.page.waitForFunction((R) => /观战席6/.test(document.querySelector('.specbar__label')?.textContent || '') && !!(document.querySelector(R)?.textContent || ''), { timeout: 8000 }, R);
      assert.ok(Math.abs((await lineH()) - bare) < 2, `the status line kept its height (${bare} px)`);
      // the desktop, then a real touch phone: its 交流 panel is wider, so the seats' column is narrower (css/chat.css)
      for (const vp of [{ width: 1920, height: 1080 }, { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: true },
        { width: 740, height: 360, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true }]) {
        await host.page.setViewport(vp);
        await host.page.waitForSelector(R, { timeout: 30000 });
        await sleep(800);
        const line = await host.page.evaluate(() => {
          const mid = (e) => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
          const parts = [...document.querySelectorAll('.rs-ready, .specbar__label, .specseats, .specroster, .ailast')];
          // the room chat's column (a short screen has the 聊天 button in the top bar instead): nothing of the strip under it
          const chatBox = document.querySelector('.room-screen.has-chat > .chat--room');
          const chat = chatBox ? chatBox.getBoundingClientRect() : null;
          const clear = !chat || [...document.querySelectorAll('.specbar__label, .specseats, .specroster')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= chat.right || r.top >= chat.bottom; });
          // a press lands on it: no neighbour's widened touch area lies over it (css/devices.css)
          const mine = (e) => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && (e === top || e.contains(top)); };
          return {
            spread: Math.max(...parts.map(mid)) - Math.min(...parts.map(mid)),
            clear, taken: [...document.querySelectorAll('.specseats__btn')].filter((e) => !mine(e)).length,
            inView: [...parts].every((e) => e.getBoundingClientRect().right <= innerWidth),
          };
        });
        assert.equal(line.clear, true, `${vp.width}: under the 交流 panel`);
        assert.equal(line.taken, 0, `${vp.width}: a neighbour takes the press`);
        assert.ok(line.spread < 8, `${vp.width}: the status line wrapped (${line.spread} px between its rows)`);
        assert.equal(line.inView, true, `${vp.width}`);
        await host.click(R);
        await host.page.waitForSelector('.specbar__list', { timeout: 8000 });
        const list = await host.page.evaluate(() => {
          const box = document.querySelector('.specbar__list');
          const r = box.getBoundingClientRect();
          const mine = (e) => { const q = e.getBoundingClientRect(); const top = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!top && (e === top || e.contains(top)); };
          return {
            inView: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && box.scrollHeight <= box.clientHeight + 1,
            whole: [...box.querySelectorAll('.specbar__name')].every((e) => e.scrollWidth <= e.clientWidth + 1),
            who: box.querySelectorAll('.specbar__who').length,
            marks: box.querySelectorAll('.specbar__res').length,
            removes: box.querySelectorAll('.specbar__who button').length,
            taken: [...box.querySelectorAll('.specbar__who button')].filter((e) => !mine(e)).length,
            title: box.querySelector('[title*="아주긴이름"]')?.title ?? null,
          };
        });
        assert.deepEqual([list.inView, list.whole, list.who, list.marks, list.removes, list.taken], [true, true, 6, 6, 6, 0], `${vp.width}`);
        assert.equal(list.title, '아주긴이름을가진박사님0', 'the whole name stays readable on hover');
        await host.page.keyboard.press('Escape');
        await host.page.waitForFunction(() => !document.querySelector('.specbar__list'), { timeout: 8000 });
      }
      assert.deepEqual(problemsOf([host]).filter((p) => !p.includes('net::ERR_ABORTED')), []); // (the phone's reload drops what was loading)
    } finally {
      for (const c of socks) await c.terminate().catch(() => {});
      await host.close();
      await srv.stop();
    }
  });

  test('a match that ends: the result screen first, then the seat in the room, not ready', { timeout: 6 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 0.25, combatSpeed: 8, startRound: 1, kit: 3, autoPlace: true, finishAfter: 1 } });
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'seat-reserve' });
    const spec = new Client(P, srv.base, 'spec', { prefix: 'seat-reserve', w: 1280, h: 720 });
    let guest = null;
    try {
      guest = await fullRoom(host, spec, srv);
      await spec.click(`.room-bar__right ${SP}`, '预约座位');
      await spec.page.waitForFunction(() => /已预约座位/.test(document.querySelector('.room-bar__status')?.textContent || ''), { timeout: 8000 });
      await host.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await guest.waitFor('m.public', (p) => p.phase === 'INFO_CHECK', 30000);
      assert.equal((await guest.request({ t: 'room.leave' })).t, 'ok');
      await toPrep([host]);
      await host.click('.readybtn', null, { timeout: 10000 });

      await spec.waitFor((s) => s.result, 'the result', 120000);
      await spec.page.waitForFunction(() => {
        const s = globalThis.__SP__.store.get();
        return !s.room?.inMatch && s.room?.seats.some((x) => x && x.playerId === s.me.playerId);
      }, { timeout: 20000 });
      // the result screen stays until the player moves on
      await spec.click('button', '返回同盟', { timeout: 60000 });
      await spec.page.waitForSelector('.room-screen', { timeout: 10000 });
      const view = await spec.page.evaluate(() => ({
        specbar: !!document.querySelector('[data-testid="spectator-roster"]'),
        seats: [...document.querySelectorAll('.seat__name')].map((e) => e.textContent),
        bar: document.querySelector('.room-bar__right .rs-go')?.textContent || '',
      }));
      assert.equal(view.specbar, false);
      assert.ok(view.seats.includes('阿米娅'), view.seats.join());
      assert.match(view.bar, /准备就绪/);
      await spec.shot('room-seated-after-end');
      // the host waits for the new player's ready, like any seated Doctor's
      await host.click('button', '返回同盟', { timeout: 60000 });
      await host.page.waitForSelector('.room-screen', { timeout: 10000 });
      assert.equal(await host.page.evaluate(() => [...document.querySelectorAll('.room-bar__right .rs-go')].some((b) => b.textContent.includes('开始模拟') && b.disabled)), true);
      // (at a quarter of the timers the screens change while their images still load: those are dropped, not faults)
      assert.deepEqual(problemsOf([host, spec]).filter((p) => !p.includes('net::ERR_ABORTED')), []);
    } finally {
      await guest?.terminate().catch(() => {});
      for (const c of [host, spec]) await c.close();
      await srv.stop();
    }
  });
  test('invitation link to a full room: the offer, its room line, a spectator seat with a reservation', { timeout: 3 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 1 } });
    const P = (await import('puppeteer-core')).default;
    const host = new Client(P, srv.base, 'host', { prefix: 'invite-spectate' });
    const inv = new Client(P, srv.base, 'invited', { prefix: 'invite-spectate', w: 1280, h: 720 });
    let guest = null;
    try {
      await host.open('?lang=zh');
      await enter(host, '凯尔希');
      await host.click('.mode-card', '同盟模拟');
      await host.click('.ally-create__go', '创建同盟');
      const room = (await host.waitFor((s) => !!s.room?.code, 'room created')).room;
      await host.click('.seat--empty button', '添加 AI 队友');
      await host.click('.seat--empty button', '添加 AI 队友');
      guest = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      await guest.hello('华法琳');
      assert.equal((await guest.request({ t: 'room.join', code: room.code })).t, 'ok');

      await inv.open(`?lang=zh&room=${room.code}`);
      await inv.hookRequests();
      await enter(inv, '阿米娅');
      await inv.page.waitForSelector('[data-testid="invite-spectate"]', { timeout: 15000 });
      const shown = await inv.page.evaluate(() => ({
        title: document.querySelector('.invite-spec')?.closest('.modal__box')?.textContent || document.querySelector('.modal__box')?.textContent || '',
        line: document.querySelector('.invite-spec__room')?.textContent || '',
        keep: document.querySelector('.invite-spec__keep input')?.checked ?? null,
      }));
      assert.match(shown.title, /房间已满/);
      assert.equal(shown.line, `${room.code}博士 4/4 · 等待室 · 观战席 0/2`);
      assert.equal(shown.keep, true, '自动入座 on by default');
      assert.deepEqual((await inv.toasts()).filter((x) => /房间已满/.test(x)), [], 'no error toast instead');
      await inv.shot('offer');
      // the heavy bucket emptied first (the invitation's season switch spends most of it): the RATE reply is sent again
      await inv.page.evaluate(() => Promise.all(Array.from({ length: 8 }, () => globalThis.__SP__.net.request('room.card', { charId: '' }).catch(() => {}))));
      await inv.click('[data-testid="invite-spectate"]');
      await inv.page.waitForSelector('.room-screen [data-testid="spectator-roster"]', { timeout: 10000 });
      await inv.page.waitForFunction(() => /已预约座位/.test(document.querySelector('.room-bar__status')?.textContent || ''), { timeout: 8000 });
      assert.equal(await reservedOf(inv), 1);
      assert.deepEqual((await inv.requests()).map((r) => r[0]).filter((t) => /^room\.(join|spectate|reserveSeat)$/.test(t)), ['room.join', 'room.spectate', 'room.spectate', 'room.reserveSeat'], 'refused once (RATE), then seated');
      assert.equal(await inv.exists('[data-testid="invite-spectate"]'), false, 'the offer is gone');
      await inv.shot('seated');
      assert.deepEqual(problemsOf([host, inv]), []);
    } finally {
      await guest?.terminate().catch(() => {});
      for (const c of [host, inv]) await c.close();
      await srv.stop();
    }
  });
});

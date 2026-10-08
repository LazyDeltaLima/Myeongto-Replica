// Real-server browser E2E of 0.2.0 自选编队 end to end (research 0.2.0 §2; the owner's decisions of 2026-10-05): the
// 自选编队 tab of the 干员调配 overlay fills the first tier-5 slot with 赤刃明霄陈 (real clicks: the slot, the operator,
// S3, the AFT-X module, 确认; persisted in localStorage; room.diy → session → seat → the next match's m.private.diy); the
// picker lists our five only (shared/local-diy.js: no prototype); in the match the 调度中心 is at level 5 and the shop
// sells the slot as 赤刃明霄陈 (no 「自选」 badge or tag since the user's decision of 2026-10-08); bought, the hand piece draws her model;
// deployed, the detail card shows 赤刃明霄陈 with the pick's skill; and in the browser's own battle (client-side combat)
// the unit is the operator — the b.start spec carries the pick (`diy`), the local sim fields char_1050_chen3 with her
// operator kit, and the battle view draws her Spine model.
//
//   SP_E2E=1 node --test test/ui/diy.e2e.test.js
//
// The server is test/e2e/fastServer.mjs with its starter-kit hooks (no starter operators, the 调度中心 at level 5 —
// SP_START_LEVEL —, the tier-5 DIY slot in the first shop slot, 20 funds); everything else is the real match engine and
// the real UI driven by real mouse input. Screenshots: test/e2e/out/diy-*.png.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Client, ROOT, sleep, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';

const ENABLED = process.env.SP_E2E === '1' && hasChrome() && existsSync(path.join(ROOT, 'public/assets'));
const SLOT = 'chess_char_5_diy1_a';
const CHEN3 = 'char_1050_chen3';
const PICK = { charId: CHEN3, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' };
const LOCAL_FIVE = ['char_2027_wang', 'char_1050_chen3', 'char_1035_wisdel', 'char_4182_oblvns', 'char_4132_ascln'];

describe('0.2.0 自选编队 — a slotted operator in the own shop and battle (real server)', { skip: !ENABLED && 'set SP_E2E=1 (Chrome + public/assets)' }, () => {
  test('自选编队: slot 赤刃明霄陈 → level-5 shop card (自选) → buy → deploy → the local battle fields 赤刃明霄陈', { timeout: 6 * 60 * 1000 }, async () => {
    const srv = await startRealServer({ fast: { timerScale: 0.5, combatSpeed: 2, startRound: 1, kit: 0, level: 5, shop: [SLOT] } });
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'diy', { prefix: 'diy' });
    try {
      await c.open();
      await c.enter('自选');
      // 1) 干员调配 → 自选编队: fill the first tier-5 slot (real clicks), synced with the server, persisted in the browser
      await c.click('.lobby-screen [data-testid="loadout-open"]');
      await c.page.waitForSelector('.lo .lo-tab[data-tab="diy"]', { visible: true, timeout: 15000 });
      await c.click('.lo .lo-tab[data-tab="diy"]');
      await c.page.waitForSelector(`.diy-slot[data-slot="${SLOT}"] .diy-slot__fill`, { visible: true, timeout: 15000 });
      const slots = await c.page.evaluate(() => [...document.querySelectorAll('.diy-slot')].map((el) => el.dataset.slot));
      assert.deepEqual(slots, ['chess_char_5_diy1_a', 'chess_char_5_diy2_a', 'chess_char_6_diy1_a', 'chess_char_6_diy2_a']);
      await c.shot('tab');
      await c.click(`.diy-slot[data-slot="${SLOT}"] .diy-slot__fill`);
      await c.page.waitForSelector(`[data-testid="diy-picker"] .diy-opt[data-char="${CHEN3}"]`, { visible: true, timeout: 8000 });
      const listed = await c.page.evaluate(() => [...document.querySelectorAll('[data-testid="diy-picker"] .diy-opt')].map((el) => el.dataset.char));
      assert.deepEqual([...listed].sort(), [...LOCAL_FIVE].sort(), 'our five, no prototype');
      await c.click(`[data-testid="diy-picker"] .diy-opt[data-char="${CHEN3}"]`);
      await c.page.waitForSelector('[data-testid="diy-picker"] .diy-choice[data-skill="2"]', { visible: true, timeout: 5000 });
      await c.click('[data-testid="diy-picker"] .diy-choice[data-skill="2"]');
      await c.click('[data-testid="diy-picker"] .diy-choice[data-module="uniequip_002_chen3"]');
      await c.shot('picker');
      await c.click('[data-testid="diy-confirm"]');
      await c.page.waitForFunction((slot, id) => document.querySelector(`.diy-slot[data-slot="${slot}"]`)?.dataset.char === id, { timeout: 4000 }, SLOT, CHEN3);
      await c.page.waitForFunction(() => /已同步/.test(document.querySelector('[data-testid="diy-sync"]')?.textContent || ''), { timeout: 8000 });
      const card = await c.page.evaluate((slot) => document.querySelector(`.diy-slot[data-slot="${slot}"]`)?.textContent || '', SLOT);
      assert.ok(card.includes('赤刃明霄陈') && card.includes('已持有') && card.includes('AFT-X'), card);
      const stored = await c.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.diy') || 'null'));
      assert.deepEqual(stored, { v: 1, picks: { [SLOT]: PICK } });
      await c.shot('slotted');
      await c.page.keyboard.press('Escape');
      await c.page.waitForFunction(() => !document.querySelector('.lo'), { timeout: 3000 });

      // 2) a solo 标准 match: the briefing's m.private carries the picks
      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '标准模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
      const diy = await c.page.evaluate(() => globalThis.__SP__.store.get().match.private?.diy ?? null);
      assert.deepEqual(diy, { [SLOT]: PICK }, 'the match received the picks');
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 30000);
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.waitFor((s) => s.phase === 'PREP' && !s.ready && s.funds >= 4 && s.level >= 5, 'prep at 调度中心 level 5', 60000);
      await sleep(1800); // camera flight

      // 3) the shop card at level 5: 赤刃明霄陈, no 「自选」 badge (only this player's shop sells it); two taps buy it
      await c.page.waitForFunction(() => [...document.querySelectorAll('.scard .scard__name')].some((n) => n.textContent === '赤刃明霄陈'), { timeout: 10000 });
      const shopCard = await c.page.evaluate(() => {
        const el = [...document.querySelectorAll('.scard')].find((x) => x.querySelector('.scard__name')?.textContent === '赤刃明霄陈');
        return el ? { name: el.querySelector('.scard__name')?.textContent, badge: el.querySelector('.scard__diy')?.textContent ?? null, bonds: el.querySelector('.scard__bonds')?.textContent } : null;
      });
      assert.deepEqual([shopCard?.name, shopCard?.badge], ['赤刃明霄陈', null]);
      assert.ok(shopCard.bonds.includes('炎'), `derived bond: ${shopCard.bonds}`);
      const level = await c.page.evaluate(() => globalThis.__SP__.store.get().match.private?.shop?.level);
      assert.ok(level >= 5, 'sold from 调度中心 level 5');
      await c.shot('shop');
      await c.click('.scard', '赤刃明霄陈');
      await sleep(300);
      await c.click('.scard', '赤刃明霄陈');
      await c.waitFor((s) => s.hand > 0, 'bought', 8000);
      await sleep(900);
      const [piece] = (await c.handPieces('chess')).filter((p) => p.id === SLOT);
      assert.ok(piece, 'the slot\'s piece is in the hand');
      await sleep(600);
      assert.equal(await c.page.evaluate((uid) => !!document.querySelector(`.sitag[data-uid="${uid}"]`), piece.uid), false, 'no 「自选」 tag under the piece');
      const handModel = await c.page.evaluate((uid) => globalThis.__SP_VIEW__?.raw?.debug?.views?.get(`p:${uid}`)?.info?.spine ?? null, piece.uid);
      assert.equal(handModel, CHEN3, 'the hand draws the operator');
      await c.shot('hand');

      // 4) deploy it (drag → direction wheel); the detail card shows 赤刃明霄陈 with the pick's skill and the 「自选」 tag
      const tile = await c.freeTileFor(piece.uid);
      assert.ok(tile, 'a legal tile');
      await c.drag(await c.piecePoint(piece.uid), await c.tilePoint(tile.row, tile.col));
      await c.page.waitForSelector('.fwheel__dia', { timeout: 4000 });
      await c.swipe('RIGHT');
      await c.waitFor((s) => s.board > 0, 'placed', 8000);
      await sleep(600);
      let detail = null;
      for (const at of [0.72, 0.4, 0.88]) {
        const p = await c.piecePoint(piece.uid, at);
        if (!p) continue;
        await c.page.mouse.click(p.x, p.y, { button: 'right' });
        detail = await c.page.waitForSelector('.dpanel .dtag-diy', { timeout: 2500 }).then(() => c.page.evaluate(() => ({
          tag: document.querySelector('.dpanel .dtag-diy')?.textContent || '',
          name: document.querySelector('.dpanel .dhead__name')?.textContent || '',
          skill: document.querySelector('.dpanel .dskill')?.dataset.skill || '',
        })), () => null);
        if (detail) break;
      }
      assert.ok(detail, 'the detail card opens for the deployed piece');
      assert.deepEqual(detail, { tag: '自选', name: '赤刃明霄陈', skill: 'skchr_chen3_3' });
      await c.shot('board');
      await c.page.keyboard.press('Escape');

      // 5) ready → the local battle fields 赤刃明霄陈 (the spec's diy pick; the sim's def and kit; the view's Spine model)
      await c.click('.readybtn');
      await c.waitFor((s) => s.phase === 'COMBAT', 'combat', 60000);
      const got = await c.page.waitForFunction((uid) => {
        const r = globalThis.__SP_RUNNER__;
        const e = r && [...r._entries.values()].find((x) => x.own && x.battle);
        if (!e) return false;
        const u = e.battle.allyUnits.find((x) => x.uid === uid);
        if (!u) return false;
        const views = globalThis.__SP_VIEW__?.raw?.debug?.views;
        const v = views ? [...views.values()].find((x) => x.info?.uid === uid && !String(x.id).startsWith('p:')) : null;
        if (!v || !v.spineReady) return false;
        const entry = (e.spec.players || []).flatMap((p) => p.units || []).find((x) => x.uid === uid) || null;
        return {
          authoritative: e.authoritative, spec: entry && { chessId: entry.chessId, diy: entry.diy ?? null, skillIndex: entry.skillIndex ?? null },
          charId: u.def?.charId, diyFor: u.def?.diyFor, skill: u.skill?.id ?? null, bonds: u.def?.bonds, generic: !!u.kit?.generic,
          viewSpine: v.info.spine, viewDiy: v.info.diy?.charId ?? null, model: String(v._actorEntry?.skel || ''),
        };
      }, { timeout: 30000, polling: 150 }, piece.uid).then((h) => h.jsonValue());
      assert.equal(got.authoritative, true, 'the own normal battle is simulated by this browser');
      assert.deepEqual(got.spec, { chessId: SLOT, diy: PICK, skillIndex: null }, 'b.start spec carries the pick');
      assert.equal(got.charId, CHEN3, 'the local sim fields 赤刃明霄陈');
      assert.equal(got.diyFor, SLOT);
      assert.equal(got.skill, 'skchr_chen3_3', 'with the picked S3');
      assert.deepEqual(got.bonds, ['yanShip']);
      assert.equal(got.generic, false, 'its operator kit');
      assert.equal(got.viewSpine, CHEN3);
      assert.equal(got.viewDiy, CHEN3, 'the view knows the pick');
      assert.match(got.model, /char_1050_chen3/, 'the battle view draws 赤刃明霄陈\'s Spine model');
      await sleep(800);
      await c.shot('combat');
      await c.waitFor((s) => (s.phase === 'PREP' && s.round >= 2) || !!s.result, 'next prep', 180000);
      assert.deepEqual(problemsOf([c]), []);
    } finally {
      if (c.problems.length) console.log(c.problems.slice(0, 20).join('\n'));
      await c.close();
      await srv.stop();
    }
  });
});

// Real-server browser E2E of 0.2.0 自选编队 end to end (research 0.2.0 §2; the owner's decisions of 2026-10-05): the
// 自选编队 tab of the 干员调配 overlay fills the first tier-5 slot with 赤刃明霄陈 (real clicks: the slot, the operator,
// S3, the AFT-X module, 确认; persisted in localStorage; room.diy → session → seat → the next match's m.private.diy); the
// picker lists our picks only (shared/local-diy.js: no prototype); in the match the 调度中心 is at level 5 and the shop
// sells the slot as 赤刃明霄陈 (no 「自选」 badge or tag since the maintainer's decision of 2026-10-08); bought, the hand piece draws her model;
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
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Client, ROOT, sleep, hasChrome, startRealServer, problemsOf } from '../e2e/client.mjs';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';

// 盟约's picks (the season the Client opens in): LOCAL_DIY_PICKS less 盟约's own chess (shared/local-diy.js; tools/build-data.mjs)
const SEASON_PICKS = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8')).diy.ownedPool;
import { readChessCard } from '../e2e/browser.mjs';

const UI_ENABLED = process.env.SP_E2E === '1' && hasChrome();
const ENABLED = UI_ENABLED && existsSync(path.join(ROOT, 'public/assets'));
const SLOT = 'chess_char_5_diy1_a';
const CHEN3 = 'char_1050_chen3';
const ASCLN = 'char_4132_ascln'; // 阿斯卡纶: two advanced modules, legal in the 5阶 and 6阶 slots
const PICK = { charId: CHEN3, skillIndex: 2, uniEquipId: 'uniequip_002_chen3' };

/**
 * A point inside the picker row `sel` where the row itself is what `elementFromPoint` hits (after upstream 0.3.3's test: a
 * row carries quick choices, so its centre would land on one). Null when the row is all controls; the caller then clicks
 * `.diy-opt__pick`.
 */
const rowPoint = (page, sel) => page.evaluate((selector) => {
  const row = document.querySelector(selector);
  if (!row) return null;
  const r = row.getBoundingClientRect();
  for (let y = Math.round(r.top) + 1; y < r.bottom - 1; y += 2) {
    for (let x = Math.round(r.left) + 1; x < r.right - 1; x += 2) {
      const el = document.elementFromPoint(x, y);
      if (el && row.contains(el) && !el.closest('button, select, .lo-quick, .lo-select')) return { x, y };
    }
  }
  return null;
}, sel);
/** Select the operator of the picker row `sel` (its own area when it has one, else its identity button). */
const pickRow = async (c, sel) => {
  // the operator may sit below the fold of the picker's own list
  await c.page.$eval(sel, (e) => e.scrollIntoView({ block: 'nearest' })).catch(() => {});
  const pt = await rowPoint(c.page, sel);
  if (pt) await c.page.mouse.click(pt.x, pt.y);
  else await c.click(`${sel} .diy-opt__pick`);
};

describe('自选编队 tier picker: several at once, edits stay with the operator (real server, no art needed)', { skip: !UI_ENABLED && 'set SP_E2E=1 (and have Chrome)' }, () => {
  for (const slot of [SLOT, 'chess_char_6_diy1_a']) {
    test(`${slot}: a second tap takes an operator out and its edits come back with it; cancel, confirm and reload keep their semantics`, { timeout: 90000 }, async () => {
      const srv = await startRealServer();
      const P = (await import('puppeteer-core')).default;
      const c = new Client(P, srv.base, 'diy-reselect', { prefix: `diy-reselect-${slot}`, w: 1280, h: 720 });
      const picker = '[data-testid="diy-picker"]';
      const operator = `${picker} .diy-opt[data-char="${ASCLN}"]`;
      const saved = () => c.page.evaluate((id) => JSON.parse(localStorage.getItem('sp.pref.diy') || 'null')?.picks?.[id] ?? null, slot);
      const choices = () => c.page.evaluate((selector) => {
        const el = document.querySelector(selector);
        return { skill: el?.querySelector('.diy-pick__detail [data-skill][aria-checked="true"]')?.dataset.skill,
          module: el?.querySelector('.diy-pick__detail [data-module][aria-checked="true"]')?.dataset.module };
      }, picker);
      const chosen = () => c.page.evaluate((sel) => [...document.querySelectorAll(`${sel} .diy-opt.is-on`)].map((r) => [r.dataset.char, r.querySelector('.diy-opt__idx')?.textContent]), picker);
      const edited = { charId: ASCLN, skillIndex: 0, uniEquipId: null };
      const changed = { charId: ASCLN, skillIndex: 1, uniEquipId: 'uniequip_003_ascln' };
      const open = async () => {
        await c.click(`.diy-slot[data-slot="${slot}"] :is(.diy-slot__fill, .dccard)`);
        await c.page.waitForSelector(picker, { visible: true, timeout: 8000 });
      };
      const confirm = async (expected) => {
        await c.click('[data-testid="diy-confirm"]');
        await c.page.waitForSelector(picker, { hidden: true, timeout: 3000 });
        assert.deepEqual(await saved(), expected);
      };
      try {
        await c.open();
        await c.enter('自选配置回归');
        await c.click('.lobby-screen [data-testid="loadout-open"]');
        await c.click('.lo .lo-tab[data-tab="diy"]');
        await open();
        await pickRow(c, operator);
        assert.deepEqual(await chosen(), [[ASCLN, '1']], 'a tap puts it in the choice, numbered');
        await c.click(`${picker} .diy-pick__detail [data-skill="0"]`);
        await c.click(`${picker} .diy-pick__detail [data-module="none"]`);
        await c.shot('empty-edited');
        await pickRow(c, operator);
        assert.deepEqual(await chosen(), [], 'a second tap takes it out');
        await pickRow(c, operator);
        await c.shot('empty-reselected');
        assert.deepEqual(await choices(), { skill: '0', module: 'none' }, 'its edits come back with it');
        // Search the current operator out, then back in (no 原型 / 已持有 filter since 2026-10-07)
        await c.click(`${picker} .lo-search input`);
        await c.page.keyboard.type('no matching operator');
        assert.equal(await c.page.$(operator), null);
        await c.page.evaluate((sel) => { const el = document.querySelector(sel); el.select(); }, `${picker} .lo-search input`);
        await c.page.keyboard.type('阿斯卡纶');
        assert.deepEqual(await chosen(), [[ASCLN, '1']]);
        assert.deepEqual(await choices(), { skill: '0', module: 'none' });
        await confirm(edited);
        await c.shot('empty-saved');
        // edits then 取消: the saved pick stays
        await open();
        await c.click(`${picker} .diy-pick__detail [data-skill="1"]`);
        await c.click(`${picker} .diy-pick__detail [data-module="uniequip_003_ascln"]`);
        assert.deepEqual(await choices(), { skill: '1', module: 'uniequip_003_ascln' });
        await c.shot('saved-edited');
        await c.click(`${picker} .diy-pick__foot button`, '取消');
        await c.page.waitForSelector(picker, { hidden: true, timeout: 3000 });
        assert.deepEqual(await saved(), edited, 'cancel leaves the saved pick unchanged');
        await open();
        assert.deepEqual(await choices(), { skill: '0', module: 'none' });
        await c.click(`${picker} .diy-pick__detail [data-skill="1"]`);
        await c.click(`${picker} .diy-pick__detail [data-module="uniequip_003_ascln"]`);
        await confirm(changed);
        await c.page.reload({ waitUntil: 'domcontentloaded' });
        await c.page.waitForSelector('.lobby-screen', { timeout: 20000 });
        await c.click('.lobby-screen [data-testid="loadout-open"]');
        await c.click('.lo .lo-tab[data-tab="diy"]');
        await open();
        assert.deepEqual(await choices(), { skill: '1', module: 'uniequip_003_ascln' });
        assert.deepEqual(await saved(), changed, 'confirm persists the current pick across reload');
        await c.shot('reload');
        assert.deepEqual(c.problems.filter((p) => p.startsWith('pageerror:')), []);
      } finally {
        console.log(JSON.stringify({ slot, problems: problemsOf([c]) }));
        await c.close();
        await srv.stop();
      }
    });
  }
});

// GitHub #284 (idea from PR #286): Esc in the picker cancels only the picker, like its 取消, also from its search
// field — the 干员调配 overlay and its twelve slots stay, and the saved picks do not change; the next Esc closes the overlay
describe('自选编队 picker: Esc closes only the picker (real server, no art needed)', { skip: !UI_ENABLED && 'set SP_E2E=1 (and have Chrome)' }, () => {
  test('5阶 / 6阶 slots: Esc cancels the picker, the overlay stays; a second Esc closes the overlay', { timeout: 90000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'diy-esc', { prefix: 'diy-esc' });
    const picker = '[data-testid="diy-picker"]';
    const saved = () => c.page.evaluate(() => localStorage.getItem('sp.pref.diy'));
    try {
      await c.open();
      await c.enter('自选取消');
      await c.click('.lobby-screen [data-testid="loadout-open"]');
      await c.page.waitForSelector('.lo .lo-tab[data-tab="diy"]', { visible: true, timeout: 15000 });
      await c.click('.lo .lo-tab[data-tab="diy"]');
      const before = await saved();
      for (const [slot, search] of [[SLOT, false], ['chess_char_6_diy1_a', true]]) {
        await c.page.waitForSelector(`.diy-slot[data-slot="${slot}"] .diy-slot__fill`, { visible: true, timeout: 15000 });
        await c.click(`.diy-slot[data-slot="${slot}"] .diy-slot__fill`);
        await c.page.waitForSelector(picker, { visible: true, timeout: 8000 });
        if (search) {
          await c.click(`${picker} .lo-search input`);
          await c.page.keyboard.type('推进');
        }
        await c.page.keyboard.press('Escape');
        await c.page.waitForSelector(picker, { hidden: true, timeout: 3000 });
        assert.ok(await c.page.$('.lo'), `${slot}: Esc keeps the 干员调配 overlay${search ? ' (from the search field)' : ''}`);
        assert.equal((await c.page.$$('.diy-slot')).length, 12, `${slot}: the twelve slots stay`);
      }
      // an Esc pressed the moment the picker appears — before the next animation frame — closes it too: its listener comes
      // with the picker's own commit (a plain effect attached it a frame later and the overlay skipped the key: the
      // picker stayed open — the 0.2.2 full browser pass)
      const opened = await c.page.evaluate(async (slot, sel) => {
        document.querySelector(`.diy-slot[data-slot="${slot}"] .diy-slot__fill`).click();
        for (let k = 0; k < 50 && !document.querySelector(sel); k++) await Promise.resolve();
        const open = !!document.querySelector(sel);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        return open;
      }, SLOT, picker);
      assert.ok(opened, 'the picker opened');
      await c.page.waitForSelector(picker, { hidden: true, timeout: 3000 });
      assert.ok(await c.page.$('.lo'), 'an immediate Esc keeps the 干员调配 overlay');
      assert.equal(await saved(), before, 'cancelling a picker does not change the saved picks');
      await c.page.keyboard.press('Escape');
      await c.page.waitForFunction(() => !document.querySelector('.lo'), { timeout: 3000 });
      assert.deepEqual(c.problems.filter((p) => p.startsWith('pageerror:')), []);
    } finally {
      await c.close();
      await srv.stop();
    }
  });
});

describe('自选编队 picker on a phone: the detail\'s own 取消 / 确认 (real server, no art needed)', { skip: !UI_ENABLED && 'set SP_E2E=1 (and have Chrome)' }, () => {
  test('取消 puts back the skill, module, 潜能 and 练度 changed in the detail; 确认 keeps them; neither confirms the lineup', { timeout: 90000 }, async () => {
    const srv = await startRealServer();
    const P = (await import('puppeteer-core')).default;
    const c = new Client(P, srv.base, 'diy-phone-detail', { prefix: 'diy-phone-detail', w: 844, h: 390 });
    const picker = '[data-testid="diy-picker"]';
    const det = `${picker} .diy-pick__main.is-detail`;
    const state = () => c.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      const on = (q) => el?.querySelector(`.diy-pick__detail ${q}[aria-checked="true"]`);
      const row = el?.querySelector('.diy-opt[data-char="char_4132_ascln"]');
      return { skill: on('[data-skill]')?.dataset.skill, module: on('[data-module]')?.dataset.module,
        potential: on('[data-potential]')?.dataset.potential, cultivate: on('[data-cultivate]')?.dataset.cultivate,
        rowPotential: row?.querySelector('select[data-cult="potential"]')?.value };
    }, picker);
    const openDetail = async () => {
      await c.page.$eval(`${picker} .diy-opt[data-char="${ASCLN}"]`, (e) => e.scrollIntoView({ block: 'nearest' }));
      await c.click(`${picker} .diy-opt[data-char="${ASCLN}"] .diy-opt__det`);
      await c.page.waitForSelector(det, { timeout: 3000 });
    };
    try {
      await c.open();
      await c.enter('自选手机详情');
      await c.click('.lobby-screen [data-testid="loadout-open"]');
      await c.click('.lo .lo-tab[data-tab="diy"]');
      await c.click(`.diy-slot[data-slot="${SLOT}"] :is(.diy-slot__fill, .dccard)`);
      await c.page.waitForSelector(picker, { visible: true, timeout: 8000 });
      await openDetail();
      const before = await state();
      assert.equal(await c.page.$(`${picker} [data-testid="diy-confirm"]`), null, 'the detail has its own footer');
      await c.click(`${det} .diy-pick__detail [data-skill="0"]`);
      await c.click(`${det} .diy-pick__detail [data-module="none"]`);
      await c.click(`${det} .diy-pick__detail [data-potential="3"]`);
      await c.click(`${det} .diy-pick__detail [data-cultivate="1"]`);
      const changed = await state();
      assert.deepEqual([changed.skill, changed.module, changed.potential, changed.cultivate], ['0', 'none', '3', '1']);
      assert.notDeepEqual([before.skill, before.module, before.potential, before.cultivate], ['0', 'none', '3', '1']);
      await c.shot('changed');
      await c.click('[data-testid="diy-detail-cancel"]');
      await c.page.waitForSelector(det, { hidden: true, timeout: 3000 });
      assert.ok(await c.page.$(`${picker} [data-testid="diy-confirm"]`), '取消 returns to the list, the picker stays open');
      assert.equal((await state()).rowPotential, before.potential, 'the row shows the 潜能 put back');
      await openDetail();
      const { rowPotential: _a, ...undone } = await state();
      const { rowPotential: _b, ...was } = before;
      assert.deepEqual(undone, was, '取消 put back the skill, module, 潜能 and 练度');
      // 确认 keeps the change and returns to the list without confirming the lineup
      await c.click(`${det} .diy-pick__detail [data-potential="3"]`);
      await c.click('[data-testid="diy-detail-ok"]');
      await c.page.waitForSelector(det, { hidden: true, timeout: 3000 });
      assert.ok(await c.page.$(`${picker} [data-testid="diy-confirm"]`), '确认 returns to the list, the picker stays open');
      assert.equal((await state()).rowPotential, '3', '确认 keeps the 潜能');
      assert.equal(await c.page.evaluate(() => localStorage.getItem('sp.pref.diy')), null, 'no lineup saved');
      assert.deepEqual(c.problems.filter((p) => p.startsWith('pageerror:')), []);
    } finally {
      console.log(JSON.stringify({ problems: problemsOf([c]) }));
      await c.close();
      await srv.stop();
    }
  });
});

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
      // six a tier (盟约 too since maintainer decision 2026-11-19; docs/rules/diy.md 「규정 선발 편성 12칸과 선발 편성 확정 단계」)
      assert.deepEqual(slots, [5, 6].flatMap((tier) => [1, 2, 3, 4, 5, 6].map((k) => `chess_char_${tier}_diy${k}_a`)));
      await c.shot('tab');
      await c.click(`.diy-slot[data-slot="${SLOT}"] .diy-slot__fill`);
      await c.page.waitForSelector(`[data-testid="diy-picker"] .diy-opt[data-char="${CHEN3}"]`, { visible: true, timeout: 8000 });
      const listed = await c.page.evaluate(() => [...document.querySelectorAll('[data-testid="diy-picker"] .diy-opt')].map((el) => el.dataset.char));
      assert.ok(SEASON_PICKS.length > 0 && SEASON_PICKS.every((id) => LOCAL_DIY_PICKS.includes(id)), '盟约\'s picks are ours');
      assert.deepEqual([...listed].sort(), [...SEASON_PICKS].sort(), 'our picks, no prototype');
      await pickRow(c, `[data-testid="diy-picker"] .diy-opt[data-char="${CHEN3}"]`);
      await c.page.waitForSelector('[data-testid="diy-picker"] .lo-skill[data-skill="2"]', { visible: true, timeout: 5000 });
      await c.click('[data-testid="diy-picker"] .lo-skill[data-skill="2"]');
      await c.click('[data-testid="diy-picker"] .lo-mod[data-module="uniequip_002_chen3"]');
      await c.shot('picker');
      await c.click('[data-testid="diy-confirm"]');
      await c.page.waitForFunction((slot, id) => document.querySelector(`.diy-slot[data-slot="${slot}"]`)?.dataset.char === id, { timeout: 4000 }, SLOT, CHEN3);
      await c.page.waitForFunction(() => /已同步/.test(document.querySelector('[data-testid="diy-sync"]')?.textContent || ''), { timeout: 8000 });
      const card = await c.page.evaluate((slot) => document.querySelector(`.diy-slot[data-slot="${slot}"] .dccard__name`)?.textContent || '', SLOT);
      assert.equal(card, '赤刃明霄陈', 'the slot draws the operator\'s card');
      const stored = await c.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.diy') || 'null'));
      assert.deepEqual(stored, { v: 1, picks: { [SLOT]: PICK } });
      await c.shot('slotted');
      await c.page.keyboard.press('Escape');
      await c.page.waitForFunction(() => !document.querySelector('.lo'), { timeout: 3000 });

      // 2) a solo 标准 match: the briefing's m.private carries the picks as the match's lineup, 3/3 确定自选编队 fields them
      await c.click('.mode-card', '独立模拟');
      await c.click('.diff-card', '标准模拟');
      await c.click('.create-box button', '开始独立模拟');
      await c.waitFor((s) => !!s.room, 'solo room');
      if (!(await c.st()).phase) await c.click('.room-bar__right button', '开始模拟', { timeout: 20000 });
      await c.waitFor((s) => s.phase === 'INFO_CHECK', 'briefing', 30000);
      const lineup = await c.page.evaluate(() => globalThis.__SP__.store.get().match.private?.diyChoose?.lineup ?? null);
      assert.deepEqual(lineup, { [SLOT]: PICK }, 'the match received the picks');
      await c.click('.brief__foot .btn--primary', '准备就绪');
      await c.waitFor((s) => s.phase === 'BAND_DRAFT', 'band draft', 30000);
      await c.click('.dband', null, { nth: 1 });
      await c.click('.draft-detail__btns .btn--primary', '确认选择');
      await c.passDiyChoose();
      await c.waitFor((s) => s.phase === 'PREP' && !s.ready && s.funds >= 4 && s.level >= 5, 'prep at 调度中心 level 5', 60000);
      const fielded = await c.page.evaluate(() => globalThis.__SP__.store.get().match.private?.diy ?? null);
      assert.deepEqual(fielded, { [SLOT]: PICK }, 'chosen at 确定自选编队: the match fields the pick');
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
        detail = await readChessCard(c.page);
        if (detail) break;
      }
      assert.ok(detail, 'the detail card opens for the deployed piece');
      assert.deepEqual([detail.name, detail.skillId], ['赤刃明霄陈', 'skchr_chen3_3']);
      if (!detail.official) assert.equal(detail.diyTag, '自选');
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

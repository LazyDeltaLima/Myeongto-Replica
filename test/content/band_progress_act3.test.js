// 规程's strategy panel beyond the active 指令 (server/match/match/bandSkill.js bandSkillView / _bandPassiveView, content/
// bands/progress.js): a strategy without an active stage still has a view (its passive portrait), a value_target stage
// sends the progress its handler counts — driven here by real buys, refreshes and sales, so a renamed counter in
// content/bands/meta.js fails — a locked stage its unlock progress, and a strategy that switches a bond's direction
// names that bond (docs/rules/ui.md 「규정 액티브 전략」 패시브).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { TAG_KEYS } from '../../server/sim/content/bands/progress.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/** A 规程 match in PREP R1 holding `band`, its own handlers, an empty board. */
function setup({ band, funds = 60, seed = 7 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  return { h, m, ps, view: () => ps.privateView().bandSkill };
}

const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy);
const ofBond = (bond) => { const c = visible.find((x) => (x.bonds || []).includes(bond) && x.tier <= 2); assert.ok(c, `a ${bond} chess`); return c.chessId; };
const card = (m, id) => ({ kind: 'chess', id, basePrice: m.gd.chessPrice(id), frozen: false, sold: false });
/** Put `id` in the first operator slot of the shop and buy it. */
function buyOne(m, ps, id) {
  const i = ps._shopKinds().indexOf('chess');
  ps.shop.slots[i] = card(m, id);
  assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: i }), OK);
  const p = ps.hand.find((x) => x && x.id === id);
  if (p) ps.hand[ps.hand.indexOf(p)] = null; // keep the hand free (no merge)
}

test('a strategy without an active stage: a passive view (never usable), no progress; g.bandSkill still refused', () => {
  const { m, view } = setup({ band: 'band_amiya' });
  const v = view();
  assert.equal(v.type, 'PASSIVE');
  assert.equal(v.usable, false);
  assert.equal(v.blocked, 'passive');
  assert.equal(v.target, null);
  assert.equal(v.tag, null);
  assert.equal(v.unlock, null);
  assert.deepEqual(v.bondSwaps, {});
  assert.deepEqual(m.handle('p_0', { t: 'g.bandSkill' }), { error: 'BAD_TARGET', detail: 'no active band skill' });
});

test('洛洛 自发制造: the 维多利亚 chess bought toward the next item, x/3, back to 0 at the third', () => {
  const { m, ps, view } = setup({ band: 'band_victoria' });
  const id = ofBond('victoriaShip');
  assert.equal(view().showTag, 'value_target');
  assert.deepEqual(view().tag, { value: 0, target: 3 });
  buyOne(m, ps, id);
  buyOne(m, ps, id);
  assert.deepEqual(view().tag, { value: 2, target: 3 });
  buyOne(m, ps, id);
  assert.deepEqual(view().tag, { value: 0, target: 3 });
});

test('娜仁图亚 沙洲梦魇: the 萨尔贡 chess gained toward the discount, x/3', () => {
  const { m, ps, view } = setup({ band: 'band_sargon' });
  buyOne(m, ps, ofBond('sargonShip'));
  buyOne(m, ps, ofBond('sargonShip'));
  assert.deepEqual(view().tag, { value: 2, target: 3 });
});

test('玛恩纳 业务指标: this round\'s funds, x/3, capped; a new round starts at 0', () => {
  const { m, ps, view } = setup({ band: 'band_mlynar' });
  const id = ofBond('kazimierzShip');
  for (let k = 0; k < 4; k++) buyOne(m, ps, id);
  assert.deepEqual(view().tag, { value: 3, target: 3 }, 'at most 3 a round');
  m.round += 1;
  assert.deepEqual(view().tag, { value: 0, target: 3 });
});

test('裁度 / 贾维: manual refreshes — this round\'s first (x/1), every fourth (x/4)', () => {
  const a = setup({ band: 'band_siracusa' });
  assert.deepEqual(a.view().tag, { value: 0, target: 1 });
  assert.deepEqual(a.m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.deepEqual(a.view().tag, { value: 1, target: 1 });
  const b = setup({ band: 'band_bond' });
  for (let k = 0; k < 3; k++) assert.deepEqual(b.m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.deepEqual(b.view().tag, { value: 3, target: 4 });
  assert.deepEqual(b.m.handle('p_0', { t: 'g.refresh' }), OK);
  assert.deepEqual(b.view().tag, { value: 0, target: 4 });
});

test('休露丝 雪域礼赠 (no 「{@tag}」 in its text): this round\'s first 谢拉格 buy, x/1', () => {
  const { m, ps, view } = setup({ band: 'band_kjerag' });
  assert.deepEqual(view().tag, { value: 0, target: 1 });
  buyOne(m, ps, ofBond('kjeragShip'));
  assert.deepEqual(view().tag, { value: 1, target: 1 });
});

test('巫恋 替身娃娃: this round\'s swapped sale, x/1', () => {
  const { m, ps, view } = setup({ band: 'band_substitute' });
  const id = visible.find((c) => c.tier === 1).chessId;
  const p = give(m, ps, id, 'hand');
  assert.deepEqual(m.handle('p_0', { t: 'g.sell', uid: p.uid }), OK);
  assert.deepEqual(view().tag, { value: 1, target: 1 });
});

test('琳琅诗怀雅 (locked, 消耗资金达到60时解锁): the unlock progress is the funds spent; the active stage counts toward 120', () => {
  const { m, ps, view } = setup({ band: 'band_rich', funds: 200 });
  assert.equal(view().type, 'NONE');
  assert.deepEqual(view().unlock, { value: 0, target: 60 });
  const id = visible.find((c) => c.tier === 2).chessId;
  buyOne(m, ps, id);
  const spent = ps.stats.gold;
  assert.ok(spent > 0);
  assert.deepEqual(view().unlock, { value: spent, target: 60 });
  ps.stats.gold = 70;
  buyOne(m, ps, id); // a payment moves the stage on
  assert.equal(view().type, 'ACTIVE');
  assert.deepEqual(view().unlock, { value: ps.stats.gold, target: 120 });
});

test('a stage table value_target stage has a counted key or a next to count toward', () => {
  let n = 0;
  for (const [id, b] of Object.entries(ACT3.bands)) {
    for (const st of b.skills || []) {
      if (st.showTag !== 'value_target') continue;
      n++;
      const keyed = (st.buffs || []).some((x) => TAG_KEYS.includes(x.key));
      assert.ok(keyed || st.next, `${id} ${st.effectId}: no progress to show`);
    }
  }
  assert.ok(n >= 10, `the season's value_target stages were walked (${n})`);
});

test('a strategy that switches a bond\'s direction names it (written directions only)', () => {
  assert.deepEqual(setup({ band: 'band_sargon' }).view().bondSwaps, { sargonShip: 'bondeffect_sargon' });
  assert.deepEqual(setup({ band: 'band_kazimier' }).view().bondSwaps, { kazimierzShip: 'bondeffect_kazimierz' });
  assert.deepEqual(setup({ band: 'band_amiya' }).view().bondSwaps, {});
});

test('the default season (no stage table): no strategy panel', () => {
  const h = makeMatch({ mode: 'solo', humans: 1, seed: 7, fake: true }).start();
  h.toPrep(1, { band: 'band_amiya' });
  assert.equal(h.ps('p_0').privateView().bandSkill, null);
});

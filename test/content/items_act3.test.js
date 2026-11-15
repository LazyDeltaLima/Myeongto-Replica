// 卫戍协议：规程's equipment on the prep side (data/seasons/act3autochess/items.json, chess.json): 组合 (canFuse / fuseWith /
// fuseResult — PlayerState._fuseItem), the operators' equipment slots (equipSlotNum → equipSlots, gamedata equipSlotsOf),
// the consume-on-equip items research 04 has no entry for, the new prep keys of server/sim/content/items/meta.js and
// 精巧设计's passive (bands/meta.js promote_equip_extra_award) — the default season left as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, giveItem, legalTileFor, DATA } from '../match/harness.js';
import { registryFor } from '../../server/match/effectsMeta.js';
import { collectViolations } from '../../server/match/invariants.js';
import { coverageOf } from '../../tools/season-coverage.mjs';
import { equipReplaces } from '../../public/js/ui/gameLogic/placement.js';

const OK = { ok: true };
const REG = registryFor(ACT3_ON_BASE_FIELD);

const SPEAR = 'chess_item_6_01_e_a'; // 天马之枪
const HELM = 'chess_item_5_05_e_a'; // 天马之盔
const GLORY = 'chess_item_6_12_e_a'; // 天马之耀
const HAMMER = 'chess_item_1_01_e_a'; // 维式重锤 (merges into its 进阶 copy)
const ACRBOT = 'chess_char_5_22_a'; // 机械 acrbot (4 slots, elite 6)

function setup({ band = null, seed = 41 } = {}) {
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: REG, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
  ps.funds = 50; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.counters = {};
  ps.bandId = band;
  ps.recompute();
  return { h, m, ps };
}
const owned = (ps) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item').map((p) => p.id);
const visibleChess = (f) => Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && f(c)).map((c) => c.chessId).sort();
const noViolations = (m) => assert.deepEqual(collectViolations(m), []);
/** Put chess `id` on a free legal tile of the board. */
const place = (m, ps, id) => {
  const skip = new Set([...ps.board.keys()]);
  return give(m, ps, id, 'board', legalTileFor(m, ps, id, skip));
};

// ---------------------------------------------------------------------------------------------------------------
// data

test('规程 items.json: the five 组合 pairs both ways, 机械\'s 4 / 6 slots, 装备时销毁 items without a research entry consumed on equip', () => {
  const pairs = Object.values(ACT3.items).filter((r) => r.fuseWith);
  assert.equal(pairs.length, 10);
  for (const r of pairs) {
    const o = ACT3.items[r.fuseWith];
    assert.equal(o.fuseWith, r.id, `${r.id}: the partner names it back`);
    assert.equal(o.fuseResult, r.fuseResult);
    assert.ok(ACT3.items[r.fuseResult], r.fuseResult);
  }
  assert.equal(new Set(pairs.map((r) => r.fuseResult)).size, 5);
  assert.equal(ACT3.items[SPEAR].fuseResult, GLORY);
  assert.deepEqual([ACT3.chess[ACRBOT].equipSlots, ACT3.chess.chess_char_5_22_b.equipSlots], [4, 6]);
  assert.equal(Object.values(ACT3.chess).filter((c) => c.equipSlots === 2).length, 308);
  // 定期存折 / 一次性促销券 / 投机骰子 / 人事部记录 / 驮兽储蓄罐: trapDuration 0, 「装备时销毁」
  for (const id of ['chess_item_3_15_e_a', 'chess_item_4_15_e_a', 'chess_item_4_15_e_b', 'chess_item_5_06_e_a', 'chess_item_5_09_e_a', 'chess_item_3_11_e_a']) {
    assert.equal(ACT3.items[id].kind, 'consume_on_equip', id);
  }
  assert.equal(ACT3.items.chess_item_2_08_e_a.kind, null, '卫戍推荐信 is worn');
  for (const r of Object.values(DATA.items)) assert.ok(r.fuseWith === null && r.fuseResult === null, r.id);
  for (const c of Object.values(DATA.chess)) assert.equal(c.equipSlots, null, c.chessId);
});

test('coverage: every prep item key of 规程 is handled (投机骰子\'s 指令 swap: band_skill_change_act3.test.js)', () => {
  const rows = coverageOf('act3autochess').items.filter((r) => r.side === 'prep' && r.status !== 'ok');
  assert.deepEqual(rows.map((r) => r.key), []);
});

// ---------------------------------------------------------------------------------------------------------------
// 组合

test('组合: gaining the second part turns the pair into the result in the hand, a worn part comes off', () => {
  const { m, ps } = setup();
  giveItem(m, ps, SPEAR);
  ps.acquireItem(HELM, { source: 'buy' });
  assert.deepEqual(owned(ps), [GLORY]);
  noViolations(m);
  // one part worn by an operator: it comes off, the result goes to the hand
  const { m: m2, ps: ps2 } = setup();
  const op = place(m2, ps2, visibleChess((c) => c.tier === 1)[0]);
  const spear = giveItem(m2, ps2, SPEAR);
  assert.deepEqual(m2.handle('p_0', { t: 'g.equip', itemUid: spear.uid, targetUid: op.uid }), OK);
  assert.deepEqual(op.items.map((x) => x.id), [SPEAR]);
  ps2.acquireItem(HELM, { source: 'buy' });
  assert.deepEqual(op.items, []);
  assert.deepEqual(owned(ps2), [GLORY]);
  noViolations(m2);
});

test('组合: a part granted as the prep ends waits beside its partner and fuses when the next prep checks', () => {
  const { m, ps } = setup();
  giveItem(m, ps, HELM);
  ps.acquireItem(SPEAR, { source: 'effect', deferMerge: true });
  assert.deepEqual(owned(ps).sort(), [SPEAR, HELM].sort());
  noViolations(m);
  for (const p of [...ps.hand, ...ps.temp]) if (p) delete p.deferMerge; // 规程: items wait in the 装备区 (temp)
  ps.checkItemMerges();
  assert.deepEqual(owned(ps), [GLORY]);
});

test('组合: a part alone, or two of one part, never fuses', () => {
  const { m, ps } = setup();
  ps.acquireItem(SPEAR, { source: 'buy' });
  ps.acquireItem(SPEAR, { source: 'buy' });
  assert.deepEqual(owned(ps), [SPEAR, SPEAR]);
  noViolations(m);
});

// ---------------------------------------------------------------------------------------------------------------
// equipment slots

test('机械 carries 4 items (the 5th replaces), an ordinary operator 2', () => {
  const { m, ps } = setup();
  const bot = place(m, ps, ACRBOT);
  const other = place(m, ps, visibleChess((c) => c.tier === 1)[0]);
  const plain = Object.values(ACT3.items).filter((r) => r.itemType === 'EQUIP' && !r.isGolden && !r.kind && !r.fuseWith && !r.canGiveBond && r.tier <= 3).map((r) => r.id);
  const wear = (who, id) => { const it = giveItem(m, ps, id); return m.handle('p_0', { t: 'g.equip', itemUid: it.uid, targetUid: who.uid }); };
  for (let i = 0; i < 4; i++) assert.deepEqual(wear(bot, plain[i]), OK);
  assert.equal(bot.items.length, 4);
  assert.deepEqual(wear(bot, plain[4]), OK);
  assert.deepEqual(bot.items.map((x) => x.id), plain.slice(1, 5), 'the oldest replaced');
  for (let i = 5; i < 8; i++) assert.deepEqual(wear(other, plain[i]), OK);
  assert.deepEqual(other.items.map((x) => x.id), plain.slice(6, 8));
  noViolations(m);
});

test('the client asks which item to replace only once the carrier\'s own slots are used (机械 4, others 2)', () => {
  const plain = Object.values(ACT3.items).filter((r) => r.itemType === 'EQUIP' && !r.isGolden && !r.kind && r.mergeable).map((r) => r.id);
  const worn = (n) => plain.slice(1, 1 + n).map((id, i) => ({ uid: 20 + i, kind: 'item', id }));
  const item = { uid: 9, kind: 'item', id: plain[0] };
  const ctx = { pieces: new Map([[9, { piece: item }]]), getChess: (id) => ACT3.chess[id] || null, getItem: (id) => ACT3.items[id] || null };
  const bot = (n) => ({ uid: 1, kind: 'chess', id: ACRBOT, items: worn(n) });
  const other = (n) => ({ uid: 2, kind: 'chess', id: 'chess_char_1_01_a', items: worn(n) });
  assert.equal(equipReplaces(ctx, 9, bot(2)), false);
  assert.equal(equipReplaces(ctx, 9, bot(3)), false);
  assert.equal(equipReplaces(ctx, 9, bot(4)), true);
  assert.equal(equipReplaces(ctx, 9, other(2)), true);
});

// ---------------------------------------------------------------------------------------------------------------
// the new prep keys

test('简易通讯机 / 寻呼模块: an operator of the target\'s FIRST bond, not of its other ones', () => {
  const two = visibleChess((c) => c.bonds.length >= 2 && c.tier <= 2);
  assert.ok(two.length, 'an operator with two bonds');
  for (const seed of [1, 2, 3, 4, 5]) {
    const { m, ps } = setup({ seed });
    // (规程's core-bond ban takes every operator of a drawn-off core bond out: a target whose first bond this match keeps)
    const off = new Set([...m.disabledBonds, ...m.staticInactiveBonds]);
    const target = two.find((id) => !off.has(ACT3.chess[id].bonds[0]) && !m.bannedChess.includes(id));
    assert.ok(target, `seed ${seed}: an operator with two bonds whose first bond is not off`);
    const [first, second] = ACT3.chess[target].bonds;
    ps.shop.level = 6;
    const op = place(m, ps, target);
    const radio = giveItem(m, ps, 'chess_item_2_06_e_a');
    const before = new Set([...ps.hand].filter(Boolean).map((p) => p.uid));
    assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: radio.uid, targetUid: op.uid }), OK);
    const got = [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess' && !before.has(p.uid));
    assert.equal(got.length, 1);
    assert.ok(ACT3.chess[got[0].id].bonds.includes(first), `${got[0].id} has ${first}`);
    const pager = giveItem(m, ps, 'chess_item_4_01_e_a');
    assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: pager.uid, targetUid: op.uid }), OK);
    const offer = ps.offers.at(-1);
    assert.ok(offer && offer.slots.length >= 1 && offer.slots.length <= 3);
    for (const s of offer.slots) assert.ok(ACT3.chess[s.id].bonds.includes(first), `${s.id}: ${first}, not only ${second}`);
    assert.equal(new Set(offer.slots.map((s) => s.id)).size, offer.slots.length);
    assert.deepEqual(op.items, [], 'both consumed');
  }
});

test('简易通讯机 (规程) with no operator of the first bond at tier ≤ the shop level: the target operator itself, the 进阶 copy two — “暴躁铁皮” at level 2 (协防干员 lowest tier 3)', () => {
  for (const seed of [1, 2, 3]) {
    const { m, ps } = setup({ seed });
    ps.shop.level = 2;
    const bot = place(m, ps, ACRBOT);
    const radio = giveItem(m, ps, 'chess_item_2_06_e_a');
    const before = new Set([...ps.hand, ...ps.temp].filter(Boolean).map((p) => p.uid));
    assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: radio.uid, targetUid: bot.uid }), OK);
    const got = [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess' && !before.has(p.uid)).map((p) => p.id);
    assert.deepEqual(got, [ACRBOT], `seed ${seed}: one more “暴躁铁皮”`);
    assert.equal(ps.find(radio.uid), null, 'consumed');
    // the 进阶 copy (count 2): itself twice — a merge of three may make an elite of them, so count the 暴躁铁皮 owned
    const own = () => [...ps.board.values(), ...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess' && m.gd.baseIdOf(p.id) === ACRBOT)
      .reduce((n, p) => n + (p.golden || p.id !== ACRBOT ? 3 : 1), 0);
    const had = own();
    const radio2 = giveItem(m, ps, 'chess_item_2_06_e_b');
    assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: radio2.uid, targetUid: bot.uid }), OK);
    assert.equal(own(), had + 2, `seed ${seed}: two more “暴躁铁皮” from the 进阶 copy`);
    assert.equal(ps.find(radio2.uid), null, 'consumed');
    noViolations(m);
  }
  // a candidate there: the draw, never the fallback (a tier ≤ 2 operator of a first bond that has one)
  const low = visibleChess((c) => c.tier === 1 && c.bonds.length >= 1)[0];
  const { m, ps } = setup({ seed: 4 });
  ps.shop.level = 2;
  const op = place(m, ps, low);
  const radio = giveItem(m, ps, 'chess_item_2_06_e_a');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: radio.uid, targetUid: op.uid }), OK);
  const got = [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess' && p.uid !== op.uid);
  assert.equal(got.length, 1);
  assert.ok(ACT3.chess[got[0].id].bonds.includes(ACT3.chess[low].bonds[0]) && ACT3.chess[got[0].id].tier <= 2);
});

test('拟态物质 (规程): with fewer than 2 copies owned, an operator of the target\'s tier', () => {
  for (const seed of [1, 2, 3]) {
    const { m, ps } = setup({ seed });
    const t3 = visibleChess((c) => c.tier === 3)[0];
    const op = place(m, ps, t3);
    const it = giveItem(m, ps, 'chess_item_5_03_e_a');
    assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: it.uid, targetUid: op.uid }), OK);
    const got = [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'chess');
    assert.equal(got.length, 1);
    assert.equal(m.gd.tierOf(got[0].id), 3);
  }
});

test('定期存折: the funds grow by 1 a round while owned, paid when it is put on', () => {
  const { m, ps } = setup();
  const op = place(m, ps, visibleChess((c) => c.tier === 1)[0]);
  const book = giveItem(m, ps, 'chess_item_3_15_e_a');
  book.boughtRound = m.round;
  m.round += 3;
  const f0 = ps.funds;
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: book.uid, targetUid: op.uid }), OK);
  assert.equal(ps.funds - f0, 3);
  assert.deepEqual(op.items, [], 'consumed');
});

test('一次性促销券: three different items ≤ the 调度中心 level, one free pick; its 进阶 copy two picks of three', () => {
  const { m, ps } = setup({ seed: 3 });
  ps.shop.level = 3;
  const op = place(m, ps, visibleChess((c) => c.tier === 1)[0]);
  const a = giveItem(m, ps, 'chess_item_4_15_e_a');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: a.uid, targetUid: op.uid }), OK);
  assert.equal(ps.offers.length, 1);
  const ids = ps.offers[0].slots.map((s) => s.id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.ok(m.gd.item(id).tier <= 3, id);
  ps.offers.length = 0;
  const b = giveItem(m, ps, 'chess_item_4_15_e_b');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: b.uid, targetUid: op.uid }), OK);
  assert.deepEqual(ps.offers.map((o) => o.slots.length), [3, 3]);
  assert.equal(new Set(ps.offers.flatMap((o) => o.slots.map((s) => s.id))).size, 6);
});

test('人事部记录: a special refresh of every shop position — operators of the target\'s first bond where the pool has them, no operator twice, the equipment positions drawn again too, sold and frozen ones included', () => {
  const { m, ps } = setup({ seed: 4 });
  ps.shop.level = 6;
  const target = visibleChess((c) => c.bonds.length >= 1 && c.tier === 1)[0];
  const bond = ACT3.chess[target].bonds[0];
  const op = place(m, ps, target);
  const kinds = ps._shopKinds().slice();
  const itemAt = kinds.indexOf('item');
  const chessAt = kinds.indexOf('chess');
  assert.ok(itemAt >= 0 && chessAt >= 0, 'the shop has both kinds');
  // one item card bought, the shop frozen: the special refresh still draws every position (upstream 6efc0628)
  ps.shop.slots[itemAt].sold = true;
  ps.shop.frozen = true;
  for (const s of ps.shop.slots) if (s && !s.sold) s.frozen = true;
  const before = ps.shop.slots.map((s) => s && { ...s });
  const it = giveItem(m, ps, 'chess_item_5_09_e_a');
  const f0 = ps.funds;
  const refreshes = ps.round.refreshes;
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: it.uid, targetUid: op.uid }), OK);
  assert.deepEqual(ps._shopKinds(), kinds, 'each position keeps its kind');
  const chess = ps.shop.slots.filter((s) => s && s.kind === 'chess');
  assert.equal(chess.length, kinds.filter((k) => k === 'chess').length);
  for (const s of chess) assert.ok(ACT3.chess[s.id].bonds.includes(bond), `${s.id} has ${bond}`);
  assert.equal(new Set(chess.map((s) => s.id)).size, chess.length, 'no operator twice');
  const items = ps.shop.slots.filter((s) => s && s.kind === 'item');
  assert.equal(items.length, kinds.filter((k) => k === 'item').length, 'every equipment position holds a card');
  assert.equal(ps.shop.slots[itemAt].sold, false, 'the bought equipment position is drawn again');
  assert.ok(ps.shop.slots.some((s, i) => s.kind === 'item' && before[i] && s !== before[i] && (s.id !== before[i].id || before[i].sold)), 'an equipment card changed');
  for (const s of ps.shop.slots) if (s) assert.equal(s.frozen, true, 'the freeze stays');
  assert.equal(ps.funds, f0, 'free');
  assert.equal(ps.round.refreshes, refreshes, 'not a 主动刷新');
  noViolations(m);
});

test('卫戍推荐信: at the prep\'s end +1 layer to each ACTIVE bond of the carrier (+2 for the 进阶 copy)', () => {
  const { m, ps } = setup();
  const bond = 'ursusShip';
  const ursus = visibleChess((c) => c.bonds.includes(bond));
  const need = m.gd.bond(bond).thresholds[0];
  const pieces = ursus.slice(0, need).map((id) => place(m, ps, id));
  ps.recompute();
  assert.ok(ps.bonds[bond]?.active, 'the bond is active');
  const letter = giveItem(m, ps, 'chess_item_2_08_e_b');
  assert.deepEqual(m.handle('p_0', { t: 'g.equip', itemUid: letter.uid, targetUid: pieces[0].uid }), OK);
  const l0 = ps.layers[bond] || 0;
  m.dispatch(ps, 'onPrepEnd', { round: m.round });
  assert.equal((ps.layers[bond] || 0) - l0, 2);
  // an inactive bond gains nothing
  const { m: m2, ps: ps2 } = setup();
  const lone = place(m2, ps2, ursus[0]);
  const l2 = giveItem(m2, ps2, 'chess_item_2_08_e_a');
  assert.deepEqual(m2.handle('p_0', { t: 'g.equip', itemUid: l2.uid, targetUid: lone.uid }), OK);
  m2.dispatch(ps2, 'onPrepEnd', { round: m2.round });
  assert.equal(ps2.layers[bond] || 0, 0);
});

// ---------------------------------------------------------------------------------------------------------------
// 精巧设计

test('精巧设计 (规程): the round\'s first 进阶 merge of an item offers 3 items up to one tier above the 调度中心, the second none', () => {
  const { m, ps } = setup({ band: 'band_equipment', seed: 7 });
  ps.shop.level = 2;
  ps.acquireItem(HAMMER, { source: 'buy' });
  ps.acquireItem(HAMMER, { source: 'buy' });
  assert.ok(owned(ps).includes(ACT3.items[HAMMER].upgradeChessId), 'merged');
  assert.equal(ps.offers.length, 1);
  const ids = ps.offers[0].slots.map((s) => s.id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.ok(m.gd.item(id).tier <= 3, `${id} ≤ III`);
  ps.acquireItem(HAMMER, { source: 'buy' });
  ps.acquireItem(HAMMER, { source: 'buy' });
  assert.equal(ps.offers.length, 1, 'once a round');
  m.round += 1;
  const shield = 'chess_item_1_02_e_a'; // 坚守盾牌 (the hammer's stock may be out by now)
  ps.acquireItem(shield, { source: 'buy' });
  ps.acquireItem(shield, { source: 'buy' });
  assert.equal(ps.offers.length, 2, 'a new round');
  // a 组合 is no 合并进阶
  const { ps: ps2 } = setup({ band: 'band_equipment', seed: 7 });
  ps2.acquireItem(SPEAR, { source: 'buy' });
  ps2.acquireItem(HELM, { source: 'buy' });
  assert.equal(ps2.offers.length, 0);
});

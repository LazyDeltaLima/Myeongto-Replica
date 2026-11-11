// 规程's drag 指令 (「拖拽使用」, content/bands/meta.js) on an operator of the player or on an operator card of the shop:
// each strategy's own handler through g.bandSkill and the real registry — what the use does to the operator, the shop,
// the bonds and the funds. The gate, the target check and the limits are band_skill_act3.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, giveItem, legalTileFor } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/** A 规程 match in PREP R1 holding `band`, its own handlers. @param {{ band: string, funds?: number, seed?: number }} o */
function setup({ band, funds = 30, seed = 7 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const h = makeMatch({ mode: 'solo', humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  for (const l of [...ps.board.keys()]) ps.board.delete(l);
  ps.hand.fill(null); ps.temp.fill(null);
  ps.recompute();
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  return { h, m, ps, use, view: () => ps.privateView().bandSkill };
}

const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy);
const tierOf = (id) => ACT3.chess[id].tier;
const bondsOf = (id) => ACT3.chess[id].bonds || [];
const owned = (ps) => [...ps.hand, ...ps.temp, ...ps.board.values()].filter((p) => p && p.kind === 'chess');
const ownedIds = (ps) => owned(ps).map((p) => p.id);
const onBoard = (m, ps, id) => { const at = legalTileFor(m, ps, id); assert.ok(at, `a tile for ${id}`); return give(m, ps, id, 'board', at); };
const prepEnd = (m, ps) => m.dispatch(ps, 'onPrepEnd', { round: m.round });
/** Make `bond` active by its count bonus (no operators needed). */
const activate = (ps, bond) => { ps.bondCountBonus[bond] = 20; ps.recompute(); assert.ok(ps.bonds[bond]?.active, `${bond} active`); };
const firstOf = (pred) => { const c = visible.find(pred); assert.ok(c, 'a chess of the test'); return c.chessId; };
const card = (m, id) => ({ kind: 'chess', id, basePrice: m.gd.chessPrice(id), frozen: false, sold: false });
const chessSlot = (ps) => ps._shopKinds().indexOf('chess');

test('黑白相易 (望): the operator is removed — no sale, its copy back — and a 炎 operator of tier ≤ its tier is gained; cost 1', () => {
  const { m, ps, use } = setup({ band: 'band_yan2' });
  const id = firstOf((c) => c.tier === 3 && !bondsOf(c.chessId).includes('yanShip'));
  const p = give(m, ps, id, 'hand');
  const left = m.pool.left(m.gd.baseIdOf(id));
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(ps.find(p.uid), null, 'removed');
  assert.equal(m.pool.left(m.gd.baseIdOf(id)), left + 1, 'its copy returns');
  const got = owned(ps);
  assert.equal(got.length, 1);
  assert.ok(bondsOf(got[0].id).includes('yanShip'), '炎');
  assert.ok(tierOf(got[0].id) <= 3, 'tier ≤ 3');
  assert.equal(ps.funds, 29, 'cost 1, no sale price');
  assert.equal(ps.stats.sells, 0, 'no sale');
});

test('出航时刻 (引星棘刺): an operator card becomes a 伊比利亚 one of tier ≤ the card\'s, its freeze kept; 纸片替身 (风丸): the same tier, another operator', () => {
  const a = setup({ band: 'band_iberia' });
  a.ps.counters['band:stage'] = 1; // 【伊比利亚】 4 counted: the active stage
  assert.equal(a.view().type, 'ACTIVE');
  const i = chessSlot(a.ps);
  const id = firstOf((c) => c.tier === 3 && !bondsOf(c.chessId).includes('iberiaShip'));
  a.ps.shop.slots[i] = { ...card(a.m, id), frozen: true };
  assert.deepEqual(a.use({ slot: i }), OK);
  const s = a.ps.shop.slots[i];
  assert.ok(bondsOf(s.id).includes('iberiaShip'));
  assert.ok(tierOf(s.id) <= 3);
  assert.equal(s.frozen, true, 'the freeze stays');
  assert.equal(a.ps.funds, 29);
  assert.equal(ownedIds(a.ps).length, 0, 'nothing gained: the card stays in the shop');

  const b = setup({ band: 'band_transfer' });
  const j = chessSlot(b.ps);
  const tid = firstOf((c) => c.tier === 4);
  for (let k = 0; k < 2; k++) {
    b.ps.shop.slots[j] = card(b.m, tid);
    assert.deepEqual(b.use({ slot: j }), OK);
    assert.equal(tierOf(b.ps.shop.slots[j].id), 4, 'the same tier');
    assert.notEqual(b.m.gd.baseIdOf(b.ps.shop.slots[j].id), tid, 'another operator');
  }
  assert.deepEqual(b.use({ slot: j }), { error: 'ALREADY', detail: 'no uses left' });
});

test('条文修正 (但书, R4): every active bond of the operator +9 layers, its inactive ones none; none active refuses', () => {
  const { m, ps, use, view } = setup({ band: 'band_jenga' });
  m.round = 4;
  assert.equal(view().type, 'ACTIVE');
  const id = firstOf((c) => bondsOf(c.chessId).length >= 2);
  const [b1, b2] = bondsOf(id);
  const p = give(m, ps, id, 'hand');
  assert.deepEqual(use({ uid: p.uid }), { error: 'BAD_TARGET', detail: 'no active bond' });
  activate(ps, b1);
  const before = { [b1]: ps.layers[b1] || 0, [b2]: ps.layers[b2] || 0 };
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal((ps.layers[b1] || 0) - before[b1], 9);
  assert.equal((ps.layers[b2] || 0) - before[b2], 0, 'an inactive bond gains nothing');
  assert.equal(view().cooldown, 3);
});

test('强制休整 (苏苏洛): the operator\'s <休整期结束时> 特质 run once more at this prep end; a hand piece with a board-only one is refused', () => {
  const { m, ps, use, view } = setup({ band: 'band_prepfin' });
  const id = 'chess_char_1_05_a'; // 慕斯: <休整期结束时>使已激活的【维多利亚】层数+1 (on the board only)
  assert.equal(ACT3.garrisons[ACT3.chess[id].garrisonIds[0]].eventType, 'SERVER_PREP_FIN');
  activate(ps, 'victoriaShip');
  const inHand = give(m, ps, id, 'hand');
  assert.deepEqual(use({ uid: inHand.uid }), { error: 'BAD_TARGET', detail: 'no trait of the event' });
  const p = onBoard(m, ps, id);
  // a plain prep end: +1 from each 慕斯 on the board
  let l0 = ps.layers.victoriaShip || 0;
  prepEnd(m, ps);
  const plain = (ps.layers.victoriaShip || 0) - l0;
  assert.equal(plain, 1);
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(view().usesLeft, 0);
  l0 = ps.layers.victoriaShip || 0;
  prepEnd(m, ps);
  assert.equal((ps.layers.victoriaShip || 0) - l0, plain + 1, 'one extra run');
  l0 = ps.layers.victoriaShip || 0;
  prepEnd(m, ps);
  assert.equal((ps.layers.victoriaShip || 0) - l0, plain, 'only that prep end');
});

test('御守之力 (铃兰): the operator\'s <获得时> 特质 run now; one without refuses', () => {
  const { m, ps, use } = setup({ band: 'band_gain' });
  const id = 'chess_char_1_07_a'; // 灰喉: <获得时>【精准】层数+2
  const p = give(m, ps, id, 'hand');
  const l0 = ps.layers.preciShip || 0;
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal((ps.layers.preciShip || 0) - l0, 2);
  m.round += 1;
  const none = give(m, ps, firstOf((c) => !(c.garrisonIds || []).some((g) => ACT3.garrisons[g]?.eventType === 'SERVER_GAIN')), 'hand');
  assert.deepEqual(use({ uid: none.uid }), { error: 'BAD_TARGET', detail: 'no trait of the event' });
});

test('幻画为真 (夕): a copy of the operator — elite and its equipment; once a match', () => {
  const { m, ps, use, view } = setup({ band: 'band_copy' });
  const base = firstOf((c) => c.tier === 2 && c.goldenId);
  const elite = onBoard(m, ps, m.gd.goldenIdOf(base));
  const shopItem = (mergeable) => Object.values(ACT3.items)
    .find((x) => !x.isGolden && !x.hideInShop && !x.shopExcluded && x.itemType === 'EQUIP' && !!x.mergeable === mergeable && m.itemPool.canGain(x.id))?.id;
  const plain = shopItem(false);
  const pair = shopItem(true);
  assert.ok(plain && pair, 'two items');
  for (const id of [plain, pair]) {
    const it = giveItem(m, ps, id, 'hand');
    ps._detach(ps.find(it.uid));
    ps._attach(elite, it);
  }
  ps.recompute();
  assert.deepEqual(use({ uid: elite.uid }), OK);
  const copies = owned(ps).filter((p) => p.id === elite.id);
  assert.equal(copies.length, 2, 'an elite copy');
  const copy = copies.find((p) => p !== elite);
  // a non-mergeable item is copied as it is; a mergeable one meets the original's and merges as any gain does — the
  // 进阶 copy is worn by the copy (the default season's 复制 trap: trap_copy_front_char)
  assert.deepEqual(copy.items.map((x) => x.id).sort(), [plain, m.gd.item(pair).goldenId].sort(), 'its items');
  assert.deepEqual(elite.items.map((x) => x.id), [plain], 'the original keeps the non-mergeable one');
  assert.equal(view().usesLeft, 0);
  m.round += 1;
  assert.deepEqual(use({ uid: elite.uid }), { error: 'ALREADY', detail: 'no uses left' });
});

test('至纯凝结 (缪尔赛思): the operator becomes its elite in place, no promotion reward; an elite refuses', () => {
  const { m, ps, use } = setup({ band: 'band_upgrade' });
  const id = firstOf((c) => c.tier === 3 && c.goldenId);
  const p = onBoard(m, ps, id);
  const tile = [...ps.board].find(([, x]) => x === p)[0];
  const e = give(m, ps, m.gd.goldenIdOf(firstOf((c) => c.tier === 1 && c.goldenId)), 'hand');
  assert.deepEqual(use({ uid: e.uid }), { error: 'BAD_TARGET', detail: 'already elite' });
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(p.id, m.gd.goldenIdOf(id));
  assert.equal(ps.board.get(tile), p, 'in place');
  assert.equal(ps.offers.length, 0, 'no 晋升 reward');
});

test('东之极道 (三船光平): the operator is sold (its price) and every active bond gains its tier in layers', () => {
  const { m, ps, use } = setup({ band: 'band_sell', funds: 10 });
  const id = firstOf((c) => c.tier === 3);
  const p = give(m, ps, id, 'hand');
  const other = visible.map((c) => c.bonds || []).flat().find((b) => !bondsOf(id).includes(b) && ACT3.bonds[b]);
  activate(ps, other);
  const price = ps.sellPriceOf(p);
  const l0 = ps.layers[other] || 0;
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(ps.find(p.uid), null, 'sold');
  assert.equal(ps.stats.sells, 1);
  assert.equal(ps.funds, 10 + price);
  assert.equal((ps.layers[other] || 0) - l0, 3, 'tier 3 layers');
});

test('不稳定要素 (昆图斯, R4): the operator becomes a random normal operator one tier higher in the 整备区, at most 6', () => {
  const { m, ps, use } = setup({ band: 'band_mess' });
  m.round = 4;
  const id = firstOf((c) => c.tier === 2);
  const p = onBoard(m, ps, id);
  assert.deepEqual(use({ uid: p.uid }), OK);
  assert.equal(ps.find(p.uid), null, 'the operator is gone');
  assert.equal(ps.board.size, 0, 'its tile is free');
  const got = owned(ps);
  assert.equal(got.length, 1);
  assert.equal(tierOf(got[0].id), 3);
  assert.ok(ps.hand.includes(got[0]), 'in the 整备区');
  m.round += 1;
  const six = give(m, ps, firstOf((c) => c.tier === 6), 'hand');
  assert.deepEqual(use({ uid: six.uid }), OK);
  assert.ok(owned(ps).some((x) => x !== got[0] && tierOf(x.id) === 6), 'a 6 stays at 6');
});

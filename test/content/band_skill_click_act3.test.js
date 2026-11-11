// 规程's click 指令 (「点击使用」, content/bands/meta.js): each strategy's own handler through g.bandSkill and the real
// registry — what the use does to the shop, the funds, the operators and the 目标生命值, and what the cost keys do to the
// next use. The gate, the target and the limits are band_skill_act3.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { makeMatch, give, legalTileFor } from '../match/harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';

const OK = { ok: true };
const quiet = { error() {}, warn() {}, info() {}, log() {} };

/**
 * A 规程 match in PREP R1 holding `band`, its own handlers; `bots` AI seats (a co-op match) for the 指令 that read the
 * other players. @param {{ band: string, funds?: number, seed?: number, bots?: number }} o
 */
function setup({ band, funds = 30, seed = 7, bots = 0 }) {
  const reg = createRegistry({ data: ACT3_ON_BASE_FIELD, log: quiet });
  const mode = bots ? { mode: 'coop', difficulty: 'NORMAL', bots } : { mode: 'solo' };
  const h = makeMatch({ ...mode, humans: 1, seed, registry: reg, fake: true, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(1, { band: 'band_amiya' });
  const m = h.m;
  const ps = h.ps('p_0');
  ps.bandId = band; ps.counters = {}; ps.funds = funds; ps.offers.length = 0; ps.ready = false;
  const use = (target = {}) => m.handle('p_0', { t: 'g.bandSkill', ...target });
  return { h, m, ps, use, view: () => ps.privateView().bandSkill };
}

const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy);
const ofBond = (bond, maxTier = 6) => visible.filter((c) => (c.bonds || []).includes(bond) && c.tier <= maxTier);
const owned = (ps) => [...ps.hand, ...ps.temp, ...ps.board.values()].filter((p) => p && p.kind === 'chess');
const chessCards = (ps) => ps.shop.slots.map((s, i) => (s && s.kind === 'chess' && !s.sold ? i : -1)).filter((i) => i >= 0);
const itemIndex = (ps) => ps._shopKinds().indexOf('item');
const card = (m, id) => ({ kind: 'chess', id, basePrice: m.gd.chessPrice(id), frozen: false, sold: false });
const prepEnd = (m, ps) => m.dispatch(ps, 'onPrepEnd', { round: m.round });

test('最佳品味 (琳琅诗怀雅): 1 random shop operator from 60 funds spent, 2 from 120 — free, its slot empties; none in the shop refuses', () => {
  const { m, ps, use, view } = setup({ band: 'band_rich' });
  assert.equal(view().type, 'NONE');
  ps.stats.gold = 60;
  assert.equal(view().stage, 1);
  const cards = chessCards(ps);
  assert.ok(cards.length >= 2);
  const shown = cards.map((i) => ps.shop.slots[i].id);
  const before = owned(ps).length;
  assert.deepEqual(use(), OK);
  assert.equal(owned(ps).length, before + 1);
  assert.equal(chessCards(ps).length, cards.length - 1, 'the taken card leaves the shop');
  assert.ok(shown.includes(owned(ps).at(-1)?.id ?? owned(ps).find((p) => shown.includes(p.id)).id));
  assert.equal(ps.funds, 30, 'no cost');
  m.round += 1;
  ps.stats.gold = 120;
  assert.equal(view().stage, 2);
  const left = chessCards(ps).length;
  assert.deepEqual(use(), OK);
  assert.equal(owned(ps).length, before + 1 + Math.min(2, left));
  // nothing to take: refused, the round's use kept
  m.round += 1;
  for (const i of chessCards(ps)) ps.shop.slots[i] = null;
  assert.deepEqual(use(), { error: 'BAD_TARGET', detail: 'no operator in the shop' });
  assert.equal(view().usesLeft, 1);
});

test('打包速递 (拜松, DEFAULT 9): every shop operator; the cost −1 at each prep end (never below 0), back to 9 after a use', () => {
  const { m, ps, use, view } = setup({ band: 'band_closeout' });
  const cards = chessCards(ps).length;
  const before = owned(ps).length;
  assert.equal(view().cost, 9);
  assert.deepEqual(use(), OK);
  assert.equal(owned(ps).length, before + cards);
  assert.equal(chessCards(ps).length, 0);
  assert.equal(ps.funds, 21);
  for (let k = 0; k < 3; k++) prepEnd(m, ps);
  assert.equal(view().cost, 6);
  for (let k = 0; k < 10; k++) prepEnd(m, ps);
  assert.equal(view().cost, 0, 'the cut stops at the table cost');
  assert.equal(ps.counters['band:skill:cost'], -9);
  ps.shop.slots[chessCards(ps)[0] ?? ps._shopKinds().indexOf('chess')] = card(m, ofBond('kazimierzShip', 1)[0].chessId);
  assert.deepEqual(use(), OK);
  assert.equal(ps.funds, 21, 'a free use');
  assert.equal(view().cost, 9, 'reset after the use');
});

test('骑士团长 / 流动乐章 / 无惧风雪 / 猎人战法: an operator of the bond of tier ≤ the 调度中心 level, and each cost key', () => {
  // 焰尾 骑士团长: cost 6, −2 at each prep end, reset on use
  const k = setup({ band: 'band_kazimier' });
  const tierCap = k.ps.shop.level;
  const before = owned(k.ps).length;
  assert.deepEqual(k.use(), OK);
  const got = owned(k.ps).slice(before);
  assert.equal(got.length, 1);
  const rec = k.m.gd.chess(got[0].id);
  assert.ok(rec.bonds.includes('kazimierzShip') && rec.tier <= tierCap, `${got[0].id} tier ${rec.tier}`);
  assert.equal(k.ps.funds, 24);
  prepEnd(k.m, k.ps);
  assert.equal(k.view().cost, 4);
  assert.deepEqual(k.use(), OK);
  assert.equal(k.ps.funds, 20);
  assert.equal(k.view().cost, 6);

  // 车尔尼 流动乐章: cost 1, +1 for good after every use
  const l = setup({ band: 'band_lethania' });
  assert.deepEqual(l.use(), OK);
  assert.equal(l.view().cost, 2);
  l.m.round += 1;
  assert.deepEqual(l.use(), OK);
  assert.equal(l.view().cost, 3);
  assert.equal(l.ps.funds, 30 - 1 - 2);
  assert.ok(owned(l.ps).every((p) => l.m.gd.chess(p.id).bonds.includes('lethaniaShip')));

  // 怒潮凛冬 无惧风雪: cost 5, −1 for each 乌萨斯 operator bought (not for others), reset on use
  const u = setup({ band: 'band_ursus' });
  const ursus = ofBond('ursusShip', 1)[0].chessId;
  const other = visible.find((c) => c.tier === 1 && !(c.bonds || []).includes('ursusShip')).chessId;
  const [a, b, c] = chessCards(u.ps);
  u.ps.shop.slots[a] = card(u.m, ursus);
  u.ps.shop.slots[b] = card(u.m, ursus);
  u.ps.shop.slots[c] = card(u.m, other);
  assert.deepEqual(u.m.handle('p_0', { t: 'g.buy', slot: a }), OK);
  assert.deepEqual(u.m.handle('p_0', { t: 'g.buy', slot: c }), OK);
  assert.equal(u.view().cost, 4, 'only the 乌萨斯 purchase cut it');
  assert.deepEqual(u.m.handle('p_0', { t: 'g.buy', slot: b }), OK);
  assert.equal(u.view().cost, 3);
  // this match's pool holds no 乌萨斯 operator below tier 3: refused at 调度中心 level 1, nothing paid
  const funds = u.ps.funds;
  assert.deepEqual(u.use(), { error: 'BAD_TARGET', detail: 'no operator of the bond left' });
  assert.equal(u.ps.funds, funds);
  u.ps.shop.level = 3;
  assert.deepEqual(u.use(), OK);
  assert.equal(u.ps.funds, funds - 3);
  assert.equal(u.view().cost, 5, 'reset after the use');

  // 歌蕾蒂娅 猎人战法: locked until the 调度中心 reaches 4, then an 阿戈尔 operator for 1
  const e = setup({ band: 'band_egir' });
  assert.deepEqual(e.use(), { error: 'WRONG_PHASE', detail: 'locked' });
  e.ps.shop.level = 4;
  const n = owned(e.ps).length;
  assert.deepEqual(e.use(), OK);
  const g = owned(e.ps).slice(n);
  assert.equal(g.length, 1);
  assert.ok(e.m.gd.chess(g[0].id).bonds.includes('egirShip') && e.m.gd.chess(g[0].id).tier <= 4);
});

test('内部货源 (天空盒): the next item bought costs 1 less (not below 0); unused it waits, uses add up; operators keep their price', () => {
  const { m, ps, use } = setup({ band: 'band_price' });
  const i = itemIndex(ps);
  assert.ok(i >= 0 && ps.shop.slots[i]);
  const full = ps.priceOf(ps.shop.slots[i]);
  const op = chessCards(ps)[0];
  const opPrice = ps.priceOf(ps.shop.slots[op]);
  assert.deepEqual(use(), OK);
  assert.equal(ps.priceOf(ps.shop.slots[i]), Math.max(0, full - 1));
  assert.equal(ps.priceOf(ps.shop.slots[op]), opPrice);
  m.round += 1;
  assert.deepEqual(use(), OK);
  assert.equal(ps.priceOf(ps.shop.slots[i]), Math.max(0, full - 1), 'one card takes one discount');
  const f0 = ps.funds;
  assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: i }), OK);
  assert.equal(ps.funds, f0 - Math.max(0, full - 1));
  assert.equal(ps.counters['band:skill:itemDiscount'], 1, 'the second use waits for the next item');
  ps.shop.slots[i] = { kind: 'item', id: ps.shop.slots[i].id, basePrice: full, frozen: false, sold: false };
  assert.deepEqual(m.handle('p_0', { t: 'g.buy', slot: i }), OK);
  assert.equal(ps.counters['band:skill:itemDiscount'], 0);
  ps.shop.slots[i] = { kind: 'item', id: ps.shop.slots[i].id, basePrice: full, frozen: false, sold: false };
  assert.equal(ps.priceOf(ps.shop.slots[i]), full);
});

test('人才锁定 (雅拉, 1 funds, 3 a round): a refresh with an operator one tier above the 调度中心, counted as a refresh, the freeze off', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { ps, use } = setup({ band: 'band_support', seed });
    ps.shop.level = 2;
    ps.shop.frozen = true;
    const refreshes = ps.stats.refreshes;
    assert.deepEqual(use(), OK);
    assert.equal(ps.funds, 29);
    assert.equal(ps.stats.refreshes, refreshes + 1);
    assert.equal(ps.shop.frozen, false);
    const tiers = chessCards(ps).map((i) => ps.gd.tierOf(ps.shop.slots[i].id));
    assert.ok(tiers.includes(3), `seed ${seed}: ${tiers}`);
  }
  const { ps, use } = setup({ band: 'band_support' });
  ps.shop.level = 6;
  assert.deepEqual(use(), OK);
  assert.ok(chessCards(ps).some((i) => ps.gd.tierOf(ps.shop.slots[i].id) === 6), 'at most tier 6');
});

test('广交豪杰 (杜遥夜, 1 funds, 2 a round): a refresh with at least one 炎 operator', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { m, ps, use } = setup({ band: 'band_yan', seed });
    // the lowest tier of 炎 this match's pool holds (each match bans some operators)
    const low = Math.min(...ofBond('yanShip').filter((c) => m.pool.has(c.chessId) && m.pool.left(c.chessId) > 0).map((c) => c.tier));
    ps.shop.level = Math.max(low, 1 + (seed % 3));
    assert.deepEqual(use(), OK);
    const yan = chessCards(ps).filter((i) => m.gd.chess(ps.shop.slots[i].id).bonds.includes('yanShip'));
    assert.ok(yan.length >= 1, `seed ${seed}`);
    assert.ok(yan.every((i) => m.gd.tierOf(ps.shop.slots[i].id) <= ps.shop.level));
  }
});

test('专享情报 (渡桥, 3 funds, once a match): a refresh whose operator cards are the operators on the board', () => {
  const { m, ps, use, view } = setup({ band: 'band_high' });
  const ids = visible.filter((c) => c.tier <= 2).slice(0, 2).map((c) => c.chessId);
  for (const id of ids) give(m, ps, id, 'board', legalTileFor(m, ps, id));
  assert.deepEqual(use(), OK);
  const shown = chessCards(ps).map((i) => m.gd.baseIdOf(ps.shop.slots[i].id));
  assert.ok(shown.length > 0);
  assert.ok(shown.every((id) => ids.includes(id)), shown.join(','));
  assert.equal(ps.funds, 27);
  assert.equal(view().usesLeft, 0);
});

test('精巧设计 (Mechanist, 2 a round): the shop\'s item card becomes another item', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { ps, use, m } = setup({ band: 'band_equipment', seed });
    const i = itemIndex(ps);
    const was = ps.shop.slots[i].id;
    const chess = chessCards(ps).map((k) => ps.shop.slots[k].id);
    assert.deepEqual(use(), OK);
    assert.equal(ps.shop.slots[i].kind, 'item');
    assert.notEqual(ps.shop.slots[i].id, was, `seed ${seed}`);
    assert.ok(m.gd.item(ps.shop.slots[i].id));
    assert.deepEqual(chessCards(ps).map((k) => ps.shop.slots[k].id), chess, 'the operator cards stay');
  }
});

test('献身护卫 (信仰搅拌机, from round 4): own LP to the lowest player\'s, funds = the loss (≤ 10), that player healed at the prep end', () => {
  const { m, ps, use } = setup({ band: 'band_protect', bots: 2 });
  assert.deepEqual(use(), { error: 'WRONG_PHASE', detail: 'locked' });
  m.round = 4;
  const others = m.alivePlayers().filter((p) => p !== ps);
  assert.ok(others.length >= 1);
  for (const o of others) o.lp = 30;
  assert.deepEqual(use(), { error: 'BAD_TARGET', detail: 'no lower player' }, 'nobody lower');
  ps.lp = 40;
  const low = others[others.length - 1];
  low.lp = 12;
  const f0 = ps.funds;
  assert.deepEqual(use(), OK);
  assert.equal(ps.lp, 12);
  assert.equal(ps.funds, f0 + 10, 'at most 10 funds');
  assert.equal(low.lp, 12);
  prepEnd(m, ps);
  assert.equal(low.lp, 40, 'healed by the LP lost (28)');
  prepEnd(m, ps);
  assert.equal(low.lp, 40, 'once');
  // the alliance's one pool: refused
  m.round = 5;
  m.teamLp = 100;
  assert.deepEqual(use(), { error: 'BAD_TARGET', detail: 'shared LP' });
  m.teamLp = null;
});

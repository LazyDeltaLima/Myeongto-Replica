// Shared shop-equipment stock through the real match path (test/match/harness.js with the real Battle: prep → combat →
// settle → prep): upstream 6bfc0827 (GitHub #466), docs/rules/sim.md 「upstream 0.2.3 이식」 D8. 商业包装方案 has a
// match-wide stock of 2 — two owned at once across the team, a grant only while a copy is free; an equipped copy
// keeps occupying its stock through a battle; the shop's item slot never rolls an item the stock cannot cover; a card
// already on screen (a frozen one kept through a round start) is bought past the stock (docs/rules/sim.md 「상점에 이미 뜬
// 장비 카드도 재고가 0이어도 산다」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const PACK = 'chess_item_5_07_e_a'; // 商业包装方案

test('商业包装方案 (real path, co-op): a frozen card kept through a round start is bought past the stock; grants stay refused; an equipped copy still counts after a real battle', REAL, async () => {
  const { makeMatch, give, checkInvariants } = await import('./harness.js');
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 5 }).start();
  h.toPrep(2);
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  assert.equal(m.itemPool.cap(PACK), 2, 'co-op does not double the equipment stock');
  // p_1's shop shows it while the stock is still free (displays reserve nothing); p_1 freezes the shop
  const slot = b.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.ok(slot >= 0, 'the shop has an item slot');
  b.shop.slots[slot] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: false };
  assert.ok(m.handle('p_1', { t: 'g.freeze' }).ok);
  // p_0 carries one on an operator on the board, p_1 holds the other in hand: the stock is empty
  const carrier = [...a.board.values()].find((p) => p.kind === 'chess') || give(m, a, [...m.pool.entries.keys()][0]);
  const x = a.acquireItem(PACK);
  assert.ok(x && a.equip(x.uid, carrier.uid).ok);
  assert.ok(b.acquireItem(PACK));
  assert.equal(m.itemPool.left(PACK), 0);
  // a grant the stock cannot cover is not made, with a toast
  assert.equal(b.acquireItem(PACK), null);
  // a real battle and its settle: the carried copy still occupies the stock, the frozen card is still shown
  h.toPrep(3);
  checkInvariants(m);
  assert.equal(m.itemPool.held(PACK), 2, 'both copies are still owned after the battle');
  const kept = b.shop.slots.findIndex((s) => s?.kind === 'item' && s.id === PACK && !s.sold);
  assert.ok(kept >= 0, 'the frozen card survived the round start');
  // the stock ran out since the roll, the card is bought anyway: p_1's two copies merge into one advanced item that
  // carries the copy past the stock
  b.funds = 20;
  assert.ok(m.handle('p_1', { t: 'g.buy', slot: kept }).ok);
  assert.equal(b.funds, 19);
  const gold = [...b.hand, ...b.temp].find((p) => p && m.gd.baseIdOf(p.id) === PACK);
  assert.ok(gold && m.gd.isGolden(gold.id), 'the bought copy merged with the one in hand');
  assert.equal(gold.overStock, 1);
  assert.equal(m.itemPool.held(PACK), 3);
  assert.equal(m.itemPool.over(PACK), 1);
  assert.equal(m.itemPool.left(PACK), 0);
  assert.equal(b.acquireItem(PACK), null, 'a grant stays refused');
  checkInvariants(m);
  // through another real battle the mark stays on the piece; once enough copies leave, the stock opens again
  h.toPrep(4);
  checkInvariants(m);
  assert.ok(b.destroy(gold.uid).ok);
  assert.equal(m.itemPool.held(PACK), 1);
  assert.equal(m.itemPool.over(PACK), 0);
  assert.equal(m.itemPool.left(PACK), 1);
  assert.ok(b.acquireItem(PACK), 'a grant is made again with a copy free');
  checkInvariants(m);
  m.dispose();
});

test('shop item slot: an item the shared stock cannot cover is never rolled (real match, solo)', REAL, async () => {
  const { makeMatch } = await import('./harness.js');
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 7 }).start();
  h.toPrep(2);
  const m = h.m, p = h.ps('p_0');
  assert.ok(p.acquireItem(PACK) && p.acquireItem(PACK), 'two copies (merged into one advanced item)');
  assert.equal(m.itemPool.held(PACK), 2);
  assert.equal(m.itemPool.canGain(PACK), false);
  let seen = 0;
  for (let i = 0; i < 400; i++) {
    const id = m.pool.rollItem(m.rngShop, 6, m.itemPool);
    assert.ok(id, 'other items stay available');
    if (m.gd.baseIdOf(id) === PACK) seen++;
  }
  assert.equal(seen, 0);
  m.dispose();
});

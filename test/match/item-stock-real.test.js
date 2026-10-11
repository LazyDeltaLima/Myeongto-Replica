// Shared shop-equipment stock through the real match path (test/match/harness.js with the real Battle: prep → combat →
// settle → prep): upstream 6bfc0827 (GitHub #466), docs/rules/sim.md 「upstream 0.2.3 이식」 D8. 商业包装方案 has a
// match-wide stock of 2 — two owned at once across the team, a third only after one leaves ownership; an equipped copy
// keeps occupying its stock through a battle; the shop's item slot never rolls an item the stock cannot cover.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const PACK = 'chess_item_5_07_e_a'; // 商业包装方案

test('商业包装方案 (real path, co-op): two copies across the team, an equipped one still counts after a real battle, a third after one is destroyed', REAL, async () => {
  const { makeMatch, give, checkInvariants } = await import('./harness.js');
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 5 }).start();
  h.toPrep(2);
  const m = h.m, a = h.ps('p_0'), b = h.ps('p_1');
  assert.equal(m.itemPool.cap(PACK), 2, 'co-op does not double the equipment stock');
  // p_0 carries one on an operator on the board, p_1 holds the other in hand
  const carrier = [...a.board.values()].find((p) => p.kind === 'chess') || give(m, a, [...m.pool.entries.keys()][0]);
  const x = a.acquireItem(PACK);
  assert.ok(x && a.equip(x.uid, carrier.uid).ok);
  const y = b.acquireItem(PACK);
  assert.ok(y);
  assert.equal(m.itemPool.left(PACK), 0);
  // p_1's shop shows it (displays reserve nothing) but the purchase is refused before any charge
  b.funds = 20;
  const slot = b.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.ok(slot >= 0, 'the shop has an item slot');
  b.shop.slots[slot] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: true };
  assert.equal(m.handle('p_1', { t: 'g.buy', slot }).error, 'SOLD_OUT');
  assert.equal(b.funds, 20);
  assert.equal(b.shop.slots[slot].sold, false);
  // a grant the stock cannot cover is not made, with a toast
  assert.equal(b.acquireItem(PACK), null);
  // a real battle and its settle: the carried copy still occupies the stock
  h.toPrep(3);
  checkInvariants(m);
  assert.equal(m.itemPool.held(PACK), 2, 'both copies are still owned after the battle');
  // one leaves ownership → the third purchase is legal (a concurrent cap, not a per-match limit)
  const held = [...b.hand, ...b.temp].find((p) => p && m.gd.baseIdOf(p.id) === PACK);
  assert.ok(held && b.destroy(held.uid).ok);
  assert.equal(m.itemPool.left(PACK), 1);
  b.funds = 20;
  const slot2 = b.shop.slots.findIndex((s) => s?.kind === 'item');
  assert.ok(slot2 >= 0);
  b.shop.slots[slot2] = { kind: 'item', id: PACK, basePrice: 1, sold: false, frozen: true };
  assert.ok(m.handle('p_1', { t: 'g.buy', slot: slot2 }).ok);
  assert.equal(m.itemPool.left(PACK), 0);
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

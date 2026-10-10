// The 调度中心's upgrade and the shop layout — local patch (docs/LOCAL-PATCH.md 「상점 칸 배치」, maintainer 2026-10-09 from the
// game): the new level's extra slot opens EMPTY on the left and the cards shown keep their places until the next roll (a
// refresh or the round start); after a roll the item slot is on the left, then the operators. Upstream 0.2.0 filled the new
// slot at once (community report of 2026-10-06, item 19: 「升级商店获得新的商店位时用新卡补上，而不是空着」) with the item
// after the operators; 0.1.x kept the old slot count until the next roll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';

const ids = (slots) => slots.map((s) => (s ? `${s.kind}:${s.id}${s.sold ? '(sold)' : ''}` : null));

test('a level-up opens the new operator slot empty on the left; the cards shown keep their places; a roll puts the item back on the left', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 7, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.funds = 200;
  assert.deepEqual(h.m.gd.shopSlots(1), { chess: 3, item: 1 });
  const s1 = ps.shop.slots.slice();
  assert.equal(s1.length, 4);
  assert.equal(s1[0]?.kind, 'item', 'after the roll the item is on the left');
  assert.deepEqual(s1.slice(1).map((x) => x?.kind), ['chess', 'chess', 'chess']);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.levelUp' }), { ok: true });
  // level 2: 4 operator slots + the item slot — a new empty slot on the left, the four cards shifted right (the same objects)
  assert.equal(ps.shop.level, 2);
  assert.deepEqual(ps.shop.layout, { chess: 4, item: 1 });
  assert.equal(ps.shop.slots.length, 5);
  assert.equal(ps.shop.slots[0], null, 'the new slot is empty');
  for (let i = 0; i < 4; i++) assert.equal(ps.shop.slots[i + 1], s1[i], `card ${i} kept in its place`);
  assert.deepEqual(ps.shop.kinds, ['chess', 'item', 'chess', 'chess', 'chess']);
  // the player sees it right away (m.private shop, with the kinds of empty slots)
  const view = ps.privateView().shop;
  assert.deepEqual(ids(view.slots), ids(ps.shop.slots));
  assert.deepEqual(view.kinds, ps.shop.kinds);
  // 2 → 3 keeps 4 operator slots: nothing changes
  const s2 = ps.shop.slots.slice();
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.level, 3);
  assert.deepEqual(ps.shop.slots, s2, 'no extra slot at level 3, no reroll');
  // 3 → 4: the fifth operator slot, again empty on the left
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.level, 4);
  assert.deepEqual(ps.shop.layout, { chess: 5, item: 1 });
  assert.equal(ps.shop.slots[0], null);
  for (let i = 0; i < 5; i++) assert.equal(ps.shop.slots[i + 1], s2[i]);
  // a refresh lays the shop out again: the item on the left, five operator cards
  assert.deepEqual(h.m.handle('p_0', { t: 'g.refresh' }), { ok: true });
  assert.deepEqual(ps.shop.slots.map((x) => x?.kind), ['item', 'chess', 'chess', 'chess', 'chess', 'chess']);
  assert.ok(ps.shop.slots.every(Boolean), 'every slot filled by the roll');
  h.invariants();
  h.m.dispose();
});

test('a bought card stays sold; a frozen shop keeps its cards through the level-up and the round start, the new slot is rolled then', () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed: 11, fake: true }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  ps.funds = 200;
  assert.deepEqual(h.m.handle('p_0', { t: 'g.buy', slot: 1 }), { ok: true });
  assert.equal(ps.shop.slots[1].sold, true);
  assert.deepEqual(h.m.handle('p_0', { t: 'g.freeze' }), { ok: true });
  h.m.handle('p_0', { t: 'g.levelUp' });
  assert.equal(ps.shop.slots[0], null, 'the new slot stays empty');
  assert.equal(ps.shop.slots[2].sold, true, 'the bought slot is not refilled');
  const item = ps.shop.slots[1];
  const chessKept = ps.shop.slots.filter((x) => x && x.kind === 'chess' && !x.sold && x.frozen).map((x) => x.id);
  assert.equal(chessKept.length, 2, 'two frozen operator cards');
  // the next round start keeps every frozen card — the item on the left, the operators in their order — and rolls the rest
  h.drive(() => h.m.phase === 'PREP' && h.m.round === 2);
  assert.equal(ps.shop.slots.length, 5);
  assert.equal(ps.shop.slots[0].id, item.id, 'the frozen item back on the left');
  const chess = ps.shop.slots.slice(1);
  assert.ok(chess.every((x) => x && x.kind === 'chess' && !x.sold));
  assert.deepEqual(chess.slice(2, 4).map((x) => x.id), chessKept, 'the frozen operators keep their places among the operator slots (the empty one and the sold one rolled)');
  h.invariants();
  h.m.dispose();
});

test('every mode\'s slot table: a level-up adds exactly the slots the new level has more of (标准: 3,4,4,4,4,5)', () => {
  for (const [mode, difficulty] of [['solo', 'FUNNY'], ['solo', 'NORMAL'], ['coop', 'FUNNY'], ['coop', 'ABYSS']]) {
    const h = makeMatch({ mode, difficulty, seed: 3, fake: true, humans: 1, bots: mode === 'coop' ? 1 : 0 }).start();
    h.toPrep(1);
    const ps = h.ps('p_0');
    const gd = h.m.gd;
    ps.funds = 500;
    for (let lv = 2; lv <= gd.maxShopLevel; lv++) {
      const before = ps.shop.slots.slice();
      assert.deepEqual(h.m.handle('p_0', { t: 'g.levelUp' }), { ok: true });
      const { chess, item } = gd.shopSlots(lv);
      assert.equal(ps.shop.slots.length, chess + item, `${mode} ${difficulty} L${lv}`);
      const grew = chess - gd.shopSlots(lv - 1).chess;
      const added = ps.shop.slots.length - before.length;
      assert.equal(added, grew + (item - gd.shopSlots(lv - 1).item));
      assert.ok(ps.shop.slots.slice(0, added).every((s) => s === null), `${mode} ${difficulty} L${lv}: the new slots are empty, on the left`);
      assert.deepEqual(ps.shop.slots.slice(added), before, `${mode} ${difficulty} L${lv}: every shown card kept in place`);
    }
    h.invariants();
    h.m.dispose();
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((l) => new GameData(DATA, 'mode_single_funny').shopSlots(l).chess), [3, 4, 4, 4, 4, 5]);
});

// Who blocks whom — the official client (Character.OnTick → _SearchBlockee → FilterUtil.FilterWithVolume over
// Character._CheckBlockable → _AddBlockee): the blocker, not the enemy, looks for enemies to block, every 3 ticks from its
// deployment (Character.FIND_BLOCKEE_TICK, a PeriodicTicker whose first search is its first tick), and takes the enemies
// in reach nearest first — squared distance in steps of 0.01 (WeightedTarget.CompareTo) — each if its block weight
// still fits (a heavy one that does not is passed over for a lighter one behind it). Battle._searchBlockees.
//
// Flat stage: the blocker stands on (9,6); the enemies stand still.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { BLOCK_SEARCH_TICKS } from '../../server/sim/constants.js';

const OP = 'test_block_search';
const op = (blockCnt) => chessRec({ id: OP, stats: { atk: 0, blockCnt, maxHp: 1e6, respawnTime: 999 }, skill: null });

function lane(blockCnt) {
  return makeBattle({
    defs: {
      chess: { [OP]: op(blockCnt) },
      enemies: {
        enemy_still: enemyRec({ key: 'enemy_still', hp: 1e7, speed: 0 }),
        enemy_heavy: enemyRec({ key: 'enemy_heavy', hp: 1e7, speed: 0, blockCnt: 2 }),
      },
    },
    units: [{ chessId: OP, row: 9, col: 6 }], enemies: [], timeLimit: 100, content: 'none',
  });
}

test('the blocker searches every 3 ticks from its deployment: an enemy put in reach waits for the next search', () => {
  assert.equal(BLOCK_SEARCH_TICKS, 3);
  const h = lane(1);
  const u = h.unit(OP);
  h.step(1);   // tick 1: its first search (nothing in reach); the next ones at 4, 7 …
  const e = h.spawn('enemy_still', { pos: [9, 6.6] });
  h.step(2);
  assert.ok(e.blockedBy === null, 'ticks 2 and 3: no search');
  h.step(1);
  assert.ok(e.blockedBy === u, 'tick 4: blocked');
  checkInvariants(h.b);
});

test('several enemies in reach at once: the nearest first, whatever their order on the field', () => {
  const h = lane(1);
  const u = h.unit(OP);
  h.step(1);
  const far = h.spawn('enemy_still', { pos: [9, 6.65] });
  const near = h.spawn('enemy_still', { pos: [9, 5.45] });
  h.step(BLOCK_SEARCH_TICKS);
  assert.ok(near.blockedBy === u, 'the nearer one, though it came later');
  assert.ok(far.blockedBy === null, 'no room left for the farther one');
  checkInvariants(h.b);
});

test('a heavy enemy that does not fit is passed over for a lighter one behind it', () => {
  const h = lane(1);
  const u = h.unit(OP);
  h.step(1);
  const heavy = h.spawn('enemy_heavy', { pos: [9, 6.55] });   // block weight 2 > capacity 1
  const light = h.spawn('enemy_still', { pos: [9, 6.68] });
  h.step(BLOCK_SEARCH_TICKS);
  assert.ok(heavy.blockedBy === null, 'never fits');
  assert.ok(light.blockedBy === u, 'the lighter one behind it is taken');
  checkInvariants(h.b);
});

test('distances within the same 0.01 step count as equal: the order on the field decides', () => {
  const h = lane(1);
  const u = h.unit(OP);
  h.step(1);
  // squared distances 0.3600 and 0.3364 differ by more than a step; 0.36 and 0.3601 do not
  const first = h.spawn('enemy_still', { pos: [9, 6.6] });
  const second = h.spawn('enemy_still', { pos: [9.01, 6.6] });
  h.step(BLOCK_SEARCH_TICKS);
  assert.ok(first.blockedBy === u && second.blockedBy === null, 'the first on the field');
  checkInvariants(h.b);
});

test('an out-of-turn search (Character.SearchBlockeeImmediate — a pulling projectile stopping, 玛恩纳\'s skill start) blocks at once and leaves the ticker as it was', () => {
  const h = lane(1);
  const u = h.unit(OP);
  h.step(2);   // searched at tick 1; the next turn is tick 4
  const e = h.spawn('enemy_still', { pos: [9, 6.6] });
  const left = u.blockSearchTick;
  h.b.searchBlockeeImmediate(u);
  assert.ok(e.blockedBy === u, 'blocked at once');
  assert.equal(u.blockSearchTick, left, 'not due: the ticker runs on');
  checkInvariants(h.b);
});

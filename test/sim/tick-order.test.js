// The units' tick order — the official client's object tick (BattleController.OnTick: the tweens, then
// ObjectManager.OnFixedUpdate over BObject.CompareTo): every unit alive as the pass starts, enemies and allies in one
// line by `deploySeq` (the client's `instanceUid`), each with its own tick — its buffs tick inside it (BuffContainer.Tick
// in Entity.OnTick). A unit made during the pass ticks from the next step. battle/lifecycle.js _tickUnits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { roundHalfEven } from '../../server/sim/detmath.js';
import { COLS } from '../../server/sim/constants.js';

const OP = 'test_tick_order';

function field() {
  return makeBattle({
    defs: {
      chess: { [OP]: chessRec({ id: OP, stats: { atk: 0, blockCnt: 0, maxHp: 1e6, respawnTime: 999 }, skill: null }) },
      enemies: {
        enemy_still: enemyRec({ key: 'enemy_still', hp: 1e7, speed: 0, atk: 0 }),
        enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e7, speed: 1, atk: 0 }),
      },
    },
    units: [{ chessId: OP, row: 9, col: 3 }], enemies: [], timeLimit: 100, content: 'none', autoFinish: false,
  });
}

/** A marker buff whose onTick logs its owner (it ticks inside the owner's own tick). */
const marker = (log, extra = {}) => ({ key: 'tick_marker', duration: Infinity, onTick: ({ unit }) => log.push(unit), ...extra });

test('enemies and allies tick in one line by deploySeq, whatever their side', () => {
  const h = field();
  h.step(1);
  const e1 = h.spawn('enemy_still', { pos: [11, 8] });
  const op2 = h.b.allyUnits.find((u) => u.defId === OP);
  h.b.retreat(op2);
  h.b.redeploy(op2, { free: true });   // a new deployment: numbered after e1
  const e2 = h.spawn('enemy_still', { pos: [11, 9] });
  assert.ok(e1.deploySeq < op2.deploySeq && op2.deploySeq < e2.deploySeq, 'fixture: enemy, ally, enemy');
  const log = [];
  for (const u of [e2, op2, e1]) h.b.addBuff(u, marker(log));
  h.step(1);
  assert.deepEqual(log.map((u) => u.deploySeq), [e1.deploySeq, op2.deploySeq, e2.deploySeq]);
  checkInvariants(h.b);
});

test('a unit made during the pass ticks from the next step; a buff added by an earlier unit ticks in the same step', () => {
  const h = field();
  h.step(1);
  const first = h.spawn('enemy_still', { pos: [11, 8] });
  const later = h.spawn('enemy_still', { pos: [11, 9] });
  const log = [];
  let made = null;
  h.b.addBuff(first, marker(log, {
    onTick: ({ unit }) => {
      log.push(unit);
      if (made) return;
      made = h.spawn('enemy_still', { pos: [11, 10] });
      h.b.addBuff(made, marker(log));
      h.b.addBuff(later, marker(log, { key: 'tick_marker_later' }));
    },
  }));
  h.step(1);
  assert.ok(made, 'spawned in the pass');
  assert.deepEqual(log, [first, later], 'the later unit ticks its new buff at once; the new unit waits');
  log.length = 0;
  h.step(1);
  assert.deepEqual(log, [first, later, made], 'next step: the new unit is in the line');
  checkInvariants(h.b);
});

test('the enemy tile index follows each enemy as it moves', () => {
  const h = field();
  h.step(1);
  const es = [h.spawn('enemy_walk'), h.spawn('enemy_walk')];
  for (let i = 0; i < 90; i++) {
    h.step(1);
    for (const e of es) {
      if (!e.alive) continue;
      const k = roundHalfEven(e.y) * COLS + roundHalfEven(e.x);
      assert.ok(h.b._et[k].includes(e), `tick ${h.b.tickCount}: filed on its tile`);
      const n = h.b._et.reduce((a, b) => a + (b.includes(e) ? 1 : 0), 0);
      assert.equal(n, 1, 'on one tile only');
    }
  }
  checkInvariants(h.b);
});

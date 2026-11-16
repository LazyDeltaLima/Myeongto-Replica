// 信仰搅拌机 S3 退休前布道: the counter hits the enemies he blocks first, in range or not (docs/rules/sim.md
// 「산크타 믹사파라토 S3 반격 대상」): the official counter's selector is a BlockedOrAdvancedSelector.
// An attacker he blocked from behind (outside his forward range) used to get no counter: the bullet went, no damage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const M = 'chess_char_4_01_a';

test('信仰搅拌机 S3: an attacker he blocks from behind takes the counter (blocked enemies first, in range or not)', () => {
  const h = makeBattle({
    seed: 1, timeLimit: 60, autoFinish: false, units: [{ chessId: M, row: 9, col: 6, dir: 'LEFT' }], enemies: [],
    defs: { enemies: { brute: enemyRec({ key: 'brute', hp: 1e6, speed: 0.6, atk: 300, bat: 1 }) } },
  });
  const u = h.unit(M);
  h.step(1);
  const e = h.spawn('brute', { pos: [9, 9.5] });   // walks from the right into his back
  assert.ok(h.runUntil(() => e.blockedBy === u, 20), 'the enemy is blocked from behind');
  assert.ok(u.skill.activate('DEFAULT', { free: true }), 'S3 cast');
  assert.ok(h.runUntil(() => u.skill.active, 3), 'S3 running');
  const hp0 = e.hp, ammo0 = u.skill.ammoLeft;
  h.run(4);
  assert.ok(u.skill.ammoLeft < ammo0, 'he was hit and countered (bullets spent)');
  assert.ok(e.hp < hp0, 'the counter hit the blocked attacker behind him (kit counter: battle.blockedTargets before his range)');
});

// test/content/branch_s2_first.test.js — 折桠 S2 生存决心: mode S2's FirstAttack (branch_s_2[first]): no damage, at its strike the skill's
// SpAttack makes the enemies around her 战栗; the following attacks hit as usual (docs/rules/sim.md 「일반 공격 타이밍」).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 0, mass: 0 });
const arena = (enemies) => {
  const h = makeBattle({ seed: 5, timeLimit: 300, autoFinish: false, captureNoisy: true, defs: { enemies: { enemy_post: POST } },
    flags: { dpPerSec: 0, dpMax: 999 }, units: [{ chessId: 'chess_char_2_17_a', row: 10, col: 3, uid: 1, carryState: { sp: 999 } }], enemies });
  h.step();
  return h;
};

test('折桠 S2: nothing until her first attack; its strike (Skill_2_Begin 0.6) makes the enemies 战栗 and deals no damage; the next attack hits', () => {
  const h = arena([{ key: 'enemy_post', pos: [10, 3] }]);
  const u = h.unit(1), e = h.b.enemies[0];
  assert.equal(u.skill.id, 'skchr_branch_2', 'her S2 on this form');
  const swings = [], hits = [];
  h.b.on('swing', (c) => { if (c.unit === u) swings.push({ at: h.b.time, c }); }, { priority: -100 });
  h.b.on('damaged', (c) => { if (c.source === u && c.target === e) hits.push(h.b.time); });
  h.b.dealDamage(e, u, { amount: 1, type: 'phys' });    // TAKE_DAMAGE, her SP full
  assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
  const castAt = h.b.time;
  assert.ok(!e.findBuff('tremble'), 'no 战栗 as the skill starts');
  assert.ok(h.runUntil(() => e.findBuff('tremble'), 5), '战栗 at the first attack');
  const first = swings.find((x) => x.at >= castAt - 1e-9);
  assert.ok(first?.c.timing, 'the first swing has its own clip');
  assert.ok(Math.abs(h.b.time - first.at - first.c.timing.strike) < 0.07, `at its strike (${(h.b.time - first.at).toFixed(3)} / ${first.c.timing.strike})`);
  assert.ok(first.c.timing.strike <= 0.6 + 1e-9 && first.c.timing.strike > 0, `0.6 × the swing's scale (${first.c.timing.strike})`);
  assert.equal(hits.filter((t) => t >= castAt).length, 0, 'the first attack deals no damage');
  assert.ok(h.runUntil(() => hits.filter((t) => t >= castAt).length > 0, 5), 'the next attack hits');
  const next = swings.filter((x) => x.at > first.at)[0];
  assert.equal(next.c.timing ?? null, null, 'on the attack clip');
  // the view: the first swing names FirstAttack (its clip and cast, the 9th field), its strike's blast the enemies it reached
  assert.equal(first.c.signal, 'FirstAttack');
  assert.equal(next.c.signal, null, 'the attacks after it are the plain child');
  const sw = h.events.filter((ev) => ev[0] === 'swing' && ev[1] === u.id);
  assert.deepEqual(sw.filter((ev) => ev[8] === 'FirstAttack').length, 1, `${JSON.stringify(sw.slice(0, 3))}`);
  const blast = h.events.find((ev) => ev[0] === 'fx' && ev[1] === 'aoe' && ev[4]?.skill === 'resolve');
  assert.deepEqual(blast?.[4].targets, [e.id]);
});

test('折桠 S2: the first attack waits for an enemy in her attack range; an enemy off it stays free of 战栗 however long the skill runs', () => {
  const h = arena([{ key: 'enemy_post', pos: [10, 4] }]);   // on the skill's 3×3, off her own-tile attack range
  const u = h.unit(1), e = h.b.enemies[0];
  h.b.dealDamage(e, u, { amount: 1, type: 'phys' });
  assert.ok(h.runUntil(() => u.skill.active, 3), 'cast');
  h.run(4);
  assert.ok(u.skill.active && u.mem.branchFirst, 'still waiting');
  assert.ok(!e.findBuff('tremble'), 'no 战栗');
});

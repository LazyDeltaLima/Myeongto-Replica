// test/content/op_buildr.test.js — 폰사이러스 (char_488_buildr, a tier-3 piece of 规程 (act3autochess); kit ops/op-buildr.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, fill, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_3_27_a', B = 'chess_char_3_27_b';
const FORMS = [A, B];
const S1 = 'skcom_charge_cost[3]', S2 = 'skchr_buildr_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dp = (h, u) => h.b.getPlayer(u.ownerId).dp;
const FRONT = [10, 5];
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('S1: +cost DP as soon as its SP is full, by itself, no enemy needed', () => {
  for (const id of FORMS) {
    const r = rec(id, S1);
    assert.equal(r.bb.cost, 12);
    const { h, u } = field(id, { skill: 0 });
    fill(u);
    const was = dp(h, u);
    assert.ok(h.runUntil(() => dp(h, u) > was, 2), `${id}: fires`);
    near(dp(h, u) - was, r.bb.cost, `${id}: DP`);
    assert.equal(u.skill.trigger ?? u.skill.rule, 'SP_FULL');
    done(h);
  }
});

test('S2, first use: +cost DP, ATK and DEF for its duration, then over', () => {
  for (const id of FORMS) {
    const r = rec(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const a0 = u.s.atk, d0 = u.s.def, was = dp(h, u);
    cast(u);
    near(dp(h, u) - was, r.bb.cost, `${id}: DP`);
    near(u.s.atk, a0 * (1 + r.bb.atk), `${id}: ATK`, 1e-2);
    near(u.s.def, d0 * (1 + r.bb.def), `${id}: DEF`, 1e-2);
    h.run(r.duration - 1);
    assert.ok(u.skill.active, `${id}: still on`);
    near(dp(h, u) - was, r.bb.cost, `${id}: no DP over time on the first use`);
    assert.ok(h.runUntil(() => !u.skill.active, 3), `${id}: ends`);
    near(u.s.atk, a0, `${id}: ATK back`, 1e-6);
    done(h);
  }
});

test('S2, second use: +cost DP again, no end, +1 DP every interval', () => {
  for (const id of FORMS) {
    const r = rec(id, S2);
    const iv = r.bb['buildr_s_2[b].interval'], n = r.bb['buildr_s_2[b].cost'];
    assert.equal(iv, id === A ? 4.5 : 4);
    assert.equal(n, 1);
    const { h, u } = field(id, { skill: 1 });
    const a0 = u.s.atk;
    cast(u);
    assert.ok(h.runUntil(() => !u.skill.active, 20));
    const was = dp(h, u);
    cast(u);
    near(dp(h, u) - was, r.bb.cost, `${id}: DP at once`);
    near(u.s.atk, a0 * (1 + r.bb['buildr_s_2[b].atk']), `${id}: ATK`, 1e-2);
    h.run(iv * 3 + 0.2);
    near(dp(h, u) - was, r.bb.cost + 3 * n, `${id}: three gains`);
    h.run(200);
    assert.ok(u.skill.active, `${id}: no end of its own`);
    done(h);
  }
});

test('S2: the uses are counted anew at each deployment; leaving ends the DP flow', () => {
  const { h, u } = field(A, { skill: 1 });
  cast(u);
  assert.ok(h.runUntil(() => !u.skill.active, 20));
  cast(u);
  h.b.retreat(u);
  h.step();
  const was = dp(h, u);
  h.run(20);
  near(dp(h, u), was, 'no DP while down');
  h.b.getPlayer(u.ownerId).dp = 99;
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), 'back');
  cast(u);
  assert.ok(Number.isFinite(u.skill.timeLeft), 'a first use again: it has its duration');
  assert.ok(h.runUntil(() => !u.skill.active, 20), 'and ends');
  done(h);
});

test('T1: max HP ×(1 + max_hp) only after `interval` s on the field, anew at each deployment', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    assert.equal(t.interval, 30);
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    const hp0 = u.s.maxHp;
    h.run(29);
    near(u.s.maxHp, hp0, `${id}: not yet`);
    h.run(1.2);
    near(u.s.maxHp, hp0 * (1 + t.max_hp), `${id}: after it`, 1e-3);
    h.b.retreat(u);
    h.step();
    h.b.getPlayer(u.ownerId).dp = 99;
    assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), `${id}: back`);
    h.step();
    near(u.s.maxHp, hp0, `${id}: anew`);
    h.run(30.2);
    near(u.s.maxHp, hp0 * (1 + t.max_hp), `${id}: again`, 1e-3);
    done(h);
  }
});

test('T1: a 【이동】 is a deployment: the wait starts over and the bonus goes', () => {
  const { h, u } = field(A, { skill: 0 });
  u.skill.locked = true;
  const t = ACT3.chess[A].talents[0].bb, hp0 = u.s.maxHp;
  h.run(20);
  assert.ok(h.b.moveRedeploy(u, 10, 5), 'moved');
  h.run(11);
  near(u.s.maxHp, hp0, 'the old wait is gone');
  h.run(19.2);
  near(u.s.maxHp, hp0 * (1 + t.max_hp), 'after a whole new wait', 1e-3);
  assert.ok(h.b.moveRedeploy(u, 10, 4), 'moved again');
  h.step();
  near(u.s.maxHp, hp0, 'the bonus is gone with it');
  done(h);
});

test('SOL-X: ATK and DEF up while blocking on the elite, nothing on the normal form', () => {
  const b = field(B, { skill: 0 });
  b.u.skill.locked = true;
  const tb = ACT3.chess[B].trait.bb;
  assert.equal(tb.atk, 0.08);
  assert.equal(tb.def, 0.08);
  const a0 = b.u.s.atk, d0 = b.u.s.def;
  const e = b.h.spawn('enemy_dummy', { pos: FRONT });
  block(b.h, b.u, e);
  b.h.step();
  near(b.u.s.atk, a0 * 1.08, 'ATK', 1e-2);
  near(b.u.s.def, d0 * 1.08, 'DEF', 1e-2);
  b.u.blocking.length = 0;
  e.blockedBy = null;
  b.h.run(0.1);
  near(b.u.s.atk, a0, 'ATK back', 1e-6);
  done(b.h);
  const n = field(A, { skill: 0 });
  n.u.skill.locked = true;
  const a1 = n.u.s.atk;
  const f = n.h.spawn('enemy_dummy', { pos: FRONT });
  block(n.h, n.u, f);
  n.h.step();
  near(n.u.s.atk, a1, 'normal: no bonus');
  done(n.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_488_buildr');
});

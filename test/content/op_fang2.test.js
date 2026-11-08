// test/content/op_fang2.test.js — 팽 더 파이어 샤픈드 (char_1036_fang2, a tier-3 piece of 规程 (act3autochess); kit ops/op-fang2.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { S1_DELTA } from '../../server/sim/content/kits/ops/op-fang2.js';

const A = 'chess_char_3_21_a', B = 'chess_char_3_21_b';
const FORMS = [A, B];
const S1 = 'skchr_fang2_1', S2 = 'skchr_fang2_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const dp = (h, u) => h.b.getPlayer(u.ownerId).dp;
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('Trait: a kill gives the trait\'s DP, with S2 on too (normal 1, CHG-X 2)', () => {
  for (const [id, n] of [[A, 1], [B, 2]]) {
    const { h, u } = field(id, { skill: 1 });
    assert.equal(ACT3.chess[id].trait.bb.cost, n);
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    h.step();
    const was = dp(h, u);
    e.hp = 1;
    assert.ok(h.runUntil(() => !e.alive, 5), `${id}: killed`);
    near(dp(h, u) - was, n, `${id}: DP`);
    done(h);
  }
});

test('S1: the next attack strikes twice at atk_scale, S1_DELTA apart', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    cast(u);
    const times = [];
    h.b.on('damaged', (c) => { if (c.source === u && c.target === e) times.push({ t: h.b.time, a: c.dmg.amount }); });
    assert.ok(h.runUntil(() => times.length >= 2, 5), `${id}: two strikes`);
    near(times[1].t - times[0].t, S1_DELTA, `${id}: their gap`, 0.05);
    near(times[0].a, u.s.atk * rec(id, S1).bb.atk_scale, `${id}: first at atk_scale`, 1e-2);
    near(times[1].a, u.s.atk * rec(id, S1).bb.atk_scale, `${id}: second at atk_scale`, 1e-2);
    const n = times.length;
    h.run(0.6);
    assert.equal(times.length, n, `${id}: no third strike before the next swing`);
    done(h);
  }
});

test('S1: a stun between the strikes loses the second; the gap is the prefab\'s 0.25 s', () => {
  assert.equal(S1_DELTA, 0.25);
  const { h, u } = field(A, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  cast(u);
  assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 5), 'first strike');
  h.b.applyStatus(u, 'stun', { duration: 0.6, source: e });
  h.run(0.5);
  assert.equal(hits(h, u, e).length, 1, 'no second strike');
  done(h);
});

test('S1: charges 1 normal, 2 elite; SP cost by rank', () => {
  assert.equal(rec(A, S1).maxChargeTime, 1);
  assert.equal(rec(B, S1).maxChargeTime, 2);
  const b = field(B, { skill: 0 });
  assert.equal(b.u.skill.maxCharges, 2);
  assert.equal(b.u.skill.kind, 'charges');
  const a = field(A, { skill: 0 });
  assert.equal(a.u.skill.kind, 'instant');
  assert.equal(a.u.skill.spCost, rec(A, S1).spCost);
  done(a.h); done(b.h);
});

test('S1: a kill by it gives +cost on top of the trait, on the first or the second strike; a plain attack only the trait', () => {
  for (const id of FORMS) {
    const tr = ACT3.chess[id].trait.bb.cost, more = rec(id, S1).bb.cost;
    for (const [left, what] of [[1, 'first'], [null, 'second']]) {
      const { h, u } = field(id, { skill: 0 });
      const e = h.spawn('enemy_dummy', { pos: FRONT });
      cast(u);
      if (left != null) e.hp = left;
      else h.b.on('damaged', (c) => { if (c.target === e && c.source === u && !e.mem?.low) { (e.mem ??= {}).low = true; e.hp = 1; } });
      const was = dp(h, u);
      assert.ok(h.runUntil(() => !e.alive, 5), `${id} ${what}: killed`);
      near(dp(h, u) - was, tr + more, `${id} ${what}: both`);
      done(h);
    }
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    u.skill.sp = 0;
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    e.hp = 1;
    const was = dp(h, u);
    assert.ok(h.runUntil(() => !e.alive, 5), `${id}: plain kill`);
    near(dp(h, u) - was, tr, `${id}: the trait only`);
    done(h);
  }
});

test('S2: on from the deployment for its duration, then over: ATK, DEF, block; costs no SP', () => {
  for (const id of FORMS) {
    const r = rec(id, S2);
    assert.equal(r.duration, id === A ? 14 : 18);
    const { h, u } = field(id, { skill: 1 });
    assert.ok(u.skill.active, `${id}: on after the deployment`);
    assert.equal(u.skill.kind, 'duration');
    near(u.s.atk, u.base.atk * (1 + r.bb.atk), `${id}: ATK`, 1e-2);
    near(u.s.def, u.base.def * (1 + r.bb.def), `${id}: DEF`, 1e-2);
    assert.equal(u.s.blockCnt, u.base.blockCnt + r.bb.block_cnt, `${id}: block`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 2), `${id}: ends`);
    near(h.b.time, r.duration, `${id}: after its duration`, 0.1);
    near(u.s.atk, u.base.atk, `${id}: ATK back`, 1e-6);
    assert.equal(u.s.blockCnt, u.base.blockCnt, `${id}: block back`);
    h.run(30);
    assert.ok(!u.skill.active, `${id}: not again`);
    done(h);
  }
});

test('S2: she strikes every enemy she blocks while it runs, one when it is over', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
    block(h, u, e1); block(h, u, e2);
    assert.ok(h.runUntil(() => hits(h, u, e1).length > 0 && hits(h, u, e2).length > 0, 5), `${id}: both struck`);
    done(h);
    const o = field(id, { skill: 1 });
    assert.ok(o.h.runUntil(() => !o.u.skill.active, 25));
    const a = o.h.spawn('enemy_dummy', { pos: FRONT }), b = o.h.spawn('enemy_dummy', { pos: FRONT });
    block(o.h, o.u, a);
    assert.ok(o.h.runUntil(() => hits(o.h, o.u, a).length + hits(o.h, o.u, b).length >= 3, 8), `${id}: attacks`);
    assert.equal(hits(o.h, o.u, a).length && hits(o.h, o.u, b).length, 0, `${id}: only one of them`);
    done(o.h);
  }
});

test('S2 starts again with a new deployment', () => {
  const { h, u } = field(A, { skill: 1 });
  assert.ok(h.runUntil(() => !u.skill.active, 20));
  h.b.retreat(u);
  h.step();
  assert.equal(u.alive, false);
  h.b.flags.dpInit = 99;
  h.b.getPlayer(u.ownerId).dp = 99;
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), 'back');
  assert.ok(u.skill.active, 'on again');
  done(h);
});

test('T1 and the withdraw refund act on nothing here: her redeploy costs the record\'s, the first deployment is free', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.base.cost, ACT3.chess[id].stats.cost);
    done(h);
  }
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_1036_fang2');
});

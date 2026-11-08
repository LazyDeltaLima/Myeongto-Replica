// test/content/op_astesi.test.js — 아스테시아 (char_274_astesi, a tier-2 piece of 规程 (act3autochess); kit ops/op-astesi.js): both forms, both skills, the talent, the module's trait.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_2_19_a', B = 'chess_char_2_19_b';
const FORMS = [A, B];
const S1 = 'skchr_astesi_1', S2 = 'skchr_astesi_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('The forms: E1 Lv60 rank 4 no module, E2 Lv55 rank 7 with the module', () => {
  assert.deepEqual(ACT3.chess[A].status, { phase: 1, level: 60, skillLevel: 4, equipLevel: 0 });
  assert.equal(ACT3.chess[B].status.phase, 2);
  assert.equal(ACT3.chess[B].status.level, 55);
  assert.equal(ACT3.chess[B].status.skillLevel, 7);
  assert.equal(ACT3.chess[A].trait?.bb?.damage_scale, undefined);
  assert.equal(ACT3.chess[B].trait.bb.damage_scale, 1.1);
});

test('Her attack is arts', () => {
  const { h, u } = field(A, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 5));
  assert.equal(hits(h, u, e)[0].dmg.type, 'arts');
  done(h);
});

test('T1: one stack of attack speed per interval, the first after a whole one, at most max_stack_cnt', () => {
  for (const [id, v] of [[A, 3], [B, 5]]) {
    const { h, u } = field(id, { skill: 0 });
    const tb = ACT3.chess[id].talents[0].bb;
    assert.equal(tb.interval, 20);
    assert.equal(tb.attack_speed, v);
    const base = u.s.aspd, t0 = h.b.time;
    h.run(tb.interval - 0.5);
    assert.equal(u.s.aspd, base, `${id}: nothing before the first interval`);
    h.run(1);
    near(u.s.aspd, base + v, `${id}: first stack`);
    h.run(tb.interval);
    near(u.s.aspd, base + 2 * v, `${id}: second stack`);
    h.run(tb.interval * (tb.max_stack_cnt + 2));
    near(u.s.aspd, base + tb.max_stack_cnt * v, `${id}: the cap (${h.b.time - t0} s)`);
    done(h);
  }
});

test('T1: a new deployment starts over', () => {
  const { h, u } = field(A, { skill: 0 });
  const base = u.s.aspd, tb = ACT3.chess[A].talents[0].bb;
  h.run(tb.interval + 0.5);
  near(u.s.aspd, base + tb.attack_speed, 'a stack');
  h.b.retreat(u);
  h.step();
  h.b.getPlayer(u.ownerId).dp = 99;
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), 'back');
  h.step();
  assert.equal(u.s.aspd, base, 'none after the new deployment');
  h.run(tb.interval - 0.5);
  assert.equal(u.s.aspd, base, 'the interval counts from the new deployment');
  h.run(1);
  near(u.s.aspd, base + tb.attack_speed, 'one again');
  done(h);
});

test('S1: ATK and DEF up for its duration; one target', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const bb = rec(id, S1).bb, atk = u.s.atk, def = u.s.def;
    cast(u);
    h.step();
    near(u.s.atk, atk * (1 + bb.atk), `${id}: ATK`, 1e-3);
    near(u.s.def, def * (1 + bb.def), `${id}: DEF`, 1e-3);
    const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
    block(h, u, e1);
    assert.ok(h.runUntil(() => hits(h, u, e1).length + hits(h, u, e2).length >= 2, 8));
    assert.equal(hits(h, u, e2).length, 0, `${id}: no second target`);
    assert.ok(h.runUntil(() => !u.skill.active, rec(id, S1).duration + 1), `${id}: ends`);
    h.step();
    near(u.s.atk, atk, `${id}: ATK back`, 1e-3);
    done(h);
  }
});

test('S2: ATK, DEF, block +1 and every enemy she blocks', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const bb = rec(id, S2).bb, atk = u.s.atk, def = u.s.def, bc = u.s.blockCnt;
    assert.equal(bc, 1);
    cast(u);
    h.step();
    near(u.s.atk, atk * (1 + bb.atk), `${id}: ATK`, 1e-3);
    near(u.s.def, def * (1 + bb.def), `${id}: DEF`, 1e-3);
    assert.equal(u.s.blockCnt, bc + bb.block_cnt, `${id}: block`);
    const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
    block(h, u, e1); block(h, u, e2);
    assert.ok(h.runUntil(() => hits(h, u, e1).length > 0 && hits(h, u, e2).length > 0, 5), `${id}: both struck`);
    assert.ok(h.runUntil(() => !u.skill.active, rec(id, S2).duration + 1), `${id}: ends`);
    h.step();
    assert.equal(u.s.blockCnt, bc, `${id}: block back`);
    done(h);
  }
});

test('AFT-Y: what she blocks takes 마법 취약, only the elite and only while blocked', () => {
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  h.run(0.3);
  assert.ok(!e.findBuff('artsFragile'), 'not blocked: none');
  block(h, u, e);
  h.run(0.3);
  assert.ok(e.findBuff('artsFragile'), 'blocked: on');
  near(e.s.artsTakenMul, 1.1, 'the value');
  u.blocking.length = 0; e.blockedBy = null;
  h.run(0.6);
  assert.ok(!e.findBuff('artsFragile'), 'released: gone');
  done(h);
  const o = field(A, { skill: 0 });
  const x = o.h.spawn('enemy_dummy', { pos: FRONT });
  block(o.h, o.u, x);
  o.h.run(0.5);
  assert.ok(!x.findBuff('artsFragile'), 'the normal form has no module');
  done(o.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_274_astesi');
});

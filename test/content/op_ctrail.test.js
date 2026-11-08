// test/content/op_ctrail.test.js — 콘트레일 (char_4165_ctrail, a tier-2 piece of 规程 (act3autochess); kit ops/op-ctrail.js): both forms, both skills, the talent, take-off and landing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { FLY_CLIP } from '../../server/sim/content/kits/ops/op-ctrail.js';

const A = 'chess_char_2_11_a', B = 'chess_char_2_11_b';
const FORMS = [A, B];
const S1 = 'skchr_ctrail_1', S2 = 'skchr_ctrail_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const air = (u) => !!u.s.flags.liftoff;
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const pastBorn = (h, u) => { h.run(Math.max(0, u.bornUntil - h.b.time) + 0.05); };
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('On the ground with S2 selected: blocks ground enemies, not flyers; shoots ground and air', () => {
  const { h, u } = field(A, { skill: 1 });
  pastBorn(h, u);
  assert.equal(air(u), false);
  assert.ok(!u.s.flags.blockFly, 'the profession\'s permanent air block is gone');
  assert.equal(u.hasBuff('trait:skywalker'), false);
  assert.equal(u.s.blockCnt, 2);
  assert.ok(u.profile.canHitFly, 'hits flyers');
  assert.equal(u.profile.attack, 'ranged');
  const f = h.spawn('enemy_fly', { pos: FRONT });
  assert.ok(h.runUntil(() => hits(h, u, f).length > 0, 8), 'a flyer is shot');
  done(h);
});

test('T1: on the ground DEF +def and no atk_scale; in the air atk_scale and no DEF', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const t = ACT3.chess[id].talents[0].bb, base = u.base?.def ?? ACT3.chess[id].stats.def;
    pastBorn(h, u);
    near(u.s.def, base * (1 + t.def), `${id}: DEF on the ground`, 1e-3);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 8));
    near(hits(h, u, e)[0].dmg.amount, u.s.atk, `${id}: no scale on the ground`, 1e-2);
    cast(u);
    h.step();
    near(u.s.def, base, `${id}: no DEF once it starts`, 1e-3);
    done(h);
  }
});

test('S2: airborne from the cast until the landing clip has played, no attack through the clips', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    pastBorn(h, u);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    block(h, u, e);
    assert.ok(u.blocking.includes(e));
    cast(u);
    h.step();
    assert.equal(air(u), true, `${id}: airborne at once`);
    assert.equal(!!u.s.flags.blockFly, true, `${id}: air block`);
    assert.ok(!u.blocking.includes(e), `${id}: the ground enemy is let go`);
    const n = hits(h, u, e).length;
    h.run(FLY_CLIP - 0.1);
    assert.equal(hits(h, u, e).length, n, `${id}: no attack during the take-off clip`);
    assert.ok(h.runUntil(() => hits(h, u, e).length > n, 4), `${id}: attacks after it`);
    assert.ok(h.runUntil(() => !u.skill.active, rec(id, S2).duration + 1), `${id}: ends`);
    const m = hits(h, u, e).length;
    assert.equal(air(u), true, `${id}: still airborne`);
    h.run(FLY_CLIP - 0.1);
    assert.equal(air(u), true, `${id}: through the clip`);
    assert.equal(hits(h, u, e).length, m, `${id}: no attack during the landing clip`);
    h.run(0.2);
    assert.equal(air(u), false, `${id}: landed`);
    done(h);
  }
});

test('S2: atk, atk_scale on her damage, 3-1 range, the skill\'s range back to base when landed', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const bb = rec(id, S2).bb, t = ACT3.chess[id].talents[0].bb, base = u.rangeKeys.length;
    pastBorn(h, u);
    const atk = u.s.atk;
    cast(u);
    h.run(FLY_CLIP + 0.1);
    near(u.s.atk, atk * (1 + bb.atk), `${id}: ATK`, 1e-3);
    assert.equal(u.rangeKeys.length, rec(id, S2).rangeGrid.length, `${id}: skill range`);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 5));
    near(hits(h, u, e)[0].dmg.amount, u.s.atk * t.atk_scale, `${id}: atk_scale in the air`, 1e-2);
    assert.ok(h.runUntil(() => !u.skill.active, bb.duration ?? rec(id, S2).duration + 1));
    h.run(FLY_CLIP + 0.1);
    h.step();
    assert.equal(u.rangeKeys.length, base, `${id}: range back`);
    done(h);
  }
});

function s2Targets(ground, fly) {
  const { h, u } = field(B, { skill: 1 });
  pastBorn(h, u);
  cast(u);
  h.run(FLY_CLIP + 0.05);
  const gs = Array.from({ length: ground }, () => h.spawn('enemy_dummy', { pos: FRONT }));
  const fs = Array.from({ length: fly }, () => h.spawn('enemy_fly', { pos: FRONT }));
  const all = [...gs, ...fs];
  assert.ok(h.runUntil(() => all.some((e) => hits(h, u, e).length > 0), 5), 'attacks');
  h.run(0.3);
  const g = gs.filter((e) => hits(h, u, e).length).length, f = fs.filter((e) => hits(h, u, e).length).length;
  done(h);
  return [g, f];
}

test('S2 targets: at most 2 ground and 3 air, 3 in all (PRTS 비고)', () => {
  assert.deepEqual(s2Targets(4, 0), [2, 0], 'ground only');
  assert.deepEqual(s2Targets(0, 4), [0, 3], 'air only');
  const [g, f] = s2Targets(4, 1);
  assert.deepEqual([g, f], [2, 1], 'two ground and the flyer');
  const [g2, f2] = s2Targets(4, 4);
  assert.equal(g2 + f2, 3, 'three in all');
  assert.ok(g2 <= 2);
});

test('S2: a flyer hit gets 정지 for attack@sluggish, a ground enemy none', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    pastBorn(h, u);
    cast(u);
    h.run(FLY_CLIP + 0.05);
    const g = h.spawn('enemy_dummy', { pos: FRONT }), f = h.spawn('enemy_fly', { pos: FRONT });
    assert.ok(h.runUntil(() => hits(h, u, f).length > 0 && hits(h, u, g).length > 0, 5));
    assert.equal(f.findBuff('sluggish').duration, rec(id, S2).bb['attack@sluggish'], `${id}: its time`);
    assert.ok(!g.findBuff('sluggish'), `${id}: a ground enemy none`);
    done(h);
  }
});

test('S1 starts with the deployment: airborne once the born state ends, no SP; ATK and phys dodge', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const bb = rec(id, S1).bb;
    assert.equal(u.skill.spCost, 0);
    assert.ok(u.skill.active, `${id}: on at once`);
    assert.equal(u.skill.timeLeft > rec(id, S1).duration - 1, true, `${id}: its duration`);
    pastBorn(h, u);
    assert.equal(air(u), true, `${id}: airborne after the born state`);
    near(u.s.dodgePhys, bb.prob, `${id}: dodge`);
    assert.ok(u.s.atk > ACT3.chess[id].stats.atk * (1 + bb.atk) * 0.99, `${id}: ATK`);
    done(h);
  }
});

test('Landing lets go of the flyers she held: only once the clip has played', () => {
  const { h, u } = field(A, { skill: 1 });
  pastBorn(h, u);
  cast(u);
  h.run(FLY_CLIP + 0.1);
  const f = h.spawn('enemy_fly', { pos: FRONT });
  block(h, u, f);
  assert.ok(h.runUntil(() => !u.skill.active, rec(A, S2).duration + 1), 'ends');
  h.run(FLY_CLIP - 0.1);
  assert.ok(u.blocking.includes(f), 'held through the clip');
  h.run(0.2);
  assert.ok(!u.blocking.includes(f), 'let go');
  done(h);
});

test('S1: after a deployment the take-off clip waits for the born state, and so does 起飞', () => {
  const { h, u } = field(A, { skill: 0 });
  h.run(FLY_CLIP + 0.1);
  h.b.retreat(u);
  h.step();
  h.b.flags.bornTime = 0.5;   // (the harness has none; the server's constants.js BORN_TIME)
  h.b.getPlayer(u.ownerId).dp = 99;
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), 'back');
  assert.ok(h.b.time < u.bornUntil, 'in its born state');
  assert.equal(air(u), false, 'not airborne yet');
  near(u.skillStateUntil, u.bornUntil + FLY_CLIP, 'the clip after it', 1e-3);
  h.run(u.bornUntil - h.b.time + 0.05);
  assert.equal(air(u), true, 'airborne as the clip starts');
  done(h);
});

test('S1: no attack through the born state and the take-off clip; lands after its duration; the range stays the skill\'s', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const r = rec(id, S1);
    assert.equal(u.rangeKeys.length, r.rangeGrid.length, `${id}: the skill's range from the start`);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    const until = u.bornUntil + FLY_CLIP;
    h.run(Math.max(0, until - h.b.time - 0.1));
    assert.equal(hits(h, u, e).length, 0, `${id}: not before the clip's end`);
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 4), `${id}: attacks after it`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 2), `${id}: ends`);
    assert.equal(air(u), true, `${id}: still airborne`);
    h.run(FLY_CLIP + 0.1);
    assert.equal(air(u), false, `${id}: landed`);
    h.step();
    assert.equal(u.rangeKeys.length, r.rangeGrid.length, `${id}: the skill's range stays (Default_S1)`);
    near(u.s.dodgePhys, 0, `${id}: no dodge left`);
    done(h);
  }
});

test('S1 again with a new deployment', () => {
  const { h, u } = field(A, { skill: 0 });
  assert.ok(h.runUntil(() => !u.skill.active, rec(A, S1).duration + 2));
  h.run(FLY_CLIP + 0.1);
  h.b.retreat(u);
  h.step();
  h.b.getPlayer(u.ownerId).dp = 99;
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 5), 'back');
  assert.ok(u.skill.active, 'on again');
  pastBorn(h, u);
  assert.equal(air(u), true, 'airborne again');
  done(h);
});

test('The four clips last FLY_CLIP in the model, front and back', () => {
  const { front, back } = JSON.parse(readFileSync(new URL('../../data/assets.json', import.meta.url), 'utf8')).chars.char_4165_ctrail.spine;
  for (const k of ['Skill_Begin', 'Skill_End', 'Skill_2_Begin', 'Skill_2_End']) {
    assert.equal(front.animations[k], FLY_CLIP, `front ${k}`);
    assert.equal(back.animations[k], FLY_CLIP, `back ${k}`);
  }
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4165_ctrail');
});

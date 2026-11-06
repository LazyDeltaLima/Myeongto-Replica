// test/content/op_liesel.test.js — 리프레사 (char_4031_liesel, a tier-2 piece of the season not out yet; kit ops/op-liesel.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { SKILL_SPLASH, LANDS } from '../../server/sim/content/kits/ops/op-liesel.js';

const A = 'chess_char_2_nliesel_a', B = 'chess_char_2_nliesel_b';
const FORMS = [A, B];
const S1 = 'skchr_liesel_1', S2 = 'skchr_liesel_2';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const shotsOn = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('liesel:shot'));
const dotsOn = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('periodic'));
const attacksOn = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.isAttack);
const dotKey = (u) => `liesel_s_2[dot]:${u.id}`;

/** When each damage on `e` lands. */
function clock(h, e) {
  const at = [];
  h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.tags?.includes('liesel:shot')) at.push(h.b.time); });
  return at;
}

test('T1: an attack with 3 enemies in its splash deals × damage_scale, with 2 it does not', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    assert.equal(t.min_target_cnt, 3);
    const amount = (n) => {
      const { h, u } = field(id, { skill: 1 });
      u.skill.locked = true;
      const main = h.spawn('enemy_dummy', { pos: [10, 6] });
      for (let i = 1; i < n; i++) h.spawn('enemy_dummy', { pos: [10, 6] });
      h.runUntil(() => attacksOn(h, main).length >= 1, 10);
      done(h);
      return attacksOn(h, main)[0].amount;
    };
    near(amount(3) / amount(2), t.damage_scale, `${id}: 3 against 2`);
    near(amount(4) / amount(3), 1, `${id}: more adds nothing`);
  }
});

test('S1: the next attack at atk_scale, with the wider splash; the normal attack keeps its own', () => {
  assert.ok(SKILL_SPLASH > 1.1);
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    u.skill.locked = true;
    const main = h.spawn('enemy_dummy', { pos: [10, 6] });
    const side = h.spawn('enemy_dummy', { pos: [10, 7.5] });
    h.runUntil(() => attacksOn(h, main).length >= 1, 10);
    assert.equal(attacksOn(h, side).length, 0, `${id}: 1.5 tiles is out of the normal splash`);
    const plain = attacksOn(h, main)[0].amount;
    u.skill.locked = false;
    cast(u);
    h.runUntil(() => attacksOn(h, side).length >= 1, 10);
    near(attacksOn(h, side)[0].amount, plain * b1.atk_scale, `${id}: atk_scale on the splash`);
    assert.ok(attacksOn(h, side)[0].dmg.isSkill);
    done(h);
  }
});

test('S1: the charges of the table', () => {
  assert.equal(NEXT.chess[A].skills.find((s) => s.skillId === S1).maxChargeTime, 1);
  assert.equal(NEXT.chess[B].skills.find((s) => s.skillId === S1).maxChargeTime, 2);
  const { u } = field(B, { skill: 0 });
  assert.equal(u.skill.spec.kind, 'charges');
  assert.equal(field(A, { skill: 0 }).u.skill.spec.kind, 'instant');
});

test('S2: three shots at three different enemies, landing in the order of the table; damage at atk_scale', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    u.skill.locked = false;
    // corners of her range, further apart than a shot's splash
    const es = [h.spawn('enemy_dummy', { pos: [9, 4] }), h.spawn('enemy_dummy', { pos: [9, 6] }), h.spawn('enemy_dummy', { pos: [11, 5] })];
    const clocks = es.map((e) => clock(h, e));
    cast(u);
    h.strike(u);
    const t0 = h.b.time;
    h.run(LANDS.at(-1) + 0.2);
    for (const [i, e] of es.entries()) assert.equal(shotsOn(h, e).length, 1, `${id}: enemy ${i} took one shot`);
    const got = clocks.flat().map((t) => t - t0).sort((a, b) => a - b);
    got.forEach((t, i) => assert.ok(Math.abs(t - LANDS[i]) < 0.1, `${id}: shot ${i} at ${t}`));
    assert.ok(shotsOn(h, es[0])[0].dmg.isSkill && shotsOn(h, es[0])[0].dmg.isAttack);
    near(shotsOn(h, es[0])[0].dmg.amount, u.s.atk * b2.atk_scale, `${id}: atk_scale`);
    done(h);
  }
});

test('S2: one enemy takes one shot (the lock), and can be chosen again after it', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  h.strike(u);
  h.run(LANDS.at(-1) + 0.3);
  assert.equal(shotsOn(h, e).length, 1, 'one');
  assert.ok(!e.findBuff(`liesel_s_2[exclude]:${u.id}`), 'the lock is over');
  cast(u);
  h.strike(u);
  h.run(LANDS.at(-1) + 0.3);
  assert.equal(shotsOn(h, e).length, 2, 'again');
  done(h);
});

test('S2: the lock is her own: a second 리프레사 can choose the enemy she locked', () => {
  const { h, u } = field(B, { skill: 1, more: [{ uid: 2, id: B, skill: 1, row: 10, col: 5 }] });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  const v = h.unit(2);
  cast(u);
  h.strike(u);
  cast(v);
  h.strike(v);
  assert.ok(e.findBuff(`liesel_s_2[exclude]:${u.id}`) && e.findBuff(`liesel_s_2[exclude]:${v.id}`));
  h.run(LANDS.at(-1) + 0.3);
  assert.equal(shotsOn(h, e).length, 2, 'one from each');
  done(h);
});

test('S2: the splash of a shot, 3 in it × damage_scale, 2 not; it follows its target', () => {
  const t = NEXT.chess[B].talents[0].bb;
  const amountWith = (n) => {
    const { h, u } = field(B, { skill: 1 });
    const main = h.spawn('enemy_dummy', { pos: [10, 6] });
    const near1 = [];
    for (let i = 1; i < n; i++) near1.push(h.spawn('enemy_dummy', { pos: [10, 7.5] }));
    const far = h.spawn('enemy_dummy', { pos: [10, 8] });
    far.x = 30; far.y = 30;
    cast(u);
    h.strike(u);
    h.run(LANDS.at(-1) + 0.3);
    done(h);
    near1.forEach((e) => assert.ok(shotsOn(h, e).length >= 1, 'in the splash of 1.7'));
    assert.equal(shotsOn(h, far).length, 0, 'not far away');
    return shotsOn(h, main)[0].amount;
  };
  near(amountWith(3) / amountWith(2), t.damage_scale, '3 against 2');

  // a target moved after the shot left: the landing is where it stands then
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  const left = h.spawn('enemy_dummy', { pos: [2, 12] });
  cast(u);
  h.strike(u);
  e.x = left.x; e.y = left.y;
  h.run(LANDS[0] + 0.1);
  assert.equal(shotsOn(h, left).length, 1, 'beside the moved target');
  done(h);
});

test('S2: the dot, a second each, at the ATK of when the shot left, no source, no talent ×', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.spawn('enemy_dummy', { pos: [10, 6] }); h.spawn('enemy_dummy', { pos: [10, 6] }); // 3 in the splash: the shot gets × damage_scale, the dot does not
    cast(u);
    h.strike(u);
    const cached = u.s.atk;
    h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 1 } });
    h.runUntil(() => e.findBuff(dotKey(u)), 3);
    const shot = shotsOn(h, e)[0];
    assert.ok(shot.dmg.mul > 1 || NEXT.chess[id].talents[0].bb.damage_scale === 1, `${id}: × on the shot`);
    near(shot.dmg.amount, u.s.atk * b2.atk_scale, `${id}: the shot reads ATK on landing`);
    const buff = e.findBuff(dotKey(u));
    assert.ok(Math.abs(buff.timeLeft - b2['liesel_s_2[dot].duration']) < 0.1, `${id}: duration ${buff.timeLeft}`);
    h.run(0.5);
    assert.equal(dotsOn(h, e).length, 0, `${id}: the first tick comes after a second`);
    h.run(1);
    const d = dotsOn(h, e)[0];
    assert.ok(d, `${id}: tick`);
    assert.ok(d.dmg.sourceless, `${id}: no source`);
    assert.equal(d.type, 'arts');
    near(d.dmg.amount, cached * b2['liesel_s_2[dot].atk_scale'], `${id}: cached ATK`);
    assert.ok(!(d.dmg.mul > 1), `${id}: no talent ×`);
    done(h);
  }
});

test('S2: nothing lands once she is gone', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  h.strike(u);
  h.b.loseHp(u, 1e9, { silent: true });
  h.run(LANDS.at(-1) + 0.3);
  assert.ok(!u.alive);
  assert.equal(shotsOn(h, e).length, 0);
  done(h);
});

test('a real match fields both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4031_liesel');
});

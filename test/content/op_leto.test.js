// test/content/op_leto.test.js — 레토 (char_194_leto, a tier-1 piece of the season not out yet; kit ops/op-leto.js): both forms, both skills.
// Run: node --test test/content/op_leto.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, fill, realMatch } from '../helpers/nextSeason.js';

const A = 'chess_char_1_nleto_a', B = 'chess_char_1_nleto_b';
const FORMS = [A, B];
const S1 = 'skcom_quickattack[3]', S2 = 'skchr_leto_2';
const T1 = 'leto_t_1[attack_speed]', LOR = 'leto_e_002_tr[atk_speed]';
const ISTINA = 'chess_char_2_nglassb_a';   // a student, MANUAL skills
const UKUSIK = 'chess_char_3_nturdus_a';   // of Ursus, no student
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const t1Of = (id) => NEXT.chess[id].talents[0].bb.attack_speed;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e || c.unit === e);

test('the group tags her talent and S2 read: she and 이스티나 are students, 우쿠시크 is not', () => {
  assert.ok(NEXT.chess[A].powers.includes('student'));
  assert.ok(NEXT.chess[ISTINA].powers.includes('student'));
  assert.ok(!NEXT.chess[UKUSIK].powers.includes('student'));
});

test('T1: with either skill on, ASPD on every student wherever it stands and on herself; it ends with the skill', () => {
  for (const id of FORMS) for (const skill of [0, 1]) {
    const { h, u } = field(id, { skill, more: [{ uid: 2, id: ISTINA, skill: 0, row: 9, col: 7 }, { uid: 3, id: UKUSIK, skill: 0, row: 9, col: 5 }] });
    assert.ok(!u.findBuff(T1), 'none before the skill');
    cast(u);
    h.step();
    const v = t1Of(id);
    assert.equal(u.findBuff(T1).mods.aspd, v, `${id} ${skill}: herself`);
    assert.equal(h.unit(2).findBuff(T1).mods.aspd, v, `${id} ${skill}: a student far away`);
    assert.ok(!h.unit(3).findBuff(T1), `${id} ${skill}: no student`);
    u.skill.end('test');
    h.step();
    assert.ok(!u.findBuff(T1), `${id} ${skill}: ended on herself`);
    assert.ok(!h.unit(2).findBuff(T1), `${id} ${skill}: ended on the student`);
    done(h);
  }
});

test('T1: a student deployed during the skill holds it too; it ends as she leaves the field', () => {
  const { h, u } = field(A, { more: [{ uid: 2, id: ISTINA, skill: 0, row: 9, col: 7 }] });
  const other = h.unit(2);
  cast(u);
  h.step();
  other.findBuff(T1) && h.b.removeBuff(other, T1);   // as if it came on the field now
  h.step();
  assert.ok(other.findBuff(T1), 'given again on the next tick');
  h.b.loseHp(u, u.hp + 1);
  h.step();
  assert.equal(u.alive, false);
  assert.ok(!other.findBuff(T1), 'gone with her');
  done(h);
});

test('S1: ATK and ASPD from its blackboard', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const bb = bbOf(id, S1), atk = u.s.atk, aspd = u.s.aspd;
    cast(u);
    h.step();
    near(u.s.atk, atk * (1 + bb.atk), `${id}: ATK`);
    near(u.s.aspd, aspd + bb.attack_speed + t1Of(id), `${id}: ASPD with T1`);
    done(h);
  }
});

test('S2: ATK +, two targets, ranged at 100%; outside it one target at the trait rate', () => {
  for (const id of FORMS) {
    const rate = NEXT.chess[id].trait.bb.atk_scale;
    assert.equal(rate, 0.8);
    const { h, u } = field(id);
    // two targets on a tile of her range that is neither hers nor the one in front: a ranged swing
    const a = h.spawn('enemy_dummy', { pos: [10, 7] }), b = h.spawn('enemy_dummy', { pos: [10, 7] });
    const atk0 = u.s.atk;
    h.runUntil(() => dmgOn(h, a).length + dmgOn(h, b).length > 0, 10);
    const first = [...dmgOn(h, a), ...dmgOn(h, b)];
    assert.equal(first.length, 1, `${id}: one target`);
    const amountOf = (c) => c.dmg?.raw ?? c.dmg?.amount;
    near(amountOf(first[0]), atk0 * rate, `${id}: ranged × trait`);

    cast(u);
    h.step();
    near(u.s.atk, atk0 * (1 + bbOf(id, S2).atk), `${id}: ATK`);
    const n0 = dmgOn(h, a).length, n1 = dmgOn(h, b).length;
    h.runUntil(() => dmgOn(h, a).length > n0 && dmgOn(h, b).length > n1, 10);
    assert.ok(dmgOn(h, a).length > n0 && dmgOn(h, b).length > n1, `${id}: both hit`);
    near(amountOf(dmgOn(h, a)[n0]), u.s.atk, `${id}: ranged at 100%`);
    done(h);
  }
});

test('S2 casts a ready MANUAL skill of a student at once: no other camp, none still charging, none silenced', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { more: [
      { uid: 2, id: ISTINA, skill: 0, row: 9, col: 7 }, { uid: 3, id: UKUSIK, skill: 0, row: 9, col: 5 },
      { uid: 4, id: 'chess_char_2_nglassb_b', skill: 1, row: 9, col: 3 }, { uid: 5, id: ISTINA, skill: 1, row: 11, col: 7 },
    ] });
    const ready = h.unit(2), other = h.unit(3), charging = h.unit(4), mute = h.unit(5);
    fill(ready); fill(other); fill(mute);
    charging.skill.sp = 0;
    h.b.applyStatus(mute, 'silence', { duration: 30, source: null });
    assert.equal(ready.skill.active, false);
    cast(u);
    assert.equal(ready.skill.active, true, `${id}: a ready student`);
    assert.equal(other.skill.active, false, `${id}: no student`);
    assert.equal(charging.skill.active, false, `${id}: still charging`);
    assert.equal(mute.skill.active, false, `${id}: silenced`);
    done(h);
  }
});

test('S1 calls nobody: only S2 sets off the other students', () => {
  const { h, u } = field(A, { skill: 0, more: [{ uid: 2, id: ISTINA, skill: 0, row: 9, col: 7 }] });
  const ready = h.unit(2);
  fill(ready);
  cast(u);
  assert.equal(ready.skill.active, false);
  done(h);
});

test('LOR-Y (elite): ASPD + with cnt enemies on the tiles of her initial range, off again below it; the normal form has none', () => {
  const mb = NEXT.chess[B].talents.find((t) => t.fromModule).bb;
  assert.deepEqual([mb.cnt, mb.attack_speed], [2, 12]);
  const { h, u } = field(B);
  h.run(0.2);
  assert.ok(!u.findBuff(LOR), 'no enemy');
  const e1 = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.run(0.2);
  assert.ok(!u.findBuff(LOR), 'one enemy');
  const e2 = h.spawn('enemy_dummy', { pos: [10, 7] });
  h.run(0.2);
  assert.equal(u.findBuff(LOR).mods.aspd, mb.attack_speed, 'two enemies');
  h.b.loseHp(e1, e1.hp + 1);
  h.run(0.2);
  assert.ok(!u.findBuff(LOR), 'one again');
  assert.ok(e2.alive);
  done(h);

  const n = field(A);
  n.h.spawn('enemy_dummy', { pos: [10, 6] });
  n.h.spawn('enemy_dummy', { pos: [10, 7] });
  n.h.run(0.3);
  assert.ok(!n.u.findBuff(LOR), 'normal form');
  done(n.h);
});

test('real match path: buys, places and fights with no handler error', async () => {
  const u = await realMatch(A, 'char_194_leto');
  assert.equal(u.skill.id, S2);
});

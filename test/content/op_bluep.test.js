// test/content/op_bluep.test.js — 블루포이즌 (char_129_bluep, a tier-2 piece of the season not out yet; kit ops/op-bluep.js): both forms, both skills.
// Run: node --test test/content/op_bluep.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';

const A = 'chess_char_2_nbluep_a', B = 'chess_char_2_nbluep_b';
const FORMS = [A, B];
const S1 = 'skchr_bluep_1', S2 = 'skchr_bluep_2';
const POISON = 'bluep_t_1', ASPD = 'bluep_e_t_10[atk_speed]';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const t1 = (id) => NEXT.chess[id].talents[0].bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const ticks = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('dot'));

test('T1: an attack poisons its target: the blackboard amount each second, arts, no source, three ticks from one hit', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.runUntil(() => !!e.findBuff(POISON), 10);
    const hit = h.b.time;
    u.profile = { ...u.profile, noAttack: true };   // that one hit only
    u.atkCd = 1e9;
    h.run(5);
    const list = ticks(h, e).filter((c) => c.amount > 0);
    assert.ok(list.length >= 3, `${id}: ${list.length} ticks`);
    for (const c of list) {
      assert.equal(c.type, 'arts', id);
      assert.equal(c.dmg.sourceless, true, id);
      near(c.amount, t1(id).poison_damage, `${id}: amount`);
    }
    assert.ok(h.b.time > hit, id);
    done(h);
  }
});

test('T1: a hit on a poisoned enemy resets the time and keeps the first amount; one poison whoever shot', () => {
  const { h, u } = field(A, { skill: 1, more: [{ uid: 2, id: B, skill: 1, row: 10, col: 3 }] });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.runUntil(() => !!e.findBuff(POISON), 10);
  const first = e.findBuff(POISON);
  const dur = t1(A).duration;
  first.timeLeft = 0.5;
  h.runUntil(() => first.timeLeft > 1, 5);
  assert.ok(e.findBuff(POISON) === first, 'the same buff');
  near(first.timeLeft, Math.min(first.timeLeft, dur), 'time');
  assert.equal(e.buffs.filter((b) => b.key === POISON).length, 1);
  const shooter = first.source;
  h.run(1.2);
  const seen = new Set(ticks(h, e).map((c) => c.amount));
  assert.equal(seen.size, 1, `amounts ${[...seen]}`);
  near([...seen][0], t1(NEXT.chess[A].chessId === shooter.defId ? A : B).poison_damage, 'first shooter\'s amount');
  assert.ok(u.alive);
  done(h);
});

test('S1: two targets at atk_scale; a fresh poison from it is multiplied, a poison already there is not', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const e1 = h.spawn('enemy_dummy', { pos: [10, 5] }), e2 = h.spawn('enemy_dummy', { pos: [10, 6] });
    const old = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.b.addBuff(old, { key: POISON, source: u, duration: 30, interval: 1, refresh: 'extend', onTick: () => {} });
    h.hooks.damaged.length = 0;
    u.atkCd = 0;
    cast(u);
    h.runUntil(() => dmgOn(h, e1).length + dmgOn(h, e2).length + dmgOn(h, old).length >= 2, 6);
    const hit = [e1, e2, old].filter((e) => dmgOn(h, e).some((c) => c.dmg?.isAttack && c.dmg.isSkill));
    assert.equal(hit.length, 2, `${id}: two targets`);
    const fresh = hit.find((e) => e !== old);
    h.run(1.1);
    const tick = ticks(h, fresh).find((c) => c.amount > 0);
    assert.ok(tick, `${id}: its tick`);
    near(tick.amount, t1(id).poison_damage * b1.atk_scale, `${id}: tick`);
    done(h);
  }
});

test('S2: ATK +, three targets, one round only (its attack@times is 1), and the fly priority of the branch', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    assert.equal(b2['attack@times'], 1);
    const { h, u } = field(id, { skill: 1 });
    const es = [[10, 5], [10, 6], [10, 7], [9, 6]].map((pos) => h.spawn('enemy_dummy', { pos }));
    const fly = h.spawn('enemy_fly', { pos: [11, 6] });
    const atk = u.s.atk;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`);
    h.hooks.damaged.length = 0;
    h.runUntil(() => h.hooksOf('damaged').some((c) => c.dmg?.isAttack), 6);
    h.run(0.15);   // more than a volley's spread of arrival
    const shot = [...es, fly].filter((e) => dmgOn(h, e).some((c) => c.dmg?.isAttack));
    assert.equal(shot.length, 3, `${id}: ${shot.length}`);
    assert.ok(shot.includes(fly), `${id}: the flyer first`);
    for (const e of shot) assert.equal(dmgOn(h, e).filter((c) => c.dmg?.isAttack).length, 1, `${id}: one arrow each`);
    done(h);
  }
});

test('MAR-Y: ASPD + while a ground enemy stands in range, not for a flyer; the normal form has no module', () => {
  const v = NEXT.chess[B].talents.find((t) => t.index === -1).bb.attack_speed;
  assert.equal(v, 8);
  const { h, u } = field(B);
  assert.ok(!u.findBuff(ASPD));
  const fly = h.spawn('enemy_fly', { pos: [10, 6] });
  h.step(2);
  assert.ok(!u.findBuff(ASPD), 'a flyer does not count');
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.step(2);
  assert.equal(u.findBuff(ASPD).mods.aspd, v);
  h.b.kill(e);
  h.step(2);
  assert.ok(!u.findBuff(ASPD), 'gone with it');
  assert.ok(fly.alive);
  done(h);
  const n = field(A);
  n.h.spawn('enemy_dummy', { pos: [10, 6] });
  n.h.step(2);
  assert.ok(!n.u.findBuff(ASPD));
  done(n.h);
});

test('the real match path: bought, placed and fought in both skills', async () => {
  const u = await realMatch(A, 'char_129_bluep');
  assert.ok(u.skill);
});

// test/content/op_ethan.test.js — 에단 (char_355_ethan, a tier-3 piece of the season not out yet; kit ops/op-ethan.js): both forms, both skills, the talent, AMB-X.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';

const A = 'chess_char_3_nethan_a', B = 'chess_char_3_nethan_b';
const FORMS = [A, B];
const S1 = 'skchr_ethan_1', S2 = 'skchr_ethan_2';
const rec = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const POISON = 'ethan_s_1';
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
// (a sourceless tick has no `source`)
const dots = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg.tags?.includes('dot'));

test('The trait: every enemy in range, 50% dodge, 嘲讽 −1', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    near(u.s.dodgePhys, 0.5, `${id}: phys dodge`);
    near(u.s.dodgeArts, 0.5, `${id}: arts dodge`);
    const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
    assert.ok(h.runUntil(() => hits(h, u, e1).length > 0 && hits(h, u, e2).length > 0, 8), `${id}: both struck by one attack`);
    assert.equal(hits(h, u, e1).length, hits(h, u, e2).length, `${id}: as many`);
    done(h);
  }
});

test('S1 is passive: no SP, on from the deployment, and the poison is on every target hit', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.kind, 'passive');
    assert.equal(u.skill.spCost, 0);
    const e1 = h.spawn('enemy_dummy', { pos: FRONT, res: 0 }), e2 = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
    assert.ok(h.runUntil(() => e1.findBuff(POISON) && e2.findBuff(POISON), 8), `${id}: both poisoned`);
    done(h);
  }
});

test('S1: the poison ticks attack@poison_damage arts a second, the first after 1 s, sourceless, for attack@duration s', () => {
  for (const id of FORMS) {
    const { h } = field(id, { skill: 0 });
    const bb = rec(id, S1).bb;
    const e = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
    assert.ok(h.runUntil(() => e.findBuff(POISON), 8), `${id}: poisoned`);
    const t0 = h.b.time, was = dots(h, e).length;
    h.run(0.8);
    assert.equal(dots(h, e).length, was, `${id}: nothing before 1 s`);
    assert.ok(h.runUntil(() => dots(h, e).length > was, 0.5), `${id}: the first tick`);
    near(h.b.time - t0, 1, `${id}: at 1 s`, 0.1);
    const d = dots(h, e)[was];
    assert.equal(d.dmg.type, 'arts');
    assert.equal(d.dmg.sourceless, true);
    near(d.dmg.amount, bb['attack@poison_damage'], `${id}: its amount`);
    assert.equal(e.findBuff(POISON).duration, bb['attack@duration'], `${id}: its time`);
    done(h);
  }
});

test('S1: a hit on a poisoned enemy resets the time and the amount stays, whatever her ATK', () => {
  // (the elite: its poison outlasts her 3.5 s attack interval, the normal form's runs out first)
  const { h, u } = field(B, { skill: 0 });
  const bb = rec(B, S1).bb, dur = bb['attack@duration'];
  assert.ok(dur > NEXT.chess[B].stats.bat, 'it outlasts the interval');
  const e = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
  const attacks = () => hits(h, u, e).filter((c) => c.dmg.isAttack).length;
  assert.ok(h.runUntil(() => e.findBuff(POISON), 8));
  const held = e.findBuff(POISON), n = attacks();
  h.b.addBuff(u, { key: 'test:atk', mods: { atkPct: 5 } });
  h.run(1);
  assert.ok(held.timeLeft < dur - 0.5, 'it runs down');
  assert.ok(h.runUntil(() => attacks() > n, 8), 'hit again');
  assert.ok(e.findBuff(POISON) === held, 'the same poison');
  assert.ok(held.timeLeft > dur - 0.1, 'the time is back');
  h.run(1.2);
  for (const d of dots(h, e)) near(d.dmg.amount, bb['attack@poison_damage'], 'the amount');
  done(h);
});

test('S2: ATK up, no poison, and the talent\'s chance × talent_scale', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1, seed: 11 });
    const bb = rec(id, S2).bb, atk = u.s.atk;
    assert.ok(bb.talent_scale > 1);
    cast(u);
    h.step();
    near(u.s.atk, atk * (1 + bb.atk), `${id}: ATK`, 1e-3);
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 8), `${id}: attacks`);
    assert.ok(!e.findBuff(POISON), `${id}: no poison`);
    done(h);
  }
});

/** How many of `n` targets are bound by one attack's roll at chance `p`, over seeds: the share of 束缚. */
function bindShare(id, skill, withCast) {
  let bound = 0, all = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { h, u } = field(id, { skill, seed });
    if (withCast) cast(u);
    const es = [0, 1, 2, 3, 4, 5].map(() => h.spawn('enemy_dummy', { pos: FRONT }));
    assert.ok(h.runUntil(() => hits(h, u, es[0]).length > 0, 8));
    for (const e of es) { all += 1; if (e.findBuff('bind')) bound += 1; }
  }
  return bound / all;
}

test('T1: each target hit rolls for 束缚 of frozen_duration; S2 multiplies the chance', () => {
  const t = NEXT.chess[A].talents[0].bb;
  assert.equal(t.prob, 0.25);
  assert.equal(t.frozen_duration, 3);
  const plain = bindShare(A, 0, false), up = bindShare(A, 1, true);
  const scale = rec(A, S2).bb.talent_scale;
  assert.ok(Math.abs(plain - t.prob) < 0.1, `S1: ${plain}`);
  assert.ok(Math.abs(up - t.prob * scale) < 0.1, `S2: ${up}`);
  const { h, u } = field(A, { skill: 0, seed: 3 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  assert.ok(h.runUntil(() => e.findBuff('bind'), 60), 'bound in the end');
  assert.equal(e.findBuff('bind').duration, t.frozen_duration);
  assert.ok(hits(h, u, e).length > 0);
  done(h);
});

test('AMB-X: enemies in range slow by move_speed, only the elite, one slow per 에단', () => {
  const mv = NEXT.chess[B].talents.find((t) => t.index === -1).bb.move_speed;
  assert.equal(mv, -0.2);
  const slows = (e) => e.buffs.filter((b) => b.key.startsWith('ethan_e_002:'));
  const { h } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: FRONT }), far = h.spawn('enemy_dummy', { pos: [2, 9] });
  h.run(0.5);
  assert.equal(slows(e).length, 1, 'in range');
  near(slows(e)[0].mods.moveMul, 1 + mv, 'its value');
  assert.equal(slows(far).length, 0, 'out of range');
  done(h);
  const two = field(B, { skill: 0, more: [{ uid: 2, id: B, skill: 0, row: 10, col: 6 }] });
  const x = two.h.spawn('enemy_dummy', { pos: FRONT });
  two.h.run(0.5);
  assert.equal(slows(x).length, 2, 'two 에단: two slows, PRTS 비고');
  done(two.h);
  const o = field(A, { skill: 0 });
  const y = o.h.spawn('enemy_dummy', { pos: FRONT });
  o.h.run(0.5);
  assert.equal(slows(y).length, 0, 'the normal form has no module');
  done(o.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_355_ethan');
});

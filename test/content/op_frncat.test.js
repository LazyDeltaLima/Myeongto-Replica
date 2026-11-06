// test/content/op_frncat.test.js — 무스 (char_185_frncat, a tier-1 piece of the season not out yet; kit ops/op-frncat.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { DOUBLE } from '../../server/sim/content/kits/ops/op-frncat.js';

const A = 'chess_char_1_nfrncat_a', B = 'chess_char_1_nfrncat_b';
const FORMS = [A, B];
const S1 = 'skchr_frncat_1', S2 = 'skchr_frncat_2';
const DEBUFF = 'frncat_s_1[debuff]';
const FX = 'skill:frncat:nextAtk';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const hitsOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.isAttack);
const byAttack = (hits) => {
  const m = new Map();
  for (const c of hits) { if (!m.has(c.dmg.attackId)) m.set(c.dmg.attackId, []); m.get(c.dmg.attackId).push(c); }
  return [...m.values()];
};

test('Arts melee; the record has the operator\'s forms (no module on the normal one)', () => {
  assert.equal(NEXT.chess[A].dmgType, 'arts');
  assert.equal(NEXT.chess[A].tier, 1);
  assert.equal(NEXT.chess[A].module?.active ?? false, false);
  assert.equal(NEXT.chess[B].module.active, true);
});

test('T1: some attacks are two hits of one attack, at the talent clip\'s two frames; the rest one; about prob of them', () => {
  for (const id of FORMS) {
    const prob = NEXT.chess[id].talents[0].bb.prob;
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const clock = new Map();
    h.b.on('damaged', (c) => { if (c.dmg?.isAttack) clock.set(c.dmg, h.b.time); });
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => byAttack(hitsOn(h, e)).length >= 200, 400);
    const attacks = byAttack(hitsOn(h, e)).slice(0, 200);
    const doubles = attacks.filter((a) => a.length === 2), singles = attacks.filter((a) => a.length === 1);
    assert.equal(doubles.length + singles.length, attacks.length, `${id}: one or two hits`);
    assert.ok(Math.abs(doubles.length / attacks.length - prob) < 0.08, `${id}: ${doubles.length} of ${attacks.length} at ${prob}`);
    for (const [a, b] of doubles) {
      assert.equal(a.dmg.signal, 'T.1');
      assert.equal(b.dmg.signal, 'T.1');
      near(b.amount, a.amount, `${id}: the same hit twice`);
      near(clock.get(b.dmg) - clock.get(a.dmg), DOUBLE.second - DOUBLE.first, `${id}: the frames' gap`, 0.05);
    }
    for (const [a] of singles) assert.ok(!a.dmg.signal, `${id}: a plain attack has no signal`);
    done(h);
  }
});

test('T1: the double attack\'s swing is the clip\'s own time whatever her ASPD; the plain one follows the interval', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  h.b.addBuff(u, { key: 'test:fast', mods: { aspd: 200 } });
  const swings = [];
  h.b.on('swing', (c) => { if (c.unit === u) swings.push({ t: h.b.time, sig: () => c.signal }); });
  h.spawn('enemy_dummy', { pos: [10, 5] });
  h.runUntil(() => swings.length >= 120, 400);
  const gaps = (double) => swings.slice(0, -1).filter((s) => !!s.sig() === double).map((s) => swings[swings.indexOf(s) + 1].t - s.t);
  for (const g of gaps(true)) near(g, DOUBLE.dur, 'after a double', 0.05);
  const plain = gaps(false);
  assert.ok(plain.length > 10);
  for (const g of plain) assert.ok(g < DOUBLE.dur - 0.3, `a plain attack at +200 ASPD is quicker: ${g}`);
  done(h);
});

test('T1: the swing strikes at the talent clip\'s first frame', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  const started = [];
  h.b.on('swing', (c) => { if (c.unit === u && c.signal) started.push({ t: h.b.time, id: h.b._attackSeq + 1 }); });
  const when = new Map();
  h.b.on('damaged', (c) => { if (c.dmg?.isAttack && !when.has(c.dmg.attackId)) when.set(c.dmg.attackId, h.b.time); });
  h.spawn('enemy_dummy', { pos: [10, 5] });
  h.runUntil(() => started.length >= 5 && when.size > started.at(-1).id, 200);
  // ('swing' hook order: the kit's first, so c.signal is set)
  for (const s of started.slice(0, 4)) near(when.get(s.id) - s.t, DOUBLE.first, 'first frame', 0.05);
  done(h);
});

test('S1: every spCost + 1 attacks one has ATK +atk, gives no SP, no start or end effect on the rest', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1), cost = NEXT.chess[id].skills.find((s) => s.skillId === S1).spCost;
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => byAttack(hitsOn(h, e)).length >= 3 * (cost + 1) + 1, 200);
    const attacks = byAttack(hitsOn(h, e));
    const first = attacks.map((a) => a[0]);
    const plain = first.find((c) => !c.dmg.isSkill).amount;
    const skilled = first.map((c, i) => (c.dmg.isSkill ? i : -1)).filter((i) => i >= 0);
    assert.ok(skilled.length >= 3, `${id}: cast ${skilled.length} times`);
    for (let i = 1; i < skilled.length; i++) assert.equal(skilled[i] - skilled[i - 1], cost + 1, `${id}: ${cost} attacks charge it and the skill attack charges nothing`);
    near(first[skilled[0]].amount / plain, (u.base.atk * (1 + b1.atk)) / u.base.atk, `${id}: ATK +atk`, 1e-3);
    done(h);
  }
});

test('S1: the ATK is off again once the attack is over, a double attack holding it through both hits', () => {
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  const seen = [];
  h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.isAttack) seen.push({ on: !!u.findBuff('frncat_s_1'), skill: !!c.dmg.isSkill, id: c.dmg.attackId, n: c.amount }); });
  h.runUntil(() => seen.filter((s) => s.skill).length >= 40, 600);
  for (const s of seen) assert.equal(s.on, s.skill, 'the buff is on for the skill attack\'s hits only');
  const groups = new Map();
  for (const s of seen.filter((x) => x.skill)) groups.set(s.id, [...(groups.get(s.id) ?? []), s]);
  const twos = [...groups.values()].filter((g) => g.length === 2);
  assert.ok(twos.length > 0, 'a skill attack that was double');
  for (const [a, b] of twos) near(a.n, b.n, 'both hits at the skill\'s ATK');
  h.run(3);
  done(h);
});

test('S1: the view\'s buff is on from the skill attack\'s swing until it ends, also when the swing loses its target', () => {
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  const swings = [];
  h.b.on('swing', (c) => { if (c.unit === u) swings.push({ skill: c.isSkill, on: !!u.findBuff(FX) }); });
  h.runUntil(() => swings.filter((s) => s.skill).length >= 3 && !swings.at(-1).skill, 200);
  assert.ok(swings.some((s) => !s.skill), 'plain attacks ran too');
  for (const s of swings) assert.equal(s.on, s.skill, 'on for the skill attack\'s swing only');
  assert.equal(u.findBuff(FX)?.visible ?? false, false);
  // the target gone before the strike: the skill is called off, and the effect with it
  let lost = false;
  h.b.on('swing', (c) => { if (c.unit === u && c.isSkill && !lost) { lost = true; e.hidden = true; } });
  h.runUntil(() => lost, 200);
  h.run(3);
  assert.ok(!u.findBuff(FX), 'off with the cancelled swing');
  done(h);
});

test('S1: hits give the debuff for its duration; ATK falls by its value; one per 무스', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0, others: [{ uid: 2, chessId: id, row: 10, col: 6, dir: 'LEFT' }] });
    const v = h.unit(2), mine = `${DEBUFF}:${u.id}`, hers = `${DEBUFF}:${v.id}`;
    const e = h.spawn('enemy_biter', { pos: [10, 5] });
    const atk0 = e.s.atk, cut = b1[`${DEBUFF}.atk`];
    assert.ok(cut < 0);
    h.runUntil(() => e.findBuff(mine) || e.findBuff(hers), 60);
    const d = e.findBuff(mine) ?? e.findBuff(hers);
    assert.ok(d.timeLeft <= b1[`${DEBUFF}.duration`] && d.timeLeft > b1[`${DEBUFF}.duration`] - 0.2, `${id}: duration`);
    h.step();
    near(e.s.atk, atk0 * (1 + cut * (e.findBuff(mine) && e.findBuff(hers) ? 2 : 1)), `${id}: ATK`, 1e-3);
    h.runUntil(() => e.findBuff(mine) && e.findBuff(hers), 60);
    assert.ok(e.findBuff(mine) && e.findBuff(hers), `${id}: each has her own`);
    done(h);
  }
});

test('S2: ATK and DEF up for its duration, by the table', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2), rec = NEXT.chess[id].skills.find((s) => s.skillId === S2);
    const { h, u } = field(id, { skill: 1 });
    const { atk, def } = u.s;
    h.spawn('enemy_dummy', { pos: [10, 5] });
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`, 1e-3);
    near(u.s.def, def + u.base.def * b2.def, `${id}: DEF`, 1e-3);
    assert.ok(u.skill.active);
    h.run(rec.duration - 0.2);
    assert.ok(u.skill.active, `${id}: still on`);
    h.run(0.4);
    assert.ok(!u.skill.active, `${id}: over`);
    near(u.s.atk, atk, `${id}: ATK back`, 1e-3);
    done(h);
  }
});

test('AFT-X: ASPD +attack_speed while she blocks nobody on the elite form; nothing on the normal one', () => {
  const b = field(B, { skill: 1 });
  const aspd = NEXT.chess[B].trait.bb.attack_speed;
  assert.equal(aspd, 8);
  b.h.step();
  const free = b.u.s.aspd;
  near(free, b.u.base.aspd + aspd, 'free', 1e-6);
  const e = b.h.spawn('enemy_runner', { pos: [10, 7] });
  b.h.runUntil(() => b.u.blocking.includes(e), 20);
  b.h.step();
  near(b.u.s.aspd, b.u.base.aspd, 'blocking', 1e-6);
  const a = field(A, { skill: 1 });
  a.h.step();
  near(a.u.s.aspd, a.u.base.aspd, 'no module', 1e-6);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_185_frncat');
});

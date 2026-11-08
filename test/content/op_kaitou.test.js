// test/content/op_kaitou.test.js — 디아만테 (char_499_kaitou, a tier-2 piece of 规程 (act3autochess); kit ops/op-kaitou.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_2_01_a', B = 'chess_char_2_01_b';
const FORMS = [A, B];
const S1 = 'skchr_kaitou_1', S2 = 'skchr_kaitou_2';
const BURST = 'apoptosisBurst', ATK = 'kaitou_t_1[atk]';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const burst = (h, e) => h.b.addBuff(e, { key: BURST, duration: 999, flags: { burstLock: true } });
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const extras = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('kaitou') && c.type === 'elemental');
const gauge = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('kaitou') && c.type === 'element');
const attacks = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.isAttack);

test('T1: ATK + while an enemy in her range is in its 凋亡 burst, one buff however many, none for one out of range', () => {
  for (const id of FORMS) {
    const v = ACT3.chess[id].talents[0].bb.atk;
    const { h, u } = field(id, { skill: 0 });
    const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [10, 5] }), far = h.spawn('enemy_dummy', { pos: [2, 12] });
    h.step();
    const atk = u.s.atk;
    assert.ok(!u.findBuff(ATK), `${id}: none yet`);
    burst(h, far);
    h.step(2);
    assert.ok(!u.findBuff(ATK), `${id}: the far one does not count`);
    burst(h, a);
    burst(h, b);
    h.step(2);
    assert.ok(u.findBuff(ATK), `${id}: on`);
    near(u.s.atk, atk + u.base.atk * v, `${id}: ATK, once`);
    h.b.removeBuff(a, BURST);
    h.step(2);
    assert.ok(u.findBuff(ATK), `${id}: the other is still in it`);
    h.b.removeBuff(b, BURST);
    h.step(2);
    assert.ok(!u.findBuff(ATK), `${id}: off`);
    done(h);
  }
});

test('S1: ATK +, a hit adds its ratio as 凋亡损伤; no extra damage on a target not in its burst', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const atk = u.s.atk;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b1.atk, `${id}: ATK`);
    h.runUntil(() => gauge(h, e).length > 0, 10);
    const hit = attacks(h, e).at(-1), g = gauge(h, e)[0];
    assert.equal(hit.type, 'arts', `${id}: arts`);
    assert.equal(g.dmg.element, 'apoptosis');
    near(g.dmg.amount, hit.amount * b1['attack@ep_damage_ratio'], `${id}: the ratio of the hit's damage`);
    assert.equal(extras(h, e).length, 0, `${id}: no extra without a burst`);
    done(h);
  }
});

test('S1: on a target already in its burst each hit adds extra × ATK of element damage', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    burst(h, e);
    cast(u);
    h.runUntil(() => extras(h, e).length >= 2, 10);
    assert.equal(extras(h, e).length, attacks(h, e).length, `${id}: one per hit`);
    const x = extras(h, e)[0];
    assert.equal(x.dmg.element, 'apoptosis');
    assert.equal(x.dmg.moment, 'kaitou_s_1[ep_damage]');
    near(x.dmg.amount, u.s.atk * b1['attack@extra_ep_damage_scale'], `${id}: extra`);
    done(h);
  }
});

test('S1: the hit that starts the burst gets no extra (its buffs come before its damage), the next one does', () => {
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  // the burst arrives between the hit's start and the kit's look at it, as a hit whose 凋亡损伤 fills the gauge
  h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.isAttack && !e.findBuff(BURST)) burst(h, e); }, { priority: 50 });
  cast(u);
  h.runUntil(() => attacks(h, e).length >= 1, 10);
  assert.equal(extras(h, e).length, 0, 'not on the first');
  h.runUntil(() => attacks(h, e).length >= 2, 10);
  assert.equal(extras(h, e).length, 1, 'on the second');
  done(h);
});

test('S1: over when the skill ends: no 凋亡损伤 and no extra from a normal attack', () => {
  const { h, u } = field(A, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  burst(h, e);
  h.runUntil(() => attacks(h, e).length >= 2, 10);
  assert.equal(gauge(h, e).length + extras(h, e).length, 0);
  done(h);
  assert.ok(u.alive);
});

test('S2: ASPD +, two targets, extra on a burst target, no 凋亡损伤 of its own', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [10, 5] }), c = h.spawn('enemy_dummy', { pos: [10, 7] });
    burst(h, a);
    const aspd = u.s.aspd;
    cast(u);
    h.step();
    assert.equal(u.s.aspd, aspd + b2.attack_speed, `${id}: ASPD`);
    h.runUntil(() => extras(h, a).length >= 1, 10);
    const hit = (e) => attacks(h, e).length > 0;
    assert.equal([a, b, c].filter(hit).length, 2, `${id}: two of the three`);
    near(extras(h, a)[0].dmg.amount, u.s.atk * b2['attack@extra_ep_damage_scale'], `${id}: extra`);
    assert.equal(extras(h, a)[0].dmg.moment, 'kaitou_s_2[ep_damage]');
    assert.equal(gauge(h, a).length + gauge(h, b).length + gauge(h, c).length, 0, `${id}: no gauge`);
    done(h);
  }
});

test('PRI-X: the elite form deals × damage_scale to an enemy in an element burst, the normal one does not', () => {
  const tb = ACT3.chess[B].trait.bb;
  assert.ok(tb.damage_scale > 1);
  assert.equal(ACT3.chess[A].trait.bb.damage_scale, undefined);
  for (const [id, want] of [[A, 1], [B, tb.damage_scale]]) {
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const plain = h.spawn('enemy_dummy', { pos: [10, 5] });
    h.runUntil(() => attacks(h, plain).length >= 1, 10);
    const before = attacks(h, plain)[0].amount;
    burst(h, plain);
    h.runUntil(() => attacks(h, plain).length >= 2, 10);
    // the talent's ATK + comes with the burst: its share is taken out
    const t = ACT3.chess[id].talents[0].bb.atk;
    near(attacks(h, plain)[1].amount / before, want * (1 + t * u.base.atk / (u.s.atk - t * u.base.atk)), `${id}: × on the burst`);
    done(h);
  }
});

test('a real match fields both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_499_kaitou');
});

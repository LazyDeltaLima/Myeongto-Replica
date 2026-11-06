// test/content/op_brigid.test.js — 브리지드 (char_4177_brigid, a tier-3 piece of the season not out yet; kit ops/op-brigid.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { BOUNCE_RADIUS, BOUNCE_SPEED } from '../../server/sim/content/kits/ops/op-brigid.js';

const A = 'chess_char_3_nbrigid_a', B = 'chess_char_3_nbrigid_b';
const FORMS = [A, B];
const S1 = 'skchr_brigid_1', S2 = 'skchr_brigid_2';
const DODGE = 'brigid_t[evade_core]';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const hitsOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const cuts = (h, e) => hitsOn(h, e).filter((c) => c.dmg?.tags?.includes('brigid:cut'));
const FRONT = [10, 6];   // in her range y-7, off the 8 tiles around her

test('Trait: she attacks again only once the boomerang is back', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  h.runUntil(() => u.trait.boomerangsOut > 0, 10);
  const n = hitsOn(h, e).length;
  assert.ok(n <= 1);
  h.runUntil(() => hitsOn(h, e).length >= 2, 10);
  assert.equal(hitsOn(h, e).length, 2);
  done(h);
});

test('T1: at the count\'s damage she has physical dodge prob; every damage of hers counts; a new deployment starts over', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    assert.equal(t.trigger_damage_count, 20);
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    for (let i = 0; i < t.trigger_damage_count - 1; i++) h.b.dealDamage(u, e, { amount: 1, type: 'true', tags: ['test'] });
    assert.ok(!u.findBuff(DODGE), `${id}: one short`);
    h.b.dealDamage(u, e, { amount: 1, type: 'true', tags: ['test'] });
    assert.ok(u.findBuff(DODGE), `${id}: at the count`);
    near(u.s.dodgePhys ?? u.findBuff(DODGE).mods.dodgePhys, t.prob, `${id}: prob`);
    h.run(5);
    assert.ok(u.findBuff(DODGE), `${id}: kept`);
    done(h);
  }
});

test('S1: the next attack at atk_scale; it bounces `times` times to the nearest enemies not yet hit, each hit at atk_scale, then comes back', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    // a line, each within the bounce radius of the last; the last one is too far
    for (const pos of [[10, 6], [11, 6], [11, 7], [12, 7], [12, 8]]) h.spawn('enemy_dummy', { pos });
    const far = h.spawn('enemy_dummy', { pos: [5, 8] });
    const order = [];
    h.b.on('damaged', (c) => { if (c.dmg?.isSkill && c.source === u) order.push(c); });
    cast(u);
    h.runUntil(() => order.length >= 1 + b1.times, 10);
    h.run(1);
    assert.equal(order.length, 1 + b1.times, `${id}: first + times`);
    assert.equal(new Set(order.map((c) => c.target)).size, order.length, `${id}: all different`);
    for (const c of order) near(c.dmg.amount, u.s.atk * b1.atk_scale, `${id}: atk_scale`, 1e-3);
    assert.equal(hitsOn(h, far).length, 0, `${id}: out of the radius`);
    assert.equal(order[0].dmg.attackId, order[1].dmg.attackId, `${id}: one attack`);
    h.runUntil(() => !(u.trait.boomerangsOut > 0), 15);
    assert.equal(u.trait.boomerangsOut, 0, `${id}: caught`);
    done(h);
  }
});

test('S1: each bounce flies at the slower speed', () => {
  const b1 = bbOf(B, S1);
  assert.ok(b1.times >= 1);
  const { h, u } = field(B, { skill: 0 });
  const a = h.spawn('enemy_dummy', { pos: [10, 6] }), b = h.spawn('enemy_dummy', { pos: [11, 6] });
  cast(u);
  const clock = new Map();
  h.b.on('damaged', (c) => { if (c.dmg?.isSkill && !clock.has(c.target)) clock.set(c.target, h.b.time); });
  h.runUntil(() => clock.has(a) && clock.has(b), 10);
  near(Math.abs(clock.get(b) - clock.get(a)), Math.hypot(a.x - b.x, a.y - b.y) / BOUNCE_SPEED, 'the gap', 0.08);
  done(h);
});

test('S1: with no other enemy in reach it strikes the one it has again', () => {
  const b1 = bbOf(B, S1);
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  const far = h.spawn('enemy_dummy', { pos: [10, 6 + Math.ceil(BOUNCE_RADIUS) + 2] });
  cast(u);
  h.runUntil(() => hitsOn(h, e).filter((c) => c.dmg?.isSkill).length >= 1 + b1.times, 10);
  h.run(2);
  assert.equal(hitsOn(h, e).filter((c) => c.dmg?.isSkill).length, 1 + b1.times);
  assert.equal(hitsOn(h, far).filter((c) => c.dmg?.isSkill).length, 0);
  done(h);
});

test('S2: ATK up; the hit gives 停顿 and four cuts, attack@interval apart at cut_scale × ATK physical; the boomerang stays attack@projectile_delay_time s', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const atk = u.s.atk;
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`, 1e-3);
    const when = [];
    h.b.on('damaged', (c) => { if (c.dmg?.tags?.includes('brigid:cut') && c.target === e) when.push(h.b.time); });
    let hitAt = null, caught = null;
    h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.isAttack && !c.dmg.tags?.includes('brigid:cut') && hitAt == null) hitAt = h.b.time; });
    h.b.on('boomerangCaught', (c) => { if (c.unit === u && caught == null) caught = h.b.time; });
    h.runUntil(() => hitAt != null, 10);
    assert.ok(e.findBuff('sluggish'), `${id}: 停顿`);
    assert.ok(Math.abs(e.findBuff('sluggish').timeLeft - b2['attack@sluggish']) < 0.1, `${id}: its length`);
    h.run(b2['attack@cut_duration'] + 0.1);
    assert.equal(when.length, 4, `${id}: four cuts`);
    when.forEach((t, i) => near(t - hitAt, b2['attack@interval'] * (i + 1), `${id}: cut ${i}`, 0.06));
    const c = cuts(h, e)[0];
    assert.equal(c.dmg.type, 'phys');
    near(c.dmg.amount, u.s.atk * b2['attack@cut_scale'], `${id}: cut_scale`, 1e-3);
    assert.equal(u.trait.boomerangsOut, 1, `${id}: not back yet`);
    h.runUntil(() => caught != null, 10);
    assert.ok(caught - hitAt > b2['attack@projectile_delay_time'], `${id}: it stayed first: ${caught - hitAt}`);
    done(h);
  }
});

test('S2: the cuts end when she falls or the enemy cannot be selected', () => {
  const b2 = bbOf(B, S2);
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  cast(u);
  h.runUntil(() => cuts(h, e).length >= 1, 10);
  const n = cuts(h, e).length;
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  h.run(b2['attack@cut_duration'] + 0.2);
  assert.equal(cuts(h, e).length, n, 'she fell');
  done(h);
});

test('S2: a plain attack outside it has no cuts', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  h.runUntil(() => hitsOn(h, e).length >= 2, 10);
  assert.equal(cuts(h, e).length, 0);
  assert.ok(!e.findBuff('sluggish'));
  done(h);
});

test('LPS-X: on the elite form an attack on an enemy on the 8 tiles around her is × atk_scale, further off not; the normal form has none', () => {
  assert.equal(NEXT.chess[B].trait.bb.atk_scale, 1.1);
  const amount = (id, pos) => {
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos });
    h.runUntil(() => hitsOn(h, e).length >= 1, 10);
    return hitsOn(h, e)[0].amount;
  };
  near(amount(B, [10, 5]) / amount(B, FRONT), 1.1, 'elite', 1e-3);
  near(amount(A, [10, 5]) / amount(A, FRONT), 1, 'normal', 1e-3);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4177_brigid');
});

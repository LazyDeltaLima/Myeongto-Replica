// test/content/op_christ.test.js — 미스 크리스틴 (char_4198_christ, a tier-2 piece of the season not out yet; kit ops/op-christ.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { SPIRIT_SPEED, S2_PRE_DELAY } from '../../server/sim/content/kits/ops/op-christ.js';

const A = 'chess_char_2_nchrist_a', B = 'chess_char_2_nchrist_b';
const FORMS = [A, B];
const S1 = 'skchr_christ_1', S2 = 'skchr_christ_2';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const spirit = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('christ:spirit'));
const elemental = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.type === 'elemental');
const burst = (h, e) => h.b.addBuff(e, { key: 'neuralBurst', duration: 100, flags: { burstLock: true } });

test('T1: an enemy in her range whose attack 麻痹 interrupts takes atk_scale × ATK of element damage; gaining 麻痹 is nothing', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 1 });
    u.skill.locked = true;
    const e = h.spawn('enemy_biter', { pos: [10, 5] });
    h.b.applyStatus(e, 'palsy', { value: 1, source: u });
    assert.equal(elemental(h, e).length, 0, `${id}: gaining it deals nothing`);
    h.runUntil(() => elemental(h, e).length >= 1, 20);
    const c = elemental(h, e)[0];
    assert.equal(c.dmg.type, 'elemental');
    assert.equal(c.source, u);
    near(c.dmg.amount, u.s.atk * t.atk_scale, `${id}: atk_scale`, 1e-3);
    assert.ok(!e.findBuff('palsy'), `${id}: the stack went on that interrupt`);
    h.run(3);
    assert.equal(elemental(h, e).length, 1, `${id}: one interrupt, one hit`);
    done(h);
  }
});

test('T1: not for an enemy out of her range; one hit per 미스 크리스틴 in range', () => {
  const F = 'chess_char_1_nfrncat_a';   // something for the far enemy to attack, which gives no 麻痹 of its own
  const { h, u } = field(B, { skill: 1, more: [{ uid: 2, id: B, skill: 1, row: 10, col: 3 }, { uid: 3, id: F, skill: 1, row: 8, col: 11 }] });
  u.skill.locked = true; h.unit(2).skill.locked = true; h.unit(3).skill.locked = true;
  const far = h.spawn('enemy_biter', { pos: [8, 12] });  // in neither's range
  h.b.emit('palsyTrigger', { enemy: far, buff: null, keep: false });
  assert.equal(elemental(h, far).length, 0, 'no talent out of range');
  const both = h.spawn('enemy_biter', { pos: [10, 5] });
  h.b.applyStatus(both, 'palsy', { value: 1, source: u });
  h.runUntil(() => !both.findBuff('palsy'), 20);
  h.step();
  assert.equal(elemental(h, both).length, 2, 'each deals hers');
  assert.deepEqual(new Set(elemental(h, both).map((c) => c.source)), new Set([u, h.unit(2)]));
  done(h);
});

test('S1: ATK up, two targets, a hit adds attack@ep_damage_ratio of its damage as 신경 손상', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    const atk = u.s.atk;
    const es = [h.spawn('enemy_dummy', { pos: [10, 6] }), h.spawn('enemy_dummy', { pos: [10, 7] })];
    cast(u);
    h.step();
    assert.equal(u.skill.id, S1);
    near(u.s.atk, atk + u.base.atk * b1.atk, `${id}: ATK`, 1e-3);
    h.runUntil(() => es.every((e) => dmgOn(h, e).some((c) => c.dmg?.isAttack)), 10);
    for (const e of es) {
      const hit = dmgOn(h, e).find((c) => c.dmg?.isAttack);
      const gauge = dmgOn(h, e).find((c) => c.dmg?.type === 'element');
      assert.ok(gauge, `${id}: gauge`);
      assert.equal(gauge.dmg.element, 'neural');
      near(gauge.dmg.amount, hit.amount * b1['attack@ep_damage_ratio'], `${id}: ratio`, 1e-3);
    }
    done(h);
  }
});

test('S1: no gauge from a plain attack', () => {
  const { h, u } = field(B, { skill: 0 });
  u.skill.locked = true;
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.runUntil(() => dmgOn(h, e).filter((c) => c.dmg?.isAttack).length >= 2, 10);
  assert.equal(dmgOn(h, e).filter((c) => c.dmg?.type === 'element').length, 0);
  done(h);
});

test('S2: no attack; the spirit lands on the target\'s tile after the pre-delay and its flight, then hits every interval within projectile_range, projectile_delay_time s', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    assert.equal(b2.projectile_range, 1.5);
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });   // her only target: the others are out of her range
    const inside = h.spawn('enemy_dummy', { pos: [11, 8] });
    const outside = h.spawn('enemy_dummy', { pos: [8, 8] });
    const when = [];
    h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.tags?.includes('christ:spirit')) when.push(h.b.time); });
    cast(u);
    const t0 = h.b.time;
    h.runUntil(() => when.length >= 1, 5);
    const fly = Math.hypot(7 - u.x, 10 - u.y) / SPIRIT_SPEED;
    near(when[0] - t0, S2_PRE_DELAY + fly, `${id}: nothing before it lands`, 0.12);
    h.runUntil(() => !u.skill.active, 25);
    assert.equal(dmgOn(h, e).filter((c) => c.dmg?.isAttack && !c.dmg.tags?.includes('christ:spirit')).length, 0, `${id}: she does not attack while it runs`);
    u.skill.locked = true;
    h.b.addBuff(u, { key: 'test:quiet', flags: { disarm: true } });
    h.run(2);
    assert.equal(when.length, b2.projectile_delay_time / b2.interval, `${id}: one a second for its stay`);
    near(when[1] - when[0], b2.interval, `${id}: interval`, 0.05);
    near(spirit(h, e)[0].dmg.amount, u.s.atk * b2.atk_scale, `${id}: atk_scale`, 1e-3);
    assert.equal(spirit(h, e)[0].type ?? spirit(h, e)[0].dmg.type, 'arts');
    assert.equal(spirit(h, inside).length, when.length, `${id}: all around it`);
    assert.equal(spirit(h, outside).length, 0, `${id}: not out of its radius`);
    assert.equal(elemental(h, e).length, 0, `${id}: no element damage out of a burst`);
    done(h);
  }
});

test('S2: the spirit stays on the tile when its target is gone; on an enemy in its 신경 burst the element damage too', () => {
  const b2 = bbOf(B, S2);
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  burst(h, e);
  cast(u);
  h.runUntil(() => spirit(h, e).length >= 1, 5);
  const el = elemental(h, e);
  assert.equal(el.length, 1);
  near(el[0].dmg.amount, u.s.atk * b2.atk_scale_ep, 'atk_scale_ep', 1e-3);
  assert.equal(el[0].dmg.element, 'neural');
  const near2 = h.spawn('enemy_dummy', { pos: [11, 7] });
  h.b.dealDamage(null, e, { amount: 1e12, type: 'true' });
  assert.ok(!e.alive);
  const n = spirit(h, near2).length;
  h.run(2.2);
  assert.ok(spirit(h, near2).length >= n + 2, 'its target gone, it stays on the tile');
  done(h);
});

test('S2: it stays when she falls, hitting at her ATK', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  cast(u);
  h.runUntil(() => spirit(h, e).length >= 1, 5);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(!u.alive);
  const n = spirit(h, e).length;
  h.run(3.2);
  assert.ok(spirit(h, e).length >= n + 3, `kept hitting: ${spirit(h, e).length - n}`);
  done(h);
});

test('S2: the spirit does not come if she falls in the pre-delay', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  cast(u);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  h.run(3);
  assert.equal(spirit(h, e).length, 0);
  done(h);
});

test('PRI-X: ×damage_scale on an enemy in a burst on the elite form, not the element damage; nothing on the normal one', () => {
  assert.equal(NEXT.chess[B].trait.bb.damage_scale, 1.1);
  const run = (id) => {
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.runUntil(() => dmgOn(h, e).filter((c) => c.dmg?.isAttack).length >= 1, 10);
    const plain = dmgOn(h, e).find((c) => c.dmg?.isAttack).amount;
    burst(h, e);
    h.runUntil(() => dmgOn(h, e).filter((c) => c.dmg?.isAttack).length >= 2, 10);
    return dmgOn(h, e).filter((c) => c.dmg?.isAttack)[1].amount / plain;
  };
  near(run(B), 1.1, 'elite', 1e-3);
  near(run(A), 1, 'normal', 1e-3);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4198_christ');
});

test('T1: its aura\'s effect is told as she deploys (the view holds christ_buff_01 while she stands)', () => {
  const { h, u } = field(FORMS[0], { skill: 0 });
  const seen = [];
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, o) => { if (kind === 'kitHit' && o?.k === 'christ:aura') seen.push(o.id); return fx0(kind, o); };
  h.b.emit('deploy', { unit: u });
  assert.deepEqual(seen, [u.id]);
});

// test/content/op_pianst.test.js — 체르니 (char_4047_pianst, a tier-3 piece of 规程 (act3autochess); kit ops/op-pianst.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';
import { FINAL_DELAY } from '../../server/sim/content/kits/ops/op-pianst.js';

const A = 'chess_char_3_01_a', B = 'chess_char_3_01_b';
const FORMS = [A, B];
const S1 = 'skchr_pianst_1', S2 = 'skchr_pianst_2';
const STACK = 'pianst_s_2_buff[atk_boost]';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const dmgOn = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e);
const echoes = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('talent'));
const extras = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('counter') && !c.dmg.tags.includes('talent'));
const finals = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.tags?.includes('pianst:final'));
const attacks = (h, e) => dmgOn(h, e).filter((c) => c.dmg?.isAttack);
/** An enemy attack on her: a NORMAL attack of the damage type asked. */
const strike = (h, e, u, type, o = {}) => h.b.dealDamage(e, u, { amount: 50, type, isAttack: true, ...o });

test('T1: RES + from the talent', () => {
  for (const id of FORMS) {
    const { u } = field(id, { skill: 0 });
    assert.equal(u.s.res, ACT3.chess[id].stats.res + ACT3.chess[id].talents[0].bb.magic_resistance, id);
  }
});

test('T1: an arts attack gives its source atk_scale × her ATK of arts; a physical one, a skill hit and a no-source hit do not', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    const e = h.spawn('enemy_dummy', { pos: [10, 9] });
    strike(h, e, u, 'phys');
    assert.equal(echoes(h, e).length, 0, `${id}: physical`);
    h.b.dealDamage(e, u, { amount: 50, type: 'arts', isSkill: true });
    assert.equal(echoes(h, e).length, 0, `${id}: not an attack`);
    h.b.dealDamage(e, u, { amount: 50, type: 'arts', isAttack: true, sourceless: true });
    assert.equal(echoes(h, e).length, 0, `${id}: no source`);
    strike(h, e, u, 'arts');
    assert.equal(echoes(h, e).length, 1, `${id}: arts attack`);
    strike(h, e, u, 'arts', { isAttack: false, isSplash: true });
    assert.equal(echoes(h, e).length, 2, `${id}: arts splash`);
    const x = echoes(h, e)[0];
    assert.equal(x.type, 'arts');
    assert.equal(x.dmg.moment, 'pianst_t_1');
    near(x.dmg.amount, u.s.atk * t.atk_scale, `${id}: atk_scale`);
    done(h);
  }
});

test('Trait: physical attacks without a skill, arts while one runs', () => {
  for (const [sk, i] of [[S1, 0], [S2, 1]]) {
    const { h, u } = field(B, { skill: i });
    assert.equal(u.skill.id, sk);
    const e = h.spawn('enemy_dummy', { pos: [10, 4] }); // her range is her own tile
    h.runUntil(() => attacks(h, e).length >= 1, 10);
    assert.equal(attacks(h, e)[0].type, 'phys', 'before');
    cast(u);
    const had = attacks(h, e).length;
    h.runUntil(() => attacks(h, e).length > had, 10);
    assert.equal(attacks(h, e).at(-1).type, 'arts', `${sk}: during`);
    done(h);
  }
});

test('S1: ATK +, RES × (1 + its value)', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    const { atk, res } = u.s;
    cast(u);
    h.step();
    near(u.s.atk, atk + u.base.atk * b1.atk, `${id}: ATK`);
    near(u.s.res, res * (1 + b1.magic_resistance), `${id}: RES`);
    done(h);
  }
});

test('S2: max HP +, taunt +, a stack of ATK for each attack of any type up to its cap, after the talent; gone with the skill', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2), t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 9] });
    const hp = u.s.maxHp, atk = u.s.atk, taunt = u.s.tauntLevel ?? u.s.taunt ?? 0;
    cast(u);
    h.step();
    near(u.s.maxHp, hp * (1 + b2.max_hp), `${id}: max HP`);
    assert.equal(u.s.tauntLevel ?? u.s.taunt, taunt + b2.taunt_level, `${id}: taunt`);
    strike(h, e, u, 'phys');
    h.step();
    assert.equal(u.findBuff(STACK).stacks, 1, `${id}: physical counts`);
    assert.equal(echoes(h, e).length, 0);
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: one stack`);
    // PRTS: the talent first, at the ATK before this stack
    const before = u.s.atk;
    strike(h, e, u, 'arts');
    near(echoes(h, e)[0].dmg.amount, before * t.atk_scale, `${id}: the talent before the stack`);
    h.step();
    assert.equal(u.findBuff(STACK).stacks, 2);
    h.b.dealDamage(e, u, { amount: 1, type: 'arts', isSkill: true });
    h.step();
    assert.equal(u.findBuff(STACK).stacks, 2, `${id}: a skill hit adds none`);
    for (let i = 0; i < 30; i++) strike(h, e, u, 'phys', { amount: 1 });
    h.step();
    assert.equal(u.findBuff(STACK).stacks, b2.max_stack_cnt, `${id}: the cap`);
    h.runUntil(() => !u.skill.active, 30);
    h.step();
    assert.ok(!u.findBuff(STACK), `${id}: gone`);
    near(u.s.atk, atk, `${id}: ATK back`);
    done(h);
  }
});

test('S2: FinalAttack at interval + its delay on all in x-1, the flying too, none outside; no attack from the interval on', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    assert.equal(b2.interval, 18.6);
    const { h, u } = field(id, { skill: 1 });
    const inRange = h.spawn('enemy_dummy', { pos: [10, 6] });
    const fly = h.spawn('enemy_fly', { pos: [11, 5] });
    const out = h.spawn('enemy_dummy', { pos: [10, 7] });
    const at = [];
    h.b.on('damaged', (c) => { if (c.dmg?.tags?.includes('pianst:final')) at.push(h.b.time); });
    cast(u);
    const t0 = h.b.time;
    h.run(b2.interval - 0.2);
    assert.equal(finals(h, inRange).length, 0, `${id}: not yet`);
    h.run(0.25);
    assert.ok(u.skill.active && u.skillStateUntil > h.b.time, `${id}: Empty mode`);
    const hits = attacks(h, inRange).length + attacks(h, fly).length;
    h.runUntil(() => !u.skill.active, 5);
    assert.equal(attacks(h, inRange).length + attacks(h, fly).length, hits, `${id}: no attack in Empty`);
    assert.ok(Math.abs(at[0] - t0 - b2.interval - FINAL_DELAY) < 0.07, `${id}: at ${at[0] - t0}`);
    for (const e of [inRange, fly]) assert.equal(finals(h, e).length, 1, `${id}: one hit`);
    assert.equal(finals(h, out).length, 0, `${id}: outside`);
    const f = finals(h, inRange)[0];
    assert.equal(f.type, 'arts');
    assert.ok(f.dmg.isSkill);
    near(f.dmg.amount, u.base.atk * b2.atk_scale, `${id}: atk_scale at her ATK`);
    done(h);
  }
});

test('S2: FinalAttack keeps the ATK of the stacks; a stun at the interval or in the delay loses it', () => {
  const b2 = bbOf(B, S2);
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  for (let i = 0; i < 3; i++) strike(h, e, u, 'phys', { amount: 1 });
  h.run(b2.interval + FINAL_DELAY + 0.1);
  near(finals(h, e)[0].dmg.amount, u.base.atk * (1 + 3 * b2.atk) * b2.atk_scale, 'with 3 stacks');
  done(h);

  for (const lead of [-0.1, 0.1]) {
    const f = field(B, { skill: 1 });
    const x = f.h.spawn('enemy_dummy', { pos: [10, 6] });
    cast(f.u);
    f.h.run(b2.interval + lead);
    f.h.b.applyStatus(f.u, 'stun', { duration: 1, source: x });
    f.h.run(FINAL_DELAY + 0.3);
    assert.equal(finals(f.h, x).length, 0, `lost, stun at ${lead}`);
    done(f.h);
  }
  // a stun over before the hit would land: at the interval it could not act, so nothing is cast
  const g = field(B, { skill: 1 });
  const y = g.h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(g.u);
  g.h.run(b2.interval - 0.1);
  g.h.b.applyStatus(g.u, 'stun', { duration: 0.3, source: y });
  g.h.run(FINAL_DELAY + 0.4);
  assert.ok(g.u.canAct, 'free again');
  assert.equal(finals(g.h, y).length, 0, 'lost at the interval');
  done(g.h);
});

test('AST-X: the elite form adds atk_scale × ATK of arts on her attacks and on enemy damage while a skill runs, nothing before', () => {
  const v = ACT3.chess[B].trait.bb.atk_scale;
  assert.ok(v > 0);
  assert.equal(ACT3.chess[A].trait.bb.atk_scale, undefined);
  const { h, u } = field(B, { skill: 0 });
  const e = h.spawn('enemy_dummy', { pos: [10, 4] });
  h.runUntil(() => attacks(h, e).length >= 1, 10);
  strike(h, e, u, 'phys');
  assert.equal(extras(h, e).length, 0, 'not without a skill');
  cast(u);
  h.step();
  const n = attacks(h, e).length;
  h.runUntil(() => attacks(h, e).length > n, 10);
  const onAttack = extras(h, e).at(-1);
  assert.ok(onAttack, 'on her attack');
  assert.equal(onAttack.type, 'arts');
  near(onAttack.dmg.amount, u.s.atk * v, 'atk_scale');
  const k = extras(h, e).length;
  strike(h, e, u, 'phys');
  assert.equal(extras(h, e).length, k + 1, 'on enemy damage, one (and it answers nothing)');
  h.b.dealDamage(e, u, { amount: 1, type: 'arts', isSkill: true });
  assert.equal(extras(h, e).length, k + 2, 'any enemy damage');
  done(h);

  const f = field(A, { skill: 0 });
  const x = f.h.spawn('enemy_dummy', { pos: [10, 5] });
  cast(f.u);
  strike(f.h, x, f.u, 'phys');
  assert.equal(extras(f.h, x).length, 0, 'the normal form has no module');
  done(f.h);
});

test('a real match fields both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4047_pianst');
});

test('S2: the stack effects\' buffs come at 1 stack and at the two bounds, and go with the skill', () => {
  const id = FORMS[0], b2 = bbOf(id, S2);
  assert.deepEqual([b2.pianst_s_2_fxbound_1, b2.pianst_s_2_fxbound_2], [3, 7]);
  const { h, u } = field(id, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 9] });
  cast(u);
  h.step();
  const has = () => [1, 2, 3].map((n) => !!u.findBuff(`pianst_s_2_stkFx_${n}`));
  assert.deepEqual(has(), [false, false, false]);
  const upTo = (n) => { while ((u.findBuff(STACK)?.stacks ?? 0) < n) { strike(h, e, u, 'phys'); h.step(); } };
  upTo(1);
  assert.deepEqual(has(), [true, false, false]);
  upTo(3);
  assert.deepEqual(has(), [true, true, false]);
  upTo(7);
  assert.deepEqual(has(), [true, true, true]);
  u.skill.end();
  h.step();
  assert.deepEqual(has(), [false, false, false]);
});

test('S2: FinalAttack\'s cast is told at the interval (clip and cast effects), its hit on each enemy struck; no cast when stunned', () => {
  const id = FORMS[0], b2 = bbOf(id, S2);
  const { h, u } = field(id, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  const seen = [];
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, o) => { if (kind === 'kitHit' && /^pianst:final/.test(o?.k)) seen.push({ k: o.k, t: h.b.time, tgt: o.tgt, signal: o.signal }); return fx0(kind, o); };
  cast(u);
  const t0 = h.b.time;
  h.run(b2.interval + FINAL_DELAY + 0.2);
  assert.deepEqual(seen.map((s) => s.k), ['pianst:final', 'pianst:finalHit']);
  near(seen[0].t - t0, b2.interval, 'cast', 0.1);
  assert.equal(seen[0].signal, 'final');
  assert.equal(seen[1].tgt, e.id);
});

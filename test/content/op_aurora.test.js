// test/content/op_aurora.test.js — 오로라 (char_422_aurora, a tier-3 piece of 规程 (act3autochess); kit ops/op-aurora.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, begun, realMatch } from '../helpers/seasonPieces.js';
import { S1_BEGIN, S2_BEGIN, S2_BULLETS } from '../../server/sim/content/kits/ops/op-aurora.js';

const A = 'chess_char_3_07_a', B = 'chess_char_3_07_b';
const FORMS = [A, B];
const S1 = 'skchr_aurora_1', S2 = 'skchr_aurora_2';
const REST = 'aurora_t_1';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const attacks = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.isAttack);
/** An enemy she blocks from now on, without the walk. */
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('Trait: no SP unless she blocks; the elite (HES-X) gets ×(1 + sp_recover_ratio) instead', () => {
  const a = field(A, { skill: 0 });
  a.u.skill.sp = 0;
  a.h.run(3);
  assert.equal(a.u.skill.sp, 0, 'normal, blocking nobody: none');
  const e = a.h.spawn('enemy_dummy', { pos: [10, 5] });
  block(a.h, a.u, e);
  a.h.run(2);
  near(a.u.skill.sp, 2, 'normal, blocking: 1 a second', 0.1);
  const ratio = ACT3.chess[B].trait.bb.sp_recover_ratio;
  assert.equal(ratio, -0.8);
  const b = field(B, { skill: 0 });
  b.u.skill.sp = 0;
  b.h.run(5);
  near(b.u.skill.sp, 5 * (1 + ratio), 'elite, blocking nobody: slowly', 0.1);
  const f = b.h.spawn('enemy_dummy', { pos: [10, 5] });
  block(b.h, b.u, f);
  const was = b.u.skill.sp;
  b.h.run(2);
  near(b.u.skill.sp - was, 2, 'elite, blocking: 1 a second', 0.1);
  done(a.h); done(b.h);
});

test('T1: with SP at or below sp_ratio of the cost and the skill off: no attack, HP regen by max HP; off above it', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 0 });
    const cost = u.skill.spCost;
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    u.skill.locked = true;
    h.b.addBuff(u, { key: 'test:nosp', flags: { noSp: true } });
    u.skill.sp = cost * t.sp_ratio;   // exactly the ratio: 「小于或等于」
    h.step();
    assert.ok(u.findBuff(REST), `${id}: rests at the ratio`);
    assert.ok(u.s.flags.disarm);
    near(u.s.hpRegen, u.s.maxHp * t.hp_recovery_per_sec_by_max_hp_ratio, `${id}: regen`, 1e-3);
    u.hp = u.s.maxHp / 2;
    const n = attacks(h, e).length, hp = u.hp;
    h.run(2);
    assert.equal(attacks(h, e).length, n, `${id}: no attack`);
    near(u.hp - hp, u.s.maxHp * t.hp_recovery_per_sec_by_max_hp_ratio * 2, `${id}: HP over 2 s`, 0.02);
    // an attribute, no heal (PRTS): 禁疗 does not stop it
    h.b.addBuff(u, { key: 'test:noheal', flags: { noHeal: true } });
    const hp2 = u.hp;
    h.run(1);
    assert.ok(u.hp > hp2, `${id}: regen under 禁疗`);
    h.b.removeBuff(u, 'test:noheal');
    h.b.removeBuff(u, 'test:nosp');
    u.skill.sp = cost * t.sp_ratio + 1;
    h.step();
    assert.ok(!u.findBuff(REST), `${id}: over the ratio`);
    h.run(4);
    assert.ok(attacks(h, e).length > n, `${id}: attacks again`);
    done(h);
  }
});

test('T1: not while a skill runs (her Default mode\'s talent)', () => {
  for (const sk of [0, 1]) {
    const { h, u } = field(B, { skill: sk });
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    cast(u);
    begun(h, u);
    h.step();
    assert.ok(u.skill.active);
    assert.ok(!u.findBuff(REST), `S${sk + 1}: no rest while it runs`);
    done(h);
  }
});

test('S1: DEF, block +2, 抵抗, no attack during Skill_Begin; the duration starts after it; stun as it ends, the whole length', () => {
  for (const id of FORMS) {
    const b1 = bbOf(id, S1), rec = ACT3.chess[id].skills.find((s) => s.skillId === S1);
    const { h, u } = field(id, { skill: 0 });
    const def = u.s.def, block0 = u.s.blockCnt;
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    cast(u);
    const t0 = h.b.time, n0 = attacks(h, e).length;
    assert.ok(!u.skill.active && u.s.def === def, `${id}: nothing before Skill_Begin has played`);
    h.run(S1_BEGIN - 0.1);
    assert.equal(attacks(h, e).length, n0, `${id}: the begin clip holds her attacks`);
    begun(h, u);
    near(h.b.time - t0, S1_BEGIN, `${id}: the skill starts as the clip ends`, 0.07);
    near(u.s.def, def + u.base.def * b1.def, `${id}: DEF`, 1e-3);
    assert.equal(u.s.blockCnt, block0 + b1.block_cnt, `${id}: block`);
    assert.ok(u.findBuff('resist') || u.buffs.some((x) => x.status === 'resist'), `${id}: 抵抗`);
    h.runUntil(() => !u.skill.active, rec.duration + 2);
    near(h.b.time - t0, rec.duration + S1_BEGIN, `${id}: duration after the clip`, 0.003);
    assert.ok(u.s.flags.stun, `${id}: stunned as it ends`);
    const s = u.findBuff('stun');
    assert.ok(Math.abs(s.timeLeft - b1.stun) < 0.15, `${id}: the whole ${b1.stun} s: ${s.timeLeft}`);
    assert.ok(!u.buffs.some((x) => x.status === 'resist' || x.key === 'resist'), `${id}: 抵抗 is over`);
    assert.equal(u.s.blockCnt, block0, `${id}: block back`);
    done(h);
  }
});

test('S1: TAKE_DAMAGE, the trigger of the table', () => {
  assert.equal(ACT3.chess[B].skills[0].trigger.rule, 'TAKE_DAMAGE');
  assert.equal(ACT3.chess[B].skills[1].trigger.rule, 'TAKE_DAMAGE');
});

test('S2: nine attacks, ATK up, the interval longer by base_attack_time; no attack during Skill_2_Begin', () => {
  assert.equal(S2_BULLETS, 9);
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const atk = u.s.atk, iv = u.s.interval;
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    cast(u);
    const n0 = attacks(h, e).length;
    h.run(S2_BEGIN - 0.1);
    assert.equal(attacks(h, e).length, n0, `${id}: the begin clip holds her attacks`);
    begun(h, u);
    assert.equal(u.skill.spec.kind, 'ammo');
    assert.equal(u.skill.ammoLeft, S2_BULLETS);
    near(u.s.atk, atk + u.base.atk * b2.atk, `${id}: ATK`, 1e-3);
    near(u.s.interval, iv * (1 + b2.base_attack_time), `${id}: interval`, 1e-3);
    h.runUntil(() => !u.skill.active, 60);
    assert.equal(attacks(h, e).length - n0, S2_BULLETS, `${id}: nine`);
    done(h);
  }
});

test('S2: her attack gives 寒冷 for attack@cold s; a second one on it is 冻结; on a frozen target ATK × atk_scale and no more cold', () => {
  for (const id of FORMS) {
    const b2 = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    cast(u);
    h.runUntil(() => attacks(h, e).length >= 1, 10);
    const first = attacks(h, e)[0];
    assert.ok(e.findBuff('cold'), `${id}: cold`);
    assert.ok(Math.abs(e.findBuff('cold').timeLeft - b2['attack@cold']) < 0.2, `${id}: cold ${e.findBuff('cold').timeLeft}`);
    assert.ok(!e.s.flags.freeze, `${id}: one cold is no freeze`);
    h.runUntil(() => attacks(h, e).length >= 2, 10);
    assert.ok(e.s.flags.freeze, `${id}: the second makes it frozen`);
    const second = attacks(h, e)[1];
    near(second.dmg.amount, first.dmg.amount, `${id}: the hit that freezes has no × yet`, 1e-3);
    h.b.removeBuff(e, 'cold');
    e.findBuff('freeze').timeLeft = 100;
    h.runUntil(() => attacks(h, e).length >= 3, 10);
    const third = attacks(h, e)[2];
    near(third.dmg.amount / second.dmg.amount, b2.atk_scale, `${id}: ATK × atk_scale on a frozen one (before DEF)`, 1e-3);
    assert.ok(!e.findBuff('cold'), `${id}: no cold on a frozen one`);
    done(h);
  }
});

test('A cast cuts the swing in progress: that attack is lost', () => {
  for (const sk of [0, 1]) {
    const { h, u } = field(B, { skill: sk });
    const e = h.spawn('enemy_dummy', { pos: [10, 5] });
    block(h, u, e);
    h.runUntil(() => u.swing, 5);
    assert.ok(u.swing, 'mid-swing');
    const n = attacks(h, e).length;
    cast(u);
    h.run(0.8);
    assert.equal(attacks(h, e).length, n, `S${sk + 1}: no hit from the old swing`);
    done(h);
  }
});

test('S2: only that skill\'s attacks give it', () => {
  const { h, u } = field(B, { skill: 1 });
  u.skill.locked = true;
  u.skill.sp = u.skill.spCost;
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  block(h, u, e);
  h.runUntil(() => attacks(h, e).length >= 2, 20);
  assert.ok(!e.findBuff('cold'), 'a plain attack gives none');
  done(h);
  const s1 = field(B, { skill: 0 });
  const f = s1.h.spawn('enemy_dummy', { pos: [10, 5] });
  block(s1.h, s1.u, f);
  cast(s1.u);
  s1.h.runUntil(() => attacks(s1.h, f).length >= 2, 20);
  assert.ok(s1.u.skill.active);
  assert.ok(!f.findBuff('cold') && !f.s.flags.freeze, 'S1\'s attacks give none');
  done(s1.h);
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_422_aurora');
});

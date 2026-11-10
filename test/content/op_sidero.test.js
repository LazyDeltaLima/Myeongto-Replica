// test/content/op_sidero.test.js — 시데로카 (char_333_sidero, a tier-2 piece of 规程 (act3autochess); kit ops/op-sidero.js): both forms, both skills.
// Run: node --test test/content/op_sidero.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_2_22_a', B = 'chess_char_2_22_b';
const FORMS = [A, B];
const FRONT = [10, 5];
const skillBb = (id, i) => ACT3.chess[id].skills[i].bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
function block(h, u, e) { e.blockedBy = u; u.blocking.push(e); h.step(); }

test('术战者: arts attacks; AFT-Y: what she blocks takes 法术脆弱 damage_scale − 1, only the elite and only while blocked', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.profile.dmgType, 'arts', id);
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    h.run(0.3);
    assert.ok(!e.findBuff('artsFragile'), `${id}: not blocked: none`);
    block(h, u, e);
    h.run(0.3);
    if (id === A) { assert.ok(!e.findBuff('artsFragile'), 'the normal form has no module'); done(h); continue; }
    assert.ok(e.findBuff('artsFragile'), 'blocked: on');
    approx(e.s.artsTakenMul, ACT3.chess[id].trait.bb.damage_scale, 'the value');
    u.blocking.length = 0; e.blockedBy = null;
    h.run(0.6);
    assert.ok(!e.findBuff('artsFragile'), 'released: gone');
    done(h);
  }
});

test('T1 佣兵之韧 (elite; the normal form has no talent): her times-th knock-out gives ASPD +attack_speed and 抵抗, not before', () => {
  assert.equal(ACT3.chess[A].talents.length, 0, 'no talent in the normal record');
  const t = ACT3.chess[B].talents[0].bb;
  const { h, u } = field(B, { skill: 0 });
  const aspd0 = u.s.aspd;
  for (let i = 1; i <= t.times; i++) {
    const e = h.spawn('enemy_dummy', { pos: FRONT, hp: 1 });
    e.hp = 1;
    assert.ok(h.runUntil(() => !e.alive, 5), `knock-out ${i}`);
    h.step();
    if (i < t.times) assert.equal(u.s.aspd, aspd0, `${i}: not yet`);
  }
  assert.equal(u.s.aspd, aspd0 + t.attack_speed, 'ASPD');
  approx(h.b.resistOf(u), -t.one_minus_status_resistance, '抵抗');
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  e.hp = 1;
  h.runUntil(() => !e.alive, 5);
  h.step();
  assert.equal(u.s.aspd, aspd0 + t.attack_speed, 'once only');
  done(h);
});

test('S1 生命回复·γ型: heals heal_scale × her max HP at once', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 0);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, 'skcom_heal_self[3]');
    u.hp = 1;
    cast(u);
    h.step();
    approx(u.hp, 1 + u.s.maxHp * bb.heal_scale, id);
    done(h);
  }
});

test('S2 破浪回神: the skill\'s range 0-1 (her own tile), ATK +atk, HP regen max-HP ratio per second', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, 1);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, 'skchr_sidero_2');
    const atk0 = u.s.atk;
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    cast(u);
    h.step();
    approx(u.s.atk, atk0 * (1 + bb.atk), `${id}: ATK`);
    assert.equal(u.rangeKeys.length, 1, `${id}: her own tile`);
    approx(u.s.hpRegen, u.s.maxHp * bb.hp_recovery_per_sec_by_max_hp_ratio, `${id}: regen`);
    const hp = e.hp;
    h.run(3);
    assert.equal(e.hp, hp, `${id}: the enemy in front is out of reach`);
    u.hp = 1;
    h.run(1);
    assert.ok(u.hp > u.s.maxHp * bb.hp_recovery_per_sec_by_max_hp_ratio * 0.9, `${id}: regen ${u.hp}`);
    done(h);
  }
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_333_sidero')).skill.id, ACT3.chess[id].skill.skillId);
});

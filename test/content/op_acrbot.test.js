// test/content/op_acrbot.test.js — 레이지 아이언하이드 (“暴躁铁皮”, char_618_acrbot, the hidden tier-5 piece of 规程 (act3autochess);
// kit ops/op-acrbot.js): both forms, its skill, both talents, UNY-X.
// Run: node --test test/content/op_acrbot.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_5_22_a', B = 'chess_char_5_22_b';
const FORMS = [A, B];
const YAK = 'chess_char_1_02_a';
const FRONT = [10, 5];
const bbOf = (id) => ACT3.chess[id].skills[0].bb;
const tal = (id, i) => ACT3.chess[id].talents[i].bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
function block(u, e) { e.blockedBy = u; u.blocking.push(e); }
const struck = (h, u) => new Set(h.hooksOf('damaged').filter((d) => d.source === u).map((d) => d.target));

test('不屈者: no heal from allies; its attack strikes up to its block count of targets, the blocked ones first (`_limitedMaxTargetNumToBlockedCnt`)', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0, others: [{ uid: 2, chessId: YAK, row: 11, col: 4 }] });
    assert.equal(u.profile.noHeal, true, id);
    assert.equal(u.profile.hitAllBlocked, true, id);
    u.hp = u.s.maxHp / 2;
    const hp = u.hp;
    h.b.heal(h.unit(2), u, 500);
    assert.equal(u.hp, hp, `${id}: an ally's heal does nothing`);
    const foes = [0, 1, 2, 3, 4].map(() => h.spawn('enemy_dummy', { pos: [10, 4] }));
    for (const e of foes) block(u, e);
    h.step();
    assert.equal(u.s.blockCnt, ACT3.chess[id].stats.blockCnt + tal(id, 1).block_cnt, `${id}: 酋长之威 block +1`);
    h.runUntil(() => struck(h, u).size > 0, 10);
    h.step();
    assert.equal(struck(h, u).size, u.s.blockCnt, `${id}: one attack, ${u.s.blockCnt} targets`);
    done(h);
  }
});

test('T2 酋长之威: block +block_cnt, its range ability_range_forward_extend tiles longer (1; the elite 2)', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const ext = tal(id, 1).ability_range_forward_extend;
    assert.equal(u.rangeKeys.length, ACT3.chess[id].rangeGrid.length + ext, id);
    const far = h.spawn('enemy_dummy', { pos: [10, 5 + ext] });
    const hp = far.hp;
    h.runUntil(() => far.hp < hp, 10);
    assert.ok(far.hp < hp, `${id}: an enemy ${ext + 1} tiles ahead is struck`);
    done(h);
  }
});

test('S1 大丑的愤怒: base attack time −0.6 s, ATK +atk, max HP +max_hp; no 晕眩 / 沉默 / 冻结 / 沉睡 / 浮空 while on', () => {
  for (const id of FORMS) {
    const bb = bbOf(id);
    const { h, u } = field(id, { skill: 0 });
    const s0 = { atk: u.s.atk, hp: u.s.maxHp, bat: u.s.bat };
    cast(u);
    h.step();
    approx(u.s.atk, s0.atk * (1 + bb.atk), `${id}: ATK`);
    approx(u.s.maxHp, s0.hp * (1 + bb.max_hp), `${id}: max HP`);
    approx(u.s.bat, s0.bat + bb.base_attack_time, `${id}: base attack time`);
    for (const st of ['stun', 'silence', 'freeze', 'sleep', 'levitate']) assert.equal(h.b.applyStatus(u, st, { duration: 3 }), false, `${id}: ${st}`);
    u.skill.end('duration');
    h.step();
    assert.equal(h.b.applyStatus(u, 'stun', { duration: 1 }), true, `${id}: stunned again after it`);
    done(h);
  }
});

test('S1: it strikes the allies of its range too — with no enemy there, and beside the enemies; not before the skill', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0, others: [{ uid: 2, chessId: YAK, row: 10, col: 5 }] });
    const ally = h.unit(2);
    h.run(3);
    assert.ok(!struck(h, u).has(ally), `${id}: not without the skill`);
    cast(u);
    assert.ok(h.runUntil(() => struck(h, u).has(ally), 5), `${id}: the ally in front is struck`);
    assert.ok(ally.hp < ally.s.maxHp, `${id}: it takes the damage`);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const hp = e.hp, n = h.hooksOf('damaged').filter((d) => d.source === u && d.target === ally).length;
    h.runUntil(() => e.hp < hp, 5);
    h.step();
    assert.ok(h.hooksOf('damaged').filter((d) => d.source === u && d.target === ally).length > n, `${id}: and with an enemy there, both`);
    done(h);
  }
});

test('T1 荒蛮之心: knocked out, atk_scale × its ATK arts damage on every enemy within projectile_range, each stunned `stun` s', () => {
  for (const id of FORMS) {
    const t = tal(id, 0);
    const { h, u } = field(id, { skill: 0 });
    const near = h.spawn('enemy_dummy', { pos: [10, 5.5] }), out = h.spawn('enemy_dummy', { pos: [10, 4 + t.projectile_range + 0.2] });
    h.run(0.2);
    u.lastAttackAt = h.b.time; u.atkCd = 99;
    const atk = u.s.atk, hp = [near.hp, out.hp];
    h.b.dealDamage(near, u, { amount: 1e9, type: 'true' });
    h.step();
    assert.ok(!u.alive, `${id}: down`);
    approx(hp[0] - near.hp, atk * t.atk_scale, `${id}: the burst`);
    assert.ok(near.findBuff('stun')?.timeLeft > t.stun - 0.2, `${id}: stunned`);
    assert.equal(out.hp, hp[1], `${id}: out of reach`);
    assert.ok(!out.findBuff('stun'), id);
    done(h);
  }
});

test('UNY-X (elite only): damage from a unit it blocks × damage_scale', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const blocked = h.spawn('enemy_dummy', { pos: [10, 4] }), free = h.spawn('enemy_dummy', { pos: FRONT });
    block(u, blocked);
    h.step();
    const mul = id === B ? ACT3.chess[id].trait.bb.damage_scale : 1;
    let hp = u.hp;
    h.b.dealDamage(blocked, u, { amount: 1000, type: 'true' });
    approx(hp - u.hp, 1000 * mul, `${id}: from the blocked one`);
    hp = u.hp;
    h.b.dealDamage(free, u, { amount: 1000, type: 'true' });
    approx(hp - u.hp, 1000, `${id}: from another`);
    done(h);
  }
});

test('real match path: its piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_618_acrbot')).skill.id, ACT3.chess[id].skill.skillId);
});

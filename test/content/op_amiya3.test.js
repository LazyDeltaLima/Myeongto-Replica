// test/content/op_amiya3.test.js — 아미야 in her 의료 form (charId char_002_amiya, body char_1037_amiya3; a tier-5 piece of 规程
// (act3autochess); kit ops/op-amiya3.js): both forms, both skills, the kit found by her body.
// Run: node --test test/content/op_amiya3.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, fill, realMatch } from '../helpers/seasonPieces.js';
import { kitKeyOfChar } from '../../server/sim/content/kits/index.js';
import { chessBody } from '../../shared/standIn.js';
import { S2_TARGETS } from '../../server/sim/content/kits/ops/op-amiya3.js';

const A = 'chess_char_5_26_a', B = 'chess_char_5_26_b';
const FORMS = [A, B];
const S1 = 'skchr_amiya3_1', S2 = 'skchr_amiya3_2';
const YAK = 'chess_char_1_02_a';
const skillBb = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);

test('a template chess: the operator 阿米娅 (charId), the body char_1037_amiya3 (tmplId) — her kit is the body\'s', () => {
  for (const id of FORMS) {
    const rec = ACT3.chess[id];
    assert.equal(rec.charId, 'char_002_amiya');
    assert.equal(chessBody(rec), 'char_1037_amiya3');
    assert.deepEqual(rec.skills.map((s) => s.skillId), [S1, S2]);
  }
  assert.equal(kitKeyOfChar('char_1037_amiya3', 5), 'char_1037_amiya3');
  assert.equal(kitKeyOfChar('char_002_amiya', 5), null, 'no kit under the operator id (another form of her would be another body)');
  const { h, u } = field(A, { skill: 0 });
  assert.ok(u.findBuff(`amiya3_t_1:${u.id}`), 'her talent runs: the kit was found');
  done(h);
});

test('咒愈师: the incantationmedic profile (arts; heals an ally of her range by scale × the damage: 50 %, INC-X 60 %)', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.profile.dmgType, 'arts', id);
    assert.equal(u.profile.healRatio, ACT3.chess[id].trait.bb.scale, id);
    done(h);
  }
});

test('T1 诚挚期许: every allied unit max HP +max_hp while she is on the field; HP regen max-HP ratio only while a skill of hers is on', () => {
  for (const id of FORMS) {
    const t = ACT3.chess[id].talents[0].bb;
    const { h, u } = field(id, { skill: 0, others: [{ uid: 2, chessId: YAK, row: 12, col: 1 }] });
    h.run(0.5);
    const ally = h.unit(2);
    approx(ally.s.maxHp, ally.base.maxHp * (1 + t.max_hp), `${id}: far away too`);
    assert.ok(!ally.findBuff(`amiya3_t_1[s]:${u.id}`), `${id}: no regen without a skill`);
    cast(u);
    h.run(0.5);
    assert.equal(ally.findBuff(`amiya3_t_1[s]:${u.id}`)?.mods.hpRegenRatio, t.hp_recovery_per_sec_by_max_hp_ratio, `${id}: regen in S1`);
    u.skill.end('duration');
    h.run(0.5);
    assert.ok(!ally.findBuff(`amiya3_t_1[s]:${u.id}`), `${id}: regen gone with the skill`);
    done(h);
  }
});

test('S1 哀恸共情: ASPD +attack_speed; each attack heals every other ally on x-1 around her by heal_scale × ATK, not herself, not outside', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, S1);
    const { h, u } = field(id, { skill: 0, others: [{ uid: 2, chessId: YAK, row: 9, col: 3 }, { uid: 3, chessId: YAK, row: 7, col: 4 }] });
    assert.equal(u.skill.id, S1);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const aspd0 = u.s.aspd;
    cast(u);
    h.step();
    assert.equal(u.s.aspd - aspd0, bb.attack_speed, `${id}: ASPD`);
    const near = h.unit(2), out = h.unit(3);
    for (const a of [near, out, u]) a.hp = a.s.maxHp * 0.3;
    const heals = [];
    h.b.on('heal', (c) => { if (c.source === u) heals.push(c); });
    const hp0 = e.hp;
    h.runUntil(() => e.hp < hp0, 5);
    h.step();
    const onNear = heals.filter((c) => c.target === near && c.opts?.tags?.includes('skill'));
    assert.equal(onNear.length, 1, `${id}: one skill heal on the ally 2 tiles away (diagonal 1+1)`);
    approx(onNear[0].amount, u.s.atk * bb.heal_scale, `${id}: heal_scale × ATK`);
    assert.ok(!heals.some((c) => c.target === out && c.opts?.tags?.includes('skill')), `${id}: 3 tiles away is out`);
    assert.ok(!heals.some((c) => c.target === u && c.opts?.tags?.includes('skill')), `${id}: not herself`);
    done(h);
  }
});

test('S2 慈悲愿景: one blast on every enemy of her range (arts, debuff), ATK +atk per hit (max 5), then true damage on 2 at once; once a battle', () => {
  for (const id of FORMS) {
    const bb = skillBb(id, S2);
    const { h, u } = field(id, { skill: 1 });
    assert.equal(u.skill.id, S2);
    const foes = [[10, 5], [10, 6], [9, 6], [11, 6], [10, 7], [9, 7], [11, 7]].map((p) => h.spawn('enemy_dummy', { pos: p }));
    h.run(0.2);
    const hp = foes.map((e) => e.hp);
    const atk0 = u.s.atk;
    cast(u);
    h.strike(u);
    h.step();
    for (const [i, e] of foes.entries()) assert.ok(e.hp <= hp[i] - atk0 * bb.atk_scale + 1e-6, `${id}: foe ${i} blasted`);
    const d = foes[0].findBuff('amiya3_s_2[debuff]');
    assert.equal(d?.mods.aspd, bb['amiya3_s_2[debuff].attack_speed'], `${id}: ASPD down`);
    approx(d.mods.moveMul, 1 + bb['amiya3_s_2[debuff].move_speed'], `${id}: move down`);
    approx(u.findBuff('amiya3_s_2[atk]').mods.atkPct, bb.atk * bb.max_stack_cnt, `${id}: 7 hit, capped at max_stack_cnt`);
    // the mode after it: true damage, two targets at once
    const trueHits = new Map();
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.isAttack && c.dmg.type === 'true') trueHits.set(c.dmg.attackId, (trueHits.get(c.dmg.attackId) ?? 0) + 1); });
    h.run(5);
    assert.ok(trueHits.size > 0, `${id}: true damage attacks`);
    assert.ok([...trueHits.values()].every((n) => n === S2_TARGETS), `${id}: ${[...trueHits.values()]}`);
    u.skill.end('duration');
    h.step();
    assert.ok(!u.findBuff('amiya3_s_2[atk]'), `${id}: the ATK leaves with the skill`);
    fill(u);
    h.run(60);
    assert.equal(u.skill.sp, 0, `${id}: no SP after its one use`);
    assert.equal(u.skill.active, false, id);
    done(h);
  }
});

test('real match path: her piece fights in a 规程 match', async () => {
  for (const id of FORMS) assert.equal((await realMatch(id, 'char_002_amiya')).skill.id, ACT3.chess[id].skill.skillId);
});

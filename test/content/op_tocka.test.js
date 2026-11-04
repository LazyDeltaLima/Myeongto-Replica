// test/content/op_tocka.test.js — the 自选 operator kit of 冻河 (char_4244_tocka, 6★ 辅助 游击手; kit
// server/sim/content/kits/ops/op-tocka.js), fielded the production way (a DIY slot + its `diy` pick, simdata getDiy) in every
// form: tiers 5 / 6, normal (E2 Lv1, skill rank 4) and elite (E2 Lv60, rank 7); she has no module. Numbers from
// data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_tocka.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const ID = 'char_4244_tocka';
const FORMS = BACKUPS.units[ID].forms;
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const S1 = 'skchr_tocka_1', S2 = 'skchr_tocka_2', S3 = 'skchr_tocka_3';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const talentOf = (tier, elite, i) => formOf(tier, elite).talents[i].bb;
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const FORMS_ALL = [[5, false], [6, false], [5, true], [6, true]];
const label = ([tier, elite]) => `T${tier} ${elite ? 'elite' : 'normal'}`;
/** Allies: 红豆 (MANUAL, time SP), 古米 (AUTO), 普罗旺斯 (PASSIVE), 隐现 (MANUAL). */
const HONGDOU = 'chess_char_1_05_a', GUMMY = 'chess_char_1_10_a', PROVENCE = 'chess_char_1_07_a', INSIDER = 'chess_char_1_01_a';
const fxOf = (a, base, src) => a.buffs.find((b) => b.key === `${base}:${src.id}`) ?? null;

/** 冻河 as uid 1 at (10, 5) facing RIGHT (her 3-18 reaches (9–11, 6) and (10, 8)), plus `others` and `enemies`. */
function field({ tier = 5, elite = false, skill = 0, others = [], enemies = [], seed = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'skillStart', 'skillEnd', 'statusApplied', 'heal', 'spGain', 'attack'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: SLOT[tier], charId: ID, skillIndex: skill }, elite, row: 10, col: 5 }, ...others],
    enemies,
  });
  h.step();
  return { h, u: h.unit(1) };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
/** No attacks of this unit (to isolate an effect). */
const quiet = (h, u) => h.b.addBuff(u, { key: 'test:disarm', flags: { disarm: true } });

test('冻河 in every 自选 form: her kit (all three skills authored), the form\'s stats, 3-18, 游击手 (ranged physical, hits air, blocks 1), S1 / S2 AUTO time SP cast by the kit (full SP + a target), S3 data DEFAULT, 协防 bond, no 特质', () => {
  assert.ok(OPERATOR_KITS[ID] === KITS[ID]);
  for (const f of FORMS_ALL) {
    const [tier, elite] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, skill });
      const form = formOf(tier, elite), rec = form.skills[skill];
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, SLOT[tier], rec.skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def, u.base.res], [form.stats.maxHp, form.stats.atk, form.stats.def, form.stats.res], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat, u.profile.maxTargets], [1, 'ranged', 'phys', true, 2.1, 1], `${label(f)}: 游击手`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-18`);
      assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.kind, u.skill.spCost], [...[['NEVER', 'time', 'instant'], ['NEVER', 'time', 'instant'], ['DEFAULT', 'time', 'duration']][skill], rec.spCost], `${label(f)}: trigger / SP / kind`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([FORMS['2/1/4/0'].stats.maxHp, FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.maxHp, FORMS['2/60/7/1'].stats.atk], [1315, 704, 1562, 795]);
  assert.deepEqual(BACKUPS.units[ID].moduleNames, {}, 'no module');
});

test('a 自选 pick: 冻河 is offered at tiers 5 and 6 and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  for (const tier of [5, 6]) assert.ok(diyPool(tier, { data, kitted: KITTED_CHARS }).includes(ID), `tier ${tier}`);
  assert.ok(KITTED_CHARS.includes(ID));
  for (const tier of [5, 6]) {
    const picks = { [SLOT[tier]]: { charId: ID, skillIndex: 2, uniEquipId: null } };
    assert.deepEqual(validateDiyPicks(picks, { data, kitted: KITTED_CHARS }), { ok: true, picks }, `tier ${tier}`);
  }
});

test('S1 一无所有之人 (AUTO, 18 / 15 SP): at full SP it puts its effect on up to 2 ally operators of her range with none, the lowest HP ratio first (herself too); with none left it waits at full SP', () => {
  for (const elite of [false, true]) {
    const sk = skillOf(5, elite, S1);
    const { h, u } = field({ elite, skill: 0, others: [{ uid: 2, chessId: HONGDOU, row: 10, col: 6 }, { uid: 3, chessId: INSIDER, row: 11, col: 6 }, { uid: 4, chessId: INSIDER, row: 9, col: 9 }] });
    const a = h.unit(2), b = h.unit(3), far = h.unit(4);
    for (const x of [u, a, b, far]) quiet(h, x);
    b.hp = b.s.maxHp * 0.5;
    u.hp = u.s.maxHp * 0.8;
    const atk = u.s.atk;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 30), 'cast');
    approx(h.b.time, sk.spCost - sk.initSp, `${elite}: at full SP`, 0.05);
    h.strike(u);
    assert.deepEqual([u, a, b, far].map((x) => !!fxOf(x, 'tocka:s1', u)), [true, false, true, false], `${elite}: 2 picks, lowest HP ratio first, none out of range`);
    approx(fxOf(b, 'tocka:s1', u).data.atk, atk, 'her ATK at the cast');
    assert.ok(u.buffs.some((x) => x.key === 'tocka:mark'), 'T2 mark');
    assert.ok(h.runUntil(() => u.skill.activations === 2, sk.spCost + 2), 'the next cast takes the one left');
    h.strike(u);
    assert.ok(fxOf(a, 'tocka:s1', u));
    h.run(sk.spCost + 5);
    assert.equal(u.skill.activations, 2, 'nobody without the effect: no cast');
    assert.ok(u.skill.ready, 'SP kept full');
    done(h);
  }
});

test('S1: the first damage an ally with the effect takes (not 元素伤害, not 持续伤害) gives a 屏障 of 160 % / 190 % of her ATK at the cast against all but 元素伤害, losing 1/10 every second, stuns the attacker 3 s, and T1: +2 SP, a heal of 100 % ATK on the most injured other ally of her range', () => {
  for (const elite of [false, true]) {
    const b1 = skillOf(5, elite, S1).bb, t1 = talentOf(5, elite, 0);
    const { h, u } = field({ elite, skill: 0, others: [{ uid: 2, chessId: HONGDOU, row: 10, col: 6 }, { uid: 3, chessId: INSIDER, row: 11, col: 6 }],
      enemies: [{ key: 'enemy_dummy', pos: [10, 12] }] });
    const a = h.unit(2), b = h.unit(3), e = h.enemies()[0];
    for (const x of [u, a, b]) quiet(h, x);
    a.hp = a.s.maxHp * 0.4;
    b.hp = b.s.maxHp * 0.6;
    assert.ok(h.runUntil(() => u.skill.activations === 1, 30));
    h.strike(u);
    assert.ok(fxOf(a, 'tocka:s1', u) && fxOf(b, 'tocka:s1', u), 'both allies');
    const atk = fxOf(a, 'tocka:s1', u).data.atk;
    // 元素伤害 and 持续伤害 leave it
    h.b.dealDamage(e, a, { amount: 10, type: 'elemental' });
    h.b.dealDamage(e, a, { amount: 10, type: 'arts', tags: ['dot'] });
    assert.ok(fxOf(a, 'tocka:s1', u), 'still on');
    const sp0 = u.skill.sp, nHeal = h.hooksOf('heal').length, nDmg = h.hooksOf('damaged').length;
    h.b.dealDamage(e, a, { amount: 300, type: 'true', isAttack: true });
    const cap = atk * b1.shield_atk_scale;
    const sh = a.buffs.find((x) => x.key === `tocka:shield:${u.id}`);
    assert.ok(sh && !fxOf(a, 'tocka:s1', u), `${elite}: the 屏障, the effect gone`);
    assert.deepEqual(h.hooksOf('damaged').slice(nDmg).filter((c) => c.target === a).map((c) => c.amount), [0], 'the hit that set it off is absorbed');
    approx(sh.shield, cap - 300, `${elite}: ${b1.shield_atk_scale} × ATK`);
    const st = h.hooksOf('statusApplied').filter((c) => c.status === 'stun' && c.target === e);
    assert.equal(st.length, 1);
    approx(st[0].duration, b1.stun, 'stun');
    approx(u.skill.sp - sp0, t1.sp, 'T1 SP', 0.05);
    const heals = h.hooksOf('heal').slice(nHeal).filter((c) => c.source === u);
    assert.equal(heals.length, 1);
    assert.ok(heals[0].target === a, 'the most injured ally (the effect\'s holder itself here)');
    approx(heals[0].amount, u.s.atk * t1.heal_scale, 'T1 heal');
    h.run(1.02);
    approx(sh.shield, cap - 300 - cap / b1.shield_time, 'decay', 1e-4);
    // 元素伤害 passes the 屏障
    const hp1 = a.hp;
    h.b.dealDamage(e, a, { amount: 50, type: 'elemental' });
    approx(a.hp, hp1 - 50, '元素伤害 not absorbed');
    h.run(b1.shield_time);
    assert.ok(!a.buffs.some((x) => x.key === `tocka:shield:${u.id}`), 'gone after shield_time');
    done(h);
  }
});

test('S2 意欲呼啸之心 (AUTO, 8 / 6 SP): on the latest deployed ally operator with a skill (never a passive one), herself last; once its skill could be cast: ASPD +25 / +35 for 15 s and T1; a MANUAL skill is then cast at once with no enemy (the automatic operations\' conditions not checked); an AUTO one only gains the ASPD', () => {
  for (const elite of [false, true]) {
    const b2 = skillOf(6, elite, S2).bb, t1 = talentOf(6, elite, 0);
    const { h, u } = field({ tier: 6, elite, skill: 1, others: [{ uid: 2, chessId: PROVENCE, row: 9, col: 6 }, { uid: 3, chessId: GUMMY, row: 11, col: 6 }, { uid: 4, chessId: HONGDOU, row: 10, col: 6 }] });
    const pr = h.unit(2), gu = h.unit(3), hd = h.unit(4);
    for (const x of [pr, gu, hd]) quiet(h, x);
    assert.ok(h.runUntil(() => u.skill.activations === 1, 30));
    assert.ok(h.runUntil(() => !!fxOf(hd, 'tocka:s2', u), 1), 'the latest deployed: 红豆 (after the shot)');
    assert.ok(u.buffs.some((x) => x.key === 'tocka:mark'), 'T2 mark');
    const sp0 = u.skill.sp;
    hd.skill.setSpTotal(hd.skill.spCost);
    assert.ok(h.runUntil(() => !fxOf(hd, 'tocka:s2', u), 0.3), 'set off within 0.2 s');
    const auto = hd.buffs.find((x) => x.key === `tocka:auto:${u.id}`);
    assert.ok(auto);
    assert.deepEqual([auto.mods.aspd, auto.timeLeft > b2.buff_duration - 0.3], [b2.attack_speed, true]);
    approx(u.skill.sp - sp0, t1.sp, 'T1 SP', 0.3);
    assert.ok(h.runUntil(() => hd.skill.active, 0.5), '红豆\'s MANUAL skill cast with no enemy on the field');
    assert.equal(h.hooksOf('skillStart').find((c) => c.unit === hd).reason, 'tocka');
    // the next casts: 古米 (AUTO), then herself — never 普罗旺斯 (passive)
    assert.ok(h.runUntil(() => !!fxOf(gu, 'tocka:s2', u) || gu.buffs.some((x) => x.key === `tocka:auto:${u.id}`), 30), '古米 next');
    assert.ok(h.runUntil(() => gu.buffs.some((x) => x.key === `tocka:auto:${u.id}`), 30), 'its AUTO skill ready: the ASPD');
    h.run(1);
    assert.ok(!h.hooksOf('skillStart').some((c) => c.unit === gu && c.reason === 'tocka'), 'an AUTO skill is not cast by it');
    assert.ok(h.runUntil(() => !!fxOf(u, 'tocka:s2', u) || u.buffs.some((x) => x.key === `tocka:auto:${u.id}`), 30), 'herself last');
    assert.ok(!fxOf(pr, 'tocka:s2', u) && !pr.buffs.some((x) => x.key === `tocka:auto:${u.id}`), 'never the passive one');
    done(h);
  }
});

test('S3 踽踽独行之春 (MANUAL, data DEFAULT, 20 s): ASPD +60 / +70; 4 targets for 175 % / 190 % ATK physical and 晕眩 0.5 s each; at its start the effect goes on the ally of her range with the highest SP ratio, which gains 1 SP a second while S3 runs', () => {
  for (const elite of [false, true]) {
    const b3 = skillOf(5, elite, S3).bb;
    const enemies = [[10, 7], [10, 8], [9, 7], [11, 7], [9, 8]].map((p) => ({ key: 'enemy_dummy', pos: p }));
    const { h, u } = field({ elite, skill: 2, others: [{ uid: 2, chessId: HONGDOU, row: 9, col: 6 }, { uid: 3, chessId: INSIDER, row: 11, col: 6 }], enemies });
    const hd = h.unit(2), ins = h.unit(3);
    for (const x of [hd, ins]) quiet(h, x);
    hd.skill.setSpTotal(0);
    ins.skill.setSpTotal(5);
    u.skill.setSpTotal(u.skill.spCost);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast while attacking');
    assert.deepEqual([u.s.aspd, u.profile.splashRadius ?? 0], [100 + b3.attack_speed, 0]);
    assert.ok(fxOf(ins, 'tocka:s3', u) && !fxOf(hd, 'tocka:s3', u), 'the higher SP ratio');
    const n0 = h.hooksOf('attack').length;
    assert.ok(h.runUntil(() => h.hooksOf('attack').slice(n0).some((c) => c.attacker === u), 5));
    const atk = h.hooksOf('attack').slice(n0).find((c) => c.attacker === u);
    assert.equal(atk.targets.length, 4, '4 targets');
    h.run(1);
    const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isSkill && c.type === 'phys');
    assert.ok(hits.length >= 4);
    approx(hits[0].dmg.amount, u.s.atk * b3['attack@atk_scale'], `${elite}: ATK scale`, 0.02);
    assert.ok(h.hooksOf('statusApplied').filter((c) => c.status === 'stun' && c.source === u).every((c) => Math.abs(c.duration - b3['attack@stun']) < 1e-9));
    const sp = h.hooksOf('spGain').filter((c) => c.unit === ins && c.reason === 'tocka');
    assert.ok(sp.length >= 1 && sp.every((c) => c.amount === b3.bonus_sp), 'bonus_sp a second');
    assert.ok(!h.hooksOf('damaged').some((c) => c.source === u && c.dmg?.isSplash), 'no T2Attack in S3\'s mode');
    done(h);
  }
});

test('S3: when the holder starts its skill — it and she get ATK +70 % / +90 % falling 4.7 % / 6 % a second for 15 s, the effect moves to another ally of her range (also after S3 ended; no SP then), T1; her next S3 sets off the one held; it leaves with her', () => {
  for (const elite of [false, true]) {
    const b3 = skillOf(5, elite, S3).bb;
    const { h, u } = field({ elite, skill: 2, others: [{ uid: 2, chessId: HONGDOU, row: 9, col: 6 }, { uid: 3, chessId: INSIDER, row: 11, col: 6 }],
      enemies: [{ key: 'enemy_dummy', pos: [10, 8] }] });
    const hd = h.unit(2), ins = h.unit(3);
    for (const x of [hd, ins]) quiet(h, x);
    hd.skill.setSpTotal(0);
    ins.skill.setSpTotal(5);
    u.skill.setSpTotal(u.skill.spCost);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    assert.ok(fxOf(ins, 'tocka:s3', u));
    ins.skill.setSpTotal(ins.skill.spCost);
    ins.skill.activate('test');
    const bi = ins.buffs.find((x) => x.key === `tocka:bonus:${u.id}`), bu = u.buffs.find((x) => x.key === `tocka:bonus:${u.id}`);
    assert.ok(bi && bu, 'the bonus on both');
    assert.deepEqual([bi.mods.atkPct, bu.mods.atkPct, bi.timeLeft], [b3.bonus_init_atk, b3.bonus_init_atk, b3.bonus_duration]);
    assert.ok(!fxOf(ins, 'tocka:s3', u) && fxOf(hd, 'tocka:s3', u), 'moved to 红豆');
    h.run(1.02);
    approx(bi.mods.atkPct, b3.bonus_init_atk - b3.bonus_atk_dec_per_sec, 'falling');
    // after her S3: the move still happens, without the SP
    assert.ok(h.runUntil(() => !u.skill.active, 25));
    const nSp = h.hooksOf('spGain').filter((c) => c.unit === hd && c.reason === 'tocka').length;
    h.run(2);
    assert.equal(h.hooksOf('spGain').filter((c) => c.unit === hd && c.reason === 'tocka').length, nSp, 'no SP outside S3');
    hd.skill.setSpTotal(hd.skill.spCost);
    hd.skill.activate('test');
    assert.ok(!fxOf(hd, 'tocka:s3', u) && fxOf(ins, 'tocka:s3', u), 'moved back to 隐现 with S3 off');
    // her next S3 sets off the one held (no skill of the holder needed)
    const nb = h.hooksOf('skillStart').length;
    u.skill.setSpTotal(u.skill.spCost);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    assert.ok(h.hooksOf('skillStart').slice(nb).every((c) => c.unit === u), 'only hers');
    assert.ok(!fxOf(ins, 'tocka:s3', u) && fxOf(hd, 'tocka:s3', u), 'set off at her S3 start: moved on');
    h.b.retreat(u, { reason: 'retreat' });
    h.step();
    assert.ok(!fxOf(hd, 'tocka:s3', u), 'gone with her');
    done(h);
  }
});

test('T2 雪的印痕: after she puts an effect on, her next normal attack hits every enemy within 1.5 of its target (air too) and gives each 虚弱 20 % and 80 % ATK arts a second for 8 s; the attack after it is a normal one', () => {
  for (const elite of [false, true]) {
    const t2 = talentOf(6, elite, 1);
    const enemies = [{ key: 'enemy_dummy', pos: [10, 8] }, { key: 'enemy_fly', pos: [9, 8] }, { key: 'enemy_dummy', pos: [10, 9] }, { key: 'enemy_dummy', pos: [11, 10] }];
    const { h, u } = field({ tier: 6, elite, skill: 0, enemies });
    assert.ok(h.runUntil(() => u.buffs.some((x) => x.key === 'tocka:mark'), 30), 'S1 on herself: the mark');
    const n0 = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => !u.buffs.some((x) => x.key === 'tocka:mark'), 5), 'spent by the next attack');
    h.run(0.5);
    const first = h.hooksOf('damaged').slice(n0).filter((c) => c.source === u && c.dmg?.isAttack && !c.dmg?.tags?.includes('dot'));
    const main = first.find((c) => !c.dmg.isSplash).target;
    const near = h.enemies().filter((e) => e !== main && Math.hypot(e.x - main.x, e.y - main.y) <= t2['attack@projectile_range'] + 1e-9);
    assert.ok(near.length >= 1, 'a neighbour in reach');
    assert.deepEqual(first.filter((c) => c.dmg.isSplash).map((c) => c.target.id).sort(), near.map((e) => e.id).sort(), `${elite}: the area`);
    const weak = h.hooksOf('statusApplied').filter((c) => c.status === 'weaken' && c.source === u);
    assert.deepEqual(weak.map((c) => c.target.id).sort(), [main, ...near].map((e) => e.id).sort());
    assert.ok(weak.every((c) => Math.abs(c.value + t2['attack@t2_atk']) < 1e-9 && Math.abs(c.duration - t2['attack@t2_buff_duration']) < 1e-9));
    const t0 = h.b.time;
    h.run(t2['attack@t2_buff_duration'] + 0.5);
    const dots = h.hooksOf('damaged').filter((c) => c.source === u && c.target === main && c.dmg?.tags?.includes('dot'));
    assert.equal(dots.length, t2['attack@t2_buff_duration'], 'one a second');
    approx(dots[0].dmg.amount, u.s.atk * t2['attack@t2_magic_atk_scale'], 'the value', 0.02);
    assert.ok(dots.every((c) => c.type === 'arts' && c.t > t0));
    const later = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isSplash && c.t > t0 + 0.6);
    assert.equal(later.length, 0, 'later attacks are normal ones');
    done(h);
  }
});

test('冻河 through the real match path (seats[].diy → Match board → battleInput → BattleSpec → createBattleFromSpec): her kit, S1 shields an ally', async () => {
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const T6 = SLOT[6];
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId: ID, skillIndex: 0, uniEquipId: null } } }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
  h.toPrep(1);
  h.setStage('act2autochess_m04');
  const m = h.m, ps = h.ps('p_0');
  ps.initDiyStock?.(new Set());
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const t = ps.acquireChess(T6, { source: 'buy' });
  assert.ok(t, 'her piece');
  assert.ok(m.handle('p_0', { t: 'g.move', uid: t.uid, to: { area: 'board', row: 9, col: 3 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  while (b.waveT0 == null) b.step();
  const u = b.allyUnits.find((x) => x.kind === 'op' && x.def.charId === ID);
  assert.ok(u && !u.kit.generic && u.skill.id === S1, 'her kit, S1');
  for (let i = 0; i < 30 * 40 && u.skill.activations === 0; i++) b.step();
  assert.equal(u.skill.activations, 1, 'S1 cast');
  for (let i = 0; i < 60 && u.skill._castStage; i++) b.step();
  assert.ok(u.buffs.some((x) => x.key === `tocka:s1:${u.id}`), 'on herself (alone)');
  assert.equal(b.errors.length, 0, JSON.stringify(b.errors[0]));
});

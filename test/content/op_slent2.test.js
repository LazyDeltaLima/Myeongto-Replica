// test/content/op_slent2.test.js — 淬羽赫默 (char_1031_slent2, a tier-4 piece of 规程 (act3autochess), 6★ 护佑者; kit
// server/sim/content/kits/ops/op-slent2.js, from the upstream 自选 kit, kept as a season kit — not a 自选 pick here) and her
// summon 夜灯 (token_10029_slent2_protrb; the placed hand piece of her player): both forms of chess_char_4_20 — normal A (E2 Lv1,
// skill rank 4, no module) and elite B (E2 Lv60, rank 7) with no module, BLS-X “难得清醒” (its default) or BLS-Y “可控动量”, at
// stage 1 (规程 has no stage 3: the stage-2+ talent changes never come). Numbers from data/seasons/act3autochess/chess.json;
// the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_slent2.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3, pieceForms, realMatch } from '../helpers/seasonPieces.js';
import { KITTED_CHARS, SEASON_KITS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';
import { COLS } from '../../server/sim/constants.js';
import { holdsUndying } from '../../server/sim/content/items/battle.js';
import { shelterOf, RHINE } from '../../server/sim/content/kits/ops/op-slent2.js';

const ID = 'char_1031_slent2';
const LAMP = 'token_10029_slent2_protrb';
const P = pieceForms('chess_char_4_20_a');
const X = 'uniequip_002_slent2', Y = 'uniequip_003_slent2';
const S1 = 'skchr_slent2_1', S2 = 'skchr_slent2_2', S3 = 'skchr_slent2_3';
// `tier` is kept from the 自选 test's signatures: 规程 has one tier (4) and stage 1 only
const formOf = (_tier, elite) => P.formOf(elite);
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (_tier, mod) => P.modOf(mod);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
/** A synthetic 【莱茵生命】 ally (伊芙利特's charId; no skill) and a plain one. */
const RHINE_REC = chessRec({ id: 'test_rhine_a', charId: 'char_134_ifrit', profession: 'CASTER', skill: null, stats: { maxHp: 2000, def: 0, res: 0 } });
const PLAIN_REC = chessRec({ id: 'test_plain_a', charId: 'char_test_plain', profession: 'CASTER', skill: null, stats: { maxHp: 2000, def: 0, res: 0 } });
const FORMS_ALL = [[4, false, null], ...[null, X, Y].map((m) => [4, true, m])];
const label = ([, elite, mod]) => `${elite ? 'B' : 'A'} ${mod ?? 'none'}`;

/** 淬羽赫默 as uid 1 at (10, 5) facing RIGHT, plus `others`; `lamp` = the 夜灯 piece's tile (uid 9) or null. */
function field({ tier: _tier = 4, elite = false, mod = null, skill = 0, row = 10, col = 5, others = [], lamp = null, lampFirst = false, seed = 5, flags = {} } = {}) {
  const op = P.unit({ uid: 1, elite, mod, skill, row, col });
  const piece = lamp ? [{ uid: 9, kind: 'token', tokenId: LAMP, ownerUid: 1, row: lamp[0], col: lamp[1] }] : [];
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: { ...P.chess, test_rhine_a: RHINE_REC, test_plain_a: PLAIN_REC }, tokens: ACT3.tokens }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, ...flags }, hooks: ['damaged', 'skillStart', 'skillEnd', 'heal', 'death', 'deploy', 'fatal'], captureNoisy: true,
    units: lampFirst ? [...piece, op, ...others] : [op, ...piece, ...others],
  });
  h.step();
  return { h, u: h.unit(1), lampUnit: h.b.allyUnits.find((a) => a.kind === 'token' && a.defId === LAMP) ?? null };
}
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const ally = (uid, row, col, id = 'test_plain_a') => ({ uid, chessId: id, row, col });
const protectOf = (a) => a.findBuff('protect')?.data?.value ?? 0;

test('淬羽赫默 in both 规程 forms: her season kit (all three skills authored), the form\'s stats + module attributes, y-6, 护佑者 (ranged arts, hits air, blocks 1; BLS-Y 2 targets), the data DEFAULT triggers, ground-targetable, 空构 bond; not a 自选 pick', () => {
  assert.equal(SEASON_KITS[ID], KITS[ID]);
  assert.ok(!OPERATOR_KITS[ID] && !KITTED_CHARS.includes(ID) && !LOCAL_DIY_PICKS.includes(ID), 'not offered as a 自选 pick');
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.skill.id, !!u.kit.generic, u.kit.skillSource], [ID, form.skills[skill].skillId, false, 'skills'], label(f));
      approx(u.s.maxHp, form.stats.maxHp + (m?.attr.maxHp ?? 0), `${label(f)}: max HP (no BLS-X stage 3)`);
      assert.deepEqual([u.base.atk, u.base.def, u.base.res], [form.stats.atk + (m?.attr.atk ?? 0), form.stats.def, form.stats.res], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.base.bat], [1, 'ranged', 'arts', true, 1.6], `${label(f)}: 护佑者`);
      assert.equal(u.profile.maxTargets, mod === Y && elite ? 2 : 1, `${label(f)}: targets`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: y-6`);
      assert.equal(u.skill.rule, 'DEFAULT', `${label(f)}: trigger`);
      assert.deepEqual(u.def.bonds, ['deputShip'], `${label(f)}: bond`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      done(h);
    }
  }
  assert.deepEqual([formOf(4, false).stats.maxHp, formOf(4, false).stats.atk, formOf(4, true).stats.maxHp, formOf(4, true).stats.atk], [1445, 387, 1765, 440]);
  assert.deepEqual([modOf(4, X).attr, modOf(4, Y).attr, modOf(4, X).level, modOf(4, Y).level], [{ maxHp: 100, atk: 45 }, { maxHp: 150, atk: 40 }, 1, 1]);
});

test('real match path: a 规程 match buys, places and fights 淬羽赫默 (A) with no handler error', async () => {
  const u = await realMatch(P.A, ID);
  assert.ok(u.skill);
});

test('Trait: arts attacks on enemies (BLS-Y: two targets, flyers too); while a skill runs every attack heals the most injured ally of her range for heal_scale × ATK (0.75; BLS-X 1.0; BLS-Y two allies) instead', () => {
  for (const [tier, elite, mod] of [[4, false, null], [4, true, X], [4, true, Y]]) {
    const tb = (elite ? modOf(tier, mod).traitOverride : formOf(tier, elite).trait).bb;
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [ally(2, 11, 6), ally(3, 9, 6), ally(4, 10, 6)] });
    const e1 = h.spawn('enemy_dummy', { pos: [10, 7] }), e2 = h.spawn('enemy_fly', { pos: [11, 7] });
    h.run(4);
    assert.equal(u.skill.activations, 0, 'no SP yet');
    const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
    assert.ok(hits.length >= 2 && hits.every((c) => c.type === 'arts'), `${tier}${mod}: arts hits`);
    assert.equal(new Set(hits.map((c) => c.target)).size, mod === Y ? 2 : 1, `${tier}${mod}: targets`);
    if (mod === Y) assert.ok(hits.some((c) => c.target === e2), 'the flyer too');
    void e1;
    const [a, b, c] = [h.unit(2), h.unit(3), h.unit(4)];
    a.hp = a.s.maxHp * 0.3; b.hp = b.s.maxHp * 0.5; c.hp = c.s.maxHp * 0.9;
    const n0 = h.hooksOf('heal').length;
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3), 'cast with an enemy in range');
    assert.ok(h.runUntil(() => h.hooksOf('heal').slice(n0).some((x) => x.source === u && !x.opts?.regen), 3), 'heals');
    const heals = h.hooksOf('heal').slice(n0).filter((x) => x.source === u && !x.opts?.regen);
    const first = heals.filter((x) => Math.abs(x.t - heals[0].t) < 1e-9);
    assert.deepEqual(first.map((x) => x.target.uid).sort(), (mod === Y ? [2, 3] : [2]).sort(), `${tier}${mod}: the most injured`);
    for (const x of first) approx(x.amount, u.s.atk * tb.heal_scale, `${tier}${mod}: ${tb.heal_scale * 100} % ATK`);
    const atk0 = h.hooksOf('damaged').filter((x) => x.source === u && x.dmg?.isAttack && x.t > heals[0].t - 1e-9);
    assert.equal(atk0.length, 0, 'no attack on enemies while the skill heals');
    done(h);
  }
});

test('S1 进取之心 (MANUAL, DEFAULT): ATK +35 % / +50 % for 25 s, SP 35 / 30 from 10; cast on an enemy in her range, not on an injured ally alone', () => {
  for (const [tier, elite] of [[4, false], [4, true]]) {
    const sk = skillOf(tier, elite, S1);
    const { h, u } = field({ tier, elite, skill: 0, others: [ally(2, 10, 6)] });
    assert.deepEqual([u.skill.spCost, sk.initSp, sk.duration, sk.bb.atk], [elite ? 30 : 35, 10, 25, elite ? 0.5 : 0.35]);
    h.unit(2).hp = 100;
    u.skill.gainSp(999);
    h.run(3);
    assert.equal(u.skill.activations, 0, 'an injured ally alone casts nothing (a 辅助, not a 医疗)');
    h.spawn('enemy_dummy', { pos: [10, 7] });
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.skill.timeLeft, 25, 'duration', 0.01);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    h.runUntil(() => !u.skill.active, 30);
    approx(u.s.atk, u.base.atk, 'back');
    done(h);
  }
});

test('S2 俯瞰视界 + 夜灯: ASPD +20 / +30 for 12 s; the placed 夜灯 deploys at the battle start, leaves when the skill ends, comes back on its tile with the next cast and leaves when she does; the allies of its x-4 hold her T1 庇护 ×2.1 / ×2.4; untargetable, no attack', () => {
  for (const [tier, elite, lampFirst] of [[4, false, false], [4, true, true]]) {
    const sk = skillOf(tier, elite, S2);
    const { h, u, lampUnit } = field({ tier, elite, skill: 1, lamp: [12, 8], lampFirst, others: [ally(2, 12, 9), ally(3, 9, 9)] });
    assert.deepEqual([sk.duration, sk.bb.attack_speed, sk.bb.damage_resistance_scale], [12, elite ? 30 : 20, elite ? 2.4 : 2.1]);
    const lamp = lampUnit;
    assert.ok(lamp && lamp.alive, 'deployed with the board (the battle-start deploy of a placed skill summon)');
    assert.ok(lamp.s.flags.untargetable && lamp.profile.noAttack && lamp.s.blockCnt === 0, 'untargetable, no attack, no block');
    const a = h.unit(2), far = h.unit(3);
    a.hp = a.s.maxHp * 0.5;
    h.run(0.3);
    // (12, 9) is next to the 夜灯 and outside her y-6: 20 % × 2.1 / 2.4; (9, 9) outside both
    const t1 = formOf(tier, elite).talents[0].bb;
    approx(protectOf(a), shelterOf(t1, a, sk.bb.damage_resistance_scale), 'the 夜灯\'s 庇护', 1e-9);
    approx(protectOf(a), 0.2 * sk.bb.damage_resistance_scale, '50 % HP: 20 % × scale', 1e-9);
    assert.equal(protectOf(far), 0, 'outside');
    h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.s.aspd, 100 + sk.bb.attack_speed, 'ASPD');
    assert.ok(lamp.alive, 'the start 夜灯 is this skill\'s drone');
    assert.ok(h.runUntil(() => !u.skill.active, 13));
    h.step();
    assert.ok(!lamp.alive, 'withdrawn at the skill end');
    h.run(0.3);
    assert.equal(protectOf(a), 0, 'its 庇护 is gone');
    // next cast (after its 5 s redeploy time): back on its tile
    h.run(6);
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 4));
    h.step();
    assert.ok(lamp.alive && lamp.tileR === 12 && lamp.tileC === 8, 'back on its tile');
    h.b.retreat(u);
    h.step();
    assert.ok(!lamp.alive, 'withdrawn when she leaves');
    h.run(8);
    assert.ok(!lamp.alive, 'not back without her skill');
    done(h);
  }
});

test('S2 without a placed 夜灯: nothing deploys; S1 / S3 picks never field the piece', () => {
  const { h, u } = field({ skill: 1 });
  h.spawn('enemy_dummy', { pos: [10, 7] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  assert.equal(h.b.allyUnits.filter((a) => a.defId === LAMP).length, 0);
  done(h);
  for (const skill of [0, 2]) {
    const r = field({ skill, lamp: [12, 8] });
    r.h.run(2);
    assert.ok(!r.lampUnit.alive, `skill ${skill}: no 夜灯`);
    done(r.h);
  }
});

test('T1 无声砥柱: every ally of her range (herself too) holds 庇护 base × (1 + 2 % per 1 % HP lost, at most 70 steps): 10 % → 20 % at half HP → 24 % at ≤ 30 %; it cuts physical and arts damage, not true; gone once the ally leaves her range; S3 ×1.5 / ×1.8', () => {
  for (const [tier, elite, mod] of [[4, false, null], [4, true, X]]) {
    const { h, u } = field({ tier, elite, mod, skill: 2, others: [ally(2, 10, 6), ally(3, 10, 9)] });
    const a = h.unit(2), out = h.unit(3);
    const t1 = formOf(tier, elite).talents[0].bb;
    assert.deepEqual(t1, { damage_resistance_base: 0.1, resistance_scale: 0.02, hp_ratio: 0.01, min_hp_ratio: 0.3 });
    h.run(0.2);
    approx(protectOf(a), 0.1, 'full HP: 10 %', 1e-9);
    approx(protectOf(u), 0.1, 'herself', 1e-9);
    assert.equal(protectOf(out), 0, '(10, 9) is outside her y-6');
    for (const [ratio, want] of [[0.5, 0.2], [0.555, 0.1 * (1 + 0.02 * 44)], [0.3, 0.24], [0.1, 0.24]]) {
      a.hp = a.s.maxHp * ratio;
      h.run(0.25);
      approx(protectOf(a), want, `HP ${ratio}`, 1e-9);
    }
    // the cut: physical and arts ×(1 − 24 %), true untouched
    const e = h.spawn('enemy_dummy', { pos: [11, 9] });
    for (const type of ['phys', 'arts', 'true']) {
      const hp0 = a.hp;
      h.b.dealDamage(e, a, { amount: 100, type, canDodge: false });
      approx(hp0 - a.hp, type === 'true' ? 100 : 76, `${type}`, 1e-6);
      a.hp = a.s.maxHp * 0.1;
    }
    // S3: ×talent_scale
    const sk3 = skillOf(tier, elite, S3);
    h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    a.hp = a.s.maxHp * 0.1;
    h.run(0.25);
    approx(protectOf(a), 0.24 * sk3.bb.talent_scale, `S3 ×${sk3.bb.talent_scale}`, 1e-9);
    // leaving the range: gone within one refresh
    assert.ok(h.b.relocate(a, 12, 9));
    h.run(0.3);
    assert.equal(protectOf(a), 0, 'gone outside her range');
    done(h);
  }
});

test('T2 丰润羽翼: an ally of her range below 50 % HP gets 生命回复速度 6 % of her ATK (hpRegen, from 1 s after; 禁疗 does not stop it), a 【莱茵生命】 operator twice; none at ≥ 50 % or outside; BLS-X at stage 1 (规程 has no stage 3): neither 8 % nor max HP +10 %', () => {
  for (const [tier, elite, mod] of [[4, false, null], [4, true, X], [4, true, null]]) {
    const x3 = false;
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [ally(2, 10, 6), ally(3, 11, 6, 'test_rhine_a'), ally(4, 9, 6)] });
    const a = h.unit(2), r = h.unit(3), full = h.unit(4);
    assert.ok(RHINE.has(r.def.charId) && !RHINE.has(a.def.charId));
    const ratio = x3 ? 0.08 : 0.06;
    assert.equal(formOf(tier, elite).talents[1].bb.atk_to_hp_recovery_ratio, 0.06);
    approx(a.s.maxHp, 2000 * (x3 ? 1.1 : 1), 'max HP');
    approx(r.s.maxHp, 2000 * (x3 ? 1.2 : 1), '莱茵生命 max HP');
    h.b.addBuff(a, { key: 'test:healFree', flags: { noHeal: true, healFree: true } });
    a.hp = a.s.maxHp * 0.4; r.hp = r.s.maxHp * 0.4;
    h.run(0.95);
    assert.equal(a.s.hpRegen, 0, 'not before 1 s');
    h.run(0.2);
    approx(a.s.hpRegen, u.s.atk * ratio, `${ratio * 100} % ATK`);
    approx(r.s.hpRegen, u.s.atk * ratio * 2, '莱茵生命 ×2');
    assert.equal(full.s.hpRegen, 0, 'full HP: none');
    const hp0 = a.hp;
    h.run(2);
    approx(a.hp - hp0, u.s.atk * ratio * 2, '2 s of regeneration through 禁疗', 0.02);
    a.hp = a.s.maxHp * 0.6;
    h.run(0.15);
    assert.equal(a.s.hpRegen, 0, 'stops at ≥ 50 %');
    h.b.relocate(r, 10, 9);
    h.run(0.15);
    assert.equal(r.s.hpRegen, 0, 'stops outside her range');
    done(h);
  }
});

test('BLS-Y at stage 1 (丰润羽翼; 规程 has no stage 3): no 屏障 on a hit that would leave an operator of her range below 50 %, BLS-Y or none', () => {
  for (const [tier, elite, mod] of [[4, true, Y], [4, true, null]]) {
    const on = false;
    const { h, u } = field({ tier, elite, mod, skill: 0, others: [ally(2, 10, 6), ally(3, 11, 6, 'test_rhine_a'), ally(4, 10, 9)] });
    const a = h.unit(2), r = h.unit(3), out = h.unit(4);
    const e = h.spawn('enemy_dummy', { pos: [11, 9] });
    h.run(0.2);
    const cap = u.s.maxHp * 0.5;
    // 2000 HP: 900 leaves 1100 (55 %): no barrier; then 200 would leave 900 (45 %)
    h.b.dealDamage(e, a, { amount: 900, type: 'true' });
    assert.equal(a.hp, 1100, 'above 50 %: no barrier');
    h.b.dealDamage(e, a, { amount: 200, type: 'true' });
    if (on) {
      assert.equal(a.hp, 1100, 'the barrier took the hit');
      approx(a.findBuff(`slent2:barrier#${u.id}`)?.shield ?? 0, cap - 200, 'what is left of it');
    } else assert.equal(a.hp, 900, 'no barrier');
    // once: a later drop gives none
    a.hp = 1100;
    for (const b of a.buffs.filter((x) => x.key.startsWith('slent2:barrier'))) h.b.removeBuff(a, b);
    h.b.dealDamage(e, a, { amount: 200, type: 'true' });
    assert.equal(a.hp, 900, 'once per deployment');
    h.b.dealDamage(e, r, { amount: 1200, type: 'true' });
    if (on) approx(r.hp, 2000 - Math.max(0, 1200 - 2 * cap), '莱茵生命: twice the barrier');
    // entering her range below 50 %
    out.hp = 500;
    h.b.relocate(out, 11, 5);
    h.run(0.2);
    assert.equal(!!out.findBuff(`slent2:barrier#${u.id}`), on, 'on entering below 50 %');
    // a new deployment of hers clears the marks
    if (on) {
      h.b.retreat(u);
      h.b.redeploy(u);
      h.run(0.2);
      a.hp = 1100;
      h.b.dealDamage(e, a, { amount: 200, type: 'true' });
      assert.equal(a.hp, 1100, 'again after her redeploy');
    }
    done(h);
  }
});

test('S3 无畏者协议 (60 s, at most 2 casts per battle): ATK +20 % / +30 %; the first operator of her range taking lethal damage keeps 1 HP and holds 不死 for 6 / 7 s (outlasting her) — once per cast, not a summon, not one outside her range, not one already holding 不死; no third cast', () => {
  for (const [tier, elite] of [[4, false], [4, true]]) {
    const sk = skillOf(tier, elite, S3);
    const { h, u } = field({ tier, elite, skill: 2, others: [ally(2, 10, 6), ally(3, 11, 6), ally(4, 10, 9)] });
    assert.deepEqual([sk.duration, sk.bb.atk, sk.bb.grave_duration, sk.bb.skill_max_trigger_time, u.skill.spCost, sk.initSp], [60, elite ? 0.3 : 0.2, elite ? 7 : 6, 2, elite ? 42 : 46, 20]);
    const a = h.unit(2), b = h.unit(3), out = h.unit(4);
    const e = h.spawn('enemy_dummy', { pos: [10, 7] });
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.active, 3));
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), 'ATK');
    h.b.dealDamage(e, out, { amount: 1e6, type: 'true' });
    assert.ok(!out.alive, 'outside her range: no 不死');
    h.b.dealDamage(e, a, { amount: 1e6, type: 'true' });
    assert.ok(a.alive && a.hp === 1, 'kept at 1 HP');
    assert.ok(a.findBuff('slent2:grave') && holdsUndying(h.b, a), '不死 (holdsUndying sees it)');
    approx(a.findBuff('slent2:grave').timeLeft, sk.bb.grave_duration, 'duration', 0.01);
    h.step();
    const shown = h.events.filter((ev) => ev[0] === 'fx' && ev[1] === 'undying' && ev[4]?.id === a.id).at(-1)?.[4];
    assert.deepEqual([shown?.src, shown?.duration], [u.id, sk.bb.grave_duration], 'the look: on the ally, from her (slent2_shallow_grave)');
    h.b.retreat(u);   // the 不死 outlasts her
    h.run(sk.bb.grave_duration - 0.5);
    h.b.dealDamage(e, a, { amount: 1e6, type: 'true' });
    assert.ok(a.alive, 'held during the window');
    h.b.dealDamage(e, b, { amount: 1e6, type: 'true' });
    assert.ok(!b.alive, 'once per cast');
    h.run(1);
    h.b.dealDamage(e, a, { amount: 1e6, type: 'true' });
    assert.ok(!a.alive, 'the window is over');
    done(h);
  }
  // two casts per battle, then no SP
  const { h, u } = field({ skill: 2 });
  h.spawn('enemy_dummy', { pos: [10, 7] });
  for (let i = 1; i <= 2; i++) {
    u.skill.gainSp(999);
    assert.ok(h.runUntil(() => u.skill.activations === i, 5), `cast ${i}`);
    h.runUntil(() => !u.skill.active, 61);
  }
  h.run(100);
  assert.equal(u.skill.activations, 2, 'no third cast');
  assert.equal(u.skill.charges, 0);
  assert.equal(u.skill.gainSp(50), 0, 'no SP after the last use');
  done(h);
});

test('S3: a summon is no 干员 (no 不死); a lethal hit on an operator already holding 不死 leaves the cast\'s 不死 for the next one', () => {
  const { h, u, lampUnit } = field({ skill: 2, others: [ally(2, 10, 6), ally(3, 11, 6)] });
  void lampUnit;
  const e = h.spawn('enemy_dummy', { pos: [10, 7] });
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  const a = h.unit(2), b = h.unit(3);
  // a summon of her range (a 夜灯 spawned for the test) takes no 不死
  const tok = h.b.spawnToken(u, LAMP, 11, 5, { anySource: true });
  assert.ok(tok && tok.alive && u.rangeKeySet.has(11 * COLS + 5));
  h.b.dealDamage(e, tok, { amount: 1e6, type: 'true' });
  assert.ok(!tok.alive && !tok.findBuff('slent2:grave'), 'a summon is no 干员');
  h.b.addBuff(a, { key: 'test:undying', flags: { undying: true }, duration: 5 });
  h.b.on('fatal', (c) => { if (c.unit === a && a.findBuff('test:undying')) c.prevented = true; }, { priority: -99 });
  h.b.dealDamage(e, a, { amount: 1e6, type: 'true' });
  assert.ok(a.alive && !a.findBuff('slent2:grave'), 'its own 不死 held it: the cast keeps its charge');
  h.b.dealDamage(e, b, { amount: 1e6, type: 'true' });
  assert.ok(b.alive && b.findBuff('slent2:grave'), 'the next operator gets it');
  done(h);
});

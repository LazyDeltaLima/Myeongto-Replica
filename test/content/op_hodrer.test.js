// test/content/op_hodrer.test.js — 外德雷尔 / 赫德雷 (char_4088_hodrer, a tier-4 piece of 规程 (act3autochess), 6★ 重剑手; kit
// server/sim/content/kits/ops/op-hodrer.js, from the upstream 自选 kit, kept as a season kit — not a 自选 pick here): both forms of
// chess_char_4_21 — normal A (E2 Lv1, skill rank 4, no module) and elite B (E2 Lv60, rank 7) with its module choices CRU-X 新的生活
// (the default) / CRU-Y 笔迹 / none, at stage 1. Every number is read back from data/seasons/act3autochess/chess.json; the
// fidelity checklist of kits/README.md item by item.
// Run: node --test test/content/op_hodrer.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3, realMatch } from '../helpers/seasonPieces.js';
import { KITTED_CHARS, SEASON_KITS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';

const HOD = 'char_4088_hodrer';
const A = 'chess_char_4_21_a', B = 'chess_char_4_21_b';
const CRUX = 'uniequip_002_hodrer', CRUY = 'uniequip_003_hodrer';
const S1 = 'skchr_hodrer_1', S2 = 'skchr_hodrer_2', S3 = 'skchr_hodrer_3';
const PROTECT = 'protect';                 // the shared 庇护 of every source (kits/shared/tier1.js holdProtect)
const DMG_UP = 'talent:hodrer:dmgUp';      // CRU-X stage 3's 物理伤害 + (its own one instance per ally)
const recOf = (id) => ACT3.chess[id];
const skillOf = (id, sk) => recOf(id).skills.find((s) => s.skillId === sk);
const modOf = (mod) => recOf(B).modules.find((m) => m.uniEquipId === mod);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = {
  enemy_dummy: dummy('enemy_dummy'),
  enemy_fly: dummy('enemy_fly', { motion: 'FLY' }),
  enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 0.6, mass: 0 }),
  enemy_brute: enemyRec({ key: 'enemy_brute', hp: 1e9, speed: 0.6, mass: 0, atk: 300, bat: 1 }),
};
/** [chessId, moduleId]: undefined = the record's own (A: none, B: CRU-X), 'none' = no module. */
const FORMS_ALL = [[A, undefined], [B, undefined], [B, CRUY], [B, 'none']];
/** The module a form fields. */
const modIdOf = (id, mod) => (id === A || mod === 'none' ? null : mod ?? CRUX);

/** A battle with 赫德雷 as uid 1 at (row, col) facing RIGHT, plus `others`. */
function field({ id = A, mod, skill = 0, row = 10, col = 5, others = [], seed = 5, noSp = false } = {}) {
  const h = makeBattle({
    defs: { enemies: ENEMIES, chess: { [id]: recOf(id) }, tokens: ACT3.tokens }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999 }, hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'attack'], captureNoisy: true,
    units: [{ uid: 1, chessId: id, skillIndex: skill, ...(mod !== undefined ? { moduleId: mod } : {}), row, col }, ...others],
  });
  h.step();
  const u = h.unit(1);
  if (noSp) h.b.on('spGain', (c) => { if (c.unit === u) c.amount = 0; });
  return { h, u };
}
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const byAttack = (hits) => { const m = new Map(); for (const c of hits) { const k = c.dmg.attackId; if (!m.has(k)) m.set(k, []); m.get(k).push(c); } return [...m.values()]; };
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}
const label = ([id, mod]) => `${id === A ? 'A' : 'B'} ${modIdOf(id, mod) ?? 'none'}`;
const t0Of = (u) => u.def.raw.talents.find((t) => t.index === 0).bb;
const t1Of = (u) => u.def.raw.talents.find((t) => t.index === 1).bb;
/** 余火之氅 on his own tile: CRU-X stage 3 "造成的物理伤害提升10%" (damage_scale) — 1 otherwise (no stage-3 form in 规程). */
const ownPhys = (u) => t1Of(u).damage_scale ?? 1;

test('赫德雷 in both 规程 forms: his season kit (all three skills authored), the form\'s stats (+ the chosen module\'s), 1-1, blocks 2, melee physical ground-only hitting all he blocks; not a 自选 pick', () => {
  assert.equal(SEASON_KITS[HOD], KITS[HOD]);
  assert.ok(!OPERATOR_KITS[HOD] && !KITTED_CHARS.includes(HOD) && !LOCAL_DIY_PICKS.includes(HOD), 'not offered as a 自选 pick');
  for (const f of FORMS_ALL) {
    const [id, mod] = f;
    const rec = recOf(id), m = modIdOf(id, mod) ? modOf(modIdOf(id, mod)) : null;
    const base = id === A ? rec.stats : rec.statsBase;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ id, mod, skill });
      assert.deepEqual([u.def.charId, u.skill.id, !!u.kit.generic, u.kit.skillSource, u.def.raw.module?.active ? u.def.raw.module.id : null], [HOD, rec.skills[skill].skillId, false, 'skills', modIdOf(id, mod)], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [base.maxHp + (m?.attr.maxHp ?? 0), base.atk + (m?.attr.atk ?? 0), base.def], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.hitAllBlocked, u.base.bat], [2, 'melee', 'phys', false, true, 2.5], `${label(f)}: 重剑手`);
      assert.deepEqual(u.liveRangeGrid, rec.rangeGrid, `${label(f)}: 1-1`);
      assert.deepEqual(u.def.bonds, ['raidShip'], `${label(f)}: bond`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target him`);
      done(h);
    }
  }
  // zh_CN (full potential: HP +250, ATK +45): E2 Lv1 4920 / 1368 / 0, E2 Lv60 5794 / 1536 / 0; CRU-X / CRU-Y stage 1 +290 / +92, +300 / +110
  assert.deepEqual([recOf(A).stats.maxHp, recOf(A).stats.atk, recOf(B).statsBase.maxHp, recOf(B).statsBase.atk], [4920, 1368, 5794, 1536]);
  assert.deepEqual([modOf(CRUX).attr, modOf(CRUY).attr, modOf(CRUX).level, modOf(CRUY).level], [{ maxHp: 290, atk: 92 }, { maxHp: 300, atk: 110 }, 1, 1]);
});

test('real match path: a 规程 match buys, places and fights 赫德雷 (A) with no handler error', async () => {
  const u = await realMatch(A, HOD);
  assert.ok(u.skill);
});

test('trait + T1 及锋而试: every attack hits all he blocks; ×1.1, ×1.4 on a stunned or bound target — not a frozen one, never a flyer (no CRU-Y stage 3 in 规程)', () => {
  for (const f of FORMS_ALL) {
    const [id, mod] = f;
    const { h, u } = field({ id, mod, skill: 0, noSp: true });
    const t0 = t0Of(u);
    assert.deepEqual([t0.atk_scale_2, t0.atk_scale], [1.1, 1.4], label(f));
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    h.spawn('enemy_fly', { pos: [10, 6] });
    const hitOn = () => { const n = atkHits(h, u).length; h.runUntil(() => atkHits(h, u).length > n, 3); return atkHits(h, u).slice(n); };
    let hs = hitOn();
    assert.ok(hs.length === 1 && hs[0].target === e, `${label(f)}: the ground dummy only`);
    approx(hs[0].amount, u.s.atk * t0.atk_scale_2 * ownPhys(u), `${label(f)}: ×${t0.atk_scale_2}`);
    for (const [st, mul] of [['stun', t0.atk_scale], ['bind', t0.atk_scale], ['freeze', t0.atk_scale_2]]) {
      h.b.applyStatus(e, st, { duration: 60, source: null });
      hs = hitOn();
      approx(hs[0].amount, u.s.atk * mul * ownPhys(u), `${label(f)}: ${st} ×${mul}`);
      h.b.removeStatus(e, st);
    }
    done(h);
  }
  // all he blocks, at once
  const { h, u } = field({ id: B, skill: 0, row: 9, col: 5, noSp: true });
  h.spawn('enemy_walk', { routeIndex: 0 });
  h.spawn('enemy_walk', { routeIndex: 0, time: 0 });
  assert.ok(h.runUntil(() => u.blocking.length === 2, 40), 'blocks two');
  const n = atkHits(h, u).length;
  h.run(6);
  const att = byAttack(atkHits(h, u).slice(n));
  assert.ok(att.length >= 2 && att.every((a) => a.length === 2 && new Set(a.map((c) => c.target)).size === 2), '同时攻击阻挡的所有敌人');
  done(h);
});

test('CRU-Y ×1.1 on the enemies he blocks (stage 1), not on others; no first-hit stun (that is stage 3, not in 规程)', () => {
  for (const f of FORMS_ALL) {
    const [id, mod] = f;
    const { h, u } = field({ id, mod, skill: 0, row: 9, col: 5, noSp: true });
    const y = modIdOf(id, mod) === CRUY, y3 = false;
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.ok(h.runUntil(() => u.blocking.includes(w), 40), `${label(f)}: blocked`);
    const n = atkHits(h, u).length;
    h.runUntil(() => atkHits(h, u).length > n, 4);
    const first = atkHits(h, u).slice(n)[0];
    const stuns = () => h.hooksOf('statusApplied').filter((s) => s.target === w && s.status === 'stun' && s.source === u);
    const t0 = t0Of(u);
    assert.equal(stuns().length, y3 ? 1 : 0, `${label(f)}: the first-hit stun`);
    if (y3) assert.equal(stuns()[0].duration, 2.5);
    approx(first.amount, u.s.atk * (y3 ? t0.atk_scale : t0.atk_scale_2) * (y ? 1.1 : 1) * ownPhys(u), `${label(f)}: the first hit`);
    h.run(8);
    assert.equal(stuns().length, y3 ? 1 : 0, `${label(f)}: once per enemy`);
    if (y3) {
      // the marks go with his deployment (derived from the module talent's buff): a redeployed 赫德雷 stuns it anew
      h.b.retreat(u);
      h.b.redeploy(u);
      assert.ok(h.runUntil(() => stuns().length === 2, 20), `${label(f)}: stunned again after a redeploy`);
    }
    done(h);
  }
  // an enemy another operator blocks: no CRU-Y ×1.1 (hodrer_e_003_tr: CheckBlocked by him)
  {
    const { h, u } = field({ id: B, mod: CRUY, skill: 0, noSp: true, others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 10, col: 6 }] });
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => e.blockedBy === h.unit(2), 3), 'blocked by 角峰');
    const n = atkHits(h, u).length;
    h.runUntil(() => atkHits(h, u).filter((c) => c.target === e).length > 0 && atkHits(h, u).length > n, 6);
    const c = atkHits(h, u).filter((x) => x.target === e).pop();
    approx(c.amount, u.s.atk * t0Of(u).atk_scale_2, `×${t0Of(u).atk_scale_2} only`);
    done(h);
  }
});

test('T2 余火之氅: he and the ally on the tile behind him get 21 % 庇护 (no CRU-X stage 3 in 规程: no 物理伤害 +); not the ally beside him; gone once he leaves', () => {
  const others = [{ uid: 2, chessId: 'chess_char_1_08_a', row: 10, col: 4 }, { uid: 3, chessId: 'chess_char_1_10_a', row: 11, col: 5 }];
  for (const f of FORMS_ALL) {
    const [id, mod] = f;
    const { h, u } = field({ id, mod, skill: 0, others });
    const behind = h.unit(2), beside = h.unit(3);
    h.run(0.5);
    const x3 = false;
    const dr = t1Of(u).damage_resistance;
    assert.equal(dr, x3 ? 0.31 : 0.21, label(f));
    for (const a of [u, behind]) {
      const m = a.findBuff(PROTECT)?.mods;
      assert.ok(m, `${label(f)}: ${a.def.charId} protected`);
      approx(m.physTakenMul, 1 - dr, `${label(f)}: phys`);
      approx(m.artsTakenMul, 1 - dr, `${label(f)}: arts`);
      assert.equal(a.findBuff(DMG_UP)?.mods.physDealtMul ?? 1, x3 ? 1.1 : 1, `${label(f)}: 物理伤害`);
    }
    assert.equal(beside.findBuff(PROTECT), null, `${label(f)}: not beside him`);
    const hp = behind.hp;
    h.b.dealDamage(null, behind, { amount: 1000, type: 'arts' });
    approx(hp - behind.hp, 1000 * (1 - behind.s.res / 100) * (1 - dr), `${label(f)}: arts taken behind him`);
    h.b.retreat(u);
    h.run(0.5);
    assert.equal(behind.findBuff(PROTECT), null, `${label(f)}: gone with him`);
    done(h);
  }
});

test('S1 重锋不熄 (AUTO, hit SP 3, DEFAULT): every 4th attack hits all he blocks at 180 % / 200 % (× 及锋而试) and heals 15 % / 20 % of his max HP once (CRU-X: ×1.2 受到的治疗)', () => {
  for (const [id, mod] of [[A, undefined], [B, 'none'], [B, CRUX]]) {
    const sk = skillOf(id, S1), elite = id === B, tier = `${id === A ? 'A' : 'B'} ${mod ?? ''}`;
    const { h, u } = field({ id, mod, skill: 0, row: 9, col: 5 });
    assert.deepEqual([u.skill.rule, u.skill.spType, u.skill.spCost, sk.bb.atk_scale, sk.bb.hp_ratio], ['DEFAULT', 'attack', 3, elite ? 2 : 1.8, elite ? 0.2 : 0.15], `${tier}`);
    h.spawn('enemy_walk', { routeIndex: 0 });
    h.spawn('enemy_walk', { routeIndex: 0, time: 0 });
    assert.ok(h.runUntil(() => u.blocking.length === 2, 40));
    u.hp = u.s.maxHp * 0.3;
    const n0 = atkHits(h, u).length;
    h.run(2.5 * 8 + 0.1);
    const att = byAttack(atkHits(h, u).slice(n0));
    const sk1 = att.filter((a) => a[0].dmg.isSkill);
    assert.ok(sk1.length >= 2, `${tier}: casts (${sk1.length} in ${att.length} attacks)`);
    const idx = att.map((a, i) => (a[0].dmg.isSkill ? i : -1)).filter((i) => i >= 0);
    for (let i = 1; i < idx.length; i++) assert.equal(idx[i] - idx[i - 1], 4, `${tier}: one cast every 4 attacks`);
    for (const c of sk1[0]) approx(c.amount, u.s.atk * sk.bb.atk_scale * 1.1 * ownPhys(u), `${tier}: ${sk.bb.atk_scale * 100} % × 1.1`);
    assert.equal(sk1[0].length, 2, `${tier}: both blocked enemies`);
    const heals = h.hooksOf('heal').filter((c) => c.target === u && c.source === u);
    assert.equal(heals.length, sk1.length, `${tier}: one heal per cast`);
    approx(heals[0].amount, u.s.maxHp * sk.bb.hp_ratio * (mod === CRUX ? 1.2 : 1), `${tier}: ${sk.bb.hp_ratio * 100} % max HP${mod === CRUX ? ' × 1.2' : ''}`);
    done(h);
  }
});

test('S2 余烬重荷 (MANUAL, DEFAULT, a 状态切换 toggle): ATK +16 % / 28 % from the deployment on; switched on once and kept — interval 2.5 + 0.5 s, block 3, every attack stuns its targets 1 s before 及锋而试 reads them (×1.4)', () => {
  for (const id of [A, B]) {
    const sk = skillOf(id, S2), elite = id === B, tier = id === A ? 'A' : 'B';
    const { h, u } = field({ id, skill: 1, row: 9, col: 5 });
    assert.deepEqual([u.skill.rule, u.skill.kind, sk.spCost, sk.initSp, sk.bb.atk, sk.bb.base_attack_time, sk.bb.block_cnt, sk.bb['attack@stun']], ['DEFAULT', 'toggle', elite ? 8 : 9, 0, elite ? 0.28 : 0.16, 0.5, 1, 1], `${tier}`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${tier}: the passive ATK`);
    for (let i = 0; i < 3; i++) h.spawn('enemy_walk', { routeIndex: 0, time: 0 });
    assert.ok(h.runUntil(() => u.skill.active, 30), `${tier}: switched on with an enemy`);
    approx(u.s.interval, 3.0, `${tier}: 攻击间隔略微增大(+0.5)`);
    assert.equal(u.s.blockCnt, 3, `${tier}: 阻挡数+1`);
    assert.ok(h.runUntil(() => u.blocking.length === 3, 30), `${tier}: blocks three`);
    const n0 = atkHits(h, u).length;
    h.run(9.1);
    const att = byAttack(atkHits(h, u).slice(n0));
    assert.ok(att.length >= 3 && att.every((a) => a.length === 3), `${tier}: all three each attack`);
    for (const a of att) for (const c of a) approx(c.amount, u.s.atk * 1.4, `${tier}: stunned first ⇒ ×1.4`);
    const stuns = h.hooksOf('statusApplied').filter((s) => s.source === u && s.status === 'stun');
    assert.ok(stuns.length >= 9 && stuns.every((s) => s.duration === 1), `${tier}: 晕眩1秒 on every target`);
    h.run(60);
    assert.ok(u.skill.active, `${tier}: kept on`);
    assert.equal(u.skill.activations, 1, `${tier}: switched on once`);
    done(h);
  }
});

test('S3 死境硝烟 (MANUAL, DEFAULT — 规程 has no trigger row for him): cast once he attacks an enemy of his 1-1; 70 s, max HP +30 / 45 %, ATK +60 / 90 %, range +1; heals 5 % per attack, 25 % stuns 3 / 4 s; −100 HP / s and 200 无来源 true / s on the enemies he attacked or that attacked him', () => {
  for (const id of [A, B]) {
    const sk = skillOf(id, S3), elite = id === B, tier = id === A ? 'A' : 'B';
    const { h, u } = field({ id, skill: 2, seed: 19 });
    assert.deepEqual([u.skill.rule, sk.duration, sk.bb.max_hp, sk.bb.atk, sk.bb['attack@hp_ratio'], sk.bb['attack@buff_prob'], sk.bb['attack@stun'], sk.bb.ability_range_forward_extend, sk.bb['attack@value'], sk.bb['attack@damage']],
      ['DEFAULT', 70, elite ? 0.45 : 0.3, elite ? 0.9 : 0.6, 0.05, 0.25, elite ? 4 : 3, 1, 100, 200], `${tier}`);
    assert.deepEqual([sk.trigger.rawRule, sk.trigger.customRangeGrid, sk.rangeId, u.skill.triggerGrid], ['DEFAULT', null, null, null], `${tier}: no trigger box`);
    u.skill.gainSp(999);
    const near = h.spawn('enemy_dummy', { pos: [9, 6] });        // beside his range: never attacked
    h.run(1);
    assert.equal(u.skill.activations, 0, `${tier}: nothing in his range`);
    const far = h.spawn('enemy_dummy', { pos: [10, 6] });
    assert.ok(h.runUntil(() => u.skill.active, 3), `${tier}: he attacks an enemy of his 1-1`);
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1], [0, 2]], `${tier}: 攻击距离+1`);
    approx(u.skill.timeLeft, 70, `${tier}: 70 s`, 0.01);
    approx(u.s.maxHp, u.base.maxHp * (1 + sk.bb.max_hp), `${tier}: max HP`);
    approx(u.s.atk, u.base.atk * (1 + sk.bb.atk), `${tier}: ATK`);
    const t0 = h.hooksOf('skillStart').find((c) => c.unit === u).t;
    h.run(11);   // DEFAULT casts as his attack starts: the burn begins 1 s after that attack's hit
    const ticks = (e) => h.hooksOf('damaged').filter((c) => c.target === e && c.credit === u && c.source === null && (c.dmg?.tags ?? []).includes('periodic'));
    const onFar = ticks(far);
    assert.ok(onFar.length >= 8 && onFar.every((c) => c.amount === 200 && c.type === 'true'), `${tier}: 200 无来源 true / s on the enemy he attacked (${onFar.length})`);
    assert.equal(ticks(near).length, 0, `${tier}: none on an enemy he never attacked`);
    const losses = h.hooksOf('damaged').filter((c) => c.target === u && (c.dmg?.tags ?? []).includes('hpLoss') && c.t >= t0);
    assert.ok(losses.length >= 9 && losses.every((c) => c.amount === 100), `${tier}: 每秒流失100点生命 (${losses.length})`);
    const heals = h.hooksOf('heal').filter((c) => c.target === u && c.source === u && c.t >= t0);
    const attacks = h.hooksOf('attack').filter((c) => c.attacker === u && c.t >= t0);
    assert.ok(heals.length >= 2 && Math.abs(heals.length - attacks.length) <= 1, `${tier}: one heal per attack (${heals.length} / ${attacks.length})`);
    // an enemy that attacks him joins
    const brute = h.spawn('enemy_brute', { routeIndex: 1 });
    assert.ok(h.runUntil(() => ticks(brute).length >= 2, 40), `${tier}: the brute that hit him burns too`);
    h.b.kill(brute, null);
    u.hp = u.s.maxHp;
    // the stun roll over many attacks ≈ 25 %
    u.skill.extend(600);
    const s0 = h.hooksOf('statusApplied').filter((s) => s.source === u && s.status === 'stun' && s.target === far).length;
    const a0 = atkHits(h, u).filter((c) => c.target === far).length;
    h.run(500);
    const sN = h.hooksOf('statusApplied').filter((s) => s.source === u && s.status === 'stun' && s.target === far);
    const aN = atkHits(h, u).filter((c) => c.target === far).length - a0;
    const rate = (sN.length - s0) / aN;
    assert.ok(rate > 0.17 && rate < 0.33 && sN.every((s) => s.duration === sk.bb['attack@stun']), `${tier}: stun ${(rate * 100).toFixed(1)} % ≈ 25 %, ${sk.bb['attack@stun']} s`);
    u.skill.end('test');
    const n = ticks(far).length;
    h.run(3);
    assert.equal(ticks(far).length, n, `${tier}: no tick after the skill`);
    assert.deepEqual(u.liveRangeGrid, [[0, 0], [0, 1]], `${tier}: 1-1 again`);
    done(h);
  }
});

// Local patch, battle side: enemy fixes kept out of the upstream content files so that merging upstream releases
// stays conflict-free. content/index.js loads this file as one more domain module (one line: DOMAIN_NAMES.push), so it
// runs wherever the sim runs — the server and the browser (client-run boss / hidden fields).
//
// “帝国的甲胄” (enemy_10027_vtsk, the 隐秘核心 假想敌：胄 escort), per PRTS “帝国的甲胄”:
//   出场 · 回忆里的誓死  "在全场范围内的1名当前生命值最高的我方单位所在位置创造一个持续5.85秒、碰撞范围3×3的弹道，弹道在延迟1.33秒后
//                      对碰撞范围内的1名当前生命值最高的我方单位造成攻击力100%的物理伤害，此后每0.53秒重复一次，最多命中8次"
//                      upstream (content/enemies.js KITS.enemy_10027_vtsk): all 8 hits in one tick 0.5 s after it appears.
//   蓄力 · 回忆里的怒守  "仅被阻挡时可触发" — a melee triple hit, 100 % ATK each. upstream: fires on the 15 s cooldown and
//                      turns the next attack into three hits even when that attack is the unblocked ranged one
//                      (since 2026-10-22 the kit casts it only while blocked as well: content/enemies.js onSkillSlot
//                      keeps a skill to its client family, MultiCombat's being COMBAT; the version below still runs).
// How: an enemySpawn hook that runs before content/enemies.js's (priority 100) takes `Appear` / `MultiCombat` out of the
// enemy's ability record, so the upstream kit builds neither; the versions below are attached instead (its ranged ×0.8
// stays upstream's). When upstream fixes either skill, drop it here — test/local-patch.test.js pins upstream's current
// behaviour so a merge that changes it fails there. Expected upstream failure while this patch is in: the “帝国的甲胄”
// case of test/sim/feedback1f-liftoff.test.js (F3 review) counts all 8 barrage hits 1.5 s after the spawn.
//
// 假想敌：胄 死亡集群 vs 限伤: since 0.2.0 upstream's own (Battle.loseHp noHitLimit for the drone share, PR #209); our
// exemptDroneLink is gone.

//
// 圣堂剑士 (enemy_10087_hlchgr, 悬赏·特异II) — 赐我力量！ spends ammo. Official data: spData {maxSp 5, initSp 5, increment 0}
// (弹药上限：5, shown as its SP bar in bullet mode: prefab _showSpAsBulletMode), skill ForeverEnhance spCost 1 {atk_add 0.2,
// move_speed_add 0.2}, talent SkillTrigger {interval 6, max_stack_cnt 10}. Buff templates (zh_CN buff_template_data):
// hlchgr_t[skill_trigger] every `interval` s — while hlchgr_t[stack_mark] < max_stack_cnt — TriggerEnemySkill
// ForeverEnhance (_checkSkillReady: needs the bullet; interrupts the current ability, Skill clip); each cast adds 0.2 to
// the stored atk (AttributeModifier MULTIPLIER) and move_speed (start 1.0, FINAL_SCALER). PRTS 圣堂剑士: "每6s尝试触发
// 一次【赐我力量！】，最多成功触发10次 … 自身移动速度最终提升至(100%+增益层数×20%)；自身攻击力+(增益层数×20%)"; 不可被沉默.
// upstream (content/enemies.js KITS.enemy_10087_hlchgr): the same numbers on a plain 6 s timer, no ammo to see, no cast
// (it also enhances while stunned) and move speed as +20 % base each. Here: the upstream timer is taken out after
// enemies.js builds it (priority 99) and the ammo version attached; the bullets go to the snapshot as SP / SP max
// (`e.lpAmmo`, server/sim/snapshot.js unitTuple 1 line; render/units.js draws an enemy bar only when it has one).
// [ASSUMED] a trigger while stunned / frozen / asleep fails (no bullet, no count) — an enemy skill cannot start then.

import { abOf, attach, hurt, allTargets, areaAlliesInTiles, canCast, T } from './enemies.js';
import { attackMotionOf, motionTakes } from '../targeting.js';
/** @import { Battle } from '../Battle.js' */
/** @import { Unit } from '../units.js' */
/** @import { AbState, AbSkill, EnemyAbility } from './enemies.js' */

export const VTSK = 'enemy_10027_vtsk';
/** 回忆里的誓死 (PRTS): first hit after 1.33 s, one every 0.53 s, the 3×3 弹道 lasts 5.85 s. */
export const BARRAGE_DELAY = 1.33, BARRAGE_STEP = 0.53, BARRAGE_LIFE = 5.85;

/** @param {Battle} battle */
export function install(battle) {
  battle.on('enemySpawn', (/** @type {{ enemy: Unit }} */ { enemy }) => { if (enemy && enemy.defId === VTSK) patchVtsk(battle, enemy); }, { priority: 101 });
  battle.on('enemySpawn', (/** @type {{ enemy: Unit }} */ { enemy }) => { if (enemy && enemy.defId === HLCHGR) patchHlchgr(battle, enemy); }, { priority: 99 });
  // the normal attack's motion filter (docs/rules/sim.md 「적 비행 유닛 공격 전수 조사」): the prefab's UnitMode `_attack`
  // selector `_targetMotion` (data/enemies.json `attackMotion` / `attackMotionModes`, read by tools/local-extract/
  // enemy_projectiles.py — 深池暗影术师 「不会攻击飞行单位」 and the rest of the 2026-10-06 / 2026-11-20 sweeps; 扎罗's M2 only, as its
  // M1 attack never triggers) keeps a flyer out of a ground-only mode's candidates, on top of the kit's own rule (upstream
  // shoots a flyer with every ranged enemy that has none). A 起飞 ally is already out of a ground enemy's reach
  // (targeting.js evadesGround).
  battle.on('enemySpawn', (/** @type {{ enemy: Unit }} */ { enemy: e }) => {
    if (!enemy0(e) || !motionFiltered(e.def)) return;
    const own = /** @type {Record<string, any>} */ (e.profile).canTarget;
    /** @type {Record<string, any>} */ (e.profile).canTarget = typeof own === 'function'
      ? (/** @type {Unit} */ u) => motionTakes(attackMotionOf(e.def, e.form), u) && own(u)
      : (/** @type {Unit} */ u) => motionTakes(attackMotionOf(e.def, e.form), u);
  }, { priority: 99 });
  // a kit that picks its own attack targets in 'before' (“灵幛” everyone in reach, the 胄 blades, …) bypasses the engine's
  // candidate filter: after content (priority 50) their targets keep to the mode's motion again (an empty list = no attack)
  battle.on('beforeAttack', (c) => {
    const e = c.attacker;
    if (!enemy0(e) || !motionFiltered(e.def)) return;   // (no own field on the enemy: one object shape, feedback1-transform.test.js)
    const mask = attackMotionOf(e.def, e.form);
    c.targets = (c.targets || []).filter((/** @type {Unit | null} */ t) => t && motionTakes(mask, t));
  }, { priority: 49 });
  // skills whose client Trigger / Selector is _targetMotion 1: their target picks (enemies.js allTargets / targetsNear) skip a
  // flyer; an area their projectile then covers keeps its own client filter (鼠王 唱沙 / 沙狱, “自在” 纬地经天: collision 3)
  battle.on('enemySpawn', (/** @type {{ enemy: Unit }} */ { enemy }) => { if (enemy && NO_AIR_PICKS.includes(enemy.defId)) enemy.lpGroundPicks = true; }, { priority: 99 });
}

export const HLCHGR = 'enemy_10087_hlchgr';
/** Has the enemy def a normal attack whose motion leaves some unit out in a mode (data `attackMotion`)? */
/** @param {Record<string, any> | null | undefined} d */
const motionFiltered = (d) => !!d && d.attackMotion > 0 && (d.attackMotion !== 3 || Object.values(d.attackMotionModes || {}).some((v) => v !== 3));
// skill target picks, client _targetMotion 1: 鼠王 DriftSand / SandStorm / Mark Trigger, 杰斯顿 IronSandStorm Trigger (its
// stuns — PRTS 「禁锢装置/飞行单位以外」), “自在” CrossAttack / Mark Selector. Their area parts: enemies.js (“自在” 破桎而出 and
// “巨大的丑东西”'s 重生 bomb skip flyers there; 唱沙 / 沙狱 / 纬地经天 projectiles keep collision 3 — PRTS 「弹道可对空」)
export const NO_AIR_PICKS = Object.freeze(['enemy_1509_mousek', 'enemy_1516_jakill', 'enemy_1517_xi']);
/** @param {Unit | null | undefined} e */
const enemy0 = (e) => !!e && e.side === 'enemy' && !!e.profile;

/** After content/enemies.js (priority 100): replace its 6 s timer with the ammo skill. */
/** @param {Battle} b @param {Unit} e */
function patchHlchgr(b, e) {
  const ab = /** @type {AbState} */ (abOf(b, e));
  const sk = ab.sk.ForeverEnhance;
  if (!sk) return;
  ab.list = ab.list.filter((a) => !(a.tick && /** @type {number} */ (a.iv) > 0 && !a.lpAmmo)); // upstream's only ability: the plain timer
  const sp = (e.def && e.def.raw && e.def.raw.sp) || {};
  const max = Math.max(1, Math.floor(Number(sp.maxSp) || 0));
  e.lpAmmo = { left: Math.min(max, Math.max(0, Math.floor(Number(sp.initSp ?? max) || 0))), max };
  attach(b, e, [foreverEnhance(ab, sk)]);
}

/** 赐我力量！: every SkillTrigger.interval s try one cast (≤ max_stack_cnt successes, 1 bullet each). */
/** @param {AbState} ab @param {AbSkill} sk @returns {EnemyAbility} */
function foreverEnhance(ab, sk) {
  const maxCasts = T(ab, 'SkillTrigger.max_stack_cnt') ?? Infinity;
  const cost = Math.max(0, sk.sp ?? 1);
  const atk0 = T(ab, 'AttributeStorage.atk') ?? 0, move0 = T(ab, 'AttributeStorage.move_speed') ?? 1;
  return {
    lpAmmo: true,
    iv: T(ab, 'SkillTrigger.interval') ?? 6,
    tick(b, e, a) {
      const n = a.n ?? 0;
      if (n >= maxCasts || !(/** @type {{ left: number, max: number }} */ (e.lpAmmo).left >= cost) || !canCast(e, false)) return;
      /** @type {{ left: number, max: number }} */ (e.lpAmmo).left -= cost;
      a.n = n + 1;
      e.skillAnimUntil = b.time + 0.5;
      b.addBuff(e, { key: 'ab:enhance', persist: true, mods: { atkPct: atk0 + a.n * (sk.bb.atk_add ?? 0), moveMul: move0 + a.n * (sk.bb.move_speed_add ?? 0) } });
    },
  };
}

/** @param {Battle} b @param {Unit} e */
function patchVtsk(b, e) {
  const ab = /** @type {AbState} */ (abOf(b, e));
  const ap = ab.sk.Appear, mc = ab.sk.MultiCombat;
  delete ab.sk.Appear;
  delete ab.sk.MultiCombat;
  attach(b, e, [ap && barrage(ap.bb.times ?? 0), mc && chargedTriple(mc)]);
}

/** 回忆里的誓死: one 3×3 zone on the highest-HP ally's tile; each pulse hits the highest-HP ally inside it, ≤ `times` hits. */
/** @param {number} times @returns {EnemyAbility} */
function barrage(times) {
  return {
    spawn(b, e) {
      const lock = allTargets(b, e).sort((p, q) => q.hp - p.hp)[0];
      if (!lock || !(times > 0)) return;
      const r = lock.tileR, c = lock.tileC;
      b.fx('telegraph', { x: lock.x, y: lock.y, r: 1, tiles: 'box', dur: BARRAGE_LIFE, kind: 'barrage', id: e.id });
      let hits = 0;
      for (let k = 0; BARRAGE_DELAY + k * BARRAGE_STEP <= BARRAGE_LIFE + 1e-9; k++) {
        b.after(BARRAGE_DELAY + k * BARRAGE_STEP, () => {
          // the zone goes with its source [ASSUMED: PRTS does not say whether the 弹道 outlives the enemy]
          if (!e.alive || hits >= times) return;
          const t = areaAlliesInTiles(b, e, r, c, 'box', 1).sort((p, q) => q.hp - p.hp)[0];
          if (!t) return;
          hits++;
          b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'barrage' });
          hurt(b, e, t, e.s.atk, 'phys');
        }, { owner: e });
      }
    },
  };
}

/** 回忆里的怒守: ready on the data cooldown, cast only while blocked; that melee attack lands as three 100 % hits. */
/** @param {AbSkill} mc @returns {EnemyAbility} */
function chargedTriple(mc) {
  const n = mc.bb.times ?? 1;
  return {
    name: mc.name, cd: mc.cd, icd: mc.icd,
    cond: (b, e) => !!e.blockedBy,
    fire(b, e, a) { a.ready = n; },
    dealt(c, b, e, a) {
      if (!(a.ready > 1) || c.target !== e.blockedBy) return;
      const m = a.ready;
      a.ready = 0;
      for (let i = 1; i < m; i++) hurt(b, e, c.target, e.s.atk, 'phys');
    },
  };
}

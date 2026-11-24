// server/sim/content/kits/ops/op-helage.js — 赫拉格 (char_188_helage) 自选 operator kit: 6★ 武者 (近卫), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and both modules at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_188_helage, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json), PRTS 赫拉格 (talents,
// skills, modules: no 备注), PRTS 分支特性信息 §武者 ("常态持有禁疗；通过自身特性/天赋/技能产生的作用于自身的治疗效果会无视自身的
// 禁疗"; "特性治疗于干员每次输出伤害时触发（不局限于攻击）"), gamedata_const ba.berserk 坚忍 ("根据已损失的生命值获得相应比例的
// 属性加成，损失一定比例时达最大加成（同类属性取最高）") and ba.protect 庇护 ("受到的物理和法术伤害降低相应比例（同名效果取最高）"), his
// battle skeleton char_188_helage.skel (Skill: two OnAttack, Skill_2: two, Skill_3_Loop: one).
// - Trait (武者) "不成为其他角色的治疗目标，每次攻击到敌人后回复自身70生命": the profession default (professions.js `musha`: no
//   heal from others, `value` HP on every damage instance he deals — PRTS 分支特性信息 武者 — so the second hit of S1 / S2's
//   二连击 heals too), ground-only melee on his 1-1, block 1.
// - T1 月盈星亏 "在场时，自身获得最高+100攻击速度的坚忍（损失70%生命值时达到最大加成）": ASPD + min_attack_speed × the share of
//   the HP lost up to 1 − min_hp_ratio (linear, 坚忍), refreshed every tick. SBL-X stage 3: +130 at 50 % lost (the module
//   talent change).
// - T2 运筹帷幄 "未阻挡敌人时每秒回复60生命" (full potential: 70): the 生命回复速度 attribute (the stat hpRecoveryPerSec; SIM.md §4:
//   an hpRegen buff, not a heal — no 治疗加成, never stopped by 禁疗), on while he blocks nobody — in the official client his talent 2 is a
//   ToggleablePassiveBuffAbility whose BlockedToggleChecker (block count 0 to 0) toggles one buff, helage_t_2[a], with the
//   attribute HP_RECOVERY_PER_SEC from the blackboard. SBL-Y stage 3 "未阻挡敌人或生命值低于30%时每秒回复80生命" (full
//   potential: 90): 90 / s and the hidden module talent (index 2, prefab key 10, hp_ratio / hp_recovery_per_sec): the same
//   regeneration below hp_ratio while he blocks [ASSUMED·not checked: the text's 或 — 90 / s when either holds, never both parts
//   at once; the prefab of talent 2 is in neither his charpack nor his module prefab, so whether its buff shares the key of
//   helage_t_2[a] is not read].
// - Module SBL-X “藏锋” "生命值低于50%时，获得25%的庇护" (a display trait part; the effect is the hidden talent part hp_ratio /
//   damage_resistance, merged into talent 0's blackboard): below hp_ratio of his max HP the physical and arts damage he takes
//   ×(1 − damage_resistance) (as 宴's elite module) — 庇护, "同名效果取最高": the shared effect (tier1.js holdProtect).
// - Module SBL-Y “热的雪” "被击倒时不撤退且回复30%生命（单次部署只触发1次）" (trait bb hp_ratio): the first lethal blow of a
//   deployment leaves him on the field at hp_ratio of his max HP (a kit saver, priority −50 as 斯卡蒂's module).
// - S1 新月 (AUTO, attack SP, DEFAULT): the next attack strikes its target twice at atk_scale × ATK.
// - S2 弦月 (MANUAL, time SP, DEFAULT): `duration` s — ATK +atk, every attack strikes its target twice (二连击), 物理闪避 +prob.
//   Both are the client's MultiMeleeAttack (skchr_helage_1, and the S2 mode's attack of his charpack) with `_additionalTimes` 1
//   and `_waitAttackEventForAllAttacks` on, and their clips carry two OnAttack events each (Skill 0.567 / 0.7 s, Skill_2
//   0.6 / 0.667 s): the second strike lands at the second event — SECOND_STRIKE after the first, one hit of the same
//   attack, at the same target while it lives and he can act (as 帕拉斯 S1). Checked against the official client: with the
//   flag on, the wait between strikes is not `_triggerDelta` but the clip's next attack event (capped at the clip's length).
// - S3 满月 (MANUAL, time SP, DEFAULT with no rangeId: cast while he attacks or blocks, docs/rules/sim.md 「스킬 범위 발동」): `duration` s — ATK +atk, attack range +1 tile
//   forward (ability_range_forward_extend), up to attack@max_target targets at once; back to 1-1 after.

import { num, traitBb, skillRec, toggleBuff, up, onHitOn, holdProtect, PROTECT_TICK_HOLD } from '../shared/tier1.js';
import { resolveHit } from '../../../ai.js';
/** @import { KitFns, KitChess, SkillHook } from '../shared/tier1.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */

const S1 = 'skchr_helage_1';
const S2 = 'skchr_helage_2';
const S3 = 'skchr_helage_3';

/** The second strike after the first, from the OnAttack events of his clips (char_188_helage.skel, s): S1 Skill, S2 Skill_2. */
const SECOND_STRIKE = Object.freeze({ [S1]: 0.133, [S2]: 0.067 });

/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** A skill attack's onHit: the attack's profile without this callback strikes `target` again `delay` s later, the same attackId. @param {number} delay @returns {SkillHook} */
const secondStrike = (delay) => ({ battle, unit, target }) => {
  if (!target) return;
  const prof = { ...battle.effectiveProfile(unit), skillOnHit: null };
  const attackId = battle._attackSeq, seq = unit.deploySeq;
  battle.after(delay, (b) => {
    if (!target.alive || !unit.alive || !unit.deployed || unit.deploySeq !== seq || !unit.canAct) return;
    resolveHit(b, unit, prof, target, { isSkill: true, index: 0, attackId }, target.x, target.y);
  }, { owner: unit });
};
/** The blackboard of the talent with data index `i` ({} when absent; module parts with a new index included). @param {KitChess} chess @param {number} i */
const talentAt = (chess, i) => (chess?.talents ?? []).find((t) => t && t.index === i)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_188_helage: (bb, chess) => {
    const t0 = talentAt(chess, 0), t1 = talentAt(chess, 1), t2 = talentAt(chess, 2);
    const tb = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    return {
      skills: {
        [S1]: {
          kind: num(skillRec(chess, S1)?.maxChargeTime, 1) > 1 ? 'charges' : 'instant',
          attack: { atkScale: num(b1.atk_scale, 1), onHit: secondStrike(SECOND_STRIKE[S1]) },
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk), dodgePhys: num(b2.prob) },
          attack: { onHit: secondStrike(SECOND_STRIKE[S2]) },
        },
        [S3]: {
          kind: 'duration',
          mods: { atkPct: num(b3.atk) },
          targeting: { rangeExtend: num(b3.ability_range_forward_extend), maxTargets: Math.max(1, Math.floor(num(b3['attack@max_target'], 1))) },
        },
      },
      talents: [
        { install(battle, unit) { // 月盈星亏: 坚忍 ASPD up to min_attack_speed, reached at min_hp_ratio HP (linear in the HP lost)
          const maxAs = num(t0.min_attack_speed), minHp = num(t0.min_hp_ratio);
          if (!(maxAs > 0) || !(minHp < 1)) return;
          const key = 'talent:helage:berserk';
          battle.on('tick', () => {
            const cur = /** @type {BuffRec | null} */ (unit.findBuff(key));
            if (!up(unit)) { if (cur) battle.removeBuff(unit, key); return; }
            const v = maxAs * Math.max(0, Math.min(1, (1 - unit.hpRatio) / (1 - minHp)));
            if (cur && Math.abs((cur.data?.v ?? 0) - v) < 0.05) return;
            if (v < 0.05) { if (cur) battle.removeBuff(unit, key); return; }
            battle.addBuff(unit, { key, mods: { aspd: v }, data: { v }, tags: ['talent'] });
          }, { owner: unit });
        } },
        { install(battle, unit) { // 运筹帷幄: 生命回复速度 while blocking nobody; SBL-Y stage 3: or below hp_ratio HP
          const regen = num(t1.hp_recovery_per_sec);
          if (regen > 0) toggleBuff(battle, unit, 'talent:helage:regen', () => unit.blocking.length === 0, { hpRegen: regen });
          const lowHp = num(t2.hp_ratio), lowRegen = num(t2.hp_recovery_per_sec);
          if (lowRegen > 0 && lowHp > 0) {
            toggleBuff(battle, unit, 'talent:helage:regenLow', () => unit.blocking.length > 0 && unit.hpRatio < lowHp, { hpRegen: lowRegen });
          }
        } },
      ],
      install(battle, unit) {
        // SBL-X “藏锋”: 生命值低于50%时，获得25%的庇护 — the shared 庇护 (holdProtect: the strongest of every source holds),
        // refreshed every tick and at each hit on him while he is below
        const dr = num(t0.damage_resistance), drBelow = num(t0.hp_ratio);
        if (dr > 0 && drBelow > 0) {
          const keep = () => { if (up(unit) && unit.hpRatio < drBelow) holdProtect(battle, unit, dr, PROTECT_TICK_HOLD, unit); };
          battle.on('tick', keep, { owner: unit });
          onHitOn(battle, unit, keep);
        }
        // SBL-Y “热的雪”: 被击倒时不撤退且回复30%生命（单次部署只触发1次）
        const rise = num(tb.hp_ratio);
        if (rise > 0) {
          battle.on('fatal', (ctx) => {
            if (ctx.unit !== unit || ctx.prevented || unit.mem.helageRoseSeq === unit.deploySeq) return;
            unit.mem.helageRoseSeq = unit.deploySeq;
            ctx.prevented = true;
            unit.hp = Math.max(1, unit.s.maxHp * rise);
            battle.fx('undying', { x: unit.x, y: unit.y, id: unit.id });
          }, { owner: unit, priority: -50 });
        }
      },
    };
  },
};

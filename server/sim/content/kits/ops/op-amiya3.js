// server/sim/content/kits/ops/op-amiya3.js — 阿米娅 (char_002_amiya) in her 医疗 form char_1037_amiya3: 5★ 咒愈师 (医疗), a tier-5 piece
// of 规程 (act3autochess) (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 메테오라이트·올가·아미야」); both skills, the
// talent and INC-X in both forms. The chess names the operator (`charId` char_002_amiya) and fights with the template's body
// (`tmplId` char_1037_amiya3, char_patch_table): the kit is keyed by the body (content/index.js kitOf), as the client keys her
// charpack, skills and effects.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, INC-X stage 1.
// Sources: the record's tables; charpack char_1037_amiya3 (Trait, CommonAbilities/TraitHealRange, Talents/1 of every mode, Modes/S1 / S2),
// skill prefabs skchr_amiya3_1 / _2, buff templates amiya3_tr, amiya3_s_1, amiya3_s_1[heal], amiya3_s_2*.
// - Trait (咒愈师) "攻击造成法术伤害，攻击敌人时为攻击范围内一名友方干员治疗相当于50%伤害的生命值": the incantationmedic profile;
//   INC-X raises the share to 60% (trait bb scale).
// - T1 诚挚期许: while she is on the field every allied unit (Others/Talents/1: targetSide 1, no range) has max HP +max_hp
//   (amiya3_t_1, MULTIPLIER); while a skill of hers is on (the Talents/1 of modes S1 and S2) every allied unit regenerates
//   hp_recovery_per_sec_by_max_hp_ratio of its max HP a second (amiya3_t_1[s]).
// - S1 哀恸共情 (50 s, mode S1): ASPD +attack_speed; every damage of her attacks (amiya3_s_1 ON_CALCULATE_DAMAGE, family ATTACK)
//   heals every other allied unit on the skill's range x-1 around her by heal_scale × ATK (amiya3_s_1[heal], the ability amiya3_skill1;
//   `_excludeTargetType` SOURCE: not herself).
// - S2 慈悲愿景 (32 s, once a battle: skill_max_trigger_time 1, `_limitGlobalTriggerTime`): at its clip's strike (S2Attack, Skill_2_Begin)
//   one attack at atk_scale × ATK arts on every enemy of her attack range, each hit one taking amiya3_s_2[debuff] (ASPD
//   +amiya3_s_2[debuff].attack_speed, move speed × (1 + …move_speed), for its duration), and she gains ATK +atk for each enemy hit, at most
//   max_stack_cnt (amiya3_s_2[atk], until the skill ends: amiya3_s_2[passive] ON_SKILL_FINISH); then mode S2 for the rest of the skill:
//   her attacks deal true damage (`_damageType` 3) to 2 enemies at once (its selector's `_maxNum` 2).

import { num, talentBb, skillRec, up, installAura } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

const S1 = 'skchr_amiya3_1';
const S2 = 'skchr_amiya3_2';
const HP = 'amiya3_t_1';
const REGEN = 'amiya3_t_1[s]';
const ATK = 'amiya3_s_2[atk]';
const DEBUFF = 'amiya3_s_2[debuff]';
/** S2's mode selector `_maxNum`. */
export const S2_TARGETS = 2;
/** The talents' aura period [추정·엔진: the client's talent abilities attach while she is on the field; re-selected often enough that a unit deployed later holds them at once]. */
const AURA_IV = 0.2;
const AIR = Object.freeze({ canHitFly: true });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_1037_amiya3: (_bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const hpUp = num(t0.max_hp), regen = num(t0.hp_recovery_per_sec_by_max_hp_ratio);
    const s1Grid = skillRec(chess, S1)?.rangeGrid ?? null;
    const uses = Math.max(1, Math.floor(num(b2.skill_max_trigger_time, 1)));
    const on = (u) => !!(u.skill && u.skill.active);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { aspd: num(b1.attack_speed) } },
        [S2]: {
          kind: 'duration',
          castHolds: true,
          attack: { dmgType: 'true', maxTargets: S2_TARGETS },
          onStrike({ battle, unit }) {
            const scale = num(b2.atk_scale, 1), per = num(b2.atk), cap = Math.max(0, Math.floor(num(b2.max_stack_cnt, 5)));
            const dur = num(b2[`${DEBUFF}.duration`]), aspd = num(b2[`${DEBUFF}.attack_speed`]), move = num(b2[`${DEBUFF}.move_speed`]);
            const foes = battle.enemiesInKeys(unit.rangeKeys, unit, AIR);
            for (const e of battle.blockedTargets(unit, AIR)) if (!foes.includes(e)) foes.push(e);
            let n = 0;
            for (const e of foes) {
              if (!e.alive) continue;
              battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isAttack: true, isSkill: true, tags: ['skill'] });
              n++;
              if (e.alive && dur > 0) battle.addBuff(e, { key: DEBUFF, source: unit, duration: dur, refresh: 'replace', mods: { aspd, moveMul: Math.max(0, 1 + move) }, visible: true, tags: ['skill'] });
            }
            const k = Math.min(n, cap);
            if (k > 0 && per) battle.addBuff(unit, { key: ATK, mods: { atkPct: per * k }, data: { stacks: k }, tags: ['skill'] });
          },
          onEnd({ battle, unit }) { if (unit.findBuff(ATK)) battle.removeBuff(unit, ATK); },
        },
      },
      talents: [{ install(battle, unit) {
        if (hpUp) installAura(battle, unit, { key: `${HP}:${unit.id}`, interval: AURA_IV, mods: { hpPct: hpUp }, select: (a) => up(a) });
        if (regen) installAura(battle, unit, { key: `${REGEN}:${unit.id}`, interval: AURA_IV, mods: { hpRegenRatio: regen }, visible: true, select: (a) => up(a) && on(unit) });
      } }],
      install(battle, unit) {
        const sid = unit.skill?.id;
        if (sid === S1 && s1Grid) {
          const scale = num(b1.heal_scale);
          battle.on('damaged', (c) => {
            const d = c.dmg;
            if (c.source !== unit || !on(unit) || unit.skill.id !== S1 || !d?.isAttack || !c.target || c.target.side !== 'enemy' || !(scale > 0)) return;
            // its CreateEffect amiya3_skill_01_range on her (render/fx/kitofficial.js kitHit)
            battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'amiya3:s1' });
            const keys = new Set(absoluteRangeKeys(s1Grid, unit.tileR, unit.tileC, unit.dir, 0));
            for (const a of battle.alliesFor(unit)) {
              if (a !== unit && up(a) && keys.has(a.tileR * COLS + a.tileC)) battle.heal(unit, a, unit.s.atk * scale, { tags: ['skill'] });
            }
          }, { owner: unit });
        }
        if (sid === S2) {
          // 整场战斗中该技能只能释放一次: after the last use no SP comes back (activations count every deployment of the battle)
          battle.on('spGain', (c) => {
            if (c.unit === unit && !unit.skill.active && unit.skill.activations >= uses) c.amount = 0;
          }, { owner: unit });
        }
      },
    };
  },
};

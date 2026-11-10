// server/sim/content/kits/ops/op-jaksel.js — 杰克 (char_347_jaksel) kit: 4★ 斗士 (近卫), a tier-1 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 재키·체스트넛·시데로카·레이지 아이언하이드」); both skills, the talent and FGT-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, FGT-X stage 1.
// Sources: the record's tables; charpack char_347_jaksel (Modes/Default/Body/Attack, Modes/S2/Body/StrikeBack, Talents/1), skill prefabs
// skchr_jaksel_1 / _2, buff_template_data evade_physical, charge_atk_speed_on_evade, charge_ability_on_evade.
// - FGT-X (elite): the trait's own 物理闪避 (trait bb prob) — one more independent dodge source.
// - T1 极速闪避 (jaksel_t_1[evade] evade_physical + jaksel_t_1[atk_speed] charge_atk_speed_on_evade): 物理闪避 prob; each dodged
//   physical hit gives ASPD +attack_speed for duration s, one at a time (refreshed, not stacked).
// - S1 给你一拳！ (ReplacementSkill, attack SP, `_recoverSpIfTargetDead`): the next attack at atk_scale.
// - S2 全神贯注！ (MANUAL, `_beginAnim` Skill_Start): mode S2, whose only ability is StrikeBack — no attack. 物理闪避 +prob
//   (jaksel_skill_2[evade]); each dodged physical hit casts StrikeBack (charge_ability_on_evade, `_checkCanUseAblityFlag`) when its
//   cooldown is over: one enemy her attack would pick, attack@atk_scale × ATK physical, at the Skill_Loop clip's strike. Its cooldown is
//   her attack interval, the skill scaling it by base_attack_time (BASE_ATTACK_TIME FINAL_SCALER: "反击频率不小于N%的攻击间隔").

import { num, talentBb, traitBb, skillRec, up, statBuff } from '../shared/tier1.js';

const S1 = 'skchr_jaksel_1';
const S2 = 'skchr_jaksel_2';
const EVADE_ASPD = 'charge_atk_speed_on_evade';
/** Skill_Start (data/assets.json `animations`): `BasicSkill.PlayBeginAnimation` plays it before the skill starts. */
export const S2_BEGIN = 0.333;
/** Skill_Loop's OnAttack event (data/assets.json `animations` hits): StrikeBack waits for it (`_waitForAttackEvent`). */
export const STRIKE_AT = 0.333;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_347_jaksel: (_bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const evade = num(b2['jaksel_skill_2[evade].prob']), batScale = num(b2.base_attack_time, 1) || 1;
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1) } },
        [S2]: {
          kind: 'duration', mods: { dodgePhys: evade }, attack: { noAttack: true, atkScale: num(b2['attack@atk_scale'], 1) },
          onStart({ battle, unit, skill }) {
            unit.swing = null; unit.castLeft = 0; unit.skillStateUntil = battle.time + S2_BEGIN;
            skill.timeLeft += S2_BEGIN;
            unit.mem.jakselStrikeAt = -Infinity;
          },
        },
      },
      talents: [{ install(battle, unit) {
        const prob = num(t0.prob), aspd = num(t0['charge_atk_speed_on_evade.attack_speed']), dur = num(t0['charge_atk_speed_on_evade.duration']);
        if (prob > 0) statBuff(battle, unit, 'talent:jaksel:evade', { dodgePhys: prob });
        battle.on('dodge', (c) => {
          if (c.target !== unit || c.dmg?.type !== 'phys' || !up(unit)) return;
          if (aspd && dur > 0) battle.addBuff(unit, { key: EVADE_ASPD, duration: dur, refresh: 'replace', mods: { aspd }, visible: true, tags: ['talent'] });
          // S2: StrikeBack, its cooldown over (the attack interval × base_attack_time since the last one)
          const sk = unit.skill;
          if (!sk?.active || sk.id !== S2 || battle.time + 1e-9 < (unit.mem.jakselStrikeAt ?? -Infinity)) return;
          if (battle.time + 1e-9 < unit.skillStateUntil) return;   // still in Skill_Start
          unit.mem.jakselStrikeAt = battle.time + unit.s.interval * batScale;
          const seq = unit.deploySeq;
          battle.after(STRIKE_AT, () => {
            if (!up(unit) || unit.deploySeq !== seq || !unit.skill?.active || unit.skill.id !== S2) return;
            // the ability is Modes/S2/Body/StrikeBack (`_animKey` Skill_Loop): the 'atk' signal names it for the clip (SIGNAL_CLIPS)
            battle.forceAttack(unit, null, { signal: 'StrikeBack' });
          }, { owner: unit });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        const p = num(tb.prob);
        if (p > 0) statBuff(battle, unit, 'trait:jaksel:evade', { dodgePhys: p });
      },
    };
  },
};

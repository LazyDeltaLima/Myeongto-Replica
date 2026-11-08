// server/sim/content/kits/ops/op-highmo.js — 海沫 (char_4066_highmo) kit: 5★ 收割者 (近卫), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 블루포이즌·하이모어·홈바운드·안드레아나」); both skills, T1 and REA-X in both forms. The trait is the branch's (professions.js reaper: its
// value is in the record, 50 / 60 with REA-X). T2 罹患，浸染 needs the tag rogue_mizuki (Talents/1 `_oneOfTags`): off in this mode.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, REA-X stage 1.
// Sources: the record's tables; PRTS 海沫 (备注 of T1, S2); charpack char_4066_highmo (Trait, Talents/1 / 2, Modes/S2), skill prefabs skchr_highmo_1 / _2,
// buff_template_data highmo_trait, highmo_t_2, highmo_s_2.
// - T1 收割，给养 (highmo_t_2, the shape of highmo_trait): each enemy attacked, up to her block count, recovers `value` of her 元素损伤 (FixedValueElementHeal).
// - S1 回首，断舍 (ReplacementSkill, MultiMeleeAttack `_additionalTimes` 1 with no delta): her next attack at atk_scale strikes twice.
// - S2 泡影，殆尽 (`_switchToState` 0: CastSkill.UseSkill starts it at once, she keeps attacking; no begin hold): ATK +atk, mode S2, 物理闪避 prob; while it
//   runs an enemy that is killed inside her range or blocked by her gives her hp_ratio of her max HP (highmo_s_2 ON_OWNER_KILLED, HealViaMaxHpRatio `_ignoreHealFree`;
//   `ignoreTargetFree`, so an unselectable one too; PRTS 备注 "仅攻击范围内的地面敌人或自身阻挡的敌人").

import { num, talentBb, skillRec, up } from '../shared/tier1.js';
import { bodyInRange } from '../../../body.js';

const S1 = 'skchr_highmo_1';
const S2 = 'skchr_highmo_2';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_4066_highmo: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1), hits: 2 } },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk), dodgePhys: num(b2.prob) } },
      },
      talents: [{ install(battle, unit) {
        const v = num(t0.value);
        if (!(v > 0)) return;
        battle.on('attack', (c) => {
          if (c.attacker !== unit || !unit.alive) return;
          battle.reduceElement(unit, v * Math.min(c.targets.length, Math.max(1, unit.s.blockCnt)));
        }, { owner: unit, priority: -10 });
      } }],
      install(battle, unit) {
        const ratio = num(b2.hp_ratio);
        if (!(ratio > 0)) return;
        battle.on('kill', ({ victim: e }) => {
          if (e.side !== 'enemy' || e.isFlying || !up(unit) || !unit.skill?.active || unit.skill.id !== S2) return;
          if (e.blockedBy !== unit && !bodyInRange(e, unit.rangeKeySet || new Set(unit.rangeKeys || []))) return;
          battle.heal(unit, unit, unit.s.maxHp * ratio, { self: true, ignoreHealFree: true, moment: 'highmo_s_2[heal][effect]' });
        }, { owner: unit });
      },
    };
  },
};

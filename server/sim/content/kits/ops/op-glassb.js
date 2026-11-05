// server/sim/content/kits/ops/op-glassb.js — 真理 (char_195_glassb) kit: 5★ 凝滞师 (辅助), a tier-2 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 ○○」); both skills, the talent, the trait and DEC-Y in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4, no talent yet, no module; elite = E2 Lv55, rank 7, DEC-Y stage 1.
// Sources: the record's tables; PRTS 真理; charpack char_195_glassb (Trait, Talents/1, Modes/S2) and skill prefabs skchr_glassb_1 / _2.
// - Trait (凝滞师): the profession (slower: 停顿 for trait bb sluggish s). DEC-Y only changes it to 1.2 s, the record's trait bb.
// - T1 探知者 (E2, PassiveBuffAbility glassb_t_1): DEF × (1 + def), ASPD + attack_speed.
// - S1 专心致志: base attack time + base_attack_time s.
// - S2 文学风暴: ATK +atk, range x-2, the mode S2 with attack@max_target targets. Its RangedAttack plays no clip of its own (`_animKey` empty,
//   ThreePartChannelingAnimation Skill_Begin / Skill_Loop / Skill_End for the whole skill) and strikes `_preDelay` 0.5 s into each swing.

import { num, talentBb, skillRec, statBuff, batMod } from '../shared/tier1.js';

const S1 = 'skchr_glassb_1';
const S2 = 'skchr_glassb_2';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_195_glassb: (bb, chess) => {
    const t0 = talentBb(chess, 0);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const s2Grid = skillRec(chess, S2)?.rangeGrid ?? null;
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { batPct: batMod(b1.base_attack_time, chess) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk) },
          targeting: { maxTargets: num(b2['attack@max_target'], 3), ...(s2Grid ? { rangeGrid: s2Grid } : null) },
        },
      },
      talents: [{ install(battle, unit) {
        statBuff(battle, unit, 'glassb_t_1', { defPct: num(t0.def), aspd: num(t0.attack_speed) });
      } }],
    };
  },
};

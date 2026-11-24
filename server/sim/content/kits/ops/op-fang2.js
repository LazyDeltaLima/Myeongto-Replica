// server/sim/content/kits/ops/op-fang2.js — 历阵锐枪芬 (char_1036_fang2) kit: 5★ 冲锋手 (先锋), a tier-3 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 팽 더 파이어 샤픈드·폰사이러스·프로스트리프·바르카리스」); both skills in both forms. The trait is the branch's: professions.js installCharger, its `cost` in the record (1, CHG-X 2).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, CHG-X stage 1.
// Sources: the record's tables; PRTS 历阵锐枪芬 (备注 of T1, S1, S2, CHG-X); charpack char_1036_fang2 (Trait, Talents/1, Modes/S2), skill prefabs skchr_fang2_1 / _2, buff_template_data
// fang2_s_1, fang2_t_1, fang2_e_tr.
// - T1 轻装上阵 and the trait's withdraw refund do nothing here: the initial deployment is free in battle, and no effect withdraws a piece of her bonds and there is no manual retreat (as 德克萨斯, 砾).
// - S1 贯敌刺枪 (ReplacementSkill, MultiMeleeAttack `_additionalTimes` 1, `_triggerDelta` 0.25; 1 / 2 charges): her next attack at atk_scale strikes twice, S1_DELTA apart, the same target while it
//   lives and she can act. A kill by it gives +cost more on top of the trait's (fang2_s_1 ON_TARGET_KILLED ModifyCost); PRTS 备注: not drawn over her head.
// - S2 执守阵线 (PASSIVE, ON_DEPLOY: from each deployment, for its duration, then it is over until the next one): ATK +atk, DEF +def, block +block_cnt, attacks every enemy she blocks (mode S2's selector).

import { num, skillRec, instantKind } from '../shared/tier1.js';
import { resolveHit } from '../../../ai.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { SkillCtx } from '../../../skills.js' */

const S1 = 'skchr_fang2_1';
const S2 = 'skchr_fang2_2';
/** S1's second strike after the first (skchr_fang2_1 `_triggerDelta`, s). */
export const S1_DELTA = 0.25;
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_1036_fang2: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const cost = num(b1.cost);
    /** A kill by S1 (fang2_s_1 ON_TARGET_KILLED): `target` gone once its strike has resolved. @param {Battle} battle @param {Unit} unit @param {Unit} target */
    const killed = (battle, unit, target) => { if (!target.alive && cost > 0) battle.addDp(unit.ownerId, cost); };
    /** @param {SkillCtx} ctx */
    const secondStrike = ({ battle, unit, target }) => {
      if (!target) return;
      killed(battle, unit, target);
      const prof = { ...battle.effectiveProfile(unit), skillOnHit: null };
      const attackId = battle._attackSeq, seq = unit.deploySeq;
      battle.after(S1_DELTA, (b) => {
        if (!target.alive || !unit.alive || !unit.deployed || unit.deploySeq !== seq || !unit.canAct) return;
        resolveHit(b, unit, prof, target, { isSkill: true, index: 0, attackId }, target.x, target.y);
        killed(b, unit, target);
      }, { owner: unit });
    };
    return {
      skills: {
        [S1]: {
          kind: instantKind({ skill: { maxCharges: num(skillRec(chess, S1)?.maxChargeTime, 1) } }),
          attack: { atkScale: num(b1.atk_scale, 1), onHit: secondStrike },
        },
        [S2]: {
          kind: 'duration', duration: num(skillRec(chess, S2)?.duration), activateOnDeploy: true, spCost: 0, spType: 'none', trigger: 'NEVER',
          mods: { atkPct: num(b2.atk), defPct: num(b2.def), blockCnt: num(b2.block_cnt) },
          attack: { hitAllBlocked: true },
        },
      },
    };
  },
};

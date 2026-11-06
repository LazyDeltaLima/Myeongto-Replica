// server/sim/content/kits/ops/op-swllow.js — 灰喉 (char_367_swllow) kit: 5★ 速射手, a tier-1 piece of the season not out yet (shared/seasons.js `next`,
// docs/rules/diy.md 「새 시즌 그레이스롯·아스트젠·그레이 더 라이트닝베어러·키치세이」); both skills, the talent and MAR-Y in both forms. The trait is the branch's (professions.js fastshot).
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, MAR-Y stage 1.
// Sources: the record's tables; PRTS 灰喉 (备注 of the talent); charpack char_367_swllow (Talents/1, Modes/S2/Body/Attack), skill prefabs skchr_swllow_1 / _2, equip prefab swllow_equip_1_1_p1,
// buff_template_data critical_atkscale, swllow_e_t_10.
// - T1 顺风: attack_speed always; critical_atkscale (ON_CALCULATE_DAMAGE Dice `prob`, AtkScaleUp `atk_scale`): every damage instance of hers rolls on its own, whatever its source (PRTS). prob is 0 in the normal form.
// - S1 飞羽 (ReplacementSkill, AUTO, `ct` charges): the next attack shoots 2 arrows at atk_scale (MultiRangedAttack `_additionalTimes` 1, `_triggerDelta` 0.05 s); both land together here, as 能天使's.
// - S2 回流 (mode S2): ATK +atk, every attack 3 arrows (`_additionalTimes` 2).
// - MAR-Y (talent 10, stage 1 on the elite): while a ground enemy stands in her range attack_speed: an aura on ground targets with `ignoreTargetFree`, so a stealthed one counts too; several enemies give it once (one derived buff, `maxStackCnt` 1).

import { num, talentBb, moduleBb, skillRec, statBuff, toggleBuff, onHitBy } from '../shared/tier1.js';
import { bodyInRange } from '../../../body.js';

const S1 = 'skchr_swllow_1';
const S2 = 'skchr_swllow_2';
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_367_swllow: (bb, chess) => {
    const t0 = talentBb(chess, 0), mb = moduleBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    return {
      skills: {
        [S1]: { kind: num(skillRec(chess, S1)?.maxChargeTime, 1) > 1 ? 'charges' : 'instant', attack: { atkScale: num(b1.atk_scale, 1), hits: 2 } },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk) }, attack: { hits: 3 } },
      },
      talents: [{ install(battle, unit) {
        statBuff(battle, unit, 'swllow_t_1', { aspd: num(t0.attack_speed) });
        const prob = num(t0.prob), scale = num(t0.atk_scale, 1);
        if (prob > 0 && scale !== 1) onHitBy(battle, unit, ({ dmg }) => { if (battle.rng.chance(prob)) dmg.amount *= scale; });
      } }],
      install(battle, unit) {
        const v = num(mb.attack_speed);
        if (!v) return;
        toggleBuff(battle, unit, 'swllow_e_t_10[atk_speed]', () => {
          const keys = unit.rangeKeySet;
          return !!keys && battle.enemies.some((e) => e.alive && !e.hidden && !e.isFlying && bodyInRange(e, keys));
        }, { aspd: v });
      },
    };
  },
};

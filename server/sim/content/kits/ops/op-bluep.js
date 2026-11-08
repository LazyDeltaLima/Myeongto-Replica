// server/sim/content/kits/ops/op-bluep.js — 蓝毒 (char_129_bluep) kit: 5★ 速射手 (狙击), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 블루포이즌·하이모어·홈바운드·안드레아나」); both skills, the talent, the trait (professions.js fastshot) and MAR-Y in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, MAR-Y stage 1.
// Sources: the record's tables; PRTS 蓝毒 (备注 of T1 and S1); charpack char_129_bluep (Talents/1, Modes/S2/Body/Attack), skill prefabs skchr_bluep_1 / _2,
// buff_template_data poison, bluep_e_t_10.
// - T1 神经毒素: every attack of hers puts bluep_t_1 (`_additiveActiveBuffs`: template poison, maxStackCnt 1, one buff per enemy whoever shot it, its first
//   tick after 1 s) on what it hits: duration s of poison_damage arts per second, NoSourceDamage (PRTS "无来源法术持续伤害"). A hit on a poisoned enemy only
//   resets the time, the amount stays what it was at first (PRTS). S1's hit on an enemy without it multiplies the amount by S1's atk_scale (PRTS 备注 of S1).
// - S1 二重射击·自动 (ReplacementSkill): the next attack goes to 2 targets (Trigger `_maxNum` 2) at atk_scale.
// - S2 毒液散射: ATK +atk, mode S2, whose Trigger `_maxNum` is 3. Its `attack@times` is 1: MultiRangedAttack.DoSetData takes times − 1 more rounds, so none.
// - MAR-Y: attack_speed while a ground enemy stands in her range (the module's talent, 10; PRTS module text).

import { num, talentBb, moduleBb, skillRec, up, toggleBuff } from '../shared/tier1.js';

const S1 = 'skchr_bluep_1';
const S2 = 'skchr_bluep_2';
const POISON = 'bluep_t_1';
const GROUND = Object.freeze({ canHitFly: false });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_129_bluep: (bb, chess) => {
    const t0 = talentBb(chess, 0), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const aspd = num(moduleBb(chess).attack_speed);
    const scale1 = num(b1.atk_scale, 1);
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: scale1 }, targeting: { maxTargets: 2 } },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk) }, targeting: { maxTargets: 3 } },
      },
      talents: [{ install(battle, unit) {
        const dmg = num(t0.poison_damage), dur = num(t0.duration);
        if (!(dmg > 0 && dur > 0)) return;
        battle.on('damaged', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.target?.side !== 'enemy') return;
          const amount = dmg * (c.dmg.isSkill && unit.skill?.id === S1 ? scale1 : 1);
          battle.addBuff(c.target, {
            key: POISON, source: unit, duration: dur, interval: 1, refresh: 'extend', visible: true, tags: ['talent', 'dot'],
            onTick: ({ battle: b, unit: x }) => {
              b.dealDamage(unit, x, { amount, type: 'arts', sourceless: true, showSource: true, ignoreSelect: true, tags: ['talent', 'dot', 'periodic'] });
            },
          });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        if (aspd > 0) {
          toggleBuff(battle, unit, 'bluep_e_t_10[atk_speed]', () => up(unit) && battle.enemiesInKeys(unit.rangeKeys, unit, GROUND).length > 0, { aspd });
        }
      },
    };
  },
};

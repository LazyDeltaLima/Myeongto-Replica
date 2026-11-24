// server/sim/content/kits/ops/op-ethan.js — 伊桑 (char_355_ethan) kit: 4★ 伏击客 (特种), a tier-3 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 아스테시아·콘트레일·에단」); both skills, the talent and AMB-X in both forms. The trait is the branch's (professions.js installStalker: every enemy in range, the dodge, 嘲讽等级 −1).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, AMB-X stage 1.
// Sources: the record's tables; PRTS 伊桑 (备注 of S1, the module's note); charpack char_355_ethan (Trait, Modes/*/Talents/1, Modes/S1/Body/Attack), skill prefabs skchr_ethan_1 / _2, buff_template_data poison.
// - T1 缠绕 (`_additiveActiveBuffs` ethan_t_1, `_probKey` prob, per target hit): frozen_duration s of 束缚 (abnormal flag UNMOVABLE). In mode S2 the prob ×talent_scale (`_applyTalentScale`, `_scaleCertainKeyList` prob).
// - S1 花式回旋 (PASSIVE, `_defaultModeIndex` 1: mode S1 is her default mode for the whole deployment): every attack puts ethan_s_1 (template poison, its first tick after 1 s) on what it hits: attack@duration s
//   of attack@poison_damage arts per second, NoSourceDamage (PRTS "预计算的无来源法术持续伤害"). A hit on a poisoned enemy resets the time, the amount stays (PRTS).
// - S2 十字悬挂 (mode S2, no ethan_s_1): ATK +atk.
// - AMB-X (the module's hidden talent): enemies in her range move at ×(1 + move_speed), one slow per 伊桑 (PRTS "多个伏击客X模组之间的减速效果可叠加"), as 水月's.

import { num, talentBb, moduleBb, skillRec } from '../shared/tier1.js';
import { AURA, enemiesOnRange, whileDeployed, pulse } from '../shared/tier4.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_ethan_1';
const S2 = 'skchr_ethan_2';
const POISON = 'ethan_s_1';
const BIND = 'ethan_t_1';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_355_ethan: (bb, chess) => {
    const t0 = talentBb(chess, 0), mb = moduleBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const prob = num(t0.prob), bind = num(t0.frozen_duration), scale = num(b2.talent_scale, 1);
    const dps = num(b1['attack@poison_damage']), dur = num(b1['attack@duration']);
    return {
      skills: {
        [S1]: { kind: 'passive' },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk) } },
      },
      talents: [{ install(battle, unit) {
        battle.on('damaged', (c) => {
          const e = c.target;
          if (c.source !== unit || !c.dmg?.isAttack || e?.side !== 'enemy' || !e.alive) return;
          if (unit.skill?.id === S1 && dps > 0 && dur > 0) {
            battle.addBuff(e, {
              key: POISON, source: unit, duration: dur, interval: 1, refresh: 'extend', visible: true, tags: ['skill', 'dot'],
              onTick: ({ battle: b, unit: x }) => {
                b.dealDamage(unit, x, { amount: dps, type: 'arts', sourceless: true, showSource: true, ignoreSelect: true, tags: ['skill', 'dot', 'periodic'] });
              },
            });
          }
          const p = prob * (unit.skill?.id === S2 && unit.skill.active ? scale : 1);
          if (bind > 0 && battle.rng.chance(p)) battle.applyStatus(e, 'bind', { duration: bind, source: unit, fxTag: BIND });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        const ms = num(mb.move_speed);
        if (ms) whileDeployed(battle, unit, AURA, () => { for (const e of enemiesOnRange(battle, unit)) pulse(battle, e, `ethan_e_002:${unit.id}`, { moveMul: Math.max(0, 1 + ms) }); });
      },
    };
  },
};

// server/sim/content/kits/ops/op-quercu.js — 夏栎 (char_492_quercu) kit: 5★ 护佑者 (辅助), a tier-1 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 미틈·로베르타·클릭·퀘르쿠스」); both skills, the talent, the trait and BLS-X (the trait's heal_scale) in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, BLS-X stage 1.
// Sources: the record's tables; PRTS 夏栎 (talent 备注); charpack char_492_quercu (Modes Default / S1 / S2: Attack, Selector, Talents/1), skill prefabs skchr_quercu_1 / _2, buff_template_data
// damage_resistance_GE[aura], demkni_t_2.
// - Trait: attacks deal arts damage; while a skill runs they heal the ally of her range with the lowest HP share for ATK × heal_scale instead (modes S1, S2: `_targetSide` allies, `_postFilter` 3).
// - 丛林的荫庇: each ally of her range with an HP share ≥ hp_ratio has 庇护 damage_resistance (the common 庇护: the strongest counts); checked every 0.1 s (trigger interval, PRTS 备注), gone out of range.
// - S1 大地的慈悲: ATK +atk, no end of its own (`lifeTimeType` 2): auto battle never closes it. S2 生灵的回响: ASPD +attack_speed, each heal gives its target +sp SP (demkni_t_2: ON_OUTPUT_MODIFIER, IsHeal).

import { num, talentBb, traitBb, skillRec, up, giveSp, holdProtect } from '../shared/tier1.js';
import { COLS } from '../../../constants.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */

const S1 = 'skchr_quercu_1';
const S2 = 'skchr_quercu_2';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const CHECK = 0.1;

/** @type {KitFns} */
export default {
  char_492_quercu: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const heal = Object.freeze({ dmgType: 'heal', heal: { mode: 'single' }, healScale: num(tb.heal_scale, 0.75), maxTargets: 1 });
    return {
      skills: {
        [S1]: { kind: 'toggle', mods: { atkPct: num(b1.atk) }, attack: heal },
        [S2]: { kind: 'duration', mods: { aspd: num(b2.attack_speed) }, attack: heal },
      },
      talents: [
        { install(battle, unit) {
          const ratio = num(t0.hp_ratio), v = num(t0.damage_resistance);
          if (!(v > 0)) return;
          battle.every(CHECK, () => {
            if (!up(unit)) return;
            const keys = unit.rangeKeySet ?? new Set(unit.rangeKeys);
            for (const a of battle.allyUnits) {
              if (!up(a) || a.hidden || !keys.has(a.tileR * COLS + a.tileC)) continue;
              if (a.hp / a.s.maxHp + 1e-9 >= ratio) holdProtect(battle, a, v, CHECK + battle.dt, unit);
            }
          }, { owner: unit, immediate: true });
        } },
        { install(battle, unit) {
          const sp = num(b2.sp);
          battle.on('heal', (c) => {
            if (c.source !== unit || c.opts?.regen || unit.skill?.id !== S2 || !unit.skill.active || !(sp > 0)) return;
            giveSp(c.target, sp, 'talent');
          }, { owner: unit });
        } },
      ],
    };
  },
};

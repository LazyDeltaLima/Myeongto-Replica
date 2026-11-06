// server/sim/content/kits/ops/op-pianst.js — 车尔尼 (char_4047_pianst) kit: 5★ 驭法铁卫 (重装), a tier-3 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 디아만테·리프레사·체르니·아오스타」); both skills, the talent, the trait and AST-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, AST-X stage 1.
// Sources: the record's tables; PRTS 车尔尼 (备注 of T1 and S2); charpack char_4047_pianst (Talents/1, Modes/S1, S2, Empty), skill prefabs skchr_pianst_1 / _2,
// buff_template_data pianst_t_1, pianst_s_2_buff_2, common_damage_on_take_damage, common_damage_on_output_damage.
// - Trait: her attacks deal arts while a skill runs (modes S1 and S2 `_damageType` 2).
// - T1 回声 (pianst_t_1): RES +magic_resistance; an arts damage of attack type NORMAL or SPLASH she takes gives its source atk_scale × her ATK arts.
// - S1 纷飞十指: ATK +atk, RES ×(1 + magic_resistance).
// - S2 曲惊四座: max HP +max_hp, taunt +taunt_level (pianst_s_2_buff_1). Each damage of attack type NORMAL or SPLASH, of any damage type, adds ATK +atk up to
//   max_stack_cnt, after T1 (PRTS). At `interval` s (pianst_s_2_buff_2 ON_BUFF_TRIGGER, PRTS 18.6 s) mode Empty, which never attacks, and FinalAttack if she can
//   act then (`_checkCanUseAblityFlag`): after `_preDelay` 0.5 s atk_scale × ATK arts on all, flying too, in x-1.
// - AST-X (common_damage_on_*): while a skill runs her attacks and each enemy damage she takes give the other side atk_scale × her ATK arts more.

import { num, talentBb, traitBb, skillRec, byEnemyAttack, statBuff } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';

const S1 = 'skchr_pianst_1';
const S2 = 'skchr_pianst_2';
const STACK = 'pianst_s_2_buff[atk_boost]';
/** FinalAttack `_preDelay`. */
export const FINAL_DELAY = 0.5;
/** range_table x-1, FinalAttack's ConstBoxRange. */
const X1 = Object.freeze([[2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, -1], [-1, 0], [-1, 1], [-2, 0]]);
const ALL = Object.freeze({ canHitFly: true });
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_4047_pianst: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const echo = num(t0.atk_scale), extra = num(tb.atk_scale);
    const arts = (battle, unit, e, amount, tags, moment) => battle.dealDamage(unit, e, { amount, type: 'arts', tags, ...(moment ? { moment } : {}) });
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk), resMul: 1 + num(b1.magic_resistance) }, attack: { dmgType: 'arts' } },
        [S2]: {
          kind: 'duration',
          mods: { hpPct: num(b2.max_hp), taunt: num(b2.taunt_level) },
          attack: { dmgType: 'arts' },
          onStart({ battle, unit, skill }) {
            const at = battle.time;
            unit.mem.pianstCast = at;
            const still = () => unit.skill === skill && skill.active && unit.mem.pianstCast === at;
            battle.after(num(b2.interval), () => {
              if (!still()) return;
              unit.skillStateUntil = at + skill.duration;
              if (!unit.canAct) return;
              battle.after(FINAL_DELAY, () => {
                if (!still() || !unit.canAct) return;
                const keys = absoluteRangeKeys(X1, unit.tileR, unit.tileC, unit.dir, 0);
                for (const e of battle.enemiesInKeys(keys, unit, ALL)) battle.dealDamage(unit, e, { amount: unit.s.atk * num(b2.atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill', 'pianst:final'] });
              }, { owner: unit });
            }, { owner: unit });
          },
          onEnd({ battle, unit }) { battle.removeBuff(unit, STACK); },
        },
      },
      talents: [{ install(battle, unit) {
        const res = num(t0.magic_resistance);
        if (res) statBuff(battle, unit, 'pianst_t_1', { resFlat: res });
        battle.on('damaged', (c) => {
          if (c.target !== unit || !unit.alive || !byEnemyAttack(c)) return;
          const attack = !!(c.dmg.isAttack || c.dmg.isSplash), src = c.source, sk = unit.skill;
          if (attack && c.type === 'arts' && echo > 0 && src.alive) arts(battle, unit, src, unit.s.atk * echo, ['talent', 'counter'], 'pianst_t_1');
          if (attack && sk?.active && sk.id === S2) {
            battle.addBuff(unit, { key: STACK, refresh: 'stack', maxStacks: Math.max(1, num(b2.max_stack_cnt, 10)), mods: { atkPct: num(b2.atk) }, tags: ['skill'] });
          }
          if (extra > 0 && sk?.active && src.alive) arts(battle, unit, src, unit.s.atk * extra, ['counter']);
        }, { owner: unit });
      } }],
      install(battle, unit) {
        if (!(extra > 0)) return;
        battle.on('damaged', (c) => {
          if (c.source !== unit || !unit.skill?.active || !c.dmg?.isAttack || c.target?.side !== 'enemy' || !c.target.alive) return;
          arts(battle, unit, c.target, unit.s.atk * extra, ['counter']);
        }, { owner: unit });
      },
    };
  },
};

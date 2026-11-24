// server/sim/content/kits/ops/op-pianst.js — 车尔尼 (char_4047_pianst) kit: 5★ 驭法铁卫 (重装), a tier-3 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 디아만테·리프레사·체르니·아오스타」); both skills, the talent, the trait and AST-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, AST-X stage 1.
// Sources: the record's tables; PRTS 车尔尼 (备注 of T1 and S2); charpack char_4047_pianst (Talents/1, Modes/S1, S2, Empty), skill prefabs skchr_pianst_1 / _2,
// buff_template_data pianst_t_1, pianst_s_2_buff_2, common_damage_on_take_damage, common_damage_on_output_damage.
// - Trait: her attacks deal arts while a skill runs (modes S1 and S2 `_damageType` 2).
// - T1 回声 (pianst_t_1): RES +magic_resistance; an arts damage of attack type NORMAL or SPLASH she takes gives its source atk_scale × her ATK arts.
// - S1 纷飞十指: ATK +atk, RES ×(1 + magic_resistance).
// - S2 曲惊四座: max HP +max_hp, taunt +taunt_level (pianst_s_2_buff_1). Each damage of attack type NORMAL or SPLASH, of any damage type, adds ATK +atk up to
//   max_stack_cnt, after T1 (PRTS). At `interval` s (pianst_s_2_buff_2 ON_BUFF_TRIGGER, PRTS 18.6 s) mode Empty, which never attacks, and FinalAttack if she can
//   act then (`_checkCanUseAblityFlag`): after `_preDelay` 0.5 s atk_scale × ATK arts on all, flying too, in x-1. Its clip Skill_2_End
//   takes her animator: the swing under way strikes on its OnAttack (FINAL_EVENT) or at its own attack time's end, whichever is first.
// - AST-X (common_damage_on_*): while a skill runs her attacks and each enemy damage she takes give the other side atk_scale × her ATK arts more.

import { num, talentBb, traitBb, skillRec, byEnemyAttack, statBuff } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */

const S1 = 'skchr_pianst_1';
const S2 = 'skchr_pianst_2';
const STACK = 'pianst_s_2_buff[atk_boost]';
const STACK_FX = Object.freeze(['pianst_s_2_stkFx_1', 'pianst_s_2_stkFx_2', 'pianst_s_2_stkFx_3']);
/** FinalAttack `_preDelay`. */
export const FINAL_DELAY = 0.5;
/** Its clip Skill_2_End, seconds. */
const FINAL_CLIP = 1.567;
/** That clip's OnAttack event, seconds from its start. */
export const FINAL_EVENT = 0.533;
/** range_table x-1, FinalAttack's ConstBoxRange. */
const X1 = Object.freeze([[2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, -1], [-1, 0], [-1, 1], [-2, 0]]);
const ALL = Object.freeze({ canHitFly: true });
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_4047_pianst: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const echo = num(t0.atk_scale), extra = num(tb.atk_scale);
    /** @param {Battle} battle @param {Unit} unit @param {Unit} e @param {number} amount @param {string[]} tags @param {string} [moment] */
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
              // The S2 swing under way strikes on: the switch to Empty detaches its ability without interrupting it
              // (`_interruptAbilityOnDetach` 0) and the restarted state machine cuts only the new mode's attack. But FinalAttack's
              // cast (TriggerAbility → CastDirectly → OnCastStart) takes her animator for its clip, so that swing gets no OnAttack
              // of its own clip: it strikes on the next OnAttack event of hers — Skill_2_End's, FINAL_EVENT on — or at the end of
              // its attack time when that is sooner (EasyToStartAbility.WaitForNextEvent; docs/rules/sim.md 「즉발 스킬의 시전」)
              if (unit.swing && !unit.swing.replace) unit.swing.left = Math.min(Math.max(unit.swing.left, unit.castLeft), FINAL_EVENT);
              // FinalAttack's cast: its clip Skill_2_End and `_castEffects` (ON_CAST_START) from here, not from the skill's end
              battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, src: unit.id, k: 'pianst:final', signal: 'final', t: FINAL_CLIP });
              battle.after(FINAL_DELAY, () => {
                if (!still() || !unit.canAct) return;
                const keys = absoluteRangeKeys(X1, unit.tileR, unit.tileC, unit.dir, 0);
                skill.castHit();   // (the damage after it is FinalAttack's, no attack's hit)
                for (const e of battle.enemiesInKeys(keys, unit, ALL)) {
                  battle.fx('kitHit', { x: e.x, y: e.y, id: unit.id, src: unit.id, tgt: e.id, k: 'pianst:finalHit' });
                  battle.dealDamage(unit, e, { amount: unit.s.atk * num(b2.atk_scale, 1), type: 'arts', isSkill: true, tags: ['skill', 'pianst:final'] });
                }
              }, { owner: unit });
            }, { owner: unit });
          },
          onEnd({ battle, unit }) { battle.removeBuff(unit, STACK); for (const k of STACK_FX) battle.removeBuff(unit, k); },
        },
      },
      talents: [{ install(battle, unit) {
        const res = num(t0.magic_resistance);
        if (res) statBuff(battle, unit, 'pianst_t_1', { resFlat: res });
        battle.on('damaged', (c) => {
          if (c.target !== unit || !unit.alive || !byEnemyAttack(c)) return;
          const attack = !!(/** @type {Record<string, any>} */ (c.dmg).isAttack || /** @type {Record<string, any>} */ (c.dmg).isSplash), src = /** @type {Unit} */ (c.source), sk = unit.skill;
          if (attack && c.type === 'arts' && echo > 0 && src.alive) {
            battle.fx('kitHit', { x: src.x, y: src.y, id: unit.id, src: unit.id, tgt: src.id, k: 'pianst:echo' });   // pianst_beidong_hit on the attacker (pianst_t_1)
            arts(battle, unit, src, unit.s.atk * echo, ['talent', 'counter'], 'pianst_t_1');
          }
          if (attack && sk?.active && sk.id === S2) {
            const n = battle.addBuff(unit, { key: STACK, refresh: 'stack', maxStacks: Math.max(1, num(b2.max_stack_cnt, 10)), mods: { atkPct: num(b2.atk) }, tags: ['skill'] })?.stacks;
            // pianst_s_2_buff_2: at 1 stack, at fxbound_1 and at fxbound_2 a held buff of its own effect, for the rest of the skill
            const fx = n === 1 ? STACK_FX[0] : n === num(b2.pianst_s_2_fxbound_1) ? STACK_FX[1] : n === num(b2.pianst_s_2_fxbound_2) ? STACK_FX[2] : null;
            if (fx) battle.addBuff(unit, { key: fx, visible: true, tags: ['skill'] });
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

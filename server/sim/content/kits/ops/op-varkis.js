// server/sim/content/kits/ops/op-varkis.js — 摆渡人 (char_4166_varkis) kit: 5★ 百夫长 (近卫), a tier-1 piece of 规程 (act3autochess) (shared/seasons.js `act3autochess`,
// docs/rules/diy.md 「새 시즌 팽 더 파이어 샤픈드·폰사이러스·프로스트리프·바르카리스」); both skills, the talent and CEN-Y in both forms. The trait is the branch's (attacks every blocked enemy).
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv55, skills at rank 4, no module; elite = E2 Lv50, rank 7, CEN-Y stage 1.
// Sources: the record's tables; PRTS 摆渡人 (备注 of T1, S2); charpack char_4166_varkis (Talents/1, Modes/S2), skill prefabs skchr_varkis_1 / _2 (S2Passive), buff_template_data varkis_t1[minos_atk_up],
// varkis_s2[shield], varkis_s2[shield_core], varkis_s2[attack_add_hp], varkis_e_002_trait.
// - T1 永志不忘 (an aura on the allies tagged minos, she too: varkis_t1[minos_atk_up] ON_CALCULATE_DAMAGE, AtkScaleUp `_applyWay` NONE): while she stands, each damage of an operator of 米诺斯 on an
//   enemy whose HP share is not above the operator's own has its ATK ×talent_atk_scale (before DEF; PRTS 备注: read at each damage). Several of her: the buffs of one key queue and only the first runs (Buff.OverrideGroup, overrideType DEFAULT); the
//   template has no priority of its own, so the queue is by age, not by value: the one placed first counts, whatever its value, and the next one takes over when it leaves.
//   Which aura enters first (official client, GlobalAuraAbility): her talent attaches in Character.OnInit, where DoAttach deals every unit already born, then listens to
//   ON_UNIT_BORN (Unit.OnBorn emits it after registering the unit) and deals each newcomer at once; the listeners run in the order they were added. So the earlier
//   placed one's buff comes first on every target: those standing, a piece placed after both, and the later one herself (her own aura cannot see her at its attach).
// - CEN-Y: above hp_ratio HP, physical damage taken ×(1 − damage_resistance) (varkis_e_002_trait ON_TAKE_DAMAGE).
// - S1 奔流 (ReplacementSkill, MultiMeleeAttack `_additionalTimes` 2, `_waitAttackEventForAllAttacks`): her next attack at atk_scale strikes three times, at the OnAttack frames of its clip Skill, each
//   target it picked (her blocked ones) while it lives and she can act.
// - S2 同胞的意志 (`_switchToState` 1, `_beginAnim` Skill_2_Begin S2_BEGIN s: it cuts her swing, no attack during it, the duration runs after it): attacks at attack@s2_atk_scale, each attack heals her
//   attack@hp_ratio of max HP (ON_SPELL_ON, once per attack; PRTS 备注 "攻击必定进行治疗"). While it runs a heal on her, 生命复原 aside, may overflow into the 屏障 (ON_APPLYING_MODIFIER
//   HEAL_CAN_GENERAL_SHIELD, ON_ES_OVER_ZERO), up to max_hp_ratio of max HP. The 屏障 is spent last (priority −1000, PRTS 备注) and stays after the skill: outside it −dynamic_dec_per_sec each second
//   (trigger interval 1 s from her deployment).

import { num, talentBb, traitBb, skillRec, up } from '../shared/tier1.js';
import { hasPower } from '../shared/powers.js';
import { resolveHit } from '../../../ai.js';
/** @import { KitFns, KitChess } from '../shared/tier1.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { SkillCtx } from '../../../skills.js' */
/** @import { BuffRec } from '../../bonds/shared.js' */

const S1 = 'skchr_varkis_1';
const S2 = 'skchr_varkis_2';
const SHIELD = 'varkis_s2[shield_core]';
const MINOS = 'minos';
/** Skill's OnAttack frames (0.467, 0.5, 0.533) after the first, the clip at its own speed (s). */
export const S1_STRIKES = Object.freeze([0.033, 0.067]);
/** Skill_2_Begin's length (s): the engine waits it out before S2 starts (data `cast.begin`, skills.js beginTime). */
export const S2_BEGIN = 0.333;
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_4166_varkis: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    /** @param {SkillCtx} ctx */
    const moreStrikes = ({ battle, unit, target }) => {
      if (!target) return;
      const prof = { ...battle.effectiveProfile(unit), skillOnHit: null };
      const attackId = battle._attackSeq, seq = unit.deploySeq;
      for (const t of S1_STRIKES) {
        battle.after(t, (b) => {
          if (!target.alive || !unit.alive || !unit.deployed || unit.deploySeq !== seq || !unit.canAct) return;
          resolveHit(b, unit, prof, target, { isSkill: true, index: 0, attackId }, target.x, target.y);
        }, { owner: unit });
      }
    };
    /** @param {Unit} u */
    const on2 = (u) => u.skill?.id === S2 && u.skill.active;
    return {
      skills: {
        [S1]: { kind: 'instant', attack: { atkScale: num(b1.atk_scale, 1), onHit: moreStrikes } },
        [S2]: {
          kind: 'duration',
          attack: {
            atkScale: num(b2['attack@s2_atk_scale'], 1),
            afterAttack(battle, unit) { battle.heal(unit, unit, unit.s.maxHp * num(b2['attack@hp_ratio']), { self: true }); },
          },
        },
      },
      talents: [
        { install(battle, unit) {
          const sc = num(t0.talent_atk_scale, 1);
          if (sc === 1) return;
          battle.on('hit', (c) => {
            const s = c.source;
            if (!up(unit) || !s || s.side !== 'ally' || s.kind !== 'op' || !hasPower(s, MINOS) || c.target?.side !== 'enemy') return;
            if (c.target.hpRatio > s.hpRatio + 1e-9 || c.dmg.varkisSeq <= unit.deploySeq) return;
            c.dmg.amount *= sc / (c.dmg.varkisScale ?? 1);
            c.dmg.varkisScale = sc;
            c.dmg.varkisSeq = unit.deploySeq;
          }, { owner: unit });
        } },
        { install(battle, unit) {
          const hr = num(tb.hp_ratio), dr = num(tb.damage_resistance);
          if (dr > 0) {
            battle.on('hit', (c) => {
              if (c.target === unit && c.dmg.type === 'phys' && unit.hpRatio > hr + 1e-9) c.dmg.mul *= 1 - dr;
            }, { owner: unit });
          }
          const cap = num(b2.max_hp_ratio, 1), dec = num(b2.dynamic_dec_per_sec);
          // after every other heal handler: the amount that lands
          battle.on('heal', (c) => {
            if (c.target !== unit || !on2(unit) || c.opts?.regen) return;
            const over = c.amount - (unit.s.maxHp - unit.hp);
            if (!(over > 0)) return;
            const max = unit.s.maxHp * cap, cur = /** @type {BuffRec | null} */ (unit.findBuff(SHIELD));
            if (cur) { cur.shield = Math.min(max, cur.shield + over); unit.markDirty(); } else battle.addBuff(unit, { key: SHIELD, shield: Math.min(max, over), shieldLast: true, blockFx: true, visible: true, tags: ['skill'] });
          }, { owner: unit, priority: -1000 });
          battle.every(1, () => {
            const cur = up(unit) && !on2(unit) ? /** @type {BuffRec | null} */ (unit.findBuff(SHIELD)) : null;
            if (!cur) return;
            cur.shield = Math.max(0, cur.shield - dec);
            if (cur.shield <= 1e-9) battle.removeBuff(unit, SHIELD); else unit.markDirty();
          }, { owner: unit });
        } },
      ],
    };
  },
};

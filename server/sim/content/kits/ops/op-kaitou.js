// server/sim/content/kits/ops/op-kaitou.js — 折光 (char_499_kaitou) kit: 5★ 本源术师 (术师), a tier-2 piece of 规程 (act3autochess)
// (shared/seasons.js `act3autochess`, docs/rules/diy.md 「새 시즌 디아만테·리프레사·체르니·아오스타」); both skills, the talent and PRI-X in both forms.
//
// Forms (data/seasons/act3autochess/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, PRI-X stage 1.
// Sources: the record's tables; charpack char_499_kaitou (Talents/1, Modes/S1, Modes/S2), skill prefabs skchr_kaitou_1 / _2,
// buff_template_data kaitou_t_1[check_ep], kaitou_s_1[ep_damage], kaitou_s_2[ep_damage], kaitou_e_002_tr[dmg_up], ep_damage_based_on_damage_value.
// - T1 预先告知 (AuraAbility over her range, `ignoreTargetFree`): ATK +atk while an enemy in her range is in its 凋亡损伤 burst; one buff however many.
// - S1 镭射穿凿: ATK +atk, mode S1. A hit adds attack@ep_damage_ratio of its damage as 凋亡损伤 (ActiveEP, element DARK) and, on a target in
//   its burst before that hit, attack@extra_ep_damage_scale × ATK of element damage (`_activeBuffs` kaitou_s_1[ep_damage], while the skill runs).
// - S2 热处理变色: ASPD +attack_speed, mode S2, whose selector `_maxNum` is 2; the same extra damage (kaitou_s_2[ep_damage]), no 凋亡损伤 of its own.
// - PRI-X: × damage_scale on all she deals to an enemy in an element burst (trait; kaitou_e_002_tr[dmg_up]).

import { hasHp } from '../../../damage.js';
import { num, talentBb, traitBb, skillRec, up, toggleBuff } from '../shared/tier1.js';
import { inRange, burstDamageUp } from '../shared/tier5.js';
/** @import { KitFns, KitChess, DmgRec } from '../shared/tier1.js' */
/** @import { SkillRuntime } from '../../../skills.js' */
/** @import { HitEv, DamagedEv } from '../../support/index.js' */

const S1 = 'skchr_kaitou_1';
const S2 = 'skchr_kaitou_2';
const BURST = 'apoptosisBurst';
/** @param {KitChess} chess @param {string} id */
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

/** @type {KitFns} */
export default {
  char_499_kaitou: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const ratio = num(b1['attack@ep_damage_ratio']);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk) } },
        [S2]: { kind: 'duration', mods: { aspd: num(b2.attack_speed) }, targeting: { maxTargets: 2 } },
      },
      talents: [{ install(battle, unit) {
        const atk = num(t0.atk);
        if (!atk) return;
        toggleBuff(battle, unit, 'kaitou_t_1[atk]', () => battle.enemies.some((e) => e.alive && e.findBuff(BURST) && inRange(unit, e)), { atkPct: atk });
      } }],
      install(battle, unit) {
        burstDamageUp(battle, unit, num(tb.damage_scale));
        // the hit's `_activeBuffs` come before its damage (Projectile.ActionController.OnHitTarget: _AttachBuffs, then _RunActions): the burst is read before the hit
        /** @param {HitEv | DamagedEv} c */
        const hitOf = (c) => c.source === unit && !!unit.skill?.active && !!c.dmg?.isAttack && c.target?.side === 'enemy';
        battle.on('hit', (c) => { if (hitOf(c)) c.dmg.kaitouBurst = !!c.target.findBuff(BURST); }, { owner: unit, priority: 20 });
        battle.on('damaged', (c) => {
          if (!hitOf(c)) return;
          const e = c.target, s1 = /** @type {SkillRuntime} */ (unit.skill).id === S1;
          // (not on a killing blow: the target is at 0 HP here, no burst on the corpse)
          if (s1 && ratio > 0 && c.amount > 0 && hasHp(e)) battle.dealDamage(unit, e, { type: 'element', element: 'apoptosis', amount: c.amount * ratio, tags: ['skill', 'kaitou'] });
          const extra = num((s1 ? b1 : b2)['attack@extra_ep_damage_scale']);
          if (/** @type {DmgRec} */ (c.dmg).kaitouBurst && extra > 0 && e.alive && up(unit)) {
            battle.dealDamage(unit, e, { amount: unit.s.atk * extra, type: 'elemental', element: 'apoptosis', canDodge: false, tags: ['element', 'kaitou'], moment: s1 ? 'kaitou_s_1[ep_damage]' : 'kaitou_s_2[ep_damage]' });
          }
        }, { owner: unit });
      },
    };
  },
};

// server/sim/content/kits/ops/op-christ.js — Miss.Christine (char_4198_christ) kit: 5★ 本源术师 (术师), a tier-2 piece of the season not out yet
// (shared/seasons.js `next`, docs/rules/diy.md 「새 시즌 무스·미스 크리스틴·브리지드·오로라」); both skills, the talent and PRI-X in both forms.
//
// Forms (data/seasons/next/chess.json): normal = E1 Lv60, skills at rank 4, no module; elite = E2 Lv55, rank 7, PRI-X stage 1.
// Sources: the record's tables; PRTS Miss.Christine (备注 of T1, S2); charpack char_4198_christ (Others/Direction/Talents/1, Modes/S1, Modes/S2), skill prefabs
// skchr_christ_1 / _2, projectile_chr_christ_s2, buff_template_data christ_t_1[damage], christ_s_2, ep_damage_based_on_damage_value.
// - T1 诱人美馔 (AuraAbility over her range, christ_t_1[damage] per Christine): an enemy in her range going PALSYING takes atk_scale × her ATK of element damage. PRTS: "触发麻痹时"
//   is an attack interrupted by 麻痹, not gaining it: the engine hook palsyTrigger.
// - S1 自由用餐礼仪: ATK +atk, attack@max_target targets; a hit adds attack@ep_damage_ratio of its damage as 神经损伤 (ActiveEP, element SANITY).
// - S2 狂饮之宴 (ProjectileToTileAbility, `_preDelay` 0.267, no attack in mode S2): a spirit flies to her target's tile (PARACURVE, 8 tiles/s; `_fixOnProjectileReached`) and from its
//   arrival (SelectorHitBehaviour: `_hitPasserby` off, nothing on the way) every `interval` s hits all around it within projectile_range (PRTS 1.5): atk_scale × ATK arts, plus
//   atk_scale_ep × ATK element damage on one in its 神经 burst (christ_s_2, IsTargetInEPBreakRecovery SANITY). It stays projectile_delay_time s, whether she stands or not (`_stopWhenSourceInvalid` off).
// - PRI-X: × damage_scale on all she deals to an enemy in an element burst (trait).

import { hasHp } from '../../../damage.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { hypot } from '../../../detmath.js';
import { num, talentBb, traitBb, skillRec, up, makeZone } from '../shared/tier1.js';
import { inRange, burstDamageUp } from '../shared/tier5.js';

const S1 = 'skchr_christ_1';
const S2 = 'skchr_christ_2';
const BURST = 'neuralBurst';
/** skchr_christ_2 ProjectileToTileAbility `_preDelay`. */
export const S2_PRE_DELAY = 0.2667;
/** projectile_chr_christ_s2 `_speed`. */
export const SPIRIT_SPEED = 8;
const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};

export default {
  char_4198_christ: (bb, chess) => {
    const t0 = talentBb(chess, 0), tb = traitBb(chess), b1 = bbOf(chess, S1), b2 = bbOf(chess, S2);
    const ratio = num(b1['attack@ep_damage_ratio']), talent = num(t0.atk_scale);
    return {
      skills: {
        [S1]: { kind: 'duration', mods: { atkPct: num(b1.atk) }, targeting: { maxTargets: num(b1['attack@max_target'], 1) } },
        [S2]: {
          kind: 'duration', attack: { noAttack: true },
          onStart({ battle, unit, skill }) {
            const seq = skill.activations;
            battle.after(S2_PRE_DELAY, () => {
              if (!up(unit) || !skill.active || skill.activations !== seq) return;
              const t = sortEnemyTargets(battle, unit, battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile), unit.profile.priority)[0];
              if (!t) return;
              const x = Math.round(t.x), y = Math.round(t.y);
              const r = num(b2.projectile_range), scale = num(b2.atk_scale), ep = num(b2.atk_scale_ep);
              battle.after(hypot(x - unit.x, y - unit.y) / SPIRIT_SPEED, () => {
                makeZone(battle, unit, {
                  x, y, radius: r, duration: num(b2.projectile_delay_time), interval: num(b2.interval, 1), skill: 'christ',
                  onPulse(b) {
                    // SelectorHitBehaviour `_playAudioWhenSelect`: each tick before it looks for targets, enemies or none
                    b.fx('kitHit', { x, y, id: unit.id, k: 'christ:s2tick' });
                    for (const e of b.foesInRadius(x, y, r, true)) {
                      // the hit's `_activeBuffs` come before its damage (Projectile.ActionController.OnHitTarget)
                      if (ep > 0 && e.findBuff(BURST)) b.dealDamage(unit, e, { amount: unit.s.atk * ep, type: 'elemental', element: 'neural', canDodge: false, tags: ['element', 'christ'] });
                      if (e.alive) b.dealDamage(unit, e, { amount: unit.s.atk * scale, type: 'arts', isAttack: true, isSkill: true, tags: ['skill', 'christ:spirit'] });
                    }
                  },
                });
              }, { owner: unit });
            }, { owner: unit });
          },
        },
      },
      talents: [{ install(battle, unit) {
        // the aura ability's `_effects` on her from its attach (AuraAbility.DoAttach): christ_buff_01 while she stands
        battle.on('deploy', (ctx) => { if (ctx.unit === unit) battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'christ:aura' }); }, { owner: unit });
        if (!(talent > 0)) return;
        battle.on('palsyTrigger', (ctx) => {
          const e = ctx.enemy;
          if (!up(unit) || !hasHp(e) || !inRange(unit, e)) return;
          battle.dealDamage(unit, e, { amount: unit.s.atk * talent, type: 'elemental', element: 'neural', canDodge: false, tags: ['talent', 'christ'], moment: 'christ_t_1[damage]' });
        }, { owner: unit });
      } }],
      install(battle, unit) {
        burstDamageUp(battle, unit, num(tb.damage_scale));
        battle.on('damaged', (c) => {
          if (c.source !== unit || !c.dmg?.isAttack || c.target?.side !== 'enemy' || unit.skill?.id !== S1 || !unit.skill.active) return;
          // (not on a killing blow: the target is at 0 HP here, no burst on the corpse)
          if (ratio > 0 && c.amount > 0 && hasHp(c.target)) battle.dealDamage(unit, c.target, { type: 'element', element: 'neural', amount: c.amount * ratio, tags: ['skill', 'christ'] });
        }, { owner: unit });
      },
    };
  },
};

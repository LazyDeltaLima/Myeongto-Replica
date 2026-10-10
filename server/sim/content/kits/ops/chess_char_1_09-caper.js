// server/sim/content/kits/ops/chess_char_1_09-caper.js — 跃跃 (char_4100_caper) kit, tier 1.
// Conventions of the tier-1 kits: ../shared/tier1.js; kit contract and rules: ../README.md.

import { num, talentBb, traitBb, cheb, onHitBy, skillBbOf } from '../shared/tier1.js';
import { throwBoomerang } from '../../../ai.js';

/** 乐趣加倍's later boomerangs (client `_triggerDelta`, s). */
const S2_TRIGGER_DELTA = 0.1;

/**
 * Attack-profile `afterAttack` of 乐趣加倍: `extra` more boomerangs at each target of the attack, S2_TRIGGER_DELTA apart,
 * each one hit of this attack (same attackId) — a target dead by then, or a thrower stunned / gone, gets none.
 */
function extraBoomerangs(extra) {
  if (!(extra > 0)) return undefined;
  return (battle, unit, targets) => {
    const prof = battle.effectiveProfile(unit);
    const attackId = battle._attackSeq;   // the attack just performed (performAttack numbers it)
    const seq = unit.deploySeq;
    for (let n = 1; n <= extra; n++) {
      battle.after(S2_TRIGGER_DELTA * n, (b) => {
        if (!unit.alive || !unit.deployed || unit.deploySeq !== seq || !unit.canAct) return;
        targets.forEach((t, index) => {
          if (!t || !t.alive || !(t.side === 'enemy' || b.isAllyTarget(t))) return;
          b.fx('caperBoomerang2', { x: unit.x, y: unit.y, id: unit.id, tgt: t.id, n });
          throwBoomerang(b, unit, prof, t, { isSkill: true, index, attackId, energy: 0 });
        });
      }, { owner: unit });
    }
  };
}

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 1_09 跃跃 (回环射手: every attack is a boomerang out to the target and back — she attacks again only once it is
  // caught, professions.js loopshooter / ai.js throwBoomerang). 乐趣加倍: ATK +atk, each attack throws `cnt` boomerangs
  // ("每次攻击额外发射1个回旋投射物"): EN client charpack char_4100_caper Modes/S2/Body/Attack — projectile_chr_caper_s2 at
  // the attack, then `_additionalTimes` 1 more, projectile_chr_caper_s2_1 (`_inverseParacurve`: the opposite arc),
  // `_triggerDelta` 0.1 s later at the same target (`_selectTargetTiming` 0; not thrown once it is dead — client code
  // AbilityStandard.DoCastOnTargets casts on living targets only); each hits once (`_maxHitNum` 1) and comes back on
  // its own; she attacks again once all are back ("必须回收全部回旋投掷物才可以进行下一次攻击"). Until 2026-10-10 one
  // boomerang carried cnt hits. The later throws fire fx 'caperBoomerang2' { id, tgt, n } (no 'atk' event: no new
  // attack clip). 戏耍随心: prob per hit (each boomerang on its own) for ATK ×atk_scale. Elite module (LPS-X, trait
  // atk_scale): vs enemies on the 8 surrounding tiles ATK ×atk_scale.
  // Alternate S1 强力击·β型 (AUTO, attack SP): the next attack at atk_scale × ATK.
  chess_char_1_09_a: (bb, chess) => {
    const t = talentBb(chess, 0);
    const near = num(traitBb(chess).atk_scale, 1);
    return {
      skill: { kind: 'duration', mods: { atkPct: num(bb.atk) }, attack: { afterAttack: extraBoomerangs(Math.max(1, Math.floor(num(bb.cnt, 1))) - 1) } },
      skills: { skchr_caper_1: { kind: 'instant', attack: { atkScale: num(skillBbOf(chess, 'skchr_caper_1').atk_scale, 1) } } },
      talents: [{ install(battle, unit) {
        onHitBy(battle, unit, ({ target, dmg }) => {
          if (!dmg.isAttack) return;
          if (near !== 1 && cheb(unit, target) <= 1) dmg.amount *= near;
          if (!dmg.isSplash && num(t.prob) > 0 && battle.rng.chance(num(t.prob))) {
            dmg.amount *= num(t.atk_scale, 1);
            battle.fx('crit', { x: target.x, y: target.y, id: unit.id });
          }
        });
      } }],
    };
  },
};

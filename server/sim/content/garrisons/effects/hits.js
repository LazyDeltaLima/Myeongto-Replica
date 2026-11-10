// server/sim/content/garrisons/effects/hits.js — the hit-modifier 特质: ATK × vs tagged enemies
// (act1autochess_gar_eff_attack_enemy), the layer-scaled damage on bound / sluggish targets
// (act2autochess_gar_eff_ab_damageScaleByBond, its steps set by the layer readers of effects/stats.js) and 弱点伤害
// (act1autochess_gar_eff_chaos).

import * as S from '../../support/index.js';
import { mitigate } from '../../../damage.js';
import { EMPTY } from '../shared.js';

/** The effect keys installHitMods reads. */
export const HIT_KEYS = Object.freeze(['act1autochess_gar_eff_attack_enemy', 'act2autochess_gar_eff_ab_damageScaleByBond', 'act1autochess_gar_eff_chaos']);

/**
 * 弱点伤害 (research 04 §glossary: "each hit is dealt as whichever of physical/arts yields MORE damage against that
 * target's DEF/RES"): the 理论伤害 of each type — the engine's mitigation formula incl. the attacker's DEF/RES ignore
 * stats, and nothing else; a tie keeps the original type. The official client's WeakDamage compares penetration + the
 * base formula only, and PRTS 术语释义 counts ATK, its multipliers and additions, penetration and the target's
 * DEF / RES, "不计入…任何伤判效果": the dealt / taken multipliers (physDealtMul, artsTakenMul …) never choose the type.
 */
export function weaknessType(source, target, dmg) {
  const ss = source && source.s ? source.s : null;
  const ign = {
    defIgnorePct: S.num(dmg.defIgnorePct, 0) + (ss ? S.num(ss.defIgnorePct, 0) : 0),
    defIgnoreFlat: S.num(dmg.defIgnoreFlat, 0) + (ss ? S.num(ss.defIgnoreFlat, 0) : 0),
    resIgnorePct: S.num(dmg.resIgnorePct, 0) + (ss ? S.num(ss.resIgnorePct, 0) : 0),
    resIgnoreFlat: S.num(dmg.resIgnoreFlat, 0) + (ss ? S.num(ss.resIgnoreFlat, 0) : 0),
  };
  const ph = mitigate(dmg.amount, 'phys', target.s, ign);
  const ar = mitigate(dmg.amount, 'arts', target.s, ign);
  if (ar > ph + 1e-9) return 'arts';
  if (ph > ar + 1e-9) return 'phys';
  return dmg.type;
}
const bound = (t) => !!(t.s && t.s.flags && t.s.flags.bind) || !!t.findBuff('bind');

/** Priority of the 弱点伤害 conversion: after every default-priority hit modifier, so the final amount decides. */
export const WEAKNESS_PRIORITY = -10;

export function installHitMods(battle, by) {
  const m = new Map();
  const push = (it, kind) => {
    let a = m.get(it.unit);
    if (!a) { a = []; m.set(it.unit, a); }
    a.push({ it, kind });
  };
  for (const it of by.get('act1autochess_gar_eff_attack_enemy') ?? EMPTY) push(it, 'tag');
  for (const it of by.get('act2autochess_gar_eff_ab_damageScaleByBond') ?? EMPTY) push(it, 'ab');
  if (m.size) {
    battle.on('hit', ({ source, target, dmg }) => {
      const arr = source ? m.get(source) : null;
      if (!arr || !target || target.side !== 'enemy' || !dmg || dmg.type === 'element') return;
      for (let i = 0; i < arr.length; i++) {
        const { it, kind } = arr[i];
        if (kind === 'tag') {
          // an ATK multiplier: fixed-value DoT ticks are not ATK-based
          if (Array.isArray(dmg.tags) && dmg.tags.includes('dot')) continue;
          const tags = target.def && target.def.tags;
          if (Array.isArray(tags) && tags.includes(it.bbStr.check_tag)) dmg.amount *= S.num(it.bb.atk, 1);
        } else if (it.k > 0) {
          const hit = (S.num(it.bb.check_ab_flag, 0) && bound(target)) || (S.num(it.bb.check_sluggish, 0) && !!target.findBuff('sluggish'));
          if (hit) dmg.mul = S.num(dmg.mul, 1) * (1 + S.num(it.bb.damage_scale_per_stack, 0) * it.k);
        }
      }
    });
  }
  const chaos = new Set((by.get('act1autochess_gar_eff_chaos') ?? EMPTY).map((it) => it.unit));
  if (chaos.size) {
    battle.on('hit', ({ source, target, dmg }) => {
      if (!source || !chaos.has(source) || !target || target.side !== 'enemy' || !dmg) return;
      if (dmg.type === 'phys' || dmg.type === 'arts') dmg.type = weaknessType(source, target, dmg);
    }, { priority: WEAKNESS_PRIORITY });
  }
}

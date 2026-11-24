// server/sim/content/garrisons/effects/hits.js — the hit-modifier 特质: ATK × vs tagged enemies
// (act1autochess_gar_eff_attack_enemy), the layer-scaled damage on bound / sluggish targets
// (act2autochess_gar_eff_ab_damageScaleByBond, its steps set by the layer readers of effects/stats.js) and 弱点伤害
// (act1autochess_gar_eff_chaos).

import * as S from '../../support/index.js';
import { mitigate } from '../../../damage.js';
import { EMPTY, inRangeOf } from '../shared.js';
import { bondSteps } from './triggered.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { GarrisonInst, Installer } from '../shared.js' */
/** @import { HitEv, DamagedEv } from '../../support/index.js' */
/** A firstdamgecold instance once its installer ran: the enemies it has hit. @typedef {GarrisonInst & { seen: Set<Unit> }} ColdInst */

/** The effect keys installHitMods reads. */
export const HIT_KEYS = Object.freeze(['act1autochess_gar_eff_attack_enemy', 'act2autochess_gar_eff_ab_damageScaleByBond', 'act1autochess_gar_eff_chaos']);

/**
 * 弱点伤害 (research 04 §glossary: "each hit is dealt as whichever of physical/arts yields MORE damage against that
 * target's DEF/RES"): the 理论伤害 of each type — the engine's mitigation formula incl. the attacker's DEF/RES ignore
 * stats, and nothing else; a tie keeps the original type. The official client's WeakDamage compares penetration + the
 * base formula only, and PRTS 术语释义 counts ATK, its multipliers and additions, penetration and the target's
 * DEF / RES, "不计入…任何伤判效果": the dealt / taken multipliers (physDealtMul, artsTakenMul …) never choose the type.
 * @param {Unit | null | undefined} source @param {Unit} target @param {Record<string, any>} dmg the hit's damage record
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
const bound = (/** @type {Unit} */ t) => !!(t.s && t.s.flags && t.s.flags.bind) || !!t.findBuff('bind');

/**
 * The target checks of act2autochess_gar_eff_ab_damageScaleByBond's check_ab_flag: the client's `AbnormalFlag` (13
 * UNMOVABLE = 束缚 here). A value missing here matches no target — never "any value is 束缚" (content/coverage.js
 * reports it, test/content/coverage.test.js checks every season's values are listed).
 */
/** @type {Readonly<Record<number, (t: Unit) => boolean>>} */
export const AB_FLAG_CHECK = Object.freeze({ 13: bound });

/** Priority of the 弱点伤害 conversion: after every default-priority hit modifier, so the final amount decides. */
export const WEAKNESS_PRIORITY = -10;

/** @param {Battle} battle @param {Map<string, GarrisonInst[]>} by the instances by effect key */
export function installHitMods(battle, by) {
  /** @type {Map<Unit, Array<{ it: GarrisonInst, kind: string }>>} */
  const m = new Map();
  const push = (/** @type {GarrisonInst} */ it, /** @type {string} */ kind) => {
    let a = m.get(it.unit);
    if (!a) { a = []; m.set(it.unit, a); }
    a.push({ it, kind });
  };
  for (const it of by.get('act1autochess_gar_eff_attack_enemy') ?? EMPTY) push(it, 'tag');
  for (const it of by.get('act2autochess_gar_eff_ab_damageScaleByBond') ?? EMPTY) push(it, 'ab');
  if (m.size) {
    battle.on('hit', (/** @type {HitEv} */ { source, target, dmg }) => {
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
          const flag = it.bb.check_ab_flag != null ? AB_FLAG_CHECK[S.num(it.bb.check_ab_flag)] : null;
          const hit = (!!flag && flag(target)) || (S.num(it.bb.check_sluggish, 0) && !!target.findBuff('sluggish'));
          if (hit) dmg.mul = S.num(dmg.mul, 1) * (1 + S.num(it.bb.damage_scale_per_stack, 0) * it.k);
        }
      }
    });
  }
  const chaos = new Set((by.get('act1autochess_gar_eff_chaos') ?? EMPTY).map((it) => it.unit));
  if (chaos.size) {
    battle.on('hit', (/** @type {HitEv} */ { source, target, dmg }) => {
      if (!source || !chaos.has(source) || !target || target.side !== 'enemy' || !dmg) return;
      if (dmg.type === 'phys' || dmg.type === 'arts') dmg.type = weaknessType(source, target, dmg);
    }, { priority: WEAKNESS_PRIORITY });
  }
}

/**
 * 规程's 特质 on their operators' damage output (client ON_OUTPUT_DAMAGE: the `damaged` hook of a phys / arts / true hit —
 * an element fill is no damage output):
 *   act3autochess_gar_effect_firstdamgecold   角峰: the first damage to each enemy ("对每名敌人首次造成伤害时") gives it
 *                                             `cold` s of 寒冷 — a durable per-holder flag on the enemy (…[flag]
 *                                             independentCharacterSource, UNIQUE), so once per enemy per battle.
 *   act3autochess_gar_effect_attackslow_inrange  水月: the holder and the operators of range_id (x-5, the plus) — every
 *                                             damage they deal slows the target: MOVE_SPEED FINAL_SCALER
 *                                             × (1 + numerator × floor(layers of bond_id / denominator)) for slow_duration s
 *                                             (one instance per holder, refreshed [ASSUMED·CN: the dynamic ability prefab
 *                                             that hands the buff to the range is CN-only]).
 */
/** @type {Record<string, Installer>} */
export const DAMAGE_INSTALLERS = {
  act3autochess_gar_effect_firstdamgecold(battle, list) {
    const m = /** @type {Map<Unit, ColdInst>} */ (new Map(list.map((it) => [it.unit, it]))); // seen set below
    for (const it of list) it.seen = new Set();
    battle.on('damaged', (/** @type {DamagedEv} */ { source, target, type, amount }) => {
      const it = source ? m.get(source) : null;
      if (!it || !target || target.side !== 'enemy' || type === 'element' || !(amount > 0) || it.seen.has(target)) return;
      it.seen.add(target);
      if (target.alive) battle.applyStatus(target, 'cold', { duration: S.num(it.bb.cold, 0), source });
    });
  },

  act3autochess_gar_effect_attackslow_inrange(battle, list) {
    battle.on('damaged', (/** @type {DamagedEv} */ { source, target, type, amount }) => {

      if (!source || !S.isOp(source) || !target || target.side !== 'enemy' || !target.alive || type === 'element' || !(amount > 0)) return;
      for (const it of list) {
        const h = it.unit;
        if (source.ownerId !== h.ownerId || !S.onField(h)) continue;
        if (source !== h && !inRangeOf(h, source, it.bbStr.range_id, S.inRange)) continue;
        const k = bondSteps(battle, h.ownerId, [it.bbStr.bond_id].filter(Boolean), it.bb.denominator);
        if (!(k > 0)) continue;
        const mul = Math.max(0, 1 + S.num(it.bb.numerator, 0) * k);
        battle.addBuff(target, { key: `gar:${it.gid}:${h.id}`, duration: S.num(it.bb.slow_duration, 0), refresh: 'replace', mods: { moveMul: mul }, visible: true });
      }
    });
  },
};

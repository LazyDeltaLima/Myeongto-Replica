// server/sim/content/bonds/nation/laterano.js — 拉特兰 (lateranoShip).
//
//   act1autochess_bond_eff_laterano   member ammo skills start with round(ammo × (base_ammo_percent +
//                                     ammo_percent_per_stack·L)) more bullets (the original count × the ratio, half to
//                                     even — lateranoAmmo); 6: every ammo used by a member → all members ATK
//                                     +atk_per_consume (≤ max_atk_for_consume)
// Hook priority: skillStart −10 (after kits' own ammo changes).

import * as S from '../../support/index.js';
import { num, reached } from '../shared.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BondInstaller, BondTemplate } from '../shared.js' */
/** @import { SkillEv } from '../../support/index.js' */

/**
 * Bullets 拉特兰 adds to an ammo skill whose original count is `orig`: RoundToInt(orig × ratio) on top of the maximum
 * (the client's `CastSkillWithLimitTimes._UpdateMaxAdditionCount`: float32 product → FP →
 * `MathUtil.RoundToInt` → `FP.Round`, which rounds a half to even).
 * @param {unknown} orig @param {unknown} ratio
 */
export function lateranoAmmo(orig, ratio) {
  const x = Math.fround(Math.fround(num(orig, 0)) * Math.fround(num(ratio, 0)));
  if (!(x > 0)) return 0;
  const f = Math.floor(x), d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 === 1) ? f + 1 : f;
}

/** @type {BondInstaller} */
function installLaterano(battle, pid, bb, members) {
  const memberSet = new Set(members);
  battle.on('skillStart', (/** @type {SkillEv} */ { unit, skill }) => {
    if (!memberSet.has(unit) || !skill || skill.kind !== 'ammo' || !(skill.ammoLeft > 0)) return;
    const add = lateranoAmmo(skill.ammo || skill.ammoLeft, num(bb.base_ammo_percent, 0) + num(bb.ammo_percent_per_stack, 0) * S.bondLayers(battle, pid, 'lateranoShip'));
    if (add > 0) skill.ammoLeft += add;
  }, { priority: -10 });
  if (!reached(battle, pid, 'lateranoShip', bb.power_bond_char_cnt)) return;
  const per = num(bb.atk_per_consume, 0), cap = num(bb.max_atk_for_consume, Infinity);
  if (!(per > 0)) return;
  const st = { used: 0, bonus: 0 };
  battle.on('ammoUsed', (/** @type {SkillEv} */ { unit }) => {
    if (!memberSet.has(unit) || st.bonus >= cap) return;
    st.used++;
    st.bonus = Math.min(cap, st.used * per);
    for (const m of members) S.passiveBuff(battle, m, 'bond:laterano:ammo', S.directMods({ atk: st.bonus }));
  });
}

/** @type {Readonly<Record<string, BondTemplate>>} */
export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_laterano: { bond: 'lateranoShip', battle: installLaterano },
});

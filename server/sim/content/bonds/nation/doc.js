// server/sim/content/bonds/nation/doc.js — 聚合 (docShip, 卫戍协议：规程).
//
//   act3autochess_bond_eff_doc   (bondeffect_doc) allies in a member's attack range regenerate ATK × (heal_base + per·L)
//                                HP and recover ATK × (ep_heal_base + per·L) 元素损伤 per second; 3: they also have 庇护
//                                damage_res_base + per·L
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb). [ASSUMED·CN] the
// rules are read from the season's buff templates; the CN-only nodes and the server's bookkeeping are not readable here.

import * as S from '../../support/index.js';
import { reduceElement } from '../../../damage.js';
import { holdProtect } from '../../kits/shared/tier1.js';
import { TICK } from '../../../constants.js';
import { num, reached } from '../shared.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BondInstaller, BondTemplate } from '../shared.js' */

/** @type {BondInstaller} */
function installDoc(battle, pid, bb, members) {
  const st = S.battleStore(battle, 'bond:doc', () => ({ list: [] }));
  st.list.push({ pid, bb, members });
  if (st.list.length > 1) return;
  // [aura] from each member on the allies of its attack range, kept for one tick at a time (the strongest per stat)
  battle.every(0, () => {
    const regen = new Map(), ep = new Map(), shelter = new Map();
    for (const { pid: p, bb: b, members: ms } of st.list) {
      const L = S.bondLayers(battle, p, 'docShip');
      const power = reached(battle, p, 'docShip', b.power_bond_char_cnt);
      for (const m of ms) {
        if (!S.onField(m)) continue;
        const atk = num(m.s.atk);
        const h = atk * (num(b.heal_base) + num(b.heal_per_stack) * L);
        const e = atk * (num(b.ep_heal_base) + num(b.ep_heal_per_stack) * L);
        const d = power ? num(b.damage_res_base) + num(b.damage_res_per_stack) * L : 0;
        for (const a of alliesInRange(battle, m)) {
          regen.set(a, (regen.get(a) ?? 0) + h);
          ep.set(a, (ep.get(a) ?? 0) + e);
          if (d > (shelter.get(a) ?? 0)) shelter.set(a, d);
        }
      }
    }
    for (const a of battle.allyUnits) {
      const h = regen.get(a) ?? 0;
      if (h > 0) battle.addBuff(a, { key: 'bond:doc:regen', duration: 1.5 * TICK, refresh: 'replace', mods: { hpRegen: h } });
      const e = ep.get(a) ?? 0;
      if (e > 0) reduceElement(a, e * TICK);
      const d = shelter.get(a) ?? 0;
      if (d > 0) holdProtect(battle, a, d, 1.5 * TICK, a);
    }
  });
}

/** 「攻击范围内的我方单位」: deployed allies whose tile is in the member's range (Battle.allySelectable). @param {Battle} battle @param {Unit} m */
function alliesInRange(battle, m) {
  const set = m.rangeKeySet || new Set(m.rangeKeys || []);
  return battle.allyUnits.filter((/** @type {Unit} */ a) => a.alive && a.deployed && !a.hidden && a.kind !== 'device' && set.has(a.tileR * S.COLS + a.tileC) && battle.allySelectable(a, m));
}

/** @type {Readonly<Record<string, BondTemplate>>} */
export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_doc: { bond: 'docShip', battle: installDoc, bb: 'record' },
});

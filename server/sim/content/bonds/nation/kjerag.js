// server/sim/content/bonds/nation/kjerag.js — 谢拉格 (kjeragShip).
//
//   act1autochess_bond_eff_kjerag   members deal ×base_damage_scale, vs cold / frozen enemies ×(base_ex_damage_scale +
//                                   ex_damage_scale_per_stack·L) instead; 6: cold wind (devices.js kjeragColdWind)
//   act3autochess_bond_eff_kjerag   (卫戍协议：规程) the same multipliers, no wind; its <每100层> 谢拉格不融冰 is
//                                   bond_layer_added_reward_equip (bonds/templates.js)
//   act3autochess_bond_eff_kjerag_power   (规程, 6 of the player's own) the 雪山巨人 “不眠雪山” as the battle starts, a
//                                   walking ally of two modes (bonds/giant.js)

import * as S from '../../support/index.js';
import { kjeragColdWind } from '../../devices.js';
import { num, reached, onUnitHit, isEnemyTarget } from '../shared.js';
import { installGiant } from '../giant.js';

function installKjerag(battle, pid, bb, members, { wind }) {
  const base = num(bb.base_damage_scale, 1);
  for (const u of members) S.passiveBuff(battle, u, 'bond:kjerag', { dmgDealtMul: base });
  const ex = num(bb.base_ex_damage_scale, base), per = num(bb.ex_damage_scale_per_stack, 0);
  const onHit = (c) => {
    const t = c.target;
    if (!isEnemyTarget(t) || !c.dmg) return;
    const f = t.s.flags;
    if (!f.cold && !f.freeze) return;
    const target = ex + per * S.bondLayers(battle, pid, 'kjeragShip');
    if (base > 0 && target > 0) c.dmg.mul *= target / base;
  };
  for (const u of members) onUnitHit(battle, u, onHit);
  // the wind is the field's: one [storm] on the map controller whoever reaches 6 (AutoChessAssignBondCharCntToBB
  // _filterAllSides = the most members over the players, official client), its duration from the most
  // 谢拉格 layers over the players (AutoChessAssignBondStackCntToBB _assignAllPlayerIndex)
  // (规程's template has no [storm]: `wind` false)
  if (!wind) return;
  const st = S.battleStore(battle, 'bond:kjerag:wind', () => ({ handle: null }));
  if (!st.handle && reached(battle, pid, 'kjeragShip', bb.power_bond_char_cnt)) st.handle = kjeragColdWind(battle, pid, bb);
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_kjerag: { bond: 'kjeragShip', battle: (b, pid, bb, ms) => installKjerag(b, pid, bb, ms, { wind: true }) },
  act3autochess_bond_eff_kjerag: { bond: 'kjeragShip', battle: (b, pid, bb, ms) => installKjerag(b, pid, bb, ms, { wind: false }) },
  act3autochess_bond_eff_kjerag_power: { bond: 'kjeragShip', battle: installGiant },
});

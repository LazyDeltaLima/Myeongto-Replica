// server/sim/content/bonds/general/arcane.js — 奥术 (arcaneShip): 卫戍协议：规程's own template. The default season's
// act2autochess_bond_eff_arcane runs in addon/battle.js with the other add-on bonds.
//
//   act3autochess_bond_eff_arcane   (bondeffect_arcane) each damage a member deals but an 附加 or element one adds ATK ×
//                                   (atk_base + per·L) arts (附加); 3 (its act3autochess_bond_eff_arcane_power[enemy] part,
//                                   one per field, the highest 奥术 layers among the players at 3): each damage an enemy
//                                   takes (not element) lowers its RES by 1, down to magic_res_max_base + per·L (≥
//                                   magic_res_max_min); and at 3 of its player's own (ON_BUFF_START: bond_char_cnt GE
//                                   power_bond_char_cnt → the runtime ability act3autochess_bond_mag_power[immune_invisible]
//                                   on the member) the enemies in each member's attack range lose their 隐匿
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb). [ASSUMED·CN] the
// rules are read from the season's buff templates; the CN-only nodes and the server's bookkeeping are not readable here.

import * as S from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { AURA, whileDeployed, reveal, enemiesOnRange } from '../../kits/shared/tier4.js';
import { num, reached, onDealt, fieldMaxLayers, isFoe, isAddition, isElement } from '../shared.js';

function installArcane(battle, pid, bb, members) {
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    if (!isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg)) return;
    const k = num(bb.atk_base) + num(bb.atk_per_stack) * S.bondLayers(battle, pid, 'arcaneShip');
    if (k > 0) battle.dealDamage(u, t, { amount: k * num(u.s.atk), type: 'arts', tags: ['bond:arcane', 'addition'] });
  };
  for (const u of members) onDealt(battle, u, onDmg);
  if (!reached(battle, pid, 'arcaneShip', bb.power_bond_char_cnt)) return;
  // [immune_invisible]: 「【奥术】干员攻击范围内的敌人隐匿效果失效」, the module effect of the same words (tier4.js reveal:
  // a short 反隐 on the stealthed enemies standing on the member's current range, refreshed while it is deployed)
  // [ASSUMED·CN: the ability prefab is CN-only; its range is the member's attack range and its refresh the engine's aura]
  for (const u of members) whileDeployed(battle, u, AURA, () => reveal(battle, enemiesOnRange(battle, u)));
  // arcane_power[enemy]: one per field, the highest 奥术 layers among the players at 3
  const st = S.battleStore(battle, 'bond:arcane3:enemy', () => ({ on: false, cut: new Map() }));
  if (st.on) return;
  st.on = true;
  battle.on('damaged', (c) => {
    const t = c.target;
    if (!isFoe(t) || !c.dmg || isElement(c) || isHpLoss(c.dmg)) return;
    const L = fieldMaxLayers(battle, 'arcaneShip', bb.power_bond_char_cnt);
    if (L < 0) return;
    const floor = Math.max(num(bb.magic_res_max_min, -100), num(bb.magic_res_max_base) + num(bb.magic_res_max_per_stack) * L);
    const cur = st.cut.get(t) ?? 0;
    if (!(cur > floor)) return;
    const v = Math.max(floor, cur + num(bb.magic_res_add, -1));
    st.cut.set(t, v);
    S.passiveBuff(battle, t, 'bond:arcane:res', { resFlat: v });
  });
}

export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_arcane: {
    bond: 'arcaneShip', battle: installArcane, bb: 'record',
  },
  act3autochess_bond_eff_arcane_power: { bond: 'arcaneShip', readBy: 'act3autochess_bond_eff_arcane' },
});

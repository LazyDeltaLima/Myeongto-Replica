// server/sim/content/bonds/nation/victoria.js — 维多利亚 (victoriaShip).
//
//   act1autochess_bond_eff_victoria   members carrying equipment deal ×(base_damage_scale + damage_scale_per_stack·L);
//                                     6: ATK +atk_normal_equip per item (+atk_golden_equip more per golden item; 直接乘算)
//   (prep: the 维式重锤 every `layer` layers — bond_layer_added_reward_equip, bonds/templates.js)

import * as S from '../../support/index.js';
import { num, reached, onLayers } from '../shared.js';

function installVictoria(battle, pid, bb, members) {
  const apply = () => {
    const mul = num(bb.base_damage_scale, 1) + num(bb.damage_scale_per_stack, 0) * S.bondLayers(battle, pid, 'victoriaShip');
    for (const u of members) {
      if (S.itemsOf(u).length >= 1) S.passiveBuff(battle, u, 'bond:victoria', { dmgDealtMul: mul });
    }
  };
  apply();
  onLayers(battle, pid, 'victoriaShip', apply);
  if (!reached(battle, pid, 'victoriaShip', bb.power_bond_char_cnt)) return;
  const normal = num(bb.atk_normal_equip, 0), golden = normal + num(bb.atk_golden_equip, 0);
  for (const u of members) {
    const ids = S.itemsOf(u);
    if (!ids.length) continue;
    let add = 0;
    for (const id of ids) add += S.isGoldenId(id) ? golden : normal;
    if (add > 0) S.passiveBuff(battle, u, 'bond:victoria:atk', S.directMods({ atk: add }));
  }
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_victoria: { bond: 'victoriaShip', battle: installVictoria },
});

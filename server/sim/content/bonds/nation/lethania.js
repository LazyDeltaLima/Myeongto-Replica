// server/sim/content/bonds/nation/lethania.js — 莱塔尼亚 (lethaniaShip, 卫戍协议：规程).
//
//   act3autochess_bond_eff_lethania   (bondeffect_lethania) members ATK +(atk_base + atk_per_stack·L). Its summons
//                                     (“一个小节” / “一个乐部”, the [enemy] part) are not written yet (bundle sim-K)
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb). [ASSUMED·CN] the
// rules are read from the season's buff templates; the CN-only nodes and the server's bookkeeping are not readable here.

import { standing } from '../shared.js';

function installLethania(battle, pid, bb, members) {
  standing(battle, pid, 'lethaniaShip', members, 'bond:lethania', { atk: [bb.atk_base, bb.atk_per_stack] });
}

export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_lethania: {
    bond: 'lethaniaShip', battle: installLethania, bb: 'record',
    partial: ['summons 一个小节 / 一个乐部 ([enemy] summon_* / big_*)'],
  },
});

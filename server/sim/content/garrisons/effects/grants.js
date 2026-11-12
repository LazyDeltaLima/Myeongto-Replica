// server/sim/content/garrisons/effects/grants.js — ADD_BOND: the operators a 特质 grants its `give_garrison_id` to,
// before the first deployment (home tiles; garrisons/battle.js header).
//
// The targets follow the trait's battleRuneKey, as the official client chooses them when it reads the battle data: the
// tile in front (`give_garrison_to_front`), the tile behind (`give_garrison_to_back`), the rightmost operator of the row
// (`give_garrison_to_most_right`) or every operator of the player, the holder included (`give_garrison_to_all`) — each
// of the holder's own player, and with `check_bond_id` only a member of that bond. There is no "self" target: 耀骑士临光's
// "使自身和身前一格干员获得特质" reaches the operator in front, her own copy is the trait she carries (garrison_144 / 159
// are hers already). Every grant is a copy of its own (garrisons/battle.js add).

import * as S from '../../support/index.js';
import { frontOf } from '../../../dir.js';

function opsOf(battle, pid) {
  const out = [];
  for (const u of battle.allyUnits) if (S.isOp(u) && u.ownerId === pid && !u.removed) out.push(u);
  return out;
}
function opAtHome(battle, pid, r, c) {
  for (const u of battle.allyUnits) if (S.isOp(u) && u.ownerId === pid && !u.removed && u.homeR === r && u.homeC === c) return u;
  return null;
}

export function grantTargets(battle, it) {
  const u = it.unit;
  const need = it.bbStr.check_bond_id || null;
  const ok = (t) => !!t && (!need || S.isMember(battle, t, need));
  const tile = (k) => { const [r, c] = frontOf(u.homeR, u.homeC, u.dir, k); return opAtHome(battle, u.ownerId, r, c); };
  switch (it.g.battleRuneKey) {
    case 'give_garrison_to_all': return opsOf(battle, u.ownerId).filter(ok);
    case 'give_garrison_to_most_right': {
      let best = null;
      for (const t of opsOf(battle, u.ownerId)) {
        if (t.homeR !== u.homeR) continue;
        // a board position ("最右边" of the player's own board: the mirrored Final Assault right side counts from the left)
        const col = (x) => (x.player && x.player.mirror ? -x.homeC : x.homeC);
        if (!best || col(t) > col(best)) best = t;
      }
      return ok(best) ? [best] : [];
    }
    case 'give_garrison_to_front': { const f = tile(1); return ok(f) ? [f] : []; }
    case 'give_garrison_to_back': { const b = tile(-1); return ok(b) ? [b] : []; }
    default: return [];
  }
}

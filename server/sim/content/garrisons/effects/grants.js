// server/sim/content/garrisons/effects/grants.js — ADD_BOND: the operators a 特质 grants its `give_garrison_id` to,
// before the first deployment (home tiles; targets parsed from the text — garrisons/battle.js header).

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
  const desc = it.g.desc || '';
  const need = it.bbStr.check_bond_id || null;
  const ok = (t) => !!t && (!need || S.isMember(battle, t, need));
  const front = () => { const [fr, fc] = frontOf(u.homeR, u.homeC, u.dir); return opAtHome(battle, u.ownerId, fr, fc); };
  if (desc.includes('所有')) return opsOf(battle, u.ownerId).filter(ok);
  if (desc.includes('同一行最右边')) {
    let best = null;
    for (const t of opsOf(battle, u.ownerId)) {
      if (t.homeR !== u.homeR) continue;
      // a board position ("最右边" of the player's own board: the mirrored Final Assault right side counts from the left)
      const col = (x) => (x.player && x.player.mirror ? -x.homeC : x.homeC);
      if (!best || col(t) > col(best)) best = t;
    }
    return ok(best) ? [best] : [];
  }
  const out = [];
  if (desc.includes('自身和身前') && ok(u)) out.push(u);
  const f = front();
  if (ok(f)) out.push(f);
  return out;
}

// server/sim/content/bonds/nation/victoria.js — 维多利亚 (victoriaShip).
//
//   act1autochess_bond_eff_victoria   members carrying equipment deal ×(base_damage_scale + damage_scale_per_stack·L);
//                                     6: ATK +atk_normal_equip per item (+atk_golden_equip more per golden item; 直接乘算)
//   act3autochess_bond_eff_victoria   (卫戍协议：规程, bondeffect_victoria_2 — 洛洛's strategy switches the bond to it) the
//                                     same damage scale; 6: a member carrying equipment at the battle start
//                                     (act3autochess_bond_eff_victoria_power, created by ON_BUFF_START when equip_cnt ≠ 0
//                                     and the player has power_bond_char_cnt members) lends, at each skill cast
//                                     (ON_SKILL_CAST_SUCCEED), the effects of every item it carries to the operators of
//                                     the 3×3 around it ([share_equip] ON_BUFF_ENABLE AutoChessShareEquipEffect, range
//                                     x-4, no item level filter) for min(share_equip_duration_max, share_equip_duration_base
//                                     + share_equip_duration_per_stack·L) s. [share_equip] is EXTEND: a cast while it runs
//                                     only refills its time — the operators it reaches stay the first cast's
//                                     (`_targetsCacheKey`; INDEX 「버프 덮어쓰기 그룹」: the new buff is not added, so no
//                                     second ON_BUFF_ENABLE). Its end, the lender's knock-out or retreat included
//                                     (ON_BUFF_DISABLE AutoChessRemoveEquipEffectByAlias), takes the loans back.
//   (prep: the 维式重锤 every `layer` layers — bond_layer_added_reward_equip, bonds/templates.js)

import * as S from '../../support/index.js';
import * as items from '../../items.js';
import { num, reached, onLayers } from '../shared.js';

/** Members carrying equipment deal ×(base_damage_scale + damage_scale_per_stack·L) (both directions). */
function damageScale(battle, pid, bb, members) {
  const apply = () => {
    const mul = num(bb.base_damage_scale, 1) + num(bb.damage_scale_per_stack, 0) * S.bondLayers(battle, pid, 'victoriaShip');
    for (const u of members) {
      if (S.itemsOf(u).length >= 1) S.passiveBuff(battle, u, 'bond:victoria', { dmgDealtMul: mul });
    }
  };
  apply();
  onLayers(battle, pid, 'victoriaShip', apply);
}

function installVictoria(battle, pid, bb, members) {
  damageScale(battle, pid, bb, members);
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

function installVictoriaAct3(battle, pid, bb, members) {
  damageScale(battle, pid, bb, members);
  if (!reached(battle, pid, 'victoriaShip', bb.power_bond_char_cnt)) return;
  const lenders = new Set(members.filter((u) => S.isOp(u) && S.itemsOf(u).length >= 1));
  if (!lenders.size) return;
  /** lender → { targets, until, timer } while its [share_equip] runs */
  const running = new Map();
  const end = (u) => {
    const st = running.get(u);
    if (!st) return;
    running.delete(u);
    if (st.timer) st.timer.cancel();
    for (const t of st.targets) items.endLentItems(battle, u, t);
  };
  const lend = (u, targets, duration) => {
    let n = 0;
    for (const t of targets) if (items.lendItemEffects(battle, u, t, { maxTier: Infinity, duration }) > 0) n++;
    return n;
  };
  battle.on('skillStart', ({ unit }) => {
    if (!lenders.has(unit) || !S.onField(unit)) return;
    const L = S.bondLayers(battle, pid, 'victoriaShip');
    const duration = Math.min(num(bb.share_equip_duration_max, Infinity),
      num(bb.share_equip_duration_base, 0) + num(bb.share_equip_duration_per_stack, 0) * L);
    if (!(duration > 0)) return;
    let st = running.get(unit);
    if (!st) {
      st = { targets: S.alliesAround(battle, unit, S.N8).filter(S.isOp), timer: null };
      running.set(unit, st);
    }
    if (st.timer) st.timer.cancel();
    st.timer = battle.after(duration, () => end(unit), { owner: unit });
    const n = lend(unit, st.targets, duration);
    if (n) S.fxOn(battle, 'bondShare', unit, 'bond:victoriaShip', 'share', { n, duration });
  });
  battle.on('death', ({ unit }) => { if (running.has(unit)) end(unit); });
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_victoria: { bond: 'victoriaShip', battle: installVictoria },
  act3autochess_bond_eff_victoria: { bond: 'victoriaShip', battle: installVictoriaAct3 },
});

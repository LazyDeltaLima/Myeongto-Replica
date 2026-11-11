// server/sim/content/bonds/nation/ursus.js — 乌萨斯 (ursusShip, 卫戍协议：规程).
//
//   act3autochess_bond_eff_ursus   (bondeffect_ursus) members ATK / max HP +(base + per·L); a member's knock-out of an
//                                  enemy → 临时层数 +2 (6: +4); 6: every 1 s a blocking member deals ATK × (atk_scale_base +
//                                  per·L) arts (持续) to each enemy it blocks, and the damage it takes from a living source
//                                  (not 真实, not 持续) is cut by min(1, base + per·L), the cut part lost again over 10 s
//                                  (one HP loss per second, 真实, credited to that source) unless the source is knocked
//                                  out first
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb). [ASSUMED·CN] the
// rules are read from the season's buff templates; the CN-only nodes and the server's bookkeeping are not readable here.

import * as S from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { num, reached, standing, isFoe, isDot } from '../shared.js';

/** Extra 临时层数 per knock-out a strategy adds (the AUTOCHESS global `<player>.ursus_extra_bond_stack_cnt[power]`). */
export function ursusExtra(battle, pid) {
  return S.battleStore(battle, 'bond:ursus:extra', () => new Map()).get(pid) ?? { normal: 0, power: 0 };
}

/**
 * Raise the player's extra per knock-out to at least `normal` / `power` — 规程's 特质 act3autochess_gar_effect_ursusexbondcnt
 * (garrison_23): ON_BUFF_START AddGlobalBlackboard `_overwrite` behind FilterByBlackboardValue GT (a lower value leaves
 * both as they are).
 */
export function raiseUrsusExtra(battle, pid, normal, power) {
  const store = S.battleStore(battle, 'bond:ursus:extra', () => new Map());
  const cur = store.get(pid) ?? { normal: 0, power: 0 };
  if (!(normal > cur.normal)) return;
  store.set(pid, { normal, power: power > cur.power ? power : cur.power });
}

function installUrsus(battle, pid, bb, members) {
  standing(battle, pid, 'ursusShip', members, 'bond:ursus', { atk: [bb.atk_base, bb.atk_per_stack], hp: [bb.hp_base, bb.hp_per_stack] });
  const memberSet = new Set(members);
  const power = reached(battle, pid, 'ursusShip', bb.power_bond_char_cnt);
  // ON_TARGET_KILLED: a member knocks out a unit ("击倒其他单位"; [ASSUMED·CN: an enemy — the units a member's damage knocks out;
  // the event's target kinds are a CN-only node])
  battle.on('death', (c) => {
    if (c.reason !== 'killed' || !c.killer || !memberSet.has(c.killer) || !c.unit || c.unit.side !== 'enemy') return;
    const extra = ursusExtra(battle, pid);
    const n = power ? num(bb['temp_bond_stack_cnt[power]']) + num(extra.power) : num(bb.temp_bond_stack_cnt) + num(extra.normal);
    S.gainLayers(battle, { playerId: pid, bonds: 'ursusShip', n, source: c.killer, reason: 'bond', temp: true });
  });
  if (!power) return;
  // [block_enemy]: every 1 s from the member's arrival (triggerInterval 1, waitFirstTriggerInterval) while it blocks
  const blockScale = () => num(bb.atk_scale_base) + num(bb.atk_scale_per_stack) * S.bondLayers(battle, pid, 'ursusShip');
  const next = new Map();
  battle.every(0, () => {
    for (const m of members) {
      if (!S.onField(m)) { next.delete(m); continue; }
      const due = next.get(m);
      if (due === undefined) { next.set(m, battle.time + 1); continue; }
      if (battle.time < due - 1e-9) continue;
      next.set(m, due + 1);
      const k = blockScale();
      if (!(k > 0) || !m.blocking || !m.blocking.length) continue;
      for (const e of m.blocking.slice()) if (isFoe(e)) battle.dealDamage(m, e, { amount: k * num(m.s.atk), type: 'arts', tags: ['bond:ursus', 'dot'] });
    }
  });
  // ON_TAKE_DAMAGE: the cut (DamageScale one-minus) and its 10 s HP loss
  const cutOf = () => Math.min(num(bb.damage_one_minus_max, 1), num(bb.damage_one_minus_base) + num(bb.damage_one_minus_per_stack) * S.bondLayers(battle, pid, 'ursusShip'));
  battle.on('hit', (c) => {
    const t = c.target, dmg = c.dmg, src = c.source;
    if (!memberSet.has(t) || !dmg || dmg.cancel || dmg.ursusCut || !src || !src.alive || dmg.sourceless) return;
    if (dmg.type === 'true' || dmg.type === 'element' || isDot(dmg) || isHpLoss(dmg)) return;
    // (the cap, 1, is past the 999 layers: 0.15 + 0.0005·L reaches it at 1700)
    const f = cutOf();
    if (!(f > 0) || f >= 1) return;
    dmg.mul *= Math.max(0, 1 - f);
    dmg.ursusCut = f;
  }, { priority: -30 });
  battle.on('damaged', (c) => {
    const t = c.target, dmg = c.dmg, src = c.source;
    if (!memberSet.has(t) || !dmg || !dmg.ursusCut) return;
    const f = dmg.ursusCut;
    dmg.ursusCut = 0;
    const lost = (num(c.amount) / (1 - f)) * f;
    if (!(lost > 0) || !src) return;
    bleed(battle, t, src, lost / num(bb.bleed_duration, 10), Math.round(num(bb.bleed_duration, 10)));
  });
}

/** [bleed]: `per` 真实 each second for `ticks` s, credited to `src`, ended when `src` is knocked out (one per hit). */
function bleed(battle, t, src, per, ticks) {
  let n = 0;
  const s = battle.every(1, () => {
    if (!t.alive || !src.alive || ++n > ticks) { s.cancel(); return; }
    battle.dealDamage(src, t, { amount: per, type: 'true', canDodge: false, tags: ['bond:ursus:bleed', 'dot'] });
    if (n >= ticks) s.cancel();
  });
}

export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_ursus: { bond: 'ursusShip', battle: installUrsus, bb: 'record' },
});

// server/sim/content/bonds/nation/iberia.js — 伊比利亚 (iberiaShip, 卫戍协议：规程).
//
//   act3autochess_bond_eff_iberia   (bondeffect_iberia; the record's one buff is its [enemy] part) every damage a member
//                                   deals to an enemy but an 附加 one (≤ 1 per 0.2 s per member and enemy) stacks a
//                                   持续法术伤害 on it (per member, ≤ 10, 10 s from the first, refreshed at 10): each second
//                                   ATK × (base + per·L) × stacks arts; 6: twice that, −4 % move speed per hit (≤ 20,
//                                   10 s), and p = prob_base + per·L that the damage bounces to one random other enemy
//                                   within 1.0 for atk_scale × ATK arts (溅射; a bounce never bounces)
// Numbers: the season's bonds.json `buffs[].bb`, every buff of the record together (shared.js recordBb). [ASSUMED·CN] the
// rules are read from the season's buff templates; the CN-only nodes and the server's bookkeeping are not readable here.

import * as S from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { num, reached, isFoe, isAddition, isElement } from '../shared.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BondInstaller, BondTemplate, BondBb, BuffRec } from '../shared.js' */
/** @import { DamagedEv } from '../../support/index.js' */
/**
 * The field's 伊比利亚 state (one for every player's members): each member's owner and numbers, the running [dot] per
 * (enemy, member), the [speed] stacks per enemy, the [enemy_cd] per (enemy, member).
 * @typedef {{ pid: string, bb: BondBb }} IberiaOwner
 * @typedef {{ stacks: number, until: number, done: boolean, atk: number }} IberiaDot
 * @typedef {{ owners: Map<Unit, IberiaOwner>, dots: Map<string, IberiaDot>, slow: Map<Unit, { stacks: number }>,
 *   cd: Map<string, number>, hooked: boolean }} IberiaState
 */

/** @type {BondInstaller} */
function installIberia(battle, pid, bb, members) {
  /** @type {IberiaState} */
  const st = S.battleStore(battle, 'bond:iberia', () => ({ owners: new Map(), dots: new Map(), slow: new Map(), cd: new Map(), hooked: false }));
  for (const u of members) st.owners.set(u, { pid, bb });
  if (st.hooked) return;
  st.hooked = true;
  const L = (/** @type {IberiaOwner} */ o) => S.bondLayers(battle, o.pid, 'iberiaShip');
  battle.on('damaged', (/** @type {DamagedEv} */ c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    const o = u ? st.owners.get(u) : null;
    if (!o || !isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg) || dmg.tags?.includes('bond:iberia:dot')) return;
    // [enemy_cd]: 0.2 s per enemy and member
    // (a member's damage: o is found only for a source)
    const cdKey = `${t.id}|${/** @type {Unit} */ (u).id}`;
    if (battle.time < (st.cd.get(cdKey) ?? -Infinity) - 1e-9) return;
    st.cd.set(cdKey, battle.time + 0.2);
    const power = reached(battle, o.pid, 'iberiaShip', o.bb.power_bond_char_cnt);
    addDot(battle, st, t, /** @type {Unit} */ (u), o);
    if (!power) return;
    slowStack(battle, st, t, o.bb);
    if (dmg.tags?.includes('bond:iberia:bounce') || !t.alive) return;
    const p = num(o.bb.prob_base) + num(o.bb.prob_per_stack) * L(o);
    if (!battle.rng.chance(p)) return;
    const near = battle.foesInRadius(t.x, t.y, 1.0).filter((e) => e !== t && e.alive);
    if (!near.length) return;
    const e = battle.rng.pick(near);
    battle.dealDamage(u, e, { amount: num(o.bb.atk_scale, 3) * num(/** @type {Unit} */ (u).s.atk), type: 'arts', isSplash: true, tags: ['bond:iberia:bounce'] });
    S.tplFx(battle, e, 'map_v079_water_hit_01', u);
  });
}

/**
 * [enemy][dot]: STACK ≤ 10 per (enemy, member), 10 s from its first stack (refreshed only at 10), a tick per second.
 * @param {Battle} battle @param {IberiaState} st @param {Unit} t @param {Unit} u @param {IberiaOwner} o
 */
function addDot(battle, st, t, u, o) {
  const key = `${t.id}|${u.id}`;
  const cur = st.dots.get(key);
  const dur = num(o.bb.dot_duration, 10);
  if (cur && !cur.done) {
    if (cur.stacks < 10) cur.stacks++;
    else cur.until = battle.time + dur;
    return;
  }
  const d = { stacks: 1, until: battle.time + dur, done: false, atk: num(u.s.atk) };
  st.dots.set(key, d);
  const s = battle.every(1, () => {
    if (!t.alive || battle.time > d.until + 1e-9) { d.done = true; s.cancel(); return; }
    const L = S.bondLayers(battle, o.pid, 'iberiaShip');
    let k = (num(o.bb.dot_atk_scale_base) + num(o.bb.dot_atk_scale_per_stack) * L) * d.stacks;
    if (reached(battle, o.pid, 'iberiaShip', o.bb.power_bond_char_cnt)) k *= 2;
    if (!(k > 0)) return;
    // a living source deals it (its ATK now, cached); a gone one: 无来源 damage of the cached ATK
    if (u.alive) { d.atk = num(u.s.atk); battle.dealDamage(u, t, { amount: k * d.atk, type: 'arts', canDodge: false, noSp: true, tags: ['bond:iberia:dot', 'dot'] }); }
    else battle.dealDamage(null, t, { amount: k * d.atk, type: 'arts', canDodge: false, sourceless: true, tags: ['bond:iberia:dot', 'dot'] });
    if (battle.time >= d.until - 1e-9) { d.done = true; s.cancel(); }
  });
}

/**
 * [enemy][speed]: one STACK per enemy (≤ max_stack_cnt), move speed ×(1 + move_speed × stacks), 10 s, refreshed at max.
 * @param {Battle} battle @param {IberiaState} st @param {Unit} t @param {BondBb} bb
 */
function slowStack(battle, st, t, bb) {
  const pre = 'act3autochess_bond_eff_iberia[enemy][speed].';
  const max = Math.max(1, Math.floor(num(bb[pre + 'max_stack_cnt'], 20)));
  const per = num(bb[pre + 'move_speed'], -0.04);
  const dur = num(bb[pre + 'speed_duration'], 10);
  const cur = st.slow.get(t);
  const live = cur && /** @type {BuffRec | null} */ (t.findBuff('bond:iberia:slow'));
  const stacks = live ? Math.min(max, cur.stacks + 1) : 1;
  const refresh = !live || (cur.stacks >= max);
  st.slow.set(t, { stacks });
  const mods = { moveMul: Math.max(0, 1 + per * stacks) };
  if (refresh) battle.addBuff(t, { key: 'bond:iberia:slow', duration: dur, refresh: 'replace', mods, onExpire: () => st.slow.delete(t) });
  else { live.mods = mods; t.markDirty(); }
}

/** @type {Readonly<Record<string, BondTemplate>>} */
export const TEMPLATES = Object.freeze({
  act3autochess_bond_eff_iberia: { bond: 'iberiaShip', battle: installIberia, bb: 'record' },
});

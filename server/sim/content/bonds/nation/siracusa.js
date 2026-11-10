// server/sim/content/bonds/nation/siracusa.js — 叙拉古 (siracusaShip).
//
//   act2autochess_bond_eff_siracusa   every member deployment: ASPD +(base + per·L) for (base_duration + per·L) s; 6:
//                                     隐匿 for the same time, and while hidden / end_duration s after, every 普通伤害 hit
//                                     (isNormalDamage) procs (PRD, nominal `prob`, one count per battle) base_damage +
//                                     damage_per_stack·L true damage + fear `fear` s
//   act3autochess_bond_eff_siracusa   (卫戍协议：规程, bondeffect_siracusa_2) a member's deployment: ASPD +(base + per·L) for
//                                     (base_duration + per·L) s; 6: an attack's damage (攻击 / 技能 ability family, not
//                                     持续; ≤ 1 per 0.2 s per member) rolls `prob`: one random status of 6 — 晕眩 · 恐惧 ·
//                                     诱导 · 寒冷 · 麻痹 · 缚地 — for min(max, base + per·L) s; every 1 s an enemy with 2
//                                     or more of them deals damage_value_base + per·L 真实 (无来源) to itself and the
//                                     enemies within 1.1
// Two players in one field: the act-2 PRD count is the battle's (the client's global blackboard).

import * as S from '../../support/index.js';
import { isNormalDamage, isHpLoss } from '../../../damage.js';
import { dicePRD } from '../addon/battle.js';
import { num, reached, onUnitDamaged, onDealt, fieldMaxLayers, isEnemyTarget, isFoe, isAddition, isDot, isElement } from '../shared.js';

function installSiracusa(battle, pid, bb, members) {
  const memberSet = new Set(members);
  const six = reached(battle, pid, 'siracusaShip', bb.power_bond_char_cnt);
  const end = num(bb.end_duration, 0);
  battle.on('deploy', ({ unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'siracusaShip');
    const dur = num(bb.base_duration, 0) + num(bb.duration_per_stack, 0) * L;
    if (!(dur > 0)) return;
    battle.addBuff(unit, { key: 'bond:siracusa', duration: dur, mods: { aspd: num(bb.base_attack_speed, 0) + num(bb.attack_speed_per_stack, 0) * L } });
    if (!six) return;
    unit.mem.siraStealthEnd = Infinity;
    const off = ({ unit: u }) => { u.mem.siraStealthEnd = battle.time; };
    battle.addBuff(unit, { key: 'bond:siracusa:stealth', duration: dur, flags: { stealth: true }, status: 'stealth', onExpire: off, onRemove: off });
  });
  if (!six) return;
  const prob = num(bb.prob, 0);
  if (!(prob > 0)) return;
  // the [ex][buff] DicePRD keeps its count on the battle's global blackboard ("prd#" + the template key): one count for
  // the battle, both players of a pair field included (like 不屈's, bonds/addon/battle.js dicePRD)
  const prd = S.battleStore(battle, 'bond:siracusa:prd', () => ({ n: 0 }));
  const onDmg = (ctx) => {
    const u = ctx.source, t = ctx.target, dmg = ctx.dmg;
    if (!isEnemyTarget(t) || !isNormalDamage(dmg)) return;
    const hidden = u.s.flags.stealth || battle.time <= num(u.mem.siraStealthEnd, -Infinity) + end + 1e-9;
    if (!hidden || !dicePRD(battle, prd, prob)) return;
    const amount = num(bb.base_damage, 0) + num(bb.damage_per_stack, 0) * S.bondLayers(battle, pid, 'siracusaShip');
    S.fxOn(battle, 'bondProc', t, 'bond:siracusaShip', 'assassin', { from: u.id, amount });
    // 'addition': act2autochess_bond_eff_siracusa[ex][buff]'s damage is attackType ADDITION (有限加速器, items/battle.js)
    if (amount > 0) battle.dealDamage(u, t, { amount, type: 'true', canDodge: false, tags: ['bond:siracusa', 'addition'] });
    if (t.alive && num(bb.fear, 0) > 0) battle.applyStatus(t, 'fear', { duration: num(bb.fear, 0), source: u });
    // client buff template act2autochess_bond_eff_siracusa[ex][buff] ON_OUTPUT_DAMAGE: CreateEffect on the target after
    // the damage and the fear (display only)
    S.tplFx(battle, t, 'common_071_bond_siracusa_hit_01', u);
  };
  for (const u of members) onUnitDamaged(battle, u, onDmg);
}

/** 叙拉古's random status (abnormal_buff[random_creator] AssignRandomKeyToBlackboard order). */
export const SIRACUSA_STATUSES = Object.freeze(['stun', 'fear', 'attract', 'cold', 'palsy', 'groundbind']);

function installSiracusaAct3(battle, pid, bb, members) {
  const memberSet = new Set(members);
  battle.on('deploy', ({ unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'siracusaShip');
    const dur = num(bb.base_duration) + num(bb.duration_per_stack) * L;
    if (dur > 0) battle.addBuff(unit, { key: 'bond:siracusa', duration: dur, mods: { aspd: num(bb.base_attack_speed) + num(bb.attack_speed_per_stack) * L } });
  });
  if (!reached(battle, pid, 'siracusaShip', bb.power_bond_char_cnt)) return;
  const next = new Map();
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    // FilterAbilityFamily ATTACK_OR_COMBAT: the member's attacks and skills, not a bond's / an item's rider; not 持续
    if (!isFoe(t) || !dmg || isElement(c) || isDot(dmg) || isAddition(dmg) || isHpLoss(dmg) || dmg.sourceless) return;
    if (dmg.tags?.some((x) => typeof x === 'string' && x.startsWith('bond:'))) return;
    if (battle.time < (next.get(u) ?? -Infinity) - 1e-9) return;
    if (!battle.rng.chance(num(bb.prob))) return;
    next.set(u, battle.time + 0.2);
    const dur = Math.min(num(bb.ab_buff_duration_max, Infinity), num(bb.ab_buff_duration_base) + num(bb.ab_buff_duration_per_stack) * S.bondLayers(battle, pid, 'siracusaShip'));
    const status = SIRACUSA_STATUSES[battle.rng.int(SIRACUSA_STATUSES.length)];
    if (dur > 0) battle.applyStatus(t, status, { duration: dur, source: u, ...(status === 'palsy' ? { value: 1 } : {}) });
  };
  for (const u of members) onDealt(battle, u, onDmg);
  // siracusa_power[enemy]: one per field (the highest 叙拉古 layers among the players at 6), every 1 s per enemy
  const st = S.battleStore(battle, 'bond:siracusa2:enemy', () => ({ on: false }));
  if (st.on) return;
  st.on = true;
  battle.every(1, () => {
    const L = fieldMaxLayers(battle, 'siracusaShip', bb.power_bond_char_cnt);
    if (L < 0) return;
    const amount = num(bb.damage_value_base) + num(bb.damage_value_per_stack) * L;
    const limit = num(bb.abnormal_buff_count_limit, 2);
    for (const e of battle.enemies.slice()) {
      if (!e.alive || !e.deployed || abnormalCount(e) < limit) continue;
      for (const x of battle.enemiesInRadius(e.x, e.y, 1.1)) {
        if (x.alive) battle.dealDamage(null, x, { amount, type: 'true', canDodge: false, sourceless: true, isSplash: true, tags: ['bond:siracusa'] });
      }
      S.tplFx(battle, e, 'map_v079_hit01', e);
    }
  });
}

/** abnormal_buff[count]: 晕眩, 恐惧, 诱导, 寒冷 or 冻结 (one), 麻痹, 缚地. */
export function abnormalCount(u) {
  const f = u.s.flags;
  return (f.stun && !f.freeze ? 1 : 0) + (f.fear ? 1 : 0) + (f.attract ? 1 : 0) + (f.cold || f.freeze ? 1 : 0)
    + (u.findBuff('palsy') ? 1 : 0) + (f.groundbind ? 1 : 0);
}

export const TEMPLATES = Object.freeze({
  act2autochess_bond_eff_siracusa: { bond: 'siracusaShip', battle: installSiracusa },
  act3autochess_bond_eff_siracusa: { bond: 'siracusaShip', battle: installSiracusaAct3, bb: 'record' },
});

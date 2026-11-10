// server/sim/content/bonds/nation/kazimierz.js — 卡西米尔 (kazimierzShip).
//
//   act2autochess_bond_eff_kazimierz   every deployment of one of the player's operators (initial ones included; one
//                                      count for the field, both 卡西米尔 players of a pair field): members ATK
//                                      +atk_when_born, total ≤ base_max_atk_when_born + max_atk_when_born_per_stack·L;
//                                      6: blocking members pulse damage_atk_scale×ATK true damage + stun around them as
//                                      they start blocking, then every damage_interval s while they block; non-blocking
//                                      members' 普通伤害 (isNormalDamage: skill hits too) adds pure_atk_scale×ATK true damage
//   act3autochess_bond_eff_kazimierz   (卫戍协议：规程, bondeffect_kazimierz_2) the same deploy count and ATK; 6: for
//                                      ex_damage_duration s after its deployment or a skill's cast, each damage a member
//                                      deals but an 附加 one adds ATK × ex_atk_scale 真实 (附加). The 6-tier switch with
//                                      the preparation bench's rightmost member is not written yet (bundle sim-K)

import * as S from '../../support/index.js';
import { isNormalDamage, isHpLoss } from '../../../damage.js';
import { num, reached, onLayers, onOwnLayers, onUnitDamaged, onDealt, isEnemyTarget, isFoe, isAddition, isElement } from '../shared.js';

function installKazimierz(battle, pid, bb, members) {
  // the deploy count kazimierz_born: the env buff's ON_BUFF_START adds 1 (AddGlobalBlackboard) on the battle's global
  // blackboard, channel CHARACTER — one blackboard per channel, no player key (BattleGlobalBlackboard) ⇒ one count for
  // the field: in a pair field where both players have 卡西米尔, each one's deployments count for both (until
  // 2026-10-31 per player). The env buff (global buff prefab, profession mask without tokens) reaches operators only;
  // its player filter is the global buff data's playerSideMask (GlobalBuff.OnInit → TargetOptions.Init), the bond
  // owner's side: AutoChessBattleDataModel._AddPackedRuneData writes that side into each bond rune's selector and
  // LGlobalBuffNew.OnPreprocessFinished copies it into the global buff data
  const st = S.battleStore(battle, 'bond:kazimierz:born', () => ({ deploys: 0, applies: [] }));
  const apply = () => {
    const cap = num(bb.base_max_atk_when_born, 0) + num(bb.max_atk_when_born_per_stack, 0) * S.bondLayers(battle, pid, 'kazimierzShip');
    const bonus = Math.max(0, Math.min(cap, st.deploys * num(bb.atk_when_born, 0)));
    if (!(bonus > 0)) return;
    for (const u of members) S.passiveBuff(battle, u, 'bond:kazimierz', S.directMods({ atk: bonus }));
  };
  st.applies.push(apply);
  battle.on('deploy', ({ unit }) => {
    if (!S.isOp(unit) || unit.ownerId !== pid) return;
    st.deploys++;
    for (const f of st.applies) f();
  });
  onLayers(battle, pid, 'kazimierzShip', apply);
  if (!reached(battle, pid, 'kazimierzShip', bb.power_bond_char_cnt)) return;
  const iv = num(bb.damage_interval, 0), radius = num(bb.range_radius, 0), scale = num(bb.damage_atk_scale, 0), stun = num(bb.stun, 0);
  if (iv > 0 && scale > 0) {
    // client buff graph kazimierz[ex]: ON_OWNER_BLOCKEE_CHANGED creates the [ex][damage] buff when the member starts
    // blocking and finishes it when it blocks nobody; its ticks (bb `interval` = damage_interval, waitFirstTriggerInterval
    // false) pulse at once, then every damage_interval s while the member keeps blocking — a timer per member
    const next = new Map();
    battle.every(0, () => {
      for (const m of members) {
        if (!S.onField(m) || !m.blocking || !m.blocking.length) { next.delete(m); continue; }
        const due = next.get(m);
        if (due !== undefined && battle.time < due - 1e-9) continue;
        next.set(m, (due ?? battle.time) + iv);
        const hits = battle.foesInRadius(m.x, m.y, radius);
        if (!hits.length) continue;
        const amount = scale * m.s.atk;
        for (const e of hits) {
          if (!e.alive) continue;
          battle.dealDamage(m, e, { amount, type: 'true', canDodge: false, isSplash: true, tags: ['bond:kazimierz'] });
          if (e.alive && stun > 0) battle.applyStatus(e, 'stun', { duration: stun, source: m });
          // the AOEDamage `_buffs` [ex_damage_effect] (0.5 s, overrideEffectKey common_071_bond_kazimierz_hit_01_new) on each enemy
          if (e.alive) S.tplFx(battle, e, 'common_071_bond_kazimierz_hit_01_new', m);
        }
        S.fxOn(battle, 'aoe', m, 'bond:kazimierzShip', 'pulse', { radius, dmgType: 'true', n: hits.length });
      }
    });
  }
  const pure = num(bb.pure_atk_scale, 0);
  if (!(pure > 0)) return;
  const onDmg = (ctx) => {
    const u = ctx.source, t = ctx.target, dmg = ctx.dmg;
    // kazimierz[ex] ON_OUTPUT_DAMAGE: every 普通伤害 instance (attack type NORMAL — skill hits too, not 溅射 / 持续 / 附加,
    // not a dodged one) while the member blocks nobody
    if (!isEnemyTarget(t) || !isNormalDamage(dmg)) return;
    if (u.blocking && u.blocking.length) return;
    // 'addition': the template's DamageViaAttr is attackType ADDITION (有限加速器 counts no 附加伤害, items/battle.js)
    battle.dealDamage(u, t, { amount: pure * u.s.atk, type: 'true', canDodge: false, tags: ['bond:kazimierz', 'addition'] });
  };
  for (const u of members) onUnitDamaged(battle, u, onDmg);
}

function installKazimierzAct3(battle, pid, bb, members) {
  // kazimierz_born: one count for the field (installKazimierz, the same global blackboard)
  const st = S.battleStore(battle, 'bond:kazimierz:born', () => ({ deploys: 0, applies: [] }));
  const apply = () => {
    const cap = num(bb.base_max_atk_when_born) + num(bb.max_atk_when_born_per_stack) * S.bondLayers(battle, pid, 'kazimierzShip');
    const bonus = Math.max(0, Math.min(cap, st.deploys * num(bb.atk_when_born)));
    if (bonus > 0) for (const u of members) S.passiveBuff(battle, u, 'bond:kazimierz', S.directMods({ atk: bonus }));
  };
  st.applies.push(apply);
  battle.on('deploy', ({ unit }) => {
    if (!S.isOp(unit) || unit.ownerId !== pid) return;
    st.deploys++;
    for (const f of st.applies) f();
  });
  onOwnLayers(battle, pid, 'kazimierzShip', apply);
  if (!reached(battle, pid, 'kazimierzShip', bb.power_bond_char_cnt)) return;
  const memberSet = new Set(members);
  const dur = num(bb.ex_damage_duration, 30);
  const until = new Map();
  // [ex_damage] (EXTEND): from the member's arrival (kazimierz_power ON_BUFF_START) and every skill cast
  battle.on('deploy', ({ unit }) => { if (memberSet.has(unit)) until.set(unit, battle.time + dur); });
  battle.on('skillStart', ({ unit }) => { if (memberSet.has(unit)) until.set(unit, battle.time + dur); });
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    if (!isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg) || battle.time > (until.get(u) ?? -Infinity) + 1e-9) return;
    const k = Math.min(num(bb.ex_atk_scale_max, Infinity), num(bb.ex_atk_scale_base) + num(bb.ex_atk_scale_per_stack) * S.bondLayers(battle, pid, 'kazimierzShip'));
    if (k > 0) battle.dealDamage(u, t, { amount: k * num(u.s.atk), type: 'true', canDodge: false, tags: ['bond:kazimierz', 'addition'] });
  };
  for (const u of members) onDealt(battle, u, onDmg);
}

export const TEMPLATES = Object.freeze({
  act2autochess_bond_eff_kazimierz: { bond: 'kazimierzShip', battle: installKazimierz },
  act3autochess_bond_eff_kazimierz: {
    bond: 'kazimierzShip', battle: installKazimierzAct3, bb: 'record',
    partial: ['6: switch with the preparation bench\'s rightmost member'],
  },
});

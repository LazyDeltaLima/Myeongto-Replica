// server/sim/content/garrisons/effects/triggered.js — the effects a 规程 event 特质 runs instead of a layer gain
// (bbStr garrison_type garrison_trigger_buff): the event garrison names the effect garrison (garrison_trigger_buff_garrison_key,
// carried by the same chess, `desc` often null) and its key (garrison_trigger_buff_key); the effect reads that garrison's
// own bb / bbStr. Client: the event's dynamic ability runs AutoChessTriggerGarrisonAbility, which triggers the effect
// garrison's buff (ON_BUFF_TRIGGER of the template named by the key).
//
//   act3autochess_gar_effect_addsp_inrange       +sp SP (ModifySp) to the allies of the effect's range: use_global_range >
//                                                use_attack_range > range_id (template order); bond_id keeps that bond's
//                                                members (AutoChessFilterCharacterBondIds, 调和 counted: isMember).
//   act3autochess_gar_effect_attrbybond_inrange  steps = floor(layers of bond_id / denominator); > 0 ⇒ every ally of the
//                                                range gets ATK / DEF / HP × (MULTIPLIER: the 直接乘算 of support directMods)
//                                                and ATTACK_SPEED / regen / RES + (ADDITION) × steps for attr_duration s.
//   act3autochess_gar_effect_minus_respawn       the 整备区 (the hand) and the attack range: every operator of the player
//                                                waiting to redeploy has its remaining time − remaining_respawn_time s, or
//                                                × remaining_respawn_time (is_ratio: 0.7 = "−30%").
//   act3autochess_gar_effect_bondstackmax        "叠层上限+N / +X%": the per-battle caps (max_add_count_per_battle) of every
//                                                特质 of the operators in range (use_to_self / global / attack / range_id),
//                                                filtered by the holder's own bonds (filter_bond_by_self) or filter_bond_ids,
//                                                get + max_add (shared blackboard …_modify_add) and × (1 + max_factor)
//                                                (…_modify_factor) for this battle (capOf).
//   act3autochess_gar_effect_switchcharinhand[trigger]  历阵锐枪芬: a 卡西米尔 of the 整备区 comes in on its tile
//                                                (effects/switch.js triggerSwitch).
//
// [ASSUMED·CN: these keys' dynamic ability prefabs are CN-only — the steps count only ACTIVE bonds as the default season's
// layer readers do (research 02 §5); the 整备区 is the operators waiting to redeploy (the hand pieces a battle gets are
// switch candidates, with no timer), the attack-range part adds nobody (an operator on the field has no timer); the cap is floor(cap × (1 + Σ factor)) + Σ add
// (the client's order of the two shared values is not in the EN client); "其他" (薇薇安娜) leaves the holder out.]

import * as S from '../../support/index.js';
import { ids, inRangeOf } from '../shared.js';
// (a function only: switch.js imports events.js, which imports this file — hoisted across the cycle)
import { triggerSwitch } from './switch.js';

const opsOf = (battle, pid) => battle.allyUnits.filter((a) => S.isOp(a) && a.ownerId === pid);

/** The allies (operators of the holder's player on the field) of an effect garrison's range, by its template's order. */
function rangeAllies(battle, holder, bb, bs) {
  const out = [];
  const mode = S.num(bb.use_global_range, 0) > 0 ? 'global' : S.num(bb.use_attack_range, 0) > 0 ? 'attack' : bs.range_id || null;
  if (!mode) return out;
  for (const a of opsOf(battle, holder.ownerId)) {
    if (!S.onField(a)) continue;
    if (mode === 'global' || inRangeOf(holder, a, mode, S.inRange)) out.push(a);
  }
  return out;
}

/** floor(Σ layers of the listed ACTIVE bonds / denominator) (header). */
export function bondSteps(battle, pid, bondIds, denominator) {
  let sum = 0;
  for (const b of bondIds) if (S.bondActive(battle, pid, b)) sum += S.bondLayers(battle, pid, b);
  return Math.floor(sum / Math.max(1, S.num(denominator, 1)));
}

const CAP_MODS = 'garrisons:capMods';
/** The per-battle cap of a 特质 instance after the 叠层上限 effects on its operator. */
export function capOf(battle, it) {
  if (!Number.isFinite(it.cap)) return it.cap;
  const m = S.battleStore(battle, CAP_MODS, () => new Map()).get(it.unit);
  if (!m) return it.cap;
  return Math.max(0, Math.floor(it.cap * (1 + m.factor) + 1e-9) + m.add);
}

export const TRIGGERED = {
  act3autochess_gar_effect_addsp_inrange(battle, it, pg) {
    const bb = pg.bb || {};
    const bs = pg.bbStr || {};
    const sp = S.num(bb.sp, 0);
    if (!(sp > 0)) return;
    const need = ids(bs.bond_id);
    for (const a of rangeAllies(battle, it.unit, bb, bs)) {
      if (need.length && !need.some((b) => S.isMember(battle, a, b))) continue;
      if (a.skill && a.skill.gainSp(sp, 'garrison') > 0) S.fxOn(battle, 'garrison', a, `gar:${pg.garrisonId}`, it.key, { sp });
    }
  },

  act3autochess_gar_effect_attrbybond_inrange(battle, it, pg) {
    const bb = pg.bb || {};
    const k = bondSteps(battle, it.unit.ownerId, ids(pg.bbStr?.bond_id), bb.denominator);
    const dur = S.num(bb.attr_duration, 0);
    if (!(k > 0) || !(dur > 0)) return;
    const mods = S.directMods({ atk: S.num(bb.atk_base, 0) * k, def: S.num(bb.def_base, 0) * k, hp: S.num(bb.max_hp_base, 0) * k });
    if (S.num(bb.attack_speed_base, 0)) mods.aspd = S.num(bb.attack_speed_base) * k;
    if (S.num(bb.hp_recovery_per_sec_base, 0)) mods.hpRegen = S.num(bb.hp_recovery_per_sec_base) * k;
    if (S.num(bb.sp_recovery_per_sec_base, 0)) mods.spRecoveryFlat = S.num(bb.sp_recovery_per_sec_base) * k;
    if (S.num(bb.magic_resistance_base, 0)) mods.resFlat = S.num(bb.magic_resistance_base) * k;
    for (const a of rangeAllies(battle, it.unit, bb, pg.bbStr || {})) {
      battle.addBuff(a, { key: `gar:${pg.garrisonId}`, duration: dur, refresh: 'replace', mods, visible: true });
    }
  },

  act3autochess_gar_effect_minus_respawn(battle, it, pg) {
    const bb = pg.bb || {};
    const v = S.num(bb.remaining_respawn_time, 0);
    const ratio = S.num(bb.is_ratio, 0) > 0;
    if (!(S.num(bb.use_to_hand, 0) > 0) || (ratio ? !(v >= 0 && v < 1) : !(v > 0))) return;
    const now = battle.time;
    for (const a of opsOf(battle, it.unit.ownerId)) {
      // the holder knocked out by the event itself (历阵锐枪芬 "被击倒时") is not in the hand yet
      if (a === it.unit || !battle.isDown(a) || !(a.respawnAt > now)) continue;
      const left = a.respawnAt - now;
      a.respawnAt = now + Math.max(0, ratio ? left * v : left - v);
    }
  },

  act3autochess_gar_effect_bondstackmax(battle, it, pg) {
    const bb = pg.bb || {};
    const bs = pg.bbStr || {};
    const h = it.unit;
    let list;
    if (S.num(bb.use_to_self, 0) > 0) list = [h];
    else list = rangeAllies(battle, h, bb, bs);
    const filter = S.num(bb.filter_bond_by_self, 0) > 0 ? S.unitBonds(h, battle) : ids(bs.filter_bond_ids);
    const others = /其他/.test(pg.desc || '');
    const add = S.num(bb.max_add, 0);
    const factor = S.num(bb.max_factor, 0);
    if (!add && !factor) return;
    const store = S.battleStore(battle, CAP_MODS, () => new Map());
    for (const a of list) {
      if (others && a === h) continue;
      if (filter.length && !filter.some((b) => S.isMember(battle, a, b))) continue;
      let m = store.get(a);
      if (!m) { m = { add: 0, factor: 0 }; store.set(a, m); }
      m.add += add;
      m.factor += factor;
    }
  },
};

TRIGGERED['act3autochess_gar_effect_switchcharinhand[trigger]'] = triggerSwitch; // switch.js SWITCH_TRIGGER

/** The trigger_buff keys this file runs (coverage). */
export const TRIGGERED_KEYS = Object.freeze(Object.keys(TRIGGERED));

/** Run the effect garrison of a garrison_trigger_buff instance (header); false when the key has no effect here. */
export function runTriggered(battle, it) {
  const fn = TRIGGERED[it.bbStr.garrison_trigger_buff_key];
  const pg = it.payload !== undefined ? it.payload : (it.payload = S.garrisonRecord(it.bbStr.garrison_trigger_buff_garrison_key, battle) ?? null);
  if (!fn || !pg) return false;
  fn(battle, it, pg);
  return true;
}

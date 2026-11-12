// server/sim/content/garrisons/effects/switch.js — 规程's 特质 that call an operator of the 整备区 (the hand) onto the field
// (client AutoChessMarkSwitchWithHand: `_selectType` RIGHT, `_putType` ORIGINAL — the rightmost fitting hand operator
// comes in on the holder's tile, facing its way, and the holder leaves the field without a body or a redeploy, as
// 卡西米尔's 6 switch does: content/bonds/nation/kazimierz.js).
//
//   act3autochess_gar_effect_switchhand_triggergar    耀骑士临光 garrison_58 「被击倒时召唤整备区最右侧的【卡西米尔】【突袭】干员
//                                                     上场，并使自身及被召唤干员已激活的盟约层数+N（每名干员每回合至多叠加M层）」:
//                                                     ON_OWNER_FINISH unless the finish is a move-like one
//                                                     (MOVE_LIKE_RESPAWN_SELF / _EXTERNAL — our 突袭 retreat 'raid',
//                                                     redeployed at once): the switch, then (AlwaysNext — with or
//                                                     without a candidate) the holder's own layer gain
//                                                     (AutoChessTriggerGarrisonAbility: bond_self by_count), and the
//                                                     called operator gets act3autochess_gar_effect_common_triggergar,
//                                                     whose ON_BUFF_START runs the same gain for ITS active bonds. The
//                                                     cap (max_add_count_per_battle) is per operator.
//   act3autochess_gar_effect_switchcharinhand[trigger] 历阵锐枪芬 garrison_224, run by its event garrison_223
//                                                     (act1autochess_gar_event_selfdead, effects/triggered.js):
//                                                     AutoChessCheckSwitchWithHand (nothing without a candidate), the
//                                                     switch, InstantKill on the holder (already knocked out).
//
// Candidates (`_checkBond` switch_bond_id, `_checkOriginBuildable`): a hand operator carrying one of the listed bonds
// (调和 counted: support isMember) of the holder's deploy class (the tile it comes in on). They are created before any
// content installs (reserve(): battle/players.js createReserveAlly, one unit per hand slot shared with 卡西米尔's 6
// switch), so they carry their bonds, items and kit like a board operator once fielded. The player's battle input
// carries them (server/match/player/round.js battleInput: handRules below).
//
// [ASSUMED·CN: AutoChessMarkSwitchWithHand / AutoChessCheckSwitchWithHand are CN-only — a comma list of bonds is "any
// of them" (as the other bond filters of these tables); the holder's deploy class is `_checkOriginBuildable`
// (switch_buildable_type / switch_profession_mask are not in the records: no check); every other finish (a knock-out,
// a forced exit of its own effects) switches; the switch runs after every other `death` handler (priority −999) and
// before 卡西米尔's 6 switch (−1000), so one knock-out calls one operator.]

import * as S from '../../support/index.js';
import { ids } from '../shared.js';
import { fireGain } from './events.js';

export const SWITCH_NEAR = 'act3autochess_gar_effect_switchhand_triggergar';
export const SWITCH_TRIGGER = 'act3autochess_gar_effect_switchcharinhand[trigger]';
/** The effect keys whose holder may call a hand operator. */
export const SWITCH_KEYS = Object.freeze([SWITCH_NEAR, SWITCH_TRIGGER]);

/** death priority of the switch: after the other handlers, before 卡西米尔's 6 switch (−1000). */
const SWITCH_PRIORITY = -999;

/**
 * The hand operators a board chess may call (PlayerBattleInput `reserve`): `{ bonds, position }` per switch 特质 of its
 * record — a hand chess of that deploy class carrying one of the bonds (or 调和). `garrisonOf(id)` reads a garrison
 * record. A superset: reserve() below picks the exact candidates.
 */
export function handRules(chessRec, garrisonOf) {
  const out = [];
  if (!chessRec || !Array.isArray(chessRec.garrisonIds)) return out;
  for (const gid of chessRec.garrisonIds) {
    const g = garrisonOf(gid);
    if (!g || g.eventType !== 'IN_BATTLE' || !SWITCH_KEYS.includes(g.effectKey)) continue;
    const bonds = ids(g.bbStr?.switch_bond_id);
    if (bonds.length) out.push({ bonds, position: chessRec.position });
  }
  return out;
}

const benchKey = (pid) => `gar:switch:bench:${pid}`;

function switchBonds(battle, u) {
  const out = new Set();
  for (const gid of u?.def?.raw?.garrisonIds ?? []) {
    const g = S.garrisonRecord(gid, battle);
    if (g && g.eventType === 'IN_BATTLE' && SWITCH_KEYS.includes(g.effectKey)) for (const b of ids(g.bbStr?.switch_bond_id)) out.add(b);
  }
  return [...out];
}

/** Before any content installs: the candidates of every board holder of a switch 特质, rightmost slot first. */
export function reserve(battle) {
  for (const p of battle.players || []) {
    const pid = p.playerId;
    const hand = Array.isArray(p.input?.reserve) ? p.input.reserve : [];
    if (!hand.length) continue;
    const wants = [];
    for (const u of battle.allyUnits) {
      if (!S.isOp(u) || u.ownerId !== pid || u.reserve) continue;
      const bonds = switchBonds(battle, u);
      if (bonds.length) wants.push({ bonds, position: u.def?.position });
    }
    if (!wants.length) continue;
    const bench = S.battleStore(battle, benchKey(pid), () => []);
    for (const inp of [...hand].filter((h) => h && Number.isInteger(h.slot)).sort((a, b) => b.slot - a.slot)) {
      const def = battle._allyDefFromInput(inp);
      if (!def) continue;
      const probe = { kind: 'op', side: 'ally', ownerId: pid, def, items: Array.isArray(inp.items) ? inp.items : [] };
      if (!wants.some((w) => w.position === def.position && w.bonds.some((b) => S.isMember(battle, probe, b)))) continue;
      const u = battle.createReserveAlly(p, inp);
      if (u && !bench.includes(u)) bench.push(u);
    }
  }
}

/** The rightmost hand operator not fielded yet that `holder` may call with `bonds`, or null. */
function candidate(battle, holder, bonds) {
  const bench = S.battleStore(battle, benchKey(holder.ownerId), () => []);
  for (const u of bench) {
    if (u.deploySeq > 0 || u.def?.position !== holder.def?.position) continue;
    if (bonds.some((b) => S.isMember(battle, u, b))) return u;
  }
  return null;
}

/** Field `next` on the tile `holder` lies on; the holder leaves (no body, no redeploy). False when it did not come in. */
function switchIn(battle, holder, next) {
  if (!next || holder.removed) return false;
  const tile = battle.restTile(holder);
  holder.removed = true;
  if (battle.fieldReserve(next, tile, holder.dir)) {
    S.fxOn(battle, 'garrison', next, 'gar:switch', SWITCH_NEAR, { from: holder.id });
    return true;
  }
  holder.removed = false;
  return false;
}

/** The switches the [trigger] effect asked for during this `death` (holder → bonds), run at SWITCH_PRIORITY. */
const PENDING = 'gar:switch:pending';

function installPending(battle) {
  const st = S.battleStore(battle, PENDING, () => ({ on: false, list: new Map() }));
  if (st.on) return st;
  st.on = true;
  battle.on('death', ({ unit }) => {
    const bonds = st.list.get(unit);
    if (!bonds) return;
    st.list.delete(unit);
    switchIn(battle, unit, candidate(battle, unit, bonds));
  }, { priority: SWITCH_PRIORITY });
  return st;
}

/** effects/triggered.js: 历阵锐枪芬's garrison_224, run by its 被击倒时 event (garrison_223). */
export function triggerSwitch(battle, it, pg) {
  const holder = it.unit;
  const bonds = ids(pg.bbStr?.switch_bond_id);
  // AutoChessCheckSwitchWithHand: no candidate, nothing
  if (!bonds.length || holder.alive || !candidate(battle, holder, bonds)) return;
  installPending(battle).list.set(holder, bonds);
}

/**
 * garrisons/battle.js INSTALLERS: 耀骑士临光's garrison_58, and the switch handler of 历阵锐枪芬's garrison_224 (installed
 * with the battle, before its event garrison_223 can ask for it).
 */
export const SWITCH_INSTALLERS = {
  [SWITCH_TRIGGER](battle) { installPending(battle); },
  [SWITCH_NEAR](battle, list) {
    const by = new Map(list.map((it) => [it.unit, it]));
    battle.on('death', ({ unit, reason }) => {
      const it = by.get(unit);
      if (!it || unit.alive || reason === 'raid') return;
      const next = candidate(battle, unit, ids(it.bbStr.switch_bond_id));
      const called = switchIn(battle, unit, next) ? next : null;
      // AlwaysNext: the holder's gain with or without a candidate; the called operator's through common_triggergar
      fireGain(battle, it);
      if (called) {
        const own = it.calls || (it.calls = new Map());
        let c = own.get(called);
        if (!c) { c = { ...it, unit: called, capKey: `gar:${it.gid}:${unit.id}:${called.id}`, calls: null }; own.set(called, c); }
        fireGain(battle, c);
      }
    }, { priority: SWITCH_PRIORITY });
  },
};

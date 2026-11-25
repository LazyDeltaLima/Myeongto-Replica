// server/sim/content/garrisons/effects/events.js — the layer-event 特质 (garrisons/battle.js header): each effect key
// watches a battle event and fires its layer gain (fireGain: targets, amount, condition, cap), and 魔王's extra on the
// gains of the operator in front.

import * as S from '../../support/index.js';
import { frontOf } from '../../../dir.js';
import { ids, EMPTY, byUnit, inRangeOf } from '../shared.js';
import { runTriggered, capOf } from './triggered.js';
import { traitEventFx } from '../../../../../shared/traitFx.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { GarrisonInst, Installer } from '../shared.js' */
/** @import { DeployEv, KillEv, DeathEv, UnitEv, StatusEv, BurstEv, LayerGainEv } from '../../support/index.js' */
/** A _consume_ammo instance after its reset (the installer below): the per-consumer locks, the count's threshold, the tick. @typedef {GarrisonInst & { locks: Map<Unit, number>, target: number, seq: number, next: number }} AmmoInst */

/**
 * Status keys for the check_ab_flag values the data uses: the client's `AbnormalFlag` (16 FROZEN = 冻结, 33 FEARED = 恐惧 —
 * 规程 妮芙 garrison_99). A value missing here watches nothing (never a fallback to 冻结: 33 read as 冻结 once left 妮芙's
 * 特质 dead); the data test checks every value the tables use is listed.
 */
/** @type {Readonly<Record<number, string>>} */
export const AB_FLAG_STATUS = Object.freeze({ 16: 'freeze', 33: 'fear' });
const abFlagStatus = (/** @type {GarrisonInst} */ it) => AB_FLAG_STATUS[S.num(it.bb.check_ab_flag, 16)] ?? null;

/**
 * The option values of a garrison's bbStr this file reads (content/coverage.js marks any other value 'partial'). A value
 * missing here does nothing — no layers, no condition met, nobody in range — never the switch's first case (a 33 read as
 * 冻结 once left 妮芙's 特质 dead); an absent option is the table's plain case (bond_by_id, by_count, no condition,
 * garrison_add_bond, the holder alone). conditionkey character_target_inboard always holds in battle (every carrier is
 * on the board). range_id is read by the effect keys listed only.
 */
export const GARRISON_OPTIONS = Object.freeze({
  bond_type: Object.freeze(['bond_by_id', 'bond_self', 'bond_actived_maxstack', 'bond_allinrange']),
  bond_add_type: Object.freeze(['by_count', 'by_charcount_samerow', 'by_charlevel']),
  conditionkey: Object.freeze(['character_same_row', 'character_same_col', 'character_target_inboard']),
  garrison_type: Object.freeze(['garrison_add_bond', 'garrison_trigger_buff']),
  range_id: Object.freeze({
    act1autochess_gar_event_consume_ammo: Object.freeze(['0-1', '1-1', 'x-5']),
    act1autochess_gar_event_addition_cnt: Object.freeze(['1-1']),
    act2autochess_gar_event_allyenemy_sleepstun_inrange: Object.freeze(['x-4']),
    act3autochess_gar_event_enemy_epbreak_inrange: Object.freeze(['x-4']),
    act1autochess_gar_event_enemykilled_inrange: Object.freeze(['x-1']),
    // 规程's effect garrisons (effects/triggered.js, effects/hits.js: every grid of shared.js RANGE_GRIDS they name)
    act3autochess_gar_effect_addsp_inrange: Object.freeze(['x-4', '0-1', '1-5']),
    act3autochess_gar_effect_attrbybond_inrange: Object.freeze(['x-5']),
    act3autochess_gar_effect_bondstackmax: Object.freeze(['x-4', '1-1']),
    act3autochess_gar_effect_attackslow_inrange: Object.freeze(['x-5']),
  }),
});

/** @param {Battle} battle @param {GarrisonInst} it */
function targetBonds(battle, it) {
  const u = it.unit;
  switch (it.bbStr.bond_type) {
    case 'bond_self': return S.unitBonds(u, battle).filter((b) => S.bondActive(battle, u.ownerId, b));
    case 'bond_actived_maxstack': { const b = S.topActiveBond(battle, u.ownerId); return b ? [b] : EMPTY; }
    case 'bond_allinrange': {
      // 规程 garrison_237 "使身后一格干员已激活的盟约层数+N": the active bonds of the operators on the tiles of bond_range_id
      // (b-4: the tile behind), once per operator (a shared bond twice, as the prep side's POSITION gains)
      /** @type {string[]} */
      const out = [];
      for (const a of battle.allyUnits) {
        if (a === u || !S.isOp(a) || a.ownerId !== u.ownerId || !S.onField(a)) continue;
        if (!inRangeOf(u, a, it.bbStr.bond_range_id, S.inRange)) continue;
        for (const b of S.unitBonds(a, battle)) if (S.bondActive(battle, u.ownerId, b)) out.push(b);
      }
      return out;
    }
    case 'bond_by_id': case undefined: case '': return ids(it.bbStr.bond_id);
    default: return EMPTY; // a value this file does not know gains nothing (content/coverage.js reports it)
  }
}

/** @param {Battle} battle @param {GarrisonInst} it */
function amountOf(battle, it) {
  const bb = it.bb;
  switch (it.bbStr.bond_add_type) {
    case 'by_charcount_samerow': return S.rowMates(battle, it.unit).length * S.num(bb.bond_add_count_multi, S.num(bb.bond_add_count, 1));
    case 'by_charlevel': return S.tierOf(it.unit) * S.num(bb.bond_add_count, 1);
    case 'by_count': case undefined: case '': return S.num(bb.bond_add_count, 0);
    default: return 0;
  }
}

/** @param {Battle} battle @param {GarrisonInst} it */
function conditionMet(battle, it) {
  const ck = it.bbStr.conditionkey;
  const need = S.num(it.bb.check_count, 0);
  if (ck === 'character_same_row') return S.rowMates(battle, it.unit).length >= need;
  if (ck === 'character_same_col') {
    let n = 0;
    for (const a of battle.allyUnits) if (S.isOp(a) && a.ownerId === it.unit.ownerId && S.onField(a) && a.tileC === it.unit.tileC) n++;
    return n >= need;
  }
  return ck == null || ck === '' || ck === 'character_target_inboard';
}

/**
 * 规程's 特质 effect over its operator (shared/traitFx.js: the record's eventEffect, map_v079_buff01 for a bond one) as a
 * template effect ['tplfx', holder, prefab] — when an event 特质 takes effect: a layer gain that added layers, an effect
 * garrison run (莎草 「每次开启技能时…」: crossed swords over her at each skill, official recording). The fixed
 * stat 特质 (attrByBond 「每叠加N层…」, effects/stats.js) have no event and play nothing. [추정·화면: a gain stopped by its
 * per-battle cap plays nothing; an effect garrison plays even when its effect finds nobody.]
 * @param {Battle} battle @param {GarrisonInst} it
 */
function traitFx(battle, it) {
  const name = traitEventFx(it.g);
  if (name) S.tplFx(battle, it.unit, name);
}

/**
 * Fire a 特质 instance on its event: a garrison_trigger_buff one runs its effect garrison (effects/triggered.js), any
 * other gains layers (fireGain).
 * @param {Battle} battle @param {GarrisonInst} it
 */
export function fire(battle, it) {
  const type = it.bbStr.garrison_type;
  if (type === 'garrison_trigger_buff') { if (runTriggered(battle, it)) traitFx(battle, it); return 0; }
  return type == null || type === '' || type === 'garrison_add_bond' ? fireGain(battle, it) : 0;
}

/** Fire a layer-gain garrison instance. Returns the layers added. @param {Battle} battle @param {GarrisonInst} it */
export function fireGain(battle, it) {
  if (!conditionMet(battle, it)) return 0;
  const bonds = targetBonds(battle, it);
  if (!bonds.length) return 0;
  let n = amountOf(battle, it);
  // bond_actived_maxstack (塑心 garrison_90 "当前已激活且层数最多的盟约层数+1（每场作战至多10层）"): the cap is the instance's
  // own over the battle, whichever bond is the highest at each gain — per (instance, bond) a change of the highest bond
  // granted a fresh 10 (PR #178 review). The base amount counts toward it (魔王's extra does not, as in gainLayers).
  const cap = capOf(battle, it); // 叠层上限 effects of 规程 (effects/triggered.js bondstackmax)
  const whole = it.bbStr.bond_type === 'bond_actived_maxstack' && Number.isFinite(cap);
  if (whole) {
    n = Math.min(Math.floor(n), Math.max(0, Math.floor(cap) - (it.wholeUsed ?? 0)));
    if (!(n > 0)) return 0;
  }
  const added = S.gainLayers(battle, {
    playerId: it.unit.ownerId, bonds, n, requireActive: true, source: it.unit, reason: 'garrison',
    cap: whole ? Infinity : cap, capKey: whole ? null : it.capKey,
    temp: S.num(it.bb.bond_add_as_tmp, 0) > 0, // 规程 "临时层数+N" (garrison_13)
  });
  if (whole && added > 0) it.wholeUsed = (it.wholeUsed ?? 0) + n;
  if (added > 0) { S.fxOn(battle, 'garrison', it.unit, `gar:${it.gid}`, it.key, { n: added }); traitFx(battle, it); }
  return added;
}

/** @param {Unit} holder @param {Unit | null | undefined} u */
function isFrontOf(holder, u) {
  if (!u || u === holder || u.ownerId !== holder.ownerId || !S.onField(u)) return false;
  const [fr, fc] = frontOf(holder.tileR, holder.tileC, holder.dir);
  return u.tileR === fr && u.tileC === fc;
}
/**
 * 魔王: the gain's source (an operator of the holder's player) stands in front of it. `tile` = the engine's layerGain
 * ctx.tile: where the source stands, or where it was knocked out this very instant (幽灵鲨 "被击倒时" gains fire on death).
 * @param {Unit} holder @param {Unit | null | undefined} u @param {readonly number[] | null} tile
 */
function sourceInFront(holder, u, tile) {
  if (!u || u === holder || u.ownerId !== holder.ownerId || !S.isOp(u) || !Array.isArray(tile)) return false;
  const [fr, fc] = frontOf(holder.tileR, holder.tileC, holder.dir);
  return tile[0] === fr && tile[1] === fc;
}
/** @param {GarrisonInst} it @param {Unit} u */
function ammoScope(it, u) {
  const h = it.unit;
  switch (it.bbStr.range_id) {
    case '1-1': return S.onField(h) && isFrontOf(h, u);
    case 'x-5': return u === h || (S.onField(h) && S.onField(u) && u.ownerId === h.ownerId && S.isOp(u) && Math.abs(u.tileR - h.tileR) + Math.abs(u.tileC - h.tileC) === 1);
    case '0-1': case undefined: case '': return u === h;
    default: return false;
  }
}

/**
 * Does a `_selfdead` 特质 also fire on the 傀儡师's switches (替身 → 本体 and back)? Its text says so, in either wording:
 * 归溟幽灵鲨 "替身与本体进行切换" / "与替身发生替换", 规程's 风丸 garrison_124 "与傀儡发生替换" (until 2026-11-14 only 替身 was
 * read, so 风丸's swaps added no 不屈 layers). The sweep in test/content/garrisons_battle.test.js holds it to every
 * 傀儡师 owner of every season.
 */
export const countsSwaps = (/** @type {{ desc?: string } | null | undefined} */ g) => /替身|傀儡/.test((g && g.desc) || '');

/** Installers by effect key: (battle, instances of the key). @type {Record<string, Installer>} */
export const EVENTS = {
  act1autochess_gar_event_useskill(battle, list) {
    const m = byUnit(list);
    battle.on('skillStart', (/** @type {UnitEv} */ { unit }) => {
      const arr = m.get(unit);
      if (arr) for (const it of arr) fire(battle, it);
    });
  },

  act1autochess_gar_event_selfkillenemy(battle, list) {
    const m = byUnit(list);
    for (const it of list) it.allies = /我方干员/.test(it.g.desc || '');
    // the kill count (current_cnt) starts again at 0 on every deployment: the client's buff graph zeroes it on
    // ON_BUFF_START — a 【移动】 (`deploy` with move) too: officially a new character (Character.MoveLikeRespawnSelf)
    // that takes the global buff again
    battle.on('deploy', (/** @type {DeployEv} */ { unit }) => {
      const arr = m.get(unit);
      if (arr) for (const it of arr) it.cnt = 0;
    });
    battle.on('kill', (/** @type {KillEv} */ { killer, victim }) => {
      const arr = killer ? m.get(killer) : null;
      if (!arr || !victim) return;
      for (const it of arr) {
        if (!(victim.side === 'enemy' || (it.allies && victim.side === 'ally' && victim.kind === 'op'))) continue;
        it.cnt++;
        if (it.cnt % Math.max(1, S.num(it.bb.check_cnt, 1)) === 0) fire(battle, it);
      }
    });
  },

  act1autochess_gar_event_selfdead(battle, list) {
    const m = byUnit(list);
    battle.on('death', (/** @type {DeathEv} */ { unit, reason }) => {
      if (reason !== 'killed') return;
      const arr = m.get(unit);
      if (arr) for (const it of arr) fire(battle, it);
    });
    // the switches: the engine's `dollSwap` (a switch started, either way, on the field; never the 替身's knock-out). Until
    // 2026-11-14 a per-tick watch of unit.trait.doll stood here: a 替身 knocked out and redeployed at once (不屈) read as
    // one more switch, so that knock-out gained twice
    const swaps = byUnit(list.filter((it) => countsSwaps(it.g)));
    if (!swaps.size) return;
    battle.on('dollSwap', (/** @type {UnitEv} */ { unit }) => {
      const arr = swaps.get(unit);
      if (arr) for (const it of arr) fire(battle, it);
    });
  },

  // Client dynamic ability act1autochess_gar_event_consume_ammo (ListenAmmoConsumeAbility): ON_AMMO_CONSUME comes once per
  // ammo-counter event (an attack or lock that spends bullets, consumeCnt unused here) of an operator (validator: no
  // tokens); [consume] → the holder takes a 0.1 s [cnt] from that consumer unless it already has one, and [cnt] adds 1 ⇒
  // a consumer counts at most once per 0.1 s (the 5 bullets of one attack are one). [self] ticks every 0.3 s
  // (waitFirstTriggerInterval, from the deployment) and passes ONE threshold per tick (target += consume_count).
  // The count (consumed_cnt) and threshold live on the holder's buffs: a withdrawal finishes the entity, which clears
  // every buff (durable ones too; only a fake death keeps those) and its abilities ⇒ each deployment starts from 0, a
  // 【移动】 (`deploy` with move) too: officially a new character on the same spawn path, as for the kill count above.
  act1autochess_gar_event_consume_ammo(battle, list) {
    const LOCK = 0.1, TICK = 0.3;
    const reset = (/** @type {GarrisonInst} */ it) => { it.locks = new Map(); it.cnt = 0; it.target = Math.max(1, S.num(it.bb.consume_count, 1)); };
    for (const it of list) { reset(it); it.seq = -1; it.next = 0; }
    const m = byUnit(list);
    battle.on('deploy', (/** @type {DeployEv} */ { unit }) => {
      const arr = m.get(unit);
      if (arr) for (const it of arr) reset(it);
    });
    battle.on('ammoUsed', (/** @type {UnitEv} */ { unit }) => {
      if (!unit || !S.isOp(unit)) return;
      for (let i = 0; i < list.length; i++) {
        const it = /** @type {AmmoInst} */ (list[i]); // reset above
        if (!ammoScope(it, unit)) continue;
        if (battle.time + 1e-9 < (it.locks.get(unit) ?? -Infinity)) continue;
        it.locks.set(unit, battle.time + LOCK);
        it.cnt++;
      }
    });
    battle.on('tick', () => {
      for (let i = 0; i < list.length; i++) {
        const it = /** @type {AmmoInst} */ (list[i]); // reset above
        const h = it.unit;
        if (!S.onField(h)) continue;
        if (it.seq !== h.deploySeq) { it.seq = h.deploySeq; it.next = h.deployedAt + TICK; }
        if (battle.time + 1e-9 < it.next) continue;
        it.next += TICK;
        if (it.cnt < it.target) continue;
        it.target += Math.max(1, S.num(it.bb.consume_count, 1));
        fire(battle, it);
      }
    });
  },

  act1autochess_gar_event_enemy_abflag_inrange(battle, list) {
    const watched = new Set(list.map(abFlagStatus));
    // "进入冻结时" / "陷入恐惧": only a new entry (engine ctx.entered — a refresh of a running status is not one)
    battle.on('statusApplied', (/** @type {StatusEv} */ { target, status, entered }) => {
      if (!target || !watched.has(status) || !entered || target.side !== 'enemy') return;
      for (const it of list) {
        if (status !== abFlagStatus(it)) continue;
        if (!S.onField(it.unit) || !S.inRange(it.unit, target)) continue;
        if (battle.rng() < S.num(it.bb.prob, 1)) fire(battle, it);
      }
    });
  },

  act2autochess_gar_event_onstart(battle, list) {
    const m = byUnit(list);
    battle.on('deploy', (/** @type {DeployEv} */ { unit }) => {
      const arr = m.get(unit);
      if (arr) for (const it of arr) fire(battle, it);
    });
    // Player-confirmed (upstream GitHub #415 / #429): 远牙's granted trait also gains on each body / substitute switch.
    // Restrict this extra trigger to that trait; use its existing amounts, active-bond checks and battle cap.
    // (by the default season's 特质 id: another season's own id of the same 特质, S.garrisonKeyOf)
    const farTooth = byUnit(list.filter((it) => ['garrison_108_a', 'garrison_108_b'].includes(S.garrisonKeyOf(it.gid, battle))));
    if (farTooth.size) battle.on('dollSwap', (/** @type {UnitEv} */ { unit }) => {
      const arr = farTooth.get(unit);
      if (arr) for (const it of arr) fire(battle, it);
    });
  },

  act2autochess_gar_event_allyenemy_sleepstun_inrange(battle, list) {
    battle.on('statusApplied', (/** @type {StatusEv} */ { target, status, entered }) => { // "进入沉睡/晕眩时": new entries only (ctx.entered)
      if (!target || (status !== 'sleep' && status !== 'stun') || !entered) return;
      if (!(target.side === 'enemy' || (target.side === 'ally' && target.kind === 'op'))) return;
      // range: the attack range, or range_id (规程 x-4 "周围八格": the 3 × 3 square around the holder)
      for (const it of list) if (S.onField(it.unit) && inRangeOf(it.unit, target, it.bbStr.range_id || 'attack', S.inRange)) fire(battle, it);
    });
  },

  // 规程 아미야 garrison_114 「<战斗中>身前一格干员提升盟约层数时，每次提升的层数额外+1（不受叠层上限影响）」 (精锐 +2): the 特质 it
  // grants to the operator in front, garrison_235 「通过卫戍能力或装备提升盟约层数时…」 — every layer gain that operator's own
  // 特质 ('garrison') or equipment ('item') makes gets +extra_cnt per bond. The hook runs after the per-battle cap took its
  // share (S.gainLayers), so the extra is past the cap, as 魔王's. [ASSUMED·CN: the effect prefab is CN-only] a strategy's,
  // a bond's own gain (乌萨斯's knock-out 临时层数) and prep-side gains are not raised; each granted copy adds its own extra.
  act3autochess_gar_effect_ex_bond_cnt(battle, list) {
    battle.on('layerGain', (/** @type {LayerGainEv} */ ctx) => {
      if ((ctx.reason !== 'garrison' && ctx.reason !== 'item') || !ctx.source) return;
      for (const it of list) if (it.unit === ctx.source && it.unit.ownerId === ctx.playerId) ctx.n += S.num(it.bb.extra_cnt, 0);
    });
  },

  act1autochess_gar_event_addition_cnt(battle, list) {
    battle.on('layerGain', (/** @type {LayerGainEv} */ ctx) => {
      if (ctx.reason !== 'garrison' || !ctx.source) return;
      for (const it of list) {
        const h = it.unit;
        if (h.ownerId !== ctx.playerId || !S.onField(h)) continue;
        if (it.bbStr.range_id && it.bbStr.range_id !== '1-1') continue;
        if (sourceInFront(h, ctx.source, ctx.tile)) ctx.n += S.num(it.bb.extra_cnt, 0);
      }
    });
  },
  // 规程: "<战斗中>攻击范围内每有一名敌人被击倒…" (client: the dynamic ability puts act1autochess_gar_event_enemykilledinrange[e]
  // on the enemies of the range; ON_OWNER_KILLED counts current_cnt on the holder's buff, kill_count → trigger and back to 0).
  // A knock-out by anyone counts (the enemy's own event); the range is range_id (x-1 "周围12格") or the attack range, read
  // where the enemy falls, while the holder is on the field. [ASSUMED·CN: the dynamic ability prefab is CN-only — the
  // range buff follows the holder's live range; use_attack_range / bond_use_char_range / at_root all read as its attack range.]
  act1autochess_gar_event_enemykilled_inrange(battle, list) {
    for (const it of list) it.cnt = 0;
    battle.on('death', (/** @type {DeathEv} */ { unit, reason }) => {
      if (!unit || unit.side !== 'enemy' || reason !== 'killed') return;
      for (const it of list) {
        if (!S.onField(it.unit) || !inRangeOf(it.unit, unit, it.bbStr.range_id || 'attack', S.inRange)) continue;
        if (++it.cnt < Math.max(1, S.num(it.bb.kill_count, 1))) continue;
        it.cnt = 0;
        fire(battle, it);
      }
    });
  },

  // 规程 "<战斗开始时>…" (ON_AUTO_CHESS_MODE_CHANGED: the switch to the battle) — also the garrison_executed_on_start
  // triggers of 薇薇安娜 / Mon3tr / 凛御银灰 (叠层上限, effects/triggered.js)
  act3autochess_gar_event_battlestart(battle, list) {
    battle.on('battleStart', () => {
      for (const it of list) if (S.onField(it.unit)) fire(battle, it);
    });
  },

  // 规程 "…每有一名敌人触发元素损伤爆发…" (ON_BEFORE_EP_BREAK_START on the enemies of the range: range_id x-4 or the
  // attack range): any element's burst, before it resolves (the elementBurst hook)
  act3autochess_gar_event_enemy_epbreak_inrange(battle, list) {
    battle.on('elementBurst', (/** @type {BurstEv} */ { target }) => {
      if (!target || target.side !== 'enemy') return;
      for (const it of list) if (S.onField(it.unit) && inRangeOf(it.unit, target, it.bbStr.range_id || 'attack', S.inRange)) fire(battle, it);
    });
  },

  // 规程 浊心斯卡蒂 garrison_64 "攻击范围内每有一名我方干员部署…" (ON_OWNER_LOCATE on the allies of the holder's attack range):
  // every deployment of another operator of the player onto a tile of the range while the holder is on the field — the
  // battle-start placement (one piece after another, lifecycle _prebuiltStep: those placed after the holder), a redeploy,
  // a 突袭 landing; a 【移动】 is no deployment. [ASSUMED·CN: the dynamic ability prefab is CN-only — the holder itself does
  // not count.]
  act3autochess_gar_event_onstart_inrange(battle, list) {
    battle.on('deploy', (/** @type {DeployEv} */ { unit, move }) => {
      if (move || !unit || !S.isOp(unit)) return;

      for (const it of list) {
        const h = it.unit;
        if (unit !== h && unit.ownerId === h.ownerId && S.onField(h) && S.inRange(h, unit)) fire(battle, it);
      }
    });
  },
};

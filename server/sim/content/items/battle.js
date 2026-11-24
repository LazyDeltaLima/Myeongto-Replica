// server/sim/content/items/battle.js — battle side of the 56 equipment items (research 04 §4, docs/DATA.md §5).
//
// Every operator's `unit.items` (equipped ids; merged items are golden `_b` ids with their own numbers) becomes a set of
// item grants. A grant = one concrete item record installed on one unit through `installItem(battle, unit, itemId)`:
// its behaviour registers hooks / timers / buffs through a Scope, and `grant.dispose()` removes all of it again (used
// by lendItemEffects: 萨尔贡 × 娜仁图亚 lends a carrier's items to its neighbours for 60 s).
//
// What runs is chosen by the record's buffs, not its id: a stat buff (STAT_BUFFS), a behaviour of the buff's official key
// (bbStr.key; the tables of items/effects/*.js, by family), a hammer (蒸汽之心's list), and the three behaviours left keyed
// by item (BY_ITEM: 双模机械臂 has no numbers, 蒸汽之心 and 骑士戒律 read two buffs). So another season's item that carries
// one of these buffs gets its behaviour whatever its id, and an item that reuses an id with other buffs runs nothing it
// does not carry. Order per record (items/shared.js early / late): the stat buffs and the early behaviours in buff
// order, the hammer, the late behaviours in buff order, the item-keyed behaviour.
//
// Numbers always come from the concrete record's buffs (support.buffsOf: `{ ...bb, ...bbStr }` per buff, looked up by
// the buff's bbStr.key — the flattened `params` of data/items.json lose duplicate keys such as 蒸汽之心 attack_speed).
//
// Stat rule (PRTS 盟约记录 "装备效果提供的属性加成均为直接乘算"; 直接乘算 = summed with every other percentage, PRTS 游戏数据
// 基础 — research 04 §2's additive reading; v2.5 had each item its own multiplier): atk/def/max_hp → support directMods
// (atkPct/defPct/hpPct += x; constants.js DIRECT_BONUS_STACKING); attack_speed → aspd (additive);
// magic_resistance → resFlat; respawn_time → redeployMul 1 + x; sp_recovery_per_sec → spRecoveryFlat;
// magic_resist_penetrate → resIgnorePct; taunt_level → taunt. Two different items on one unit both apply, and a
// normal + golden copy of the same item may coexist (different ids → different buff keys) and both apply.
//
// Gating: "若携带者为【X】盟约干员" = memberOf (support.isMember: own bonds + 变形同构体 grants; 调和 members only while the
// core bond is active). Combo partners (bbStr.equip_chess_id / other_equip) are item keys without the _a/_b suffix:
// either quality satisfies them; lent items count as carried. Both are evaluated live, at the moment of use.
//
// Hook priorities (non-default): 'fatal' — consumable death savers run LAST, so a skill's / talent's own undying (kits
// use 10 … −60) never wastes a charge: 坚固维式重锤's lock (异常效果 不死, once per deployment — deploymentOf) at
// PRIO_REVIVE −100 and its running windows, held by one battle-level hook, at PRIO_UNDYING_HELD −99 — before a 傀儡师's
// switch to its 替身 (professions.js, −100: PRTS 分支特性信息 傀儡师 "受到足以致命的伤害且未持有不死的情况下"), while the
// lock itself still comes after that switch (as in 0.1.1). The 复活 — M3茧甲 here, 埃芒加德's band (bands/battle.js) —
// act on the knock-out itself: PRTS 卫戍协议：盟约 下半/PRTS盟约记录 备注 "“复活”的实现方式为：受益者因移动之外的原因退场时下
// 次部署的再部署时间和费用归零" — the unit IS knocked out (its `death` hooks, every 被击倒时 effect, run) and its next
// deployment, at once, free, where it lies, is a deployment like any other (部署时 effects, SP reset, a new lock): a
// `death` hook at PRIO_RESPAWN 13, then 埃芒加德 12 (PRIO_BAND_REVIVE), ahead of 阿戈尔 5's first-knock-out revive (11)
// and 不屈 (10) — reviveNow. A 不死 prevents the knock-out, so the lock always comes first whatever the equip order (player
// report F1 after 0.1.0: with the 茧甲 equipped first the revive ran first and the first lethal hit showed no lock). Until
// 0.2.0 both revived in place (`fatal` savers at −101 / −110): no 被击倒时 / 部署时 effect fired (community report
// 「像砾和瑕光这种死亡和部署的叠层效果，如果有艾芒加德的3次复活似乎是无法触发」).
// 骑士戒律's free in-skill undying runs early (20). Flat damage reduction 'hit' −10 (after the other damage modifiers).
// Proc damage dealt by items carries the tag 'item' and never re-triggers item procs.
//
// 蒸汽之心 (Victoria carrier) — LIVE model: the hammer types (灼燃/坚固/加速/战栗维式重锤) carried by the owner's operators
// that are on the field right now (cached ≤ 0.5 s, dropped whenever an operator deploys or leaves) are granted to the
// carrier; a hammer the carrier carries itself counts twice ("效果变为2倍"). Implemented as one shared hammer runtime
// per unit whose multiplier
// m = own copies of that hammer + (1 if 蒸汽之心 applies and the type is on the field): burn ×m of arts damage,
// undying duration ×m, ASPD ×m, tremble chance ×m. Granted hammers without an own copy use 蒸汽之心's blackboard.

import {
  num, itemRecord, dataFile, itemKeyOf, itemIdOfKey, buffsOf, isOp, onField, unitBonds, isGroundOp, passiveBuff, fxOn, tplFx,
  itemsOf, directMods, playerOps,
} from '../support/index.js';
import { hasHp } from '../../damage.js';
import {
  PRIO_REVIVE, PRIO_UNDYING_HELD, PRIO_FREE_UNDYING, partnerOf, isProc, procTags, chance, memberOf, runtime, grantsOf, carries,
  onDamageEnemies, weaknessRetype, isContinuous, late,
} from './shared.js';
import { BUFFS as DAMAGE } from './effects/damage.js';
import { BUFFS as STATUS } from './effects/status.js';
import { BUFFS as STACKS } from './effects/stacks.js';
import { BUFFS as SUSTAIN } from './effects/sustain.js';
import { BUFFS as RESOURCE } from './effects/resource.js';
import { BUFFS as BOND } from './effects/bond.js';

/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { Scheduled } from '../../battle/hooks.js' */
/** @import { DataScope, FatalEv } from '../support/index.js' */
/** @import { ItemParams, ItemRec, ItemEntry, ItemHooks } from './shared.js' */
/**
 * One item record installed on one unit (installItem): `scope` holds what it registered; a lent grant also carries
 * when it ends and who lent it (lendItemEffects).
 * @typedef {{ gid: string, id: string, key: string, lent: boolean, scope: Scope, timer: Scheduled | null,
 *   dispose: () => void, until?: number, lender?: Unit }} Grant
 * The per-unit hammer runtime (hammerState): own copies and params per hammer type, 蒸汽之心's and 终极维式重锤's share.
 * @typedef {{ own: Record<string, number>, params: Record<string, ItemParams | null>, steam: number,
 *   steamP: ItemParams | null, ult: Set<string> | null, ultP: ItemParams | null, refs: number, scope: Scope | null,
 *   aspdCur: number, lockAt: string | null }} HammerState
 * A queued buff of an override group (joinOverrideGroup).
 * @typedef {{ b: { bbKey: string | null, p: ItemParams }, S: Scope, rec: ItemRec }} OverrideEntry
 * The battle's item runtime (items/shared.js runtime): grants per unit, hammer states, the 蒸汽之心 field cache per
 * player, the 坚固 hook, the override groups and the copy counter.
 * @typedef {{ grants: Map<Unit, Map<string, Grant>>, hammers: Map<Unit, HammerState>,
 *   field: Map<string | null, { t: number, set: Set<string> }>, lends: Map<unknown, unknown>, undyingHook?: unknown,
 *   override?: Map<Unit, Map<string | null, OverrideEntry[]>>, copySeq?: number }} ItemRuntime
 * An item-keyed behaviour (BY_ITEM).
 * @typedef {(battle: Battle, u: Unit, rec: ItemRec, S: Scope, grant: Grant) => void} ItemKeyed
 * @typedef {Scope} ItemScope
 */

export {
  PRIO_REVIVE, PRIO_UNDYING_HELD, PRIO_RESPAWN, memberOf, carries, reviveNow, weaknessRetype, addShieldLayer,
} from './shared.js';

/** 蒸汽之心's buff (the hammer list; 终极维式重锤's too, in 规程). */
const STEAM_BUFF = 'act1autochess_equip_acarm079_global_buff';
/**
 * 终极维式重锤 (规程): its STEAM_BUFF is 蒸汽之心's key with the 规程 form of the per-unit buff act1autochess_acarm079_buff
 * (atk_per_hammer, hammer_1…5; 蒸汽之心 itself stays item-keyed — BY_ITEM). Client buff template (规程 tables),
 * ON_BUFF_START: for each hammer_N, AutoChessCheckHasEquip `_checkAllSamePlayerIndex` `_excludeTarget` — any other chess
 * of the carrier's player in this battle (the client's chessInstMap: characters `isInBattle` of that player index, the
 * carrier left out; 공식 클라에서 확인), on the field or not — ⇒ CreateBuff of that hammer's own per-unit buff on the
 * carrier with this buff's blackboard (the five specials at the hammers' numbers); then hammer_cnt = 1 + every hammer_N
 * any of the player's chess carries, the carrier included, and ATK MULTIPLIER atk_per_hammer × hammer_cnt (直接乘算).
 * No bond gate and no doubling (蒸汽之心's ×2 is the default season's). Judged when the buff starts.
 * @type {import('./shared.js').ItemFn}
 */
function ultimateHammer(battle, u, p, S) {
  if (p.atk_per_hammer == null) return; // the default season's 蒸汽之心 (BY_ITEM)
  const rt = runtime(battle);
  /** @type {Set<string>} */
  const others = new Set(), /** @type {Set<string>} */ all = new Set();
  for (const a of playerOps(battle, u.ownerId)) {
    for (const id of itemsOf(a)) {
      const h = hammerInfo(itemKeyOf(id, battle), battle);
      if (!h) continue;
      all.add(h.type);
      if (a !== u) others.add(h.type);
    }
  }
  const hs = hammerAcquire(battle, rt, u);
  hs.ult = others;
  hs.ultP = p;
  hammerRefresh(battle, rt, u, hs);
  S.onDispose(() => { hs.ult = null; hs.ultP = null; hammerRelease(battle, rt, u, hs); });
  const atk = num(p.atk_per_hammer) * (1 + all.size);
  if (atk) S.stat('ultimate', directMods({ atk }));
  // the template's CreateEffect map_act1autochess_reinforce_02 on the carrier (display only)
  S.on('deploy', (c) => { if (c.unit === u) tplFx(battle, u, 'map_act1autochess_reinforce_02', u); });
  if (onField(u)) tplFx(battle, u, 'map_act1autochess_reinforce_02', u);
}
const HAMMER = { [STEAM_BUFF]: late(ultimateHammer) };

/** The buff-key behaviours of every family (a key in two families throws). */
const BY_BUFF = (() => {
  /** @type {Record<string, ItemEntry>} */
  const out = {};
  for (const [fam, t] of Object.entries({ DAMAGE, STATUS, STACKS, SUSTAIN, RESOURCE, BOND, HAMMER })) {
    for (const [k, v] of Object.entries(t)) {
      if (Object.hasOwn(out, k)) throw new Error(`items/effects: buff key ${k} twice (${fam})`);
      out[k] = v;
    }
  }
  return Object.freeze(out);
})();

// =====================================================================================================================
// data helpers

/**
 * Buff params `{ ...bb, ...bbStr }` of the record's buff whose bbStr.key is `bbKey` (null when absent).
 * @param {ItemRec | null | undefined} rec @param {string | null} bbKey @returns {ItemParams | null}
 */
function bp(rec, bbKey) {
  for (const b of buffsOf(rec)) if (b.bbKey === bbKey) return b.p;
  return null;
}
/** Stat keys of a stat buff → mods (直接乘算, see header). Asked with a buff's bbKey, null when it has none. @type {Set<string | null>} */
const STAT_BUFFS = new Set([
  'attr_common_global_buff', 'act1autochess_equip_acarm056_global_buff', 'act1autochess_equip_acarm050_global_buff',
  'magic_penetrate_global_buff', 'act1autochess_equip_acarm054_global_buff',
]);
/** @param {ItemParams} p */
function statMods(p) {
  /** @type {Record<string, number>} */
  const m = {};
  let any = false;
  const set = (/** @type {string} */ k, /** @type {number} */ v) => { m[k] = v; any = true; };
  // ATK / DEF / max HP "+X%" are 直接乘算 (support directMods: additive with every other percentage)
  for (const [k, v] of Object.entries(directMods({ atk: num(p.atk), def: num(p.def), hp: num(p.max_hp) ? Math.max(-0.99, num(p.max_hp)) : 0 }))) set(k, v);
  if (num(p.attack_speed)) set('aspd', num(p.attack_speed));
  if (num(p.magic_resistance)) set('resFlat', num(p.magic_resistance));
  if (num(p.respawn_time)) set('redeployMul', Math.max(0, 1 + num(p.respawn_time)));
  if (num(p.sp_recovery_per_sec)) set('spRecoveryFlat', num(p.sp_recovery_per_sec));
  if (num(p.magic_resist_penetrate)) set('resIgnorePct', num(p.magic_resist_penetrate));
  if (num(p.taunt_level)) set('taunt', num(p.taunt_level));
  return any ? m : null;
}

// ---- hammers (蒸汽之心) — derived from data: hammer records carry bbStr.big_hammer on their special buff
/** @param {ItemParams | null | undefined} p */
function hammerTypeOf(p) {
  if (!p) return null;
  // 电流维式重锤 (规程): its special buff act3autochess_equip_acarm140_global_buff reads palsy_prob / def_penetrate
  if (p.palsy_prob != null) return 'palsy';
  if (p.damage_scale != null) return 'burn';
  if (p.undeadable_duration != null) return 'undying';
  if (p.disarmed_duration != null) return 'tremble';
  if (p.attack_speed != null) return 'aspd';
  return null;
}
/**
 * The params of the season's hammer list: the first normal record whose STEAM_BUFF names `hammer_N` items — 蒸汽之心
 * (chess_item_6_05_e) in the default season, 终极维式重锤 (its own key) in 规程, which has no 蒸汽之心. The list names item
 * ids of that season without the quality suffix (itemKeyOf turns them into the handler keys).
 * @param {Record<string, ItemRec | null>} items
 */
function hammerListOf(items) {
  for (const r of Object.values(items)) {
    if (!r || r.isGolden || r.itemType !== 'EQUIP') continue;
    const p = bp(r, STEAM_BUFF);
    if (p && Object.keys(p).some((k) => /^hammer_\d+$/.test(k))) return p;
  }
  return null;
}
/** @type {WeakMap<object, Map<string, { type: string, bbKey: string | null } | null>>} items file → hammer item key → { type, bbKey } */
const HAMMERS = new WeakMap();
/**
 * The hammer of an item key in the scope's data (support dataFile; default: the default season's), or null.
 * @param {string} key @param {DataScope} [scope]
 */
function hammerInfo(key, scope = null) {
  const items = dataFile(scope, 'items') || {};
  let map = HAMMERS.get(items);
  if (!map) {
    map = new Map();
    const sp = hammerListOf(items);
    const keys = sp ? Object.keys(sp).filter((k) => /^hammer_\d+$/.test(k)).map((k) => itemKeyOf(sp[k], scope)) : [];
    for (const k of keys) {
      const rec = itemRecord(itemIdOfKey(k, scope) ?? '', scope);
      const b = rec ? buffsOf(rec).find((x) => x.p.big_hammer != null) : null;
      const type = b ? hammerTypeOf(b.p) : null;
      if (type) map.set(k, { type, bbKey: /** @type {{ bbKey: string | null }} */ (b).bbKey }); // a type only with a buff
    }
    HAMMERS.set(items, map);
  }
  return map.get(key) ?? null;
}

// =====================================================================================================================
// Scope: everything an item behaviour registers, removable at once

class Scope {
  /** @param {Battle} battle @param {Unit} unit @param {string} tag */
  constructor(battle, unit, tag) {
    this.b = battle;
    this.u = unit;
    this.tag = tag;
    /** @type {object[]} */
    this.hooks = [];
    /** @type {Scheduled[]} */
    this.scheds = [];
    /** @type {Array<[Unit, string]>} */
    this.buffs = [];
    /** @type {Array<() => void>} */
    this.fns = [];
    this.disposed = false;
  }
  /** @param {string} part */
  key(part) { return `${this.tag}:${part}`; }
  /**
   * @template {keyof ItemHooks} K
   * @param {K} name @param {(c: ItemHooks[K]) => void} fn @param {number} [priority]
   */
  on(name, fn, priority = 0) {
    const h = this.b.on(name, fn, { owner: this.u, priority });
    if (h) this.hooks.push(h);
    return h;
  }
  /** @param {number} sec @param {() => void} fn @param {{ immediate?: boolean }} [opts] */
  every(sec, fn, opts = {}) { const s = this.b.every(sec, fn, { owner: this.u, ...opts }); this.scheds.push(s); return s; }
  /** @param {number} sec @param {() => void} fn */
  after(sec, fn) { const s = this.b.after(sec, fn, { owner: this.u }); this.scheds.push(s); return s; }
  /**
   * Match-long stat buff on the carrier (persist, survives death/redeploy).
   * @param {string} part @param {Record<string, any> | null} mods @param {Record<string, any>} [extra]
   */
  stat(part, mods, extra = {}) {
    const k = this.key(part);
    const r = passiveBuff(this.b, this.u, k, mods, extra);
    if (r) this.track(this.u, k);
    return r;
  }
  /**
   * Any buff on any unit, removed at dispose.
   * @param {Unit} target @param {{ key: string, [field: string]: any }} b
   */
  buff(target, b) {
    const r = this.b.addBuff(target, b);
    if (r) this.track(target, b.key);
    return r;
  }
  /** @param {Unit} target @param {string} key */
  track(target, key) { if (!this.buffs.some(([t, k]) => t === target && k === key)) this.buffs.push([target, key]); }
  /** @param {() => void} fn */
  onDispose(fn) { this.fns.push(fn); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const h of this.hooks) this.b.off(h);
    for (const s of this.scheds) s.cancel();
    for (const [t, k] of this.buffs) this.b.removeBuff(t, k);
    for (const f of this.fns) { try { f(); } catch { /* keep disposing */ } }
    this.hooks = []; this.scheds = []; this.buffs = []; this.fns = [];
  }
}

// =====================================================================================================================
// hammer runtime (shared per unit: own hammers + 蒸汽之心)

/** @param {Battle} battle @param {ItemRuntime} rt @param {string | null} pid */
function fieldHammers(battle, rt, pid) {
  let c = rt.field.get(pid);
  if (!c) { c = { t: -Infinity, set: new Set() }; rt.field.set(pid, c); }
  if (battle.time - c.t >= 0.5 - 1e-9) {
    c.t = battle.time;
    c.set.clear();
    for (const a of battle.allyUnits) {
      if (a.kind !== 'op' || a.ownerId !== pid || !onField(a)) continue;
      for (const id of itemsOf(a)) { const h = hammerInfo(itemKeyOf(id, battle), battle); if (h) c.set.add(h.type); }
    }
  }
  return c.set;
}

/** @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u */
function hammerState(battle, rt, u) {
  let hs = rt.hammers.get(u);
  if (!hs) {
    // lockAt: the deployment (deploymentOf) whose 坚固 lock is spent — kept here, not in the grant's Scope, so a lend
    // that ends and comes back never resets it, and a redeploy while no hammer is held still re-arms it
    // ult / ultP: the hammer types 终极维式重锤 grants and its params (ultimateHammer)
    hs = { own: { burn: 0, undying: 0, aspd: 0, tremble: 0, palsy: 0 }, params: {}, steam: 0, steamP: null, ult: null, ultP: null, refs: 0, scope: null, aspdCur: 0, lockAt: null };
    rt.hammers.set(u, hs);
  }
  return hs;
}

// 坚固维式重锤's 不死 lock — once per DEPLOYMENT (the user's first-hand memory of the official mode, 2026-10-03: "每次部署
// 一次"; the text only says 首次). The lock belongs to the deployment, not to the grant that gave it: a borrower (萨尔贡 ×
// 娜仁图亚's 60 s lend) follows the same rule as an owner.

/**
 * The deployment `u` is in: every deploy bumps `deploySeq` — the redeploy after a knock-out, a 突袭 retreat + redeploy
 * [ASSUMED a deployment], 阿戈尔's 立刻复活 and every 复活 (M3茧甲, 埃芒加德: reviveNow — PRTS "“复活”的实现方式为：受益者因移动
 * 之外的原因退场时下次部署的再部署时间和费用归零", a 0-time / 0-cost redeploy; in place until 0.2.0, when an extra counter
 * opened the new deployment). Also read by 阿戈尔's devour (bonds/nation/egir.js): a unit whose deployment changed during the
 * pass was knocked out.
 * @param {Unit} u
 */
export function deploymentOf(u) { return `${u.deploySeq}`; }

/**
 * Does `u` hold 坚固维式重锤's 不死 right now — a window started in this deployment that has not run out? The window lives
 * on the unit (`mem.undyingUntil`, `mem.undyingAt`) and a battle-level hook holds it (hammerAcquire), so it outlives the
 * grant that started it — a lend running out mid-window leaves the 不死 for its 8 s [ASSUMED: the 异常效果 outlasts its
 * source] — and ends with the deployment. 信仰搅拌机 S2 steps aside while it holds (kits/ops/chess_char_4_01-rmixer.js).
 * A content 不死 window counts too: a buff with the flag `undying` (upstream's 自选 淬羽赫默 S3 无畏者协议 set one —
 * its own battle-level hook held it; no kit here does), so the savers that do not spend themselves while a 不死 holds ("_dontConsumeWhenUndeadable":
 * 左乐, 莱恩哈特, 信仰搅拌机) step aside for it as well.
 * @param {Battle} battle @param {Unit | null | undefined} u
 */
export function holdsUndying(battle, u) {
  if (!u) return false;
  if (u.mem.undyingAt != null && battle.time < u.mem.undyingUntil && u.mem.undyingAt === deploymentOf(u)) return true;
  return !!(u.s && u.s.flags.undying);
}
/**
 * Effective multiplier of a hammer type on `u` and its params (null when the type does not apply).
 * @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u @param {HammerState} hs @param {string} type
 */
function hammerMul(battle, rt, u, hs, type) {
  const own = hs.own[type];
  const steam = hs.steam > 0 && memberOf(battle, u, 'victoriaShip') && fieldHammers(battle, rt, u.ownerId).has(type) ? 1 : 0;
  // 终极维式重锤's grant is the hammer's own per-unit buff (act1autochess_acarm04x_buff, one override group): it adds
  // nothing to a type the carrier already has
  if (own + steam === 0 && hs.ult && hs.ult.has(type)) return 1;
  return own + steam;
}
const hammerParams = (/** @type {HammerState} */ hs, /** @type {string} */ type) => hs.params[type] ?? hs.steamP ?? hs.ultP ?? null;

/** @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u @param {HammerState} hs */
function hammerRefresh(battle, rt, u, hs) {
  if (!hs.scope) return;
  const p = hammerParams(hs, 'aspd');
  const v = p ? num(p.attack_speed) * hammerMul(battle, rt, u, hs, 'aspd') : 0;
  if (v === hs.aspdCur) return;
  hs.aspdCur = v;
  const k = hs.scope.key('aspd');
  if (v) hs.scope.stat('aspd', { aspd: v });
  else battle.removeBuff(u, k);
}

/** @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u */
function hammerAcquire(battle, rt, u) {
  const hs = hammerState(battle, rt, u);
  hs.refs++;
  if (hs.scope) return hs;
  // every running 坚固 window of the battle (holdsUndying): one hook that no grant owns, ahead of every lock hook and of a
  // 傀儡师's switch to its 替身 (PRIO_UNDYING_HELD: a 本体 holding 不死 does not switch)
  if (!rt.undyingHook) {
    rt.undyingHook = battle.on('fatal', (/** @type {FatalEv} */ c) => { if (!c.prevented && holdsUndying(battle, c.unit)) c.prevented = true; }, { priority: PRIO_UNDYING_HELD });
  }
  const S = new Scope(battle, u, `item:hammer#${u.id}`);
  hs.scope = S;
  hs.aspdCur = 0;
  S.every(0.5, () => hammerRefresh(battle, rt, u, hs), { immediate: true });
  // 灼燃: arts damage also deals burn (元素损伤) = damage_scale × damage × m — not on a killing blow (the hook runs
  // before the kill, at 0 HP: no burst on the corpse)
  S.on('damaged', (c) => {
    if (c.source !== u || c.type !== 'arts' || !(c.amount > 0) || isProc(c.dmg) || !c.target || c.target.side !== 'enemy' || !hasHp(c.target)) return;
    const p = hammerParams(hs, 'burn');
    if (!p) return;
    const m = hammerMul(battle, rt, u, hs, 'burn');
    if (m > 0) battle.dealDamage(u, c.target, { type: 'element', element: 'burn', amount: c.amount * num(p.damage_scale) * m, tags: procTags('hammer_burn') });
  });
  // 战栗: 地面干员 carrier (melee position, any tile — support isGroundOp), every damage instance it deals (client graph
  // act1autochess_equip_acarm045 ON_OUTPUT_DAMAGE IsDamage + CheckBuildableType MELEE → Dice) prob × m ⇒ 战栗
  // disarmed_duration s
  onDamageEnemies(S, u, (t) => {
    if (!isGroundOp(u)) return;
    const p = hammerParams(hs, 'tremble');
    if (!p) return;
    const m = hammerMul(battle, rt, u, hs, 'tremble');
    if (!(m > 0)) return;
    if (chance(battle, Math.min(1, num(p.prob) * m))) battle.applyStatus(t, 'tremble', { duration: num(p.disarmed_duration, 2), source: u });
  });
  // 电流 (规程, act3autochess_equip_acarm140_global_buff): ON_OUTPUT_DAMAGE (no 持续 / cancelled damage) Dice palsy_prob ×
  // m ⇒ 1 麻痹 stack (palsy[stack]); ON_CALCULATE_DAMAGE against a 麻痹 target DEF_PENETRATE / MAGIC_RESIST_PENETRATE
  // +def_penetrate / +magic_resist_penetrate (无视 that share of DEF and RES) for that damage. The graph's
  // christ_t_1[damage] exception is element damage here, which onDamageEnemies leaves out anyway
  onDamageEnemies(S, u, (t, c) => {
    if (isContinuous(c.dmg)) return;
    const p = hammerParams(hs, 'palsy');
    if (!p) return;
    const m = hammerMul(battle, rt, u, hs, 'palsy');
    if (m > 0 && chance(battle, Math.min(1, num(p.palsy_prob) * m))) battle.applyStatus(t, 'palsy', { value: 1, source: u });
  });
  S.on('hit', (c) => {
    if (c.source !== u || !c.target || c.target.side !== 'enemy' || c.dmg.type === 'element' || !c.target.findBuff('palsy')) return;
    const p = hammerParams(hs, 'palsy');
    if (!p || !(hammerMul(battle, rt, u, hs, 'palsy') > 0)) return;
    c.dmg.defIgnorePct += num(p.def_penetrate);
    c.dmg.resIgnorePct += num(p.magic_resist_penetrate);
  });
  // 坚固: the first lethal hit of each deployment (deploymentOf) ⇒ HP never below 1 for undeadable_duration × m s — the
  // window, held by the battle-level hook above. A new deployment re-arms the lock and leaves a window still running
  // behind (the retreat ends the unit's states). Any lethal HP loss sets it off, an ally's (the 阿戈尔 battle-start
  // devour, "造成5000点物理伤害") or the carrier's own (源石溶剂) included.
  S.on('fatal', (c) => {
    if (c.unit !== u || c.prevented) return;
    const at = deploymentOf(u);
    if (hs.lockAt === at) return;
    const p = hammerParams(hs, 'undying');
    if (!p) return;
    const m = hammerMul(battle, rt, u, hs, 'undying');
    if (!(m > 0)) return;
    hs.lockAt = at;
    const dur = num(p.undeadable_duration, 8) * m;
    u.mem.undyingUntil = battle.time + dur;             // the carrier holds 不死 (holdsUndying)
    u.mem.undyingAt = at;
    c.prevented = true;
    fxOn(battle, 'undying', u, 'item:hammer', 'chess_item_3_09_e', { duration: dur });
  }, PRIO_REVIVE);
  return hs;
}
/** @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u @param {HammerState} hs */
function hammerRelease(battle, rt, u, hs) {
  hs.refs = Math.max(0, hs.refs - 1);
  if (hs.refs > 0 || !hs.scope) { hammerRefresh(battle, rt, u, hs); return; }
  hs.scope.dispose();
  hs.scope = null;
  hs.aspdCur = 0;
}

// =====================================================================================================================
// item-keyed behaviours: key → (battle, u, rec, S, grant) — register through S (disposed with the grant). The buff-key
// behaviours are the tables of items/effects/*.js.

/** The three behaviours keyed by item (header). @type {Record<string, ItemKeyed>} */
const BY_ITEM = {
  // 双模机械臂: physical/arts damage becomes 弱点伤害 (whichever type the target resists less). Its global buff gives the
  // carrier act1autochess_acarm067_buff (INFINITY, overrideEffectKey map_act1autochess_chaosbuff_01): 'item:dualArm', a buff
  // without mods for the client's effect (render/fxstatus.js KEY_FX)
  chess_item_5_03_e(battle, u, rec, S) {
    S.on('hit', (c) => { if (c.source === u) weaknessRetype(c.dmg, u, c.target); }, 5);
    if (passiveBuff(battle, u, 'item:dualArm', null, { visible: true })) S.track(u, 'item:dualArm');
  },
  // 蒸汽之心 (维多利亚): hammer effects of the field (see header)
  chess_item_6_05_e(battle, u, rec, S) {
    const rt = runtime(battle);
    const hs = hammerAcquire(battle, rt, u);
    hs.steam++;
    if (!hs.steamP) hs.steamP = bp(rec, STEAM_BUFF);
    hammerRefresh(battle, rt, u, hs);
    S.onDispose(() => { hs.steam = Math.max(0, hs.steam - 1); hammerRelease(battle, rt, u, hs); });
    // client buff template act1autochess_acarm079_buff ON_BUFF_START: AutoChessFilterCharacterBondIds victoriaShip (own
    // bonds, no _considerManiShip) → CreateEffect, at every deployment of a 维多利亚 carrier (display only)
    const show = () => { if (unitBonds(u, battle).includes('victoriaShip')) tplFx(battle, u, 'map_act1autochess_reinforce_02', u); };
    S.on('deploy', (c) => { if (c.unit === u) show(); });
    if (onField(u)) show();
  },
  // 骑士戒律 (卡西米尔): skill start ⇒ 20 s aura: enemies in range ASPD ×attack_speed, move ×move_speed;
  //   + 卡西米尔竞技旗: during the (timed) skill ATK +atk, lethal damage does not retreat it — it falls when the skill ends
  //   ("受到致命伤害时不撤退，技能结束后退场"; client buff graph act2autochess_equip_acarm119_global_buff[ex]: UNDEADABLE, and
  //   ON_BUFF_FINISH after ON_BEFORE_TRY_SET_HP_ZERO → InstantKill `_noSource` `_skipReborn` — a knock-out with no killer;
  //   until 2026-10-31 a `dying` retreat)
  chess_item_6_10_e(battle, u, rec, S) {
    const p = bp(rec, 'act2autochess_equip_acarm119_global_buff');
    const a = bp(rec, 'act2autochess_equip_acarm119_ability');
    if (!p) return;
    const partner = partnerOf(p, battle);
    const win = num(p.duration, 20);
    const aspdMul = a ? num(a.attack_speed, 1) : 1, moveMul = a ? num(a.move_speed, 1) : 1;
    const auraKey = S.key('aura'), comboKey = S.key('combo');
    let until = -Infinity, combo = false, doomed = false;
    S.on('skillStart', (c) => {
      if (c.unit !== u || !memberOf(battle, u, 'kazimierzShip')) return;
      until = battle.time + win;
      if (partner && carries(battle, u, partner) && c.skill && c.skill.isTimed) {
        combo = true;
        doomed = false;
        S.buff(u, { key: comboKey, mods: directMods({ atk: num(p.atk) }) });
      }
    });
    S.on('skillEnd', (c) => {
      if (c.unit !== u || !combo) return;
      combo = false;
      battle.removeBuff(u, comboKey);
      if (doomed && c.reason !== 'death') {
        doomed = false;
        battle.after(0, () => { if (u.alive) battle.kill(u, null); });
      }
    });
    S.on('fatal', (c) => {
      if (c.unit !== u || c.prevented || !combo) return;
      c.prevented = true;
      doomed = true;
    }, PRIO_FREE_UNDYING);
    S.every(0.5, () => {
      if (battle.time >= until || !onField(u)) return;
      for (const e of battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true })) {
        S.buff(e, { key: auraKey, duration: 0.6, refresh: 'replace', mods: { aspd: -(1 - aspdMul) * num(e.base.aspd, 100), moveMul } });
      }
    }, { immediate: true });
  },
};
/**
 * The buffs each item-keyed behaviour reads from its record (content/coverage.js: `wrong` when the record has none).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const BY_ITEM_ASKS = Object.freeze({
  chess_item_5_03_e: Object.freeze([]),
  chess_item_6_05_e: Object.freeze([STEAM_BUFF]),
  chess_item_6_10_e: Object.freeze(['act2autochess_equip_acarm119_global_buff', 'act2autochess_equip_acarm119_ability']),
});
for (const k of new Set([...Object.keys(BY_ITEM), ...Object.keys(BY_ITEM_ASKS)])) {
  if (!BY_ITEM[k] || !BY_ITEM_ASKS[k]) throw new Error(`items/battle.js: ${k} needs both a behaviour and its asked buffs`);
}

/**
 * Does this record have a battle part? (stat buffs, buff-key behaviours, hammer specials, item-keyed behaviours; the
 * hammers of the scope's data)
 * @param {ItemRec | null | undefined} rec @param {DataScope} [scope]
 */
export function hasBattleEffect(rec, scope = null) {
  if (!rec || rec.itemType !== 'EQUIP') return false;
  const key = itemKeyOf(rec.id, scope);
  if (BY_ITEM[key] || hammerInfo(key, scope)) return true;
  return buffsOf(rec).some((b) => STAT_BUFFS.has(b.bbKey) || BY_BUFF[b.bbKey]);
}

// =====================================================================================================================
// grants

/**
 * One global buff `b` of item record `rec` on carrier `u`, registered on the item's scope `S`: a stat buff or an early behaviour.
 * @param {Battle} battle @param {Unit} u @param {OverrideEntry['b']} b @param {Scope} S @param {ItemRec} rec
 */
function applyItemBuff(battle, u, b, S, rec) {
  if (STAT_BUFFS.has(b.bbKey)) {
    const mods = statMods(b.p);
    if (mods) S.stat(`stat:${b.bbKey}`, mods);
    return;
  }
  const e = BY_BUFF[/** @type {string} */ (b.bbKey)]; // a null key finds no entry
  if (e && !e.late) e.run(battle, u, b.p, S, rec);
}

/**
 * The item global buffs whose per-unit buff keeps the client's override group (`[uc]globalbuffs.ab`: `disableOverride` 0,
 * `overrideType` DEFAULT, 공식 클라에서 확인): 萨尔贡浓茶's and 家族徽章's SP regeneration (buff `act1autochess_acarm050_global_buff`)
 * and 海沟实验体's fixed damage block (`[g]halfidle_block_fixed_damage`). The client's `Buff.OverrideGroup` queues the buffs of
 * one key on a unit and enables only the first one not finished — so an operator carrying two of them (two copies, or
 * 萨尔贡浓茶 with 家族徽章) gets the first one's value only, and the next one takes over when the first goes.
 */
const OVERRIDE_GROUPED = new Set(['act1autochess_equip_acarm050_global_buff', 'halfidle_block_fixed_damage']);

/**
 * Queue item buff `b` (scope `S`) in carrier `u`'s override group of its key: applied now if first, else when the ones before it go.
 * @param {Battle} battle @param {ItemRuntime} rt @param {Unit} u @param {OverrideEntry['b']} b @param {Scope} S @param {ItemRec} rec
 */
function joinOverrideGroup(battle, rt, u, b, S, rec) {
  const groups = rt.override || (rt.override = new Map());
  let byKey = groups.get(u);
  if (!byKey) { byKey = new Map(); groups.set(u, byKey); }
  let q = byKey.get(b.bbKey);
  if (!q) { q = []; byKey.set(b.bbKey, q); }
  const entry = { b, S, rec };
  q.push(entry);
  if (q.length === 1) applyItemBuff(battle, u, b, S, rec);
  S.onDispose(() => {
    const i = q.indexOf(entry);
    if (i < 0) return;
    q.splice(i, 1);
    if (i === 0 && q.length) applyItemBuff(battle, u, q[0].b, q[0].S, q[0].rec);
  });
}

/**
 * Install the battle effects of item `itemId` on `u`. `lent` grants use their own buff keys (`@lend`).
 * Returns the grant `{ id, key, lent, dispose() }` or null when the item has no battle part.
 * @param {Battle} battle @param {Unit} u @param {string} itemId @param {{ lent?: boolean }} [opts] @returns {Grant | null}
 */
export function installItem(battle, u, itemId, { lent = false } = {}) {
  // hasBattleEffect is false for a missing record
  const rec = /** @type {ItemRec} */ (itemRecord(itemId, battle));
  if (!isOp(u) || !hasBattleEffect(rec, battle)) return null;
  const rt = runtime(battle);
  const gm = grantsOf(rt, u);
  const gid = lent ? `lend:${itemId}` : `own:${itemId}:${gm.size}`;
  // a further own copy of the same item (two advanced 源石溶剂 on one operator; upstream #902) installs under its own keys,
  // so every copy counts: the client's per-unit buffs of the item global buffs (battle/prefabs `[uc]globalbuffs.ab`,
  // 공식 클라에서 확인) all set `disableOverride` — no override group — but the two of OVERRIDE_GROUPED. Until 2026-11-07
  // the second copy's buffs replaced the first's. The first copy keeps the plain tag; a lent copy keeps `@lend`
  // (lending the same id again only refreshes it).
  const copies = lent ? 0 : [...gm.values()].filter((g) => !g.lent && g.id === itemId).length;
  const tag = lent ? '@lend' : copies ? `#${(rt.copySeq = (rt.copySeq || 0) + 1)}` : '';
  const S = new Scope(battle, u, `item:${itemId}${tag}`);
  const key = itemKeyOf(itemId, battle);
  const grant = /** @type {Grant} */ ({ gid, id: itemId, key, lent, scope: S, timer: null, dispose: /** @type {() => void} */ (/** @type {unknown} */ (null)) });
  grant.dispose = () => {
    if (S.disposed) return;
    S.dispose();
    if (grant.timer) grant.timer.cancel();
    if (gm.get(gid) === grant) gm.delete(gid);
  };
  gm.set(gid, grant);
  try {
    const buffs = buffsOf(rec);
    for (const b of buffs) {
      if (OVERRIDE_GROUPED.has(b.bbKey)) joinOverrideGroup(battle, rt, u, b, S, rec);
      else applyItemBuff(battle, u, b, S, rec);
    }
    const h = hammerInfo(key, battle);
    if (h) {
      const hs = hammerAcquire(battle, rt, u);
      hs.own[h.type]++;
      if (!hs.params[h.type]) hs.params[h.type] = bp(rec, h.bbKey);
      hammerRefresh(battle, rt, u, hs);
      S.onDispose(() => { hs.own[h.type] = Math.max(0, hs.own[h.type] - 1); hammerRelease(battle, rt, u, hs); });
    }
    for (const b of buffs) { const e = BY_BUFF[b.bbKey]; if (e && e.late) e.run(battle, u, b.p, S, rec); }
    if (BY_ITEM[key]) BY_ITEM[key](battle, u, rec, S, grant);
  } catch (e) {
    battle._handlerError?.(`item:${itemId}`, u, e);
  }
  return grant;
}

/** Battle install: every operator's equipped items. Nearly free when nobody carries equipment. @param {Battle} battle */
export function install(battle) {
  let any = false;
  for (const u of battle.allyUnits) if (u.kind === 'op' && itemsOf(u).length) { any = true; break; }
  if (!any) return;
  for (const u of battle.allyUnits) {
    if (u.kind !== 'op') continue;
    for (const id of itemsOf(u)) installItem(battle, u, id);
  }
}

/**
 * 萨尔贡 × 娜仁图亚 (P1): temporarily grant `toUnit` the battle effects of every item `fromUnit` carries with
 * tier ≤ maxTier (meta-only / consume items skipped) for `duration` s. Lending the same item id to the same unit again
 * refreshes its timer (no stacking, whoever lends it). Returns the number of item effects lent (new + refreshed).
 * @param {Battle} battle @param {Unit} fromUnit @param {Unit} toUnit @param {{ maxTier?: number, duration?: number }} [opts]
 */
export function lendItemEffects(battle, fromUnit, toUnit, { maxTier = 5, duration = 60 } = {}) {
  if (!battle || !isOp(fromUnit) || !isOp(toUnit) || fromUnit === toUnit) return 0;
  if (!toUnit.alive || toUnit.removed) return 0;
  const dur = num(duration, 60);
  if (!(dur > 0)) return 0;
  const rt = runtime(battle);
  const gm = grantsOf(rt, toUnit);
  let n = 0;
  for (const id of itemsOf(fromUnit)) {
    const rec = itemRecord(id, battle);
    if (!rec || num(rec.tier, 99) > maxTier || !hasBattleEffect(rec, battle)) continue;
    /** @type {Grant | null | undefined} */
    let g = gm.get(`lend:${id}`);
    if (!g) g = installItem(battle, toUnit, id, { lent: true });
    if (!g) continue;
    if (g.timer) g.timer.cancel();
    g.until = battle.time + dur;
    g.timer = battle.after(dur, () => g.dispose());
    g.lender = fromUnit;
    n++;
  }
  if (n) fxOn(battle, 'buff', toUnit, 'item:lend', 'lend', { from: fromUnit.id, n, duration: dur });
  return n;
}

/**
 * End now the item effects `fromUnit` lent `toUnit` (lendItemEffects) — 规程's 维多利亚 6 when the lending buff ends
 * before its time (its ON_BUFF_DISABLE AutoChessRemoveEquipEffectByAlias). An effect another unit lent again since is
 * that unit's and stays. Returns the number ended.
 * @param {Battle | null | undefined} battle @param {Unit} fromUnit @param {Unit} toUnit
 */
export function endLentItems(battle, fromUnit, toUnit) {
  const gm = battle ? runtime(battle).grants.get(toUnit) : null;
  if (!gm) return 0;
  let n = 0;
  for (const g of [...gm.values()]) if (g.lent && g.lender === fromUnit) { g.dispose(); n++; }
  return n;
}

/** Active grants of a unit (tests / UI): [{ id, key, lent, until? }]. @param {Battle} battle @param {Unit} u */
export function itemGrants(battle, u) {
  const g = runtime(battle).grants.get(u);
  return g ? [...g.values()].map((x) => ({ id: x.id, key: x.key, lent: x.lent, until: x.until })) : [];
}

/**
 * What this file acts on, by the record's data (content/coverage.js, the season coverage report): the stat buff keys,
 * the buff-key behaviours, the item-keyed behaviours with the buffs each reads from its record, and the hammer of an
 * item key.
 */
export const HANDLED = Object.freeze({
  statBuffs: STAT_BUFFS,
  byBuff: Object.freeze(Object.keys(BY_BUFF)),
  byItem: BY_ITEM_ASKS,
  hammerOf: hammerInfo,
});

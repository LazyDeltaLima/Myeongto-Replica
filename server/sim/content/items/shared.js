// server/sim/content/items/shared.js — what the item behaviours share: items/battle.js (the grants, the hammers, the
// item-keyed behaviours) and the buff-key behaviours of items/effects/*.js. It imports neither, so whichever file a
// module graph loads first, the tables items/battle.js assembles are complete.
//
// Entries of the effect tables: `{ buff key: early(fn) | late(fn) }`, fn(battle, u, p, S, rec) — `p` the buff's params
// `{ ...bb, ...bbStr }`, `S` the grant's Scope (everything registered through it is removed with the grant), `rec` the
// concrete item record. An item record runs its buffs in their order: the `early` ones with the stat buffs, then the
// item's hammer, then the `late` ones — the place the behaviours keyed by item id had, kept so the order of their hooks
// (and so every fixed-seed battle) stays the same.

import { itemKeyOf, isOp, unitBonds, isMember, bondActive, battleStore, itemsOf } from '../support/index.js';
import { mitigate, hasHp } from '../../damage.js';

/** A buff-key behaviour run with the record's stat buffs (before its hammer). */
export const early = (run) => Object.freeze({ run, late: false });
/** A buff-key behaviour run after the record's other buffs and its hammer. */
export const late = (run) => Object.freeze({ run, late: true });

/** Partner key of a combo buff (equip_chess_id / other_equip), without suffix (itemKeyOf: the battle's season). */
export function partnerOf(p, scope) {
  if (!p) return null;
  if (typeof p.equip_chess_id === 'string' && p.equip_chess_id) return itemKeyOf(p.equip_chess_id, scope);
  if (typeof p.other_equip === 'string' && p.other_equip) return itemKeyOf(p.other_equip.split(',')[0].trim(), scope);
  return null;
}
export const isProc = (dmg) => !!(dmg && dmg.tags && dmg.tags.indexOf('item') >= 0);
export const procTags = (k) => ['item', `item:${k}`];
export const chance = (battle, p) => p > 0 && (p >= 1 || battle.rng() < p);
/**
 * 附加伤害 — the client's attack type ADDITION: tag 'addition' (a module's / talent's rider, a drone's addition, 叙拉古 6's
 * true damage, 卡西米尔 [ex]'s), and an item's proc (this fork's rule: procs never re-trigger item procs).
 */
export const isAddition = (dmg) => !!(dmg && dmg.tags && (dmg.tags.indexOf('addition') >= 0 || isProc(dmg)));
/**
 * 持续伤害 — the client's shared flag IS_CONTINUOUS that the 规程 item graphs filter out of ON_OUTPUT_DAMAGE
 * (FilterDamageModifer `_sharedFlag` IS_CONTINUOUS): damage over time, tag 'dot' / 'periodic'.
 */
export const isContinuous = (dmg) => !!(dmg && dmg.tags && (dmg.tags.indexOf('dot') >= 0 || dmg.tags.indexOf('periodic') >= 0));
/** An ally built from an enemy record — PRTS's 敌人类我方单位 (炎佑 enemy_9012_acloon). */
export const ENEMY_RECORD = /^enemy_/;

/** 'fatal' priorities (items/battle.js header). */
export const PRIO_REVIVE = -100;
/** A running 坚固 window (不死 held): before a 傀儡师's switch to its 替身 at −100 — see the items/battle.js header. */
export const PRIO_UNDYING_HELD = PRIO_REVIVE + 1;
/**
 * 'death' priority of the items' 复活 (M3茧甲): it acts on the knock-out, so after every `fatal` saver (不死 included) —
 * before 埃芒加德 (12), 阿戈尔 5's revive (11) and 不屈 (10). See the items/battle.js header and reviveNow.
 */
export const PRIO_RESPAWN = 13;
export const PRIO_FREE_UNDYING = 20;

// =====================================================================================================================
// membership / carrying

/** "若携带者为【X】盟约干员": own bonds (incl. 变形同构体 grants), or 调和 while the core bond X is active. */
export function memberOf(battle, u, bondId) {
  if (!isOp(u) || !bondId) return false;
  if (unitBonds(u, battle).includes(bondId)) return true;
  return isMember(battle, u, bondId) && bondActive(battle, u.ownerId, bondId);
}

/** The battle's item runtime: grants per unit, hammer states, the 蒸汽之心 field cache, lends. */
export function runtime(battle) {
  return battleStore(battle, 'items:rt', () => {
    const rt = { grants: new Map(), hammers: new Map(), field: new Map(), lends: new Map() };
    // the per-player "hammers on the field" cache (蒸汽之心) is dropped whenever an operator enters or leaves the field:
    // a cache filled before the initial deployment must not hide the field's hammers for the first 0.5 s
    const drop = (c) => { if (c.unit && c.unit.kind === 'op') rt.field.clear(); };
    battle.on('deploy', drop);
    battle.on('death', drop);
    return rt;
  });
}
export function grantsOf(rt, u) {
  let m = rt.grants.get(u);
  if (!m) { m = new Map(); rt.grants.set(u, m); }
  return m;
}
/** Does `u` carry an item of this key (own equipment or a lent grant)? */
export function carries(battle, u, key) {
  if (!key || !u) return false;
  for (const id of itemsOf(u)) if (itemKeyOf(id, battle) === key) return true;
  const g = runtime(battle).grants.get(u);
  if (g) for (const x of g.values()) if (x.lent && x.key === key) return true;
  return false;
}

/**
 * A 复活 answering a knock-out — call from a `death` hook (M3茧甲 PRIO_RESPAWN, 埃芒加德 PRIO_BAND_REVIVE). PRTS 备注
 * "“复活”的实现方式为：受益者因移动之外的原因退场时下次部署的再部署时间和费用归零": the operator was knocked out (this death;
 * its 被击倒时 effects run) and redeploys at once, free, where it lies (Battle.redeploy: full HP, SP reset, `deploy` —
 * its 部署时 effects run). True when it stands again; the ctx then carries `revivedBy`, so 阿戈尔 5 does not count the
 * knock-out as the member's first (the owner's decision of 2026-10-05: an operator's own revive uses no slot; 埃芒加德
 * [ASSUMED] alike, DESIGN §24.3). A redeploy that cannot happen (its tile taken) spends nothing [ASSUMED].
 * @param {object} battle @param {{ unit: object, reason: string, revivedBy?: string }} c the `death` ctx @param {string} by
 */
export function reviveNow(battle, c, by) {
  const u = c && c.unit;
  if (!u || c.reason !== 'killed' || c.revivedBy || !isOp(u) || u.alive || u.removed) return false;
  if (!battle.redeploy(u, { free: true })) return false;
  c.revivedBy = by;
  return true;
}

// =====================================================================================================================
// hook helpers

/** Damage mitigation estimate for flat DR / weakness damage (same formula as damage.js). */
export function mitigated(amount, type, target, source, dmg) {
  const ss = source && source.s ? source.s : null;
  return mitigate(amount, type, target.s, {
    defIgnorePct: (dmg.defIgnorePct || 0) + (ss ? ss.defIgnorePct : 0),
    defIgnoreFlat: (dmg.defIgnoreFlat || 0) + (ss ? ss.defIgnoreFlat : 0),
    resIgnorePct: (dmg.resIgnorePct || 0) + (ss ? ss.resIgnorePct : 0),
    resIgnoreFlat: (dmg.resIgnoreFlat || 0) + (ss ? ss.resIgnoreFlat : 0),
  });
}

/** Per enemy target of an attack by `u` (heals excluded). */
export function onAttackEnemies(S, u, fn) {
  S.on('attack', (c) => {
    if (c.attacker !== u) return;
    const ts = c.targets;
    for (let i = 0; i < ts.length; i++) { const t = ts[i]; if (t && t.side === 'enemy' && t.alive) fn(t, c); }
  });
}

/**
 * Per damage instance `u` deals to a living enemy — the client's ON_OUTPUT_DAMAGE / ON_OUTPUT_MODIFIER `IsDamage` graphs:
 * normal attacks, skills, every target of an area hit and damage over time alike; not 元素损伤 (a gauge, no damage), not
 * item procs (they never re-trigger items), not a killing blow (no HP left to act on).
 */
export function onDamageEnemies(S, u, fn) {
  S.on('damaged', (c) => {
    const t = c.target;
    if (c.source !== u || c.type === 'element' || isProc(c.dmg) || !t || t.side !== 'enemy' || !hasHp(t)) return;
    fn(t, c);
  });
}

/**
 * 弱点伤害 (双模机械臂, band 陈 以己之长): a physical or arts DamageInfo from `source` becomes whichever of the two types
 * `target` resists less (same mitigation formula as damage.js, incl. the source's ignore stats). Mutates `dmg.type`.
 */
export function weaknessRetype(dmg, source, target) {
  if (!dmg || !target || !target.s || (dmg.type !== 'phys' && dmg.type !== 'arts')) return;
  const ph = mitigated(dmg.amount, 'phys', target, source, dmg);
  const ar = mitigated(dmg.amount, 'arts', target, source, dmg);
  const best = ar > ph + 1e-9 ? 'arts' : ph > ar + 1e-9 ? 'phys' : dmg.type;
  if (best !== dmg.type) dmg.type = best;
}

/**
 * "获得1层护盾（最多`cap`层）": one shield layer (negates one damage instance) under buff `key`. Returns true when a
 * layer was added (false at the cap).
 */
export function addShieldLayer(battle, target, key, cap = 1) {
  if (!target || !target.alive) return false;
  const cur = target.findBuff(key);
  const have = cur ? cur.shieldHits || 0 : 0;
  if (have >= cap) return false;
  battle.addBuff(target, { key, shieldHits: have + 1, visible: true, refresh: 'replace' });
  return true;
}

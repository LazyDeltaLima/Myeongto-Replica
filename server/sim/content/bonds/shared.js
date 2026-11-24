// server/sim/content/bonds/shared.js — what the bond files share: the template key of a bond buff, the tier test, and
// the per-battle hook plumbing of the battle side.
//
// Two plumbing families, kept apart because each one's hook registration order is part of the battle's determinism:
//   onLayers / onUnitHit / onUnitDamaged   one hook per event for every bond that uses them (store 'bonds:core'):
//                                          the default season's 8 core bonds
//   onOwnLayers / onDealt                  卫戍协议：规程's own templates: a layerGain hook per call, one damaged hook
//                                          (store 'bonds:act3:dealt')

import * as S from '../support/index.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { HitEv, DamagedEv, LayerGainEv } from '../support/index.js' */
/**
 * A bond (or effect, strategy) record of the data, read field by field.
 * @typedef {Record<string, any> | null | undefined} BondRec
 * A template's numbers: the blackboards of its buffs together (templateBb, recordBb), read by key.
 * @typedef {Record<string, any>} BondBb
 * A nation / general template's battle installer (dispatch.js runs it once per player whose bond is active).
 * @typedef {(battle: Battle, pid: string, bb: BondBb, members: Unit[]) => void} BondInstaller
 * A nation / general template (dispatch.js): its bond, its installer (none: a part another template reads, `readBy`),
 * `bb: 'record'` (the installer gets every buff of the record together), what of it is not written yet, the 整备区
 * operators it may field (`reserve`) and the hand pieces the match sends for it (`hand`).
 * @typedef {{ bond: string, battle?: BondInstaller, bb?: 'record', readBy?: string, partial?: readonly string[],
 *   reserve?: (battle: Battle, pid: string, bb: BondBb) => void,
 *   hand?: (bb: BondBb) => { position: string | null, need: number } }} BondTemplate
 * A buff on a unit as content reads it (`Unit.buffs` is `object[]`): read through a cast of the list.
 * @typedef {{ key: string, flags?: Record<string, any> | null, timeLeft: number, source?: Unit | null,
 *   [field: string]: any }} BuffRec
 */

export const num = S.num;

// =====================================================================================================================
// template keys

/**
 * The template a bond buff belongs to: its bbStr.key, else its key, without its `[…]` sub-keys (`…[enemy]`, `…[share]`,
 * `…[tile_listener]` belong to their parent; a `…_power` key is a template of its own).
 */
export function bondTemplate(/** @type {Record<string, any> | null | undefined} */ buff) {
  const k = String(buff?.bbStr?.key ?? buff?.bbKey ?? buff?.key ?? '');
  return k.replace(/(\[[^\]]*\])+$/, '');
}

/** The distinct templates of a bond record, in record order. @param {BondRec} rec */
export function templatesOf(rec) {
  /** @type {string[]} */
  const out = [];
  for (const b of Array.isArray(rec?.buffs) ? rec.buffs : []) {
    const t = bondTemplate(b);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Does the bond record carry template `key`? @param {BondRec} rec @param {string} key */
export const hasTemplate = (rec, key) => templatesOf(rec).includes(key);

/**
 * `{ ...bb, ...bbStr }` of the record's buffs of template `key` — the template's own buff and its `[…]` sub-key buffs
 * together, in record order (later ones win a shared key) — else null. A season may move part of a template's numbers to a
 * sub-key buff: 规程's copy of the default season's 炎 effect (bondeffect_yan, the direction 望 switches to) keeps the ATK
 * numbers on act1autochess_bond_eff_yan and the 炎佑 counts and the 9-tier ATK / resistance on its `[spawn]` buff; read
 * from the first buff alone, the counts were missing and a 望 holder had two 炎佑 from the 3-tier on.
 * @param {BondRec} rec @param {string} key
 */
export function templateBb(rec, key) {
  /** @type {BondBb | null} */
  let out = null;
  for (const b of S.buffsOf(rec)) {
    if (bondTemplate(b) !== key) continue;
    if (!out) { out = { ...b.p }; continue; }
    const own = out.key;   // (bbStr.key: the template buff's own key, not a sub-key's)
    Object.assign(out, b.p);
    if (own !== undefined) out.key = own;
  }
  return out;
}

/**
 * Every buff's blackboard of the record together when it carries template `key` (its env buffs on the members and on
 * the enemies, `[enemy]`, share one bond blackboard), else null.
 * @param {BondRec} rec @param {string} key
 */
export function recordBb(rec, key) {
  if (!hasTemplate(rec, key)) return null;
  /** @type {BondBb} */
  const out = {};
  for (const b of S.buffsOf(rec)) Object.assign(out, b.p);
  return out;
}

// =====================================================================================================================
// tiers

/**
 * Has player `pid` reached the tier of `bondId` that needs `cnt` members? (active + count / tier index)
 * @param {Battle} battle @param {string | null | undefined} pid @param {string} bondId @param {unknown} cnt
 */
export function reached(battle, pid, bondId, cnt) {
  const st = S.bondState(battle, pid, bondId);
  if (!st || !st.active) return false;
  const need = num(cnt, 0);
  if (!(need > 0)) return true;
  if (num(st.count, 0) >= need) return true;
  const th = S.bondRecord(bondId, battle)?.thresholds;
  const idx = Array.isArray(th) ? th.indexOf(need) : -1;
  return idx >= 0 && S.bondTier(battle, pid, bondId) >= idx + 1;
}

/** The highest layers of `bondId` among the field's players that reached `cnt` members (…InCurArea). @param {Battle} battle @param {string} bondId @param {unknown} cnt */
export function fieldMaxLayers(battle, bondId, cnt) {
  let best = -1;
  for (const p of battle.players) if (reached(battle, p.playerId, bondId, cnt)) best = Math.max(best, S.bondLayers(battle, p.playerId, bondId));
  return best;
}

// =====================================================================================================================
// damage kinds

export const isEnemyTarget = (/** @type {Unit | null | undefined} */ t) => !!t && t.side === 'enemy' && t.alive;
export const isFoe = isEnemyTarget;
/** 附加伤害 (attack type ADDITION): the riders of items, bonds and kits (tag 'addition' / 'item'). */
export const isAddition = (/** @type {Record<string, any> | null | undefined} */ dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('addition') || dmg.tags.includes('item'));
/** 持续伤害 (the IS_CONTINUOUS shared flag / attack type BUFF). */
export const isDot = (/** @type {Record<string, any> | null | undefined} */ dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('dot') || dmg.tags.includes('periodic'));
export const isElement = (/** @type {{ type?: string, dmg?: Record<string, any> | null }} */ c) => c.type === 'element' || c.dmg?.type === 'element' || c.dmg?.type === 'elemental';

// =====================================================================================================================
// the core bonds' plumbing: layer refreshers, one hit / damaged dispatch per battle

/** @param {Battle} battle */
function core(battle) {
  return S.battleStore(battle, 'bonds:core', () => ({
    refreshers: new Map(), // `${pid}|${bondId}` → [fn]
    pending: new Set(),
    hitFns: new Map(),     // source unit → [fn(ctx)]
    dmgFns: new Map(),     // source unit → [fn(ctx)]
    hooked: new Set(),
  }));
}

/**
 * Re-run `fn` one tick after the bond's layers change (one layerGain hook for every caller of the battle).
 * @param {Battle} battle @param {string} pid @param {string} bondId @param {() => void} fn
 */
export function onLayers(battle, pid, bondId, fn) {
  const st = core(battle);
  const k = `${pid}|${bondId}`;
  if (!st.refreshers.has(k)) st.refreshers.set(k, []);
  st.refreshers.get(k).push(fn);
  if (st.hooked.has('layerGain')) return;
  st.hooked.add('layerGain');
  battle.on('layerGain', (/** @type {LayerGainEv} */ c) => {
    const key = `${c.playerId}|${c.bondId}`;
    const list = st.refreshers.get(key);
    if (!list || st.pending.has(key)) return;
    st.pending.add(key);
    // the gain is recorded after the hook: re-read the live layers next tick
    battle.after(0, () => { st.pending.delete(key); for (const f of list) f(); });
  }, { priority: -100 });
}

/** @param {Battle} battle @param {Unit} unit @param {(c: HitEv) => void} fn */
export function onUnitHit(battle, unit, fn) {
  const st = core(battle);
  if (!st.hitFns.has(unit)) st.hitFns.set(unit, []);
  st.hitFns.get(unit).push(fn);
  if (st.hooked.has('hit')) return;
  st.hooked.add('hit');
  battle.on('hit', (/** @type {HitEv} */ c) => {
    const list = c.source ? st.hitFns.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

/** @param {Battle} battle @param {Unit} unit @param {(c: DamagedEv) => void} fn */
export function onUnitDamaged(battle, unit, fn) {
  const st = core(battle);
  if (!st.dmgFns.has(unit)) st.dmgFns.set(unit, []);
  st.dmgFns.get(unit).push(fn);
  if (st.hooked.has('damaged')) return;
  st.hooked.add('damaged');
  battle.on('damaged', (/** @type {DamagedEv} */ c) => {
    const list = c.source ? st.dmgFns.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

// =====================================================================================================================
// 规程's templates' plumbing

/** Per-battle dispatch of the `damaged` hook by source unit (one hook for every caller). @param {Battle} battle @param {Unit} unit @param {(c: DamagedEv) => void} fn */
export function onDealt(battle, unit, fn) {
  const st = S.battleStore(battle, 'bonds:act3:dealt', () => ({ map: new Map(), hooked: false }));
  if (!st.map.has(unit)) st.map.set(unit, []);
  st.map.get(unit).push(fn);
  if (st.hooked) return;
  st.hooked = true;
  battle.on('damaged', (/** @type {DamagedEv} */ c) => {
    const list = c.source ? st.map.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

/**
 * Re-run `fn` one tick after the bond's layers change (the gain is written after the hook); a hook per call.
 * @param {Battle} battle @param {string} pid @param {string} bondId @param {() => void} fn
 */
export function onOwnLayers(battle, pid, bondId, fn) {
  let pending = false;
  battle.on('layerGain', (/** @type {LayerGainEv} */ c) => {
    if (c.playerId !== pid || c.bondId !== bondId || pending) return;
    pending = true;
    battle.after(0, () => { pending = false; fn(); });
  }, { priority: -100 });
}

/**
 * Members' standing ATK / HP bonus `+(base + per·L)`, live (onOwnLayers).
 * @param {Battle} battle @param {string} pid @param {string} bondId @param {readonly Unit[]} members @param {string} key
 * @param {{ atk?: readonly [unknown, unknown], def?: readonly [unknown, unknown], hp?: readonly [unknown, unknown] }} parts
 */
export function standing(battle, pid, bondId, members, key, parts) {
  const apply = () => {
    const L = S.bondLayers(battle, pid, bondId);
    /** @type {Record<string, number>} */
    const v = {};
    for (const [stat, [base, per]] of Object.entries(parts)) v[stat] = num(base) + num(per) * L;
    const mods = S.directMods(v);
    for (const u of members) S.passiveBuff(battle, u, key, mods);
  };
  apply();
  onOwnLayers(battle, pid, bondId, apply);
}

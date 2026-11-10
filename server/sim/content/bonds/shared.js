// server/sim/content/bonds/shared.js — what the bond files share: the template key of a bond buff, the tier test, and
// the per-battle hook plumbing of the battle side.
//
// Two plumbing families, kept apart because each one's hook registration order is part of the battle's determinism:
//   onLayers / onUnitHit / onUnitDamaged   one hook per event for every bond that uses them (store 'bonds:core'):
//                                          the default season's 8 core bonds
//   onOwnLayers / onDealt                  卫戍协议：规程's own templates: a layerGain hook per call, one damaged hook
//                                          (store 'bonds:act3:dealt')

import * as S from '../support/index.js';

export const num = S.num;

// =====================================================================================================================
// template keys

/**
 * The template a bond buff belongs to: its bbStr.key, else its key, without its `[…]` sub-keys (`…[enemy]`, `…[share]`,
 * `…[tile_listener]` belong to their parent; a `…_power` key is a template of its own).
 */
export function bondTemplate(buff) {
  const k = String(buff?.bbStr?.key ?? buff?.bbKey ?? buff?.key ?? '');
  return k.replace(/(\[[^\]]*\])+$/, '');
}

/** The distinct templates of a bond record, in record order. */
export function templatesOf(rec) {
  const out = [];
  for (const b of Array.isArray(rec?.buffs) ? rec.buffs : []) {
    const t = bondTemplate(b);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Does the bond record carry template `key`? */
export const hasTemplate = (rec, key) => templatesOf(rec).includes(key);

/** `{ ...bb, ...bbStr }` of the record's first buff of template `key`, else null. */
export function templateBb(rec, key) {
  for (const b of S.buffsOf(rec)) if (bondTemplate(b) === key) return b.p;
  return null;
}

/**
 * Every buff's blackboard of the record together when it carries template `key` (its env buffs on the members and on
 * the enemies, `[enemy]`, share one bond blackboard), else null.
 */
export function recordBb(rec, key) {
  if (!hasTemplate(rec, key)) return null;
  const out = {};
  for (const b of S.buffsOf(rec)) Object.assign(out, b.p);
  return out;
}

// =====================================================================================================================
// tiers

/** Has player `pid` reached the tier of `bondId` that needs `cnt` members? (active + count / tier index) */
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

/** The highest layers of `bondId` among the field's players that reached `cnt` members (…InCurArea). */
export function fieldMaxLayers(battle, bondId, cnt) {
  let best = -1;
  for (const p of battle.players) if (reached(battle, p.playerId, bondId, cnt)) best = Math.max(best, S.bondLayers(battle, p.playerId, bondId));
  return best;
}

// =====================================================================================================================
// damage kinds

export const isEnemyTarget = (t) => !!t && t.side === 'enemy' && t.alive;
export const isFoe = isEnemyTarget;
/** 附加伤害 (attack type ADDITION): the riders of items, bonds and kits (tag 'addition' / 'item'). */
export const isAddition = (dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('addition') || dmg.tags.includes('item'));
/** 持续伤害 (the IS_CONTINUOUS shared flag / attack type BUFF). */
export const isDot = (dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('dot') || dmg.tags.includes('periodic'));
export const isElement = (c) => c.type === 'element' || c.dmg?.type === 'element' || c.dmg?.type === 'elemental';

// =====================================================================================================================
// the core bonds' plumbing: layer refreshers, one hit / damaged dispatch per battle

function core(battle) {
  return S.battleStore(battle, 'bonds:core', () => ({
    refreshers: new Map(), // `${pid}|${bondId}` → [fn]
    pending: new Set(),
    hitFns: new Map(),     // source unit → [fn(ctx)]
    dmgFns: new Map(),     // source unit → [fn(ctx)]
    hooked: new Set(),
  }));
}

/** Re-run `fn` one tick after the bond's layers change (one layerGain hook for every caller of the battle). */
export function onLayers(battle, pid, bondId, fn) {
  const st = core(battle);
  const k = `${pid}|${bondId}`;
  if (!st.refreshers.has(k)) st.refreshers.set(k, []);
  st.refreshers.get(k).push(fn);
  if (st.hooked.has('layerGain')) return;
  st.hooked.add('layerGain');
  battle.on('layerGain', (c) => {
    const key = `${c.playerId}|${c.bondId}`;
    const list = st.refreshers.get(key);
    if (!list || st.pending.has(key)) return;
    st.pending.add(key);
    // the gain is recorded after the hook: re-read the live layers next tick
    battle.after(0, () => { st.pending.delete(key); for (const f of list) f(); });
  }, { priority: -100 });
}

export function onUnitHit(battle, unit, fn) {
  const st = core(battle);
  if (!st.hitFns.has(unit)) st.hitFns.set(unit, []);
  st.hitFns.get(unit).push(fn);
  if (st.hooked.has('hit')) return;
  st.hooked.add('hit');
  battle.on('hit', (c) => {
    const list = c.source ? st.hitFns.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

export function onUnitDamaged(battle, unit, fn) {
  const st = core(battle);
  if (!st.dmgFns.has(unit)) st.dmgFns.set(unit, []);
  st.dmgFns.get(unit).push(fn);
  if (st.hooked.has('damaged')) return;
  st.hooked.add('damaged');
  battle.on('damaged', (c) => {
    const list = c.source ? st.dmgFns.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

// =====================================================================================================================
// 规程's templates' plumbing

/** Per-battle dispatch of the `damaged` hook by source unit (one hook for every caller). */
export function onDealt(battle, unit, fn) {
  const st = S.battleStore(battle, 'bonds:act3:dealt', () => ({ map: new Map(), hooked: false }));
  if (!st.map.has(unit)) st.map.set(unit, []);
  st.map.get(unit).push(fn);
  if (st.hooked) return;
  st.hooked = true;
  battle.on('damaged', (c) => {
    const list = c.source ? st.map.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

/** Re-run `fn` one tick after the bond's layers change (the gain is written after the hook); a hook per call. */
export function onOwnLayers(battle, pid, bondId, fn) {
  let pending = false;
  battle.on('layerGain', (c) => {
    if (c.playerId !== pid || c.bondId !== bondId || pending) return;
    pending = true;
    battle.after(0, () => { pending = false; fn(); });
  }, { priority: -100 });
}

/** Members' standing ATK / HP bonus `+(base + per·L)`, live (onOwnLayers). */
export function standing(battle, pid, bondId, members, key, parts) {
  const apply = () => {
    const L = S.bondLayers(battle, pid, bondId);
    const v = {};
    for (const [stat, [base, per]] of Object.entries(parts)) v[stat] = num(base) + num(per) * L;
    const mods = S.directMods(v);
    for (const u of members) S.passiveBuff(battle, u, key, mods);
  };
  apply();
  onOwnLayers(battle, pid, bondId, apply);
}

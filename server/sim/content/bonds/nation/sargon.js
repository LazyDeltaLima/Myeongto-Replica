// server/sim/content/bonds/nation/sargon.js — 萨尔贡 (sargonShip).
//
//   act1autochess_bond_eff_sargon   member skill start → every member on the field gets an independent stack (ASPD
//                                   +base_attack_speed for base_time + time_per_stack·L s, ≤ max_buff_stack_cnt); 6: each
//                                   stack also ATK +base_atk (additive, one 直接乘算 buff)
//   act2autochess_bond_eff_sargon   ([share], band_narant) read by the act-1 installer: at 6 with 纳兰特 the caster instead
//                                   lends its equipment (tier ≤ filter_item_level) to the operators around it for
//                                   base_power_time + power_time_per_stack·L s (items.js lendItemEffects; share below)
//   act3autochess_bond_eff_sargon   (卫戍协议：规程) the same stacks, no ATK: its 6-tier effect is the 流沙 ground below
//   act3autochess_bond_eff_sargon_power   (规程, 6 of the player's own; numbers on its [tile_listener] buff) a member's
//                                   skill start lays a 流沙 tile on the nearest ground tile of its attack range that is no
//                                   流沙 yet (FindNearestTileInRangeToBB WALK_ONLY; the tile listener ability
//                                   act3autochess_bond_sargon_tile_listener, one per player, AttachToTile once per tile).
//                                   A ground enemy whose tile is one of them ([tile_buff][creator] → [checker], which
//                                   polls every 0.3 s and ends the rest once the enemy stands on none): 迟钝 min(slow_max,
//                                   slow_base + per·L) — ×2 while it also stands in the range of a member whose skill runs
//                                   (the ability act3autochess_bond_sargon_range from ON_SKILL_START to ON_SKILL_FINISH,
//                                   [aura_buff]); every `interval` (5) s from its arrival 束缚 unmovable_duration s, then
//                                   min(max, magic_damage_base + per·L) arts (无来源 持续 环境伤害); every 1 s while in that
//                                   range [mag_damage_2] min(max, base + per·L) arts the same way

import * as S from '../../support/index.js';
import * as items from '../../items.js';
import { COLS, ROWS, TICK } from '../../../constants.js';
import { num, reached } from '../shared.js';
/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */
/** @import { BondInstaller, BondTemplate, BondBb, BuffRec } from '../shared.js' */
/** @import { SkillEv } from '../../support/index.js' */

const SARGON_SHARE_KEY = 'act2autochess_bond_eff_sargon[share]';

/**
 * Injection point for tests (lendItemEffects stub); null ⇒ items.js export.
 * @type {{ lendItemEffects: ((battle: Battle, from: Unit, to: Unit, o: { maxTier: number, duration: number }) => unknown) | null }}
 */
export const deps = { lendItemEffects: null };

/** @param {Battle} battle @param {string} pid @param {BondBb} bb @param {Unit[]} members @param {{ atk: boolean }} o */
function installSargon(battle, pid, bb, members, { atk }) {
  const memberSet = new Set(members);
  const ps = S.player(battle, pid);
  const share = S.buffParams(S.bondRecord('sargonShip', battle), SARGON_SHARE_KEY);
  const band = ps?.bandId ?? null;
  const narant = !!(share && band && share.valid_in_band === band);
  const main = narant ? share : bb;
  const six = reached(battle, pid, 'sargonShip', num(main.power_bond_char_cnt, 6));
  const perAtk = num(bb.base_atk, 0);
  const atkStacks = atk && six && !narant && !(bb.invalid_in_band && bb.invalid_in_band === band);
  const maxStacks = Math.max(1, Math.floor(num(main.max_buff_stack_cnt, 25)));
  const syncAtk = (/** @type {Unit} */ u) => {
    if (!atkStacks) return;
    let n = 0;
    for (const b of /** @type {BuffRec[]} */ (u.buffs)) if (b.key === 'bond:sargon') n++;
    if (n > 0 && u.alive) battle.addBuff(u, { key: 'bond:sargon:atk', mods: S.directMods({ atk: perAtk * n }) });
    else battle.removeBuff(u, 'bond:sargon:atk');
  };
  const lend = narant && six ? shareEquipment(battle, share) : null;
  battle.on('skillStart', (/** @type {SkillEv} */ { unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'sargonShip');
    const dur = num(main.base_time, 0) + num(main.time_per_stack, 0) * L;
    if (dur > 0) {
      for (const m of members) {
        if (!S.onField(m)) continue;
        battle.addBuff(m, {
          key: 'bond:sargon', duration: dur, refresh: 'independent', maxStacks,
          mods: { aspd: num(main.base_attack_speed, 0) },
          onExpire: (/** @type {{ unit: Unit }} */ { unit: u }) => syncAtk(u), onRemove: (/** @type {{ unit: Unit }} */ { unit: u }) => syncAtk(u),
        });
        syncAtk(m);
      }
    }
    if (lend) lend(unit, S.bondLayers(battle, pid, 'sargonShip'));
  });
}

/** The rune key of the equipment effects 萨尔贡 × 娜仁图亚 lends (`[share][buff]` AutoChessShareEquipEffect `_keyFilter`). */
const SHARE_KEYS = Object.freeze(['env_gbuff_new_with_verify']);

/**
 * 萨尔贡 × 娜仁图亚's lending (client buff templates `act2autochess_bond_eff_sargon[share]` and `[share][buff]`, EN
 * client; 공식 클라에서 확인, docs/rules/sim.md 「같은 장비 둘은 둘 다 효과가 있다」 「빌린 장비도 같다」): a member's skill cast
 * gives it `[share][buff]` for base_power_time + power_time_per_stack·L s. Its ON_BUFF_LATE_ENABLE makes one global buff
 * per equipment instance (tier ≤ filter_item_level, the `env_gbuff_new_with_verify` effects only), aliased by the lender,
 * whose validator takes the units within √2 of the lender's tile at that moment, its own tile left out — the 8 around
 * it, and so also an operator deployed there later while it lasts (BattleController.RegisterUnit offers every new unit to
 * every global buff). The buff is EXTEND: a cast while it runs only refills its time (Buff.OverrideGroup: the new buff is
 * not added, no second LATE_ENABLE — the lent items and their tile stay). It ends with its time or with its owner
 * (Entity.OnFinish clears the owner's buffs → ON_BUFF_FINISH RemoveGlobalBuffByAlias → GlobalBuff.OnRemoved takes the
 * lent buffs off every unit). A receiver that leaves loses them with its own buffs and gets them again only when it is
 * deployed in that ring. A 【移动】 keeps what it has (moveRedeploy: buffs stay, DESIGN §22.3), the lender's included.
 * Returns the cast handler (lender, layers).
 * @param {Battle} battle @param {BondBb} share
 */
function shareEquipment(battle, share) {
  const maxTier = num(share.filter_item_level, 5);
  /** lender → its running [share][buff]: the ring's centre, its end and the operators that hold its loans @type {Map<Unit, { r: number, c: number, until: number, to: Set<Unit> }>} */
  const running = new Map();
  const lendItems = () => (typeof deps.lendItemEffects === 'function' ? deps.lendItemEffects
    : typeof items.lendItemEffects === 'function' ? items.lendItemEffects : null);
  const inRing = (/** @type {{ r: number, c: number }} */ st, /** @type {Unit} */ u) => {
    const dr = u.tileR - st.r, dc = u.tileC - st.c, d = dr * dr + dc * dc;
    return d > 0 && d <= 2;
  };
  const give = (/** @type {Unit} */ from, /** @type {{ until: number, to: Set<Unit> }} */ st, /** @type {Unit} */ a) => {
    const lend = lendItems();
    if (!lend) return;
    st.to.add(a);
    lend(battle, from, a, { maxTier, duration: st.until - battle.time, keys: SHARE_KEYS });
  };
  const end = (/** @type {Unit} */ from) => {
    const st = running.get(from);
    if (!st) return;
    running.delete(from);
    for (const a of st.to) items.endLentItems(battle, from, a);
  };
  battle.on('deploy', (/** @type {{ unit: Unit, move?: boolean }} */ { unit, move }) => {
    if (!S.isOp(unit)) return;
    for (const [from, st] of running) {
      if (battle.time >= st.until - 1e-9) { running.delete(from); continue; }
      if (unit === from || unit.ownerId !== from.ownerId) continue;
      if (inRing(st, unit)) give(from, st, unit);
      else if (!move && st.to.delete(unit)) items.endLentItems(battle, from, unit);
    }
  });
  battle.on('death', (/** @type {{ unit: Unit }} */ { unit }) => { if (running.has(unit)) end(unit); });
  return (/** @type {Unit} */ from, /** @type {number} */ L) => {
    if (!S.itemsOf(from).length) return;
    const duration = num(share.base_power_time, 0) + num(share.power_time_per_stack, 0) * L;
    if (!(duration > 0)) return;
    let st = running.get(from);
    if (st && battle.time >= st.until - 1e-9) { running.delete(from); st = undefined; }
    if (st) {
      st.until = battle.time + duration;
      for (const a of st.to) if (a.alive) give(from, st, a);
    } else {
      st = { r: from.tileR, c: from.tileC, until: battle.time + duration, to: new Set() };
      running.set(from, st);
      for (const a of S.alliesAround(battle, from, S.N8)) if (S.isOp(a)) give(from, st, a);
    }
    const n = [...st.to].filter((a) => a.alive).length;
    if (n) S.fxOn(battle, 'bondShare', from, 'bond:sargonShip', 'narant', { n, duration });
  };
}

// =====================================================================================================================
// 规程: 流沙

const SAND = 'act3autochess_bond_eff_sargon_power';
const CHECK_IV = 0.3; // [tile_buff][checker] triggerInterval
/**
 * The client buffs that carry the 流沙 effects, sent as the statuses' `fxTag` (render/fxstatus.js HINT_FX): [tile_buff][slow]
 * gives [tile_buff][slow_down] (the shared template slow_down), which creates `{0}[internal]` with overrideEffectKey
 * common_slow_01 (over the head); [mag_damage]'s 束缚 [tile_buff][unmovable] carries common_unmovable_01 (at the feet).
 * Display only.
 */
export const SAND_SLOW_FX = `${SAND}[tile_buff][slow_down][internal]`;
export const SAND_BIND_FX = `${SAND}[tile_buff][unmovable]`;
/** A [tile_buff] part's number of the record's blackboard (`act3autochess_bond_eff_sargon_power[tile_buff][part].key`). */
const part = (/** @type {BondBb} */ bb, /** @type {string} */ p, /** @type {string} */ key, d = 0) => num(bb[`${SAND}[tile_buff][${p}].${key}`], d);
/** 迟钝 v: move speed ×(1 − v), attack interval ×1 / (1 − v) (the slow_down template, as the kits' 迟钝). */
const slowMods = (/** @type {number} */ v) => ({ moveMul: Math.max(0, 1 - v), batPct: v < 0.99 ? v / (1 - v) : 99 });
const tileOf = (/** @type {Unit} */ e) => {
  const r = Math.round(e.y), c = Math.round(e.x);
  return r < 0 || r >= ROWS || c < 0 || c >= COLS ? -1 : r * COLS + c;
};

/**
 * The tile a member's skill start lays: the ground (WALK) tile of its attack range nearest to it that is no 流沙 yet,
 * ties by range order. [ASSUMED·CN: FindNearestTileInRangeToBB is a CN-only node — the range is the member's attack range,
 * a tile already 流沙 is skipped (the node's tile flag ac_bond_eff_sargon_power[sand]) and the distance is from the
 * member's tile]
 * @param {Battle} battle @param {Unit} unit @param {Set<number>} taken
 */
function sandTile(battle, unit, taken) {
  let best = -1, bestD = Infinity;
  for (const k of unit.rangeKeys || []) {
    if (taken.has(k)) continue;
    const r = Math.floor(k / COLS), c = k % COLS;
    if (!battle.grid.walkable(r, c)) continue;
    const dr = r - unit.tileR, dc = c - unit.tileC, d = dr * dr + dc * dc;
    if (d < bestD - 1e-9) { best = k; bestD = d; }
  }
  return best;
}

/** battle → the 流沙 tiles laid so far, every player's, in order: [x, y] (sandView). @type {WeakMap<Battle, Array<[number, number]>>} */
const LAID = new WeakMap();
/**
 * The 流沙 tiles laid in `battle` so far ([[x, y]], one per tile listener's tile: two players' on one tile are two), or
 * null for none: Battle.fieldMeta's `sand`, so a view entering the battle late (a re-entry, a watched field) lays them
 * again — the 'zone' fx is sent once, when the tile is laid.
 * @param {Battle} battle
 */
export function sandView(battle) {
  const list = LAID.get(battle);
  return list && list.length ? list.map((t) => [t[0], t[1]]) : null;
}

/** @type {BondInstaller} */
function installSand(battle, pid, bb, members) {
  if (!reached(battle, pid, 'sargonShip', bb.power_bond_char_cnt)) return;
  const memberSet = new Set(members);
  /** @type {Set<number>} */
  const tiles = new Set();
  let laid = LAID.get(battle);
  if (!laid) LAID.set(battle, (laid = []));
  /** @type {Set<Unit>} */
  const casting = new Set(); // members whose skill runs (the [aura_buff] range ability)
  /** enemy → { lastOn, nextMag, next2, slow } while its [checker] lasts @type {Map<Unit, { since: number, lastOn: number, nextMag: number, next2: number, slow: number }>} */
  const on = new Map();
  const key = `bond:sargon:sand:${pid}`;
  const L = () => S.bondLayers(battle, pid, 'sargonShip');
  battle.on('skillStart', (/** @type {SkillEv} */ { unit }) => {
    if (!memberSet.has(unit) || !S.onField(unit)) return;
    casting.add(unit);
    const k = sandTile(battle, unit, tiles);
    if (k < 0) return;
    tiles.add(k);
    laid.push([k % COLS, Math.floor(k / COLS)]);
    battle.fx('zone', { x: k % COLS, y: Math.floor(k / COLS), r: 0.5, dur: 1e4, kind: 'sargonSand', tiles: 'box', id: unit.id });
  });
  battle.on('skillEnd', (/** @type {SkillEv} */ { unit }) => { casting.delete(unit); });
  const inAura = (/** @type {number} */ k) => {
    for (const m of casting) if (m.alive && m.deployed && (m.rangeKeySet || new Set(m.rangeKeys || [])).has(k)) return true;
    return false;
  };
  const end = (/** @type {Unit} */ e) => { on.delete(e); battle.removeBuff(e, key); };
  battle.every(0, () => {
    if (!tiles.size && !on.size) return;
    const t = battle.time;
    for (const e of battle.enemies) {
      const k = e.alive && !e.hidden && !e.isFlying ? tileOf(e) : -1;
      const here = k >= 0 && tiles.has(k);
      let s = on.get(e);
      if (!s) {
        if (!here) continue;
        s = { since: t, lastOn: t, nextMag: t + part(bb, 'mag_damage', 'first_trigger_interval', part(bb, 'mag_damage', 'interval', 5)), next2: t + 1, slow: -1 };
        on.set(e, s);
      }
      if (!e.alive) { end(e); continue; }
      if (here) s.lastOn = t;
      // the [checker] polls every 0.3 s from its start: it ends once the enemy stands on no 流沙 tile
      else if (Math.floor((t - s.since) / CHECK_IV + 1e-9) > Math.floor((s.lastOn - s.since) / CHECK_IV + 1e-9)) { end(e); continue; }
      const aura = k >= 0 && tiles.has(k) && inAura(k);
      const base = Math.min(part(bb, 'slow', 'slow_max', Infinity), part(bb, 'slow', 'slow_base') + part(bb, 'slow', 'slow_per_stack') * L());
      const v = aura ? base * 2 : base;
      if (v !== s.slow) {
        s.slow = v;
        const cur = /** @type {BuffRec | null} */ (e.findBuff(key));
        if (cur) { cur.mods = slowMods(v); e.markDirty(); } else battle.addBuff(e, { key, mods: slowMods(v), status: 'slow', fxTag: SAND_SLOW_FX });
      }
      if (t >= s.nextMag - 1e-9) {
        s.nextMag += Math.max(TICK, part(bb, 'mag_damage', 'interval', 5));
        // [mag_damage]: the 束缚 first, then the damage (ON_BUFF_TRIGGER CreateBuff unmovable → FixedValueDamage)
        const bind = part(bb, 'mag_damage', 'unmovable_duration', 1);
        if (bind > 0) battle.applyStatus(e, 'bind', { duration: bind, fxTag: SAND_BIND_FX });
        const amount = Math.min(part(bb, 'mag_damage', 'magic_damage_max', Infinity), part(bb, 'mag_damage', 'magic_damage_base') + part(bb, 'mag_damage', 'magic_damage_per_stack') * L());
        if (amount > 0 && e.alive) battle.dealDamage(null, e, { amount, type: 'arts', canDodge: false, sourceless: true, tags: ['bond:sargon:sand', 'dot', 'periodic', 'terrain'] });
      }
      if (t >= s.next2 - 1e-9) {
        s.next2 += 1;
        const amount = Math.min(part(bb, 'mag_damage_2', 'magic_damage_max', Infinity), part(bb, 'mag_damage_2', 'magic_damage_base') + part(bb, 'mag_damage_2', 'magic_damage_per_stack') * L());
        if (aura && amount > 0 && e.alive) battle.dealDamage(null, e, { amount, type: 'arts', canDodge: false, sourceless: true, tags: ['bond:sargon:sand', 'dot', 'periodic', 'terrain'] });
      }
    }
  });
}

/** @type {Readonly<Record<string, BondTemplate>>} */
export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: true }) },
  act2autochess_bond_eff_sargon: { bond: 'sargonShip', readBy: 'act1autochess_bond_eff_sargon' },
  act3autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: false }) },
  [SAND]: { bond: 'sargonShip', battle: installSand, bb: 'record' },
});

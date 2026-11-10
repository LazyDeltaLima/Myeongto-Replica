// server/sim/content/bonds/nation/sargon.js — 萨尔贡 (sargonShip).
//
//   act1autochess_bond_eff_sargon   member skill start → every member on the field gets an independent stack (ASPD
//                                   +base_attack_speed for base_time + time_per_stack·L s, ≤ max_buff_stack_cnt); 6: each
//                                   stack also ATK +base_atk (additive, one 直接乘算 buff)
//   act2autochess_bond_eff_sargon   ([share], band_narant) read by the act-1 installer: at 6 with 纳兰特 the caster instead
//                                   lends its equipment (tier ≤ filter_item_level) to the 8 surrounding operators
//                                   (items.js lendItemEffects)
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

const SARGON_SHARE_KEY = 'act2autochess_bond_eff_sargon[share]';

/** Injection point for tests (lendItemEffects stub); null ⇒ items.js export. */
export const deps = { lendItemEffects: null };

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
  const syncAtk = (u) => {
    if (!atkStacks) return;
    let n = 0;
    for (const b of u.buffs) if (b.key === 'bond:sargon') n++;
    if (n > 0 && u.alive) battle.addBuff(u, { key: 'bond:sargon:atk', mods: S.directMods({ atk: perAtk * n }) });
    else battle.removeBuff(u, 'bond:sargon:atk');
  };
  battle.on('skillStart', ({ unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'sargonShip');
    const dur = num(main.base_time, 0) + num(main.time_per_stack, 0) * L;
    if (dur > 0) {
      for (const m of members) {
        if (!S.onField(m)) continue;
        battle.addBuff(m, {
          key: 'bond:sargon', duration: dur, refresh: 'independent', maxStacks,
          mods: { aspd: num(main.base_attack_speed, 0) },
          onExpire: ({ unit: u }) => syncAtk(u), onRemove: ({ unit: u }) => syncAtk(u),
        });
        syncAtk(m);
      }
    }
    if (narant && six) lendAround(battle, unit, share, S.bondLayers(battle, pid, 'sargonShip'));
  });
}

function lendAround(battle, from, share, L) {
  if (!S.itemsOf(from).length) return;
  const lend = typeof deps.lendItemEffects === 'function' ? deps.lendItemEffects
    : typeof items.lendItemEffects === 'function' ? items.lendItemEffects : null;
  if (!lend) return;
  const duration = num(share.base_power_time, 0) + num(share.power_time_per_stack, 0) * L;
  if (!(duration > 0)) return;
  const maxTier = num(share.filter_item_level, 5);
  let n = 0;
  for (const a of S.alliesAround(battle, from, S.N8)) {
    if (!S.isOp(a)) continue;
    lend(battle, from, a, { maxTier, duration });
    n++;
  }
  if (n) S.fxOn(battle, 'bondShare', from, 'bond:sargonShip', 'narant', { n, duration });
}

// =====================================================================================================================
// 规程: 流沙

const SAND = 'act3autochess_bond_eff_sargon_power';
const CHECK_IV = 0.3; // [tile_buff][checker] triggerInterval
/** A [tile_buff] part's number of the record's blackboard (`act3autochess_bond_eff_sargon_power[tile_buff][part].key`). */
const part = (bb, p, key, d = 0) => num(bb[`${SAND}[tile_buff][${p}].${key}`], d);
/** 迟钝 v: move speed ×(1 − v), attack interval ×1 / (1 − v) (the slow_down template, as the kits' 迟钝). */
const slowMods = (v) => ({ moveMul: Math.max(0, 1 - v), batPct: v < 0.99 ? v / (1 - v) : 99 });
const tileOf = (e) => {
  const r = Math.round(e.y), c = Math.round(e.x);
  return r < 0 || r >= ROWS || c < 0 || c >= COLS ? -1 : r * COLS + c;
};

/**
 * The tile a member's skill start lays: the ground (WALK) tile of its attack range nearest to it that is no 流沙 yet,
 * ties by range order. [ASSUMED·CN: FindNearestTileInRangeToBB is a CN-only node — the range is the member's attack range,
 * a tile already 流沙 is skipped (the node's tile flag ac_bond_eff_sargon_power[sand]) and the distance is from the
 * member's tile]
 */
function sandTile(battle, unit, taken) {
  let best = -1, bestD = Infinity;
  for (const k of unit.rangeKeys || []) {
    if (taken.has(k)) continue;
    const r = Math.floor(k / COLS), c = k % COLS;
    if (!battle.grid.walkable(r, c)) continue;
    const d = (r - unit.tileR) ** 2 + (c - unit.tileC) ** 2;
    if (d < bestD - 1e-9) { best = k; bestD = d; }
  }
  return best;
}

function installSand(battle, pid, bb, members) {
  if (!reached(battle, pid, 'sargonShip', bb.power_bond_char_cnt)) return;
  const memberSet = new Set(members);
  const tiles = new Set();
  const casting = new Set(); // members whose skill runs (the [aura_buff] range ability)
  /** enemy → { lastOn, nextMag, next2, slow } while its [checker] lasts */
  const on = new Map();
  const key = `bond:sargon:sand:${pid}`;
  const L = () => S.bondLayers(battle, pid, 'sargonShip');
  battle.on('skillStart', ({ unit }) => {
    if (!memberSet.has(unit) || !S.onField(unit)) return;
    casting.add(unit);
    const k = sandTile(battle, unit, tiles);
    if (k < 0) return;
    tiles.add(k);
    battle.fx('zone', { x: k % COLS, y: Math.floor(k / COLS), r: 0.5, dur: 1e4, kind: 'sargonSand', tiles: 'box', id: unit.id });
  });
  battle.on('skillEnd', ({ unit }) => { casting.delete(unit); });
  const inAura = (k) => {
    for (const m of casting) if (m.alive && m.deployed && (m.rangeKeySet || new Set(m.rangeKeys || [])).has(k)) return true;
    return false;
  };
  const end = (e) => { on.delete(e); battle.removeBuff(e, key); };
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
        const cur = e.findBuff(key);
        if (cur) { cur.mods = slowMods(v); e.markDirty(); } else battle.addBuff(e, { key, mods: slowMods(v), status: 'slow' });
      }
      if (t >= s.nextMag - 1e-9) {
        s.nextMag += Math.max(TICK, part(bb, 'mag_damage', 'interval', 5));
        // [mag_damage]: the 束缚 first, then the damage (ON_BUFF_TRIGGER CreateBuff unmovable → FixedValueDamage)
        const bind = part(bb, 'mag_damage', 'unmovable_duration', 1);
        if (bind > 0) battle.applyStatus(e, 'bind', { duration: bind });
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

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: true }) },
  act2autochess_bond_eff_sargon: { bond: 'sargonShip', readBy: 'act1autochess_bond_eff_sargon' },
  act3autochess_bond_eff_sargon: { bond: 'sargonShip', battle: (b, pid, bb, ms) => installSargon(b, pid, bb, ms, { atk: false }) },
  [SAND]: { bond: 'sargonShip', battle: installSand, bb: 'record' },
});

// server/sim/content/devices.js — stage devices & special terrain (data/stages.json, research 05 §2.3–2.4).
//
// The engine already spawns active 阻隔工事 crates (obstacle devices, 100 HP) and marks active 射击台/mounds as
// obstacles that elevate operators. This module adds, per battle:
//   阻隔工事   an enemy blocked by a crate destroys it (after its attack interval even if it cannot attack: harmless
//              walkers no longer stall on a crate); map cards (`deviceOverrides`) remove crates / add or remove
//              platforms (obstacle + elevation) / activate hidden devices
//   气流        act2 m01 blowers (`trap_013_blower`, rangeTiles along `dir`): operators whose direction (`u.dir`, UP|
//              RIGHT|DOWN|LEFT) equals the blower's dir / is its opposite / is perpendicular get ATK +
//              blower_s_character[equal|opposite|vertical].atk (the m01 blowers blow DOWN); enemies moving with /
//              against the flow get move speed × (1 + blower_s_enemy[equal|opposite].move_speed)
//   沼泽 m      a unit on it (allies and ground enemies) triggers 【陷入沼泽】 on entering and every intervalSec (1) s
//              there: an enemy gains 1 layer — 2 at 重量 ≥ heavyWeight (the device's `value`, 3) — of ASPD aspdPerStack
//              (fractions are ×100 ASPD) and move speed × (1 + moveMulPerStack × layers), an operator 1 layer of the
//              ASPD part only; at most maxStacks layers; cleared on leaving
//   烟雾 g      operators on it cannot be targeted by enemy ranged attacks (stealth flag: blocked enemies still hit them —
//              not 自制投石机, whose 索敌不受阻挡影响: blocked by one with nobody else in range it does not attack)
//   深水 d      ground enemies on it: sea_drown[enemy].damage dmg/s (无来源 true 持续伤害, not 环境伤害: tags dot /
//              periodic / deepsea), ASPD attack_speed (×100), move × move_speed
//   活性源石 i  a unit on it (allies and ground enemies) gets a timed effect: damage true dmg/s, ATK + atk, ASPD +
//              attack_speed for `duration` s from its last contact — an enemy keeps it after walking off; one effect
//              per unit, its time starts again while the unit is on the tile; the tiles never switch off
//   加速 u      规程 tile_speedup: a ground operator / summon on it has ASPD + attack_speed (25), a ground enemy move
//              speed × move_speed (1.5) — the tile's blackboard; ends on leaving
//   草地 G      规程 tile_duel_grassland: a ground unit on it is 隐匿 (INVISIBLE) — an operator like on smog, an enemy
//              unless blocked (visible again the moment the block ends); ends on leaving
//   “双眼皮”   turrets (`trap_1104_aclasert`, band 机械援助 / `deviceOverrides` alias on): ranged arts shooter on its data
//              range; ASPD + attack_speed_per_stack × L (≤ max_attack_speed), hits apply fragile 1 + damage_scale_per_stack
//              × L (≤ max_damage_scale) for the text's duration; L = the owner's highest bond layers (live)
//   盟约寒风   `startColdWind` / `kjeragColdWind` helpers for the 谢拉格 bond (every interval s all enemies cold)
//   沙尘暴     act1 m06 (`trap_036_storm`, blowing along its `dir`): every `interval` s an operator / summon with no
//              土石结构 (`trap_032_mound`) upwind of it takes `damage` pure 环境伤害 and has ATK × (1 + atk) until a check
//              finds it sheltered; an unsheltered enemy moves at × (1 + move_speed); the m06 mounds never break
//              (`tickStorm`); map card 模拟战场演变·模式八 (`map_m06_1`) stops it on its owner's half
//   盐坨子炮   规程 m10 (`trap_196_cnnon`, facing its `dir`): every 6 s a shell at an ally of its lane that drops the
//              enemy it swallowed there (`tickCannon`)
// Device overrides: a player's battle input `deviceOverrides` ({ alias: bool }) and `alias` keys in its playerEffects
// params (auto_chess_change_map effects: band 机械援助, 机变 map cards) switch the devices on that player's half of
// the field only (unite / boss fields hold both halves); Battle opts.deviceOverrides switch every half.
// `deviceOverridesOf(battle)` is the union (informational).
// Terrain numbers come from `stage.special` (fallback: the device's skill blackboard, then research 05 values).
// Not implemented: the devices of act1 m05 and m07 (canoe platforms, bushes) — weight 0 this season. The
// canoe (特制水上平台) makes its 深水区 deployable in the prep's deploy map only (server/match/board.js); the sim's Grid
// keeps those tiles NONE (grid.js DEPLOY_REFUSED_TILES), so automatic placements never use them [ASSUMED].

import { COLS, ROWS, STAGE_COLS } from '../constants.js';
import { widePlayerAt, wideSpan } from '../wideStage.js';
import { performAttack, attackCountdown } from '../ai.js';
import { sortEnemyTargets, areaSelectable } from '../targeting.js';
import { DIR_VEC, normDir, oppositeDir } from '../dir.js';
import { hypot } from '../detmath.js';

/** @import { Battle } from '../Battle.js' */
/** @import { Unit } from '../units.js' */
/** @import { Scheduled } from '../battle/hooks.js' */
/** @import { MetaRegistry } from '../../match/effectsMeta.js' */
/**
 * A stage device (stages.json `devices`: key, role, row, col, dir, alias, active, hidden, stats, the level record `raw`),
 * the battle's device state (install: STATE) and its parts.
 * @typedef {Record<string, any>} StageDevice
 * @typedef {{ fx: number, fy: number, dir: string, bb: Record<string, any> }} Flow
 * @typedef {{ d: StageDevice, dir: string, damage: number, atkMul: number, moveMul: number, interval: number }} Storm
 * @typedef {{ alias: string | null, x: number, y: number, lane: Set<number>, far: number, atk: number, every: number,
 *   sp: number, pax: Unit | null, shot: boolean }} Cannon
 * @typedef {{ byPlayer: Map<string, Map<string, boolean>>, global: Map<string, boolean>, terrain: Uint8Array,
 *   hasTerrain: boolean, flow: Map<number, Flow>, turrets: Map<string, Unit>, platformOn: Set<number>,
 *   platformOff: Set<number>, crateOff: Set<number>, storms: Storm[], mounds: Set<number>, cannons: Cannon[],
 *   ticking: boolean, started?: boolean,
 *   mire: { interval: number, aspdPer: number, movePer: number, max: number, heavyWeight: number },
 *   deepsea: { damage: number, aspd: number, moveMul: number },
 *   infection: { damage: number, atk: number, aspd: number, duration: number },
 *   speedup: { aspd: number, moveMul: number } }} DeviceState
 */

/** @param {unknown} v @param {number} [d] */
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
/** ASPD blackboard values: a fraction (|v| < 1, e.g. −0.6 / −0.05) is ×100 ASPD, otherwise flat (+20). @param {number} v */
const aspdOf = (v) => (Math.abs(v) < 1 ? v * 100 : v);

export const TERRAIN = Object.freeze({ mire: 1, smog: 2, deepsea: 3, infection: 4, speedup: 5, grassland: 6 });
const TERRAIN_NAME = ['', 'mire', 'smog', 'deepsea', 'infection', 'speedup', 'grassland'];
/** @type {Record<number, string>} */
const BUFF = { 1: 'terrain:mire', 2: 'terrain:smog', 3: 'terrain:deepsea', 4: 'terrain:infection', 5: 'terrain:speedup', 6: 'terrain:grassland' };
const AIRFLOW = 'terrain:airflow';
const CRATE_KEY = 'trap_1105_accrate';
const TURRET_KEY = 'trap_1104_aclasert';
/** Research 05 §2.3 values, used only when a stage has no `special` block / device blackboard. */
const RESEARCH = Object.freeze({
  mire: { intervalSec: 1, aspdPerStack: -0.05, moveMulPerStack: -0.05, maxStacks: 10, heavyWeight: 3 },
  deepsea: { damage: 40, attack_speed: -0.6, move_speed: 0.6 },
  infection: { damage: 70, atk: 0.2, attack_speed: 20, duration: 300 },
  speedup: { attack_speed: 25, move_speed: 1.5 },
});

/** @type {WeakMap<Battle, DeviceState>} */
const STATE = new WeakMap();
/** @param {Battle} battle */
const stateOf = (battle) => STATE.get(battle) ?? null;

// ---------------------------------------------------------------------------------------------------------------
// device overrides

/** @param {unknown} v */
const truthy = (v) => (typeof v === 'number' ? v !== 0 : typeof v === 'string' ? v !== '0' && v !== '' && v !== 'false' : !!v);

/** @param {Map<string, boolean>} m @param {unknown} obj */
function addOverrides(m, obj) {
  if (!obj || typeof obj !== 'object') return m;
  for (const [k, v] of Object.entries(obj)) if (k.includes('#')) m.set(k, truthy(v));
  return m;
}

/**
 * Device overrides of one player (battle input `deviceOverrides` + playerEffects params): Map alias → active.
 * @param {Record<string, any> | null | undefined} ps
 */
export function playerDeviceOverrides(ps) {
  /** @type {Map<string, boolean>} */
  const m = new Map();
  if (!ps) return m;
  addOverrides(m, ps.input?.deviceOverrides);
  for (const e of ps.playerEffects || []) addOverrides(m, e?.params);
  return m;
}

/** Union of device overrides for this battle: Map alias → active. @param {Battle} battle */
export function deviceOverridesOf(battle) {
  /** @type {Map<string, boolean>} */
  const m = new Map();
  for (const ps of battle.players || []) for (const [k, v] of playerDeviceOverrides(ps)) m.set(k, v);
  addOverrides(m, battle.opts?.deviceOverrides);
  return m;
}

/** @param {StageDevice | null | undefined} d @returns {string | null} */
const aliasOf = (d) => d?.raw?.alias ?? d?.alias ?? null;
/** @param {StageDevice} d */
function dataActive(d) {
  return d.raw && typeof d.raw.active === 'boolean' ? d.raw.active : !d.hidden && d.active !== false;
}
/**
 * Override of a device (true / false, undefined = none). A device belongs to the player whose half of the field
 * holds it (the stage has one alias group per half: #0xx own board, #1xx partner half, #2xx/#3xx boss halves); map
 * cards (“移除场地上全部阻隔工事”) and band 机械援助 (“所有场地中出现1个”) change the owner's own half only — a
 * partner's card never removes this player's crates, a partner's band never adds a turret scaling with this player's
 * layers. Battle-level overrides (opts.deviceOverrides) apply to every half.
 * @param {Battle} battle @param {DeviceState} st @param {StageDevice} d @returns {boolean | undefined}
 */
function overrideOf(battle, st, d) {
  const a = aliasOf(d);
  if (a == null) return undefined;
  const owner = playerForCol(battle, d.col);
  const mine = owner != null ? st.byPlayer.get(owner) : null;
  if (mine && mine.has(a)) return mine.get(a);
  if (st.global.has(a)) return st.global.get(a);
  return undefined;
}
/** @param {Battle} battle @param {DeviceState} st @param {StageDevice} d */
function isActive(battle, st, d) {
  const o = overrideOf(battle, st, d);
  return o === undefined ? dataActive(d) : o;
}

// ---------------------------------------------------------------------------------------------------------------
// cold wind (谢拉格 bond)

/**
 * Every `interval` s (first gust after `first` s, default = interval) all enemies on the field become cold for
 * `duration` s (a number or `() => number`, evaluated per gust — layers can change mid-battle). A cold enemy that
 * gets cold again freezes (engine rule). `playerId` only tags the fx; `ownerOnly` limits the gust to enemies
 * attributed to that player. Returns { cancel() } or null for bad numbers.
 * @param {Battle} battle
 * @param {{ playerId?: string|null, interval?: number, duration?: number | (() => number), first?: number,
 *   ownerOnly?: boolean, effectKey?: string|null }} [opts]
 */
export function startColdWind(battle, { playerId = null, interval, duration, first, ownerOnly = false, effectKey = null } = {}) {
  const iv = num(interval, 0);
  if (!(iv > 0)) return null;
  const durOf = () => num(typeof duration === 'function' ? duration() : duration, 0);
  /** @type {{ cancelled: boolean, gusts: number, timer: Scheduled | null, cancel(): void }} */
  const handle = { cancelled: false, gusts: 0, timer: null, cancel() { this.cancelled = true; this.timer?.cancel(); } };
  const gust = () => {
    if (handle.cancelled || battle.finished) return;
    // the screen-centre effect of each gust (`effectKey`: the client node CreateEffectAtScreenPos, before the cold is
    // applied; the status event 'tplfx' with no target, as content/support tplFx makes it)
    if (effectKey) battle._ev(['tplfx', null, effectKey, null]);
    const dur = durOf();
    if (!(dur > 0)) return;
    let n = 0;
    for (const e of battle.enemies) {
      if (!e.alive || e.hidden) continue;
      if (ownerOnly && playerId != null && e.ownerId !== playerId) continue;
      if (battle.applyStatus(e, 'cold', { duration: dur, source: null })) n++;
    }
    handle.gusts++;
    const R = battle.rect;
    battle.fx('coldWind', { x: (R.c0 + R.c1) / 2, y: (R.r0 + R.r1) / 2, playerId, n, duration: dur });
  };
  const firstDelay = Math.max(0, num(first, iv));
  handle.timer = battle.after(firstDelay, () => {
    if (handle.cancelled) return;
    gust();
    handle.timer = battle.every(iv, gust);
  });
  return handle;
}

/**
 * 谢拉格 6-member wind from the bond effect blackboard (effects.json bondeffect_kjerag `env_gbuff_new` bb):
 * interval `bond_eff_kjerag[storm].interval`, duration `base_time + time_per_stack × layers` — the live 谢拉格 layers
 * of the field's player with the most (client `AutoChessAssignBondStackCntToBB` `_assignAllPlayerIndex`); one wind per field (bonds/nation/kjerag.js installKjerag). `playerId` tags the fx.
 * @param {Battle} battle @param {string | null} playerId @param {Record<string, any>} [bb] @param {{ bondId?: string }} [opts]
 */
export function kjeragColdWind(battle, playerId, bb = {}, { bondId = 'kjeragShip' } = {}) {
  const interval = num(bb['bond_eff_kjerag[storm].interval'], 0);
  const base = num(bb['bond_eff_kjerag[storm].base_time'], 0);
  const per = num(bb['bond_eff_kjerag[storm].time_per_stack'], 0);
  const layers = () => {
    let L = num(battle.getPlayer(playerId)?.bonds?.[bondId]?.layers, 0);
    for (const p of battle.players ?? []) L = Math.max(L, num(battle.getPlayer(p.playerId)?.bonds?.[bondId]?.layers, 0));
    return L;
  };
  // client buff template act1autochess_bond_eff_kjerag[storm] ON_BUFF_TRIGGER: CreateEffectAtScreenPos map_snow_left_2_right
  // (screen ratio 0.5 / 0.5)
  return startColdWind(battle, { playerId, interval, duration: () => base + per * layers(), effectKey: 'map_snow_left_2_right' });
}

// ---------------------------------------------------------------------------------------------------------------
// turrets (“双眼皮”)

/** Highest bond layer count of a player (live copy: in-battle gains included). @param {Battle} battle @param {string} playerId */
function topLayers(battle, playerId) {
  const bonds = battle.getPlayer(playerId)?.bonds;
  let L = 0;
  if (bonds && typeof bonds === 'object') for (const b of Object.values(bonds)) L = Math.max(L, num(b?.layers, 0));
  return L;
}

/** @param {Battle} battle @param {number} c @returns {string | null} */
function playerForCol(battle, c) {
  if (!battle.players.length) return null;
  if (battle.players.length === 1) return battle.players[0].playerId;
  if (battle.wide) return (widePlayerAt(battle.players, c, battle.rect) ?? battle.players[0]).playerId;
  const half = c >= 11 ? 'R' : 'L';
  return (battle.players.find((p) => p.half === half) ?? battle.players[0]).playerId;
}

/**
 * Tile for a turret: its own position when it is inside the field and free, else the nearest free in-rect tile
 * nobody can deploy on — off the enemy paths first (void before a lane / gate: act2 m01's turrets stand on row 8,
 * outside the normal field, and would otherwise land on the red gate).
 * @param {Battle} battle @param {number} r0 @param {number} c0
 */
function deviceTile(battle, r0, c0) {
  const R = battle.rect;
  let /** @type {[number, number] | null} */ best = null, /** @type {number[] | null} */ bs = null;
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      if (battle.isReservedTile(r, c)) continue;
      const exact = r === r0 && c === c0;
      if (!exact && battle.grid.tile(r, c).build !== 'NONE') continue;
      const walk = !exact && battle.grid.groundPassable(r, c, true) ? 1 : 0;
      const s = [exact ? 0 : 1, walk, hypot(r - r0, c - c0), r * COLS + c];
      let less = !bs;
      if (!less) for (let i = 0; i < s.length; i++) { if (s[i] < /** @type {number[]} */ (bs)[i] - 1e-9) { less = true; break; } if (s[i] > /** @type {number[]} */ (bs)[i] + 1e-9) break; }
      if (less) { best = [r, c]; bs = s; }
    }
  }
  return best;
}

/** @param {Battle} battle @param {DeviceState} st @param {StageDevice} d @returns {Unit | null} */
function spawnTurret(battle, st, d) {
  const alias = aliasOf(d) ?? `${d.key}@${d.row},${d.col}`;
  if (st.turrets.has(alias)) return /** @type {Unit} */ (st.turrets.get(alias));
  /** @type {[number, number][]} */
  const tiles = (d.raw?.rangeTiles ?? []).filter((/** @type {unknown} */ p) => Array.isArray(p) && battle.grid.inRect(p[0], p[1]));
  if (!tiles.length) return null; // shoots at nothing on this field
  const tile = deviceTile(battle, d.row, d.col);
  if (!tile) return null;
  const stats = d.raw?.stats ?? d.stats ?? {};
  const u = battle.spawnDevice(d.key, tile[0], tile[1], {
    hp: num(stats.maxHp, 100), blockCnt: 0, name: d.name ?? d.raw?.name ?? d.key,
    atk: num(stats.atk, 0), def: num(stats.def, 0), res: num(stats.res, 0), bat: num(stats.bat, 1), aspd: num(stats.aspd, 100),
  });
  if (!u) return null;
  const skill = d.raw?.skill ?? {};
  const bb = skill.bb ?? {};
  const durM = String(skill.desc ?? skill.description ?? '').match(/持续(\d+(?:\.\d+)?)秒/);
  u.ownerId = playerForCol(battle, d.col);
  u.dir = u.ownerId != null ? (battle.getPlayer(u.ownerId)?.dir ?? 'RIGHT') : 'RIGHT';
  u.mem.turret = {
    alias,
    keys: tiles.map(([r, c]) => r * COLS + c),
    baseAspd: u.base.aspd,
    aspdPer: num(bb.attack_speed_per_stack, 0),
    aspdMax: num(bb.max_attack_speed, Infinity),
    fragPer: num(bb.damage_scale_per_stack, 0),
    fragMax: num(bb.max_damage_scale, Infinity),
    fragDur: durM ? +durM[1] : 0,
    cd: 0,
  };
  st.turrets.set(alias, u);
  battle.fx('turretOnline', { x: u.x, y: u.y, id: u.id, alias });
  return u;
}

const TURRET_PROFILE = Object.freeze({ attack: 'ranged', dmgType: 'arts', projectile: 'bolt', canHitFly: true, maxTargets: 1, atkScale: 1 });

/** @param {Battle} battle @param {Unit} u @param {number} dt */
function tickTurret(battle, u, dt) {
  const T = u.mem.turret;
  if (!u.alive || !T) return;
  T.cd = attackCountdown(T.cd, dt);   // (the engine's attack countdown: a whole number of ticks takes exactly that many)
  if (T.cd > 0 || u.s.flags.stun) return;
  const L = u.ownerId != null ? topLayers(battle, u.ownerId) : 0;
  const bonus = Math.min(L * T.aspdPer, T.aspdMax);
  if (Math.abs(u.base.aspd - (T.baseAspd + bonus)) > 1e-9) { u.base.aspd = T.baseAspd + bonus; u.markDirty(); }
  const cands = battle.enemiesInKeys(T.keys, u, TURRET_PROFILE);
  if (!cands.length) { T.cd = 0; return; }
  sortEnemyTargets(battle, u, cands, null);
  const frag = Math.min(1 + L * T.fragPer, T.fragMax) - 1;
  const prof = {
    ...TURRET_PROFILE,
    afterHit: (/** @type {Battle} */ b, /** @type {Unit} */ src, /** @type {Unit | null} */ target) => {
      if (frag > 0 && T.fragDur > 0 && target && target.alive) b.applyStatus(target, 'fragile', { duration: T.fragDur, value: frag, source: src });
    },
  };
  performAttack(battle, u, prof, [cands[0]]);
  T.cd = u.s.interval;
}

/**
 * Activate “双眼皮” turrets on this field (all known aliases by default; idempotent). Returns the turret units.
 * @param {Battle} battle @param {{ aliases?: readonly (string | null)[] | null }} [opts]
 */
export function activateTurrets(battle, { aliases = null } = {}) {
  const st = stateOf(battle);
  if (!st) return [];
  /** @type {Unit[]} */
  const out = [];
  for (const d of battle.stage?.devices || []) {
    if (d.key !== TURRET_KEY && d.role !== 'turret') continue;
    if (aliases && !aliases.includes(aliasOf(d))) continue;
    const u = spawnTurret(battle, st, d);
    if (u) out.push(u);
  }
  ensureTick(battle, st);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// terrain

/** @param {Battle} battle @param {DeviceState} st */
function buildTerrain(battle, st) {
  const R = battle.rect;
  let any = false;
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      const code = /** @type {Record<string, number>} */ (TERRAIN)[/** @type {string} */ (battle.grid.tile(r, c).terrain)] ?? 0;
      if (code) { st.terrain[r * COLS + c] = code; any = true; }
    }
  }
  st.hasTerrain = any;
  const sp = battle.stage?.special || {};
  const devSkill = (/** @type {string} */ role) => (battle.stage?.devices || []).find((/** @type {StageDevice} */ d) => d.role === role)?.raw?.skill?.bb ?? null;
  // mire
  const m = sp.mire || {};
  const mdev = devSkill('mireController') || {};
  // the device skill's `value` (3) is the 重量 from which an enemy gains 2 layers, not an interval (PRTS 沼泽控制)
  const mInterval = num(m.intervalSec, RESEARCH.mire.intervalSec);
  st.mire = {
    interval: mInterval > 0 ? mInterval : RESEARCH.mire.intervalSec,
    aspdPer: aspdOf(num(m.aspdPerStack ?? mdev.attack_speed, RESEARCH.mire.aspdPerStack)),
    movePer: num(m.moveMulPerStack ?? mdev.move_speed, RESEARCH.mire.moveMulPerStack),
    max: Math.max(1, Math.floor(num(m.maxStacks ?? mdev.max_stack_cnt, RESEARCH.mire.maxStacks))),
    heavyWeight: num(m.heavyWeight ?? mdev.value, RESEARCH.mire.heavyWeight),
  };
  // deep sea
  const ds = sp.deepsea?.bb || devSkill('tideController') || {};
  st.deepsea = {
    damage: num(ds['sea_drown[enemy].damage'], RESEARCH.deepsea.damage),
    aspd: aspdOf(num(ds['sea_drown[enemy].attack_speed'], RESEARCH.deepsea.attack_speed)),
    moveMul: num(ds['sea_drown[enemy].move_speed'], RESEARCH.deepsea.move_speed),
  };
  // active originium: `duration` is how long the effect lasts on a unit (PRTS tile template "部署于其上的我军和经过的
  // 敌军在{duration}s内…"), not a lifetime of the tiles
  const inf = sp.infection?.bb || {};
  const infDur = num(inf.duration, RESEARCH.infection.duration);
  st.infection = {
    damage: num(inf.damage, RESEARCH.infection.damage),
    atk: num(inf.atk, RESEARCH.infection.atk),
    aspd: aspdOf(num(inf.attack_speed, RESEARCH.infection.attack_speed)),
    duration: infDur > 0 ? infDur : RESEARCH.infection.duration,
  };
  // 规程 加速 tiles: the tile blackboard (stage.special.speedup.bb, the legend's bb)
  const su = sp.speedup?.bb || {};
  st.speedup = {
    aspd: num(su.attack_speed, RESEARCH.speedup.attack_speed),
    moveMul: Math.max(0, num(su.move_speed, RESEARCH.speedup.move_speed)),
  };
  // blowers
  for (const d of battle.stage?.devices || []) {
    if (d.role !== 'blower' || !isActive(battle, st, d)) continue;
    const raw = String(d.dir ?? d.raw?.dir ?? 'UP').toUpperCase();
    const f = /** @type {Record<string, readonly number[] | undefined>} */ (DIR_VEC)[raw];
    if (!f) continue;
    const dir = normDir(raw);
    const bb = d.raw?.skill?.bb ?? sp.blower?.bb ?? {};
    const tiles = d.raw?.rangeTiles ?? [];
    for (const p of tiles) {
      if (!Array.isArray(p) || !battle.grid.inRect(p[0], p[1])) continue;
      // world vector: x = col, y = row
      st.flow.set(p[0] * COLS + p[1], { fx: f[1], fy: f[0], dir, bb });
    }
  }
}

/** 活性源石's tick: true damage no unit deals (无来源), tagged 'terrain' = 环境伤害 ("受到来自自然环境的伤害" content reads it). */
/** @param {Battle} battle @param {number} amount */
const infectionDamage = (battle, amount) => (/** @type {{ unit: Unit }} */ ctx) => {
  if (amount > 0 && ctx.unit.alive) battle.dealDamage(null, ctx.unit, { amount, type: 'true', canDodge: false, tags: ['terrain'] });
};

/**
 * 深水区's 【水蚀】 tick (PRTS 涨潮控制 技能3 深水: "每秒受到40点无来源真实持续伤害（不属于环境伤害，不会触发受击回复）"; PRTS 伤害分类
 * lists 深水区/涨潮水蚀 as BUFF damage): 无来源 true 持续伤害 — tags 'dot' (锡人's 凋敝魂灵 raises it), 'periodic' and
 * 'deepsea' (the 免疫水蚀 swimmers cancel it), no 'terrain' (not 环境伤害), no 受击回复 (noSp).
 */
/** @param {Battle} battle @param {number} amount */
const deepWaterDamage = (battle, amount) => (/** @type {{ unit: Unit }} */ ctx) => {
  if (amount > 0 && ctx.unit.alive) battle.dealDamage(null, ctx.unit, { amount, type: 'true', canDodge: false, sourceless: true, noSp: true, tags: ['dot', 'periodic', 'deepsea'] });
};

/** @param {Battle} battle @param {DeviceState} st @param {Unit} u @param {number} code */
function enterTerrain(battle, st, u, code) {
  const m = u.mem;
  if (m.terrain === code) return;
  // leaving a tile ends its effect — except 活性源石's, which runs out on its own (touchInfection)
  if (m.terrain && m.terrain !== TERRAIN.infection) battle.removeBuff(u, BUFF[m.terrain]);
  m.terrain = code;
  m.terrainSince = battle.time;
  m.mireStacks = 0;
  m.mireTriggers = 0;
  if (!code) return;
  // smog / grassland 隐匿 are `visible` (sent as 'status'): the client draws each tile's 隐匿 by its own buff's effect, not the
  // operator's own (render/fxstatus.js KEY_FX 'terrain:smog' / 'terrain:grassland') — display only
  if (code === TERRAIN.smog) battle.addBuff(u, { key: BUFF[code], flags: { stealth: true }, visible: true });
  else if (code === TERRAIN.speedup) {
    // tile_speedup (ON_BUFF_LATE_ENABLE): an ally CHARACTER of any profession (summons included) ATTACK_SPEED ADDITION
    // attack_speed, an enemy MOVE_SPEED FINAL_SCALER move_speed
    battle.addBuff(u, { key: BUFF[code], mods: u.side === 'ally' ? { aspd: st.speedup.aspd } : { moveMul: st.speedup.moveMul } });
  } else if (code === TERRAIN.grassland) {
    // tile_duel_grassland: INVISIBLE (the smog tile's flag) on a WALK owner; an enemy's derived
    // dule_grassland[invisible-enemy] adds an INVISIBLE immunity while it is blocked and drops it when the block ends
    // (ON_OWNER_BLOCKEE_CHANGED) — no restore delay (stealthRestore 0; targeting.js enemyStealthed reads the block)
    battle.addBuff(u, { key: BUFF[code], flags: { stealth: true }, visible: true, ...(u.side === 'enemy' ? { data: { stealthRestore: 0 } } : {}) });
  }
  else if (code === TERRAIN.deepsea) {
    const D = st.deepsea;
    battle.addBuff(u, { key: BUFF[code], mods: { aspd: D.aspd, moveMul: D.moveMul }, interval: 1, onTick: deepWaterDamage(battle, D.damage) });
  }
  // mire layers are applied by tickMire, 活性源石 by touchInfection (every tick on the tile)
}

/**
 * 活性源石 contact (every tick on the tile). The tile gives a timed effect — damage true dmg/s, ATK + atk, ASPD +
 * attack_speed for `duration` s (PRTS 特殊地形 tile template: "部署于其上的我军和经过的敌军在{duration}s内每秒受到{damage}
 * 真实伤害，攻击力提升…，攻击速度增加…") — that stays on an enemy after it walks off: PRTS 危机合约 tag
 * global_tile_infection_1 「目标：可控感染」 "踏过活性源石地块的敌人不再持续损失生命值" switches the lasting HP loss off,
 * so without it the loss continues. One effect per unit (PRTS 作战机制: "同名buff的默认叠加策略buff只能表现出一个"): a
 * unit that already carries it gets its full `duration` back and keeps its per-second rhythm — no second effect, no
 * extra tick [ASSUMED: the time counts from the last contact — so an operator deployed on it, always in contact, drains
 * past `duration`]. An operator moved off the tile (Battle.relocate: 夕's 小自在 …) keeps it for its time; leaving the
 * field drops it with every buff, and so does a 【移动】 (Battle.moveRedeploy: the old character's buffs end); a 重生 clears it (enemies/archetypes.js rebirthCleanse: PRTS
 * 特殊机制 §重生 "清空自身身上除白名单外所有Buff") and contact gives it again while the unit is on the tile [ASSUMED]. The
 * tick (infectionDamage) is true damage no unit deals (无来源), tagged 'terrain' = 环境伤害 (PRTS 自然环境 lists 活性源石),
 * not 'dot' [ASSUMED: PRTS 伤害分类's list of BUFF damage does not name it].
 */
/** @param {Battle} battle @param {DeviceState} st @param {Unit} u */
function touchInfection(battle, st, u) {
  const I = st.infection;
  const key = BUFF[TERRAIN.infection];
  const b = /** @type {{ timeLeft: number } | null} */ (u.findBuff(key));
  if (b) { if (b.timeLeft < I.duration) b.timeLeft = I.duration; return; }
  battle.addBuff(u, { key, duration: I.duration, mods: { atkPct: I.atk, aspd: I.aspd }, interval: 1, onTick: infectionDamage(battle, I.damage) });
}

/** Layers an enemy gains per 【陷入沼泽】 trigger at 重量 ≥ heavyWeight (PRTS 沼泽控制: "若其重量大于等于3，改为获得2层"). */
const MIRE_HEAVY_LAYERS = 2;

/**
 * 沼泽 (PRTS 沼泽控制 备注): a unit in the mire triggers its 【陷入沼泽】 "每秒…一次" (the device skill charges in 1 s) — an
 * enemy gains 1 layer of ASPD −5 % and move speed −5 % (2 layers at 重量 ≥ heavyWeight, the skill's `value` 3), any other
 * unit 1 layer of ASPD −5 % only; at most 10 layers; "上述减益于单位不再位于沼泽之中时解除" (enterTerrain).
 * [ASSUMED] the first trigger comes on entering, then one every second.
 * @param {Battle} battle @param {DeviceState} st @param {Unit} u
 */
function tickMire(battle, st, u) {
  const M = st.mire, m = u.mem;
  const due = 1 + Math.floor((battle.time - m.terrainSince + 1e-9) / M.interval);
  if (due <= m.mireTriggers) return;
  const enemy = u.side === 'enemy';
  const per = enemy && num(u.s.massLevel, 0) >= M.heavyWeight ? MIRE_HEAVY_LAYERS : 1;
  const n = Math.min(M.max, m.mireStacks + per * (due - m.mireTriggers));
  m.mireTriggers = due;
  if (n === m.mireStacks) return;
  m.mireStacks = n;
  battle.addBuff(u, { key: BUFF[TERRAIN.mire], refresh: 'replace', mods: enemy ? { aspd: M.aspdPer * n, moveMul: Math.max(0, 1 + M.movePer * n) } : { aspd: M.aspdPer * n } });
}

/**
 * Terrain code under a unit (0 = none). Air units (Unit.isFlying: flyers, hovering 近地悬浮 and levitated enemies) and
 * hidden units ignore ground terrain; smog only helps allies.
 * @param {Battle} battle @param {DeviceState} st @param {Unit} u
 */
function terrainFor(battle, st, u) {
  if (u.hidden || u.isFlying) return 0;
  let k;
  if (u.side === 'ally') k = u.tileR * COLS + u.tileC;
  else {
    const r = Math.round(u.y), c = Math.round(u.x);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return 0;
    k = r * COLS + c;
  }
  let code = st.terrain[k];
  if (code === TERRAIN.smog && u.side !== 'ally') code = 0;
  if (code === TERRAIN.deepsea && u.side === 'ally') code = 0;
  return code;
}

/** @param {number} dot */
function airflowRelation(dot) { return dot > 0.7 ? 'equal' : dot < -0.7 ? 'opposite' : 'vertical'; }
/** Operator ↔ blower: the same direction ⇒ 'equal', the reverse ⇒ 'opposite', perpendicular ⇒ 'vertical'. @param {unknown} unitDir @param {unknown} flowDir */
export function airflowRelationOf(unitDir, flowDir) {
  const u = normDir(unitDir), f = normDir(flowDir);
  return u === f ? 'equal' : u === oppositeDir(f) ? 'opposite' : 'vertical';
}

/** @param {Battle} battle @param {DeviceState} st @param {Unit} u */
function tickAirflowAlly(battle, st, u) {
  const f = st.flow.get(u.tileR * COLS + u.tileC);
  let atk = 0;
  if (f && u.motion !== 'FLY') atk = num(f.bb[`blower_s_character[${airflowRelationOf(u.dir, f.dir)}].atk`], 0);
  if (atk === (u.mem.airAtk ?? 0)) return;
  u.mem.airAtk = atk;
  // shown (`visible`): the client's buff blower_s[atk] wears wind_buff_02 when it raises ATK ([equal]) and wind_buff_01
  // when it lowers it ([opposite], [vertical] below 0) — `fxTag` 2 / 1 (render/fxstatus.js KEY_FX); a new sign is a new buff
  battle.removeBuff(u, AIRFLOW);
  if (atk) battle.addBuff(u, { key: AIRFLOW, mods: { atkPct: atk }, visible: true, fxTag: atk > 0 ? 2 : 1 });
}

/** @param {Battle} battle @param {DeviceState} st @param {Unit} e */
function tickAirflowEnemy(battle, st, e) {
  const px = e.mem.airPx, py = e.mem.airPy;
  e.mem.airPx = e.x; e.mem.airPy = e.y;
  let mul = 1;
  if (!e.hidden && px != null) {
    const r = Math.round(e.y), c = Math.round(e.x);
    const f = r >= 0 && r < ROWS && c >= 0 && c < COLS ? st.flow.get(r * COLS + c) : null;
    const vx = e.x - px, vy = e.y - py;
    const v = hypot(vx, vy);
    if (f && v > 1e-6) {
      const rel = airflowRelation((vx * f.fx + vy * f.fy) / v);
      if (rel !== 'vertical') mul = 1 + num(f.bb[`blower_s_enemy[${rel}].move_speed`], 0);
    } else if (f && v <= 1e-6) mul = e.mem.airMul ?? 1; // paused this tick (attack pause / blocked): keep the last push
  }
  if (!(mul >= 0)) mul = 0;
  if (mul === (e.mem.airMul ?? 1)) return;
  e.mem.airMul = mul;
  if (mul !== 1) battle.addBuff(e, { key: AIRFLOW, refresh: 'replace', mods: { moveMul: mul } });
  else battle.removeBuff(e, AIRFLOW);
}

/** Apply terrain / airflow state to one unit now (deploy, spawn, every tick). @param {Battle} battle @param {DeviceState} st @param {Unit} u */
function refreshUnit(battle, st, u) {
  if (!u.alive || !u.deployed || u.kind === 'device') return;
  if (st.hasTerrain) {
    enterTerrain(battle, st, u, terrainFor(battle, st, u));
    if (u.mem.terrain === TERRAIN.mire) tickMire(battle, st, u);
    else if (u.mem.terrain === TERRAIN.infection) touchInfection(battle, st, u);
  }
  if (st.flow.size) { if (u.side === 'ally') tickAirflowAlly(battle, st, u); else tickAirflowEnemy(battle, st, u); }
}

/** @param {Battle} battle @param {DeviceState} st */
function ensureTick(battle, st) {
  if (st.ticking) return;
  if (!st.hasTerrain && !st.flow.size && !st.turrets.size && !st.storms.length && !st.cannons.length) return;
  st.ticking = true;
  battle.on('tick', ({ dt }) => {
    if (st.hasTerrain || st.flow.size) {
      for (const u of battle.allyUnits) refreshUnit(battle, st, u);
      for (const e of battle.enemies) refreshUnit(battle, st, e);
    }
    if (st.storms.length) {
      for (const u of battle.allyUnits) tickStorm(battle, st, u);
      for (const e of battle.enemies) tickStorm(battle, st, e);
    }
    for (const u of st.turrets.values()) tickTurret(battle, u, dt);
    for (const k of st.cannons) tickCannon(battle, k, dt);
  });
  // a unit that (re)deploys / spawns starts fresh (death drops its buffs) and gets its tile's terrain at once: smog
  // must already hide an operator from the first enemy shot of the battle. A 【移动】 (ctx.move, Battle.moveRedeploy)
  // too: the old character's terrain and airflow buffs ended with it, so the new tile's are put on from nothing
  battle.on('deploy', (ctx) => {
    const u = ctx.unit;
    if (!u || !u.mem || u.kind === 'device') return;
    u.mem.terrain = 0; u.mem.airAtk = 0; u.mem.airMul = 1; u.mem.airPx = null; u.mem.stormNext = null;
    refreshUnit(battle, st, u);
  }, { priority: 90 });
}

/**
 * Terrain name under (r, c) for other content ('mire' | 'smog' | 'deepsea' | 'infection' | 'speedup' | 'grassland' | null).
 * @param {Battle} battle @param {number} r @param {number} c
 */
export function terrainAt(battle, r, c) {
  const st = stateOf(battle);
  const code = st && r >= 0 && r < ROWS && c >= 0 && c < COLS ? st.terrain[r * COLS + c] : 0;
  return TERRAIN_NAME[code] || null;
}

// ---------------------------------------------------------------------------------------------------------------
// sandstorm (act1 m06)

const STORM_ALLY = 'terrain:sandstorm';
const STORM_ENEMY = 'terrain:sandstormSlow';
/** sktok_storm blackboard (data/stages.json device skill), used only when a storm device carries none. */
const STORM_BB = Object.freeze({ damage: 100, interval: 2, atk: -0.5, 'sand_storm[enemy].move_speed': -0.4 });

/** Storm devices and the tiles of the field's 土石结构 (every half: shelter is looked for up to the map edge). @param {Battle} battle @param {DeviceState} st */
function buildStorm(battle, st) {
  const devices = battle.stage?.devices || [];
  st.storms = [];
  for (const d of devices) {
    if (d.role !== 'sandstorm') continue;
    const bb = { ...STORM_BB, ...(d.raw?.skill?.bb ?? {}) };
    const interval = num(bb.interval, STORM_BB.interval);
    st.storms.push({
      d, dir: normDir(d.dir ?? d.raw?.dir, 'DOWN'),
      damage: num(bb.damage, STORM_BB.damage), atkMul: Math.max(0, 1 + num(bb.atk, STORM_BB.atk)),
      moveMul: Math.max(0, 1 + num(bb['sand_storm[enemy].move_speed'], STORM_BB['sand_storm[enemy].move_speed'])),
      interval: interval > 0 ? interval : STORM_BB.interval,
    });
  }
  st.mounds = new Set();
  for (const d of devices) if (d.role === 'mound' && d.row >= 0 && d.col >= 0 && isActive(battle, st, d)) st.mounds.add(d.row * COLS + d.col);
}

/**
 * The storm blowing over a half of the field: its device is on unless the half's player switched it off (map card
 * 模拟战场演变·模式八 `map_m06_1` "场地中的沙尘暴停止": `trap_036_storm#1/#2` 0). The storm device stands off the field (18, 0),
 * on no half, so the card goes by the half the unit stands in — like every other map card, a player's card changes
 * that player's half only [ASSUMED]. The first storm switched on wins (the m06 level switches #2 on nowhere).
 * @param {Battle} battle @param {DeviceState} st @param {string | null} playerId
 */
function stormFor(battle, st, playerId) {
  const mine = playerId != null ? st.byPlayer.get(playerId) : null;
  for (const s of st.storms) {
    const a = aliasOf(s.d);
    const on = a != null && mine?.has(a) ? mine.get(a) : a != null && st.global.has(a) ? st.global.get(a) : dataActive(s.d);
    if (on) return s;
  }
  return null;
}

/**
 * What the client draws of the 沙尘暴 (render: the camera's sand sheet, the 土石结构's sand marks): the column spans where a
 * storm blows and its direction — [{ c0, c1, dir }], one per half a player's card leaves it on (the whole field for one
 * player), or null on a stage without a storm. Display only (Battle.fieldMeta), nothing in the sim reads it.
 * @param {Battle} battle
 * @returns {{c0: number, c1: number, dir: string}[]|null}
 */
export function stormView(battle) {
  const st = stateOf(battle);
  if (!st?.storms.length) return null;
  const players = battle.players || [];
  const last = STAGE_COLS - 1; // the stage's last column (the grid is wider: constants.js COLS)
  const spans = players.length <= 1 ? [[0, last, players[0]?.playerId ?? null]]
    : battle.wide ? players.map((p) => [...wideSpan(players, p, battle.rect), p.playerId])
      : [[0, 10, playerForCol(battle, 0)], [11, last, playerForCol(battle, last)]];
  const out = [];
  for (const [c0, c1, pid] of spans) {
    const s = stormFor(battle, st, pid);
    if (s) out.push({ c0, c1, dir: s.dir });
  }
  return out;
}

/**
 * Sheltered from a storm blowing `dir`: a 土石结构 stands on a tile in the line from (r, c) against the wind, up to
 * the map edge (client node `HasCertainCharacterInFrontOfMe`: `MapUtil.GetGridPositionsAlongTheDirection`
 * from the unit's tile in `InverseDirection(storm.direction)`, own tile excluded, no distance limit — any character
 * `trap_032_mound` on one of them).
 * @param {DeviceState} st @param {number} r @param {number} c @param {string} dir
 */
function stormSheltered(st, r, c, dir) {
  const [dr, dc] = DIR_VEC[oppositeDir(dir)];
  for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS; rr += dr, cc += dc) {
    if (st.mounds.has(rr * COLS + cc)) return true;
  }
  return false;
}

/** 沙尘暴's tick on an operator: pure 环境伤害 no unit deals (`NoSourceDamage` PURE, `_isEnvDamage`, `_ignoreForSp`). @param {Battle} battle @param {Unit} u @param {number} amount */
const stormDamage = (battle, u, amount) => {
  if (amount > 0 && u.alive) battle.dealDamage(null, u, { amount, type: 'true', canDodge: false, sourceless: true, noSp: true, tags: ['terrain', 'sandstorm'] });
};

/**
 * 沙尘暴 (client sktok_storm → buff templates sand_storm[ally] / [enemy] / [trap], EN buff_template_holder): the storm
 * gives every operator / summon (EntityCategory DEFAULT, any motion) and enemy a buff that triggers every
 * blackboard `interval` (2) s — the first at once (`waitFirstTriggerInterval` false), counted from when the unit
 * entered the field. At a trigger the unit is checked against the 土石结构 (stormSheltered):
 *   operator unsheltered → `damage` (100) pure 环境伤害, then ATK FINAL_SCALER × (1 + atk) (0.5) kept until a trigger
 *     finds it sheltered;
 *   enemy unsheltered → move speed × (1 + move_speed) (0.6) kept the same way (the enemy buff takes no damage).
 * The [trap] buff damages OBSTACLE-category units (the 土石结构 only: 射击台, sealed floor and turrets are TRAP_OR_ITEM)
 * unless strengthened — the m06 mounds start with 风沙掩体 level 2 (level file `mainSkillLvl` 2, SP full at 10/10):
 * strengthened at once, never damaged, so they stay obstacles (Battle._spawnStageDevices). The storm lasts the
 * battle (blackboard `duration` 1500 s). Not modelled: sand_storm[ally] ON_OWNER_FINISH's card buff (a redeploy-cost
 * rule; this mode has no redeploy) [ASSUMED]; the storm effects (map_desert_03_*, screen_desert_*) are the renderer's.
 * [ASSUMED] the storm acts from the battle's first tick (the client's trap birth time is not modelled).
 * @param {Battle} battle @param {DeviceState} st @param {Unit} u
 */
function tickStorm(battle, st, u) {
  if (!u.alive || !u.deployed || u.kind === 'device' || u.hidden) return;
  const ally = u.side === 'ally';
  const r = ally ? u.tileR : Math.round(u.y), c = ally ? u.tileC : Math.round(u.x);
  const s = stormFor(battle, st, playerForCol(battle, c));
  const key = ally ? STORM_ALLY : STORM_ENEMY;
  const m = u.mem;
  if (!s) { if (m.stormNext != null) { m.stormNext = null; battle.removeBuff(u, key); } return; }
  if (m.stormNext == null) m.stormNext = battle.time;
  if (battle.time + 1e-9 < m.stormNext) return;
  m.stormNext += s.interval;
  if (m.stormNext <= battle.time + 1e-9) m.stormNext = battle.time + s.interval;
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS && stormSheltered(st, r, c, s.dir)) { battle.removeBuff(u, key); return; }
  if (ally) {
    stormDamage(battle, u, s.damage);
    // fxTag: the storm's direction — the client's SwitchDirection picks the buff's effect by it (render/fxstatus.js)
    if (u.alive && !u.findBuff(key)) battle.addBuff(u, { key, mods: { atkMul: s.atkMul }, visible: true, fxTag: s.dir });
  } else if (!u.findBuff(key)) battle.addBuff(u, { key, mods: { moveMul: s.moveMul }, visible: true });
}

// ---------------------------------------------------------------------------------------------------------------
// 盐坨子炮 (规程 m10)

const CANNON_KEY = 'trap_196_cnnon';
/** sktok_cnnon: SP 6, 1 SP a second (spType 1), from 0 — a shot every 6 s from the battle start, × the level's
 * char_skill_cd_mul (levelRunes: m10 ×2 → 12 s). */
const CANNON_EVERY = 6;
/** EnemyCannon00D's range 4-1 at the device's level 1 (character_table talents): its own tile and four ahead. */
const CANNON_REACH = 4;
/** projectile_trap_cnnon_small_death: speed 5 tiles/s. */
const CANNON_SHOT_SPEED = 5;
/** Others/Direction/Talents/Eat's Selector CircleCollider2D: radius 1 around the device. */
const CANNON_EAT_RADIUS = 1;
/** Eat's AdvancedSelectorWithMassRange: weight (massLevel) ≤ 3 (CompareType LE). */
const CANNON_EAT_MASS = 3;
/** Eat's `_randomOffsetBound`: the passenger lands at the shell's point ± 0.2 per axis. */
const CANNON_DROP_SCATTER = 0.2;
/** cnnon_projectile_arrive (0.1 s on a released passenger): Eat's TargetValidator leaves it out meanwhile. */
const CANNON_ARRIVE = 0.1;

/**
 * 盐坨子炮 (`trap_196_cnnon`, 规程 m10 — docs/rules/sim.md 「규정 전장을 19×21 틀로」 장치): an enemy-side stage device off
 * the board, facing its `dir`. Every CANNON_EVERY s (sktok_cnnon → cnnon_s[enemy_canon] → TriggerAbility EnemyCannon00D:
 * the main story boss's buffs that pick the other branches never exist here) it shoots at the not stunned ground ally
 * of the highest 仇恨 (NOT_STUNNED_HATRED_DES: taunt, then the latest deployed) on its own tile and the four ahead
 * (range 4-1); the shell (speed 5) lands on that ally's tile at its fire-time position and deals physical ATK × 1 to
 * every ally of any motion in the 3×3 around it (`x-4`, camouflage ignored). Between shots its Eat (a DurbusAbility)
 * takes on board the nearest same-side ground enemy of weight ≤ 3 within radius 1 (one at a time, until the shell that
 * carries it lands); a shot carries the passenger it held at the cast start and drops it at the landing point ± 0.2, where it walks on along its own route —
 * `talent@branch_id`'s branch route is not found in this mode's level data, and the client then keeps the route
 * (DurbusAbility._DoReleasePassengers; maintainer decision 2026-11-11) [추정·미조사: which level fills the scheduler's
 * branches and the map's extra routes in this mode — research note on 盐坨子炮].
 * [추정·엔진] the device is no unit here: no HP (30000, DEF 3000, taunt −1, on an unbuildable tile off the board) and
 * nobody attacks it — an enemy-side unit that lives through the battle would hold the 「all enemies down」 end.
 * @param {Battle} battle @param {DeviceState} st
 */
function buildCannons(battle, st) {
  for (const d of battle.stage?.devices || []) {
    if (d.key !== CANNON_KEY || d.active === false || d.hidden) continue;
    const [dr, dc] = DIR_VEC[normDir(d.dir, 'DOWN')];
    /** @type {number[]} */
    const lane = [];
    for (let k = 0; k <= CANNON_REACH; k++) {
      const r = d.row + dr * k, c = d.col + dc * k;
      if (battle.grid.inRect(r, c)) lane.push(r * COLS + c);
    }
    if (!lane.length) continue;   // a cannon of another field: its lane is not on this battle's
    const stats = d.raw?.stats ?? d.stats ?? {};
    // the level's runes (m10's sub-levels: char_attribute_add ATK −400, char_skill_cd_mul scale 2 — 800 a shot, one every 12 s)
    let atk = num(stats.atk, 0), every = CANNON_EVERY;
    for (const r of levelRunes(battle, CANNON_KEY)) {
      if (r.key === 'char_attribute_add') atk += num(r.bb?.ATK, 0);
      else if (r.key === 'char_skill_cd_mul') every = Math.round(every * num(r.bb?.scale, 1));
    }
    // `far`: the farthest tile of its lane on this battle's grid, where every shell falls (fireCannon)
    st.cannons.push({ alias: aliasOf(d), x: d.col, y: d.row, lane: new Set(lane), far: /** @type {number} */ (lane.at(-1)), atk: Math.max(0, atk), every: Math.max(1, every), sp: 0, pax: null, shot: false });
  }
}

/**
 * The stage level's runes (stages.json `runes`) on character key `key`. The client's BasicCharacterRune takes a rune's
 * `char` string as its selector's charIdFilter (RuneData._PopulateAdditionalFiltersFromBlackboard) and matches it
 * against Entity.id, the table key (Character._AssignData) — never an alias: m10's rune that lists
 * trap_196_cnnon#1|…|#4 matches no cannon, its twin naming trap_196_cnnon does (공식 클라에서 확인 2026-11-14).
 * Each matching rune applies on its own (CSkillCdMul: the SP cost × scale, rounded, per rune).
 */
/**
 * The level runes the sim applies: `<rune key>@<character key>` → { reads: blackboard keys it applies, unread: key →
 * why it does not }. server/sim/content/coverage.js runeRows checks every played stage's runes against it.
 * @type {Readonly<Record<string, Readonly<{ where: string, reads: readonly string[], unread: Readonly<Record<string, string>> }>>>}
 */
export const LEVEL_RUNES_READ = Object.freeze({
  [`char_attribute_add@${CANNON_KEY}`]: Object.freeze({ where: 'devices.js buildCannons', reads: ['ATK'],
    unread: { MAX_HP: 'the cannon is no unit: it has no HP and takes no hits (docs/rules/sim.md, 염괴포 [추정·엔진])' } }),
  [`char_skill_cd_mul@${CANNON_KEY}`]: Object.freeze({ where: 'devices.js buildCannons', reads: ['scale'], unread: {} }),
});

/** @param {Battle} battle @param {string} key @returns {Record<string, any>[]} */
function levelRunes(battle, key) {
  const runes = battle.stage?.runes ?? battle.stage?.raw?.runes ?? [];   // (simdata.js normalizeStage keeps the record as `raw`)
  return (Array.isArray(runes) ? runes : []).filter((r) => {
    const ids = typeof r?.bbStr?.char === 'string' ? r.bbStr.char.split('|') : null;
    return !ids || ids.includes(key);
  });
}

/** Eat: may the cannon take enemy `e` on board (ground, weight ≤ 3, on the field, not just dropped)? @param {Battle} battle @param {Unit} e */
function cannonCanEat(battle, e) {
  if (!e.alive || e.hidden || e.isFlying || e.isBoss || e.s.flags.untargetable) return false;
  if ((e.mem.cannonArrive ?? -Infinity) > battle.time + 1e-9) return false;   // cnnon_projectile_arrive
  return (e.weight ?? 0) <= CANNON_EAT_MASS;
}

/** A cannon of this battle, every tick (ensureTick): Eat looks for a passenger, the SP charges, a shot at 6 SP. @param {Battle} battle @param {Cannon} k @param {number} dt */
function tickCannon(battle, k, dt) {
  if (!battle.started) return;
  if (k.pax && !k.pax.alive) { cannonCarry(battle, k, k.pax, 0); k.pax = null; k.shot = false; }
  if (!k.pax) {
    // Eat (DurbusAbility._SearchPassengers every tick, max_target 1) [추정·엔진: its selector's HATRED_DES among
    // enemies — read here as the nearest, then the earliest spawned]
    const near = battle.enemiesInRadius(k.x, k.y, CANNON_EAT_RADIUS).filter((e) => cannonCanEat(battle, e))
      .map((e) => ({ e, d: hypot(e.x - k.x, e.y - k.y) })).sort((p, q) => p.d - q.d || p.e.spawnSeq - q.e.spawnSeq);
    const o = near.length ? near[0].e : null;
    if (o) {
      battle._cutAttackStand(o);
      battle._setHidden(o, true, { fx: false });
      o.pauseUntil = Infinity;   // carried: it neither walks its route nor waits out its legs
      k.pax = o;
      cannonCarry(battle, k, o, 1);
    }
  }
  if ((k.sp += dt) < k.every - 1e-9) return;
  k.sp -= k.every;
  fireCannon(battle, k);
}

/**
 * The renderer's signal that cannon `k` takes enemy `e` on board (`on` 1) or lets it go (0): the official DurbusAbility
 * puts its `_passengerEffects` (trap_cnnon_buff) on the cannon while it holds a passenger (`_UpdatePassengerEffect`) and
 * `_buffsWhenCarryPassenger` (cnnon_carry_enemy, its sound cnnon_carry_enemy_audio) on the cannon as it takes one.
 */
/** @param {Battle} battle @param {Cannon} k @param {Unit} e @param {number} on */
function cannonCarry(battle, k, e, on) {
  battle.fx('cannon', { x: k.x, y: k.y, carry: on, pax: e.id });
}

/** @param {Battle} battle @param {Cannon} k */
function fireCannon(battle, k) {
  // EnemyCannon00D is a ProjectileToTileAbility whose TileSelector (`_filterType` 12 DIST_DES_IN_FRONT_LINE, range 4-1)
  // keeps the tiles of its range in the line it faces and takes the farthest — whoever stands where: no unit is looked
  // for, so it fires every time, at the same tile (2026-11-14: a CN player's report, 「the shell falls one tile above
  // the field's bottom, a unit right next to the cannon is never shot」; 공식 클라에서 확인 — TileSelector._DoFilter)
  if (k.far < 0) return;
  const r = Math.floor(k.far / COLS), c = k.far % COLS;
  // cnnon_t[mark_passenger] at the cast start: the passenger it carries now. It stays one of the cannon's passengers until
  // the shell lands (DurBusAbilityReleasePassenger on arrival), so Eat (max_target 1: `_SearchPassengers` takes nobody
  // while it holds `m_maxCount`) takes no other meanwhile
  const pax = k.shot ? null : k.pax;
  if (pax) k.shot = true;
  const flight = hypot(c - k.x, r - k.y) / CANNON_SHOT_SPEED;
  // the renderer's signal (render/fxgame.js cannonFx): the cast (trap_cnnon_attack_start on the cannon) and the shell
  // (projectile_trap_cnnon_small_death) from the cannon to the tile, `t` s in the air; its landing is the 'explode' below
  battle.fx('cannon', { x: k.x, y: k.y, fire: 1, tx: c, ty: r, t: flight, pax: pax ? pax.id : null });
  battle.after(flight, () => {
    // the shell's range x-4: the 3×3 around its point, any motion, 迷彩 ignored — physical, the device's ATK × 1
    const hit = battle.allies().filter((a) => a.alive && a.deployed && !a.hidden && a.kind !== 'device' && areaSelectable(null, a)
      && Math.abs(a.tileR - r) <= 1 && Math.abs(a.tileC - c) <= 1);
    // `hit`: the units it hits (the renderer plays the shell's `_effectsWhenHit` on them)
    battle.fx('explode', { x: c, y: r, r: 1.5, kind: 'cnnonShell', hit: hit.map((a) => a.id) });
    for (const a of hit) battle.dealDamage(null, a, { amount: k.atk, type: 'phys', sourceless: true, isSplash: true, tags: ['cnnonShell'] });
    if (!pax) return;
    if (k.pax === pax) { k.pax = null; k.shot = false; cannonCarry(battle, k, pax, 0); }
    if (!pax.alive) return;
    // DurBusAbilityReleasePassenger on the shell's trace point ± `_randomOffsetBound`; the route stays its own
    pax.x = c + battle.rng.range(-CANNON_DROP_SCATTER, CANNON_DROP_SCATTER);
    pax.y = r + battle.rng.range(-CANNON_DROP_SCATTER, CANNON_DROP_SCATTER);
    battle._clampPos(pax);
    const R = pax.route;
    if (R) pax.route = { legs: R.legs.slice(), legIdx: R.legIdx, pts: null, ptIdx: 0, suffix: null, version: -1, waitLeft: R.waitLeft };
    pax.pauseUntil = -Infinity;
    pax.mem.cannonArrive = battle.time + CANNON_ARRIVE;
    battle._setHidden(pax, false, { fx: false });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// install

/** @param {Battle} battle */
export function install(battle) {
  // (the terrain parts mire / deepsea / infection / speedup are filled by buildTerrain below)
  const st = /** @type {DeviceState} */ (/** @type {unknown} */ ({
    byPlayer: new Map((battle.players || []).map((ps) => [ps.playerId, playerDeviceOverrides(ps)])),
    global: addOverrides(new Map(), battle.opts?.deviceOverrides),
    terrain: new Uint8Array(ROWS * COLS),
    hasTerrain: false,
    flow: new Map(),
    turrets: new Map(),
    platformOn: new Set(),
    platformOff: new Set(),
    crateOff: new Set(),
    storms: [],
    mounds: new Set(),
    cannons: [],
    ticking: false,
  }));
  STATE.set(battle, st);
  const devices = battle.stage?.devices || [];
  buildTerrain(battle, st); // grid, stage `special` and overrides are known at construction
  buildStorm(battle, st);
  buildCannons(battle, st);
  ensureTick(battle, st);

  // overrides that differ from the data (per half owner): crates removed, platforms added/removed
  for (const d of devices) {
    if (!battle.grid.inRect(d.row, d.col)) continue;
    const on = overrideOf(battle, st, d);
    if (on === undefined || on === dataActive(d)) continue;
    const k = d.row * COLS + d.col;
    if (d.role === 'crate' && !on) st.crateOff.add(k);
    if (d.role === 'platform' || d.role === 'mound') (on ? st.platformOn : st.platformOff).add(k);
  }

  battle.on('deploy', (ctx) => {
    const u = ctx.unit;
    if (!u || u.side !== 'ally') return;
    const k = u.tileR * COLS + u.tileC;
    if (u.kind === 'device') {
      // stage crates switched off by a map card vanish before anybody deploys on their tile
      if (u.defId === CRATE_KEY && st.crateOff.has(k) && !st.started) { u.mem.removedByOverride = true; battle.retreat(u, { reason: 'removed', permanent: true }); }
      return;
    }
    if (u.motion === 'FLY') return; // an air unit (炎佑) stands on no platform
    if (st.platformOn.has(k)) u.ground = false;
    else if (st.platformOff.has(k)) u.ground = battle.grid.isLow(u.tileR, u.tileC);
  }, { priority: 100 });

  // an enemy stopped by a crate breaks it (the engine lets attackers chop it; this also covers harmless walkers)
  battle.on('blocked', (/** @type {{ blocker: Unit, enemy: Unit }} */ { blocker, enemy }) => {
    if (!blocker || blocker.kind !== 'device' || blocker.defId !== CRATE_KEY) return;
    const delay = Math.max(0.1, Math.min(10, num(enemy.s.interval, 1)));
    battle.after(delay, () => {
      if (blocker.alive && enemy.alive && enemy.blockedBy === blocker) {
        battle.fx('crateBreak', { x: blocker.x, y: blocker.y, id: blocker.id });
        battle.kill(blocker, enemy);
      }
    });
  });

  battle.on('battleStart', () => {
    st.started = true;
    // platforms switched by map cards (the engine applied the data state)
    for (const k of st.platformOn) battle.setObstacle((k / COLS) | 0, k % COLS, true);
    for (const k of st.platformOff) battle.setObstacle((k / COLS) | 0, k % COLS, false);
    // hidden crates switched on by an override
    for (const d of devices) {
      if (d.role !== 'crate' || dataActive(d) || !isActive(battle, st, d) || !battle.grid.inRect(d.row, d.col) || battle.unitAt(d.row, d.col)) continue;
      battle.spawnDevice(d.key, d.row, d.col, { hp: num(d.stats?.maxHp ?? d.raw?.stats?.maxHp, 100), obstacle: true, name: d.name });
    }
    // “双眼皮” turrets switched on (band 机械援助 / overrides)
    for (const d of devices) if ((d.key === TURRET_KEY || d.role === 'turret') && isActive(battle, st, d)) spawnTurret(battle, st, d);
    ensureTick(battle, st);
  }, { priority: 50 });
}

/** @param {MetaRegistry} registry */
export function registerMeta(registry) {} // map cards / band 机械援助 reach the battle through deviceOverrides

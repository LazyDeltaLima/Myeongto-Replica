// server/sim/content/bonds/giant.js — 谢拉格's 6-tier summon of 卫戍协议：规程, “不眠雪山” (enemy_9024_acsgnt), a walking ally
// (bonds/walker.js) with the two modes of its prefab:
//
//   summon       act3autochess_bond_eff_kjerag_power, on the map controller as the battle starts (ON_AUTO_CHESS_MODE_
//                CHANGED), for a player with power_bond_char_cnt 谢拉格 of its own (AutoChessAssignBondCharCntToBB GE):
//                FindNearestPassableTileForLastCharacter (the player's last 谢拉格 operator, rangeId x-5, WALK_ONLY), then
//                SummonEnemyWithRuntimeRoute (`_unharmful`, `_summonOnNearestPassableTile`, `_waitTime` 999)
//   bond buff    talent BondBuff (acsgnt[bond-buff] → [bond-buff-core] → [bond-buff-trigger], every 1 s): n = ⌊L ÷ stackStep⌋
//                of the player's 谢拉格 layers, ATK +(base_atk + attack_per_stack·n), max HP +(base_max_hp +
//                max_hp_per_stack·n), both MULTIPLIER
//   覆雪苏醒      mode Giant (the first): walks (its GeneralAbilities trace ability, walker.js), blocks nothing (block_free),
//                attacks ground and air within its range with projectile_enemy_acsgnt, arts; the shot's CircleCollider2D
//                (1.1) hits every ground enemy around the one it reaches (`_hitNumType` INFINITY, `_exceptTraceTarget`,
//                `_alwaysHitTraceTargetInTheEnd`). Its skill Switch2Snowy (A_Change, ignores silence) goes to 覆雪坐定
//                when a blockable ground enemy — not BLOCK_FREE, LEVITATE or ATTRACTED — is within its range_radius
//   覆雪坐定      mode SnowyMountain: stands (UNMOVABLE_PRIVATE) and blocks BlockEnemy.block_cnt (BLOCK_CNT); attacks ground
//                enemies within its range, arts, no projectile, splashing ATK × 1 (`_splashAtkScale`, no atk_scale_2) within
//                `attack@ability_range_radius` (BlockEnemy, `_attackBlackboardModeIndex` 1 — the splash radius the
//                撼地者 trait reads the same way); talents:
//                  FrozenBreak  acsgnt[frozen-break] ON_CALCULATE_DAMAGE: on a FROZEN enemy ×atk_scale (AtkScaleUp) and
//                               every FROZEN buff of it ends
//                  SwitchMode   acsgnt[mode-timer]: SwitchMode.interval s after it came or after its last attack
//                               (ON_AFTER_ATTACK) [timer-impl] triggers Switch2Giant (B_Change); when it cannot,
//                               [keep-switch] tries again every 0.1 s without cutting a cast, until the mode changes
//                skills PowerAttack (a FROZEN ground enemy within its range_radius: the attack goes to it) and 【神迹之声】
//                Attract (SP INCREASE_WITH_TIME, B_Skill): stops attacking (FORCE_DISARMED) and puts every enemy within its
//                range_radius under acsgnt[attract] (ATTRACTED, AddAttractToTargetRootTile) until the cast ends or the
//                giant is gone
// A switch (acsgnt[switch-mode] `_restartFSM`) cuts the swing; the new mode's attack is ready (ai.js updateAlly).
// [추정·CN: the switch, PowerAttack and Attract are CN-only skills; their trigger state is taken as "not swinging and not
// casting", a switch's mode changes at the end of its clip (no OnAttack frame: `_runActionOnEvent`), the giant's SP runs in
// both modes, Attract needs an enemy in its attack range and pulls each one to the giant's own tile, and the last
// operator is the one deployed last (the highest deploy order). The shot's 1.1 circle counts an enemy by its centre]

import * as S from '../support/index.js';
import { num, reached, onUnitHit } from './shared.js';
import { spawnWalker, nearestGroundTile, walkerHitsFly } from './walker.js';
import { powi } from '../../detmath.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { BondInstaller, BuffRec } from './shared.js' */
/** @import { TickEv, DeathEv, DamagedEv } from '../support/index.js' */

export const GIANT = 'enemy_9024_acsgnt';
export const GIANT_MODE = 'Giant';
export const SNOWY_MODE = 'SnowyMountain';
/** The CircleCollider2D radius of projectile_enemy_acsgnt (its hit around the enemy it reaches). */
export const GIANT_SHOT_RADIUS = 1.1;
/** acsgnt[keep-switch] triggerInterval. */
const KEEP_SWITCH = 0.1;
const SWITCH_TAG = 'bond:kjerag:giant:switch', SNOWY_TAG = 'bond:kjerag:giant:snowy';
/** x-5: the tile and its four neighbours, in the range's order. */
const X5 = Object.freeze([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]);

const skillOf = (/** @type {Record<string, any>} */ rec, /** @type {string} */ key) => (rec.skills || []).find((/** @type {Record<string, any> | null} */ s) => s && s.prefabKey === key) ?? null;
const castOf = (/** @type {Record<string, any>} */ rec, /** @type {string} */ key, /** @type {number} */ d) => num(rec.skillCast?.[key.toLowerCase()]?.dur, d);
const dist2 = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The player's last 谢拉格 operator on the field (deployed last), or null. @param {readonly Unit[]} members */
function lastMember(members) {
  /** @type {Unit | null} */
  let best = null;
  for (const m of members) if (m.alive && m.deployed && (!best || m.deploySeq > best.deploySeq)) best = m;
  return best;
}

/** FindNearestPassableTileForLastCharacter: the WALK tile of x-5 around `m` nearest to it, else the field's nearest. @param {Battle} battle @param {Unit} m */
function summonTile(battle, m) {
  /** @type {number[] | null} */
  let best = null, bd = Infinity;
  for (const [dr, dc] of X5) {
    const r = m.tileR + dr, c = m.tileC + dc;
    if (!battle.grid.groundPassable(r, c)) continue;
    const d = (c - m.x) * (c - m.x) + (r - m.y) * (r - m.y);
    if (d < bd - 1e-9) { bd = d; best = [r, c]; }
  }
  return best ?? nearestGroundTile(battle, m.x, m.y);
}

/** Ends every FROZEN buff of `e` (FinishAllBuffsWithCertainAbnormalFlag). @param {Battle} battle @param {Unit} e */
function unfreeze(battle, e) {
  for (const b of /** @type {BuffRec[]} */ (e.buffs.slice())) if (b.flags && b.flags.freeze) battle.removeBuff(e, b);
}

/** Can a blocker take `e` (Switch2Snowy's selector: ground, not BLOCK_FREE / LEVITATE / ATTRACTED)? @param {Unit} e */
function blockable(e) {
  const f = e.s.flags;
  return e.alive && !e.hidden && !e.isFlying && !f.unblockable && !f.levitate && !f.attract;
}

/**
 * Summon “不眠雪山” for player `pid` (act3autochess_bond_eff_kjerag_power) at the battle start, next to its last 谢拉格
 * operator among `members`. Returns nothing; the giant is `battle` state.
 * @type {BondInstaller}
 */
export function installGiant(battle, pid, bb, members) {
  if (!reached(battle, pid, 'kjeragShip', bb.power_bond_char_cnt)) return;
  battle.on('battleStart', () => {
    const m = lastMember(members);
    const tile = m && summonTile(battle, m);
    if (tile) spawnGiant(battle, pid, tile[0], tile[1]);
  });
}

/** Spawn “不眠雪山” for player `pid` on (r, c). Returns the unit or null. @param {Battle} battle @param {string} pid @param {number} r @param {number} c */
export function spawnGiant(battle, pid, r, c) {
  const rec = battle.data.rawEnemy?.(GIANT);
  if (!rec) return null;
  const tal = rec.talents && !Array.isArray(rec.talents) ? rec.talents.bb ?? {} : {};
  const toSnowy = skillOf(rec, 'Switch2Snowy'), power = skillOf(rec, 'PowerAttack'), attract = skillOf(rec, 'Attract');
  const snowyIn = num(toSnowy?.bb?.range_radius, 0), powerIn = num(power?.bb?.range_radius, 0);
  const attractIn = num(attract?.bb?.range_radius, 0), attractSp = num(attract?.spCost, 0);
  const switchFor = castOf(rec, 'Switch2Snowy', 1), backFor = castOf(rec, 'Switch2Giant', 1), attractFor = castOf(rec, 'Attract', 0);
  const interval = num(tal['SwitchMode.interval'], 5), frozenScale = num(tal['FrozenBreak.atk_scale'], 3);
  const blockCnt = num(tal['BlockEnemy.block_cnt'], 0), splash = num(tal['BlockEnemy.attack@ability_range_radius'], 0);
  const range2 = powi(num(rec.stats?.rangeRadius, 0), 2) + 1e-9;
  // (set by spawnWalker below before any of the closures runs; `rank` reads it with `?.`)
  let u = /** @type {Unit} */ (/** @type {unknown} */ (null));
  // 覆雪坐定 attacks a FROZEN ground enemy within PowerAttack's range first
  const rank = (/** @type {Unit} */ _self, /** @type {Unit[]} */ list) => {
    if (u?.mode !== SNOWY_MODE || !(powerIn > 0)) return list;
    const r2 = powerIn * powerIn + 1e-9;
    const i = list.findIndex((e) => e.s.flags.freeze && !e.isFlying && dist2(e, u) <= r2);
    return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
  };
  // 覆雪苏醒's attack and trace selectors take ALL (its prefab, `_targetMotion` 3: data attackMotionModes.Giant — walker.js
  // walkerHitsFly); 覆雪坐定's own profile below takes what its mode's attack takes (SnowyMountain 1: ground only)
  u = /** @type {Unit} */ (spawnWalker(battle, pid, GIANT, r, c, { rank }));
  if (!u) return null;
  u.mode = GIANT_MODE;
  u.form = GIANT_MODE;
  const giantProf = u.profile;
  giantProf.splashRadius = GIANT_SHOT_RADIUS;
  giantProf.splashScale = 1;
  giantProf.splashGroundOnly = true;
  const snowyAir = walkerHitsFly(rec, SNOWY_MODE);
  const snowyProf = { ...giantProf, projectile: 'none', canHitFly: snowyAir, groundOnly: !snowyAir, splashRadius: splash, splashScale: 1, splashGroundOnly: false };

  // talent BondBuff: the player's 谢拉格 layers, in steps
  const bondBuff = () => {
    if (!u.alive) return;
    const n = Math.floor(Math.max(0, S.bondLayers(battle, pid, 'kjeragShip')) / Math.max(1, num(tal['BondBuff.stackStep'], 1)));
    const atk = num(tal['BondBuff.base_atk']) + num(tal['BondBuff.attack_per_stack']) * n;
    const hp = num(tal['BondBuff.base_max_hp']) + num(tal['BondBuff.max_hp_per_stack']) * n;
    S.passiveBuff(battle, u, 'bond:kjerag:giant', S.directMods({ atk, hp }));
  };
  bondBuff();
  battle.on('layerGain', () => battle.after(0, bondBuff, { owner: u }), { owner: u, priority: -100 });

  /** @type {{ cast: string | null, castLeft: number, timerAt: number, keep: boolean, keepAt: number, sp: number, pulled: Unit[] }} */
  const st = { cast: null, castLeft: 0, timerAt: Infinity, keep: false, keepAt: 0, sp: num(rec.sp?.initSp, 0), pulled: [] };
  u.mem.giant = st;

  const setMode = (/** @type {string} */ mode) => {
    u.mode = mode;
    u.form = mode;   // the model's clip set (snapshot `form`)
    u.profile = mode === SNOWY_MODE ? snowyProf : giantProf;
    if (mode === SNOWY_MODE) {
      S.passiveBuff(battle, u, SNOWY_TAG, { blockCnt }, { flags: { noMove: true } });
      st.timerAt = battle.time + interval;
    } else {
      battle.removeBuff(u, SNOWY_TAG);
      st.timerAt = Infinity;
    }
    st.keep = false;
  };
  const endAttract = () => {
    battle._ev(['skill', u.id, 0]);
    for (const e of st.pulled) {
      for (const b of /** @type {BuffRec[]} */ (e.buffs.slice())) if (b.key === 'attract' && b.source === u) battle.removeBuff(e, b);
    }
    st.pulled = [];
  };
  /** Start a cast: `kind` 'snowy' | 'giant' (a switch, its mode at the clip's end) or 'attract'. */
  const cast = (/** @type {string} */ kind, /** @type {number} */ dur) => {
    if (st.cast === 'attract') endAttract();
    st.cast = kind;
    st.castLeft = dur;
    S.passiveBuff(battle, u, SWITCH_TAG, {}, { flags: { disarm: true, noMove: true } });
    // the view plays the change clip from the switch's start (A_Change to 覆雪坐定, B_Change back) and the cast's skill clip
    if (kind !== 'attract') { const form = kind === 'snowy' ? SNOWY_MODE : GIANT_MODE; battle.fx('phase', { x: u.x, y: u.y, id: u.id, kind: form, form }); }
    else battle._ev(['skill', u.id, 1, 'Skills/Attract']);
    if (kind === 'attract') {
      const r2 = attractIn * attractIn + 1e-9;
      const goal = [u.tileR, u.tileC];
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || dist2(e, u) > r2) continue;
        if (battle.applyStatus(e, 'attract', { duration: dur, source: u, point: goal })) st.pulled.push(e);
      }
      battle.fx('lure', { x: u.x, y: u.y, id: u.id, n: st.pulled.length });
    }
  };
  const endCast = () => {
    const kind = st.cast;
    st.cast = null;
    st.castLeft = 0;
    battle.removeBuff(u, SWITCH_TAG);
    if (kind === 'attract') endAttract();
    else if (kind === 'snowy') setMode(SNOWY_MODE);
    else if (kind === 'giant') setMode(GIANT_MODE);
  };

  // PowerAttack: a swing of 覆雪坐定 on a FROZEN enemy within its range is that skill (the view plays its cast effects)
  battle.on('swing', (/** @type {{ unit: Unit, targets?: Unit[] }} */ c) => {
    if (c.unit !== u || u.mode !== SNOWY_MODE || !(powerIn > 0)) return;
    const t = c.targets?.[0];
    if (t && t.s.flags.freeze && !t.isFlying && dist2(t, u) <= powerIn * powerIn + 1e-9) battle.fx('enemySkill', { x: u.x, y: u.y, id: u.id, ability: 'PowerAttack', n: 1 });
  }, { owner: u });
  // acsgnt[mode-timer]: an attack in 覆雪坐定 restarts the count
  battle.on('attack', (/** @type {{ attacker: Unit }} */ c) => { if (c.attacker === u && u.mode === SNOWY_MODE) st.timerAt = battle.time + interval; }, { owner: u });
  // FrozenBreak (覆雪坐定): ×atk_scale on a FROZEN enemy, then its freeze ends
  /** @type {Unit[]} */
  const broke = [];
  onUnitHit(battle, u, (c) => {
    if (u.mode !== SNOWY_MODE || !c.dmg || c.target?.side !== 'enemy' || !c.target.s.flags.freeze) return;
    c.dmg.mul *= frozenScale;
    broke.push(c.target);
  });
  battle.on('damaged', (/** @type {DamagedEv} */ c) => {
    if (c.source !== u || !broke.length) return;
    for (const e of broke.splice(0)) if (e.alive) unfreeze(battle, e);
  }, { owner: u });

  battle.on('tick', (/** @type {TickEv} */ { dt }) => {
    if (!u.alive || !u.deployed) return;
    st.sp = Math.min(attractSp > 0 ? attractSp : Infinity, st.sp + dt);
    if (st.cast) {
      // a stun / freeze ends the cast (the skill state leaves when the unit cannot act)
      if (!u.canAct) { const k = st.cast; st.cast = null; st.castLeft = 0; battle.removeBuff(u, SWITCH_TAG); if (k === 'attract') endAttract(); }
      else {
        st.castLeft -= dt;
        if (st.castLeft <= 1e-9) endCast();
        // the mode timer cuts an Attract cast ([timer-impl] does not wait for it)
        if (st.cast === 'attract' && u.mode === SNOWY_MODE && !st.keep && battle.time >= st.timerAt - 1e-9) cast('giant', backFor);
        return;
      }
    }
    if (u.mode === SNOWY_MODE) {
      // acsgnt[timer-impl] → Switch2Giant; [keep-switch] every 0.1 s while it cannot
      if (battle.time >= st.timerAt - 1e-9 && !st.keep) { st.keep = true; st.keepAt = battle.time; }
      if (st.keep && battle.time >= st.keepAt - 1e-9) {
        st.keepAt = battle.time + KEEP_SWITCH;
        if (u.canAct) { cutSwing(u); cast('giant', backFor); return; }
      }
      // 【神迹之声】 with full SP and an enemy in its attack range
      if (attractSp > 0 && st.sp >= attractSp - 1e-9 && u.canAct && !u.swing) {
        const any = battle.enemies.some((/** @type {Unit} */ e) => e.alive && !e.hidden && !e.isFlying && dist2(e, u) <= range2);
        if (any) { st.sp = 0; cast('attract', attractFor); }
      }
      return;
    }
    // 覆雪苏醒: Switch2Snowy once a blockable ground enemy is within its range (ignores silence)
    if (snowyIn > 0 && u.canAct && !u.swing) {
      const r2 = snowyIn * snowyIn + 1e-9;
      if (battle.enemies.some((/** @type {Unit} */ e) => blockable(e) && dist2(e, u) <= r2)) cast('snowy', switchFor);
    }
  }, { owner: u });
  battle.on('death', (/** @type {DeathEv} */ c) => { if (c.unit === u && st.cast === 'attract') { st.cast = null; endAttract(); } }, { owner: u });
  return u;
}

/** The running swing ends (acsgnt[switch-mode] `_restartFSM`). @param {Unit} u */
function cutSwing(u) {
  u.swing = null;
  u.castLeft = 0;
}

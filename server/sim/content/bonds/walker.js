// server/sim/content/bonds/walker.js — a walking ally built from an enemy record: the bond summons of 卫戍协议：规程 that
// the client brings in as enemies of the player's side (SummonEnemyWithRuntimeRoute `_unharmful`, its prefab's selectors
// target the ENEMY side) — 莱塔尼亚's “一个小节” (enemy_9025_aclts) and “一个乐部” (enemy_9026_acltm), and 谢拉格's
// “不眠雪山” (enemy_9024_acsgnt; its two modes: bonds/giant.js).
//
// The unit is a summon (kind 'token') of the player, built at run time from the season's enemy record (as 炎佑's
// fallback def, tokens.js), that holds no field tile (`walks`: battle/deploy.js) and:
//   * walks — the prefab's GeneralAbilities trace ability: every WALKER_SEARCH s (`_searchCoolDown` 1) it takes a target
//     from the whole field and walks to it at the record's speed (walk.js walkCursor, the enemies' own walk); it stands
//     while it blocks, swings or cannot act;
//   * blocks the record's `blockCnt` enemies by contact from where it stands (battle/blocking.js `walks`);
//   * attacks as a summon does (ai.js updateAlly) with the record's numbers, an enemy's round range: the tiles under its
//     `rangeRadius` circle, then the exact distance (radius 0: only the enemies it blocks — an enemy's melee); flying
//     enemies only with `air` (the caller's: its prefab's attack selector `_targetMotion` ALL — “不眠雪山”'s Giant mode;
//     “一个小节” / “一个乐部” have WALK_ONLY, 2026-11-20, 공식 클라에서 확인 — CN prefabs; the trace takes a flier only
//     with `air` too: their GroupTraceSelector has the same motion as the attack, 1 or 3);
//   * holds 禁疗 (CommonAbilities `heal_free`, abnormal flag HEAL_FREE) and, with the talent `Bleeding`, loses
//     `Bleeding.hp_ratio` of its max HP a second, sourceless (aclt[bleeding]: DamageViaMaxHpRatio PURE, every
//     `Bleeding.interval` s from 1 s after it came).
// [추정·CN: the trace ability's class is CN-only (its `_dontMarkReachedByInAttackRange`): the target is the nearest
// targetable enemy (ground only without `air`), taken again every second and when it
// is gone; with none it stands where it is. Its walk stops only to block or swing — the in-range enemies do not stop it
// (`_dontMarkReachedByInAttackRange`). How the CN client puts an enemy on the player's side was not read]

import { COLS, ROWS, MOVE_SCALE } from '../../constants.js';
import { canTargetEnemy } from '../../targeting.js';
import { walkCursor } from '../../walk.js';
import { num } from './shared.js';

/** The trace ability's search cooldown (`_searchCoolDown`), s. */
export const WALKER_SEARCH = 1;

/** The nearest tile of the field rect a ground unit can stand on to (x, y), or null (`_summonOnNearestPassableTile`). */
export function nearestGroundTile(battle, x, y) {
  const g = battle.grid, R = g.rect;
  const r0 = Math.round(y), c0 = Math.round(x);
  if (g.groundPassable(r0, c0)) return [r0, c0];
  let best = null, bd = Infinity;
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      if (!g.groundPassable(r, c)) continue;
      const d = (c - x) * (c - x) + (r - y) * (r - y);
      if (d < bd - 1e-9) { bd = d; best = [r, c]; }
    }
  }
  return best;
}

/** The token def of enemy record `key` as a walking ally (normalizeToken input), or null. `air`: it hits flying enemies. */
function walkerDef(battle, key, air) {
  const rec = battle.data.rawEnemy?.(key);
  if (!rec || !rec.stats) return null;
  const st = rec.stats;
  const ranged = num(st.rangeRadius, 0) > 0;
  return {
    rec,
    def: {
      tokenId: key, name: rec.name ?? key, profession: 'TOKEN', position: ranged ? 'RANGED' : 'MELEE',
      stats: {
        maxHp: st.maxHp, atk: st.atk, def: st.def, res: st.res, aspd: st.aspd, bat: st.bat, blockCnt: st.blockCnt,
        cost: 0, respawnTime: 0, spRecovery: 0, tauntLevel: st.tauntLevel ?? 0, massLevel: st.massLevel ?? 0,
        hpRecoveryPerSec: st.hpRecoveryPerSec ?? 0,
      },
      rangeGrid: [], dmgType: st.dmgType ?? 'phys', attackKind: ranged ? 'ranged' : 'melee',
      projectile: ranged ? 'bolt' : null, canHitFly: ranged && air,
      talents: rec.talents ?? null, attackAnim: rec.attackAnim ?? null, abnormal: ['healFree'], immunities: st.immunities ?? null,
      assets: { avatar: rec.iconId ?? key, spine: rec.spine ?? key, isEnemyModel: true },
    },
  };
}

/**
 * Spawn the walking ally `key` (an enemy record) for player `pid` on tile (r, c). `opts.air`: it attacks and traces flying
 * enemies too (a ranged walker whose prefab selectors take ALL; default ground only); `opts.onDeath(unit)` runs once as
 * it leaves the field; `opts.rank(unit, enemies)` may reorder the enemies its range picks (the first is attacked).
 * Returns the unit or null.
 */
export function spawnWalker(battle, pid, key, r, c, { air = false, onDeath = null, rank = null } = {}) {
  const w = walkerDef(battle, key, air);
  if (!w) return null;
  const { rec, def } = w;
  const radius = Math.max(0, num(rec.stats.rangeRadius, 0));
  const speed = Math.max(0, num(rec.stats.moveSpeed, 0)) * MOVE_SCALE;
  const tal = rec.talents && !Array.isArray(rec.talents) ? rec.talents.bb ?? {} : {};
  const bleedRatio = num(tal['Bleeding.hp_ratio'], 0), bleedEvery = num(tal['Bleeding.interval'], 1);
  const melee = !(radius > 0);
  const hitFly = !melee && air;
  const r2 = radius * radius + 1e-9;
  let self = null;
  const kit = {
    trait: {
      attack: melee ? 'melee' : 'ranged', dmgType: def.dmgType, projectile: melee ? 'none' : 'bolt', canHitFly: hitFly,
      maxTargets: 1, heal: null, noAttack: false,
      // the round range: the tiles of the circle gave the candidates, the distance decides (the blocked ones always)
      pickEnemies: (cands) => {
        const out = cands.filter((e) => self && (self.blocking.includes(e) || (e.x - self.x) * (e.x - self.x) + (e.y - self.y) * (e.y - self.y) <= r2));
        return rank && self ? rank(self, out) : out;
      },
    },
    install(_battle, unit) {
      self = unit;
      unit.walks = true;
      unit.motion = 'WALK';
      unit.moveVx = 0; unit.moveVy = 0; unit.avoidTick = 0; unit.avoidX = 0; unit.avoidY = 0;
      unit.mem.walk = { target: null, searchAt: -Infinity, keysAt: -1, bleedAt: bleedEvery };
    },
  };
  const ps = battle.getPlayer(pid);
  const u = battle.spawnToken(pid, key, r, c, { def, kit, force: true, anySource: true, dir: ps ? ps.dir : 'RIGHT' });
  if (!u) return null;
  u.walks = true;
  refreshKeys(u, radius);
  const prof = { canHitFly: hitFly };
  battle.on('tick', ({ dt }) => {
    if (!u.alive || !u.deployed) return;
    const st = u.mem.walk;
    // aclt[bleeding]: the share of its max HP, every interval from 1 s after it came
    if (bleedRatio > 0 && battle.time - u.deployedAt >= st.bleedAt - 1e-9) {
      st.bleedAt += bleedEvery;
      battle.loseHp(u, u.s.maxHp * bleedRatio, { silent: true, sourceless: true, tags: ['bond:walker:bleed'] });
      if (!u.alive) return;
    }
    u.moving = false;
    const pick = () => {
      let best = null, bd = Infinity;
      for (const e of battle.enemies) {
        if (!e.alive || e.hidden || (!hitFly && e.isFlying) || !canTargetEnemy(u, e, prof)) continue;
        const d = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y);
        if (d < bd - 1e-9) { bd = d; best = e; }
      }
      return best;
    };
    const t = st.target;
    if ((t && (!t.alive || t.hidden)) || battle.time >= st.searchAt + WALKER_SEARCH - 1e-9) {
      st.target = pick();
      st.searchAt = battle.time;
    }
    if (!u.canAct || u.s.flags.noMove || u.blocking.length || u.swing || u.castLeft > 0 || !(speed > 0)) return;
    const tg = st.target;
    if (!tg) return;
    const x0 = u.x, y0 = u.y;
    walkCursor(battle, u, Math.round(tg.y), Math.round(tg.x), tg.x, tg.y, speed, dt);
    const R = battle.grid.rect;
    u.x = Math.max(R.c0, Math.min(R.c1, u.x));
    u.y = Math.max(R.r0, Math.min(R.r1, u.y));
    u.moving = u.x !== x0 || u.y !== y0;
    u.tileR = Math.round(u.y); u.tileC = Math.round(u.x);
    refreshKeys(u, radius);
  }, { owner: u });
  if (onDeath) battle.on('death', (c) => { if (c.unit === u) onDeath(u); }, { owner: u });
  return u;
}

/**
 * The candidate tiles of the walker's range circle (an enemy is filed on the tile it stands on): the square of every
 * tile within `radius` + 1 of its tile, so wherever on its tile it stands the circle's enemies are in; kept while it
 * stays on that tile (the exact distance is the profile's `pickEnemies`).
 */
function refreshKeys(u, radius) {
  const st = u.mem.walk;
  const k = u.tileR * COLS + u.tileC;
  if (st.keysAt === k && u.rangeKeys === st.keysRef) return;
  const keys = [];
  if (radius > 0) {
    const n = Math.ceil(radius + 1);
    for (let r = Math.max(0, u.tileR - n); r <= Math.min(ROWS - 1, u.tileR + n); r++) {
      for (let c = Math.max(0, u.tileC - n); c <= Math.min(COLS - 1, u.tileC + n); c++) keys.push(r * COLS + c);
    }
  }
  u.rangeKeys = keys;
  u.rangeKeySet = new Set(keys);
  u.baseRangeKeys = keys;
  st.keysRef = keys;
  st.keysAt = k;
}

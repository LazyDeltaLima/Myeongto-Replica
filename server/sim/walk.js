// server/sim/walk.js — how an enemy walks: the client's Enemy._MoveByCursor and MoveController, one step toward a point. Every
// way an enemy walks takes this step: its route (ai.js walkRoute), 恐惧 (fear.js), 诱导 and a trace (ai.js walkTo); the client's
// controllers each hold a DirectionCursor of their own. docs/rules/sim.md 「적이 걷는 법」.

import { COLS } from './constants.js';
import { hypot } from './detmath.js';

/** The flow field to tile (r, c) that reaches tile key `k`: with the obstacles, else through them; null when neither does. */
export function legField(b, r, c, k) {
  const g = b.grid;
  const f = g.flowField(r, c);
  if (k >= 0 && f.dist[k] >= 0) return f;
  const f2 = g.flowField(r, c, { ignoreObstacles: true });
  if (k >= 0 && f2.dist[k] >= 0) return f2;
  return null;
}

export const tileKey = (b, e) => {
  const r = Math.round(e.y), c = Math.round(e.x);
  return b.grid.inBounds(r, c) ? r * COLS + c : -1;
};

/**
 * A walker standing on a tile it cannot walk on (a wall's edge it grazed, a push's leftover speed): the client's route node
 * there has no distance (`Route.Node.isValid` false), so `MoveCheckpoint.GetNextDirection` gives no direction — the steering
 * only brakes and the wall's force (obstacleAvoidForce: toward the nearest neighbour it can walk) takes it out. Until
 * 2026-11-15 it headed straight for the leg's target, through the wall (docs/rules/sim.md 「적이 걷는 법」 벽 칸).
 */
export function inWallTile(b, e) {
  if (e.motion === 'FLY') return false;
  const r = Math.round(e.y), c = Math.round(e.x);
  return b.grid.inBounds(r, c) && b.grid.tiles[r * COLS + c].pass !== 'ALL';
}

// MoveController (the client's enemy movement). Most enemies of this mode: `_steeringFactor` 8, `_maxSteeringForce` 10;
// STEER_BY_ENEMY the others of their prefabs. Every one has `_halfBodyWidth` 0.2. Every level of the mode sets
// `steeringEnabled` (BattleOptions.STEERING_ENABLED, MoveController._CalculateSteeringForce).
const STEER_DEFAULT = Object.freeze({ factor: 8, maxForce: 10 });
const STEER_DRONE = Object.freeze({ factor: 20, maxForce: 100 });
const STEER_BY_ENEMY = Object.freeze({
  enemy_1005_yokai: STEER_DRONE, enemy_1005_yokai_2: STEER_DRONE, enemy_1005_yokai_3: STEER_DRONE, enemy_1017_defdrn: STEER_DRONE,
  enemy_1040_bombd: STEER_DRONE, enemy_1041_lazerd: STEER_DRONE, enemy_1041_lazerd_2: STEER_DRONE, enemy_1042_frostd: STEER_DRONE,
  enemy_1112_emppnt: STEER_DRONE, enemy_1112_emppnt_2: STEER_DRONE, enemy_2050_smsha: Object.freeze({ factor: 8, maxForce: 100 }),
});
// Where an enemy's feet are, below its position on the map (MoveController._CalculateObstacleAvoidForce's `footPos`: Enemy.footMapPosition, the
// animator's foot transform, the Spine under the prefab's Graphic): the prefabs' Graphic y, 0.2 for most, FOOT_BY_ENEMY the others.
const FOOT_DEFAULT = -0.2;
const footGroup = (v, ids) => ids.map((id) => [id, v]);
const FOOT_BY_ENEMY = Object.freeze(Object.fromEntries([
  ...footGroup(0, ['enemy_1005_yokai', 'enemy_1005_yokai_2', 'enemy_1005_yokai_3', 'enemy_1017_defdrn', 'enemy_1040_bombd', 'enemy_1041_lazerd', 'enemy_1041_lazerd_2',
    'enemy_1042_frostd', 'enemy_1112_emppnt', 'enemy_1112_emppnt_2', 'enemy_1269_nhfly', 'enemy_1302_ymtro_2']),
  ...footGroup(-0.202, ['enemy_1001_bigbo', 'enemy_1006_shield', 'enemy_1006_shield_2', 'enemy_1006_shield_3', 'enemy_1010_demon', 'enemy_1010_demon_2', 'enemy_1061_zomshd',
    'enemy_1062_rager_2', 'enemy_1081_sotisd', 'enemy_1119_vofsd', 'enemy_1121_lifbos', 'enemy_1121_lifbos_2', 'enemy_1148_dssbr', 'enemy_1148_dssbr_2', 'enemy_1169_duphlx',
    'enemy_1169_duphlx_2', 'enemy_1170_dushld', 'enemy_1170_dushld_2', 'enemy_1172_dugago', 'enemy_1172_dugago_2', 'enemy_1174_duholy', 'enemy_1174_duholy_2',
    'enemy_1175_dushdo_2', 'enemy_1501_demonk', 'enemy_2025_syufo']),
  ...footGroup(-0.33, ['enemy_1208_msfji', 'enemy_1208_msfji_2', 'enemy_1210_msfden', 'enemy_1210_msfden_2']),
  ...footGroup(-0.45, ['enemy_1200_msfjin', 'enemy_1200_msfjin_2', 'enemy_1204_msfhu', 'enemy_1204_msfhu_2']),
]));
const HALF_BODY_WIDTH = 0.2;
const TILE_NEAR_THRESHOLD = 0.25;          // MoveController.TILE_NEAR_THRESHOLD: how far from a tile's centre a wall starts to push
const OBSTACLE_AVOID_TICK_PERIOD = 3;      // MoveController.OBSTACLE_AVOID_TICK_PERIOD (first on the first moving tick)
const MIN_OBSTACLE_AVOID_INFLUENCE = 0.5;  // MoveController.MIN_OBSTACLE_AVOID_INFLUENCE_FACTOR
export const REACH_SQ = 0.05 * 0.05;              // MoveCheckpoint.CheckReached (reachDistance at least 0.05), Route.CheckReached
const EIGHT_WAYS = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

/** A route leg's target (MoveCheckpoint.get_targetPos): its tile's centre plus the level's `reachOffset`. */
export const legX = (leg) => leg.c + (leg.dc ?? 0);
export const legY = (leg) => leg.r + (leg.dr ?? 0);

/** Map.CheckPassable for an enemy's way of moving (the whole map, not only the battle's rect). */
function motionPassable(g, fly, r, c) {
  if (!g.inBounds(r, c)) return false;
  const k = r * COLS + c;
  return fly ? g.tiles[k].pass !== 'NONE' : g.tiles[k].pass === 'ALL' && !g.isBlocked(r, c);
}

/**
 * MoveController._CalculateObstacleAvoidForce at (x, y), the force of unit length (or zero) that keeps a walker off what
 * it cannot walk on (Map.CheckObstacleLikeOrUnpassable: a crate counts for a walker). From a tile it cannot stand on: toward
 * the nearest neighbour it can. Else from the 8 neighbours: its body edge, 0.2 to the neighbour's side, more than
 * TILE_NEAR_THRESHOLD past the tile's centre pushes it back, a side neighbour along its axis, a corner one only when both
 * axes are that near. The edges are the feet's, `footY` from the position (the tile it stands on is the position's); docs/rules/sim.md 「적이 걷는 법」.
 */
export function obstacleAvoidForce(g, x, y, fly, footY = 0) {
  const r0 = Math.round(y), c0 = Math.round(x);
  if (!g.inBounds(r0, c0)) return { x: 0, y: 0 };
  if (!motionPassable(g, fly, r0, c0)) {
    let best = Infinity, fx = 0, fy = 0;
    for (const [dr, dc] of EIGHT_WAYS) {
      const r = r0 + dr, c = c0 + dc;
      if (!motionPassable(g, fly, r, c)) continue;
      const d2 = (x - c) * (x - c) + (y - r) * (y - r);
      if (d2 < best) { best = d2; fx = dc; fy = dr; }
    }
    return { x: fx, y: fy };
  }
  let sx = 0, sy = 0;
  for (const [dr, dc] of EIGHT_WAYS) {
    const r = r0 + dr, c = c0 + dc;
    if (!g.inBounds(r, c)) continue;
    if (motionPassable(g, fly, r, c) && (fly || !g.isCrate(r, c))) continue;
    const px = Math.abs(dc) * (Math.max(0, (x + dc * HALF_BODY_WIDTH - c0) * dc) - TILE_NEAR_THRESHOLD);
    const py = Math.abs(dr) * (Math.max(0, (y + footY - r0) * dr) - TILE_NEAR_THRESHOLD);
    if (px > 0 && py > 0) {
      const a = -(px + py);
      sx += dc * a; sy += dr * a;
    } else if (Math.abs(dr) + Math.abs(dc) === 1 && (px > 0 || py > 0)) {
      sx -= 2 * px * dc; sy -= 2 * py * dr;
    }
  }
  const l = hypot(sx, sy);
  return l > 1e-5 ? { x: sx / l, y: sy / l } : { x: 0, y: 0 };
}

/**
 * One step of the enemy's walk toward the point (ax, ay) at `speed`: the steering, the wall's force and the bounce of
 * ai.js walkRoute's comment. Moves `e`; `e.moving` is the caller's.
 */
export function steerStep(b, e, ax, ay, speed, dt) {
  const fly = e.motion === 'FLY';
  let dx = ax - e.x, dy = ay - e.y;
  const d = hypot(dx, dy);
  if (d > 1e-5) { dx /= d; dy /= d; } else { dx = 0; dy = 0; }
  if (--e.avoidTick <= 0) {
    e.avoidTick = OBSTACLE_AVOID_TICK_PERIOD;
    const f = obstacleAvoidForce(b.grid, e.x, e.y, fly, FOOT_BY_ENEMY[e.defId] ?? FOOT_DEFAULT);
    const along = f.x * dx + f.y * dy;
    e.avoidX = f.x - dx * along;
    e.avoidY = f.y - dy * along;
  }
  const share = Math.max(MIN_OBSTACLE_AVOID_INFLUENCE, hypot(e.moveVx, e.moveVy) / speed);
  const S = STEER_BY_ENEMY[e.defId] ?? STEER_DEFAULT;
  let fx = e.avoidX * share + (dx * speed - e.moveVx) * S.factor;
  let fy = e.avoidY * share + (dy * speed - e.moveVy) * S.factor;
  const fl = hypot(fx, fy);
  if (fl > S.maxForce) { fx *= S.maxForce / fl; fy *= S.maxForce / fl; }
  let vx = e.moveVx + fx * dt, vy = e.moveVy + fy * dt;
  const vl = hypot(vx, vy);
  if (vl > speed) { vx *= speed / vl; vy *= speed / vl; }
  e.moveVx = vx; e.moveVy = vy;
  let mx = vx * dt, my = vy * dt;
  const r1 = Math.round(e.y + my), c1 = Math.round(e.x + mx);
  if ((r1 !== Math.round(e.y) || c1 !== Math.round(e.x)) && !motionPassable(b.grid, fly, r1, c1)) {
    let nx = c1 - e.x, ny = r1 - e.y;
    const nl = hypot(nx, ny);
    if (nl > 1e-5) { nx /= nl; ny /= nl; } else { nx = 0; ny = 0; }
    const dot = mx * nx + my * ny;
    mx -= 2 * dot * nx; my -= 2 * dot * ny;
  }
  e.x += mx;
  e.y += my;
}

/**
 * One tick toward the point (x, y) on tile (r, c), as a DirectionCursor with one checkpoint: within one step it lands there
 * (`PredictReached`), else a walker heads for the centre of the next tile of the flow field — the point itself once that is
 * the point's tile (`MoveCheckpoint.GetNextDirection`: the tile centre plus `reachOffset`) — and a flyer straight for it.
 */
export function walkCursor(b, e, r, c, x, y, speed, dt) {
  const step = speed * dt;
  const gx = x - e.x, gy = y - e.y;
  if (gx * gx + gy * gy <= step * step) { e.x = x; e.y = y; return; }
  let ax = x, ay = y;
  if (inWallTile(b, e)) { ax = e.x; ay = e.y; }
  else if (e.motion !== 'FLY') {
    const k = tileKey(b, e), dest = r * COLS + c;
    if (k !== dest) {
      const f = legField(b, r, c, k);
      const n = f ? f.next[k] : -1;
      if (n >= 0 && n !== dest) { ax = n % COLS; ay = (n / COLS) | 0; }
    }
  }
  steerStep(b, e, ax, ay, speed, dt);
}

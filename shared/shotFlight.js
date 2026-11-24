// shared/shotFlight.js — how far an operator's shot flies on the board: from its muzzle to the hit point of its target.
//
// Official client (`BasicMovement.OnInit` / `ParacurveMovement.OnInit`): a projectile starts at its mode attack's mount
// point (`RangedAttack._GetMountPoint`: MUZZLE or a special point) and flies to the target's hit mount point
// (`RangedAttack.GetTargetLocatable`, `_projectileDestination` 0: `Entity.hitMountPoint`); its flight time is the board
// distance of those two points' `mapPositionV3` (x, y) over `_speed`. Both points are Transforms under the unit's model
// `Graphic`, turned X −30°: a point `dv` tiles up the model stands dv·cos 30° rows back (+y) and du along the side the
// model faces (render/fxpoints.js modelOffset, the same turn). data/*.json carries them per model as
// { F: [du, dv], B?: [du, dv] } (tools/build-data.mjs opMounts / opHitAt / enemyHitAt; docs/rules/sim.md
// 「투사체의 출발·도착 점」). The sim (server/sim/ai.js) and the view (render/fxgame.js trailShot) both take the flight
// from here, so the hit lands as the drawn shot arrives. Map axes as the sim's: x = column, y = row (UP = +y).
// Pure: no Node API, no wall clock, no Math.random (the sim imports it).

/** cos 30°: the board share of a model point's height (the Graphic's X −30°). */
export const MODEL_PLANE_COS = Math.sqrt(3) / 2;

/** Entity.FaceToTarget: no turn for a target this close (squared distance ≤ 0.04). */
const NEAR_SQ = 0.04;
/** CharacterAnimator: the sideways tolerance of the mirror and the side directions' addon (render/face-turn.js). */
const LR_TOLERANCE = 0.2, LR_ADDON = 0.25;
const VEC = [[0, 1], [1, 0], [0, -1], [-1, 0]];   // UP, RIGHT, DOWN, LEFT (SharedConsts.Direction)

/** `MapUtil.ParseDirection(v, addon)` as an index into VEC (render/face-turn.js parseDir), −1 for a zero vector. @param {number} dx @param {number} dy @param {number} addon */
function parse(dx, dy, addon) {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (!(len > 1e-9)) return -1;
  let best = -Infinity, at = 0;
  for (let i = 0; i < 4; i++) {
    const s = (VEC[i][0] * dx + VEC[i][1] * dy) / len + (i & 1 ? addon : 0);
    if (s > best) { best = s; at = i; }
  }
  return at;
}

/**
 * The model side of a unit deployed toward `dir` ('UP' | 'RIGHT' | 'DOWN' | 'LEFT') that turns toward (dx, dy) as it
 * shoots — { lr: ±1 (mirrored when −1), back: the Back model } — by the client's turn (render/face-turn.js turnFace: the
 * mirror by ParseDirection(v, 0) or the sign of x beyond 0.2; the Back model for ParseDirection(v, 0.25) UP, the Front one
 * again for DOWN; within 0.2 tiles no turn). No (dx, dy): its deploy side.
 * [추정·엔진: the sim keeps no history of the model's side — the turn is taken from the deploy side, toward each target
 * of the attack; the view's model may still hold the Back side from an earlier turn]
 * @param {string|null|undefined} dir
 * @param {number} [dx]
 * @param {number} [dy]
 * @returns {{ lr: number, back: boolean }}
 */
export function shotFacing(dir, dx = 0, dy = 0) {
  let lr = dir === 'LEFT' ? -1 : 1, back = dir === 'UP';
  if (!(dx * dx + dy * dy > NEAR_SQ)) return { lr, back };
  const plain = parse(dx, dy, 0), four = parse(dx, dy, LR_ADDON);
  if (plain === 3) lr = -1;
  else if (plain === 1) lr = 1;
  else if (dx < -LR_TOLERANCE) lr = -1;
  else if (dx > LR_TOLERANCE) lr = 1;
  if (four === 0) back = true;
  else if (four === 2) back = false;
  return { lr, back };
}

/**
 * The board offset [dx, dy] (columns, rows) from a unit's root of its model point `m` ({ F: [du, dv], B?: [du, dv] }:
 * a shot's `from`, a unit's `hitAt`) on side `face` (shotFacing), or null without one.
 * @param {{F?: number[], B?: number[]}|null|undefined} m
 * @param {{ lr: number, back: boolean }} face
 * @returns {number[]|null}
 */
export function boardOffset(m, face) {
  const p = face.back ? m?.B || m?.F : m?.F || m?.B;
  if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return [p[0] * (face.lr < 0 ? -1 : 1), p[1] * MODEL_PLANE_COS];
}

/**
 * A unit's hit point in its attack mode `mode` (an enemy's `hitAt.modes`: 守墓石像 `Fly`), else its own.
 * @param {any} hitAt
 * @param {string|null|undefined} mode
 */
export function hitMountOf(hitAt, mode) {
  if (!hitAt || typeof hitAt !== 'object') return null;
  const m = typeof mode === 'string' && hitAt.modes && typeof hitAt.modes === 'object' ? hitAt.modes[mode] : null;
  return m && typeof m === 'object' ? m : hitAt;
}

/**
 * The ends of a shot from shooter `s` at target `t`: { from: [dx, dy] from the shooter's root, to: [dx, dy] from the
 * target's }, each [0, 0] where the data has no point (an extract-less build: unit to unit as before). `shot`: the
 * shooter's shot record (its `from`); `t.hitAt` / `t.mode`: the target's hit points and attack mode. The target stands
 * on its own deploy side (a summon's / an enemy's `dir`; only four enemies' hit points are off their middle).
 * @param {{from?: any}|null|undefined} shot
 * @param {{x: number, y: number, dir?: string}} s
 * @param {{x: number, y: number, dir?: string, hitAt?: any, mode?: string|null}} t
 * @returns {{ from: number[], to: number[] }}
 */
export function shotEnds(shot, s, t) {
  const from = boardOffset(shot?.from, shotFacing(s.dir, t.x - s.x, t.y - s.y)) || [0, 0];
  const to = boardOffset(hitMountOf(t.hitAt, t.mode), shotFacing(t.dir)) || [0, 0];
  return { from, to };
}

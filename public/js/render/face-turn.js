// render/face-turn.js — which way an operator's model faces while it fights (docs/rules/render.md 「공격 방향」).
//
// The client turns a unit as an attack starts (`AbstractAnimatedAbility.OnCastStart` → `DealWithFaceDirection`:
// `Entity.FaceToTarget` → `FaceTo(target − own position)`, nothing within 0.2 tiles) and back to its deploy direction
// when it has no target left and blocks nobody (`Character.States.IdleState.OnEnter` → `TryFaceToIdleDirection` →
// `FaceToDirection(idle)`). The model follows in `CharacterAnimator.OnFaceChanged` → `FaceSwitcher.StartSwitch(lOrR,
// fourDir)`: two independent halves —
//   lOrR (mirror): `MapUtil.ParseDirection(dir, 0)` when that is LEFT / RIGHT, else the sign of dir.x beyond
//     `TOLERANCE_L_OR_R_DIRECTION` 0.2, else unchanged;
//   up / down (Back or Front model): fourDir = `ParseDirection(dir, ADDON_TO_L_OR_R_DIRECTION 0.25)` — the side
//     directions get +0.25 —, applied by `FaceSwitcher._TryUpdateDirection`: UP from DOWN always; DOWN from UP when
//     fourDir is DOWN (an attack) or anything but UP (idle); a LEFT / RIGHT fourDir keeps it.
// So an operator facing RIGHT mirrors to shoot an enemy behind it, takes its Back model for one clearly above it and
// keeps whichever model it has for one beside it. Map axes as the sim's: x = column, y = row, UP = +y (row 0 is the
// bottom). Pure logic (no PIXI); render/units.js UnitView holds the state.

/** The four directions in the client's `SharedConsts.Direction` order (UP 0, RIGHT 1, DOWN 2, LEFT 3) and vectors. */
const DIRS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
const VEC = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** CharacterAnimator constants. */
export const LR_TOLERANCE = 0.2;
export const LR_ADDON = 0.25;
/** Entity.FaceToTarget: no turn for a target this close (squared distance ≤ 0.04). */
export const NEAR_SQ = 0.04;

/**
 * `MapUtil.ParseDirection(v, addon)`: the direction whose unit vector has the largest dot product with v normalised,
 * LEFT / RIGHT getting `addon` on top (the first of equal ones wins). null for a zero vector.
 */
export function parseDir(dx, dy, addon = 0) {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return null;
  const x = dx / len, y = dy / len;
  let best = -Infinity, at = 0;
  for (let i = 0; i < 4; i++) {
    const s = VEC[i][0] * x + VEC[i][1] * y + (i & 1 ? addon : 0);
    if (s > best) { best = s; at = i; }
  }
  return DIRS[at];
}

/**
 * The facing of a unit standing in its deploy direction `dir` (Character.OnBorn → FaceTo(direction)): `lr` ±1 (the
 * mirror; UP / DOWN keep the default right), `ud` 'UP' | 'DOWN' (Back model for UP), `dir4` its 4-way face direction
 * (`Entity.faceDirection` = ParseDirection(faceTo, 0): effects that turn with their owner read it).
 */
export function faceOf(dir) {
  return { lr: dir === 'LEFT' ? -1 : 1, ud: dir === 'UP' ? 'UP' : 'DOWN', dir4: DIRS.includes(dir) ? dir : 'RIGHT' };
}

/**
 * Turn facing state `f` toward the vector (dx, dy) (`idle`: FaceToDirection(idle) — the way back to the deploy
 * direction). Mutates `f`; returns 0 nothing changed, 1 the mirror / face direction changed, 2 the up / down half too
 * (the model swaps Front ⇄ Back).
 */
export function turnFace(f, dx, dy, idle = false) {
  const plain = parseDir(dx, dy, 0);
  if (!plain) return 0;
  const four = parseDir(dx, dy, LR_ADDON);
  let lr = f.lr;
  if (plain === 'LEFT') lr = -1;
  else if (plain === 'RIGHT') lr = 1;
  else if (dx < -LR_TOLERANCE) lr = -1;
  else if (dx > LR_TOLERANCE) lr = 1;
  let ud = f.ud;
  if (four === 'UP') ud = 'UP';
  else if (ud === 'UP' && (idle || four === 'DOWN')) ud = 'DOWN';
  const changed = ud !== f.ud ? 2 : lr !== f.lr || plain !== f.dir4 ? 1 : 0;
  f.lr = lr; f.ud = ud; f.dir4 = plain;
  return changed;
}

/** The vector of a direction name (UP = +y). */
export function dirVector(dir) {
  return VEC[Math.max(0, DIRS.indexOf(dir))];
}

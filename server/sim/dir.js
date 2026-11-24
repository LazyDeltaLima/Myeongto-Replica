// server/sim/dir.js — the 4 deploy directions (DESIGN §3 "Facing (corrected)", research 09 §1.2). Pure ESM, shared by
// the sim, the match (server/match) and browsers (/sim/dir.js).
//
// Every board piece / ally unit has `dir ∈ UP | RIGHT | DOWN | LEFT` (default RIGHT, toward the gates). Row 0 is the
// BOTTOM row, so UP = +row. Forward vectors [dRow, dCol]: UP (1,0), RIGHT (0,1), DOWN (−1,0), LEFT (0,−1).
// Range grids / relative offsets `[dRow, dCol]` are authored facing RIGHT and rotated:
//   RIGHT (dr, dc) · UP (dc, −dr) · LEFT (−dr, −dc) · DOWN (−dc, dr)
// (a quarter turn per step: the "up" side of a right-facing unit — its left hand — becomes the left side when it faces
// UP). `rangeExtend` is applied along +dCol BEFORE rotating (targeting.absoluteRangeKeys). The right-hand Final
// Assault player is mirrored: col c → 20 − c with RIGHT ↔ LEFT (UP / DOWN unchanged) — `mirrorDir`.
// The legacy scalar facing (+1 / −1) survives only as the derived horizontal sign `hSign(dir)` (sprite flip).

/** @typedef {'UP' | 'RIGHT' | 'DOWN' | 'LEFT'} Dir */

export const DIRS = Object.freeze(['UP', 'RIGHT', 'DOWN', 'LEFT']);
export const DEFAULT_DIR = 'RIGHT';
/** Forward vector [dRow, dCol] per direction. */
export const DIR_VEC = Object.freeze({
  UP: Object.freeze([1, 0]), RIGHT: Object.freeze([0, 1]), DOWN: Object.freeze([-1, 0]), LEFT: Object.freeze([0, -1]),
});
/** @type {Readonly<Record<Dir, Dir>>} */
const OPPOSITE = Object.freeze({ UP: 'DOWN', DOWN: 'UP', RIGHT: 'LEFT', LEFT: 'RIGHT' });
/** @type {Readonly<Record<Dir, Dir>>} */
const MIRROR = Object.freeze({ UP: 'UP', DOWN: 'DOWN', RIGHT: 'LEFT', LEFT: 'RIGHT' });

/** @param {unknown} d @returns {d is Dir} */
export const isDir = (d) => d === 'UP' || d === 'RIGHT' || d === 'DOWN' || d === 'LEFT';

/**
 * A direction from anything a caller may hold: a direction name (any case), a legacy facing sign (−1 ⇒ LEFT, +1 ⇒
 * RIGHT) or junk (⇒ `fallback`).
 * @param {unknown} d @param {unknown} [fallback]
 * @returns {Dir}
 */
export function normDir(d, fallback = DEFAULT_DIR) {
  if (isDir(d)) return d;
  if (typeof d === 'string') { const u = d.trim().toUpperCase(); if (isDir(u)) return u; }
  if (typeof d === 'number' && Number.isFinite(d) && d !== 0) return d < 0 ? 'LEFT' : 'RIGHT';
  return isDir(fallback) ? fallback : DEFAULT_DIR;
}

/** Forward vector [dRow, dCol] of a direction (junk ⇒ RIGHT). @param {unknown} d */
export const dirVec = (d) => DIR_VEC[normDir(d)];

/** Rotate a facing-RIGHT offset [dr, dc] into absolute [dRow, dCol] for direction `d`.
 * @param {number} dr @param {number} dc @param {unknown} d @returns {[number, number]} */
export function rotateOffset(dr, dc, d) {
  // `0 - x` (not `-x`): never a negative zero
  switch (normDir(d)) {
    case 'UP': return [dc, 0 - dr];
    case 'LEFT': return [0 - dr, 0 - dc];
    case 'DOWN': return [0 - dc, dr];
    default: return [dr, dc];
  }
}

/** Inverse of rotateOffset: an absolute delta [dRow, dCol] in the facing-RIGHT frame of direction `d`.
 * @param {number} ar @param {number} ac @param {unknown} d @returns {[number, number]} */
export function toLocal(ar, ac, d) {
  switch (normDir(d)) {
    case 'UP': return [0 - ac, ar];
    case 'LEFT': return [0 - ar, 0 - ac];
    case 'DOWN': return [ac, 0 - ar];
    default: return [ar, ac];
  }
}

/** Horizontal sign for sprite flipping (LEFT ⇒ −1, everything else +1). @param {unknown} d */
export const hSign = (d) => (normDir(d) === 'LEFT' ? -1 : 1);
/** RIGHT ↔ LEFT (the Final Assault right-side mirror); UP / DOWN unchanged. @param {unknown} d */
export const mirrorDir = (d) => MIRROR[normDir(d)];
/** @param {unknown} d */
export const oppositeDir = (d) => OPPOSITE[normDir(d)];
/** Are two directions perpendicular? @param {unknown} a @param {unknown} b */
export const perpendicular = (a, b) => { const [ar, ac] = dirVec(a), [br, bc] = dirVec(b); return ar * br + ac * bc === 0; };
/** Direction of a (row, col) delta: the dominant axis (ties → horizontal); a zero delta ⇒ `fallback`.
 * @param {unknown} dRow @param {unknown} dCol @param {unknown} [fallback] @returns {Dir} */
export function dirFromDelta(dRow, dCol, fallback = DEFAULT_DIR) {
  const r = Number(dRow) || 0, c = Number(dCol) || 0;
  if (r === 0 && c === 0) return normDir(fallback);
  if (Math.abs(c) >= Math.abs(r)) return c > 0 ? 'RIGHT' : 'LEFT';
  return r > 0 ? 'UP' : 'DOWN';
}

/** Tile [r, c] reached from (r, c) by the facing-RIGHT offset [dr, dc] of a unit facing `d`.
 * @param {number} r @param {number} c @param {number} dr @param {number} dc @param {unknown} d @returns {[number, number]} */
export function offsetTile(r, c, dr, dc, d) {
  const [a, b] = rotateOffset(dr, dc, d);
  return [r + a, c + b];
}
/** Tile `k` steps in front of (k < 0: behind) (r, c) for direction `d`.
 * @param {number} r @param {number} c @param {unknown} d @param {number} [k] @returns {[number, number]} */
export function frontOf(r, c, d, k = 1) {
  const [fr, fc] = dirVec(d);
  return [r + fr * k, c + fc * k];
}

/**
 * Tie-break order of a tile relative to a unit, in the unit's facing-RIGHT frame: [localRow, localCol] = toLocal of the
 * absolute delta. Comparing it lexicographically (localBefore) instead of the absolute tile key keeps "first tile"
 * choices turning with the unit; for a RIGHT-facing unit it is exactly the tile-key order (row, then col).
 * @param {number} dRow @param {number} dCol @param {unknown} d
 */
export const localOrder = (dRow, dCol, d) => toLocal(dRow, dCol, d);
/** Lexicographic `a` < `b` of two localOrder pairs (`b` null ⇒ true).
 * @param {readonly number[]} a @param {readonly number[] | null | undefined} b */
export const localBefore = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

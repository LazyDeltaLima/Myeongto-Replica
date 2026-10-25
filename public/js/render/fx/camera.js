// public/js/render/fx/camera.js — shot heights and camera-relative world heights.

/**
 * Shot heights (GitHub #61): where a shot or beam leaves a unit (`launch`, ≈ its hands) and where shots, beams and lock
 * marks meet a unit (`aim`, ≈ its chest), as shares of the drawn model's height above the feet (`_headTiles`). The
 * models are upright screen billboards, so these are heights on screen, solved into world heights through the camera
 * (projection.js liftFor, `bodyZ`): 0.45 × the head height taken as a WORLD height drew at ≈ 18 % of the model under the
 * 30° pitch — shots left the hips and aimed at the targets' hips. [ASSUMED] the shares (a battle chibi's hands / chest;
 * the data has no official muzzle points).
 */
export const SHOT_HEIGHT = Object.freeze({ launch: 0.45, aim: 0.5 });

/**
 * World height of the point `frac` of a unit's drawn model height above its feet (SHOT_HEIGHT), seen through `cam`. The
 * feet are the model's: drawn `modelDrop` tiles below the unit's point by its prefab's place (render/units.js, docs/rules/
 * render.md 「모델 위치값·그림자」 — the client's hit / head points are on the model).
 */
export function bodyZ(cam, v, frac) {
  const z0 = (v.z || 0) + (v.hover || 0);
  const h = (v._headTiles || 1.2) * frac - (Number(v.modelDrop) || 0);
  if (!cam || typeof cam.liftFor !== 'function') return z0 + h;
  const dz = cam.liftFor(v.x, v.y, z0, h * cam.scaleAt(v.x, v.y, z0));
  return Number.isFinite(dz) ? z0 + dz : z0 + h;
}

const LIFT_P = { x: 0, y: 0, s: 0, depth: 0 }, LIFT_Q = { x: 0, y: 0, s: 0, depth: 0 };

/**
 * The column at height `z` whose projection is straight above that of (x, y, z0) on screen. The camera is a perspective
 * one: a point raised in world z drifts away from the screen centre (on the official battle camera ≈ 0.1–0.3 tile per
 * column off centre at a model's middle, more toward the near rows), while a model is drawn straight up from its root —
 * so an effect raised to a body / head height slid off the model toward the board's edges (render/fxpoints.js
 * liftedPoint, the same correction for a model point). Exact for render/projection.js Camera: at a fixed row and height
 * the screen x is linear in the column.
 */
export function liftX(cam, x, y, z0, z) {
  if (!cam || typeof cam.project !== 'function' || z === z0) return x;
  const r = cam.project(x, y, z0, LIFT_P), q = cam.project(x, y, z, LIFT_Q);
  return q.s > 0 && Number.isFinite(q.x) && Number.isFinite(r.x) ? x + (r.x - q.x) / q.s : x;
}

/**
 * World point `frac` of a unit's drawn model height (bodyZ) drawn straight above its column `x` (default its own; an
 * effect on a model shifted by MODEL_SHIFT passes that column) on screen, into `out`.
 */
export function bodyPoint(cam, v, frac, x = Number(v.x) || 0, out = { x: 0, y: 0, z: 0 }) {
  const z = bodyZ(cam, v, frac);
  out.x = liftX(cam, x, v.y, (v.z || 0) + (v.hover || 0), z); out.y = v.y; out.z = z;
  return out;
}

/** World height just above a unit's feet (where shells land). */
const feetZ = (v) => (v.z || 0) + (v.hover || 0) + 0.2;

/** Cheap fingerprint of a camera's framing (the damage-number layout cache is reused only while it is unchanged). */
const camKey = (c) => (c ? c.tx + c.ty * 1e3 + c.tz * 1e6 + c.tilt * 7.13 + c.dist * 1e4 + c.scale * 3.7e-2 + c.cx * 1.1e-5 + c.cy * 1.3e-8 : 0);

export { feetZ, camKey };

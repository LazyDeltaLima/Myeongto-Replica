// public/js/render/fxpoints.js — local patch (docs/LOCAL-PATCH.md 「이펙트 붙는 자리」): the model points an effect is
// created at. An effect prefab's root `_spawnLocation` (fx_extract.py `spawn`) is the client's SpawnLocation (global-metadata
// enum order: 0 NONE, 1 FOOT_POINT, 2 HIT_POINT, 3 MUZZLE_POINT, 4 HEAD_POINT, 5 GROUND_CENTER, 6 MUZZLE_POINT_WITHOUT_ROTATION,
// 7 GROUND_CENTER_WITH_ZERO_HEIGHT, 8 MP_SPECIAL_0 … 11 MP_SPECIAL_3, 12 CAMERA, …); the muzzle and special points are
// Transforms of the operator's battle model (chararts DefaultSkin), most of them following a Spine bone. The table of
// them per operator is tools/local-extract/char_points.py's public/assets/local/fx/points.json:
//   { charId: { muzzle | hit | head | sp<N>: { F?: { bone?, rot?, at: [x, y] }, B?: … } } }   (`at` skeleton units, y up)

export const POINTS_URL = '/assets/local/fx/points.json';
let pointsPromise = null;
/** The points table (fetched once), or null without one (no extracted effects: every effect keeps its old place). */
export const loadPoints = () => (pointsPromise ||= typeof fetch !== 'function' ? Promise.resolve(null)
  : fetch(POINTS_URL).then((r) => (r.ok ? r.json() : null)).then((p) => (p && typeof p === 'object' ? p : null), () => null));

/**
 * The model point a `_spawnLocation` names, or null (feet and ground keep render/fxgame.js's own heights).
 * 2 HIT_POINT / 4 HEAD_POINT are the hit / head points (2026-10-10, decompile check: client
 * `Effect._InitLocationFromEntity` places them at the entity's hit / head mount point — they were 0.5 / 1.1 of the drawn
 * height, which render/fxgame.js keeps for a unit without a points table); 3 and 6 are the muzzle (the bone's turn that 3
 * also takes is not applied: the prefabs keep their 'fixed' children upright [ASSUMED]); SpecialPointN: 8–11 MP_SPECIAL_0–3,
 * 13–16 MP_SPECIAL_4–7, 18–25 MP_SPECIAL_8–15 (12 is CAMERA, 17 TILE_CENTER). The values are the enum's order: every
 * operator whose prefabs use 9–15 has exactly those special points (char_1039_thorn2 sp0–4 and 13, char_1041_angel2 sp0–6 and 15).
 * @param {number|null|undefined} spawn
 * @returns {string|null}
 */
export function pointKey(spawn) {
  if (spawn === 2) return 'hit';
  if (spawn === 4) return 'head';
  if (spawn === 3 || spawn === 6) return 'muzzle';
  if (spawn >= 8 && spawn <= 11) return `sp${spawn - 8}`;
  if (spawn >= 13 && spawn <= 16) return `sp${spawn - 9}`;
  if (spawn >= 18 && spawn <= 25) return `sp${spawn - 10}`;
  return null;
}

/**
 * The `_spawnLocation` value of the point an effect's FollowMountPoint names (fx_extract.py `mount.type`), or null (the
 * effect keeps its `_spawnLocation`). MountPointType's constants (global-metadata field default values): 0 FOOT, 1 HIT,
 * 2 MUZZLE, 3 HEAD, 4 UI, 5 SPECIAL_0, 6 SPECIAL_1, 7 GROUND, 8–21 SPECIAL_2–15 — the extracted prefabs that carry both
 * agree (spawn 8 ↔ mount 5, 10 ↔ 8, 3 ↔ 2). The effect follows that point every frame (local patch, maintainer report,
 * : 스펙터 디 언체인드 S2's red ring, mount 5 = SPECIAL_0 = her saw's ring bone). UI / GROUND: null.
 * @param {{type?: number}|null|undefined} mount
 * @returns {number|null}
 */
export function mountSpawn(mount) {
  const t = mount?.type;
  if (!Number.isInteger(t) || t < 0 || t === 4 || t === 7 || t > 21) return null;
  if (t <= 3) return t + 1;
  const k = t <= 6 ? t - 5 : t - 6; // SPECIAL_k
  return k <= 3 ? 8 + k : k <= 7 ? 9 + k : 10 + k;
}

/**
 * Where point `entry` ({ F, B }) is on skeleton `sk` now, in the skeleton's own frame as the Spine runtime gives it
 * (bone.worldX / worldY: y down), or null. The side's bone when the skeleton has it (the other side's next — a model
 * swapping Front ⇄ Back), else that side's fixed spot.
 * @param {{F?: {bone?: string, at?: number[]}, B?: {bone?: string, at?: number[]}}|null|undefined} entry
 * @param {{findBone: (name: string) => ({worldX: number, worldY: number}|null)}|null|undefined} sk
 * @param {boolean} back the Back model is drawn
 * @param {{x: number, y: number}} [out]
 */
export function pointOn(entry, sk, back, out = { x: 0, y: 0 }) {
  if (!entry || !sk) return null;
  const mine = back ? entry.B || entry.F : entry.F || entry.B;
  const other = mine === entry.F ? entry.B : entry.F;
  for (const p of [mine, other]) {
    const b = p?.bone ? sk.findBone(p.bone) : null;
    if (b) { out.x = b.worldX; out.y = b.worldY; return out; }
  }
  const at = mine?.at;
  if (!Array.isArray(at) || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) return null;
  out.x = at[0]; out.y = -at[1];
  return out;
}

/**
 * local patch (maintainer report, maintainer's decision 2026-10-08 「전체 적용」): the turn (radians) of point `entry` on skeleton
 * `sk` now — the world rotation of the bone its side follows WITH its rotation (char_points.py `rot` 1: the point Transform
 * turns with the bone), the side picked as pointOn does — or null (no such bone, a fixed spot, a point that does not turn).
 * An effect whose FollowMountPoint has `_keepOriginRotation` 0 takes it (render/fxgame.js lifted `rot`). The Spine runtime
 * here reports angles in its y-down frame; the client's (Unity, y up) turn is the negative — 아르케토's F_Muzzle / B_Muzzle read
 * −90° in Skill_3 facing every way, i.e. +90°: her S3 fan opens behind her, its spike toward the enemy (maintainer 2026-10-08: facing
 * down with the enemy on the right, the fan opens to the left; the first take, the angle as reported, had it the other way).
 * @param {{F?: {bone?: string, rot?: number}, B?: {bone?: string, rot?: number}}|null|undefined} entry
 * @param {{findBone: (name: string) => ({getWorldRotationX: () => number}|null)}|null|undefined} sk
 * @param {boolean} back
 * @returns {number|null}
 */
export function pointTurn(entry, sk, back) {
  if (!entry || !sk) return null;
  const mine = back ? entry.B || entry.F : entry.F || entry.B;
  const other = mine === entry.F ? entry.B : entry.F;
  for (const p of [mine, other]) {
    const b = p?.bone ? sk.findBone(p.bone) : null;
    if (b) return p.rot === 1 && typeof b.getWorldRotationX === 'function' ? (-b.getWorldRotationX() * Math.PI) / 180 : null;
  }
  return null;
}

/**
 * The rotation of a unit's battle prefab `Graphic` (operators' charpack and enemies' battle prefabs: X −30°, a Unity
 * quaternion), the plane its model is drawn in, facing the 30° camera.
 */
export const GRAPHIC_TILT = Object.freeze([-0.25881905, 0, 0, 0.96592583]);

/**
 * Whether an effect created on a unit takes its `Graphic`'s rotation (GRAPHIC_TILT). 2026-10-22, decompile check:
 * `Effect._InitLocationFromEntity` (RVA 0xE7AF80; its switch is indexed by `_spawnLocation` − 1) sets the effect's
 * rotation to the rotation of `graphicFootTransform` for 1 FOOT_POINT, of `graphicTransform` for 2 HIT_POINT / 4
 * HEAD_POINT (on a Spine unit both are its `Graphic`: `Unit.get_graphicFootTransform` → `UnitAnimator.get_graphicFootTransform`
 * → `graphicTransform`), of the mount point's own Transform for 3 MUZZLE_POINT and the MP_SPECIAL points
 * (`_SetPosAndRotToMountPoint`; the points are children of `Graphic` — their own and their bone's turn are not taken
 * here), and identity / the entity's or tile's own rotation for 0 NONE, 5 GROUND_CENTER, 6 MUZZLE_POINT_WITHOUT_ROTATION,
 * 7 GROUND_CENTER_WITH_ZERO_HEIGHT, 12 CAMERA, 17 TILE_CENTER. A FollowMountPoint with `_keepOriginRotation` 0 takes its
 * point's rotation every frame (lifted `rot`): tilted when it names a model point (mountSpawn).
 * @param {{spawn?: number, mount?: {type?: number, keepOriginRotation?: number}}|null|undefined} def
 */
export function takesGraphicTurn(def) {
  if (def?.mount && def.mount.keepOriginRotation === 0) return mountSpawn(def.mount) != null;
  const s = def?.spawn;
  return s === 1 || s === 2 || s === 4 || (s !== 6 && pointKey(s) != null);
}

/**
 * Whether skeleton `sk` lacks every bone point `entry` follows (an invalid mount point: the client pauses an effect whose
 * FollowMountPoint has _pauseWhenMountPointInvalid). A point at fixed spots only is never invalid.
 * @param {{F?: {bone?: string}, B?: {bone?: string}}|null|undefined} entry
 * @param {{findBone: (name: string) => object|null}|null|undefined} sk
 */
export function boneMissing(entry, sk) {
  const bones = [entry?.F?.bone, entry?.B?.bone].filter(Boolean);
  return !!sk && bones.length > 0 && bones.every((b) => !sk.findBone(b));
}

/**
 * The world point (column, row, height) of a model point drawn at screen (gx, gy) on a unit whose model stands at world
 * (x, y, z) — its root, which projects to screen y `rootY`. A unit's model is an upright screen billboard, so the point is
 * at the row of the unit, at the height whose projection is gy (Camera.liftFor), and at the column whose projection at
 * THAT height is gx. The camera is a perspective one: a point lifted toward it drifts away from the screen centre, so the
 * screen offset is converted at the lifted point's own projection and scale, not at the root's (maintainer report
 * 2026-10-12: 안젤리나 더 멜로우 위시's S2 weapon glow sat on her face near the screen edge in a match, on her staff in the
 * arena's centre). Exact for render/projection.js Camera: at a fixed row and height the screen x is linear in the column.
 * @param {{liftFor: Function, project: Function}} cam
 * @param {{x: number, y: number, z: number}} out
 * @param {{x: number, y: number, s: number, depth: number}} [tmp]
 */
export function liftedPoint(cam, x, y, z, rootY, gx, gy, out, tmp = { x: 0, y: 0, s: 0, depth: 0 }) {
  const dz = cam.liftFor(x, y, z, rootY - gy);
  out.y = y; out.z = z + (Number.isFinite(dz) ? dz : 0);
  const at = cam.project(x, y, out.z, tmp);
  out.x = x + (gx - at.x) / at.s;
  return out;
}

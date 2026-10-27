// public/js/render/fx/face.js — how an official effect turns to the direction it is played with and how fast / how late it
// plays (maintainer decisions 2026-10-11, docs/rules/fx.md 「좌우 거울·재생 속도·루트 지연」). Pure: the prefab JSON's root
// `face` record (tools/local-extract/fx_extract.py root_face) in, numbers out — render/fxplayer.js FxInstance applies them.

/** SharedConsts.Direction order (the prefab's `_mainDir`, an emitter's direction slots): 0 UP, 1 RIGHT, 2 DOWN, 3 LEFT. */
export const DIR4 = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
/** The board-frame angle of each direction (+x = column, +y = row = UP; counter-clockwise degrees). */
const DEG = { RIGHT: 0, UP: 90, LEFT: 180, DOWN: 270 };
/** SharedConsts.FOUR_WAYS — each direction as a vector. */
const WAY = { UP: { x: 0, y: 1 }, RIGHT: { x: 1, y: 0 }, DOWN: { x: 0, y: -1 }, LEFT: { x: -1, y: 0 } };

/** The four-way direction of a vector (its larger axis; `null` / zero = RIGHT). */
export function parseDir(d) {
  const x = Number(d?.x) || 0, y = Number(d?.y) || 0;
  if (Math.abs(x) >= Math.abs(y)) return x < 0 ? 'LEFT' : 'RIGHT';
  return y < 0 ? 'DOWN' : 'UP';
}

/**
 * The client's `ParticleEffect.FaceTo` for a root `face` record and the direction the effect is played
 * with (`Effect.Play`: the caster's faceVector — left / right as it is drawn, ±x even facing up / down — or a
 * four-way facing with `_useFourDirectionalFace`, or target − caster with `_useOwnerToTargetDirection`; with
 * `_useBodyRotation` (`face.body`) the four-way direction of the entity it is created on, `body`). By `_rotateType`:
 *   1 FLIP_TWO_SIDE  — flipped when the direction points left (`_leftIsDefault`: right): its child 'rotation_y' turns 180°
 *                      about y and 'rotation_z' 180° about z (`flip`);
 *   2 FOUR_DIRECTION — 'rotation_z' turned by the 90° steps from `_mainDir` to the direction (`z`, degrees);
 *   3 FIXED_DIRECTION — 'rotation_z' turned by the steps from RIGHT to `_mainDir`, whatever the direction (`z`);
 *   4 ANY_DIR        — MapUtil.FaceTo2d: the Effect's `_bodyTransofrm` (`face.bodyNode`, the root in every prefab of the
 *                      pool) gets localRotation z = atan2(direction) − 90° — its +y points along the direction (`any`,
 *                      degrees; 2026-10-23, official client);
 *   0 NONE (and any other value) — neither flipped nor turned.
 * Returns { flip?, z?, any? } (an empty object for NONE) or null without a record (no ParticleEffect on the root: the
 * caller keeps the old mirror).
 * @param {{ rot?: number, left?: number, body?: number, dir?: number }|null|undefined} face
 * @param {{ x: number, y: number }|null|undefined} dir
 * @param {string|null} [body] 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 * @returns {{ flip?: boolean, z?: number, any?: number }|null}
 */
export function faceTurn(face, dir, body = null) {
  if (!face || typeof face !== 'object') return null;
  const d = face.body && body && WAY[body] ? WAY[body] : dir || WAY.RIGHT;
  const main = DIR4[face.dir ?? 0] || 'UP';
  switch (face.rot) {
    case 1: return { flip: face.left ? (Number(d.x) || 0) > 0 : (Number(d.x) || 0) < 0 };
    case 2: return { z: (DEG[parseDir(d)] - DEG[main] + 360) % 360 };
    case 3: return { z: DEG[main] };
    case 4: return { any: (Math.atan2(Number(d.y) || 0, Number(d.x) || 0) * 180) / Math.PI - 90 };
    default: return {};
  }
}

/**
 * (2026-10-22, official client) The direction the client's FollowDirection (`_FollowDirection`) gives its
 * effect through `FaceTo` as it plays and every frame after (once with `_onlyFollowOnPlay`), from the prefab's `follow`
 * record (fx_extract.py follow_direction) and its owner's facing `o`:
 *   'face'   faceVector — ±x by the drawn side `side` (× −1 with `left`);
 *   'four'   faceTo — the owner's face vector `to` (an attack turns it to its target);
 *   'owner'  SharedConsts.FOUR_WAYS[deploy direction `deploy`];
 *   'faceTo' LEFT when faceTo.x (× −1 with `left`) < 0 — ≤ 0 with `vflip` —, else RIGHT;
 *   'lorr'   the drawn side: LEFT / RIGHT as drawn with `left`, the other way without;
 *   'move'   an enemy's move direction — none here (no prefab of the pool has it): null.
 * null keeps the direction it has.
 * @param {{ src?: string, left?: number, vflip?: number }|null|undefined} follow
 * @param {{ side?: number, to?: { x: number, y: number }|null, deploy?: string|null }} o
 * @returns {{ x: number, y: number }|null}
 */
export function followDir(follow, o) {
  if (!follow || typeof follow !== 'object') return null;
  const s = follow.left ? -1 : 1;
  const left = (Number(o.side) || 1) < 0;
  const to = o.to || { x: left ? -1 : 1, y: 0 };
  switch (follow.src) {
    case 'four': return { x: Number(to.x) || 0, y: Number(to.y) || 0 };
    case 'owner': return WAY[o.deploy] || null;
    case 'faceTo': { const x = s * (Number(to.x) || 0); return (follow.vflip ? x <= 0 : x < 0) ? WAY.LEFT : WAY.RIGHT; }
    case 'lorr': return (follow.left ? left : !left) ? WAY.LEFT : WAY.RIGHT;
    case 'move': return null;
    default: return { x: left ? -s : s, y: 0 };
  }
}

/**
 * (2026-10-22, official client) The copy the client's SwitchableEffectByFaceDirection plays instead (`_UpdateFace`,
 * as the effect plays): its owner's `faceDirection` (`dir4`, MapUtil.ParseDirection of faceTo) DOWN / UP / LEFT
 * with that copy named (`swFace` down / up / left: fx_extract.py switch_face), else null — this effect plays.
 * @param {{ up?: string, down?: string, left?: string }|null|undefined} sw
 * @param {string|null|undefined} dir4 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 * @returns {string|null}
 */
export function faceSwitchCopy(sw, dir4) {
  if (!sw || typeof sw !== 'object') return null;
  const n = { UP: sw.up, DOWN: sw.down, LEFT: sw.left }[dir4];
  return typeof n === 'string' && n ? n : null;
}

/**
 * The playback speed an effect gets (`Effect._PlayInternal`): capped at `_limitedPlaybackSpeed` ÷ the battle
 * time scale when that is ≥ 0 (default 2.0 — the effect never runs faster than ×2 on screen), and used only with
 * `_usePlaybackSpeed` (`face.speed` 0: the prefab's own speed, 1.0). Without a record: `speed` as given.
 */
export function playSpeed(face, speed = 1, timeScale = 1) {
  let s = Number(speed) > 0 ? Number(speed) : 1;
  if (!face || typeof face !== 'object') return s;
  if (face.speed === 0) return 1;
  const lim = face.limit ?? 2;
  if (lim >= 0) s = Math.min(s, timeScale > 0 ? lim / timeScale : lim);
  return s;
}

/**
 * How long (game seconds) before anything of the effect shows when it plays at `speed` (playSpeed): the root FxDelay
 * (`FxDelay.OnEnable`: `_delayTime` ÷ the playback speed, set only with `_usePlaybackSpeed` —
 * `Effect.UpdatePlaybackSpeed`) plus `_delayToPlay` (`rnd`: up to it — its longest here).
 */
export function startLead(face, speed = 1) {
  if (!face || typeof face !== 'object') return 0;
  const s = Number(speed) > 0 ? Number(speed) : 1;
  return (Number(face.fxDelay) > 0 ? Number(face.fxDelay) / s : 0) + (Number(face.delay) > 0 ? Number(face.delay) : 0);
}

/**
 * 2026-10-27 (effect bundle W2b, official client): a projectile's `_mainEffect` sits on the projectile's body, whose +y the
 * client turns to the flight (`MapUtil.FaceTo2d` / `FaceTo3dUpwardMajor`), and a ProjectileEffect root then takes the turn
 * `ProjectileEffect.OnBeforePlay` gives it on that body (fx_extract.py projectile_turn: `mainRot` in place of its own
 * rotation, then a random roll about its own x up to `roll`°, drawn once per play). `inst`: an FxInstance placed in board
 * coordinates, `a`: the flight's board angle (radians), `THREE` the three.js module. A root without the record keeps its own
 * rotation on the body. 2026-10-27 (bundle W2b-2): a body without `_rotateToTarget` is not turned at all — it keeps the
 * board's frame (fx_extract.py body_still: `still`, or `stillBy` naming the projectile `key` it flies on).
 */
export function bodyTurn(inst, THREE, a, rnd = Math.random, key = null) {
  if (!inst) return;
  const def = inst.def, root = inst.nodes?.[0];
  inst.object.rotation.set(0, 0, bodyStill(def, key) ? 0 : a - Math.PI / 2);
  if (!Array.isArray(def?.mainRot) || !root || inst._bodyTurned) return;
  inst._bodyTurned = true;
  const q = def.mainRot, roll = Number(def.roll) || 0;
  root.quaternion.set(q[0], q[1], q[2], q[3]);
  if (roll) root.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (rnd() * roll * Math.PI) / 180));
}

/** Whether the projectile body a trail prefab `def` sits on stays unturned (bodyTurn), flying on projectile `key`. */
export function bodyStill(def, key = null) {
  if (def?.still) return true;
  return Array.isArray(def?.stillBy) && typeof key === 'string' && def.stillBy.includes(key.toLowerCase());
}

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
 * The client's `ParticleEffect.FaceTo` (RVA 0xCB1DC0) for a root `face` record and the direction the effect is played
 * with (`Effect.Play` RVA 0xC8A5D0: the caster's faceVector — left / right as it is drawn, ±x even facing up / down — or a
 * four-way facing with `_useFourDirectionalFace`, or target − caster with `_useOwnerToTargetDirection`; with
 * `_useBodyRotation` (`face.body`) the four-way direction of the entity it is created on, `body`). By `_rotateType`:
 *   1 FLIP_TWO_SIDE  — flipped when the direction points left (`_leftIsDefault`: right): its child 'rotation_y' turns 180°
 *                      about y and 'rotation_z' 180° about z (`flip`);
 *   2 FOUR_DIRECTION — 'rotation_z' turned by the 90° steps from `_mainDir` to the direction (`z`, degrees);
 *   3 FIXED_DIRECTION — 'rotation_z' turned by the steps from RIGHT to `_mainDir`, whatever the direction (`z`);
 *   4 ANY_DIR        — MapUtil.FaceTo2d: the 'body' child turned to the direction (`any`, degrees);
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
    case 4: return { any: (Math.atan2(Number(d.y) || 0, Number(d.x) || 0) * 180) / Math.PI };
    default: return {};
  }
}

/**
 * The playback speed an effect gets (`Effect._PlayInternal` RVA 0xC8C4F0): capped at `_limitedPlaybackSpeed` ÷ the battle
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
 * (`FxDelay.OnEnable` RVA 0x34C1650: `_delayTime` ÷ the playback speed, set only with `_usePlaybackSpeed` —
 * `Effect.UpdatePlaybackSpeed` RVA 0xC8AE50) plus `_delayToPlay` (`rnd`: up to it — its longest here).
 */
export function startLead(face, speed = 1) {
  if (!face || typeof face !== 'object') return 0;
  const s = Number(speed) > 0 ? Number(speed) : 1;
  return (Number(face.fxDelay) > 0 ? Number(face.fxDelay) / s : 0) + (Number(face.delay) > 0 ? Number(face.delay) : 0);
}

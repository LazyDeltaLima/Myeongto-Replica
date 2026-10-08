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
 * The model point a `_spawnLocation` names, or null (feet, body, head and ground keep render/fxgame.js's own heights).
 * 3 and 6 are the muzzle (the bone's turn that 3 also takes is not applied: the prefabs keep their 'fixed' children
 * upright [ASSUMED]); 8 SpecialPoint0.
 * @param {number|null|undefined} spawn
 * @returns {string|null}
 */
export function pointKey(spawn) {
  if (spawn === 3 || spawn === 6) return 'muzzle';
  if (spawn === 8) return 'sp0';
  return null;
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

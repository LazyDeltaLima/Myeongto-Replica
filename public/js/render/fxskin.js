// public/js/render/fxskin.js — what a unit drawn in an operator skin plays instead of its default effects
// (docs/rules/render.md 「스킨 모델 소재」, 2026-11-17). The skin's battle prefab (skinpack/<owner>.ab) has its own attach points
// and a CharacterSkinHooker (official client): `_replaceEffectPairs` turns an effect key the character creates into the
// skin's (TryHookEffect — the common deploy effect common_char_birth_01 too), and with `_useFakeProjectile` each
// `_fakeProjectileConfigs` row splits a projectile it shoots into a drawn one (`graphicProjectileKey`), a logic one and the
// muzzle point the drawn one leaves (`_fakeMuzzlePoint`, a MountPointType) — TryHookProjectile. The extractors write them
// into the skin data pack's folder (git-ignored, client data; only a player who chose the skin data downloads it):
//   skin-points.json   { skin key: points.json's record }                                (char_points.py)
//   skin-effects.json  { skins: { skin key: { owner, effects?: { key: skin key }, projectiles?: [{ from, graphic, logic,
//                        muzzle }] } }, files: { prefab name: 'skin/<bundle>/<file>.json' }, projectileEffects: { projectile
//                        key: [its `_mainEffect` prefabs] }, missing }                      (fx_extract.py --skin-pairs / --skin-effects)
// The battle never reads them: a skin is drawn only (the sim keeps the default model's clips and points).

export const SKIN_FX = '/assets/local/fx/skin/';
export const SKIN_EFFECTS_URL = `${SKIN_FX}skin-effects.json`;
export const SKIN_POINTS_URL = `${SKIN_FX}skin-points.json`;

/**
 * The skin data pack's skin-effects.json (fields this file reads).
 * @typedef {{ from: string, graphic?: string, logic?: string, muzzle?: unknown }} SkinShotRow a `_fakeProjectileConfigs` row
 * @typedef {{ owner?: unknown, effects?: unknown, projectiles?: SkinShotRow[] }} SkinFxRec
 * @typedef {{ skins?: Record<string, SkinFxRec | undefined>, files?: unknown, projectileEffects?: unknown, missing?: unknown }} SkinFxDoc
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The effect a unit drawn in skin `key` plays for effect `name` (its `_replaceEffectPairs`), else `name`.
 * @param {SkinFxDoc | null | undefined} doc
 * @param {string | null | undefined} key
 * @param {string} name
 * @returns {string}
 */
export function skinEffect(doc, key, name) {
  const to = key && isObj(doc?.skins?.[key]?.effects) ? doc.skins[key].effects[name] : null;
  return typeof to === 'string' && to ? to : name;
}

/**
 * Where skin prefab `name` is ([folder under fx/, file name without .json] — `skin/<bundle>`, the `#` of its name a `-`:
 * fx_extract.py file_name), or null when the skin folder has no such prefab.
 * @param {SkinFxDoc | null | undefined} doc
 * @param {string} name
 * @returns {[string, string] | null}
 */
export function skinFile(doc, name) {
  const f = isObj(doc?.files) ? doc.files[name] : null;
  const m = typeof f === 'string' ? /^(skin\/[^/]+)\/([^/]+)\.json$/.exec(f) : null;
  return m ? [m[1], m[2]] : null;
}

/**
 * The drawn projectile that replaces trail `trail` of a unit drawn in skin `key` (TryHookProjectile): the fake projectile row
 * whose replaced projectile (`from`) carries that trail as its `_mainEffect`. `{ names, muzzle }` — names: the prefabs the
 * drawn projectile carries (before the skin's effect pairs; none when it has no `_mainEffect`: all 19 such drawn projectiles
 * have no effect field and a bare Body, official client), muzzle: the MountPointType it leaves from — or null: not replaced.
 * @param {SkinFxDoc | null | undefined} doc
 * @param {string | null | undefined} key
 * @param {unknown} trail
 * @returns {{ names: string[], muzzle: number | null } | null}
 */
export function skinShot(doc, key, trail) {
  const rows = key ? doc?.skins?.[key]?.projectiles : null;
  if (!Array.isArray(rows) || typeof trail !== 'string') return null;
  // (`rows` is an array only when `doc` is there)
  const of = /** @type {Record<string, unknown>} */ (isObj(/** @type {SkinFxDoc} */ (doc).projectileEffects) ? /** @type {SkinFxDoc} */ (doc).projectileEffects : {});
  const t = trail.toLowerCase();
  for (const p of rows) {
    const from = isObj(p) ? of[p.from] : null;
    if (!Array.isArray(from) || !from.some((n) => String(n).toLowerCase() === t)) continue;
    const g = p.graphic ? of[p.graphic] : null;
    return { names: Array.isArray(g) ? g.filter((n) => typeof n === 'string' && n) : [], muzzle: Number.isInteger(p.muzzle) ? /** @type {number} */ (p.muzzle) : null };
  }
  return null;
}

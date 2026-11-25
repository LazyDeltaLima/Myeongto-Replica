// render/fxband.js — 2026-11-12 (docs/rules/fx.md 「규정 액티브 전략의 표식·칸 이펙트」): the prep's effects of 规程's drag 指令
// that wait for the next battle.
//
// A use leaves a mark of the round (server content/bands/meta.js addMark; the view m.private.bandSkill.marks:
// { effectId, uid } on an own operator, { effectId, row, col } on a board tile, { effectId, itemId } on an item card). The
// strategy effect's blackboard names the effect drawn on its target (effectBuffInfoDataDict — data/seasons/act3autochess/
// effects.json `params`): `skill_target_effect` over the marked operator (`skill_target_chess` 1), `effect` on the marked tile
// (`skill_target_tile` 1). The prefabs are CN battle/prefabs/effects/map.ab, extracted as the `map` bundle: the five
// map_v079_squad_0N loop at the feet (`_spawnLocation` 1), map_v079_dikuai02 is static floor meshes. The client reads the
// table client-side; the browser does not load effects.json, so the names are this table, pinned to the data by
// test/render/band-mark-fx.test.js. [추정·CN: where and while the client shows them — the code that reads these keys is
// CN-only; ours: in the prep, from the use until the marks go (the battle of the round), the operator's at its feet as its
// prefab places it, the tile's on that tile's top]

/**
 * A mark of m.private.bandSkill.marks (server content/bands/meta.js addMark).
 * @typedef {{ effectId: string, uid?: unknown, row?: unknown, col?: unknown, itemId?: unknown }} BandMark
 * @typedef {{ uid?: unknown, alive?: unknown, remove?: unknown, destroyed?: unknown, _fxStatusOn?: Set<string> }} BandView
 *   what syncBandMarks reads on a view
 */
/** @import { StatusFxApi } from './fxstatus.js' */

/**
 * Strategy effect id → the prefab over its marked operator (blackboard `skill_target_effect`).
 * @type {Readonly<Record<string, string>>}
 */
export const BAND_MARK_FX = Object.freeze({
  aceffect_band_87: 'map_v079_squad_01',   // 正直教官
  aceffect_band_90: 'map_v079_squad_01',   // 强制休整
  eff_band12: 'map_v079_squad_02',         // 意志鼓舞
  eff_band14: 'map_v079_squad_03',         // 全场聚焦
  eff_band22: 'map_v079_squad_04',         // 消解空间
  eff_band17: 'map_v079_squad_05',         // 药枚实验 (stage 1)
  eff_band18: 'map_v079_squad_05',         // 药枚实验 (stage 2)
});
/** Strategy effect id → the prefab on its marked tile (blackboard `effect`). @type {Readonly<Record<string, string>>} */
export const BAND_TILE_FX = Object.freeze({
  eff_band19: 'map_v079_dikuai02',         // 溃心领域
});
/** The bundle of both. */
export const BAND_FX_BUNDLE = 'map';
/** The status key of a mark's effect on a view (one per prefab: two marks of the same look show one). @param {string} name */
export const bandMarkKey = (name) => 'band:' + name;

/**
 * The marks list of a private state (m.private.bandSkill.marks), [] without one (a passive strategy has none).
 * @param {{ bandSkill?: { marks?: unknown } | null } | null | undefined} priv
 * @returns {BandMark[]}
 */
export function bandMarksOf(priv) {
  const m = priv && typeof priv === 'object' ? priv.bandSkill?.marks : null;
  return Array.isArray(m) ? m.filter((x) => x && typeof x === 'object' && typeof x.effectId === 'string') : [];
}

/** uid → the set of prefabs over that operator (marks whose effect has one). @param {BandMark[]} marks @returns {Map<number, Set<string>>} */
export function bandMarkFxByUid(marks) {
  /** @type {Map<number, Set<string>>} */
  const out = new Map();
  for (const mk of marks) {
    const name = BAND_MARK_FX[mk.effectId];
    if (!name || !Number.isInteger(mk.uid)) continue;
    if (!out.has(/** @type {number} */ (mk.uid))) out.set(/** @type {number} */ (mk.uid), new Set());
    /** @type {Set<string>} */ (out.get(/** @type {number} */ (mk.uid))).add(name);
  }
  return out;
}

/**
 * The tile marks' floor effects: [{ bundle, name, row, col }] in board space (one per prefab and tile).
 * @param {BandMark[]} marks
 * @returns {{ bundle: string, name: string, row: number, col: number }[]}
 */
export function bandTileFx(marks) {
  const seen = new Set(), out = /** @type {{ bundle: string, name: string, row: number, col: number }[]} */ ([]);
  for (const mk of marks) {
    const name = BAND_TILE_FX[mk.effectId];
    if (!name || !Number.isInteger(mk.row) || !Number.isInteger(mk.col)) continue;
    const k = `${name}@${mk.row},${mk.col}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ bundle: BAND_FX_BUNDLE, name, row: /** @type {number} */ (mk.row), col: /** @type {number} */ (mk.col) });
  }
  return out;
}

/**
 * Sync the operator marks on the field's views (Map 'p:<uid>' → view): each own prep piece wears the effects of its marks
 * (fxgame statusOn at the prefab's own place) and drops the ones no longer marked. `byUid` from bandMarkFxByUid; outside the
 * prep (`prep` false) every mark effect goes.
 * @param {Map<unknown, BandView | null | undefined>} views
 * @param {StatusFxApi | null | undefined} fxGame
 * @param {unknown} prep
 * @param {Map<unknown, Set<string>>} byUid
 */
export function syncBandMarks(views, fxGame, prep, byUid) {
  const fx = fxGame && typeof fxGame.statusOn === 'function' ? fxGame : null;
  if (!fx) return;
  for (const [key, v] of views) {
    if (!v || typeof key !== 'string' || !key.startsWith('p:')) continue;
    const want = prep && v.alive !== false && !v.remove && !v.destroyed ? byUid.get(v.uid) : null;
    if (v._fxStatusOn?.size) {
      for (const k of [...v._fxStatusOn]) if (k.startsWith('band:') && !(want && want.has(k.slice(5)))) fx.statusOff(v, k, true);
    }
    if (!want) continue;
    for (const name of want) {
      const k = bandMarkKey(name);
      if (!v._fxStatusOn?.has(k) && fx.statusReady(BAND_FX_BUNDLE, name)) fx.statusOn(v, BAND_FX_BUNDLE, name, k, 'own');
    }
  }
}

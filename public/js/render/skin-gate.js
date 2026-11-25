// render/skin-gate.js — which model an ally's operator skin draws (docs/rules/render.md 「스킨 렌더 게이트」).
//
// A unit carries the skin its player chose (UnitInfo / pieceView `skin`; a summon carries its owner operator's, which the
// skin list's `tokens` turns into the summon's own skin). The view draws that skin's model only when
//   * the player chose the skin data (resources.js resourcePacks().skin) and its two lists are cached:
//     local/spine/skin/models.json (the models: the fexli files and each side's entry fields) and skins.json (each skin's
//     owner and its summons' skins);
//   * the unit is the player's own, or the settings' 其他玩家的皮肤 (`otherSkins`) is on;
//   * the model's record is complete — every side it has is a Spine entry with its pages, their kind (`pma`, the fexli
//     pages are of both kinds) and the skin's own key table (`anims`: 15 skins key their clips otherwise than the default
//     model) — and every file of it, skel, atlas and pages of both sides, is in the cache with its listed hash.
// The resource worker fetches any listed file it is asked for, so this is where another player's skin is kept from being
// downloaded: no file of a skin that fails these is ever asked for. Otherwise the default model. The answer holds for a
// scene (the prep, a battle, a scouted board: scene()): a download that ends, a list that arrives or a setting turned
// mid-battle shows from the next one. A skin model that fails to load falls back to the default one (its `fallback`).
// So the lists must be there BEFORE a field's first scene, or that whole scene is drawn in the default models (a
// player's report: every new match opened in the default skins): createFieldView waits for ready() before it returns
// the view, and the page keeps the lists once loaded, so the next match's field has them at once (pageSkinGate).
//
//   const gate = createSkinGate({ chosen, cached, self, others, load });
//   await gate.ready();                    the lists are loaded (or cannot be: not chosen, not cached, failed)
//   gate.scene();                          a new scene: the lists, the setting and the cache are read again
//   gate.model(info, base) → { key, front, back|null } | null   base(back) = the default entry of that side (the fallback);
//                                          key = the skin key drawn (the effect layer reads that skin's points and effects by it)

/**
 * The two lists as loaded (each read field by field), and once checked (`skins` a record in both).
 * @typedef {{ models?: { skins?: unknown } | null, list?: { skins?: unknown } | null }} SkinLoaded
 * @typedef {{ skins: Record<string, unknown> }} SkinTable
 * @typedef {{ models: SkinTable, list: SkinTable }} SkinLists
 * @typedef {{ skin?: unknown, side?: unknown, ownerId?: unknown, mine?: unknown, spine?: unknown, defId?: unknown }} SkinInfo
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' && v ? v : null);

export const SKIN_MODELS = '/assets/local/spine/skin/models.json';
export const SKIN_LIST = '/assets/local/spine/skin/skins.json';

/** The skin key a unit draws for its player's skin `skinId`: the skin itself on its owner, a summon's skin of it on that
 *  summon (skins.json `tokens`), else null. `unitId` is the id the view draws (UnitInfo `spine`, else `defId`).
 * @param {{ skins?: unknown } | null | undefined} list @param {string} skinId @param {string | null} unitId
 * @returns {string | null} */
export function skinKeyFor(list, skinId, unitId) {
  const rec = isObj(list?.skins) ? list.skins[skinId] : null;
  if (!isObj(rec) || !str(unitId)) return null;
  if (rec.owner === unitId) return skinId;
  const tk = isObj(rec.tokens) ? str(rec.tokens[/** @type {string} */ (unitId)]) : null;
  // `list.skins` is a record here (rec came from it)
  return tk && isObj(/** @type {SkinTable} */ (list).skins[tk]) && /** @type {Record<string, unknown>} */ (/** @type {SkinTable} */ (list).skins[tk]).owner === unitId ? tk : null;
}

/**
 * One side record of models.json as a Spine entry (`{ skel, atlas, textures, pma, anims, animations, events, hits, bounds }`,
 * the fields of a data/assets.json model), or null while it lacks any of what drawing it needs: its pages, their kind
 * (`pma`) and its key table (`anims`).
 * @param {unknown} side @param {unknown} [fallback] the default entry of that side
 */
export function skinSideEntry(side, fallback = null) {
  if (!isObj(side)) return null;
  const skel = str(side.skel), atlas = str(side.atlas);
  const pages = /** @type {string[]} */ (Array.isArray(side.pages) ? side.pages.filter(str) : []);
  if (!skel || !/^\/[^\s#?]*\.skel$/.test(skel) || !atlas || !pages.length || pages.length !== /** @type {unknown[]} */ (side.pages).length) return null;
  if (typeof side.pma !== 'boolean' || !isObj(side.anims)) return null;
  return {
    skel, atlas, textures: pages, pma: side.pma, anims: side.anims,
    animations: isObj(side.animations) ? side.animations : {}, events: Array.isArray(side.events) ? side.events : [],
    hits: isObj(side.hits) ? side.hits : {}, bounds: side.bounds ?? null, skin: true, fallback: fallback || null,
  };
}

/**
 * Every file of a model record (both sides): what must be cached before it is drawn.
 * @param {Record<string, unknown> | null | undefined} rec
 * @returns {unknown[]}
 */
export function skinFiles(rec) {
  /** @type {unknown[]} */
  const out = [];
  for (const s of [rec?.front, rec?.back]) {
    if (!isObj(s)) continue;
    out.push(s.skel, s.atlas, ...(Array.isArray(s.pages) ? s.pages : []));
  }
  return out;
}

/**
 * @param {{ chosen: () => boolean, cached: (paths: unknown[]) => boolean, self: () => unknown, others: () => boolean,
 *   load: () => Promise<SkinLoaded | null | undefined> }} deps
 *   chosen: the player chose the skin data; cached: every path is in the cache as listed; self: the own player id;
 *   others: 其他玩家的皮肤 is on; load: the two lists (fetched once they are cached)
 */
export function createSkinGate(deps) {
  /** @type {SkinLists | null} */
  let lists = null;        // { models, list } once loaded
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @type {{ lists: SkinLists | null, others: boolean, self: unknown, memo: Map<string, Record<string, unknown> | null> } | null} */
  let scene = null;        // { lists, others, self, memo: Map<skin key, { rec, files ok }> } — this scene's view of things

  function ensure() {
    if (lists || loading) return;
    let go;
    try { go = !!deps.chosen() && !!deps.cached([SKIN_MODELS, SKIN_LIST]); } catch { go = false; }
    if (!go) return;
    loading = Promise.resolve().then(deps.load).then((l) => {
      if (isObj(l) && isObj(l.models?.skins) && isObj(l.list?.skins)) lists = /** @type {SkinLists} */ (l);
      loading = null;
    }, () => { loading = null; });
  }

  function current() {
    if (!scene) {
      /** @type {boolean} */
      let others = true, /** @type {unknown} */ self = null;
      try { others = deps.others() !== false; } catch { /* on */ }
      try { self = deps.self() ?? null; } catch { /* none */ }
      scene = { lists: lists && deps.chosen() ? lists : null, others, self, memo: new Map() };
    }
    return scene;
  }

  return {
    /** A new scene: what the next views are judged by is read again (the lists may start loading). */
    scene() { scene = null; ensure(); current(); },
    /** Start loading the lists now when they may be (the next scene then has them). */
    prefetch() { ensure(); },
    /** Settles once the lists are loaded or cannot be now (the skin data not chosen, the lists not cached, a failed
     *  fetch): what the field's first scene must wait for (header). Never rejects. */
    ready() { ensure(); return loading ? loading.then(() => undefined) : Promise.resolve(); },
    /**
     * The skin model `info` draws, `{ key, front, back }` (back null: the skin has no Back model; `key` the skin key — a summon's
     * own skin key, skinKeyFor), or null: the default model.
     * @param {SkinInfo | null | undefined} info the view's UnitInfo (`skin`, `side`, `ownerId`, `mine`: an own prep piece)
     * @param {(back: boolean) => unknown} [base] the default entry of a side (each skin entry's `fallback`)
     */
    model(info, base) {
      ensure();
      const skinId = str(info?.skin);
      if (!skinId || /** @type {SkinInfo} */ (info).side !== 'ally') return null;
      const s = current();
      if (!s.lists) return null;
      const mine = /** @type {SkinInfo} */ (info).mine === true || (/** @type {SkinInfo} */ (info).ownerId != null && /** @type {SkinInfo} */ (info).ownerId === s.self);
      if (!mine && !s.others) return null;
      const key = skinKeyFor(s.lists.list, skinId, str(/** @type {SkinInfo} */ (info).spine) || str(/** @type {SkinInfo} */ (info).defId));
      if (!key) return null;
      let m = s.memo.get(key);
      if (m === undefined) {
        const rec = /** @type {Record<string, unknown>} */ (s.lists.models.skins[key]);   // its fields read only once isObj (files)
        const files = isObj(rec) ? skinFiles(rec) : [];
        let ok;
        try { ok = !!files.length && deps.cached(files); } catch { ok = false; }
        m = ok && skinSideEntry(rec.front) && (rec.back == null || skinSideEntry(rec.back)) ? rec : null;
        s.memo.set(key, m);
      }
      if (!m) return null;
      const fb = (/** @type {boolean} */ back) => { try { return base ? base(back) : null; } catch { return null; } };
      return { key, front: skinSideEntry(m.front, fb(false)), back: m.back ? skinSideEntry(m.back, fb(true)) : null };
    },
  };
}

/** The two lists, fetched once per page and kept for every field after it (a failed fetch is tried again). */
/** @type {Promise<SkinLoaded> | null} */
let pageLists = null;
/** @returns {Promise<SkinLoaded>} */
export function pageSkinLists() {
  const json = (/** @type {string} */ u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  if (!pageLists) {
    pageLists = Promise.all([json(SKIN_MODELS), json(SKIN_LIST)]).then(([models, list]) => ({ models, list }));
    pageLists.catch(() => { pageLists = null; });
  }
  return pageLists;
}

/**
 * The page's gate: the resource download's pack choice and cache record (resources.js), the own player id (store.js),
 * the setting from `others`. Loaded on first use and only where Cache Storage exists (no download, no skins elsewhere —
 * Node tests included). ready() also waits for resources.js to have read its list and cache record (resourcesKnown): a
 * field opened right after a reload would otherwise find no skin cached and judge its first scene without the lists.
 * @param {() => boolean} others
 */
export function pageSkinGate(others) {
  /** @type {typeof import('../resources.js') | null} */
  let res = null, /** @type {typeof import('../store.js') | null} */ st = null, asked = false,
    /** @type {ReturnType<typeof createSkinGate> | null} */ gate = null;
  let modsReady = Promise.resolve();
  const mods = () => {
    if (!asked && typeof globalThis.caches !== 'undefined') {
      asked = true;
      modsReady = Promise.all([import('../resources.js'), import('../store.js')])
        .then(([r, s]) => { res = r; st = s; gate?.prefetch(); return r.resourcesKnown; })
        .then(() => { gate?.prefetch(); }, () => {});
    }
    return res && st;
  };
  gate = createSkinGate({
    chosen: () => !!mods() && /** @type {typeof import('../resources.js')} */ (res).resourcePacks().skin === true,
    cached: (paths) => !!mods() && /** @type {typeof import('../resources.js')} */ (res).resourceCached(paths),
    self: () => (mods() ? /** @type {typeof import('../store.js')} */ (st).store.get()?.me?.playerId ?? null : null),
    others,
    load: pageSkinLists,
  });
  mods();
  const ready = gate.ready;
  gate.ready = () => modsReady.then(() => ready());
  return gate;
}

// Operator skins on the page (docs/rules/ui.md 「스킨 고르기」): this browser's choice, its catalogue and who sees what.
//
// The CHOICE is a plain `{ [charId]: skinId }` map, kept per browser (pref 'skins', not per season: the official skin
// belongs to the operator — maintainer decision 2026-11-07) and sent as `room.skins` (ui/loadoutSync.js
// installSkinsSync). It is public: the server hands it to every seat of the room (room.state seats[].skins) and to the
// match (players[].skins, every unit's `skin`), and render/skin-gate.js decides what a page draws of it.
//
// The CATALOGUE is not data/*.json: the official skins come with the optional skin data (resources.js pack 'skin'),
//   * local/spine/skin/skins.json — every skin: its owner (an operator charId, or a summon's id), its summons' skins
//     (`tokens`) and its 立绘 (`illust`, this server's webp; its `full` copy is the original resolution, drawn when the
//     player chose 高清 — by default every device but a phone, illust-res.js; its `frame` the one the unit card draws
//     it by, cardSkinArt) — tools/local-extract/skin_extract.py;
//   * local/spine/skin/art.json — each skin's avatar (1:1) and portrait (1:2), fetched by the resource worker from the
//     picture repository the list names — tools/fetch-skin-art.mjs.
// Both lists are small and are fetched (and kept by the worker) when the picker or a seat card first needs them, chosen
// pack or not: a player without the skin data still sees which skins an operator has, locked. A change of the 立绘 copy
// (illust-res.js illustStore) rebuilds the catalogue from the two lists, so an open picker's preview switches at once.
//
// The key is the OPERATOR id, not the chess id: an operator's normal, elite and 自选 pieces are one operator, and the
// server reads a unit's skin by its charId (server/match/player PlayerState.skinFor).

import { useEffect } from '../../vendor/hooks.module.js';
import { createStore, loadPref, savePref, useStore } from '../store.js';
import { SKIN_LIMITS, isCharId, isSkinId } from '../../../shared/protocol.js';
import { illustEntry, illustFull, illustStore } from '../illust-res.js';
import { resStore, resourceCached, skinPackState } from '../resources.js';

/** The pref (`sp.pref.<key>`) of this browser's choice. */
export const SKINS_PREF = 'skins';
/** The store field the sync engine watches and its sync state field (ui/loadoutSync.js installSkinsSync). */
export const SKINS_KEY = 'skins';
export const SKINS_SYNC_KEY = 'skinsSync';

/** The two catalogue lists (the paths render/skin-gate.js reads too). */
export const SKIN_LIST_URL = '/assets/local/spine/skin/skins.json';
export const SKIN_ART_URL = '/assets/local/spine/skin/art.json';

/** @param {unknown} v @returns {v is Record<string, any>} */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @param {unknown} v @returns {string | null} */
const str = (v) => (typeof v === 'string' && v ? v : null);
/** A picture record of the lists (`{ path, w, h }`) as its URL, or null. @param {unknown} v */
const pathOf = (v) => (isObj(v) && typeof v.path === 'string' && v.path.startsWith('/assets/') ? v.path : null);
/** A 立绘 record's card frame (`{ x, y, w, h }`, frame units), or null. @param {unknown} v @param {string} [key] */
const frameOf = (v, key = 'frame') => {
  const f = isObj(v) ? v[key] : null;
  return isObj(f) && [f.x, f.y, f.w, f.h].every(Number.isFinite) && f.w > 0 && f.h > 0 ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
};

/**
 * A stored choice as the store holds it: at most SKIN_LIMITS.entries pairs of an operator charId and a skinId, in the
 * order stored — exactly what the wire accepts (shared/protocol.js isSkinSelection), so a hand-edited pref can never
 * make the whole `room.skins` a BAD_MSG.
 * @param {unknown} raw @returns {Record<string, string>}
 */
export function parseStoredSkins(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!isObj(raw)) return out;
  let kept = 0;
  for (const [charId, skinId] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (kept >= SKIN_LIMITS.entries) break;
    if (!isCharId(charId) || !isSkinId(skinId)) continue;
    out[charId] = /** @type {string} */ (skinId);
    kept++;
  }
  return out;
}

/**
 * This browser's choice and its sync state, and the catalogue once loaded (`catalog`: null before, 'missing' when the
 * lists are not on this server, else loadSkinCatalog's record). Apart from the app store: it survives room / match resets.
 */
export const skinsStore = createStore({ [SKINS_KEY]: parseStoredSkins(loadPref(SKINS_PREF, null)), [SKINS_SYNC_KEY]: 'idle',
  catalog: /** @type {any} */ (null) });

/** Replace the whole choice (saved at once; the sync picks the change up). @param {unknown} entries */
export function setSkins(entries) {
  const next = parseStoredSkins(entries);
  try { savePref(SKINS_PREF, next); } catch { /* private mode: the session keeps it */ }
  skinsStore.set({ [SKINS_KEY]: next });
}

/** Choose one operator's skin. @param {string} charId @param {string} skinId */
export function setSkin(charId, skinId) {
  if (!isCharId(charId) || !isSkinId(skinId)) return;
  setSkins({ ...(skinsStore.get()[SKINS_KEY] || {}), [charId]: skinId });
}

/** Back to the operator's default appearance. @param {string} charId */
export function clearSkin(charId) {
  const next = { ...(skinsStore.get()[SKINS_KEY] || {}) };
  if (!str(charId) || !(charId in next)) return;
  delete next[charId];
  setSkins(next);
}

/**
 * The catalogue from the two lists: the operators' skins grouped by owner in the list's order (the summons' own skins
 * are not chosen — they follow their owner's), each `{ id, name, illust, frame, rect, avatar, portrait }` (null where a list
 * has no picture: the default one is drawn; `frame` the 立绘's unit-card frame, `rect` its seat-card frame).
 * @param {any} list skins.json @param {any} art art.json (may be null: no avatars / portraits)
 * @param {boolean} [hi] the 立绘's original-resolution copy (default: the page's choice, illust-res.js)
 */
export function buildSkinCatalog(list, art, hi = illustFull()) {
  const byOwner = new Map();
  const bySkin = new Map();
  const skins = isObj(list?.skins) ? list.skins : {};
  const pics = isObj(art?.skins) ? art.skins : {};
  for (const [id, rec] of Object.entries(skins)) {
    if (!isObj(rec) || !isSkinId(id) || !isCharId(rec.owner)) continue;
    const a = isObj(pics[id]) ? pics[id] : {};
    const row = { id, owner: rec.owner, name: str(rec.name), illust: pathOf(illustEntry(rec.illust, hi)), frame: frameOf(rec.illust),
      rect: frameOf(rec.illust, 'rect'), avatar: pathOf(a.avatar), portrait: pathOf(a.portrait) };
    if (!byOwner.has(rec.owner)) byOwner.set(rec.owner, []);
    byOwner.get(rec.owner).push(row);
    bySkin.set(id, row);
  }
  return { byOwner, bySkin };
}

/** @type {Promise<any> | null} */
let loading = null;
/** @type {{ list: any, art: any } | null} */
let lists = null; // the two lists the catalogue was built from: { list, art }
/**
 * Fetch the two lists once (both are listed files: the resource worker keeps them) and put the catalogue in the store.
 * A server without them ('missing') shows no skin section; a failed fetch is tried again on the next call.
 * @param {(url: string) => Promise<any>} [getJson] resolves null for a 404
 */
export function loadSkinCatalog(getJson = fetchJson) {
  if (skinsStore.get().catalog) return Promise.resolve(skinsStore.get().catalog);
  if (loading) return loading;
  loading = Promise.all([getJson(SKIN_LIST_URL), getJson(SKIN_ART_URL).catch(() => null)]).then(([list, art]) => {
    const catalog = isObj(list) ? buildSkinCatalog(list, art) : 'missing';
    if (isObj(list)) lists = { list, art };
    skinsStore.set({ catalog });
    loading = null;
    return catalog;
  }, (err) => { loading = null; console.warn('[skins] catalogue', err); return null; });
  return loading;
}

illustStore.subscribe((s, prev) => {
  if (s.hi !== prev.hi && lists && isObj(skinsStore.get().catalog)) skinsStore.set({ catalog: buildSkinCatalog(lists.list, lists.art, s.hi) });
});

/** @param {string} url */
async function fetchJson(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/**
 * One operator's skins (the catalogue's rows), [] for none or before the catalogue. A skin's owner is the form its record
 * names (skins.json: tmplId, else charId — skin_extract.py skin_owner), so a chess whose body is another form of the
 * operator (`tmplId` ≠ `charId`: 阿米娅 (医疗) is char_002_amiya drawn as char_1037_amiya3) also lists that form's skins.
 * The choice stays keyed by charId (the server reads it so, PlayerState.skinFor).
 * @param {any} catalog @param {string} charId @param {string|null} [tmplId] the chess record's body form
 */
export function skinRows(catalog, charId, tmplId = null) {
  if (!isObj(catalog) || !(catalog.byOwner instanceof Map)) return [];
  const own = catalog.byOwner.get(charId) || [];
  const form = str(tmplId) && tmplId !== charId ? catalog.byOwner.get(tmplId) || [] : [];
  return form.length ? [...own, ...form] : own;
}

/**
 * The skin an operator wears by this browser's choice: the stored skinId when the catalogue lists it for that operator
 * (a skin a newer list dropped counts as the default), null for the default.
 * @param {string} charId @param {Record<string, string>} [map] @param {any} [catalog] @param {string|null} [tmplId] as skinRows
 */
export function chosenSkin(charId, map = skinsStore.get()[SKINS_KEY], catalog = skinsStore.get().catalog, tmplId = null) {
  const id = str(charId) && isObj(map) ? str(map[charId]) : null;
  return id && skinRows(catalog, charId, tmplId).some((/** @type {{ id: string }} */ r) => r.id === id) ? id : null;
}

/**
 * The skin an owned card shows (the seat card in the waiting room): one's own wears this browser's choice at once
 * (`localSkins`), another Doctor's the choice that seat published (`players`: `{ playerId, skins }` — room.state seats)
 * unless 其他玩家的皮肤 (`otherSkins`) is off. Nothing without the skin data (`pack`): a player who did not take it sees
 * everybody in the default appearance (resource packs plan, 「같은 길」).
 * @param {string} charId
 * @param {{ ownerId?: any, myId?: any, players?: any[], localSkins?: Record<string, string>, otherSkins?: boolean, pack?: boolean }} ctx
 * @returns {string|null}
 */
export function ownerSkin(charId, { ownerId, myId = null, players = [], localSkins = {}, otherSkins = true, pack = true } = {}) {
  if (!pack || !str(charId) || ownerId == null) return null;
  if (ownerId === myId) return str(localSkins?.[charId]);
  const skins = playerSkins(players, ownerId, otherSkins);
  return skins ? str(skins[charId]) : null;
}

/**
 * Another Doctor's published choice `{ [charId]: skinId }` (m.public players[].skins, room.state seats[].skins), or null
 * when 其他玩家的皮肤 (`otherSkins`) is off or they chose none — what an icon of their operator wears where no piece of
 * theirs is at hand (the leader ranking's rows, the result's lineups, a watched teammate's bond popup: UnitThumb
 * `skinsOf`), read by the operator of the body drawn, as the server's skinFor (docs/rules/ui.md 「스킨 고르기」).
 * @param {any[]} players @param {any} playerId @param {boolean} [otherSkins]
 * @returns {Record<string, string>|null}
 */
export function playerSkins(players, playerId, otherSkins = true) {
  if (!otherSkins || playerId == null) return null;
  const p = (Array.isArray(players) ? players : []).find((x) => x && x.playerId === playerId);
  return p && isObj(p.skins) ? p.skins : null;
}

/**
 * The skin 立绘 an own unit's detail card draws (ui/detailArt.js; docs/rules/ui.md 「스킨 고르기」 상세 카드): the skin
 * the piece wears (pieceView `skin` — what the server applied to the body drawn, the skin the field draws) when the
 * catalogue lists it for that body (`ids`: the body's tmplId / charId) with a 立绘 (the chosen copy) and its card frame,
 * the skin data is downloaded (`ready`: chosen, nothing of it left — before that and while it downloads, the default
 * art: maintainer decision 2026-11-17) and that copy is in the cache (`cached`, resources.js resourceCached). Else null:
 * the card draws the default art.
 * The waiting room's seat card asks the same with `by: 'rect'`: its frame is the 立绘's RectTransform (docs/rules/ui.md
 * 「명함 오퍼레이터」), returned as `frame`.
 * @param {any} skinId @param {Array<any>} ids
 * @param {{ catalog?: any, ready?: boolean, cached?: (paths: string[]) => boolean, by?: 'frame'|'rect' }} [ctx]
 * @returns {{ src: string, frame: { x: number, y: number, w: number, h: number } } | null}
 */
export function cardSkinArt(skinId, ids, { catalog = skinsStore.get().catalog, ready = false, cached = () => false, by = 'frame' } = {}) {
  const id = str(skinId);
  if (!id || !ready || !isObj(catalog) || !(catalog.bySkin instanceof Map)) return null;
  const row = catalog.bySkin.get(id);
  const frame = row ? row[by === 'rect' ? 'rect' : 'frame'] : null;
  if (!row || !row.illust || !frame || !(Array.isArray(ids) ? ids : []).includes(row.owner)) return null;
  let ok = false;
  try { ok = !!cached([row.illust]); } catch { /* no cache record: the default art */ }
  return ok ? { src: row.illust, frame } : null;
}

/**
 * A skin's avatar (1:1, `kind` 'avatar') or portrait (1:2, 'portrait' — the size of the default half-body portrait a shop
 * card draws), art.json's pictures from the picture repository, for the body `ids` (tmplId / charId) the catalogue lists
 * it for — under the same gate as cardSkinArt: the skin data downloaded (`ready`) and that picture cached (`cached`).
 * Else null: the default picture (docs/rules/ui.md 「스킨 고르기」 operator pictures).
 * @param {any} skinId @param {Array<any>} ids @param {'avatar'|'portrait'} kind
 * @param {{ catalog?: any, ready?: boolean, cached?: (paths: string[]) => boolean }} [ctx]
 * @returns {string|null}
 */
export function skinPicture(skinId, ids, kind, { catalog = skinsStore.get().catalog, ready = false, cached = () => false } = {}) {
  const id = str(skinId);
  if (!id || !ready || !isObj(catalog) || !(catalog.bySkin instanceof Map)) return null;
  const row = catalog.bySkin.get(id);
  const src = row && (kind === 'avatar' ? row.avatar : kind === 'portrait' ? row.portrait : null);
  if (!src || !(Array.isArray(ids) ? ids : []).includes(row.owner)) return null;
  let ok = false;
  try { ok = !!cached([src]); } catch { /* no cache record: the default picture */ }
  return ok ? src : null;
}

/**
 * The skin a picture of operator record `rec` (a chess record, a 自选 record, a 补位 stand-in: the body drawn) wears:
 * `skin` when the caller hands one it shows (a piece's or a unit's worn skin), else with `own` this browser's choice for
 * that operator (`map`, keyed by charId — a card opened without a piece: a shop slot, a bond popup's own row), else
 * another Doctor's published choice `of` (playerSkins: already null when 其他玩家的皮肤 is off); null for the default.
 * @param {any} rec @param {{ skin?: any, own?: boolean, map?: Record<string, string>, of?: Record<string, string>|null }} [worn]
 * @returns {string|null}
 */
export function wornSkin(rec, { skin = null, own = false, map = skinsStore.get()[SKINS_KEY], of = null } = {}) {
  const id = str(skin);
  if (id) return id;
  if (!rec) return null;
  if (own) return isObj(map) ? str(map[rec.charId]) : null;
  return isObj(of) ? str(of[rec.charId]) : null;
}

/**
 * The skin a detail card's operator wears, as wornSkin's `worn`: the own piece's (pieceView `skin`), else for a card opened
 * without a piece this browser's choice (resolveDetail `skin.own`: a shop slot, the own bond popup's row), else a unit's
 * (`skin.id`) — another player's (not `skin.mine`) only with 其他玩家的皮肤 on (`others`), as render/skin-gate.js draws its model.
 * @param {any} piece @param {any} skin resolveDetail's `skin` @param {boolean} [others]
 * @returns {{ skin?: string, own?: boolean }}
 */
export function cardWorn(piece, skin, others = true) {
  const ps = str(piece?.skin);
  if (ps) return { skin: ps };
  if (!isObj(skin)) return {};
  if (skin.own === true) return { own: true };
  return str(skin.id) && (skin.mine === true || others) ? { skin: skin.id } : {};
}

/**
 * What a component needs to draw operator pictures in skins, read now: this browser's choice (`map`), the catalogue,
 * whether the skin data is downloaded (`ready`, resources.js skinPackState 'done': not taken or still downloading draws
 * the default pictures, maintainer decision 2026-11-17) and the cache check — the context skinPicture, skinPic and
 * cardSkinArt take. Not a hook (the leaf components stay plain functions): the page's root subscribes with useSkinArt,
 * whose change re-renders the whole tree in place, and fetches the catalogue.
 */
export function skinArt() {
  const s = skinsStore.get();
  return { map: s[SKINS_KEY], catalog: s.catalog, ready: skinPackState(resStore.get()) === 'done', cached: resourceCached };
}

/**
 * The page root's subscription (main.js App, like useLang): a change of the choice, of the catalogue or of the skin data's
 * download state re-renders the tree, so every skinArt() reader draws the new pictures; once the skin data is downloaded
 * it fetches the catalogue — never before (a player without it fetches nothing for these pictures).
 */
export function useSkinArt() {
  useStore((x) => x[SKINS_KEY], Object.is, skinsStore);
  const catalog = useStore((x) => x.catalog, Object.is, skinsStore);
  const ready = useStore((r) => skinPackState(r) === 'done', Object.is, resStore);
  useEffect(() => { if (ready && !catalog) void loadSkinCatalog(); }, [ready, catalog]);
  return skinArt();
}

/**
 * The `kind` picture of operator record `rec` in the skin it wears (wornSkin), or null: the caller draws the default one.
 * @param {any} rec @param {'avatar'|'portrait'} kind @param {ReturnType<typeof skinArt>} ctx
 * @param {{ skin?: any, own?: boolean, of?: Record<string, string>|null }} [worn]
 */
export function skinPic(rec, kind, ctx, worn = {}) {
  const id = rec ? wornSkin(rec, { ...worn, map: ctx?.map }) : null;
  return id ? skinPicture(id, [rec.tmplId, rec.charId], kind, ctx) : null;
}

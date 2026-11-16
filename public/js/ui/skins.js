// Operator skins on the page (docs/rules/ui.md 「스킨 고르기」): this browser's choice, its catalogue and who sees what.
//
// The CHOICE is a plain `{ [charId]: skinId }` map, kept per browser (pref 'skins', not per season: the official skin
// belongs to the operator — maintainer decision 2026-11-07) and sent as `room.skins` (ui/loadoutSync.js
// installSkinsSync). It is public: the server hands it to every seat of the room (room.state seats[].skins) and to the
// match (players[].skins, every unit's `skin`), and render/skin-gate.js decides what a page draws of it.
//
// The CATALOGUE is not data/*.json: the official skins come with the optional skin data (resources.js pack 'skin'),
//   * local/spine/skin/skins.json — every skin: its owner (an operator charId, or a summon's id), its summons' skins
//     (`tokens`) and its 立绘 (`illust`, this server's webp; its `full` copy is the original resolution, which every
//     device but a phone draws — illust-res.js) — tools/local-extract/skin_extract.py;
//   * local/spine/skin/art.json — each skin's avatar (1:1) and portrait (1:2), fetched by the resource worker from the
//     picture repository the list names — tools/fetch-skin-art.mjs.
// Both lists are small and are fetched (and kept by the worker) when the picker or a seat card first needs them, chosen
// pack or not: a player without the skin data still sees which skins an operator has, locked.
//
// The key is the OPERATOR id, not the chess id: an operator's normal, elite and 自选 pieces are one operator, and the
// server reads a unit's skin by its charId (server/match/player PlayerState.skinFor).

import { createStore, loadPref, savePref } from '../store.js';
import { SKIN_LIMITS, isCharId, isSkinId } from '../../../shared/protocol.js';
import { illustEntry, illustFull } from '../illust-res.js';

/** The pref (`sp.pref.<key>`) of this browser's choice. */
export const SKINS_PREF = 'skins';
/** The store field the sync engine watches and its sync state field (ui/loadoutSync.js installSkinsSync). */
export const SKINS_KEY = 'skins';
export const SKINS_SYNC_KEY = 'skinsSync';

/** The two catalogue lists (the paths render/skin-gate.js reads too). */
export const SKIN_LIST_URL = '/assets/local/spine/skin/skins.json';
export const SKIN_ART_URL = '/assets/local/spine/skin/art.json';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' && v ? v : null);
/** A picture record of the lists (`{ path, w, h }`) as its URL, or null. */
const pathOf = (v) => (isObj(v) && typeof v.path === 'string' && v.path.startsWith('/assets/') ? v.path : null);

/**
 * A stored choice as the store holds it: at most SKIN_LIMITS.entries pairs of an operator charId and a skinId, in the
 * order stored — exactly what the wire accepts (shared/protocol.js isSkinSelection), so a hand-edited pref can never
 * make the whole `room.skins` a BAD_MSG.
 * @param {unknown} raw @returns {Record<string, string>}
 */
export function parseStoredSkins(raw) {
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

/** Replace the whole choice (saved at once; the sync picks the change up). */
export function setSkins(entries) {
  const next = parseStoredSkins(entries);
  try { savePref(SKINS_PREF, next); } catch { /* private mode: the session keeps it */ }
  skinsStore.set({ [SKINS_KEY]: next });
}

/** Choose one operator's skin. */
export function setSkin(charId, skinId) {
  if (!isCharId(charId) || !isSkinId(skinId)) return;
  setSkins({ ...(skinsStore.get()[SKINS_KEY] || {}), [charId]: skinId });
}

/** Back to the operator's default appearance. */
export function clearSkin(charId) {
  const next = { ...(skinsStore.get()[SKINS_KEY] || {}) };
  if (!str(charId) || !(charId in next)) return;
  delete next[charId];
  setSkins(next);
}

/**
 * The catalogue from the two lists: the operators' skins grouped by owner in the list's order (the summons' own skins
 * are not chosen — they follow their owner's), each `{ id, name, illust, avatar, portrait }` (null where a list has no
 * picture: the default one is drawn).
 * @param {any} list skins.json @param {any} art art.json (may be null: no avatars / portraits)
 * @param {boolean} [hi] the 立绘's original-resolution copy (default: this device's choice, illust-res.js)
 */
export function buildSkinCatalog(list, art, hi = illustFull()) {
  const byOwner = new Map();
  const bySkin = new Map();
  const skins = isObj(list?.skins) ? list.skins : {};
  const pics = isObj(art?.skins) ? art.skins : {};
  for (const [id, rec] of Object.entries(skins)) {
    if (!isObj(rec) || !isSkinId(id) || !isCharId(rec.owner)) continue;
    const a = isObj(pics[id]) ? pics[id] : {};
    const row = { id, owner: rec.owner, name: str(rec.name), illust: pathOf(illustEntry(rec.illust, hi)), avatar: pathOf(a.avatar), portrait: pathOf(a.portrait) };
    if (!byOwner.has(rec.owner)) byOwner.set(rec.owner, []);
    byOwner.get(rec.owner).push(row);
    bySkin.set(id, row);
  }
  return { byOwner, bySkin };
}

let loading = null;
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
    skinsStore.set({ catalog });
    loading = null;
    return catalog;
  }, (err) => { loading = null; console.warn('[skins] catalogue', err); return null; });
  return loading;
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** One operator's skins (the catalogue's rows), [] for none or before the catalogue. */
export const skinRows = (catalog, charId) => (isObj(catalog) && catalog.byOwner instanceof Map ? catalog.byOwner.get(charId) || [] : []);

/**
 * The skin an operator wears by this browser's choice: the stored skinId when the catalogue lists it for that operator
 * (a skin a newer list dropped counts as the default), null for the default.
 * @param {string} charId @param {Record<string, string>} [map] @param {any} [catalog]
 */
export function chosenSkin(charId, map = skinsStore.get()[SKINS_KEY], catalog = skinsStore.get().catalog) {
  const id = str(charId) && isObj(map) ? str(map[charId]) : null;
  return id && skinRows(catalog, charId).some((r) => r.id === id) ? id : null;
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
  if (!otherSkins) return null;
  const owner = (Array.isArray(players) ? players : []).find((p) => p && p.playerId === ownerId);
  return owner && isObj(owner.skins) ? str(owner.skins[charId]) : null;
}

// Background resource download (local patch): pre-downloads the game art into the resource database (IndexedDB,
// resource-entries.js DB_NAME, calls in resource-db.js), which public/resource-worker.js then serves, so a picture never
// pops in late (no download, no revalidation round trip). Without the consent the worker still fetches each listed file
// on demand (upstream art from jsDelivr / GitHub raw, hash-checked) and keeps it in the same database.
//
// The list is /assets/browser-resources.json (tools/build-browser-resources.mjs, built on the server from the files on
// disk): { version, bytes, files: [{ p: path, s: bytes, h: sha256, u?: upstream URL }] }.
//   * a file with `u` (unmodified upstream art) is fetched from jsDelivr, then GitHub raw — never from this server;
//   * a file without `u` (assets/local: 3D board, emotes, UI sprites; normalized spine atlases) comes from this server,
//     requested with PAST_WORKER so the worker leaves it alone (it answers no query string): otherwise the worker took
//     the request, fetched, hashed and stored the file, and this page hashed and stored it a second time;
//   * most of this server's files are also in `bundles: [{ p, s, m }]` (tools/assets/resource-bundles.mjs: about 8 MB of
//     members' bytes one after another, `m` = indices into `files` as listed). A bundle whose members still to download
//     are at least two and half its bytes is read first, two at a time and only outside a match and a field load (a read
//     then is cut short and taken up again after): each member is cut by its listed size as its bytes arrive and stored
//     under its own path with the same check as a file (readBundle). A failed bundle's members, and a member whose bytes
//     did not match, are then downloaded as files; so are the bundles still waiting when a match leaves nothing else;
//   * every file is kept only when its size and SHA-256 match the list, so an upstream repo that changed under us can
//     never put a different file in the cache. A file that fails stays out (the game loads it from the server as now)
//     and is tried again on the next visit — except an upstream file whose every source served other bytes (the repo
//     changed the file at that path since the list was built): it is recorded in DIFFER and not tried again until the
//     list names another hash for it or DIFFER_RETRY_MS has passed, so a drifted file costs one download and one warning,
//     not one on every visit. The worker still fetches it on demand (its last source is this server).
// The database keeps each file's bytes and its hash together (one transaction), and the hashes apart, so a load reads
// every stored path's hash at once: entries whose hash changed or that left the list are listed as stale, then the rest
// is downloaded. Not the Cache Storage, whose every cache code a filter puts into the service worker can delete (an ad
// blocker did on each of its restarts, 2026-11-26): the files of the versions before, in the caches OLD_CACHES, are moved
// into the database in the background (migrate) and the caches deleted; the worker serves from them meanwhile. Nothing
// starts before the player agrees once (the choice
// is remembered; 以后再说 asks again after ASK_AGAIN_MS). The download runs in the page, not the worker: a service worker
// event is cut off after a few minutes, a page keeps going while the player plays — one file at a time during a match,
// none while a field loads. The stale entries are deleted in the background, a few at a time and never during a match:
// the worker answers only the listed hash, so a stale copy waiting for its turn is never served, and after a deploy the
// thousands of deletions no longer share the Cache Storage with a match's first pictures (a phone's first match after a
// deploy waited 14.7 s for its art instead of 2.6 s, 2026-10-28).
// Packs (the skin data): the list names the path prefixes of each optional pack (`packs`). A pack's files are downloaded
// only when the player chose that pack (resourceWanted, the choice in PACKS_PREF), and deleted only when the player
// turns it off: a file of a pack never chosen that is in the cache with the listed hash is kept, so the list of what
// to download and the list of what to delete are two lists (a filter on the one would delete what the game fetched on
// demand on every visit). Without the general consent a chosen pack is still downloaded (it is a choice of its own).
// The settings' 资源 tab (ResourceSetting, SkinPackSetting) shows the files in no pack and each pack apart (resStore
// `sizes`: the consent card's size counts a chosen pack's files too), and can pause a pack's download for this page.
// The 立绘 with two copies (`r`: 'lo' the long side 1024, 'hi' the original resolution — illust-res.js) are the player's
// choice (立绘画质 on the consent card and the resource tab, IllustSetting; until the player chooses, the device's
// default): only the chosen copy is downloaded and kept, and the other leaves the cache (the page never asks for it, so
// nothing fetched on demand is lost). A change resyncs like the voice language (illustStore): the new copies are
// downloaded when the player agreed before, the consent card's size follows, and the tab's note gives the difference
// from the list (`illust`: bytes 'hi' minus 'lo' per group).
// Needs a secure context (https / localhost); on plain http the game simply loads everything from the server.
//
//   installResources()   main.js, once
//   resourceCached(paths) whether a skin model is all in the cache (render/skin-gate.js)
//   resourcesKnown       settles once the list and the cache record are read (render/skin-gate.js ready)
//   <ResourceHost />     consent card + progress pill (title / lobby / room screens only, never over the match HUD)
//   <ResourceSetting />  the settings row: start (or retry) the download any time, e.g. after 以后再说; then 立绘画质
//   <SkinPackSetting />  the settings rows of the skin data: download / pause / turn off, and 其他玩家的皮肤

import { html, MicroLabel } from './ui/components.js';
import { createStore, useStore, store, loadPref, savePref, selectRoute } from './store.js';
import { wantedFiles, onVoiceLangChange, voiceStore, setVoiceLang, VOICE_LANGS, voiceLangLabel } from './voice.js';
import { setResourceSource, fieldLoading } from './diag.js';
import { illustListed, illustStore, setIllustFull } from './illust-res.js';
import { t, tc } from '../../shared/i18n.js';
import { sourcesOf, validPath, validEntry, oldShardOf, OLD_SHARD_NAMES, OLD_META_CACHE, OLD_SINGLE_CACHE, OLD_CACHES } from './resource-entries.js';
import { openResourceDb, readHashes, hashOf, putFiles, dropFiles, readMeta, writeMeta, deleteResourceDb } from './resource-db.js';

export { sourcesOf, validPath, validEntry };

const DIFFER = 'differ'; // META_STORE: upstream files every source served with other bytes, path → { h: listed hash, at }
const OLD_STATE = '/__sp_res_state__'; // the old caches' record of what the page stored there: path → hash
const OLD_RECORD = /^\/__sp_res_[a-z]+__$/; // the old caches' records (state, clean, differ), never files
const DIFFER_RETRY_MS = 7 * 86400e3;
const INDEX = '/assets/browser-resources.json';
const PREF = 'resources';
const PACKS_PREF = 'resourcePacks'; // { <pack>: true (chosen) | false (turned off) }; a pack never chosen is absent
const ASK_AGAIN_MS = 7 * 86400e3;
const TIMEOUT_MS = 60000;
const CLEAN_CHUNK = 50;       // stale entries deleted between two rests
const CLEAN_REST_MS = 100;
const HOLD_POLL_MS = 1000;
// the query the download puts on this server's files: the worker answers no request with a query string, so the file is
// fetched, hashed and stored once, by the download (fetchOne), not by the worker as well
export const PAST_WORKER = '?sp-res';

/**
 * @typedef {{ p: string, s: number, h: string, u?: string, r?: string }} ResEntry an entry of the list (validEntry)
 * @typedef {import('./resource-db.js').StoredFile} StoredFile
 * @typedef {{ p: string, s: number, m: ResEntry[] }} ResBundle a bundle of the list (sanitizeBundles)
 * @typedef {{ b: ResBundle, left: Map<string, ResEntry>, prio: number }} BundleJob a bundle to read (bundleJobs)
 * @typedef {{ total: number, left: number }} GroupSize
 * @typedef {{ consent: 'yes' | 'later', at: number }} ResConsent the saved answer of the consent card (PREF)
 * @typedef {{ phase: string, done: number, total: number, bytesDone: number, bytesTotal: number, failed: number,
 *   error: string | null, pendingBytes: number, sizes: Record<string, GroupSize>, chosen: Record<string, boolean>,
 *   paused: Record<string, boolean>, runGroups: string[], illust: Record<string, number> | null }} ResState
 */

/**
 * phase: off | idle | ask | running | done | error. sizes: bytes per group of this browser's list — '' the files in no
 * pack, else a pack's name — `{ total, left }` (left: not cached with the listed hash; sizesOf). chosen: the pack choice
 * (resourcePacks). paused: the packs paused on this page (pauseResourcePack). runGroups: the groups the running download
 * holds files of. illust: what the original-resolution 立绘 cost over the 1024 ones, bytes per group (illustDiff), null when
 * the list has no pair.
 */
export const resStore = createStore(/** @type {ResState} */ ({ phase: 'off', done: 0, total: 0, bytesDone: 0, bytesTotal: 0, failed: 0, error: null, pendingBytes: 0,
  sizes: {}, chosen: {}, paused: {}, runGroups: [], illust: null }));
const setPending = () => resStore.set({ pendingBytes: pending.reduce((n, f) => n + f.s, 0), sizes: sizesOf() });


const BUNDLE_RE = /^\/assets\/bundles\/[A-Za-z0-9_.-]+\.pack$/;

/**
 * The bundles the list names (tools/assets/resource-bundles.mjs): `{ p, s, m }` with `m` indices into the list's own
 * `files` (before validEntry filters it), ascending = the order the members' bytes follow one another. A bundle is kept
 * only when its path is a bundle path, every member is a valid entry of this server (no `u`) and the sizes add up to `s`
 * (the cut needs them all). Members become the entries themselves.
 * @param {unknown} raw @param {unknown[]} files the list's `files` as it came
 * @returns {{ p: string, s: number, m: { p: string, s: number, h: string }[] }[]}
 */
export function sanitizeBundles(raw, files) {
  if (!Array.isArray(raw) || !Array.isArray(files)) return [];
  const out = [];
  for (const b of raw) {
    if (!b || typeof b.p !== 'string' || !BUNDLE_RE.test(b.p) || !validPath(b.p) || !Number.isInteger(b.s) || !Array.isArray(b.m) || b.m.length < 2) continue;
    let prev = -1, sum = 0, ok = true;
    const m = [];
    for (const i of b.m) {
      const f = Number.isInteger(i) && i > prev ? files[i] : null;
      if (!validEntry(f) || f.u !== undefined) { ok = false; break; }
      prev = i; sum += f.s; m.push(f);
    }
    if (ok && sum === b.s) out.push({ p: b.p, s: b.s, m });
  }
  return out;
}

/** The packs the list names, `{ <pack>: [path prefix…] }`: a prefix is '/assets/…/' (anything else is ignored). @param {unknown} raw */
export function sanitizePacks(raw) {
  /** @type {Record<string, string[]>} */
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, prefixes] of Object.entries(raw)) {
    const ok = Array.isArray(prefixes) ? prefixes.filter((x) => typeof x === 'string' && x.endsWith('/') && validPath(x + 'x')) : [];
    if (/^[a-z]+$/.test(name) && ok.length) out[name] = ok;
  }
  return out;
}

/**
 * The pack a listed path belongs to, or null (most files: in no pack).
 * @param {string} p @param {Record<string, string[]> | null | undefined} packs
 */
export function packOf(p, packs) {
  for (const [name, prefixes] of Object.entries(packs || {})) if (prefixes.some((x) => p.startsWith(x))) return name;
  return null;
}

/** Whether the background download takes a list entry: a file in no pack always, a pack's file only when the player
 *  chose that pack (`chosen[pack] === true`). Voice files are filtered before this (voice.js wantedFiles).
 *  @param {{ p: string }} f @param {Record<string, string[]> | null | undefined} packs
 *  @param {Record<string, boolean> | null | undefined} chosen */
export const resourceWanted = (f, packs, chosen) => { const pack = packOf(f.p, packs); return !pack || chosen?.[pack] === true; };

/** Whether the cache keeps a list entry it holds with the listed hash: everything but the files of a pack the player
 *  turned off (`chosen[pack] === false`).
 *  @param {{ p: string }} f @param {Record<string, string[]> | null | undefined} packs
 *  @param {Record<string, boolean> | null | undefined} chosen */
export const resourceKept = (f, packs, chosen) => { const pack = packOf(f.p, packs); return !pack || chosen?.[pack] !== false; };

/**
 * What the 立绘's original-resolution copies cost over the 1024 ones, from the list: bytes per group ('' the files in no
 * pack, else a pack's name) of the files marked 'hi' minus those marked 'lo' — null when the list has no pair (nothing
 * to choose). The resource tab's note says it (never a hand-written number).
 * @param {{ p: string, s: number, r?: string }[]} files @param {Record<string, string[]>} packsOf
 */
export function illustDiff(files, packsOf) {
  /** @type {Record<string, number>} */
  const out = {};
  let pairs = false;
  for (const f of files) {
    if (f.r !== 'hi' && f.r !== 'lo') continue;
    pairs = true;
    const g = packOf(f.p, packsOf) ?? '';
    out[g] = (out[g] || 0) + (f.r === 'hi' ? f.s : -f.s);
  }
  return pairs ? { '': 0, ...out } : null;
}

/** @param {unknown} raw @returns {Record<string, boolean>} */
const sanitizeChoice = (raw) => Object.fromEntries(Object.entries(raw && typeof raw === 'object' ? raw : {}).filter(([, v]) => typeof v === 'boolean'));

/** Download order: what the screens show first (UI, portraits, icons, board) before models, then audio. @param {string} p */
export function priorityOf(p) {
  if (p.startsWith('/img/')) return 0;
  const rel = p.slice('/assets/'.length);
  if (/^(ui|local\/ui|local\/emoticon|emotes)\//.test(rel)) return 0;
  if (/^(char|item|skill|bond|band|prof|enemy|token)\//.test(rel)) return 1;
  if (/^local\/(map|mesh|module)\//.test(rel)) return 2;
  if (/^(spine|local\/spine)\//.test(rel)) return 3;
  if (/^audio\//.test(rel)) return 5;
  return 4;
}

/** @type {Record<string, string>} */
const TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  json: 'application/json', atlas: 'text/plain', txt: 'text/plain', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac' };
const typeOf = (/** @type {string} */ p) => TYPES[p.slice(p.lastIndexOf('.') + 1).toLowerCase()] || 'application/octet-stream';

/** @param {BufferSource} buf */
async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (const b of d) s += b.toString(16).padStart(2, '0');
  return s;
}

/** The name of a thrown error (a DOMException's: QuotaExceededError, AbortError…), or undefined. @param {unknown} err */
const errName = (err) => (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string' ? err.name : undefined);

const supported = () => typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && typeof indexedDB !== 'undefined' && !!crypto?.subtle;

/** @type {{ version?: unknown, files: ResEntry[], bundles?: unknown, packs?: unknown } | null} */
let index = null;
/** @type {ResEntry[]} */
let listed = [];        // every valid entry of the list; index.files = the ones this browser downloads (voice language, packs)
/** @type {Record<string, string[]>} */
let packs = {};         // the list's packs (sanitizePacks)
/** @type {ResBundle[]} */
let bundles = [];       // the list's bundles (sanitizeBundles)
let bundleCounts = { fetched: 0, stopped: 0, failed: 0, members: 0 }; // for the report: bundles read whole / cut short / failed, files stored from them
let chosen = sanitizeChoice(loadPref(PACKS_PREF, null)); // the player's pack choice
resStore.set({ chosen: { ...chosen } });
/** @type {Record<string, boolean>} */
let paused = {};        // packs paused on this page: { <pack>: true }
/** @type {ResEntry[]} */
let voiced = [];        // the listed entries of this browser's voice language (choose)
let again = false;      // a choice changed during a download: resync once it ends
/** @type {Promise<IDBDatabase> | null} */
let dbOpening = null;  // the resource database (resource-db.js): opened on the first use after install(), again after it closed
const getDb = () => (dbOpening ||= openResourceDb(() => { dbOpening = null; }).catch((err) => { dbOpening = null; throw err; }));
/** @type {string[]} */
let oldCaches = [];    // the caches of the versions before that still exist (resource-entries.js OLD_CACHES): migrate()
/** @type {Record<string, string>} */
let oldState = {};     // path → hash of the files the old record (OLD_STATE) names with the listed hash, until moved
/** @type {Record<string, string>} */
let state = {};        // path → hash of the files the database holds with the hash the list names
/** @type {Record<string, { h: string, at: number }>} */
let differ = {};       // DIFFER's content
let differChanged = false;
/** @type {Map<string, string>} */
let want = new Map();  // path → listed hash of the files the store keeps (resourceKept): anything else is stale
/** @type {ResEntry[]} */
let pending = [];
/** @type {string[]} */
let stale = [];        // stored paths to delete (cleanup)
/** @type {import('./diag.js').ReconcileStatus | null} */
let reconciled = null; // the last reconcile, for the report (diag.js): { at, ms, keys: stored files, stale, adopted } (running: no ms,
                       // `step` the stage it is in), and where its time went: `open` the database, `read` its hashes, `old` caches
                       // adopted stays 0: the database records each file with its hash, the worker's too, so none is adopted
let deleted = 0;
/** @type {import('./diag.js').WorkerStatus | null} */
let worker = null;     // the worker's answer the report last read: { at, hit, stale, fetched, bytes, server, unstored, db }

async function saveDiffer() {
  if (!differChanged) return;
  differChanged = false;
  await writeMeta(await getDb(), DIFFER, differ);
}

/** Still to download: not stored with the listed hash (nor still in an old cache to move), and not an upstream file
 *  recorded as drifted (DIFFER). */
const missing = (/** @type {ResEntry} */ f) => state[f.p] !== f.h && oldState[f.p] !== f.h && differ[f.p]?.h !== f.h;
const todo = () => /** @type {NonNullable<typeof index>} */ (index).files.filter(missing).sort((a, b) => priorityOf(a.p) - priorityOf(b.p));

/** The group of a listed file: its pack's name, '' for a file in no pack. */
const groupOf = (/** @type {ResEntry} */ f) => packOf(f.p, packs) ?? '';

/** Bytes per group of this browser's list, chosen or not: `total`, and `left` — what is still missing (a pack never
 *  chosen counts what the game fetched on demand as cached). The settings' 资源 tab shows them apart. */
function sizesOf() {
  /** @type {Record<string, GroupSize>} */
  const out = { '': { total: 0, left: 0 } };
  for (const name of Object.keys(packs)) out[name] = { total: 0, left: 0 };
  for (const f of voiced) {
    const g = out[groupOf(f)];
    g.total += f.s;
    if (missing(f)) g.left += f.s;
  }
  return out;
}

/** `sizes` once a file of its group is cached. */
const spend = (/** @type {Record<string, GroupSize>} */ sizes, /** @type {ResEntry} */ f) => {
  const g = groupOf(f), c = sizes?.[g];
  return c ? { ...sizes, [g]: { ...c, left: Math.max(0, c.left - f.s) } } : sizes;
};

/** A file of a pack paused on this page and still wanted: the download leaves it in the queue. */
const held = (/** @type {ResEntry} */ f) => { const p = packOf(f.p, packs); return !!p && paused[p] === true && resourceWanted(f, packs, chosen); };

const now = () => globalThis.performance?.now?.() ?? Date.now();
const keyOf = (/** @type {Request} */ req) => {
  const p = new URL(req.url).pathname;
  try { return decodeURIComponent(p); } catch { return p; }
};

/** The voice files of this browser's language (voice.js) and the 立绘 copies of this device (illust-res.js), then the
 *  pack choice: index.files is what is downloaded, the returned list what the store keeps. */
function choose() {
  voiced = wantedFiles(listed).filter((f) => illustListed(f));
  /** @type {NonNullable<typeof index>} */ (index).files = voiced.filter((f) => resourceWanted(f, packs, chosen));
  return voiced.filter((f) => resourceKept(f, packs, chosen));
}

/** Read what the database holds (every path's hash at once, no bytes): the stored files that are not (or no longer) the
 *  listed file are left for cleanup(); returns the files still to download. Cheap enough for every load (36 thousand
 *  hashes), so there is no mark that skips it. */
async function reconcile() {
  const t0 = now();
  const at = Date.now();
  reconciled = { at, ms: null, keys: 0, stale: 0, adopted: 0, step: 'open' };
  const db = await getDb();
  const tOpen = now();
  reconciled.step = 'read';
  const stored = await readHashes(db);
  want = new Map(choose().map((f) => [f.p, f.h]));
  const d = await readMeta(db, DIFFER);
  differ = d && typeof d === 'object' ? /** @type {typeof differ} */ (d) : {};
  for (const [p, x] of Object.entries(differ)) {
    if (want.get(p) !== x?.h || !(Date.now() - x.at < DIFFER_RETRY_MS)) { delete differ[p]; differChanged = true; }
  }
  await saveDiffer();
  const nDiffer = Object.keys(differ).length;
  const tRead = now();
  reconciled.step = 'old caches';
  state = {};
  /** @type {string[]} */
  const found = [];
  for (const [p, h] of stored) { if (want.get(p) === h) state[p] = h; else found.push(p); }
  stale = found;
  await findOld();
  const t1 = now();
  reconciled = { at, ms: t1 - t0, keys: stored.size, stale: found.length, adopted: 0, differ: nDiffer, open: tOpen - t0, read: tRead - tOpen, old: t1 - tRead };
  housekeep();
  return todo();
}

/** The caches of the versions before that still exist, and what their record says they hold with the listed hash (those
 *  files are not to download: migrate() moves them, the worker serves them from there meanwhile). */
async function findOld() {
  oldCaches = [];
  oldState = {};
  if (typeof caches === 'undefined') return;
  for (const name of OLD_CACHES) { try { if (await caches.has(name)) oldCaches.push(name); } catch { /* none */ } }
  for (const name of [OLD_META_CACHE, OLD_SINGLE_CACHE]) {
    if (!oldCaches.includes(name)) continue;
    try {
      const rec = await (await caches.match(OLD_STATE, { cacheName: name }))?.json();
      if (!rec || typeof rec !== 'object') continue;
      for (const [p, h] of Object.entries(rec)) if (typeof h === 'string' && want.get(p) === h && state[p] !== h) oldState[p] = h;
      break;
    } catch { /* no record: what the old caches hold is found by their keys */ }
  }
}

const inMatch = () => selectRoute(store.get()) === 'game';

/** The background work after a reconcile, one at a time: the old caches first (migrate), then the stale entries. */
let housekeeping = false;
async function housekeep() {
  if (housekeeping) return;
  housekeeping = true;
  try { await migrate(); noteWorker(); await cleanup(); } finally { housekeeping = false; }
}

/** The old caches' files that the list names with their listed hash, moved into the database, CLEAN_CHUNK at a time —
 *  never while a field loads or a match is on screen (the worker serves from the old caches meanwhile) — and each old
 *  copy deleted as it goes (the storage never holds much of the list twice); then the caches themselves. A cache's keys
 *  where the browser gives them; where Chrome refuses them (the single cache that grew too large), the listed paths that
 *  cache could hold, one by one: whatever else it held goes with the cache. What the old record named but no cache
 *  still held (deleted by something else meanwhile) is downloaded again: a resync once it is over. */
let moved = 0, migrateLeft = 0, migrateLost = 0;
async function migrate() {
  if (!oldCaches.length) return;
  try {
    const db = await getDb();
    for (const name of oldCaches.slice()) {
      if (name === OLD_META_CACHE) continue;
      const c = await caches.open(name);
      /** @type {string[]} */
      let paths;
      try { paths = (await c.keys()).map(keyOf); } catch { paths = [...want.keys()].filter((p) => name === OLD_SINGLE_CACHE || OLD_SHARD_NAMES[oldShardOf(p)] === name); }
      paths = paths.filter((p) => !OLD_RECORD.test(p));
      migrateLeft += paths.length;
      while (paths.length) {
        if (inMatch() || fieldLoading()) { await sleep(HOLD_POLL_MS); continue; }
        const chunk = paths.splice(0, CLEAN_CHUNK);
        await moveOld(db, c, chunk);
        migrateLeft -= chunk.length;
        await sleep(CLEAN_REST_MS);
      }
      await caches.delete(name);
      oldCaches = oldCaches.filter((n) => n !== name);
      setPending();
    }
    await caches.delete(OLD_META_CACHE);
    oldCaches = [];
    migrateLost += Object.keys(oldState).length;
    oldState = {};
    if (migrateLost) resync();
  } catch (err) {
    console.warn('[resources] migrate', err); // the rest is moved on the next visit
  }
}

/** Move the paths of one old cache that hold the listed hash into the database (one transaction), and delete every one
 *  of them from the old cache. @param {IDBDatabase} db @param {Cache} c @param {string[]} paths */
async function moveOld(db, c, paths) {
  /** @type {Array<{ p: string } & StoredFile>} */
  const items = [];
  for (const p of paths) {
    const w = want.get(p);
    if (!w || state[p] === w) continue;
    const hit = await c.match(p);
    if (hit?.headers.get('X-SP-Hash') === w) items.push({ p, h: w, t: hit.headers.get('Content-Type') || typeOf(p), b: await hit.arrayBuffer() });
  }
  if (items.length) await putFiles(db, items);
  for (const f of items) { state[f.p] = f.h; delete oldState[f.p]; }
  moved += items.length;
  for (const p of paths) {
    await c.delete(p);
    if (oldState[p]) { delete oldState[p]; migrateLost++; } // the record named it, the cache held another copy
  }
}

/** Whether the database holds the listed file `f` (the worker stored it on demand), or an old cache does — then it is
 *  moved now (migrate deletes the old copy with its cache). @param {ResEntry} f */
async function holds(f) {
  const db = await getDb();
  if ((await hashOf(db, f.p)) === f.h) return true;
  for (const name of [OLD_SHARD_NAMES[oldShardOf(f.p)], OLD_SINGLE_CACHE]) {
    if (!oldCaches.includes(name)) continue;
    const hit = await caches.match(f.p, { cacheName: name }); // never creates the cache, unlike caches.open
    if (hit?.headers.get('X-SP-Hash') !== f.h) continue;
    await putFiles(db, [{ p: f.p, h: f.h, t: hit.headers.get('Content-Type') || typeOf(f.p), b: await hit.arrayBuffer() }]);
    delete oldState[f.p];
    moved++;
    return true;
  }
  return false;
}

/** Delete the stale entries reconcile() listed, CLEAN_CHUNK at a time, never while a match is on screen. An entry the
 *  download or the worker replaced with the listed file since is kept (dropFiles looks again inside its transaction). */
let cleaning = false, dropping = 0;
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  try {
    const db = await getDb();
    while (stale.length) {
      if (inMatch()) { await sleep(HOLD_POLL_MS); continue; }
      const chunk = stale.splice(0, CLEAN_CHUNK);
      dropping = chunk.length; // still left for the report until its transaction is over
      const { deleted: gone, kept } = await dropFiles(db, chunk.map((p) => [p, want.get(p)]));
      dropping = 0;
      deleted += gone.length;
      for (const p of kept) state[p] = /** @type {string} */ (want.get(p));
      if (kept.length && !running) { pending = pending.filter(missing); setPending(); } // stored meanwhile: no longer to download
      await sleep(CLEAN_REST_MS);
    }
  } catch (err) {
    console.warn('[resources] cleanup', err); // what is left is listed again on the next visit
  } finally {
    dropping = 0;
    cleaning = false;
  }
}

/** @param {ResEntry} f */
async function fetchOne(f) {
  // the worker may have stored it on demand since the list was made (the game needed it first): adopt, no download
  if (await holds(f)) { state[f.p] = f.h; return true; }
  let last = 'no source';
  const urls = sourcesOf(f);
  let differs = typeof f.u === 'string' && urls.length > 0; // every source answered, with other bytes
  for (const url of urls) {
    try {
      const external = !url.startsWith('/');
      const res = await fetch(external ? url : url + PAST_WORKER,
        { cache: 'no-store', ...(external ? { mode: 'cors', credentials: 'omit' } : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) { last = `HTTP ${res.status}`; differs = false; continue; }
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.s || (await sha256(buf)) !== f.h) { last = 'hash mismatch'; continue; }
      differs = false;
      await putFiles(await getDb(), [{ p: f.p, h: f.h, t: typeOf(f.p), b: buf }]);
      state[f.p] = f.h;
      return true;
    } catch (err) {
      if (errName(err) === 'QuotaExceededError') throw err;
      last = errName(err) || String(err);
      differs = false;
    }
  }
  if (differs) {
    differ[f.p] = { h: f.h, at: Date.now() };
    differChanged = true;
    console.warn('[resources]', f.p, 'changed in its asset repo (hash mismatch); not tried again until the list changes');
  } else console.warn('[resources]', f.p, last);
  return false;
}

/** Files downloaded at once outside a match (the file queue is mostly jsDelivr and GitHub raw once the bundles hold this
 *  server's files): the workers of download() and limit() both come from it, so raising it raises both. 8 was measured
 *  against 4, 6 and 12 (2026-11-17): the most files per second; 12 was slower in the browser. */
export const FILE_SLOTS = 8;
/** Parallel downloads: none while a field loads, one while a match is on screen, so the game keeps the bandwidth and
 *  the Cache Storage. */
const limit = () => (fieldLoading() ? 0 : inMatch() ? 1 : FILE_SLOTS);
/** Bundles read at once: two outside a match, none while a field loads or a match is on screen (a bundle being read
 *  then is cut short: the game keeps this server's bandwidth, and a match takes files one at a time as before). */
const bundleLimit = () => (fieldLoading() || inMatch() ? 0 : 2);
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** The bytes of a bundle job's members still to store. */
const leftBytes = (/** @type {BundleJob} */ job) => { let n = 0; for (const f of job.left.values()) n += f.s; return n; };
/** A bundle is read only for at least two of its files and half its bytes: else the files one by one cost less. */
const worth = (/** @type {BundleJob} */ job) => job.left.size >= 2 && leftBytes(job) * 2 >= job.b.s;

/**
 * The bundle jobs of a download queue, highest priority first: `left` = the members still in the queue, path → entry.
 * @param {ResEntry[]} queue
 */
function bundleJobs(queue) {
  if (!bundles.length) return [];
  const inQueue = new Map(queue.map((f) => [f.p, f]));
  /** @type {BundleJob[]} */
  const jobs = [];
  for (const b of bundles) {
    /** @type {Map<string, ResEntry>} */
    const left = new Map();
    for (const f of b.m) { const q = inQueue.get(f.p); if (q && q.h === f.h) left.set(f.p, q); }
    const job = { b, left, prio: 0 };
    if (!worth(job)) continue;
    job.prio = Math.min(...[...left.keys()].map(priorityOf));
    jobs.push(job);
  }
  return jobs.sort((x, y) => x.prio - y.prio);
}

/**
 * Read one bundle (its members' bytes one after another, tools/assets/resource-bundles.mjs) and hand each member to
 * `store` as soon as its bytes are in, cut by the list's sizes: a cut-short read keeps what it stored. Stops when
 * bundleLimit() drops to 0 (a field loads, a match) or nothing arrives for TIMEOUT_MS.
 * @param {BundleJob} job @param {(f: ResEntry, bytes: Uint8Array<ArrayBuffer>) => Promise<void>} store
 * @returns {Promise<'fetched' | 'stopped' | 'failed'>}
 */
async function readBundle(job, store) {
  const { b } = job;
  const ctrl = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let idle;
  /** @type {string | null} */
  let why = null;
  const quiet = () => { clearTimeout(idle); idle = setTimeout(() => { why = 'timeout'; ctrl.abort(); }, TIMEOUT_MS); };
  const watch = setInterval(() => { if (!bundleLimit()) { why = 'stopped'; ctrl.abort(); } }, HOLD_POLL_MS);
  const buf = new Uint8Array(b.s);
  let got = 0, i = 0, at = 0, end = b.m[0].s; // bytes in; the member being cut, its start and end
  const cut = async () => {
    while (i < b.m.length && got >= end) {
      const f = b.m[i];
      if (job.left.has(f.p)) await store(/** @type {ResEntry} */ (job.left.get(f.p)), buf.subarray(at, end));
      i++;
      at = end;
      if (i < b.m.length) end += b.m[i].s;
    }
  };
  try {
    quiet();
    const res = await fetch(b.p, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body?.getReader?.();
    const take = async (/** @type {Uint8Array} */ value) => {
      quiet();
      if (got + value.byteLength > b.s) throw new Error('longer than listed');
      buf.set(value, got);
      got += value.byteLength;
      await cut();
    };
    if (!reader) await take(new Uint8Array(await res.arrayBuffer()));
    else for (let r = await reader.read(); !r.done; r = await reader.read()) await take(r.value);
    if (got !== b.s) throw new Error('shorter than listed');
    return 'fetched';
  } catch (err) {
    if (errName(err) === 'QuotaExceededError') throw err;
    if (why === 'stopped') return 'stopped';
    console.warn('[resources]', b.p, why || (err instanceof Error && err.message) || errName(err) || String(err));
    return 'failed';
  } finally {
    clearTimeout(idle);
    clearInterval(watch);
    ctrl.abort(); // a read that threw leaves no request running
  }
}

let running = false;
/** @param {ResEntry[]} [files] */
async function download(files = pending) {
  if (running || !files.length) return;
  running = true;
  const queue = files.slice();
  const bytesTotal = queue.reduce((n, f) => n + f.s, 0);
  resStore.set({ phase: 'running', done: 0, total: queue.length, bytesDone: 0, bytesTotal, failed: 0, error: null,
    runGroups: [...new Set(queue.map(groupOf))] });
  const settle = (/** @type {ResEntry} */ f, /** @type {boolean} */ ok) => {
    resStore.set((s) => ({ done: s.done + 1, bytesDone: s.bytesDone + f.s, failed: s.failed + (ok ? 0 : 1), sizes: ok ? spend(s.sizes, f) : s.sizes }));
  };
  const skip = (/** @type {ResEntry} */ f) => resStore.set((s) => ({ done: s.done + 1, bytesDone: s.bytesDone + f.s })); // turned off meanwhile
  // the bundles first (bundleJobs): their members leave the file queue while a bundle job holds them, and come back to it
  // (in priority order) when the job is given up — a failed or not-worth bundle, a member whose bytes did not match
  const jobs = bundleJobs(queue);
  const release = (/** @type {BundleJob[]} */ given) => {
    let back = 0;
    for (const job of given) for (const f of job.left.values()) { queue.push(f); back++; }
    if (back) queue.sort((a, b) => priorityOf(a.p) - priorityOf(b.p));
  };
  if (jobs.length) {
    const owned = new Set(jobs.flatMap((j) => [...j.left.keys()]));
    let k = 0;
    for (const f of queue) if (!owned.has(f.p)) queue[k++] = f;
    queue.length = k;
  }
  let reading = 0;
  /** @param {BundleJob} job @param {ResEntry} f @param {Uint8Array<ArrayBuffer>} bytes */
  const storeMember = async (job, f, bytes) => {
    if (!resourceWanted(f, packs, chosen)) { job.left.delete(f.p); skip(f); return; }
    if ((await sha256(bytes)) !== f.h) { console.warn('[resources]', f.p, 'hash mismatch in', job.b.p); return; } // fetched as a file
    // a copy of the member's bytes alone: the view into the bundle's buffer would store the whole bundle (resource-db.js putFiles)
    await putFiles(await getDb(), [{ p: f.p, h: f.h, t: typeOf(f.p), b: bytes.slice().buffer }]);
    state[f.p] = f.h;
    job.left.delete(f.p);
    bundleCounts.members++;
    settle(f, true);
  };
  const bundleSlot = async (/** @type {number} */ slot) => {
    while (jobs.length) {
      if (slot >= bundleLimit()) { await sleep(HOLD_POLL_MS); continue; }
      const k = jobs.findIndex((j) => ![...j.left.values()].some(held));
      if (k < 0) { release(jobs.splice(0)); break; } // only a paused pack's bundles: their files wait in the queue
      const [job] = jobs.splice(k, 1);
      reading++;
      try {
        for (const f of [...job.left.values()]) {
          if (!resourceWanted(f, packs, chosen)) { job.left.delete(f.p); skip(f); }
          // the worker may have stored it on demand since the list was made: adopt, as fetchOne does
          else if (await holds(f)) { state[f.p] = f.h; job.left.delete(f.p); settle(f, true); }
        }
        if (!worth(job)) { release([job]); continue; }
        const end = await readBundle(job, (f, bytes) => storeMember(job, f, bytes));
        bundleCounts[end]++;
        if (end === 'stopped' && worth(job)) jobs.unshift(job); // read again once the field or the match is over
        else release([job]);
      } finally { reading--; }
    }
  };
  const worker = async (/** @type {number} */ slot) => {
    for (;;) {
      const next = queue.findIndex((f) => !held(f));
      if (next < 0) {
        // nothing free: during a match the bundles wait, so their files go one at a time as before
        if (jobs.length && !bundleLimit() && slot < limit()) { release(jobs.splice(0, 1)); continue; }
        if (jobs.length || reading) { await sleep(HOLD_POLL_MS); continue; }
        break; // only the files of a paused pack are left: the download ends, resuming starts them again
      }
      if (slot >= limit()) { await sleep(HOLD_POLL_MS); continue; }
      const [f] = queue.splice(next, 1);
      if (!resourceWanted(f, packs, chosen)) { skip(f); continue; }
      settle(f, await fetchOne(f));
    }
  };
  try {
    await Promise.all([...Array.from({ length: FILE_SLOTS }, (_, slot) => worker(slot)), ...[0, 1].map(bundleSlot)]);
    await saveDiffer();
    pending = pending.filter(missing);
    setPending();
    resStore.set({ phase: 'done', runGroups: [] });
  } catch (err) {
    console.error('[resources] stopped', err);
    try { await saveDiffer(); } catch { /* ignore */ }
    resStore.set({ phase: 'error', error: errName(err) === 'QuotaExceededError' ? 'quota' : 'failed', runGroups: [] });
  } finally {
    running = false;
    noteWorker();
    if (again) { again = false; resync(); }
  }
}

/** What to download now: everything still to download with the general consent, else the files of the chosen packs. */
const toDownload = () => (/** @type {ResConsent | null} */ (loadPref(PREF, null))?.consent === 'yes' ? pending : pending.filter((f) => packOf(f.p, packs)));

/** The player agreed (consent card): remember it, ask the browser to keep the cache, start. */
export async function acceptResources() {
  savePref(PREF, { consent: 'yes', at: Date.now() });
  try {
    const need = pending.reduce((n, f) => n + f.s, 0);
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && est.quota - (est.usage || 0) < need * 1.1) { resStore.set({ phase: 'error', error: 'quota' }); return; }
    await navigator.storage?.persist?.();
  } catch { /* best effort */ }
  if (running) again = true; // a chosen pack downloading on its own: the rest follows once it ends
  else download();
}

/** 以后再说: ask again in a week. */
export function postponeResources() {
  savePref(PREF, { consent: 'later', at: Date.now() });
  resStore.set({ phase: 'idle' });
}

/** The server has no list (feature turned off): drop the database, the old caches and the worker, so nothing old is ever served. */
async function switchOff() {
  try { await deleteResourceDb(); } catch { /* ignore */ }
  if (typeof caches !== 'undefined') for (const name of OLD_CACHES) { try { await caches.delete(name); } catch { /* ignore */ } }
  try { for (const r of await navigator.serviceWorker.getRegistrations()) if (r.active?.scriptURL?.endsWith('/resource-worker.js')) await r.unregister(); } catch { /* ignore */ }
}

/** @type {(value?: unknown) => void} */
let markKnown = () => {};
/** Settles once installResources has read the list and the cache record, or found there is none (resourceCached is
 *  then as good as it gets on this visit): render/skin-gate.js waits for it before a field's first scene. */
export const resourcesKnown = new Promise((resolve) => { markKnown = resolve; });

/** Register the worker, sync the cache with the list and start (or ask). Never throws. */
export async function installResources() {
  try { await install(); } finally { markKnown(); }
}

async function install() {
  if (!supported()) return;
  dbOpening = null; // a fresh connection for this load
  try {
    const res = await fetch(INDEX, { cache: 'no-cache' });
    if (res.status === 404) { await switchOff(); return; } // no list on this server: everything loads from the server as before
    await navigator.serviceWorker.register('/resource-worker.js', { scope: '/' });
    if (!res.ok) return; // a passing failure: keep serving what is cached, try again on the next visit
    index = await res.json();
    if (!index || !Array.isArray(index.files)) return;
    listed = index.files.filter(validEntry);
    bundles = sanitizeBundles(index.bundles, index.files); // before choose() replaces index.files: `m` indexes the list as it came
    packs = sanitizePacks(index.packs);
    resStore.set({ illust: illustDiff(listed, packs) });
    pending = await reconcile();
    setPending();
    noteWorker();
    if (!pending.length) { resStore.set({ phase: 'done', total: 0 }); return; }
    const pref = /** @type {ResConsent | null} */ (loadPref(PREF, null));
    if (pref?.consent === 'yes') download();
    else if (toDownload().length) download(toDownload());
    else if (pref?.consent === 'later' && Date.now() - pref.at < ASK_AGAIN_MS) resStore.set({ phase: 'idle' });
    else resStore.set({ phase: 'ask', bytesTotal: pending.reduce((n, f) => n + f.s, 0) });
  } catch (err) {
    console.warn('[resources] unavailable', err);
  }
}

/** The voice language, the 立绘 copy or the pack choice changed: only that language's files and that copy are wanted —
 *  the others leave the cache, as do the files of a pack turned off —, the new ones are downloaded when the player agreed
 *  before (a chosen pack's in any case). */
async function resync() {
  if (!index) return;
  if (running) { again = true; return; } // a running download finishes first (it skips a pack turned off), then this
  try {
    pending = await reconcile();
    setPending();
    if (!pending.length) resStore.set({ phase: 'done', total: 0 });
    else if (/** @type {ResConsent | null} */ (loadPref(PREF, null))?.consent === 'yes') download();
    else if (toDownload().length) download(toDownload());
    else if (resStore.get().phase === 'ask') resStore.set({ bytesTotal: pending.reduce((n, f) => n + f.s, 0) }); // card shows the new size
  } catch (err) { console.warn('[resources] resync', err); }
}
onVoiceLangChange(resync);
illustStore.subscribe((s, prev) => { if (s.hi !== prev.hi) resync(); });

/**
 * The player's choice of an optional pack (the settings' resource tab): on downloads its files, off deletes them.
 * @param {string} name @param {boolean} on
 */
export function setResourcePack(name, on) {
  chosen = { ...chosen, [name]: !!on };
  savePref(PACKS_PREF, chosen);
  if (paused[name]) paused = { ...paused, [name]: false }; // chosen again: it downloads
  resStore.set({ chosen: { ...chosen }, paused: { ...paused } });
  return resync();
}

/** Pause (or resume) a chosen pack's download on this page (the resource tab's 暂停 / 继续下载): the download leaves the
 *  pack's files queued and ends once only they are left; resuming starts them again. Not saved: the next visit
 *  downloads as before. @param {string} name @param {boolean} on */
export function pauseResourcePack(name, on) {
  paused = { ...paused, [name]: !!on };
  resStore.set({ paused: { ...paused } });
  if (on || !index) return;
  if (running) again = true; // the workers still running take the pack's files up again; the resync then catches the rest
  else if (toDownload().length) download(toDownload());
}

/** The pack choice: { <pack>: true | false }, a pack never chosen absent. */
export const resourcePacks = () => ({ ...chosen });

/** Whether every path is in the cache as the list names it (render/skin-gate.js: a skin model is drawn only once all of
 *  its files are) — false before the list and the cache record are read, and for a file the cache does not keep. */
export const resourceCached = (/** @type {unknown} */ paths) => !!index && Array.isArray(paths) && paths.length > 0
  && paths.every((p) => typeof p === 'string' && want.has(p) && (state[p] ?? oldState[p]) === want.get(p));

/** The worker's answer counts (resource-worker.js `sp-res-stats`), or null without a worker or an answer in time. */
function askWorker(timeout = 2000) {
  const sw = globalThis.navigator?.serviceWorker?.controller;
  if (!sw || typeof MessageChannel !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => { ch.port1.close(); resolve(null); }, timeout);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      ch.port1.close();
      const d = e.data;
      resolve(d && typeof d === 'object' ? (worker = { at: Date.now(), ...d }) : null);
    };
    sw.postMessage({ t: 'sp-res-stats' }, [ch.port2]);
  });
}
/** Read the worker's counts for the report (after a reconcile, a download, the move of the old caches): the report is
 *  built at once when the player copies it, so the worker's database state is read ahead. */
function noteWorker() { askWorker().catch(() => { /* no answer: the report keeps the last one */ }); }

/** What the report says (diag.js): the last reconcile, the download, the cleanup and the worker's counts. */
export function resourceStatus() {
  const r = resStore.get();
  const running = r.phase === 'running';
  return {
    reconcile: reconciled && { ...reconciled },
    download: { phase: r.phase, done: r.done, total: r.total, failed: r.failed, queued: running ? r.total - r.done : pending.length,
      slowed: running ? (fieldLoading() ? 'field' : inMatch() ? 'match' : null) : null, bundles: { listed: bundles.length, ...bundleCounts } },
    cleanup: { left: stale.length + dropping, deleted, held: stale.length > 0 && inMatch(), ...(oldCaches.length ? { legacyLeft: migrateLeft } : {}), ...(moved ? { moved } : {}) },
    worker: worker && { ...worker },
  };
}
setResourceSource({
  status: resourceStatus,
  // a field mount compares these before and after (diag.js mountTimer)
  snap: async () => {
    const s = resourceStatus();
    return { queued: s.download.queued, cleanup: s.cleanup.left, reconciling: !!s.reconcile && s.reconcile.ms == null, sw: await askWorker() };
  },
});

const mb = (/** @type {number} */ n) => Math.max(1, Math.round(n / 1048576));

/** 立绘画质 [标准 | 高清] (the consent card, the resource tab): the voice language's two-button control; a choice is saved
 *  at once (setIllustFull), so the card's 以后再说 keeps it. */
function IllustChoice() {
  const hi = useStore((s) => s.hi, Object.is, illustStore);
  return html`<div class="set-seg" role="radiogroup" data-testid="illust-res">
    ${/** @type {[boolean, string][]} */ ([[false, t('标准')], [true, t('高清')]]).map(([v, label]) => html`<button key=${v ? 'hi' : 'lo'} type="button" role="radio"
      aria-checked=${hi === v ? 'true' : 'false'} class=${hi === v ? 'is-on' : ''} onClick=${() => setIllustFull(v)}>${label}</button>`)}
  </div>`;
}

/**
 * The resource tab's note under 立绘画质: how much more the original resolution downloads, from the list (illustDiff) —
 * the files in no pack, and the skin data's in a second sentence when the list has the skin pack.
 * @param {Record<string, number>} d
 */
export function illustNote(d) {
  const n = mb(Math.max(0, d[''] || 0));
  const m = d.skin > 0 ? mb(d.skin) : 0;
  return m ? t('高清为原始尺寸，比标准多下载约 {n} MB。如已下载皮肤数据，还会再多 {m} MB。', { n, m }) : t('高清为原始尺寸，比标准多下载约 {n} MB。', { n });
}

/** Consent card (a corner card; a centered dialog on short landscape phones, where every corner holds a button) /
 *  progress pill; hidden during a match (the HUD corners are taken). */
export function ResourceHost() {
  const r = useStore((s) => s, Object.is, resStore);
  const lang = useStore((s) => s.lang, Object.is, voiceStore);
  const route = useStore(selectRoute);
  if (route === 'game') return null;
  if (r.phase === 'ask') {
    return html`<div class="res-ask-wrap"><aside class="res-ask" role="dialog" aria-label=${t('预先下载游戏资源')}>
      <strong>${t('预先下载游戏资源')}</strong>
      <p>${t('下载后图片会立即显示，不会延迟出现。建议使用 Wi-Fi。')}</p>
      <div class="res-ask__lang"><span>${t('干员语音')}</span><div class="set-seg" role="radiogroup">
        ${VOICE_LANGS.map(([id, label]) => html`<button key=${id} type="button" role="radio" aria-checked=${lang === id ? 'true' : 'false'}
          class=${lang === id ? 'is-on' : ''} onClick=${() => setVoiceLang(id)}>${voiceLangLabel(id, label)}</button>`)}
      </div></div>
      ${r.illust ? html`<div class="res-ask__lang"><span>${t('立绘画质')}</span><${IllustChoice} /></div>` : null}
      <p class="res-ask__size num" data-i18n-skip="">${mb(r.bytesTotal)} MB</p>
      <div class="res-ask__btns">
        <button type="button" class="res-ask__yes" onClick=${acceptResources}>${t('下载')}</button>
        <button type="button" class="res-ask__no" onClick=${postponeResources}>${t('以后再说')}</button>
      </div>
      <p class="res-ask__note">${t('不预先下载时，游戏会在需要时逐个下载并保存在此浏览器中。')}</p>
    </aside></div>`;
  }
  if (r.phase === 'running') {
    const pct = r.bytesTotal ? Math.floor((r.bytesDone / r.bytesTotal) * 100) : 0;
    return html`<div class="res-pill" role="status"><span>${t('资源下载中')}</span> <b class="num" data-i18n-skip="">${pct}%</b></div>`;
  }
  if (r.phase === 'error') {
    return html`<div class="res-pill is-err" role="status">${r.error === 'quota' ? t('浏览器存储空间不足，无法预先下载资源') : t('资源下载中断，下次进入时继续')}</div>`;
  }
  return null;
}

const mbOf = (/** @type {number} */ n) => Math.round(n / 1048576);
const pctOf = (/** @type {GroupSize} */ g) => (g.total ? Math.floor(((g.total - g.left) / g.total) * 100) : 0);

/** Settings → 资源 「预先下载资源」 (ui/settings.js): the files in no pack — their state and size, and a button that starts
 *  or retries the download —, then 立绘画质 (IllustChoice, with illustNote) when the list has 立绘 pairs. A chosen pack's
 *  files are the skin rows' (SkinPackSetting). Hidden where the feature is off (plain http, no list on the server). */
export function ResourceSetting() {
  const r = useStore((s) => s, Object.is, resStore);
  if (r.phase === 'off') return null;
  const g = r.sizes[''] || { total: 0, left: 0 };
  const running = r.phase === 'running' && r.runGroups.includes('');
  return html`<div class="res-group">GAME</div>
  <div class="set-row res-set" data-testid="res-general">
    <span class="set-row__label">${t('预先下载资源')}<${MicroLabel}>RESOURCES<//></span>
    <div class="res-set__body">
      ${running
        ? html`<span class="res-set__state"><span>${t('资源下载中')}</span> <b class="num" data-i18n-skip="">${pctOf(g)}%</b></span>`
        : g.left > 0
          ? html`<button type="button" class="res-set__btn" onClick=${acceptResources}>
              <span>${r.phase === 'error' || r.failed ? t('重新下载') : t('下载')}</span> <span class="num" data-i18n-skip="">${mb(g.left)} MB</span></button>`
          : html`<span class="res-set__state is-done">${t('已全部下载')}</span><span class="res-set__size num" data-i18n-skip="">${mb(g.total)} MB</span>`}
      ${r.phase === 'error' ? html`<span class="res-set__err">${r.error === 'quota' ? t('浏览器存储空间不足，无法预先下载资源') : t('资源下载中断，下次进入时继续')}</span>` : null}
    </div>
  </div>
  <p class="set-hint res-set__hint">${t('下载战场、干员、特效和语音等全部资源。新赛季加入时一并下载。语音语言在「声音」标签中选择。')}</p>
  ${r.illust ? html`<div class="set-row res-set" data-testid="res-illust">
    <span class="set-row__label">${t('立绘画质')}<${MicroLabel}>ILLUSTRATION<//></span>
    <div class="res-set__body"><${IllustChoice} /></div>
  </div>
  <p class="set-hint res-set__hint">${illustNote(r.illust)}</p>` : null}`;
}

/**
 * What the skin row shows, from resStore: 'off' (not chosen), 'running' (its files downloading), 'paused' (paused on this
 * page with files left), 'left' (chosen, files left, no download of them now — a failure is tried on the next visit),
 * 'done' (every file cached).
 * @param {{ sizes: Record<string, { total: number, left: number }>, chosen: Record<string, boolean>, paused: Record<string, boolean>, phase: string, runGroups: string[] }} r
 */
export function skinPackState(r, name = 'skin') {
  const g = r.sizes[name];
  if (r.chosen[name] !== true) return 'off';
  if (!(g?.left > 0)) return 'done';
  if (r.paused[name] === true) return 'paused';
  return r.phase === 'running' && r.runGroups.includes(name) ? 'running' : 'left';
}

/**
 * Settings → 资源 「皮肤数据」 and 「其他玩家的皮肤」 (ui/settings.js; the approved layout of the resource packs' plan): the
 * skin pack turned on (downloads it, resourceWanted) or off (deletes it, resourceKept), its download's progress with a
 * pause for this page, and the switch that draws the skins other players chose — usable once the pack is chosen. Hidden
 * when the list has no skin pack.
 * @param {{ others: boolean, onOthers: (on: boolean) => void }} props
 */
export function SkinPackSetting({ others, onOthers }) {
  const r = useStore((s) => s, Object.is, resStore);
  const g = r.sizes.skin;
  if (r.phase === 'off' || !g) return null;
  const st = skinPackState(r);
  const on = st !== 'off';
  const toggle = html`<button type="button" class=${`set-toggle${on ? ' is-on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'}
    data-testid="skin-pack" onClick=${() => setResourcePack('skin', !on)}><i></i><span>${on ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>`;
  const progress = (/** @type {string} */ label) => html`<span class="res-set__state"><span>${label}</span> <b class="num" data-i18n-skip="">${pctOf(g)}%</b></span>
    <span class="res-set__bar" aria-hidden="true"><i style=${`width:${pctOf(g)}%`}></i></span>
    <span class="res-set__size num" data-i18n-skip="">${mbOf(g.total - g.left)} / ${mb(g.total)} MB</span>`;
  const pause = (/** @type {boolean} */ stop) => html`<button type="button" class="res-set__mini" data-testid="skin-pause"
    onClick=${() => pauseResourcePack('skin', stop)}>${stop ? t('暂停') : t('继续下载')}</button>`;
  return html`<div class="res-group">SKIN</div>
  <div class="set-row res-set" data-testid="res-skin">
    <span class="set-row__label">${t('皮肤数据')}<${MicroLabel}>SKIN<//></span>
    <div class="res-set__body">
      ${st === 'off' ? html`${toggle}<span class="res-set__size">${t('约 {n} MB', { n: mb(g.total) })}</span>`
        : st === 'running' ? html`${progress(t('皮肤下载中'))}${pause(true)}`
          : st === 'paused' ? html`${toggle}${progress(t('皮肤下载已暂停'))}${pause(false)}`
            : st === 'left' ? html`${toggle}<span class="res-set__size num" data-i18n-skip="">${mbOf(g.total - g.left)} / ${mb(g.total)} MB</span>`
              : html`${toggle}<span class="res-set__size num" data-i18n-skip="">${mb(g.total)} MB</span>`}
    </div>
  </div>
  <p class="set-hint res-set__hint">${st === 'off' ? t('下载后可以选择自己的皮肤，也能看到其他玩家选择的皮肤。不下载时所有人都显示为默认皮肤。')
    : st !== 'done' ? t('下载完成前显示为默认皮肤，下载完成后从下一场战斗开始显示皮肤。')
      : t('关闭后删除已下载的皮肤数据，所有人都显示为默认皮肤。')}</p>
  <div class="set-row res-set" data-testid="res-others">
    <span class="set-row__label">${t('其他玩家的皮肤')}<${MicroLabel}>OTHERS<//></span>
    <div class="res-set__body">
      <button type="button" class=${`set-toggle${others ? ' is-on' : ''}`} role="switch" aria-checked=${others ? 'true' : 'false'} disabled=${!on}
        onClick=${() => onOthers(!others)}><i></i><span>${others ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
    </div>
  </div>
  <p class="set-hint res-set__hint">${on ? t('关闭后其他玩家显示为默认皮肤，自己的皮肤照常显示。') : t('下载皮肤数据后可用。')}</p>`;
}

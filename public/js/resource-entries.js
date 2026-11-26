// public/js/resource-entries.js — which entries of the resource list (/assets/browser-resources.json) the page acts on,
// and where it downloads each from. No imports: tools/build-browser-resources.mjs runs these same checks on the server,
// where the page's other modules (the UI and its vendored libraries) are not installed. public/js/resources.js
// re-exports them.

const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;
const JSDELIVR_RE = /^https:\/\/cdn\.jsdelivr\.net\/gh\//;

/**
 * Download URLs of one list entry: jsDelivr then GitHub raw for upstream art (jsDelivr has no ArknightsAssets2 voice
 * branch, shared with tools/assets/sources.mjs), this server for everything else.
 * @param {{ p: string, u?: string }} f
 * @returns {string[]}
 */
export function sourcesOf(f) {
  if (typeof f.u !== 'string') return [f.p];
  if (JSDELIVR_RE.test(f.u)) return [f.u];
  const m = RAW_RE.exec(f.u);
  if (!m) return [];
  const [, owner, repo, branch, path] = m;
  const mirror = owner === 'ArknightsAssets' && branch === 'voice' ? null : `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
  return /** @type {string[]} */ ([mirror, f.u].filter(Boolean));
}

/** Paths the list may name: under /assets/ or /img/emotes/, no query / fragment / escapes / backslashes / dot segments. */
const PATH_RE = /^\/(assets|img\/emotes)\/[^?#%\\]+$/;
export const validPath = (/** @type {unknown} */ p) => typeof p === 'string' && PATH_RE.test(p) && !p.split('/').some((seg) => seg === '.' || seg === '..');

/**
 * Where the files are kept: the IndexedDB database DB_NAME (version DB_VERSION) of this origin, three object stores keyed
 * by the file's path — FILES_STORE `{ h: sha256, t: Content-Type, b: ArrayBuffer }` (the bytes), HASHES_STORE the same
 * path's hash alone (the reconcile reads every hash at once without the bytes; both are written and deleted in one
 * transaction), META_STORE the page's records (DIFFER). The page (resource-db.js) and public/resource-worker.js (a classic
 * script with its own copy of these) both create the stores on first open (upgradeResourceDb; test/resource-store.test.js
 * compares them). Not the Cache Storage: code a filter puts into a site's service worker can call `caches.delete()` on
 * every cache of the site (an ad blocker's, on each of its restarts), which made every player who runs it download the
 * whole list again (2026-11-26, docs/rules/render.md 「리소스 저장소는 IndexedDB」).
 */
export const DB_NAME = 'sp-res';
export const DB_VERSION = 1;
export const FILES_STORE = 'files';
export const HASHES_STORE = 'hashes';
export const META_STORE = 'meta';
/** Create the stores a database of an older version (or a new one) lacks. @param {IDBDatabase} db */
export function upgradeResourceDb(db) {
  for (const name of [FILES_STORE, HASHES_STORE, META_STORE]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
}

/**
 * The Cache Storage of the versions before (until 2026-11-26), read only to move its files into the database: the files
 * in OLD_SHARD_NAMES by oldShardOf of the path (Chrome refused `Cache.keys()` on one cache with too many entries,
 * 2026-11-17), the records in OLD_META_CACHE, and before that one cache, OLD_SINGLE_CACHE. Each file there carries its
 * hash in the X-SP-Hash header. The page moves what the list still names and deletes the caches (resources.js migrate);
 * the worker serves from them meanwhile.
 */
export const OLD_SHARDS = 16;
export const OLD_META_CACHE = 'sp-res-meta';
export const OLD_SINGLE_CACHE = 'sp-res';
/** The old shard of a path: FNV-1a over its UTF-16 code units, OLD_SHARDS buckets. @param {string} p */
export function oldShardOf(p) {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193);
  return (h >>> 0) % OLD_SHARDS;
}
/** Every old shard's cache name, by shard. */
export const OLD_SHARD_NAMES = Array.from({ length: OLD_SHARDS }, (_, i) => `sp-res-${i.toString(16)}`);
/** Every cache name of the versions before. */
export const OLD_CACHES = [...OLD_SHARD_NAMES, OLD_META_CACHE, OLD_SINGLE_CACHE];

/** List entries the page will act on: a valid path, a size and a sha256 (anything else is ignored).
 *  @returns {f is { p: string, s: number, h: string, u?: string, r?: string }} */
export function validEntry(/** @type {unknown} */ f) {
  if (!f || typeof f !== 'object') return false;
  const e = /** @type {{ p?: unknown, s?: unknown, h?: unknown, u?: unknown }} */ (f);
  return validPath(e.p) && typeof e.s === 'number' && Number.isInteger(e.s) && e.s >= 0 && typeof e.h === 'string' && /^[0-9a-f]{64}$/.test(e.h)
    && (e.u === undefined || (typeof e.u === 'string' && sourcesOf({ p: /** @type {string} */ (e.p), u: e.u }).length > 0));
}

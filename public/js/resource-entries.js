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
 * The caches the files are kept in. Chrome refuses `Cache.keys()` on a cache that holds too many entries
 * ("Operation too large", by the size of the answer: 18,000 of the list's paths passed and 20,000 failed, 10,000 paths of
 * 400 characters passed and 14,000 failed; the responses' headers hardly count — 2026-11-17), and the page's reconcile walks
 * every key, so one cache for the whole list (36 thousand files once the skin pack came) stopped the resource download
 * and hid the settings' 资源 tab for good. The files are spread over CACHE_SHARDS caches by a hash of their path
 * (shardOf: the page and public/resource-worker.js agree on it), and tools/build-browser-resources.mjs stops when a
 * cache would get more than SHARD_MAX_FILES. The records (state, clean, differ) live in META_CACHE. LEGACY_CACHE is the
 * single cache of the versions before: the page moves its files into the shards and then deletes it.
 */
export const CACHE_SHARDS = 16;
export const SHARD_MAX_FILES = 8000;
export const META_CACHE = 'sp-res-meta';
export const LEGACY_CACHE = 'sp-res';
/** The shard of a path: FNV-1a over its UTF-16 code units, CACHE_SHARDS buckets. @param {string} p */
export function shardOf(p) {
  let h = 0x811c9dc5;
  for (let i = 0; i < p.length; i++) h = Math.imul(h ^ p.charCodeAt(i), 0x01000193);
  return (h >>> 0) % CACHE_SHARDS;
}
/** Every shard's cache name, by shard. */
export const SHARD_NAMES = Array.from({ length: CACHE_SHARDS }, (_, i) => `sp-res-${i.toString(16)}`);

/** List entries the page will act on: a valid path, a size and a sha256 (anything else is ignored). */
export const validEntry = (/** @type {any} */ f) => !!f && validPath(f.p) && Number.isInteger(f.s) && f.s >= 0 && typeof f.h === 'string' && /^[0-9a-f]{64}$/.test(f.h)
  && (f.u === undefined || (typeof f.u === 'string' && sourcesOf(f).length > 0));

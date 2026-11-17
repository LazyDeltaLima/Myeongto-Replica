// test/helpers/fake-cache-storage.js — a CacheStorage over one fake Cache, for the tests of public/js/resources.js.
//
// The page keeps the files in the caches SHARD_NAMES (by shardOf of the path) and its records in META_CACHE
// (public/js/resource-entries.js). The tests keep one Map of entries and assert on it; this wraps their one fake `cache`
// so each shard's keys() lists only that shard's files (never the records, which live in META_CACHE), and every other
// call goes to the same `cache`. `legacy` (optional) is a fake of the old single cache LEGACY_CACHE.

import { shardOf, SHARD_NAMES, LEGACY_CACHE } from '../../public/js/resource-entries.js';

const RECORD = /^\/__sp_res_[a-z]+__$/;
const pathOf = (r) => {
  const u = typeof r === 'string' ? r : r.url;
  try { return decodeURIComponent(new URL(u, 'https://x.test').pathname); } catch { return u; }
};

/**
 * @param {{ keys: Function, match: Function, put: Function, delete: Function }} cache
 * @param {{ legacy?: object | null, onKeys?: (name: string) => void }} [opts]
 */
export function cacheStorageOver(cache, { legacy = null, onKeys = () => {} } = {}) {
  const views = SHARD_NAMES.map((name, i) => ({
    keys: async (...a) => { onKeys(name); return (await cache.keys(...a)).filter((r) => !RECORD.test(pathOf(r)) && shardOf(pathOf(r)) === i); },
    match: (...a) => cache.match(...a),
    put: (...a) => cache.put(...a),
    delete: (...a) => cache.delete(...a),
  }));
  const storage = {
    deleted: [],
    open: async (name) => {
      if (name === LEGACY_CACHE) return legacy;
      const i = SHARD_NAMES.indexOf(name);
      return i >= 0 ? views[i] : cache; // META_CACHE: the records
    },
    has: async (name) => (name === LEGACY_CACHE ? !!legacy : true),
    delete: async (name) => { storage.deleted.push(name); if (name === LEGACY_CACHE) legacy = null; return true; },
  };
  return storage;
}

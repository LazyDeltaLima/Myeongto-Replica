// server/match/borrow.js — a custom match's data with the battlefields and 特训敌人 types its settings borrow from other
// seasons (shared/seasonBorrow.js; maintainer request 2026-11-15). Match.js swaps its season's data for this before the
// match's tables are built; the browser makes the same merge for its battles (public/js/data.js, battle/runner.js).
//
//   borrowedData(own, season, custom, dataOf?)  → `own`, or the merged data (one object per own data and request)

import { getData } from '../data.js';
import { customBorrowIds, borrowKey, borrowSeasons, withBorrowed } from '../../shared/seasonBorrow.js';
import { CUSTOM_FIRST_HALF_STAGES } from '../../shared/ruleset.js';

/** own data → borrowKey → merged data (so a room's next match reuses it, and the sim's DataSource cache with it) */
const cache = new WeakMap();
const CACHE_MAX = 32;
const QUIET = { warn() {}, error() {}, info() {} };

/**
 * @param {Readonly<Record<string, any>>} own the season's data
 * @param {string} season the match's season (shared/seasons.js)
 * @param {any} custom the match's custom settings (resolveRuleset(...).custom), or null
 * @param {(season: string) => any} [dataOf] another season's data (the lobby's getData; default server/data.js)
 */
export function borrowedData(own, season, custom, dataOf = (s) => getData({ season: s, log: QUIET })) {
  const ids = customBorrowIds(custom);
  if (!ids || !own || typeof own !== 'object') return own;
  const key = borrowKey(ids);
  let byKey = cache.get(own);
  if (!byKey) cache.set(own, (byKey = new Map()));
  if (byKey.has(key)) return byKey.get(key);
  const foreign = borrowSeasons(season).map((s) => {
    let d;
    try { d = dataOf(s); } catch { d = null; }
    return /** @type {[string, any]} */ ([s, d && typeof d === 'object' ? d : {}]);
  });
  const out = withBorrowed(own, foreign, ids, CUSTOM_FIRST_HALF_STAGES);
  if (byKey.size >= CACHE_MAX) byKey.clear();
  byKey.set(key, out);
  return out;
}

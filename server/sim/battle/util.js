// server/sim/battle/util.js — small helpers shared by the Battle method modules (server/sim/battle/*.js).

/**
 * Finite number or the default (content may pass undefined/NaN/Infinity/strings to helpers).
 * @param {unknown} v @param {number} d @returns {number}
 */
export const fin = (v, d) => { const n = typeof v === 'number' ? v : (v == null || v === '' ? NaN : Number(v)); return Number.isFinite(n) ? n : d; };

/**
 * A deep copy of plain data (arrays and objects; anything else as it is).
 * @template T @param {T} v @returns {T}
 */
export function clone(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return /** @type {T} */ (v.map(clone));
  const o = /** @type {Record<string, unknown>} */ ({});
  for (const k of Object.keys(v)) o[k] = clone(/** @type {Record<string, unknown>} */ (v)[k]);
  return /** @type {T} */ (o);
}

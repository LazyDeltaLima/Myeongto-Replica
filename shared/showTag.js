// shared/showTag.js — the number 规程's texts carry as 「{showtag_value_1}」 (the table's `showTag` 'single'): a 特质's
// count of the round (已消耗{showtag_value_1}资金 / 已刷新…次 / 已获得…名), a growing 特质's next value (极光 +{…}, 忍冬 {…}次免费刷新)
// and 定期存折's funds. The server sends the player's values (m.private `showTags`, item pieces' `showTag`); the client fills
// the texts with them. Rules: docs/rules/ui.md 「규정 특질 문구의 숫자」.
//
// Pure ESM: the sim (garrisons/prep/shared.js growingValue, items/meta.js 定期存折) and the browser both import it.

export const SHOW_TAG = '{showtag_value_1}';
const ALL = /\{showtag_value_1\}/g;
// a bracketed clause holding the number — 「(已消耗{showtag_value_1}资金)」, 「(소모: 자금 {showtag_value_1})」
const CLAUSE = /\s?[(（][^()（）]*\{showtag_value_1\}[^()（）]*[)）]/g;

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

/** Does the text carry the number? */
export function hasShowTag(text) {
  return typeof text === 'string' && text.includes(SHOW_TAG);
}

/**
 * The text with its number: `value` when it is a number; else a bracketed counter clause is left out (the client's own
 * card text, charChessDataDict `desc`, has none) and any other place takes `fallback` ('' when none).
 */
export function fillShowTag(text, value, fallback = null) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  if (!s.includes(SHOW_TAG)) return s;
  if (Number.isFinite(value)) return s.replace(ALL, String(value));
  const rest = s.replace(CLAUSE, '');
  return rest.replace(ALL, Number.isFinite(fallback) ? String(fallback) : '');
}

/**
 * A growing 获得时 特质's value on its k-th run (k = 0, 1, …): count + delta_count × ⌊k ÷ n⌋, at most count + max_count.
 * @param {object} bb the 特质's blackboard
 */
export function growingShowValue(bb, k) {
  const base = num(bb?.count, 1);
  const step = Math.floor(Math.max(0, num(k, 0)) / Math.max(1, num(bb?.n, 1)));
  return Math.min(base + num(bb?.delta_count, 0) * step, base + num(bb?.max_count, 0));
}

/** The player-wide run counter of a growing 特质 (the normal and the elite record share it). */
export function growingCounterKey(garrisonId) {
  return `gar:grow:${String(garrisonId).replace(/_[ab]$/, '')}`;
}

/** 定期存折's funds after `held` round starts: value + delta × ⌊held ÷ n⌋. @param {object} p the buff's blackboard */
export function bankbookShowValue(p, held) {
  return num(p?.value, 0) + num(p?.delta, 1) * Math.floor(Math.max(0, num(held, 0)) / Math.max(1, num(p?.n, 1)));
}

/**
 * An item's number after `held` round starts (定期存折 equip_destory_gain_coin), or null for an item without one.
 * @param {{ buffs?: Array<{ key?: string, bb?: object }> }|null} item items.json record
 */
export function itemShowValue(item, held = 0) {
  const b = (Array.isArray(item?.buffs) ? item.buffs : []).find((x) => x && x.key === 'equip_destory_gain_coin');
  return b ? bankbookShowValue(b.bb, held) : null;
}

const GROWING = new Set(['SERVER_ADD_BOND_UPGRADE_LAYER', 'SERVER_GAIN_FREE_REFRESH_UPGRADE_COUNT']);

/**
 * A 特质's number for a player, or null when the 特质 has none it knows.
 * @param {{ garrisonId?: string, effectType?: string, bb?: object, bbStr?: object }} g garrisons.json record
 * @param {{ round?: { spent?: number, refreshes?: number, gainedChess?: number }, counter?: (k: string) => number }|null} st
 *   the player's round stats and counters; null = none (a growing 特质 then gives its first value, a count null)
 */
export function garrisonShowValue(g, st) {
  if (!g) return null;
  const r = st?.round || null;
  if (GROWING.has(g.effectType)) return growingShowValue(g.bb, st && typeof st.counter === 'function' ? st.counter(growingCounterKey(g.garrisonId)) : 0);
  if (!r) return null;
  switch (g.effectType) {
    case 'SERVER_ADD_BOND_ROUND_COIN_COST': return num(r.spent, 0);
    case 'SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER': return num(r.refreshes, 0);
    case 'SERVER_ADD_BOND_METHOD': return g.bbStr?.add_method === 'round_gain_char' ? num(r.gainedChess, 0) : null;
    default: return null;
  }
}

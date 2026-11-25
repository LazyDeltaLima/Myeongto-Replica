// 콘솔 모드: the lists of the console panel (public/js/ui/consolePanel.js), kept free of the UI framework so the tests read
// them in Node. The operators, items and enemies come from the page's own data tables; the 自选 picks and the leaders
// from m.private.console (server/local-console.js consoleView).

import { tName } from '../../../shared/i18n.js';
import { strengthenedItemId } from '../../../shared/local.js';

export const DIY = 'diy';         // the bond filter's 自选-only choice
export const DIY_KEY = 'diy:';    // entry key prefix of a 自选 candidate (a chess entry's key is its chessId)
/** @type {Readonly<Record<string, number>>} */
const RANK_ORDER = { NORMAL: 0, ELITE: 1, BOSS: 2 };

/**
 * The fields of the data records (data.list) and of m.private.console these lists read.
 * @typedef {{ [key: string]: unknown, chessId?: string, isGolden?: boolean, isDiy?: boolean, tier?: number, name?: string,
 *   bonds?: string[], isHidden?: boolean, shopSortId?: number, charId?: string, appellation?: string,
 *   subProfessionName?: string }} ConsoleChessRow
 * @typedef {{ [key: string]: unknown, charId: string, name: string, tiers?: Record<string, unknown>, bonds?: string[] }} DiyCandidate
 * @typedef {{ [key: string]: unknown, key?: string, name?: string, rank?: string, tokenOnly?: boolean,
 *   stats?: { [key: string]: unknown, maxHp?: unknown } }} ConsoleEnemyRow
 * @typedef {{ [key: string]: unknown, id?: string, isGolden?: boolean, name?: string, tier?: number, itemType?: string,
 *   shopSortId?: number, desc?: string }} ConsoleItemRow
 * @typedef {{ [key: string]: unknown, kind?: string, id?: string, items?: (string | { id: string })[] }} OwnedPiece
 * @typedef {{ name?: string } | null | undefined} NamedRecord a lookup's record, read for its name
 */
/**
 * @typedef {{ key: string, kind: 'chess' | 'diy', name: string, tiers: number[], bonds: string[], hidden: boolean,
 *   sort: number, charId: string | null, hay: string, cand?: DiyCandidate }} DebugEntry
 * @typedef {{ key: string, name: string, rank: string, hp: number, twin: boolean, hay: string }} EnemyEntry
 * @typedef {{ key: string, name: string, tier: number, magic: boolean, golden: string | null, sort: number,
 *   hay: string }} ItemEntry
 */

/**
 * Every operator the panel offers: [{ key, kind: 'chess'|'diy', name, tiers, bonds, hidden, hay, charId, cand? }], tier
 * then shop order, 自选 candidates after the chess of their tier.
 * @param {(ConsoleChessRow | null)[]} chessList data.list('chess') @param {DiyCandidate[] | undefined} candidates m.private.console.candidates
 * @param {(id: string) => NamedRecord} rawChess the record's Chinese texts (data.lookupRaw)
 * @param {(id: string) => NamedRecord} getBond bond lookup (the search also matches bond names)
 * @returns {DebugEntry[]}
 */
export function debugEntries(chessList, candidates, rawChess = () => null, getBond = () => null) {
  /** @type {DebugEntry[]} */
  const out = [];
  /** @param {string[]} ids */
  const bondNames = (ids) => ids.map((id) => getBond(id)?.name);
  for (const c of Array.isArray(chessList) ? chessList : []) {
    if (!c || c.isGolden || c.isDiy || !Number.isInteger(c.tier) || !c.chessId) continue;
    const raw = rawChess(c.chessId);
    out.push({ key: c.chessId, kind: 'chess', name: c.name || c.chessId, tiers: [/** @type {number} */ (c.tier)], bonds: Array.isArray(c.bonds) ? c.bonds : [],
      hidden: !!c.isHidden, sort: c.shopSortId ?? 0, charId: c.charId || null,
      hay: [c.name, raw?.name, c.appellation, c.subProfessionName, ...bondNames(c.bonds || [])].filter(Boolean).join(' ').toLowerCase() });
  }
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    const tiers = Object.keys(cand.tiers || {}).map(Number).sort();
    if (!tiers.length) continue;
    out.push({ key: DIY_KEY + cand.charId, kind: 'diy', name: tName(cand.name), tiers, bonds: cand.bonds || [], hidden: false, sort: Infinity, charId: cand.charId,
      hay: [tName(cand.name), cand.name, cand.charId, ...bondNames(cand.bonds || [])].filter(Boolean).join(' ').toLowerCase(), cand });
  }
  return out.sort((a, b) => a.tiers[0] - b.tiers[0] || a.sort - b.sort || (a.key < b.key ? -1 : 1));
}

/**
 * The tier and operator names of a con.addDiy refused because both 自选 slots of the tier hold operators with pieces
 * (server/local-console.js: its NetError.detail, pinned by test/local-console.test.js), else null.
 * @param {unknown} detail
 * @returns {{ tier: number, names: string[] } | null}
 */
export function diySlotsFullOf(detail) {
  const m = /^both 自选 slots of tier (\d) hold operators with pieces \(([^)]*)\)/.exec(typeof detail === 'string' ? detail : '');
  return m ? { tier: Number(m[1]), names: m[2] ? m[2].split(', ') : [] } : null;
}

/**
 * Our side's own units that the enemy table holds: the keys every enemy effect's `enemy_exclude` names (activity_table:
 * 炎佑, and in 规程 also the bond summons and 宝藏探机's “模拟宝藏” — server/sim/content/enemies.js STATS_ONLY). The other
 * lists add the 14 器物 keys to them, so the keys all of them share are the ones that are no enemy in any effect.
 * @param {({ [key: string]: unknown, params?: { [key: string]: unknown, enemy_exclude?: unknown } } | null)[]} effects data.list('effects')
 * @returns {Set<string>}
 */
export function ourSideEnemyKeys(effects) {
  /** @type {Set<string> | null} */
  let common = null;
  for (const e of Array.isArray(effects) ? effects : []) {
    const raw = e?.params?.enemy_exclude;
    if (typeof raw !== 'string' || !raw) continue;
    const keys = new Set(raw.split('|'));
    common = common ? new Set([...common].filter((/** @type {string} */ k) => keys.has(k))) : keys;
  }
  return common || new Set();
}

/**
 * The enemies con.addEnemy may queue: [{ key, name, rank, hp, twin, hay }], token-only summons, leaders (picked in the
 * round tab) and our side's own units (`ourSide`, ourSideEnemyKeys) left out, normal → elite → boss, then by key. Of the
 * BOSS-rank records only the ones a 悬赏 card names (`bountyBosses`, m.private.console bountyBosses — the mid-bosses a
 * bounty brings) stay; the others are the leaders. `twin`: another
 * entry has the same name (鸭爵 and its 神秘顾客 form enemy_2001_duckmi_2, say: the official table's own two records) —
 * the panel tells them apart by `hp`.
 * @param {(ConsoleEnemyRow | null)[]} enemyList data.list('enemies') @param {(key: string) => NamedRecord} rawEnemy the Chinese record
 * @param {Set<string>} [ourSide] @param {Iterable<string>} [bountyBosses]
 * @returns {EnemyEntry[]}
 */
export function debugEnemyEntries(enemyList, rawEnemy = () => null, ourSide = new Set(), bountyBosses = []) {
  const bosses = new Set(bountyBosses);
  /** @type {EnemyEntry[]} */
  const out = [];
  for (const e of Array.isArray(enemyList) ? enemyList : []) {
    if (!e || typeof e.key !== 'string' || e.tokenOnly || ourSide.has(e.key)) continue;
    // a rank RANK_ORDER has is a string
    const rank = Object.hasOwn(RANK_ORDER, /** @type {string} */ (e.rank)) ? /** @type {string} */ (e.rank) : 'NORMAL';
    if (rank === 'BOSS' && !bosses.has(e.key)) continue;
    out.push({ key: e.key, name: e.name || e.key, rank, hp: Number(e.stats?.maxHp) || 0, twin: false,
      hay: [e.name, rawEnemy(e.key)?.name, e.key].filter(Boolean).join(' ').toLowerCase() });
  }
  /** @type {Map<string, number>} */
  const names = new Map();
  for (const x of out) names.set(x.name, (names.get(x.name) || 0) + 1);
  for (const x of out) x.twin = /** @type {number} */ (names.get(x.name)) > 1; // every name was counted above
  return out.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * The operator entries passing the filters: `bond` '' | DIY | a bond id, `tier` 0 (all) | 1–6, `query` a name fragment.
 * @param {DebugEntry[]} entries @param {{ bond?: string, tier?: number, query?: string }} [filters]
 */
export function filterDebugEntries(entries, { bond = '', tier = 0, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (bond === DIY ? e.kind !== 'diy' : bond && !e.bonds.includes(bond)) return false;
    if (tier && !e.tiers.includes(tier)) return false;
    return !q || e.hay.includes(q);
  });
}

/**
 * The items con.addItem may add: [{ key, name, tier, magic, golden, hay }] — the normal form of every item (its
 * strengthened form is the panel's 「강화」 switch, `golden` = the id it has one), tier then shop order.
 * @param {(ConsoleItemRow | null)[]} itemList data.list('items') @param {(id: string) => NamedRecord} rawItem the Chinese record
 * @returns {ItemEntry[]}
 */
export function consoleItemEntries(itemList, rawItem = () => null) {
  /** @type {ItemEntry[]} */
  const out = [];
  for (const x of Array.isArray(itemList) ? itemList : []) {
    if (!x || x.isGolden || typeof x.id !== 'string') continue;
    out.push({ key: x.id, name: x.name || x.id, tier: Number.isInteger(x.tier) ? /** @type {number} */ (x.tier) : 0, magic: x.itemType === 'MAGIC',
      golden: strengthenedItemId(x), sort: x.shopSortId ?? 0,
      hay: [x.name, rawItem(x.id)?.name, x.desc, x.id].filter(Boolean).join(' ').toLowerCase() });
  }
  return out.sort((a, b) => a.tier - b.tier || a.sort - b.sort || (a.key < b.key ? -1 : 1));
}

/**
 * The item entries passing the filters: `tier` 0 (all) | 1–6, `golden` only those with a strengthened form, `query`.
 * @param {ItemEntry[]} entries @param {{ tier?: number, golden?: boolean, query?: string }} [filters]
 */
export function filterItemEntries(entries, { tier = 0, golden = false, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return entries.filter((e) => (!tier || e.tier === tier) && (!golden || e.golden) && (!q || e.hay.includes(q)));
}

/**
 * The bonds of the player's own operators for the bonds tab's two filters: `field` = on the board (배치 중), `held` = on
 * the board, in the hand or in the temporary zone (보유 중). A piece's bonds are its record's (a 自选 slot's: its pick's) and
 * those its 变形同构体 pairing grants.
 * @template R
 * @param {{ [key: string]: unknown, board?: (OwnedPiece | null)[], hand?: (OwnedPiece | null)[], temp?: (OwnedPiece | null)[] } | null | undefined} priv m.private
 * @param {(piece: OwnedPiece) => R | null | undefined} recOf the piece's chess record (the 自选 record for a 自选 slot), or null
 * @param {(rec: R, piece: OwnedPiece) => string[]} bondsOf the record's bonds plus the granted ones (gameLogic pieceBondIds)
 * @returns {{ field: Set<string>, held: Set<string> }}
 */
export function ownedBondSets(priv, recOf, bondsOf) {
  /** @type {Set<string>} */
  const field = new Set(), /** @type {Set<string>} */ held = new Set();
  /** @param {(OwnedPiece | null)[] | undefined} list @param {...Set<string>} sets */
  const add = (list, ...sets) => {
    for (const p of Array.isArray(list) ? list : []) {
      if (!p || p.kind !== 'chess') continue;
      const rec = recOf(p);
      if (!rec) continue;
      for (const b of bondsOf(rec, p)) for (const s of sets) s.add(b);
    }
  };
  add(priv?.board, field, held);
  add(priv?.hand, held);
  add(priv?.temp, held);
  return { field, held };
}

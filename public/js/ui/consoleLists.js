// 콘솔 모드: the lists of the console panel (public/js/ui/consolePanel.js), kept free of the UI framework so the tests read
// them in Node. The operators, items and enemies come from the page's own data tables; the 自选 picks and the leaders
// from m.private.console (server/local-console.js consoleView).

import { tName } from '../../../shared/i18n.js';

export const DIY = 'diy';         // the bond filter's 自选-only choice
export const DIY_KEY = 'diy:';    // entry key prefix of a 自选 candidate (a chess entry's key is its chessId)
const RANK_ORDER = { NORMAL: 0, ELITE: 1, BOSS: 2 };

/**
 * Every operator the panel offers: [{ key, kind: 'chess'|'diy', name, tiers, bonds, hidden, hay, charId, cand? }], tier
 * then shop order, 自选 candidates after the chess of their tier.
 * @param {any[]} chessList data.list('chess') @param {any[]} candidates m.private.console.candidates
 * @param {(id: string) => any} rawChess the record's Chinese texts (data.lookupRaw)
 * @param {(id: string) => any} getBond bond lookup (the search also matches bond names)
 */
export function debugEntries(chessList, candidates, rawChess = () => null, getBond = () => null) {
  const out = [];
  const bondNames = (ids) => ids.map((id) => getBond(id)?.name);
  for (const c of Array.isArray(chessList) ? chessList : []) {
    if (!c || c.isGolden || c.isDiy || !Number.isInteger(c.tier) || !c.chessId) continue;
    const raw = rawChess(c.chessId);
    out.push({ key: c.chessId, kind: 'chess', name: c.name || c.chessId, tiers: [c.tier], bonds: Array.isArray(c.bonds) ? c.bonds : [],
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
 * @param {any} detail
 * @returns {{ tier: number, names: string[] } | null}
 */
export function diySlotsFullOf(detail) {
  const m = /^both 自选 slots of tier (\d) hold operators with pieces \(([^)]*)\)/.exec(typeof detail === 'string' ? detail : '');
  return m ? { tier: Number(m[1]), names: m[2] ? m[2].split(', ') : [] } : null;
}

/**
 * The enemies con.addEnemy may queue: [{ key, name, rank, hay }], token-only summons and leaders left out (a leader is
 * picked in the round tab), normal → elite, then by key.
 * @param {any[]} enemyList data.list('enemies') @param {(key: string) => any} rawEnemy the Chinese record
 */
export function debugEnemyEntries(enemyList, rawEnemy = () => null) {
  const out = [];
  for (const e of Array.isArray(enemyList) ? enemyList : []) {
    if (!e || typeof e.key !== 'string' || e.tokenOnly) continue;
    const rank = Object.hasOwn(RANK_ORDER, e.rank) ? e.rank : 'NORMAL';
    if (rank === 'BOSS') continue;
    out.push({ key: e.key, name: e.name || e.key, rank, hay: [e.name, rawEnemy(e.key)?.name, e.key].filter(Boolean).join(' ').toLowerCase() });
  }
  return out.sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The operator entries passing the filters: `bond` '' | DIY | a bond id, `tier` 0 (all) | 1–6, `query` a name fragment. */
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
 * @param {any[]} itemList data.list('items') @param {(id: string) => any} rawItem the Chinese record
 */
export function consoleItemEntries(itemList, rawItem = () => null) {
  const out = [];
  for (const x of Array.isArray(itemList) ? itemList : []) {
    if (!x || x.isGolden || typeof x.id !== 'string') continue;
    const golden = x.upgradeChessId || x.goldenId;
    out.push({ key: x.id, name: x.name || x.id, tier: Number.isInteger(x.tier) ? x.tier : 0, magic: x.itemType === 'MAGIC',
      golden: golden && golden !== x.id ? golden : null, sort: x.shopSortId ?? 0,
      hay: [x.name, rawItem(x.id)?.name, x.desc, x.id].filter(Boolean).join(' ').toLowerCase() });
  }
  return out.sort((a, b) => a.tier - b.tier || a.sort - b.sort || (a.key < b.key ? -1 : 1));
}

/** The item entries passing the filters: `tier` 0 (all) | 1–6, `golden` only those with a strengthened form, `query`. */
export function filterItemEntries(entries, { tier = 0, golden = false, query = '' } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return entries.filter((e) => (!tier || e.tier === tier) && (!golden || e.golden) && (!q || e.hay.includes(q)));
}

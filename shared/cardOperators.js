// shared/cardOperators.js — 名片干员 (the waiting room's seat card operator, after upstream 0.3.3): which operators a seat
// card may show, over every season, as data/cards.json holds them. tools/build-data.mjs writes the file with this one
// rule (every season's chess / backups); the server checks room.card against it (server/lobby.js cardAllowed) and the
// browser lists it in the picker (public/js/ui/seatArt.js cardOperators) — neither repeats the rule.
//
//   { operators: [{ charId, name, appellation, rarity, assets: { avatar, portrait }, seasons: [id…], pool: [id…] }] }
//
// An operator is a card in a season when the season has a visible, non-自选 chess record of it (the golden form's art:
// E2) or offers it as a 自选 pick of this server (`backups.diy.ownedPool` ∩ shared/local-diy.js, art `<charId>_2`, named
// and rated by `backups.diy.operators`). `pool` = the seasons whose default card may draw it (a 5★ / 6★ chess record:
// ui/seatArt.js cardContext). One record per charId: the first season's in `seasons` order (the seasons agree on the
// fields kept, checked 2026-11-18). `name` is the Chinese; the browser localizes it by the overlays' `names` map.
//
// CARD_EXTRA_OPERATORS (maintainer decision 2026-11-20): operators no season fields that a seat card may show anyway,
// on a player's request. build-data takes each one's name, appellation and rarity from character_table (cardExtra) and
// buildCards lists it for every season with an empty `pool` (only a player's pick shows it, never the default draw) and
// its default (E0) art; a season that fields it gives its own record instead.

import { isLocalDiyPick } from './local-diy.js';

/** Seat card operators outside every season (header): 로도스 아일랜드 그림자 부대 (罗德岛隐秘队), 허드벨스 (行铃). */
export const CARD_EXTRA_OPERATORS = Object.freeze(['char_4215_buddy', 'char_4170_hdbell']);

/**
 * The card of a CARD_EXTRA_OPERATORS entry from its character_table row; throws when the table lacks it (a typo in the
 * list or a table that predates the operator: rebuild the tables, never a guessed record).
 * @param {string} charId @param {any} char character_table[charId]
 */
export function cardExtra(charId, char) {
  if (!char || typeof char.name !== 'string') throw new Error(`cardExtra: ${charId} is not in character_table (shared/cardOperators.js CARD_EXTRA_OPERATORS)`);
  const rarity = Number(String(char.rarity).replace('TIER_', ''));
  if (!Number.isFinite(rarity) || rarity < 1) throw new Error(`cardExtra: ${charId} has no rarity (${char.rarity})`);
  return { charId, name: char.name, appellation: typeof char.appellation === 'string' ? char.appellation : null, rarity,
    assets: { avatar: charId, portrait: charId } };
}

/**
 * @param {[string, { chess: any, backups: any }][]} seasons each season's id and its data, the default season first
 * @param {{ charId: string, name: string, appellation: string | null, rarity: number,
 *   assets: { avatar: string, portrait: string } }[]} [extras] cardExtra() of CARD_EXTRA_OPERATORS
 * @returns {{ operators: { charId: string, name: string, appellation: string | null, rarity: number,
 *   assets: { avatar: string, portrait: string }, seasons: string[], pool: string[] }[] }}
 */
export function buildCards(seasons, extras = []) {
  /** @type {Map<string, any>} */
  const by = new Map();
  /** @param {string} season @param {any} rec @param {boolean} inPool */
  const add = (season, rec, inPool) => {
    let o = by.get(rec.charId);
    if (!o) { o = { ...rec, seasons: [], pool: [] }; by.set(rec.charId, o); }
    if (!o.seasons.includes(season)) o.seasons.push(season);
    if (inPool && !o.pool.includes(season)) o.pool.push(season);
  };
  for (const [season, d] of seasons) {
    const chess = d?.chess && typeof d.chess === 'object' ? d.chess : {};
    const best = new Map();
    for (const c of Object.values(chess)) {
      if (!c || c.isDiy || c.visible === false || typeof c.charId !== 'string') continue;
      const prev = best.get(c.charId);
      if (!prev || (c.isGolden && !prev.isGolden)) best.set(c.charId, c);
    }
    for (const c of best.values()) {
      const rarity = Number.isFinite(c.rarity) ? c.rarity : 0;
      add(season, { charId: c.charId, name: String(c.name ?? c.charId), appellation: typeof c.appellation === 'string' ? c.appellation : null,
        rarity, assets: { avatar: String(c.assets?.avatar || c.charId), portrait: String(c.assets?.portrait || c.charId) } }, rarity >= 5);
    }
    const diy = d?.backups?.diy;
    const ops = diy && typeof diy.operators === 'object' && diy.operators ? diy.operators : {};
    for (const id of Array.isArray(diy?.ownedPool) ? diy.ownedPool : []) {
      if (typeof id !== 'string' || !id || best.has(id) || !isLocalDiyPick(id)) continue;
      const rec = ops[id];
      add(season, { charId: id, name: rec && typeof rec.name === 'string' ? rec.name : id, appellation: null,
        rarity: rec && Number.isFinite(rec.rarity) ? rec.rarity : 0, assets: { avatar: `${id}_2`, portrait: `${id}_2` } }, false);
    }
  }
  for (const rec of extras) {
    if (by.has(rec.charId)) continue;
    for (const [season] of seasons) add(season, rec, false);
  }
  return { operators: [...by.values()].sort((a, b) => (a.charId < b.charId ? -1 : a.charId > b.charId ? 1 : 0)) };
}

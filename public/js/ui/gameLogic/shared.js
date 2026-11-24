// ui/gameLogic/shared.js — small helpers and seat order. Public names are re-exported from ../gameLogic.js.

// ---- small helpers -------------------------------------------------------------------------------

/**
 * A protocol or data object the page reads field by field; the keys a function relies on are named where it is typed.
 * @typedef {{ [key: string]: any }} Bag
 */
/**
 * One row of the public match snapshot's `players`.
 * @typedef {{ playerId: string, seat?: number, name?: string, alive?: boolean, fieldId?: string, bandId?: string, [key: string]: any }} PubPlayer
 */
/**
 * One of the public snapshot's `fields`.
 * @typedef {{ fieldId: string, kind?: string, players?: string[], live?: boolean, [key: string]: any }} PubField
 */
/**
 * The public match snapshot (m.public), the keys the page logic reads.
 * @typedef {{ phase?: string, round?: number, bossRound?: number, hiddenRound?: number, bossPairs?: string[][],
 *   players?: PubPlayer[], fields?: PubField[], [key: string]: any }} Pub
 */

/** @param {unknown} v @returns {v is Bag} */
export const isObj = (v) => !!v && typeof v === 'object';
/** @param {any} v @param {number} [d] */
export const int = (v, d = 0) => (Number.isInteger(v) ? v : d);
/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Stable key of a board tile. @param {number} row @param {number} col */
export const tileKey = (row, col) => `${row},${col}`;

/**
 * Players sorted by seat (nulls dropped).
 * @param {Pub | null | undefined} pub
 * @returns {PubPlayer[]}
 */
export function sortedPlayers(pub) {
  /** @type {PubPlayer[]} */
  const list = Array.isArray(pub?.players) ? pub.players.filter(isObj) : [];
  return [...list].sort((a, b) => int(a.seat, 99) - int(b.seat, 99));
}

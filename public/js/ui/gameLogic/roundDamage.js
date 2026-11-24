// ui/gameLogic/roundDamage.js — the round damage panel's rows (ui/roundDamage.js; docs/rules/ui.md 「라운드 대미지 패널」).
// Pure. Re-exported from ../gameLogic.js.

import { foldRoundDamage } from '../../../../shared/roundDamage.js';

/** Rows the panel lists before 「另外 N 名」: a desktop, a phone. */
export const ROUND_DAMAGE_ROWS = Object.freeze({ desktop: 8, phone: 5 });

/**
 * What the panel shows. A battle of the current round still on its way (`live`, from battleRunner.ownDamage) wins over
 * the server's numbers of an earlier round; the server's m.roundDmg of the current round (settled) wins over both. A
 * message older than the previous round (another match's, kept by the page) is never shown.
 * @param {{ round?: number|null, live?: { done: boolean, units: any[] }|null, msg?: { round: number, units: number[][] }|null,
 *   board?: any[]|null, combat?: boolean }} o `board`: m.private board pieces; `combat`: the round's battle has started
 * @returns {{ round: number, live: boolean, pairs: number[][] }|null}
 */
export function roundDamageSource({ round = null, live = null, msg = null, board = null, combat = false }) {
  const settled = msg && Array.isArray(msg.units) && Number.isInteger(msg.round) && Number.isInteger(round)
    && (round === msg.round || round === msg.round + 1) ? msg : null;
  if (settled && settled.round === round) return { round: settled.round, live: false, pairs: settled.units };
  if (combat && live && Array.isArray(live.units) && Number.isInteger(round)) {
    return { round: /** @type {number} */ (round), live: !live.done, pairs: foldRoundDamage(board || [], live.units) };
  }
  return settled ? { round: settled.round, live: false, pairs: settled.units } : null;
}

/**
 * The rows of a tab: every operator still on the board (a sold one has no piece to name — its number stays in the total),
 * most first, `share` of the total, `bar` against the top one. 'dmg' lists everyone, with `parts`, the row's damage by type
 * as shares of its own sum (null when the battle reported none: the plain bar); 'heal' lists those who healed.
 * @param {number[][]|null|undefined} pairs [uid, damage, healing, physical, arts, true, elemental] (shared/roundDamage.js)
 * @param {any[]|null|undefined} board m.private board pieces
 * @param {number} limit rows before the rest is counted
 * @param {'dmg'|'heal'} [tab]
 * @returns {{ rows: Array<{ uid: number, piece: any, value: number, share: number, bar: number, parts: number[]|null }>, rest: number, total: number }}
 */
export function roundDamageRows(pairs, board, limit, tab = 'dmg') {
  const byUid = new Map();
  for (const p of board || []) if (p && p.kind === 'chess' && Number.isInteger(p.uid)) byUid.set(p.uid, p);
  const heal = tab === 'heal';
  let total = 0;
  const all = [];
  for (const [uid, d, h, ...types] of Array.isArray(pairs) ? pairs : []) {
    const value = Math.max(0, Number(heal ? h : d) || 0);
    total += value;
    const piece = byUid.get(uid);
    if (!piece || (heal && !(value > 0))) continue;
    const sum = heal ? 0 : types.reduce((a, v) => a + (Number(v) || 0), 0);
    all.push({ uid, piece, value, parts: sum > 0 ? types.map((v) => (Number(v) || 0) / sum) : null });
  }
  all.sort((a, b) => b.value - a.value || a.uid - b.uid);
  const top = all.length ? all[0].value : 0;
  const rows = all.slice(0, Math.max(1, limit)).map((r) => ({ uid: r.uid, piece: r.piece, value: r.value, share: total > 0 ? r.value / total : 0, bar: top > 0 ? r.value / top : 0, parts: r.parts }));
  return { rows, rest: all.length - rows.length, total };
}

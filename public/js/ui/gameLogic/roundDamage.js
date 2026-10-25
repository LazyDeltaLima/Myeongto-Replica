// ui/gameLogic/roundDamage.js — the round damage panel's rows (ui/roundDamage.js; docs/rules/ui.md 「라운드 대미지 패널」).
// Pure. Re-exported from ../gameLogic.js.

import { foldRoundDamage } from '../../../../shared/roundDamage.js';

/** Rows the panel lists before 「另外 N 名」: a desktop, a phone. */
export const ROUND_DAMAGE_ROWS = Object.freeze({ desktop: 8, phone: 5 });

/**
 * What the panel shows. A battle of the current round still on its way (`live`, from battleRunner.ownDamage) wins over
 * the server's numbers of an earlier round; the server's m.roundDmg of the current round (settled) wins over both. A
 * message older than the previous round (another match's, kept by the page) is never shown.
 * @param {{ round?: number|null, live?: { done: boolean, units: any[] }|null, msg?: { round: number, units: Array<[number, number]> }|null,
 *   board?: any[]|null, combat?: boolean }} o `board`: m.private board pieces; `combat`: the round's battle has started
 * @returns {{ round: number, live: boolean, pairs: Array<[number, number]> }|null}
 */
export function roundDamageSource({ round = null, live = null, msg = null, board = null, combat = false }) {
  const settled = msg && Array.isArray(msg.units) && Number.isInteger(msg.round) && Number.isInteger(round)
    && (round === msg.round || round === msg.round + 1) ? msg : null;
  if (settled && settled.round === round) return { round: settled.round, live: false, pairs: settled.units };
  if (combat && live && Array.isArray(live.units) && Number.isInteger(round)) {
    return { round, live: !live.done, pairs: foldRoundDamage(board || [], live.units) };
  }
  return settled ? { round: settled.round, live: false, pairs: settled.units } : null;
}

/**
 * The rows: every operator still on the board (a sold one has no piece to name — its damage stays in the total),
 * most damage first, `share` of the total, `bar` against the top one.
 * @param {Array<[number, number]>} pairs [uid, damage]
 * @param {any[]|null|undefined} board m.private board pieces
 * @param {number} limit rows before the rest is counted
 * @returns {{ rows: Array<{ uid: number, piece: any, dmg: number, share: number, bar: number }>, rest: number, total: number }}
 */
export function roundDamageRows(pairs, board, limit) {
  const byUid = new Map();
  for (const p of board || []) if (p && p.kind === 'chess' && Number.isInteger(p.uid)) byUid.set(p.uid, p);
  let total = 0;
  const all = [];
  for (const [uid, d] of Array.isArray(pairs) ? pairs : []) {
    const dmg = Math.max(0, Number(d) || 0);
    total += dmg;
    const piece = byUid.get(uid);
    if (piece) all.push({ uid, piece, dmg });
  }
  all.sort((a, b) => b.dmg - a.dmg || a.uid - b.uid);
  const top = all.length ? all[0].dmg : 0;
  const rows = all.slice(0, Math.max(1, limit)).map((r) => ({ ...r, share: total > 0 ? r.dmg / total : 0, bar: top > 0 ? r.dmg / top : 0 }));
  return { rows, rest: all.length - rows.length, total };
}

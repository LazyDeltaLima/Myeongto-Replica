// server/sim/content/support/meta.js — prep-side helpers shared by content wave B (docs/META.md registry API).
//
// registerSupportMeta(registry) is called once from bonds.js → registerMeta. It installs
//   global:contentb_info   onBattleStart: writes `ev.input.contentInfo` (read in battles with support.contentInfo()):
//     { round, kind, shopLevel, funds,
//       handUnits  pieces in the 整备区 (hand, 10 slots; operators, items and summon stacks),
//       handChess  operators in the hand,
//       roundStats { refreshes, buys, sells, spent, gainedChess, arts }   (this round's prep, ps.round),
//       matchBands band ids of every alive player (this player first), each followed by the strategy whose 指令 it took
//                  (更换指令: PlayerState.bandCommand),
//       teammates  [{ playerId, bandId }] of the other alive players }
// Global handlers run first in every dispatch, so band / bond / garrison / item handlers of the same onBattleStart can
// read or extend `ev.input.contentInfo`.
//
// Meta helpers (pure functions of a handler ctx):
//   metaBonds(ctx, pieceView)   bonds of a piece incl. 变形同构体 grants
//   distinctTiers(ctx, pred)    distinct chess tiers on the board among pieces matching pred
//   frontPiece / behindPiece    board neighbours ("身前一格" = one step along the piece's direction `dir`, default
//                               RIGHT = col + 1; board piece views carry `dir`, sim/dir.js)

import { frontOf } from '../../dir.js';
/** @import { MetaCtx, MetaRegistry } from '../../../match/effectsMeta.js' */
/**
 * A piece view a meta ctx hands out (ctx.board(), ctx.hand(), ctx.piece(uid): kind, id, uid, tier, items, row, col,
 * dir …), read field by field.
 * @typedef {Record<string, any>} PieceView
 */

/** @param {MetaRegistry} registry */
export function registerSupportMeta(registry) {
  registry.global('contentb_info', {
    onBattleStart(ctx, ev) {
      if (!ev || !ev.input || typeof ev.input !== 'object') return;
      const hand = ctx.hand();
      const rs = ctx.roundStats();
      const mates = ctx.teammates();
      ev.input.contentInfo = {
        round: ctx.round,
        kind: ev.kind ?? null,
        shopLevel: ctx.shopLevel(),
        funds: ctx.funds(),
        handUnits: hand.filter(Boolean).length,
        handChess: hand.filter((p) => p && p.kind === 'chess').length,
        roundStats: {
          refreshes: rs.refreshes | 0, buys: rs.buys | 0, sells: rs.sells | 0, spent: rs.spent | 0,
          gainedChess: rs.gainedChess | 0, arts: rs.arts | 0,
        },
        // with the 指令 taken from another strategy (更换指令 — Touch 外勤医疗 reaches the team from it too)
        matchBands: [ctx.bandId(), ctx.commandBandId?.(), ...mates.flatMap((/** @type {MetaCtx} */ t) => [t.bandId(), t.commandBandId?.()])].filter(Boolean),
        teammates: mates.map((/** @type {MetaCtx} */ t) => ({ playerId: t.playerId, bandId: t.bandId() })),
      };
    },
  });
}

/**
 * Bonds of a piece view (own + 变形同构体 grants), as the match counts them.
 * @param {MetaCtx} ctx @param {PieceView | null | undefined} piece
 * @returns {string[]}
 */
export function metaBonds(ctx, piece) {
  if (!piece || piece.kind !== 'chess') return [];
  const fresh = Number.isInteger(piece.uid) && piece.uid > 0 ? ctx.piece(piece.uid) : null;
  const p = fresh && fresh.kind === 'chess' ? fresh : piece;
  const rec = ctx.chessRecord(p.id);
  return withGrants(ctx, p, rec && Array.isArray(rec.bonds) ? rec.bonds.slice() : []);
}

/** @param {MetaCtx} ctx @param {PieceView} piece @param {string[]} bonds */
function withGrants(ctx, piece, bonds) {
  const items = Array.isArray(piece.items) ? piece.items : [];
  if (items.length < 2) return bonds;
  const recs = /** @type {Record<string, any>[]} */ (items.map((/** @type {{ id: string }} */ it) => ctx.gd.item(it.id)).filter(Boolean));
  if (!recs.some((r) => r.canGiveBond)) return bonds;
  const out = bonds.slice();
  for (const r of recs) if (!r.canGiveBond && typeof r.giveBondId === 'string' && ctx.gd.bond(r.giveBondId) && !out.includes(r.giveBondId)) out.push(r.giveBondId);
  return out;
}

/**
 * Distinct tiers of board chess matching `pred(pieceView)`.
 * @param {MetaCtx} ctx
 * @param {(piece: PieceView) => boolean} [pred]
 */
export function distinctTiers(ctx, pred = () => true) {
  /** @type {Set<number | null>} */
  const tiers = new Set();
  for (const p of ctx.board()) if (p && p.kind === 'chess' && pred(p)) tiers.add(p.tier ?? ctx.gd.tierOf(p.id));
  return tiers;
}

/** Board piece at (row, col) or null. @param {MetaCtx} ctx @param {number} row @param {number} col */
export function boardPieceAt(ctx, row, col) {
  for (const p of ctx.board()) if (p.row === row && p.col === col) return p;
  return null;
}
/**
 * Board piece `k` tiles in front of a board piece, along its direction (`p.dir`, default RIGHT: col + k).
 * @param {MetaCtx} ctx @param {PieceView | null | undefined} p @param {number} [k]
 */
export const frontPiece = (ctx, p, k = 1) => {
  if (!p || !Number.isInteger(p.row) || !Number.isInteger(p.col)) return null;
  const [r, c] = frontOf(p.row, p.col, p.dir, k);
  return boardPieceAt(ctx, r, c);
};
/** @param {MetaCtx} ctx @param {PieceView | null | undefined} p @param {number} [k] */
export const behindPiece = (ctx, p, k = 1) =>
 frontPiece(ctx, p, -k);

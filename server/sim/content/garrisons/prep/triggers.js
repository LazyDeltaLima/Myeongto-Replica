// server/sim/content/garrisons/prep/triggers.js — prep-side 特质 that run other 特质 again (garrisons/meta.js header).

import { frontPiece } from '../../support/meta.js';
import { num, selfView, onBoard, chessOnBoard } from './shared.js';
/** @import { MetaCtx } from '../../../../match/effectsMeta.js' */
/** @import { PieceView } from '../../support/meta.js' */

/** @import { GarrisonHandlers } from './shared.js' */

/** effectKey → handler. @type {Record<string, GarrisonHandlers>} */
export const H = {};

// re-triggers — through the engine's ctx.triggerGarrisons (dispatcher: same handlers, 投资人 repeat for SERVER_GAIN,
// per-handler error isolation, shared depth cap)

/** @param {MetaCtx} ctx @param {PieceView | null | undefined} piece */
const garrisonsOfPiece = (ctx, piece) => {
  const rec = piece ? ctx.chessRecord(piece.id) : null;
  return /** @type {Record<string, any>[]} */ ((rec && Array.isArray(rec.garrisonIds) ? rec.garrisonIds : []).map((/** @type {string} */ gid) => ctx.gd.garrison(gid)).filter(Boolean));
};
/** @param {MetaCtx} ctx @param {PieceView} piece @param {string} eventType */
const hasEvent = (ctx, piece, eventType) => garrisonsOfPiece(ctx, piece).some((g) => g.eventType === eventType);

/**
 * Run the garrisons of the owned chess `piece` whose eventType is `eventType` once more (ctx.triggerGarrisons).
 * `asPiece` runs them as that piece's own trait (塞雷娅 / 白面鸮 "特质与其相同"). SERVER_GAIN repeats ×投资人.
 * Returns the number of garrison effects run.
 * @param {MetaCtx} ctx @param {PieceView | null | undefined} piece @param {string} eventType
 * @param {{ asPiece?: PieceView | null }} [opts]
 */
export function runGarrisonsOf(ctx, piece, eventType, { asPiece = null } = {}) {
  if (!ctx || typeof ctx.triggerGarrisons !== 'function' || !piece || piece.kind !== 'chess' || !Number.isInteger(piece.uid)) return 0;
  const opts = asPiece && Number.isInteger(asPiece.uid) ? { asUid: asPiece.uid } : {};
  return ctx.triggerGarrisons(piece.uid, eventType, opts) | 0;
}

/**
 * Run the 获得时 (SERVER_GAIN) garrisons of an owned chess piece once more (×投资人). Returns the effects run.
 * @param {MetaCtx} ctx @param {PieceView | null | undefined} piece
 */
export function triggerGainEffects(ctx, piece) {
  const p = piece && Number.isInteger(piece.uid) && piece.uid > 0 ? (ctx.piece(piece.uid) || piece) : piece;
  if (!p || p.kind !== 'chess') return 0;
  return runGarrisonsOf(ctx, p, 'SERVER_GAIN');
}

// 铃兰 60_a: "<进入休整期时>触发身前一格的其他干员的“获得时”类效果" (scope front)
// 瑰盐 82: "<售出时>触发场上一名拥有“休整期结束时”的干员的特质（优先触发部署位置更靠上的和更靠右的）" (scope farright).
// DESIGN §3: row 0 is the bottom, so "更靠上" = the highest row; then the highest column ("更靠右").
/** The bbStr.scope values SERVER_TRIGGER_ANOTHER reads; any other runs nothing (content/coverage.js reports it). */
export const TRIGGER_SCOPES = Object.freeze(['front', 'farright']);
H.SERVER_TRIGGER_ANOTHER = {
  run(ctx) {
    const { bbStr } = ctx.source;
    const event = bbStr.event || 'SERVER_GAIN';
    const self = selfView(ctx);
    if (!TRIGGER_SCOPES.includes(bbStr.scope)) return;
    if (bbStr.scope === 'front') {
      if (!onBoard(self)) return;
      const f = frontPiece(ctx, self);
      if (f && f.kind === 'chess' && f.uid !== self.uid) runGarrisonsOf(ctx, f, event);
      return;
    }
    const cands = chessOnBoard(ctx).filter((p) => (!self || p.uid !== self.uid) && hasEvent(ctx, p, event));
    cands.sort((a, b) => (b.row - a.row) || (b.col - a.col));
    if (cands.length) runGarrisonsOf(ctx, cands[0], event);
  },
};

// 铃兰 60_b: "<进入休整期时>触发身前两格的其他干员的“获得时”类效果" (the two tiles in front, nearest first)
H.SERVER_TRIGGER_FRONT_COUNT = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    const self = selfView(ctx);
    if (!onBoard(self)) return;
    for (let k = 1; k <= Math.min(8, num(bb.count, 1)); k++) {
      const f = frontPiece(ctx, self, k);
      if (f && f.kind === 'chess' && f.uid !== self.uid) runGarrisonsOf(ctx, f, bbStr.event || 'SERVER_GAIN');
    }
  },
};

// 塞雷娅 / 白面鸮: "身前一格干员若为“X”特质，本干员的特质与其相同" — the front operator's X garrisons run as the copier's
// own (self-relative effects use the copier's tile / bonds). A copier of the same kind in front copies what that one
// copies (the chain is followed, bounded).
/** @param {MetaCtx} ctx @param {string} eventType @param {string} selfKey */
function copyFront(ctx, eventType, selfKey) {

  const self = selfView(ctx);
  if (!onBoard(self)) return;
  let target = frontPiece(ctx, self);
  for (let i = 0; i < 8 && target && target.kind === 'chess'; i++) {
    const gs = garrisonsOfPiece(ctx, target).filter((g) => g.eventType === eventType);
    if (!gs.length) return;
    if (!gs.every((g) => g.effectKey === selfKey)) break;
    target = frontPiece(ctx, target);
  }
  if (!target || target.kind !== 'chess' || target.uid === self.uid) return;
  runGarrisonsOf(ctx, target, eventType, { asPiece: self });
}

H.SERVER_FRONT_SAME_EFFECT_PREP_FIN = {
  run(ctx) { copyFront(ctx, 'SERVER_PREP_FIN', 'SERVER_FRONT_SAME_EFFECT_PREP_FIN'); },
};
H.SERVER_FRONT_SAME_EFFECT_PREP_START = {
  run(ctx) { copyFront(ctx, 'SERVER_PREP_START', 'SERVER_FRONT_SAME_EFFECT_PREP_START'); },
};

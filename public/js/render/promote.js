// public/js/render/promote.js — which prep pieces were just promoted (精锐晋升), for the merge cue of render/app.js setPrep.
//
// A merge replaces the consumed normal copies by ONE new elite piece in the same m.private update: on the board tile of
// the consumed copy that deploys first when a copy was deployed (PRTS 卫戍协议/帮助 "若消耗已部署至作战区的干员，则发送至
// 作战区对应位置"; server board.js mergeTile), else in the hand / temp. So a promotion = a chess piece with a new uid that is
// an elite, while normal copies of the same operator (same baseId) vanished from the previous state. The cue then plays
// on the elite (fx.promote: gold pillar + rings, streaks from the vanished copies) instead of the plain deploy flash.

/**
 * A prep piece as setPrep lists it (render/app.js prepPieces): the fields read here.
 * @typedef {{ kind?: string, id: string, golden?: boolean, [key: string]: unknown }} PromotePiece
 * @typedef {(id: string) => { baseId?: string, isGolden?: boolean } | null | undefined} ChessOf
 */

/**
 * @template {{ uid: number, area: string, piece: PromotePiece }} E
 * @param {Array<E>} prev entries of the previous setPrep (render/app.js prepPieces)
 * @param {Array<E>} next entries of this setPrep
 * @param {ChessOf} chessOf chess record lookup (`baseId`, `isGolden`)
 * @returns {Map<number, Array<E>>} new elite uid → the vanished copies (prev entries)
 */
export function promotionsOf(prev, next, chessOf) {
  /** @type {Map<number, Array<E>>} */
  const out = new Map();
  if (!Array.isArray(prev) || !prev.length || !Array.isArray(next)) return out;
  const before = new Set(prev.map((e) => e.uid));
  const now = new Set(next.map((e) => e.uid));
  const baseOf = (/** @type {string} */ id) => chessOf(id)?.baseId || id;
  const isElite = (/** @type {PromotePiece} */ p) => !!(p?.golden || chessOf(p?.id)?.isGolden);
  const gone = prev.filter((e) => e.piece?.kind === 'chess' && !now.has(e.uid) && !isElite(e.piece));
  if (!gone.length) return out;
  /** @type {Set<number>} */
  const used = new Set();
  for (const e of next) {
    if (e.piece?.kind !== 'chess' || before.has(e.uid) || !isElite(e.piece)) continue;
    const base = baseOf(e.piece.id);
    const copies = gone.filter((g) => !used.has(g.uid) && baseOf(g.piece.id) === base);
    if (!copies.length) continue;
    for (const g of copies) used.add(g.uid);
    out.set(e.uid, copies);
  }
  return out;
}

/**
 * The elite chess pieces new in `next` (a uid `prev` lacks), each once, in `next`'s order — the official client's
 * ChessMapInfo._CheckSelfNewGainedChess → _OnSelfGainedNewChess plays ON_ACT1AUTOCHESS_CHAR_BONUS for every new elite
 * operator instance of the own map in the prep, whatever made it: a merge's elite (promotionsOf), one bought, granted
 * (a strategy, a reward, a 特质) or the 升华 buy. An elite that only moved keeps its uid (none); an in-place promotion
 * (博士投影, PlayerState.promote) keeps it too. The caller decides when the previous state counts (render/app.js setPrep:
 * not the first state of a page). docs/rules/audio.md 「배치 효과음」 「정예 합성음」.
 * @param {Array<{ uid: number, piece: PromotePiece }>} prev entries of the previous setPrep
 * @param {Array<{ uid: number, piece: PromotePiece }>} next entries of this setPrep
 * @param {ChessOf} chessOf chess record lookup (`isGolden`)
 * @returns {number[]} the new elites' uids
 */
export function newElitesOf(prev, next, chessOf) {
  if (!Array.isArray(next)) return [];
  /** @type {Set<number>} */
  const seen = new Set(Array.isArray(prev) ? prev.map((e) => e.uid) : []);
  /** @type {number[]} */
  const out = [];
  for (const e of next) {
    if (e?.piece?.kind !== 'chess' || seen.has(e.uid)) continue;
    seen.add(e.uid);
    if (e.piece.golden || chessOf(e.piece.id)?.isGolden) out.push(e.uid);
  }
  return out;
}

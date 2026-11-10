// server/sim/content/garrisons/prep/shared.js — what the prep-side 特质 families of garrisons/prep/*.js share.

export const ids = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
export const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d);

/** "（无需激活盟约）" → false; "使已激活的…" / "当前激活且…" / "自身已激活的盟约" → true. */
export function requireActiveOf(g) {
  const d = (g && g.desc) || '';
  if (d.includes('无需激活')) return false;
  return /已激活|激活且/.test(d);
}

export const bondOrder = (ctx) => (Array.isArray(ctx.gd && ctx.gd.bondIds) ? ctx.gd.bondIds : Object.keys(ctx.data.bonds || {}));

/** Active bond with the most layers (ties → bond data order), or null. */
export function topActiveBondMeta(ctx) {
  let best = null, bl = -1;
  for (const id of bondOrder(ctx)) {
    if (!ctx.bondActive(id)) continue;
    const l = ctx.layers(id);
    if (l > bl) { bl = l; best = id; }
  }
  return best;
}

/** Fresh view of the source piece (with row/col on the board). */
export function selfView(ctx) {
  const p = ctx.source && ctx.source.piece;
  if (!p) return null;
  const v = Number.isInteger(p.uid) && p.uid > 0 ? ctx.piece(p.uid) : null;
  return v || p;
}
export const onBoard = (v) => !!v && v.area === 'board' && Number.isInteger(v.row);
export const chessOnBoard = (ctx) => ctx.board().filter((p) => p && p.kind === 'chess');

export function addAll(ctx, bonds, n, requireActive) {
  let total = 0;
  if (!(n > 0)) return 0;
  for (const b of bonds) if (b) total += ctx.addLayers(b, n, { requireActive });
  return total;
}

export function sameRowCount(ctx, me) {
  if (!onBoard(me)) return 0;
  return chessOnBoard(ctx).filter((p) => p.row === me.row).length;
}
export function rowCondition(ctx, me) {
  const { bb, bbStr } = ctx.source;
  // 白面鸮 copying 歌蕾蒂娅's / 余's prep-start gift skips the three-in-a-row gate (GitHub #473, the reporter's official
  // footage BV1XJSoBzEFB 2:30–2:38, upstream 6bfc0827). Only these two copies: not a general change to copying, to
  // 塞雷娅, or to either original operator's own condition.
  const from = ctx.source.copiedFrom;
  if (from && ctx.source.garrison?.eventType === 'SERVER_PREP_START'
    && ctx.chessRecord(me?.id)?.charId === 'char_128_plosis'
    && ['char_474_glady', 'char_2026_yu'].includes(ctx.chessRecord(from.id)?.charId)) return true;
  if (bbStr.conditionkey === 'character_same_row') return sameRowCount(ctx, me) >= num(bb.check_count, 0);
  return true;
}

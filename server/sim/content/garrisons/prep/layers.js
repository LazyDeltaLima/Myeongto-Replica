// server/sim/content/garrisons/prep/layers.js — prep-side 特质: layer gains and the 规程 temp-layer conversions (garrisons/meta.js header).

import { metaBonds, frontPiece, behindPiece, distinctTiers } from '../../support/meta.js';
import { ids, num, requireActiveOf, topActiveBondMeta, selfView, onBoard, chessOnBoard, addAll, sameRowCount } from './shared.js';

/** effectKey → handler. */
export const H = {};

H.SERVER_ADD_BOND = {
  run(ctx) {
    const { bb, bbStr, garrison, piece } = ctx.source;
    const bonds = ids(bbStr.bond);
    // 录武官 (hidden 4_15) carries garrison_157 (【奇迹】+3) next to garrison_156 (【炎】+6、【奇迹】+3) with the same text:
    // the text grants 奇迹 once, so a bond already covered by the piece's SERVER_ADD_MULTIPLE_BOND is skipped.
    const rec = piece ? ctx.chessRecord(piece.id) : null;
    const covered = new Set();
    for (const gid of (rec && Array.isArray(rec.garrisonIds) ? rec.garrisonIds : [])) {
      const g = ctx.gd.garrison(gid);
      if (g && g !== garrison && g.effectType === 'SERVER_ADD_MULTIPLE_BOND' && g.eventType === garrison.eventType && g.desc === garrison.desc) for (const b of ids(g.bbStr && g.bbStr.bond)) covered.add(b);
    }
    addAll(ctx, bonds.filter((b) => !covered.has(b)), num(bb.count), requireActiveOf(garrison));
  },
};

H.SERVER_ADD_BOND_CHESS_ALL = {
  run(ctx) {
    const { bb, garrison } = ctx.source;
    addAll(ctx, metaBonds(ctx, ctx.source.piece), num(bb.count), requireActiveOf(garrison));
  },
};

H.SERVER_ADD_BOND_METHOD = {
  run(ctx) {
    const { bb, bbStr, garrison } = ctx.source;
    const multi = num(bb.multi, 1);
    const bonds = ids(bbStr.bond);
    const ra = requireActiveOf(garrison);
    const me = selfView(ctx);
    switch (bbStr.add_method) {
      case 'shoplv': addAll(ctx, bonds, ctx.shopLevel() * multi, ra); break;
      case 'round_gain_char': addAll(ctx, bonds, (ctx.roundStats().gainedChess | 0) * multi, ra); break;
      case 'hand_count': addAll(ctx, bonds, ctx.hand().filter((p) => p && p.kind === 'chess').length * multi, ra); break;
      case 'same_row': addAll(ctx, bonds, sameRowCount(ctx, me) * multi, ra); break;
      case 'same_bond_diff_lv':
        for (const b of bonds) addAll(ctx, [b], distinctTiers(ctx, (p) => metaBonds(ctx, p).includes(b)).size * multi, ra);
        break;
      default: break;
    }
  },
};

H.SERVER_ADD_MULTIPLE_BOND = {
  run(ctx) {
    const { bbStr, garrison } = ctx.source;
    const bonds = ids(bbStr.bond);
    const counts = ids(bbStr.count).map((x) => num(x));
    bonds.forEach((b, i) => addAll(ctx, [b], counts[i] ?? counts[counts.length - 1] ?? 0, requireActiveOf(garrison)));
  },
};

H.SERVER_ADD_BOND_ACTIVATED_MOST_LAYER = {
  run(ctx) {
    const b = topActiveBondMeta(ctx);
    if (b) ctx.addLayers(b, num(ctx.source.bb.count), { requireActive: true });
  },
};

H.SERVER_ADD_ACT_BOND_DIFF_LV_MOST_LAYER = {
  run(ctx) {
    const b = topActiveBondMeta(ctx);
    if (!b) return;
    const n = distinctTiers(ctx, (p) => metaBonds(ctx, p).includes(b)).size;
    ctx.addLayers(b, n * num(ctx.source.bb.multi, 1), { requireActive: true });
  },
};

H.SERVER_ADD_BOND_IN_HAND = {
  run(ctx) {
    const n = num(ctx.source.bb.count);
    for (const p of ctx.hand()) {
      if (!p || p.kind !== 'chess') continue;
      for (const b of metaBonds(ctx, p)) if (ctx.bondActive(b)) ctx.addLayers(b, n, { requireActive: true });
    }
  },
};

// "使自身及身后/身前一格干员的已激活盟约分别各层数+N": the trait's 付与对象 are two operators (PRTS 下半 更新记录 on
// 断崖: "自身外的付与对象从 身前一格干员 调整至 身后一格干员"); each target's active bonds get +N, so a bond both
// operators share gets +N twice (same per-operator reading as 流明 "每名干员所在的已激活盟约分别层数+N").
H.SERVER_ADD_BOND_POSITION = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    const me = selfView(ctx);
    if (!onBoard(me)) return;
    const other = bbStr.dir === 'behind' ? behindPiece(ctx, me) : frontPiece(ctx, me);
    const targets = [me];
    if (other && other.kind === 'chess' && other.uid !== me.uid) targets.push(other);
    for (const t of targets) for (const b of metaBonds(ctx, t)) if (ctx.bondActive(b)) ctx.addLayers(b, num(bb.count), { requireActive: true });
  },
};

H.SERVER_ADD_BOND_ROUND_COIN_COST = {
  run(ctx) {
    const { bb, bbStr, garrison } = ctx.source;
    const per = Math.max(1, num(bb.count, 1));
    addAll(ctx, ids(bbStr.bond), Math.floor((ctx.roundStats().spent | 0) / per) * num(bb.layer), requireActiveOf(garrison));
  },
};

H.SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER = {
  run(ctx) {
    const { bb, bbStr, garrison } = ctx.source;
    let n = (ctx.roundStats().refreshes | 0) * num(bb.multiplier);
    if (num(bb.max_layer, 0) > 0) n = Math.min(n, num(bb.max_layer));
    addAll(ctx, ids(bbStr.bond), n, requireActiveOf(garrison));
  },
};

// 拉普兰德 "<刷新时>若为本回合首次主动刷新…，此干员在整备区时也有效": the refresh count is the operator's own — the manual
// refreshes this copy witnessed this round (board or hand), so a 拉普兰德 bought after the round's first refresh still
// fires on the next one (players' report after 0.1.0: "获得该干员后该回合的首次刷新" also stacks — the official behaviour;
// read as each trait instance counting its own SERVER_REFRESH_SHOP triggers against bb.refresh_cnt). A re-triggered trait
// (ev.trigger) is no manual refresh: it neither fires nor counts. A new copy (bought, granted) starts at 0, and so does
// an elite merged this round: a new 拉普兰德, its own first manual refresh this round adds +8 even when its copies
// already fired (GitHub #169; the owner's decision of 2026-10-06 — PlayerState._mergeChess carries no counter over).
// A copy gained by a refresh's own effects (贾维's gift on every 6th refresh, or the elite that gift completes) did not
// witness that refresh: the dispatcher runs the chess that stood there when it happened (effectsMeta.js onRefresh), so
// her first is the next manual refresh (PR #196). [ASSUMED]: a copy bought after selling one this round is a new copy — "获得该干员后" — and fires on its own first
// refresh (the server cannot tell it from any other copy; each such +4 costs her price + a refresh − the 1-fund refund,
// and needs her in the shop again).
const REFRESH_CNT_KEY = 'garrison:SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT:refreshes'; // per-piece counter (module-prefixed)
H.SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT = {
  onRefresh(ctx, ev) {
    if (ev && ev.trigger) return;
    const { bb, bbStr, garrison, piece } = ctx.source;
    if (!piece || !Number.isInteger(piece.uid) || piece.uid <= 0) return;
    if (ctx.incPieceCounter(piece.uid, REFRESH_CNT_KEY) !== num(bb.refresh_cnt, 1)) return;
    addAll(ctx, ids(bbStr.bond), num(bb.layer), requireActiveOf(garrison));
  },
};

// 卫戍协议：规程 — 「<进入休整期时>…转化N层【X】临时层数为固定层数」: on the end of the own normal battle (SERVER_BATTLE_FIN →
// onBattleResult; the trait's owner on the board, conditionkey character_target_inboard), up to N of the 临时层数 that battle
// left (ctx.tempLayers) become fixed layers. 乌啾 (garrison_21) converts N per 【乌萨斯】 operator on the board
// (「场上每有一名【乌萨斯】干员」: board chess whose bonds hold it, the trait's owner included); 折桠 (garrison_184) N.
// [ASSUMED·CN: the server-side conversion is not in the client] 「场上」 = the prep board when the battle has ended (the
// operators the battle knocked out are on it again), and the conversion needs no active bond (none is named).
function convertTemp(ctx, perChar) {
  const { bb, bbStr } = ctx.source;
  const bond = String(bbStr.bond ?? '').trim();
  if (!bond || !(ctx.tempLayers(bond) > 0)) return;
  const by = String(bbStr.bond2 ?? bond).trim();
  const n = perChar ? chessOnBoard(ctx).filter((p) => metaBonds(ctx, p).includes(by)).length * num(bb.count) : num(bb.count);
  if (n > 0) ctx.convertTempLayers(bond, n);
}
H.SERVER_CONVERT_TEMP_BOND_BY_BOND_CHAR = { run(ctx) { convertTemp(ctx, true); } };
H.SERVER_CONVERT_TEMP_BOND = { run(ctx) { convertTemp(ctx, false); } };

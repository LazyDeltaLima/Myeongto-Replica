// server/sim/content/garrisons/prep/shop.js — prep-side 特质: prices, refreshes, funds and operators (garrisons/meta.js header).

import { ids, num, bondOrder, selfView, rowCondition } from './shared.js';

/** effectKey → handler. */
export const H = {};

// "购买价格为N": bb.price is the discount off the chess's tier price — 至简 (Ⅲ, 3 资金) carries 2 and 红豆 (Ⅰ, 2 资金)
// carries 1, and both texts say 购买价格为1 (read as the new price, 至简 cost 2; user playtest #5). The dispatcher runs
// this first on onPrice (effectsMeta.js), so bonds (远见 −1: 1 → 0) and strategies see the lowered price.
H.SERVER_CHESS_PRICE = {
  onPrice(ctx, ev) {
    const p = ctx.source.bb.price;
    if (!Number.isFinite(p) || !ev) return;
    ctx.modifyPrice(-p);
  },
};

H.SERVER_GAIN_FREE_REFRESH_COUNT = {
  run(ctx) { ctx.grantFreeRefresh(num(ctx.source.bb.count, 1)); },
};

H.SERVER_POOL_CHAR = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    if (!rowCondition(ctx, selfView(ctx))) return;
    for (let i = 0; i < Math.min(10, num(bb.count, 1)); i++) {
      const r = ctx.rollPool(bbStr.pool);
      if (r && r.kind === 'chess') ctx.grantChess(r.id, { golden: !!r.golden });
    }
  },
};

H.SERVER_MOST_BOND = {
  run(ctx) {
    if (!rowCondition(ctx, selfView(ctx))) return;
    let best = [], bc = 0;
    for (const id of bondOrder(ctx)) {
      const c = ctx.bondCount(id);
      if (c > bc) { bc = c; best = [id]; } else if (c === bc && c > 0) best.push(id);
    }
    const order = best.length > 1 ? ctx.rng.shuffle(best.slice()) : best;
    for (const bond of order) {
      const id = ctx.rollChess({ bond, maxTier: 6 });
      if (id && ctx.grantChess(id)) return;
    }
  },
};

H.SERVER_ONCE_GOLD = {
  run(ctx) { ctx.addPendingFunds(num(ctx.source.bb.count)); },
};

H.SERVER_ONCE_GOLD_WITH_BOND_CONDITION = {
  run(ctx) {
    const { bb, bbStr, where } = ctx.source;
    if (where === 'hand' && !ids(bbStr.bond).some((b) => ctx.bondActive(b))) return;
    ctx.addPendingFunds(num(bb.count));
  },
};

H.SERVER_SELL_CHESS_GAIN_SPECIAL_GOODS = {
  onSold(ctx) {
    const { bbStr } = ctx.source;
    const poolId = bbStr[`pool${ctx.shopLevel()}`] || bbStr.max_pool;
    const pool = ctx.data.choices && ctx.data.choices.pools ? ctx.data.choices.pools[poolId] : null;
    const tier = pool && Number.isInteger(pool.tier) ? pool.tier : null;
    const count = Math.max(1, num(ctx.gd.rewardOffer ? ctx.gd.rewardOffer().count : 3, 3));
    const list = [];
    for (let i = 0; i < count * 4 && list.length < count; i++) {
      const r = ctx.rollPool(poolId);
      if (r && r.kind === 'chess' && !list.includes(r.id)) list.push(r.id);
    }
    if (list.length) ctx.offerChess(list, { tier });
    else if (tier) ctx.offerChess(null, { tier });
  },
};

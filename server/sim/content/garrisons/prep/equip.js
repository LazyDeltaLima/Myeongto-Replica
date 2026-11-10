// server/sim/content/garrisons/prep/equip.js — prep-side 特质: equipment (garrisons/meta.js header).

import { ids, num } from './shared.js';

/** effectKey → handler. */
export const H = {};

H.SERVER_GAIN_EQUIP = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    if (!ctx.gd.item(bbStr.chess)) return;
    // 诗怀雅 / 卡涅利安 / 耶拉 / 缪尔赛思's trait-fixed equipment has no quantity cap (路标月报#2 item 7):
    // noPool — no stock gate, no shared copy. NOT a blanket trait exemption: the pool-draw traits
    // (洛洛 91 SERVER_POOL_EQUIP / 焰尾 149 SERVER_POOL_CHAR, sub-pools of the shared pools) stay pool-bound.
    for (let i = 0; i < Math.min(10, num(bb.count, 1)); i++) ctx.grantItem(bbStr.chess, { noPool: true });
  },
};

H.SERVER_GAIN_RANDOM_EQUIP_CHESS_IN_POOL = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    const rounds = ids(bbStr.round_list).map((x) => num(x, -1));
    if (rounds.length && !rounds.includes(ctx.round)) return;
    for (let i = 0; i < Math.min(10, num(bb.count, 1)); i++) {
      const r = ctx.rollPool(bbStr.pool);
      const id = r && r.kind === 'item' ? r.id : ctx.rollItem({ maxTier: ctx.shopLevel() });
      if (id) ctx.grantItem(id);
    }
  },
};

/** Weighted item roll of an equip pool; elite garrisons use the pool's `goldenWeights` when present. */
function rollEquip(ctx, poolId, golden) {
  const pool = ctx.data.choices && ctx.data.choices.pools ? ctx.data.choices.pools[poolId] : null;
  if (golden && pool && Array.isArray(pool.weighted) && Array.isArray(pool.goldenWeights) && pool.goldenWeights.length === pool.weighted.length) {
    const pairs = pool.weighted.map((x, i) => [x[0], Math.max(0, num(pool.goldenWeights[i]))]).filter(([id, w]) => w > 0 && ctx.gd.item(id));
    let total = 0;
    for (const [, w] of pairs) total += w;
    if (total > 0) {
      let r = ctx.rng() * total;
      for (const [id, w] of pairs) { r -= w; if (r < 0) return id; }
      return pairs[pairs.length - 1][0];
    }
  }
  const r = ctx.rollPool(poolId);
  return r && r.kind === 'item' ? r.id : null;
}

H.SERVER_POOL_EQUIP = {
  run(ctx) {
    const { bb, bbStr, garrisonId } = ctx.source;
    const golden = /_b$/.test(garrisonId);
    for (let i = 0; i < Math.min(10, num(bb.count, 1)); i++) {
      const id = rollEquip(ctx, bbStr.pool, golden);
      if (id) ctx.grantItem(id);
    }
  },
};

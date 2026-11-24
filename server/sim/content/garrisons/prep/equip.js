// server/sim/content/garrisons/prep/equip.js — prep-side 特质: equipment (garrisons/meta.js header).

import { ids, num } from './shared.js';
/** @import { MetaCtx } from '../../../../match/effectsMeta.js' */

/** @import { GarrisonHandlers } from './shared.js' */

/** effectKey → handler. @type {Record<string, GarrisonHandlers>} */
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

/**
 * Weighted item roll of an equip pool; elite garrisons use the pool's `goldenWeights` when present.
 * @param {MetaCtx} ctx @param {string} poolId @param {boolean} golden
 */
function rollEquip(ctx, poolId, golden) {
  const pool = ctx.data.choices && ctx.data.choices.pools ? ctx.data.choices.pools[poolId] : null;
  if (golden && pool && Array.isArray(pool.weighted) && Array.isArray(pool.goldenWeights) && pool.goldenWeights.length === pool.weighted.length) {
    const pairs = pool.weighted.map((/** @type {[string, number]} */ x, /** @type {number} */ i) => [x[0], Math.max(0, num(pool.goldenWeights[i]))]).filter((/** @type {[string, number]} */ [id, w]) => w > 0 && ctx.gd.item(id));

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

// 规程 白铁 garrison_84 「<进入休整期时>使自身携带的装备变为精锐版本」: each equipment it carries becomes its elite (ctx.upgradeItem —
// the shared stock gate of an upgrade applies: a normal piece whose elite has no copy left stays as it is), and each one
// upgraded comes off into the 装备区 (overflow: the hidden queue) — official footage BV1egWJ66Ejp (upstream 7833db21,
// PR #937); one already elite stays on
H.SERVER_UPGRADE_SELF_EQUIP = {
  run(ctx) {
    const p = ctx.source.piece && Number.isInteger(ctx.source.piece.uid) ? ctx.piece(ctx.source.piece.uid) : null;
    for (const it of (p && Array.isArray(p.items) ? [...p.items] : [])) if (ctx.upgradeItem(it.uid)) ctx.unequipDirect(it.uid);
  },
};

// 规程 酒神 garrison_158 「<进入休整期时>获得一件随机装备（不高于当前调度中心等级）」, elite 159 「…两件…」: the count is in the text
// only (bb is empty) — a weighted roll of the equipment at most the 调度中心 level, per piece. The elite chess carries
// two records with the same text (158_b and 159_b, both 「两件」): the text gives two, so only the first runs, as 录武官's
// doubled 奇迹 (layers.js SERVER_ADD_BOND) [ASSUMED·자료 없음: the table holds both; nothing says the official server
// runs one].
H.SERVER_GAIN_RANDOM_EQUIP = {
  run(ctx) {
    const { garrison, piece } = ctx.source;
    const rec = piece ? ctx.chessRecord(piece.id) : null;
    const first = (rec && Array.isArray(rec.garrisonIds) ? rec.garrisonIds : []).map((gid) => ctx.gd.garrison(gid))
      .find((g) => g && g.effectKey === garrison?.effectKey && g.eventType === garrison?.eventType && g.desc === garrison?.desc);
    if (first && first !== garrison) return;
    const n = /两件/.test(ctx.source.garrison?.desc || '') ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const id = ctx.rollItem({ maxTier: ctx.shopLevel() });
      if (id) ctx.grantItem(id);
    }
  },
};

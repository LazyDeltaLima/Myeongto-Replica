// server/sim/content/garrisons/prep/shop.js — prep-side 特质: prices, refreshes, funds and operators (garrisons/meta.js header).

import { ids, num, bondOrder, selfView, rowCondition, growingValue } from './shared.js';

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

// 余 garrison_37 and 规程's garrison_174 give any tier (their texts give no cap). 规程's 伊桑 garrison_200 「<售出时>…
// （不高于当前调度中心等级；无法获得自身）」 caps the tier at the shop level and never gives his own operator — read from
// the text, the records carry no blackboard for either.
H.SERVER_MOST_BOND = {
  run(ctx) {
    if (!rowCondition(ctx, selfView(ctx))) return;
    const desc = ctx.source.garrison?.desc || '';
    const maxTier = desc.includes('不高于当前调度中心等级') ? Math.max(1, ctx.shopLevel()) : 6;
    const selfChar = desc.includes('无法获得自身') ? ctx.chessRecord(ctx.source.piece?.id)?.charId ?? null : null;
    const notSelf = selfChar ? (x) => ctx.chessRecord(x)?.charId !== selfChar : undefined;
    let best = [], bc = 0;
    for (const id of bondOrder(ctx)) {
      // a bond with no member operator (绝技 suntShip counts every operator on the board) has no one to give: it is not
      // a candidate, so a 绝技 count above the others does not leave the trait empty (upstream 7f698e80, PR #931 —
      // official sale captures with 3 elites and 2 助力 members give a 助力 operator)
      if (!(ctx.gd.bond(id)?.members?.length > 0)) continue;
      const c = ctx.bondCount(id);
      if (c > bc) { bc = c; best = [id]; } else if (c === bc && c > 0) best.push(id);
    }
    const order = best.length > 1 ? ctx.rng.shuffle(best.slice()) : best;
    for (const bond of order) {
      const id = ctx.rollChess({ bond, maxTier, filter: notSelf });
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

// 规程's 海沫 garrison_27 「<休整期结束时>自身售出价格+1（自身售出价格至多为4）」 (精锐 +2, 至多 8): the piece's own price
// (PlayerState.sellPriceOf) grows by `count` up to its chess's price + `max` — every chess of 规程 sells for 1: 1 + 3 = 4,
// 1 + 7 = 8. On the board only (conditionkey character_target_inboard: the dispatcher skips the hand). An elite merged
// from the copies keeps their raises, added up on its own price (PlayerState._mergeChess; a CN player's report).
H.SERVER_SELF_SELL_PRICE_DELTA = {
  run(ctx) {
    const { bb, piece } = ctx.source;
    if (!piece || !(piece.uid > 0)) return;
    const cur = ctx.sellPrice(piece.uid);
    const cap = ctx.gd.sellPrice(piece.id) + num(bb.max, 0);
    if (cur < cap) ctx.setSellPrice(piece.uid, Math.min(cap, cur + num(bb.count, 1)));
  },
};

// 规程's 温蒂 garrison_30 「售出价格为3」 (精锐 6): the chess's own price, which GameData.sellPrice reads from the record (an
// elite merged from two copies runs no 获得时 特质, and sells at 6 all the same) — nothing to run here
H.SERVER_SELF_SELL_PRICE_FIXED = {};

// 规程's 灵知 garrison_55 「<获得时>获得一次特殊刷新，下次刷新至少出现一名谢拉格干员」 (精锐 两名): as 佩佩's special refresh
// (bands/meta.js up_shop_next_refresh_must_present_bond_char) the player's next manual refresh, paid as usual (no 免费 in
// the text), afterwards shows at least `count` chess of the bond (SPECIAL_REFRESH below, a player-level hook: selling 灵知
// first keeps it). A second one before that refresh does not add up — the larger count stays, as 佩佩's do not stack
// [ASSUMED·화면: which cards are drawn again (here the chess cards without the bond, left to right); stacking].
const specialKey = (bond) => `gar:specialRefresh:${bond}`;
H.SERVER_GAIN_SPECIAL_REFRESH_BOND_CHAR = {
  run(ctx) {
    const { bb, bbStr } = ctx.source;
    for (const b of ids(bbStr.bond)) ctx.setCounter(specialKey(b), Math.max(ctx.counter(specialKey(b)), num(bb.count, 1)));
  },
};

/** The pending special refreshes of 灵知 (registered as global:garrison_special_refresh, garrisons/meta.js). */
export const SPECIAL_REFRESH = {
  onRefresh(ctx, ev) {
    if (ev && ev.trigger) return;
    for (const bond of bondOrder(ctx)) {
      const need = ctx.counter(specialKey(bond));
      if (!(need > 0)) continue;
      ctx.setCounter(specialKey(bond), 0);
      const has = (id) => { const c = ctx.gd.chess(id); return !!(c && Array.isArray(c.bonds) && c.bonds.includes(bond)); };
      const slots = ctx.shopSlots();
      let n = slots.filter((s) => s && s.kind === 'chess' && !s.sold && has(s.id)).length;
      for (let i = 0; i < slots.length && n < need; i++) {
        const s = slots[i];
        if (!s || s.kind !== 'chess' || s.sold || has(s.id)) continue;
        const id = ctx.rollChess({ bond, maxTier: Math.max(1, ctx.shopLevel()) });
        if (!id) break;
        ctx.setShopSlot(i, { kind: 'chess', id });
        n++;
      }
    }
  },
};

// 规程 忍冬 garrison_74 「<获得时>获得{showtag_value_1}次免费刷新（触发2次后升级，至多获得3次免费刷新）」 (shared.js growingValue)
H.SERVER_GAIN_FREE_REFRESH_UPGRADE_COUNT = {
  run(ctx) { ctx.grantFreeRefresh(growingValue(ctx)); },
};

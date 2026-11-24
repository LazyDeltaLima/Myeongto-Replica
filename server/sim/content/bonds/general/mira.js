// server/sim/content/bonds/general/mira.js — 奇迹 (miraShip): 卫戍协议：规程's 100-layer template. Its free refresh is
// addon/meta.js (bond_refresh_shop_next_free).
//
//   bond_layer_shop_same_tier   (bb layer) 「<首次到达100层>调度中心刷新时至少出现一名等同于当前调度中心等级的干员」: from the
//                               first time the layers reach `layer` (latched while the bond is active, caught up when it
//                               lights up, as 远见's discount), every shop roll — the round start's, a manual refresh, a
//                               指令's refresh — draws its RIGHTMOST operator card again at the 调度中心's level (shared
//                               pool, copy-weighted). The other cards are drawn as usual, so one of that tier may show
//                               there too: the guarantee is independent of them (official CN recordings, maintainer
//                               decision 2026-11-22: level 5, a round start — the rightmost and the 3rd from the left tier
//                               5). A 指令 that fixes the rightmost cards itself (雅拉's 人才锁定, onRefresh `pinned`) keeps
//                               them, and 奇迹's card is the one left of them (level 6: the two rightmost both tier 6).
// [ASSUMED·서버: the shop roll is the server's — at a round start only a card drawn anew counts (a frozen card stays and
// the rightmost card drawn anew is redrawn); a refresh some other effect triggers (onRefresh `trigger`) is skipped; it
// works while 奇迹 is active]

import { settler } from '../templates.js';
/** @import { MetaCtx, MetaHandlers } from '../../../../match/effectsMeta.js' */
/** @import { PrepTemplate } from '../templates.js' */

const KEY = 'bond_layer_shop_same_tier';
const C_ON = 'bondaddon:mira:sameTier';
const n = (/** @type {unknown} */ v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** @param {MetaCtx} ctx */
function layerOf(ctx) {
  const rec = ctx.data?.bonds?.miraShip;
  const b = (Array.isArray(rec?.buffs) ? rec.buffs : []).find((/** @type {Record<string, any> | null} */ x) => x && x.key === KEY);
  return n(b?.bb?.layer, Infinity);
}

/** @param {MetaCtx} ctx */
function latch(ctx) {
  if (!ctx.bondActive('miraShip') || ctx.counter(C_ON) > 0) return;
  if (ctx.layers('miraShip') >= layerOf(ctx)) ctx.setCounter(C_ON, 1);
}

/**
 * Redraw the rightmost operator card at the 调度中心's level, left of the `pinned` rightmost cards a 指令 fixed.
 * @param {MetaCtx} ctx @param {{ fresh?: number[] | null, pinned?: number }} [o] fresh: the positions drawn anew (null = all)
 */
function guarantee(ctx, { fresh = null, pinned = 0 } = {}) {
  latch(ctx);
  if (ctx.counter(C_ON) <= 0 || !ctx.bondActive('miraShip')) return;
  const slots = ctx.shopSlots();
  const ops = slots.map((s, i) => (s && s.kind === 'chess' && !s.sold ? i : -1)).filter((i) => i >= 0);
  const free = ops.slice(0, Math.max(0, ops.length - Math.max(0, pinned)));
  const pool = fresh ? free.filter((i) => fresh.includes(i)) : free;
  if (!pool.length) return;
  const id = ctx.rollChess({ tier: ctx.shopLevel() });
  if (id) ctx.setShopSlot(pool[pool.length - 1], { kind: 'chess', id });
}

/** @returns {MetaHandlers} */
const part = () => ({
  ...settler('miraShip', latch),
  onRoundStart(ctx, ev) {
    // (replaces settler's onRoundStart: guarantee() latches first)
    guarantee(ctx, { fresh: Array.isArray(ev?.shopFresh) ? ev.shopFresh : [] });
  },
  onRefresh(ctx, ev) {
    if (!ev || ev.trigger) return;
    guarantee(ctx, { pinned: Number.isInteger(ev.pinned) ? ev.pinned : 0 });
  },
});

/** @type {Readonly<Record<string, PrepTemplate>>} */
export const TEMPLATES = Object.freeze({
  [KEY]: { bonds: ['miraShip'], prep: part },
});

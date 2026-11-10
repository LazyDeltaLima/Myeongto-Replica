// server/sim/content/bonds/general/mira.js — 奇迹 (miraShip): 卫戍协议：规程's 100-layer template. Its free refresh is
// addon/meta.js (bond_refresh_shop_next_free).
//
//   bond_layer_shop_same_tier   (bb layer) 「<首次到达100层>调度中心刷新时至少出现一名等同于当前调度中心等级的干员」: from the
//                               first time the layers reach `layer` (latched while the bond is active, caught up when it
//                               lights up, as 远见's discount), a refresh whose operator slots show none of the
//                               调度中心's level redraws one of them at that tier (shared pool, copy-weighted)
// [ASSUMED·서버: the shop roll is the server's — which refreshes (the manual ones, onRefresh, as 奇迹's free refresh; not
// the round start's roll), which slot is redrawn (a random operator slot) and that it works while 奇迹 is active]

import { settler } from '../templates.js';

const KEY = 'bond_layer_shop_same_tier';
const C_ON = 'bondaddon:mira:sameTier';
const n = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function layerOf(ctx) {
  const rec = ctx.data?.bonds?.miraShip;
  const b = (Array.isArray(rec?.buffs) ? rec.buffs : []).find((x) => x && x.key === KEY);
  return n(b?.bb?.layer, Infinity);
}

function latch(ctx) {
  if (!ctx.bondActive('miraShip') || ctx.counter(C_ON) > 0) return;
  if (ctx.layers('miraShip') >= layerOf(ctx)) ctx.setCounter(C_ON, 1);
}

const part = () => ({
  ...settler('miraShip', latch),
  onRefresh(ctx, ev) {
    if (!ev || ev.trigger) return;
    latch(ctx);
    if (ctx.counter(C_ON) <= 0 || !ctx.bondActive('miraShip')) return;
    const tier = ctx.shopLevel();
    const slots = ctx.shopSlots();
    const idx = slots.map((s, i) => (s && s.kind === 'chess' && !s.sold ? i : -1)).filter((i) => i >= 0);
    if (!idx.length || idx.some((i) => ctx.gd.tierOf(slots[i].id) === tier)) return;
    const id = ctx.rollChess({ tier });
    if (id) ctx.setShopSlot(ctx.rng.pick(idx), { kind: 'chess', id });
  },
});

export const TEMPLATES = Object.freeze({
  [KEY]: { bonds: ['miraShip'], prep: part },
});

// server/sim/content/bonds/general/visi.js — 远见 (visiShip): 卫戍协议：规程's discount template. Its funds
// (bond_layer_gain_coin) and the default season's discount are bonds/templates.js.
//
//   bond_goods_disc_tier2   (bbStr layer_list "80,150", bond, bb discount) the first time the layers reach each step of
//                           layer_list, the `bond` operators cost −`discount` more, permanently: 80 → −1, 150 → −2
//                           (「<首次到达150层>所有【远见】干员购买价格额外永久-1资金」 — still the 远见 operators only, where the
//                           default season's 150 widens the −1 to every operator)
// The steps latch only while the bond is active and are caught up when it lights up, as the default season's latch
// (bonds/templates.js); the price never goes below 0 (ctx.modifyPrice).

import { settler } from '../templates.js';
/** @import { MetaCtx, MetaHandlers } from '../../../../match/effectsMeta.js' */
/** @import { PrepTemplate } from '../templates.js' */

const KEY = 'bond_goods_disc_tier2';
const C_STEPS = 'bondaddon:visi:tier2';
const n = (/** @type {unknown} */ v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** `{ ...bb, ...bbStr }` of the bond's buff `KEY` from the match data, or {}. @param {MetaCtx} ctx @param {string} bondId @returns {Record<string, any>} */
function params(ctx, bondId) {
  const rec = ctx.data?.bonds?.[bondId];
  const b = (Array.isArray(rec?.buffs) ? rec.buffs : []).find((/** @type {Record<string, any> | null} */ x) => x && x.key === KEY);
  return b ? { ...(b.bb || {}), ...(b.bbStr || {}) } : {};
}

/** The layer steps of `layer_list` ("80,150" → [80, 150]). @param {Record<string, any>} p */
export function discountSteps(p) {
  return String(p.layer_list ?? '').split(',').map((s) => Number(s.trim())).filter((v) => Number.isFinite(v) && v > 0);
}

/** @param {MetaCtx} ctx */
function latch(ctx) {
  if (!ctx.bondActive('visiShip')) return;
  const L = ctx.layers('visiShip');
  const t = discountSteps(params(ctx, 'visiShip')).filter((s) => L >= s).length;
  if (t > ctx.counter(C_STEPS)) {
    ctx.setCounter(C_STEPS, t);
    ctx.toast('【远见】远见干员购买价格永久降低', 'info');
  }
}

/** @returns {MetaHandlers} */
const part = () => ({
  ...settler('visiShip', latch),
  onPrice(ctx, ev) {
    if (!ev || ev.kind !== 'chess') return;
    const t = ctx.counter(C_STEPS);
    if (t <= 0) return;
    const p = params(ctx, 'visiShip');
    const disc = n(p.discount);
    if (!(disc > 0)) return;
    const rec = ctx.chessRecord(ev.id);
    if (!rec || !Array.isArray(rec.bonds) || !rec.bonds.includes(p.bond || 'visiShip')) return;
    ctx.modifyPrice(-disc * t);
  },
});

/** @type {Readonly<Record<string, PrepTemplate>>} */
export const TEMPLATES = Object.freeze({
  [KEY]: { bonds: ['visiShip'], prep: part },
});

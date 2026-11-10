// server/sim/content/bonds/templates.js — prep templates that are no one bond's: a bond record carrying one of them gets
// its handler part (bonds/dispatch.js registerMeta puts the parts of one bond together).
//
//   bond_layer_added_reward_equip   every `layer` layers → `count` item(s) from `pool`: 维多利亚's 维式重锤 (both seasons),
//                                   卫戍协议：规程's 谢拉格 <每100层> 谢拉格不融冰 (payHammers)
//   bond_layer_gain_coin            every `layer` layers +`count` funds: 远见, 奇迹 (settleCoins)
//   bond_multi_layer_char_goods_price_bond_discount
//                                   远见: first time at `layer1` the `bond` chess cost −`discount`; first time at `layer2`
//                                   every chess costs −`discount` instead (latched, permanent)
//
// Milestones read the persistent layers and pay only while the bond is active (official tip "叠加的盟约…只有在盟约被激活时
// 才会发挥作用"); payouts owed for layers gained while it was inactive ("无需激活" sources such as 烛煌) are caught up as
// soon as it lights up — the onActiveBonds hook of the recompute that activated it, e.g. placing the third member in
// prep (the upstream maintainer's report of the official game, 2026-10-15, for the hammer; research 02 §3.3 / §8 Q7;
// [ASSUMED] the same timing for the funds and 远见's discount latch, which share its rule) — and the other hooks below
// catch up anything a capped nested dispatch skipped.
// Funds earned after the prep phase ended (助力 / 寒檀 / 号角 … prep-end layers — the match wipes leftover funds right
// after onPrepEnd) are paid as pending funds, credited at the next round start, so "获得…资金" is never silently lost
// [ASSUMED]; `global:bondaddon_prepend` (first in every dispatch) marks the round whose prep has ended.
// 远见's −1 (「购买价格永久-1资金」) has no floor but 0: a price of 1 (至简 / 红豆's 购买价格为1 特质, run first on onPrice;
// 休露丝's first 谢拉格) becomes 0 — the text names none (owner's decision 2026-10-04; before 0.1.3 research 02 §3.15
// assumed 1).
// Latched state lives in player counters; onPrice only reads them (pure).

import * as S from '../support/index.js';
import { msg, dn } from '../../../../shared/i18n.js';
import { templatesOf } from './shared.js';

const num = S.num;
const n = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** `{ ...bb, ...bbStr }` of a bond buff from the match data (ctx.data), or {}. */
function buff(ctx, bondId, key) {
  const rec = ctx.data && ctx.data.bonds ? ctx.data.bonds[bondId] : null;
  for (const b of (rec && Array.isArray(rec.buffs) ? rec.buffs : [])) {
    if (b && b.key === key) return { ...(b.bb || {}), ...(b.bbStr || {}) };
  }
  return {};
}

// =====================================================================================================================
// the round whose prep has ended

const C_PREP_ENDED = 'bondaddon:prepEndedRound';

/** True between this round's onPrepEnd and the end of its PREP phase (leftover funds are about to be wiped). */
const prepEnded = (ctx) => ctx.phase === 'PREP' && ctx.counter(C_PREP_ENDED) === ctx.round;

/** The globals the templates need: `bondaddon_prepend` marks the round whose prep has ended. */
export function registerGlobals(registry) {
  registry.global('bondaddon_prepend', {
    onPrepEnd(ctx) { ctx.setCounter(C_PREP_ENDED, ctx.round); },
  });
}

// =====================================================================================================================
// bond_layer_added_reward_equip

const REWARD_KEY = 'bond_layer_added_reward_equip';
/** The counter of milestones paid, per bond. */
const REWARD_COUNTERS = Object.freeze({ victoriaShip: 'bond:victoria:hammers', kjeragShip: 'bond:kjerag:reward' });
const rewardCounter = (bondId) => REWARD_COUNTERS[bondId] ?? `bond:${bondId}:reward`;

/**
 * Layer reward milestones: every `layer` layers pay `count` item(s) of `pool` once (counter = milestones paid). A bond
 * effect, so it pays only while the bond is active; milestones crossed while it was inactive are paid as soon as it
 * lights up (above).
 */
export function payHammers(ctx, bondId = 'victoriaShip') {
  if (!ctx.bondActive(bondId)) return 0;
  const counter = rewardCounter(bondId);
  const p = S.buffParams(S.bondRecord(bondId, ctx), REWARD_KEY);
  const step = Math.floor(num(p?.layer, 0));
  if (!p || !(step > 0)) return 0;
  const due = Math.floor(ctx.layers(bondId) / step);
  const count = Math.max(0, Math.floor(num(p.count, 1)));
  let granted = 0, last = null;
  // re-read the counter every milestone: grantItem dispatches onGain, which re-enters this function (nested payments
  // must not be paid twice by the outer loop)
  for (let guard = 0; guard < 100; guard++) {
    const paid = ctx.counter(counter);
    if (paid >= due) break;
    ctx.setCounter(counter, paid + 1);
    for (let i = 0; i < count; i++) {
      const id = ctx.rollItem({ pool: p.pool });
      // onPrepEnd: grantItem stows this and does not merge until the next prep start, so a second copy does not
      // take an equipped hammer off for the fight (effectsMeta _deferItemMerge). [ASSUMED] every item that hook grants.
      if (id && ctx.grantItem(id, { source: `bond:${bondId}` })) { granted++; last = id; }
    }
  }
  if (granted && typeof ctx.toast === 'function') {
    if (bondId === 'victoriaShip') ctx.toast(msg('【维多利亚】获得{n}件维式重锤', { n: granted }), 'info');
    else {
      const who = S.bondRecord(bondId, ctx)?.name, name = ctx.gd?.item?.(last)?.name;
      if (who && name) ctx.toast(msg('{who}：获得{name}', { who: dn(who), name: dn(name) }), 'info');
    }
  }
  return granted;
}

/**
 * Hooks on which owed rewards are (caught up and) paid; onLayers only for the bond's own gains; onActiveBonds when the
 * active set changes (the bond lighting up — payHammers reads the counter, so the reward of a milestone comes once
 * however often the bond goes off and on again).
 */
const HAMMER_HOOKS = Object.freeze(['onLayers', 'onActiveBonds', 'onRoundStart', 'onPrepStart', 'onPrepEnd', 'onBuy', 'onGain', 'onSold', 'onMerge']);

function rewardPart(bondId) {
  const h = {};
  for (const hook of HAMMER_HOOKS) {
    h[hook] = (ctx, ev) => {
      if (hook === 'onLayers' && !(ev && ev.bondId === bondId)) return;
      payHammers(ctx, bondId);
    };
  }
  return h;
}

// =====================================================================================================================
// bond_layer_gain_coin

/** Hooks on which owed milestones are caught up (besides the bond's own onLayers): onActiveBonds when the bond lights up. */
const SETTLE_HOOKS = Object.freeze(['onActiveBonds', 'onRoundStart', 'onPrepStart', 'onPrepEnd', 'onBuy', 'onGain', 'onSold', 'onMerge']);
const COIN_COUNTERS = Object.freeze({ visiShip: 'bondaddon:visi:paid', miraShip: 'bondaddon:mira:paid' });

/** Pay "every `layer` layers +`count` funds" up to the current layers (only while active). */
export function settleCoins(ctx, bondId) {
  if (!ctx.bondActive(bondId)) return 0;
  const p = buff(ctx, bondId, 'bond_layer_gain_coin');
  const step = n(p.layer), count = n(p.count);
  if (!(step > 0) || !(count > 0)) return 0;
  const counterKey = COIN_COUNTERS[bondId] ?? `bondaddon:${bondId}:paid`;
  const due = Math.floor(ctx.layers(bondId) / step);
  const paid = ctx.counter(counterKey);
  if (due <= paid) return 0;
  ctx.setCounter(counterKey, due);
  const gain = (due - paid) * count;
  const label = ctx.data?.bonds?.[bondId]?.name ?? bondId;
  if (prepEnded(ctx)) {
    ctx.addPendingFunds(gain);
    ctx.toast(msg('【{label}】层数达成，下回合开始时获得{gain}资金', { label: dn(label), gain }), 'info');
  } else {
    ctx.addFunds(gain, `bond:${bondId}`);
    ctx.toast(msg('【{label}】层数达成，获得{gain}资金', { label: dn(label), gain }), 'info');
  }
  return gain;
}

/** A handler part running `fn(ctx)` on every catch-up hook and on the bond's own layer gains. */
export function settler(bondId, fn) {
  const h = { onLayers(ctx, ev) { if (ev && ev.bondId === bondId) fn(ctx); } };
  for (const hook of SETTLE_HOOKS) h[hook] = (ctx) => fn(ctx);
  return h;
}

// =====================================================================================================================
// 远见's discount

const DISCOUNT_KEY = 'bond_multi_layer_char_goods_price_bond_discount';
const C_VISI_DISC = 'bondaddon:visi:disc';

function latchVisiDiscount(ctx) {
  if (!ctx.bondActive('visiShip')) return;
  const p = buff(ctx, 'visiShip', DISCOUNT_KEY);
  const L = ctx.layers('visiShip');
  const cur = ctx.counter(C_VISI_DISC);
  const t = L >= n(p.layer2, Infinity) ? 2 : L >= n(p.layer1, Infinity) ? 1 : 0;
  if (t > cur) {
    ctx.setCounter(C_VISI_DISC, t);
    ctx.toast(t >= 2 ? '【远见】所有干员购买价格永久降低' : '【远见】远见干员购买价格永久降低', 'info');
  }
}

function visiDiscountPart() {
  return {
    ...settler('visiShip', latchVisiDiscount),
    onPrice(ctx, ev) {
      if (!ev || ev.kind !== 'chess') return;
      const t = ctx.counter(C_VISI_DISC);
      if (t <= 0) return;
      const p = buff(ctx, 'visiShip', DISCOUNT_KEY);
      const disc = n(p.discount);
      if (!(disc > 0)) return;
      if (t < 2) {
        const rec = ctx.chessRecord(ev.id);
        if (!rec || !Array.isArray(rec.bonds) || !rec.bonds.includes(p.bond || 'visiShip')) return;
      }
      ctx.modifyPrice(-disc); // never below 0 (ctx.modifyPrice); 1 → 0 like any price (owner's decision 2026-10-04)
    },
  };
}

// =====================================================================================================================
// putting a bond's parts together

/**
 * Prep templates: template → { bonds (null: any bond), prep(bondId) → handler part }. The order of the parts of one
 * bond is PREP_ORDER.
 */
export const TEMPLATES = Object.freeze({
  [REWARD_KEY]: { bonds: null, prep: rewardPart },
  bond_layer_gain_coin: { bonds: null, prep: (bondId) => settler(bondId, (ctx) => settleCoins(ctx, bondId)) },
  [DISCOUNT_KEY]: { bonds: ['visiShip'], prep: visiDiscountPart },
});

/**
 * Every prep template of the bond files, in the order a bond's parts run on one hook (this one's, addon/meta.js's and
 * general/'s):
 * the reward first (it wrapped the handler before it), 远见's funds before its discount latch.
 */
export const PREP_ORDER = Object.freeze([
  REWARD_KEY, 'bond_activated_add_layer', 'bond_layer_gain_coin', DISCOUNT_KEY, 'bond_goods_disc_tier2',
  'bond_refresh_shop_next_free', 'bond_layer_shop_same_tier',
]);

/** One handler running each part's hook in turn (a handler registered before them first). */
function compose(parts) {
  if (parts.length === 1) return parts[0];
  const h = {};
  for (const p of parts) {
    for (const [hook, fn] of Object.entries(p)) {
      if (typeof fn !== 'function' || h[hook]) continue;
      const fns = parts.map((q) => q[hook]).filter((f) => typeof f === 'function');
      h[hook] = function composed(ctx, ev) { for (const f of fns) f.call(this, ctx, ev); };
    }
  }
  return h;
}

/**
 * Register `bond:<id>` handlers from the season's bond records: each record's templates found in `tables` (template →
 * { bonds, prep }), in PREP_ORDER. A template no table holds runs nothing (tools/season-coverage.mjs reports it).
 */
export function registerPrep(registry, data, tables) {
  for (const [bondId, rec] of Object.entries(data?.bonds ?? {})) {
    const have = templatesOf(rec);
    const parts = [];
    for (const key of PREP_ORDER) {
      if (!have.includes(key)) continue;
      const decl = tables.map((t) => t[key]).find(Boolean);
      if (!decl || typeof decl.prep !== 'function' || (decl.bonds && !decl.bonds.includes(bondId))) continue;
      parts.push(decl.prep(bondId));
    }
    if (!parts.length) continue;
    const prev = typeof registry.get === 'function' ? registry.get(`bond:${bondId}`) : null;
    registry.bond(bondId, compose(prev ? [prev, ...parts] : parts));
  }
}

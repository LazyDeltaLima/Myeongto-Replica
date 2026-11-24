// server/sim/content/bonds/addon/meta.js — prep side of the add-on bonds' own templates (research 02 §3.14–§3.17, §3.20).
//
//   bond_activated_add_layer       助力 deputShip: onPrepEnd every currently active bond +`layer` (tier 2 = 3 助力 by name
//                                  or elite state: +`more_layer`)
//   bond_refresh_shop_next_free    奇迹 miraShip: a manual refresh with no free refresh pending → p = min(1, baseprob +
//                                  prob·L) the next refresh is free. `probk` has no known meaning and is unused.
//   远见's funds and discount and 奇迹's funds (bond_layer_gain_coin, …_bond_discount): bonds/templates.js.
//   投资人          ×2 / ×3 "获得时" garrisons: EffectDispatcher.investRepeat (server/match/effectsMeta.js).
//   调和            +1 member count for core bonds: server/match/bondsMeta.js.
// bonds/dispatch.js registerMeta registers them from the season's records.

import { gameData } from '../../support/index.js';
import { TEMPLATES as COMMON, registerGlobals, registerPrep } from '../templates.js';
/** @import { MetaCtx, MetaHandlers, MetaRegistry } from '../../../../match/effectsMeta.js' */
/** @import { PrepTemplate } from '../templates.js' */

const n = (/** @type {unknown} */ v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** `{ ...bb, ...bbStr }` of a bond buff from the match data (ctx.data), or {}. @param {MetaCtx} ctx @param {string} bondId @param {string} key @returns {Record<string, any>} */
function buff(ctx, bondId, key) {
  const rec = ctx.data && ctx.data.bonds ? ctx.data.bonds[bondId] : null;
  for (const b of (rec && Array.isArray(rec.buffs) ? rec.buffs : [])) {
    if (b && b.key === key) return { ...(b.bb || {}), ...(b.bbStr || {}) };
  }
  return {};
}

/** @returns {MetaHandlers} */
const deputPart = () => ({
  onPrepEnd(ctx) {
    const me = ctx.bond('deputShip');
    if (!me || !me.active) return;
    const p = buff(ctx, 'deputShip', 'bond_activated_add_layer');
    const add = me.tier >= 2 ? n(p.more_layer, n(p.layer)) : n(p.layer);
    if (!(add > 0)) return;
    const active = Object.entries(ctx.bonds()).filter(([, b]) => b && b.active).map(([id]) => id);
    for (const id of active) ctx.addLayers(id, add, { requireActive: true, reason: 'bond:deputShip' });
  },
});

/** @returns {MetaHandlers} */
const miraRefreshPart = () => ({
  onRefresh(ctx, ev) {
    if (!ev || ev.trigger || !ctx.bondActive('miraShip')) return;
    if (ctx.grantFreeRefresh(0) > 0) return;
    const p = buff(ctx, 'miraShip', 'bond_refresh_shop_next_free');
    const chance = Math.max(0, Math.min(1, n(p.baseprob) + n(p.prob) * ctx.layers('miraShip')));
    if (ctx.rng() < chance) {
      ctx.grantFreeRefresh(1);
      ctx.toast('【奇迹】下次刷新不消耗资金', 'info');
    }
  },
});

/**
 * Prep templates of the add-on bonds: template → { bonds, prep(bondId) → handler part } (bonds/templates.js).
 * @type {Readonly<Record<string, PrepTemplate>>}
 */
export const TEMPLATES = Object.freeze({
  bond_activated_add_layer: { bonds: ['deputShip'], prep: deputPart },
  bond_refresh_shop_next_free: { bonds: ['miraShip'], prep: miraRefreshPart },
});

/** The add-on bonds' prep side alone (tests): the globals and the parts of these and the shared templates. @param {MetaRegistry} registry @param {Record<string, any>} [data] */
export function registerMeta(registry, data = gameData()) {
  registerGlobals(registry);
  const common = Object.fromEntries(Object.entries(COMMON).filter(([k]) => k !== 'bond_layer_added_reward_equip'));
  registerPrep(registry, data, [common, TEMPLATES]);
}

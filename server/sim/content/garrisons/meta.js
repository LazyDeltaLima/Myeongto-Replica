// server/sim/content/garrisons/meta.js — prep-side ("SERVER_*") 特质 (docs/META.md §2.3).
//
// One registry handler per effectKey (`garrison:<effectKey>`); the dispatcher calls it on the garrison's eventType hook
// with ctx.source = { piece, garrisonId, garrison, bb, bbStr, where }. Numbers come from the garrison's own bb / bbStr
// (normal `_a` and elite `_b` records). Layer wording: "（无需激活盟约）" → requireActive false; "已激活" / "激活且" →
// requireActive true. The dispatcher already repeats onGain garrisons ×2 / ×3 under 投资人 and skips hand pieces for
// conditionkey character_target_inboard.
//
// Re-triggers (铃兰 SERVER_TRIGGER_*, 瑰盐, 塞雷娅 / 白面鸮 "特质与其相同") go through the engine's
// ctx.triggerGarrisons (same handlers, 投资人 repeat, per-handler isolation, shared depth cap).
// triggerGainEffects(ctx, piece) is exported for 铃兰-style effects of other modules (bands.js 铃兰 御守之力).
//
// Files, by effect-key family: prep/layers.js (layer gains, 规程's temp-layer conversions), prep/shop.js (prices,
// refreshes, funds, operators), prep/equip.js (equipment), prep/triggers.js (re-triggers); prep/shared.js what they share.
//
// Decisions (documented, see research 02 §4 / 03 §5.5):
//   * "同一行有3名干员" / "同一行每有1名干员" count the trait's owner (board chess of that row, self included).
//   * POSITION "使自身及身后/身前一格干员的已激活盟约分别各层数+N": per target operator (a shared bond gets +N twice).
//   * 瑰盐 "优先…更靠上的和更靠右的": highest row first (DESIGN §3: row 0 is the bottom), then highest column.
//   * 购买价格为N (SERVER_CHESS_PRICE): bb.price is a discount off the tier price — 至简 (Ⅲ, 3) has 2 → 1, 红豆 (Ⅰ, 2)
//     has 1 → 1, exactly the N both official texts give (user playtest #5: 至简 costs 1). The dispatcher runs it before
//     every other onPrice modifier, so 远见's discount (to 0 at 150 layers since 0.1.3) and strategy caps act on the
//     lowered price.
//   * [ASSUMED] 余 SERVER_MOST_BOND: ties between most-member bonds are shuffled; the chess is a copy-weighted pool roll
//     of any tier (the text gives no tier cap); a bond without an available chess falls through to the next tied one.
//   * [ASSUMED] 松果: the "免费特殊招募" is a free pick-one offer of `rewardOffer.count` (3) chess of the pool's tier.
//   * 拉普兰德 SERVER_GAIN_BOND_LAYER_BY_REFRESH_CNT "若为本回合首次主动刷新": per copy — the first manual refresh this
//     operator witnesses in the round (players' report after 0.1.0); an elite merged this round is a new 拉普兰德 and
//     fires +8 on its own first one (GitHub #169, the owner's decision of 2026-10-06); [ASSUMED] a copy bought after
//     selling one this round is a new copy (fires on its own first refresh).
//     "本回合每刷新过1次" (SERVER_ADD_REFRESH_CNT_MULTIPLIER_BOND_LAYER, 阿罗玛 / 安洁莉娜 / 售出时)
//     fires on another event and reads the player's refreshes of the round (roundStats), like 本回合每获得过 / 每花费.

import { H as LAYERS } from './prep/layers.js';
import { H as SHOP, SPECIAL_REFRESH } from './prep/shop.js';
import { H as EQUIP } from './prep/equip.js';
import { H as TRIGGERS } from './prep/triggers.js';

export { requireActiveOf, topActiveBondMeta } from './prep/shared.js';
export { runGarrisonsOf, triggerGainEffects } from './prep/triggers.js';
/** @import { MetaHandlers, MetaRegistry } from '../../../match/effectsMeta.js' */
/** @import { GarrisonHandlers } from './prep/shared.js' */

/** effectKey → handler (the registered objects; an effect key in two families throws). */
export const HANDLERS = (() => {
  /** @type {Record<string, GarrisonHandlers>} */
  const out = {};
  for (const t of [LAYERS, SHOP, EQUIP, TRIGGERS]) {
    for (const [k, v] of Object.entries(t)) {
      if (Object.hasOwn(out, k)) throw new Error(`garrisons/prep: effect key ${k} twice`);
      out[k] = v;
    }
  }
  return Object.freeze(out);
})();

/** @param {MetaRegistry} registry */
export function registerMeta(registry) {

  // registered under garrison:<effectKey>: the dispatcher runs them with a 特质's source only (GarrisonCtx)
  for (const [key, h] of Object.entries(HANDLERS)) registry.garrison(key, /** @type {MetaHandlers} */ (h));

  // 灵知's special refresh waits for the player's next manual refresh, whether or not 灵知 is still owned (prep/shop.js)
  registry.global('garrison_special_refresh', SPECIAL_REFRESH);
}

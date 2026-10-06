// Official shop look (local patch, docs/LOCAL-PATCH.md "상점 화면"): the sprites of the client's own shop prefabs
// (ui/autochess/[uc]autochessbattle.ab — autochess_shop, autochess_shop_card_item, autochess_shop_cost_item,
// autochess_shop_bond_item) handed to public/css/shop-art.css as CSS variables on the shop bar. The web manifest
// (data/assets.json ui `shopPanel/*`, `shopCard/*`, `garrisonTypeIcon/*`) has nearly all of them, so every player gets
// the look; the price hexagon (`cost_bg_1` / `cost_bg_2`) is only in the local-client extraction (ui/battle) and falls
// back to upstream's CSS hexagon. Without the manifest sprites the bar keeps upstream's CSS look (no `has-shop-art`).
//
//   shopArt()            { cls, style } for the <section class="shopbar"> (ui/shopBar.js)
//   garrisonMarkUrl(c)   the card watermark: the type icon of the chess' 特质 (garrison eventTypeIcon — the prefab's
//                        `garrison_icon`, 65×65 at 35 % alpha, its sprite set at run time through the card's
//                        `_garrisonIcon`; matched against in-game screenshots 2026-10-06 — 刺玫 differs there, see the doc)

import { data, localAsset } from '../data.js';
import { uiUrl } from './assetUrls.js';

/** CSS variable → web manifest ui key (`shopPanel/…`, `shopCard/…`). */
const WEB = Object.freeze({
  '--sa-card-black': 'shopCard/bg_black',
  '--sa-card-common': 'shopCard/bg_common',
  '--sa-card-empty': 'shopCard/bg_empty',
  '--sa-card-deco': 'shopCard/deco_item',
  '--sa-card-frame1': 'shopCard/frame_lv1',
  '--sa-card-frame2': 'shopCard/frame_lv2',
  '--sa-card-frame3': 'shopCard/frame_lv3',
  '--sa-card-line': 'shopCard/repeat_line',
  '--sa-card-shadow': 'shopCard/shadow',
  '--sa-card-icematte': 'shopCard/ice_matte',
  '--sa-card-ice': 'shopCard/icon_ice',
  '--sa-card-item': 'shopCard/icon_item',
  '--sa-card-sq': 'shopCard/square_fx_1',
  '--sa-close': 'shopPanel/bg_close',
  '--sa-close-shadow': 'shopPanel/close_text_shadow',
  '--sa-x': 'shopPanel/icon_x',
  '--sa-money': 'shopPanel/bg_money',
  '--sa-lock': 'shopPanel/bg_lock',
  '--sa-frozen': 'shopPanel/frozen_bg_normal',
  '--sa-frozen-on': 'shopPanel/frozen_bg_unselect',
  '--sa-refresh': 'shopPanel/refresh_bg_normal',
  '--sa-free': 'shopPanel/cost_free',
  '--sa-up-disable': 'shopPanel/upgrade_disable',
  '--sa-up-max': 'shopPanel/upgrade_max',
  '--sa-up-frame': 'shopPanel/frame',
  '--sa-up-glow': 'shopPanel/frame_glow',
  '--sa-up-icon': 'shopPanel/icon',
  '--sa-up-level': 'shopPanel/level',
  '--sa-up-stripe': 'shopPanel/stripe_line',
  '--sa-up-deco-up': 'shopPanel/deco_up',
  '--sa-up-deco-down': 'shopPanel/deco_down',
  '--sa-shadow-total': 'shopPanel/shadow_total',
  '--sa-shadow-right': 'shopPanel/shadow_right',
});
/** CSS variable → local-client sprite (ui/battle), optional. */
const LOCAL = Object.freeze({
  '--sa-cost': 'cost_bg_1',
  '--sa-cost-grey': 'cost_bg_2',
});

let cache = { m: null, l: null, v: null };

/** { cls, style } of the shop bar: `has-shop-art` and the sprite variables, or nothing when the manifest lacks them. */
export function shopArt() {
  const m = data.get('assets');
  const l = data.get('local');
  if (cache.m === m && cache.l === l && cache.v) return cache.v;
  const vars = [];
  for (const [k, key] of Object.entries(WEB)) {
    const u = uiUrl(m, key);
    if (u) vars.push(`${k}:url("${u}")`);
  }
  let cost = false;
  for (const [k, name] of Object.entries(LOCAL)) {
    const u = localAsset('ui/battle', name);
    if (u) { vars.push(`${k}:url("${u}")`); cost = true; }
  }
  // the frames, the close box and the buttons carry the look: without them stay on upstream's CSS
  const ok = !!(uiUrl(m, 'shopCard/frame_lv1') && uiUrl(m, 'shopPanel/bg_close') && uiUrl(m, 'shopPanel/refresh_bg_normal'));
  const v = ok ? { cls: `has-shop-art${cost ? ' has-shop-cost' : ''}`, style: vars.join(';') } : { cls: '', style: '' };
  cache = { m, l, v };
  return v;
}

/**
 * The watermark of an operator card: its 特质's type icon (the large `garrisonTypeIcon/icon_*`), null when unknown.
 * @param {any} chess chess.json record
 */
export function garrisonMarkUrl(chess) {
  const gid = Array.isArray(chess?.garrisonIds) ? chess.garrisonIds[0] : null;
  const g = gid ? data.lookup('garrisons', gid) : null;
  const icon = typeof g?.eventTypeIcon === 'string' && /^icon_[a-z]+$/.test(g.eventTypeIcon) ? g.eventTypeIcon : null;
  return icon ? uiUrl(data.get('assets'), `garrisonTypeIcon/${icon}`) : null;
}

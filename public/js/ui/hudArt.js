// Official HUD look of the prep screen (local patch, docs/LOCAL-PATCH.md "정비 화면 HUD"): the sprites of the client's
// own prefabs (ui/autochess/[uc]autochessbattle.ab — autochess_hud_panel: the round bar, autochess_hud_bond_item: a bond
// disc, panel_prep_ready: 准备就绪) handed to public/css/hud-art.css as CSS variables on the game screen root. All are in
// the web manifest (data/assets.json ui `hudPanel/*`, `hudBondItem/*`, `prepReady/*`, `bondBoardIcon/*`), so every player
// gets the look; without them the screen keeps upstream's CSS look (no `has-hud-art`).
//
//   hudArt()                  { cls, style } for the game screen root (screens/game.js)
//   bondBoardStyle(max, tier) the disc board of one bond slot (ui/bondStrip.js): `bondBoardIcon/<max>_<tier>`, the
//                             prefab's runtime `_imgBoard` — full teal at the top tier, ring arcs below it, the grey
//                             ring `1_0` while inactive (matched against the in-game screenshots, 2026-10-06)

import { data } from '../data.js';
import { uiUrl } from './assetUrls.js';

/** CSS variable → web manifest ui key. */
const WEB = Object.freeze({
  '--ha-board': 'hudPanel/bg_board',
  '--ha-circle-l': 'hudPanel/bg_circle_left',
  '--ha-circle-r': 'hudPanel/bg_right',
  '--ha-deco-box': 'hudPanel/frame_deco_box',
  '--ha-deco-1': 'hudPanel/frame_deco_txt1',
  '--ha-deco-2': 'hudPanel/frame_deco_txt2',
  '--ha-deco-3': 'hudPanel/frame_deco_txt3',
  '--ha-frame-mid': 'hudPanel/frame_mid_normal',
  '--ha-frame-side': 'hudPanel/frame_left',
  '--ha-rest': 'hudPanel/bg_rest',
  '--ha-battle': 'hudPanel/bg_battle',
  '--ha-coop': 'hudPanel/bg_coop',
  '--ha-round': 'hudPanel/bg_round',
  '--ha-check': 'hudPanel/bg_check_btn',
  '--ha-matte': 'hudPanel/matte',
  '--ha-num': 'hudBondItem/matte_num',
  '--ha-ready': 'prepReady/ready_bg',
  '--ha-ready-frame': 'prepReady/ready_frame',
  '--ha-ready-icon': 'prepReady/ready_icon',
  '--ha-cancel': 'prepReady/cancel_bg',
  '--ha-cancel-icon': 'prepReady/cancel_icon',
});

let cache = { m: null, v: null };

/** { cls, style } of the game screen root: `has-hud-art` and the sprite variables, or nothing without the sprites. */
export function hudArt() {
  const m = data.get('assets');
  if (cache.m === m && cache.v) return cache.v;
  const vars = [];
  for (const [k, key] of Object.entries(WEB)) {
    const u = uiUrl(m, key);
    if (u) vars.push(`${k}:url("${u}")`);
  }
  const ok = !!(uiUrl(m, 'hudPanel/bg_board') && uiUrl(m, 'hudPanel/bg_rest') && uiUrl(m, 'prepReady/ready_bg') && uiUrl(m, 'bondBoardIcon/1_0'));
  const v = ok ? { cls: 'has-hud-art', style: vars.join(';') } : { cls: '', style: '' };
  cache = { m, v };
  return v;
}

/**
 * The official disc board of a bond slot (`--bb`, and `data-full` when the top tier is reached: its icon turns black).
 * @param {number} maxTier the bond's tier count (thresholds) @param {number} tier the reached tier (0 = inactive)
 * @returns {{ style: string, full: boolean }}
 */
export function bondBoardStyle(maxTier, tier) {
  const max = Math.max(1, Math.min(4, Math.trunc(Number(maxTier)) || 1));
  const t = Math.max(0, Math.min(max, Math.trunc(Number(tier)) || 0));
  const u = uiUrl(data.get('assets'), t > 0 ? `bondBoardIcon/${max}_${t}` : 'bondBoardIcon/1_0');
  return { style: u ? `--bb:url("${u}")` : '', full: t > 0 && t === max };
}

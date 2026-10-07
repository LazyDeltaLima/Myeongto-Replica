// Official HUD look of the prep screen (local patch, docs/LOCAL-PATCH.md "정비 화면 HUD"): the sprites of the client's
// own prefabs (ui/autochess/[uc]autochessbattle.ab — autochess_hud_panel: the round bar, autochess_hud_bond_item: a bond
// disc, panel_prep_ready: 准备就绪) handed to public/css/hud-art.css as CSS variables on the game screen root. All are in
// the web manifest (data/assets.json ui `hudPanel/*`, `hudBondItem/*`, `prepReady/*`, `bondBoardIcon/*`), so every player
// gets the look; without them the screen keeps upstream's CSS look (no `has-hud-art`).
//
// Also from the client, where the web manifest has nothing: the countdown (ui/autochess/[uc]autochesscommon.ab
// auto_chess_countdown_view: `countdown` label, `bar_shadow` / `bar_solid` gauge) and the left player list
// (panel_player_status / player_status_item: `bg_player_list`, `bg_team_border`, `bg_hp`, `icon_self`), read from the
// local-client extraction (data/local-assets.json ui/common, ui/battle) — `has-hud-cd` / `has-hud-team` only when they
// are there, else upstream's countdown / list. The bond list's fold tab (bond_list_info_view btn_synergy: `btn_close`
// under the open list, `btn_open` + two `btn_open_arrow` while folded) is web art: `has-hud-fold`.
//
//   hudArt()                  { cls, style } for the game screen root (screens/game.js)
//   BondNav({ bonds, id, onOpen }) the bond popup's < > arrows (autochess_hud_bond_detail_dialog btn_prev / btn_next):
//                             the previous / next bond of the strip's order (ui/bondStrip.js sortBonds), wrapping
//   bondBoardStyle(max, tier) the disc board of one bond slot (ui/bondStrip.js): `bondBoardIcon/<max>_<tier>`, the
//                             prefab's runtime `_imgBoard` — full teal at the top tier, ring arcs below it, the grey
//                             ring `1_0` while inactive (matched against the in-game screenshots, 2026-10-06). The
//                             sprites are indexed by tier (there is `<max>_1`…`<max>_<max>` and only `1_0`), never by
//                             the number on the disc: that is the bond's 层数 (stack), so a bond that just activated
//                             shows its first arc with a 0 on it
//   bondBoardOf(th, count, active) what the strip / popup pass to it: segments = units needed to activate (th[0]),
//                             lit = units present, the full disc once active (KR captures, 2026-10-06 2nd pass)

import { data, localAsset } from '../data.js';
import { uiUrl } from './assetUrls.js';
import { html, Icon, MicroLabel } from './components.js';
import { sortBonds } from './gameLogic.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

// ---- UI 크기 (the PC client's UI_SCALER setting: StandaloneCanvasScaleHelper MIN_SCALE_FACTOR .9 / MAX 1 / DEFAULT 1,
// global-metadata.dat; docs/LOCAL-PATCH.md 「크기 단위」) ----
// The slider sets `--ui-k` on <html>; css/hud-art.css `--ui-u` = the 1280×720 canvas unit × a factor that is 1 up to a
// 1280×720 frame and reaches `--ui-k` at 1920×1080 (straight line between), so phones / small windows never shrink and
// moving the slider redraws every official-look panel live. Default .9 (the KR PC capture; = the resolution curve).
export const UI_SCALE_MIN = 0.9;
export const UI_SCALE_MAX = 1;
/** @param {unknown} v @returns {number} .9…1 in steps of .01 (default .9) */
export function sanitizeUiScale(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return UI_SCALE_MIN;
  return Math.round(Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, n)) * 100) / 100;
}
export const uiScaleStore = createStore({ k: sanitizeUiScale(loadPref('uiScale', null)) });
function applyUiScale(k) {
  try { globalThis.document?.documentElement?.style.setProperty('--ui-k', String(k)); } catch { /* no DOM */ }
}
applyUiScale(uiScaleStore.get().k);
uiScaleStore.subscribe((s) => { savePref('uiScale', s.k); applyUiScale(s.k); });
/** @param {number} v */
export function setUiScale(v) { uiScaleStore.set({ k: sanitizeUiScale(v) }); }

/** Settings row (ui/settings.js): 界面大小 90–100 %. */
export function UiScaleSetting() {
  const { k } = useStore((x) => x, Object.is, uiScaleStore);
  const pct = Math.round(k * 100);
  return html`<label class="set-row" data-ui-scale=${pct}>
    <span class="set-row__label"><${Icon} name="expand" />${t('界面大小')}<${MicroLabel}>UI SCALE<//></span>
    <input class="set-range" type="range" min="90" max="100" step="1" value=${pct} style=${`--pct:${(pct - 90) * 10}%`}
      onInput=${(e) => setUiScale(Number(e.currentTarget.value) / 100)} />
    <span class="set-row__val num">${pct}</span>
  </label>`;
}

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
  '--ha-open': 'hudPanel/btn_open',
  '--ha-open-arrow': 'hudPanel/btn_open_arrow',
  '--ha-close': 'hudPanel/btn_close',
  '--ha-sel-frame': 'hudBondItem/select_frame',
  '--ha-sel-glow': 'hudBondItem/select_glow',
  '--ha-dc1': 'shopCard/bg_doublecheck1', // the shop card's 确认购买 state (autochess_shop_card_item btn_double_check)
  '--ha-dc2': 'shopCard/bg_doublecheck2',
});
/** CSS variable → local-client sprite [group, name] (optional; see the header). */
const LOCAL = Object.freeze({
  '--ha-cd-label': ['ui/common', 'countdown'],
  '--ha-cd-shadow': ['ui/common', 'bar_shadow'],
  '--ha-cd-solid': ['ui/common', 'bar_solid'],
  '--ha-plist': ['ui/battle', 'bg_player_list'],
  '--ha-border': ['ui/battle', 'bg_team_border'],
  '--ha-php': ['ui/battle', 'bg_hp'],
  '--ha-self': ['ui/battle', 'icon_self'],
  // the bond popup (autochess_hud_bond_detail_dialog / autochess_hud_bond_char_item), optional: CSS without them
  '--ha-detail-bg': ['ui/battle', 'detail_bg'],
  '--ha-bd-off': ['ui/battle', 'bond_inactive_bg'],
  '--ha-bd-on': ['ui/battle', 'bond_active_bg'],
  '--ha-bd-people': ['ui/battle', 'title_char_icon'],
  '--ha-bd-ok': ['ui/battle', 'active_icon'],
  '--ha-bd-border': ['ui/battle', 'avatar_border'],
  '--ha-bd-border-on': ['ui/battle', 'avatar_active_border'],
  '--ha-bd-arrow': ['ui/battle', 'arrow'],
  '--ha-ability-bg': ['ui/battle', 'acbattle_img_bg_bond_desc'], // the unit card's 特质 block (…subpanel_tabgroup), optional
  '--ha-ability-title': ['ui/battle', 'acbattle_img_bond_title'],
});
const CD = ['--ha-cd-label', '--ha-cd-shadow', '--ha-cd-solid'];
const TEAM = ['--ha-plist', '--ha-border', '--ha-php', '--ha-self'];

let cache = { m: null, l: null, v: null };

/** { cls, style } of the game screen root: `has-hud-art` and the sprite variables, or nothing without the sprites. */
export function hudArt() {
  const m = data.get('assets');
  const l = data.get('local');
  if (cache.m === m && cache.l === l && cache.v) return cache.v;
  const vars = [];
  for (const [k, key] of Object.entries(WEB)) {
    const u = uiUrl(m, key);
    if (u) vars.push(`${k}:url("${u}")`);
  }
  const have = new Set();
  for (const [k, [group, name]] of Object.entries(LOCAL)) {
    const u = localAsset(group, name);
    if (u) { vars.push(`${k}:url("${u}")`); have.add(k); }
  }
  const ok = !!(uiUrl(m, 'hudPanel/bg_board') && uiUrl(m, 'hudPanel/bg_rest') && uiUrl(m, 'prepReady/ready_bg') && uiUrl(m, 'bondBoardIcon/1_0'));
  const cls = ['has-hud-art',
    uiUrl(m, 'hudPanel/btn_open') && uiUrl(m, 'hudPanel/btn_open_arrow') && uiUrl(m, 'hudPanel/btn_close') && 'has-hud-fold',
    CD.every((k) => have.has(k)) && 'has-hud-cd',
    TEAM.every((k) => have.has(k)) && 'has-hud-team'].filter(Boolean).join(' ');
  const v = ok ? { cls, style: vars.join(';') } : { cls: '', style: '' };
  cache = { m, l, v };
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

/**
 * The board of a bond's disc as the client draws it (KR captures 2026-10-06: 빅토리아 3 segments with 2 lit and a grey
 * icon, full disc at 3 / 아케인 2 segments with 1 lit): the ring has one segment per unit the bond needs to activate
 * (act2autochess bondInfoDict activeCount = thresholds[0]: core 3, add-on 2 — not the number of tiers), the units
 * present light them, and an active bond is the full disc whatever its tier. Inactive with nobody counted (or a
 * downward bond over its cap): the grey `1_0` ring.
 * @param {number[]} thresholds @param {number} count units counted (调和's +1 included) @param {boolean} active
 */
export function bondBoardOf(thresholds, count, active) {
  const need = Math.max(1, Math.min(4, Math.trunc(Number(Array.isArray(thresholds) ? thresholds[0] : 0)) || 1));
  const n = Math.max(0, Math.trunc(Number(count)) || 0);
  return bondBoardStyle(need, active ? need : Math.min(n, need - 1));
}

/**
 * The bond popup's < > arrows: the neighbours of `id` in the strip's order (sortBonds — the order the strip draws).
 * @param {{ bonds: any[], id: string, onOpen: (bondId: string) => void }} props
 */
export function BondNav({ bonds, id, onOpen }) {
  const list = sortBonds(Array.isArray(bonds) ? bonds : [], (b) => data.lookup('bonds', b)).filter((b) => !b.off).map((b) => b.bondId);
  const i = list.indexOf(id);
  if (i < 0 || list.length < 2) return null;
  const go = (d) => onOpen(list[(i + d + list.length) % list.length]);
  return html`<div class="bpop-nav" role="group" aria-label=${t('切换盟约')}>
    <button type="button" class="bpop-nav__btn bpop-nav__btn--prev" aria-label=${t('上一个盟约')} onClick=${() => go(-1)}></button>
    <button type="button" class="bpop-nav__btn bpop-nav__btn--next" aria-label=${t('下一个盟约')} onClick=${() => go(1)}></button>
  </div>`;
}

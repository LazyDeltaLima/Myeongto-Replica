// Official 卫戍协议 battle dialogs (docs/rules/ui.md 「공식 위수협약 UI」, maintainer request 2026-10-10), drawn from the
// client's own prefabs — sizes in the 1280×720 canvas unit (`--pu`, css/battle-art.css), sprites from the local-client
// extraction (data/local-assets.json ui/battle; without it a dialog is not shown and upstream's banner stays), the
// lengths from the prefabs' legacy animation clips (their last keyframe):
//   UIBattleLoading (battle scene)  LoadingScreen     the battle loading screen: the mode's loading picture (web manifest
//                                                     ui `loading/<loadingPic>`), "OPERATION", the mode code, its mode
//                                                     name (「AC-3 극한 시뮬레이션」), an official tip, "Loading"
//   game_start_dialog               GameStartBanner   全局作战目标 / 通过14回合，消灭领袖 (KR 「전역 작전 목표 / 리더 적
//                                                     섬멸!」), game_start_dialog_show 3.42 s
//
//   loadingArt(mode)       { pic, code, name } of the loading screen, or null without the picture
//   battleArt(kind)        { cls, style } — the sprite variables of a dialog when the local art has all of them

import { useEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { uiUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { t, tParts, N_ } from '../../../shared/i18n.js';

/** CSS variable → ui/battle sprite, per dialog. */
const ART = Object.freeze({
  start: {
    '--ba-bg': 'goal_bg', '--ba-round': 'goal_round', '--ba-rtile': 'goal_round_tile', '--ba-cross': 'goal_cross',
    '--ba-t0': 'goal_text_00', '--ba-t1': 'goal_text_01', '--ba-t2': 'goal_text_02', '--ba-t3': 'goal_text_03', '--ba-t4': 'goal_text_04',
    '--ba-frame': 'common_frame', '--ba-tile': 'tile_line',
  },
  waiting: {
    '--ba-back': 'banner_back', '--ba-lower': 'face_lower_dec', '--ba-face': 'face_main', '--ba-glass': 'shallow_main',
    '--ba-sand': 'shallow_sand', '--ba-drop': 'shadow_drop_sand', '--ba-screen': 'shallow_dec_tex',
  },
  help: {
    '--ba-bg': 'round_bg', '--ba-line': 'round_bg_line', '--ba-dot': 'dot_blank', '--ba-doc': 'doc_01', '--ba-arrow': 'arrow',
    '--ba-cross': 'left_cross', '--ba-frame': 'left_frame', '--ba-text1': 'doc_text_01', '--ba-text2': 'doc_text_02',
    '--ba-emoji1': 'assist_emoji_01', '--ba-emoji2': 'assist_emoji_02', '--ba-tile': 'tile_line',
  },
  trans: {
    '--ct-glow': 'trans_glow', '--ct-b1': 'trans_batte1', '--ct-b2': 'trans_batte2', '--ct-w1': 'trans_worm1', '--ct-w2': 'trans_worm2',
    '--ct-c1': 'trans_coop1', '--ct-c2': 'trans_coop2', '--ct-c3': 'trans_coop3', '--ct-c4': 'trans_coop4', '--ct-cup': 'trans_cup',
    '--ct-sword': 'icon_sword_yellow', '--ct-sword-red': 'icon_sword_red', '--ct-matte': 'text_matte', '--ct-warn': 'icon_warn',
    '--ct-boss': 'icon_trans_boss',
  },
  boss: {
    '--bb-bg': 'team_boss_start_bg', '--bb-frame': 'team_boss_frame', '--bb-icon': 'icon_boss_normal_white', '--bb-info': 'boss_bg_normal',
    '--bb-tiny': 'icon_boss_tiny', '--bb-line': 'doc_line', '--bb-dblank': 'doc_blank', '--bb-dframe': 'doc_frame', '--bb-doc': 'doc_icon',
    '--bb-shadow': 'text_shadow', '--bb-screen': 'img_screen_line', '--bb-n1': 'num_text_564', '--bb-n2': 'num_text_012', '--bb-n3': 'num_text_154',
    '--bb-upper1': 'dec_text_upper_left_01', '--bb-upper2': 'team_boss_dese_upper_02', '--bb-lower': 'dec_text_lower_corner',
    '--bb-round': 'team_boss_blood_round', '--bb-blood': 'team_boss_blood', '--bb-bframe': 'team_boss_blood_frame', '--bb-bicon': 'team_boss_blood_icon',
    '--bb-cross': 'team_boss_start_cross', '--bb-mine': 'team_boss_player_mine', '--bb-pblood': 'team_boss_player_blood',
    '--bb-pshadow': 'team_boss_player_blood_shadow', '--bb-doctext': 'team_boss_doc_text',
    '--bb-sp-bg': 'bg_type_01', '--bb-sp-line': 'sp_bg_doc_line', '--bb-sp-icon': 'boss_sp_icon', '--bb-sp-info': 'boss_bg_sp',
    '--bb-sp-tiny': 'icon_boss_sp_tiny', '--bb-warn': 'sp_warning_icon', '--bb-warn-text': 'sp_text_warning', '--bb-warn-glow': 'sp_warning_icon_glow',
  },
  ending: {
    '--se-bg1': 'bg_type_01', '--se-bg2': 'bg_type_02', '--se-fx': 'bg_type_01_effect', '--se-side': 'bg_side_effect', '--se-icon': 'icon_boss_normal_white',
    '--se-win': 'icon_win_boss', '--se-win-sp': 'icon_win_boss_sp', '--se-back': 'icon_boss_back', '--se-sp': 'icon_boss_sp_large',
    '--se-info': 'boss_bg_normal', '--se-info-sp': 'boss_bg_sp', '--se-tiny': 'icon_boss_tiny', '--se-tiny-sp': 'icon_boss_sp_tiny',
    '--se-clear': 'boss_clear', '--se-clear-sp': 'boss_clear_sp', '--se-link1': 'img_link_01', '--se-link2': 'img_link_02', '--se-linkout': 'img_link_out',
    '--se-shadow': 'img_shadow', '--se-screen': 'img_screen_line',
  },
  dead: {
    '--sd-bg': 'bg_type_01', '--sd-side': 'dec_line_side', '--sd-up1': 'dec_text_upper_left_01', '--sd-up2': 'dec_text_upper_left_02',
    '--sd-lower': 'dec_text_lower_corner', '--sd-cross': 'img_dec_cross', '--sd-shadow': 'img_shadow', '--sd-tiny': 'dec_tiny_text_01',
    '--sd-sp': 'dec_stronghold_protocol', '--sd-i1': 'icon_01', '--sd-i2': 'icon_02', '--sd-i3': 'icon_03', '--sd-i4': 'icon_04',
    '--sd-itext': 'icon_text', '--sd-cont': 'btn_continue', '--sd-end': 'btn_end', '--sd-screen': 'img_screen_line',
  },
  confirm: {
    '--cd-bg': 'img_confirm_dialog_bg', '--cd-gray': 'img_confirm_dialog_btn_gray_bg', '--cd-green': 'img_confirm_dialog_btn_green_bg',
    '--cd-check': 'img_confirm_dialog_check', '--cd-cancel': 'img_confirm_dialog_cancel', '--cd-box': 'img_confirm_dialog_check_box',
    '--cd-tick': 'img_confirm_dialog_check_small',
  },
  // auto_chess_reconnect_mask (common) — a key with a slash names its own extraction folder
  reconnect: {
    '--rc-tile': 'ui/common/bg_lower_tile', '--rc-orange': 'ui/common/banner_orange_tile', '--rc-black': 'ui/common/banner_black_tile',
    '--rc-frame': 'ui/common/banner_frame', '--rc-dec': 'ui/common/banner_dec', '--rc-icon': 'icon_waiting',
  },
  ping: { '--pp-bg': 'img_delay_bkg' },
  toast: { '--ts-bg': 'ui/common/img_toast_bg' },
  ob: {
    '--ob-other': 'bg_ob_other', '--ob-self': 'bg_ob_self', '--ob-icon-other': 'icon_ob_other', '--ob-icon-self': 'icon_ob_self',
    '--ob-arrow': 'left_arrow_active', '--ob-lost': 'bg_ob_player_quit', '--ob-lost-icon': 'icon_ob_player_quit',
  },
});
/** The local extraction folder of a dialog's sprites (ui/battle unless named here). */
const FOLDER = Object.freeze({ confirm: 'ui/common' });
const NONE = Object.freeze({ cls: '', style: '' });
const cache = new Map();

/** { cls: 'has-battle-art', style } when the local extraction has every sprite of `kind`, else { cls: '', style: '' }. */
export function battleArt(kind) {
  const map = ART[kind];
  if (!map) return NONE;
  const m = data.get('local');
  const hit = cache.get(kind);
  if (hit && hit.m === m) return hit.v;
  const vars = [];
  let ok = !!m;
  for (const [name, key] of Object.entries(map)) {
    const cut = key.lastIndexOf('/');
    const u = cut > 0 ? localAsset(key.slice(0, cut), key.slice(cut + 1)) : localAsset(FOLDER[kind] || 'ui/battle', key);
    if (!u) { ok = false; break; }
    vars.push(`${name}:url("${u}")`);
  }
  const v = ok ? { cls: 'has-battle-art', style: vars.join(';') } : NONE;
  cache.set(kind, { m, v });
  return v;
}

/**
 * Load the sprites of these dialogs into the browser cache now: the connection ones (reconnect mask, server-lost
 * dialog) first show when the server is unreachable — drawn from sprites fetched only then, the mask came up as bare
 * text (2026-10-12 check). Called once a match screen is open.
 * @param {string[]} kinds
 */
export function preloadBattleArt(kinds) {
  if (typeof Image !== 'function') return;
  for (const kind of kinds) {
    for (const m of (battleArt(kind).style || '').matchAll(/url\("([^"]+)"\)/g)) { const img = new Image(); img.src = m[1]; }
  }
}

/** Position of a prefab RectTransform inside its parent (centre anchors): x, y = anchoredPosition (y up), w, h = size. */
const box = (x, y, w, h) => `left:calc(50% + var(--pu) * ${x - w / 2});top:calc(50% - var(--pu) * ${y + h / 2});width:calc(var(--pu) * ${w});height:calc(var(--pu) * ${h})`;
const i = (cls, b, extra = '') => html`<i class=${cls} style=${extra ? `${b};${extra}` : b} aria-hidden="true"></i>`;

/**
 * A RectMask2D box (bg_mask / full_line_mask): the mask rect at (x, y) of size w × h trimmed by its padding (Unity's
 * x = left, y = bottom, z = right, w = top). Returns the visible box's style and the shift its children need.
 */
function maskBox(x, y, w, h, [pl, pb, pr, pt]) {
  const vw = w - pl - pr; const vh = h - pb - pt;
  const cx = x + (pl - pr) / 2; const cy = y + (pb - pt) / 2;
  return { style: `${box(cx, cy, vw, vh)};overflow:hidden`, dx: x - cx, dy: y - cy };
}

/** Hook: after `on` turns false the element stays `ms` longer (its fade-out); returns [mounted, leaving]. */
function useLinger(on, ms) {
  const [mounted, setMounted] = useState(on);
  useEffect(() => {
    if (on) { setMounted(true); return undefined; }
    const id = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return [mounted || on, !on];
}

/** A dialog that plays `ms` and fades out over `outMs`, then calls onDone; returns [gone, leaving]. */
function usePlay(ms, outMs, onDone) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), ms);
    const t2 = setTimeout(() => { setGone(true); onDone?.(); }, ms + outMs);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ms]);
  return [gone, leaving];
}

// ---- the battle loading screen (UIBattleLoading) -------------------------------------------------------------------

/**
 * What the loading screen shows for a mode record (config.json modes[modeId]): its picture (the web manifest's
 * `loading/<loadingPic>`), code and full mode name (「AC-4 초월 시뮬레이션」, maintainer decision 2026-10-11 — the
 * 模拟 / 시뮬레이션 stays); null when the picture is not in the manifest.
 * @param {any} mode
 * @returns {{ pic: string, code: string, name: string } | null}
 */
export function loadingArt(mode) {
  if (!mode || typeof mode !== 'object' || !mode.loadingPic) return null;
  const pic = uiUrl(data.get('assets'), `loading/${mode.loadingPic}`);
  if (!pic) return null;
  return { pic, code: String(mode.code || ''), name: t(String(mode.name || '')) };
}

/** A random official tip (config.json `tips`, weighted), or ''. */
function pickTip(tips) {
  const list = Array.isArray(tips) ? tips.filter((x) => x && typeof x.tip === 'string' && x.tip) : [];
  if (!list.length) return '';
  const total = list.reduce((s, x) => s + (Number(x.weight) > 0 ? Number(x.weight) : 1), 0);
  let r = Math.random() * total;
  for (const x of list) { r -= Number(x.weight) > 0 ? Number(x.weight) : 1; if (r <= 0) return x.tip; }
  return list[list.length - 1].tip;
}

/**
 * The battle loading screen (UIBattleLoading + UIStageInfo): the picture stretched over the screen (the 1024² loading
 * illustrations are drawn squeezed — every official loading picture fills the 16:9 screen), the corner shadow, the
 * stage info in the middle — "OPERATION" (Novecento wide 30, y +60), the code (90, y −20), the mode name (60, y −120) —
 * a tip along the bottom (panel_tips 250 tall, the text 300 in from either side) and "Loading" with its three dots at
 * the bottom right (text_loading, 154 × 67 at −77 / 33.5). Shown while `show` (BATTLE_CHECK, the field view loading),
 * then fades out ([추정] the length: _fadeTime is not in the scene typetree).
 * @param {{ show: boolean, art: { pic: string, code: string, name: string }, tips?: any[] }} props
 */
export function LoadingScreen({ show, art, tips }) {
  const [mounted, leaving] = useLinger(show, 400);
  const tip = useMemo(() => pickTip(tips), [tips]);
  const [dots, setDots] = useState(0);
  useEffect(() => {
    if (!mounted) return undefined;
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 400);
    return () => clearInterval(id);
  }, [mounted]);
  if (!mounted || !art) return null;
  return html`<div class=${leaving ? 'bload is-leaving' : 'bload'} role="status" aria-live="polite" aria-label=${`OPERATION ${art.code} ${art.name}`}
      style=${`--bl-pic:url("${art.pic}")`} data-testid="battle-loading">
    <i class="bload__pic" aria-hidden="true"></i><i class="bload__shade" aria-hidden="true"></i>
    <div class="bload__info" style=${box(0, 0, 477, 592)}>
      <span class="bload__op" style=${box(0, 60, 452, 85)}>Operation</span>
      <span class="bload__code" style=${box(0, -20, 696, 131)}>${art.code}</span>
      <span class="bload__name" style=${box(0, -120, 696, 131)}>${art.name}</span>
    </div>
    ${tip ? html`<p class="bload__tip">${tip}</p>` : null}
    <span class="bload__loading" aria-hidden="true">Loading<b>${'.'.repeat(dots)}</b></span>
  </div>`;
}

// ---- the game's opening (game_start_dialog) ------------------------------------------------------------------------

/** game_start_dialog_show (3.42 s; the dialog's MAX_SHOW_TIME is 3.5). */
export const GAME_START_MS = 3420;

/**
 * The opening of a match (game_start_dialog, sound ON_ACT1AUTOCHESS_TARGET): the dark map plate goal_bg, the target
 * rings goal_round ×2 with goal_cross and goal_round_tile on the left, common_frame brackets, the small read-out sprites
 * goal_text_00…04, the 2×3 dots (#279481), the scan tile, 全局作战目标 (27, #1bf0b1) over the goal (35, white).
 * @param {{ onDone?: () => void }} props
 */
export function GameStartBanner({ onDone }) {
  const [gone, leaving] = usePlay(GAME_START_MS - 300, 300, onDone);
  if (gone) return null;
  const art = battleArt('start');
  const ALPHA = [0.6, 1, 0.2, 0.6, 0.4, 1];
  const DOC = [[-351.1, 37.4, 11, 9, 0], [217, 67, 11, 9, 0], [399.65, -4.47, 11, 9, 0], [81.1, -39.4, 11, 9, 1],
    [247.5, -91.8, 98, 11, 2], [294, -39.6, 90, 9, 3], [-409.7, 73.4, 71, 12, 4]];
  return html`<div class=${['bart', 'bgs', art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style}
      role="status" aria-live="polite" aria-label=${`${t('全局作战目标')} · ${t('通过14回合，消灭领袖')}`}>
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>
      ${i('bgs__bg', box(0, 9.9, 1048, 296))}
      <i class="bgs__tile" style=${box(0, 9.9, 1048, 294)} aria-hidden="true"></i>
      ${DOC.map(([x, y, w, h, k], n) => i(`bgs__doc is-${k}`, box(x, y, w, h), `--k:${n}`))}
      <i class="bgs__blanks" style=${box(415.7, 10.9, 100, 100)} aria-hidden="true">
        ${[[-17.1, 13.3], [-7.1, 13.3], [2.9, 13.3], [-17.1, 0.94], [-7.1, 0.94], [2.9, 0.94]].map(([x, y], k) => html`<i key=${k} class="bgs__blank" style=${`${box(x, y, 8, 8)};--a:${ALPHA[k]};--k:${k}`}></i>`)}
      </i>
      <i class="bgs__title" style=${box(-323.6, 10.9, 189.88, 159.53)} aria-hidden="true">
        ${i('bgs__rtile', box(-2.4, 0.3, 146, 146))}${i('bgs__cross', box(0, 0, 83, 83))}
        ${i('bgs__round', box(0, 0, 205, 205))}${i('bgs__round is-2', box(153.6, 0, 205, 205))}
      </i>
      ${i('bgs__frame', box(-383.7, 9, 17, 103.13))}${i('bgs__frame is-r', box(351.9, 9, 17, 103.13))}
      <div class="bgs__mask" style=${box(-26.82, 13.82, 524.96, 75.15)}>
        <span class="bgs__head" style=${box(2.05, 21.45, 520.86, 27.06)}>${t('全局作战目标')}</span>
        <span class="bgs__goal" style=${box(0.55, -19.77, 523.86, 35.61)}>${t('通过14回合，消灭领袖')}</span>
      </div>
    </div>
  </div>`;
}

/**
 * Whether the opening plays for this ROUND_START: round 1 of a match the viewer saw from its BATTLE_CHECK (a reconnect
 * into a later phase does not replay it).
 * @param {string|null|undefined} phase @param {string|null|undefined} prev the phase before @param {number} round
 */
export function opensGame(phase, prev, round) {
  return phase === 'ROUND_START' && prev === 'BATTLE_CHECK' && Number(round) === 1;
}

// ---- the bottom tip band (panel_bottom_tips) -----------------------------------------------------------------------

/**
 * The band's four looks (_tipConfigs of panel_bottom_tips: showType, the img_bg tint, the icon, the text key).
 * KR: PREP_READY / WAIT_FINISH / HAND_FULL are the maintainer's KR captures (2026-10-10), HAND_OVERFLOW ours.
 */
export const TIPS = Object.freeze({
  HAND_FULL: { color: '#ff9000', icon: 'icon_yellow', text: N_('整备区已满，无法购买') },
  HAND_OVERFLOW: { color: '#d22e2e', icon: 'icon_red', text: N_('整备区溢出，溢出的资源将在下一回合销毁') },
  WAIT_FINISH: { color: '#171717', icon: 'icon_waiting', text: N_('战斗结束，等待队友的战斗') },
  PREP_READY: { color: '#18a486', icon: 'icon_ready', text: N_('准备完成，等待模拟') },
});

/**
 * Which band shows (the client's AutoChessBattleUIBottomTipsViewModel.UpdateData, 2026-10-10): in the prep (not watching
 * another board) the own ready → PREP_READY, else the temp overflow row holding pieces → HAND_OVERFLOW, else a full hand
 * → HAND_FULL; anywhere else (battle, 联防, watching) the own battle over while alive → WAIT_FINISH; else none.
 * @param {{ prep: boolean, watching: boolean, ready: boolean, overflow: boolean, full: boolean, ownDone: boolean, alive: boolean }} s
 * @returns {keyof typeof TIPS | null}
 */
export function bottomTipType({ prep, watching, ready, overflow, full, ownDone, alive }) {
  if (prep && !watching) {
    if (!alive) return null;
    if (ready) return 'PREP_READY';
    if (overflow) return 'HAND_OVERFLOW';
    if (full) return 'HAND_FULL';
    return null;
  }
  return ownDone && alive ? 'WAIT_FINISH' : null;
}

/**
 * The band (panel_bottom_tips): a 54-tall pill (img_bg tinted per type, padding 30, the icon 32 and the text 18 white
 * 9.27 apart, 410…690 wide) centred 47.7 above the screen's bottom; with the shop open it rides 172 higher
 * (battle_bottom_tips_shop_show). Fades between types.
 * @param {{ type: keyof typeof TIPS | null, shopOpen?: boolean }} props
 */
export function BottomTips({ type, shopOpen = false }) {
  const [shown, setShown] = useState(type);
  useEffect(() => { if (type) setShown(type); }, [type]);
  const [mounted, leaving] = useLinger(!!type, 250);
  const cfg = TIPS[type || shown];
  if (!mounted || !cfg) return null;
  const icon = localAsset('ui/battle', cfg.icon);
  return html`<div class=${['btip', shopOpen && 'is-up', leaving && 'is-leaving'].filter(Boolean).join(' ')} role="status" aria-live="polite"
      data-tip=${type || shown}>
    <span class="btip__pill" style=${`--tip:${cfg.color}`}>
      ${icon ? html`<i class="btip__icon" style=${`background-image:url("${icon}")`} aria-hidden="true"></i>` : null}
      <span class="btip__text">${t(cfg.text)}</span>
    </span>
  </div>`;
}

// ---- waiting for the stage to end (battle_waiting_dialog) ----------------------------------------------------------

/**
 * Whether the waiting dialog shows: a timed stage whose deadline is over by more than `graceMs` and has not moved on
 * (the client's AutoChessBattleUIViewModel.IsWaitingPanelShow: a prep or battle state at its END sub-state — the own part
 * done, the stage not yet over).
 * @param {{ phase: string|null|undefined, deadline: number|null|undefined, now: number, graceMs?: number }} s
 */
export function waitsForStage({ phase, deadline, now, graceMs = 800 }) {
  if (!['PREP', 'SP_DRAFT', 'ROUND_START', 'SETTLE'].includes(String(phase))) return false;
  return Number.isFinite(deadline) && deadline > 0 && now > deadline + graceMs;
}

/**
 * The waiting dialog (battle_waiting_dialog): the soft dark plate banner_back (584 × 284), the pixel face face_main with
 * its hourglass (shallow_main; the sand shallow_sand runs from the top bulb to the bottom one over battle_waiting_loop_anim's
 * 3 s, the drop shadow_drop_sand between), 模拟即将继续 (33, #e4e5e8) / 正在等待当前阶段结束…… (19, #71ccb7).
 * Checks the stage's deadline four times a second.
 * @param {{ phase: string|null|undefined, deadline: number|null|undefined, paused?: boolean, now?: () => number }} props
 */
export function WaitingDialog({ phase, deadline, paused = false, now = Date.now }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => (x + 1) % 1e6), 250);
    return () => clearInterval(id);
  }, []);
  const show = !paused && waitsForStage({ phase, deadline, now: now() });
  const [mounted, leaving] = useLinger(show, 300);
  const art = battleArt('waiting');
  if (!mounted || !art.cls) return null;
  return html`<div class=${['bart', 'bwait', art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style} role="status" aria-live="polite">
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>
      ${i('bwait__back', box(3.53, 12.2, 584, 284))}
      ${i('bwait__lower', box(-109.6, -33.84, 78, 13))}
      <i class="bwait__loop" style=${box(-115.6, 8.47, 200, 200)} aria-hidden="true">
        ${i('bwait__screen', box(32.93, -11.6, 56, 56))}
        <i class="bwait__glass" style=${box(33.62, -11.35, 37.7, 53.75)}>
          ${i('bwait__main', box(0, 0, 26, 44))}
          ${i('bwait__sand is-top', box(-0.4, 8.8, 13.33, 11.33))}${i('bwait__sand is-bottom', box(-0.2, -9.4, 13.33, 11.33))}
          ${i('bwait__drop', box(0, -2.2 - 5.67, 4.67, 11.33))}
        </i>
        ${i('bwait__face', box(-2.13, -32.47 + 0.55 * 74.67, 74, 74.67))}
      </i>
      <span class="bwait__title" style=${box(80.6, 25.5, 264.75, 43.8)}>${t('模拟即将继续')}</span>
      <span class="bwait__sub" style=${box(78.35, -20.17, 260.25, 40.34)}>${t('正在等待当前阶段结束……')}</span>
    </div>
  </div>`;
}

// ---- 联防 (help_battle_dialog) -------------------------------------------------------------------------------------

/** help_battle_dialog (3.0 s; the dialog's MAX_SHOW_TIME is 4). */
export const HELP_BATTLE_MS = 3000;

/**
 * The 联防 banner (help_battle_dialog): the round_result_dialog frame in orange — the dark plate round_bg with its
 * contour lines (#6c5e48), the two pixel figures assist_emoji_01 / 02 (the helper and the one helped) in the left
 * brackets (#ffa421), four arrows running right (alpha .4 / 1 / .4 / .2), the dots (#ffb134) and SIGNAL doc_01 (#ffb135)
 * at the plate's right, 联防阶段 (40, #ffaa24; KR 「연합 방어」, the maintainer's capture).
 * @param {{ onDone?: () => void }} props
 */
export function HelpBattleBanner({ onDone }) {
  const [gone, leaving] = usePlay(HELP_BATTLE_MS - 300, 300, onDone);
  if (gone) return null;
  const art = battleArt('help');
  const W = 631.78, H = 298.59;
  const rb = (x, y, w, h) => box(W / 2 + x, -H / 2 + y, w, h);
  const rt = (x, y, w, h) => box(W / 2 + x, H / 2 + y, w, h);
  const ALPHA = [0.6, 1, 0.2, 0.6, 0.4, 1];
  const ARROWS = [[190.6, 0.4], [147.3, 1], [103.7, 0.4], [60.1, 0.2]];
  return html`<div class=${['bart', 'bhelp', art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style}
      role="status" aria-live="polite" aria-label=${t('联防阶段')}>
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>
      <i class="bhelp__bg" style=${box(2.29, 2.8, W, H)} aria-hidden="true">
        <i class="bhelp__line" style=${box(-2, -0.58, 496, 169.16)}></i>
        <i class="bhelp__blanks" style=${rb(-127.18, 115.6, 100, 100)}>
          ${[[21.03, 4.28], [30, 4.28], [39.2, 4.28], [21.03, -4.9], [30, -4.9], [39.2, -4.9]].map(([x, y], k) => html`<i key=${k} class="bhelp__dot" style=${`${box(x, y, 7.2, 8)};opacity:${ALPHA[k]}`}></i>`)}
        </i>
        <i class="bhelp__doc" style=${rb(-120.1, 87.3, 75, 18)}></i>
        <i class="bhelp__dot is-r" style=${rt(-90.1, -82.79, 9.51, 10.34)}></i>
        <i class="bhelp__arrows" style=${box(-2.29, -1.03, 495.46, H - 129.41)}>
          ${ARROWS.map(([x, a], k) => html`<i key=${k} class="bhelp__arrow" style=${`${box(x, 0, 87, 169)};--a:${a};--k:${k}`}></i>`)}
        </i>
      </i>
      <i class="bhelp__tile" style=${box(0, 0, 583.4, 222.2)} aria-hidden="true"></i>
      <div class="bhelp__left" style=${box(-136.97, 1.77, 221.46, 168.59)} aria-hidden="true">
        ${i('bhelp__cross', box(-86.22, 61.67, 16.13, 16.26))}${i('bhelp__cross', box(-86.22, -63.9, 16.13, 16.26))}
        ${i('bhelp__cross', box(85.8, -63.9, 16.13, 16.26))}${i('bhelp__cross', box(85.8, 61.67, 16.13, 16.26))}
        ${i('bhelp__frame', box(-86.71, 1.35, 9.29, 78.1))}${i('bhelp__frame is-r', box(86.3, 1.35, 9.29, 78.1))}
        <i class="bhelp__emoji" style=${box(0, 0, 146.3, 127.1)}>
          ${i('bhelp__fig is-1', box(-38.6, -30.1 + 35.5, 64, 71))}${i('bhelp__fig is-2', box(32, -30.1 + 35.5, 64, 71))}
        </i>
        ${i('bhelp__text1', box(-5.59, -60.88, 56.2, 7.19))}${i('bhelp__text2', box(-6.22, -67.81, 43.18, 4.11))}
      </div>
      <div class="bhelp__right" style=${box(105.43, 1.77, 284.66, 168.59)}>
        <span class="bhelp__title" style=${box(-4.43, 1.2, 249.7, 50)}>${t('联防阶段')}</span>
      </div>
    </div>
  </div>`;
}

// ---- the round bar's stage changes (autochess_hud_panel player_info_view trans_*) ----------------------------------

/** trans_rest / trans_battle / trans_coop / trans_boss lengths (s → ms). */
export const TRANS_MS = Object.freeze({ rest: 4230, battle: 2670, coop: 3270, boss: 4370 });

/** The round bar's stage for a phase: 'rest' | 'battle' | 'coop' | 'boss' | null. */
export function transKind(phase) {
  if (phase === 'PREP') return 'rest';
  if (phase === 'COMBAT') return 'battle';
  if (phase === 'UNITE') return 'coop';
  if (phase === 'FINAL_ASSAULT' || phase === 'HIDDEN_CORE') return 'boss';
  return null;
}

/**
 * The transition playing in the round bar: set when the phase enters a new stage, cleared after its clip. Only with
 * the local art (battleArt('trans')).
 * @param {string|null|undefined} phase
 * @returns {{ kind: string, key: number } | null}
 */
export function useCapsuleTrans(phase) {
  const [cur, setCur] = useState(null);
  const prev = useRef(phase);
  useEffect(() => {
    const was = prev.current;
    prev.current = phase;
    const kind = transKind(phase);
    if (!kind || transKind(was) === kind || !battleArt('trans').cls) return undefined;
    const key = Date.now();
    setCur({ kind, key });
    const id = setTimeout(() => setCur((c) => (c && c.key === key ? null : c)), TRANS_MS[kind]);
    return () => clearTimeout(id);
  }, [phase]);
  return cur;
}

/**
 * The transition over the round bar's pill (157 × 45, root_mask 144 × 35): stage 1 — 战斗 / 联防: the pixel fighter hops
 * in, the worm crawls at it from the right (联防: the fighter turns scared and a teammate jumps in), 最终攻势: two warning
 * signs slide apart around the leader mark, 休整: three cups bounce; stage 2 — the sword icon pops and slides left, the
 * caption slides right over its matte: 开始作战 (KR 「전투 시작」) / 联防开始 (KR 「연합 방어」) in #ffcd3a on #d37700 · 60 %
 * (boss: #ff6d6d on #981200 · 66 %); then the transition slides up and the pill's own content comes back.
 * @param {{ kind: 'rest'|'battle'|'coop'|'boss' }} props
 */
export function CapsuleTrans({ kind }) {
  const art = battleArt('trans');
  if (!art.cls) return null;
  const u = (x, y, w, h) => `left:calc(50% + var(--u) * ${x - w / 2});top:calc(50% - var(--u) * ${y + h / 2});width:calc(var(--u) * ${w});height:calc(var(--u) * ${h})`;
  const caption = kind === 'coop' ? t('联防开始') : t('开始作战');
  return html`<span class=${`ctrans is-${kind}`} style=${art.style} aria-hidden="true">
    <i class="ctrans__glow"></i>
    ${kind === 'rest' ? html`<span class="ctrans__s1">
        <i class="ctrans__cup is-1" style=${u(-34, 1, 31, 29)}></i><i class="ctrans__cup is-2" style=${u(0, 1, 31, 29)}></i><i class="ctrans__cup is-3" style=${u(33, 1, 31, 29)}></i>
      </span>`
      : kind === 'boss' ? html`<span class="ctrans__s1">
        <i class="ctrans__warn is-l" style=${u(-40, 0.5, 29, 26)}></i><i class="ctrans__warn is-r" style=${u(40, 0.5, 29, 26)}></i>
        <i class="ctrans__lead" style=${u(0, 0.5, 31, 36)}></i>
      </span>`
      : html`<span class="ctrans__s1">
        <i class="ctrans__char" style=${u(-18, 0, 31, 33)}>
          <i class="ctrans__sword" style=${u(-11.24, -10.87, 20, 34)}></i><i class="ctrans__fig"></i>
        </i>
        ${kind === 'coop' ? html`<i class="ctrans__mate" style=${u(-37, 0, 31, 33)}></i>` : null}
        <i class="ctrans__worm" style=${kind === 'coop' ? u(33, -3, 57, 25) : u(23, 0, 46, 31)}></i>
      </span>`}
    ${kind === 'rest' ? null : html`<span class="ctrans__s2">
      <i class="ctrans__icon" style=${u(-42.5, 0.5, 40, 39)}></i>
      <i class="ctrans__matte" style=${u(18, 1, 116, 35)}></i>
      <b class="ctrans__text" style=${u(18, 1, 116, 34.45)}>${caption}</b>
    </span>`}
  </span>`;
}

// ---- whose field is on screen (panel_ob_info) ----------------------------------------------------------------------

/**
 * The official 观战 caption (panel_ob_info ob_info, bottom-centre 84 up, 318 × 40): ob_self (bg_ob_self + icon_ob_self +
 * 你自己 — KR 「자신」, the maintainer's capture), ob_other (bg_ob_other + icon_ob_other + the player's name; the client adds
 * `#number`, which this remake has not), ob_empty (无人在家, #cfcfcf · 70 %), ob_overview (全屏 — ours reads 全景), and the
 * arrows left_arrow_active (48 × 68, 207 either side; the right one mirrored) that step through the halves. `lost`: the
 * player of the half on screen left the match — ob_player_lost (bg_ob_player_quit 589 × 356 + icon_ob_player_quit,
 * 当前玩家已离开 32 / 可自行切换查看其他玩家 18; our translations) over the middle of the screen. `own`: the own battle still
 * going on off screen while a teammate is watched (maintainer decision 2026-10-25) — a chip in the ob_self look (bg_ob_self +
 * icon_ob_self + 你自己) right of the caption with its kills / total, ✓ once over [ASSUMED: the official current season has no
 * such chip; the new season's layout is not known yet].
 * @param {{ cur: { kind?: string, label: string } | null, arrows?: boolean, prev?: (() => void) | null, next?: (() => void) | null, lost?: boolean,
 *   own?: { resolved?: number|null, killed?: number|null, total?: number|null, done?: boolean } | null, children?: any }} props
 *   `arrows`: the halves of a 联防 / boss field (`prev` / `next` null at either end)
 */
export function ObInfo({ cur, arrows = false, prev = null, next = null, lost = false, own = null, children = null }) {
  const art = battleArt('ob');
  if (!art.cls || !cur) return null;
  const kind = cur.kind || 'other';
  return html`<div class="obinfo" style=${art.style}>
    <div class=${`obinfo__bar is-${kind}`} role="status">
      ${kind === 'self' || kind === 'other' ? html`<i class="obinfo__icon" aria-hidden="true"></i>` : null}
      <span class="obinfo__text">${kind === 'self' ? t('你自己') : cur.label}</span>
      ${arrows ? html`<button type="button" class="obinfo__arrow is-l" disabled=${!prev} aria-label=${t('左侧战场')} onClick=${() => prev?.()}></button>
        <button type="button" class="obinfo__arrow is-r" disabled=${!next} aria-label=${t('右侧战场')} onClick=${() => next?.()}></button>` : null}
      ${children}
    </div>
    ${own ? html`<div class=${own.done ? 'obinfo__self is-done' : 'obinfo__self'} role="status">
      <i class="obinfo__icon" aria-hidden="true"></i>
      <span class="obinfo__text">${t('你自己')}</span>
      <span class="obinfo__num">${own.done ? html`<span aria-label=${t('作战结束')}>✓</span>`
        : (own.resolved ?? own.killed) != null && own.total != null ? `${own.resolved ?? own.killed}/${own.total}` : '•••'}</span>
    </div>` : null}
    ${lost ? html`<div class="obinfo__lost" role="status">
      <i class="obinfo__lost-icon" aria-hidden="true"></i>
      <b class="obinfo__lost-1">${t('当前玩家已离开')}</b>
      <span class="obinfo__lost-2">${t('可自行切换查看其他玩家')}</span>
    </div>` : null}
  </div>`;
}

/** The round bar's transition as a component of its own (PhaseCapsule stays hook-free). @param {{ phase: string|null|undefined }} props */
export function CapsuleTransHost({ phase }) {
  const trans = useCapsuleTrans(phase);
  return trans ? html`<${CapsuleTrans} key=${trans.key} kind=${trans.kind} />` : null;
}

// ---- the boss rounds' openings (single / multi / hidden_boss_prepare_dialog) ---------------------------------------

/**
 * How long each opening plays (ms): panel_single_boss_start_in / panel_boss_sp_start_in 2.67 s, the co-op's in_01 1.27 +
 * in_02 1.17 s; each then holds [추정 0.8 s] and fades.
 */
export const BOSS_PREP_MS = Object.freeze({ single: 3500, hidden: 3500, multi: 3300 });

/**
 * Which boss opening a phase change starts, or null. The client opens these dialogs from the BOSS_PREPARE_WAITING state
 * (AutoChessGameStateType 101: the client's AutoChessBattleUIController.PendingBossPrepareWaitingTask.CalcTabId picks
 * tab_single / tab_multi / tab_hide_boss_prepare from the boss-round model) — the wait between the round before and the
 * boss round's own prep, not the boss battle (maintainer report 2026-10-10: 「보스 라운드의 휴식시간에 들어가기 전」).
 * Here that is the boss round's ROUND_START (m.public bossRound / hiddenRound): 'hidden' for the hidden round, else
 * 'single' alone and 'multi' in co-op.
 * @param {string|null|undefined} phase @param {any} pub m.public @param {boolean} solo
 * @returns {'single'|'multi'|'hidden'|null}
 */
export function bossOpening(phase, pub, solo) {
  if (phase !== 'ROUND_START' || !pub || typeof pub !== 'object') return null;
  const r = Number(pub.round);
  if (!Number.isFinite(r) || r <= 0) return null;
  if (Number(pub.hiddenRound) === r && Number(pub.bossRound) !== r) return 'hidden';
  if (Number(pub.bossRound) === r) return solo ? 'single' : 'multi';
  return null;
}

/**
 * The opening of a boss round. Shared frame: the dark screen (50 %), the map plate team_boss_start_bg (1041 × 418), the
 * read-out decorations, the scan lines img_screen_line (16 %). `single` (最终攻势 alone): the leader mark
 * icon_boss_normal_white (#e6612c, 220 at ×1.09) between team_boss_frame brackets that open, the doc lines at its sides,
 * the leader's portrait in boss_bg_normal under it, 决战回合 (18 white) over 迎击首领敌人 (32 #ec6b38) — KR 「최종 공세 /
 * 리더 적 섬멸!」. `multi` (co-op): first the team in the middle (panel_team_boss_start_in_01: each player alive — their
 * avatar, `mine` on the viewer, their LP — the lines flickering in towards the middle ring that reads the team's LP
 * together), then (in_02) the team slides left and the leader appears on the right, 决战回合 over 合力迎击领袖！
 * (32 #22e8bd) — KR 「최종 공세 / 힘을 합쳐 리더 적 섬멸!」. `hidden` (隐秘核心): bg_type_01 with sp_bg_doc_line, the
 * warning signs, boss_sp_icon, the portrait in boss_bg_sp, 隐藏回合已解锁 (34 #09d7e3) over 挑战失败不影响胜利结算 (19
 * #a0b2b3) — KR 「히든 코어 개방 / 실패해도 정산에 지장 없음」. KR: the maintainer's captures.
 * @param {{ kind: 'single'|'multi'|'hidden', portrait?: string|null, team?: Array<{ id: string, avatar: any, lp: number, mine: boolean }>, onDone?: () => void }} props
 */
export function BossPrepare({ kind, portrait = null, team = [], onDone }) {
  const [gone, leaving] = usePlay(BOSS_PREP_MS[kind] || 3500, 400, onDone);
  if (gone) return null;
  const art = battleArt('boss');
  const hidden = kind === 'hidden';
  const multi = kind === 'multi';
  const total = team.reduce((s, m) => s + Math.max(0, Math.trunc(Number(m.lp) || 0)), 0);
  // the member slots of group_team (panel_mumber_01…04 at x −199.5), spread over the same span for fewer players [추정]
  const ysOf = (n) => ({ 1: [0], 2: [72, -77], 3: [110.8, -2.2, -115], 4: [110.8, 33.7, -40.2, -115] }[Math.min(4, Math.max(1, n))] || []);
  // the 8-player mode (maintainer decision 2026-10-16): the first four on the left of the middle ring, the others mirrored
  // on its right; in_02 shrinks the team as it slides left so its right column clears the leader [추정: no official layout]
  const wide = team.length > 4;
  const sides = wide ? [team.slice(0, 4), team.slice(4, 8)] : [team.slice(0, 4)];
  const RING = 97.5;
  const mx = (x, r) => (r ? 2 * RING - x : x); // a right-column x: mirrored around the ring
  const mainX = multi ? 287.9 : -1.2;
  const mainY = multi ? -28.7 : -17.7;
  const doc = (side) => html`<i class=${`bbp__doc is-${side}`} style=${box(side === 'l' ? -229.7 + 71.31 - 47.5 : 182 - 23.69 + 47.5, 25 - 0.2, 95, 2)}>
    <i class="bbp__dblank"></i><i class="bbp__dframe"><i></i></i></i>`;
  const title = multi ? t('合力迎击领袖！') : hidden ? t('挑战失败不影响胜利结算') : t('迎击首领敌人');
  const plateMask = maskBox(-5.2, -20.1, 1000, 520, [0, 52, 0, 52]);
  return html`<div class=${['bart', 'bbp', `is-${kind}`, art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style}
      role="status" aria-live="polite" aria-label=${hidden ? `${t('隐藏回合已解锁')} · ${title}` : `${t('决战回合')} · ${title}`}>
    <i class="bbp__blk" aria-hidden="true"></i>
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>
      <div style=${plateMask.style} aria-hidden="true">
        <i class="bbp__plate" style=${box(plateMask.dx + 4.6, plateMask.dy + (hidden ? 1.5 : 0), 1041, hidden ? 571.41 * 0.95 : 418)}>
          ${hidden ? html`<i class="bbp__spline" style=${box(35.8, 123.3, 424, 315)}></i>` : null}
        </i>
      </div>
      <i class="bbp__dec" style=${box(0, 8.8, 960, 340)} aria-hidden="true">
        ${hidden ? html`
          <i class="bbp__warn" style=${box(-223.3, 65.9, 51, 44)}></i><i class="bbp__wtext" style=${box(-224.8, 32.7, 45, 13)}></i>
          <i class="bbp__wtext" style=${`${box(164.3, -57.1, 45, 13)};transform:scale(.83)`}></i>
          <i class="bbp__warn is-glow" style=${`${box(206.1, 38.5, 51, 44)};transform:scale(.72)`}></i>
          <i class="bbp__warn is-glow" style=${`${box(-176.6, -46.4, 51, 44)};transform:scale(.49)`}></i>`
        : html`
          <i class="bbp__upper1" style=${box(-480 + 65.6, 170 - 42.1, 72, 13)}></i><i class="bbp__upper2" style=${box(480 - 74.9, 170 - 60.3, 80, 24)}></i>
          <i class="bbp__lower" style=${box(-421.5 + 2.44 + 69.7, -170 + 49 - 12.3 + 7.4, 220, 60)}></i>
          <i class="bbp__lower is-r" style=${box(426.3 + 2.44 - 85, -170 + 49 - 10.8 - 17.5, 220, 60)}></i>`}
      </i>
      ${multi ? null : html`<i class="bbp__rings" style=${box(-98.8 + 97.5, 12 - 1.6, 294, 294)} aria-hidden="true"></i>`}
      ${multi ? html`<div class=${wide ? 'bbp__team is-8' : 'bbp__team'} style=${box(-96, 8.8, 585.42, 340)}>
        <i class="bbp__rings" style=${box(RING, -1.6, 294, 294)} aria-hidden="true"></i>
        <svg class="bbp__lines" viewBox="-292.71 -170 585.42 340" aria-hidden="true">
          ${sides.map((list, r) => ysOf(list.length).slice(0, list.length).map((y, k) => html`<polyline key=${`${r}:${k}`} style=${`--k:${k + 4 * r}`}
            points=${`${mx(-199.5 + 75, r)},${-y} ${mx(-60, r)},${-y} ${mx(RING - 50, r)},${1.6 - (y > 0 ? 18 : y < 0 ? -18 : 0)}`} />`))}
        </svg>
        ${sides.map((list, r) => { const ys = ysOf(list.length); return list.map((m, k) => html`<div key=${m.id} class=${r ? 'bbp__member is-r' : 'bbp__member'} style=${`${box(mx(-199.5, r), ys[k] ?? 0, 150, 70)};--k:${k + 4 * r}`}>
          <span class="bbp__avatar" style=${box(r ? 40.5 : -40.5, 0.7, 59, 59)}>${m.avatar}</span>
          ${m.mine ? html`<i class="bbp__mine" style=${box(r ? 64.7 : -64.7, 23.4, 28, 28)} aria-hidden="true"></i>` : null}
          <span class="bbp__plp" style=${box(r ? -46.9 : 46.9, 3.3, 100, 34.6)}><i class="bbp__plpicon" aria-hidden="true"></i><b class="num">${Math.max(0, Math.trunc(Number(m.lp) || 0))}</b></span>
        </div>`); })}
        <div class="bbp__middle" style=${box(97.5, -1.6, 100, 100)}>
          <i class="bbp__bring" style=${box(0, 0, 72, 71)}></i><i class="bbp__bmask" style=${box(1.3, 0, 100, 100)}></i>
          <i class="bbp__bicon" style=${box(0, 15.2, 23, 35)}></i>
          <b class="bbp__btext num" style=${box(0, -19.9, 100, 40.8)}>${total}</b>
        </div>
        ${[[-66.9, 57.9], [66.8, 57.9], [-66.4, -45.9], [66.8, -45.9]].map(([x, y], k) => html`<i key=${k} class="bbp__cross" style=${box(97.3 + x, -1.6 + y, 11, 12)}></i>`)}
      </div>` : null}
      <div class="bbp__main" style=${`${box(mainX, mainY, 460, 380)};transform:scale(1.09)`}>
        ${i('bbp__frame', box(-114.8, 34.41, 9, 70.97))}${i('bbp__frame is-r', box(110.8, 34.41, 9, 70.97))}
        ${hidden ? i('bbp__spicon', box(1.33, 52.9, 331.24, 236.6)) : i('bbp__icon', box(0, 40, 220, 220))}
        ${multi ? i('bbp__doctext', box(0, -79, 98, 10)) : html`${doc('l')}${doc('r')}`}
      </div>
      <div class=${hidden ? 'bbp__info is-sp' : 'bbp__info'} style=${`${box(multi ? 370.8 : hidden ? 78.8 : 83.4, multi ? -55.8 : hidden ? -29.5 : -29.9, 100, 100)};transform:scale(${hidden ? 1.15 : 1.19})`}>
        <i class="bbp__infobg" style=${box(0, hidden ? -4 : 0, 122, 122)}></i>
        ${portrait ? html`<i class="bbp__portrait" style=${`${box(0, 0, 60, 60)};background-image:url("${portrait}")`}></i>` : null}
        <i class="bbp__tiny" style=${hidden ? box(0, -17.8 - 4, 80, 80) : box(0, -21.8, 52, 52)}></i>
      </div>
      <div class="bbp__desc" style=${box(0, multi ? -14.7 : hidden ? -86.9 : -105.3, 600, 100)}>
        <i class="bbp__shadow" style=${box(0, multi ? -80 : hidden ? -13.8 : 8.2, 420, 212)} aria-hidden="true"></i>
        ${hidden ? html`
          <b class="bbp__big" style=${box(0, 0, 600, 44.41)}>${t('隐藏回合已解锁')}</b>
          <span class="bbp__small" style=${box(0, -33.4, 600, 27.3)}>${title}</span>`
        : html`
          <span class="bbp__small" style=${box(0, multi ? -58.3 : 32.5, 600, 27.3)}>${t('决战回合')}</span>
          <b class="bbp__big" style=${box(0, multi ? -106 : 0, 600, 40)}>${title}</b>`}
      </div>
      <i class="bbp__screen" style=${box(0, 0, 1000, 520 - 148)} aria-hidden="true"></i>
    </div>
  </div>`;
}

// ---- the match's end (settle_ending_dialog) ------------------------------------------------------------------------

/**
 * The ending of a match from m.result (the client's AutoChessSettleDataModel.EndingStatus): 'NORM_BOSS_WIN' (the leader
 * beaten, no hidden round), 'HIDE_BOSS_FAIL' (the leader beaten, the hidden core not), 'HIDE_BOSS_WIN' (both),
 * 'GAME_OVER' (defeat / elimination); null for an aborted match (abandoned, error) or no result.
 * @param {any} r m.result
 */
export function endingOf(r) {
  if (!r || typeof r !== 'object') return null;
  if (!r.victory) return r.reason === 'abandoned' || r.reason === 'error' ? null : 'GAME_OVER';
  if (r.hiddenCleared) return 'HIDE_BOSS_WIN';
  return r.hiddenReached ? 'HIDE_BOSS_FAIL' : 'NORM_BOSS_WIN';
}

/** Each ending's clip (battle_win_first_boss 1.97 s, battle_lose_break_one_boss 1.97, battle_win_all_boss 3.0, battle_lose_all_out
 * 2.10) plus a hold [추정], within the dialog's MAX_SHOW_TIME 4 s; its sound (_PlayAudio). */
export const ENDINGS = Object.freeze({
  NORM_BOSS_WIN: { ms: 3000, sfx: 'killBossNormal' },
  HIDE_BOSS_FAIL: { ms: 3000, sfx: 'killBoss' },
  HIDE_BOSS_WIN: { ms: 3800, sfx: 'killBossAll' },
  GAME_OVER: { ms: 3000, sfx: 'disconnect' },
});

/**
 * The ending panel (settle_ending_dialog → panel_win_first_boss / panel_lose_break_one_boss / panel_win_all_boss /
 * panel_lose_all_out). KR: 「위수 성공!」 (已击败首个领袖！ — both the leader-only win and the hidden-core loss share the
 * client's text), 「모든 리더 적 처치 완료!」 (the client's img_text_win_all picture — drawn as text here so the pack
 * can translate it), 「시뮬레이션 중단」 (模拟中断, our translation).
 * @param {{ status: keyof typeof ENDINGS, portrait?: string|null, onDone?: () => void }} props
 */
export function SettleEnding({ status, portrait = null, onDone }) {
  const cfg = ENDINGS[status] || ENDINGS.GAME_OVER;
  const [gone, leaving] = usePlay(cfg.ms - 400, 400, onDone);
  if (gone) return null;
  const art = battleArt('ending');
  const info = (x, y, sp, cleared) => html`<i class=${sp ? 'bse__info is-sp' : 'bse__info'} style=${box(x, y, 100, 100)}>
    <i class="bse__infobg" style=${box(0, sp ? -4 : 0, 122, 122)}></i>
    ${portrait && !sp ? html`<i class="bse__portrait" style=${`${box(0, 0, 60, 60)};background-image:url("${portrait}")`}></i>` : null}
    <i class="bse__tiny" style=${sp ? box(0, -21.8, 80, 80) : box(0, -21.8, 52, 52)}></i>
    ${cleared ? html`<i class="bse__clear" style=${box(18.7, 22.6, 47, 49)}></i>` : null}
  </i>`;
  let body;
  if (status === 'GAME_OVER') {
    const mk = maskBox(0, 0, 1000, 520, [0, 140, 0, 133]);
    body = html`<div style=${mk.style}><i class="bse__plate is-1" style=${box(mk.dx, mk.dy - 22.5, 1008, 520)}></i></div>
      <i class="bse__links" style=${box(-101, 8.8 - 4.2, 760, 450)}>
        ${[-104, -52, 0, 52, 104].map((x, k) => html`<i key=${k} class="bse__link" style=${`${box(x, 0, 40, 296)};--k:${k}`}><i class="is-1"></i><i class="is-2"></i><i class="is-out"></i></i>`)}
      </i>
      <i class="bse__shadow" style=${box(215.7, 8.8 - 13.5, 430, 166)}></i>
      <b class="bse__text is-fail" style=${box(163.4, 8.8, 250, 66.7)}>${t('模拟中断')}</b>`;
  } else if (status === 'HIDE_BOSS_WIN') {
    const mk = maskBox(0, 0, 1000, 520, [0, 72, 0, 76]);
    body = html`<div style=${mk.style}><i class="bse__plate is-1" style=${box(mk.dx + 4.6, mk.dy, 1008, 520)}><i class="bse__fx" style=${box(-4.6, -5.1, 946, 433)}></i></i></div>
      <i class="bse__win" style=${box(-68, 8.8 + 22.5, 240, 240)}></i><i class="bse__win is-sp" style=${box(72, 8.8 + 21.1, 240, 240)}></i>
      ${info(-166.5, 28.8, false, true)}${info(166.5, 28.8, true, true)}
      <b class="bse__text is-all" style=${box(0, 8.8 - 95.6, 600, 116)}>${t('已击败全部领袖！')}</b>`;
  } else {
    const fail = status === 'HIDE_BOSS_FAIL';
    const mk = maskBox(0, 0, 1000, 520, [0, 52, 0, 52]);
    body = html`<div style=${mk.style}><i class="bse__plate is-2" style=${box(mk.dx + 4.6, mk.dy, 1009, 417)}></i></div>
      ${fail ? html`<i class="bse__back" style=${box(88, 8.8 + 36.3, 400, 391)}></i><i class="bse__sp" style=${box(88, 8.8 + 46.3, 200, 200)}></i>
        <i class="bse__boss" style=${box(-88, 8.8 + 45.7, 155.5, 155.5)}></i>${info(-37.5, -4.3, false, true)}${info(151.6, -4.3, true, false)}`
        : html`<i class="bse__boss" style=${box(0, 8.8 + 40, 220, 220)}></i>${info(133.5, 45, false, true)}`}
      <b class="bse__text" style=${box(0, 8.8 - 93, 600, 68.9)}>${t('已击败首个领袖！')}</b>`;
  }
  return html`<div class=${['bart', 'bse', `is-${status.toLowerCase()}`, art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style}
      role="status" aria-live="polite">
    <i class="bse__blk" aria-hidden="true"></i>
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>${body}
      <i class="bse__screen" style=${box(0, 0, 1000, 520 - 148)} aria-hidden="true"></i>
    </div>
  </div>`;
}

// ---- the viewer is out (self_dead_dialog) --------------------------------------------------------------------------

/**
 * The elimination dialog (self_dead_dialog, the client's AutoChessBattleUISelfDeadDialog: EventOnBtnWatchOther /
 * EventOnBtnExit; battle_lose_you_out_show 1.85 s): the screen 80 % black, the red plate bg_type_01 with its side lines
 * and read-outs (#a61f1f), the cross img_dec_cross (#8e280c · 70 %), the broken pixel face (icon_01…04) and its caption
 * on the left, the line (46 #e82727) on the right, 「继续观战」 (btn_continue) and 「退出模拟」 (btn_end). The client's
 * texts are not in our tables: 「방어선이 무너졌습니다 / 계속 관전 / 시뮬레이션 나가기」 are ours (the maintainer's
 * 「적당히 번역」, 2026-10-10).
 * @param {{ onWatch: () => void, onExit: () => void }} props
 */
export function SelfDead({ onWatch, onExit }) {
  const art = battleArt('dead');
  if (!art.cls) return null;
  const deadMask = maskBox(0, 0, 1000, 520, [0, 140, 0, 133]);
  return html`<div class=${['bart', 'bsd', art.cls].join(' ')} style=${art.style} role="dialog" aria-modal="true" aria-label=${t('防线已被突破')}>
    <i class="bsd__blk" aria-hidden="true"></i>
    <div class="bart__c" style=${box(0, 0, 1280, 720)}>
      <div style=${deadMask.style} aria-hidden="true"><i class="bsd__plate" style=${box(deadMask.dx, deadMask.dy - 22.5, 1008, 520)}></i></div>
      <i class="bsd__dec" style=${box(0, 5, 960, 250)} aria-hidden="true">
        <i class="bsd__side" style=${box(-480 + 170 - 112.5, -1.3, 225, 25)}></i><i class="bsd__side is-r" style=${box(480 - 170 + 112.5, -1.3, 225, 25)}></i>
        <i class="bsd__up1" style=${box(-480 + 75.84, 125 - 34.45, 72, 13)}></i><i class="bsd__up2" style=${box(-480 + 75.84, 125 - 87.6, 80, 44)}></i>
      </i>
      ${i('bsd__cross', box(0, 8.8, 552, 203))}
      <div class="bsd__main" style=${box(0, 8.8, 460, 140)}>
        ${i('bsd__shadow', box(103, -13.5, 430, 166))}${i('bsd__shadow', box(-103.8, 0.7, 150, 186))}
        <b class="bsd__text" style=${box(-43.3 + 125, 7.9, 250, 66.7)}>${t('防线已被突破')}</b>
        ${i('bsd__tiny', box(45.3, 49.6, 133, 8))}${i('bsd__sp', box(49.2, -36.9, 188, 20))}
        <i class="bsd__icon" style=${box(-103.9, 12.8, 80, 80)} aria-hidden="true">
          ${i('bsd__i2', box(0, 0, 61, 61))}${i('bsd__i3', box(0, 0, 39, 26))}
          ${i('bsd__i1', box(0, 0, 73, 74))}${i('bsd__i4', box(0, 0, 39, 43))}
        </i>
        ${i('bsd__itext', box(-103.9, -40.3, 74, 21))}
      </div>
      <button type="button" class="bsd__btn is-cont" style=${box(-170, -188, 250, 86)} onClick=${() => onWatch?.()}>
        <i class="bsd__btnbg" style=${box(0, -5, 216, 62)}></i><span class="bsd__btntext" style=${box(16, 0, 160, 45)}>${t('继续观战')}</span>
      </button>
      <button type="button" class="bsd__btn is-end" style=${box(170, -188, 250, 86)} onClick=${() => onExit?.()}>
        <i class="bsd__btnbg" style=${box(0, -5, 218, 62)}></i><span class="bsd__btntext" style=${box(16, 0, 160, 45)}>${t('退出模拟')}</span>
      </button>
      <i class="bse__screen" style=${box(0, 0, 1000, 520 - 273)} aria-hidden="true"></i>
    </div>
  </div>`;
}

// ---- 准备 with funds left (AutoChessConfirmDialogInPage) ---------------------------------------------------------

/**
 * The 准备 question with funds left, in the client's own confirm dialog (the client's
 * AutoChessBattleUIController._GetPreReadyTipGoldDialogTabInput: AutoChessConfirmDialogInPage with the text
 * AUTO_CHESS_BATTLE_PREP_READY_TIP_2, the check box AUTO_CHESS_BATTLE_PREP_READY_TIP_NOMORE, 取消 / 确认; shown when
 * AutoChessBattleUIViewModel.IsNeedToShowPreReadyTipGold — funds > 0 and the strategy not in noMoneyTipsBand; the box
 * ticked sets AutoChessLocalCache DataInScene.isPrevReadyGoldTipDisable — no more for this match). Prefab
 * auto_chess_confirm_with_cancel_view: the screen behind blurred (blur, a UIRenderTextureImage), the dark band
 * img_confirm_dialog_bg (sliced 40 / 40 / 42 / 42) across the screen, 257 tall at y +39; the text (26 white, 1080 × 162 at
 * y +10 in the band) and the check line under it (y −82: the 21 box img_confirm_dialog_check_box, ticked
 * img_confirm_dialog_check_small, the caption 22 #dcdcdc, 4.2 apart); under the band (y −140) the two buttons, half the
 * width each, 103 tall: 取消 on img_confirm_dialog_btn_gray_bg (sliced 20 / 20; icon img_confirm_dialog_cancel 43, white)
 * and 确认 on img_confirm_dialog_btn_green_bg (sliced 22 / 322; icon img_confirm_dialog_check 45 black, text #051511),
 * the icon and its caption 15 apart, 14.5 above the middle. The client's TIP_2 / TIP_NOMORE texts are not in our
 * tables: the question is the remake's own wording [ASSUMED], 「本局不再提示」 ours too.
 * `check` false: the temp-overflow question (_GetPreReadyTipHandOverflowDialogTabInput: AUTO_CHESS_BATTLE_PREP_READY_TIP_1,
 * the same view without the check box — content_without_check: the text 1080 × 200 in the middle of the band; our wording).
 * `only`: auto_chess_only_confirm_view — the same band and text without the check box, one 确认 button across the screen
 * (panel_btns: btn_confirm FlexibleWidth 1; the green plate [추정]: the view also holds a red one) — the server-lost and
 * solo-resume dialogs (OnlyConfirmDialog). Esc confirms there (there is nothing to cancel).
 * @param {{ text: string, check?: boolean, only?: boolean, onAnswer: (ok: boolean, noMore: boolean) => void }} props
 */
export function ReadyTipDialog({ text, check = true, only = false, onAnswer }) {
  if (only) check = false;
  const [noMore, setNoMore] = useState(false);
  const okRef = useRef(null);
  const live = useRef({ noMore, onAnswer, only });
  live.current = { noMore, onAnswer, only };
  useEffect(() => {
    try { okRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
    // Esc cancels, Enter confirms (capture: the match's own Space / Enter shortcuts must not see them)
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); live.current.onAnswer(live.current.only, false); }
      else if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); e.stopImmediatePropagation(); live.current.onAnswer(true, live.current.noMore); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const art = battleArt('confirm');
  return html`<div class=${['bart', 'bcd', art.cls].join(' ')} style=${art.style} role="dialog" aria-modal="true" aria-label=${text}>
    <i class="bcd__blur" aria-hidden="true"></i>
    <div class="bcd__band" style=${'top:calc(50% - var(--pu) * (39.05 + 257.09 / 2));height:calc(var(--pu) * 257.09)'}>
      <i class="bcd__bg" aria-hidden="true"></i>
      <p class=${check ? 'bcd__text' : 'bcd__text is-alone'}>${text}</p>
      ${check ? html`<button type="button" class=${noMore ? 'bcd__check is-on' : 'bcd__check'} role="checkbox" aria-checked=${String(noMore)}
        onClick=${() => setNoMore((v) => !v)}><i class="bcd__box" aria-hidden="true"></i><span>${t('本局不再提示')}</span></button>` : null}
    </div>
    <div class="bcd__btns" style=${'top:calc(50% - var(--pu) * (-140 + 103 / 2));height:calc(var(--pu) * 103)'}>
      ${only ? null : html`<button type="button" class="bcd__btn is-cancel" onClick=${() => onAnswer(false, false)}>
        <i class="bcd__btnbg" aria-hidden="true"></i><span class="bcd__group"><i class="bcd__icon" aria-hidden="true"></i><span>${t('取消')}</span></span>
      </button>`}
      <button type="button" class="bcd__btn is-ok" ref=${okRef} onClick=${() => onAnswer(true, noMore)}>
        <i class="bcd__btnbg" aria-hidden="true"></i><span class="bcd__group"><i class="bcd__icon" aria-hidden="true"></i><span>${t('确认')}</span></span>
      </button>
    </div>
  </div>`;
}

// ---- connection: reconnect mask, server lost, solo resume (AutoChessBattleUIController) ------------------------------

/**
 * 「等待重连中......」 (auto_chess_reconnect_mask in the controller's _reconnectWaitContainer) while the socket reconnects
 * during a match: bg_block over the whole screen (it takes every press: nothing can be sent anyway), the dark tiled foot
 * bg_lower_tile (218 tall), and a band 60 tall centred 80 above the bottom edge — orange tiles banner_orange_tile out to the
 * screen's sides, the black middle banner_black_tile 540 wide, the frame lines banner_frame (sliced 8 | 18; the right one
 * mirrored) from the sides to ±197.5, banner_dec at −131 — with icon_waiting (35 tall, #ef7c39) and the text (22,
 * #ef7c39) 6 apart in the middle. Text: the client's own 「等待重连中......」 (prefab m_InputText); KR 「재연결 대기 중......」
 * ours. Shown by ui/connBanner.js instead of its banner (and its 立即重连 button — the official mask has none).
 */
export function ReconnectMask() {
  const art = battleArt('reconnect');
  return html`<div class=${['bart', 'brc', art.cls].join(' ')} style=${art.style} role="alert" aria-live="assertive" data-testid="reconnect-mask">
    <i class="brc__block" aria-hidden="true"></i>
    <i class="brc__tile" aria-hidden="true"></i>
    <div class="brc__band">
      <i class="brc__orange is-l" aria-hidden="true"></i><i class="brc__orange is-r" aria-hidden="true"></i><i class="brc__mid" aria-hidden="true"></i>
      <i class="brc__frame is-l" aria-hidden="true"></i><i class="brc__frame is-r" aria-hidden="true"></i><i class="brc__dec" aria-hidden="true"></i>
      <span class="brc__notice"><i class="brc__icon" aria-hidden="true"></i><span class="brc__text">${t('等待重连中......')}</span></span>
    </div>
  </div>`;
}

/**
 * The one-button confirm dialog (auto_chess_only_confirm_view) of the server-lost / solo-resume tabs: `text`, 确认 →
 * onOk. Server lost (the client's _HandleServerLost → tab_server_lost_dialog, _GetServerLostDialogTabInput:
 * AUTO_CHESS_BATTLE_SERVER_LOST_TIP, or …_TIP_NEGATIVE_PLAY when the server ended the game for inactivity; 确认 →
 * AutoChessGameManager.QuitGame). Solo resume (EventOnShowSingleResumeDialog → tab_single_resume_dialog,
 * _GetSingleResumeDialogTabInput: AUTO_CHESS_BATTLE_SINGLE_RESUME_DIALOG; 确认 → ReqResumeSingleMode). The client's texts
 * are not in our tables: ours (research 2026-10-10-autochess-ui-gap 「한국어 문구 확정표」).
 * @param {{ text: string, onOk: () => void }} props
 */
export function OnlyConfirmDialog({ text, onOk }) {
  return html`<${ReadyTipDialog} text=${text} only=${true} onAnswer=${() => onOk()} />`;
}

/**
 * The solo-resume dialog shows when a match screen opens on a solo run already under way (a reload or a new tab: the
 * client asks before ReqResumeSingleMode) — not on its first phases (the run is just starting) nor its result.
 * @param {any} pub m.public of the first state this screen sees @param {boolean} solo
 */
export function soloResumeDue(pub, solo) {
  if (!solo || !pub || typeof pub.phase !== 'string') return false;
  return !['LOBBY', 'INFO_CHECK', 'BAND_DRAFT', 'BATTLE_CHECK', 'RESULT'].includes(pub.phase);
}

// ---- the latency panel (panel_ping) ---------------------------------------------------------------------------------

/** Latency tier by constData pingConds (cond 1 / 60 / 200 ms → ping.low / ping.medium / ping.high). */
export function pingTier(ms) {
  if (!Number.isFinite(ms)) return null;
  return ms >= 200 ? 'high' : ms >= 60 ? 'medium' : 'low';
}

/**
 * panel_ping (AutoChessBattleUIPingPanel): img_delay_bkg 76 × 24 at 115.5 from the screen's left, 20.3 from its top, the
 * text 16 (best fit) white, centred — constData pingConds 「当前延迟<@ping.low>{0}</>ms」 (KR 「PING {0}ms」, EN
 * 「Current ping: {0}ms」), the number in the gamedata_const richTextStyles colour (#7fa826 / #ec7a00 / #ff3d3d).
 * @param {{ ms?: number|null, online?: boolean }} props
 */
export function PingPanel({ ms, online = true }) {
  const art = battleArt('ping');
  const ok = online && Number.isFinite(ms);
  const tier = ok ? pingTier(ms) : null;
  const num = html`<b class=${`bping__num is-${tier || 'off'}`}>${ok ? Math.min(9999, Math.round(ms)) : '--'}</b>`;
  return html`<span class=${['bping', art.cls].join(' ')} style=${art.style} title=${ok ? t('当前延迟 {ms}ms', { ms: Math.round(ms) }) : t('未连接')}
    data-testid="ping-panel">${tParts('当前延迟{ms}ms', { ms: num })}</span>`;
}

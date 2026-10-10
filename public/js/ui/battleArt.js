// Official 卫戍协议 battle dialogs (docs/rules/ui.md 「공식 위수협약 UI」, maintainer request 2026-10-10), drawn from the
// client's own prefabs — sizes in the 1280×720 canvas unit (`--pu`, css/battle-art.css), sprites from the local-client
// extraction (data/local-assets.json ui/battle; without it a dialog is not shown and upstream's banner stays), the
// lengths from the prefabs' legacy animation clips (their last keyframe):
//   UIBattleLoading (battle scene)  LoadingScreen     the battle loading screen: the mode's loading picture (web manifest
//                                                     ui `loading/<loadingPic>`), "OPERATION", the mode code, its short
//                                                     name (KR capture 「AC-3 극한」), an official tip, "Loading"
//   game_start_dialog               GameStartBanner   全局作战目标 / 通过14回合，消灭领袖 (KR 「전역 작전 목표 / 리더 적
//                                                     섬멸!」), game_start_dialog_show 3.42 s
//
//   loadingArt(mode)       { pic, code, name } of the loading screen, or null without the picture
//   battleArt(kind)        { cls, style } — the sprite variables of a dialog when the local art has all of them

import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { uiUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { t, N_ } from '../../../shared/i18n.js';

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
});
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
    const u = localAsset('ui/battle', key);
    if (!u) { ok = false; break; }
    vars.push(`${name}:url("${u}")`);
  }
  const v = ok ? { cls: 'has-battle-art', style: vars.join(';') } : NONE;
  cache.set(kind, { m, v });
  return v;
}

/** Position of a prefab RectTransform inside its parent (centre anchors): x, y = anchoredPosition (y up), w, h = size. */
const box = (x, y, w, h) => `left:calc(50% + var(--pu) * ${x - w / 2});top:calc(50% - var(--pu) * ${y + h / 2});width:calc(var(--pu) * ${w});height:calc(var(--pu) * ${h})`;
const i = (cls, b, extra = '') => html`<i class=${cls} style=${extra ? `${b};${extra}` : b} aria-hidden="true"></i>`;

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
 * The short name under the mode code (KR captures, maintainer 2026-10-10: 「AC-3 극한」, 「AC-4 초월」 — the mode name
 * without its 模拟 / 시뮬레이션; the client fills UIStageInfo from a start parameter we could not follow, so [추정] for
 * AC-1 / AC-2 by the same pattern).
 */
const SHORT = Object.freeze({ FUNNY: N_('标准'), NORMAL: N_('险境'), HARD: N_('绝境'), ABYSS: N_('终极'), TRAINING: N_('入门协议') });

/**
 * What the loading screen shows for a mode record (config.json modes[modeId]): its picture (the web manifest's
 * `loading/<loadingPic>`), code and short name; null when the picture is not in the manifest.
 * @param {any} mode
 * @returns {{ pic: string, code: string, name: string } | null}
 */
export function loadingArt(mode) {
  if (!mode || typeof mode !== 'object' || !mode.loadingPic) return null;
  const pic = uiUrl(data.get('assets'), `loading/${mode.loadingPic}`);
  if (!pic) return null;
  const short = SHORT[mode.difficulty];
  return { pic, code: String(mode.code || ''), name: short ? t(short) : String(mode.name || '') };
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
 * stage info in the middle — "OPERATION" (Novecento wide 30, y +60), the code (90, y −20), the short name (60, y −120) —
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
 * Which band shows (client code AutoChessBattleUIBottomTipsViewModel.UpdateData, 2026-10-10): in the prep (not watching
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
 * (client code AutoChessBattleUIViewModel.IsWaitingPanelShow: a prep or battle state at its END sub-state — the own part
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

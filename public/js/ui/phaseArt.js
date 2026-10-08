// Official look of two phase screens (local patch, docs/LOCAL-PATCH.md "휴식 진입·현상 수배 화면"), from the client's
// own prefabs in ui/autochess/[uc]autochessbattle.ab, sizes in its 1280×720 canvas unit (`--pu`, css/phase-art.css):
//   round_start_dialog                    the round-start banner (KR 「라운드 03 · 획득 +6」): the pixel mascot in its
//                                         bracket frame, [回合] and the round, [获得] and the funds this round start gave
//   autochess_battle_effect_choose_panel  the 机变 / 悬赏 choice screen (ui/choiceOverlay.js): the title block, the
//   card_small_item / card_avatar_item    cards (white-framed plate, select glow + frame, the 确认选择 bar, a taken
//                                         card greyed with the taker's round avatar), the "轮到你了" turn flash
//   round_result_dialog                   the own battle's end (KR 「전투 종료 · 완벽한 작전!」): panel_perfect (teal-glow
//                                         plate bg_all, the X-eyed cube and the sword) or panel_miss (the dark plate, the
//                                         skull and its sword, 目标生命值减少 + the LP rook + the LP lost, in red)
// The first two use web manifest sprites (data/assets.json ui `roundStartDialog/*`, `effectChoose/*`), so every player
// gets the look; without them they keep upstream's look (PhaseBanner / the original cards: no `has-phase-art`). The
// battle-end banner's sprites are only in the local-client extraction (data/local-assets.json ui/battle): without them
// there is no banner, as upstream.
//
//   phaseArt(kind)         { cls, style } — kind 'round' | 'choose' | 'result'
//   RoundStartBanner       the banner (screens/game.js shows it for the ROUND_START banner when phaseArt('round') has art)
//   BattleEndBanner        the battle-end banner (screens/game.js, on the own battle's result when phaseArt('result') has art)
//   useRoundGold(phase, f, rg, round) the funds the round start credited: the server's m.private `roundGold` (local patch
//                          server/local-patch.js — Match.startRound's income + pending + onRoundStart grants), else own
//                          funds now − the last funds known before ROUND_START (upstream server; often 0: m.private
//                          with the new funds arrives before the throttled m.public that switches the phase)
//   useTurnFlash(on)       true for TURN_FLASH_MS after `on` turns true (the client's panel_your_turn_show)
//   YourTurn               the turn flash (ui/choiceOverlay.js)

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { uiUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { PHASE } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';

const ROUND = Object.freeze({
  '--pa-bg': 'roundStartDialog/round_bg',
  '--pa-line': 'roundStartDialog/round_bg_line',
  '--pa-cross': 'roundStartDialog/round_cross',
  '--pa-frame': 'roundStartDialog/common_frame',
  '--pa-blank': 'roundStartDialog/common_blank',
  '--pa-book': 'roundStartDialog/round_emoji_book',
  '--pa-head': 'roundStartDialog/round_emoji_head',
  '--pa-body': 'roundStartDialog/round_emoji_body',
  '--pa-hand': 'roundStartDialog/round_emoji_hand',
  '--pa-text1': 'roundStartDialog/round_text_01',
  '--pa-text2': 'roundStartDialog/round_text_02',
  '--pa-box': 'roundStartDialog/round_left_bg',
  '--pa-bracket': 'roundStartDialog/round_frame',
  '--pa-plus': 'roundStartDialog/round_plus',
  '--pa-gold': 'roundStartDialog/round_sources_icon',
  '--pa-tile': 'roundStartDialog/tile_line',
});
const CHOOSE = Object.freeze({
  '--pc-title': 'effectChoose/title',
  '--pc-grad': 'effectChoose/bg_grad',
  '--pc-lines': 'shopCard/repeat_line',
  '--pc-card': 'effectChoose/card_bg_normal',
  '--pc-card-grey': 'effectChoose/card_bg_selected',
  '--pc-frame': 'effectChoose/card_select_frame',
  '--pc-glow': 'effectChoose/card_select_glow',
  '--pc-btn': 'effectChoose/card_btn_bg',
  '--pc-btn-icon': 'effectChoose/card_btn_icon',
  '--pc-head-bg': 'effectChoose/avatar_head_bg',
  '--pc-head-ring': 'effectChoose/avatar_head_outline',
  '--pc-circle': 'effectChoose/bg_circle',
  '--pc-plus': 'effectChoose/plus',
  '--pc-cube': 'effectChoose/square_1',
  '--pc-cube-fx': 'effectChoose/square_2',
  '--pc-bottom': 'effectChoose/bottom',
  '--pc-tip-glow': 'effectChoose/tip_glow',
  '--pc-wait': 'effectChoose/tip_wait',
});
/** CSS variable → local-client sprite name in data/local-assets.json ui/battle (round_result_dialog). */
const RESULT = Object.freeze({
  '--pr-all': 'bg_all', '--pr-bg': 'round_bg', '--pr-line': 'round_bg_line', '--pr-dot': 'dot_blank', '--pr-doc': 'doc_01',
  '--pr-cross': 'left_cross', '--pr-frame': 'left_frame', '--pr-head': 'all_emoji_head', '--pr-sword': 'sword',
  '--pr-text1': 'doc_text_01', '--pr-text2': 'doc_text_02', '--pr-body': 'emoji_body', '--pr-miss': 'miss_emoji_head',
  '--pr-blood': 'blood_icon', '--pr-tile': 'tile_line',
});
const KIND = { round: { map: ROUND, cls: 'has-phase-art' }, choose: { map: CHOOSE, cls: 'has-phase-art' }, result: { map: RESULT, cls: 'has-phase-art', local: 'ui/battle' } };
const NONE = Object.freeze({ cls: '', style: '' });
const cache = new Map();

/** { cls, style }: `has-phase-art` and the sprite variables when the web manifest has every sprite, else nothing. */
export function phaseArt(kind) {
  const k = KIND[kind];
  if (!k) return NONE;
  const m = k.local ? data.get('local') : data.get('assets');
  const hit = cache.get(kind);
  if (hit && hit.m === m) return hit.v;
  const vars = [];
  let ok = !!m;
  for (const [name, key] of Object.entries(k.map)) {
    const u = k.local ? localAsset(k.local, key) : uiUrl(m, key);
    if (!u) { ok = false; break; }
    vars.push(`${name}:url("${u}")`);
  }
  const v = ok ? { cls: k.cls, style: vars.join(';') } : NONE;
  cache.set(kind, { m, v });
  return v;
}

/** Position of a prefab RectTransform inside its parent (centre anchors): x, y = anchoredPosition (y up), w, h = size. */
const box = (x, y, w, h) => `left:calc(50% + var(--pu) * ${x - w / 2});top:calc(50% - var(--pu) * ${y + h / 2});width:calc(var(--pu) * ${w});height:calc(var(--pu) * ${h})`;
const i = (cls, b) => html`<i class=${cls} style=${b} aria-hidden="true"></i>`;

// the mascot's floating squares (round_start_dialog blank_01…05, #1aad88), relative to the emoji box
const BLANKS = [[-30, 50.7], [-47.8, 38.1], [-38, 25.7], [47.2, 41], [55.2, 24.9]];
// gold pixels around 获得 (frame 13 of the KR capture: the ui_particle `dot`, [추정] places)
const DOTS = [[-40, 4, 0], [-30, -20, 0.15], [36, 14, 0.3], [44, -8, 0.1], [-6, 26, 0.45], [24, -24, 0.25], [-44, -12, 0.35]];

/**
 * The round-start banner (round_start_dialog): ~1.8 s, then fades (its round_start_dialog_out). `watching`: an eliminated
 * player or a spectator seat — the round pays it nothing (server startRound pays the seats still in), so the [获得] box
 * gives way to 「观战中」 in the [回合] box's look (upstream 7d97b80b / GitHub #236's word; [추정] look: no capture of a
 * watcher's dialog).
 * @param {{ round: number, gold?: number|null, watching?: boolean, duration?: number, onDone?: () => void }} props
 */
export function RoundStartBanner({ round, gold = null, watching = false, duration = 1800, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  // local patch: keep the credited funds once known — the banner outlives ROUND_START (the phase turns PREP / 机变 while
  // it still shows, and useRoundGold is null there: the 获得 box dropped to 0)
  const kept = useRef(null);
  if (Number.isFinite(gold)) kept.current = gold;
  gold = kept.current;
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), duration);
    const t2 = setTimeout(() => { setGone(true); onDone?.(); }, duration + 260);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);
  if (gone) return null;
  const art = phaseArt('round');
  const r = String(Math.max(0, Math.trunc(Number(round) || 0))).padStart(2, '0');
  const g = Number.isFinite(gold) && gold > 0 ? Math.trunc(gold) : 0;
  return html`<div class=${['parb', art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style} role="status" aria-live="polite"
      aria-label=${watching ? `${t('回合 {r}', { r })} · ${t('观战中')}` : g ? t('回合 {r} · 获得 {g}', { r, g }) : t('回合 {r}', { r })}>
    <div class="parb__c" style=${box(0, 0, 1280, 720)}>
      <i class="parb__bg" style=${box(2.3, 2.8, 631.8, 298.6)} aria-hidden="true"><i class="parb__line" style=${box(-2, -0.6, 496, 169.2)}></i></i>
      <i class="parb__tile" style=${box(0, 0, 583.4, 222.2)} aria-hidden="true"></i>
      <div class="parb__left" style=${box(-137, 1.8, 221.5, 168.6)} aria-hidden="true">
        ${i('parb__cross', box(-86.2, 61.7, 16.1, 16.3))}${i('parb__cross', box(-86.2, -63.9, 16.1, 16.3))}
        ${i('parb__cross', box(85.8, -63.9, 16.1, 16.3))}${i('parb__cross', box(85.8, 61.7, 16.1, 16.3))}
        ${i('parb__frame', box(-86.7, 1.4, 9.3, 78.1))}${i('parb__frame is-r', box(86.3, 1.4, 9.3, 78.1))}
        <div class="parb__emoji" style=${box(0, 0, 146.3, 127.1)}>
          <div class="parb__main" style=${box(-5.9, 2.3, 91.7, 77.7)}>
            ${i('parb__head', box(9.6, 12.1, 67.9, 52.9))}
            ${i('parb__body', box(10.1, -20.1, 32.2, 37.9))}${i('parb__hand', box(36, -21.6, 19.5, 14.6))}
            <i class="parb__clip" style=${box(-27.7, -15.2, 38.9, 52.3)}>${i('parb__book', box(0.5, 1.6, 29.7, 41.2))}</i>
          </div>
          ${BLANKS.map(([x, y], k) => html`<i key=${k} class="parb__blank" style=${`${box(x, y, 8, 8)};--k:${k}`}></i>`)}
        </div>
        ${i('parb__text1', box(-5.6, -60.9, 56.2, 7.2))}${i('parb__text2', box(-6.2, -67.8, 43.2, 4.1))}
      </div>
      <div class="parb__box" style=${box(38.6, 1.8, 112, 108)}>
        ${i('parb__bracket', box(-36.2, 23.2, 4.2, 23.1))}${i('parb__bracket is-r', box(35.3, 23.2, 4.2, 23.1))}
        <span class="parb__title" style=${box(0, 24.1, 71.7, 24.8)}>${t('回合')}</span>
        <span class="parb__round num" style=${box(-2.7, -11.65, 100, 49.2)}>${r}</span>
      </div>
      ${watching ? html`<div class="parb__box is-watch" style=${box(168.6, 1.8, 112, 108)}>
        ${i('parb__bracket', box(-36.2, 23.2, 4.2, 23.1))}${i('parb__bracket is-r', box(35.3, 23.2, 4.2, 23.1))}
        <span class="parb__title" style=${box(0, 0, 100, 24.8)}>${t('观战中')}</span>
      </div>` : html`<div class="parb__box is-gold" style=${box(168.6, 1.8, 112, 108)}>
        ${i('parb__bracket', box(-36.2, 23.2, 4.2, 23.1))}${i('parb__bracket is-r', box(35.3, 23.2, 4.2, 23.1))}
        <span class="parb__title" style=${box(0, 24.1, 71.7, 24.8)}>${t('获得')}</span>
        <span class="parb__src" style=${box(27, -13.2, 50, 28.9)}><span class="parb__num num">
          <i class="parb__gold" aria-hidden="true"></i><i class="parb__plus" aria-hidden="true"></i>${g}</span></span>
        <i class="parb__glow" style=${box(0, -15, 112, 32.5)} aria-hidden="true"></i>
        ${DOTS.map(([x, y, d], k) => html`<i key=${k} class="parb__dot" style=${`${box(27 + x, -13 + y, 4, 4)};--d:${d}s`} aria-hidden="true"></i>`)}
      </div>`}
    </div>
  </div>`;
}

/**
 * The own battle's end (round_result_dialog, the KR captures 「완벽한 작전!」 / 「목표 HP 감소 ♜2」). Its script has three
 * animations on two panels: _allPrefectAnim (panel_perfect) and _perfectAnim / _missAnim (both panel_miss, "done" and
 * "miss"). Mapped: a perfect battle → panel_perfect (战斗结束 / 完美作战！); counted leaks → panel_miss with 目标生命值减少
 * and the LP they cost (the counted leaks — Match.settle charges min(cap, counted) unless a 联防 reassigns them);
 * leaks that cost nothing (uncounted) → panel_miss "done", the title alone [추정: the done line is not in any capture].
 * @param {{ perfect: boolean, lost?: number, duration?: number, onDone?: () => void }} props
 */
export function BattleEndBanner({ perfect, lost = 0, duration = 1800, onDone }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), duration);
    const t2 = setTimeout(() => { setGone(true); onDone?.(); }, duration + 260);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);
  if (gone) return null;
  const art = phaseArt('result');
  const n = Math.max(0, Math.trunc(Number(lost) || 0));
  // panel_perfect / panel_miss differ in the plate, the panel offsets and the mascot (prefab values)
  const P = perfect
    ? { bg: box(2.8, 2.8, 618.9, 291.6), blank: [-119.8, 112.1], doc: [-112.5, 83.5], dot: [-82.2, -80.4], left: -135.3, title: -2.5, mask: -18.6 }
    : { bg: box(2.3, 2.8, 631.8, 298.6), blank: [-127.2, 115.6], doc: [-120.1, 87.3], dot: [-90.1, -82.8], left: -137, title: -4.4, mask: -18.1 };
  const W = perfect ? 618.9 : 631.8, H = perfect ? 291.6 : 298.6;
  // anchors (1, 0) / (1, 1) of the plate: from its right-bottom / right-top corner
  const rb = (x, y, w, h) => box(W / 2 + x, -H / 2 + y, w, h);
  const rt = (x, y, w, h) => box(W / 2 + x, H / 2 + y, w, h);
  const ALPHA = [0.6, 1, 0.2, 0.6, 0.4, 1];
  return html`<div class=${['parb', 'prb', perfect ? 'is-perfect' : 'is-miss', art.cls, leaving && 'is-leaving'].filter(Boolean).join(' ')} style=${art.style}
      role="status" aria-live="polite" aria-label=${perfect ? t('战斗结束 · 完美作战！') : n > 0 ? t('战斗结束 · 目标生命值减少 {n}', { n }) : t('战斗结束')}>
    <div class="parb__c" style=${box(0, 0, 1280, 720)}>
      <i class="prb__bg" style=${P.bg} aria-hidden="true">
        <i class="prb__line" style=${box(-2, -0.6, 496, 169.2)}></i>
        <i class="prb__blanks" style=${rb(P.blank[0], P.blank[1], 100, 100)}>
          ${[[21, 4.3], [30, 4.3], [39.2, 4.3], [21, -4.9], [30, -4.9], [39.2, -4.9]].map(([x, y], k) => html`<i key=${k} class="prb__dot" style=${`${box(x, y, 7.2, 8)};opacity:${ALPHA[k]}`}></i>`)}
        </i>
        <i class="prb__doc" style=${rb(P.doc[0], P.doc[1], 75, 18)}></i>
        <i class="prb__dot is-r" style=${rt(P.dot[0], P.dot[1], 9.5, 10.3)}></i>
      </i>
      <i class="prb__tile" style=${box(0, 0, 583.4, 222.2)} aria-hidden="true"></i>
      <div class="prb__left" style=${box(P.left, 1.8, 221.5, 168.6)} aria-hidden="true">
        ${i('prb__cross', box(-86.2, 61.7, 16.1, 16.3))}${i('prb__cross', box(-86.2, -63.9, 16.1, 16.3))}
        ${i('prb__cross', box(85.8, -63.9, 16.1, 16.3))}${i('prb__cross', box(85.8, 61.7, 16.1, 16.3))}
        ${i('prb__frame', box(-86.7, 1.4, 9.3, 78.1))}${i('prb__frame is-r', box(86.3, 1.4, 9.3, 78.1))}
        <div class="prb__emoji" style=${box(0, 0, 146.3, 127.1)}>
          ${perfect ? html`
            ${i('prb__head', box(-26.8, 2.5, 62, 62))}
            ${i('prb__sword', box(7.1 + 28.4, -28.8 + 31.3, 56.8, 62.6))}
            ${i('prb__spark', box(6.1, 32.3 + 8.3, 4.7, 16.6))}${i('prb__spark is-2', box(11.2, 30.9 + 8.3, 4.7, 16.6))}${i('prb__spark is-3', box(13.1, 25 + 8.3, 4.7, 16.6))}`
          : html`
            ${i('prb__body', box(5.1, -16.2, 28, 30))}${i('prb__head is-miss', box(5.1, 20.5, 67, 51))}
            ${i('prb__hand', box(29.6, -15.5, 16, 8))}${i('prb__sword is-down', box(-24.5 - 28.4, -31.2 + 31.3, 56.8, 62.6))}`}
        </div>
        ${i('prb__text1', box(-5.6, -60.9, 56.2, 7.2))}${i('prb__text2', box(-6.2, -67.8, 43.2, 4.1))}
      </div>
      <div class="prb__right" style=${box(105.4, 1.8, 284.7, 168.6)}>
        <span class="prb__title" style=${box(P.title, 16.7, 249.7, 50)}>${t('战斗结束')}</span>
        <span class="prb__desc" style=${box(P.mask, -22.8, 222.4, 29)}>${perfect ? t('完美作战！')
          : n > 0 ? html`<span>${t('目标生命值减少')}</span><i class="prb__blood" aria-hidden="true"></i><b class="prb__lost num">${n}</b>` : null}</span>
      </div>
    </div>
  </div>`;
}

/**
 * The funds the round start credited (the banner's 获得), while it is ROUND_START; null otherwise. The server's
 * `roundGold { round, gain }` (m.private, server/local-patch.js) of this round when present; else own funds now minus the
 * funds of the last render before the phase became ROUND_START.
 * @param {string} phase @param {number|null|undefined} funds own m.private funds
 * @param {{ round: number, gain: number }|null} [rg] m.private roundGold @param {number} [round] m.public round
 */
export function useRoundGold(phase, funds, rg = null, round = null) {
  const last = useRef({ phase: null, funds: null, base: null });
  const f = Number.isFinite(funds) ? funds : null;
  const L = last.current;
  if (phase === PHASE.ROUND_START && L.phase !== PHASE.ROUND_START) L.base = L.funds;
  L.phase = phase;
  if (f != null) L.funds = f; // the last known funds (a render without the private state keeps them)
  if (phase !== PHASE.ROUND_START) return null;
  if (rg && Number.isFinite(rg.gain) && (round == null || rg.round === round)) return Math.max(0, rg.gain);
  if (f == null) return null;
  return L.base == null ? null : Math.max(0, f - L.base);
}

/** How long the "轮到你了" flash stays (panel_your_turn_show; [추정] length — the clip is not read). */
export const TURN_FLASH_MS = 1600;

/** True for TURN_FLASH_MS after `on` turns true. */
export function useTurnFlash(on) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!on) { setFlash(false); return undefined; }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), TURN_FLASH_MS);
    return () => clearTimeout(t);
  }, [on]);
  return flash;
}

/** The turn flash of the choice screen (panel_player_select), centred on the cards; never takes a press. */
export function YourTurn() {
  return html`<div class="pcturn" aria-hidden="true">
    <div class="pcturn__c" style=${box(0, 0, 1280, 720)}>
      ${i('pcturn__bg', box(2, 13, 539, 500))}
      <i class="pcturn__ring is-1" style=${box(4, 15, 301, 301)}></i><i class="pcturn__ring is-2" style=${box(4, 15, 207, 207)}></i>
      <i class="pcturn__ring is-3" style=${box(4, 15, 175.5, 175.5)}></i>
      <div class="pcturn__plus" style=${box(2.9, 9.5, 248, 152)}><i class="is-tl"></i><i class="is-tr"></i><i class="is-bl"></i><i class="is-br"></i></div>
      ${i('pcturn__cube', box(2, 6 + (0.5 - 0.1628) * 134, 131, 134))}
      ${i('pcturn__fx', box(-36.1 + (0.5 - 0.7064) * 80, 77.1 + (0.5 - 0.2889) * 80, 80, 80))}
      <div class="pcturn__bottom" style=${box(4, -50, 214.2, 100)}>
        <b class="pcturn__text" style=${box(0, 20, 239.4, 67.1)}>${t('轮到你了')}</b>
        ${i('pcturn__bar', box(0, -22, 185, 11))}
      </div>
    </div>
  </div>`;
}

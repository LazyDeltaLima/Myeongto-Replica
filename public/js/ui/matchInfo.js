// Match info — the bonds and banned operators of a match (research 06 §4.1 "1/2 确认本局信息", research 01 A2 / 06
// addendum D), one implementation for every place that shows them, so they never drift:
//   * the INFO_CHECK briefing's right column (screens/briefing.js);
//   * the strategy draft's 本局信息 dialog (screens/bandDraft.js; GitHub issue #8 item 1 "选策略时没法返回查看禁用的干员和盟约":
//     players choose a strategy partly by the bonds and operators the match leaves them);
//   * the in-game 本局信息 tab (ui/enemyDrawer.js InfoTab: the same blocks at the drawer's size, each banned operator
//     opening its card — maintainer decision 2026-11-18).
// matchInfoModel (pure) derives everything from m.public and the static data: the drawn set D (gameLogic disabledBondSets —
// "部分盟约所含干员阵容不完整", still activatable through other bonds' operators or items), the bonds the mode keeps
// (config.modes[modeId].inactiveBondIds, e.g. 标准模拟's 10, are left out of the view altogether, as the client's stage-info
// view skips every bond outside the mode's activeBondIdList), those bonds split into 核心 / 附加 in the client's order
// (the ones outside D first, then D, each by the table's identifier, then bondId), the banned operators the view lists
// (m.public bannedChess, known chess only, under a bond of D) sorted by tier, the banned-member count per bond (gameLogic
// bannedPerBond), the banned operators grouped by bond of D and — from the viewer's own m.private — its slotted 自选
// pieces left out of the shop because all their bonds are off (gameLogic diyBannedPieces; 0.2.0).
// The blocks are hookless (unit-tested by calling them) and drawn as the client's stage-info view
// (ui/autochess/[uc]autochessouter.ab prefab_auto_chess_stage_info_*; sprites from the local-client extraction
// ui/outer, with a CSS fallback): the 核心盟约 / 附加盟约 rows of bond items (bond_item: the mint img_bond_bkg disc with a
// dark glyph, or for a greyed bond the grey img_bond_banned_bkg with the img_bond_banned mark — tooltip briefingBondTip),
// the legend, and 本局禁用干员 grouped by bond (chess_banned_group: the greyed bond, a divider, its banned operators each
// under img_chess_banned_mask + the img_chess_banned corner). The client builds one group per banned bond the mode keeps
// from that bond's members in the banned list (AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange →
// AutoChessStageInfoChessGroupModel.LoadData), so an operator whose two bonds are both drawn is under both, a drawn
// bond without banned members still has its (empty) group, and the groups sort as the bond items (identifier, then
// bondId). An operator banned only through bonds the mode switches off is under no group, so the view does not list it
// (the client view skips those bonds; its count here counts the listed operators).
// MatchInfoDialog shows the same blocks read-only in a components.js Modal (关闭, a tap outside or Esc close it) with a
// status line from its caller (the draft's turn and countdown, so the running clock stays in view).
// 规程 solo (m.public bondGroups — the core bonds the mode opens, split in two, one picked in the briefing): the core row is
// the two groups of the client's auto_chess_single_mode_bond_group (BondGroups: the picked one on its panel with
// ALLIANCE ACTIVATED, the other greyed), the 附加盟约 title carries the 「部分盟约所含干员阵容不完整」 tip in place of the legend
// line; the briefing picks there (screens/briefing.js), the dialog and the in-game tab show them read-only.
// Styles: css/screens/briefing.css (.brief-*, .bgrp), css/screens/draft.css (.minfo-dlg).

import { useLayoutEffect, useRef } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel, Tooltip, Modal, TierChip, natSizeVars } from './components.js';
import { Img } from './gameComponents.js';
import { bannedPerBond, disabledBondSets, briefingBondTip, diyBannedPieces } from './gameLogic.js';
import { bondIconUrl, chessAvatarUrl } from './assetUrls.js';
import { skinArt, skinPic } from './skins.js';
import { data, localAsset } from '../data.js';
import { t, dn } from '../../../shared/i18n.js';
import { customSummary, CustomRulesInfo } from './customSummary.js';
import { officialBans } from '../../../shared/ruleset.js';

/** @param {...unknown} p */
const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * @typedef {{ sets: { drawn: Set<string>, off: Set<string> }, stateOf: (bondId: string) => 'off'|'drawn'|null,
 *   bonds: any[], core: any[], addon: any[], banned: string[], perBond: Map<string, number>,
 *   bannedGroups: Array<{ bond: any, chess: string[] }>,
 *   diyBanned: Array<{ slotId: string, charId: string, name: string }>,
 *   custom: Array<{ key: string, tab: string, text: string }> | null,
 *   groups: { groups: string[][], picked: number } | null, addonIncomplete: boolean, bannedAll: string[] }} MatchInfoModel
 */

/**
 * Everything the match-info blocks show.
 * @param {any} pub m.public (drawnDisabledBonds / disabledBonds, bannedChess)
 * @param {{ bonds?: any[], chess?: (id: string) => any, mode?: any, priv?: any, diyData?: any, bans?: any }} [src]
 *   bonds: bonds.json records (data.list('bonds')); chess: the chess lookup; mode: config.json modes[pub.modeId]; priv: the
 *   viewer's m.private (its 自选 pieces out of the shop, diyBanned) with diyData (`{ chess, backups }`: data.get('chess') /
 *   data.get('backups')) to name them; bans: the difficulty's official bond ban counts (shared/ruleset.js officialBans,
 *   by default from the loaded config) for the custom lines
 * @returns {MatchInfoModel}
 *   stateOf: 'off' = the mode never activates the bond (本局禁用), 'drawn' = in the drawn set D (阵容不完整), null = normal;
 *   bonds: every bond record; core / addon: the bonds the mode keeps (no 'off' one), those outside D first, then D, each by
 *   identifier, then bondId (the client's AutoChessStageInfoBondViewModel.CompareTo);
 *   banned: the banned chess ids the data knows that sit under a group, by tier (ties keep the server's order);
 *   perBond: bondId → banned members (over every known banned id); bannedGroups: per bond of D (identifier, then bondId)
 *   its banned members by tier, also when it has none; custom: a 自定义 match's differences from the official rules
 *   (ui/customSummary.js), null for the other presets; groups: 规程 solo's two core bond groups (m.public bondGroups,
 *   the bonds the data knows, in the server's order) and the picked one, else null; addonIncomplete: an add-on bond is
 *   in D (the 附加盟约 tip); bannedAll: m.public bannedChess as it is (the bond detail's banned members)
 */
export function matchInfoModel(pub, { bonds = [], chess = () => null, mode = null, priv = null, diyData = null, bans = undefined } = {}) {
  const sets = disabledBondSets(pub, mode?.inactiveBondIds);
  const stateOf = (/** @type {string} */ id) => (sets.off.has(id) ? 'off' : sets.drawn.has(id) ? 'drawn' : null);
  const list = (Array.isArray(bonds) ? bonds : []).filter((b) => !!b && typeof b === 'object' && typeof b.bondId === 'string');
  // the client's sort of the stage-info bond items and groups: not banned first, then identifier, then bondId (ordinal)
  const shown = list.filter((b) => !sets.off.has(b.bondId)).sort((a, b) => Number(sets.drawn.has(a.bondId)) - Number(sets.drawn.has(b.bondId))
    || (a.identifier ?? 0) - (b.identifier ?? 0) || (a.bondId < b.bondId ? -1 : a.bondId > b.bondId ? 1 : 0));
  const tierOf = (/** @type {string} */ id) => chess(id)?.tier ?? 0;
  /** @type {string[]} */
  const known = (Array.isArray(pub?.bannedChess) ? pub.bannedChess : []).filter((/** @type {unknown} */ id) => typeof id === 'string' && !!chess(id))
    .sort((/** @type {string} */ a, /** @type {string} */ b) => tierOf(a) - tierOf(b));
  const core = shown.filter((b) => b.isCore);
  const addon = shown.filter((b) => !b.isCore);
  const bannedGroups = shown.filter((b) => sets.drawn.has(b.bondId)).map((bond) => {
    const members = new Set(Array.isArray(bond.visibleMembers) ? bond.visibleMembers : []);
    return { bond, chess: known.filter((id) => members.has(id)) };
  });
  const listed = new Set(bannedGroups.flatMap((g) => g.chess));
  const bondIds = new Set(list.map((b) => b.bondId));
  const bg = pub?.bondGroups;
  const groups = bg && Array.isArray(bg.groups) && bg.groups.length === 2 && bg.groups.every(Array.isArray) && (bg.picked === 0 || bg.picked === 1)
    ? { groups: bg.groups.map((/** @type {string[]} */ g) => g.filter((id) => bondIds.has(id))), picked: bg.picked } : null;
  return {
    groups, addonIncomplete: addon.some((b) => sets.drawn.has(b.bondId)),
    bannedAll: (Array.isArray(pub?.bannedChess) ? pub.bannedChess : []).filter((/** @type {unknown} */ id) => typeof id === 'string'),
    sets, stateOf, bonds: list, core, addon,
    banned: known.filter((id) => listed.has(id)), perBond: bannedPerBond(list, known), bannedGroups,
    diyBanned: priv && diyData ? diyBannedPieces(priv, chess, diyData) : [],
    custom: customLines(pub, list, mode, bans),
  };
}

/**
 * The custom rules lines of a match (m.public.ruleset.custom), or null when it is not a 自定义 match.
 * @param {any} pub @param {any[]} bonds @param {any} mode @param {any} bans
 */
function customLines(pub, bonds, mode, bans) {
  const rs = pub?.ruleset;
  if (rs?.preset !== 'custom') return null;
  const bondNames = new Map(bonds.map((b) => [b.bondId, b.name]));
  const name = (/** @type {string} */ kind, /** @type {string} */ id) => (kind === 'bond' ? bondNames.get(id) : kind === 'type' ? data.lendable('types', id)?.name
    : kind === 'stage' ? data.lendable('stages', id)?.name : data.lookup('bosses', id)?.name) || id;
  return customSummary(rs.custom, {
    solo: String(pub.modeId || '').includes('single'),
    bans: bans !== undefined ? bans : officialBans(data.get('config'), pub.difficulty, pub.size),
    rounds: Number.isInteger(mode?.lastRound) ? mode.lastRound : null,
    name,
    hidden: (/** @type {string} */ id) => !!data.lookup('bosses', id)?.hidden,
  });
}

/**
 * The viewer's 自选 pieces out of the shop this match (MatchInfoModel `diyBanned`): one line under 本局禁用干员, or nothing.
 * @param {{ model: MatchInfoModel, class?: string }} props
 */
export function DiyBannedLine({ model, class: cls = 'brief-banned__diy' }) {
  const list = model?.diyBanned || [];
  if (!list.length) return null;
  return html`<p class=${cls} data-testid="diy-banned"><span class="diybanned__tag">${t('自选')}</span>
    ${t('{names}的盟约本局全部禁用，不会出现在你的商店', { names: list.map((x) => dn(x.name)) })}</p>`;
}

/** A sprite of the client's stage-info view (local-client extraction ui/outer), or null. */
const outerArt = (/** @type {string} */ name) => localAsset('ui/outer', name);

/**
 * The section title bar of the stage-info view (perm_bond_title = 核心盟约 / temp_bond_title = 附加盟约 / chess_banned_title /
 * enemy_title): the bar sprite, its icon, the title (+ `extra` right after it, e.g. the banned count or the 附加盟约 tip —
 * the bar sprite's logos sit on the right) and the micro label. The icons as the official screens show them, in every
 * mode: 核心盟约 the starburst img_title_icon_temp_bond, 附加盟约 the wing img_title_icon_perm_bond — the reverse of the
 * sprite names (official CN screens 2026-11-18, the maintainer checked a 盟约 screen too: maintainer decision 2026-11-18).
 * img_group_title is drawn sliced as the client's (borders L41 / R492: its RHODES ISLAND logo once, at the right end);
 * `bar` names another bar sprite (规程 solo's 核心盟约 takes img_group_title, as its official screen).
 * @param {{ kind: 'perm'|'temp'|'chess'|'enemy', title: string, micro: string, extra?: any, bar?: string|null }} props
 */
export function InfoTitle({ kind, title, micro, extra = null, bar: barName = null }) {
  const name = barName || (kind === 'perm' ? 'img_group_title_perm_bond' : 'img_group_title');
  const bar = outerArt(name);
  const icon = outerArt(/** @type {Record<string, string>} */ ({ perm: 'img_title_icon_temp_bond', temp: 'img_title_icon_perm_bond', enemy: 'img_title_icon_enemy' })[kind] || 'img_title_icon_chess');
  return html`<h3 class=${cx('brief-h', 'brief-h--art', `brief-h--${kind}`, icon && 'has-icon', bar && name === 'img_group_title' && 'is-sliced')} style=${bar ? `--bar:url("${bar}")` : null}>
    ${icon ? html`<img class="brief-h__icon" src=${icon} alt="" draggable=${false} />` : null}<span>${title}</span>${extra}<${MicroLabel}>${micro}</${MicroLabel}>
  </h3>`;
}

/**
 * One bond as the stage-info view draws it (bond_item, or the bond panel of a banned group): the mint disc with a dark
 * glyph, or — greyed — the grey disc, a grey glyph and the banned mark; the name under it.
 * @param {{ bond: any, off: boolean, small?: boolean }} props
 */
export function InfoBond({ bond, off, small = false }) {
  const bg = outerArt(off ? 'img_bond_banned_bkg' : 'img_bond_bkg');
  const mark = off ? outerArt('img_bond_banned') : null;
  const glyph = [...(bond?.name || '?')][0];
  return html`<span class=${cx('ibd', off && 'is-off', small && 'ibd--sm')}>
    <span class=${cx('ibd__disc', !bg && 'no-art')} style=${bg ? `--disc:url("${bg}")` : null}>
      <${Img} src=${bondIconUrl(data.get('assets'), bond?.bondId)} class="ibd__icon" onLoad=${natSizeVars}
        fallback=${html`<span class="ibd__glyph">${glyph}</span>`} />
      ${off ? (mark ? html`<img class="ibd__mark" src=${mark} alt=${t('禁用')} draggable=${false} />`
        : html`<span class="ibd__x" aria-label=${t('禁用')}><${Icon} name="close" /></span>`) : null}
    </span>
    <span class="ibd__name">${bond?.name || bond?.bondId || ''}</span>
  </span>`;
}

/**
 * One row of bonds (核心盟约 / 附加盟约, MatchInfoModel core / addon — the mode's switched-off bonds are not in them): a
 * greyed item (the banned mark) for a bond in the drawn set D; the tooltip says how many of its operators cannot appear
 * (briefingBondTip). `extra`: after the title (the 附加盟约 tip, IncompleteTip).
 * @param {{ title: string, micro: string, bonds: any[], model: MatchInfoModel, kind?: 'perm'|'temp', extra?: any }} props
 */
export function MatchBondRow({ title, micro, bonds, model, kind = 'temp', extra = null }) {
  return html`<div class="brief-bonds">
    <${InfoTitle} kind=${kind} title=${title} micro=${micro} extra=${extra} />
    <div class="brief-bonds__row">
      ${bonds.map((b) => {
        const state = model.stateOf(b.bondId);
        const off = !!state;
        return html`<${Tooltip} key=${b.bondId} text=${briefingBondTip(b.name, state, model.perBond.get(b.bondId) || 0)}>
          <div class=${cx('brief-bond', off && 'is-off', state === 'drawn' && 'is-incomplete')} data-bond=${b.bondId}>
            <${InfoBond} bond=${b} off=${off} />
          </div>
        <//>`;
      })}
    </div>
  </div>`;
}

/**
 * The tip after the 附加盟约 title when one of its bonds is in D (temp_bond_title panel_tip: img_bond_title_tip_bkg, its
 * left 35 the people mark): 「部分盟约所含干员阵容不完整」, as the official 规程 screens show it.
 * The title row keeps one line (maintainer decision 2026-11-18 — on a phone the drawer's chip had dropped under the
 * title): where the row overflows its box the chip's text shrinks (bestFit, not under TIP_MIN_PX), then ends in an
 * ellipsis (.is-tight; the whole text stays the title). Measured after mounting and when the row's width changes.
 * @param {{ class?: string | null }} [props]
 */
export function IncompleteTip({ class: cls = null } = {}) {
  const ref = useRef(/** @type {HTMLElement | null} */ (null));
  useLayoutEffect(() => {
    const tip = ref.current;
    const row = tip?.parentElement;
    if (!row || typeof getComputedStyle !== 'function') return undefined;
    let last = -1;
    const fit = () => {
      const w = row.clientWidth;
      if (w === last) return;
      last = w;
      fitTip(/** @type {HTMLElement} */ (tip), row);
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(row);
    if (!ro) addEventListener('resize', fit);
    return () => { ro?.disconnect(); if (!ro) removeEventListener('resize', fit); };
  }, []);
  const bg = outerArt('img_bond_title_tip_bkg');
  const text = t('部分盟约所含干员阵容不完整');
  return html`<span ref=${ref} class=${cx('bgrp-tip', !bg && 'no-art', cls)} style=${bg ? `--tip:url("${bg}")` : null} title=${text}><span class="bgrp-tip__t">${text}</span></span>`;
}

/** The chip's smallest text before it is cut (the drawer's names stop at 9 px; the chip is one size under them). */
export const TIP_MIN_PX = 8;

/**
 * IncompleteTip's fit: shrink the chip's text by quarter pixels while its row overflows, not under TIP_MIN_PX; still
 * over, the chip gives way and its text ends in an ellipsis. The title and the other items keep their size (CSS: the
 * micro label gives way first).
 * @param {HTMLElement} tip
 * @param {HTMLElement} row
 */
export function fitTip(tip, row) {
  tip.classList.remove('is-tight');
  tip.style.fontSize = '';
  const over = () => row.scrollWidth > row.clientWidth + 0.5;
  let fs = parseFloat(getComputedStyle(tip).fontSize) || 10;
  for (let n = 0; n < 40 && over() && fs > TIP_MIN_PX; n++) { fs = Math.max(TIP_MIN_PX, fs - 0.25); tip.style.fontSize = `${fs}px`; }
  if (over()) tip.classList.add('is-tight');
}

/** A sprite of the 规程 briefing's stage-info view (season/act3autochess/stageinfo; the shared ones from ui/outer), or null. */
export const stageArt = (/** @type {string} */ name) => localAsset('season/act3autochess/stageinfo', name) || outerArt(name);

/**
 * Item i of a group's list in the panel's item_container_(i+1): the 1st, 3rd and 5th on the top row, the 2nd and 4th
 * under them (3 + 2, or 2 + 2 for four).
 * @param {string[]} list
 * @returns {[string[], string[]]}
 */
export function groupRows(list) {
  return [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
}

/**
 * 规程 solo's two core bond groups (auto_chess_single_mode_bond_group, MatchInfoModel groups): two panels side by side,
 * the picked one on its art (Image_select_text — ALLIANCE ACTIVATED and the check —, the blur, the bar with its notch,
 * the hatched corner; drawn under the bond items) with its bonds lit, the other one's greyed with the banned mark.
 * `onPick` (the briefing, before ready): the panel is a radio and a press on it, its icons included, picks the group
 * (g.bondGroup); a bond icon opens no detail anywhere (maintainer decision 2026-11-18); `hint`: the text_tips line over
 * the panels (the briefing's).
 * Hookless; sized in --u (one prefab unit), set by the caller's CSS.
 * @param {{ model: MatchInfoModel, onPick?: ((i: number) => void)|null, hint?: any }} props
 */
export function BondGroups({ model, onPick = null, hint = null }) {
  const g = model?.groups;
  if (!g) return null;
  const art = ['img_select_text', 'img_blur_bond', 'img_bond_group_select', 'img_select_decorate', 'img_single_choose_bg']
    .map((n, i) => [['--a-text', '--a-blur', '--a-bar', '--a-deco', '--a-bg'][i], stageArt(n)]).filter(([, u]) => u)
    .map(([k, u]) => `${k}:url("${u}")`).join(';');
  const bondOf = (/** @type {string} */ id) => model.bonds.find((b) => b.bondId === id) || { bondId: id, name: id };
  const item = (/** @type {string} */ id, /** @type {boolean} */ off) => {
    const bond = bondOf(id);
    const tip = briefingBondTip(bond.name, off ? 'drawn' : null, off ? model.perBond.get(id) || 0 : 0);
    const inner = html`<${InfoBond} bond=${bond} off=${off} />`;
    return html`<div key=${id} class="bgrp__cell" data-bond=${id}><span class="bgrp__bond" title=${tip}>${inner}</span></div>`;
  };
  const key = (/** @type {number} */ i) => (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); /** @type {(i: number) => void} */ (onPick)(i); } };
  return html`<div class=${cx('bgrp', hint && 'has-hint', onPick && 'is-pickable', !art && 'no-art')} style=${art || null} role=${onPick ? 'radiogroup' : null} data-testid="bond-groups">
    ${hint ? html`<p class="bgrp__hint">${hint}</p>` : null}
    <div class="bgrp__pair">${g.groups.map((list, i) => {
      const off = g.picked !== i;
      const [top, bottom] = groupRows(list);
      return html`<div key=${i} class=${cx('bgrp__panel', `bgrp__panel--${i}`, !off && 'is-picked')} data-group=${i}
          role=${onPick ? 'radio' : null} tabindex=${onPick ? '0' : null} aria-checked=${onPick ? String(!off) : null}
          aria-label=${t('第{n}组', { n: i + 1 })} onClick=${onPick ? () => onPick(i) : null} onKeyDown=${onPick ? key(i) : null}>
        <i class="bgrp__wm" aria-hidden="true"></i><i class="bgrp__blur" aria-hidden="true"></i><i class="bgrp__bar" aria-hidden="true"></i><i class="bgrp__deco" aria-hidden="true"></i>
        <div class="bgrp__row bgrp__row--top">${top.map((id) => item(id, off))}</div>
        <div class="bgrp__row bgrp__row--bot">${bottom.map((id) => item(id, off))}</div>
      </div>`;
    })}</div>
  </div>`;
}

/**
 * BondGroups read-only — the strategy draft's / 3/3 screen's 本局信息 dialog and the in-game tab (no pick, no detail).
 * The prefab unit --u comes from the box's width (880 units; measured — no CSS container queries on our browsers).
 * Where a bond name is wider than the item pitch (100 units) — the in-game drawer on a phone: 31 px for a 9 px name of
 * up to 5 glyphs — the box turns .is-narrow (maintainer decision 2026-11-18): each group one row of its bonds in list
 * order, the two groups stacked, the unit from width / 500 (css/screens/briefing.css).
 * @param {{ model: MatchInfoModel }} props
 */
export function BondGroupsView({ model }) {
  const box = useRef(/** @type {HTMLElement | null} */ (null));
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    let last = -1;
    const fit = () => {
      const w = el.clientWidth;
      if (!(w > 0) || w === last) return;
      last = w;
      el.classList.remove('is-narrow');
      el.style.setProperty('--u', `${w / 880}px`);
      if (namesOverflow(el, w / 880 * 100)) {
        el.classList.add('is-narrow');
        el.style.setProperty('--u', `${w / NARROW_UNITS}px`);
      }
    };
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    if (!ro) addEventListener('resize', fit);
    return () => { ro?.disconnect(); if (!ro) removeEventListener('resize', fit); };
  }, []);
  return html`<div class="bgrp-ro" ref=${box}>
    <div class="bgrp-ro__in"><${BondGroups} model=${model} /></div>
  </div>`;
}

/** BondGroupsView .is-narrow: the box is this many units wide (five items of 100). */
export const NARROW_UNITS = 500;

/**
 * Whether a bond name in `el` is wider than `pitch` px less a 4 px gap (the text's own width, not its box).
 * @param {HTMLElement} el
 * @param {number} pitch
 */
export function namesOverflow(el, pitch) {
  const r = document.createRange();
  return [...el.querySelectorAll('.ibd__name')].some((n) => { r.selectNodeContents(n); return r.getBoundingClientRect().width > pitch - 4; });
}

/**
 * The legend under the bond rows (the grey is the drawn set D only: the bonds the mode switches off are not shown).
 * @param {{ model?: MatchInfoModel }} [_props]
 */
export function MatchLegend(_props) {
  return html`<p class="brief-legend"><span class="brief-legend__off"></span>${t('灰色：部分盟约所含干员阵容不完整（仍可通过其他盟约的干员或装备激活）')}</p>`;
}

/**
 * An operator icon as the client draws it (auto_chess_outer_common_chess, the AutoChessCommonChessView that
 * prefab_auto_chess_stage_info_chess_banned_item loads): the 90-unit avatar on the white card img_chess_bkg (109 × 107
 * with its soft shadow, the card 96 × 95 from 2.5 above-left of the avatar), the tier sprite (35) on the avatar's
 * bottom-left corner (9.1 out to the left and below) and, when `banned`, img_chess_banned_mask (30 % grey, 94 × 95) over
 * avatar and card with img_chess_banned (73, at (33, 32) from the avatar's centre) whose red triangle lands on the card's
 * top-right corner. The chess record of `id` — in this browser's chosen skin (ui/skins.js skinPic: docs/rules/ui.md
 * 「스킨 고르기」) — or `src` / `name` / `tier` for a 自选 pick (the operator's own avatar).
 * Sized by `--ci`, the avatar (css/screens/briefing.css); without the local art, CSS stand-ins.
 * @param {{ id?: string|null, src?: string|null, name?: string, tier?: number|null, banned?: boolean, title?: string|null,
 *   class?: string | null }} props
 */
export function ChessIcon({ id = null, src = null, name = '', tier = null, banned = false, title = null, class: cls = null }) {
  const c = id ? data.lookup('chess', id) : null;
  const url = src || (c ? skinPic(c, 'avatar', skinArt(), { own: true }) || chessAvatarUrl(data.get('assets'), c) : null);
  const label = name || c?.name || '';
  const n = tier ?? c?.tier ?? null;
  const corner = banned ? outerArt('img_chess_banned') : null;
  const card = outerArt('img_chess_bkg');
  const empty = !url && !label;
  return html`<span class=${cx('chessico', banned && 'is-banned', empty && 'is-empty', cls)} title=${title ?? label}>
    ${empty ? null : html`<i class=${cx('chessico__bkg', !card && 'is-css')} aria-hidden="true" style=${card ? `background-image:url("${card}")` : null}></i>`}
    <span class="chessico__art">${empty ? null : html`<${Img} src=${url} alt=${label}
      fallback=${html`<b class="chessico__glyph">${[...label][0] || '?'}</b>`} />`}</span>
    ${banned ? corner ? html`<img class="chessico__ban" src=${corner} alt="" draggable=${false} />` : html`<i class="chessico__ban is-css" aria-hidden="true"></i>` : null}
    ${n ? html`<${TierChip} tier=${n} size="sm" class="chessico__tier" />` : null}
  </span>`;
}

/**
 * The banned operators by greyed bond (MatchInfoModel bannedGroups, chess_banned_group): the bond, a divider and its
 * banned operators by tier, each darkened under the banned corner. With `onChess` each operator is a button that opens
 * its card (the in-game 本局信息 tab, ui/enemyDrawer.js).
 * @param {{ model: MatchInfoModel, onChess?: ((id: string) => void)|null }} props
 */
export function BannedGroups({ model, onChess = null }) {
  const split = outerArt('img_bond_banned_split');
  return html`<div class="brief-bgroups">
    ${(model.bannedGroups || []).map(({ bond, chess }) => html`<div key=${bond.bondId} class="brief-bgroup" data-bond=${bond.bondId}>
      <${Tooltip} text=${briefingBondTip(bond.name, model.stateOf(bond.bondId), model.perBond.get(bond.bondId) || 0)}>
        <div class="brief-bgroup__bond"><${InfoBond} bond=${bond} off=${true} small=${true} /></div>
      <//>
      <i class="brief-bgroup__split" aria-hidden="true" style=${split ? `background-image:url("${split}")` : null}></i>
      <div class="brief-bgroup__chess">
        ${chess.map((id) => onChess
          ? html`<button key=${id} type="button" class="brief-bchess ibanned__one" data-chess=${id} onClick=${() => onChess(id)}><${ChessIcon} id=${id} banned=${true} /></button>`
          : html`<span key=${id} class="brief-bchess" data-chess=${id}><${ChessIcon} id=${id} banned=${true} /></span>`)}
      </div>
    </div>`)}
  </div>`;
}

/**
 * 本局禁用干员: the count, then the groups (BannedGroups; `onChess` makes each operator open its card).
 * @param {{ model: MatchInfoModel, onChess?: ((id: string) => void)|null }} props
 */
export function BannedOperators({ model, onChess = null }) {
  const { banned } = model;
  return html`<div class="brief-banned">
    <${InfoTitle} kind="chess" title=${t('本局禁用干员')} micro="BANNED OPERATORS" extra=${html`<b class="num brief-banned__n">${banned.length}</b>`} />
    ${banned.length ? html`<${BannedGroups} model=${model} onChess=${onChess} />` : html`<p class="t-dim">${t('本局没有禁用干员')}</p>`}
    <${DiyBannedLine} model=${model} />
  </div>`;
}

/**
 * The briefing's bonds and banned operators: 核心盟约, 附加盟约, the legend, 本局禁用干员 (`onChess`: the in-game tab's
 * banned operators open their cards).
 * @param {{ model: MatchInfoModel, onChess?: ((id: string) => void)|null }} props
 */
export function MatchInfo({ model, onChess = null }) {
  if (model.groups) {
    // 规程 solo: the two groups read-only, the tip after 附加盟约 in place of the legend line
    return html`${model.custom ? html`<${CustomRulesInfo} lines=${model.custom} class="brief-custom" />` : null}
      <div class="brief-bonds brief-bonds--groups">
        <${InfoTitle} kind="perm" title=${t('核心盟约')} micro="CORE BONDS" bar="img_group_title" />
        <${BondGroupsView} model=${model} />
      </div>
      <${MatchBondRow} title=${t('附加盟约')} micro="ADD-ON BONDS" bonds=${model.addon} model=${model} kind="temp"
        extra=${model.addonIncomplete ? html`<${IncompleteTip} />` : null} />
      <${BannedOperators} model=${model} onChess=${onChess} />`;
  }
  return html`${model.custom ? html`<${CustomRulesInfo} lines=${model.custom} class="brief-custom" />` : null}
    <${MatchBondRow} title=${t('核心盟约')} micro="CORE BONDS" bonds=${model.core} model=${model} kind="perm" />
    <${MatchBondRow} title=${t('附加盟约')} micro="ADD-ON BONDS" bonds=${model.addon} model=${model} kind="temp" />
    <${MatchLegend} model=${model} />
    <${BannedOperators} model=${model} onChess=${onChess} />`;
}

/**
 * The read-only match-info dialog (the strategy draft's 盟约信息, 确定自选编队's 本局信息): MatchInfo in a Modal that 关闭, a
 * tap outside or Esc closes. `title` follows the caller's button (default 本局信息). `status` (the caller's line, e.g. the
 * draft's turn and countdown) sits left of 关闭.
 * @param {{ open: boolean, onClose: Function, model: MatchInfoModel|null, title?: string | null, hideTitle?: boolean, status?: any }} props
 */
export function MatchInfoDialog({ open, onClose, model, title = null, hideTitle = false, status = null }) {
  return html`<${Modal} open=${open && !!model} onClose=${onClose} title=${title ?? t('本局信息')} hideTitle=${hideTitle} micro="MATCH INFO // BONDS & BANNED OPERATORS" class="minfo-dlg"
    actions=${html`${status ? html`<div class="minfo-dlg__status" data-testid="match-info-status">${status}</div>` : null}
      <${Button} variant="secondary" icon="close" data-autofocus data-testid="match-info-close" onClick=${onClose}>${t('关闭')}<//>`}>
    ${open && model ? html`<${MatchInfo} model=${model} />` : null}
  <//>`;
}

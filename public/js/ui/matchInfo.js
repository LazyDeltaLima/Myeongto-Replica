// Match info — the bonds and banned operators of a match (research 06 §4.1 "1/2 确认本局信息", research 01 A2 / 06
// addendum D), one implementation for every place that shows them, so they never drift:
//   * the INFO_CHECK briefing's right column (screens/briefing.js);
//   * the strategy draft's 本局信息 dialog (screens/bandDraft.js; GitHub issue #8 item 1 "选策略时没法返回查看禁用的干员和盟约":
//     players choose a strategy partly by the bonds and operators the match leaves them);
//   * the data of the in-game 本局信息 tab (ui/enemyDrawer.js InfoTab, its own compact chips and avatars).
// matchInfoModel (pure) derives everything from m.public and the static data: the two kinds of greyed bonds
// (gameLogic disabledBondSets over config.modes[modeId].inactiveBondIds — the drawn set D "部分盟约所含干员阵容不完整",
// still activatable through other bonds' operators or items, and the mode's static inactive bonds "本局禁用", e.g.
// 标准模拟's 10), every bond in the briefing order (bondOrder, then identifier) split into 核心 / 附加, the banned
// operators (m.public bannedChess, known chess only) sorted by tier, the banned-member count per bond (gameLogic
// bannedPerBond), the banned operators grouped by greyed bond and — from the viewer's own m.private — its slotted 自选
// pieces left out of the shop because all their bonds are off (gameLogic diyBannedPieces; 0.2.0).
// The blocks are hookless (unit-tested by calling them) and drawn as the client's stage-info view
// (ui/autochess/[uc]autochessouter.ab prefab_auto_chess_stage_info_*; sprites from the local-client extraction
// ui/outer, with a CSS fallback): the 核心盟约 / 附加盟约 rows of bond items (bond_item: the mint img_bond_bkg disc with a
// dark glyph, or for a greyed bond the grey img_bond_banned_bkg with the img_bond_banned mark — tooltip briefingBondTip),
// the legend, and 本局禁用干员 grouped by bond (chess_banned_group: the greyed bond, a divider, its banned operators each
// under img_chess_banned_mask + the img_chess_banned corner). The client builds one group per banned bond from that
// bond's members in the banned list (AutoChessStageInfoGroupViewModel._LoadBondDataFromIdRange →
// AutoChessStageInfoChessGroupModel.LoadData), so an operator whose two bonds are both off is under both, and a drawn
// bond without banned members still has its (empty) group. The mode's static inactive bonds get a group only when they
// hold banned operators [ASSUMED: whether the client's bannedBondList includes them is not read; this keeps 标准's 10
// switched-off bonds from adding empty rows while every banned operator stays listed].
// MatchInfoDialog shows the same blocks read-only in a components.js Modal (关闭, a tap outside or Esc close it) with a
// status line from its caller (the draft's turn and countdown, so the running clock stays in view).
// Styles: css/screens/briefing.css (.brief-*), css/screens/draft.css (.minfo-dlg).

import { html, Button, Icon, MicroLabel, Tooltip, Modal, TierChip, natSizeVars } from './components.js';
import { Img } from './gameComponents.js';
import { bannedPerBond, disabledBondSets, briefingBondTip, diyBannedPieces } from './gameLogic.js';
import { bondIconUrl, chessAvatarUrl } from './assetUrls.js';
import { data, localAsset } from '../data.js';
import { t, dn } from '../../../shared/i18n.js';
import { customSummary, CustomRulesInfo } from './customSummary.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * @typedef {{ sets: { drawn: Set<string>, off: Set<string> }, stateOf: (bondId: string) => 'off'|'drawn'|null,
 *   bonds: any[], core: any[], addon: any[], banned: string[], perBond: Map<string, number>,
 *   bannedGroups: Array<{ bond: any, chess: string[] }>,
 *   diyBanned: Array<{ slotId: string, charId: string, name: string }>,
 *   custom: Array<{ key: string, tab: string, text: string }> | null }} MatchInfoModel
 */

/**
 * Everything the match-info blocks show.
 * @param {any} pub m.public (drawnDisabledBonds / disabledBonds, bannedChess)
 * @param {{ bonds?: any[], chess?: (id: string) => any, mode?: any, priv?: any, diyData?: any, bans?: any }} [src]
 *   bonds: bonds.json records (data.list('bonds')); chess: the chess lookup; mode: config.json modes[pub.modeId]; priv: the
 *   viewer's m.private (its 自选 pieces out of the shop, diyBanned) with diyData (`{ chess, backups }`: data.get('chess') /
 *   data.get('backups')) to name them; bans: the difficulty's official bond ban counts (config.json bans[pub.difficulty],
 *   by default from the loaded config) for the custom lines
 * @returns {MatchInfoModel}
 *   stateOf: 'off' = the mode never activates the bond (本局禁用), 'drawn' = in the drawn set D (阵容不完整), null = normal;
 *   banned: the banned chess ids the data knows, by tier (ties keep the server's order); perBond: bondId → banned members;
 *   bannedGroups: per greyed bond (core row, then add-on row) its banned members by tier — every drawn bond, and a
 *   mode-off bond only with members; custom: a 自定义 match's differences from the official rules (ui/customSummary.js),
 *   null for the other presets
 */
export function matchInfoModel(pub, { bonds = [], chess = () => null, mode = null, priv = null, diyData = null, bans = undefined } = {}) {
  const sets = disabledBondSets(pub, mode?.inactiveBondIds);
  const stateOf = (id) => (sets.off.has(id) ? 'off' : sets.drawn.has(id) ? 'drawn' : null);
  const list = (Array.isArray(bonds) ? bonds : []).filter((b) => !!b && typeof b === 'object' && typeof b.bondId === 'string')
    .sort((a, b) => (a.bondOrder ?? 0) - (b.bondOrder ?? 0) || (a.identifier ?? 0) - (b.identifier ?? 0));
  const tierOf = (id) => chess(id)?.tier ?? 0;
  const banned = (Array.isArray(pub?.bannedChess) ? pub.bannedChess : []).filter((id) => typeof id === 'string' && !!chess(id))
    .sort((a, b) => tierOf(a) - tierOf(b));
  const core = list.filter((b) => b.isCore);
  const addon = list.filter((b) => !b.isCore);
  const bannedGroups = [...core, ...addon].filter((b) => stateOf(b.bondId)).map((bond) => {
    const members = new Set(Array.isArray(bond.visibleMembers) ? bond.visibleMembers : []);
    return { bond, chess: banned.filter((id) => members.has(id)) };
  }).filter((g) => g.chess.length > 0 || sets.drawn.has(g.bond.bondId));
  return {
    sets, stateOf, bonds: list, core, addon,
    banned, perBond: bannedPerBond(list, banned), bannedGroups,
    diyBanned: priv && diyData ? diyBannedPieces(priv, chess, diyData) : [],
    custom: customLines(pub, list, mode, bans),
  };
}

/** The custom rules lines of a match (m.public.ruleset.custom), or null when it is not a 自定义 match. */
function customLines(pub, bonds, mode, bans) {
  const rs = pub?.ruleset;
  if (rs?.preset !== 'custom') return null;
  const bondNames = new Map(bonds.map((b) => [b.bondId, b.name]));
  const name = (kind, id) => (kind === 'bond' ? bondNames.get(id) : data.lookup(kind === 'boss' ? 'bosses' : 'stages', id)?.name) || id;
  return customSummary(rs.custom, {
    solo: String(pub.modeId || '').includes('single'),
    bans: bans !== undefined ? bans : data.get('config')?.bans?.[pub.difficulty] ?? null,
    rounds: Number.isInteger(mode?.lastRound) ? mode.lastRound : null,
    name,
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
const outerArt = (name) => localAsset('ui/outer', name);

/**
 * The section title bar of the stage-info view (perm_bond_title / temp_bond_title / chess_banned_title / enemy_title): the bar sprite,
 * its icon, the title (+ `extra` right after it, e.g. the banned count — the bar sprite's logos sit on the right) and the
 * micro label.
 * @param {{ kind: 'perm'|'temp'|'chess'|'enemy', title: string, micro: string, extra?: any }} props
 */
export function InfoTitle({ kind, title, micro, extra = null }) {
  const bar = outerArt(kind === 'perm' ? 'img_group_title_perm_bond' : 'img_group_title');
  const icon = outerArt({ perm: 'img_title_icon_perm_bond', temp: 'img_title_icon_temp_bond', enemy: 'img_title_icon_enemy' }[kind] || 'img_title_icon_chess');
  return html`<h3 class=${cx('brief-h', 'brief-h--art', `brief-h--${kind}`, icon && 'has-icon')} style=${bar ? `--bar:url("${bar}")` : null}>
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
 * One row of bonds (核心盟约 / 附加盟约): a greyed item (the banned mark) for a bond in the drawn set D or one the mode
 * never activates; the tooltip says which and how many of its operators cannot appear (briefingBondTip).
 * @param {{ title: string, micro: string, bonds: any[], model: MatchInfoModel, kind?: 'perm'|'temp' }} props
 */
export function MatchBondRow({ title, micro, bonds, model, kind = 'temp' }) {
  return html`<div class="brief-bonds">
    <${InfoTitle} kind=${kind} title=${title} micro=${micro} />
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
 * The legend under the bond rows ("或本模式禁用" only when the mode switches bonds off).
 * @param {{ model: MatchInfoModel }} props
 */
export function MatchLegend({ model }) {
  return html`<p class="brief-legend"><span class="brief-legend__off"></span>${t('灰色：部分盟约所含干员阵容不完整（仍可通过其他盟约的干员或装备激活）')}${model.sets.off.size ? t('，或本模式禁用') : ''}</p>`;
}

/**
 * An operator icon as the client draws it (auto_chess_outer_common_chess, the AutoChessCommonChessView that
 * prefab_auto_chess_stage_info_chess_banned_item loads): the 90-unit avatar on the white card img_chess_bkg (109 × 107
 * with its soft shadow, the card 96 × 95 from 2.5 above-left of the avatar), the tier sprite (35) on the avatar's
 * bottom-left corner (9.1 out to the left and below) and, when `banned`, img_chess_banned_mask (30 % grey, 94 × 95) over
 * avatar and card with img_chess_banned (73, at (33, 32) from the avatar's centre) whose red triangle lands on the card's
 * top-right corner. The chess record of `id`, or `src` / `name` / `tier` for a 自选 pick (the operator's own avatar).
 * Sized by `--ci`, the avatar (css/screens/briefing.css); without the local art, CSS stand-ins.
 * @param {{ id?: string|null, src?: string|null, name?: string, tier?: number|null, banned?: boolean, title?: string|null,
 *   class?: string }} props
 */
export function ChessIcon({ id = null, src = null, name = '', tier = null, banned = false, title = null, class: cls = null }) {
  const c = id ? data.lookup('chess', id) : null;
  const url = src || (c ? chessAvatarUrl(data.get('assets'), c) : null);
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
 * 本局禁用干员: the count, then one group per greyed bond (MatchInfoModel bannedGroups) — the bond, a divider and its
 * banned operators by tier, each darkened under the banned corner.
 * @param {{ model: MatchInfoModel }} props
 */
export function BannedOperators({ model }) {
  const { banned, bannedGroups = [] } = model;
  const split = outerArt('img_bond_banned_split');
  return html`<div class="brief-banned">
    <${InfoTitle} kind="chess" title=${t('本局禁用干员')} micro="BANNED OPERATORS" extra=${html`<b class="num brief-banned__n">${banned.length}</b>`} />
    ${banned.length ? html`<div class="brief-bgroups">
      ${bannedGroups.map(({ bond, chess }) => html`<div key=${bond.bondId} class="brief-bgroup" data-bond=${bond.bondId}>
        <div class="brief-bgroup__bond"><${InfoBond} bond=${bond} off=${true} small=${true} /></div>
        <i class="brief-bgroup__split" aria-hidden="true" style=${split ? `background-image:url("${split}")` : null}></i>
        <div class="brief-bgroup__chess">
          ${chess.map((id) => html`<span key=${id} class="brief-bchess" data-chess=${id}><${ChessIcon} id=${id} banned=${true} /></span>`)}
        </div>
      </div>`)}
    </div>` : html`<p class="t-dim">${t('本局没有禁用干员')}</p>`}
    <${DiyBannedLine} model=${model} />
  </div>`;
}

/**
 * The briefing's bonds and banned operators: 核心盟约, 附加盟约, the legend, 本局禁用干员.
 * @param {{ model: MatchInfoModel }} props
 */
export function MatchInfo({ model }) {
  return html`${model.custom ? html`<${CustomRulesInfo} lines=${model.custom} class="brief-custom" />` : null}
    <${MatchBondRow} title=${t('核心盟约')} micro="CORE BONDS" bonds=${model.core} model=${model} kind="perm" />
    <${MatchBondRow} title=${t('附加盟约')} micro="ADD-ON BONDS" bonds=${model.addon} model=${model} kind="temp" />
    <${MatchLegend} model=${model} />
    <${BannedOperators} model=${model} />`;
}

/**
 * The read-only match-info dialog (the strategy draft's 本局信息): MatchInfo in a Modal that 关闭, a tap outside or Esc
 * closes. `status` (the caller's line, e.g. the draft's turn and countdown) sits left of 关闭.
 * @param {{ open: boolean, onClose: Function, model: MatchInfoModel|null, status?: any }} props
 */
export function MatchInfoDialog({ open, onClose, model, status = null }) {
  return html`<${Modal} open=${open && !!model} onClose=${onClose} title=${t('本局信息')} micro="MATCH INFO // BONDS & BANNED OPERATORS" class="minfo-dlg"
    actions=${html`${status ? html`<div class="minfo-dlg__status" data-testid="match-info-status">${status}</div>` : null}
      <${Button} variant="secondary" icon="close" data-autofocus data-testid="match-info-close" onClick=${onClose}>${t('关闭')}<//>`}>
    ${open && model ? html`<${MatchInfo} model=${model} />` : null}
  <//>`;
}

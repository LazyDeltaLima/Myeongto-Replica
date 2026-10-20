// Custom rules summary — what a 自定义 match changes from the official rules, as short lines for the match screens (feat,
// maintainer decision 2026-10-18): the briefing's right column, the strategy draft's 本局信息 dialog (both through
// ui/matchInfo.js MatchInfo) and the in-game 本局信息 tab (ui/enemyDrawer.js). One line per setting group, in the settings
// dialog's tab order (ui/customRules.js), with the value it takes (not the official one: the lines stay short).
// The co-op-only settings (prep, 目标生命值) are left out of a solo match, where they do nothing (gamedata.js).
// customSummary is pure (unit-tested); CustomRulesInfo draws it. Styles: css/screens/custom-rules.css (.crs-*).

import { html, MicroLabel } from './components.js';
import { sanitizeCustom, CUSTOM_OFFICIAL, CUSTOM_FIRST_HALF_STAGES } from '../../../shared/ruleset.js';
import { t, N_ } from '../../../shared/i18n.js';

const STAT_LABELS = { hp: N_('生命值'), atk: N_('攻击力'), def: N_('防御力'), res: N_('法术抗性'), speed: N_('移动速度') };
const CURVE_LABELS = { official: N_('官方'), gentle: N_('平缓'), steep: N_('陡峭'), flat: N_('持平（固定第 1 回合）') };

const fmt = (n) => Number(n).toLocaleString('en-US');

/**
 * The lines of a custom ruleset's differences from the official rules.
 * @param {unknown} raw the custom settings (m.public.ruleset.custom)
 * @param {{ solo?: boolean, bans?: { core?: number, addon?: number } | null, rounds?: number | null,
 *   name?: (kind: 'bond'|'boss'|'stage', id: string) => string, hidden?: (bossId: string) => boolean }} [ctx]
 *   solo: a 独立模拟 match (no co-op-only lines); bans / rounds: the difficulty's official bond ban counts and round
 *   count (config.json bans[difficulty], modes[modeId].lastRound); name: a display name of a bond, leader or stage;
 *   hidden: whether a leader is a 隐秘核心 one (bosses.json `hidden` — the 假想敌 leaders are in both groups under one name)
 * @returns {Array<{ key: string, tab: string, text: string }>} `key` = the customDiffs path (or its group)
 */
export function customSummary(raw, { solo = false, bans = null, rounds = null, name = (_k, id) => id, hidden = () => false } = {}) {
  const c = sanitizeCustom(raw);
  const O = CUSTOM_OFFICIAL;
  /** @type {Array<{ key: string, tab: string, text: string }>} */
  const out = [];
  const add = (key, text) => out.push({ key, tab: key.split('.')[0], text });
  const names = (kind, ids) => ids.map((id) => name(kind, id)).join(t('、'));
  // the leaders' names hold a colon of their own (假想敌：胄): each in 「」, no colon after the label
  const quoted = (kind, ids) => ids.map((id) => `「${name(kind, id)}」`).join(' ');

  if (c.bonds.banCore !== null && c.bonds.banCore !== bans?.core) {
    add('bonds.banCore', t('核心盟约随机禁用 {n}', { n: c.bonds.banCore }));
  }
  if (c.bonds.banAddon !== null && c.bonds.banAddon !== bans?.addon) {
    add('bonds.banAddon', t('附加盟约随机禁用 {n}', { n: c.bonds.banAddon }));
  }
  if (c.bonds.noLayerCap) add('bonds.noLayerCap', t('解除盟约层数上限'));
  const picks = Object.entries(c.bonds.pick);
  const banned = picks.filter(([, v]) => v === 'ban').map(([id]) => id);
  const allowed = picks.filter(([, v]) => v === 'allow').map(([id]) => id);
  if (banned.length) add('bonds.pick.ban', t('始终禁用盟约：{names}', { names: names('bond', banned) }));
  if (allowed.length) add('bonds.pick.allow', t('始终允许盟约：{names}', { names: names('bond', allowed) }));

  for (const [sec, label] of [['enemies', N_('普通敌人')], ['leaders', N_('敌方领袖')]]) {
    const stats = Object.keys(STAT_LABELS).filter((k) => k in c[sec] && c[sec][k] !== O[sec][k]);
    if (stats.length) {
      add(`${sec}.stats`, t('{who}：{list}', { who: t(label), list: stats.map((k) => `${t(STAT_LABELS[k])} ${c[sec][k]}%`).join(' · ') }));
    }
  }
  if (c.enemies.curve !== O.enemies.curve) add('enemies.curve', t('敌人能力成长曲线：{name}', { name: t(CURVE_LABELS[c.enemies.curve]) }));

  const finals = c.bosses.ban.filter((id) => !hidden(id));
  const hiddens = c.bosses.ban.filter((id) => hidden(id));
  if (finals.length) add('bosses.ban.final', t('禁用最终攻势领袖 {names}', { names: quoted('boss', finals) }));
  if (hiddens.length) add('bosses.ban.hidden', t('禁用隐秘核心领袖 {names}', { names: quoted('boss', hiddens) }));
  if (c.bosses.hitMode === 'none') add('bosses.hit', t('领袖限伤：不限制'));
  else if (c.bosses.hitMode === 'clamp') add('bosses.hit', t('领袖限伤：{n}（按上限计算）', { n: fmt(c.bosses.hitLimit) }));
  else if (c.bosses.hitLimit !== O.bosses.hitLimit) add('bosses.hit', t('领袖限伤：{n}', { n: fmt(c.bosses.hitLimit) }));

  if (c.stages.info) add('stages.info', t('战场信息预览'));
  if (c.stages.reroll) add('stages.reroll', t('简报「重新抽取」'));
  if (c.stages.firstHalf) add('stages.firstHalf', t('收录上半战场：{names}', { names: names('stage', CUSTOM_FIRST_HALF_STAGES) }));
  if (c.stages.ban.length) add('stages.ban', t('禁用战场：{names}', { names: names('stage', c.stages.ban) }));

  if (c.flow.rounds !== null && c.flow.rounds !== rounds) add('flow.rounds', t('回合数 {n}', { n: c.flow.rounds }));
  if (!solo) {
    if (c.flow.prep === 'fixed') add('flow.prep', t('休整期每回合 {n} 秒', { n: c.flow.prepSec }));
    else if (c.flow.prep !== O.flow.prep) add('flow.prep', t('休整期 {x}', { x: c.flow.prep.replace('x', '×') }));
    if (c.flow.lpCapOff) add('flow.lpCapOff', t('解除每回合目标生命值减少上限'));
    if (c.flow.lpShared) add('flow.lpShared', t('所有回合共享目标生命值'));
  }
  if (c.pool.chess !== O.pool.chess) add('pool.chess', t('干员卡池 {n}%', { n: c.pool.chess }));
  if (c.pool.items !== O.pool.items) add('pool.items', t('装备库存 {n}%', { n: c.pool.items }));
  if (c.flow.routePreview) add('flow.routePreview', t('移动型领袖路线预览'));
  return out;
}

/**
 * The custom rules block: the 自定义规则 title and one chip per line (none: 与官方规则相同).
 * @param {{ lines: Array<{ key: string, tab: string, text: string }>, class?: string }} props
 */
export function CustomRulesInfo({ lines, class: cls = '' }) {
  return html`<div class=${`crs ${cls}`.trim()} data-testid="custom-rules-info">
    <h3 class="crs__h"><span class="rtag rtag--custom">${t('自定义')}</span><span>${t('自定义规则')}</span><${MicroLabel}>CUSTOM RULES</${MicroLabel}></h3>
    ${lines.length ? html`<ul class="crs__list">${lines.map((l) => html`<li key=${l.key} class=${`crs__i crs__i--${l.tab}`} data-key=${l.key}>${l.text}</li>`)}</ul>`
      : html`<p class="crs__none">${t('与官方规则相同')}</p>`}
  </div>`;
}

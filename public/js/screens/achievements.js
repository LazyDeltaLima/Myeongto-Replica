// 成就统计: the lobby hub's achievement window, after upstream 0.3.3 (screens/stats.js AchievementDialog there; upstream
// PR #643 laid it out after the event video 1:28–1:43, the 卫戍协议：盟约 achievement window). Its artwork and fonts are
// the official statistics template (the event's 战绩 webview: `ui/statistics/*`, tools/assets/stats-template.mjs); every
// picture falls back to text / plain CSS when it is not there. What it counts is this browser's records (ui/stats.js):
//   the doctor's line — the name, the trophies of the settled 联合模拟 matches and their medal (config.trophies.medals),
//     per mode the games / wins / hidden-core clears, and the six titles (评语) on the template's hexagon, full at 20;
//   卫戍成就 — the settled match whose own active alliance had the most layers: its lineup and its alliances
//     (ui/stats.js highestBondRecord), and the single-match records: the most funds spent, promotions and defeats;
//   盟约记录 — the three alliances active at the most settlements, and the first one's operators;
//   策略记录 — the three strategies played most, and the ones won with at least their victorCount (bands.json) times.
// [ASSUMED·자료 없음: the official window reads the account's records on the server; which match is the peak, what a
// record counts and the hexagon's scale (20) are upstream's reading of the video and the webview, not checked against
// the official game]
// Styles: css/screens/achievements.css (achv-*, st-*).

import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Spinner, Modal } from '../ui/components.js';
import { makeLookups, BandIcon, BondGlyph, Img } from '../ui/gameComponents.js';
import { data, useData } from '../data.js';
import { fmtNum, diyRecordFor, cardStandIn } from '../ui/gameLogic.js';
import { uiUrl, chessAvatarUrl, chessPortraitUrl, itemIconUrl } from '../ui/assetUrls.js';
import { skinArt, skinPic } from '../ui/skins.js';
import { TITLE_HEX_SECTORS, titleSectorClip } from '../ui/titleHexagon.js';
import { useStore, loadPref, savePref } from '../store.js';
import {
  peekStatsRecords, aggregateStats, recordsOfSeason, trophyMedalOf, strategyBadgeIds, bondMemberChess, highestBondRecord,
  recordsOfRuleset, achievementRuleset,
} from '../ui/stats.js';
import { RulesetSwitch } from '../ui/ruleset.js';
import { RULE_PRESETS } from '../../../shared/ruleset.js';
import { openStats } from './stats.js';
import { seasonName } from '../ui/season.js';
import { seasonArt } from '../ui/seasonArt.js';
import { seasonInfo, DEFAULT_SEASON } from '../../../shared/seasons.js';
import { t, N_ } from '../../../shared/i18n.js';
import { scriptOf } from '../../../shared/i18nPacks.js';

/** @param {...any} p class names, arrays of them and falsy values (left out) */
const cx = (...p) => p.flat().filter(Boolean).join(' ');

/**
 * The doctor's line (name, trophies), the solo / co-op rows and the six titles: 总览 and the lobby's 成就统计.
 * @param {{ agg: any, gd: any, nickname: string }} props
 */
function ProfileBlock({ agg, gd, nickname }) {
  const titles = (Array.isArray(gd.config?.titles) ? gd.config.titles : []).map((/** @type {any} */ x) => ({ ...x, count: agg.titles[x.id]?.count || 0 }));
  // records whose room mode is unknown (`roomMode` null) count in the total but in neither mode row
  const unknownMode = Math.max(0, agg.count - agg.modes.solo.games - agg.modes.coop.games);
  return html`<div class="st-overview-details">
      <div class="st-mode-summary">
        <div class="st-profile">
          <b class="st-profile__name">Dr. ${nickname || t('未知')}</b>
          <div class="st-profile__trophies" title=${t('累计本机保留战绩中获得的奖杯')}>
            <${Img} src=${uiUrl(gd.m, `medalIcon/${trophyMedalOf(agg.trophies, gd.config?.trophies?.medals)?.iconId || ''}`)}
              class="st-profile__medal" fallback=${html`<${Icon} name="crown" />`} />
            <div><span>${t('获得奖杯')}</span><b class="num">${fmtNum(agg.trophies)}</b></div>
          </div>
        </div>
      <table class="st-modegrid"><tbody>
        ${[['solo', N_('独立模拟')], ['coop', N_('同盟模拟')]].map(([mode, label]) => {
          const v = agg.modes[mode];
          const metrics = [
            { value: v.games, label: N_('总模拟数') },
            { value: v.wins, label: N_('成功卫戍') },
            { value: v.hiddenCleared, label: N_('绝境突破') },
          ];
          return html`<tr key=${mode} class="st-modegrid__row">
            <th scope="row" class="st-modegrid__mode">
              <${Icon} name=${mode === 'solo' ? 'user' : 'users'} />
              <span class="st-modegrid__name">${t(label)}</span>
            </th>
            ${metrics.map(({ value, label }) => html`<td key=${label} class="st-modegrid__cell">
              <b class="st-modegrid__value num">${fmtNum(value)}</b>
              <span class="st-modegrid__label">${t(label)}</span>
            </td>`)}
          </tr>`;
        })}
      </tbody></table>
      ${unknownMode > 0 ? html`<p class="st-mode-unknown">${t('另有 {n} 局战绩没有记录模式，只计入总局数', { n: fmtNum(unknownMode) })}</p>` : null}
      </div>
      ${titles.length ? html`<div class="st-title-panel">
        <${TitleHexagon} titles=${titles} manifest=${gd.m} /></div>` : null}
    </div>`;
}

/** @param {{ title: any, manifest: any, class?: string }} props */
function RecordHeading({ title, manifest, class: cls }) {
  return html`<h3 class=${cx('st-record-heading', cls)} style=${`background-image:url(${uiUrl(manifest, 'statistics/headingBar')})`}>
    <span class="st-record-heading__icon" aria-hidden="true">
      <${Img} src=${uiUrl(manifest, 'statistics/headingIconFrame')} class="st-record-heading__frame" />
      <${Img} src=${uiUrl(manifest, 'statistics/headingIcon')} class="st-record-heading__glyph" />
    </span><span>${title}</span>
  </h3>`;
}

/** @param {{ unit: any, gd: any }} props */
function AchievementOperator({ unit, gd }) {
  const base = gd.chess(unit.id);
  const backups = data.get('backups');
  const chess = unit.diy && base ? diyRecordFor(base, unit.diy, { chess: data.get('chess'), backups })
    : base ? cardStandIn(base, { unit, backups }) || base : null;
  // in this browser's chosen skin (the record keeps no worn skin; docs/rules/ui.md 「스킨 고르기」)
  const portrait = chess ? skinPic(chess, 'portrait', skinArt(), { own: true }) || chessPortraitUrl(gd.m, { ...chess, assets: { ...chess.assets,
    portrait: `${chess.charId}_${chess.status?.phase === 2 ? 2 : 1}` } }) : null;
  return html`<li class="st-achievement-unit" title=${chess?.name || unit.id}>
    <${Img} src=${portrait} class="st-achievement-unit__portrait" fallback=${html`<span>${chess?.name || unit.id}</span>`} />
    <${Img} src=${uiUrl(gd.m, `statistics/achievementTier${unit.tier || chess?.tier}`)} class="st-achievement-unit__tier" />
    ${chess?.status ? html`<div class="st-achievement-unit__level">
      <${Img} src=${uiUrl(gd.m, `statistics/achievementElite${chess.status.phase}`)} />
      <span>${fmtNum(chess.status.level)}</span>
    </div>` : null}
    <div class="st-achievement-unit__items">${Array.from({ length: 2 }, (_, i) => html`<div key=${i} class="st-achievement-unit__slot"
      style=${`background-image:url(${uiUrl(gd.m, 'statistics/achievementItemSlot')})`}>
      ${unit.items?.[i] ? html`<${Img} src=${itemIconUrl(gd.m, gd.item(unit.items[i]))} class="st-achievement-unit__item" />` : html`<i aria-hidden="true"></i>`}
    </div>`)}</div>
  </li>`;
}

/**
 * 卫戍成就's peak (ui/stats.js highestBondRecord): the alliance of the most layers, that match's lineup (ten slots: the
 * portrait, tier, elite level and gear of each operator) and its active alliances.
 * @param {{ peak: ReturnType<typeof highestBondRecord>, gd: any }} props
 */
export function BondAchievement({ peak, gd }) {
  if (!peak) return html`<p class="st-hint">${t('暂无可用的盟约最高叠加战绩')}</p>`;
  const bonds = (peak.player.bonds || []).filter((/** @type {any} */ b) => b.active).sort((/** @type {any} */ a, /** @type {any} */ b) => b.layers - a.layers);
  const lineup = peak.player.lineup;
  return html`<div class="st-achievement">
    <div class="st-achievement__peak">
      <span class="st-achievement__caption">${t('战果纪录')}</span>
      <div class="st-achievement__bond" style=${`background-image:url(${uiUrl(gd.m, 'statistics/achievementBondFrame')})`}><${BondGlyph} bondId=${peak.bond.bondId} /></div>
      <span>${t('盟约最高叠加')}</span><b class="num">${fmtNum(peak.bond.layers)}</b>
    </div>
    <div class="st-achievement__detail" style=${`background-image:url(${uiUrl(gd.m, 'statistics/achievementBg')})`}>
      <ul class="st-achievement__lineup">${Array.from({ length: 10 }, (_, i) => lineup?.[i]
        ? html`<${AchievementOperator} key=${i} unit=${lineup[i]} gd=${gd} />`
        : html`<li key=${i} class="st-achievement-unit is-empty" aria-hidden="true"><i></i><span>${t('NO INFO')}</span>
          <div class="st-achievement-unit__items"><div class="st-achievement-unit__slot"><i></i></div><div class="st-achievement-unit__slot"><i></i></div></div>
        </li>`)}</ul>
      <ul class="st-achievement__bonds">${bonds.map((/** @type {any} */ bond) => html`<li key=${bond.bondId} title=${gd.bond(bond.bondId)?.name || bond.bondId}
        style=${`background-image:url(${uiUrl(gd.m, 'statistics/achievementBondTile')})`}>
        <${BondGlyph} bondId=${bond.bondId} />${gd.bond(bond.bondId)?.noStack ? null : html`<b class="num">${fmtNum(bond.layers)}</b>`}
      </li>`)}</ul>
    </div>
  </div>`;
}

/** The official statistics view fills and highlights counts at 20 awards. @param {{ titles: any[], manifest: any }} props */
function TitleHexagon({ titles, manifest }) {
  const byId = new Map(titles.map((x) => [x.id, x]));
  const mask = uiUrl(manifest, 'statistics/titleMask');
  const glow = uiUrl(manifest, 'statistics/countGlow');
  const [loadedArt, setLoadedArt] = useState(/** @type {string[]} */ ([]));
  useEffect(() => {
    let active = true;
    const images = /** @type {string[]} */ ([mask, glow].filter(Boolean)).map((url) => {
      const image = new Image();
      image.onload = () => { if (active) setLoadedArt((loaded) => loaded.includes(url) ? loaded : [...loaded, url]); };
      image.src = url;
      return image;
    });
    return () => { active = false; for (const image of images) image.onload = null; };
  }, [mask, glow]);
  return html`<div class=${cx('st-titlehex', mask && loadedArt.includes(mask) && 'has-reference-mask')} role="group" aria-label=${t('称号')}
    style=${{ '--st-title-mask': mask ? `url("${mask}")` : undefined, '--st-title-glow': glow && loadedArt.includes(glow) ? `url("${glow}")` : undefined }}>
    <div class="st-titlehex__graphic" aria-hidden="true">
      ${TITLE_HEX_SECTORS.map(([id, angle]) => {
        const clip = titleSectorClip(byId.get(id)?.count || 0);
        return html`<div key=${id} class="st-titlehex__wedge"
          style=${{ '--sector-angle': `${angle}deg`, '--texture-angle': `${-angle}deg` }}>
          <div class="st-titlehex__base"></div>
          ${clip ? html`<div class="st-titlehex__active"><div class="st-titlehex__sector" style=${{ clipPath: clip }}>
            <div class="st-titlehex__texture"></div>
          </div></div>` : null}
        </div>`;
      })}
      <${Img} src=${uiUrl(manifest, 'statistics/decoration')} class="st-titlehex__decoration" />
    </div>
    <ul class="st-titlehex__labels">
      ${TITLE_HEX_SECTORS.map(([id], i) => {
        const x = byId.get(id);
        return x ? html`<li key=${id} class=${cx('st-titlehex__label', `st-titlehex__label--${i}`)} title=${x.text || ''}>
          <b class=${cx('st-titlehex__count num', x.count >= 20 && 'is-bright')}>${fmtNum(x.count)}</b><span class="st-titlehex__name">${x.name}</span>
        </li>` : null;
      })}
    </ul>
  </div>`;
}

/**
 * Single-match records, always in the requested funds / promotions / defeats order.
 * @param {{ maxima: Record<string, number | null>, manifest: any }} props
 */
function MatchRecords({ maxima, manifest }) {
  const rows = [
    ['gold', N_('单局最多消耗资金'), 'recordFunds'],
    ['merges', N_('单局最多晋升次数'), 'recordPromotions'],
    ['kills', N_('单局最多击败数'), 'recordDefeats'],
  ];
  return html`<div class="st-records" data-testid="stats-match-records">
    ${rows.map(([key, label, art]) => html`<div key=${key} class=${`st-record st-record--${key}`}>
      <${Img} src=${uiUrl(manifest, `statistics/${art}`)} class="st-record__icon" />
      <${Img} src=${uiUrl(manifest, 'statistics/recordLabel')} class="st-record__decoration" />
      <span class="st-record__label">${t(label)}</span>
      <div class="st-record__value num"><span aria-hidden="true">x</span><b>${maxima[key] == null ? '—' : fmtNum(maxima[key])}</b></div>
    </div>`)}
  </div>`;
}

/** 盟约记录: the three most used alliances and the first one's operators (盟约&策略 and the lobby's 成就统计). @param {{ agg: any, gd: any }} props */
function BondRecords({ agg, gd }) {
  useData('chess');
  const bonds = Object.entries(agg.bonds).sort((a, b) => (b[1].games - a[1].games) || a[0].localeCompare(b[0]));
  const members = bondMemberChess(gd.list('chess'), bonds[0]?.[0]);
  const sk = skinArt(); // the members in this browser's chosen skin (docs/rules/ui.md 「스킨 고르기」)
  return html`<${RecordHeading} title=${t('盟约记录')} manifest=${gd.m} />
    <h4 class="st-sub st-favorites__heading">${t('最常使用的盟约')}</h4>
    ${bonds.length ? html`<div class="st-top-bonds">
      ${bonds.slice(0, 3).map(([bondId], index) => {
        const name = gd.bond(bondId)?.name || bondId;
        return html`<div key=${bondId} class="st-top-bond">
          <div class="st-top-bond__art">
            <${Img} src=${uiUrl(gd.m, 'statistics/bondTopFrame')} class="st-bond-frame" />
            <${BondGlyph} bondId=${bondId} />
            <span class="st-top-bond__rank">${t('TOP{n}', { n: index + 1 })}</span>
          </div>
          <div class="st-top-bond__text">
            <span class="st-top-bond__name" title=${name}>${name}</span>
          </div>
        </div>`;
      })}
    </div>` : html`<p class="st-hint">${t('暂无盟约使用记录')}</p>`}
    ${bonds.length ? html`<h4 class="st-sub st-bond-members__heading">${t('盟约下干员为：')}</h4>
      <ul class="st-bond-members">
        ${members.map((chess) => html`<li key=${`${chess.charId}#${chess.tier}`} class="st-bond-member" title=${chess.name}
          style=${`background-image:url(${uiUrl(gd.m, 'statistics/memberFrame')})`}>
          <${Img} src=${skinPic(chess, 'avatar', sk, { own: true }) || chessAvatarUrl(gd.m, chess)} class="st-bond-member__avatar" fallback=${html`<span>${chess.name}</span>`} />
          <${Img} src=${uiUrl(gd.m, `statistics/memberTier${chess.tier}`)} class="st-bond-member__tier" />
        </li>`)}
      </ul>` : null}`;
}

/**
 * 策略记录: the three most used strategies and the ones with the special mark (`records`: ui/stats.js achievementRecords).
 * @param {{ agg: any, gd: any, records: any[] }} props
 */
function StrategyRecords({ agg, gd, records }) {
  const badges = strategyBadgeIds(records, data.get('bands'));
  const rows = Object.entries(agg.bands).sort((a, b) => (b[1].games - a[1].games) || (b[1].wins - a[1].wins));
  return html`<${RecordHeading} title=${t('策略记录')} manifest=${gd.m} class="st-record-heading--strategy" />
    ${rows.length ? html`<h4 class="st-sub st-strategies__heading">${t('最常使用的策略')}</h4>
      <div class="st-top-strategies">
        ${rows.slice(0, 3).map(([bandId, v], index) => {
          const name = gd.band(bandId)?.name || bandId;
          return html`<div key=${bandId} class="st-top-strategy">
            <div class="st-top-strategy__art">
              <${Img} src=${uiUrl(gd.m, 'statistics/strategyTopFrame')} class="st-strategy-frame" />
              <${BandIcon} bandId=${bandId} />
              <span class="st-top-strategy__rank">${t('TOP{n}', { n: index + 1 })}</span>
            </div>
            <div class="st-top-strategy__text">
              <span class="st-top-strategy__name" title=${name}>${name}</span>
              <div class="st-top-strategy__count num" title=${t('使用局数')}><span aria-hidden="true">x</span><b>${fmtNum(v.games)}</b></div>
            </div>
          </div>`;
        })}
      </div>` : null}
    ${badges.length ? html`<h4 class="st-sub st-strategies__heading">${t('已获得特殊标识的策略')}</h4>` : null}
    ${badges.length ? html`<ul class="st-strategy-badges">
      ${badges.map((bandId) => {
        const name = gd.band(bandId)?.name || bandId;
        return html`<li key=${bandId} class="st-strategy-badge">
          <div class="st-strategy-badge__art">
            <${Img} src=${uiUrl(gd.m, 'statistics/strategyBadgeFrame')} class="st-strategy-frame" />
            <${BandIcon} bandId=${bandId} />
            <${Img} src=${uiUrl(gd.m, 'statistics/strategyBadge')} class="st-strategy-badge__mark" />
          </div>
          <span class="st-strategy-badge__name" title=${name}>${name}</span>
        </li>`;
      })}
    </ul>` : html`<p class="st-hint">${t('暂无获得特殊标识的策略')}</p>`}`;
}

/** The pref of 成就统计's last 规则 模式 pick: { ruleset, at } (ui/stats.js achievementRuleset). */
export const ACHV_RULESET_PREF = 'achv.ruleset';

/**
 * The 成就统计 window: one scrolling window under the event banner — the doctor's line and titles, 卫戍成就 (the peak
 * alliance's match and the single-match records), 盟约记录 and 策略记录, of the season on screen and of one 规则 模式
 * (maintainer decision 2026-11-08: the modes apart, as 统计数据 counts them; the switch with each mode's match count sits
 * over the top left of the window's first block, taking no row of its own; it opens on achievementRuleset). It only reads this
 * browser's records (`peekStatsRecords`: a damaged or newer store is left for 统计数据 to handle); 查看完整统计 opens
 * 统计数据. The lineup's portraits, 自选 units and gear need chess / backups / items: loaded here, since nothing on the
 * lobby path loads them.
 * @param {{ onClose: () => void }} props
 */
export function AchievementDialog({ onClose }) {
  const ready = useData('config', 'bands', 'bonds', 'assets', 'chess', 'items', 'backups', 'local');
  const season = data.season();
  const gd = useMemo(() => makeLookups(ready), [ready, data.locale(), season]);
  // the season on screen (data.js setSeason): each season has its own records, levels and achievements
  const seasonRecords = useMemo(() => recordsOfSeason(peekStatsRecords(), season), [season]);
  const [ruleset, setRuleset] = useState(() => achievementRuleset(seasonRecords, loadPref(ACHV_RULESET_PREF, null)));
  /** @param {string} p */
  const pickRuleset = (p) => { setRuleset(p); savePref(ACHV_RULESET_PREF, { ruleset: p, at: Date.now() }); };
  const counts = useMemo(() => Object.fromEntries(RULE_PRESETS.map((p) => [p, recordsOfRuleset(seasonRecords, p).length])), [seasonRecords]);
  const records = useMemo(() => recordsOfRuleset(seasonRecords, ruleset), [seasonRecords, ruleset]);
  const agg = useMemo(() => aggregateStats(records), [records]);
  // a title in an alphabetic script (English …): ": " between its halves, as on the hub and the title screen
  const colon = scriptOf(t('卫戍协议')) === 'alphabetic' ? ': ' : '：';
  const nickname = useStore((s) => s.me.name);
  const fonts = ready ? uiUrl(gd.m, 'statistics/fontStyles') : null;
  const more = () => { onClose(); openStats(); };
  return html`<${Modal} open=${true} onClose=${onClose} class="achv" veilClass="achv-veil">
    <header class="achv__banner">
      <${Img} src=${ready ? uiUrl(gd.m, 'settle/common_logo') : null} class="achv__logo" fallback=${html`<span class="achv__logo-text">STRONGHOLD PROTOCOL</span>`} />
      <div class="achv__title">
        <span class="achv__mark" aria-hidden="true"><${Img} src=${!ready ? null : season === DEFAULT_SEASON ? uiUrl(gd.m, 'entry/season_logo') : seasonArt(season, 'logo', 'season_logo')} /></span>
        <span class="achv__en" aria-hidden="true">${seasonInfo(season).mark}</span>
        <h2 class="modal__title achv__name">${t('卫戍协议')}<span>${colon}</span>${seasonName(season)}</h2>
      </div>
      <button type="button" class="achv__close" onClick=${onClose} aria-label=${t('关闭')} title=${t('关闭')}><${Icon} name="close" /></button>
    </header>
    <div class="achv__scroll st-body" data-testid="achievement-dialog">
      ${fonts ? html`<link rel="stylesheet" href=${fonts} />` : null}
      ${!ready ? html`<div class="st-loading"><${Spinner} size="md" /></div>` : html`
        <${ProfileBlock} agg=${agg} gd=${gd} nickname=${nickname} />
        <${RecordHeading} title=${t('卫戍成就')} manifest=${gd.m} class="st-record-heading--achievement" />
        <${BondAchievement} peak=${highestBondRecord(records)} gd=${gd} />
        <${MatchRecords} maxima=${agg.maxima} manifest=${gd.m} />
        <${BondRecords} agg=${agg} gd=${gd} />
        <${StrategyRecords} agg=${agg} gd=${gd} records=${records} />
        <div class="achv__rules" data-testid="achievement-ruleset"><${RulesetSwitch} value=${ruleset} onPick=${pickRuleset} counts=${counts} class="rtrack" /></div>`}
    </div>
    <footer class="achv__foot">
      <span><${Icon} name="info" />${t('本机记录：只保存在这个浏览器里')}</span>
      <button type="button" class="achv__more" onClick=${more}>${t('查看完整统计')}<${Icon} name="chevronRight" /></button>
    </footer>
  <//>`;
}


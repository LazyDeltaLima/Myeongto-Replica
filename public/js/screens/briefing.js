// Briefing — INFO_CHECK "1/3 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities — the client's stage-info enemy block, maintainer request 2026-10-11), stage (+ its pool: 战场固定 /
// 战场随机（共N张）, and under its name the battlefield's preview picture — maintainer request 2026-10-11,
// tools/map-previews.mjs; the card then sits beside the factions, both as tall as the taller one), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. Next to it 重新抽取
// (g.infoReroll, feat — maintainer decision 2026-10-09; the official briefing has no such button): alone it redraws at
// once; in co-op it is a vote of its own, apart from ready (maintainer decision 2026-10-13): a unanimous vote redraws
// (a new match), every seat ready starts the strategy draft (server phases.js maybeEndInfo). In co-op a reroll vote can
// be taken back (取消重新抽取), also by a seat already ready, and the first seat still voting it is named just above the
// footer, over the screen rather than in its flow (「…提议重新抽取」, m.public.rerollBy), with the vote count (maintainer
// decisions 2026-10-12; the co-op countdown runs 45 s, m.public.infoSeconds). The right column — 核心盟约
// / 附加盟约 rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员
// avatars, with the player's own 自选 pieces out of the shop (m.private.diyBanned) — is ui/matchInfo.js MatchInfo, the same
// blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js).
// 규칙 모드 (m.public.ruleset, shared/ruleset.js; maintainer decision 2026-10-15): the battlefield card's name, pool and
// preview are a 休闲 convenience (battlefieldInfo) — 盟约's official stage-info view has no battlefield, so 经典 keeps the
// card in its place as 「未知战场」 (a dark box with the boss block's 「?」, revealed when the battle starts) and the column
// keeps its shape; 规程's official view shows the map preview, so that season shows the card in every mode
// (seasonOfficialOptions, maintainer decision 2026-11-13); 重新抽取 (infoReroll) is 休闲 only.
// 规程 solo (m.public bondGroups: the core bonds split in two, one picked here — server phases.js pickBondGroup) is the
// official two-column view instead (GroupsMain; prefab_auto_chess_stage_info_view, maintainer decision 2026-11-18 on the
// mockup): left, scrolling, 核心盟约 with the hint and the two groups (a press on a panel picks it, g.bondGroup, until
// ready; a press on a bond icon opens its detail), 附加盟约 with the 「部分盟约所含干员阵容不完整」 tip, 本局禁用干员; right, the
// map preview (its zoom), 敌方领袖 and the 特训敌人 rows — a press on those opens our description under them (the leader's
// round and abilities, the type's text). No battlefield name or pool line there (the official view has none). Sized in
// prefab units: the view is drawn at 0.9 of the 720 canvas, one unit = the screen height / 800 (css .brief2).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, Modal } from '../ui/components.js';
import { useGameData, Img, RichText } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfo, matchInfoModel, BondGroups, IncompleteTip, BannedOperators, InfoBond, stageArt } from '../ui/matchInfo.js';
import { MatchIntel } from '../ui/matchIntel.js';
import { LoadoutButton } from './loadout.js';
import { useFitLine } from '../ui/fitLine.js';
import { actions } from '../ui/gameActions.js';
import { factionTypes, sortedPlayers, phaseTotalSeconds, startStepCount } from '../ui/gameLogic.js';
import { enemyIconUrl, factionIconUrl } from '../ui/assetUrls.js';
import { useStore } from '../store.js';
import { data, localAsset } from '../data.js';
import { t, tParts } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';
import { resolveRuleset, seasonOfficialOptions } from '../../../shared/ruleset.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  const gd = useGameData();
  const matchNo = useStore((s) => s.room?.matchNo ?? 0);
  const season = useStore((s) => s.room?.season ?? null);
  const [exit, setExit] = useState(false);
  const [busy, setBusy] = useState(null);
  // the server refuses 重新抽取 in the briefing's first second (phases.js INFO_REROLL_MIN_MS): the button waits as long
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const h = setTimeout(() => setArmed(true), 1100);
    return () => clearTimeout(h);
  }, [matchNo]);
  if (!pub) return null;

  const players = sortedPlayers(pub);
  const me = players.find((p) => p.playerId === myId);
  const readyN = players.filter((p) => p.ready).length;
  const rerollN = players.filter((p) => p.reroll).length;
  // a single human decides alone (solo, or a 同盟 room with AI teammates only)
  const alone = players.filter((p) => !p.isBot).length <= 1;
  const closing = !!pub.infoOutcome;
  // the 「…提议重新抽取」 banner (co-op): the first seat still voting reroll and the count
  const proposer = !alone && pub.rerollBy ? players.find((p) => p.playerId === pub.rerollBy) : null;
  // the seats a reroll needs (server maybeEndInfo: humans still in, not under AI 托管)
  const voters = players.filter((p) => !p.isBot && p.status !== 'left' && !p.autoplay);
  const mode = gd.config?.modes?.[pub.modeId];
  // (+ the own 自选 pieces this match leaves out of the shop: m.private.diyBanned)
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } });
  const rules = { ...resolveRuleset(pub.ruleset).options, ...seasonOfficialOptions(season) };

  const vote = (kind) => async () => {
    if (busy || closing) return;
    // a reroll vote can be taken back in co-op (the button turns into 取消重新抽取); 准备就绪 is final
    if (kind === 'reroll' && me?.reroll && !alone) {
      setBusy('reroll');
      await actions.infoRerollCancel();
      setBusy(null);
      return;
    }
    if (kind === 'ready' ? me?.ready : me?.reroll) return;
    setBusy(kind);
    await (kind === 'reroll' ? actions.infoReroll() : actions.infoReady());
    setBusy(null);
  };
  const rerollTip = alone ? t('重新抽取首领、战场、特训敌人与禁用盟约')
    : me?.reroll ? t('撤回重新抽取的投票')
    : t('投票重新抽取首领、战场、特训敌人与禁用盟约：全员同意时重新抽取');

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${1} of=${startStepCount(gd.config)} title=${t('确认本局信息')} pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} config=${gd.config} onExit=${() => setExit(true)} />
    ${info.groups ? html`<${GroupsMain} pub=${pub} info=${info} me=${me} closing=${closing} mode=${mode} gd=${gd} />` : html`<main class="brief__main">
      <section class="brief__left">
        <${MatchIntel} pub=${pub} season=${season} />
      </section>
      <section class="brief__right">
        <${MatchInfo} model=${info} />
      </section>
    </main>`}
    <footer class="brief__foot">
      ${proposer ? html`<div class="brief-rr" role="status" data-testid="reroll-proposer">
        <${Icon} name="refresh" />
        <div class="brief-rr__text">
          <b>${proposer.playerId === myId ? t('你提议重新抽取') : t('{name} 提议重新抽取', { name: playerName(proposer.name) || t('博士') })}</b>
          <span>${t('重新抽取 {rr}/{n}：全员同意时重新抽取', { rr: rerollN, n: voters.length })}</span>
        </div>
      </div>` : null}
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">${t('已就绪')} <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        ${!alone && rerollN ? html`<span class="brief-ready__txt brief-ready__txt--rr" data-testid="reroll-count">${t('重新抽取')} <b class="num">${rerollN}</b><span class="num">/${voters.length}</span></span>` : null}
        <span class="brief-ready__pips">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.reroll && 'rr', p.playerId === myId && 'me')} title=${playerName(p.name)}><${Icon} name=${p.reroll ? 'refresh' : 'user'} /></i>`)}</span>
      </div>
      ${me && rules.infoReroll ? html`<${Button} variant="secondary" size="xl" icon="refresh" class="brief-reroll" data-testid="info-reroll" title=${rerollTip}
        active=${!!me.reroll} loading=${busy === 'reroll' || pub.infoOutcome === 'reroll'} disabled=${(me.reroll && alone) || closing || !armed}
        onClick=${vote('reroll')}>${me.reroll && !alone ? t('取消重新抽取') : t('重新抽取')}<//>` : null}
      <${Button} variant="primary" size="xl" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy === 'ready'}
        disabled=${!!me?.ready || closing || !me} onClick=${vote('ready')}>${me?.ready ? t('已就绪') : me ? t('准备就绪') : t('观战中')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}

/**
 * perm_bond_title / temp_bond_title of the two-column view: the sliced bar (css --a-title), img_content_bkg under it, the
 * 40 icon (核心盟约 the starburst, 附加盟约 the wing — as the official screens), the 24 title and the tip after it.
 * @param {{ kind: 'core'|'addon', title: string, tip?: any }} props
 */
function GroupsTitle({ kind, title, tip = null }) {
  const icon = stageArt(kind === 'core' ? 'img_title_icon_temp_bond' : 'img_title_icon_perm_bond');
  return html`<div class=${`brief2-title brief2-title--${kind}`}>
    <i class="brief2-title__bar" aria-hidden="true"></i><i class="brief2-title__under" aria-hidden="true"></i>
    ${icon ? html`<img class="brief2-title__icon" src=${icon} alt="" draggable=${false} />` : null}
    <h3 class="brief2-title__row"><span class="brief2-title__text">${title}</span>${tip}</h3>
  </div>`;
}

/**
 * 规程 solo's briefing in the official two columns (see the header): the left column's bonds and banned operators, the
 * right column's map, leader and 特训敌人. A bond icon opens no detail (maintainer decision 2026-11-18): a press on a
 * group's panel, icons included, picks it.
 * @param {{ pub: any, info: any, me: any, closing: boolean, mode: any, gd: any }} props
 */
function GroupsMain({ pub, info, me, closing, mode, gd }) {
  const [side, setSide] = useState(null); // 'boss' | the 特训敌人 type whose description is open
  const [zoom, setZoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const hint = useRef(null);
  const hintText = t('请选择一组在本次模拟中激活的盟约，未被选择的盟约将不会出现在本次模拟中');
  useFitLine(hint, hintText);
  const canPick = !!me && !me.ready && !closing;
  const pick = async (i) => {
    if (!canPick || busy || info.groups.picked === i) return;
    setBusy(true);
    await actions.bondGroup(i);
    setBusy(false);
  };
  const boss = pub.bossId ? gd.boss(pub.bossId) : null;
  const bossEnemy = boss ? gd.enemy(boss.enemyKey) : null;
  const types = factionTypes(pub.factions);
  const factions = gd.factions?.types || {};
  const mapUrl = pub.stageId ? localAsset('stage/preview', pub.stageId) : null;
  const vars = [['--a-right', 'img_right_bg'], ['--a-rdeco', 'img_stage_info_right_ecoration'], ['--a-map', 'bg_map'], ['--a-zoom', 'img_check'],
    ['--a-frame', 'img_enemy_frame'], ['--a-tag', 'bg_enemy_title'], ['--a-type', 'bg_enemy_type'], ['--a-title', 'img_group_title'], ['--a-row', 'img_content_bkg']]
    .map(([k, n]) => [k, stageArt(n)]).filter(([, u]) => u).map(([k, u]) => `${k}:url("${u}")`).join(';');
  const toggle = (k) => setSide((v) => (v === k ? null : k));
  return html`<main class="brief__main brief2" style=${vars || null} data-testid="brief-groups">
    <section class="brief2__left">
      <${GroupsTitle} kind="core" title=${t('核心盟约')} />
      <${BondGroups} model=${info} onPick=${canPick ? pick : null}
        hint=${html`<span ref=${hint} class="brief2__hint">${hintText}</span>`} />
      <${GroupsTitle} kind="addon" title=${t('附加盟约')} tip=${info.addonIncomplete ? html`<${IncompleteTip} />` : null} />
      <div class="brief2__addon">${info.addon.map((b) => html`<div key=${b.bondId} class="brief2__cell" data-bond=${b.bondId}>
        <span class="bgrp__bond" title=${b.name}><${InfoBond} bond=${b} off=${!!info.stateOf(b.bondId)} /></span>
      </div>`)}</div>
      <${BannedOperators} model=${info} />
    </section>
    <section class="brief2__right">
      <div class="brief2-map">
        ${mapUrl ? html`<${Img} src=${mapUrl} class="brief2-map__img" alt="" />` : html`<span class="brief2-map__img is-empty" aria-hidden="true"></span>`}
        <i class="brief2-map__frame" aria-hidden="true"></i>
        ${mapUrl ? html`<button type="button" class="brief2-map__zoom" aria-label=${t('战场')} data-testid="brief-map-zoom" onClick=${() => setZoom(true)}></button>` : null}
      </div>
      <button type="button" class=${'brief2-leader' + (side === 'boss' ? ' is-open' : '')} aria-expanded=${side === 'boss' ? 'true' : 'false'}
          data-testid="brief-leader" onClick=${() => toggle('boss')}>
        <i class="brief2-leader__frame" aria-hidden="true"></i>
        ${bossEnemy ? html`<${Img} src=${enemyIconUrl(gd.m, boss.enemyKey)} class="brief2-leader__icon" fallback=${html`<span class="brief2-leader__q">?</span>`} />`
          : html`<span class="brief2-leader__q">?</span>`}
        <span class="brief2-leader__tag">${t('敌方领袖')}</span>
        <span class="brief2-leader__name">${boss?.name || bossEnemy?.name || t('未知领袖')}</span>
      </button>
      ${side === 'boss' ? html`<div class="brief2-desc" data-testid="brief-leader-desc">
        <span class="brief2-desc__round">${tParts('第 {r} 回合 · 最终攻势', { r: html`<b class="num">${pub.bossRound ?? mode?.bossRound ?? pub.lastRound ?? 14}</b>` })}</span>
        ${Array.isArray(boss?.abilities) && boss.abilities.length ? html`<ul>${boss.abilities.slice(0, 3).map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}</ul>` : null}
      </div>` : null}
      <div class="brief2-types">${types.map((ty) => html`<div key=${ty}>
        <button type="button" class=${'brief2-type' + (side === ty ? ' is-open' : '')} data-type=${ty} aria-expanded=${side === ty ? 'true' : 'false'} onClick=${() => toggle(ty)}>
          <i class="brief2-type__bg" aria-hidden="true"></i>
          <${Img} src=${factionIconUrl(gd.m, factions[ty]?.icon)} class="brief2-type__icon" />
          <b class="brief2-type__name">${factions[ty]?.name || ty}</b>
        </button>
        ${side === ty ? html`<div class="brief2-desc brief2-desc--type">${factions[ty]?.desc || ''}</div>` : null}
      </div>`)}</div>
      <i class="brief2__deco" aria-hidden="true"></i>
    </section>
    <${Modal} open=${zoom && !!mapUrl} onClose=${() => setZoom(false)} title=${t('战场')} class="brief2-zoom">
      ${zoom && mapUrl ? html`<${Img} src=${mapUrl} class="brief2-zoom__img" alt="" />` : null}
    <//>
  </main>`;
}

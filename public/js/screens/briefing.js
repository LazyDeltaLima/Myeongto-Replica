// Briefing — INFO_CHECK "1/2 确认本局信息" (research 06 §4.1, D1): enemy leader (silhouette, name,
// abilities — the client's stage-info enemy block, maintainer request 2026-10-11), stage (+ its pool: 战场固定 /
// 战场随机（共N张）, and under its name the battlefield's preview picture — maintainer request 2026-10-11,
// tools/map-previews.mjs; the card then sits beside the factions, both as tall as the taller one), 特训敌人 factions (icon, name, description), the difficulty
// tag, the ready count x/N with person pips, the 准备就绪 button (g.infoReady) and the countdown. Next to it 重新抽取
// (g.infoReroll, feat — maintainer decision 2026-10-09; the official briefing has no such button): a vote instead of ready, one
// or the other; alone it redraws at once, in co-op more reroll votes than ready ones redraw (a new match) and anything else,
// a tie included, starts the strategy draft (server phases.js maybeEndInfo). In co-op a reroll vote can be taken back
// (取消重新抽取) and the first seat still voting it is named above the footer (「…提议重新抽取」, m.public.rerollBy) with the
// vote counts (maintainer decisions 2026-10-12; the co-op countdown runs 45 s, m.public.infoSeconds). The right column — 核心盟约
// / 附加盟约 rows of bond discs (disabled bonds greyed with the banned-member badge), the legend and the 本局禁用干员
// avatars, with the player's own 自选 pieces out of the shop (m.private.diyBanned) — is ui/matchInfo.js MatchInfo, the same
// blocks the strategy draft's 本局信息 dialog shows (screens/bandDraft.js).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, MicroLabel } from '../ui/components.js';
import { useGameData, Img, RichText } from '../ui/gameComponents.js';
import { StepHeader, ExitModal } from '../ui/matchChrome.js';
import { MatchInfo, matchInfoModel, InfoTitle } from '../ui/matchInfo.js';
import { LoadoutButton } from './loadout.js';
import { actions } from '../ui/gameActions.js';
import { factionTypes, sortedPlayers, phaseTotalSeconds } from '../ui/gameLogic.js';
import { enemyIconUrl, factionIconUrl } from '../ui/assetUrls.js';
import { useStore } from '../store.js';
import { data, localAsset } from '../data.js';
import { t, tParts } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** INFO_CHECK screen. */
export function BriefingScreen() {
  const pub = useStore((s) => s.match.public);
  const priv = useStore((s) => s.match.private);
  const myId = useStore((s) => s.me.playerId);
  const solo = useStore((s) => s.room?.mode === 'solo') || String(pub?.modeId || '').includes('single');
  const gd = useGameData();
  const matchNo = useStore((s) => s.room?.matchNo ?? 0);
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
  const voted = !!(me?.ready || me?.reroll);
  const closing = !!pub.infoOutcome;
  // the 「…提议重新抽取」 banner (co-op): the first seat still voting reroll and the counts
  const proposer = !alone && pub.rerollBy ? players.find((p) => p.playerId === pub.rerollBy) : null;
  const voters = players.filter((p) => !p.isBot && p.status !== 'left');
  const undecided = voters.filter((p) => !p.ready && !p.reroll).length;
  const mode = gd.config?.modes?.[pub.modeId];
  // (+ the own 自选 pieces this match leaves out of the shop: m.private.diyBanned)
  const info = matchInfoModel(pub, { bonds: gd.list('bonds'), chess: gd.chess, mode, priv, diyData: { chess: data.get('chess'), backups: data.get('backups') } });
  const boss = pub.bossId ? gd.boss(pub.bossId) : null;
  const bossEnemy = boss ? gd.enemy(boss.enemyKey) : null;
  const stage = pub.stageId ? gd.stage(pub.stageId) : null;
  // the mode's battlefield pool (config.json modes[].stages): 标准 is always 战场#01, 险境+ draw one at random
  const poolN = Array.isArray(mode?.stages) ? mode.stages.length : 0;
  const pool = poolN > 1 ? t('战场随机（共{poolN}张）', { poolN }) : poolN === 1 ? t('战场固定') : '';
  const stageName = stage?.name || pub.stageId || '—';
  // the battlefield's preview picture under its name (tools/map-previews.mjs: our 3D board drawn like the client's
  // stage_mappreview shots, which the autochess stages lack) — the local-client art; without it the plain row
  const mapUrl = pub.stageId ? localAsset('stage/preview', pub.stageId) : null;
  // the enemy block as the client's stage-info view draws it (prefab_auto_chess_stage_info_enemy_group): the boss in
  // img_boss_bkg with the img_boss_name_bkg tag under it, then its name and abilities; the 特训敌人 types one under the
  // other on img_normal_enemy_bkg — icon in the same frame, name, description (maintainer 2026-10-11: the client's
  // icon + name items alone read too bare) — sprites of the local-client extraction ui/outer
  const bossFrame = localAsset('ui/outer', 'img_boss_bkg');
  const bossTag = localAsset('ui/outer', 'img_boss_name_bkg');
  const enemyBg = localAsset('ui/outer', 'img_normal_enemy_bkg');
  const rowBg = localAsset('ui/outer', 'img_content_bkg');
  const types = factionTypes(pub.factions);
  const factions = gd.factions?.types || {};
  const m = gd.m;

  const vote = (kind) => async () => {
    if (busy || closing) return;
    // a reroll vote can be taken back in co-op (the button turns into 取消重新抽取); 准备就绪 is final
    if (kind === 'reroll' && me?.reroll && !alone) {
      setBusy('reroll');
      await actions.infoRerollCancel();
      setBusy(null);
      return;
    }
    if (voted) return;
    setBusy(kind);
    await (kind === 'reroll' ? actions.infoReroll() : actions.infoReady());
    setBusy(null);
  };
  const rerollTip = alone ? t('重新抽取首领、战场、特训敌人与禁用盟约')
    : me?.reroll ? t('撤回重新抽取的投票')
    : t('投票重新抽取首领、战场、特训敌人与禁用盟约：重抽票多于就绪票时重新抽取，票数相同则继续进行');

  return html`<div class="screen brief">
    <div class="brief__bg" aria-hidden="true"></div>
    <${StepHeader} step=${1} of=${2} title=${t('确认本局信息')} micro="BRIEFING // INFO CHECK" pub=${pub}
      total=${phaseTotalSeconds(pub, gd.config)} onExit=${() => setExit(true)} />
    <main class="brief__main">
      <section class="brief__left">
        <div class="brief-enemy">
          <${InfoTitle} kind="enemy" title=${t('敌方情报')} micro="ENEMY INTEL" />
          <div class="brief-eboss">
            <span class=${cx('brief-eboss__frame', !bossFrame && 'no-art')} style=${bossFrame ? `--frame:url("${bossFrame}")` : null}>
              ${bossEnemy ? html`<${Img} src=${enemyIconUrl(m, boss.enemyKey)} class="brief-eboss__icon" fallback=${html`<span class="brief-eboss__q">?</span>`} />`
                : html`<span class="brief-eboss__q">?</span>`}
            </span>
            <span class=${cx('brief-eboss__tag', !bossTag && 'no-art')} style=${bossTag ? `--tag:url("${bossTag}")` : null}>${tParts('第 {r} 回合 · 最终攻势', { r: html`<b class="num">${mode?.bossRound ?? pub.lastRound ?? 14}</b>` })}</span>
            <div class="brief-eboss__text">
              <h2 class="brief-eboss__name">${boss?.name || bossEnemy?.name || t('未知领袖')}</h2>
              ${Array.isArray(boss?.abilities) && boss.abilities.length ? html`<ul class="brief-eboss__desc">
                ${boss.abilities.slice(0, 3).map((a, i) => html`<li key=${i}><${RichText} text=${a} /></li>`)}
              </ul>` : null}
            </div>
          </div>
          <div class="brief-etypes" style=${enemyBg ? `--panel:url("${enemyBg}")` : null}>
            <span class="brief-etypes__k"><${MicroLabel}>SPECIAL ENEMIES</${MicroLabel}><span>${t('特训敌人')}</span></span>
            ${types.length ? html`<div class="brief-etypes__row">${types.map((ty) => html`<div key=${ty} class="brief-etype" data-type=${ty} style=${rowBg ? `--row:url("${rowBg}")` : null}>
              <span class=${cx('brief-etype__icon', !bossFrame && 'no-art')} style=${bossFrame ? `--frame:url("${bossFrame}")` : null}><${Img} src=${factionIconUrl(m, factions[ty]?.icon)} /></span>
              <b class="brief-etype__name" title=${factions[ty]?.name || ty}>${(factions[ty]?.name || ty).replace(t('特训敌人·'), '')}</b>
              <span class="brief-etype__desc">${factions[ty]?.desc || ''}</span>
            </div>`)}</div>` : html`<p class="t-dim">${t('本局没有特训敌人')}</p>`}
          </div>
        </div>
        <div class=${cx('brief-stage', mapUrl && 'has-map')}>
          <div class="brief-stage__head">
            <span class="brief-stage__k"><${MicroLabel}>BATTLEFIELD</${MicroLabel}>${pool ? html`<span class="brief-stage__pool">${pool}</span>` : null}</span>
            <span class="brief-stage__name"><${Icon} name="rook" />${stageName}</span>
          </div>
          ${mapUrl ? html`<${Img} src=${mapUrl} class="brief-stage__map" alt=${stageName} />` : null}
        </div>
      </section>
      <section class="brief__right">
        <${MatchInfo} model=${info} />
      </section>
    </main>
    ${proposer ? html`<div class="brief-rr" role="status" data-testid="reroll-proposer">
      <${Icon} name="refresh" />
      <div class="brief-rr__text">
        <b>${proposer.playerId === myId ? t('你提议重新抽取') : t('{name} 提议重新抽取', { name: proposer.name || t('博士') })}</b>
        <span>${t('重新抽取 {rr} · 已就绪 {rd} · 未投票 {un}：重抽票多于就绪票时重新抽取，票数相同则继续进行', { rr: rerollN, rd: voters.filter((p) => p.ready).length, un: undecided })}</span>
      </div>
    </div>` : null}
    <footer class="brief__foot">
      <${LoadoutButton} from="briefing" size="lg" class="brief-loadout" />
      <div class="brief-ready">
        <span class="brief-ready__txt">${t('已就绪')} <b class="num">${readyN}</b><span class="num">/${players.length}</span></span>
        ${!alone && rerollN ? html`<span class="brief-ready__txt brief-ready__txt--rr" data-testid="reroll-count">${t('重新抽取')} <b class="num">${rerollN}</b></span>` : null}
        <span class="brief-ready__pips">${players.map((p) => html`<i key=${p.playerId} class=${cx(p.ready && 'on', p.reroll && 'rr', p.playerId === myId && 'me')} title=${p.name}><${Icon} name=${p.reroll ? 'refresh' : 'user'} /></i>`)}</span>
      </div>
      ${me ? html`<${Button} variant="secondary" size="xl" icon="refresh" class="brief-reroll" data-testid="info-reroll" title=${rerollTip}
        active=${!!me.reroll} loading=${busy === 'reroll' || pub.infoOutcome === 'reroll'} disabled=${(voted && !(me.reroll && !alone)) || closing || !armed}
        onClick=${vote('reroll')}>${me.reroll && !alone ? t('取消重新抽取') : t('重新抽取')}<//>` : null}
      <${Button} variant="primary" size="xl" icon=${me?.ready ? 'check' : me ? 'play' : 'eye'} active=${!!me?.ready} loading=${busy === 'ready'}
        disabled=${voted || closing || !me} onClick=${vote('ready')}>${me?.ready ? t('已就绪') : me ? t('准备就绪') : t('观战中')}<//>
    </footer>
    <${ExitModal} open=${exit} onClose=${() => setExit(false)} solo=${solo} />
  </div>`;
}

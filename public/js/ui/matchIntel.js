// Shared briefing intel and its read-only strategy-draft dialog (maintainer decision 2026-11-18).
// Keep disclosure identical to the briefing: classic Alliance hides its battlefield; Regulation shows it.
import { html, Button, Icon, MicroLabel, Modal } from './components.js';
import { useGameData, Img, RichText } from './gameComponents.js';
import { InfoTitle } from './matchInfo.js';
import { factionTypes } from './gameLogic.js';
import { enemyIconUrl, factionIconUrl } from './assetUrls.js';
import { localAsset } from '../data.js';
import { t, tParts } from '../../../shared/i18n.js';
import { resolveRuleset, keepUnbanned, customStagePool, seasonOfficialOptions } from '../../../shared/ruleset.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The same boss, special enemies and battlefield in the briefing and draft. */
export function MatchIntel({ pub, season, dialog = false }) {
  const gd = useGameData();
  const mode = gd.config?.modes?.[pub.modeId];
  const boss = pub.bossId ? gd.boss(pub.bossId) : null;
  const bossEnemy = boss ? gd.enemy(boss.enemyKey) : null;
  const stage = pub.stageId ? gd.stage(pub.stageId) : null;
  // the mode's battlefield pool (config.json modes[].stages): 标准 is always 战场#01, 险境+ draw one at random; a 自定义
  // match draws from the stages its settings add and leave (customStagePool + keepUnbanned, as server/match/waves.js
  // setupMatchWaves)
  const custom = pub.ruleset?.custom;
  const poolN = Array.isArray(mode?.stages) ? keepUnbanned(customStagePool(mode.stages, custom), (id) => id, custom?.stages?.ban).length : 0;
  const pool = poolN > 1 ? t('战场随机（共{poolN}张）', { poolN }) : poolN === 1 ? t('战场固定') : '';
  const stageName = stage?.name || pub.stageId || '—';
  // the battlefield's preview picture under its name (tools/map-previews.mjs: our 3D board drawn like the client's
  // stage_mappreview shots, which the autochess stages lack) — the local-client art; without it the plain row
  const mapUrl = pub.stageId ? localAsset('stage/preview', pub.stageId) : null;
  // 规程 shows the battlefield in every mode (seasonOfficialOptions: its official stage-info view has the map preview)
  const rules = { ...resolveRuleset(pub.ruleset).options, ...seasonOfficialOptions(season) };
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
  const titleBar = localAsset('ui/outer', 'img_group_title');
  const stageTitle = dialog ? html`<h3 class="brief-h brief-h--art intel-stage-title" style=${titleBar ? `--bar:url("${titleBar}")` : null}>
    <${Icon} name="rook" /><span>${t('战场信息')}</span><${MicroLabel}>BATTLEFIELD</${MicroLabel}>
  </h3>` : null;

  return html`        <div class="brief-enemy">
          <${InfoTitle} kind="enemy" title=${t('敌方情报')} micro="ENEMY INTEL" />
          <div class="brief-eboss">
            <span class=${cx('brief-eboss__frame', !bossFrame && 'no-art')} style=${bossFrame ? `--frame:url("${bossFrame}")` : null}>
              ${bossEnemy ? html`<${Img} src=${enemyIconUrl(m, boss.enemyKey)} class="brief-eboss__icon" fallback=${html`<span class="brief-eboss__q">?</span>`} />`
                : html`<span class="brief-eboss__q">?</span>`}
            </span>
            <span class=${cx('brief-eboss__tag', !bossTag && 'no-art')} style=${bossTag ? `--tag:url("${bossTag}")` : null}>${tParts('第 {r} 回合 · 最终攻势', { r: html`<b class="num">${pub.bossRound ?? mode?.bossRound ?? pub.lastRound ?? 14}</b>` })}</span>
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
        ${rules.battlefieldInfo ? html`<div class=${cx('brief-stage', mapUrl && 'has-map')}>
          ${stageTitle}
          <div class="brief-stage__head">
            <span class="brief-stage__k">${!dialog ? html`<${MicroLabel}>BATTLEFIELD</${MicroLabel}>` : null}${pool ? html`<span class="brief-stage__pool">${pool}</span>` : null}</span>
            <span class="brief-stage__name"><${Icon} name="rook" />${stageName}</span>
          </div>
          ${mapUrl ? html`<${Img} src=${mapUrl} class="brief-stage__map" alt=${stageName} />` : dialog ? html`<div class="intel-stage-missing">${t('暂无战场预览')}</div>` : null}
        </div>` : html`<div class="brief-stage has-map is-unknown" data-testid="brief-stage-unknown">
          ${stageTitle}
          <div class="brief-stage__head">
            ${!dialog ? html`<span class="brief-stage__k"><${MicroLabel}>BATTLEFIELD</${MicroLabel}></span>` : null}
            <span class="brief-stage__name"><${Icon} name="rook" />${t('未知战场')}</span>
          </div>
          <div class="brief-stage__unknown"><div><span aria-hidden="true">?</span><em>${t('战斗开始时揭晓')}</em></div></div>
        </div>`}`;
}

/** The existing match-info modal frame, with vertically stacked briefing intel; titled as the draft's 敌方情报 button. */
export function MatchIntelDialog({ open, onClose, pub, season, status = null }) {
  return html`<${Modal} open=${open && !!pub} onClose=${onClose} title=${t('敌方情报')} hideTitle=${true}
    micro="MATCH INFO // ENEMY & BATTLEFIELD" class="minfo-dlg intel-dlg"
    actions=${html`${status ? html`<div class="minfo-dlg__status">${status}</div>` : null}
      <${Button} variant="secondary" icon="close" data-autofocus data-testid="match-intel-close" onClick=${onClose}>${t('关闭')}<//>`}>
    ${open && pub ? html`<${MatchIntel} pub=${pub} season=${season} dialog=${true} />` : null}
  <//>`;
}

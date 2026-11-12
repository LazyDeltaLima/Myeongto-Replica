// 规程's avatar badges and the boss-damage list (the official 规程 HUD; docs/rules/ui.md 「규정 HUD 새 요소」).
// Shown only by a season whose table has them (config.constants winStreakThresholds / bossDamageThresholds — tools/
// build-data.mjs avatarBadgeConstants); the numbers are the server's (m.public players[] winStreak / bossPct / bossTop,
// server/match/match/views.js _badgeView).
//   * 完美连胜 (panel_win_streak, player_win_streak_view): the perfect rounds in a row — from the first threshold the
//     theme's triangle win_streak_1_base with the count in black, from the second its star win_streak_2_base with the
//     count in #F68A25 (thresholds [3, 5]), at the avatar's top-right corner.
//   * 领袖伤害 (panel_boss_damage, player_boss_damage_view): in a boss round each avatar glows by its player's share of
//     the leader — step 1 / 2 / 3 from 20 / 50 / 80 % (the BOSS_HIT broadcasts' steps): scan_light #FFC500 / #FFAE51 /
//     #FF9A5E, damage_fx_middle_light through it, the third with the damage_fx_frame_cross frame and damage_fx_dec above
//     and below; the own avatar says its share beside it (✗ n%).
//   * the list (boss_damage_stats_panel / _item): the other players by share, each row the name (#5AF2C2), ✗ n% and the
//     portrait of their operator that dealt the leader the most with its tier; a 隐藏 / 显示 switch above; it comes
//     `bossDamageStatsDelay` seconds into the fight. The row styles by percent (bossDamageRowThresholds 30 / 60 / 100 →
//     the item's group_ranks rank_1…3) [ASSUMED·CN: the table pairs the thresholds with style ids bg_1…3; which of the
//     item's nodes a style lights is the CN client's].
// The theme's sprites are looked up as `seasonSkin/<sprite>` (ui/assetUrls.js withSeasonArt); without them the badges
// are drawn in CSS (css/screens/game-panels.css .abadge / .aglow / .bdmg).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { PHASE } from '../../../shared/constants.js';
import { html } from './components.js';
import { UnitThumb } from './gameComponents.js';
import { uiUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t, tc } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';

/** The season's avatar badge constants (config.constants), or null when its table has none. */
export function badgeConstants(config = data.get('config')) {
  const c = config?.constants;
  if (!c || (!Array.isArray(c.winStreakThresholds) && !Array.isArray(c.bossDamageThresholds))) return null;
  return c;
}

/**
 * How many of the ascending `steps` `value` reached (0 = none).
 * @param {number|null|undefined} value @param {number[]|null|undefined} steps
 */
export function stepOf(value, steps) {
  const v = Number(value);
  if (!Number.isFinite(v) || !Array.isArray(steps)) return 0;
  let n = 0;
  for (const s of steps) if (Number.isFinite(s) && v >= s) n++;
  return n;
}

/**
 * The glow step of a boss-damage share: `pct` (whole percent, floored by the server) against the table's fractions.
 * @param {number|null|undefined} pct @param {number[]|null|undefined} fractions
 */
export const bossStep = (pct, fractions) => stepOf(pct, Array.isArray(fractions) ? fractions.map((f) => Math.round(f * 100)) : null);

/** The win-streak badge step: 0, 1 (triangle) or 2 (star, the last threshold and up). */
export const streakStep = (n, thresholds) => Math.min(2, stepOf(n, thresholds));

const isBoss = (phase) => phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE;

/** ✗ n% (icon_damage, the percent, icon_percent). */
function Pct({ pct, cls = '' }) {
  return html`<span class=${`bdmg__pct ${cls}`}><i class="bdmg__x" aria-hidden="true"></i><b class="num">${pct}</b><small>%</small></span>`;
}

/**
 * The badges on one team-panel avatar (inside its button; css positions them on the portrait).
 * @param {{ player: any, self?: boolean, phase?: string|null }} props
 */
export function AvatarBadges({ player, self = false, phase = null }) {
  const c = badgeConstants();
  if (!c || !player || player.alive === false) return null;
  const m = data.get('assets');
  const out = [];
  const s = streakStep(player.winStreak, c.winStreakThresholds);
  if (s > 0) {
    const sprite = uiUrl(m, `seasonSkin/win_streak_${s}_base`);
    out.push(html`<span key="s" class=${`abadge is-r${s}${sprite ? ' has-sprite' : ''}`} style=${sprite ? `--abadge:url("${sprite}")` : undefined}
      title=${t('完美连胜 {n}', { n: player.winStreak })}><b class="num">${player.winStreak}</b></span>`);
  }
  if (isBoss(phase) && Number.isFinite(player.bossPct)) {
    const b = bossStep(player.bossPct, c.bossDamageThresholds);
    if (b > 0) {
      const art = (n) => uiUrl(m, `seasonSkin/${n}`);
      const ml = art('damage_fx_middle_light'), cr = art('damage_fx_frame_cross'), dec = art('damage_fx_dec');
      const vars = [ml && `--aglow-mid:url("${ml}")`, cr && `--aglow-cross:url("${cr}");--aglow-cross-line:none`, dec && `--aglow-dec:url("${dec}")`].filter(Boolean).join(';');
      out.push(html`<span key="g" class=${`aglow is-r${b}`} style=${vars || undefined} aria-hidden="true">
        <i class="aglow__scan"></i><i class="aglow__mid"></i>${b >= 3 ? html`<i class="aglow__cross"></i><i class="aglow__dec"></i><i class="aglow__dec is-down"></i>` : null}
      </span>`);
    }
    if (self) out.push(html`<${Pct} key="p" pct=${player.bossPct} cls="abadge__pct" />`);
  }
  return out.length ? out : null;
}

/**
 * The boss-damage list at the right edge during a boss round: the players other than the viewer (the viewer's share is
 * beside its own avatar), highest share first.
 * @param {{ pub: any, myId: string|null }} props
 */
export function BossDamagePanel({ pub, myId }) {
  const c = badgeConstants();
  const phase = pub?.phase;
  const live = !!c && Array.isArray(c.bossDamageThresholds) && isBoss(phase);
  const key = `${phase}:${pub?.round}`;
  const [shown, setShown] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!live) return undefined;
    const delay = Math.max(0, Number(c.bossDamageStatsDelay) || 0) * 1000;
    const id = setTimeout(() => setShown(key), delay);
    return () => clearTimeout(id);
  }, [live, key]);
  if (!live || shown !== key) return null;
  const rows = (pub.players || []).filter((p) => p && p.playerId !== myId && p.alive !== false && Number.isFinite(p.bossPct))
    .sort((a, b) => b.bossPct - a.bossPct || (a.seat ?? 0) - (b.seat ?? 0));
  if (!rows.length) return null;
  return html`<aside class=${hidden ? 'bdmg is-hidden' : 'bdmg'} aria-label=${t('领袖伤害')}>
    <button type="button" class="bdmg__toggle" aria-expanded=${!hidden} onClick=${() => setHidden((h) => !h)}
      onKeyDown=${(e) => { if (e.key === ' ') e.stopPropagation(); }}>
      <i class="bdmg__arrow" aria-hidden="true"></i><span>${hidden ? tc('toggle', '显示') : tc('toggle', '隐藏')}</span>
    </button>
    ${hidden ? null : html`<ol class="bdmg__list">${rows.map((p) => {
      const rank = stepOf(p.bossPct, c.bossDamageRowThresholds);
      const top = typeof p.bossTop === 'string' ? p.bossTop : null;
      const kind = top && !data.lookup('chess', top) && data.lookup('tokens', top) ? 'token' : 'chess';
      return html`<li key=${p.playerId} class=${`bdmg__row is-r${rank}`}>
        <span class="bdmg__name">${playerName(p.name) || t('博士')}</span>
        <${Pct} pct=${p.bossPct} />
        <span class="bdmg__op">${top ? html`<${UnitThumb} kind=${kind} id=${top} size="sm" />` : null}</span>
      </li>`;
    })}</ol>`}
  </aside>`;
}

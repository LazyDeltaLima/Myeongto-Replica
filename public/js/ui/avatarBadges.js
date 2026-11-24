// 规程's avatar badges and the boss-damage list (the official 规程 HUD; docs/rules/ui.md 「규정 HUD 새 요소」).
// Shown only by a season whose table has them (config.constants winStreakThresholds / bossDamageThresholds — tools/
// build-data.mjs avatarBadgeConstants); the numbers are the server's (m.public players[] winStreak / bossPct and
// leaderTop, server/match/match/views.js _badgeView / _leaderTopView).
//   * 完美连胜 (panel_win_streak, player_win_streak_view): the perfect rounds in a row — from the first threshold the
//     theme's triangle win_streak_1_base with the count in black, from the second its star win_streak_2_base with the
//     count in #F68A25 (thresholds [3, 5]), at the avatar's top-right corner.
//   * 领袖伤害 (panel_boss_damage, player_boss_damage_view): in a boss round each avatar glows by its player's share of
//     the leader — step 1 / 2 / 3 from 20 / 50 / 80 % (the BOSS_HIT broadcasts' steps): scan_light #FFC500 / #FFAE51 /
//     #FF9A5E, damage_fx_middle_light through it, the third with the damage_fx_frame_cross frame and damage_fx_dec above
//     and below; the own avatar says its share beside it (✗ n%).
//   * the list (boss_damage_stats_panel / _item): the match's top 3 operators against the leader, any player (one may
//     hold two rows), each row the player's name (#5AF2C2), the operator's ✗ n% and its portrait with its tier; a
//     隐藏 / 显示 switch above; it comes
//     `bossDamageStatsDelay` seconds into the fight. The row styles by percent (bossDamageRowThresholds 30 / 60 / 100 →
//     the item's group_ranks rank_1…3) [ASSUMED·CN: the table pairs the thresholds with style ids bg_1…3; which of the
//     item's nodes a style lights is the CN client's].
// The theme's sprites are looked up as `seasonSkin/<sprite>` (ui/assetUrls.js withSeasonArt); without them the badges
// are drawn in CSS (css/screens/game-panels.css .abadge / .aglow / .bdmg).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { PHASE } from '../../../shared/constants.js';
import { html } from './components.js';
import { FieldedThumb } from './gameComponents.js';
import { playerSkins } from './skins.js';
import { settingsStore } from './settings.js';
import { uiUrl } from './assetUrls.js';
import { data } from '../data.js';
import { t, tc } from '../../../shared/i18n.js';
import { playerName } from '../../../shared/botNames.js';

/** @import { Bag } from './gameLogic/shared.js' */

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

/**
 * The win-streak badge step: 0, 1 (triangle) or 2 (star, the last threshold and up).
 * @param {number|null|undefined} n @param {number[]|null|undefined} thresholds
 */
export const streakStep = (n, thresholds) => Math.min(2, stepOf(n, thresholds));

/** @param {unknown} phase */
const isBoss = (phase) => phase === PHASE.FINAL_ASSAULT || phase === PHASE.HIDDEN_CORE;

/** ✗ n% (icon_damage, the percent, icon_percent). @param {{ pct: number, cls?: string }} p */
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
      /** @param {string} n */
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
 * The leader ranking at the right edge during a boss round: the match's top 3 operators against the leader
 * (m.public.leaderTop, views.js _leaderTopView) — any player, the viewer too, one player may hold two rows (the official
 * 规程 recording; maintainer decision 2026-11-15) — each with its player's name, the operator's share of the leader and
 * its portrait (FieldedThumb: a 自选 slot's row its picked operator, a 补位 row its stand-in) — the viewer's own operator in this browser's chosen skin, another player's in the one they published
 * (m.public players[].skins) while 其他玩家的皮肤 is on (docs/rules/ui.md 「스킨 고르기」).
 * @param {{ pub: any, myId?: string|null }} props
 */
export function BossDamagePanel({ pub, myId = null }) {
  const c = badgeConstants();
  const phase = pub?.phase;
  const live = !!c && Array.isArray(c.bossDamageThresholds) && isBoss(phase);
  const key = `${phase}:${pub?.round}`;
  const [shown, setShown] = useState(/** @type {string | null} */ (null));
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!live) return undefined;
    const delay = Math.max(0, Number(c.bossDamageStatsDelay) || 0) * 1000;
    const id = setTimeout(() => setShown(key), delay);
    return () => clearTimeout(id);
  }, [live, key]);
  if (!live || shown !== key) return null;
  const names = new Map((pub.players || []).map((/** @type {Bag | null} */ p) => [p?.playerId, p?.name]));
  const others = settingsStore.get().otherSkins !== false;
  const rows = (Array.isArray(pub.leaderTop) ? pub.leaderTop : []).filter((/** @type {Bag | null} */ r) => r && typeof r.chess === 'string' && Number.isFinite(r.pct)).slice(0, 3);
  if (!rows.length) return null;
  return html`<aside class=${hidden ? 'bdmg is-hidden' : 'bdmg'} aria-label=${t('领袖伤害')}>
    <button type="button" class="bdmg__toggle" aria-expanded=${!hidden} onClick=${() => setHidden((h) => !h)}
      onKeyDown=${(/** @type {KeyboardEvent} */ e) => { if (e.key === ' ') e.stopPropagation(); }}>
      <i class="bdmg__arrow" aria-hidden="true"></i><span>${hidden ? tc('toggle', '显示') : tc('toggle', '隐藏')}</span>
    </button>
    ${hidden ? null : html`<ol class="bdmg__list">${rows.map((/** @type {Bag} */ r, /** @type {number} */ i) => {
      const rank = stepOf(r.pct, c.bossDamageRowThresholds);
      const kind = !data.lookup('chess', r.chess) && data.lookup('tokens', r.chess) ? 'token' : 'chess';
      // a 自选 slot's row draws its pick, a 补位 row its stand-in (the row's diy / standInFor, views.js _leaderTopView)
      const u = { id: r.chess, kind, diy: r.diy && typeof r.diy.charId === 'string' ? r.diy : null, standInFor: typeof r.standInFor === 'string' ? r.standInFor : null };
      return html`<li key=${`${i}:${r.pid}:${r.chess}`} class=${`bdmg__row is-r${rank}`}>
        <span class="bdmg__name">${playerName(names.get(r.pid)) || t('博士')}</span>
        <${Pct} pct=${r.pct} />
        <span class="bdmg__op"><${FieldedThumb} u=${u}
          ownSkin=${r.pid === myId} skinsOf=${r.pid === myId ? null : playerSkins(pub.players, r.pid, others)} /></span>
      </li>`;
    })}</ol>`}
  </aside>`;
}

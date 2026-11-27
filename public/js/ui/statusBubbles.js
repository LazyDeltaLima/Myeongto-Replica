// 规程's avatar bubbles (docs/rules/ui.md 「규정 아바타 말풍선」; maintainer decision 2026-11-27): in a season with the
// avatarBubbles switch (shared/seasons.js) a player's news shows beside its avatar in the team list for 2.5 s, once,
// instead of as a broadcast strip line — the official player_status_item's bubble_cont and its five bubbles:
//   * 完美作战 (PERFECT_BATTLE → player_status_perfect_battle_bubble / autochess_system_emoji_perfect) — every round,
//     when the player's own battle ends (server Match.fieldEnded),
//   * an elite (GOLDEN_CHAR → _golden_char_bubble / _operator_gold: three merge arrows close in, then the operator's
//     avatar in its frame),
//   * a 调度中心 level (SHOP_LEVEL → _shop_level_bubble / _shop_upgrade: the shop icon with the new level),
//   * out (PLAYER_OUT, the remake's own line → _dead_bubble / _fail),
//   * a leader-damage step (BOSS_HIT → _boss_hit_bubble / _damage_1|2|3: ✗ 20 / 50 / 80 %) — every player who reaches
//     one, a teammate too (the maintainer's recording).
// The strip leaves those lines out, and the line of a player who left (PLAYER_LEFT) too: its card's quit mask says it
// (ui/teamPanel.js cardState). The bubbles need the team list on screen (two players or more) and the season's bubble art
// (tools/local-extract/season_ui.py `statusbubble`); without them the strip keeps every line.
// Sizes: the bubble root 112×100 at the avatar's (69, −8) in the card's 80-unit `--u` (layout of player_status_item and
// the bubbles at 1280×720), timelines from the bubbles' Animation clips (alpha in by .167 s, held to 2.0, gone at 2.5) —
// css/hud-art.css 「규정 아바타 말풍선」. A player's bubbles queue, 2.5 s each [ASSUMED·CN: the client's queueing — the
// code that shows them is not readable]; one beside an emote bubble draws over it [ASSUMED·CN].

import { useState } from '../../vendor/hooks.module.js';
import { html } from './components.js';
import { fieldedAvatarUrl } from './gameComponents.js';
import { playerSkins } from './skins.js';
import { settingsStore } from './settings.js';
import { localAsset } from '../data.js';
import { seasonFeature } from '../../../shared/seasons.js';

/** How long one bubble shows (the clips' 2.5 s). */
export const BUBBLE_MS = 2500;
/** Lines older than this when the screen first sees them are history, not news. */
const MAX_AGE = 30000;

/** The ticker line types that are a bubble in such a season, and the bubble each one is. */
export const BUBBLE_KIND = Object.freeze(/** @type {Record<string, 'perfect'|'gold'|'shop'|'dead'|'boss'>} */ ({
  PERFECT_BATTLE: 'perfect', GOLDEN_CHAR: 'gold', SHOP_LEVEL: 'shop', PLAYER_OUT: 'dead', BOSS_HIT: 'boss',
}));
/** The line types the strip leaves out there: the bubbles' and a departure (the quit mask). */
const STRIP_HIDDEN = new Set([...Object.keys(BUBBLE_KIND), 'PLAYER_LEFT']);

/**
 * @typedef {{ id: number, at: number, type?: string|null, playerId?: string|null, round?: number|null,
 *   args?: string[], chess?: string, diy?: { charId: string, skillIndex: number, uniEquipId: string|null },
 *   standInFor?: string, step?: number, pct?: number, [key: string]: unknown }} BubbleLine  a store.ticker line
 */

const isObj = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (/** @type {unknown} */ v, max = 64) => (typeof v === 'string' && v && v.length <= max ? v : null);

/**
 * The fields of an m.ticker message a bubble draws, checked (server: messaging.js tickerFor `extra`, args): `args` (the
 * line's parameters — SHOP_LEVEL's level), an elite's `chess` with `diy` / `standInFor` (what it fields as), a
 * leader-damage line's `step` (1–3) and `pct`. Absent fields are left out.
 * @param {Record<string, unknown> | null | undefined} msg
 */
export function statusBubbleFields(msg) {
  /** @type {{ args?: string[], chess?: string, diy?: { charId: string, skillIndex: number, uniEquipId: string|null }, standInFor?: string, step?: number, pct?: number }} */
  const out = {};
  if (!isObj(msg)) return out;
  const m = /** @type {Record<string, unknown>} */ (msg);
  if (Array.isArray(m.args)) out.args = m.args.slice(0, 4).map((a) => (typeof a === 'string' ? a.slice(0, 64) : ''));
  const chess = str(m.chess);
  if (chess) out.chess = chess;
  if (isObj(m.diy)) {
    const d = /** @type {Record<string, unknown>} */ (m.diy);
    const charId = str(d.charId);
    if (charId) out.diy = { charId, skillIndex: Number.isInteger(d.skillIndex) ? /** @type {number} */ (d.skillIndex) : 0, uniEquipId: str(d.uniEquipId) };
  }
  const si = str(m.standInFor);
  if (si) out.standInFor = si;
  if (Number.isInteger(m.step) && /** @type {number} */ (m.step) >= 1 && /** @type {number} */ (m.step) <= 3) out.step = /** @type {number} */ (m.step);
  if (Number.isFinite(m.pct)) out.pct = Math.max(0, Math.min(100, Math.round(/** @type {number} */ (m.pct))));
  return out;
}

/**
 * The season's bubble art (season_ui.py `statusbubble`) by sprite name, or null when the season has no bubbles or no
 * art extracted.
 * @param {string|null|undefined} season
 * @returns {((name: string) => string|null) | null}
 */
export function bubbleArt(season) {
  if (!seasonFeature(season, 'avatarBubbles')) return null;
  const group = `season/${season}/statusbubble`;
  if (!localAsset(group, 'back_shadow')) return null;
  return (name) => localAsset(group, name);
}

/**
 * Whether the bubbles replace the strip's lines: the season has them and their art, and the team list is on screen
 * (two players or more — a solo match hides it, css/hud-art.css `is-solo`).
 * @param {string|null|undefined} season @param {number} players m.public players' count
 */
export const bubblesOn = (season, players) => players > 1 && !!bubbleArt(season);

/**
 * Whether the strip leaves `line` out (the bubbles are on and the line is one of theirs, or a departure).
 * @param {{ type?: string|null } | null | undefined} line @param {boolean} on bubblesOn(...)
 */
export const stripHides = (line, on) => on && !!line && typeof line.type === 'string' && STRIP_HIDDEN.has(line.type);

/**
 * The bubble each player shows at `now`, from the ticker lines: a player's bubble lines in arrival order, each
 * BUBBLE_MS long and starting when it came or when the one before it ends; a leader-damage line is skipped when the
 * player's next one of the same round came before it would start (it names a higher step), and once its round is over.
 * Lines older than MAX_AGE when they would start are dropped. `pending`: a bubble still waits its turn (re-render then).
 * @param {BubbleLine[] | null | undefined} lines store.ticker
 * @param {number} now @param {number|null} round m.public.round
 * @returns {{ shown: Map<string, BubbleLine & { kind: string, start: number }>, pending: boolean }}
 */
export function scheduleBubbles(lines, now, round = null, ms = BUBBLE_MS) {
  /** @type {Map<string, BubbleLine[]>} */
  const by = new Map();
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!l || typeof l.type !== 'string' || !BUBBLE_KIND[l.type] || typeof l.playerId !== 'string' || !Number.isFinite(l.at)) continue;
    if (now - l.at >= MAX_AGE) continue;
    if (!by.has(l.playerId)) by.set(l.playerId, []);
    /** @type {BubbleLine[]} */ (by.get(l.playerId)).push(l);
  }
  const shown = new Map();
  let pending = false;
  for (const [pid, list] of by) {
    list.sort((a, b) => a.id - b.id);
    let end = -Infinity;
    list.forEach((l, i) => {
      const start = Math.max(l.at, end);
      if (l.type === 'BOSS_HIT') {
        if (l.round != null && round != null && l.round !== round) return;
        if (list.slice(i + 1).some((n) => n.type === 'BOSS_HIT' && n.round === l.round && n.at <= start)) return;
      }
      if (now - start >= MAX_AGE) return;
      end = start + ms;
      if (start <= now && now < end) shown.set(pid, { ...l, kind: BUBBLE_KIND[/** @type {string} */ (l.type)], start });
      else if (start > now) pending = true;
    });
  }
  return { shown, pending };
}

/**
 * One bubble on a team-panel avatar (inside its button: css/hud-art.css places it in the card's units). Its clip runs
 * from the bubble's start, so a bubble drawn late (a re-render, a queue) picks up where it is.
 * @param {{ b: BubbleLine & { kind: string, start: number }, art: (name: string) => string|null,
 *   self?: boolean, players?: unknown[] }} props
 */
export function StatusBubble({ b, art, self = false, players = [] }) {
  const [delay] = useState(() => Math.max(0, Date.now() - b.start) / 1000);
  /** @type {string[]} */
  const vars = [`--sb-t:-${delay.toFixed(3)}s`];
  const put = (/** @type {string} */ v, /** @type {string} */ name) => { const u = art(name); if (u) vars.push(`--sb-${v}:url("${u}")`); };
  put('shadow', 'back_shadow');
  let body = null;
  let cls = `sbub sbub--${b.kind}`;
  if (b.kind === 'boss') {
    const step = b.step || 1;
    cls += ` is-r${step}`;
    put('glow', 'glow_light'); put('dmg', 'icon_damage'); put('pc', 'icon_percent');
    if (step >= 3) { put('super', 'damage_super'); put('hdec', 'high_damage_dec'); }
    body = html`<i class="sbub__glow"></i>${step >= 3 ? html`<i class="sbub__hdec"></i>` : null}
      <i class="sbub__row">${step >= 3 ? html`<i class="sbub__holder"><i class="sbub__super"></i></i>` : html`<i class="sbub__dmg"></i>`}<b class="sbub__num">${b.pct ?? [20, 50, 80][step - 1]}</b><i class="sbub__pc"></i></i>`;
  } else {
    put('light', 'back_lighten');
    if (b.kind === 'perfect') {
      put('face', 'perfect_face'); put('spark', 'perfect_spark'); put('sword', 'perfect_sword'); put('text', 'text_perfect');
      body = html`<i class="sbub__cf"><i class="sbub__face"></i><i class="sbub__spark"></i><i class="sbub__sword"></i></i><i class="sbub__text"></i>`;
    } else if (b.kind === 'gold') {
      put('merge', 'icon_operator_merge'); put('cshadow', 'char_shadow'); put('cframe', 'char_frame');
      const others = settingsStore.get().otherSkins !== false;
      const av = b.chess ? fieldedAvatarUrl({ id: b.chess, diy: b.diy || null, standInFor: b.standInFor || null },
        { ownSkin: self, skinsOf: self ? null : playerSkins(players, b.playerId, others) }) : null;
      if (av) vars.push(`--sb-av:url("${av}")`);
      body = html`<i class="sbub__merge"><i class="sbub__m sbub__m1"></i><i class="sbub__m sbub__m2"></i><i class="sbub__m sbub__m3"></i></i>
        <i class="sbub__ga"><i class="sbub__gshadow"></i><i class="sbub__gav"></i><i class="sbub__gframe"></i></i>`;
    } else if (b.kind === 'shop') {
      put('shop', 'shop_icon'); put('arrow', 'shop_upgrade');
      body = html`<i class="sbub__shop"><b class="sbub__lv">${b.args?.[1] ?? ''}</b></i><i class="sbub__arrow"></i>`;
    } else {
      put('fface', 'fail_face'); put('eye', 'fail_eye'); put('mouth', 'fail_mouth');
      body = html`<i class="sbub__cf"><i class="sbub__ff"></i><i class="sbub__eye"></i><i class="sbub__mouth"></i></i>`;
    }
  }
  return html`<span class=${cls} style=${vars.join(';')} aria-hidden="true"><i class="sbub__shadow"></i>${b.kind === 'boss' ? null : html`<i class="sbub__light"></i>`}${body}</span>`;
}

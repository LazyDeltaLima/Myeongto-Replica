// ui/gameLogic/format.js — HUD numbers, status glyphs, range boxes, unit flags. Re-exported from ../gameLogic.js.

import { UF } from '../../../../shared/constants.js';
import { clamp, isObj, tileKey } from './shared.js';
import { N_, langInfo } from '../../../../shared/i18n.js';


// ---- players, statuses, fields ------------------------------------------------------------------------

/** Status → glyph + text (research 06 §11.1). */
export const STATUS_META = Object.freeze({
  acting: { glyph: 'dots', text: N_('行动中'), tone: 'lo' },
  ready: { glyph: 'check', text: N_('已就绪'), tone: 'mint' },
  deciding: { glyph: 'hourglass', text: N_('决策中'), tone: 'gold' },
  combat: { glyph: 'sword', text: N_('作战中'), tone: 'orange' },
  done: { glyph: 'check', text: N_('作战结束'), tone: 'mint' },
  helping: { glyph: 'shield', text: N_('联防中'), tone: 'orange' },
  left: { glyph: 'exit', text: N_('已离开'), tone: 'red' },
  dead: { glyph: 'close', text: N_('已淘汰'), tone: 'red' },
});

// ---- snapshots / battle HUD ---------------------------------------------------------------------------------

/**
 * HUD numbers from a b.snap: { killed, resolved, total, dp, boss } (boss: { hp, max } when present).
 * `resolved` is the capsule's numerator — knocked out + leaked among the round's own enemies (Battle.leakedInTotal);
 * an older snapshot without it falls back to the kill count.
 * @param {any} snap
 */
export function snapHud(snap) {
  if (!isObj(snap)) return null;
  const n = (v) => (Number.isFinite(v) ? v : null);
  let boss = null;
  if (isObj(snap.boss) && Number.isFinite(snap.boss.hp)) boss = { hp: snap.boss.hp, max: n(snap.boss.max) ?? n(snap.boss.maxHp) };
  const killed = n(snap.killed);
  return { killed, resolved: n(snap.resolved) ?? killed, total: n(snap.total), dp: n(snap.dp), boss };
}

/** Boss HP fraction 0..1 (null when unknown). */
export function bossFrac(bossHp) {
  if (!isObj(bossHp)) return null;
  const hp = Number(bossHp.hp);
  const max = Number(bossHp.max ?? bossHp.maxHp);
  if (!Number.isFinite(hp) || !Number.isFinite(max) || max <= 0) return null;
  return clamp(hp / max, 0, 1);
}

/**
 * The boss bar's percentage text for a fraction (bossFrac): whole percents from 10 %, one decimal below, and never
 * "0.0%" while the leader still has HP — a sliver reads "<0.1%" (user playtest #6 item 5: a bar at 0.0 % with the
 * leader still fighting read as a leader that could not die). null for an unknown fraction.
 * @param {number|null} frac
 */
export function bossPctText(frac) {
  if (frac == null || !Number.isFinite(frac)) return null;
  const pct = clamp(frac, 0, 1) * 100;
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct > 0 && pct < 0.05) return '<0.1%';
  return `${pct.toFixed(1)}%`;
}

/** Whether a snapshot unit tuple has a flag. */
export const hasFlag = (flags, bit) => (Number(flags) & bit) !== 0;
export { UF };

// ---- stats & range --------------------------------------------------------------------------------------------

/** Attack interval in seconds (bat × 100 / aspd). */
export function attackInterval(bat, aspd = 100) {
  const b = Number(bat);
  const a = Number(aspd) > 0 ? Number(aspd) : 100;
  if (!Number.isFinite(b) || b <= 0) return null;
  return b * 100 / a;
}

/** fmtNum's styles: 'myriad' (10⁴ steps, 万 / 亿), 'thousand' (K / M / B), 'full' (every digit, '1,500,000'). */
export const NUMBER_UNIT_MODES = Object.freeze(['myriad', 'thousand', 'full']);
let unitMode = null;
/** Settings → 画面 「数字单位」 (ui/settings.js): one of NUMBER_UNIT_MODES, or null for the language's own style. */
export function setNumberUnitMode(mode) { unitMode = NUMBER_UNIT_MODES.includes(mode) ? mode : null; }
/**
 * The style fmtNum uses in `lang` (the current language by default): the setting's, except 'myriad' in a language without
 * units of its own; with no setting, 'myriad' where the language has them and 'thousand' elsewhere.
 * @param {string} [lang]
 * @returns {'myriad'|'thousand'|'full'}
 */
export function numberUnitMode(lang) {
  if (unitMode === 'thousand' || unitMode === 'full') return unitMode;
  return langInfo(lang)?.numberUnits ? 'myriad' : 'thousand';
}

/** A shortened amount: whole when `whole`, else one decimal without a trailing '.0' (98.0万 → 98万, 40.2万 stays). */
const short = (x, whole) => (whole ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''));

/**
 * Compact number: 12345 → '12,345'; 1.5e6 → '150万' in Chinese, whose units count in 10⁴ / 10⁸ steps (万 / 亿; a language
 * pack names its own pair in `_meta.numberUnits`, shared/i18nPacks.js — no template can move the decimal point); a
 * language without them uses the thousands-based units: 1.5e6 → '1.5M', 2.5e5 → '250K', 3e9 → '3B' (English). The
 * player's 「数字单位」 setting overrides the language's style (numberUnitMode). A decimal '.0' is dropped: 2e5 → '20万' / '200K',
 * 1e6 → '1M' (maintainer decision 2026-10-24).
 */
export function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const mode = numberUnitMode();
  if (mode === 'full') return Math.round(n).toLocaleString('en-US');
  const units = mode === 'myriad' ? langInfo()?.numberUnits : null;
  if (!units) {
    if (Math.abs(n) >= 1e9) return `${short(n / 1e9, Math.abs(n) >= 1e10)}B`;
    if (Math.abs(n) >= 1e6) return `${short(n / 1e6, Math.abs(n) >= 1e7)}M`;
    if (Math.abs(n) >= 1e5) return `${Math.round(n / 1e3)}K`;
    return Math.round(n).toLocaleString('en-US');
  }
  if (Math.abs(n) >= 1e8) return `${short(n / 1e8, n >= 1e9)}${units[1]}`;
  if (Math.abs(n) >= 1e5) return `${short(n / 1e4, n >= 1e6)}${units[0]}`;
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Bounding box + cell set of a range grid (always including the own tile [0,0]); `mirror` flips columns.
 * @param {Array<[number, number]>} grid [[dRow, dCol], …]
 * @param {boolean} [mirror]
 * @returns {{ rows: number, cols: number, r0: number, c0: number, cells: Set<string>, self: [number, number] }}
 */
export function rangeGridBox(grid, mirror = false) {
  const cells = new Set();
  let minR = 0; let maxR = 0; let minC = 0; let maxC = 0;
  for (const g of Array.isArray(grid) ? grid : []) {
    if (!Array.isArray(g) || !Number.isFinite(g[0]) || !Number.isFinite(g[1])) continue;
    const r = g[0];
    const c = mirror ? -g[1] : g[1];
    cells.add(tileKey(r, c));
    minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  return { rows: maxR - minR + 1, cols: maxC - minC + 1, r0: maxR, c0: minC, cells, self: [0, 0] };
}

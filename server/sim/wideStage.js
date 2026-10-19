// server/sim/wideStage.js — the doubled 联防 field of the 8-player mode (maintainer decision 2026-10-19; a remake feature,
// no official 8-player data, every rule here [ASSUMED]). Pure, shared with the browser like the rest of server/sim/.
//
// A battle stage row holds two player halves chained 8 columns apart: the exit E at column 2, the left half's spawn S at
// column 10 (where the right half ends) and the right half's spawn S at column 18 (e.g. `##Errrr##rSrrrr##rS##`). The
// 2-helper 联防 field plays both halves; the wide field of 3–4 helpers attaches the same pair once more on the right:
// stage columns 3–18 repeated WIDE_SHIFT (16) columns further, so the two new halves end on the old right spawn (column
// 18, now walked through like column 10) and the field is GEO.WIDE_COLS (37) wide —
//   wide column c = stage column c (c ≤ 18), c − 16 (19 ≤ c ≤ 36).
// What stands on a repeated column (a device, a map character) stands on both copies; columns 0–2 (the exit side) are
// not repeated and columns 19–20 (the walls right of the old spawn) move to 35–36. The helpers stand on the halves at
// column offsets 24, 16, 8, 0 (the first helper meets the enemies first, on the far right — unite.js); the enemies
// enter at column 34 and walk the right pair's route, then the left pair's (widenRoute).

import { GEO } from '../../shared/constants.js';

export const WIDE_SHIFT = GEO.WIDE_SHIFT;
/** The stage columns the wide field repeats (the two halves without the exit column 2). */
const FIRST = 3, LAST = 18;
/** Column offsets of the helpers on the wide field, first helper (the right-most half) first. */
export const WIDE_OFFSETS = Object.freeze([3 * GEO.PARTNER_COL_OFFSET, 2 * GEO.PARTNER_COL_OFFSET, GEO.PARTNER_COL_OFFSET, 0]);

/** The wide columns a stage column stands on (header). @param {number} c @returns {number[]} */
export function wideCols(c) {
  if (c < FIRST) return [c];
  if (c <= LAST) return [c, c + WIDE_SHIFT];
  return [c + WIDE_SHIFT];
}

/** One stage row (a string or an array of glyphs) on the wide field. */
export function widenRow(line) {
  if (typeof line === 'string') return line.slice(0, LAST + 1) + line.slice(FIRST, LAST + 1) + line.slice(LAST + 1);
  if (Array.isArray(line)) return [...line.slice(0, LAST + 1), ...line.slice(FIRST, LAST + 1), ...line.slice(LAST + 1)];
  return line;
}

const shiftPos = (p, k) => (Array.isArray(p) ? [p[0], p[1] + k, ...p.slice(2)] : p);

/**
 * A normalised stage (simdata.js normalizeStage) on the wide field: its rows widened, every device and map character
 * placed on each wide column of its stage column (header; a copy's alias gains `~w`). The result is normalised too.
 * @param {any} stage
 */
export function widenStage(stage) {
  if (!stage || stage._wide) return stage;
  const rows = Array.isArray(stage.rows) ? stage.rows.map(widenRow) : stage.rows;
  const devices = [];
  for (const d of stage.devices || []) {
    if (!d || !Number.isInteger(d.col) || d.col < 0) { devices.push(d); continue; }
    wideCols(d.col).forEach((c, i) => {
      if (i === 0 && c === d.col) { devices.push(d); return; }
      const raw = d.raw && typeof d.raw === 'object'
        ? { ...d.raw, pos: shiftPos(d.raw.pos, c - d.col), ...(d.raw.alias != null ? { alias: `${d.raw.alias}~w` } : {}) } : d.raw;
      devices.push({ ...d, col: c, raw });
    });
  }
  const mapChars = [];
  const list = stage.raw?.mapChars ?? stage.mapChars ?? [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || !Array.isArray(m.pos)) { mapChars.push(m); continue; }
    wideCols(m.pos[1]).forEach((c, i) => {
      if (i === 0 && c === m.pos[1]) { mapChars.push(m); return; }
      mapChars.push({ ...m, pos: shiftPos(m.pos, c - m.pos[1]), ...(m.alias != null ? { alias: `${m.alias}~w` } : {}) });
    });
  }
  const raw = stage.raw && typeof stage.raw === 'object' ? { ...stage.raw, mapChars } : { mapChars };
  return { ...stage, _wide: true, rows, devices, raw };
}

/**
 * An escaped-template route of the 2-helper field (data/waves.json `routes`: start, end, checkpoints as [row, col] or
 * { pos }) on the wide field: it starts WIDE_SHIFT columns further right, walks its own checkpoints there, passes the
 * old start (the junction) and then walks them again on the left pair to the same end.
 */
export function widenRoute(route) {
  if (!route || typeof route !== 'object') return route;
  const cps = Array.isArray(route.checkpoints) ? route.checkpoints : [];
  const shift = (cp) => (Array.isArray(cp) ? shiftPos(cp, WIDE_SHIFT)
    : cp && typeof cp === 'object' && Array.isArray(cp.pos) ? { ...cp, pos: shiftPos(cp.pos, WIDE_SHIFT) } : cp);
  const junction = Array.isArray(route.start) ? [[route.start[0], route.start[1]]] : [];
  return { ...route, start: shiftPos(route.start, WIDE_SHIFT), checkpoints: [...cps.map(shift), ...junction, ...cps] };
}

/**
 * The column span a player of the wide field owns (bounties of deaths no operator caused, the 沙尘暴 spans, a flyer's or
 * a map character's half): from 3 columns into its half to 2 columns into the next one's, the outer halves to the
 * field's edges — the same split as the 2-helper field (columns ≤ 10 left, ≥ 11 right).
 * @param {{ colOffset: number }[]} players @param {{ colOffset: number }} ps @param {{ c0: number, c1: number }} rect
 * @returns {[number, number]}
 */
export function wideSpan(players, ps, rect) {
  const offs = [...new Set(players.map((p) => p.colOffset))].sort((a, b) => a - b);
  const i = offs.indexOf(ps.colOffset);
  const lo = i <= 0 ? rect.c0 : ps.colOffset + FIRST;
  const hi = i < 0 || i === offs.length - 1 ? rect.c1 : offs[i + 1] + FIRST - 1;
  return [lo, hi];
}

/** The player of the wide field whose span holds column c (wideSpan), else the first. */
export function widePlayerAt(players, c, rect) {
  for (const p of players) {
    const [lo, hi] = wideSpan(players, p, rect);
    if (c >= lo && c <= hi) return p;
  }
  return players[0] ?? null;
}

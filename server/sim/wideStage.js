// server/sim/wideStage.js — the wide 联防 fields of the 8-player mode (maintainer decision 2026-10-19; a remake feature,
// no official 8-player data, every rule here [ASSUMED]). Pure, shared with the browser like the rest of server/sim/.
//
// A battle stage row holds two player halves chained 8 columns apart: the exit E at column 2, the left half's spawn S at
// column 10 (where the right half ends) and the right half's spawn S at column 18 (e.g. `##Errrr##rSrrrr##rS##`). The
// 2-helper 联防 field plays both halves; a wide field of `halves` (3 or 4) helpers attaches more halves on the right, the
// side the enemies come from: 3 = the 1-helper half + the 2-helper field (stage columns 11–18 repeated 8 columns further,
// 29 columns wide), 4 = the 2-helper field twice (columns 3–18 repeated 16 columns further, GEO.WIDE_COLS = 37 wide).
// With shift = 8 × (halves − 2):
//   wide column c = stage column c (c ≤ 18), c − shift (19 ≤ c ≤ 20 + shift).
// The new halves end on the old right spawn (column 18, now walked through like column 10). What stands on a repeated
// column (a device, a map character) stands on both copies; the columns left of the repeated ones are not repeated and
// columns 19–20 (the walls right of the old spawn) move by the shift. The helpers stand on the halves at column offsets
// 8 × (halves − 1) … 8, 0 (the first helper meets the enemies first, on the far right — unite.js); the enemies enter at
// column 18 + shift and walk the added halves' part of the 2-helper route, then the whole route (widenRoute).

import { GEO } from '../../shared/constants.js';

const HALF = GEO.PARTNER_COL_OFFSET;
/** The last stage column of the 2-helper field's right half (its spawn). */
const LAST = 18;
/** Halves of a wide field: 3 or 4 (anything else is no wide field). */
export const wideHalves = (n) => (n === 3 || n === 4 ? n : 0);
/** Columns the added halves shift the 2-helper field's right part by. @param {number} halves */
export const wideShift = (halves) => HALF * (halves - 2);
/** The first stage column a wide field of `halves` repeats. */
const firstRepeated = (halves) => LAST + 1 - wideShift(halves);
/** The field rect of a wide field (GEO.UNITE_RECT widened by the shift). */
export const wideRect = (halves) => ({ ...GEO.UNITE_RECT, c1: GEO.UNITE_RECT.c1 + wideShift(halves) });
/** Column offsets of the helpers on a wide field, first helper (the right-most half) first. */
export const wideOffsets = (halves) => Array.from({ length: halves }, (_, i) => HALF * (halves - 1 - i));

/** The wide columns a stage column stands on (header). @param {number} c @param {number} halves @returns {number[]} */
export function wideCols(c, halves) {
  const s = wideShift(halves);
  if (c < firstRepeated(halves)) return [c];
  if (c <= LAST) return [c, c + s];
  return [c + s];
}

/** One stage row (a string or an array of glyphs) on a wide field of `halves`. */
export function widenRow(line, halves) {
  const f = firstRepeated(halves);
  if (typeof line === 'string') return line.slice(0, LAST + 1) + line.slice(f, LAST + 1) + line.slice(LAST + 1);
  if (Array.isArray(line)) return [...line.slice(0, LAST + 1), ...line.slice(f, LAST + 1), ...line.slice(LAST + 1)];
  return line;
}

const shiftPos = (p, k) => (Array.isArray(p) ? [p[0], p[1] + k, ...p.slice(2)] : p);

/**
 * A normalised stage (simdata.js normalizeStage) on a wide field of `halves`: its rows widened, every device and map
 * character placed on each wide column of its stage column (header; a copy's alias gains `~w`). The result is
 * normalised too.
 * @param {any} stage @param {number} halves 3 | 4
 */
export function widenStage(stage, halves) {
  if (!stage || stage._wide || !wideHalves(halves)) return stage;
  const rows = Array.isArray(stage.rows) ? stage.rows.map((r) => widenRow(r, halves)) : stage.rows;
  const devices = [];
  for (const d of stage.devices || []) {
    if (!d || !Number.isInteger(d.col) || d.col < 0) { devices.push(d); continue; }
    wideCols(d.col, halves).forEach((c, i) => {
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
    wideCols(m.pos[1], halves).forEach((c, i) => {
      if (i === 0 && c === m.pos[1]) { mapChars.push(m); return; }
      mapChars.push({ ...m, pos: shiftPos(m.pos, c - m.pos[1]), ...(m.alias != null ? { alias: `${m.alias}~w` } : {}) });
    });
  }
  const raw = stage.raw && typeof stage.raw === 'object' ? { ...stage.raw, mapChars } : { mapChars };
  return { ...stage, _wide: halves, rows, devices, raw };
}

/**
 * An escaped-template route of the 2-helper field (data/waves.json `routes`: start, end, checkpoints as [row, col] or
 * { pos }) on a wide field of `halves`: it starts the shift further right, walks the checkpoints of the repeated columns
 * there, passes the old start (the junction) and then walks the whole route to the same end.
 * @param {any} route @param {number} halves 3 | 4
 */
export function widenRoute(route, halves) {
  if (!route || typeof route !== 'object' || !wideHalves(halves)) return route;
  const s = wideShift(halves), f = firstRepeated(halves);
  const cps = Array.isArray(route.checkpoints) ? route.checkpoints : [];
  const colOf = (cp) => (Array.isArray(cp) ? cp[1] : cp && typeof cp === 'object' && Array.isArray(cp.pos) ? cp.pos[1] : null);
  const shift = (cp) => (Array.isArray(cp) ? shiftPos(cp, s) : { ...cp, pos: shiftPos(cp.pos, s) });
  const added = cps.filter((cp) => Number.isFinite(colOf(cp)) && colOf(cp) >= f).map(shift);
  const junction = Array.isArray(route.start) ? [[route.start[0], route.start[1]]] : [];
  return { ...route, start: shiftPos(route.start, s), checkpoints: [...added, ...junction, ...cps] };
}

/**
 * The column span a player of a wide field owns (bounties of deaths no operator caused, the 沙尘暴 spans, a flyer's or
 * a map character's half): from 3 columns into its half to 2 columns into the next one's, the outer halves to the
 * field's edges — the same split as the 2-helper field (columns ≤ 10 left, ≥ 11 right).
 * @param {{ colOffset: number }[]} players @param {{ colOffset: number }} ps @param {{ c0: number, c1: number }} rect
 * @returns {[number, number]}
 */
export function wideSpan(players, ps, rect) {
  const IN = 3; // a half's own columns start 3 into it (its exit-side column 2 belongs to the half on its left)
  const offs = [...new Set(players.map((p) => p.colOffset))].sort((a, b) => a - b);
  const i = offs.indexOf(ps.colOffset);
  const lo = i <= 0 ? rect.c0 : ps.colOffset + IN;
  const hi = i < 0 || i === offs.length - 1 ? rect.c1 : offs[i + 1] + IN - 1;
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

// shared/wideField.js — the columns of the 8-player mode's wide 联防 fields (maintainer decision 2026-10-19; a remake
// feature, every rule [ASSUMED]): how a stage row of 21 columns becomes 29 (3 halves) or 37 (4 halves) — the sim
// (server/sim/wideStage.js, its header has the geometry) and the browser's renderer (render/app.js draws the widened
// stage record: widenStageData) share it.

import { GEO } from './constants.js';

/** A half's width: the two halves of the 2-helper field are 8 columns apart. */
export const HALF = GEO.PARTNER_COL_OFFSET;
/** The last stage column of the 2-helper field's right half (its spawn). */
export const LAST = 18;
/** The stage rows a wide field widens for the browser (widenStageData): the 联防 field (9–12) and the walls around it. */
export const WIDE_ROWS = Object.freeze([6, 13]);
/** Halves of a wide field: 3 or 4 (anything else is no wide field). */
export const wideHalves = (n) => (n === 3 || n === 4 ? n : 0);
/** Columns the added halves shift the 2-helper field's right part by. @param {number} halves */
export const wideShift = (halves) => HALF * (halves - 2);
/** The first stage column a wide field of `halves` repeats. */
export const firstRepeated = (halves) => LAST + 1 - wideShift(halves);
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

export const shiftPos = (p, k) => (Array.isArray(p) ? [p[0], p[1] + k, ...p.slice(2)] : p);

/**
 * A stage record as data/stages.json holds it (rows of glyph strings, devices and map characters at `pos` [row, col])
 * on a wide field of `halves` — what the browser draws (render/tiles.js, render/board3d/layout.js) for a battle whose
 * spec is wide; the sim widens its normalised stage itself (widenStage). The 联防 rows (WIDE_ROWS: the field, the
 * walls above and below it) are widened; the other rows (the bench, the boss field, the enemy preview pen) keep their
 * columns and are padded with forbidden tiles, so the pen is not drawn twice. `size` follows; a repeated column's device /
 * map character in the 联防 rows stands on both copies (a copy's key gains `~w`); the deploy tiles are left as they
 * are (nothing deploys in a 联防). `_wide` = halves.
 * @param {any} stage @param {number} halves 3 | 4
 */
export function widenStageData(stage, halves) {
  if (!stage || typeof stage !== 'object' || stage._wide || !wideHalves(halves)) return stage;
  const inRows = (r) => r >= WIDE_ROWS[0] && r <= WIDE_ROWS[1];
  const copies = (list) => {
    const out = [];
    for (const d of Array.isArray(list) ? list : []) {
      if (!d || !Array.isArray(d.pos) || !Number.isInteger(d.pos[1]) || !inRows(d.pos[0])) { out.push(d); continue; }
      wideCols(d.pos[1], halves).forEach((c, i) => {
        if (i === 0 && c === d.pos[1]) { out.push(d); return; }
        out.push({ ...d, pos: shiftPos(d.pos, c - d.pos[1]), ...(d.key != null ? { key: `${d.key}~w` } : {}), ...(d.alias != null ? { alias: `${d.alias}~w` } : {}) });
      });
    }
    return out;
  };
  const pad = '#'.repeat(wideShift(halves));
  const rows = Array.isArray(stage.rows)
    ? stage.rows.map((r, i) => (inRows(i) ? widenRow(r, halves) : typeof r === 'string' ? r + pad : r)) : stage.rows;
  const size = Array.isArray(stage.size) ? [stage.size[0], stage.size[1] + wideShift(halves), ...stage.size.slice(2)] : stage.size;
  return { ...stage, _wide: halves, rows, size, devices: copies(stage.devices), ...(Array.isArray(stage.mapChars) ? { mapChars: copies(stage.mapChars) } : {}) };
}

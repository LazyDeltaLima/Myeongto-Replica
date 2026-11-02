// server/sim/content/kits/shared/bounds.js — loop guards for the 自选 kits ported from upstream. Upstream caps a kit's
// subtract loops and counts read from text against the official tables' extremes, for its data plugins (upstream
// shared/plugins/{steps,limits,officialBounds,textNumber}.js). This fork has no data plugins: every number is
// official, so these helpers keep upstream's names and signatures and return the official value unchanged; they only stop
// a broken record from spinning a loop (a zero or sub-tick step, a count of thousands). The import of a ported kit
// points here instead of upstream's plugin files.

import { TICK } from '../../../constants.js';

/** How many times a per-tick subtract loop may run in one call (the same budget as battle.every). */
export const STEP_PER_TICK = 8;

/** The cap of a count no official record comes near (upstream's floor, `max(10 × official max, 64)` with no table). */
export const COUNT_CAP = 64;

/**
 * Step length of a subtract loop read from blackboard `key`: `value` as it is (0 or less still means "off"; an official
 * sub-tick interval such as 0.03 stays), a positive step under a tenth of a tick raised to one tick, `fallback` (else one
 * tick) when `value` is not finite. `key` is kept for upstream's signature.
 * @param {string} key
 * @param {unknown} value
 * @param {unknown} [fallback]
 */
export function stepOf(key, value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    const fb = Number(fallback);
    return Number.isFinite(fb) ? fb : TICK;
  }
  return n > 0 && n < TICK / 10 ? TICK : n;
}

/**
 * Iteration cap of a burst that is not one tick of accumulated time (a skill-end catch-up, one spend): ten times the
 * official count, at least COUNT_CAP.
 * @param {unknown} officialIterations
 */
export function burstLimit(officialIterations) {
  const m = Number(officialIterations);
  return Number.isFinite(m) && m >= 0 ? Math.max(10 * m, COUNT_CAP) : COUNT_CAP;
}

/** The cap of a count read from blackboard `key` (COUNT_CAP; the key is kept for upstream's signature). */
export function bbCap(_key) {
  return COUNT_CAP;
}

/**
 * A finite count capped to [0, max] without flooring (a 2.5 loop still runs three times); `fallback` when not finite.
 * @param {unknown} value
 * @param {number} max
 * @param {number} fallback
 */
export function boundedCount(value, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, n));
}

const CN_DIGIT = Object.freeze({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 });

/**
 * A count read out of description text: the first capture of `re` (digits or one Chinese numeral), else `fallback`,
 * capped to [0, COUNT_CAP]; a capture too long to be finite gives the cap, a non-finite fallback 0. The pattern id is kept
 * for upstream's signature.
 * @param {unknown} text
 * @param {RegExp} re
 * @param {unknown} fallback
 * @param {string} [_patternId]
 */
export function textCount(text, re, fallback, _patternId) {
  const m = re instanceof RegExp ? new RegExp(re.source, re.flags.replace(/g/g, '')).exec(text == null ? '' : String(text)) : null;
  const raw = m && m[1] != null && m[1] !== '' ? m[1] : null;
  let n;
  if (raw == null) {
    n = Number(fallback);
    if (!Number.isFinite(n)) n = 0;
  } else {
    n = Object.prototype.hasOwnProperty.call(CN_DIGIT, raw) ? CN_DIGIT[raw] : Number(raw);
    if (!Number.isFinite(n)) return COUNT_CAP;
  }
  return Math.min(COUNT_CAP, Math.max(0, n));
}

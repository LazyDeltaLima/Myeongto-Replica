// The 卫戍认证 level (LV) of the lobby's 成就统计 card, after upstream 0.3.3 (screens/settle.js there): counted from this
// browser's match records (ui/stats.js) — each settled match's 卫戍认证 (its settlement row's `reward`,
// server/match/results.js) and the 每日防卫目标 bonus of each day that reached it — against the levels of
// config.rewards.milestones (act2autochess milestoneList: the 卫戍认证 earned in all, level by level).
// [ASSUMED·자료 없음: the official game keeps the total on the account; this project has no accounts, so a browser
// counts what it recorded (cleared browser data starts again at LV 0)]

/** @param {unknown} v */
const int = (v) => Math.max(0, Math.round(Number(v) || 0));

/**
 * LV of a 卫戍认证 total against config.rewards.milestones (cumulative `tokens` per `level`): the levels reached (0 before
 * the first), the progress into the next (`into` of `need`), `max` past the last.
 * @param {number} total @param {{ level: number, tokens: number }[]} milestones
 * @returns {{ lv: number, into: number, need: number, max: boolean }}
 */
export function levelOf(total, milestones) {
  const n = int(total);
  let lv = 0;
  let prev = 0;
  for (const m of Array.isArray(milestones) ? milestones : []) {
    if (!Number.isFinite(m?.tokens)) continue;
    if (n < m.tokens) return { lv, into: n - prev, need: m.tokens - prev, max: false };
    lv = Number.isFinite(m.level) ? m.level : lv + 1;
    prev = m.tokens;
  }
  return { lv, into: 0, need: 0, max: true };
}

/** The 每日防卫目标 day of a time: local, turning over at `resetHour` (04:00, config.rewards.daily). @param {number} ts */
export function dayKey(ts, resetHour = 4) {
  const d = new Date(ts - resetHour * 3600000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * The 每日防卫目标 points of a match: the row of the rounds passed in config.rewards.baseByRoundsPassed (its
 * dailyMissionPoint). [ASSUMED·자료 없음: unscaled by difficulty and mode, as the table gives it apart from the scaled
 * reward]
 * @param {number} roundsPassed @param {{ round: number, dailyPoint: number }[]} table
 */
export function dailyPointsFor(roundsPassed, table) {
  const n = Number(roundsPassed) || 0;
  const row = (Array.isArray(table) ? table : []).filter((r) => r && r.round <= n).pop();
  return int(row?.dailyPoint);
}

/**
 * The 卫戍认证 total of the records (any order; a match given up has none): every settled match's `reward`, plus the
 * daily bonus once for each day whose matches reached the daily goal. [ASSUMED·자료 없음: the bonus is 卫戍认证 too, so it
 * counts toward the level; the day is the browser's local one]
 * @param {any[]} records ui/stats.js records (one season's: recordsOfSeason)
 * @param {any} rewards config.rewards
 * @param {(rec: any) => any} selfRowOf ui/stats.js selfRowOf
 * @param {number} [now]
 * @returns {number}
 */
export function certTotal(records, rewards, selfRowOf, now = Date.now()) {
  const daily = rewards?.daily && rewards.daily.need > 0 ? rewards.daily : null;
  const reset = Number.isFinite(daily?.resetHour) ? daily.resetHour : 4;
  const days = new Map();
  let total = 0;
  for (const rec of Array.isArray(records) ? records : []) {
    if (!rec || !Number.isFinite(rec.t) || rec.t > now || rec.end === 'quit') continue;
    const row = selfRowOf(rec);
    total += int(row?.reward);
    if (daily) { const k = dayKey(rec.t, reset); days.set(k, (days.get(k) || 0) + dailyPointsFor(row?.roundsPassed, rewards?.baseByRoundsPassed)); }
  }
  if (daily) for (const pts of days.values()) if (pts >= daily.need) total += int(daily.bonus);
  return total;
}

// server/match/match/common.js — constants and small helpers shared by the Match method modules
// (server/match/match/*.js); server/match/Match.js re-exports FLOW_TICKER_PRIORITY, DELAYS and BAND_TURN_SECONDS.

/**
 * Ticker priority of the remake's match-flow notices (隐秘核心已解锁, 联防阶段, a player out or gone): the official lines
 * (research 06 §9.2) go BOSS_HIT 30 > CHAR_DAMAGE 20 > SHOP_LEVEL 11 > GOLDEN_CHAR 2 > CHAR_GIFT 1; ours sit under the
 * leader-damage lines [ASSUMED].
 */
export const FLOW_TICKER_PRIORITY = 25;
/** Boss clock period (overtime drain, end checks, silence watchdog) in real ms. */
export const BOSS_CLOCK_MS = 250;
export const OK = Object.freeze({ ok: true });
export const fail = (error, detail) => (detail ? { error, detail } : { error });

/** Fixed presentation delays (real ms, × timerScale). */
export const DELAYS = Object.freeze({
  ROUND_START: 2000,
  COMBAT_END: 1500,
  SETTLE: 3000,
  BOT_ACTION: 900,
  BOT_STAGGER: 350,
  PUBLIC_THROTTLE: 100,
});

/**
 * Seconds of one turn of the co-op strategy draft (user playtest #4 item 4: the old 12 s per turn — research 06 §724,
 * itself [ASSUMED] — inside the 50 s step was far too little and counted apart from the header's 50 s; then 30 s,
 * [ASSUMED]). 50 s per turn: upstream's owner played the official co-op draft (report of 2026-10-10, upstream 708caf7d);
 * the official data gives the BAND_CHECK step 50 s, hint 15 s (autoChessData.enterStepList), the client's bar draws that,
 * and the turn deadline itself is the server's. It is also the step's only countdown (m.public.deadline =
 * draft.turnDeadline). × timerScale.
 */
export const BAND_TURN_SECONDS = 50;

/**
 * Seconds of the co-op briefing (INFO_CHECK) before a seat that has not voted counts as ready. The official step is 25 s
 * (autoChessData.enterStepList, gd.timer('infoCheck')); this remake gives 45 s so a team can read the briefing and
 * talk over its 重新抽取 vote (feat, maintainer decision 2026-10-12). A reroll starts a new match, whose briefing counts
 * from 45 again. × timerScale. Solo / a single human: untimed.
 */
export const INFO_CHECK_SECONDS = 45;

/**
 * Seconds of the strategy draft's 编队确认 window (feat, maintainer decision 2026-10-12): once every seat has its strategy,
 * the draft stays up this long so the last picker can still change the 自选 picks (진영별 선발 프리셋, match.setDiy takes
 * them during BAND_DRAFT); every human seat's 准备完毕 (g.draftReady) ends it early. Timed drafts only (a single human's
 * draft goes straight on). × timerScale.
 */
export const DRAFT_CONFIRM_SECONDS = 10;

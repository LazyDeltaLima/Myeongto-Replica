// shared/seasons.js — the 卫戍协议 seasons this server can run (maintainer decision 2026-10-24: a new season runs beside
// the current one, chosen per room, and opens to players only once it is complete).
//
// A season id is the official activity id (activity_table AUTOCHESS_SEASON). The default season's data is data/*.json;
// another season keeps only the files that differ in data/seasons/<id>/ (a file it lacks is the default's —
// server/data.js getData({ season }), the browser through /data/s/<id>/<file>.json). `public: false` = only a server
// that lists it in SP_SEASONS offers it (local / debug). `features` are the season's rule switches; the default season
// has every one off, so a season-aware branch keeps today's behaviour. `name` is the season's own word of the title
// (卫戍协议：<name>, a msgid the page translates) and `mark` its Latin wordmark: the season picker of the title and the
// lobby shows them.
//
// Imported by the server and the browser: no Node APIs.

import { N_ } from './i18n.js';
import { FAST_GRADE, MAX_GRADE } from './constants.js';

/** The season of data/*.json and of every room that names none. */
export const DEFAULT_SEASON = 'act2autochess';

/** Rule switches of a season (all off = the default season's behaviour). */
export const SEASON_FEATURES = Object.freeze({
  /** Watch another player's field while the own battle still runs (today: only once the own battle is over). */
  watchWhileFighting: false,
  /** No side camera (Placeholders/SideBy) while a piece is held or selected: the season's official client has none
   * (docs/rules/ui.md 「기물을 고르고 집을 때의 측면 카메라」); settings → 画面 can still turn it on or off. */
  noSideCamera: false,
  /** The bond strip's phase mark Ⅰ·Ⅱ·Ⅲ over an active bond's disc (the HUD bond item's img_level, bond_level_N): the
   * thresholds reached, on bonds with two or more (docs/rules/ui.md 「규정 HUD 새 요소」). */
  bondPhase: false,
  /** The solo room plays a 规程等级 1–20 or 极速模拟 (room `grade`, shared/constants.js MAX_GRADE) instead of the four
   * difficulties. */
  soloGrades: false,
  /** A battle shows each player's 整备区 operators standing still on the bench row (b.start / m.field `bench`, server
   * Match.battleBench): the season's official battle — the own field and a watched one — draws them; the 盟约 one shows
   * an empty bench (docs/rules/render.md 「규정 전투 중 정비 구역」). */
  benchInBattle: false,
  /** The briefing shows the battlefield (its name and map preview) in every 规则 mode: the season's official stage-info view
   * has a map preview (auto_chess_stage_info_state), so it is no 休闲 convenience there (shared/ruleset.js
   * seasonOfficialOptions; docs/rules/ui.md 「규칙 모드 — 클래식·캐주얼」). */
  stagePreview: false,
  /** A Final Assault / Hidden Core field takes the IN_BATTLE layer gains (flags.layerGainsEnabled), fixed and 临时层数,
   * and they stay after it as a normal battle's (server/match/match/settle.js _battleResultLayers): the season's boss
   * battle stacks them as a normal one does (docs/rules/sim.md 「규정 맹약」); the 盟约 client runs no layer gain outside
   * the own battle. */
  bossLayerGains: false,
  /** A drawn-off core bond takes every operator of it out of the match, whatever add-on bonds it has; an operator of
   * several core bonds goes once all of them are off (a CN player's report of 2026-11-14, maintainer decision the same
   * day; docs/rules/sim.md 「규정 핵심 맹약 금지」). The 盟约 rule: out only once every bond of it is off. */
  coreBondBan: false,
  /** A 悬赏 card's enemy wears the 悬赏 mark over its head while it lives (server snapshot.js unitInfo `bounty` → render
   * fxgame.js bountyMark: map_067_reward_01, a CN-only prefab — the 盟约 client has none; docs/rules/fx.md 「규정 수배 적
   * 머리 위 표식」). */
  bountyMark: false,
  /** The S.W.E.E.P. report's fourth tab 装备报告 (screens/sweep.js EquipTab): the season's official report has it (upstream
   * 377fb09c, BV11NW869ELq part 1 ≈ 33:20); the 盟约 report has three tabs. */
  equipReport: false,
  /** Enemy leaders take 侵蚀 (erosion) damage like any enemy: on the season's official server 克莱门莎's erosion lands on
   * a leader (a CN player's report of 2026-11-15). The 盟约 rule: "最终攻势中，敌方领袖不会受到侵蚀损伤" (server/sim/content/
   * bosses.js install; docs/rules/sim.md 「규정 리더 적의 침식」). */
  leaderTakesErosion: false,
  /** A 联防 helper's operator knocked out at the end of its own combat keeps the rest of its redeploy timer (PRTS
   * 卫戍协议/帮助 §联防阶段 "自卫戍协议：规程·序列Ⅰ起，作战结束时为退场状态的干员在联防阶段将继承剩余再部署时间"; server/match/unite.js);
   * the 盟约 one starts its full redeploy time again (docs/rules/sim.md 「규정 연합 방어 — 남은 재배치 시간」). */
  uniteKeepsRedeploy: false,
  /** A solo match splits the core bonds its mode keeps on into two random halves, and the briefing picks the half that
   * plays (g.bondGroup; the left one until the player picks): the other half is this match's absent core bonds, drawn
   * instead of the core count (server/match/pool.js drawDisabledBonds, match/phases.js pickBondGroup; the season's
   * official briefing, docs/rules/sim.md 「1인 규정 핵심 맹약 두 묶음」). The 盟约 solo draws its absent core bonds. */
  soloBondGroups: false,
});

/**
 * Whether a piece of `bonds` is left out of the match when `off` are the bonds off (drawn + the mode's): every bond off,
 * or — with `coreBan` (the season switch coreBondBan) and at least one core bond (`isCore`) — every core bond off.
 * @param {unknown} bonds @param {Set<string>} off
 * @param {{ coreBan?: boolean, isCore?: ((bondId: string) => boolean) | null }} [opts]
 */
export function bondsOff(bonds, off, { coreBan = false, isCore = null } = {}) {
  if (!Array.isArray(bonds) || !bonds.length || !off?.size) return false;
  if (coreBan && typeof isCore === 'function') {
    const cores = bonds.filter((b) => isCore(b));
    if (cores.length) return cores.every((b) => off.has(b));
  }
  return bonds.every((b) => off.has(b));
}

/**
 * @typedef {Readonly<{ id: string, public: boolean, name: string, mark: string, features: Readonly<Record<string, boolean>> }>} Season
 * @type {Record<string, Season>}
 */
export const SEASONS = {
  // 卫戍协议：盟约 下半 (the tables name both halves 盟约; this server runs the second only, so the page says 盟约)
  act2autochess: Object.freeze({ id: 'act2autochess', public: true, name: N_('盟约'), mark: 'ALLIANCE', features: SEASON_FEATURES }),
  // 卫戍协议：规程 (CN from 2026-11-08): built from its own tables (tools/build-data.mjs --season act3autochess); public
  // from 2.0.0
  act3autochess: Object.freeze({ id: 'act3autochess', public: true, name: N_('规程'), mark: 'REGULATION',
    features: Object.freeze({ ...SEASON_FEATURES, noSideCamera: true, bondPhase: true, soloGrades: true, benchInBattle: true, stagePreview: true, bossLayerGains: true, coreBondBan: true, bountyMark: true, equipReport: true,
      leaderTakesErosion: true, uniteKeepsRedeploy: true, soloBondGroups: true }) }),
};

/**
 * Tests only: register a season (never public unless asked) and return the function that removes it again. A real
 * season is an entry of SEASONS above.
 * @param {string} id
 * @param {{ public?: boolean, name?: string, mark?: string, features?: Partial<typeof SEASON_FEATURES> }} [opts]
 */
export function defineSeason(id, { public: open = false, name = id, mark = String(id).toUpperCase(), features = {} } = {}) {
  if (typeof id !== 'string' || !/^[a-z0-9]+$/.test(id) || Object.hasOwn(SEASONS, id)) throw new Error(`bad or taken season id ${id}`);
  SEASONS[id] = Object.freeze({ id, public: open, name, mark, features: Object.freeze({ ...SEASON_FEATURES, ...features }) });
  return () => { delete SEASONS[id]; };
}

/**
 * The 规程等级 a match's mode plays in a season with `soloGrades` (shared/constants.js MAX_GRADE): `mode_single_<n>` → n,
 * `mode_single_funny` → FAST_GRADE (极速模拟); null for any other mode or season.
 * @param {unknown} modeId @param {unknown} season
 * @returns {number | null}
 */
export function modeGrade(modeId, season) {
  if (!seasonFeature(season, 'soloGrades') || typeof modeId !== 'string') return null;
  if (modeId === 'mode_single_funny') return FAST_GRADE;
  const m = /^mode_single_(\d+)$/.exec(modeId);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= MAX_GRADE ? n : null;
}

/** A season id of the registry. @param {unknown} v */
export const isSeasonId = (v) => typeof v === 'string' && Object.hasOwn(SEASONS, v);

/** The season of a room / match value: a registry id, else the default. @param {unknown} v @returns {string} */
export const seasonOf = (v) => (isSeasonId(v) ? /** @type {string} */ (v) : DEFAULT_SEASON);

/** The registry entry of a season (unknown: the default's). @param {unknown} v @returns {Season} */
export const seasonInfo = (v) => SEASONS[seasonOf(v)];

/**
 * Data directory of a season relative to data/: '' for the default season, else `seasons/<id>`.
 * @param {unknown} id
 */
export const seasonDataDir = (id) => (seasonOf(id) === DEFAULT_SEASON ? '' : `seasons/${seasonOf(id)}`);

/**
 * A season's rule switch (unknown seasons and switches: off).
 * @param {unknown} id
 * @param {keyof typeof SEASON_FEATURES} name
 */
export const seasonFeature = (id, name) => SEASONS[seasonOf(id)].features[name] === true;

/**
 * The season a page opens in for a player who never picked one (maintainer decision 2026-11-13: the newest season): the
 * last public entry of SEASONS (registry order is release order). Static, so the title draws it before the server
 * answers with its list.
 * @returns {string}
 */
export function newestPublicSeason() {
  const open = Object.values(SEASONS).filter((s) => s.public);
  return open.length ? open[open.length - 1].id : DEFAULT_SEASON;
}

/**
 * The seasons a server offers: the public ones plus those its `SP_SEASONS` list (comma-separated ids) names.
 * @param {string | null | undefined} [extra] the SP_SEASONS value
 * @returns {string[]}
 */
export function offeredSeasons(extra) {
  const named = new Set(String(extra ?? '').split(',').map((s) => s.trim()).filter(isSeasonId));
  return Object.values(SEASONS).filter((s) => s.public || named.has(s.id)).map((s) => s.id);
}

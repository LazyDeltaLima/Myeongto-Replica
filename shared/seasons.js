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
  /** No custom 规则 模式 and no 8-player room in this season yet (maintainer decision 2026-11-11: both later, refused until
   * then — server/lobby.js, server/matchmaking.js). */
  noCustomOrLarge: false,
});

/**
 * @typedef {Readonly<{ id: string, public: boolean, name: string, mark: string, features: Readonly<Record<string, boolean>> }>} Season
 * @type {Record<string, Season>}
 */
export const SEASONS = {
  // 卫戍协议：盟约 下半 (the tables name both halves 盟约; this server runs the second only, so the page says 盟约)
  act2autochess: Object.freeze({ id: 'act2autochess', public: true, name: N_('盟约'), mark: 'ALLIANCE', features: SEASON_FEATURES }),
  // 卫戍协议：规程 (CN from 2026-11-08): built from its own tables (tools/build-data.mjs --season act3autochess), not public
  // until every part of it is (SP_SEASONS=act3autochess)
  act3autochess: Object.freeze({ id: 'act3autochess', public: false, name: N_('规程'), mark: 'REGULATION',
    features: Object.freeze({ ...SEASON_FEATURES, noSideCamera: true, bondPhase: true, soloGrades: true, noCustomOrLarge: true }) }),
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
 * The seasons a server offers: the public ones plus those its `SP_SEASONS` list (comma-separated ids) names.
 * @param {string | null | undefined} [extra] the SP_SEASONS value
 * @returns {string[]}
 */
export function offeredSeasons(extra) {
  const named = new Set(String(extra ?? '').split(',').map((s) => s.trim()).filter(isSeasonId));
  return Object.values(SEASONS).filter((s) => s.public || named.has(s.id)).map((s) => s.id);
}

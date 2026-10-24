// shared/seasons.js — the 卫戍协议 seasons this server can run (maintainer decision 2026-10-24: a new season runs beside
// the current one, chosen per room, and opens to players only once it is complete).
//
// A season id is the official activity id (activity_table AUTOCHESS_SEASON). The default season's data is data/*.json;
// another season keeps only the files that differ in data/seasons/<id>/ (a file it lacks is the default's —
// server/data.js getData({ season }), the browser through /data/s/<id>/<file>.json). `public: false` = only a server
// that lists it in SP_SEASONS offers it (local / debug). `features` are the season's rule switches; the default season
// has every one off, so a season-aware branch keeps today's behaviour.
//
// Imported by the server and the browser: no Node APIs.

/** The season of data/*.json and of every room that names none. */
export const DEFAULT_SEASON = 'act2autochess';

/** Rule switches of a season (all off = the default season's behaviour). */
export const SEASON_FEATURES = Object.freeze({
  /** Watch another player's field while the own battle still runs (today: only once the own battle is over). */
  watchWhileFighting: false,
});

/** @type {Record<string, Readonly<{ id: string, public: boolean, features: Readonly<Record<string, boolean>> }>>} */
export const SEASONS = {
  act2autochess: Object.freeze({ id: 'act2autochess', public: true, features: SEASON_FEATURES }),
};

/**
 * Tests only: register a season (never public unless asked) and return the function that removes it again. A real
 * season is an entry of SEASONS above.
 * @param {string} id
 * @param {{ public?: boolean, features?: Partial<typeof SEASON_FEATURES> }} [opts]
 */
export function defineSeason(id, { public: open = false, features = {} } = {}) {
  if (typeof id !== 'string' || !/^[a-z0-9]+$/.test(id) || Object.hasOwn(SEASONS, id)) throw new Error(`bad or taken season id ${id}`);
  SEASONS[id] = Object.freeze({ id, public: open, features: Object.freeze({ ...SEASON_FEATURES, ...features }) });
  return () => { delete SEASONS[id]; };
}

/** A season id of the registry. @param {unknown} v */
export const isSeasonId = (v) => typeof v === 'string' && Object.hasOwn(SEASONS, v);

/** The season of a room / match value: a registry id, else the default. @param {unknown} v @returns {string} */
export const seasonOf = (v) => (isSeasonId(v) ? /** @type {string} */ (v) : DEFAULT_SEASON);

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

// tools/gamedata-url.mjs — where an official zh_CN gamedata file is downloaded from (Kengxxiao/ArknightsGameData).
//
// Files follow the repository's master, except the tables pinned here. master's activity_table lost the 卫戍协议 sections
// with the update of 2026-11-01 (client 2.7.91): `activity.AUTOCHESS_SEASON` is gone and `autoChessData`'s values are
// empty, so a download from master stops tools/build-data.mjs ("has no act2autochess") and leaves tools/build-emotes.mjs
// and tools/build-i18n.mjs without the mode's texts. The pin is the last commit that has them. Only the season's sections
// are read from that table: the operators, skills and levels still come from master.
//
// The enemy tables stay at the same commit: the same update changed 假想敌：铳 (enemy_9017_achunt / _2: unblockable only
// while it charges, weight 8 → 10), which belongs to the next season's battles, and the current season keeps the enemies
// it was played with (maintainer decision 2026-11-06). The operators' changes of that update apply to both seasons
// (maintainer decision 2026-11-08): new modules a golden chess can take, 克莱门莎 S3's projectile life.

const REPO = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData';
const ROOT = 'zh_CN/gamedata/';

/** Repository path under zh_CN/gamedata/ → the commit it is read at. */
export const PINNED_GAMEDATA = Object.freeze({
  'excel/activity_table.json': 'fe7d8d05edc36cf5678a24bfe9e84e891f6cf7ad', // Client 2.7.81, data of 2026-10-22
  'excel/enemy_handbook_table.json': 'fe7d8d05edc36cf5678a24bfe9e84e891f6cf7ad',
  'levels/enemydata/enemy_database.json': 'fe7d8d05edc36cf5678a24bfe9e84e891f6cf7ad',
});

/**
 * The commit of the zh_CN tables the other servers' clients translate (tools/build-i18n.mjs): the last data of 盟约 (the
 * activity pin above). The EN, JP, KR and TW clients ship CN's texts months later, and 规程 rewrote texts under ids it kept
 * (the equipment skills `sktok_acarm*`: 拟态物质 「同盟约」 → 「同阶」), so a current Chinese text paired by id with their
 * translation of the older one would get a translation of another sentence. build-i18n pairs a target text with the
 * Chinese text of this commit, and with the current one only where the two are the same.
 */
export const TRANSLATED_GAMEDATA = PINNED_GAMEDATA['excel/activity_table.json'];

/** The folder URL of the zh_CN tables at TRANSLATED_GAMEDATA. */
export const translatedBase = () => `${REPO}/${TRANSLATED_GAMEDATA}/${ROOT}`;
/** The cache folder of those tables, relative to the repository (tools/i18n/kr-style.mjs reads it too). */
export const TRANSLATED_CACHE = `.cache/gamedata-${TRANSLATED_GAMEDATA.slice(0, 8)}`;

/**
 * A season whose tables Kengxxiao does not carry (its 卫戍协议 sections stay empty after 2026-11-01): every file of it comes
 * from fexli/ArknightsResource's FlatBuffers-decoded dump at one commit, read through tools/gamedata-flat.mjs, into a
 * cache folder of its own (.cache/gamedata-<season>/).
 */
export const SEASON_GAMEDATA = Object.freeze({
  // Client 2.7.91, resources 26-11-06: the first with 卫戍协议：规程
  act3autochess: Object.freeze({ base: 'https://raw.githubusercontent.com/fexli/ArknightsResource/62363543c0fa116f9cef83e291ccdeb006a9a1db/gamedata/', flat: true }),
});

/**
 * The folder URL an official file is downloaded from; the file's own path under zh_CN/gamedata/ is appended to it.
 * @param {string} rel path relative to zh_CN/gamedata/ (e.g. 'excel/activity_table.json')
 * @param {string} [season] a season of SEASON_GAMEDATA reads every file from its own dump
 * @returns {string}
 */
export function gamedataBase(rel, season) {
  if (season && Object.hasOwn(SEASON_GAMEDATA, season)) return SEASON_GAMEDATA[season].base;
  return `${REPO}/${PINNED_GAMEDATA[rel] ?? 'master'}/${ROOT}`;
}

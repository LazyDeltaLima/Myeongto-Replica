// tools/gamedata-url.mjs — where an official zh_CN gamedata file is downloaded from (Kengxxiao/ArknightsGameData).
//
// Files follow the repository's master, except the tables pinned here. master's activity_table lost the 卫戍协议 sections
// with the update of 2026-11-01 (client 2.7.91): `activity.AUTOCHESS_SEASON` is gone and `autoChessData`'s values are
// empty, so a download from master stops tools/build-data.mjs ("has no act2autochess") and leaves tools/build-emotes.mjs
// and tools/build-i18n.mjs without the mode's texts. The pin is the last commit that has them. Only the season's sections
// are read from that table: the operators, skills and levels still come from master.

const REPO = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData';
const ROOT = 'zh_CN/gamedata/';

/** Repository path under zh_CN/gamedata/ → the commit it is read at. */
export const PINNED_GAMEDATA = Object.freeze({
  'excel/activity_table.json': 'fe7d8d05edc36cf5678a24bfe9e84e891f6cf7ad', // Client 2.7.81, data of 2026-10-22
});

/**
 * The folder URL an official file is downloaded from; the file's own path under zh_CN/gamedata/ is appended to it.
 * @param {string} rel path relative to zh_CN/gamedata/ (e.g. 'excel/activity_table.json')
 * @returns {string}
 */
export function gamedataBase(rel) {
  return `${REPO}/${PINNED_GAMEDATA[rel] ?? 'master'}/${ROOT}`;
}

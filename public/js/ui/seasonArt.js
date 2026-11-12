// A 卫戍协议 season's own UI art after 盟约: its hub backdrop and logos, which only the client that has the season
// carries (tools/local-extract/season_ui.py → data/local-assets.json groups `season/<id>/…`). 盟约 keeps the art it
// always drew (entry/* of data/assets.json, ui/allianceScene.js); a season without the extract falls back to that, so
// the page never asks for a file nobody made.
//
// The logo of 规程 carries its Chinese title; a Korean page draws the copy whose title is written over in Korean in the
// official UI face (maintainer decision 2026-11-08), every other language the official picture.
import { data, localAsset } from '../data.js';
import { DEFAULT_SEASON, seasonOf } from '../../../shared/seasons.js';
import { uiUrl } from './assetUrls.js';

/** URL of one of a season's own pictures, or null (盟约, or the season's art not extracted). */
export function seasonArt(season, group, name) {
  const id = seasonOf(season);
  return id === DEFAULT_SEASON ? null : localAsset(`season/${id}/${group}`, name);
}

/** The season's hub backdrop (the event's on-season entry panel, composed), or null. */
export const seasonBackdrop = (season) => seasonArt(season, 'backdrop', 'title');

/**
 * The season's title logo (the hub's root_title), the Korean copy on a Korean page when there is one, or null.
 * @param {unknown} season @param {string} lang
 */
export function seasonLogo(season, lang) {
  return (lang === 'ko' && seasonArt(season, 'logo', 'title_season_ko')) || seasonArt(season, 'logo', 'title_season');
}

/** The season's logo of the result screen (season_logo_settle_game), or null. */
export const seasonSettleLogo = (season) => seasonArt(season, 'logo', 'season_logo_settle_game');

/**
 * The picture and emblem of a season's tab on the title (ui/season.js SeasonTabs; maintainer decision 2026-11-10, tabs
 * of mockup A): 盟约's own entry art — the desert of its hub (`entry/bkg_02`) and its emblem (`entry/season_logo`) — or a
 * later season's extract — its home activity card cut to the picture (`banner/tab`) and its emblem (`logo/season_logo`).
 * null when either is missing (the tabs then stay words).
 * @param {unknown} season
 * @returns {{ bg: string, emblem: string } | null}
 */
export function seasonTabArt(season) {
  const id = seasonOf(season);
  const m = id === DEFAULT_SEASON ? data.getRaw('assets') : null;
  const bg = m ? uiUrl(m, 'entry/bkg_02') : seasonArt(id, 'banner', 'tab');
  const emblem = m ? uiUrl(m, 'entry/season_logo') : seasonArt(id, 'logo', 'season_logo');
  return bg && emblem ? { bg, emblem } : null;
}

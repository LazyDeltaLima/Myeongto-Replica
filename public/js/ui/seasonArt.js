// A 卫戍协议 season's own UI art after 盟约: its hub backdrop and logos, which only the client that has the season
// carries (tools/local-extract/season_ui.py → data/local-assets.json groups `season/<id>/…`). 盟约 keeps the art it
// always drew (entry/* of data/assets.json, ui/allianceScene.js); a season without the extract falls back to that, so
// the page never asks for a file nobody made.
//
// The logo of 规程 carries its Chinese title; a Korean page draws the copy whose title is written over in Korean in the
// official UI face (maintainer decision 2026-11-08), every other language the official picture.
import { data, localAsset } from '../data.js';
import { DEFAULT_SEASON, seasonOf } from '../../../shared/seasons.js';

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
  return seasonLogoSet(season, lang)?.src ?? null;
}

/** Scales of the logo's sharper copies (tools/local-extract/season_ui.py `logo_scales`: `<name>_<k>x`). */
const LOGO_SCALES = [2, 3];

/**
 * The season's title logo with its sharper copies, for an <img>: `src` (the official size), `srcset` (width
 * descriptors, null when there is no copy) and `aspect` (width / height, for the `sizes` the screen derives from its
 * CSS height) — the browser fetches only the copy the screen's size and pixel density need, so a phone keeps a small
 * one. Null as seasonLogo.
 * @param {unknown} season @param {string} lang
 * @returns {{ src: string, srcset: string | null, aspect: number } | null}
 */
export function seasonLogoSet(season, lang) {
  const id = seasonOf(season);
  if (id === DEFAULT_SEASON) return null;
  const group = data.get('local')?.groups?.[`season/${id}/logo`];
  const entry = (name) => {
    const e = group && typeof group === 'object' ? group[name] : null;
    return e && typeof e.path === 'string' && e.path ? e : null;
  };
  const name = lang === 'ko' && entry('title_season_ko') ? 'title_season_ko' : 'title_season';
  const one = entry(name);
  if (!one) return null;
  const w = (e) => (Number.isFinite(e.w) && e.w > 0 ? e.w : 0);
  const tiers = [one, ...LOGO_SCALES.map((k) => entry(`${name}_${k}x`))].filter((e) => e && w(e));
  return {
    src: one.path,
    srcset: tiers.length > 1 && w(one) ? tiers.map((e) => `${e.path} ${w(e)}w`).join(', ') : null,
    aspect: w(one) && one.h > 0 ? w(one) / one.h : 1,
  };
}

/**
 * The `sizes` of a logo <img> whose CSS sets its height: `heights` = [[media condition | '', CSS height], …] in the
 * order of the stylesheet's rules (the last one without a condition), turned into widths by the logo's aspect.
 * @param {number} aspect @param {Array<[string, string]>} heights
 */
export const logoSizes = (aspect, heights) =>
  heights.map(([media, h]) => `${media ? `${media} ` : ''}calc(${h} * ${aspect.toFixed(3)})`).join(', ');

/** The season's logo of the result screen (season_logo_settle_game), or null. */
export const seasonSettleLogo = (season) => seasonArt(season, 'logo', 'season_logo_settle_game');

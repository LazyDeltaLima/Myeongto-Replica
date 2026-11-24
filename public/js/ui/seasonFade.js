// The lobby's season change through the dark (maintainer decisions 2026-11-02, 2026-11-13): a pick on the top bar's
// season chip (ui/season.js SeasonChip) darkens the whole screen (SEASON_FADE.out), makes the pick while it is black,
// waits until the season's files have settled (data.js seasonSettled) and its hub backdrop has decoded, then lights
// up (SEASON_FADE.in). Everything that belongs to a season — the backdrop, the logo and title, the mode list, the
// music, the loadout and statistics — changes once, under the black, and the reload of its files is never seen. The
// latest pick wins; reduced motion picks at once. The veil takes the pointer while it is up (about 0.8 s).
import { pickSeason } from './season.js';
import { seasonBackdrop } from './seasonArt.js';
import { reducedMotion } from './device.js';
import { data } from '../data.js';

/** Down and up, in ms (the title's fade of 2026-11-02, now the lobby's). */
export const SEASON_FADE = Object.freeze({ out: 350, in: 450 });
/** The longest the screen stays black waiting for the season's files and backdrop, in ms. */
export const SEASON_FADE_WAIT = 3000;

let token = 0;
/** @type {HTMLElement | null} */
let veil = null;

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** @returns {Promise<void>} the next frame (16 ms without requestAnimationFrame: Node, tests) */
const frame = () => new Promise((resolve) => (/** @type {typeof requestAnimationFrame | undefined} */ (globalThis.requestAnimationFrame) ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)));

function ensureVeil() {
  if (veil?.isConnected) return veil;
  veil = document.createElement('div');
  veil.className = 'season-veil';
  veil.setAttribute('aria-hidden', 'true');
  Object.assign(veil.style, {
    position: 'fixed', inset: '0', zIndex: '2147483000', background: '#000', opacity: '0', pointerEvents: 'auto',
    transition: `opacity ${SEASON_FADE.out}ms ease-in`,
  });
  document.body.append(veil);
  return veil;
}

/** The new backdrop decoded (or failed), so it is on screen when the veil lifts. @param {string} season */
async function decodeBackdrop(season) {
  const url = seasonBackdrop(season);
  if (!url || typeof Image === 'undefined') return;
  const im = new Image();
  im.src = url;
  await im.decode().catch(() => {});
}

/**
 * Pick a season through the dark (the lobby's chip). Same as pickSeason under reduced motion or without a DOM.
 * @param {string} id
 * @returns {Promise<void>} resolves once the screen is lit again
 */
export async function pickSeasonThroughDark(id) {
  if (typeof document === 'undefined' || reducedMotion()) { pickSeason(id); return; }
  const my = ++token;
  const el = ensureVeil();
  el.style.transition = `opacity ${SEASON_FADE.out}ms ease-in`;
  // the new veil's style is computed at opacity 0 before it changes, or the browser has no start for the transition
  // and the screen goes black at once: a frame alone did not do it (requestAnimationFrame runs before that frame's
  // style pass — seen on a phone, every pick black at once)
  getComputedStyle(el).opacity;
  await frame();
  el.style.opacity = '1';
  await sleep(SEASON_FADE.out);
  if (my !== token) return;
  pickSeason(id); // main.js switches the data (data.setSeason) on this store change
  await Promise.race([
    Promise.all([data.seasonSettled().catch(() => {}), decodeBackdrop(id)]),
    sleep(SEASON_FADE_WAIT),
  ]);
  await frame(); // the screen re-rendered with the new season under the black
  if (my !== token) return;
  el.style.transition = `opacity ${SEASON_FADE.in}ms ease-out`;
  el.style.opacity = '0';
  await sleep(SEASON_FADE.in);
  if (my !== token) return;
  el.remove();
  veil = null;
}

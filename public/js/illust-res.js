// Which copy of a 立绘 (the unit card's operator art, a skin's preview) the page draws: the copy with the long side 1024
// (标准 / 표준) or the copy at the client texture's own size (高清 / 고화질). The player chooses (maintainer decisions
// 2026-11-16, 2026-11-17): the settings' 资源 tab and the pre-download's consent card (resources.js) set it, and a choice
// is saved at once (ILLUST_PREF — the card's 以后再说 keeps it too). Until the player chooses, the device decides: a phone
// the 1024 copy, every other device the original resolution. The local extraction writes both when the texture is larger
// (tools/local-extract/chararts_extract.py save_illust: `<dir>/<name>` and `<dir>/full/<name>`, the entry's `full`); the
// card drew the 1024 copy 1.3–2.4 times enlarged on a desktop, and q85 stays (docs/rules/ui.md 「정비 화면 HUD」,
// docs/rules/render.md 「스킨 모델 소재」).
//
// The resource list marks the two copies (tools/build-browser-resources.mjs: `r: 'lo'` / `r: 'hi'`), and resources.js
// pre-downloads only the chosen one and deletes the other from the cache; a change resyncs it (illustStore). The device's
// default is read from what does not change while the page lives or between visits: the screen (not the viewport, which
// a window or a rotation resizes) and the primary pointer. A phone = a coarse primary pointer and a screen whose short
// side is under PHONE_SHORT_SIDE CSS px (phones are 360–430; the smallest tablet, an iPad mini, 744).
//
//   illustFull()          true: the original-resolution copy; false: the 1024 one (the saved choice, else the device's)
//   setIllustFull(hi)     the player's choice: saved, illustStore updated (resources.js resyncs, ui/skins.js rebuilds)
//   illustStore           { hi } for the screens that draw a 立绘 or show the choice
//   illustEntry(e)        the copy of a manifest entry ({ path, w, h, full? }) the page draws
//   illustListed(f)       whether the pre-download takes a resource list entry (`r`)

import { createStore, loadPref, savePref } from './store.js';

export const PHONE_SHORT_SIDE = 600;

const mq = (/** @type {any} */ win, /** @type {string} */ q) => { try { return !!win.matchMedia?.(q)?.matches; } catch { return false; } };

/**
 * Whether a window's device is a phone (above). No screen or no matchMedia (Node, a test): not a phone.
 * @param {any} [win]
 */
export function phoneScreen(win = globalThis) {
  const s = win?.screen;
  const side = Math.min(Number(s?.width) || 0, Number(s?.height) || 0);
  return side > 0 && side < PHONE_SHORT_SIDE && mq(win, '(pointer: coarse)');
}

/** The pref (`sp.pref.<key>`) of the player's choice: 'hi' | 'lo'; absent until the player chooses. */
export const ILLUST_PREF = 'illustRes';

/** The saved choice (true: 'hi', false: 'lo'), null when there is none. */
export function savedIllust() {
  const v = loadPref(ILLUST_PREF, null);
  return v === 'hi' ? true : v === 'lo' ? false : null;
}

/** The device's default when the player has not chosen: the original resolution but on a phone. */
export const deviceIllustFull = (win = globalThis) => !phoneScreen(win);

export const illustStore = createStore({ hi: savedIllust() ?? deviceIllustFull() });

/** The copy the page draws now: the player's choice, else the device's. */
export const illustFull = () => illustStore.get().hi;

/**
 * The player's choice (the resource tab, the consent card): saved at once; the subscribers of illustStore follow
 * (resources.js downloads the chosen copies and deletes the others, ui/skins.js rebuilds the catalogue).
 * @param {boolean} hi
 */
export function setIllustFull(hi) {
  const v = !!hi;
  savePref(ILLUST_PREF, v ? 'hi' : 'lo');
  if (illustStore.get().hi !== v) illustStore.set({ hi: v });
}

const isEntry = (/** @type {any} */ e) => !!e && typeof e === 'object' && typeof e.path === 'string' && e.path !== '';

/**
 * The copy of a 立绘 entry the page draws: its `full` copy where the original resolution is chosen and the entry has
 * one, else the entry itself (a texture no larger than 1024 has one copy). Null for no entry.
 * @param {any} e @param {boolean} [hi]
 */
export function illustEntry(e, hi = illustFull()) {
  if (!isEntry(e)) return null;
  return hi && isEntry(e.full) ? e.full : e;
}

/**
 * Whether the pre-download takes a list entry: a file of a pair (`r`) only when it is the chosen copy.
 * @param {{ r?: string }} f @param {boolean} [hi]
 */
export const illustListed = (f, hi = illustFull()) => f?.r !== (hi ? 'lo' : 'hi');

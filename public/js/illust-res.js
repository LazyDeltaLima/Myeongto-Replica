// Which copy of a 立绘 (the unit card's operator art, a skin's preview) this device takes (maintainer decision 2026-11-16):
// a phone the copy with the long side 1024, every other device the copy at the client texture's own size. The local
// extraction writes both when the texture is larger (tools/local-extract/chararts_extract.py save_illust: `<dir>/<name>`
// and `<dir>/full/<name>`, the entry's `full`); the card drew the 1024 copy 1.3–2.4 times enlarged on a desktop, and q85
// stays (docs/rules/ui.md 「정비 화면 HUD」, docs/rules/render.md 「스킨 모델 소재」).
//
// The resource list marks the two copies (tools/build-browser-resources.mjs: `r: 'lo'` / `r: 'hi'`), and resources.js
// pre-downloads only this device's and deletes the other from the cache — so the choice is made from what does not
// change while the page lives or between visits: the screen (not the viewport, which a window or a rotation resizes)
// and the primary pointer. A phone = a coarse primary pointer and a screen whose short side is under PHONE_SHORT_SIDE
// CSS px (phones are 360–430; the smallest tablet, an iPad mini, 744).
//
//   illustFull()          true: the original-resolution copy (desktop, tablet); false: the 1024 one (phone)
//   illustEntry(e)        the copy of a manifest entry ({ path, w, h, full? }) this device draws
//   illustListed(f)       whether the pre-download takes a resource list entry (`r`)

export const PHONE_SHORT_SIDE = 600;

const mq = (win, q) => { try { return !!win.matchMedia?.(q)?.matches; } catch { return false; } };

/**
 * Whether a window's device is a phone (above). No screen or no matchMedia (Node, a test): not a phone.
 * @param {any} [win]
 */
export function phoneScreen(win = globalThis) {
  const s = win?.screen;
  const side = Math.min(Number(s?.width) || 0, Number(s?.height) || 0);
  return side > 0 && side < PHONE_SHORT_SIDE && mq(win, '(pointer: coarse)');
}

let full = null;
/** This device's choice, read once per page. */
export const illustFull = () => (full ??= !phoneScreen());

const isEntry = (e) => !!e && typeof e === 'object' && typeof e.path === 'string' && e.path !== '';

/**
 * The copy of a 立绘 entry this device draws: its `full` copy where the device takes the original resolution and the
 * entry has one, else the entry itself (a texture no larger than 1024 has one copy). Null for no entry.
 * @param {any} e @param {boolean} [hi]
 */
export function illustEntry(e, hi = illustFull()) {
  if (!isEntry(e)) return null;
  return hi && isEntry(e.full) ? e.full : e;
}

/**
 * Whether the pre-download takes a list entry: a file of a pair (`r`) only when it is this device's copy.
 * @param {{ r?: string }} f @param {boolean} [hi]
 */
export const illustListed = (f, hi = illustFull()) => f?.r !== (hi ? 'lo' : 'hi');

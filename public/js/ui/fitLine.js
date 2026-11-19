// Unity's bestFit on one line, for a Text the official prefab marks bestFit: the font shrinks until the line fits its box.
// Two users: the briefing's text_tips (screens/briefing.js: not under 9 px, then it wraps — `is-wrap`) and the 自选编队
// card's name (ui/diyCard.js, txt_char_name bestFit 1–18: down to 6 px, never wrapped or cut). Measured after each
// render, on resize and once the page's fonts are in; the box's own CSS size is the start every time.

import { useLayoutEffect } from '../../vendor/hooks.module.js';

/**
 * Fit `el`'s one line to its box now.
 * @param {HTMLElement} el
 * @param {{ min?: number, wrap?: boolean, step?: number }} [opts] `min` px; `wrap`: add `is-wrap` when even `min` overflows
 */
export function fitLine(el, { min = 9, wrap = true, step = 0.25 } = {}) {
  if (!el || typeof getComputedStyle !== 'function') return;
  if (wrap) el.classList.remove('is-wrap');
  el.style.fontSize = '';
  const cs = getComputedStyle(el);
  let fs = parseFloat(cs.fontSize) || 12;
  const room = () => el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const need = () => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; };
  for (let n = 0; n < 200 && need() > room() + 0.5 && fs > min; n++) { fs = Math.max(min, fs - step); el.style.fontSize = `${fs}px`; }
  if (wrap && need() > room() + 0.5) el.classList.add('is-wrap');
}

/**
 * fitLine on `ref.current` after every render whose `dep` changed, and on resize.
 * @param {{ current: HTMLElement|null }} ref
 * @param {any} dep
 * @param {{ min?: number, wrap?: boolean, step?: number }} [opts]
 */
export function useFitLine(ref, dep, opts) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof getComputedStyle !== 'function') return undefined;
    let live = true;
    const fit = () => { if (live) fitLine(el, opts); };
    fit();
    // a web font that arrives later draws the line at another width
    document.fonts?.ready?.then(fit, () => {});
    addEventListener('resize', fit);
    return () => { live = false; removeEventListener('resize', fit); };
  }, [dep]);
}

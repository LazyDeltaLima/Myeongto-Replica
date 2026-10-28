// render/auto-quality.js — settings → 画面 「画面质量」 「自动」 (maintainer decision 2026-10-28): the field view
// (render/app.js adaptLoad) starts at the 'high' preset and steps to the whole 'medium' preset (render resolution, the
// 3D board resolution, the effects' medium path) while the adaptive load level stays at 3, then back to 'high' after a
// long calm spell. A phone that heats up over a long match runs everything slower (docs/rules/render.md 「자동 화면
// 품질」); the step trades a little sharpness for less GPU work. The level in effect is kept for the page's lifetime,
// so the next match starts where the last one ended, and the settings row shows it (「当前：中」).

export const AUTO_LEVELS = Object.freeze(['high', 'medium']);
/**
 * Seconds of load level 3 before stepping down; seconds of load level 0 before stepping up, doubled by every step
 * down after the first (a device that heats again soon waits longer: each step re-allocates the canvases, a visible
 * hitch), at most `upMax`.
 */
export const AUTO_STEP = Object.freeze({ downAfter: 20, upAfter: 120, upMax: 600 });

let level = 'high';
let downs = 0;
const listeners = new Set();

/** The preset 「自动」 has in effect ('high' | 'medium'). */
export const autoQuality = () => level;

/** A chosen quality as the reports print it: 「自动」 with the preset in effect ('auto:medium'). */
export const qualityInEffect = (q) => (q === 'auto' ? `auto:${level}` : q);

/** Listen for steps; returns the unsubscribe. */
export function onAutoQuality(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function setLevel(q) {
  if (q === level) return;
  level = q;
  for (const fn of listeners) { try { fn(level); } catch { /* ignore */ } }
}

/**
 * One field view's stepper: called each counted frame with its length (s) and the view's load level 0–3; steps the
 * shared level (listeners told) and returns true when it moved.
 */
export function autoQualityStepper() {
  let heavy = 0, calm = 0;
  return (dt, loadLevel) => {
    heavy = loadLevel >= 3 ? heavy + dt : 0;
    calm = loadLevel === 0 ? calm + dt : 0;
    if (level === 'high' && heavy > AUTO_STEP.downAfter) {
      heavy = 0; downs++;
      setLevel('medium');
      return true;
    }
    if (level === 'medium' && calm > Math.min(AUTO_STEP.upMax, AUTO_STEP.upAfter * 2 ** Math.max(0, downs - 1))) {
      calm = 0;
      setLevel('high');
      return true;
    }
    return false;
  };
}

/** Tests: back to the page's first state. */
export function resetAutoQuality() { level = 'high'; downs = 0; listeners.clear(); }

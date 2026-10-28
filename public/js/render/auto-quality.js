// render/auto-quality.js — settings → 画面 「画面质量」 「自动」 (maintainer decision 2026-10-28): the field view
// (render/app.js adaptLoad) starts at the 'high' preset and steps to the whole 'medium' preset (render resolution, the
// 3D board resolution, the effects' medium path) while the adaptive load level stays at 3, then back to 'high' after a
// long calm spell. A phone that heats up over a long match runs everything slower (docs/rules/render.md 「자동 화면
// 품질」); the step trades a little sharpness for less GPU work. The level in effect is kept for the page's lifetime,
// so the next match starts where the last one ended, and the settings row shows it (「当前：中」).

export const AUTO_LEVELS = Object.freeze(['high', 'medium']);
/**
 * Seconds of load level 3 before stepping down; seconds of calm before stepping up, doubled by every step down after
 * the first (a device that heats again soon waits longer: each step re-allocates the canvases, a visible hitch), at
 * most `upMax`. A calm frame proves headroom under load (autoQualityStepper): a crowded field at load level 0 whose
 * mean frame interval is under `calmFrameMs` (~57 fps) and whose mean field frame JS is at most `calmJsMs` (half the
 * 60 Hz budget — a phone that heats up runs the same JS several times slower, so a fast frame rate alone at 'medium'
 * does not say 'high' would hold).
 */
export const AUTO_STEP = Object.freeze({ downAfter: 20, upAfter: 120, upMax: 600, calmFrameMs: 17.6, calmJsMs: 8 });

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
 * One field view's stepper: called each counted frame with its length (s), the view's load level 0–3, whether the
 * field is crowded (`busy`: more than 8 unit views, render/app.js adaptLoad) and the moving means of the frame interval
 * and the field frame JS (ms); steps the shared level (listeners told) and returns true when it moved. A field with few
 * units says nothing about headroom (its load level drops to 0 even on slow frames — a match's opening rounds on a
 * phone still hot from the last one), so the calm count holds there; a crowded frame that is not calm restarts it.
 */
export function autoQualityStepper() {
  let heavy = 0, calm = 0;
  return (dt, loadLevel, busy = true, frameMs = 0, jsMs = 0) => {
    heavy = loadLevel >= 3 ? heavy + dt : 0;
    if (busy) calm = loadLevel === 0 && frameMs < AUTO_STEP.calmFrameMs && jsMs <= AUTO_STEP.calmJsMs ? calm + dt : 0;
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

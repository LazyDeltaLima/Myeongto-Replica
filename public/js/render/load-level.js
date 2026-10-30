// render/load-level.js — the field view's adaptive load level 0–3 (render/app.js adaptLoad: a device that cannot hold
// the frame rate with the current work switches crowds to impostors earlier and animates small / far units at a lower
// rate, render/units.js; render/fxgame.js plays 'high' as 'medium' at level 2 and leaves normal attacks to the procedural
// FX at level 3). docs/rules/render.md 「적응 부하 단계」.
//
// 2026-10-30 (maintainer report: Firefox, a 160 Hz monitor, a co-op boss fight): the level used to follow the view's
// moving mean of the last ~10 frames — 0.06 s at 160 Hz — so a handful of long frames counted as a slow second and,
// worse, reset the calm spell a step down needs (18 s at level 3): the level climbed 0 → 3 in the battle's first busy
// seconds and stayed there at 86–108 fps, to the result screen. The means are now over time (meanOf: frames forgotten
// with a time constant in seconds, the same at 60 and 160 Hz), and each step up waits longer than the last. And a slow
// spell counts only while the view's own frame work (its JS and the PIXI draw) is a fair share of the frame: the level
// cuts that work only, so frames slowed by something else (the next re-measure: 26–43 ms frames with 2.8–3.7 ms of
// field JS after the boss fight, the browser's garbage collection [추정·화면]) cost the official effects and the
// smoothness for nothing.

/**
 * Seconds and thresholds: a step up after the ~1 s mean interval (`upTau`) stays over `slowMs` (~51 fps) on a crowded
 * field, with the ~1 s mean of the view's frame work at least `workShare` of it, for `upAfter[level]` s; a step down
 * after the ~2 s mean (`downTau`) stays under `fastMs` (~57 fps) for `downAfter × level` s, or `quietAfter` s on a field
 * with few units.
 */
export const LOAD_STEP = Object.freeze({ slowMs: 19.5, fastMs: 17.6, upTau: 1, downTau: 2, upAfter: Object.freeze([1, 2, 3]), downAfter: 6, quietAfter: 2, workShare: 0.4 });

/**
 * A frame-weighted mean of a per-frame value whose frames are forgotten with the time constant `tau` (s): each frame
 * adds one frame and its value, both decayed by e^(−dt/tau) — the mean over roughly the last `tau` s.
 */
export function meanOf(tau) {
  let n = 0, v = 0;
  return (dt, x) => {
    const k = Math.exp(-dt / tau);
    n = n * k + 1;
    v = v * k + x;
    return v / n;
  };
}

/** The mean frame interval (ms) of roughly the last `tau` s (meanOf of the intervals: a long frame counted once). */
export function meanWindow(tau) {
  const m = meanOf(tau);
  return (dt) => m(dt, dt * 1000);
}

/**
 * One view's stepper: `step(dt, busy, workMs)` each counted frame (its interval in s; render/app.js leaves out hidden
 * pages and frames over 0.25 s) → the new level when it moved, else null. `busy`: more than 8 unit views (a field with
 * few units never steps up). `workMs`: the view's own work of a frame (field JS + PIXI draw; omitted = the whole frame).
 * `upMs` / `downMs` / `workMs`: the means after the last frame; `worst`: the longest frame (s) of the slow spell under
 * way (the perf report's `lod steps`).
 */
export function loadLevelStepper() {
  const up = meanWindow(LOAD_STEP.upTau), down = meanWindow(LOAD_STEP.downTau), work = meanOf(LOAD_STEP.upTau);
  const s = { level: 0, upMs: 0, downMs: 0, workMs: 0, worst: 0, step };
  let slowFor = 0, fastFor = 0;
  function step(dt, busy, workMs = dt * 1000) {
    s.upMs = up(dt);
    s.downMs = down(dt);
    s.workMs = work(dt, workMs);
    const slow = s.upMs > LOAD_STEP.slowMs && busy;
    if (slow && s.workMs >= LOAD_STEP.workShare * s.upMs) { slowFor += dt; fastFor = 0; if (dt > s.worst) s.worst = dt; }
    else if (slow) { slowFor = 0; fastFor = 0; s.worst = 0; }   // slow, but not from this view's work: a step would not help
    else if (s.downMs < LOAD_STEP.fastMs) { fastFor += dt; slowFor = 0; s.worst = 0; }
    let to = s.level;
    if (s.level < 3 && slowFor > LOAD_STEP.upAfter[s.level]) to = s.level + 1;
    else if (s.level > 0 && (fastFor > LOAD_STEP.downAfter * s.level || (!busy && fastFor > LOAD_STEP.quietAfter))) to = s.level - 1;
    if (to === s.level) return null;
    s.level = to;
    slowFor = 0; fastFor = 0; s.worst = 0;
    return to;
  }
  return s;
}

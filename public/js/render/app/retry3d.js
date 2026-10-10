// public/js/render/app/retry3d.js — when the field view tries (again) to bring up the 3D board (render/app.js).
//
// Every way the 3D board can fail to come up goes through one schedule: the GPU check at mount, a failed load of
// three.js or the board art, and a lost WebGL context (phones drop it in the background, under memory pressure, or
// when the GPU process restarts). Tries follow `delays`; a try that would fire while the page is hidden waits for it
// to be shown (a context made while hidden is the first one dropped, and frames — which notice a loss — do not run).
// After the last delay the schedule stops until `wake()` (the page shown again: render/app.js visibilitychange), which
// starts the delays over — a phone that comes back from another app gets its 3D board back instead of a 2D board for
// the rest of the match.
//
//   const r = createRetry3d({ delays, hidden })
//   r.schedule(fn)   the next try of fn after the next delay; false when the delays are used up (until wake)
//   r.wake()         the page is shown: a waiting try runs after the first delay, a used-up schedule starts over —
//                    true when it did
//   r.reset()        the board came up and stayed up: the next failure starts the delays over
//   r.cancel()       drop the pending try (view destroyed, the 2D board chosen)
//   r.state()        { pending, waiting, tries, spent }

/**
 * @param {{ delays: number[], hidden?: () => boolean, timers?: { set: (fn: () => void, ms: number) => any, clear: (t: any) => void } }} o
 */
export function createRetry3d({ delays, hidden = () => false, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) } }) {
  let timer = null;
  let tries = 0;
  let fn = null;        // the try to run
  let waiting = false;  // a try came due while hidden
  let spent = false;    // the delays are used up

  const fire = () => {
    timer = null;
    if (hidden()) { waiting = true; return; }
    const f = fn;
    f?.();
  };
  return {
    schedule(next) {
      fn = next;
      if (timer != null) timers.clear(timer);
      timer = null;
      waiting = false;
      if (tries >= delays.length) { spent = true; return false; }
      timer = timers.set(fire, delays[tries++]);
      return true;
    },
    wake() {
      if (!fn || timer != null) return false;
      // a moment after being shown, not at once: the GPU of a phone back from another app may still be restarting
      if (waiting) { waiting = false; timer = timers.set(fire, delays[0]); return true; }
      if (!spent) return false;
      spent = false;
      tries = 0;
      timer = timers.set(fire, delays[tries++]);
      return true;
    },
    reset() { tries = 0; spent = false; },
    cancel() {
      if (timer != null) timers.clear(timer);
      timer = null; fn = null; waiting = false; spent = false;
    },
    state() { return { pending: timer != null, waiting, tries, spent }; },
  };
}

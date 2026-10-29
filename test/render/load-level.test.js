// test/render/load-level.test.js — the adaptive load level's judgement (public/js/render/load-level.js): means over time
// the same at 60 and 160 Hz, longer waits for each step up, a calm spell that a few long frames do not reset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_STEP, loadLevelStepper, meanWindow } from '../../public/js/render/load-level.js';

/** Feed `secs` of frames from `pattern` (frame intervals in ms, repeated); returns the steps { t, to } and the stepper. */
function run(st, secs, pattern, busy = true, t0 = 0) {
  const steps = [];
  let t = 0, i = 0;
  while (t < secs) {
    const dt = pattern[i++ % pattern.length] / 1000;
    t += dt;
    const to = st.step(dt, busy);
    if (to != null) steps.push({ t: t0 + t, to });
  }
  return steps;
}
/** One second at `fps` with `long` frames of `longMs` among them. */
const second = (fps, long = 0, longMs = 50) => {
  const rest = (1000 - long * longMs) / (fps - long);
  const out = [];
  for (let i = 0; i < fps; i++) out.push(long && i % Math.floor(fps / long) === 0 && out.filter((x) => x === longMs).length < long ? longMs : rest);
  return out;
};

test('the mean interval forgets over time, not over frames, and counts a long frame once', () => {
  const m60 = meanWindow(1), m160 = meanWindow(1);
  let a = 0, b = 0;
  for (let i = 0; i < 600; i++) a = m60(1 / 60);
  for (let i = 0; i < 1600; i++) b = m160(1 / 160);
  assert.ok(Math.abs(a - 1000 / 60) < 1e-6 && Math.abs(b - 1000 / 160) < 1e-6);
  // one 100 ms frame at 160 Hz: a 10-frame moving mean jumped to ~15.6 ms; this one to ~6.8 ms
  assert.ok(m160(0.1) < 7.5);
});

test('a phone that stays slow steps up one level after 1 s, the next after 2 s, the last after 3 s', () => {
  const st = loadLevelStepper();
  const steps = run(st, 12, [33.3]);
  assert.deepEqual(steps.map((s) => s.to), [1, 2, 3]);
  const [a, b, c] = steps.map((s) => s.t);
  assert.ok(a > LOAD_STEP.upAfter[0] && a < 2, `first step ${a}`);
  assert.ok(b - a > LOAD_STEP.upAfter[1] && b - a < 2.2, `second step ${b - a}`);
  assert.ok(c - b > LOAD_STEP.upAfter[2] && c - b < 3.2, `third step ${c - b}`);
});

test('a 160 Hz frame rate of 86–108 fps with 3 long frames a second stays at level 0 (it climbed to 3 before)', () => {
  const st = loadLevelStepper();
  const pattern = [...second(108, 3, 50), ...second(86, 3, 60)];
  assert.deepEqual(run(st, 60, pattern), []);
  assert.equal(st.level, 0);
});

test('the battle\'s first busy seconds (3 s at ~28 fps) raise one level, and it steps back once calm', () => {
  const st = loadLevelStepper();
  assert.deepEqual(run(st, 5, second(150)), []);   // the prep before it, at 150 fps
  const burst = run(st, 3, [36]);
  assert.deepEqual(burst.map((s) => s.to), [1]);
  const calm = run(st, 20, second(110, 2, 50), true, 3);
  assert.deepEqual(calm.map((s) => s.to), [0]);
  assert.ok(calm[0].t < 3 + 10, `back at ${calm[0].t}`);
});

test('level 3 on a device that recovers to ~86 fps with long frames steps back to 0 (the calm spell is not reset)', () => {
  const st = loadLevelStepper();
  run(st, 12, [33.3]);
  assert.equal(st.level, 3);
  const back = run(st, 45, second(86, 3, 50));
  assert.deepEqual(back.map((s) => s.to), [2, 1, 0]);
});

test('a field with few units never steps up and steps down after a short calm', () => {
  const st = loadLevelStepper();
  assert.deepEqual(run(st, 10, [40], false), []);
  run(st, 12, [33.3]);
  assert.equal(st.level, 3);
  const quiet = run(st, 6, [10], false);
  assert.equal(quiet[0]?.to, 2);
  assert.ok(quiet[0].t > LOAD_STEP.quietAfter);
});

test('worst: the longest frame of the slow spell under way, cleared by a step and by calm', () => {
  const st = loadLevelStepper();
  run(st, 0.8, [25, 25, 70, 25]);
  assert.ok(Math.abs(st.worst - 0.07) < 1e-9);
  run(st, 2, [33.3]);
  assert.ok(st.worst < 0.07);
  run(st, 3, [10]);
  assert.equal(st.worst, 0);
});

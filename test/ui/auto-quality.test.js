// Settings → 画面 「画面质量」 「自动」 (maintainer decision 2026-10-28; docs/rules/render.md 「자동 화면 품질」): the field view
// steps from 'high' to the whole 'medium' preset while the adaptive load level stays at 3 and back after a long calm
// spell (render/auto-quality.js); a touch-only device defaults to it and a saved 「高」 moves to it once (ui/settings.js).

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { autoQuality, autoQualityStepper, onAutoQuality, qualityInEffect, resetAutoQuality, AUTO_STEP } from '../../public/js/render/auto-quality.js';
import { sanitizeSettings } from '../../public/js/ui/gameLogic.js';

beforeEach(() => resetAutoQuality());

/** Feed `step` `secs` seconds of frames at load level `lod` (60 fps); returns the levels it stepped to. */
function run(step, secs, lod) {
  const seen = [];
  for (let t = 0; t < secs; t += 1 / 60) if (step(1 / 60, lod)) seen.push(autoQuality());
  return seen;
}

test('load level 3 held for 20 s steps to medium; 1–2 or a break resets the count', () => {
  const step = autoQualityStepper();
  const told = [];
  onAutoQuality((q) => told.push(q));
  assert.deepEqual(run(step, AUTO_STEP.downAfter - 1, 3), []);
  run(step, 0.1, 2);
  assert.deepEqual(run(step, AUTO_STEP.downAfter - 1, 3), [], 'a spell at load level 2 restarts the count');
  assert.deepEqual(run(step, 2, 3), ['medium']);
  assert.deepEqual(told, ['medium'], 'listeners hear the step');
  assert.deepEqual(run(step, 60, 3), [], 'medium is the lowest preset 「自动」 takes');
});

test('back to high after 120 s at load level 0, longer each time it has to step down again', () => {
  const step = autoQualityStepper();
  run(step, 21, 3);
  assert.equal(autoQuality(), 'medium');
  assert.deepEqual(run(step, 100, 0), []);
  run(step, 1, 1);
  assert.deepEqual(run(step, 119, 0), [], 'load level 1 restarts the calm count');
  assert.deepEqual(run(step, 2, 0), ['high']);
  run(step, 21, 3);
  assert.deepEqual(run(step, 200, 0), [], 'the second climb waits 240 s');
  assert.deepEqual(run(step, 41, 0), ['high']);
  for (let i = 0; i < 4; i++) { run(step, 21, 3); run(step, AUTO_STEP.upMax + 1, 0); }
  run(step, 21, 3);
  assert.deepEqual(run(step, AUTO_STEP.upMax + 1, 0), ['high'], `never more than ${AUTO_STEP.upMax} s`);
});

test('the level is shared by the page: a new field view starts where the last one ended', () => {
  run(autoQualityStepper(), 21, 3);
  const next = autoQualityStepper();
  assert.equal(autoQuality(), 'medium');
  assert.deepEqual(run(next, 121, 0), ['high']);
});

test('reports print 「自动」 with the preset in effect', () => {
  assert.equal(qualityInEffect('auto'), 'auto:high');
  run(autoQualityStepper(), 21, 3);
  assert.equal(qualityInEffect('auto'), 'auto:medium');
  assert.equal(qualityInEffect('low'), 'low');
  assert.equal(sanitizeSettings({ quality: 'auto' }).quality, 'auto');
  assert.equal(sanitizeSettings({ quality: 'ultra' }).quality, 'high');
});

// ---- the saved settings at load (ui/settings.js initialSettings) ---------------------------------------------------

let n = 0;
/** Load ui/settings.js afresh on a device (`touch`: coarse pointer, no fine one) with `saved` in localStorage. */
async function boot(touch, saved) {
  const mem = new Map(Object.entries(saved).map(([k, v]) => [`sp.pref.${k}`, JSON.stringify(v)]));
  const was = { localStorage: globalThis.localStorage, matchMedia: globalThis.matchMedia };
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  globalThis.matchMedia = (q) => ({ matches: touch ? /coarse/.test(q) : /fine|hover/.test(q), addEventListener() {}, removeEventListener() {} });
  try {
    const m = await import(`../../public/js/ui/settings.js?boot=${++n}`);
    return { quality: m.settingsStore.get().quality, moved: mem.get('sp.pref.qualityAuto') ?? null };
  } finally {
    Object.assign(globalThis, was);
  }
}

test('a touch-only device starts at 「自动」 and a saved 「高」 moves there once', async () => {
  assert.deepEqual(await boot(true, {}), { quality: 'auto', moved: 'true' }, 'nothing saved yet');
  assert.deepEqual(await boot(true, { settings: { quality: 'high', bgm: 0.3 } }), { quality: 'auto', moved: 'true' }, 'the old default');
  assert.deepEqual(await boot(true, { settings: { quality: 'medium' } }), { quality: 'medium', moved: 'true' }, 'a lower choice stays');
  assert.deepEqual(await boot(true, { settings: { quality: 'high' }, qualityAuto: true }), { quality: 'high', moved: 'true' },
    '「高」 picked after the move stays');
  assert.deepEqual(await boot(false, { settings: { quality: 'high' } }), { quality: 'high', moved: null }, 'a computer keeps 「高」');
  assert.deepEqual(await boot(false, {}), { quality: 'high', moved: null });
});

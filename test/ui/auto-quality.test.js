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

/** Feed `secs` seconds at load level 0 of a field (`busy`: more than 8 unit views) with these mean frame / JS times. */
function runFrames(step, secs, busy, frameMs, jsMs) {
  const seen = [];
  for (let t = 0; t < secs; t += 1 / 60) if (step(1 / 60, 0, busy, frameMs, jsMs)) seen.push(autoQuality());
  return seen;
}

test('the climb counts only crowded frames that are fast and light; a few-unit field holds the count', () => {
  const step = autoQualityStepper();
  run(step, 21, 3);
  assert.equal(autoQuality(), 'medium');
  // a phone still hot from the last match: the next one's opening rounds (≤ 8 units) at 54–55 fps
  assert.deepEqual(runFrames(step, 300, false, 18.3, 3), [], 'a few-unit field never climbs');
  // a crowded field at 59 fps but with the frame JS swollen by heat
  assert.deepEqual(runFrames(step, 300, true, 16.9, 10), [], 'heavy JS is not calm');
  // a crowded field at 51–57 fps: load level 0 yet not fast
  assert.deepEqual(runFrames(step, 300, true, 18.5, 3), [], 'a frame rate under ~57 fps is not calm');
  assert.deepEqual(runFrames(step, 100, true, 16.9, 3), []);
  assert.deepEqual(runFrames(step, 60, false, 25, 12), [], 'a few-unit spell holds the count …');
  assert.deepEqual(runFrames(step, 21, true, 16.9, 3), ['high'], '… and the crowded calm before it still counts');
  run(step, 21, 3);
  assert.deepEqual(runFrames(step, 200, true, 16.9, 3), []);
  runFrames(step, 1, true, 19, 3);
  assert.deepEqual(runFrames(step, 239, true, 16.9, 3), [], 'a slow crowded frame restarts the 240 s count');
  assert.deepEqual(runFrames(step, 2, true, 16.9, 3), ['high']);
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

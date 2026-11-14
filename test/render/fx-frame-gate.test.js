// test/render/fx-frame-gate.test.js — load level 3 steps and draws the effect layer every second frame on the time of the
// frames it held (2026-11-14, docs/rules/render.md 「적응 부하 단계」 「단계 3 = 이펙트 층 격프레임」): every effect stays,
// its motion runs at half the display rate. fxFrameGate decides; update() keeps the battle clock on every frame (the
// events between two drawn frames keep their own tick) and a dry layer keeps every step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fxFrameGate } from '../../public/js/render/fxgame.js';

const cam = (version) => ({ version });
const vp = { width: 844, height: 390 };
const close = (a, b) => a != null && Math.abs(a - b) < 1e-12;

test('below level 3 every frame steps by its own time', () => {
  const g = fxFrameGate();
  for (const lv of [0, 1, 2, 0]) assert.equal(g(0.016, lv, cam(1), vp), 0.016);
});

test('level 3: every second frame, on the summed time of both', () => {
  const g = fxFrameGate();
  assert.equal(g(0.016, 0, cam(1), vp), 0.016);
  const out = [0.016, 0.017, 0.015, 0.02, 0.016, 0.016].map((dt) => g(dt, 3, cam(1), vp));
  assert.equal(out[0], null);
  assert.ok(close(out[1], 0.033), String(out[1]));
  assert.equal(out[2], null);
  assert.ok(close(out[3], 0.035), String(out[3]));
  assert.equal(out[4], null);
  assert.ok(close(out[5], 0.032), String(out[5]));
  // no time lost or added: the stepped seconds are the frames' seconds
  const sum = out.reduce((a, b) => a + (b || 0), 0);
  assert.ok(close(sum, 0.1), String(sum));
});

test('level 3: the camera or the viewport changing draws at once, with the held time', () => {
  const g = fxFrameGate();
  g(0.016, 3, cam(1), vp);   // drawn (first frame: nothing to compare)
  assert.equal(g(0.016, 3, cam(1), vp), null);
  assert.ok(close(g(0.016, 3, cam(2), vp), 0.032), 'a pan / zoom (Camera.version) draws now');
  assert.equal(g(0.016, 3, cam(2), vp), null);
  assert.ok(close(g(0.016, 3, cam(2), { width: 390, height: 844 }), 0.032), 'a resize draws now');
  assert.equal(g(0.016, 3, cam(2), { width: 390, height: 844 }), null);
});

test('stepping back from level 3 keeps the held frame\'s time', () => {
  const g = fxFrameGate();
  g(0.016, 3, cam(1), vp);
  assert.equal(g(0.016, 3, cam(1), vp), null);
  assert.ok(close(g(0.016, 2, cam(1), vp), 0.032));
  assert.equal(g(0.016, 2, cam(1), vp), 0.016);
});

test('update(): the clock on every frame, the gate before the steps, every step for a dry layer, a fresh gate per clear()', () => {
  const src = readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
  const i = src.indexOf('    update(dt, cam, vp) {');
  const body = src.slice(i, src.indexOf('\n    },\n', i));
  const clock = body.indexOf('clockS += dt * gameRate();'), gate = body.indexOf('if (!dry) {\n        const t = frameGate(dt, level(), cam, vp);');
  assert.ok(clock > 0 && gate > clock, 'the clock advances before the gate');
  assert.equal(body.split('clockS += ').length, 2, 'once per frame');
  for (const step of ['stepChannels()', 'stepTrails(', 'stepCasts()', 'l.inst.update(', 'L.renderer.render(']) assert.ok(body.indexOf(step) > gate, `${step} after the gate`);
  const clear = src.slice(src.indexOf('    clear() {'));
  assert.match(clear.slice(0, 200), /frameGate = fxFrameGate\(\);/);
});

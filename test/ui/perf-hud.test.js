// test/ui/perf-hud.test.js — the performance HUD (public/js/ui/perfHud.js, `?perf=1`): the flag and its memory, the
// frame window summary, the readout's lines and the report's per-round lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfFlag, frameSummary, snapshot, hudLines, perfReportLines, LONG_FRAME_MS, REPORT_GROUPS } from '../../public/js/ui/perfHud.js';

test('?perf=1 turns it on and remembers it, ?perf=0 turns it off and forgets it, no query reads the memory', () => {
  assert.deepEqual(perfFlag('?perf=1', false), { on: true, save: true });
  assert.deepEqual(perfFlag('?room=K7Q2&perf=on', false), { on: true, save: true });
  assert.deepEqual(perfFlag('?perf=0', true), { on: false, save: false });
  assert.deepEqual(perfFlag('', true), { on: true, save: undefined });
  assert.deepEqual(perfFlag('?room=K7Q2', null), { on: false, save: undefined });
});

test('a frame window: mean fps, the 95th-percentile and worst interval, frames that dropped one at 60 Hz', () => {
  const xs = [...Array(18).fill(1000 / 60), 40, 60];
  const f = frameSummary(xs);
  assert.equal(f.max, 60);
  assert.equal(f.p95, 60);
  assert.equal(f.long, 2);
  assert.ok(Math.abs(f.fps - 1000 * 20 / (300 + 100)) < 1e-9);
  assert.equal(frameSummary([LONG_FRAME_MS - 1]).long, 0);
  assert.deepEqual(frameSummary([]), { fps: 0, p95: 0, max: 0, long: 0 });
});

const view = {
  cpuMs: 3.14, renderMs: 4.2, units: 42, lod: 1, impostor: 2,
  fxGame: { live: 8, updateMs: 1.2, renderMs: 0.8, calls: 37, particles: 1200 },
  board3d: { on: true, calls: 14, cpuMs: 2.1, textures: 85 },
};
const snap = (o = {}) => snapshot({
  frames: { fps: 58.2, p95: 21, max: 48, long: 2 }, view, kind: 'engine', simMs: 0.42, ticksPerSec: 60,
  round: 12, phase: 'COMBAT', quality: 'high', dpr: 3, heapMB: null, at: (23 * 60 + 14) * 1000, ...o,
});

test('the readout: frames, sim / JS / PIXI render, effects, the 3D board, the work on screen, where and when', () => {
  assert.deepEqual(hudLines(snap()), [
    'fps 58 · p95 21ms · max 48 · long 2',
    'sim 0.42ms/f (60 t/s) · js 3.1 · draw 4.2',
    'fx 2ms · 37 calls · 1200 p · 8 live',
    '3d 14 calls · 2.1ms · 85 tex',
    'units 42 · lod 1 · imp 2 · q high · dpr 3',
    'R12 COMBAT · 23:14',
  ]);
  const flat = hudLines(snap({ view: { ...view, fxGame: undefined, board3d: { on: false } }, kind: 'fallback', simMs: null, ticksPerSec: null, round: null, phase: null, heapMB: 151.4 }));
  assert.deepEqual(flat.slice(1), ['sim -ms/f · js 3.1 · draw 4.2', '3d off · view fallback', 'units 42 · lod 1 · imp 2 · q high · dpr 3', 'no match · 23:14 · heap 151MB']);
});

test('the report: consecutive samples of one round and phase make a line; only the last REPORT_GROUPS are kept', () => {
  const samples = [
    snap({ phase: 'PREP', at: 60_000, frames: { fps: 60, p95: 17, max: 18, long: 0 }, view: { ...view, lod: 0 } }),
    snap({ at: 70_000, frames: { fps: 50, p95: 25, max: 60, long: 3 }, view: { ...view, lod: 0 } }),
    snap({ at: 80_000, frames: { fps: 40, p95: 35, max: 90, long: 5 }, view: { ...view, units: 56, lod: 2, board3d: { on: true, calls: 18 } } }),
  ];
  assert.deepEqual(perfReportLines(samples), [
    'R12 PREP 1:00–1:00 | fps 60 (min 60) | p95 17 ms | long 0 | sim 0.42 | js 3.1 | draw 4.2 | fx 2 ms 37 calls | 3d 14 calls | units 42 | lod 0–0',
    'R12 COMBAT 1:10–1:20 | fps 45 (min 40) | p95 30 ms | long 8 | sim 0.42 | js 3.1 | draw 4.2 | fx 2 ms 37 calls | 3d 18 calls | units 56 | lod 0–2',
  ]);
  const many = Array.from({ length: REPORT_GROUPS + 5 }, (_, i) => snap({ round: i + 1, at: i * 10_000 }));
  const lines = perfReportLines(many);
  assert.equal(lines.length, REPORT_GROUPS);
  assert.match(lines[0], /^R6 COMBAT/);
});

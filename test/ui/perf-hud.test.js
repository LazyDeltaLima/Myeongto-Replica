// test/ui/perf-hud.test.js — the performance HUD (public/js/ui/perfHud.js, `?perf=1`): the flag and its memory, the
// frame window summary, the readout's lines and the report's per-round lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfFlag, frameSummary, snapshot, hudLines, perfReportLines, otherMs, lostMs, timeUiRenders, LONG_FRAME_MS, REPORT_GROUPS } from '../../public/js/ui/perfHud.js';

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
  assert.equal(f.n, 20);
  assert.equal(f.p10, 1000 / 60);
  assert.deepEqual(frameSummary([]), { fps: 0, p95: 0, p10: 0, max: 0, long: 0, n: 0 });
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
  assert.equal(hudLines(snap({ view: { ...view, res: 2, boardRes: 1.25 } }))[4], 'units 42 · lod 1 · imp 2 · q high · res 2/1.25 · dpr 3');
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
    'R12 PREP 1:00–1:00 | q high | fps 60 (min 60) | p95 17 ms | worst 18 ms | long 0 | sim 0.42 | js 3.1 (3d 2.1, fx 2: upd 1.2 draw 0.8) | draw 4.2 | fx 37 calls | 3d 14 calls | units 42 | lod 0–0 | imp 2–2',
    'R12 COMBAT 1:10–1:20 | q high | fps 45 (min 40) | p95 30 ms | worst 90 ms | long 8 | sim 0.42 | js 3.1 (3d 2.1, fx 2: upd 1.2 draw 0.8) | draw 4.2 | other 14.7 ms | fx 37 calls | 3d 18 calls | units 56 | lod 0–2 | imp 2–2',
  ]);
  const many = Array.from({ length: REPORT_GROUPS + 5 }, (_, i) => snap({ round: i + 1, at: i * 10_000 }));
  const lines = perfReportLines(many);
  assert.equal(lines.length, REPORT_GROUPS);
  assert.match(lines[0], /^R6 COMBAT/);
});

test('the report: UTC wall time, a new line when the quality or the render resolution changes', () => {
  const t = Date.UTC(2026, 9, 16, 15, 31, 7);
  const hi = { ...view, res: 2, boardRes: 2 };
  const mid = { ...view, res: 1.5, boardRes: 1.25 };
  const lines = perfReportLines([
    snap({ wall: t, view: hi }),
    snap({ wall: t + 10_000, view: hi }),
    snap({ wall: t + 20_000, view: mid, quality: 'medium' }),
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^R12 COMBAT 15:31:07–15:31:17 \| q high res 2\/2 \| fps 58/);
  assert.match(lines[1], /^R12 COMBAT 15:31:27–15:31:27 \| q medium res 1\.5\/1\.25 \| /);
});

test('the report: stalls and samples without a frame stay out of fps; the longest single frame costs', () => {
  const lines = perfReportLines([
    snap({ frames: { fps: 0, p95: 0, max: 0, long: 0, n: 0 }, stalls: [13_800], peaks: { js: 12, draw: 13_790, b3: 4 } }),
    snap({ frames: { fps: 57, p95: 18, max: 30, long: 0, n: 570 }, stalls: [1_200], peaks: { js: 9, draw: 40, b3: 3 } }),
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\| fps 57 \(min 57\) \| p95 18 ms \| worst 30 ms \| long 0 \| stalls 2 \(max 13\.8 s\) \| no frames 1 \| /);
  assert.match(lines[0], /\| peak js 12, draw 13790, 3d 4 ms \| /);
  // no 3D board: no 3d peak
  assert.match(perfReportLines([snap({ peaks: { js: 5, draw: 2, b3: null } })])[0], /\| peak js 5, draw 2 ms \| /);
});

test('other: the frame time no measured cost explains, below 55 fps only', () => {
  const s = snapshot({ frames: { fps: 40, p95: 30, max: 40, long: 0 }, view: { cpuMs: 6.9, renderMs: 1 }, simMs: 0.6 });
  assert.ok(Math.abs(otherMs(s) - (25 - 6.9 - 1 - 0.6)) < 1e-9);
  assert.ok(Number.isNaN(otherMs({ ...s, fps: 58 })));
  assert.ok(Number.isNaN(otherMs({ ...s, fps: 0 })));
});

test('the report splits js and other: frame sections, UI renders and messages per second, what the page holds', () => {
  const held = { objs: 2400, shown: 1100, tex: 310, base: 120, ticker: 9, dom: 812, views: 20, pen: 5, gone: 0, fxLive: 3, fxNotes: 0, fxTrails: 1 };
  const lines = perfReportLines([
    snap({ view: { ...view, parts: { units: 2, imp: 0.4, status: 1 } }, ui: { ms: 3, n: 10 }, msg: { ms: 1, n: 8, kB: 20 }, held: { ...held, objs: 2000 } }),
    snap({ view: { ...view, impostor: 4, parts: { units: 3, imp: 0.6, status: 1 } }, ui: { ms: 5, n: 14 }, msg: { ms: 2, n: 10, kB: 30 }, held }),
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\| parts units 2\.5, imp 0\.5, status 1 \| ui 4 ms\/s \(12\/s\) \| msg 1\.5 ms\/s \(9\/s, 25 kB\/s\) \| /);
  assert.match(lines[0], /\| imp 2–4 \| /);
  // the last census of the line
  assert.match(lines[0], /\| held objs 2400 \(1100 shown\), tex 310\/120, ticker 9, dom 812, views 20\/5\/0, fx 3\/0\/1$/);
  assert.match(hudLines(snap({ ui: { ms: 2.34, n: 6 }, msg: { ms: 0.5, n: 4 } }))[2], /^ui 2\.3ms\/s \(6\) · msg 0\.5ms\/s \(4\)$/);
});

test('UI render timing: each Preact render batch adds its time and count, the batch still runs', async () => {
  const opts = {};
  const acc = { ms: 0, n: 0 };
  let t = 0;
  timeUiRenders(opts, acc, () => t);
  let ran = 0;
  opts.debounceRendering(() => { ran++; t += 7; });
  await Promise.resolve();
  assert.equal(ran, 1);
  assert.deepEqual([acc.ms, acc.n], [7, 1]);
  // a debouncer set before it is kept
  const queued = [];
  const o2 = { debounceRendering: (cb) => queued.push(cb) };
  timeUiRenders(o2, acc, () => t);
  o2.debounceRendering(() => { t += 3; });
  assert.equal(queued.length, 1);
  queued[0]();
  assert.deepEqual([acc.ms, acc.n], [10, 2]);
});

test('UI render roots: a component diffed at depth 0 is a root, its subtree counts in its time; earlier hooks still run', () => {
  const seen = [];
  const opts = { __b: (v) => seen.push(['b', v.type.name || v.type]), diffed: (v) => seen.push(['d', v.type.name || v.type]) };
  const acc = { ms: 0, n: 0 };
  let t = 0;
  timeUiRenders(opts, acc, () => t);
  function Board() {} function Cell() {}
  const board = { type: Board }, div = { type: 'div' }, cell = { type: Cell };
  opts.__b(board); t += 1; opts.__b(div); opts.__b(cell); t += 2; opts.diffed(cell); opts.diffed(div); t += 1; opts.diffed(board);
  opts.__b(cell); t += 5; opts.diffed(cell);
  assert.deepEqual(Object.fromEntries(acc.by), { Board: { ms: 4, n: 1 }, Cell: { ms: 5, n: 1 } });
  assert.equal(seen.length, 8);
  // a bare DOM vnode at depth 0 is no component root
  opts.__b(div); opts.diffed(div);
  assert.equal(acc.by.size, 2);
});

test('lost: the mean interval minus the refresh period; the report names it with the rate, top units / effects / UI roots', () => {
  assert.ok(Math.abs(lostMs({ fps: 40, period: 1000 / 60 }) - (25 - 1000 / 60)) < 1e-9);
  assert.ok(Number.isNaN(lostMs({ fps: 40, period: null })));
  const held = { objs: 1, shown: 1, tex: 1, base: 1, ticker: 1, dom: 1, views: 1, pen: 0, gone: 0, fxLive: 0, fxNotes: 0, fxTrails: 0,
    topUnits: [{ id: 'enemy_1536_ncrmcr', ms: 4.21, boss: true, imp: true }, { id: 'char_2027_wang', ms: 0.5, boss: false, imp: false }],
    topFx: [{ name: 'fx_boss_hit', ms: 3.3, k: 4 }] };
  const line = perfReportLines([
    snap({ frames: { fps: 21, p95: 98, max: 247, long: 9, n: 210 }, period: 1000 / 60, held, ui: { ms: 32, n: 16 }, uiTop: [{ name: 'BattleHud', ms: 30, n: 15 }, { name: 'Shop', ms: 2, n: 1 }] }),
    snap({ frames: { fps: 21, p95: 98, max: 247, long: 9, n: 210 }, period: 1000 / 60, held, ui: { ms: 40, n: 17 }, uiTop: [{ name: 'BattleHud', ms: 40, n: 17 }] }),
  ])[0];
  assert.match(line, /\| lost 31 ms\/f @60Hz \| /);
  assert.match(line, /\| ui 36 ms\/s \(16\.5\/s\): BattleHud 35\/16, Shop 1\/0\.5 \| /);
  assert.match(line, /\| top units enemy_1536_ncrmcr boss imp 4\.2, char_2027_wang 0\.5 \| top fx fx_boss_hit 3\.3 ×4$/);
});

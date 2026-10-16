// The performance HUD (`?perf=1`): a small corner readout of where a frame's time goes on the device in hand, and a
// sample every SAMPLE_MS for the bug report (diag.js `perf:` lines, one per round and phase), so a whole match on a phone
// shows whether the frame rate falls with the work on screen (units, effects, draw calls) or on its own (a hot device).
//
// `?perf=1` turns it on and remembers it (`sp.pref.perf`: a home-screen app keeps no query string), `?perf=0` turns it
// off. Off, nothing is installed. The readout never takes input (pointer-events: none).
//
// Sources, all already measured elsewhere: this module's own animation-frame intervals (fps, p95, worst, long frames,
// stalls), the field view's stats() (render/app.js: the frame's JS `cpuMs`, the PIXI render `renderMs`, the render
// resolutions, units, load level, fxGame, board3d) and takePeaks() (the longest single frame JS / PIXI render / 3D board
// draw since the last call), the battle runner's stats() (battle/runner.js: sim time per runner frame). Keys are English
// like the report's (diag.js): developers read them.
//
// A frame interval of a second or more while the page stayed visible is a stall (the main thread or a GPU call held
// the page), not a hidden page: it is listed apart and left out of fps. The report's clock is UTC wall time like the
// report's other lines (a phone's performance.now() stands still while the app is suspended, so a page-relative
// clock drifts from them). `other` is the frame time no measured cost explains (frame − js − draw − sim) on samples
// below 55 fps: the GPU and the compositor, or main-thread work outside the frame (messages, the UI).
//
//   perfFlag(search, saved)    → { on, save }  (save: the value to remember, undefined = leave it)
//   frameSummary(intervals)    → { fps, p95, max, long, n }
//   hudLines(snap)             → the readout's lines
//   perfReportLines(samples)   → the report's `perf:` lines
//   installPerfHud()           main.js boot: reads the flag, mounts the readout, registers the report source

import { loadPref, savePref, store } from '../store.js';
import { settingsStore } from './settings.js';
import { battleRunner } from '../battle/runner.js';
import { setPerfSource } from '../diag.js';

export const SAMPLE_MS = 10_000;
export const SAMPLES_KEPT = 720; // two hours
export const REPORT_GROUPS = 40;
/** A frame interval this long dropped at least one frame at 60 Hz. */
export const LONG_FRAME_MS = 34;

/** @param {string} search location.search @param {any} saved the remembered flag */
export function perfFlag(search, saved) {
  let q;
  try { q = new URLSearchParams(search || '').get('perf'); } catch { q = null; }
  if (q === '1' || q === 'on') return { on: true, save: true };
  if (q === '0' || q === 'off') return { on: false, save: false };
  return { on: saved === true, save: undefined };
}

/** @param {number[]} intervals frame intervals (ms) of one window */
export function frameSummary(intervals) {
  const n = intervals.length;
  if (!n) return { fps: 0, p95: 0, max: 0, long: 0, n: 0 };
  const sorted = intervals.slice().sort((a, b) => a - b);
  const sum = intervals.reduce((s, x) => s + x, 0);
  return {
    fps: 1000 * n / sum,
    p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
    max: sorted[n - 1],
    long: intervals.filter((x) => x >= LONG_FRAME_MS).length,
    n,
  };
}

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : '-');
const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : '-');
const r0 = (x) => (Number.isFinite(x) ? Math.round(x) : '-');
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pad2 = (n) => String(n).padStart(2, '0');
/** UTC wall time like diag.js clockOf (the report's other lines). */
const wallClock = (ms) => { const d = new Date(ms); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`; };
/** The render resolutions: PIXI / 3D board ('-' without a 3D board). */
const resOf = (p) => (p.res != null ? `${r2(p.res)}/${p.boardRes != null ? r2(p.boardRes) : '-'}` : null);

/**
 * One reading: the frame window, the view's and the runner's numbers, where the match is.
 * @param {{ frames: ReturnType<typeof frameSummary>, view: any, kind: string|null, simMs: number|null, ticksPerSec: number|null,
 *   round: number|null, phase: string|null, quality: string|null, dpr: number|null, heapMB: number|null, at: number,
 *   wall?: number, stalls?: number[], peaks?: { js?: number, draw?: number, b3?: number }|null }} s
 */
export function snapshot(s) {
  const v = s.view || {};
  const fx = v.fxGame || {};
  const b3 = v.board3d || {};
  const pk = s.peaks || null;
  return {
    at: s.at, wall: s.wall ?? null, round: s.round, phase: s.phase, kind: s.kind,
    fps: s.frames.fps, p95: s.frames.p95, max: s.frames.max, long: s.frames.long, frames: s.frames.n ?? null,
    stalls: Array.isArray(s.stalls) ? s.stalls.slice() : [],
    sim: s.simMs, tps: s.ticksPerSec, js: v.cpuMs ?? null, draw: v.renderMs ?? null,
    peaks: pk ? { js: pk.js ?? null, draw: pk.draw ?? null, b3: pk.b3 ?? null } : null,
    fxMs: fx.updateMs != null ? (fx.updateMs || 0) + (fx.renderMs || 0) : null, fxCalls: fx.calls ?? null, fxLive: fx.live ?? null, particles: fx.particles ?? null,
    b3: b3.on ? { calls: b3.calls ?? null, ms: b3.cpuMs ?? null, tex: b3.textures ?? null } : null,
    units: v.units ?? null, lod: v.lod ?? null, imp: v.impostor ?? null, quality: s.quality, dpr: s.dpr, heapMB: s.heapMB,
    res: v.res ?? null, boardRes: v.boardRes ?? null,
  };
}

/** @param {ReturnType<typeof snapshot>} p */
export function hudLines(p) {
  const lines = [
    `fps ${r0(p.fps)} · p95 ${r0(p.p95)}ms · max ${r0(p.max)} · long ${p.long}`,
    `sim ${r2(p.sim)}ms/f${p.tps != null ? ` (${r0(p.tps)} t/s)` : ''} · js ${r1(p.js)} · draw ${r1(p.draw)}`,
  ];
  if (p.fxMs != null) lines.push(`fx ${r1(p.fxMs)}ms · ${p.fxCalls ?? '-'} calls · ${p.particles ?? '-'} p · ${p.fxLive ?? '-'} live`);
  lines.push(p.b3 ? `3d ${p.b3.calls ?? '-'} calls · ${r1(p.b3.ms)}ms · ${p.b3.tex ?? '-'} tex` : `3d off${p.kind && p.kind !== 'engine' ? ` · view ${p.kind}` : ''}`);
  lines.push(`units ${p.units ?? '-'} · lod ${p.lod ?? '-'} · imp ${p.imp ?? '-'} · q ${p.quality ?? '-'}${resOf(p) ? ` · res ${resOf(p)}` : ''} · dpr ${p.dpr ?? '-'}`);
  lines.push(`${p.round != null ? `R${p.round} ` : ''}${p.phase || 'no match'} · ${clock(p.at)}${p.heapMB != null ? ` · heap ${r0(p.heapMB)}MB` : ''}`);
  return lines;
}

const avg = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
const maxOf = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? Math.max(...v) : NaN; };
const minOf = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? Math.min(...v) : NaN; };

/** A sample's frame time no measured cost explains (ms), below 55 fps only (above it the interval is mostly vsync wait). */
export function otherMs(s) {
  if (!(s.fps > 0 && s.fps < 55) || !Number.isFinite(s.js) || !Number.isFinite(s.draw)) return NaN;
  return Math.max(0, 1000 / s.fps - s.js - s.draw - (Number.isFinite(s.sim) ? s.sim : 0));
}

/**
 * The report's lines: consecutive samples of the same round, phase, quality and render resolution make one line (UTC
 * wall time, quality and resolution, the mean and lowest fps, the mean p95 and the worst interval, long frames, stalls,
 * samples without a frame, mean costs with the 3D board and effects inside `js`, the unexplained time, the longest
 * single frame costs, peak work), the last REPORT_GROUPS of them. Samples without a frame stay out of fps and p95.
 * @param {ReturnType<typeof snapshot>[]} samples
 */
export function perfReportLines(samples) {
  const groups = [];
  for (const s of samples) {
    const key = `${s.round ?? ''}|${s.phase ?? ''}|${s.quality ?? ''}|${resOf(s) ?? ''}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.list.push(s); else groups.push({ key, list: [s] });
  }
  return groups.slice(-REPORT_GROUPS).map(({ list }) => {
    const a = list[0];
    const z = list[list.length - 1];
    const live = list.filter((s) => s.frames !== 0);
    const pick = (k, from = list) => from.map((s) => s[k]);
    const b3 = list.map((s) => s.b3?.calls);
    const lods = pick('lod').filter(Number.isFinite);
    const stalls = list.flatMap((s) => s.stalls || []);
    const blank = list.length - live.length;
    const other = avg(list.map(otherMs));
    const peak = (k) => maxOf(list.map((s) => s.peaks?.[k]));
    const b3ms = avg(list.map((s) => s.b3?.ms));
    const fxMs = avg(pick('fxMs'));
    const inJs = [Number.isFinite(b3ms) ? `3d ${r1(b3ms)}` : null, Number.isFinite(fxMs) ? `fx ${r1(fxMs)}` : null].filter(Boolean).join(', ');
    const when = a.wall != null && z.wall != null ? `${wallClock(a.wall)}–${wallClock(z.wall)}` : `${clock(a.at)}–${clock(z.at)}`;
    return [
      `${a.round != null ? `R${a.round} ` : ''}${a.phase || 'no match'} ${when}`,
      a.quality || resOf(a) ? [a.quality ? `q ${a.quality}` : null, resOf(a) ? `res ${resOf(a)}` : null].filter(Boolean).join(' ') : null,
      live.length ? `fps ${r0(avg(pick('fps', live)))} (min ${r0(minOf(pick('fps', live)))})` : 'fps -',
      live.length ? `p95 ${r0(avg(pick('p95', live)))} ms` : null,
      live.length ? `worst ${r0(maxOf(pick('max', live)))} ms` : null,
      `long ${list.reduce((n, s) => n + (s.long || 0), 0)}`,
      stalls.length ? `stalls ${stalls.length} (max ${r1(Math.max(...stalls) / 1000)} s)` : null,
      blank ? `no frames ${blank}` : null,
      `sim ${r2(avg(pick('sim')))}`, `js ${r1(avg(pick('js')))}${inJs ? ` (${inJs})` : ''}`, `draw ${r1(avg(pick('draw')))}`,
      Number.isFinite(other) ? `other ${r1(other)} ms` : null,
      Number.isFinite(peak('js')) || Number.isFinite(peak('draw')) ? `peak ${[['js', 'js'], ['draw', 'draw'], ['3d', 'b3']]
        .filter(([, k]) => Number.isFinite(peak(k))).map(([n, k]) => `${n} ${r0(peak(k))}`).join(', ')} ms` : null,
      `fx ${r0(maxOf(pick('fxCalls')))} calls`,
      Number.isFinite(maxOf(b3)) ? `3d ${r0(maxOf(b3))} calls` : '3d off',
      `units ${r0(maxOf(pick('units')))}`,
      lods.length ? `lod ${Math.min(...lods)}–${Math.max(...lods)}` : null,
      Number.isFinite(maxOf(pick('heapMB'))) ? `heap ${r0(maxOf(pick('heapMB')))} MB` : null,
    ].filter(Boolean).join(' | ');
  });
}

/** main.js boot. */
export function installPerfHud() {
  const g = globalThis;
  const flag = perfFlag(g.location?.search, loadPref('perf', false));
  if (flag.save !== undefined) savePref('perf', flag.save);
  if (!flag.on || !g.document || typeof g.requestAnimationFrame !== 'function') return;

  const t0 = g.performance.now();
  const el = g.document.createElement('pre');
  el.className = 'perf-hud';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed', left: 'calc(4px + env(safe-area-inset-left, 0px))', top: 'calc(4px + env(safe-area-inset-top, 0px))',
    zIndex: '120', margin: '0', padding: '3px 5px', font: '10px/1.25 ui-monospace, Menlo, monospace', color: '#cfe',
    background: 'rgba(0, 0, 0, 0.6)', borderRadius: '3px', pointerEvents: 'none', whiteSpace: 'pre',
  });
  g.document.body.appendChild(el);

  const samples = [];
  setPerfSource(() => perfReportLines(samples));

  let intervals = [];
  let stalls = [];
  let last = 0;
  // a hidden page gets no frames: that gap is not a slow frame; a gap of a second or more while the page stayed
  // visible is a stall
  let hiddenSeen = g.document.visibilityState === 'hidden';
  g.document.addEventListener?.('visibilitychange', () => { if (g.document.visibilityState === 'hidden') hiddenSeen = true; });
  const onFrame = (now) => {
    if (last) {
      const d = now - last;
      if (d < 1000) intervals.push(d);
      else if (!hiddenSeen) stalls.push(d);
    }
    if (g.document.visibilityState !== 'hidden') hiddenSeen = false;
    last = now;
    g.requestAnimationFrame(onFrame);
  };
  g.requestAnimationFrame(onFrame);

  // the runner's counters at the start of the readout's second and of the sample's span: sim ms per runner frame, ticks/s
  const runMark = (now) => { try { const rs = battleRunner?.stats?.(); return rs ? { frames: rs.frames, stepMs: rs.stepMs, ticks: rs.ticks, at: now } : null; } catch { return null; } };
  const simSince = (from, to) => {
    if (!from || !to) return { simMs: null, ticksPerSec: null };
    const df = to.frames - from.frames;
    return { simMs: df > 0 ? (to.stepMs - from.stepMs) / df : 0, ticksPerSec: (to.ticks - from.ticks) * 1000 / Math.max(1, to.at - from.at) };
  };
  let secMark = runMark(t0), spanMark = secMark;
  let lastSample = t0;
  let span = [];
  let spanStalls = [];
  let spanPeaks = { js: null, draw: null, b3: null };
  const read = () => {
    const now = g.performance.now();
    const second = intervals;
    span = span.concat(second);
    spanStalls = spanStalls.concat(stalls);
    intervals = [];
    stalls = [];
    let view, kind = null, peaks = null;
    try {
      const v = g.__SP_VIEW__; kind = v?.kind ?? null; view = v?.raw?.stats?.() ?? null;
      peaks = v?.raw?.takePeaks?.() ?? null;
    } catch { view = null; }
    if (peaks) for (const k of ['js', 'draw', 'b3']) if (Number.isFinite(peaks[k]) && (spanPeaks[k] == null || peaks[k] > spanPeaks[k])) spanPeaks[k] = peaks[k];
    const mark = runMark(now);
    const pub = store.get().match?.public || null;
    const mem = g.performance?.memory;
    const at = {
      view, kind, at: now - t0, wall: Date.now(),
      round: Number.isFinite(pub?.round) ? pub.round : null, phase: pub?.phase || null,
      quality: settingsStore.get().quality ?? null, dpr: g.devicePixelRatio ?? null,
      heapMB: mem && Number.isFinite(mem.usedJSHeapSize) ? mem.usedJSHeapSize / 1048576 : null,
    };
    el.textContent = hudLines(snapshot({ ...at, frames: frameSummary(second), ...simSince(secMark, mark) })).join('\n');
    secMark = mark;
    if (now - lastSample >= SAMPLE_MS) {
      // a sample's frame, stall, peak and sim numbers cover its whole span; samples are taken while a field is on screen
      if (view) {
        samples.push(snapshot({ ...at, frames: frameSummary(span), stalls: spanStalls, peaks: peaks ? spanPeaks : null, ...simSince(spanMark, mark) }));
        if (samples.length > SAMPLES_KEPT) samples.shift();
      }
      span = [];
      spanStalls = [];
      spanPeaks = { js: null, draw: null, b3: null };
      spanMark = mark;
      lastSample = now;
    }
  };
  setInterval(read, 1000);
}

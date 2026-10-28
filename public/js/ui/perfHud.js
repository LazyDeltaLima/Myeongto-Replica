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
// What splits `js` and `other` further (the report only): `parts`, the field frame's JS by section (render/app.js
// stats().parts: unit updates, the impostor flush, status effects, …); `ui`, the main-thread time of the UI's re-renders
// (Preact's batched renders, timed through options.debounceRendering while the HUD is on) per second; `msg`, the time of
// the server messages' handling (net.js rx: parsing and the store's synchronous listeners) per second; `held`, every
// SAMPLE_MS, what the page holds (render/app.js census(): PIXI display objects and those drawn, the texture caches, the
// ticker's listeners, the view maps, the effect layer's live / notes / trails; the document's element count) — a count
// that only grows over a match is a leak. The browser's own style, layout and paint for the UI stay in `other`.
//
// `other` includes the wait for the display's next refresh (a frame of 2 ms of work still takes 16.7 ms at 60 Hz), so
// the report also gives `lost`: the mean frame interval minus the refresh period (refreshPeriod: the median interval of a
// steady window, the least of them since the page opened — a phone's animation-frame timestamps jitter around the refresh,
// so a low percentile read 14 ms on a 60 Hz iPhone), the time per frame the display did not get a new picture. `top units` / `top fx` (census, every SAMPLE_MS) name the unit views and effects that cost the most;
// `ui` names the components whose re-renders took the most (each batch's roots: the components Preact re-rendered
// because their own state changed, their subtree included).
//
//   perfFlag(search, saved)    → { on, save }  (save: the value to remember, undefined = leave it)
//   frameSummary(intervals)    → { fps, p95, p50, max, long, n }
//   refreshPeriod(frames)      → a steady window's median interval (ms) | null
//   hudLines(snap)             → the readout's lines
//   perfReportLines(samples)   → the report's `perf:` lines
//   timeUiRenders(opts, acc)   wraps Preact's options.debounceRendering: each render batch's time adds to acc { ms, n };
//                              and its _diff / diffed hooks: each root component's time adds to acc.by (name → { ms, n })
//   installPerfHud()           main.js boot: reads the flag, mounts the readout, registers the report source

import { loadPref, savePref, store } from '../store.js';
import { settingsStore } from './settings.js';
import { qualityInEffect } from '../render/auto-quality.js';
import { battleRunner } from '../battle/runner.js';
import { setPerfSource } from '../diag.js';
import { net } from '../net.js';
import { options as preactOptions } from '../../vendor/preact.module.js';

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
  if (!n) return { fps: 0, p95: 0, p50: 0, max: 0, long: 0, n: 0 };
  const sorted = intervals.slice().sort((a, b) => a - b);
  const sum = intervals.reduce((s, x) => s + x, 0);
  return {
    fps: 1000 * n / sum,
    p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
    p50: sorted[Math.floor(n * 0.5)],
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
 *   wall?: number, stalls?: number[], peaks?: { js?: number, draw?: number, b3?: number }|null,
 *   ui?: { ms: number, n: number }|null, msg?: { ms: number, n: number, kB?: number }|null, held?: Record<string, any>|null,
 *   uiTop?: { name: string, ms: number, n: number }[]|null, period?: number|null }} s
 *   (ui / msg / uiTop: per second; period: the display's refresh interval, ms)
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
    fxMs: fx.updateMs != null ? (fx.updateMs || 0) + (fx.renderMs || 0) : null, fxUpd: fx.updateMs ?? null, fxDraw: fx.renderMs ?? null, fxCalls: fx.calls ?? null, fxLive: fx.live ?? null, particles: fx.particles ?? null,
    b3: b3.on ? { calls: b3.calls ?? null, ms: b3.cpuMs ?? null, tex: b3.textures ?? null } : null,
    units: v.units ?? null, lod: v.lod ?? null, imp: v.impostor ?? null, quality: s.quality, dpr: s.dpr, heapMB: s.heapMB,
    res: v.res ?? null, boardRes: v.boardRes ?? null,
    parts: v.parts ? { ...v.parts } : null, ui: s.ui ?? null, msg: s.msg ?? null, held: s.held ?? null,
    uiTop: s.uiTop ?? null, period: s.period ?? null,
  };
}

/** @param {ReturnType<typeof snapshot>} p */
export function hudLines(p) {
  const lines = [
    `fps ${r0(p.fps)} · p95 ${r0(p.p95)}ms · max ${r0(p.max)} · long ${p.long}`,
    `sim ${r2(p.sim)}ms/f${p.tps != null ? ` (${r0(p.tps)} t/s)` : ''} · js ${r1(p.js)} · draw ${r1(p.draw)}`,
  ];
  if (p.ui || p.msg) lines.push(`ui ${r1(p.ui?.ms)}ms/s (${r0(p.ui?.n)}) · msg ${r1(p.msg?.ms)}ms/s (${r0(p.msg?.n)})`);
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

/** A window steady enough to show the display's refresh: its median interval (ms), else null. */
export function refreshPeriod(f) {
  return f && f.n >= 30 && f.p50 > 0 && f.p95 < f.p50 * 1.25 ? f.p50 : null;
}

/** A sample's frame time the display got no new picture for (ms): the mean interval minus the refresh period. */
export function lostMs(s) {
  if (!(s.fps > 0) || !(s.period > 0)) return NaN;
  return Math.max(0, 1000 / s.fps - s.period);
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
    const fxUpd = avg(pick('fxUpd')), fxDraw = avg(pick('fxDraw'));
    const fxSplit = Number.isFinite(fxUpd) && Number.isFinite(fxDraw) && fxMs >= 0.5 ? `: upd ${r1(fxUpd)} draw ${r1(fxDraw)}` : '';
    const inJs = [Number.isFinite(b3ms) ? `3d ${r1(b3ms)}` : null, Number.isFinite(fxMs) ? `fx ${r1(fxMs)}${fxSplit}` : null].filter(Boolean).join(', ');
    const lost = avg(live.map(lostMs));
    const period = live.find((s) => s.period > 0)?.period;
    const partKeys = Object.keys(list.find((s) => s.parts)?.parts || {});
    const parts = partKeys.map((k) => [k, avg(list.map((s) => s.parts?.[k]))]).filter(([, x]) => Number.isFinite(x));
    const rate = (k, f) => avg(list.map((s) => s[k]?.[f]));
    const imps = pick('imp').filter(Number.isFinite);
    const held = [...list].reverse().find((s) => s.held)?.held;
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
      Number.isFinite(lost) ? `lost ${r1(lost)} ms/f @${r0(1000 / period)}Hz` : null,
      parts.length ? `parts ${parts.map(([k, x]) => `${k} ${r1(x)}`).join(', ')}` : null,
      Number.isFinite(rate('ui', 'ms')) ? `ui ${r1(rate('ui', 'ms'))} ms/s (${r1(rate('ui', 'n'))}/s)${uiTopText(list)}` : null,
      Number.isFinite(rate('msg', 'ms')) ? `msg ${r1(rate('msg', 'ms'))} ms/s (${r1(rate('msg', 'n'))}/s, ${r1(rate('msg', 'kB'))} kB/s)` : null,
      Number.isFinite(peak('js')) || Number.isFinite(peak('draw')) ? `peak ${[['js', 'js'], ['draw', 'draw'], ['3d', 'b3']]
        .filter(([, k]) => Number.isFinite(peak(k))).map(([n, k]) => `${n} ${r0(peak(k))}`).join(', ')} ms` : null,
      `fx ${r0(maxOf(pick('fxCalls')))} calls`,
      Number.isFinite(maxOf(b3)) ? `3d ${r0(maxOf(b3))} calls` : '3d off',
      `units ${r0(maxOf(pick('units')))}`,
      lods.length ? `lod ${Math.min(...lods)}–${Math.max(...lods)}` : null,
      imps.length ? `imp ${Math.min(...imps)}–${Math.max(...imps)}` : null,
      Number.isFinite(maxOf(pick('heapMB'))) ? `heap ${r0(maxOf(pick('heapMB')))} MB` : null,
      held ? `held ${heldText(held)}` : null,
      held?.topUnits?.length ? `top units ${held.topUnits.map((u) => `${u.id}${u.boss ? ' boss' : ''}${u.imp ? ' imp' : ''} ${r1(u.ms)}`).join(', ')}` : null,
      held?.topFx?.length ? `top fx ${held.topFx.map((e) => `${e.name} ${r1(e.ms)} ×${r1(e.k)}`).join(', ')}` : null,
    ].filter(Boolean).join(' | ');
  });
}

/** The last census of a line: display objects (drawn), textures (base), ticker listeners, DOM elements, view maps, effects. */
const heldText = (h) => [
  `objs ${h.objs ?? '-'} (${h.shown ?? '-'} shown)`, `tex ${h.tex ?? '-'}/${h.base ?? '-'}`, `ticker ${h.ticker ?? '-'}`, `dom ${h.dom ?? '-'}`,
  `views ${h.views ?? '-'}/${h.pen ?? '-'}/${h.gone ?? '-'}`, `fx ${h.fxLive ?? '-'}/${h.fxNotes ?? '-'}/${h.fxTrails ?? '-'}`,
].join(', ');

/** The line's components whose re-renders took the most (ms/s, re-renders/s), the top 3 over its samples. */
function uiTopText(list) {
  const by = new Map();
  for (const s of list) for (const c of s.uiTop || []) {
    const e = by.get(c.name) || { ms: 0, n: 0 };
    e.ms += c.ms / list.length; e.n += c.n / list.length;
    by.set(c.name, e);
  }
  if (!by.size) return '';
  return `: ${[...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 3).map(([k, e]) => `${k} ${r1(e.ms)}/${r1(e.n)}`).join(', ')}`;
}

/** Wrap Preact's render batching so each batch's main-thread time adds to `acc` ({ ms, n }). */
export function timeUiRenders(opts, acc, now = () => globalThis.performance.now()) {
  const prev = opts.debounceRendering;
  const defer = typeof Promise === 'function' ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout;
  acc.by ||= new Map();
  // Preact's diff hooks (the vendored build's mangled options._diff = `__b`; `diffed` is public), chained to the ones
  // already set (preact/hooks): a component diffed at depth 0 is a root of its batch, its time includes its subtree
  let depth = 0, root = null, rootT = 0;
  const prevDiff = opts.__b, prevDiffed = opts.diffed;
  opts.__b = (vnode) => {
    if (depth === 0 && typeof vnode?.type === 'function') { root = vnode; rootT = now(); }
    depth++;
    if (prevDiff) prevDiff(vnode);
  };
  opts.diffed = (vnode) => {
    if (prevDiffed) prevDiffed(vnode);
    depth = Math.max(0, depth - 1);
    if (vnode === root) {
      const name = vnode.type.displayName || vnode.type.name || '?', e = acc.by.get(name);
      if (e) { e.ms += now() - rootT; e.n++; } else acc.by.set(name, { ms: now() - rootT, n: 1 });
      root = null;
    }
  };
  opts.debounceRendering = (cb) => (prev || defer)(() => {
    const t0 = now();
    depth = 0; root = null;   // a render that threw left no diffed
    try { cb(); } finally { acc.n++; acc.ms += now() - t0; }
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
  const ui = { ms: 0, n: 0 };
  timeUiRenders(preactOptions, ui);
  // the UI's and the messages' running totals at the start of the readout's second and of the sample's span
  const busyMark = () => ({ uiMs: ui.ms, uiN: ui.n, rxMs: net.rx?.ms ?? 0, rxN: net.rx?.n ?? 0, rxB: net.rx?.bytes ?? 0 });
  const busySince = (from, to, ms) => {
    const k = 1000 / Math.max(1, ms);
    return { ui: { ms: (to.uiMs - from.uiMs) * k, n: (to.uiN - from.uiN) * k }, msg: { ms: (to.rxMs - from.rxMs) * k, n: (to.rxN - from.rxN) * k, kB: (to.rxB - from.rxB) * k / 1024 } };
  };

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
  let secBusy = busyMark(), spanBusy = secBusy, lastSec = t0;
  let period = null;   // the display's refresh interval: the least steady window median seen (refreshPeriod)
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
      quality: qualityInEffect(settingsStore.get().quality) ?? null, dpr: g.devicePixelRatio ?? null,
      heapMB: mem && Number.isFinite(mem.usedJSHeapSize) ? mem.usedJSHeapSize / 1048576 : null,
    };
    const busy = busyMark();
    el.textContent = hudLines(snapshot({ ...at, frames: frameSummary(second), ...simSince(secMark, mark), ...busySince(secBusy, busy, now - lastSec) })).join('\n');
    secMark = mark;
    secBusy = busy;
    lastSec = now;
    if (now - lastSample >= SAMPLE_MS) {
      // a sample's frame, stall, peak and sim numbers cover its whole span; samples are taken while a field is on screen
      const fr = frameSummary(span);
      const rp = refreshPeriod(fr);
      if (rp != null && (period == null || rp < period)) period = rp;
      if (view) {
        let held;
        try { held = g.__SP_VIEW__?.raw?.census?.() ?? null; } catch { held = null; }
        if (held) held.dom = g.document.getElementsByTagName('*').length;
        const k = 1000 / Math.max(1, now - lastSample);
        const uiTop = [...ui.by].map(([name, e]) => ({ name, ms: e.ms * k, n: e.n * k }));
        samples.push(snapshot({ ...at, frames: fr, stalls: spanStalls, peaks: peaks ? spanPeaks : null, ...simSince(spanMark, mark),
          ...busySince(spanBusy, busy, now - lastSample), held, uiTop, period }));
        if (samples.length > SAMPLES_KEPT) samples.shift();
      }
      span = [];
      spanStalls = [];
      spanPeaks = { js: null, draw: null, b3: null };
      spanMark = mark;
      spanBusy = busy;
      ui.by.clear();
      lastSample = now;
    }
  };
  setInterval(read, 1000);
}

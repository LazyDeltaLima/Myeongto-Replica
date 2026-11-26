// public/js/diag.js — the client's error log and the diagnostics a player copies into a bug report (设置 → 问题反馈).
//
// Nothing leaves the browser. The log is kept in memory (the last LOG_MAX entries, an identical error in a row counted
// on its entry) and, as this page's report lines, in localStorage for the page after it (installPageRecord); the
// report is plain text the player copies and pastes into a GitHub issue, with the player names, the room code and
// the reconnect token replaced and the page's host cut from every URL. A secret is a whole token in
// the prose and an exact string value in the attached battle JSON, so a name never rewrites a longer id. The battle
// on screen can be attached as its BattleSpec (the b.start a browser receives: player ids, no names), which the dev
// tools replay.
//
//   recordError(source, err, detail?)  source: 'error' (uncaught) | 'rejection' (unhandled promise) | 'sim' (a content
//                                      error the battle isolated) | 'runner' (the local battle runner) | 'request'
//                                      (a failed request or error push the player was shown) | 'ui' (a screen that
//                                      crashed while rendering, the 「界面发生错误」 page)
//   errorLog() / errorCount() / clearErrorLog()
//   setBattleSource(fn)                the battle runner registers how to read the battle on screen
//   rememberBattle(entry)              the runner's own battles of this match (b.start fields), kept past the match's
//                                      end for the settlement screen's feedback (ui/feedback.js); a battle of another
//                                      match (another battleId prefix) starts the list again
//   matchBattles(state)                those battles as the feedback attaches them (secrets replaced, errors counted)
//   battleCount()                      how many there are (cheap: no copy)
//   noteRender(event, detail?)         what the field view's board did (3D on / failed / lost / waits / retry, the
//                                      simplified view): the last RENDER_MAX events, for the report's render lines
//                                      (an event repeating the one before it counts on it: `x3, last …`)
//   renderEvents() / clearRenderEvents()
//   watchCanvas(canvas, name)          a canvas a texture is drawn from notes a lost / restored 2D context ('canvas lost'):
//                                      Chrome may drop a canvas's 2D context and give it back blank (reports #27·#28)
//   pageHides()                        how often this page was hidden (the report's `time:` line, the record)
//   setPerfSource(fn)                  the performance HUD (ui/perfHud.js, `?perf=1`) registers its per-round summary for
//                                      the report's `perf:` lines
//   mountTimer()                       times one field mount (fieldHost + createFieldView stages, late art / 3D / scene)
//                                      for the report's `mount:` lines (+ the downloads in that window, Resource Timing)
//   mountRecords() / clearMountRecords() / mountNet(m, resources)
//   fieldLoading()                     a field mount is still on its way (resources.js holds its downloads meanwhile)
//   setResourceSource({ status, snap }) resources.js registers its cache state for the report's `resources:` line and
//                                      each mount's `res` part (queued downloads, stale entries, the worker's answers)
//   installPageRecord()                main.js boot: this page's log, render events, mounts and perf lines kept in
//                                      localStorage, so the page after a crash or a reload reports them (`prev …` lines)
//   previousPage() / pageRecord()      that record of the page before this one / of this page
//   buildDiagnostics(input)            the report text (pure: the state, the environment and the battle are passed in)
//   diagnosticsText({ state, settings, attachBattle })  the report of this page (this browser, the battle on screen)
//
// Report keys are English on purpose: the text is read by developers and searched in issues, whatever the UI language.

import { APP_VERSION } from '../../shared/constants.js';
import { gpuStatus } from './gpu.js';
import { qualityInEffect } from './render/auto-quality.js';
import { uploadCheckText } from './render/app/gl-check.js';

export const LOG_MAX = 40;
export const STACK_LINES = 6;
const MESSAGE_MAX = 300;

/** @type {(() => string[]) | null} */
let perfSource = null;
/** @param {(() => string[]) | null} fn */
export function setPerfSource(fn) { perfSource = typeof fn === 'function' ? fn : null; }
const perfLines = () => { try { return perfSource ? perfSource() : []; } catch { return []; } };

/**
 * What resources.js resourceStatus() reports (the `resources:` line).
 * @typedef {{ at: number, ms: number|null, keys?: number, stale?: number, adopted?: number, differ?: number, skipped?: boolean,
 *   refused?: number, step?: string, open?: number, read?: number, old?: number }} ReconcileStatus `step`: the stage a running
 *   reconcile is in; `open` / `read` / `old`: ms spent opening the database, reading its hashes, looking at the old caches
 * @typedef {{ phase: string, done?: number, total?: number, failed?: number, queued?: number, slowed?: string|null,
 *   bundles?: { listed?: number, fetched?: number, stopped?: number, failed?: number, members?: number } }} DownloadStatus
 * @typedef {{ left?: number, deleted?: number, held?: boolean, legacyLeft?: number, moved?: number }} CleanupStatus
 * @typedef {WorkerCounts & { at?: number, db?: string, unstored?: number, inflight?: number }} WorkerStatus `db`: 'open',
 *   'unopened' or why the worker could not open or write the database; `unstored`: files it fetched but could not store
 * @typedef {{ reconcile?: ReconcileStatus | null, download?: DownloadStatus | null, cleanup?: CleanupStatus | null,
 *   worker?: WorkerStatus | null }} ResStatus
 * @typedef {{ status: () => ResStatus | null, snap?: () => Promise<ResSnap> }} ResSource
 */
/** @type {ResSource | null} */
let resSource = null;
/** @param {ResSource | null} src */
export function setResourceSource(src) { resSource = src && typeof src.status === 'function' ? src : null; }
const resStatus = () => { try { return resSource ? resSource.status() : null; } catch { return null; } };

/** @typedef {{ source: string, message: string, stack: string|null, detail: string|null, battleId: string|null, at: number, lastAt: number, count: number }} LogEntry */
/** @type {LogEntry[]} */
const log = [];
let total = 0;
let dropped = 0;
const pageStart = Date.now();

/** @typedef {{ at: number, event: string, detail: string|null, count?: number, lastAt?: number }} RenderEvent */
/** @type {RenderEvent[]} */
const renderLog = [];
export const RENDER_MAX = 12;
/**
 * Note what the field view's board did (render/app.js 3D board, ui/fieldHost.js simplified view). Not an error: phones
 * lose the 3D board's context in the background — the report shows whether and how it came back.
 * @param {string} event @param {string|null} [detail] @param {number} [at] epoch ms
 */
export function noteRender(event, detail = null, at = Date.now()) {
  const e = { at, event: String(event), detail: detail == null ? null : stripHosts(String(detail)).slice(0, MESSAGE_MAX) };
  const last = renderLog[renderLog.length - 1];
  // the same event again (every canvas of a font losing its context, a page hidden and shown in a row): one entry
  if (last && last.event === e.event && last.detail === e.detail) { last.count = (last.count || 1) + 1; last.lastAt = at; }
  else renderLog.push(e);
  if (renderLog.length > RENDER_MAX) renderLog.splice(0, renderLog.length - RENDER_MAX);
  notePage();
}
export const renderEvents = () => renderLog.map((e) => ({ ...e }));
export function clearRenderEvents() { renderLog.length = 0; }

const watched = new WeakSet();
/**
 * Report a lost / restored 2D context of a canvas textures are uploaded from (render/app/pixi.js: the canvases PIXI
 * creates; render/textures.js makeCanvas). A restored canvas is blank: what is uploaded from it later is transparent.
 * Once per canvas; a canvas without the events (other browsers) is left alone.
 * @param {unknown} canvas @param {string} name
 */
export function watchCanvas(canvas, name) {
  if (!canvas || typeof canvas !== 'object' || typeof (/** @type {{ addEventListener?: unknown }} */ (canvas)).addEventListener !== 'function'
    || watched.has(canvas)) return;
  watched.add(canvas);
  const c = /** @type {EventTarget} */ (canvas);
  try {
    c.addEventListener('contextlost', () => noteRender('canvas lost', name));
    c.addEventListener('contextrestored', () => noteRender('canvas restored', name));
  } catch { /* ignore */ }
}

/**
 * @typedef {{ name: string, ms: number, cut: boolean, parts?: { name: string, ms: number }[] }} MountStep
 * @typedef {{ hit?: number, stale?: number, fetched?: number, bytes?: number, server?: number }} WorkerCounts
 * @typedef {{ reconciling?: boolean, queued?: number, cleanup?: number, sw?: WorkerCounts | null }} ResSnap the resource
 *   cache's state at a mount's start and when its field was shown (resources.js resourceSnap)
 * @typedef {{ at: number, t0: number, kind: string|null, total: number|null, steps: MountStep[],
 *   late: { name: string, ms: number, detail?: string }[], res0: ResSnap | null, res1: ResSnap | null }} MountRecord
 */
/** @type {MountRecord[]} */
const mountLog = [];
export const MOUNT_MAX = 4;
const LATE_MAX = 8;
// the downloads a report sums per mount (Resource Timing): the default buffer of 250 entries is full before a match
try { globalThis.performance?.setResourceTimingBufferSize?.(3000); } catch { /* ignore */ }
/**
 * Time one field mount (ui/fieldHost.js → render/app.js createFieldView) for the report's `mount:` lines: `step(name,
 * cut)` closes a stage (ms since the previous one; `cut` = its wait ended by the deadline, not by the thing arriving),
 * `part(name)` closes a part of the stage still open (the long synchronous `setup`: the stage lists its parts and the
 * `rest` after the last one), `done(kind)` the mount ('engine' | 'fallback' | 'cancelled'), `late(name, detail?)` when
 * something arrived, from the mount's start (art, 3d, scene, the first frame, the field shown — during or after the
 * mount; first of each name only). The last MOUNT_MAX mounts are kept. The field load on phones is slow (maintainer
 * report 2026-10-12) — this says which stage.
 * @param {() => number} [now] ms clock (performance.now)
 */
export function mountTimer(now = () => globalThis.performance.now()) {
  const t0 = now();
  let last = t0, lastPart = t0;
  /** @type {{ name: string, ms: number }[]} */
  let parts = [];
  /** @type {MountRecord} */
  const rec = { at: Date.now(), t0, kind: null, total: null, steps: [], late: [], res0: null, res1: null };
  mountLog.push(rec);
  if (mountLog.length > MOUNT_MAX) mountLog.splice(0, mountLog.length - MOUNT_MAX);
  notePage();
  // the resource cache's work at the start and when the field is shown (or the engine lost): what shared the load with it
  const snap = (/** @type {'res0' | 'res1'} */ key) => {
    try { resSource?.snap?.().then((s) => { if (s) { rec[key] = s; notePage(); } }, () => {}); } catch { /* ignore */ }
  };
  snap('res0');
  return {
    /** @param {string} name @param {boolean} [cut] */
    step(name, cut = false) {
      const t = now();
      /** @type {{ name: string, ms: number, cut: boolean, parts?: { name: string, ms: number }[] }} */
      const s = { name: String(name), ms: t - last, cut: !!cut };
      if (parts.length) { s.parts = [...parts, { name: 'rest', ms: t - lastPart }]; parts = []; }
      rec.steps.push(s);
      last = lastPart = t;
    },
    /** @param {string} name */
    part(name) { const t = now(); parts.push({ name: String(name), ms: t - lastPart }); lastPart = t; },
    /** @param {string} name @param {unknown} [detail] */
    late(name, detail = null) {
      if (rec.late.length < LATE_MAX && !rec.late.some((e) => e.name === name)) {
        rec.late.push({ name: String(name), ms: now() - t0, ...(detail ? { detail: String(detail).slice(0, MESSAGE_MAX) } : {}) });
        if (name === 'shown') snap('res1');
        notePage();
      }
    },
    /** @param {string} kind */
    done(kind) {
      if (rec.kind == null) {
        rec.kind = String(kind); rec.total = now() - t0;
        if (rec.kind !== 'engine') snap('res1');
        notePage();
      }
    },
  };
}
/** A field mount longer ago than this no longer holds the background downloads (a field that never shows). */
export const FIELD_LOADING_MAX_MS = 60_000;
/** The newest field mount is still on its way: begun under FIELD_LOADING_MAX_MS ago, not shown, not cancelled (a lost race
 *  still loads the engine behind the simplified view). @param {number} [t] performance.now() */
export function fieldLoading(t = globalThis.performance?.now?.() ?? 0) {
  const m = mountLog[mountLog.length - 1];
  return !!m && t - m.t0 < FIELD_LOADING_MAX_MS && m.kind !== 'cancelled' && !m.late.some((e) => e.name === 'shown');
}
export const mountRecords = () => mountLog.map((m) => ({ ...m, steps: m.steps.map((s) => ({ ...s, ...(s.parts ? { parts: s.parts.map((p) => ({ ...p })) } : {}) })), late: m.late.map((e) => ({ ...e })) }));
export function clearMountRecords() { mountLog.length = 0; }

const sec = (/** @type {number} */ ms) => (ms / 1000).toFixed(1);
const mbOf = (/** @type {number} */ bytes) => (bytes / 1048576).toFixed(1);
/** The worker's answers: from the cache, fetched again over a stale copy, fetched (MB), left to the server. */
const workerCounts = (/** @type {WorkerCounts} */ w) => `${w.hit ?? 0} cached, ${w.stale ?? 0} stale, ${w.fetched ?? 0} fetched (${mbOf(w.bytes ?? 0)} MB), ${w.server ?? 0} to server`;
/** The `worker` part: its database state (a worker before 2026-11-27 sends none), its answers, the files it could not store. @param {WorkerStatus} w */
const workerPart = (w) => `worker ${w.db ? `db ${w.db}, ` : ''}${workerCounts(w)}${w.unstored ? `, ${w.unstored} not stored` : ''}${w.at ? ` by ${clockOf(w.at)}` : ''}`;
/** A reconcile of a second or more: where its time went (database open, hash read, old caches). @param {ReconcileStatus} r */
const reconcileSplit = (r) => (r.ms != null && r.ms >= 1000 && r.open != null
  ? `; open ${sec(r.open)} s, read ${sec(r.read ?? 0)} s, old caches ${sec(r.old ?? 0)} s` : '');
/** A mount's `res` part: the resource cache's queue at its start and the worker's answers until the field was shown. @param {MountRecord} m */
function mountRes(m) {
  const a = m.res0, b = m.res1;
  if (!a) return null;
  const at = `res ${a.reconciling ? 'reconciling, ' : ''}${a.queued ?? 0} queued, ${a.cleanup ?? 0} stale`;
  if (!a.sw || !b?.sw) return at;
  /** @type {WorkerCounts} */
  const d = {};
  for (const k of /** @type {const} */ (['hit', 'stale', 'fetched', 'bytes', 'server'])) d[k] = Math.max(0, (b.sw[k] ?? 0) - (a.sw[k] ?? 0));
  return `${at}; worker ${workerCounts(d)}`;
}
/**
 * The download's bundles (resources.js `download.bundles`): read whole of those the list names, cut short by a match or
 * a field load, failed, and the files stored from them; nothing when the list names none.
 * @param {{ listed?: number, fetched?: number, stopped?: number, failed?: number, members?: number } | null | undefined} b
 */
function bundlesPart(b) {
  if (!b?.listed) return null;
  return `bundles ${b.fetched ?? 0}/${b.listed} read${b.stopped ? `, ${b.stopped} cut short` : ''}${b.failed ? `, ${b.failed} failed` : ''}, ${b.members ?? 0} files`;
}
/** The `resources:` line (resources.js resourceStatus), or null. @param {ResStatus | null | undefined} s */
function resourcesLine(s) {
  if (!s) return null;
  const r = s.reconcile, d = s.download, c = s.cleanup, w = s.worker;
  return `resources: ${join(
    r ? `reconcile ${clockOf(r.at)} ${r.ms == null ? `running${r.step ? ` (${r.step})` : ''}` : r.skipped ? `${sec(r.ms)} s (list unchanged)` : `${sec(r.ms)} s (${r.keys} keys, ${r.stale} stale, ${r.adopted} adopted${r.refused ? `, ${r.refused} caches refused their keys` : ''}${reconcileSplit(r)})`}` : 'no reconcile',
    d ? `download ${d.phase}${d.phase === 'running' ? ` ${d.done}/${d.total}` : d.queued ? ` (${d.queued} queued)` : ''}${d.failed ? `, ${d.failed} failed` : ''}${d.slowed === 'field' ? ', held (field loading)' : d.slowed === 'match' ? ', 1 at a time (match)' : ''}` : null,
    bundlesPart(d?.bundles),
    r?.differ ? `${r.differ} changed in asset repo (skipped)` : null,
    c && (c.left || c.deleted) ? `cleanup ${c.deleted} deleted, ${c.left} left${c.held ? ', held (match)' : ''}` : null,
    c && (c.legacyLeft || c.moved) ? `old cache ${c.moved || 0} moved${c.legacyLeft ? `, ${c.legacyLeft} left` : ''}` : null,
    w ? workerPart(w) : null)}`;
}
/**
 * The downloads of one mount, from its start to its last late arrival (or 60 s after it began, still loading):
 * Resource Timing entries → files, MB over the network, files with no transfer (browser / service worker cache).
 * @typedef {{ startTime: number, transferSize?: number, decodedBodySize?: number, encodedBodySize?: number }} NetEntry a
 *   Resource Timing entry (the sizes are on PerformanceResourceTiming)
 * @param {{ t0: number, total: number|null, late: { ms: number }[] }} m @param {NetEntry[]} resources
 */
export function mountNet(m, resources) {
  const end = m.t0 + Math.max(m.total ?? 60000, ...m.late.map((e) => e.ms));
  let files = 0, bytes = 0, cached = 0;
  for (const r of resources) {
    if (!(r.startTime >= m.t0 && r.startTime <= end)) continue;
    files++;
    const sent = r.transferSize ?? 0;
    if (sent > 0) bytes += sent; else if ((r.decodedBodySize ?? 0) > 0 || (r.encodedBodySize ?? 0) > 0) cached++;
  }
  return { files, mb: bytes / 1048576, cached };
}

/** `name: message (code)` of an Error, a NetError, a {code, msg} push, a string or anything else. @param {unknown} e */
export function messageOf(e) {
  let s;
  if (e == null) s = String(e);
  else if (typeof e === 'string') s = e;
  else if (typeof e === 'object') {
    const err = /** @type {{ name?: unknown, message?: unknown, msg?: unknown, code?: unknown }} */ (e);
    const name = typeof err.name === 'string' && err.name && err.name !== 'Error' ? `${err.name}: ` : '';
    const text = typeof err.message === 'string' && err.message ? err.message : typeof err.msg === 'string' ? err.msg : '';
    const code = typeof err.code === 'string' || typeof err.code === 'number' ? String(err.code) : '';
    if (text) s = `${name}${text}${code && !text.includes(code) ? ` (${code})` : ''}`;
    else if (code) s = `${name}${code}`;
    else { try { s = JSON.stringify(err); } catch { s = Object.prototype.toString.call(err); } }
  } else s = String(e);
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > MESSAGE_MAX ? `${s.slice(0, MESSAGE_MAX - 1)}…` : s;
}

/** The first STACK_LINES frames of `err.stack`, each without the page's scheme and host (`/js/ui/x.js:12:5`). @param {unknown} err */
export function stackOf(err) {
  const st = err && typeof err === 'object' ? (/** @type {{ stack?: unknown }} */ (err)).stack : null;
  const raw = typeof st === 'string' ? st : '';
  if (!raw) return null;
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  // V8 starts with "Name: message"; Firefox / Safari list frames only
  const frames = lines.filter((l, i) => !(i === 0 && !/^at |@|:\d+:\d+\)?$/.test(l)));
  const out = frames.slice(0, STACK_LINES).map(stripHosts);
  return out.length ? out.join('\n') : null;
}

/**
 * Cut `scheme://host[:port]` from every URL (a LAN server's address, a domain) and the build prefix `/b/<tag>[/r]` of the
 * versioned code URLs (server/http/buildTag.js): the path is what locates the code.
 */
export const stripHosts = (/** @type {unknown} */ s) => String(s).replace(/\b[a-z][a-z0-9+.-]*:\/\/[^/\s)]+/gi, '').replace(/\/b\/[0-9a-f]{12}(?:\/r)?(?=\/)/g, '');

/**
 * Record an error. An entry identical to the newest one (same source, message and stack) raises its count instead.
 * The battle on screen when it happened is noted (`battleId`): the feedback counts each battle's errors.
 * @param {string} source @param {unknown} err @param {string|null} [detail] @param {number} [at] epoch ms
 */
export function recordError(source, err, detail = null, at = Date.now()) {
  const message = stripHosts(messageOf(err));
  const stack = stackOf(err);
  const det = detail == null ? null : stripHosts(String(detail)).slice(0, MESSAGE_MAX);
  const battleId = currentBattle()?.battleId ?? null;
  total++;
  const last = log[log.length - 1];
  if (last && last.source === source && last.message === message && last.stack === stack && last.detail === det && last.battleId === battleId) {
    last.count++;
    last.lastAt = at;
    notePage();
    return last;
  }
  const e = { source: String(source), message, stack, detail: det, battleId, at, lastAt: at, count: 1 };
  log.push(e);
  while (log.length > LOG_MAX) { log.shift(); dropped++; }
  notePage();
  return e;
}

/** The log, oldest first (copies). */
export const errorLog = () => log.map((e) => ({ ...e }));
/** Errors recorded on this page (repeats included). */
export const errorCount = () => total;
export function clearErrorLog() { log.length = 0; total = 0; dropped = 0; }

/** @typedef {{ battleId: string, fieldId?: string, kind?: string, spec: object, time?: number }} BattleOnScreen */
/** @type {(() => BattleOnScreen | null) | null} */
let battleSource = null;
/** @param {() => (BattleOnScreen | null)} fn */
export function setBattleSource(fn) { battleSource = typeof fn === 'function' ? fn : null; }
/** The battle on screen for a report, or null. */
export function currentBattle() {
  try { return battleSource ? battleSource() || null : null; } catch { return null; }
}

/** The match a battleId belongs to: its prefix `<seed36>[-<matchNo36>]` (server/match/Match.js battlePrefix). */
export const matchKeyOf = (/** @type {unknown} */ battleId) => (typeof battleId === 'string' ? battleId.split('.')[0] : '');

/** @type {{ battleId: string, fieldId: string|null, kind: string|null, spec: object }[]} */
const battles = [];
export const BATTLES_KEPT = 40;
/**
 * Keep one of the runner's own battles of this match (its b.start fields). A battle of another match clears the list.
 * @param {{ battleId: string, fieldId?: string|null, kind?: string|null, spec: object }} b
 */
export function rememberBattle(b) {
  if (!b || typeof b.battleId !== 'string' || !b.spec) return;
  if (battles.length && matchKeyOf(battles[0].battleId) !== matchKeyOf(b.battleId)) battles.length = 0;
  if (battles.some((x) => x.battleId === b.battleId)) return;
  battles.push({ battleId: b.battleId, fieldId: b.fieldId ?? null, kind: b.kind ?? null, spec: b.spec });
  while (battles.length > BATTLES_KEPT) battles.shift();
}
export function clearBattles() { battles.length = 0; }
/** How many battles matchBattles would attach. */
export const battleCount = () => battles.length;

/**
 * This match's battles as the feedback attaches them, oldest first: b.start payloads (the dev tools replay them) with
 * the secrets of `state` replaced as exact values, each with the errors recorded while it was on screen (`errors`).
 * @param {DiagState} state the store state
 * @returns {{ match: string, list: object[] }}
 */
export function matchBattles(state) {
  const pairs = secretsOf(state);
  const errs = new Map();
  for (const e of log) if (e.battleId) errs.set(e.battleId, (errs.get(e.battleId) || 0) + e.count);
  const list = battles.map((b) => redactValues({
    t: 'b.start', battleId: b.battleId, fieldId: b.fieldId, kind: b.kind, spec: b.spec, errors: errs.get(b.battleId) || 0,
  }, pairs));
  return { match: battles.length ? matchKeyOf(battles[0].battleId) : '', list };
}

/** Secrets worth replacing: non-empty strings, later pair winning when the same value is listed twice. @param {[string, string][]} pairs */
function secretMap(pairs) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const [v, ph] of pairs) {
    if (typeof v === 'string' && v.trim()) map.set(v, ph);
  }
  return map;
}

/**
 * Replace each secret only as a whole token, longest first, in one pass (a placeholder is never scanned again).
 * A token is bounded by the start or end of the text, or by anything that is not a letter, a digit or `_`, so
 * "char" does not eat `chess_char_…`, "player" does not eat "players", and "W" does not eat "Windows". "W-W" is
 * two tokens. The left boundary is a consumed character (or the start): a lookbehind is a SyntaxError in Safari
 * before 16.4.
 * @param {string} text @param {[string, string][]} pairs [value, placeholder]
 */
export function redact(text, pairs) {
  const map = secretMap(pairs);
  const list = [...map.keys()].sort((a, b) => b.length - a.length);
  if (!list.length) return String(text);
  const esc = (/** @type {string} */ v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = '[\\p{L}\\p{N}_]';
  const re = new RegExp(`(?<pre>^|(?!${word})[\\s\\S])(?<hit>${list.map(esc).join('|')})(?!${word})`, 'gu');
  return String(text).replace(re, (...args) => {
    const g = args[args.length - 1];
    return `${g.pre}${map.get(g.hit)}`;
  });
}

/**
 * Copy `value`, replacing a string only when it is exactly a secret (object keys included). A longer string that
 * merely contains the secret, such as a chess id or a note, is kept. This is what the attached battle JSON uses;
 * token replacement would still rewrite `"charge the char"` when the name is `char`.
 * @template T
 * @param {T} value @param {[string, string][]} pairs
 * @returns {T} the same shape (a secret string becomes its placeholder)
 */
export function redactValues(value, pairs) {
  const map = secretMap(pairs);
  /** @type {(v: unknown) => unknown} */
  const walk = (v) => {
    if (typeof v === 'string') return map.has(v) ? map.get(v) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [k, val] of Object.entries(v)) out[map.has(k) ? /** @type {string} */ (map.get(k)) : k] = walk(val);
      return out;
    }
    return v;
  };
  return /** @type {T} */ (walk(value));
}

/**
 * The store state as the report reads it (store.js AppState; a test passes a part of it).
 * @typedef {{ name?: unknown }} Named
 * @typedef {{
 *   me?: { name?: unknown, token?: unknown } | null,
 *   room?: { code?: unknown, mode?: string, difficulty?: string, seats?: (Named | null)[], spectators?: (Named | null)[] } | null,
 *   match?: { public?: { phase?: string, round?: number, players?: (Named | null)[] } | null,
 *     battle?: { kind?: string, fieldId?: string, authoritative?: boolean, watch?: boolean, done?: boolean, loading?: boolean,
 *       paused?: boolean, speed?: number } | null } | null,
 *   session?: { entered?: boolean } | null,
 *   connection?: { status?: string, ping?: number | null, attempt?: number, lastError?: unknown } | null,
 *   [key: string]: unknown }} DiagState
 * @typedef {{ quality: string, damageNumbers?: boolean, muted?: boolean }} DiagSettings
 */
/** [value, placeholder] pairs of what a report must not show: player names, the room code, the reconnect token. @param {DiagState} state */
export function secretsOf(state) {
  /** @type {[string, string][]} */
  const pairs = [];
  const names = new Map();
  const addName = (/** @type {unknown} */ n) => {
    if (typeof n !== 'string' || !n.trim() || names.has(n)) return;
    names.set(n, n === state?.me?.name ? '<me>' : `<player${names.size + 1}>`);
  };
  addName(state?.me?.name);
  for (const s of state?.room?.seats || []) addName(s?.name);
  for (const s of state?.room?.spectators || []) addName(s?.name);
  for (const p of state?.match?.public?.players || []) addName(p?.name);
  for (const [n, ph] of names) pairs.push([n, ph]);
  if (state?.room?.code) pairs.push([String(state.room.code), '<room>']);
  if (state?.me?.token) pairs.push([String(state.me.token), '<token>']);
  return pairs;
}

const pad2 = (/** @type {number} */ n) => String(n).padStart(2, '0');
const clockOf = (/** @type {number} */ ms) => { const d = new Date(ms); return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`; };
const spanOf = (/** @type {number} */ ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${pad2(Math.floor(s / 60) % 60)}m` : `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
};
const join = (/** @type {unknown[]} */ ...parts) => parts.filter((p) => p != null && p !== '' && p !== false).join(' | ');

/** The `render events:` line, or null. @param {RenderEvent[]} rev */
function renderEventsLine(rev) {
  return rev.length ? `render events: ${rev.map((e) => `${clockOf(e.at)} ${e.event}${e.detail ? ` (${e.detail})` : ''}`
    + (/** @type {number} */ (e.count) > 1 ? ` x${e.count}, last ${clockOf(/** @type {number} */ (e.lastAt))}` : '')).join('; ')}` : null;
}
/** One `mount:` line per mount; a stage with parts lists those of 0.05 s or more. @param {MountRecord[]} mounts @param {NetEntry[] | null} resources */
function mountLines(mounts, resources) {
  return mounts.map((m) => {
    const head = m.kind ? `${m.kind} in ${sec(/** @type {number} */ (m.total))} s` : 'loading';
    const steps = m.steps.map((s) => {
      const parts = (s.parts || []).filter((p) => p.ms >= 50);
      return `${s.name} ${sec(s.ms)}${parts.length ? ` (${parts.map((p) => `${p.name} ${sec(p.ms)}`).join(', ')})` : ''}${s.cut ? ' cut' : ''}`;
    }).join(', ');
    const late = m.late.length ? `arrived: ${m.late.map((e) => `${e.name} ${sec(e.ms)} s${e.detail ? ` (${e.detail})` : ''}`).join(', ')}` : null;
    const net = resources ? mountNet(m, resources) : null;
    return `mount: ${join(`${clockOf(m.at)} ${head}`, steps || null, late,
      net && net.files ? `net ${net.files} files, ${net.mb.toFixed(1)} MB${net.cached ? `, ${net.cached} cached` : ''}` : null, mountRes(m))}`;
  });
}
/** The `errors:` line and the entries, newest first. @param {LogEntry[]} entries @param {number} tot @param {number} drop */
function errorLines(entries, tot, drop) {
  const lines = [`errors: ${tot ? `${tot} recorded${drop ? `, ${drop} oldest entries dropped` : ''}` : 'none recorded'}`];
  entries.slice().reverse().forEach((e, i) => {
    lines.push(`#${i + 1} ${clockOf(e.at)}${e.count > 1 ? ` (x${e.count}, last ${clockOf(e.lastAt)})` : ''} ${e.source}: ${e.message}`
      + (e.battleId ? ` [battle ${e.battleId}]` : ''));
    if (e.detail) lines.push(`   ${e.detail}`);
    if (e.stack) for (const l of e.stack.split('\n')) lines.push(`   ${l}`);
  });
  return lines;
}

// ---- the page before this one ----------------------------------------------------------------------------------
// A phone ends a page without a word: iOS frees a home-screen app's page in the background or when it runs out of
// memory, and the page that opens next starts with an empty log, no perf samples and no mounts (an iPhone report of
// 2026-10-17: a match watched to round 8, the page reopened mid-match, the report covered its last 37 s). So this page
// keeps its report lines in localStorage (every PAGE_BEAT_MS while shown, a second after an error / render event /
// mount stage, at once when hidden or closed) and the next page's report lists them as `prev …` lines, with how the
// page ended: closed (pagehide), ended in the background (hidden at its last record) or ended on screen (a crash, or
// the system ended it while shown). One record for the browser: two open tabs overwrite each other's.
const PAGE_KEY = 'sp.diag.page';
export const PAGE_BEAT_MS = 10_000;
/** A record older than this when this page opened is not reported. */
export const PAGE_KEEP_MS = 6 * 3600_000;
const PAGE_ERRORS = 10;
let pageOn = false;
/** @type {PageRecord | null} */
let prevPage = null;
let pageVis = 'visible', /** @type {number | null} */ hiddenAt = null, pageEnded = false;
/**
 * This page hidden (another app, the screen off): how often, and the last time from / to (to null: still hidden).
 * @type {{ count: number, from: number | null, to: number | null }}
 */
const hides = { count: 0, from: null, to: null };
export const pageHides = () => ({ ...hides });
/** `hidden 14x, last 02:10:03–02:11:20` (or `…, hidden now`), or null. @param {{ count: number, from: number | null, to: number | null } | null | undefined} h */
function hidesPart(h) {
  return h && h.count ? `hidden ${h.count}x, last ${clockOf(/** @type {number} */ (h.from))}${h.to ? `–${clockOf(h.to)}` : ', hidden now'}` : null;
}
let saveTimer = 0;
const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/**
 * This page's record as the next page would report it. @param {number} [now]
 * @typedef {ReturnType<typeof pageRecord>} PageRecord
 */
export function pageRecord(now = Date.now()) {
  let resources;
  try { resources = globalThis.performance?.getEntriesByType?.('resource') ?? null; } catch { resources = null; }
  const errs = errorLog().slice(-PAGE_ERRORS);
  return {
    v: 1, start: pageStart, at: now, version: APP_VERSION, vis: pageVis, hiddenAt, ended: pageEnded, hides: pageHides(),
    lines: [renderEventsLine(renderEvents()), resourcesLine(resStatus()), ...mountLines(mountRecords(), resources), ...perfLines().map((l) => `perf: ${l}`),
      ...errorLines(errs, total, dropped + log.length - errs.length)].filter(Boolean),
  };
}
function savePage() {
  if (!pageOn) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  try { storage()?.setItem(PAGE_KEY, JSON.stringify(pageRecord())); } catch { /* full or blocked: the next page reports nothing */ }
}
/** Something worth keeping changed: saved within a second (a burst of errors writes once). */
function notePage() {
  if (pageOn && !saveTimer) saveTimer = setTimeout(savePage, 1000);
}
/** The record of the page before this one (installPageRecord), or null. */
export const previousPage = () => (prevPage ? { ...prevPage, lines: prevPage.lines.slice() } : null);

/** main.js boot: read the previous page's record, then keep this page's. */
export function installPageRecord() {
  if (pageOn) return;
  const g = globalThis;
  try {
    const raw = storage()?.getItem(PAGE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    prevPage = p && p.v === 1 && Array.isArray(p.lines) && Number.isFinite(p.at) && Number.isFinite(p.start) && pageStart - p.at < PAGE_KEEP_MS ? p : null;
  } catch { prevPage = null; }
  pageOn = true;
  pageVis = g.document?.visibilityState === 'hidden' ? 'hidden' : 'visible';
  g.document?.addEventListener?.('visibilitychange', () => {
    const hidden = g.document.visibilityState === 'hidden';
    if (hidden && pageVis !== 'hidden') { hides.count++; hides.from = Date.now(); hides.to = null; }
    else if (!hidden && pageVis === 'hidden' && hides.count) hides.to = Date.now();
    pageVis = hidden ? 'hidden' : 'visible';
    hiddenAt = hidden ? Date.now() : null;
    savePage();
  });
  g.addEventListener?.('pagehide', () => { pageEnded = true; savePage(); });
  g.addEventListener?.('pageshow', (ev) => { if (ev.persisted && pageEnded) { pageEnded = false; savePage(); } });
  const beat = setInterval(() => { if (pageVis === 'visible') savePage(); }, PAGE_BEAT_MS);
  /** @type {{ unref?: () => void }} */ (/** @type {unknown} */ (beat)).unref?.(); // Node (tests): the beat never holds the process
  savePage();
}

/** The `previous page:` section of a report (empty without a record). @param {PageRecord | null} p */
function previousLines(p) {
  if (!p) return [];
  const end = p.ended ? 'closed (a reload, a link or the app closed)'
    : p.vis === 'hidden' ? `not closed: ended in the background, hidden since ${clockOf(p.hiddenAt ?? p.at)} (the system, or the app swiped away)`
      : 'not closed: on screen at its last record (a crash, or the system ended it while shown)';
  return ['', `previous page: ${join(`${clockOf(p.start)}–${clockOf(p.at)} (open ${spanOf(p.at - p.start)})`, `version ${p.version}`, hidesPart(p.hides), end)}`,
    ...p.lines.map((l) => `prev ${l}`)];
}

/**
 * The report text: a ```text block (version, time, browser, screen, connection, where the player is, settings, the
 * error log newest first) and, with `battle`, a ```json block of its spec. Secrets of `state` are whole tokens in the
 * prose and exact string values in the JSON.
 * `render` is the field view on screen (`{ kind: 'engine' | 'fallback', board3d, pixi }`, render/app.js stats().board3d and
 * uploadCheck()) and
 * `renderEvents` what its board did (noteRender), `mounts` the field mounts (mountTimer) and `resources` the page's
 * Resource Timing entries (each mount line sums the downloads of its window), `perf` the performance HUD's lines
 * (setPerfSource; empty unless `?perf=1`), `resourceStatus` the resource cache's state (setResourceSource; null: no
 * line), `previous` the page before this one (previousPage(); default: the record installPageRecord read, null in tests
 * that do not install it).
 * @typedef {{ kind?: string | null, board3d?: { on?: boolean, textures?: number, pref?: string, error?: string | null,
 *   recovering?: boolean, waiting?: boolean, losses?: number } | null, pixi?: { losses?: number } | null }} RenderView
 * @param {{ state: DiagState, env?: Partial<ReturnType<typeof browserEnv>>, settings?: DiagSettings | null,
 *   battle?: BattleOnScreen | null, entries?: LogEntry[], dropped?: number, total?: number,
 *   now?: number, pageStart?: number, version?: string, render?: RenderView | null, renderEvents?: RenderEvent[],
 *   mounts?: MountRecord[], resources?: NetEntry[] | null, perf?: string[], resourceStatus?: ResStatus | null,
 *   previous?: PageRecord | null, hides?: { count: number, from: number|null, to: number|null } }} input
 */
export function buildDiagnostics(input) {
  const { state = {}, env = {}, settings = null, battle = null } = input;
  const entries = input.entries ?? errorLog();
  const now = input.now ?? Date.now();
  const lines = [];
  lines.push('Stronghold-Protocol diagnostics');
  lines.push(`version: ${input.version ?? APP_VERSION}`);
  lines.push(`time: ${join(`${new Date(now).toISOString()}`, `page open ${spanOf(now - (input.pageStart ?? pageStart))}`, hidesPart(input.hides ?? pageHides()))}`);
  if (env.ua) lines.push(`browser: ${env.ua}`);
  // gpu.js: a software renderer means hardware acceleration is off (or the GPU / driver is blocklisted)
  if (env.gpu) lines.push(`gpu: ${join(env.gpu, env.gpuAccel === 'software' ? 'software rendering' : null)}`);
  lines.push(`device: ${join(env.viewport, env.dpr ? `@${env.dpr}x` : null, env.touch ? 'touch' : null, env.cores ? `${env.cores} threads` : null,
    env.memoryGB ? `${env.memoryGB} GB` : null, env.lang ? `lang ${env.lang}` : null, env.uiLang ? `ui ${env.uiLang}` : null,
    env.standalone ? 'home-screen app' : null, env.sw ? 'resource worker' : null) || 'unknown'}`);
  const c = state.connection || {};
  lines.push(`connection: ${join(c.status || 'unknown', typeof c.ping === 'number' && Number.isFinite(c.ping) ? `ping ${Math.round(c.ping)} ms` : null,
    c.attempt ? `retry ${c.attempt}` : null, c.lastError ? `last error ${messageOf(c.lastError)}` : null)}`);
  const pub = state.match?.public || null;
  const room = state.room || null;
  lines.push(`where: ${join(pub?.phase ? `phase ${pub.phase}` : room ? 'room' : state.session?.entered ? 'lobby' : 'title',
    Number.isFinite(pub?.round) ? `round ${pub?.round}` : null, room?.mode ? `mode ${room.mode}` : null,
    room?.difficulty ? `difficulty ${room.difficulty}` : null,
    Array.isArray(pub?.players) ? `players ${pub.players.length}` : Array.isArray(room?.seats) ? `seats ${room.seats.filter(Boolean).length}` : null)}`);
  const b = state.match?.battle || null;
  if (b) {
    lines.push(`battle: ${join(b.kind, b.fieldId ? `field ${b.fieldId}` : null, b.authoritative ? 'authoritative' : b.watch ? 'watching' : null,
      b.done ? 'done' : b.loading ? 'loading' : 'running', b.paused ? 'paused' : null, Number.isFinite(b.speed) ? `${b.speed}x` : null)}`);
  }
  if (settings) {
    lines.push(`settings: ${join(`quality ${qualityInEffect(settings.quality)}`, settings.damageNumbers ? 'damage numbers' : null, settings.muted ? 'muted' : null)}`);
  }
  const rv = input.render ?? null;
  const b3 = rv?.board3d || null;
  if (rv) {
    lines.push(`render: ${join(`view ${rv.kind || 'unknown'}`,
      !b3 ? null : b3.on ? `3d on${Number.isFinite(b3.textures) ? ` (${b3.textures} textures)` : ''}`
        : `3d off${b3.pref && b3.pref !== 'auto' ? ` (${b3.pref} chosen)` : ''}${b3.error ? `: ${b3.error}` : ''}`,
      b3 && !b3.on && b3.recovering ? 'retry pending' : null, b3 && !b3.on && b3.waiting ? 'waiting for the page to be shown' : null,
      b3?.losses ? `context lost ${b3.losses}x` : null,
      rv.pixi?.losses ? `pixi context lost ${rv.pixi.losses}x` : null, uploadCheckText(rv.pixi))}`);
  }
  const rev = renderEventsLine(input.renderEvents ?? renderEvents());
  if (rev) lines.push(rev);
  const rl = resourcesLine(input.resourceStatus !== undefined ? input.resourceStatus : resStatus());
  if (rl) lines.push(rl);
  lines.push(...mountLines(input.mounts ?? mountRecords(), input.resources ?? null));
  for (const l of input.perf ?? perfLines()) lines.push(`perf: ${l}`);
  lines.push('');
  lines.push(...errorLines(entries, input.total ?? total, input.dropped ?? dropped));
  lines.push(...previousLines(input.previous !== undefined ? input.previous : prevPage));
  const pairs = secretsOf(state);
  let text = redact(`\`\`\`text\n${lines.join('\n')}\n\`\`\``, pairs);
  if (battle && battle.spec) {
    const round = (/** @type {{ round?: unknown }} */ (battle.spec)).round;
    const head = join(`battle ${battle.battleId}`, battle.kind, Number.isFinite(round) ? `round ${round}` : null,
      typeof battle.time === 'number' && Number.isFinite(battle.time) ? `copied at ${battle.time.toFixed(2)} s` : null);
    const payload = redactValues({
      t: 'b.start', battleId: battle.battleId, fieldId: battle.fieldId, kind: battle.kind, spec: battle.spec,
    }, pairs);
    text += `\n\n${redact(head, pairs)}\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
  }
  return text;
}

/** What the report says about this browser and device (null fields stay out). */
export function browserEnv() {
  const g = globalThis;
  const gpu = (() => { try { return g.document ? gpuStatus() : null; } catch { return null; } })();
  let uiLang = null;
  try { uiLang = g.document?.documentElement?.lang || null; } catch { /* ignore */ }
  return {
    ua: g.navigator?.userAgent ?? null,
    gpu: gpu ? (gpu.accel === 'none' ? 'no WebGL' : gpu.renderer) : null,
    gpuAccel: gpu?.accel ?? null,
    viewport: Number.isFinite(g.innerWidth) ? `${g.innerWidth}x${g.innerHeight}` : null,
    dpr: g.devicePixelRatio ?? null,
    touch: !!(g.matchMedia && g.matchMedia('(pointer: coarse)').matches),
    cores: g.navigator?.hardwareConcurrency ?? null,
    memoryGB: g.navigator?.deviceMemory ?? null,
    lang: g.navigator?.language ?? null,
    uiLang,
    // an iPhone's home-screen app and its Safari tab keep separate caches (the field's first load differs)
    standalone: !!(g.navigator?.standalone || (g.matchMedia && g.matchMedia('(display-mode: standalone)').matches)),
    sw: !!g.navigator?.serviceWorker?.controller,
  };
}

/**
 * The report of this page: the given store state and settings, this browser, the log and, with `attachBattle`, the
 * battle on screen.
 * @param {{ state: DiagState, settings?: DiagSettings | null, attachBattle?: boolean }} opts
 */
export function diagnosticsText({ state, settings = null, attachBattle = false }) {
  let resources;
  try { resources = globalThis.performance?.getEntriesByType?.('resource') ?? null; } catch { resources = null; }
  return buildDiagnostics({ state, settings, env: browserEnv(), battle: attachBattle ? currentBattle() : null, render: renderStatus(), resources });
}

/** The field view on screen (ui/fieldHost.js keeps it on `__SP_VIEW__`): its kind and its board's 3D state, or null. */
export function renderStatus(g = globalThis) {
  const v = g.__SP_VIEW__;
  if (!v) return null;
  /** @template T @param {() => T} f @returns {T | null} */
  const safe = (f) => { try { return f() ?? null; } catch { return null; } };
  return { kind: typeof v.kind === 'string' ? v.kind : null, board3d: safe(() => v.raw?.stats?.()?.board3d), pixi: safe(() => v.raw?.uploadCheck?.()) };
}

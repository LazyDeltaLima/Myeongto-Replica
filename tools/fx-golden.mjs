#!/usr/bin/env node
// tools/fx-golden.mjs — the effect event golden (2026-10-20): which official effect prefabs the battle events start, per unit and
// event kind, over the golden battle corpus (tools/golden.mjs: roster, standins, diy, fields).
//
// Every battle scenario runs through the production BattleSpec path (golden.mjs battleOf); its client events are drained every
// 3 ticks (the match's watcher cadence) and handed, as the browser hands them (render/app.js), to render/fxgame.js
// createFxLayer({ dry: true, trace }) with views built from the field's UnitInfo and the snapshots. The layer loads nothing
// (`dry`) and reports every prefab it starts (`trace`: play() by event kind, spawn() by its caller). A scenario's digest is the
// SET of distinct lines `<unit> <kind> <prefabs>[ → self | ally | foe]` (`-`: an effect with no owner, its target by side) — the bindings (fxgame.js, fxmap.js, the extracted modes.json /
// index.json), not how often or when they fire, so a gameplay change that moves the golden digests rarely moves this one,
// while a binding change shows as the lines it adds and drops: the list to check on screen.
// Units are named by their model (UnitInfo spine, else def id); enemies by def id.
//
// Needs the extracted effects (public/assets/local/fx, git-ignored, `npm run setup`); without them the test skips. Not
// replayed: the status effects (render/fxstatus.js draws them from the snapshot flags, not the events), 丰川祥子's notes (they
// start only after a WebP check the layer cannot pass in node) and anything that starts after a prefab has loaded.
//
// Usage: node tools/fx-golden.mjs [--family roster,diy] [--only id,id] [--update] [--print id]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { scenariosOf, battleOf, GOLDEN_DIR } from './golden.mjs';
import { createFxLayer } from '../public/js/render/fxgame.js';
import { getData } from '../server/data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FX_DIR = join(ROOT, 'public/assets/local/fx');
export const FX_GOLDEN = join(GOLDEN_DIR, 'fx-events.json');
export const FX_FAMILIES = Object.freeze(['roster', 'standins', 'diy', 'fields']);
const DRAIN_EVERY = 3;
const TICK = 1 / 30;

/** Whether the extracted effects are installed (the layer's index and bindings). */
export function fxAvailable() {
  return ['index.json', 'modes.json'].every((f) => existsSync(join(FX_DIR, f)));
}

const quiet = { warn() {}, error() {}, info() {}, debug() {} };
let gameData = null;
const enemyDef = (id) => (gameData ||= getData({ log: quiet })).enemies?.[id] ?? null;

/** The layer's files from disk (the browser fetches them from /assets/local/fx/). */
function serveFx() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const m = /^\/assets\/local\/fx\/([\w-]+\.json)$/.exec(String(url));
    const file = m && join(FX_DIR, m[1]);
    if (!file || !existsSync(file)) return { ok: false, json: async () => null };
    const json = JSON.parse(readFileSync(file, 'utf8'));
    return { ok: true, json: async () => json };
  };
  return () => { globalThis.fetch = fetch0; };
}

const macrotask = () => new Promise((r) => setImmediate(r));

/** A view as render/units.js keeps it, reduced to what fxgame.js reads (position, life, facing, flags, info). */
function makeView(info) {
  const facing = info.facing === -1 ? -1 : 1;
  return { id: info.id, info, x: info.x ?? 0, y: info.y ?? 0, z: 0, alive: true, facing, visFacing: info.side === 'enemy' ? -1 : facing, flags: 0, dir: info.dir };
}

/**
 * Run one battle scenario with the effect layer watching; resolves its sorted distinct trace lines.
 * Call inside serveFx() (fxDigests does).
 */
export async function traceScenario(sc) {
  // the layer draws a clip variant at random when the view has no model (fxgame.js castGroup): seeded per scenario here
  const random0 = Math.random;
  Math.random = seeded(sc.id);
  try { return await traceBattle(sc); } finally { Math.random = random0; }
}

/** mulberry32 seeded by an FNV-1a hash of `s`. */
function seeded(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function traceBattle(sc) {
  const b = battleOf(sc);
  const views = new Map();
  const label = new Map(); // unit id → its name in the lines
  const name = (id) => (id == null ? '-' : label.get(id) ?? `#${id}`);
  const lines = new Set();
  // the target by its relation to the unit (self / ally / enemy), not by identity: which enemy a hit lands on is gameplay
  const side = (id) => views.get(id)?.info?.side ?? null;
  const rel = (by, tgt) => (tgt === by ? 'self' : by == null ? side(tgt) ?? '?' : side(tgt) === side(by) ? 'ally' : side(tgt) ? 'foe' : '?');
  const trace = (p) => {
    const tgt = p.at ?? p.on ?? null;
    lines.add(`${name(p.by)} ${p.kind}${p.tag ? `:${p.tag}` : ''} ${p.names.join('+')}${tgt != null ? ` → ${rel(p.by, tgt)}` : ''}`);
  };
  let rect = null;
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', fieldRect: () => rect, enemyDef, trace, dry: true });
  await macrotask(); // the index and bindings load
  const add = (info) => {
    if (!info || info.id == null) return;
    label.set(info.id, info.side === 'enemy' ? info.defId : (info.spine || info.defId));
    views.set(info.id, makeView(info));
  };
  const cam = { dist: 20 };
  const vp = { width: 1, height: 1 };
  const cap = Number.isFinite(sc.cap) ? sc.cap : 1e9;
  let ticks = 0;
  const frame = () => {
    for (const e of b.drainEvents()) {
      if (e[0] === 'spawn') add(e[1]);
      layer.onEvent(e, views);
      if (e[0] === 'die') { const v = views.get(e[1]); if (v) v.alive = false; }
      else if (e[0] === 'deploy') { const v = views.get(e[1]); if (v) v.alive = true; }
    }
    const s = b.snapshot();
    for (const u of s.units) {
      const v = views.get(u[0]);
      if (!v) continue;
      const dx = u[1] - v.x;
      if (v.info.side === 'enemy' && Math.abs(dx) > 1e-3) v.visFacing = dx < 0 ? -1 : 1;
      v.x = u[1]; v.y = u[2]; v.flags = u[7];
    }
    layer.update(DRAIN_EVERY * TICK, cam, vp);
  };
  for (;;) {
    if (!rect) { const f = b.fieldMeta(); rect = f.rect; for (const u of f.units) add(u); }
    if (b.finished) break;
    if (b.time >= cap - 1e-9) { b.forceEnd('forced'); break; }
    b.step();
    ticks++;
    if (ticks % DRAIN_EVERY === 0) { frame(); await macrotask(); }
  }
  frame();
  await macrotask();
  layer.destroy?.();
  return [...lines].sort();
}

/** { [scenario id]: lines } of the selected battle scenarios of `families`. */
export async function fxDigests(families = FX_FAMILIES, { select = () => true, log = null } = {}) {
  const restore = serveFx();
  try {
    const out = {};
    for (const f of families) {
      for (const sc of scenariosOf(f)) {
        if (sc.kind === 'match' || !select(sc)) continue;
        const t0 = performance.now();
        out[sc.id] = await traceScenario(sc);
        log?.(`${f}\t${sc.id}\t${out[sc.id].length} lines\t${Math.round(performance.now() - t0)} ms`);
      }
    }
    return out;
  } finally { restore(); }
}

export function loadFxGolden() {
  return existsSync(FX_GOLDEN) ? JSON.parse(readFileSync(FX_GOLDEN, 'utf8')) : null;
}

/** Per scenario: the lines `computed` adds (+) and drops (−) against `stored`; scenarios missing on either side. */
export function compareFx(stored, computed) {
  const out = [];
  for (const [id, lines] of Object.entries(computed)) {
    const old = stored[id];
    if (!old) { out.push({ id, missing: 'stored' }); continue; }
    const had = new Set(old), has = new Set(lines);
    const add = lines.filter((l) => !had.has(l)), drop = old.filter((l) => !has.has(l));
    if (add.length || drop.length) out.push({ id, add, drop });
  }
  return out;
}

export function formatFxDiffs(list, { maxLines = 12 } = {}) {
  return list.map((d) => {
    if (d.missing) return `${d.id}: no stored lines (node tools/fx-golden.mjs --update)`;
    const ls = [...d.drop.map((l) => `  − ${l}`), ...d.add.map((l) => `  + ${l}`)];
    return `${d.id}: +${d.add.length} −${d.drop.length}\n${ls.slice(0, maxLines).join('\n')}${ls.length > maxLines ? `\n  … ${ls.length - maxLines} more` : ''}`;
  }).join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const opt = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const k = args[i].slice(2);
    opt[k] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  }
  if (!fxAvailable()) { console.error(`no extracted effects in ${FX_DIR} (npm run setup)`); process.exit(2); }
  const families = opt.family ? String(opt.family).split(',') : FX_FAMILIES.slice();
  const only = opt.only || opt.print ? new Set(String(opt.only || opt.print).split(',')) : null;
  const t0 = performance.now();
  const got = await fxDigests(families, { select: (sc) => !only || only.has(sc.id), log: opt.verbose ? console.log : null });
  const ms = Math.round(performance.now() - t0);
  if (opt.print) { for (const [id, lines] of Object.entries(got)) console.log(`${id}\n${lines.map((l) => `  ${l}`).join('\n')}`); process.exit(0); }
  const stored = loadFxGolden()?.scenarios ?? {};
  if (opt.update) {
    const scenarios = only ? { ...stored, ...got } : got;
    const sorted = Object.fromEntries(Object.keys(scenarios).sort().map((k) => [k, scenarios[k]]));
    const doc = { about: 'tools/fx-golden.mjs: the official effect prefabs the battle events start, per unit and event kind (a set per scenario)', scenarios: sorted };
    writeFileSync(FX_GOLDEN, `${JSON.stringify(doc, null, 1)}\n`);
    console.log(`wrote ${FX_GOLDEN.slice(ROOT.length + 1)} (${Object.keys(got).length} scenarios computed, ${ms} ms)`);
    process.exit(0);
  }
  const diffs = compareFx(stored, got);
  if (diffs.length) console.log(formatFxDiffs(diffs));
  console.log(`${diffs.length ? 'MISMATCH' : 'ok'} · ${Object.keys(got).length} scenarios · ${ms} ms`);
  process.exit(diffs.length ? 1 : 0);
}

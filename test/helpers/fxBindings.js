// test/helpers/fxBindings.js — the binding-table check of the hand-written effect tables (docs/rules/fx.md 「바인딩 표」),
// shared by test/render/fx-bindings.test.js and the maintainer's report tools.
//
// Two tables: the buff templates' rows (tools/assets/fx-templates.json, tracked: tools/build-fx-templates.mjs) and the
// client-only rows (public/assets/local/fx/bindings.json, git-ignored: tools/local-extract/fx_bindings.py; null without it).
// handEntries() lists every `cite`d entry of render/ with the prefabs it plays; judge() checks each against the rows of its
// keys; unplayed() lists the rows whose prefab nothing in render/ plays.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_OFFICIAL, tplPlays } from '../../public/js/render/fx/kitofficial.js';
import { rowsFor, buildPlays, isGuard } from '../../tools/build-fx-plays.mjs';
import { JUDGED, whenPlays } from '../../public/js/render/fx/conds.js';
import { KEY_FX, SOURCE_FX, LAYER_FX, STACK_FX, END_FX, STATUS_FX } from '../../public/js/render/fxstatus.js';
import { TALENT_ALWAYS, SKILL_HELD, SKILL_EDGE, NOTE_FX, DEPLOY_FX, noteEffects, effectsFor, isVariant, isDirectional, fxBundleOf } from '../../public/js/render/fxmap.js';
import { PLAYS as FIXED } from './fxPlays.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const LOCAL = path.join(ROOT, 'public/assets/local/fx');

/** { template: rows, local: rows | null, index: { bundles, emitted } | null, modes: object | null } */
export function loadTables() {
  const t = readJson(path.join(ROOT, 'tools/assets/fx-templates.json'));
  const b = existsSync(path.join(LOCAL, 'bindings.json')) ? readJson(path.join(LOCAL, 'bindings.json')) : null;
  const index = existsSync(path.join(LOCAL, 'index.json')) ? readJson(path.join(LOCAL, 'index.json')) : null;
  const modes = existsSync(path.join(LOCAL, 'modes.json')) ? readJson(path.join(LOCAL, 'modes.json')) : null;
  return { template: t.rows, templates: t.templates || {}, local: b ? b.rows : null, index, modes };
}

export { rowsFor };

// ---- the hand tables' entries ------------------------------------------------------------------------------------------

/** The sample inputs a kit plan is called with (every branch of the plans in KIT_OFFICIAL). */
const KIT_O = [
  {}, { left: 0 }, { left: 1 }, { n: 0 }, { n: 1 }, { n: 2 }, { n: 1, max: 3 }, { n: 2, max: 3 }, { n: 3, max: 3 }, { n: -1 }, { charged: 0 }, { charged: 1 },
  { skill: 'swire2_3', targets: [4, 5] }, { token: 'token_10058_sbell2_icetgt' },
  { cells: [[0, 0, 1], [0, 1, 2], [0, 2, 5], [0, 3, 0]] }, { mode: 'Range' }, { mode: 'Melee' }, { signal: 'fireToToken' },
  { signal: 'bomb' }, { name: 'extradition' }, { id: 1, src: 1 }, { cap: 12, n: 12, sk: 1 }, { cap: 12, n: 12, sk: 2 },
  { cap: 12, n: 12, sk: 3 }, { duration: 5 }, { t: 3 }, { ids: [6], off: [7] },
];
const KIT_C = [0, 1, 2].flatMap((skill) => [false, true].flatMap((back) => [false, true].map((foe) => ({ skill, back, foe }))));

/** The client keys a kit plan's `tpl` plays name, over the sample inputs. */
export function planTpls(fn) {
  const out = new Set();
  for (const base of KIT_O) for (const c of KIT_C) {
    let r;
    try { r = fn({ id: 1, src: 2, x: 0, y: 0, tgt: 3, ...base }, c); } catch { continue; }
    for (const p of r?.play || []) if (p.tpl) out.add(p.tpl);
  }
  return [...out];
}

/**
 * The plays (tools/build-fx-plays.mjs) of the cited keys, from the tables on disk: a plan's `tpl` plays as the layer plays
 * them. Without the client-only rows the tests' fixed copy (test/helpers/fxPlays.js) stands in for the keys it holds.
 */
let PLAYS = null;
export const keyPlays = () => (PLAYS ||= withFixed(buildPlays()));
function withFixed(plays) {
  if (existsSync(path.join(LOCAL, 'bindings.json'))) return plays;
  const full = (p) => ({ held: [], once: [], end: [], ...p });
  return { ...plays, keys: { ...Object.fromEntries(Object.entries(FIXED.keys).map(([k, p]) => [k, full(p)])), ...plays.keys } };
}

/** The plays of a kit plan as { n, life, side } ('once' | 'held' | 'flight' | number; 'self' | 'other'). */
function planPlays(fn) {
  const out = [];
  const add = (n, life, side) => { if (typeof n === 'string' && n) out.push({ n, life, side }); };
  for (const base of KIT_O) {
    for (const c of KIT_C) {
      let r;
      try { r = fn({ id: 1, src: 2, x: 0, y: 0, tgt: 3, ...base }, c); } catch { continue; }
      for (const p of (r?.play || []).flatMap((q) => (q.tpl ? tplPlays(q, keyPlays()) : [q]))) {
        const side = p.on === 'op' || p.cast || p.fly || p.harpoon ? 'self' : p.on || p.unit != null || p.line ? 'other' : 'self';
        if (p.fly || p.harpoon) {
          add(p.n, 'flight', 'self');
          for (const h of p.hit || []) add(h, 'once', 'other');
          add(p.rope, 'flight', 'self');
          add(p.pass?.n, 'once', 'other');
          add(p.harpoon?.moving, 'flight', 'self');
          continue;
        }
        const life = p.life === 'once' ? 'once' : typeof p.life === 'number' ? p.life : p.cast ? 'cast' : 'held';
        add(p.n, life, side);
        add(p.ready, 'once', side);
        add(p.end, 'once', side);
      }
    }
  }
  const seen = new Set();
  return out.filter((p) => { const k = `${p.n}|${p.life}|${p.side}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * The plays of a status spec / spec list / spec function (sample holders and appliers): its prefabs held, and a keyed
 * spec's (fxstatus.js `keyed`: `{ tpl }` in the prefab slot) — the held prefabs of its key and, once, its `end` ones.
 */
function specPlays(v) {
  const out = new Map();
  const take = (s) => {
    if (!s) return;
    if (Array.isArray(s) && Array.isArray(s[0])) { s.forEach(take); return; }
    if (Array.isArray(s) && typeof s[1] === 'string') out.set(s[1], 'held');
    else if (Array.isArray(s) && s[1]?.tpl) {
      const k = keyPlays().keys[s[1].tpl];
      for (const n of k?.held || []) out.set(n, 'held');
      for (const r of whenPlays(k, s[1].when)) if (r.role === 'held') out.set(r.n, 'held');
      for (const n of k?.end || []) out.set(n, 'once');
    }
  };
  if (typeof v === 'function') {
    const views = [{ info: { spine: 'char_1041_angel2' } }, { info: { spine: 'char_0_other' } }, { isEnemy: false },
      { _fxSkillOn: true, info: { skillIndex: 2 }, flags: 0 }, {}];
    const froms = [null, { fx: 1 }, { fx: 2 }, { fx: 3 }, { fx: 'DOWN' }, { fx: 'UP' }, { fx: 'LEFT' }, { fx: 'RIGHT' }];
    for (const w of views) for (const f of froms) { try { take(v(w, f)); } catch { /* a sample the entry does not take */ } }
  } else take(v);
  return [...out].map(([n, life]) => ({ n, life }));
}

/** The plays of a `stacked` STACK_FX entry over sample counts (1–10, `max` 3 / 5 / 10, `mid` 2 / 5). */
function stackedPlays(e) {
  const k = keyPlays().keys[e.tpl];
  const out = new Set(k?.held || []);
  for (let n = 1; n <= 10; n++) for (const max of [3, 5, 10]) for (const mid of [2, 5]) {
    for (const r of whenPlays(k, { stacks: { [e.counted]: n }, bb: { max_stack_cnt: max, mid_stack_cnt: mid }, buffs: [] })) if (r.role === 'held') out.add(r.n);
  }
  return [...out].map((n) => ({ n, life: 'held' }));
}

/**
 * Every `cite`d entry: { table, entry, src: [keys], plays: [{ n, life, side? }] } — KIT_OFFICIAL plans, fxstatus.js
 * (STATUS_FX, SOURCE_FX, KEY_FX, LAYER_FX, STACK_FX, END_FX) and fxmap.js (TALENT_ALWAYS, SKILL_HELD, SKILL_EDGE, NOTE_FX, DEPLOY_FX).
 */
export function handEntries() {
  const out = [];
  const put = (table, entry, v, plays) => { if (v?.src) out.push({ table, entry, src: [...v.src], plays }); };
  for (const [ev, by] of Object.entries(KIT_OFFICIAL)) for (const [b, fn] of Object.entries(by)) put('KIT_OFFICIAL', `${ev}.${b}`, fn, planPlays(fn));
  const held = (names) => names.map((n) => ({ n, life: 'held' }));
  for (const [k, v] of Object.entries(STATUS_FX)) put('STATUS_FX', k, v, specPlays(v));
  for (const [k, per] of Object.entries(SOURCE_FX)) {
    for (const [b, v] of Object.entries(per)) {
      if (v?.src) put('SOURCE_FX', `${k}.${b}`, v, specPlays(v));
      else if (v && typeof v === 'object') for (const [h, s] of Object.entries(v)) put('SOURCE_FX', `${k}.${b}.${h}`, s, specPlays(s));
    }
  }
  for (const [k, v] of Object.entries(KEY_FX)) put('KEY_FX', k, v, specPlays(v));
  for (const [k, v] of Object.entries(LAYER_FX)) put('LAYER_FX', k, v, specPlays(v));
  for (const [k, v] of Object.entries(STACK_FX)) put('STACK_FX', k, v, v.tpl ? stackedPlays(v) : v.flatMap((x) => specPlays(x[1])));
  for (const [k, v] of Object.entries(END_FX)) put('END_FX', k, v, specPlays(v).map(({ n }) => ({ n, life: 'once' })));
  // a talent's `born` prefabs are created once (ON_OWNER_BORN) and kept by their prefab
  for (const [k, v] of Object.entries(TALENT_ALWAYS)) put('TALENT_ALWAYS', k, v, [...held(keyPlays().keys[v.tpl]?.held || []), ...(v.born || []).map((n) => ({ n, life: 'once' }))]);
  for (const [k, by] of Object.entries(SKILL_HELD)) for (const [i, v] of Object.entries(by)) put('SKILL_HELD', `${k}.${i}`, v, held([v.tpl].flat().flatMap((t) => keyPlays().keys[t]?.held || [])));
  for (const [k, by] of Object.entries(SKILL_EDGE)) {
    for (const [i, v] of Object.entries(by)) {
      put('SKILL_EDGE', `${k}.${i}`, v, [...(keyPlays().keys[v.start]?.once || []), ...(keyPlays().keys[v.end]?.end || [])].map((n) => ({ n, life: 'once' })));
    }
  }
  for (const [k, v] of Object.entries(NOTE_FX)) {
    const fx = (k === 's1' ? [1, 2, 3, 4, 5, 6, 7, 8].map((f) => noteEffects('s1', f, keyPlays())) : [noteEffects(k, 0, keyPlays())]).filter(Boolean);
    put('NOTE_FX', k, v, [...new Set(fx.flatMap((x) => [x.trail]))].map((n) => ({ n, life: 'flight' }))
      .concat([...new Set(fx.map((x) => x.hit))].map((n) => ({ n, life: 'once' }))));
  }
  put('DEPLOY_FX', 'DEPLOY_FX', DEPLOY_FX, Object.values(DEPLOY_FX).map((n) => ({ n, life: 'once' })));
  return out;
}

// ---- judging -------------------------------------------------------------------------------------------------------------

/** A row's lifetime class: 'once', 'held', or null when the row cannot tell (an effect field: the prefab's own). */
function rowLife(r) {
  if (r.kind === 'buff') return r.life === 'IMMEDIATELY' ? 'once' : 'held';
  if (r.src === 'template' || (r.src === 'abilityBuff')) return r.life === 'hold' ? 'held' : 'once';
  if (r.life === 'once') return 'once';
  if (r.life === 'cast') return 'held';
  return null;
}
const sameFx = (a, b) => a === b || (typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase());

/**
 * Judge one hand entry against the template rows plus the client-only rows: → { out: [{ n, kind, note }], skipped? } with kind
 *   'untabled' none of its keys has a row
 *   'missing'  its keys have rows, none with this prefab
 *   'life'     the rows with this prefab disagree with the play's lifetime (a buff held vs once, LIMITED n vs a number)
 *   'target'   the rows are a buff an ability gives to others (TARGET) / keeps (OWNER) and the play is on the other side
 * Without the client-only rows only what the template rows show is judged: an entry none of whose keys has a template row
 * is `skipped`, a prefab its template rows lack is not judged (it may be a client-only row's).
 */
export function judge(entry, tables) {
  const local = !!tables.local;
  const rows = local ? [...tables.template, ...tables.local] : tables.template;
  if (!entry.plays.length) return { out: [] };   // the entry draws nothing (as its key creates none)
  const found = rowsFor(entry.src, rows);
  if (!found.length) {
    if (!local) return { skipped: true, out: [] };
    return { out: [{ n: '*', kind: 'untabled', note: entry.src.join(' ') }] };
  }
  const out = [];
  for (const p of entry.plays) {
    const hit = found.filter((r) => sameFx(r.fx, p.n));
    if (!hit.length) {
      if (!local) continue;   // it may be a client-only row
      out.push({ n: p.n, kind: 'missing' });
      continue;
    }
    const lives = hit.map(rowLife);
    if (p.life === 'once' || p.life === 'held' || p.life === 'cast' || typeof p.life === 'number') {
      const want = p.life === 'once' ? 'once' : 'held';
      if (!lives.some((l) => l === null || l === want)) out.push({ n: p.n, kind: 'life', note: `${p.life} vs ${[...new Set(hit.map((r) => r.life || r.kind))].join('/')}` });
      else if (typeof p.life === 'number') {
        const lim = hit.map((r) => /^LIMITED:([\d.]+)$/.exec(r.life || '')?.[1]).filter(Boolean).map(Number);
        // LIMITED:0 / LIMITED:@key: a time the client sets at run time (a blackboard value, the projectile's life)
        if (lim.length && !lim.includes(p.life) && !hit.some((r) => /^LIMITED:(@|0$)|^INFINITY$/.test(r.life || '') || rowLife(r) === null)) {
          out.push({ n: p.n, kind: 'life', note: `${p.life} s vs ${lim.join('/')} s` });
        }
      }
    }
    if (p.side) {
      // (a token's own buff is on the token: the play's 'other' unit)
      const sides = hit.filter((r) => r.src === 'abilityBuff' && !String(r.char || '').startsWith('token_') && (r.target === 'OWNER' || r.target === 'TARGET'));
      if (sides.length === hit.length && !sides.some((r) => (r.target === 'OWNER') === (p.side === 'self'))) {
        out.push({ n: p.n, kind: 'target', note: `${p.side} vs ${[...new Set(sides.map((r) => r.target))].join('/')}` });
      }
    }
  }
  const seen = new Set();
  return { out: out.filter((m) => { const k = `${m.n}|${m.kind}`; if (seen.has(k)) return false; seen.add(k); return true; }) };
}

// ---- what render/ plays --------------------------------------------------------------------------------------------------

/** Every prefab name the render code names (literals and `${…}`-built names as patterns) → { names, patterns }. */
export function renderNames() {
  const names = new Set(), patterns = [];
  const dir = path.join(ROOT, 'public/js/render');
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!f.name.endsWith('.js')) continue;
      const s = readFileSync(p, 'utf8');
      for (const m of s.matchAll(/'([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_ ]+)'/g)) names.add(m[1]);
      for (const m of s.matchAll(/`([A-Za-z0-9_]*\$\{[^`]*)`/g)) {
        const src = m[1].split(/\$\{[^}]*\}/).map((x) => x.replace(/[^A-Za-z0-9_]/g, '')).join('[A-Za-z0-9_]*');
        if (/^[A-Za-z0-9]+_/.test(src)) patterns.push(new RegExp(`^${src}$`));
      }
    }
  };
  walk(dir);
  return { names, patterns };
}

const strings = (o, out = new Set()) => {
  if (typeof o === 'string') out.add(o);
  else if (Array.isArray(o)) o.forEach((v) => strings(v, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out));
  return out;
};

const NAME_KINDS = ['attackStart', 'attackHit', 'skillStart', 'skillBuff', 'skillHit', 'skillTrail', 'birth'];

/**
 * The rows whose prefab is an extracted prefab of the pool's bundles and that nothing in render/ plays: not named by the
 * render code (hand tables, fxgame.js), not in the attack-mode bindings (modes.json / tools/assets/local-char-modes.json),
 * not picked by the name rules (fxmap.js effectsFor). One entry per (key, prefab) with a reason:
 *   'emitted'      the prefab is a child another prefab emits (plays with its parent)
 *   'directional'  an up / down / left / back copy (the remake draws left / right)
 *   'cond'         behind conditions a renderer could judge (direction, skill, mode, stacks, buffs), re-entry guards aside
 *   'condOther'    behind other conditions (a dice roll, damage, blackboard values …)
 *   'unconditional' none of the above: the moment draws nothing today
 * Needs the extracted effect index (null without it).
 */
export function unplayed(tables) {
  if (!tables.index) return null;
  const { names, patterns } = renderNames();
  const bound = new Set();
  if (tables.modes) strings(tables.modes, bound);
  strings(readJson(path.join(ROOT, 'tools/assets/local-char-modes.json')), bound);
  const named = new Set();
  const owner = new Map();
  for (const [b, prefabs] of Object.entries(tables.index.bundles)) {
    for (const n of prefabs) if (!owner.has(n)) owner.set(n, b);
    for (const k of NAME_KINDS) for (const s of [0, 1, 2]) for (const n of effectsFor(prefabs, k, s)) named.add(n);
  }
  const emitted = new Set(Object.values(tables.index.emitted || {}).flat());
  for (const e of handEntries()) for (const p of e.plays) names.add(p.n);   // the names the plans build (号角's _front / _back …)
  // a plan's `tpl` key plays every prefab of its plays (an `end` too, which a held prefab only the client-only rows show carries)
  for (const by of Object.values(KIT_OFFICIAL)) for (const fn of Object.values(by)) {
    for (const k of planTpls(fn)) for (const n of Object.values(keyPlays().keys[k] || {}).flat()) if (typeof n === 'string') names.add(n);
  }
  const plays = (n) => names.has(n) || bound.has(n) || named.has(n) || patterns.some((r) => r.test(n));
  const rows = tables.local ? [...tables.template, ...tables.local] : tables.template;
  const out = new Map();
  for (const r of rows) {
    if (typeof r.fx !== 'string' || !owner.has(r.fx) || isVariant(r.fx) || plays(r.fx)) continue;
    const k = `${r.key}|${r.fx}`;
    const conds = (r.conds || []).filter((c) => !isGuard(c, r));
    const reason = emitted.has(r.fx) ? 'emitted' : isDirectional(r.fx) ? 'directional'
      : conds.some((c) => JUDGED.test(c)) ? 'cond' : conds.length ? 'condOther' : 'unconditional';
    const prev = out.get(k);
    // a prefab with an unconditional row is unconditional; else the most judgeable reason wins
    const rank = { unconditional: 0, cond: 1, condOther: 2, directional: 3, emitted: 4 };
    if (!prev || rank[reason] < rank[prev.reason]) {
      out.set(k, { key: r.key, fx: r.fx, bundle: owner.get(r.fx), src: r.src, moment: r.moment, reason, conds: r.conds || [], ...(r.by ? { by: r.by } : {}), ...(r.cn ? { cn: true } : {}) });
    }
  }
  return [...out.values()].sort((a, b) => (a.bundle + a.fx + a.key).localeCompare(b.bundle + b.fx + b.key));
}

export { fxBundleOf };

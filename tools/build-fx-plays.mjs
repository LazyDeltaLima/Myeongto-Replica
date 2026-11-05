#!/usr/bin/env node
// tools/build-fx-plays.mjs — the binding rows the renderer plays by client key (docs/rules/fx.md 「바인딩 표」, 묶음 K2,
// maintainer decision 2026-10-23: the key goes in the render table, the sim stays as it is).
//
// A kit plan of render/fx/kitofficial.js may name a client key instead of a prefab: `{ tpl: 'etlchi_t_2[heal]', on, life }`.
// The prefabs come from the binding table — the template rows (tools/assets/fx-templates.json, tracked) and the client-only
// rows (public/assets/local/fx/bindings.json, git-ignored) — through this file's output, beside the extracted effects:
// public/assets/local/fx/plays.json (git-ignored like them; render/fxgame.js loads it with modes.json). Per key cited by
// a hand effect table (a KIT_OFFICIAL plan, an fxstatus.js spec, fxmap.js TALENT_ALWAYS / SKILL_HELD / SKILL_EDGE / NOTE_FX), its rows with no
// condition whose prefab is extracted, by role:
//   held  shown as long as the buff / the ability (a created buff's effect, an ability's `_effects`, a cast held to its end,
//         a template effect held by its source) — the plan's `life` says how long, a status spec shows it with its buff
//   once  created once at that moment (a template's ON_BUFF_START CreateEffect, a one-shot cast, an IMMEDIATELY buff)
//   end   created as the buff ends (ON_BUFF_FINISH / ON_OWNER_FINISH) — the held play's `end` with life 'unit'
//   lim   the held buffs' LIMITED lifetime in seconds when they all share one (the plan's life when it gives none)
//   trail / reach / hit  a projectile's `_mainEffect` (its flight), `_effectsWhenReached` (where it lands),
//         `_effectsWhenHit` (on what it strikes) — only when it has one
//   when  (묶음 K3) the rows behind conditions, re-entry guards aside: [{ role, n, b?: the buff it creates, if: [condition] }]
//         — a plan or a status spec plays the ones that hold in the state it gives (render/fx/conds.js whenPlays)
// Rows at other moments (an attack's hit, ON_TAKE_DAMAGE, a projectile's other fields …) are not a key's plays.
// 2026-11-05: a client key a kit names in its code (a 'dmg' / 'heal' `moment`, a buff's key; kitNamedKeys) needs no hand table
// row: it is listed too, with `b` its bundle and, when one prefab answers it on the unit hit, `moment` (momentOf). The renderer
// plays those by themselves (kitofficial.js momentPlan, fxstatus.js namedSpec). The `b` of a key says a kit named it.
//
// Usage: node tools/build-fx-plays.mjs [--out <file>]   (after tools/build-fx-templates.mjs or fx_bindings.py; the
//   binding test checks the file is current when the client-only rows are present)

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_OFFICIAL } from '../public/js/render/fx/kitofficial.js';
import { STATUS_FX, SOURCE_FX, KEY_FX, LAYER_FX, STACK_FX, END_FX } from '../public/js/render/fxstatus.js';
import { TALENT_ALWAYS, SKILL_HELD, SKILL_EDGE, NOTE_FX } from '../public/js/render/fxmap.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(ROOT, 'public/assets/local/fx');
export const PLAYS_FILE = join(LOCAL, 'plays.json');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** { template: rows, local: rows | null, index: { bundles } | null } from disk. */
export function bindingRows() {
  const at = (f) => (existsSync(join(LOCAL, f)) ? readJson(join(LOCAL, f)) : null);
  return { template: readJson(join(ROOT, 'tools/assets/fx-templates.json')).rows, local: at('bindings.json')?.rows || null, index: at('index.json') };
}

/** A prefab key (a projectile, a token, a charpack / skill prefab path): it also stands for the GameObjects under it. */
const isPath = (k) => k.includes('/') || /^(projectile_|token_|skchr_|sktok_|char_\d)/.test(k);

/**
 * The rows a set of client keys stands for: the rows of those keys (a template, a buff, a projectile, a prefab path and
 * the GameObjects under it), and — transitively — the buffs they create (`by`) and the templates those buffs run (`tpl`).
 */
export function rowsFor(keys, rows) {
  const S = new Set(keys);
  const paths = keys.filter(isPath);
  const under = (x) => typeof x === 'string' && paths.some((k) => x === k || x.startsWith(`${k}/`));
  const out = new Set();
  for (let round = 0; round < 6; round++) {
    const before = out.size;
    for (const r of rows) {
      if (out.has(r)) continue;
      if (S.has(r.key) || (r.by && S.has(r.by)) || under(r.key) || under(r.at)) {
        out.add(r);
        S.add(r.key);
        if (r.tpl) S.add(r.tpl);
      }
    }
    if (out.size === before) break;
  }
  return [...out];
}

/**
 * A re-entry guard: the node creates its buff only while the holder lacks it (`!CheckContainsBuff(<that buff>)`) — no
 * condition of the moment.
 */
export const isGuard = (c, r) => c === `!CheckContainsBuff(${r.key})` || c === `!CheckContainsDerviedBuff(${r.key})` || c === '!CheckContainsDerviedBuff(null)'
  || (r.by != null && (c === `!CheckContainsBuff(${r.by})` || c === `!CheckContainsDerviedBuff(${r.by})`));

/** A projectile field → its role as a key's play. */
const PROJECTILE_ROLE = Object.freeze({ _mainEffect: 'trail', _effectsWhenReached: 'reach', _effectsWhenHit: 'hit' });
const ROLES = Object.freeze(['held', 'once', 'end', 'trail', 'reach', 'hit']);

/** A row's role as a key's play ('held' | 'once' | 'end' | 'trail' | 'reach' | 'hit'), or null when it plays at another moment. */
export function playRole(r) {
  const m = r.moment || '';
  if (r.src === 'projectile') return PROJECTILE_ROLE[m] || null;
  if (/^ON_(BUFF|OWNER)_FINISH$/.test(m)) return 'end';
  if (r.kind === 'buff') return r.life === 'IMMEDIATELY' ? 'once' : 'held';
  if (r.src === 'template') return m === 'ON_BUFF_START' ? (r.life === 'hold' ? 'held' : 'once') : null;
  if (r.src === 'ability' || r.src === 'token') {
    if (/^(_effects|_idleEffect|_attachEffects|_startEffect)$/.test(m)) return 'held';
    if (m.startsWith('_castEffects@')) return r.life === 'once' ? 'once' : 'held';
  }
  return null;
}

/**
 * The plays of one client key: { held, once, end, lim?, trail?, reach?, hit?, when? } (prefab names sorted; the projectile
 * roles and `when` only when not empty), or null when it has none.
 */
export function keyPlays(key, rows, index) {
  const known = index?.bundles ? new Set(Object.values(index.bundles).flat().map((n) => n.toLowerCase())) : null;
  const out = Object.fromEntries(ROLES.map((k) => [k, new Set()]));
  const lims = new Set();
  const when = new Map();
  for (const r of rowsFor([key], rows)) {
    if (!r.fx || (known && !known.has(r.fx.toLowerCase()))) continue;
    // a buff cited by its own key holds its effect whatever its creator's moment (2026-10-24: 百炼嘉维尔's
    // gvial2_s_3[final_bleed], made as gvial2_s_3 finishes — that finish is its creator's `end`, not its own)
    const role = r.kind === 'buff' && r.key === key ? (r.life === 'IMMEDIATELY' ? 'once' : 'held') : playRole(r);
    if (!role) continue;
    const conds = (r.conds || []).filter((c) => !isGuard(c, r));
    if (conds.length) {
      const w = { role, n: r.fx, ...(r.kind === 'buff' ? { b: r.key } : {}), if: conds };
      when.set(JSON.stringify(w), w);
      continue;
    }
    out[role].add(r.fx);
    if (role === 'held') lims.add(/^LIMITED:([\d.]+)$/.exec(r.life || '')?.[1] ?? '-');
  }
  // a conditional row of a prefab the key also plays with no condition adds nothing
  for (const [k, w] of when) if (out[w.role].has(w.n)) when.delete(k);
  if (ROLES.every((k) => !out[k].size) && !when.size) return null;
  const lim = lims.size === 1 && !lims.has('-') ? Number([...lims][0]) : null;
  const shot = Object.fromEntries(['trail', 'reach', 'hit'].filter((k) => out[k].size).map((k) => [k, [...out[k]].sort()]));
  const w = [...when.keys()].sort().map((k) => when.get(k));
  return { held: [...out.held].sort(), once: [...out.once].sort(), end: [...out.end].sort(), ...(lim > 0 ? { lim } : {}), ...shot, ...(w.length ? { when: w } : {}) };
}

/** Every client key a hand effect table cites (the `src` of its entries: render/fx/cite.js), nested entries included. */
export function citedKeys() {
  const keys = new Set();
  const walk = (v, depth = 0) => {
    if (!v || (typeof v !== 'object' && typeof v !== 'function') || depth > 3) return;
    for (const k of v.src || []) keys.add(k);
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1);
  };
  for (const t of [KIT_OFFICIAL, STATUS_FX, SOURCE_FX, KEY_FX, LAYER_FX, STACK_FX, END_FX, TALENT_ALWAYS, SKILL_HELD, SKILL_EDGE, NOTE_FX]) walk(t);
  return [...keys].sort();
}

/** A row whose unit is not the one the moment's event names (the buff's giver, the damage's source). */
const SOURCE_SIDE = /^(BUFF_SOURCE|MODIFIER_SOURCE|SOURCE)$/;

/**
 * The one prefab a kit's `moment` key plays on the unit hit, or null when the rows do not say so alone: the key's own effect rows
 * at a moment of its buff or ability (a condition is the sim's: it sends the moment only when it held), with one prefab, none
 * of them on the giver's side — the owner of an ON_*OUTPUT* buff is the one dealing the hit — and no effect of the buff itself
 * besides. Those keep a hand plan.
 */
export function momentOf(key, rows, index) {
  const known = index?.bundles ? new Set(Object.values(index.bundles).flat().map((n) => n.toLowerCase())) : null;
  const own = rows.filter((r) => r.key === key && r.kind === 'effect' && r.fx && (r.moment === '_actions' || /^ON_/.test(r.moment || ''))
    && (!known || known.has(r.fx.toLowerCase())));
  if (own.some((r) => SOURCE_SIDE.test(r.target || '') || (r.target === 'BUFF_OWNER' && /OUTPUT/.test(r.moment)))) return null;
  if (rows.some((r) => r.key === key && r.kind === 'buff' && r.fx)) return null;
  const names = [...new Set(own.map((r) => r.fx))];
  return names.length === 1 ? names[0] : null;
}

/** Keys that name an operator, a skill, a summon or a projectile: a kit reads those for other reasons. */
const NOT_A_MOMENT = /^(char_|skchr_|sktok_|token_|projectile_)/;
const KITS = join(ROOT, 'server/sim/content/kits');

/** The client keys the kits' code names: its string literals (comments aside) that are a row's key. */
export function kitNamedKeys(rows, dir = KITS) {
  const known = new Set(rows.map((r) => r.key));
  const out = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) {
        const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
        for (const m of code.matchAll(/'([a-z0-9]+_[^'\s]*)'/gi)) if (known.has(m[1]) && !NOT_A_MOMENT.test(m[1])) out.add(m[1]);
      }
    }
  };
  walk(dir);
  return [...out].sort();
}

/** The file's document from the tables: { $comment, keys: { key: plays } }. */
export function buildPlays(tables = bindingRows(), kitDir = KITS) {
  const rows = [...tables.template, ...(tables.local || [])];
  const keys = {};
  for (const k of citedKeys()) {
    const p = keyPlays(k, rows, tables.index);
    if (p) keys[k] = p;
  }
  const owner = new Map();
  for (const [b, prefabs] of Object.entries(tables.index?.bundles || {})) for (const n of prefabs) if (!owner.has(n.toLowerCase())) owner.set(n.toLowerCase(), b);
  for (const k of kitNamedKeys(rows, kitDir)) {
    const p = keys[k] ?? keyPlays(k, rows, tables.index) ?? { held: [], once: [], end: [] };
    const moment = momentOf(k, rows, tables.index);
    const first = [moment, ...p.held, ...p.once, ...p.end, ...(p.when || []).map((w) => w.n)].find(Boolean);
    const b = first ? owner.get(first.toLowerCase()) : null;
    if (b) keys[k] = { ...p, b, ...(moment ? { moment } : {}) };
  }
  return {
    $comment: 'Generated by tools/build-fx-plays.mjs from the binding tables (the template rows and the client-only rows): '
      + 'the plays of each client key a hand effect table of render/ cites or a kit names. Git-ignored like the extracted effects.',
    keys,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? resolve(process.argv[i + 1]) : PLAYS_FILE;
  const doc = buildPlays();
  writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`${Object.keys(doc.keys).length} keys → ${out}`);
}

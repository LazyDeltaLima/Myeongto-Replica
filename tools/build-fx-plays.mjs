#!/usr/bin/env node
// tools/build-fx-plays.mjs — the binding rows the renderer plays by client key (docs/rules/fx.md 「바인딩 표」, 묶음 K2,
// maintainer decision 2026-10-23: the key goes in the render table, the sim stays as it is).
//
// A kit plan of render/fx/kitofficial.js may name a client key instead of a prefab: `{ tpl: 'etlchi_t_2[heal]', on, life }`.
// The prefabs come from the binding table — the template rows (tools/assets/fx-templates.json, tracked) and the client-only
// rows (public/assets/local/fx/bindings.json, git-ignored) — through this file's output, beside the extracted effects:
// public/assets/local/fx/plays.json (git-ignored like them; render/fxgame.js loads it with modes.json). Per key cited by
// a KIT_OFFICIAL plan, its rows with no condition whose prefab is extracted, by role:
//   held  shown as long as the buff / the ability (a created buff's effect, an ability's `_effects`, a cast held to its end,
//         a template effect held by its source) — the plan's `life` says how long
//   once  created once at that moment (a template's ON_BUFF_START CreateEffect, a one-shot cast, an IMMEDIATELY buff)
//   end   created as the buff ends (ON_BUFF_FINISH / ON_OWNER_FINISH) — the held play's `end` with life 'unit'
//   lim   the held buffs' LIMITED lifetime in seconds when they all share one (the plan's life when it gives none)
// Rows at other moments (an attack's hit, a projectile's flight, ON_TAKE_DAMAGE …) are not a key's plays.
//
// Usage: node tools/build-fx-plays.mjs [--out <file>]   (after tools/build-fx-templates.mjs or fx_bindings.py; the
//   binding test checks the file is current when the client-only rows are present)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_OFFICIAL } from '../public/js/render/fx/kitofficial.js';

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

/** A row's role as a key's play ('held' | 'once' | 'end'), or null when it plays at another moment. */
export function playRole(r) {
  const m = r.moment || '';
  if (/^ON_(BUFF|OWNER)_FINISH$/.test(m)) return 'end';
  if (r.kind === 'buff') return r.life === 'IMMEDIATELY' ? 'once' : 'held';
  if (r.src === 'template') return m === 'ON_BUFF_START' ? (r.life === 'hold' ? 'held' : 'once') : null;
  if (r.src === 'ability' || r.src === 'token') {
    if (/^(_effects|_idleEffect|_attachEffects|_startEffect)$/.test(m)) return 'held';
    if (m.startsWith('_castEffects@')) return r.life === 'once' ? 'once' : 'held';
  }
  return null;
}

/** The plays of one client key: { held, once, end, lim? } (prefab names sorted), or null when it has none. */
export function keyPlays(key, rows, index) {
  const known = index?.bundles ? new Set(Object.values(index.bundles).flat().map((n) => n.toLowerCase())) : null;
  const out = { held: new Set(), once: new Set(), end: new Set() };
  const lims = new Set();
  for (const r of rowsFor([key], rows)) {
    if (!r.fx || (r.conds || []).length || (known && !known.has(r.fx.toLowerCase()))) continue;
    const role = playRole(r);
    if (!role) continue;
    out[role].add(r.fx);
    if (role === 'held') lims.add(/^LIMITED:([\d.]+)$/.exec(r.life || '')?.[1] ?? '-');
  }
  if (!out.held.size && !out.once.size && !out.end.size) return null;
  const lim = lims.size === 1 && !lims.has('-') ? Number([...lims][0]) : null;
  return { held: [...out.held].sort(), once: [...out.once].sort(), end: [...out.end].sort(), ...(lim > 0 ? { lim } : {}) };
}

/** Every client key a KIT_OFFICIAL plan cites (its `src`). */
export function citedKeys() {
  const keys = new Set();
  for (const by of Object.values(KIT_OFFICIAL)) for (const fn of Object.values(by)) for (const k of fn?.src || []) keys.add(k);
  return [...keys].sort();
}

/** The file's document from the tables: { $comment, keys: { key: plays } }. */
export function buildPlays(tables = bindingRows()) {
  const rows = [...tables.template, ...(tables.local || [])];
  const keys = {};
  for (const k of citedKeys()) {
    const p = keyPlays(k, rows, tables.index);
    if (p) keys[k] = p;
  }
  return {
    $comment: 'Generated by tools/build-fx-plays.mjs from the binding tables (the template rows and the client-only rows): '
      + 'the plays of each client key a render/fx/kitofficial.js plan cites. Git-ignored like the extracted effects.',
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

#!/usr/bin/env node
// tools/build-fx-plays.mjs — the binding rows the renderer plays by client key (docs/rules/fx.md 「바인딩 표」, 묶음 K2,
// maintainer decision 2026-10-23: the key goes in the render table, the sim stays as it is).
//
// A kit plan of render/fx/kitofficial.js may name a client key instead of a prefab: `{ tpl: 'etlchi_t_2[heal]', on, life }`.
// The prefabs come from the binding table — the template rows (tools/assets/fx-templates.json, tracked) and the client-only
// rows (public/assets/local/fx/bindings.json, git-ignored) — through this file's output, beside the extracted effects:
// public/assets/local/fx/plays.json (git-ignored like them; render/fxgame.js loads it with modes.json). Per key cited by
// a hand effect table (a KIT_OFFICIAL plan, an fxstatus.js spec, fxmap.js TALENT_ALWAYS / SKILL_HELD / NOTE_FX), its rows with no
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
//
// Usage: node tools/build-fx-plays.mjs [--out <file>]   (after tools/build-fx-templates.mjs or fx_bindings.py; the
//   binding test checks the file is current when the client-only rows are present)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT_OFFICIAL } from '../public/js/render/fx/kitofficial.js';
import { STATUS_FX, SOURCE_FX, KEY_FX, LAYER_FX, STACK_FX, END_FX } from '../public/js/render/fxstatus.js';
import { TALENT_ALWAYS, SKILL_HELD, NOTE_FX } from '../public/js/render/fxmap.js';

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
  for (const t of [KIT_OFFICIAL, STATUS_FX, SOURCE_FX, KEY_FX, LAYER_FX, STACK_FX, END_FX, TALENT_ALWAYS, SKILL_HELD, NOTE_FX]) walk(t);
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
      + 'the plays of each client key a hand effect table of render/ cites. Git-ignored like the extracted effects.',
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

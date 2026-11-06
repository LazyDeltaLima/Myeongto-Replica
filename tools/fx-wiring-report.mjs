#!/usr/bin/env node
// tools/fx-wiring-report.mjs — what is still unconnected for an operator's official effects, after tools/local-extract/add_operator.py.
// Run it per operator while adding one; docs/rules/fx.md 「연결 보고」. It only reads: the extracted index, the binding rows and the
// render tables.
//
//   unplayed  a binding row with an extracted prefab that nothing plays (test/helpers/fxBindings.js unplayed), with the status
//             test/render/fx-unplayed-local-list.js gives it (a template row: fx-bindings.test.js UNPLAYED), or NEW
//   nameless  an extracted prefab of its bundle no row, table, mode or name rule reaches
//   overlap   a prefab a hand table or a key a kit names draws that the skill's activation also plays by its name, with the rows
//             that create it: check whether the name rule draws it a second time on the caster (fxgame.js KIT_OWNED silences it; a
//             buff the kit wears needs nothing, fxstatus.js wornPrefabs)
//   keyless   a template row's prefab of this bundle whose key no kit names and no hand table draws: if the prefab plays at all it is by
//             the skill's name rule, on the caster, at the cast, whoever the buff is really on (우쿠시크 S2's camouflage). A kit that means
//             this effect names the key; one that does not has nothing to do. Shown with --id only: the older operators hold 166 such
//             rows, most of them effects this mode's kits draw another way
//
// Usage: node tools/fx-wiring-report.mjs [--id <charId | bundle>]… [--json]   (no --id: every operator with something to report)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activationEffects } from '../public/js/render/fxmap.js';
import { wornPrefabs } from '../public/js/render/fxstatus.js';
import { handEntries, loadTables, renderNames, unplayed } from '../test/helpers/fxBindings.js';
import { UNPLAYED_LOCAL } from '../test/render/fx-unplayed-local-list.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(ROOT, 'public/assets/local/fx');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The prefab names of fxgame.js KIT_OWNED (a closure of its layer, so read from the source). */
export function kitOwned(src = readFileSync(join(ROOT, 'public/js/render/fxgame.js'), 'utf8')) {
  const m = /const KIT_OWNED = new Set\(\[([\s\S]*?)\]\);/.exec(src);
  if (!m) throw new Error('fxgame.js: no KIT_OWNED');
  return new Set([...m[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

const strings = (o, out = new Set()) => {
  if (typeof o === 'string') out.add(o);
  else if (Array.isArray(o)) o.forEach((v) => strings(v, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out));
  return out;
};

/**
 * { bundle: { char, unplayed: [{ key, fx, reason, status }], nameless: [prefab], overlap: [{ fx, skill, tables, rows }] } } —
 * pure over its tables. `status`: 'key|prefab' → the list's word.
 */
export function wiringReport({ tables, modes, plays = null, status = {}, owned = new Set(), hand = [], names = new Set(), patterns = [] }) {
  const bundles = tables.index?.bundles || {};
  const emitted = tables.index?.emitted || {};
  const rows = [...tables.template, ...(tables.local || [])];
  const rowFx = new Map();
  for (const r of rows) if (typeof r.fx === 'string') (rowFx.get(r.fx) ?? rowFx.set(r.fx, []).get(r.fx)).push(r);
  const charOf = new Map(Object.keys(modes).map((c) => [c.replace(/^char_\d+_/, ''), c]));
  const out = {};
  const entry = (b) => (out[b] ||= { char: charOf.get(b) ?? null, unplayed: [], nameless: [], overlap: [], keyless: [] });
  for (const u of unplayed(tables) || []) {
    entry(u.bundle).unplayed.push({ key: u.key, fx: u.fx, reason: u.reason, status: status[`${u.key}|${u.fx}`] ?? (u.src === 'template' ? 'listed: fx-bindings.test.js UNPLAYED' : 'NEW') });
  }
  const bound = strings(modes);
  const drawnBy = new Map();
  for (const e of hand) for (const p of e.plays) (drawnBy.get(p.n) ?? drawnBy.set(p.n, []).get(p.n)).push(`${e.table} ${e.entry}`);
  for (const [key, k] of Object.entries(plays?.keys || {})) {
    if (!k.b) continue;
    for (const n of [...(k.held || []), ...(k.when || []).filter((w) => w.role === 'held').map((w) => w.n)]) (drawnBy.get(n) ?? drawnBy.set(n, []).get(n)).push(`named key ${key}`);
  }
  for (const r of tables.template || []) {
    if (typeof r.fx !== 'string' || plays?.keys?.[r.key]?.b || drawnBy.has(r.fx)) continue;
    const b = Object.keys(bundles).find((x) => bundles[x].includes(r.fx));
    if (b) entry(b).keyless.push({ key: r.key, fx: r.fx, moment: r.moment });
  }
  for (const [b, prefabs] of Object.entries(bundles)) {
    const em = new Set(Array.isArray(emitted) ? emitted : emitted[b] || []);
    const char = charOf.get(b);
    for (const n of prefabs) {
      if (rowFx.has(n) || bound.has(n) || names.has(n) || em.has(n) || patterns.some((r) => r.test(n))) continue;
      entry(b).nameless.push(n);
    }
    if (!char) continue;
    for (const skill of [0, 1, 2]) {
      const a = activationEffects(modes[char], prefabs, skill, new Set([...owned, ...wornPrefabs(plays), ...em]));
      for (const fx of new Set([...a.start, ...a.loops])) {
        const by = drawnBy.get(fx);
        if (by) entry(b).overlap.push({ fx, skill: skill + 1, tables: by, rows: (rowFx.get(fx) || []).map((r) => `${r.key} ${r.moment} ${r.target || ''}`.trim()) });
      }
    }
  }
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const ids = process.argv.flatMap((a, i) => (process.argv[i - 1] === '--id' ? [a.replace(/^char_\d+_/, '')] : []));
  if (!existsSync(join(LOCAL, 'index.json'))) {
    console.error('needs the extracted effects (public/assets/local/fx/index.json)');
    process.exit(1);
  }
  const { names, patterns } = renderNames();
  const report = wiringReport({ tables: loadTables(), modes: readJson(join(LOCAL, 'modes.json')), plays: existsSync(join(LOCAL, 'plays.json')) ? readJson(join(LOCAL, 'plays.json')) : null, status: UNPLAYED_LOCAL, owned: kitOwned(), hand: handEntries(), names, patterns });
  const quiet = (r) => !r.unplayed.length && !r.nameless.length && !r.overlap.length;
  const wanted = ids.length ? ids : Object.keys(report).filter((b) => !quiet(report[b])).sort();
  if (process.argv.includes('--json')) console.log(JSON.stringify(Object.fromEntries(wanted.map((b) => [b, report[b] ?? null])), null, 1));
  else {
    for (const b of wanted) {
      const r = report[b];
      if (!r) { console.log(`${b}: nothing to report`); continue; }
      console.log(`${b}${r.char ? ` (${r.char})` : ''}: unplayed ${r.unplayed.length}, nameless ${r.nameless.length}, overlap ${r.overlap.length}${ids.length ? `, keyless ${r.keyless.length}` : ''}`);
      for (const u of r.unplayed) console.log(`  unplayed ${u.fx} ← ${u.key} [${u.reason}] ${u.status}`);
      for (const n of r.nameless) console.log(`  nameless ${n}`);
      if (ids.length) for (const k of r.keyless) console.log(`  keyless  ${k.fx} ← ${k.key} ${k.moment}`);
      for (const o of r.overlap) console.log(`  overlap  S${o.skill} ${o.fx} ← ${o.tables.join(', ')}${o.rows.length ? ` | ${o.rows.join('; ')}` : ''}`);
    }
  }
}

#!/usr/bin/env node
// tools/season-coverage.mjs — how much of a season's bond, equipment, 特质 and strategy data the content code acts on
// (server/sim/content/coverage.js): per bond template, item buff key, 特质 effect key and strategy buff key, `ok` / `partial` / `none`,
// the handlers that run on a record without the buff they ask for (`wrong`), and a renamed item buff key read as the
// default season's (`= key`, server/sim/content/items/aliases.js).
//
//   node tools/season-coverage.mjs                       every season: the totals
//   node tools/season-coverage.mjs act3autochess         one season: the totals and every row that is not ok
//   node tools/season-coverage.mjs act3autochess --all   every row
//   node tools/season-coverage.mjs act3autochess --json  the rows as JSON
//
// coverageOf(season) is the same report for tests (test/content/coverage.test.js).

import { pathToFileURL } from 'node:url';
import { getData } from '../server/data.js';
import { getDefaultRegistry, registryFor, GARRISON_HOOK } from '../server/match/effectsMeta.js';
import { BUILTIN_ITEM_BUFF_KEYS } from '../server/match/builtinMeta.js';
import { coverage } from '../server/sim/content/coverage.js';
import { DEFAULT_SEASON, SEASONS } from '../shared/seasons.js';

const QUIET = { info() {}, warn() {}, error() {} };

/** The coverage report of a season (default: the default season), its prep side from the registry its matches use. */
export function coverageOf(season = DEFAULT_SEASON) {
  const data = getData({ season, log: QUIET });
  const registry = season === DEFAULT_SEASON ? getDefaultRegistry() : registryFor(data);
  return coverage(data, { registry, builtinItemBuffKeys: BUILTIN_ITEM_BUFF_KEYS, garrisonHooks: GARRISON_HOOK });
}

const fmtTotals = (t) => `ok ${t.ok} · partial ${t.partial} · none ${t.none}${t.wrong ? ` · wrong ${t.wrong}` : ''}`;

function printSeason(season, { all = false } = {}) {
  const rep = coverageOf(season);
  console.log(`${season}${season === DEFAULT_SEASON ? ' (default)' : ''}`);
  for (const d of ['bonds', 'items', 'garrisons', 'bands']) console.log(`  ${d.padEnd(10)} ${fmtTotals(rep.totals[d])}`);
  if (all === null) return;
  for (const d of ['bonds', 'items', 'garrisons', 'bands']) {
    const rows = rep[d].filter((r) => all || r.status !== 'ok' || r.wrong.length);
    if (!rows.length) continue;
    console.log(`\n  ${d}`);
    for (const r of rows) {
      const list = r.ids?.length ? r.ids : r.stages?.length > 1 ? r.stages : null;
      const ids = list ? ` [${list.length > 4 ? `${list.slice(0, 4).join(' ')} +${list.length - 4}` : list.join(' ')}]` : r.skill?.length ? ` (${r.skill.join('/')})` : '';
      console.log(`    ${r.status.padEnd(7)} ${r.side.padEnd(6)} ${r.id}  ${r.key}${r.alias ? ` (= ${r.alias})` : ''}${ids}`);
      for (const m of r.missing) console.log(`              missing: ${m}`);
      for (const w of r.wrong) console.log(`              wrong:   ${w}`);
    }
  }
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const seasons = args.length ? args : Object.keys(SEASONS);
  for (const s of seasons) {
    if (!Object.hasOwn(SEASONS, s)) {
      console.error(`unknown season ${s} (${Object.keys(SEASONS).join(', ')})`);
      process.exitCode = 2;
      return;
    }
  }
  if (flags.has('--json')) {
    const out = Object.fromEntries(seasons.map((s) => [s, coverageOf(s)]));
    process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
    return;
  }
  seasons.forEach((s, i) => {
    if (i) console.log('');
    printSeason(s, { all: args.length ? flags.has('--all') : null });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));

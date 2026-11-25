// Strict typecheck of the folders jsconfig.strict.json lists (npm run typecheck runs it after the two plain passes).
//
// strict is a whole-program option in tsc, and a folder's files import the rest, so a config whose `include` were the
// strict folders would also report every file they import. Instead each config (jsconfig.json, jsconfig.browser.json)
// is checked whole with strict added, and only the errors located in a listed file fail; a listed file is checked in
// every config that has it (shared/ in both). types/README.md "Strict" says how to add a folder.
//
// A second rule rides along: a file in an any-free folder (ANY_FREE below) may not write `any` in a type position (a
// JSDoc `{…}` type, a `types/*.d.ts` declaration) unless the same line says `any: <why>`. types/README.md "Strict".
//
// A third rule, a ratchet: outside ANY_FREE the count of type-position `any` per file (lines saying `any: <why>` not
// counted) is compared with the table tools/any-baseline.json. More than the table fails; fewer is taken into the table
// with `--update`, which only ever lowers it (it refuses a rise).
//
// Usage: node tools/typecheck-strict.mjs          exit 1 on an error in a listed file or an `any` in an any-free file
//        node tools/typecheck-strict.mjs --count  also print the strict errors of every other folder (to pick the next)
//        node tools/typecheck-strict.mjs --update lower tools/any-baseline.json to today's counts (never raises; creates it when missing)
//        node tools/typecheck-strict.mjs --any    print the type-position `any` of every file by folder (to pick the next)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIGS = ['jsconfig.json', 'jsconfig.browser.json'];
const LIST = 'jsconfig.strict.json';

/** @param {string} file @param {ts.CompilerOptions} [extra] */
function parse(file, extra = {}) {
  /** @type {ts.Diagnostic[]} */
  const fatal = [];
  const cfg = ts.getParsedCommandLineOfConfigFile(path.join(ROOT, file), extra, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { fatal.push(d); },
  });
  const errors = [...fatal, ...(cfg?.errors ?? [])];
  if (!cfg || errors.length) {
    console.error(ts.formatDiagnostics(errors, formatHost));
    process.exit(2);
  }
  return cfg;
}

/** @type {ts.FormatDiagnosticsHost} */
const formatHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => ROOT,
  getNewLine: () => '\n',
};

// Folders whose files hold no `any` in a type position (each entry: the folder directly, no subfolders, unless it ends
// in `/**`). Add a folder once `--any` reports 0 for it.
const ANY_FREE = [
  'public/js/debug/**',
  'public/js/render',
  'server/sim/content/bonds/nation',
  'server/sim/content/items/effects',
];

/** Type-position `any` of a source file, as [line, text] pairs: AnyKeyword nodes, JSDoc types included.
 * @param {ts.SourceFile} sf @returns {number[]} 1-based lines */
function anyLines(sf) {
  /** @type {number[]} */
  const lines = [];
  /** @param {ts.Node} n */
  const walk = (n) => {
    if (n.kind === ts.SyntaxKind.AnyKeyword) lines.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
    for (const d of /** @type {{ jsDoc?: ts.Node[] }} */ (n).jsDoc ?? []) walk(d);
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return lines;
}

/** @param {string} rel */
function anyFree(rel) {
  const dir = path.dirname(rel).split(path.sep).join('/');
  return ANY_FREE.some((e) => (e.endsWith('/**') ? dir === e.slice(0, -3) || dir.startsWith(e.slice(0, -2)) : dir === e));
}

const anyMode = process.argv.includes('--any');
/** @type {Map<string, number>} */
const anyPerDir = new Map();
/** @type {Set<string>} */
const anyDone = new Set();
const ANY_MARK = /\bany: \S/;
const BASELINE = 'tools/any-baseline.json';
/** @type {Map<string, number>} file -> unmarked type-position `any`, files outside ANY_FREE only */
const anyNow = new Map();
let anyBad = 0;

const count = process.argv.includes('--count');
const listed = new Set(parse(LIST).fileNames);
/** @type {Set<string>} */
const seen = new Set();
/** @type {Map<string, number>} folder -> strict errors of its files outside the list (the larger of the two configs) */
const others = new Map();
let failed = 0;

for (const name of CONFIGS) {
  const cfg = parse(name, { strict: true });
  const program = ts.createProgram({ rootNames: cfg.fileNames, options: cfg.options });
  const global = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
  /** @type {ts.Diagnostic[]} */
  const errors = [...global];
  /** @type {Map<string, number>} */
  const mine = new Map();
  for (const sf of program.getSourceFiles()) {
    const file = sf.fileName;
    const own = listed.has(file);
    const rel = path.relative(ROOT, file);
    const lib = program.isSourceFileFromExternalLibrary(sf) || program.isSourceFileDefaultLibrary(sf);
    if (!rel.startsWith('..') && !rel.startsWith(`public${path.sep}vendor${path.sep}`) && !lib && !anyDone.has(file)) {
      anyDone.add(file);
      const lines = anyLines(sf);
      const text = sf.text.split('\n');
      const unmarked = lines.filter((ln) => !ANY_MARK.test(text[ln - 1]));
      if (anyMode && lines.length) anyPerDir.set(path.dirname(rel), (anyPerDir.get(path.dirname(rel)) ?? 0) + lines.length);
      if (anyFree(rel)) {
        for (const ln of unmarked) {
          anyBad++;
          console.error(`${rel}:${ln}: \`any\` in a type position in an any-free folder. Write unknown and narrow it, a typedef of the fields read ([key: string]: unknown for the rest), or a real signature; where \`any\` is truly needed put \`any: <why>\` on the same line (types/README.md "Strict", bundles' 「any의 길」).`);
        }
      } else if (unmarked.length) anyNow.set(rel.split(path.sep).join('/'), unmarked.length);
    }
    if (!own && (!count || lib)) continue;
    if (rel.startsWith('..') || rel.startsWith(`public${path.sep}vendor${path.sep}`)) continue;
    const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)];
    if (own) {
      seen.add(file);
      errors.push(...diags);
    } else if (diags.length) {
      const dir = path.dirname(rel);
      mine.set(dir, (mine.get(dir) ?? 0) + diags.length);
    }
  }
  for (const [dir, n] of mine) others.set(dir, Math.max(others.get(dir) ?? 0, n));
  if (errors.length) {
    failed += errors.length;
    console.error(`${name} + strict:\n${ts.formatDiagnostics(errors, formatHost)}`);
  }
}

const unchecked = [...listed].filter((f) => !seen.has(f));
if (unchecked.length) {
  failed += unchecked.length;
  console.error(`${LIST} lists files neither config checks:\n${unchecked.map((f) => `  ${path.relative(ROOT, f)}`).join('\n')}`);
}

if (count) {
  const rows = [...others].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  console.log('strict errors outside the list, per folder, its subfolders apart (the larger of the two configs):');
  for (const [dir, n] of rows) console.log(`${String(n).padStart(6)}  ${dir}`);
}

if (anyMode) {
  console.log('type-position `any` per folder (files in the strict list or, with --count, in the program):');
  for (const [dir, n] of [...anyPerDir].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))) console.log(`${String(n).padStart(6)}  ${dir}`);
}
failed += anyBad;

// Ratchet: the unmarked `any` of a file outside ANY_FREE may not grow past the table.
const baseFile = path.join(ROOT, BASELINE);
/** @type {Record<string, number>} */
const base = fs.existsSync(baseFile) ? JSON.parse(fs.readFileSync(baseFile, 'utf8')) : {};
const update = process.argv.includes('--update');
if (!fs.existsSync(baseFile) && !update) {
  console.error(`${BASELINE} is missing: run \`node tools/typecheck-strict.mjs --update\` once to create it.`);
  failed++;
}
let raised = 0;
for (const [rel, n] of anyNow) {
  const was = base[rel] ?? 0;
  if (n > was && fs.existsSync(baseFile)) {
    raised++;
    console.error(`${rel}: ${n} \`any\` in type positions, the table ${BASELINE} allows ${was}. A new \`any\` is not allowed: write unknown and narrow it, a typedef of the fields read, or the real signature; where it is truly needed put \`any: <why>\` on the same line (types/README.md "Strict", No \`any\`). The table only goes down: when a file's \`any\` count drops, run \`node tools/typecheck-strict.mjs --update\` and commit it.`);
  }
}
if (update) {
  /** @type {Record<string, number>} */
  const next = {};
  const fresh = !fs.existsSync(baseFile);
  for (const [rel, n] of [...anyNow].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!fresh && n > (base[rel] ?? 0)) continue; // never raised; reported above
    next[rel] = fresh ? n : Math.min(n, base[rel]);
  }
  fs.writeFileSync(baseFile, `${JSON.stringify(next, null, 1)}\n`);
  const gone = new Set(Object.keys(base).map((f) => path.posix.dirname(f)));
  for (const f of Object.keys(next)) gone.delete(path.posix.dirname(f));
  for (const d of gone) if (!anyFree(`${d}/x`)) console.log(`${d}: no \`any\` left, add it to ANY_FREE`);
  console.log(`${BASELINE}: ${Object.keys(next).length} files, ${Object.values(next).reduce((a, b) => a + b, 0)} \`any\``);
} else if (!raised && fs.existsSync(baseFile)) {
  const lower = Object.keys(base).filter((f) => (anyNow.get(f) ?? 0) < base[f]).length;
  if (lower) console.log(`${lower} file(s) have fewer \`any\` than ${BASELINE}: run \`node tools/typecheck-strict.mjs --update\``);
}
failed += raised;

if (failed) {
  console.error(`strict: ${failed} error(s) in the folders ${LIST} lists`);
  process.exit(1);
}
console.log(`strict: ${listed.size} files clean (${LIST})`);

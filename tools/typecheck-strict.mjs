// Strict typecheck of the folders jsconfig.strict.json lists (npm run typecheck runs it after the two plain passes).
//
// strict is a whole-program option in tsc, and a folder's files import the rest, so a config whose `include` were the
// strict folders would also report every file they import. Instead each config (jsconfig.json, jsconfig.browser.json)
// is checked whole with strict added, and only the errors located in a listed file fail; a listed file is checked in
// every config that has it (shared/ in both). types/README.md "Strict" says how to add a folder.
//
// Usage: node tools/typecheck-strict.mjs          exit 1 on an error in a listed file
//        node tools/typecheck-strict.mjs --count  also print the strict errors of every other folder (to pick the next)

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
    if (!own && (!count || program.isSourceFileFromExternalLibrary(sf) || program.isSourceFileDefaultLibrary(sf))) continue;
    const rel = path.relative(ROOT, file);
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

if (failed) {
  console.error(`strict: ${failed} error(s) in the folders ${LIST} lists`);
  process.exit(1);
}
console.log(`strict: ${listed.size} files clean (${LIST})`);

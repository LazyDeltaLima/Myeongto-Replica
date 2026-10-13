// The browser's module graph by URL, under the plain URLs (/js/main.js, `npm run dev`) and the versioned ones
// (/b/<tag>/r/js/main.js, server/http/buildTag.js BUILD_PREFIX): from index.html's entries and preloads, every import a
// module makes is followed the way the browser resolves it. A module reached under two URLs runs twice with its own
// state (two three.js, two stores, a second Preact that drives nothing) — which is what an absolute import('/js/…'),
// '/shared/…' or '/vendor/…' next to the relative ones does under the versioned URLs. Also: each relative import must
// serve the file Node loads, and no served module may be missing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitBuildPath } from '../server/http/buildTag.js';
import { versionIndexHtml } from '../server/http/static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '0123456789ab';

/** Served path → file (server/http/static.js mounts); '<shim>' for the generated /data.js. */
function fileOf(p) {
  if (p === '/data.js') return '<shim>';
  for (const [dir, pre] of [['server/sim', '/sim/'], ['shared', '/shared/'], ['data', '/data/']]) if (p.startsWith(pre)) return path.join(ROOT, dir, p.slice(pre.length));
  return path.join(ROOT, 'public', p.slice(1));
}

/**
 * Imports whose specifier is built at run time, by file: what each one loads, relative to the module (the walk adds
 * these). A new one must be listed here, or the walk would miss its modules.
 */
const DYNAMIC = {
  'public/js/main.js': [], // __SP__.import(p): the tests' and the console's hook, a module of this same graph
  'public/js/battle/runner.js': ['../../sim/spec.js', '../../sim/simdata.js', '../../sim/content/support/index.js'], // loadBrowserSim `${base}…`
  'public/js/render/board3d/load.js': [], // import(u): THREE_URL, a literal the walk follows
  'public/js/render/fx/speeds.js': [], // import(new URL('../../../sim/constants.js', import.meta.url)), a literal too
  'server/sim/content/index.js': ['tokens', 'devices', 'enemies', 'bosses', 'bonds', 'garrisons', 'items', 'bands', 'choices', 'local-patch'].map((n) => `./${n}.js`),
  'server/sim/content/bonds.js': [], // load('./bonds/core.js') …: literals
  'server/sim/content/bands.js': [],
  'server/sim/content/kits/index.js': fs.readdirSync(path.join(ROOT, 'server/sim/content/kits/ops')).filter((f) => f.endsWith('.js')).map((f) => `./ops/${f}`),
};
/** Absolute .js strings in the app's modules that are no module import. */
const NOT_MODULES = new Set(['/resource-worker.js']); // the service worker's script: registered at the root for its scope

/** Specifiers of a module source: static and dynamic imports, plus './x.js' / '../x.js' strings handed to a loader. */
function specifiersOf(src) {
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const out = new Set();
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g)) out.add(m[2]);
  for (const m of code.matchAll(/(['"])((?:\.{1,2}\/|\/)[^'"\s]+\.js)\1/g)) out.add(m[2]);
  return out;
}

function walk(versioned) {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const page = versioned ? versionIndexHtml(html, TAG) : html;
  const importMap = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(page)[1]).imports;
  const entries = [...page.matchAll(/\s(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1]);
  const plain = (u) => (versioned ? splitBuildPath(u)?.rest ?? u : u);
  const urlsByFile = new Map();
  const problems = [];
  const seen = new Set();
  const stack = entries.map((u) => [u, 'index.html']);
  while (stack.length) {
    const [url, from] = stack.pop();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = fileOf(plain(url));
    if (!urlsByFile.has(file)) urlsByFile.set(file, new Set());
    urlsByFile.get(file).add(url);
    if (file === '<shim>') { stack.push([new URL('./sim/simdata.js', `http://h${url}`).pathname, url]); continue; }
    if (!fs.existsSync(file)) { problems.push(`missing: ${url} (from ${from})`); continue; }
    if (!file.endsWith('.js') || /[\\/]vendor[\\/]pixi/.test(file)) continue; // Pixi: classic scripts, no imports
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const src = fs.readFileSync(file, 'utf8');
    for (const spec of [...specifiersOf(src), ...(DYNAMIC[rel] || [])]) {
      if (Object.hasOwn(importMap, spec)) { stack.push([importMap[spec], url]); continue; }
      if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // a package name in a Node-only branch
      if (spec.startsWith('/')) {
        if (!NOT_MODULES.has(spec) && !rel.startsWith('public/js/debug')) problems.push(`absolute import in ${rel}: '${spec}' — resolve it beside the module (new URL(…, import.meta.url)) or import it relatively`);
        continue;
      }
      const next = new URL(spec, `http://h${url}`).pathname;
      const node = path.resolve(path.dirname(file), spec);
      const served = fileOf(plain(next));
      // a path Node can load must be the same file in the browser (one that only the browser loads, e.g. speeds.js's
      // '../../../sim/constants.js' — public/ on disk, /sim/ in the URL — is checked by being served at all)
      if (served !== '<shim>' && fs.existsSync(node) && path.resolve(served) !== node) problems.push(`${rel}: '${spec}' serves ${path.relative(ROOT, served)}, Node loads ${path.relative(ROOT, node)}`);
      stack.push([next, url]);
    }
    for (const m of src.matchAll(/\bimport\s*\(\s*(?!['"])([^)]*)\)/g)) {
      if (!(rel in DYNAMIC) && !/^\s*(\/\/|\*)/.test(src.slice(src.lastIndexOf('\n', m.index) + 1, m.index))) problems.push(`${rel}: import(${m[1].trim()}) — list what it loads in DYNAMIC`);
    }
  }
  for (const [file, urls] of urlsByFile) if (urls.size > 1) problems.push(`two URLs for ${file === '<shim>' ? '/data.js' : path.relative(ROOT, file)}: ${[...urls].join(' , ')}`);
  return { modules: seen.size, problems };
}

for (const versioned of [false, true]) {
  test(`the browser module graph (${versioned ? 'versioned /b/<tag>/r/' : 'plain'} URLs): one URL per module, every import served`, () => {
    const { modules, problems } = walk(versioned);
    assert.ok(modules > 300, `the walk reached ${modules} modules (index.html, main.js and the sim): did it lose its entries?`);
    assert.deepEqual(problems, []);
  });
}

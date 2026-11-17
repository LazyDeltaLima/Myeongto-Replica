// tools/build-browser-resources.mjs runs on the deploy server in a bare Node container over the repository checkout:
// no npm install there, so no node_modules and no public/vendor (postinstall copies pixi / preact / three into it).
// Every module it imports, followed through relative imports, must therefore need nothing but Node built-ins. A page
// module that reaches the UI (public/js/ui/components.js → public/vendor/preact) stopped a deploy once; the page's list
// checks live in public/js/resource-entries.js, which imports nothing, for this reason.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMPORT_RE = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

test('build-browser-resources imports only Node built-ins and repository files outside public/vendor', () => {
  const seen = new Set();
  const bad = [];
  const walk = (file, from) => {
    if (seen.has(file)) return;
    seen.add(file);
    const rel = relative(ROOT, file);
    if (rel.startsWith('public/vendor/') || rel.startsWith('node_modules/')) { bad.push(`${rel} (imported by ${from})`); return; }
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('.')) { bad.push(`package '${spec}' (imported by ${rel})`); continue; }
      walk(join(dirname(file), spec), rel);
    }
  };
  walk(join(ROOT, 'tools/build-browser-resources.mjs'), 'the deploy');
  assert.ok(seen.has(join(ROOT, 'public/js/resource-entries.js')), 'the walk reached the page list checks (it ran)');
  assert.deepEqual(bad, [], 'tools/build-browser-resources.mjs must run without npm install (the deploy server has no '
    + 'node_modules or public/vendor): import the page checks from public/js/resource-entries.js, not a page module '
    + 'that reaches the UI');
});

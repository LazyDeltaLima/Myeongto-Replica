// test/render/fly-feet-fx.test.js — docs/rules/render.md 「이륙 높이」: an effect at the feet (_spawnLocation FOOT / NONE) of an
// airborne operator or of a flying enemy rides its drawn height (the client's entity place includes the fly height); before
// 2026-10-21 a flying enemy's stayed on the road under it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');

test('lifted(): the feet point of a liftoff operator or a flying unit is its hover height', () => {
  const at = SRC.indexOf('function lifted(v, def)');
  const body = SRC.slice(at, SRC.indexOf('\n  }\n', at));
  assert.match(body, /if \(v && \(v\.liftoff \|\| v\.flying\)\) \{\n\s+return \{\n\s+get x\(\) \{ return ex\(v\); \}, get y\(\) \{ return ey\(v\); \}, get z\(\) \{ return \(v\.z \|\| 0\) \+ \(v\.hover \|\| 0\); \}/);
});

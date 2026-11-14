// test/content/hp-loss-sites.test.js — every Battle.loseHp call in the content says whether the view draws it. Without `silent`
// the loss sends a 'dmg' event and the view draws a hit of 真实 damage (the white glow and sparks), once a tick for a periodic
// loss; the official node of such a loss often creates no effect (docs/rules/fx.md 「효과 없는 주기적 유실」). The sweep of
// test/render/op-sweep-fx.test.js only sees a 自选 operator losing HP more than three times a second, so a new call is
// counted here: it passes `silent: true`, or its file's count in hp-loss-sites-list.js goes up with the reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOUD_HP_LOSS } from './hp-loss-sites-list.js';

const ROOT = fileURLToPath(new URL('../../server/sim/content/', import.meta.url));
const WHY = 'a Battle.loseHp call without `silent` sends \'dmg\' and the view draws a hit of 真实 damage each time: pass `silent: true` when the official node creates no effect, or count the call in test/content/hp-loss-sites-list.js with why (docs/rules/fx.md 「효과 없는 주기적 유실」)';

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* files(join(dir, e.name));
    else if (e.name.endsWith('.js')) yield join(dir, e.name);
  }
}

/** The calls of `.loseHp(` in a source, comments left out: [{ silent }] — each call read to its closing parenthesis. */
function calls(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out = [];
  for (let i = code.indexOf('.loseHp('); i >= 0; i = code.indexOf('.loseHp(', i + 1)) {
    let depth = 0, j = i + 7;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')' && --depth === 0) break;
    }
    out.push({ silent: /\bsilent\b/.test(code.slice(i, j)) });
  }
  return out;
}

const found = new Map();   // file → [silent calls, loud calls]
for (const f of files(ROOT)) {
  const cs = calls(readFileSync(f, 'utf8'));
  if (cs.length) found.set(relative(ROOT, f).replaceAll('\\', '/'), [cs.filter((c) => c.silent).length, cs.filter((c) => !c.silent).length]);
}

test('every HP loss in the content is silent, or counted with why', () => {
  const bad = [];
  for (const [file, [, loud]] of found) {
    const listed = LOUD_HP_LOSS[file]?.[0] ?? 0;
    if (loud !== listed) bad.push(`${file}: ${loud} without \`silent\`, ${listed} listed`);
  }
  assert.deepEqual(bad, [], WHY);
  assert.deepEqual(Object.keys(LOUD_HP_LOSS).filter((f) => !found.has(f)), [], 'listed files with no such call left');
  for (const [file, [, why]] of Object.entries(LOUD_HP_LOSS)) assert.ok(typeof why === 'string' && why.length > 8, `${file}: say why`);
});

test('the scan reads the calls it is about: 夜莺\'s phantoms and Mon3tr lose HP silently', () => {
  assert.deepEqual(found.get('kits/ops/op-cgbird.js'), [1, 0], '白之幻影\'s drain, once a second');
  assert.deepEqual(found.get('kits/ops/op-monstr.js'), [2, 0], '重构体 and S3');
  assert.ok([...found.values()].reduce((n, [s]) => n + s, 0) >= 10, 'the silent calls are found');
  assert.equal(calls('// b.loseHp(u, 1)\nb.loseHp(u, f(1, 2), {\n  silent: true })\nb.loseHp(u, g(3)); x({ silent: true });').map((c) => c.silent).join(), 'true,false');
});

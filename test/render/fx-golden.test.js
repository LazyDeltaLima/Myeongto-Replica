// test/render/fx-golden.test.js — the effect event golden (tools/fx-golden.mjs, docs/rules/fx.md 「이벤트 기록 골든」): the
// golden battle corpus replayed through render/fxgame.js, compared with test/golden/fx-events.json — per scenario the set
// of `<unit> <event kind> <prefabs> → <target>` lines the events start. A binding change (fxgame.js, fxmap.js, the extracted
// modes.json / index.json) shows as the lines it adds (+) and drops (−): check those on screen, then
// `node tools/fx-golden.mjs --update` and commit the file with the change. Default: the golden's fast subset;
// GOLDEN_FULL=1 replays everything. Skips without the extracted effects (npm run setup).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX_FAMILIES, fxAvailable, fxDigests, loadFxGolden, compareFx, formatFxDiffs } from '../../tools/fx-golden.mjs';
import { scenariosOf } from '../../tools/golden.mjs';

const FULL = process.env.GOLDEN_FULL === '1';
const skip = !fxAvailable() && 'no extracted effects (npm run setup)';

test('compareFx: the lines a scenario adds and drops', () => {
  const d = compareFx({ a: ['x 1', 'y 2'], b: ['z'] }, { a: ['x 1', 'w 3'], b: ['z'], c: [] });
  assert.deepEqual(d, [{ id: 'a', add: ['w 3'], drop: ['y 2'] }, { id: 'c', missing: 'stored' }]);
  assert.match(formatFxDiffs(d), /a: \+1 −1\n {2}− y 2\n {2}\+ w 3/);
});

test('the stored golden lists exactly the battle scenarios of its families', { skip }, () => {
  const ids = FX_FAMILIES.flatMap((f) => scenariosOf(f).filter((sc) => sc.kind !== 'match').map((sc) => sc.id)).sort();
  assert.deepEqual(Object.keys(loadFxGolden().scenarios), ids, 'node tools/fx-golden.mjs --update after a corpus change');
});

// ≈ 10 s (fast) / 30 s (full) here
test('the battle events start the stored effect prefabs', { skip, timeout: 10 * 60_000 }, async () => {
  const stored = loadFxGolden()?.scenarios;
  assert.ok(stored, 'test/golden/fx-events.json is missing: node tools/fx-golden.mjs --update');
  const got = await fxDigests(FX_FAMILIES, { select: (sc) => FULL || sc.fast });
  assert.ok(Object.keys(got).length > 0);
  const diffs = compareFx(stored, got);
  assert.equal(diffs.length, 0, `effect event golden differs (check the lines on screen, then node tools/fx-golden.mjs --update):\n${formatFxDiffs(diffs)}`);
});

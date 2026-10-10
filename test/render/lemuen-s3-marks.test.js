// test/render/lemuen-s3-marks.test.js — 蕾缪安 S3's lock marks (docs/rules/fx.md 「르무엔 S3」, maintainer report
// 2026-10-10): knocked out or withdrawn mid-S3 she fires no shells (kit onEnd 'death'), so her marks end with her 'die'
// instead of staying on their targets until they die or 30 s pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const KIT = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/chess_char_6_01-lemuen.js'), 'utf8');

test('the marks are owned by their targets, so only her own die can end them', () => {
  assert.match(SRC, /spawn\(bundleOf\(src\)\.bundle, n, tgt \|\| \{ x, y, z: 0 \}, \{ owner: o\.id, buff: true, on: o\.id,/);
  // the kit sends no shells after a 'death' end
  assert.match(KIT, /if \(reason !== 'death' && unit\.alive\) bombard\(battle, unit, locks\);/);
});

test('her die stops every mark of her locks and drops them (a late-loading one stops itself: mark.done)', () => {
  const die = SRC.slice(SRC.indexOf("case 'die': {"), SRC.indexOf("case 'leak':"));
  assert.match(die, /const lm = lemMarks\.get\(e\[1\]\);/);
  assert.match(die, /lemMarks\.delete\(e\[1\]\); for \(const mark of lm\) \{ mark\.done = true; for \(const l of mark\) l\.inst\.stop\(true\); \}/);
  assert.match(SRC, /if \(mark\.done\) l\.inst\.stop\(\); else mark\.push\(l\);/);
});

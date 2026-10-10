// test/render/wang-follower-exit.test.js — 望's 跟子 leaves at once (render/app.js followerIds; user report 2026-10-10: the
// stones looked laid on top of each other). A stone coming back onto a 跟子's tile removes the 跟子 in the same tick
// (op-wang.js 'deploy' hook, PRTS 铸子 备注); its view used to play the ≥ 0.9 s death fade under the returning stone. In the
// client a 跟子 is a projectile (projectile_chr_wang_stone1/2/3: no `_mainEffect`, `_clearEffectsOnTileOnStop` 1) — no fall,
// no fade, no death particles.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
const KIT = readFileSync(path.join(ROOT, 'server/sim/content/kits/ops/op-wang.js'), 'utf8');

test('the sim marks a 跟子 birth (summon fx `follower`)', () => {
  assert.match(KIT, /battle\.fx\('summon', \{ x: f\.x, y: f\.y, id: f\.id, follower: true \}\);/);
});

test('app.js: a 跟子\'s die removes its view on the next frame, without death particles', () => {
  assert.match(APP, /if \(e\[1\] === 'summon' && e\[4\] && typeof e\[4\] === 'object' && e\[4\]\.follower && e\[4\]\.id != null\) \{\n\s+followerIds\.add\(e\[4\]\.id\);/);
  assert.match(APP, /const follower = followerIds\.delete\(e\[1\]\);/);
  assert.match(APP, /if \(follower\) \{ v\.dying = 1e-3; v\.dieDur = 1e-3; \}/);
  assert.match(APP, /else if \(showsDeathFx\(v\.info, used, e\[2\]\)\) fx\.death\(v\);/);
  assert.equal((APP.match(/followerIds\.clear\(\);/g) || []).length, 2, 'cleared with the battle like consumedIds');
});

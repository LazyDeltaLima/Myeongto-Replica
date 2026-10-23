// test/render/skill-shot-load.test.js — a skill's own shot and its first load (render/fxgame.js skillShotOut / spawn `drop` /
// warmShot). The shot prefab loaded only at the first throw: 流星 S2's arrows (a 0.4 s flight) were ready after they had
// landed, placed at their end and left there for 5 s with nothing to finish them; 波登可 S2 / 锡人 the same on a first load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const body = (name) => {
  const i = SRC.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} exists`);
  return SRC.slice(i, SRC.indexOf('\n  }\n', i));
};

test('a shot that landed while its prefab loaded is not drawn (spawn drop, as launchTrail)', () => {
  const s = body('spawn');
  const late = s.indexOf('if (drop && !trails.includes(drop)) return null;');
  assert.ok(late > 0, 'spawn drops a landed shot');
  assert.ok(late < s.indexOf('new mod.fxp.FxInstance('), 'before it makes the instance');
  assert.match(body('launchTrail'), /!trails\.includes\(rec\)/);
});

test("an operator's skill shot list is loaded at its deploy (warmShot)", () => {
  assert.match(body('warmShot'), /extracted\(v, skillBind\(v\)\?\.shot\)/);
  assert.match(body('warmShot'), /lib\.load\(b\.bundle, n\)/);
  assert.match(body('flushDeploys'), /warmShot\(v\);/);
});

test("a harpoon's moving effect ends as its projectile stops (歌蕾蒂娅 S3's range_04: FinishMe, not just the emission)", () => {
  assert.match(body('planHarpoon'), /\.then\(\(l\) => \{ if \(l\) zoneEnd\(l, l\.until, true\); \}\)/);
});

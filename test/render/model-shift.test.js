// test/render/model-shift.test.js — 假想敌：管's hidden-core copy is drawn one column right of its unit, over the hit box its
// prefab already moves there (render/units.js MODEL_SHIFT, [ASSUMED]; user report 2026-10-10: the hidden-core 管 looked
// shifted left, the normal one did not).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/units.js'), 'utf8');
const ENEMIES = JSON.parse(readFileSync(path.join(ROOT, 'data/enemies.json'), 'utf8'));
const WAVES = JSON.parse(readFileSync(path.join(ROOT, 'data/waves.json'), 'utf8'));

test('the data behind it: the hidden 管 stands one column left of the normal one, its hit area one column right', () => {
  const start = (stage, key) => {
    const w = WAVES[stage], s = w.spawns.find((x) => x.key === key);
    return w.routes[s.routeIndex].start;
  };
  assert.deepEqual(start('act1autochess_h07_03', 'enemy_9021_acduml'), [3, 10]);
  assert.deepEqual(start('act1autochess_h08_03', 'enemy_9021_acduml_2'), [3, 9]);
  assert.equal(ENEMIES.enemy_9021_acduml.hitArea.dx, 0);
  assert.equal(ENEMIES.enemy_9021_acduml_2.hitArea.dx, 1);
});

test('MODEL_SHIFT moves the hidden 管\'s body and shadow, not its unit', async () => {
  const fake = installFakePixi();
  try {
    const { MODEL_SHIFT } = await import('../../public/js/render/units.js');
    assert.deepEqual({ ...MODEL_SHIFT }, { enemy_9021_acduml_2: 1 });
  } finally { fake.restore(); }
  assert.match(SRC, /this\.modelDX = this\.isEnemy \? MODEL_SHIFT\[info\.defId\] \|\| 0 : 0;/);
  assert.match(SRC, /cam\.project\(this\.x \+ this\.modelDX \+ lx, this\.y \+ ly,/);
  assert.match(SRC, /const sh = cam\.project\(this\.x \+ this\.modelDX, this\.y, shz, SH_P\);/);
});

test('fxgame places effects, shots and line ends of a shifted model at its drawn column (mx)', () => {
  const FX = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  assert.match(FX, /const mx = \(v\) => Number\(v\.x\) \+ \(Number\(v\.modelDX\) \|\| 0\);/);
  // its column through ex (the entity's place: mx, or its tile while the model glides — aglna2-s2-glide.test.js)
  assert.match(FX, /const ex = \(v\) => \(v\.glideS \? Number\(v\.glideS\.lx\) \+ \(Number\(v\.modelDX\) \|\| 0\) : mx\(v\)\);/);
  assert.match(FX, /if \(!v \|\| !\(v\.modelDX \|\| 'glideS' in v\)\) return v;/);
  assert.equal((FX.match(/tx: mx\(t(gt|arget)\)/g) || []).length, 6, 'every trail aims at the drawn model');
  assert.match(FX, /rec\.tx = mx\(t\);/);
  assert.match(FX, /if \(mount === 7\) return \{ x: mx\(src\),/);
  assert.match(FX, /if \(!p\) \{ out\.x = mx\(v\);/);
});

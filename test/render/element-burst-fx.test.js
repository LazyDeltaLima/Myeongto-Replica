// test/render/element-burst-fx.test.js — docs/rules/ui.md 「전투 화면 UI」 ⑤: an element burst (the sim's fx burst with an
// `element`, damage.js resolveBurst) plays the official hit effect its ep_break_<el>_char / _enemy buff template creates on the
// unit (fxgame.js burstFx); before, render/fx.js's procedural burst stood in.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');

const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  return src.slice(at, src.indexOf('\n  }\n', at) + 4);
};

test('burstFx: the element bursts\' ep_break_<el>_char / _enemy CreateEffect on the unit by its side', () => {
  const fx = body(SRC, 'const BURST_FX = {');
  assert.match(fx, /burn: \[null, 'common_firedamage_hit'\]/);
  assert.match(fx, /erosion: \['common_waterElementExplosion', 'common_waterdamage_hit'\]/);
  assert.match(fx, /apoptosis: \['common_darkdamage_hit', 'common_darkdamage_hit'\]/);
  assert.match(fx, /neural: \['common_nerve_injury_01_hit', null\]/);
  assert.match(SRC, /if \(e\[1\] === 'burst' && e\[4\]\?\.element\) \{ if \(burstFx\(e, views\)\) ownFx\.add\(e\); return; \}/);
  const common = existsSync(path.join(FX, 'index.json')) ? JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles.common || [] : null;
  if (common) for (const n of ['common_firedamage_hit', 'common_waterdamage_hit', 'common_darkdamage_hit', 'common_nerve_injury_01_hit', 'common_waterElementExplosion']) assert.ok(common.includes(n), n);
});

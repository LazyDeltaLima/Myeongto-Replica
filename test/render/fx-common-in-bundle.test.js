// test/render/fx-common-in-bundle.test.js — the renderer finds a prefab by name in the operator's own bundle, so a common_*
// prefab its modes name is a copy there (docs/rules/fx.md 「다른 번들의 바인딩 프리팹」; common_empty has nothing to draw). A missing copy draws nothing and says nothing:
// 16 operators lost 스킬 발동 common_ignite_attack and 코스트 common_charge_cost_start_01 that way until add_operator.py copied them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fxBundleOf } from '../../public/js/render/fxmap.js';

const FX = path.resolve(import.meta.dirname, '../../public/assets/local/fx');
// S3's row lives `unmovable` s (1–1.5), a skill's `buff` list is held for the whole skill and this prefab loops: not copied until that is told apart
const LEFT_OUT = new Set(['char_1051_headb2 common_unmovable_01']);
const LOCAL = existsSync(path.join(FX, 'modes.json')) && existsSync(path.join(FX, 'index.json'));

test('every common_* prefab a modes.json record names is in that operator\'s bundle', { skip: !LOCAL && 'needs the extracted effects' }, () => {
  const modes = JSON.parse(readFileSync(path.join(FX, 'modes.json'), 'utf8'));
  const { bundles } = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8'));
  const missing = [];
  const walk = (o, out) => {
    if (typeof o === 'string') { if (o.startsWith('common_') && o !== 'common_empty') out.add(o); } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v, out);
    return out;
  };
  for (const [charId, rec] of Object.entries(modes)) {
    const have = new Set(bundles[fxBundleOf(rec.owner || charId)] || []);   // (a summon's record plays from its owner's bundle)
    for (const n of walk(rec, new Set())) if (!have.has(n) && !LEFT_OUT.has(`${charId} ${n}`)) missing.push(`${charId} ${n}`);
  }
  assert.deepEqual(missing, []);
});

test('a copied prefab brings what it emits', { skip: !LOCAL && 'needs the extracted effects' }, () => {
  const { bundles } = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8'));
  for (const b of ['buildr', 'closur']) assert.ok(bundles[b].includes('common_charge_cost_01'), `${b}: the RandomEmitter's copies`);
});

// test/render/wang-stone-fx.test.js — 望's stone effects, user re-report 2026-10-08 (LOCAL-PATCH.md 「사용자 제보 3차」):
// #2-1 the activation wisps flashed once (dropped after their clip; the stones linked in the prep never showed them —
// their 'wangLink' sat in the pre-entry buffer, which dropped fx), #2-2 the birth cross sat on the ball, off its tile,
// #2-7 the blast drew more than the client plays (token_wang_skill_03_hit_03 2 tiles off, the hit effects at the stone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { keepEarly } from '../../public/js/screens/game/early.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const prefab = (bundle, name) => JSON.parse(readFileSync(path.join(FX, bundle, `${name}.json`), 'utf8'));
const haveFx = existsSync(path.join(FX, 'wang_token', 'token_wang_01_buff.json')) && existsSync(path.join(FX, 'wang', 'wang_passive_01_buff_02.json'));

test('#2-1 the pre-entry buffer keeps a stone\'s wangLink (the prep-linked stones activate before the view enters)', () => {
  assert.ok(keepEarly(['fx', 'wangLink', 5, 10, { id: 7, axes: ['v'], first: true }]));
  assert.ok(!keepEarly(['fx', 'zone', 5, 10, { token: 'token_10064_wang_stone1' }]), 'a blast is cosmetic: not replayed');
  assert.ok(!keepEarly(['fx', 'summon', 5, 10, { id: 7 }]));
  assert.ok(keepEarly(['spawn', { id: 7 }]));
});

test('#2-1 the activation effect is kept on the stone\'s ball until its die', () => {
  // activation (STONE_ON): bound to the stone view and kept (playAt keep) until its 'die'
  assert.match(SRC, /const on = isStone\(sv\) \? \{ at: ballOf\(sv\), owner: o\.id, keep: true \} : \{ at: onBall \};/);
  assert.match(SRC, /if \(l\.inst\.done && !\(l\.keep && !l\.inst\.stopping\)\) \{ dropLive\(l\); live\.splice\(i, 1\); \}/);
  // the 3-second replay of the 跟子's rings (637a43e0, an assumption) is gone
  assert.doesNotMatch(SRC, /FOLLOWER_CYCLE|l\.cycle/);
});

test('#2-1 the extracted activation prefabs: wisps that dissolve in and stay (skipped without public/assets)', { skip: !haveFx && 'no extracted fx' }, () => {
  // the activation wisps (`line` meshes) dissolve IN (_Amount 1 → ~0) and stay: nothing ends them but the effect
  for (const [b, n] of [['wang_token', 'token_wang_01_buff'], ['wang', 'wang_passive_01_buff_02']]) {
    const d = prefab(b, n);
    const amount = d.clips[0].tracks.filter((t) => t.prop === 'mat:_Amount');
    assert.ok(amount.length >= 4, n);
    for (const t of amount) {
      const keys = t.curves[0].filter((k) => k[0] > -1e30);
      assert.equal(keys[0][4], 1, `${n} starts dissolved`);
      assert.ok(keys[keys.length - 1][4] < 0.05, `${n} ends shown`);
    }
    assert.ok(d.nodes.some((x) => x.mesh && x.active !== false && /^line/.test(x.name)), `${n} has its wisp meshes`);
  }
  // a placed stone's birth effect has the wisps but off: they come with its activation only
  const birth0 = prefab('wang_token', 'token_wang_birth_01_buff');
  assert.ok(birth0.nodes.filter((x) => x.name === 'line' || x.name === 'line1').every((x) => x.active === false));
});

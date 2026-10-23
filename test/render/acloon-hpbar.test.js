// test/render/acloon-hpbar.test.js — 炎佑 (enemy_9012_acloon, the 炎 bond summon) shows its HP bar only for a moment after
// its HP moves, hurt or healed, and no bar otherwise (shared/trap-tokens.js FLASH_HP_TOKENS, render/units.js HP_FLASH; the
// maintainer's account of the official game 2026-10-23). Other summons keep their bar at all times.
// Run: node --test test/render/acloon-hpbar.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const view = (defId, id) => new UnitView(fakeViewCtx(fake.P, { cam }), { id, side: 'ally', kind: 'token', defId, tier: 1, x: 11, y: 10, maxHp: 1000, hp: 1000 }, {});
const run = (v, s) => { for (let i = 0; i < Math.round(s * 60); i++) v.update(1 / 60, cam(), i / 60); };
const at = (v, hp, tick) => v.sync({ x: 11, y: 10, hp, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0 }, tick);
const shown = (v) => v.lpBars.root.visible;

test('炎佑: no HP bar at rest; hurt or healed, it shows, fades and hides again', () => {
  const loon = view('enemy_9012_acloon', 1);
  run(loon, 0.1);
  assert.equal(shown(loon), false, 'full HP, untouched');
  at(loon, 800, 1);
  run(loon, 0.5);
  assert.equal(shown(loon), true, 'just hurt');
  assert.equal(loon.lpBars.root.alpha, 1, 'held at full strength');
  run(loon, 1.25);
  assert.equal(shown(loon), true, 'fading');
  assert.ok(loon.lpBars.root.alpha > 0 && loon.lpBars.root.alpha < 1, 'fading');
  run(loon, 0.5);
  assert.equal(shown(loon), false, 'hidden again though still hurt');
  at(loon, 900, 2);
  run(loon, 0.1);
  assert.equal(shown(loon), true, 'healed');
  run(loon, 2.1);
  assert.equal(shown(loon), false, 'hidden after the heal');
});

test('another summon keeps its HP bar, full or hurt', () => {
  const other = view('token_10000_silent_healrb', 2);
  run(other, 0.1);
  assert.equal(shown(other), true);
  at(other, 400, 1);
  run(other, 3);
  assert.equal(shown(other), true);
  assert.equal(other.lpBars.root.alpha, 1);
});

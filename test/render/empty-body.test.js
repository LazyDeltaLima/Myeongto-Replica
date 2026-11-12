// test/render/empty-body.test.js — 规程's 淤困之茧 (enemy_9036_acweb) drawn as its prefab has it (2026-11-12, docs/rules/render.md
// 「규정 새 적 모델」): an EmptyAnimator and no Spine, but an enabled Shadow sprite and a UI mount point with no `_alwaysHideHp`
// (CN battle/enm_pfb_37.ab) — no model and no avatar diamond, its shadow and HP bar as any enemy's (shared/trap-tokens.js
// EMPTY_BODY_UNITS). Another enemy with no model still shows the diamond.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { EMPTY_BODY_UNITS, emptyBody, bodyless, noHpBar } from '../../shared/trap-tokens.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const store = () => ({ picture: () => null, image: async () => null, hasBack: () => false, spineEntry: () => null, spine: { acquire: async () => null, release: () => {} } });
const enemy = (defId) => new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }),
  { id: 9, side: 'enemy', kind: 'enemy', defId, spine: defId, tier: 1, x: 5, y: 10, maxHp: 1000 });
let t = 0;
const frames = (v, n) => { for (let i = 0; i < n; i++) { t += 1 / 60; v.update(1 / 60, cam(), t); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('淤困之茧: no model, no diamond — its shadow and HP bar kept', async () => {
  assert.deepEqual([...EMPTY_BODY_UNITS], ['enemy_9036_acweb']);
  assert.ok(emptyBody('enemy_9036_acweb') && !bodyless('enemy_9036_acweb'), 'not a bodiless marker: those hide shadow and bars');
  const v = enemy('enemy_9036_acweb');
  frames(v, 2);
  await wait(450);   // past PIC_WAIT_MS: a modelless view would show its placeholder diamond now
  frames(v, 30);
  assert.equal(v.actor, null);
  assert.equal(v.fallback.visible, false, 'no avatar diamond');
  assert.ok(v.shadow.alpha > 0.4, `its shadow (${v.shadow.alpha})`);
  assert.ok(!noHpBar('enemy_9036_acweb'), 'its HP bar as an enemy\'s (shown once damaged)');
});

test('another enemy with no model still shows the placeholder diamond', async () => {
  const v = enemy('enemy_1007_slime');
  frames(v, 2);
  await wait(450);
  frames(v, 30);
  assert.equal(v.fallback.visible, true);
});

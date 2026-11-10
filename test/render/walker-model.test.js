// test/render/walker-model.test.js — a walking ally built from an enemy record (UnitInfo `walks`: 规程's 莱塔尼亚 summons
// “一个小节” / “一个乐部” and 谢拉格's giant, server/sim/content/bonds/walker.js) is drawn as the enemy it is made of — that
// record's model size, the enemies' model place, facing its travel, no deploy direction or Back / Front model — with an
// ally's bars (render/units.js `enemyModel`; docs/rules/fx.md 「규정 맹약 소환물의 그림」). A summon of the same record
// without `walks` stays a summon. The sim's unit info carries the flag (server/sim/snapshot.js unitInfo).
// Run: node --test test/render/walker-model.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { modelPlace } from '../../public/js/render/fxpoints.js';
import { unitInfo } from '../../server/sim/snapshot.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const LTS = 'enemy_9025_aclts', GIANT = 'enemy_9024_acsgnt';
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
// lookupDef as render/app.js: a walker reads its enemy record (here one with a model size of its own)
const ctx = () => fakeViewCtx(fake.P, { cam, lookupDef: (info) => (info.side === 'enemy' || info.walks ? { modelScale: 1.5 } : null) });
const view = (defId, id, extra = {}) => new UnitView(ctx(), { id, side: 'ally', kind: 'token', defId, spine: defId, tier: 1, x: 10, y: 8, dir: 'RIGHT', maxHp: 1000, hp: 1000, ...extra }, {});
const at = (v, x, vx, tick) => v.sync({ x, y: 8, vx, vy: 0, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 1 }, tick);

test('a walking ally from an enemy record takes the enemy model\'s size, place and facing, with an ally\'s bars', () => {
  const w = view(LTS, 1, { walks: true });
  assert.equal(w.enemyModel, true);
  assert.equal(w.isEnemy, false, 'its side stays the ally\'s');
  assert.equal(w.modelK, 1.5, 'the enemy record\'s model size');
  assert.deepEqual(w.modelPlace, modelPlace([LTS, LTS], 'enemy', false), 'the enemies\' model place');
  assert.equal(w.dir, null, 'no deploy direction');
  assert.equal(w.face, null, 'no operator turn (Back / Front)');
  assert.ok(w.lpMark, 'an ally\'s bars');
  at(w, 9.5, -1, 1);
  assert.equal(w.visFacing, -1, 'walking left, it faces left');
  at(w, 10, 1, 2);
  assert.equal(w.visFacing, 1, 'and right as it turns');
});

test('a summon of the same record without `walks` stays a summon', () => {
  const t = view(LTS, 2);
  assert.equal(t.enemyModel, false);
  assert.equal(t.modelK, 1, 'no enemy record read');
  assert.equal(t.dir, 'RIGHT');
  assert.ok(t.face, 'its deploy direction');
});

test('谢拉格\'s giant switches between its two clip sets by its form', () => {
  const g = view(GIANT, 3, { walks: true, form: 'Giant' });
  g.setForm('SnowyMountain', {});
  assert.equal(g.form, 'SnowyMountain');
  g.setForm('Giant', {});
  assert.equal(g.form, 'Giant');
  g.setForm('nothing', {});
  assert.equal(g.form, 'Giant', 'a kind without a clip set changes nothing');
});

test('the sim\'s unit info says `walks` for a walking ally only', () => {
  const base = { id: 1, kind: 'token', side: 'ally', defId: LTS, def: {}, s: { maxHp: 100 }, x: 1, y: 1 };
  assert.equal(unitInfo({ ...base, walks: true }).walks, true);
  assert.equal(unitInfo(base).walks, undefined);
});

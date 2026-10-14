// 深水区: a ground enemy on a deep-water tile is drawn below the road (docs/rules/render.md 「심해 구역 잠김」): the client's
// buff template trap_sea_drown[enemy] moves its graphic holder −0.7 tiles (−0.2 for a buff_swim holder, 潜水员) while it
// stands there and back when it walks off; flyers and operators are not drowned. Headless fake PIXI (test/render/fakepixi.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { UF } from '../../shared/constants.js';

let fake, UnitView, DEEP_SINK, DEEP_SINK_SWIM, waterLineAbove;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, DEEP_SINK, DEEP_SINK_SWIM, waterLineAbove } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = presetCamera('normal', { width: 1280, height: 720 });
// column 5 of row 10 is deep water, the rest road
const terrainAt = (r, c) => (r === 10 && c === 5 ? 'deepsea' : 'road');
const view = (info) => new UnitView(fakeViewCtx(fake.P, { cam: () => cam, terrainAt }),
  { id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_1007_slime', x: 3, y: 10, maxHp: 100, ...info }, {});
const at = (v, x, flags = 0, n = 60) => {
  v.sync({ x, y: 10, hp: 100, maxHp: 100, sp: 0, spMax: 0, flags, anim: 0 });
  for (let i = 0; i < n; i++) v.update(1 / 60, cam, 0);
};
const near = (a, b) => Math.abs(a - b) < 1e-3;

test('a ground enemy sinks 0.7 on deep water, its shadow stays on the water, and it comes back up on the road', () => {
  const v = view();
  at(v, 3);
  assert.equal(v.z, 0, 'on the road');
  at(v, 5.3);                                   // round(5.3) = 5: the deep tile, like the sim's terrainFor
  assert.ok(near(v.z, -DEEP_SINK), `sunk: ${v.z}`);
  assert.equal(DEEP_SINK, 0.7);
  assert.ok(near(v.shadowZ, 0), `shadow on the water: ${v.shadowZ}`);
  assert.equal(v.shadow.alpha, 0, 'its shadow is hidden under the water');
  at(v, 6);
  assert.ok(near(v.z, 0), `back up: ${v.z}`);
  assert.ok(near(v.shadowZ ?? v.z, 0), 'the shadow never left the water');
  assert.ok(v.shadow.alpha > 0.4, `the shadow is back on the road: ${v.shadow.alpha}`);
});

test('it eases down instead of jumping', () => {
  const v = view();
  at(v, 3);
  at(v, 5, 0, 1);
  assert.ok(v.z < 0 && v.z > -DEEP_SINK, `one frame in: ${v.z}`);
});

test('潜水员 (buff_swim) sinks 0.2; a flyer and an operator do not sink', () => {
  const diver = view({ defId: 'enemy_1158_divman_2' });
  at(diver, 5);
  assert.ok(near(diver.z, -DEEP_SINK_SWIM), `diver: ${diver.z}`);
  assert.equal(diver.shadow.alpha, 0, 'a diver\'s shadow is hidden too');
  assert.equal(DEEP_SINK_SWIM, 0.2);
  const fly = view({ defId: 'enemy_1005_yokai' });
  at(fly, 5, UF.FLYING);
  assert.ok(near(fly.z, 0), `flyer: ${fly.z}`);
  assert.ok(fly.shadow.alpha > 0, 'a flyer over deep water keeps its shadow');
  const op = view({ side: 'ally', kind: 'chess', defId: 'char_x' });
  at(op, 5);
  assert.ok(near(op.z, 0), `operator: ${op.z}`);
});

test('without a stage tile lookup nothing sinks', () => {
  const v = new UnitView(fakeViewCtx(fake.P, { cam: () => cam }), { id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_1007_slime', x: 5, y: 10, maxHp: 100 }, {});
  at(v, 5);
  assert.equal(v.z, 0);
});

// the water line of Skeleton-AlphaSplit-Water: (depth − (surface 0.1409 − offset 0)) / tweak 0.8 up from the sunk feet
test('the water line: a drowned body (0.7) is under water up to about the road, a diver (0.2) to its ankles, a dry one not', () => {
  const up = waterLineAbove(DEEP_SINK);
  assert.ok(Math.abs(up - 0.6989) < 1e-3, `0.7 deep: ${up}`);
  assert.ok(Math.abs(-DEEP_SINK + up) < 0.01, 'the line sits at the road / water surface on screen');
  assert.ok(Math.abs(waterLineAbove(DEEP_SINK_SWIM) - 0.0739) < 1e-3, 'diver');
  assert.ok(waterLineAbove(0) <= 0 && waterLineAbove(0.1) <= 0, 'feet above the water surface: nothing tinted');
});

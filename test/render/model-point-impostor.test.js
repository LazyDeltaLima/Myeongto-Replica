// test/render/model-point-impostor.test.js — maintainer report 2026-10-12: in a match 안젤리나 더 멜로우 위시's S2 weapon
// glow (aglna2_skill_02_buff_weapon_01 / _02, FollowMountPoint SPECIAL_2 / _3 = her staff's bones) sat on her face, and her
// staff was cut off by a straight edge that read as a raised tile drawn over her; the debug arena showed neither.
//  * The model point's world column was taken from the screen offset at her feet's scale; under the perspective camera a
//    point lifted toward it drifts away from the screen centre, so near the edge of the screen (a match) it fell back onto
//    her body, at the centre (the arena) it did not — fxpoints.js liftedPoint.
//  * An impostor-drawn model (every clipped skeleton, crowds) was cut at a box sized from its first pose only — UnitView
//    _impBox now grows with every clip's poses.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { liftedPoint } from '../../public/js/render/fxpoints.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

test('a model point near the screen edge maps back onto the world point drawn there', () => {
  const cam = presetCamera('normal', { width: 1600, height: 900 });
  for (const [x, y] of [[2, 10], [9, 10], [5, 12], [3, 9]]) {
    const z = 0.8, want = { x: x + 0.6, y, z: 2.3 };
    const root = cam.project(x, y, z), g = cam.project(want.x, want.y, want.z);
    const got = liftedPoint(cam, x, y, z, root.y, g.x, g.y, { x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.z - want.z) < 1e-6, `${x},${y}: ${JSON.stringify(got)}`);
    const back = cam.project(got.x, got.y, got.z);
    assert.ok(Math.abs(back.x - g.x) < 1e-6 && Math.abs(back.y - g.y) < 1e-6);
  }
  // the feet's scale (the old conversion) is off by a visible part of a tile at the edge of the screen
  const root = cam.project(2, 10, 0.8), g = cam.project(2.6, 10, 2.3);
  assert.ok(Math.abs(2 + (g.x - root.x) / root.s - 2.6) > 0.1);
});

/** A stand-in for the view's actor: clip `current` playing for `dur` s, its pose's local bounds `b`. */
function holder() {
  const a = { current: 'Idle', clock: 0, mode: 'idle', dur: () => 1, b: { x: -150, y: -400, width: 300, height: 400 } };
  a.spine = { getLocalBounds: () => a.b };
  const view = { actor: a };
  return { actor: a, box: () => UnitView.prototype._impBox.call(view) };
}
test('the impostor box grows to hold a skill pose reaching past the first pose', () => {
  const t = holder();
  const first = t.box();
  assert.ok(first.x0 + first.w < 300, 'the first box is the idle pose\'s');
  // a skill clip whose staff reaches right to x 700
  t.actor.current = 'Skill_2_Loop'; t.actor.clock = 5; t.actor.b = { x: -100, y: -450, width: 800, height: 420 };
  const grown = t.box();
  assert.ok(grown.x0 + grown.w >= 700 && grown.x0 <= -150 && grown.y0 <= -450, JSON.stringify(grown));
  // back to idle: it keeps the room (never shrinks while the model lives)
  t.actor.current = 'Idle'; t.actor.clock = 9; t.actor.b = { x: -150, y: -400, width: 300, height: 400 };
  assert.deepEqual(t.box(), grown);
  // a clip already watched through its first play is not measured again
  let calls = 0; t.actor.spine.getLocalBounds = () => { calls++; return t.actor.b; };
  t.actor.current = 'Skill_2_Loop'; t.actor.clock = 20;
  t.box();
  assert.equal(calls, 0);
});

test('the falling-in Start does not grow the box (its height is the deploy room)', () => {
  const t = holder();
  const first = t.box();
  t.actor.current = 'Start'; t.actor.mode = 'deploy'; t.actor.b = { x: -150, y: -3000, width: 300, height: 3000 };
  assert.deepEqual(t.box(), first);
});

test('a box made without bounds (the default) is replaced by the first pose measured', () => {
  const t = holder();
  t.actor.b = { x: 0, y: 0, width: 0, height: 0 };
  const dflt = t.box();
  t.actor.current = 'Attack'; t.actor.clock = 1; t.actor.b = { x: -100, y: -500, width: 700, height: 500 };
  const got = t.box();
  assert.notDeepEqual(got, dflt);
  assert.ok(got.x0 + got.w >= 600);
});

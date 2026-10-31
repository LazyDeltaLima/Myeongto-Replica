// test/render/die-empty-hold.test.js — a knocked-out unit whose Die clip ends on nothing still shows on its tile
// (render/spine.js SpineActor.holdBody, render/units.js UnitView.update): 魔王 (char_4134_cetsyr)'s Die hides the body at
// 0.13 s and the dust it turns into is gone by 1 s, so the held end of the clip left an empty tile until the redeploy.
// Once the clip has played out it takes the pose of a skeleton without a Die clip (the idle's first frame) and the body
// fades back in. Headless fake PIXI (test/render/fakepixi.js); the real skeleton case skips without the assets.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const require = createRequire(import.meta.url);

let fake, UnitView, DOWN_STATE, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, DOWN_STATE } = await import('../../public/js/render/units.js'));
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const ENTRY = { skel: '/s/op.skel', atlas: '/s/op.atlas', textures: ['/s/op.png'], anims: { idle: 'Idle', die: 'Die' }, animations: { Idle: 1, Die: 1 } };
const DATA = { animations: [{ name: 'Idle' }, { name: 'Die' }] };
/** Play the current track 0 clip to its end (the fake skeleton does not advance clip time itself). */
const finish = (a) => { const e = a.spine.state.tracks[0]; e.trackTime = e.animationEnd - e.animationStart; };
/** Slots of the fake skeleton: `n` drawn region attachments (type 0) at alpha `a`, plus a bounding box (type 1). */
const slots = (n, a = 1) => [...Array.from({ length: n }, () => ({ color: { a }, getAttachment: () => ({ type: 0 }) })),
  { color: { a: 1 }, getAttachment: () => ({ type: 1 }) }];

describe('SpineActor.holdBody', () => {
  test('a played-out Die that draws nothing gives way to the idle held at timeScale 0', () => {
    const a = new SpineActor(DATA, ENTRY);
    a.die();
    a.spine.skeleton.slots = slots(0);
    a.update(0);
    assert.equal(a.holdBody(), false, 'still playing');
    finish(a);
    a.update(0);
    assert.equal(a.holdBody(), true);
    assert.equal(a.current, 'Idle');
    assert.equal(a.spine.state.tracks[0].timeScale, 0);
    assert.equal(a.holdBody(), false, 'once');
    a.update(0);
    assert.equal(a.poseHeld(), true, 'held like a skeleton without a Die clip');
  });

  test('a Die that ends on a drawn body stays; attachments at alpha 0 draw nothing; each played-out clip is looked at once', () => {
    const played = (sl) => {
      const a = new SpineActor(DATA, ENTRY);
      a.die();
      a.spine.skeleton.slots = sl;
      finish(a);
      a.update(0);
      return a;
    };
    const a = played(slots(3));
    assert.equal(a.holdBody(), false, 'the body lies there');
    assert.equal(a.current, 'Die');
    a.spine.skeleton.slots = slots(0);
    assert.equal(a.holdBody(), false, 'the same clip is not looked at again');
    assert.equal(played(slots(3, 0)).holdBody(), true, 'attachments at alpha 0');
  });

  test('never on a living model', () => {
    const a = new SpineActor(DATA, ENTRY);
    a.spine.skeleton.slots = slots(0);
    a.update(0);
    assert.equal(a.holdBody(), false);
  });
});

describe('UnitView: a downed body comes back from an empty Die', () => {
  test('down: the body fades back in on the held idle; a plain death fades out as before', async () => {
    let frame = 0;
    const ctx = fakeViewCtx(fake.P, {
      cam, frameNo: () => frame,
      assets: { picture: () => null, image: async () => null, spineEntry: () => ENTRY, spine: { acquire: async () => DATA, release() {} } },
    });
    const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_4134_cetsyr', tier: 4, x: 5, y: 10, maxHp: 1000, dir: 'RIGHT' });
    await tick(); await tick();
    assert.ok(v.spineReady, 'spine ready');
    const step = (n = 1) => { for (let i = 0; i < n; i++) { v.update(1 / 60, cam(), frame / 60); frame++; } };
    step(4);
    v.setDown([1, 60, 60, DOWN_STATE.COUNTING], 1);
    v.actor.spine.skeleton.slots = slots(0);
    step(2);
    assert.equal(v.actor.current, 'Die');
    assert.equal(v.body.alpha, 1, 'the clip plays out first');
    finish(v.actor);
    step(2);
    assert.equal(v.actor.current, 'Idle', 'swapped for the held idle');
    assert.ok(v.body.alpha < 0.2, `fading in (${v.body.alpha})`);
    step(30);
    assert.equal(v.body.alpha, 1, 'shown');
    assert.ok(v._downRing.root.visible, 'under its redeploy ring');
  });
});

describe('the real 魔王 skeleton', () => {
  const skel = 'public/assets/spine/op/char_4134_cetsyr/front/char_4134_cetsyr.skel';
  let runtime = null;
  try { runtime = { r: require('@pixi-spine/runtime-3.8'), b: require('@pixi-spine/base') }; } catch { /* not installed */ }
  test('its Die ends with no drawn attachment, its Idle starts with the body', { skip: !runtime || !existsSync(skel) ? 'no assets / pixi-spine' : false }, () => {
    const { r, b } = runtime;
    const loader = {
      newRegionAttachment: (s, n) => new r.RegionAttachment(n), newMeshAttachment: (s, n) => new r.MeshAttachment(n),
      newBoundingBoxAttachment: (s, n) => new r.BoundingBoxAttachment(n), newPathAttachment: (s, n) => new r.PathAttachment(n),
      newPointAttachment: (s, n) => new r.PointAttachment(n), newClippingAttachment: (s, n) => new r.ClippingAttachment(n),
    };
    const data = new r.SkeletonBinary(loader).readSkeletonData(new Uint8Array(readFileSync(skel)));
    const drawn = (clip, t) => {
      const sk = new r.Skeleton(data);
      sk.setToSetupPose();
      data.findAnimation(clip).apply(sk, 0, t, false, null, 1, b.MixBlend.setup, b.MixDirection.mixIn);
      return sk.slots.filter((s) => { const a = s.getAttachment(); return a && (a.type === 0 || a.type === 2) && s.color.a > 0.02; }).length;
    };
    assert.equal(drawn('Die', data.findAnimation('Die').duration), 0);
    assert.ok(drawn('Idle', 0) > 20);
  });
});

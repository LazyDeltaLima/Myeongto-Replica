// test/render/stun-fall.test.js — a stunned operator's pose (docs/rules/render.md 「아군 기절 모션」): the client's
// Character.States.StunState.OnEnter plays the model's "Stun" clip, else its "Die" clip, so an operator without a Stun
// clip falls and lies until the stun ends (render/spine.js SpineActor._enterStun, render/units.js _stunFalls) — one facing
// UP on its Front model, like a knocked-out one (_wantsBack). A freeze or a sleep and an enemy's stun freeze the clip.
// Headless fake PIXI (test/render/fakepixi.js) with the real manifest entries (data/assets.json).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';
import { ANIM, UF } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const CAPER = 'char_4100_caper';   // 跃跃: no Stun clip, no Die clip in its Back skeleton
const ROSMON = 'char_391_rosmon';  // 迷迭香: a Stun clip of its own

let fake, UnitView, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { await tick(); await tick(); };
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
let clockT = 0;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { clockT += dt; v.update(dt, cam(), clockT); } };
const store = () => ({
  picture: () => null,
  image: async () => null,
  hasBack: (id) => hasBackSpine(M, id),
  spineEntry: (id, o) => spineEntry(M, id, o),
  spine: { acquire: async (e) => ({ animations: Object.keys(e.animations || {}).map((name) => ({ name })) }), release: () => {} },
});
async function op(id, dir) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }), { id: 5, side: 'ally', kind: 'chess', defId: id, spine: id, tier: 1, x: 5, y: 10, maxHp: 1000, dir });
  await settle();
  frames(v, 5);
  return v;
}
const front = (id) => M.chars[id].spine.front;
const back = (id) => M.chars[id].spine.back;
const sample = (anim, flags = 0, hp = 1000) => ({ x: 5, y: 10, hp, maxHp: 1000, sp: 0, spMax: 0, flags, anim, vx: 0, vy: 0 });
const STUNNED = sample(ANIM.STUN, UF.STUNNED);
const actor = (entry) => new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);

describe('an operator stunned (snapshot UF.STUNNED)', () => {
  test('without a Stun clip it falls on Die, lies there, and stands up on Idle when the stun ends', async () => {
    assert.equal(front(CAPER).anims.stun, null, 'the model has no Stun clip');
    const v = await op(CAPER, 'RIGHT');
    const a = v.actor;
    v.sync(STUNNED, 1);
    assert.equal(a.current, 'Die');
    assert.equal(a.spine.state.tracks[0].loop, false, 'played once: its last frame holds');
    assert.equal(a.frozen, false);
    frames(v, 120);
    v.sync(STUNNED, 3);
    assert.equal(v.actor, a, 'facing RIGHT: one model, no swap');
    assert.equal(a.current, 'Die', 'still down');
    v.sync(sample(ANIM.IDLE), 4);
    assert.equal(a.current, 'Idle');
    assert.equal(a.spine.state.tracks[0].loop, true);
    assert.equal(a.mode, 'base');
  });

  test('a model with a Stun clip plays it (迷迭香)', async () => {
    const v = await op(ROSMON, 'RIGHT');
    v.sync(STUNNED, 1);
    assert.equal(v.actor.current, 'Stun');
  });

  test('facing UP: it lies on the Front model\'s Die and stands up on its Back model', async () => {
    const v = await op(CAPER, 'UP');
    assert.equal(v.actor.entry, back(CAPER));
    v.sync(STUNNED, 1);
    frames(v, 1);
    await settle();
    assert.equal(v.actor.entry, front(CAPER), 'the Front model, which has a fall');
    assert.equal(v.actor.current, 'Die');
    v.sync(sample(ANIM.IDLE), 3);
    frames(v, 1);
    await settle();
    assert.equal(v.actor.entry, back(CAPER), 'standing again: the Back model');
    assert.equal(v.actor.current, 'Idle');
  });

  test('knocked out while it lies stunned: the fall goes on, no second fall', async () => {
    const v = await op(CAPER, 'RIGHT');
    const a = v.actor;
    v.sync(STUNNED, 1);
    const e = a.spine.state.tracks[0];
    v.die();
    assert.equal(a.current, 'Die');
    assert.equal(a.spine.state.tracks[0], e, 'the same track entry: not restarted');
    assert.equal(a.mode, 'die');
  });
});

describe('what keeps the frozen clip', () => {
  test('a freeze or a sleep (UF.FROZEN / UF.SLEEP: no UF.STUNNED) freezes the current clip', async () => {
    for (const flag of [UF.FROZEN, UF.SLEEP]) {
      const v = await op(CAPER, 'RIGHT');
      v.sync(sample(ANIM.STUN, flag), 1);
      assert.equal(v.actor.current, 'Idle', `flag ${flag}`);
      assert.equal(v.actor.frozen, true, `flag ${flag}`);
      v.sync(sample(ANIM.IDLE), 2);
      assert.equal(v.actor.frozen, false);
    }
  });

  test('a freeze over the fall keeps it down; the stun again does not replay the fall', () => {
    const a = actor(front(CAPER));
    a.setBase('stun', true);
    const e = a.spine.state.tracks[0];
    assert.equal(a.current, 'Die');
    a.setBase('stun', false);                // frozen while down
    assert.equal(a.frozen, true);
    assert.equal(a.current, 'Die');
    a.setBase('stun', true);                 // the freeze ends, the stun goes on
    assert.equal(a.frozen, false);
    assert.equal(a.spine.state.tracks[0], e, 'the same Die entry');
  });

  test('a stun without `fall` (an enemy: Enemy.States.StunState plays only a Stun clip) freezes the clip', () => {
    const a = actor(front(CAPER));
    a.setBase('stun');
    assert.equal(a.current, 'Idle');
    assert.equal(a.frozen, true);
    a.setBase('idle');
    assert.equal(a.frozen, false);
    assert.equal(a.current, 'Idle');
  });
});

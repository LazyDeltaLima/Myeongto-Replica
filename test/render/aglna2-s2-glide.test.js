// test/render/aglna2-s2-glide.test.js — user report 2026-10-12: 予愿安洁莉娜 S2 重力自定义 took off on the spot and attacked;
// officially her model glides forward on her staff to the end of the sweep, rises there, and is back on her tile as her
// attacks begin. The client carries the model on projectile_chr_aglna2_s2_fly (follower `_restoreOnEnd` 1) and plays the
// skill's ChantBeforeSkill clips Skill_2_Takeoff_Begin / _Loop / _End, then `_afterEndAnim` Skill_2_Begin; the sim keeps
// her tile and position (PRTS 备注). Real manifest entry, headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { UF_LIFTOFF } from '../../shared/local.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const AGL = 'char_1015_aglna2';
const CHANT = { begin: 'Skill_2_Takeoff_Begin', loop: 'Skill_2_Takeoff_Loop', end: 'Skill_2_Takeoff_End', total: 2.5, after: 'Skill_2_Begin' };

let fake, SpineActor, UnitView, FLY_HOVER;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView, FLY_HOVER } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function actor() {
  const entry = assets.chars[AGL].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(1);
  a.log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { a.log.push(['set', name, !!loop]); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { a.log.push(['queue', name, !!loop]); return add(i, name, loop); };
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('her model has the 吟唱 clips', () => {
  const d = assets.chars[AGL].spine.front.animations;
  assert.deepEqual([d.Skill_2_Takeoff_Begin, d.Skill_2_Takeoff_Loop, d.Skill_2_Takeoff_End, d.Skill_2_Begin], [0.333, 0.5, 1, 1]);
});

test('SpineActor.chant: Takeoff_Begin → Takeoff_Loop, Takeoff_End closing the 2.5 s, then Skill_2_Begin and the skill clips; no attack meanwhile', () => {
  const a = actor();
  a.setSkill(true);                 // the 'skill' event first: Skill_2_Begin …
  assert.equal(a.current, 'Skill_2_Begin');
  assert.ok(a.chant(CHANT));        // … the glide takes over
  a.setSkill(true);
  assert.equal(a.mode, 'chant');
  assert.equal(a.current, 'Skill_2_Takeoff_Begin');
  a.attack(0.9);
  assert.equal(a.mode, 'chant', 'an attack waits for the 吟唱');
  run(a, 1.4);
  assert.ok(!a.log.some(([, n]) => n === 'Skill_2_Takeoff_End'), 'no end clip before 1.5 s');
  run(a, 0.2);
  assert.equal(a.log.at(-1)[1], 'Skill_2_Takeoff_End', 'the end clip from 1.5 s');
  run(a, 1);
  assert.equal(a.mode, 'skillBegin');
  const tail = a.log.slice(a.log.findIndex(([, n]) => n === 'Skill_2_Takeoff_End') + 1).map(([k, n]) => `${k} ${n}`);
  assert.deepEqual(tail.slice(0, 2), ['set Skill_2_Begin', 'queue Skill_2_Idle'], 'then the skill begins at home');
  run(a, 1.1);
  a.attack(0.9);
  assert.equal(a.current, 'Skill_2_Loop', 'and attacks on her S2 clip');
});

test('the skill ending inside the 吟唱 leaves it at once', () => {
  const a = actor();
  a.setSkill(true);
  a.chant(CHANT);
  run(a, 0.5);
  a.setSkill(false);
  assert.equal(a.mode, 'skillEnd');
  assert.equal(a.current, 'Skill_2_End');
});

test('UnitView.glide: the model goes out at the sweep speed, holds at the end, is back on the sampled tile as the 吟唱 ends, and its lift then rises over 1 s', async () => {
  const cam = presetCamera('prep', { width: 1280, height: 720 });
  const st = {
    picture: () => null, image: async () => null,
    spineEntry: () => assets.chars[AGL].spine.front,
    spine: { acquire: async () => ({ animations: Object.keys(assets.chars[AGL].spine.front.animations).map((name) => ({ name })) }), release() {} },
  };
  const v = new UnitView(fakeViewCtx(fake.P, { assets: st, cam: () => cam }), { id: 1, side: 'ally', kind: 'chess', defId: AGL, x: 4, y: 10, maxHp: 1000 }, {});
  const step = (s, n = Math.round(s * 60)) => { for (let i = 0; i < n; i++) v.update(s / n, cam, 0); };
  const snap = { x: 4, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: UF_LIFTOFF, anim: 0 };   // airborne (起飞)
  v.sync(snap);
  v.glide(8, 10, { travel: 4 / 6, chant: 2.5 });
  step(1 / 3);
  assert.ok(Math.abs(v.x - 6) < 0.05, `halfway at 1/3 s: ${v.x}`);
  v.sync(snap);                    // a snapshot meanwhile: still her own tile
  assert.ok(Math.abs(v.x - 6) < 0.05, 'the sample does not pull the model back');
  step(1);
  assert.equal(v.x, 8, 'held at the end');
  assert.ok(v.hover < 1e-6, 'low while gliding');
  step(1.2);
  assert.deepEqual([v.x, v.y, v.glideS], [4, 10, null], 'back home');
  step(0.5);
  assert.ok(Math.abs(v.hover - FLY_HOVER / 2) < 0.05, `rising linearly: ${v.hover}`);
  step(0.6);
  assert.equal(v.hover, FLY_HOVER);
});

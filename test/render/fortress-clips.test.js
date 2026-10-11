// test/render/fortress-clips.test.js — a 要塞's blocked and unblocked attacks play their own clips (render/units.js
// FORTRESS_CLIPS, render/spine.js _loopOf; maintainer report 2026-10-10): 号角 played Attack_A — her blocked attack —
// for her ranged attacks too, 灰毫 her ranged Attack01 while blocking. The client prefabs' MeleeAttack /
// BlockedMeleeAttack / BlockedRangedAttack play the first clip of a pair, RangedAttack the second; the sim's 'swing' /
// 'atk' kind is 'none' while it blocks. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const APP = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
const HORN = 'char_4039_horn', ASHLOK = 'char_431_ashlok';

let fake, SpineActor, FORTRESS_CLIPS;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ FORTRESS_CLIPS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id) {
  const entry = assets.chars[id].spine.front;
  const a = new SpineActor(dataOf(entry), entry);
  a.fortressClips = FORTRESS_CLIPS[id];
  a.setBase('idle');
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('every pair names clips of the skeleton', () => {
  for (const [id, pairs] of Object.entries(FORTRESS_CLIPS)) {
    const clips = assets.chars[id].spine.front.animations;
    for (const p of pairs) for (const n of p) assert.ok(n in clips, `${id} ${n}`);
  }
});

test('号角: Attack_A while blocking, Attack_B for her ranged attacks; the skill clips split the same way', () => {
  const a = actor(HORN);
  a.atkRanged = true;
  assert.ok(a.swing(0.3));
  assert.equal(a.current, 'Attack_B');
  run(a, 1.5);
  a.atkRanged = false;
  assert.ok(a.swing(0.3));
  assert.equal(a.current, 'Attack_A');
  run(a, 1.5);
  // no swing driving it (the 'atk' path) picks the same way
  a.atkRanged = true;
  a.attack(1.5);
  assert.equal(a.current, 'Attack_B');
  a.setSkillIndex(2);
  a.setSkill(true);
  run(a, 0.5);
  a.atkRanged = false;
  assert.ok(a.swing(0.333));
  assert.equal(a.current, 'Skill_3_A_Loop');
  run(a, 1.5);
  a.atkRanged = true;
  assert.ok(a.swing(0.333));
  assert.equal(a.current, 'Skill_3_B_Loop');
});

test('灰毫: her melee Attack02 while blocking (the role clip is her ranged Attack01)', () => {
  const a = actor(ASHLOK);
  assert.equal(a.roles.attack.loop, 'Attack01');
  a.atkRanged = false;
  assert.ok(a.swing(0.3));
  assert.equal(a.current, 'Attack02');
});

test('no kind known yet, or another operator: the role\'s clip', () => {
  const a = actor(HORN);
  assert.ok(a.swing(0.3));
  assert.equal(a.current, 'Attack_A');
  // the swing event hands its kind to the view (units.js onSwing → _atkKind)
  assert.match(APP, /views\.get\(e\[1\]\)\?\.onSwing\?\.\(w, e\[3\], e\[4\] === 1\);/);
});

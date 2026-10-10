// test/render/stance-skill.test.js — a skill whose loop clip is its stance (render/units.js STANCE_SKILLS, render/spine.js
// _stance; maintainer report 2026-10-10: 烛煌's S3 motion stopped after her first attack). Client charpack: 烛煌 `Modes/S3`
// `_replaceAnimPairs` Idle → Skill_3_Loop, its Attack `_animKey ""` — Skill_3_Loop runs from Skill_3_Begin to Skill_3_End
// while her attacks fire from it. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const TIMING = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-attack-timing.json'), 'utf8'));
const BLAZE = 'char_1040_blaze2';

let fake, SpineActor, STANCE_SKILLS;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ STANCE_SKILLS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id, stance = true) {
  const entry = assets.chars[id].spine.front;
  const a = new SpineActor(dataOf(entry), entry);
  if (stance) a.stanceSkills = STANCE_SKILLS[id];
  a.setBase('idle');
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('the table matches the client: 烛煌 S3 attacks with no clip of its own', () => {
  const t = TIMING.ops[BLAZE];
  assert.equal(t.attack[t.modes.indexOf('S3')].anim, '');
  assert.deepEqual(STANCE_SKILLS[BLAZE], [2]);
  assert.equal(assets.chars[BLAZE].spine.front.anims.skills['2'].loop, 'Skill_3_Loop');
});

test('烛煌 S3: Skill_3_Loop stays on through her attacks and the pauses between them, Skill_3_End closes it', () => {
  const a = actor(BLAZE);
  a.setSkillIndex(2);
  a.setSkill(true);
  assert.equal(a.current, 'Skill_3_Begin');
  run(a, 0.6);
  for (let k = 0; k < 3; k++) {
    assert.equal(a.swing(0.4), false, 'no attack clip');
    a.attack(1.6);
    run(a, 2.5);   // a long pause: the stance, not Idle
    assert.equal(a._idleName(), 'Skill_3_Loop');
    assert.notEqual(a.current, 'Idle');
  }
  a.setSkill(false);
  assert.equal(a.current, 'Skill_3_End');
  run(a, 1.2);
  assert.equal(a.current, 'Idle');
});

test('without the table entry (the old behaviour) each attack replayed the loop and fell out of the stance', () => {
  const a = actor(BLAZE, false);
  a.setSkillIndex(2);
  a.setSkill(true);
  run(a, 0.6);
  assert.ok(a.swing(0.4));
  run(a, 3);
  assert.notEqual(a.current, 'Skill_3_Loop');
});

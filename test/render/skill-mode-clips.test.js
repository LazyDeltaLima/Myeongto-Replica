// The clips a skill's or a talent's mode swaps in (docs/rules/render.md 「Spine 클립 커버리지」 D–H): the death and stun
// clips of a skill's mode (anims skill `die` / `stun`, tools/assets/anim-overrides.mjs SKILL_STATE_CLIPS). Real manifest
// entries, headless fake PIXI like test/render/attack-alts.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

function actor(charId, skillIndex = null, dir = 'front') {
  const entry = assets.chars[charId].spine[dir];
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  if (skillIndex != null) a.setSkillIndex(skillIndex);
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('a knock-out while a skill runs plays the Die pair of its mode — the skill ends right before the die event', () => {
  const cases = [['char_1015_aglna2', 0, 'Skill_1_Die'], ['char_1015_aglna2', 1, 'Skill_2_Die'], ['char_1015_aglna2', 2, 'Skill_3_Die'],
    ['char_4145_ulpia', 1, 'Skill_2_Die'], ['char_4191_tippi', 0, 'Die_2'], ['char_4191_tippi', 1, 'Die_2']];
  for (const [id, i, clip] of cases) {
    const a = actor(id, i);
    a.setSkill(true);
    run(a, 3);
    a.setSkill(false);   // Battle._remove: skill.end('death'), then the 'die' event — the same frame
    a.die();
    assert.equal(a.current, clip, `${id} S${i + 1}`);
  }
});

test('outside the skill the plain Die; a model rebuilt for the knock-out takes the skill it died in', () => {
  const a = actor('char_1015_aglna2', 2);
  a.setSkill(true);
  run(a, 3);
  a.setSkill(false);
  run(a, 3);   // the skill is over (its End clip played out)
  a.die();
  assert.equal(a.current, 'Die');
  const b = actor('char_1015_aglna2', 2);
  b.die(true);   // render/units.js: the view remembered the skill (_dieSkill)
  assert.equal(b.current, 'Skill_3_Die');
  assert.equal(actor('char_1015_aglna2', 2, 'back').dieClip(true), null, 'the Back model has no death clip');
});

test('迷迭香: stunned during S3 → Stun_Skill_3; otherwise Stun', () => {
  const a = actor('char_391_rosmon', 2);
  a.setBase('stun');
  assert.equal(a.current, 'Stun');
  a.setBase('idle');
  a.setSkill(true);
  run(a, 3);
  a.setBase('stun');
  assert.equal(a.current, 'Stun_Skill_3');
});

// Skill clips whose numbers are not their skill numbers (local patch, docs/LOCAL-PATCH.md 「스킬 클립 번호 교정」; user report
// 2026-10-07 items 3–4, research/2026-10-07-user-issues/issues-anim.md): 泥岩 S2 showed S3's dormancy crouch (the model
// "slid to the lower left and back"), 莫斯提马 S3 stood in S2's channel pose without an attack motion.
// Real manifest entries (tools/assets/anim-overrides.mjs), headless fake PIXI like test/render/feedback4-texas-skill-clip.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './render/fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../public/js/render/spine.js'));
});
after(() => fake.restore());

function actor(charId, skillIndex, dir = 'front') {
  const entry = assets.chars[charId].spine[dir];
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  a.log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { a.log.push(name); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { a.log.push(name); return add(i, name, loop); };
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('manifest: 泥岩 S2 = Skill_1 (strike), S3 = the Skill_2 family; 莫斯提马 S2 = Skill_Begin/Loop/End, S3 = Skill_2_*', () => {
  for (const dir of ['front', 'back']) {
    const mud = assets.chars.char_311_mudrok.spine[dir].anims.skills;
    assert.equal(mud[1].loop, 'Skill_1', dir);
    assert.equal(mud[1].strike, true, dir);
    assert.equal(mud[2].loop, 'Skill_2_Attack', dir);
    const mos = assets.chars.char_213_mostma.spine[dir].anims.skills;
    assert.equal(mos[1].loop, 'Skill_Loop', dir);
    assert.equal(mos[2].loop, 'Skill_2_Loop', dir);
    assert.equal(mos[2].idle, 'Skill_2_Idle', dir);
  }
});

test('泥岩 S2: nothing at the cast; the empowered attack plays Skill_1 once and the skill off (same batch) does not cut it', () => {
  const a = actor('char_311_mudrok', 1);
  a.setSkill(true);
  assert.deepEqual(a.log.filter((n) => /^Skill/.test(n)), [], 'no clip at the cast (it used to crouch with Skill_2_Begin)');
  a.windUp(1.6, 0.3);
  run(a, 0.3);
  a.attack(1.6);
  a.setSkill(false);
  assert.equal(a.current, 'Skill_1');
  assert.equal(a.mode, 'attack');
  run(a, 0.5);
  assert.equal(a.current, 'Skill_1', 'still striking');
  run(a, 1.5);
  assert.equal(a.mode, 'base');
  assert.equal(a.log.filter((n) => n === 'Skill_1').length, 1, 'once');
});

// upstream 6326dd4d (#246) plays a late-seen attack whole from its wind-up only for the clip-per-attack actors (enemies);
// our strike skill clips (`strike`, also played once per attack) keep the strike-frame start (render-1 port, 2026-10-09)
test('泥岩 S2 seen late (no wind-up): Skill_1 starts on its strike frame even when the rhythm leaves room for the whole clip', () => {
  const a = actor('char_311_mudrok', 1);
  a.setSkill(true);
  a.attack(8);
  assert.equal(a.current, 'Skill_1');
  assert.ok(a.spine.state.tracks[0].trackTime > 0, 'from the strike frame, not the wind-up');
});

test('莫斯提马 S3: every attack plays Skill_2_Loop (it stood in Skill_Loop before)', () => {
  const a = actor('char_213_mostma', 2);
  a.setSkill(true);
  assert.equal(a.log[0], 'Skill_2_Begin');
  run(a, 1);
  for (let i = 0; i < 3; i++) { a.attack(2.9); assert.equal(a.current, 'Skill_2_Loop'); run(a, 2.9); }
  assert.ok(!a.log.includes('Skill_Loop'));
});

test('焰影苇草 S3: attacks with Skill_3_Attack and idles in Skill_3_Loop (charpack mode pairs; user report 2026-10-07)', async () => {
  const { applyAnimOverrides } = await import('../tools/assets/anim-overrides.mjs');
  const anims = { skill: { begin: 'Skill_3_Begin', loop: 'Skill_3_Loop', end: 'Skill_3_End', index: 2, idle: null }, skills: { 2: { begin: 'Skill_3_Begin', loop: 'Skill_3_Loop', end: 'Skill_3_End', index: 2, idle: null } } };
  const out = applyAnimOverrides('op:char_1020_reed2:front', anims);
  assert.equal(out.skill.loop, 'Skill_3_Attack');
  assert.equal(out.skill.idle, 'Skill_3_Loop');
  const { readFileSync } = await import('node:fs');
  const m = JSON.parse(readFileSync(new URL('../data/assets.json', import.meta.url), 'utf8'));
  for (const side of ['front', 'back']) assert.equal(m.chars.char_1020_reed2.spine[side].anims.skills['2'].loop, 'Skill_3_Attack', side);
});

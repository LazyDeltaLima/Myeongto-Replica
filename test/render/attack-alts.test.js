// Attack clips taking turns (anims `alts` / `pick`, tools/assets/anim-overrides.mjs ATTACK_ALTS; docs/rules/render.md
// 「Spine 클립 커버리지」 B): every swing plays one of the role's clips — in turn, at random, or never the same twice.
// Real manifest entries, headless fake PIXI like test/local-patch-skill-clips.test.js.

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
/** The clips of `n` swings, each played out. */
function swings(a, n) {
  const out = [];
  for (let i = 0; i < n; i++) { assert.ok(a.swing(0.3)); out.push(a.current); run(a, 3); }
  return out;
}

test('阿斯卡纶: Attack_A, Attack_B in turn (AbilityRandomGroup Loop)', () => {
  assert.deepEqual(swings(actor('char_4132_ascln'), 5), ['Attack_A', 'Attack_B', 'Attack_A', 'Attack_B', 'Attack_A']);
});

test('伺夜 S3: Skill3_Attack_A → B → C in turn while the skill is on; the plain Attack outside it', () => {
  const a = actor('char_427_vigil', 2);
  assert.deepEqual(swings(a, 1), ['Attack']);
  a.setSkill(true);
  run(a, 5);
  assert.deepEqual(swings(a, 4), ['Skill3_Attack_A', 'Skill3_Attack_B', 'Skill3_Attack_C', 'Skill3_Attack_A']);
});

test('维什戴尔: any of Attack_A / _B / _C (AbilityRandomGroup Random)', () => {
  const a = actor('char_1035_wisdel');
  const draws = [0.9, 0.1, 0.5, 0.95];
  a.altRandom = () => draws.shift();
  assert.deepEqual(swings(a, 4), ['Attack_C', 'Attack_A', 'Attack_B', 'Attack_C']);
});

test('山: a random first, then never the clip just played (_diffFromLastOneIfNotFirst)', () => {
  const a = actor('char_264_f12yin');
  a.altRandom = () => 0.99;
  const got = swings(a, 4);
  assert.equal(got[0], 'Attack_B');
  for (let i = 1; i < got.length; i++) assert.notEqual(got[i], got[i - 1], `swing ${i}`);
});

test('a model swapped mid-swing keeps the swing\'s clip (swingElapsed alt → swing(windup, alt))', () => {
  const a = actor('char_4132_ascln');
  swings(a, 1);
  a.swing(0.3);
  const s = a.swingElapsed();
  assert.equal(s.alt, 'Attack_B');
  const b = actor('char_4132_ascln', null, 'back');
  assert.ok(b.swing(s.windup, s.alt));
  assert.equal(b.current, 'Attack_B');
  run(b, 3);
  assert.deepEqual(swings(b, 1), ['Attack_A'], 'then in turn from there');
});

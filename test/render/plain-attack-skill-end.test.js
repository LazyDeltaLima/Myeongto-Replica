// test/render/plain-attack-skill-end.test.js — maintainer report 2026-11-03 「엑시아 S1 사용시 스탠딩 모션으로 돌아간다」.
//
// 能天使 S1 冲锋模式 is an instant skill whose next attack is the skill's (server/sim/skills.js `pending`): the 'skill' flag
// turns on at the cast and off with the strike of that attack, in the same batch as its 'atk' events. Her skill roles
// attack with the plain Attack clip (`via: 'attack'`) and have no End clip, so spine.js setSkill(false) fell through to the
// base clip and cut the running attack to Idle at its strike frame. The attack now plays out; a skill with an End clip
// of its own still closes on it.
//
// Real manifest entries, headless fake PIXI (test/render/fakepixi.js), like feedback4-texas-skill-clip.test.js.

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

function actor(charId, skillIndex) {
  const entry = assets.chars[charId].spine.front;
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('能天使 S1: the skill ending with its attack\'s strike lets that attack clip play out, then Idle', () => {
  const a = actor('char_103_angel', 0);
  const sk = a.roles.skill;
  assert.deepEqual([sk.begin, sk.loop, sk.end, sk.via], [null, 'Attack', null, 'attack'], 'the manifest roles');
  run(a, 0.5);
  a.setSkill(true);
  assert.equal(a.swing(0.3), true);
  run(a, 0.3);                 // the strike
  a.setSkill(false);           // the skill's 'skill' off, in the strike's batch
  assert.equal(a.mode, 'attack');
  assert.equal(a.current, 'Attack', 'not cut to Idle at the strike');
  run(a, 1.5);
  assert.equal(a.mode, 'base');
  assert.equal(a.current, 'Idle', 'the attack rests on the idle once it has played');
});

test('the skill ending outside an attack still goes back to the base clip', () => {
  const a = actor('char_103_angel', 0);
  run(a, 0.5);
  a.setSkill(true);
  a.setSkill(false);
  assert.equal(a.mode, 'base');
  assert.equal(a.current, 'Idle');
});

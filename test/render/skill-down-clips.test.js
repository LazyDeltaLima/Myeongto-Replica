// test/render/skill-down-clips.test.js — the facing-down clips a role names by another rule than its `down.by`: a skin mix table's end (`endDown`,
// 클로저 S2 / S3, docs/rules/render.md 「스킬 끝·대기 클립 추가 판정」) and a clip that goes by another direction (`down.deployClips`, 브리지드 S2's idle).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi } from './fakepixi.js';

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const entryOf = (skill, names) => ({
  anims: { idle: 'Idle', deploy: null, attack: { begin: null, loop: 'Attack', end: null }, skill: { ...skill, index: 0 }, skills: { 0: { ...skill, index: 0 } }, die: null, move: null, stun: null },
  animations: Object.fromEntries(['Idle', 'Attack', ...names].map((n) => [n, 1])), events: [], hits: {},
});
const actorOf = (entry, downs) => {
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setBase('idle');
  a.downs = () => downs;
  return a;
};

test('endDown: the skill closes on it only facing down, and no end clip facing right', () => {
  const skill = { begin: null, loop: 'S_Loop', end: null, idle: 'S_Idle', endDown: 'S_Down_End', down: { by: 'face', map: { S_Loop: 'S_Down_Loop', S_Idle: 'S_Down_Idle' } } };
  const names = ['S_Loop', 'S_Idle', 'S_Down_Loop', 'S_Down_Idle', 'S_Down_End'];
  const down = actorOf(entryOf(skill, names), { face: true, deploy: false });
  assert.equal(down._skillEnd(down.roles.skill), true);
  assert.equal(down.mode, 'skillEnd');
  const right = actorOf(entryOf(skill, names), { face: false, deploy: false });
  assert.equal(right._skillEnd(right.roles.skill), false);
});

test('down.deployClips: her idle goes by the deployed direction while her attack clip goes by where she faces', () => {
  const skill = { begin: null, loop: 'S_Loop', end: null, idle: 'S_Idle', down: { by: 'face', deployClips: ['S_Idle'], map: { S_Loop: 'S_Down_Loop', S_Idle: 'S_Down_Idle' } } };
  const names = ['S_Loop', 'S_Idle', 'S_Down_Loop', 'S_Down_Idle'];
  const turned = actorOf(entryOf(skill, names), { face: true, deploy: false });
  assert.equal(turned._dn(turned.roles.skill, 'S_Loop'), 'S_Down_Loop');
  assert.equal(turned._dn(turned.roles.skill, 'S_Idle'), 'S_Idle');
  const deployed = actorOf(entryOf(skill, names), { face: false, deploy: true });
  assert.equal(deployed._dn(deployed.roles.skill, 'S_Loop'), 'S_Loop');
  assert.equal(deployed._dn(deployed.roles.skill, 'S_Idle'), 'S_Down_Idle');
});

// test/render/anim-keys.test.js — render roles from the client's clip keys (tools/assets/anim-keys.mjs, docs/rules/render.md
// 「Spine 클립 커버리지」 J). The keys themselves are client-only (.cache/anim-keys.json, never tracked); these records are made up
// in their shape: an ability's key goes through its mode's pairs and the skin's key table, the skin's mix clips open and close
// a spell of attacks, the modes around a skill's own give its opening / closing clip, a skill without a clip of its own
// attacks with the plain clip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyRoles, attackAbility } from '../../tools/assets/anim-keys.mjs';

const clips = (...n) => Object.fromEntries(n.map((x) => [x, 1]));

test('Idle / Born / Die and the attack through the skin key table; mix clips open and close the attack', () => {
  const op = {
    skin: { keys: { Born: 'Start', Attack: 'Attack_Loop' }, mix: [['Idle', 'Attack_Loop', 'Attack_Begin'], ['Attack_Loop', 'Idle', 'Attack_End']] },
    modes: [{ name: 'Default', pairs: {}, abilities: { 'Body/Attack': { key: 'Attack' } } }],
    skills: [],
  };
  const r = keyRoles(op, clips('Idle', 'Start', 'Die', 'Attack_Begin', 'Attack_Loop', 'Attack_End'));
  assert.deepEqual([r.idle, r.deploy, r.die], ['Idle', 'Start', 'Die']);
  assert.deepEqual(r.attack, { begin: 'Attack_Begin', loop: 'Attack_Loop', end: 'Attack_End' });
});

test('a ThreePart attack: its first-attack begin and, without an _endAnim, its ability\'s end key', () => {
  const op = {
    skin: { keys: {}, mix: [] },
    modes: [{ name: 'Default', pairs: {}, abilities: { 'Body/Attack': { key: '', end: 'Attack_End', three: { begin: 'Attack_Begin', oneshot: 'Attack', end: null, first: 1 } } } }],
    skills: [],
  };
  const r = keyRoles(op, clips('Idle', 'Attack_Begin', 'Attack', 'Attack_End'));
  assert.deepEqual(r.attack, { begin: 'Attack_Begin', loop: 'Attack', end: 'Attack_End', firstBegin: true });
});

test('skills: a mode attack with its Idle pair, a channel on the skill, a clip-less skill, the modes around a skill', () => {
  const op = {
    skin: { keys: {}, mix: [['Idle', 'Skill_1_Idle', 'Skill_1_Begin'], ['Skill_1_Idle', 'Idle', 'Skill_1_End']] },
    modes: [
      { name: 'Default', pairs: {}, abilities: { 'Body/Attack': { key: 'Attack' } } },
      { name: 'S1', pairs: { Idle: 'Skill_1_Idle' }, abilities: { 'Body/Attack': { key: 'Skill_1_Loop' } } },
      { name: 'S3_TakeOff', pairs: {}, abilities: { 'Body/Attack': { key: 'Skill_3_Begin' } } },
      { name: 'S3', pairs: { Attack: 'Skill_3_Loop' }, abilities: { 'Body/Attack': { key: 'Attack' } } },
      { name: 'S3_Landing', pairs: {}, abilities: { 'Body/Attack': { key: 'Skill_3_End' } } },
    ],
    skills: [
      { id: 's1', abilities: {} },
      { id: 's2', abilities: { '': { chan: { begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End' } } } },
      { id: 's3', abilities: {} },
    ],
  };
  const r = keyRoles({ ...op, skills: [...op.skills, { id: 'common', abilities: {} }] },
    clips('Idle', 'Attack', 'Skill_1_Begin', 'Skill_1_Loop', 'Skill_1_End', 'Skill_1_Idle', 'Skill_2_Begin', 'Skill_2_Loop', 'Skill_2_End', 'Skill_3_Begin', 'Skill_3_Loop', 'Skill_3_End'));
  assert.deepEqual(r.skills[0], { begin: 'Skill_1_Begin', loop: 'Skill_1_Loop', end: 'Skill_1_End', idle: 'Skill_1_Idle', index: 0 });
  assert.deepEqual(r.skills[1], { begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: null, index: 1 });
  assert.deepEqual(r.skills[2], { begin: 'Skill_3_Begin', loop: 'Skill_3_Loop', end: 'Skill_3_End', idle: null, index: 2 });
  assert.equal(r.skills[3].via, 'attack', 'a skill with no clip of its own and no mode attacks with the plain clip');
  assert.equal(r.skills[3].loop, null);
});

test('a key the skeleton lacks gives no clip; the attack ability is the direct one, else the shallowest named attack', () => {
  const op = { skin: { keys: {}, mix: [] }, modes: [{ name: 'Default', pairs: {}, abilities: { 'Body/Attack': { key: 'Attack' } } }], skills: [] };
  assert.equal(keyRoles(op, clips('Idle')).attack, null);
  assert.equal(attackAbility({ 'Body/Attack': { key: '' }, 'Body/Attack/Attack_B': { key: 'B' }, 'Body/Attack/Attack_A': { key: 'A' } }).key, 'A');
  assert.equal(attackAbility({ 'Body/M2Attack/Normal': { key: 'N' }, 'Body/Talents/1': { key: 'T' } }).key, 'N');
});

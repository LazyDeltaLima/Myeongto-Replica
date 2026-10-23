// test/render/lemuen-s2-aim.test.js — 蕾缪安 S2 归乡邀约 (docs/rules/render.md 「Spine 클립 커버리지」): the official S2 mode attacks
// with `Normal` (her plain Attack_Begin / Attack_Loop) and aims with `Aim`, a channel `_default {Skill_2_Begin, Skill_2_Idle,
// Skill_2_End}`; skchr_lemuen_2 casts no clip. The kit holds the aim with fx 'lemuenAim' { signal: 'aim', on } (SpineActor.
// holdSignal). And a skill that attacks with the plain attack clip casts none of its own (耀骑士临光 S2, 远牙 S1 / S2,
// 凯尔希·思衡托 S1): the attack role's begin / end it carries are not played as it starts / ends. Real manifest entries, headless
// fake PIXI (test/render/fakepixi.js); the kit through the real battle.

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

function actor(charId, skillIndex, side = 'front') {
  const entry = assets.chars[charId].spine[side];
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  a.log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { a.log.push(['set', name, !!loop]); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { a.log.push(['queue', name, !!loop]); return add(i, name, loop); };
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

test('蕾缪安 S2 roles: the plain attack, the aim channel as the skill clip\'s `aim` signal (both models)', () => {
  for (const side of ['front', 'back']) {
    const s2 = assets.chars.char_4193_lemuen.spine[side].anims.skills['1'];
    assert.equal(s2.via, 'attack', side);
    assert.equal(s2.loop, 'Attack_Loop', side);
    assert.deepEqual(s2.signals, { aim: { begin: 'Skill_2_Begin', loop: 'Skill_2_Idle', end: 'Skill_2_End' } }, side);
  }
});

test('蕾缪安 S2: no clip at the cast, plain attacks, the aim holds Skill_2_Idle until it ends on Skill_2_End', () => {
  const a = actor('char_4193_lemuen', 1);
  a.setSkill(true);
  assert.deepEqual(a.log, [['set', 'Idle', true]], 'the cast plays no clip of its own (the resting clip stays)');
  a.attack(1.2);
  assert.equal(a.current, 'Attack_Loop', 'her attacks are the plain attack');
  run(a, 2);
  a.log.length = 0;
  assert.ok(a.holdSignal('aim', true));
  assert.equal(a.mode, 'aim');
  assert.deepEqual(a.log, [['set', 'Skill_2_Begin', false], ['queue', 'Skill_2_Idle', true]]);
  a.attack(1.2);
  assert.equal(a.mode, 'aim', 'an attack meanwhile leaves the aim alone');
  run(a, 3);
  assert.equal(a.mode, 'aim', 'held as long as the sim aims');
  a.log.length = 0;
  a.holdSignal('aim', false);
  assert.deepEqual(a.log[0], ['set', 'Skill_2_End', false], 'the shot closes the channel');
  run(a, 2);
  assert.equal(a.mode, 'base');
  assert.equal(a.current, 'Idle');
  a.log.length = 0;
  a.holdSignal('aim', false);
  assert.deepEqual(a.log, [], 'an off without an aim does nothing');
});

test('蕾缪安 S2: a stun cuts the aim; its off afterwards is ignored', () => {
  const a = actor('char_4193_lemuen', 1);
  a.setSkill(true);
  a.holdSignal('aim', true);
  a.setBase('stun', true);
  assert.equal(a.mode, 'stun');
  a.log.length = 0;
  a.holdSignal('aim', false);
  assert.equal(a.mode, 'stun');
  assert.deepEqual(a.log, []);
});

test('a skill that attacks with the plain clip plays no Attack_Begin / Attack_End as it starts and ends', () => {
  for (const [id, i] of [['char_1014_nearl2', 1], ['char_430_fartth', 0], ['char_430_fartth', 1], ['char_1052_kalts2', 0], ['char_4193_lemuen', 1]]) {
    const a = actor(id, i);
    assert.equal(a.roles.skill.via, 'attack', `${id} S${i + 1}`);
    a.setSkill(true);
    assert.ok(!a.log.some(([, n]) => /^(Attack|Skill)/.test(n)), `${id} S${i + 1}: no clip at the cast (${JSON.stringify(a.log)})`);
    run(a, 1);
    a.setSkill(false);
    assert.ok(!a.log.some(([, n]) => n === 'Attack_End'), `${id} S${i + 1}: no Attack_End as it ends`);
  }
});

test('the kit (a real battle): one aim = fx lemuenAim on as it locks, off with the shot, on her own id', async () => {
  const { makeBattle, enemyRec } = await import('../helpers/battleHarness.js');
  const { getDefaultSource } = await import('../../server/sim/simdata.js');
  const id = 'chess_char_6_01_a', sid = 'skchr_lemuen_2';
  const skillIndex = getDefaultSource().rawChess(id).skills.find((x) => x.skillId === sid).index;
  const log = [];
  const h = makeBattle({
    seed: 7, autoFinish: false, timeLimit: 400,
    defs: { enemies: { el: enemyRec({ key: 'el', hp: 1e7, speed: 0, rank: 'ELITE' }) } },
    units: [{ chessId: id, row: 10, col: 4, skillIndex, carryState: { sp: 999 } }], enemies: [{ key: 'el', pos: [10, 6] }],
    setup(b) {
      const fx = b.fx.bind(b);
      b.fx = (kind, o) => { if (kind === 'lemuenAim' || kind === 'crit') log.push([kind, o?.on, o?.id, b.time]); return fx(kind, o); };
    },
  });
  const u = h.unit(id);
  assert.ok(h.runUntil(() => !!u.mem.lemAim, 20), 'aims at the wanted enemy');
  assert.ok(h.runUntil(() => !u.mem.lemAim, 10), 'and shoots');
  const aim = log.filter(([k]) => k === 'lemuenAim');
  assert.deepEqual(aim.map(([, on, who]) => [on, who]), [[1, u.id], [0, u.id]]);
  const crit = log.find(([k]) => k === 'crit');
  assert.ok(crit && Math.abs(crit[3] - aim[1][3]) < 1e-9, 'off at the shot');
});

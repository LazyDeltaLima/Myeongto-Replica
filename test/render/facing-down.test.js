// test/render/facing-down.test.js — the facing-down clips (`*Down*`, docs/rules/render.md 「Spine 클립 커버리지」 아래 방향):
// the client plays an ability's `_downAnimKey` / `_downEndAnimKey` (AbstractAnimatedAbility.GetAnimKey / OnCastEnd →
// CheckDownAttack: the facing with `_faceToTarget`, else the deploy direction), a ThreePart attack's or channel's `_down`
// bundle (`_GetAnimBundle`), a skill prefab's `_beginAnimDown` (BasicSkill.get_beginAnim: the deploy direction) and the mode a
// skill buff switches to on CheckCharacterDefaultDirection / CheckFaceDirection DOWN. The roles carry them (tools/assets/
// anim-keys.mjs: `down`, `beginDown`, `downMode`); SpineActor takes them by its `downs()`. Real manifest entries, headless
// fake PIXI (test/render/fakepixi.js).

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

/** An actor of `charId`'s model with skill `skillIndex`, facing per `f` { deploy, face } (mutable). */
function actor(charId, skillIndex, f, side = 'front') {
  const entry = assets.chars[charId].spine[side];
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  a.setSkillIndex(skillIndex);
  a.downs = () => f;
  a.log = [];
  const st = a.spine.state;
  const set = st.setAnimation, add = st.addAnimation;
  st.setAnimation = (i, name, loop) => { a.log.push(['set', name]); return set(i, name, loop); };
  st.addAnimation = (i, name, loop) => { a.log.push(['queue', name]); return add(i, name, loop); };
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };
const names = (a) => a.log.map((e) => e[1]);

test('新约能天使: her ThreePart attack takes its `_down` bundle while she faces down (`_faceToTarget`), and its mix out', () => {
  const f = { deploy: false, face: true };
  const a = actor('char_1041_angel2', 0, f);
  a.swing(0.5, null, true);
  assert.deepEqual(names(a).slice(-2), ['Attack_Down_Begin', 'Attack_Down_Loop'], 'the first swing opens on the down begin');
  run(a, 3);
  assert.ok(names(a).includes('Attack_Down_End'), 'the spell of attacks ends on the down loop\'s mix into Idle');
  f.face = false;
  a.log.length = 0;
  a.swing(0.5, null, true);
  assert.deepEqual(names(a).slice(-2), ['Attack_Begin', 'Attack_Loop'], 'facing sideways: the plain bundle');
  assert.equal(a._dn(a.roles.attack, 'Attack_Loop'), 'Attack_Loop');
  // deployed facing down but turned sideways: `_faceToTarget` goes by the facing
  const b = actor('char_1041_angel2', 0, { deploy: true, face: false });
  b.swing(0.5);
  assert.equal(b.current, 'Attack_Loop');
});

test('维什戴尔: each of her clips taking turns has its own facing-down clip', () => {
  const a = actor('char_1035_wisdel', 0, { deploy: false, face: true });
  const seen = new Set();
  for (let i = 0; i < 12; i++) { a.swing(0.4); seen.add(a.current); run(a, 2); }
  for (const n of seen) assert.match(n, /^Attack_Down_[ABC]$/);
  assert.ok(seen.size >= 2);
});

test('史尔特尔 S2: a deploy-direction key — down only when deployed facing down, whatever the facing', () => {
  const f = { deploy: true, face: false };
  const a = actor('char_350_surtr', 1, f);
  a.setSkill(true);
  run(a, 3);
  a.attack(1.2);
  assert.equal(a.current, 'Skill_2_Down');
  f.deploy = false; f.face = true;
  run(a, 3);
  a.attack(1.2);
  assert.equal(a.current, 'Skill_2');
});

test('号角 S3 deployed facing down: her S3(D) mode — its begin, idle, ranged clip (a 要塞 pair) and end', () => {
  const a = actor('char_4039_horn', 2, { deploy: true, face: true });
  a.fortressClips = [['Skill_3_A_Loop', 'Skill_3_B_Loop']];
  a.setSkill(true);
  assert.equal(a.log.at(-2)[1], 'Skill_Down_3_Begin');
  assert.equal(a.log.at(-1)[1], 'Skill_Down_3_Idle');
  a.atkRanged = true;
  a.attack(1.5);
  assert.equal(a.current, 'Skill_Down_3_Loop', 'the ranged clip of S3(D)');
  a.atkRanged = false;
  run(a, 3);
  a.attack(1.5);
  assert.equal(a.current, 'Skill_3_A_Loop', 'the melee clip is the same in both modes');
  run(a, 3);
  a.log.length = 0;
  a.setSkill(false);
  assert.equal(a.log[0][1], 'Skill_Down_3_End');
  // the next cast deployed sideways: S3 again
  const b = actor('char_4039_horn', 2, { deploy: false, face: true });
  b.setSkill(true);
  assert.equal(b.log.at(-2)[1], 'Skill_3_Begin');
});

test('跃跃 S2: `_beginAnimDown` and the S2[Down] mode by the deploy direction, its attack by the facing', () => {
  const f = { deploy: true, face: true };
  const a = actor('char_4100_caper', 1, f);
  a.setSkill(true);
  assert.deepEqual(names(a).slice(-2), ['Skill_Down_Begin', 'Skill_Down_Idle']);
  run(a, 3);
  a.attack(1.2);
  assert.equal(a.current, 'Skill_Down_Loop');
  run(a, 3);
  assert.equal(a.current, 'Skill_Down_Idle', 'back to the down mode\'s idle');
});

test('忍冬 S3 (CheckFaceDirection): deployed sideways but facing down, the down mode with the plain begin', () => {
  const a = actor('char_4026_vulpis', 2, { deploy: false, face: true });
  a.setSkill(true);
  assert.deepEqual(names(a).slice(-2), ['Skill_3_Begin', 'Skill_Down_3_Idle'], '`_beginAnimDown` goes by the deploy direction');
  run(a, 3);
  a.attack(1);
  assert.equal(a.current, 'Skill_Down_3_Loop');
  const b = actor('char_4026_vulpis', 2, { deploy: true, face: true });
  b.setSkill(true);
  assert.equal(b.log.at(-2)[1], 'Skill_Down_3_Begin');
});

test('乌尔比安 S1: a channel\'s `_down` bundle when deployed facing down', () => {
  const a = actor('char_4145_ulpia', 0, { deploy: true, face: false });
  a.setSkill(true);
  assert.equal(a.log.at(-2)[1], 'Skill_1_Down_Begin');
  run(a, 2);
  a.log.length = 0;
  a.setSkill(false);
  assert.equal(a.log[0][1], 'Skill_1_Down_End');
});

test('no facing source, or the Back model: the plain clips', () => {
  const a = actor('char_1041_angel2', 0, null);
  a.downs = null;
  a.swing(0.5, null, true);
  assert.equal(a.current, 'Attack_Begin');
  const b = actor('char_1041_angel2', 0, { deploy: true, face: true }, 'back');
  b.swing(0.5);
  assert.doesNotMatch(b.current, /Down/);
});

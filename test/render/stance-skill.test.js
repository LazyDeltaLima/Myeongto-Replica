// test/render/stance-skill.test.js — how a skill's mode attacks (tools/assets/anim-overrides.mjs applyModeAttacks →
// data/assets.json skill `stance` / `plainAttack`, render/spine.js _stance / _attackClip; docs/rules/render.md 「스킬 중 공격
// 클립」). A mode attack `_animKey ""` where the Default mode has one: the skill's loop (or idle) is the stance and its
// attacks play no clip — 烛煌 S3 (maintainer report 2026-10-10: her S3 motion stopped after the first attack), 白面鸮 S2
// (she stood up at every heal). The Default's key on a one-clip skill: the clip is the cast, its attacks the plain
// attack clip — 瑕光 S2. Headless fake PIXI (test/render/fakepixi.js).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi } from './fakepixi.js';
import { applyModeAttacks } from '../../tools/assets/anim-overrides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const TIMING = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-attack-timing.json'), 'utf8'));
const BLAZE = 'char_1040_blaze2';

let fake, SpineActor;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
});
after(() => fake.restore());

const dataOf = (entry) => ({ animations: Object.keys(entry.animations).map((name) => ({ name })) });
function actor(id, { strip = false } = {}) {
  let entry = assets.chars[id].spine.front;
  if (strip) {
    // the manifest before the rule: no stance / plainAttack flags
    entry = JSON.parse(JSON.stringify(entry));
    for (const c of [entry.anims.skill, ...Object.values(entry.anims.skills || {})]) { if (c) { delete c.stance; delete c.plainAttack; } }
  }
  const a = new SpineActor(dataOf(entry), entry);
  a.setBase('idle');
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };
const skillOf = (id, i) => assets.chars[id].spine.front.anims.skills[String(i)];

test('the manifest follows the client modes: stance where the mode attack has no key, plain attack where it has the Default one', () => {
  const t = TIMING.ops[BLAZE];
  assert.equal(t.attack[t.modes.indexOf('S3')].anim, '');
  for (const [id, i] of [[BLAZE, 2], ['char_128_plosis', 1], ['char_202_demkni', 2], ['char_469_indigo', 0], ['char_469_indigo', 1], ['char_4193_lemuen', 2]]) {
    assert.equal(skillOf(id, i).stance, true, `${id} S${i + 1} stance`);
  }
  for (const [id, i] of [['char_423_blemsh', 1], ['char_1023_ghost2', 0], ['char_1020_reed2', 1]]) {
    assert.equal(skillOf(id, i).plainAttack, true, `${id} S${i + 1} plain attack`);
  }
  // 耀骑士临光 S2: no clip of its own — the plain attack, the mode's Die pair
  const n = skillOf('char_1014_nearl2', 1);
  assert.equal(n.via, 'attack');
  assert.equal(n.loop, 'Attack_Loop');
  assert.equal(n.die, 'Skill_2_Die');
  // left out: 歌蕾蒂娅 S2 (its own attack channel), 薄荷 S2 (the Default mode has no key to compare), 乌尔比安 S3 (Begin / Loop / End)
  assert.equal(skillOf('char_474_glady', 1).stance, undefined);
  assert.equal(skillOf('char_388_mint', 1).stance, undefined);
  assert.equal(skillOf('char_4145_ulpia', 2).plainAttack, undefined);
});

test('applyModeAttacks: the rule on a made-up model', () => {
  const timing = { ops: { char_x: { modes: ['Default', 'S1', 'S2', 'S3'], attack: [{ anim: 'Attack' }, { anim: '' }, { anim: 'Attack' }, { anim: 'Attack' }] } } };
  const anims = {
    attack: { begin: null, loop: 'Attack', end: null },
    skills: {
      0: { begin: 'Skill_1_Begin', loop: 'Skill_1_Loop', end: 'Skill_1_End', idle: null, index: 0 },
      1: { begin: null, loop: 'Skill_2', end: null, idle: null, index: 1 },
      2: { begin: 'Skill_3_Begin', loop: 'Skill_3_Loop', end: 'Skill_3_End', idle: null, index: 2 },
    },
  };
  applyModeAttacks('op:char_x:front', anims, timing, {});
  assert.equal(anims.skills[0].stance, true);
  assert.equal(anims.skills[1].plainAttack, true);
  assert.equal(anims.skills[2].plainAttack, undefined, 'a Begin / Loop / End skill is left as it is');
  // a Default mode without a key of its own decides nothing
  const empty = { ops: { char_x: { ...timing.ops.char_x, attack: [{ anim: '' }, { anim: '' }, null, null] } } };
  const b = { attack: anims.attack, skills: { 0: { loop: 'Skill_1_Loop', index: 0 } } };
  applyModeAttacks('op:char_x:front', b, empty, {});
  assert.equal(b.skills[0].stance, undefined);
  // enemies are not touched
  const e = { skills: { 0: { loop: 'Skill_1_Loop', index: 0 } } };
  applyModeAttacks('enemy:char_x', e, timing, {});
  assert.equal(e.skills[0].stance, undefined);
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

test('白面鸮 S2: her heals keep Skill_Loop on (they stood her up: Loop → End → Idle at every heal)', () => {
  for (const strip of [false, true]) {
    const a = actor('char_128_plosis', { strip });
    a.setSkillIndex(1);
    a.setSkill(true);
    assert.equal(a.current, 'Skill_Start');
    run(a, 1.5);
    const seen = new Set();
    for (let k = 0; k < 3; k++) {
      a.swing(0.3);
      a.attack(1.2);
      for (let t = 0; t < 1.5; t += 1 / 60) { a.update(1 / 60); seen.add(a.current); }
    }
    if (strip) assert.ok(seen.has('Skill_End') || seen.has('Idle'), 'the old manifest: she stood up');
    else {
      assert.ok(!seen.has('Idle') && !seen.has('Skill_End') && !seen.has('Attack'), [...seen].join());
      assert.equal(a._idleName(), 'Skill_Loop');
    }
  }
});

test('瑕光 S2: Skill_2 plays once as the cast, her attacks are Attack (each played Skill_2)', () => {
  const a = actor('char_423_blemsh');
  a.setSkillIndex(1);
  a.setSkill(true);
  assert.equal(a.current, 'Skill_2');
  run(a, 2);
  assert.ok(a.swing(0.3));
  assert.equal(a.current, 'Attack');
  run(a, 2);
  assert.equal(a.current, 'Idle');
  const old = actor('char_423_blemsh', { strip: true });
  old.setSkillIndex(1);
  old.setSkill(true);
  run(old, 2);
  old.swing(0.3);
  assert.equal(old.current, 'Skill_2');
});

test('the other confirmed skills attack with their mode clip', () => {
  for (const [id, i, clip] of [['char_1023_ghost2', 0, 'Attack'], ['char_1020_reed2', 1, 'Attack'], ['char_1014_nearl2', 1, 'Attack_Loop']]) {
    const a = actor(id);
    a.setSkillIndex(i);
    a.setSkill(true);
    run(a, 3);
    assert.ok(a.swing(0.3), id);
    const begin = a.roles.attack?.begin;
    assert.ok([clip, begin].includes(a.current), `${id}: ${a.current}`);
  }
});

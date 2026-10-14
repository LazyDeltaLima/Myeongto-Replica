// The clips a skill's or a talent's mode swaps in (docs/rules/render.md 「Spine 클립 커버리지」 D–H): the death and stun
// clips of a skill's mode (anims skill `die` / `stun`, tools/assets/anim-overrides.mjs SKILL_STATE_CLIPS), a talent's
// model form (render/units.js FORMS). Real manifest entries, headless fake PIXI like test/render/attack-alts.test.js and
// test/render/feedback2-doll.test.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));

let fake, SpineActor, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

function actor(charId, skillIndex = null, dir = 'front') {
  const entry = assets.chars[charId].spine[dir];
  const a = new SpineActor({ animations: Object.keys(entry.animations).map((name) => ({ name })) }, entry);
  if (skillIndex != null) a.setSkillIndex(skillIndex);
  return a;
}
const run = (a, s, dt = 1 / 60) => { for (let t = 0; t < s - 1e-9; t += dt) a.update(dt); };

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const store = () => ({
  picture: () => null,
  image: async () => null,
  hasBack: (id) => hasBackSpine(assets, id),
  spineEntry: (id, o) => spineEntry(assets, id, o),
  spine: { acquire: async (entry) => ({ animations: Object.keys(entry.animations || {}).map((name) => ({ name })) }), release() {} },
});
/** A UnitView of operator `id` facing RIGHT on the real manifest, its model built. */
async function view(id, info = {}) {
  const v = new UnitView(fakeViewCtx(fake.P, { assets: store(), cam }), { id: 1, side: 'ally', kind: 'op', defId: id, spine: id, tier: 5, x: 5, y: 9, maxHp: 2000, dir: 'RIGHT', ...info });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const secs = (v, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s * 60); i++) v.update(dt, cam(), i * dt); };

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

test('烛煌 绝处重燃: downed on Revive_Begin, lying on Revive_Idle, up on Revive_End; a knock-out while downed ends the form', async () => {
  const v = await view('char_1040_blaze2', { skillIndex: 2 });
  v.setForm('downed', { form: 'downed' });
  assert.equal(v.actor.current, 'Revive_Begin');
  secs(v, 1.1);
  assert.equal(v.actor.current, 'Revive_Idle');
  v.onAttack(null, 1.6);
  assert.equal(v.actor.current, 'Revive_Idle', 'no attack clip while downed');
  v.setForm(null, { form: null });
  assert.equal(v.actor.current, 'Revive_End');
  secs(v, 1);
  assert.equal(v.actor.current, 'Idle');
  const w = await view('char_1040_blaze2', { skillIndex: 2, form: 'downed' });
  assert.equal(w.actor.current, 'Revive_Idle', 'a view built while she is downed');
  w.die();
  assert.equal(w.actor.current, 'Die');
  assert.equal(w.form, null, 'the knock-out ends the form (the sim clears it without an fx)');
});

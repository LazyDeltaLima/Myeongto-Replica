// The clips a skill's or a talent's mode swaps in (docs/rules/render.md 「Spine 클립 커버리지」 D–H): the death and stun
// clips of a skill's mode (anims skill `die` / `stun`, tools/assets/anim-overrides.mjs SKILL_STATE_CLIPS), a skill's or a
// talent's model form (render/units.js FORMS), a skill whose End is a row of clips. Real manifest entries, headless fake PIXI like test/render/attack-alts.test.js and
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

test('泥岩 S3: Skill_2_Begin, asleep on Skill_2_Sleep, Skill_2_Awake, then the S3 mode; facing UP asleep on Skill_2_Idle', async () => {
  for (const [dir, asleep] of [['RIGHT', 'Skill_2_Sleep'], ['UP', 'Skill_2_Idle']]) {
    const v = await view('char_311_mudrok', { skillIndex: 2, dir });
    v.actor.setSkill(true);                       // the 'skill' event, then the kit's fx 'stone' { form: 'dormant' }
    v.setForm('dormant', { form: 'dormant' });
    if (dir === 'RIGHT') assert.equal(v.actor.current, 'Skill_2_Begin');
    secs(v, 2);
    assert.equal(v.actor.current, asleep, dir);
    v.setForm(null, { form: null });              // fx 'rockfall'
    if (dir === 'RIGHT') { assert.equal(v.actor.current, 'Skill_2_Awake'); secs(v, 1.1); }
    assert.equal(v.actor.current, 'Skill_2_Idle', dir);
    v.onAttack(null, 1.2);
    assert.equal(v.actor.current, 'Skill_2_Attack', dir);
  }
});

test('歌蕾蒂娅 S3: Skill_3_Startup, the S3 mode\'s Skill_3_Chant between her plain attacks, the FinalAttack Begin → Loop → End', () => {
  const a = actor('char_474_glady', 2);
  a.setSkill(true);
  assert.equal(a.current, 'Skill_3_Startup');
  run(a, 0.6);
  assert.equal(a._afterBegin(a.roles.skill), 'Skill_3_Chant');
  assert.ok(a.swing(0.5));
  assert.equal(a.current, 'Attack');
  run(a, 3);
  assert.equal(a.current, 'Skill_3_Chant');
  a.setSkill(false);
  const seen = [a.current];
  for (let i = 0; i < 240; i++) { a.update(1 / 60); if (seen.at(-1) !== a.current) seen.push(a.current); }
  assert.deepEqual(seen, ['Skill_3_Begin', 'Skill_3_Loop', 'Skill_3_End', 'Idle']);
});

test('a skill\'s sub-mode form (endsWithSkill): 维什戴尔 overload, 寒芒克洛丝 4 shots, 佩佩 full range — ending with the skill', async () => {
  const cases = [
    ['char_1035_wisdel', 1, 'overload', 'Skill_2_Loop', 'Skill_2_Overload_Loop', 'Skill_2_Overload_Idle', 'Skill_2_Overload_End'],
    ['char_1021_kroos2', 1, 'quad', 'Skill_Loop', 'Skill_Loop_2', 'Skill_Idle', 'Skill_End'],
    ['char_4058_pepe', 2, 'rangeMax', 'Skill_3_Loop_A', 'Skill_3_Loop_B', 'Skill_3_Idle', 'Skill_3_End'],
  ];
  for (const [id, i, form, before, after, idle, end] of cases) {
    const hit = (clip) => assets.chars[id].spine.front.hits?.[clip]?.[0] ?? 0.4;   // a swing at the clip's own speed
    const v = await view(id, { skillIndex: i });
    v.setSkill(true);
    secs(v, 1);
    v.onSwing(hit(before), 'none');
    assert.equal(v.actor.current, before, id);
    secs(v, 3);
    v.setForm(form, { form });
    if (id === 'char_1035_wisdel') { assert.equal(v.actor.current, 'Skill_2_Overload_Begin'); secs(v, 0.3); }
    assert.equal(v.actor.current, idle, `${id} rests in the mode's idle`);
    v.onSwing(hit(after), 'none');
    assert.equal(v.actor.current, after, id);
    secs(v, 3);
    v.setSkill(false);
    assert.equal(v.actor.current, end, `${id} closes in the mode`);
    assert.equal(v.form, null, `${id}: the form ends with the skill`);
    secs(v, 1.2);
    v.setSkill(true);
    secs(v, 1);
    v.onSwing(hit(before), 'none');
    assert.equal(v.actor.current, before, `${id}: the next cast starts in the skill's own mode`);
  }
});

test('a cast\'s clip variant (the sim\'s skill event 4th field): 灵知 charged S2 Skill_3, 缄默德克萨斯 S3 recast Start_3_2', () => {
  const g = actor('char_206_gnosis', 1);
  g.setSkill(true);
  assert.equal(g.current, 'Skill_2');
  g.setSkill(false);
  run(g, 2);
  g.setSkill(true, 'charged');
  assert.equal(g.current, 'Skill_3');
  g.setSkill(false);
  run(g, 2);
  g.setSkill(true);   // the snapshot flag first, the event's variant after
  g.setSkill(true, 'charged');
  assert.equal(g.current, 'Skill_3');
  const t = actor('char_1028_texas2', 2);
  t.setSkill(true);
  assert.equal(t.current, 'Start_3');
  t.setSkill(false);
  run(t, 2);
  t.setSkill(true, 'recast');
  assert.equal(t.current, 'Start_3_2');
});

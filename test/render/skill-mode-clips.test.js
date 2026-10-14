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

test('歌蕾蒂娅 S3: Skill_3_Startup, the S3 mode\'s Skill_3_Chant (no normal attacks meanwhile), the FinalAttack Begin → Loop → End', () => {
  const a = actor('char_474_glady', 2);
  a.setSkill(true);
  assert.equal(a.current, 'Skill_3_Startup');
  run(a, 0.6);
  assert.equal(a._afterBegin(a.roles.skill), 'Skill_3_Chant', 'queued after Skill_3_Startup');
  run(a, 3);
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

test('丰川祥子 S2: the piano from the deployment (Skill_2_Start, _Idle_A, _Loop_A); a cast plays Trans_A to the organ (_Idle_B, _Loop_B), Trans_B back', async () => {
  const id = 'char_4182_oblvns';
  const hit = (clip) => assets.chars[id].spine.front.hits?.[clip]?.[0] ?? 0.4;
  const v = await view(id, { skillIndex: 1 });
  v.actor.deploy();
  assert.equal(v.actor.current, 'Skill_2_Start');
  secs(v, 1.1);
  assert.equal(v.actor.current, 'Skill_2_Idle_A');
  v.onSwing(hit('Skill_2_Loop_A'), 'none', false, true);
  assert.equal(v.actor.current, 'Skill_2_Loop_A', 'the timbre mode\'s attack, on a blocked enemy too');
  secs(v, 2);
  v.setSkill(true);                                 // from the piano
  assert.equal(v.actor.current, 'Skill_2_Trans_A');
  v.setForm('organ', { form: 'organ' });
  v.setSkill(false);
  secs(v, 0.5);
  assert.equal(v.actor.current, 'Skill_2_Idle_B');
  v.onSwing(hit('Skill_2_Loop_B'), 'none');
  assert.equal(v.actor.current, 'Skill_2_Loop_B');
  secs(v, 2);
  v.setSkill(true, 'fromOrgan');
  assert.equal(v.actor.current, 'Skill_2_Trans_B');
  v.setForm(null, { form: null });
  v.setSkill(false);
  secs(v, 0.5);
  assert.equal(v.actor.current, 'Skill_2_Idle_A');
});

test('赤刃明霄陈 S2: Skill_2_Begin → Skill_2_Disappear held while she slashes, back on Start_2, then her plain clips', async () => {
  const id = 'char_1050_chen3';
  const v = await view(id, { skillIndex: 1 });
  v.setSkill(true);
  v.setForm('vanish', { form: 'vanish' });
  assert.equal(v.actor.current, 'Skill_2_Begin');
  secs(v, 0.7);
  assert.equal(v.actor.current, 'Skill_2_Disappear');
  secs(v, 2);
  assert.equal(v.actor.current, 'Skill_2_Disappear', 'held (gone) while she slashes');
  assert.equal(v.actor.mode, 'held');
  v.setForm(null, { form: null });
  assert.equal(v.actor.current, 'Start_2');
  secs(v, 1.1);
  assert.equal(v.actor.current, 'Idle');
  v.onSwing(assets.chars[id].spine.front.hits?.Attack?.[0] ?? 0.4, 'none');
  assert.equal(v.actor.current, 'Attack', 'the 6 s after the slashes: her plain attack');
});

test('缄默德克萨斯 S2 / S3 (cast as she deploys): she comes in on Start_2 / Start_3, in either event order; S1 and the prep board on Start', async () => {
  for (const [i, clip] of [[1, 'Start_2'], [2, 'Start_3']]) {
    const v = await view('char_1028_texas2', { skillIndex: i });
    v.setSkill(true);   // the passive's deploy burst (skill.reset) comes before the deploy hook
    v.onDeploy();
    assert.equal(v.actor.current, clip, `S${i + 1}: skill, then deploy`);
    secs(v, 1.2);
    assert.equal(v.actor.current, `Skill_${i + 1}_Idle`, `S${i + 1}: then the mode's idle`);
    const w = await view('char_1028_texas2', { skillIndex: i });
    w.onDeploy();
    w.setSkill(true);
    assert.equal(w.actor.current, clip, `S${i + 1}: deploy, then skill`);
    const p = await view('char_1028_texas2', { skillIndex: i });
    p.onDeploy();   // a prep board piece: no cast, the default mode
    assert.equal(p.actor.current, 'Start', `S${i + 1}: no skill on`);
  }
  const s1 = await view('char_1028_texas2', { skillIndex: 0 });
  s1.setSkill(true);
  s1.onDeploy();
  assert.equal(s1.actor.current, 'Start', 'S1 has no mode deploy clip');
});

test('伊内丝 S3 (cast as she deploys): Start_Skill follows her Start drop in either event order; S2 and a cast without a deploy as before', async () => {
  for (const order of ['skill first', 'deploy first']) {
    const v = await view('char_4087_ines', { skillIndex: 2 });
    if (order === 'skill first') { v.setSkill(true); v.onDeploy(); } else { v.onDeploy(); v.setSkill(true); }
    assert.equal(v.actor.current, 'Start', `${order}: the drop first`);
    secs(v, 0.5);
    assert.equal(v.actor.current, 'Start', `${order}: still dropping`);
    secs(v, 0.6);
    assert.equal(v.actor.current, 'Start_Skill', `${order}: then Start_Skill`);
    secs(v, 1.2);
    assert.equal(v.actor.mode, 'base', `${order}: then her resting state (the queued Idle)`);
  }
  const off = await view('char_4087_ines', { skillIndex: 2 });
  off.onDeploy();
  off.setSkill(true);
  off.setSkill(false);   // over before the drop ends: nothing waits
  secs(off, 1.2);
  assert.equal(off.actor.current, 'Idle');
  const s2 = await view('char_4087_ines', { skillIndex: 1 });
  s2.onDeploy();
  s2.setSkill(true);
  assert.notEqual(s2.actor.current, 'Start', 'S2 opens at once, as before');
});

test('予愿安洁莉娜 S1 (default mode S1_TakeOff): she deploys on her take-off Start_2; S2 / S3 on Start', async () => {
  const v = await view('char_1015_aglna2', { skillIndex: 0 });
  v.onDeploy();
  assert.equal(v.actor.current, 'Start_2');
  for (const i of [1, 2]) {
    const w = await view('char_1015_aglna2', { skillIndex: i });
    w.onDeploy();
    assert.equal(w.actor.current, 'Start', `S${i + 1}`);
  }
});

test('乌尔比安 S3: the 【移动】 to the anchor restarts on Skill_3_ReStart_A, on his own tile Skill_3_ReStart_B, the 【返回】 Skill_3_Back', async () => {
  const v = await view('char_4145_ulpia', { skillIndex: 2 });
  v.setSkill(true);
  v.onDeploy('anchor');
  assert.equal(v.actor.current, 'Skill_3_ReStart_A');
  secs(v, 2);
  v.replayDeploy('here');
  assert.equal(v.actor.current, 'Skill_3_ReStart_B');
  secs(v, 2);
  v.onDeploy('back');
  v.setSkill(false);   // the return comes in onEnd, before the skill's off event
  assert.equal(v.actor.current, 'Skill_3_Back');
  const w = await view('char_4145_ulpia', { skillIndex: 2 });
  w.onDeploy();
  assert.equal(w.actor.current, 'Start', 'a plain deployment');
});

test('圣约送葬人 受选之人: the talent shot (the atk event\'s signal T.1) plays Attack_B — Skill_n_Attack_B in S2 / S3 — over the swing', async () => {
  for (const [i, on, plain, talent] of [[0, false, 'Attack_A', 'Attack_B'], [1, true, 'Skill_2_Attack_A', 'Skill_2_Attack_B'], [2, true, 'Skill_3_Attack_A', 'Skill_3_Attack_B']]) {
    const v = await view('char_1032_excu2', { skillIndex: i });
    if (on) { v.setSkill(true); secs(v, 1); }
    v.onSwing(assets.chars.char_1032_excu2.spine.front.hits[plain][0], 'bullet');
    assert.equal(v.actor.current, plain);
    secs(v, 0.3);
    v.onAttack(null, 1, 'bullet');            // the swing's own strike
    assert.equal(v.actor.current, plain);
    v.onAttack(null, 1, 'bullet', 'T.1');     // the talent shot right after it
    assert.equal(v.actor.current, talent, `S${i + 1}`);
    v.onAttack(null, 1, 'bullet', 'T.1');     // its second 'atk' of the same strike
    assert.equal(v.actor.current, talent);
    secs(v, 2);
    assert.notEqual(v.actor.current, talent, 'then back to rest');
  }
});

test('深靛 秘术师: storing an energy (fx signal store) plays Attack_Charge over her attack interval; a model without one stays', async () => {
  const v = await view('char_469_indigo', { skillIndex: 0 });
  v.atkInterval = 1.6;
  v.onSignal('store');
  assert.equal(v.actor.current, 'Attack_Charge');
  secs(v, 2);
  assert.equal(v.actor.current, 'Idle');
  const w = await view('char_1032_excu2', { skillIndex: 0 });
  w.onSignal('store');
  assert.equal(w.actor.current, 'Idle', 'no store clip named');
});

test('新约能天使 S3: Skill_3_Begin, then the strike at the 投递坐标 (Skill_3_Skill), then her S3 attacks', async () => {
  const v = await view('char_1041_angel2', { skillIndex: 2 });
  v.setSkill(true);
  v.onSignal('fireToToken');   // the kit's 'airstrike' fx, in the same tick
  assert.equal(v.actor.current, 'Skill_3_Begin');
  secs(v, 0.3);
  assert.equal(v.actor.current, 'Skill_3_Skill');
  secs(v, 3);
  assert.equal(v.actor.current, 'Skill_3_Idle');
  v.onSwing(0.167, 'bullet');
  assert.equal(v.actor.current, 'Skill_3_Loop');
});

test('凯尔希·思衡托 S3 transport: takes off on Skill_3_Restart_Begin (its own 1 s), lands on Skill_3_Restart_End', async () => {
  const v = await view('char_1052_kalts2', { skillIndex: 2 });
  v.setSkill(true);
  secs(v, 0.5);
  v.onSignal('takeoff', 1);
  assert.equal(v.actor.current, 'Skill_3_Restart_Begin');
  assert.ok(Math.abs(v.actor.spine.state.tracks[0].timeScale - 1) < 1e-9, 'at its own speed');
  secs(v, 3);
  v.onDeploy('land');
  assert.equal(v.actor.current, 'Skill_3_Restart_End');
});

test('予愿安洁莉娜 S3 ending away from her tile: the way home opens on Skill_3_Restart_Begin instead of Skill_3_End', async () => {
  const v = await view('char_1015_aglna2', { skillIndex: 2 });
  v.setSkill(true);
  secs(v, 2);
  v.onSignal('comeback');   // the kit's 'aglnaFlight' { on: 1, signal } from the skill's onEnd …
  v.setSkill(false);        // … then the skill's off event
  assert.equal(v.actor.current, 'Skill_3_Restart_Begin');
  const w = await view('char_1015_aglna2', { skillIndex: 2 });
  w.setSkill(true);
  secs(w, 2);
  w.setSkill(false);        // at home: the plain end
  assert.equal(w.actor.current, 'Skill_3_End');
});

test('焰尾 前锋剑术 in S3: the strike after a dodge (fx riposte { signal, strike }) plays Skill_2_Attack_2; outside S3 nothing changes', async () => {
  const hits = assets.chars.char_420_flamtl.spine.front.hits;
  const v = await view('char_420_flamtl', { skillIndex: 2 });
  v.setSkill(true);
  secs(v, 1);
  v.onSwing(hits.Skill_2_Loop?.[0] ?? 0.3, 'none');
  assert.equal(v.actor.current, 'Skill_2_Loop');
  v.onSignal('riposte', null, true);
  assert.equal(v.actor.current, 'Skill_2_Attack_2');
  const w = await view('char_420_flamtl', { skillIndex: 2 });
  w.onSwing(hits.Attack?.[0] ?? 0.3, 'none');
  w.onSignal('riposte', null, true);
  assert.equal(w.actor.current, 'Attack', 'the Default mode\'s talent attack is its Attack');
});

test('玛恩纳 解放者: a target in range outside her skill (form watch) → Idle_2; her skill idles win; none → Idle', async () => {
  const v = await view('char_4064_mlynar', { skillIndex: 1 });
  v.setForm('watch', { form: 'watch' });
  assert.equal(v.actor.current, 'Idle_2');
  v.setSkill(true);
  secs(v, 1);
  assert.equal(v.actor._idleName(), 'Skill_2_Idle', 'Skill_2_Start, then her S2 idle');
  v.setSkill(false);
  secs(v, 1);
  assert.equal(v.actor.current, 'Idle_2');
  v.setForm(null, { form: null });
  assert.equal(v.actor.current, 'Idle');
});

test('a spell of attacks opens on the first-attack begin (sharing the wind-up) and closes on the attack end: 斯卡蒂, 伺夜 S3, 歌蕾蒂娅 S2', async () => {
  const a = actor('char_263_skadi');
  const hit = assets.chars.char_263_skadi.spine.front.hits.Attack[0];
  assert.ok(a.swing(1, null, true));
  assert.equal(a.current, 'Attack_Begin', 'the sim\'s first attack (the swing event\'s 8th field)');
  const ts = a.spine.state.tracks[0].timeScale;
  assert.ok(Math.abs(ts - (hit + a.dur('Attack_Begin')) / 1) < 1e-9, 'begin + strike over the wind-up');
  run(a, 1.2);
  assert.ok(a.swing(1), 'the next swing of the same spell');
  assert.equal(a.current, 'Attack', 'no begin again');
  run(a, 4);
  assert.notEqual(a.mode, 'attack');
  assert.ok(a.swing(1));
  assert.equal(a.current, 'Attack', 'a pause alone opens no begin: the sim says which swing is a first attack');
  run(a, 4);
  assert.ok(a.swing(1, null, true));
  assert.equal(a.current, 'Attack_Begin', 'a new spell');
  const e = actor('char_279_excu', 1);
  e.setSkill(true);
  run(e, 2);
  assert.ok(e.swing(1, null, true));
  assert.equal(e.current, 'Skill_Right_Begin', '送葬人 S2 mode\'s first attack (firstAttackBegin)');
  const v = actor('char_427_vigil', 2);
  v.setSkill(true);
  run(v, 1);
  assert.ok(v.swing(assets.chars.char_427_vigil.spine.front.hits?.Skill3_Attack_A?.[0] ?? 0.3));
  assert.equal(v.current, 'Skill3_Attack_A', 'S3 has no begin');
  run(v, 2);
  assert.equal(v.current, 'Skill3_ABC_Idle_Into', 'the S3 attacks end back into Skill3_Idle');
  const s = actor('char_263_skadi');
  assert.ok(s.swing(1, null, true));
  run(s, 3);
  assert.equal(s.current, 'Attack_End');
  const g = actor('char_474_glady', 1);
  g.setSkill(true);
  run(g, 1);
  assert.ok(g.swing((assets.chars.char_474_glady.spine.front.hits?.Skill_2_Loop?.[0] ?? 0.4) + g.dur('Skill_2_Begin')));
  assert.equal(g.current, 'Skill_2_Begin', 'the S2 mode\'s attack channel begin');
  run(g, 4);
  assert.equal(g.current, 'Skill_2_End');
});

test('雪猎 reload: Reload_Begin, Reload_Loop while she reloads, Reload_End when full; an attack meanwhile opens on Reload_Break', async () => {
  const id = 'char_4211_snhunt';
  const hit = assets.chars[id].spine.front.hits.Attack_Loop[0];
  const v = await view(id, { skillIndex: 0 });
  v.setForm('reload', { form: 'reload' });
  assert.equal(v.actor.current, 'Reload_Begin');
  secs(v, 0.3);
  assert.equal(v.actor.current, 'Reload_Loop');
  v.setForm(null, { form: null });
  assert.equal(v.actor.current, 'Reload_End', 'full');
  secs(v, 0.3);
  v.setForm('reload', { form: 'reload' });
  secs(v, 0.5);
  v.onSwing(hit + v.actor.dur('Reload_Break'), 'arrow', false, false, true);
  v.setForm(null, { form: null, cut: 1 });
  assert.equal(v.actor.current, 'Reload_Break', 'ReloadAttack: Reload_Break (then Attack_Loop) — no Reload_End');
  assert.equal(v.actor.mode, 'attack');
});

test('facing up (the Back model): 送葬人 / 诗怀雅 attack on Attack_Up, 松果 S1 / S2 on Skill_n_Up; facing right the plain clips', () => {
  for (const [id, i, on, clip] of [['char_279_excu', 0, false, 'Attack_Up'], ['char_308_swire', 0, false, 'Attack_Up'], ['char_440_pinecn', 1, true, 'Skill_2_Up']]) {
    const hits = assets.chars[id].spine.back.hits;
    const b = actor(id, i, 'back');
    if (on) { b.setSkill(true); run(b, 1); }
    assert.ok(b.swing(hits[clip][0]));
    assert.equal(b.current, clip, id);
    const f = actor(id, i, 'front');
    if (on) { f.setSkill(true); run(f, 1); }
    assert.ok(f.swing(0.4));
    assert.ok(!/_Up$/.test(f.current), `${id} front: ${f.current}`);
  }
  const p = actor('char_440_pinecn', 0, 'back');
  p.setSkill(true);
  assert.equal(p.current, 'Skill_1_Up', '松果 S1 cast facing up');
});

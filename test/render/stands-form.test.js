// test/render/stands-form.test.js — a summon's model that stays on its tile off the fight (render/units.js FORMS `stands`): 미틈's 체리 3호
// falls on Die into its 전술 포인트 pose Idle_2 instead of fading, plays ReBorn (Start) and is back with no deploy clip of its own
// (`quiet`); 미틈 leaving ends the pose with the fade. Prefab token_10037_mitm_trshrb: Modes/Reborn, the skin's mix Idle_1 → Idle_2 = Die.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAR = 'token_10037_mitm_trshrb', MACH = 'token_10018_robrta_mach';
const spines = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-token-spines.json'), 'utf8'));
const entryOf = (id) => (spines.tokens ?? spines.spines ?? Object.values(spines).find((x) => x?.[id]) ?? spines)[id];

let fake, UnitView, FORMS;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FORMS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) v.update(dt, cam(), i * dt); };

async function view(id, info = {}) {
  const entry = entryOf(id);
  const names = Object.keys(entry.animations);
  const assets = {
    picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
  const v = new UnitView(fakeViewCtx(fake.P, { assets, cam }), { id: 7, side: 'ally', kind: 'token', defId: id, spine: id, tier: 1, x: 5, y: 5, maxHp: 1000, facing: 1, ...info });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}

test('its clips exist in the skeleton', () => {
  for (const id of [CAR, MACH]) {
    const has = entryOf(id).animations;
    for (const [form, spec] of Object.entries(FORMS[id])) {
      for (const c of [spec.change, spec.leave, spec.roles.idle, spec.roles.die, spec.roles.stun?.loop].filter(Boolean)) assert.ok(c in has, `${id} ${form}: ${c}`);
    }
  }
});

test('knocked out: Die into Idle_2, no fade, off the fight; ReBorn; back with no deploy clip', async () => {
  const v = await view(CAR);
  frames(v, 3);
  v.die();
  v.setForm('tac', { id: 7, form: 'tac' });
  assert.equal(v.actor.current, 'Die', 'the mix');
  assert.equal(v.dying, 0, 'no fade');
  assert.equal(v.alive, false);
  frames(v, 90);
  assert.equal(v.actor.current, 'Idle_2');
  assert.equal(v.remove, false, 'it stays');
  assert.ok(v.alpha > 0.9, 'in full');
  v.setForm('reborn', { id: 7, form: 'reborn' });
  assert.equal(v.actor.current, 'Start', 'ReBorn');
  frames(v, 30);
  v.onDeploy();
  assert.equal(v.alive, true);
  assert.equal(v.form, null);
  assert.equal(v._fxQuietDeploy, true, 'no deploy effect');
  assert.notEqual(v.actor.mode, 'deploy', 'no deploy clip over its ReBorn');
  assert.equal(v.actor.current, 'Idle_1');
});

test('her leaving: the pose fades out', async () => {
  const v = await view(CAR);
  v.die();
  v.setForm('tac', { id: 7, form: 'tac' });
  frames(v, 90);
  v.setForm(null, { id: 7, form: null });
  assert.ok(v.dying > 0, 'the fade');
  frames(v, 120);
  assert.equal(v.remove, true);
});

test('another form is no return: a plain knock-out still fades, a plain deploy still plays Start', async () => {
  const v = await view(CAR);
  v.die();
  assert.ok(v.dying > 0);
  frames(v, 300);
  assert.equal(v.remove, true);
  const w = await view(CAR);
  w.die();
  w.onDeploy();
  assert.notEqual(w._fxQuietDeploy, true);
});

test('a 잔해 built from the snapshot starts on Waste; S2 enters Skill_Loop on Skill_Begin; the machine rests on Default', async () => {
  const w = await view(CAR, { form: 'waste' });
  frames(w, 3);
  assert.equal(w.actor.current, 'Waste');
  const s = await view(CAR);
  frames(s, 3);
  s.setForm('skill', { id: 7, form: 'skill' });
  assert.equal(s.actor.current, 'Skill_Begin');
  frames(s, 30);
  assert.equal(s.actor.current, 'Skill_Loop');
  const m = await view(MACH, { form: 'rest' });
  frames(m, 3);
  assert.equal(m.actor.current, 'Default');
  m.setForm('running', { id: 7, form: 'running' });
  frames(m, 3);
  assert.equal(m.actor.current, 'Idle');
});

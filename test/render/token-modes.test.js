// test/render/token-modes.test.js — a summon's prefab modes drawn from the manifest (data/assets.json anims `tmodes`,
// tools/assets/anim-keys.mjs tokenKeyRoles → render/units.js UnitView.setTokenMode; docs/rules/render.md 「Spine 클립 커버리지」).
// 缪尔赛思's 流形 (token_10030_mlyss_wtrman) rests in its Default mode's Idle_1 until it copies; a copy plays SwitchToMelee's
// Change_A / SwitchToRange's Change_B, then rests, attacks, is stunned and falls on the A_* / B_* set; a split copy is born
// in its origin's mode on B_Start; while her S2 runs a ranged one attacks on B_Attack_2 (Range_S2). It used to rest on the
// Melee mode's A_Idle from the deployment while deploying on Start and attacking on Attack — two bodies of one model.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { UF } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ID = 'token_10030_mlyss_wtrman';
const entry = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).tokens[ID].spine;

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) v.update(dt, cam(), i * dt); };

async function view() {
  const names = Object.keys(entry.animations);
  const assets = {
    picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: async () => ({ animations: names.map((name) => ({ name })) }), release() {} },
  };
  const v = new UnitView(fakeViewCtx(fake.P, { assets, cam }), { id: 7, side: 'ally', kind: 'token', defId: ID, spine: ID, tier: 1, x: 5, y: 5, maxHp: 1000, facing: 1 });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const owner = (skillIndex, on) => ({ alive: true, destroyed: false, flags: on ? UF.SKILL : 0, info: { skillIndex } });

test('the manifest: the Default mode rests in Idle_1; every mode clip is in the skeleton', () => {
  assert.equal(entry.anims.idle, 'Idle_1');
  assert.deepEqual(Object.keys(entry.anims.tmodes).sort(), ['Melee', 'Melee_S3', 'Range', 'Range_S2']);
  for (const [name, m] of Object.entries(entry.anims.tmodes)) {
    const r = m.roles;
    for (const c of [m.change, r.idle, r.deploy, r.die, r.attack?.loop, r.attack?.combat?.loop, r.stun?.loop].filter(Boolean)) assert.ok(c in entry.animations, `${name}: ${c}`);
  }
  assert.equal(entry.anims.tmodes.Melee.change, 'Change_A');
  assert.equal(entry.anims.tmodes.Range.change, 'Change_B');
  assert.equal(entry.anims.tmodes.Range_S2.roles.attack.loop, 'B_Attack_2');
});

test('deployed: Start, then Idle_1', async () => {
  const v = await view();
  v.onDeploy();
  assert.equal(v.actor.current, 'Start');
  frames(v, 90);
  assert.equal(v.actor.current, 'Idle_1');
});

test('its copy: Change_A, then the Melee set; knocked out on A_Die', async () => {
  const v = await view();
  frames(v, 3);
  assert.equal(v.setTokenMode('Melee', { by: owner(2, false) }), true);
  assert.equal(v.actor.current, 'Change_A');
  frames(v, 60);
  assert.equal(v.actor.current, 'A_Idle');
  assert.equal(v.actor.roles.attack.loop, 'A_Attack');
  assert.equal(v.actor.roles.attack.combat.loop, 'A_Combat', 'the blocked enemy: its Combat');
  assert.equal(v.actor.roles.stun.loop, 'A_Stun');
  v.die();
  assert.equal(v.actor.current, 'A_Die');
});

test('a ranged copy attacks on B_Attack_2 while her S2 runs, B_Attack again after', async () => {
  const v = await view();
  const her = owner(1, false);
  v.setTokenMode('Range', { by: her });
  frames(v, 60);
  assert.equal(v.form, 'Range');
  assert.equal(v.actor.current, 'B_Idle');
  her.flags = UF.SKILL;
  frames(v, 1);
  assert.equal(v.form, 'Range_S2');
  assert.equal(v.actor.roles.attack.loop, 'B_Attack_2');
  assert.equal(v.actor.current, 'B_Idle', 'no change clip');
  her.flags = 0;
  frames(v, 1);
  assert.equal(v.form, 'Range');
  assert.equal(v.actor.roles.attack.loop, 'B_Attack');
  // her S3 has no ranged mode of its own: the Range set stays
  her.flags = UF.SKILL; her.info.skillIndex = 2;
  frames(v, 1);
  assert.equal(v.form, 'Range');
});

test('a split copy: born in its origin\'s mode on B_Start, no change clip', async () => {
  const v = await view();
  v.onDeploy();
  v.setTokenMode('Range', { quiet: true, by: owner(1, false) });
  assert.equal(v.actor.current, 'B_Start');
  frames(v, 90);
  assert.equal(v.actor.current, 'B_Idle');
});

test('a model without token modes ignores them', async () => {
  const v = await view();
  assert.equal(v.setTokenMode('Nope'), false);
  assert.equal(v.form, null);
});

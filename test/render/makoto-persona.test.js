// test/render/makoto-persona.test.js — 结城理 (char_4217_makoto, 自选) drawn as his <替身>: the persona of the picked skill
// (render/units.js FORMS MAKOTO, `bySkill` on UnitInfo skillIndex), its switch in (SwitchOut → Doll_Skill_<n>_SwitchIn), the
// way back as the 总攻击 (Doll_Skill_<n>_SwitchOut → Skill_AllOutAttack_Loop → Skill_AllOutAttack_End), and S3's
// 塔纳托斯 → 俄耳甫斯 on the kit's form 'orpheus' (fx 'persona': Doll_Skill_3_P1toP2_ChangeBegin → ChangeEnd). The
// clip names are the CN charpack's (its modes' SimpleUnitAnimatorHooker `_replaceAnimPairs` and the makoto[switch*]
// sequences' `_animKey`, docs/rules/fx.md 「유키 마코토 페르소나」). Headless fake PIXI on the real manifest; the last case
// runs his real kit (server/sim/content/kits/ops/op-makoto.js) and feeds its form fx to the view.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { spineEntry, hasBackSpine } from '../../public/js/assets.js';
import { fxForm } from '../../shared/protocol.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { unitInfo } from '../../server/sim/snapshot.js';
import { DOLL_SWITCH } from '../../server/sim/professions.js';
import { S3_CHANGE } from '../../server/sim/content/kits/ops/op-makoto.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = JSON.parse(readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8'));
const C = 'char_4217_makoto';
const front = assets.chars[C].spine.front.animations, back = assets.chars[C].spine.back.animations;

let fake, UnitView, FORMS, renderInfo;
before(async () => {
  fake = installFakePixi();
  ({ UnitView, FORMS } = await import('../../public/js/render/units.js'));
  ({ renderInfo } = await import('../../public/js/render/app.js'));
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('normal', { width: 1280, height: 720 });
function store() {
  return {
    picture: () => null,
    image: async () => null,
    hasBack: (id) => hasBackSpine(assets, id),
    spineEntry: (id, o) => spineEntry(assets, id, o),
    spine: { acquire: async (entry) => ({ animations: Object.keys(entry.animations || {}).map((name) => ({ name })) }), release() {} },
  };
}
async function op(info = {}) {
  const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
  const v = new UnitView(ctx, { id: 1, side: 'ally', kind: 'op', defId: C, spine: C, tier: 6, x: 3, y: 10, maxHp: 3000, dir: 'RIGHT', skillIndex: 0, ...info });
  await tick(); await tick();
  assert.ok(v.actor, 'Spine model built');
  return v;
}
const clip = (v) => v.actor.current;
const frames = (v, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) v.update(dt, cam(), i * dt); };
const secs = (v, s) => frames(v, Math.round(s * 60));

/** skillIndex → [SwitchIn, idle, attack clips in turn (none: no attack clip), SwitchOut, die]. */
const PERSONA = [
  ['Doll_Skill_1_SwitchIn', 'Doll_Skill_1_Idle', ['Doll_Skill_1_Attack'], 'Doll_Skill_1_SwitchOut', 'Doll_Skill_1_Die'],
  ['Doll_Skill_2_SwitchIn', 'Doll_Skill_2_Loop', [], 'Doll_Skill_2_SwitchOut', 'Doll_Skill_2_Die'],
  ['Doll_Skill_3_P1_SwitchIn', 'Doll_Skill_3_P1_Idle', ['Doll_Skill_3_P1_Attack_A', 'Doll_Skill_3_P1_Attack_B'], 'Doll_Skill_3_P1_SwitchOut', null],
];

describe('结城理\'s personas (FORMS doll bySkill, orpheus)', () => {
  test('every clip named is in his Front skeleton; the switch clips match the model\'s lengths (2 s in, the kit\'s 1.5 s S3 change)', () => {
    const f = FORMS[C];
    for (const p of [...f.doll.bySkill, f.orpheus]) {
      for (const name of [...p.change, ...p.leave, p.roles.idle]) assert.ok(name in front, name);
      assert.equal(p.roles.skill, null, 'no skill clip of its own (阻回: the <替身> casts nothing)');
    }
    for (const p of f.doll.bySkill) assert.equal(p.change.reduce((t, n) => t + front[n], 0), DOLL_SWITCH, 'SwitchOut + SwitchIn = the sim\'s switch');
    assert.equal(f.orpheus.change.reduce((t, n) => t + front[n], 0), S3_CHANGE);
    assert.equal(f.orpheus.roles.attack, null, 'Stand_S3_2 has no `_attack`');
    assert.equal(f.doll.bySkill[1].roles.attack, null, 'Stand_S2\'s MeleeAttack has no `_animKey`');
    for (const name of ['SwitchOut', 'Doll_Skill_1_SwitchIn', 'Doll_Skill_3_P2_Loop']) assert.ok(!(name in back), `no Back ${name}`);
  });

  for (const [i, [into, idle, attacks, out, die]] of PERSONA.entries()) {
    test(`S${i + 1}: SwitchOut → ${into} → ${idle}${attacks.length ? `, attacking on ${attacks.join(' / ')}` : ', no attack clip'}; back through ${out} → the 总攻击 clips → his Idle`, async () => {
      const v = await op({ skillIndex: i });
      assert.equal(clip(v), 'Idle');
      v.setForm('doll', { id: 1, form: 'doll', dur: DOLL_SWITCH + 20 });   // the sim's 'substitute' fx
      assert.equal(clip(v), 'SwitchOut', 'the <本体> calls the persona');
      secs(v, 1.05);
      assert.equal(clip(v), into);
      secs(v, 1.05);
      assert.equal(clip(v), idle);
      for (const a of attacks.length ? [...attacks, attacks[0]] : [idle]) {
        v.onAttack(null, 2);
        assert.equal(clip(v), a, attacks.length ? 'the persona\'s attack' : 'no attack clip');
        secs(v, 2);
      }
      v.setForm(null, { id: 1, form: null });           // the sim's 'swap' fx: the <替身> time ran out
      assert.equal(clip(v), out, 'the persona leaves');
      secs(v, 1.05);
      assert.equal(clip(v), 'Skill_AllOutAttack_Loop', 'mode Switch2Normal');
      secs(v, 0.2);
      assert.equal(clip(v), 'Skill_AllOutAttack_End', 'Allout_LoopEnd');
      secs(v, 1.5);
      assert.equal(clip(v), 'Idle', 'the <本体>');
      if (die) {
        const w = await op({ skillIndex: i, form: 'doll' });
        assert.equal(clip(w), idle, 'a view built while he is the <替身>');
        w.die();
        assert.equal(clip(w), die, 'knocked out as the persona');
      }
    });
  }

  test('S3: form orpheus inside the <替身> is 俄耳甫斯 — ChangeBegin → ChangeEnd → Doll_Skill_3_P2_Loop, no attack, its own SwitchOut back and Die; a view built in it starts there', async () => {
    const v = await op({ skillIndex: 2, form: 'doll' });
    assert.equal(clip(v), 'Doll_Skill_3_P1_Idle');
    v.setForm('orpheus', { id: 1, form: 'orpheus' });   // the kit's fx 'persona'
    assert.equal(v.form, 'orpheus');
    assert.equal(clip(v), 'Doll_Skill_3_P1toP2_ChangeBegin');
    secs(v, 0.55);
    assert.equal(clip(v), 'Doll_Skill_3_P1toP2_ChangeEnd');
    secs(v, 1.05);
    assert.equal(clip(v), 'Doll_Skill_3_P2_Loop');
    v.onAttack(null, 2);
    assert.equal(clip(v), 'Doll_Skill_3_P2_Loop', 'no attack');
    v.setForm(null, { id: 1, form: null });
    assert.equal(clip(v), 'Doll_Skill_3_P2_SwitchOut');
    const w = await op({ skillIndex: 2, form: 'orpheus' });
    assert.equal(clip(w), 'Doll_Skill_3_P2_Loop', 'a view built while he is 俄耳甫斯 (UnitInfo form)');
    w.die();
    assert.equal(clip(w), 'Doll_Skill_3_P2_Die');
  });
});

test('sim → view: his real S3 kit — the cast\'s fx form doll, the lethal hit\'s fx persona (form orpheus, UnitInfo too), the time running out\'s form null — plays the personas\' clips', async () => {
  const h = makeBattle({ seed: 7, autoFinish: false, timeLimit: 120, defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    units: [{ uid: 1, diy: { slot: 6, charId: C, skillIndex: 2, uniEquipId: null }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }] });
  h.step();
  const u = h.unit(1);
  const v = await op(renderInfo(unitInfo(u)));
  assert.equal(v.info.skillIndex, 2);
  const apply = () => {
    h.eventsOf('fx');   // drains the battle's events into h.events
    for (const e of h.events) if (e[4]?.id === u.id && fxForm(e) !== undefined) v.setForm(fxForm(e), e[4]);
    h.events.length = 0;
  };
  h.events.length = 0;
  u.skill.sp = u.skill.spCost; u.skill.charges = 1;
  assert.ok(u.skill.activate('test'));
  apply();
  assert.equal(renderInfo(unitInfo(u)).form, 'doll');
  assert.equal(clip(v), 'SwitchOut');
  h.run(DOLL_SWITCH + 0.05); apply(); secs(v, DOLL_SWITCH + 0.05);
  assert.equal(clip(v), 'Doll_Skill_3_P1_Idle', '塔纳托斯');
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  apply();
  assert.equal(clip(v), 'Doll_Skill_3_P1toP2_ChangeBegin', 'the lethal hit: 俄耳甫斯 comes');
  assert.equal(renderInfo(unitInfo(u)).form, 'orpheus');
  h.run(S3_CHANGE + 0.05); apply(); secs(v, S3_CHANGE + 0.05);
  assert.equal(clip(v), 'Doll_Skill_3_P2_Loop');
  h.run(u.findBuff('trait:substitute').timeLeft + 0.02);
  apply();
  assert.equal(clip(v), 'Doll_Skill_3_P2_SwitchOut', 'the <替身> time ran out: 俄耳甫斯 leaves for the 总攻击');
  assert.equal(v.form, null);
});

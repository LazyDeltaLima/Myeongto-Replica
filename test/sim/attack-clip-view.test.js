// test/sim/attack-clip-view.test.js — the sim's clock of an attack and the clip the view plays are read from two places: the sim's
// from data/backups.json `attackAnim` (tools/build-data.mjs), the view's from the model's roles (render/spine.js _attackClip).
// Mon3tr S3 had the sim on `Attack` (2.83 s, the `S3` mode by the name rule) under the view's `Skill_3_Loop` (1.5 s, the mode she
// lands in), so her swing and strike ran at half their time in real battles and her cast effect could not show (2026-11-04,
// docs/rules/fx.md 「Mon3tr·벨로네 S3 공격 타이밍」). Nothing reported it, and no golden battle placed her 重构体. The shop's chess and
// the reserves joined on 2026-11-05 and found four more (docs/rules/sim.md 「일반 공격 타이밍」).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILL_SUB_MODES } from '../../shared/skill-modes.js';
import { LOCAL_DIY_PICKS } from '../../shared/local-diy.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { installFakePixi } from '../render/fakepixi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), 'utf8'));
const units = read('data/backups.json').units;
const chars = read('data/assets.json').chars;

let fake, SpineActor, FORTRESS_CLIPS;
before(async () => {
  fake = installFakePixi();
  ({ SpineActor } = await import('../../public/js/render/spine.js'));
  ({ FORTRESS_CLIPS } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

/** The manifest's front model, skill `i` equipped: the clip names are real, the skeleton is not. */
function actor(charId, i) {
  const e = chars[charId].spine.front;
  const a = new SpineActor({ animations: Object.keys(e.animations).map((name) => ({ name })) }, e);
  a.setSkillIndex(i);
  return a;
}

const run = (a, s) => { for (let t = 0; t < s; t += 1 / 60) a.update(1 / 60); };

/** Whether the sim's unit is still in skill `i` when it attacks: an instant skill is over in its own tick (skills.js activate). */
function attacksInSkill(charId, i) {
  const h = makeBattle({ timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId, skillIndex: i, uniEquipId: null }, row: 9, col: 5 }] });
  h.step();
  return h.unit(1).skill.kind !== 'instant';
}

test('a skill\'s attack is timed from the clip the view plays', () => {
  const found = [];
  const seen = new Map();
  for (const c of LOCAL_DIY_PICKS) {
    const e = chars[c]?.spine?.front;
    if (!e?.anims?.skills) continue;
    (units[c]?.attackAnim?.skills ?? []).forEach((a, i) => {
      if (!a) return;
      const v = actor(c, i);
      if (attacksInSkill(c, i)) v.setSkill(true);
      run(v, 5);
      // (a stance skill's clip runs on through its attacks: the client's attack `_animKey ""`)
      const role = v._attackClip();
      if (!role) { assert.ok(v._stance(), `${c} S${i + 1} attacks with no clip`); return; }
      const clip = v._loopOf(role);
      seen.set(`${c} S${i + 1}`, clip);
      const hit = e.hits?.[clip]?.[0] ?? null;
      if (e.animations[clip] !== a.dur || hit !== (a.hit ?? null)) found.push(`${c} S${i + 1}: sim ${a.clip} ${a.dur}/${a.hit}, view ${clip} ${e.animations[clip]}/${hit}`);
    });
  }
  assert.ok(seen.size > 40, `only ${seen.size} skills read`);
  assert.deepEqual(found, [], 'the sim times one clip and the view plays another, so the swing, the strike and the cast effects run on different clocks (build-data opAttackAnim, tools/assets/anim-keys.mjs keyRoles; docs/rules/render.md 「함정」)');
  // the four the first version of this test listed as not judged, by what the official prefabs name
  assert.equal(seen.get('char_2027_wang S2'), 'Attack_2_A', '望 S2: mode S2 Attack_A→Attack_2_A, held from the deployment');
  assert.equal(seen.get('char_4182_oblvns S2'), 'Skill_2_Loop_A', '丰川祥子 S2: the piano mode; its cast clip Trans_A is no attack');
  assert.equal(seen.get('char_4098_vvana S1'), 'Attack', '薇薇安娜 S1: the plain cast S1_Attack2');
  assert.equal(seen.get('char_416_zumama S3'), 'Skill_2_Loop', '森蚺 S3: mode S3, not the cast Hensin');
});

/** The clip the view plays for an attack of `a`, and what the sim's record `rec` says of it; a mismatch's line, or null. */
const compare = (label, charId, a, rec) => {
  const e = chars[charId].spine.front;
  const role = a._attackClip();
  if (!role) return a._stance() ? null : `${label} attacks with no clip`;
  const clip = a._loopOf(role);
  const hit = e.hits?.[clip]?.[0] ?? null;
  return e.animations[clip] !== rec.dur || hit !== (rec.hit ?? null) ? `${label}: sim ${rec.clip} ${rec.dur}/${rec.hit}, view ${clip} ${e.animations[clip]}/${hit}` : null;
};

/** Whether a chess's skill is still on when it attacks (attacksInSkill's question, for a shop chess). */
function attacksInChessSkill(chessId) {
  const h = makeBattle({ timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, units: [{ uid: 1, chessId, row: 9, col: 5 }] });
  h.step();
  return h.unit(1).skill?.kind !== 'instant';
}

/** Default mode with no attack on the field: 무에나's `Idle_2` ability deals nothing and his model stands still (docs/rules/render.md H). */
const NO_DEFAULT_ATTACK = new Set(['char_4064_mlynar']);

test('every operator\'s attack, shop chess and reserves too: the sim times the clip the view plays, in each mode', () => {
  const chess = read('data/chess.json');
  const found = [];
  let read_ = 0;
  const check = (label, charId, anim, skills, inSkill) => {
    const e = chars[charId]?.spine?.front;
    if (!e) { found.push(`${label}: no model`); return; }
    const mode = (rec, i, tag) => {
      if (!rec) return;
      for (const ranged of FORTRESS_CLIPS[charId] ? [false, true] : [null]) {
        const v = actor(charId, i ?? 0);
        if (ranged != null) { v.fortressClips = FORTRESS_CLIPS[charId]; v.atkRanged = ranged; }
        if (i != null && inSkill(i)) v.setSkill(true);
        run(v, 5);
        read_++;
        const bad = compare(`${label} ${tag}${ranged == null ? '' : ranged ? ' ranged' : ' melee'}`, charId, v, ranged && rec.ranged ? rec.ranged : rec);
        if (bad) found.push(bad);
      }
    };
    if (anim?.base?.hit != null || !NO_DEFAULT_ATTACK.has(charId)) mode(anim?.base, null, 'Default');
    (anim?.skills ?? []).forEach((rec, i) => { if (skills == null || skills === i) mode(rec, i, `S${i + 1}`); });
  };
  for (const [id, c] of Object.entries(chess)) {
    if (c.charId) check(id, c.charId, c.attackAnim, c.skill?.index ?? null, () => attacksInChessSkill(id));
  }
  // the picks and the reserves (预备干员 …, which a diy slot can't place: their skills count as timed), at every skill they have
  for (const [id, c] of Object.entries(units)) check(id, id, c.attackAnim, null, (i) => (LOCAL_DIY_PICKS.includes(id) ? attacksInSkill(id, i) : true));
  assert.ok(read_ > 500, `only ${read_} attacks read`);
  assert.deepEqual(found, [], 'the sim times one clip and the view plays another, so the swing, the strike and the cast effects run on different clocks (build-data opAttackAnim, tools/local-extract/attack_timing.py pick; docs/rules/render.md 「함정」)');
});

test('three attacks the sweep found timed from another child or mode, by what their prefabs name', () => {
  const chess = read('data/chess.json');
  const ulpia = chess.chess_char_5_05_a.attackAnim.skills[2];
  assert.deepEqual([ulpia.clip, ulpia.dur, ulpia.hit], ['Skill_3_Loop', 2.5, 0.633], '울피아누스 S3: S3_Respawn_A, his redeploy after the anchor; `S3` only casts');
  const branch = chess.chess_char_2_17_a.attackAnim.skills[1];
  assert.deepEqual([branch.clip, branch.dur, branch.hit, branch.sel], ['Skill_2_Loop', 1.533, 0.8, 1], '베토치키 S2: `AbilityName`, not `FirstAttack` on branch_s_2[first]');
  const ash = chess.chess_char_2_18_a.attackAnim.base;
  assert.deepEqual([ash.clip, ash.dur, ash.hit, ash.ranged.clip, ash.ranged.dur, ash.ranged.hit], ['Attack02', 1.467, 0.7, 'Attack01', 1.167, 0.533], '애쉬락: MeleeAttack, RangedAttack');
  const horn = chess.chess_char_5_08_a.attackAnim.base;
  assert.deepEqual([horn.clip, horn.dur, horn.ranged.clip, horn.ranged.dur], ['Attack_A', 1.067, 'Attack_B', 1.2], '혼');
});

test('a 要塞 in a battle: its strike is the ranged clip\'s out of a block, the melee clip\'s in one', () => {
  const strikes = (pos) => {
    const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
    const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
      units: [{ uid: 1, chessId: 'chess_char_2_18_a', row: 9, col: 5 }] });
    h.step();
    const u = h.unit(1);
    h.spawn('e_d', { pos });
    const out = [];
    for (let i = 0; i < Math.round(8 / h.b.dt); i++) {
      h.step();
      for (const x of h.events.splice(0)) if (x[0] === 'swing' && x[1] === u.id) out.push([x[2], x[3]]);
    }
    return out;
  };
  // (interval 2.8 s: both clips play at their own speed, `max` 1)
  const ranged = strikes([9, 8]), melee = strikes([9, 5]);
  assert.ok(ranged.length >= 2 && melee.length >= 2, `${ranged.length} ranged, ${melee.length} melee swings`);
  for (const [t, kind] of ranged) { assert.equal(t, 0.533, 'Attack01'); assert.notEqual(kind, 'none'); }
  for (const [t, kind] of melee) { assert.equal(t, 0.7, 'Attack02'); assert.equal(kind, 'none'); }
});

test('森蚺: S3 casts Skill_2_Begin once and attacks with Skill_2_Loop; S2 rests on the plain Idle', () => {
  const s3 = actor('char_416_zumama', 2);
  assert.equal(s3.current, 'Idle', 'herself until 变身: the Default mode names no animator hooker');
  s3.setSkill(true);
  assert.equal(s3.current, 'Skill_2_Begin', 'Hensin');
  run(s3, 3);
  assert.ok(s3.swing(0.5));
  assert.equal(s3.current, 'Skill_2_Loop');
  run(s3, 3);
  s3.swing(0.5);
  assert.equal(s3.current, 'Skill_2_Loop', 'every attack the attack clip, never the cast again');

  // (the Default mode's GameObject carries an Idle→Skill_2_Idle hooker its UnitMode does not name: unused — CN play report
  // 2026-11-14, she stood on the field as the robot)
  const s2 = actor('char_416_zumama', 1);
  assert.equal(s2.current, 'Idle');
  s2.setSkill(true);
  assert.equal(s2.current, 'Idle', 'no clip at the cast: the mode attacks with its own');
  assert.equal(s2._skillIdle(), null, 'mode S2 has no Idle pair: no idle of its own');
  run(s2, 3);
  assert.ok(s2.swing(0.5));
  assert.equal(s2.current, 'Skill');
});

test('薇薇安娜 S1: no clip at the cast; the plain cast is Attack (Attack_Down below), the 蓄力 one Skill_1_Attack', () => {
  const plain = actor('char_4098_vvana', 0);
  plain.setSkill(true);
  assert.equal(plain.current, 'Idle');
  assert.ok(plain.swing(0.3));
  assert.equal(plain.current, 'Attack');

  const down = actor('char_4098_vvana', 0);
  down.downs = () => ({ face: true, deploy: false });
  down.setSkill(true);
  assert.ok(down.swing(0.3));
  assert.equal(down.current, 'Attack_Down');

  const charged = actor('char_4098_vvana', 0);
  charged.setSkill(true, 'charged');
  assert.equal(charged.current, 'Idle', 'played by the attack, not at the cast');
  assert.ok(charged.swing(0.3));
  assert.equal(charged.current, 'Skill_1_Attack');
  charged.setSkill(false);
  run(charged, 3);
  assert.ok(charged.swing(0.3));
  assert.equal(charged.current, 'Attack', 'the plain attack again once the skill ended');
});

test('薇薇安娜 S1 in a battle: both charges stored turn the 蓄力 form on, its cast names the variant, the skill\'s end turns it off', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_4098_vvana', skillIndex: 0, uniEquipId: null }, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  const forms = [];
  const casts = [];
  const take = () => {
    for (const e of h.events.splice(0)) {
      if (e[0] === 'fx' && e[1] === 'vvanaCharge') forms.push(e[4].form);
      if (e[0] === 'skill' && e[1] === u.id && e[2] === 1) casts.push(e[3] ?? null);
    }
  };
  u.skill.charges = u.skill.maxCharges;
  h.step();
  take();
  assert.deepEqual(forms, ['charged']);
  assert.equal(u.form, 'charged');
  h.spawn('e_d', { pos: [9, 6] });
  for (let i = 0; i < Math.round(6 / h.b.dt) && !forms.includes(null); i++) { h.step(); take(); }
  assert.equal(casts[0], 'charged', 'the 蓄力 cast');
  assert.deepEqual(forms, ['charged', null], 'its end leaves the form');
  assert.equal(u.form, null);
  // a cast below every charge is the plain one
  casts.length = 0;
  u.skill.charges = 1;
  u.skill.sp = 0;
  for (let i = 0; i < Math.round(6 / h.b.dt) && !casts.length; i++) { h.step(); take(); }
  assert.deepEqual(casts, [null], 'the plain cast names none');
});

test('a skill that moves its owner to another mode is timed from that mode', () => {
  assert.ok(Object.values(SKILL_SUB_MODES).some((x) => x.teleport));
  const clip = (c, i) => units[c].attackAnim.skills[i];
  assert.deepEqual([clip('char_4179_monstr', 2).clip, clip('char_4179_monstr', 2).dur, clip('char_4179_monstr', 2).hit], ['Skill_3_Loop', 1.5, 0.667]);
  assert.equal(clip('char_4037_demetr', 2).clip, 'Skill_3_Loop_A');
});

test('Mon3tr S3 on her 重构体: the swing and the strike of her real clip', () => {
  const dummy = enemyRec({ key: 'e_d', hp: 1e9, speed: 0, mass: 0, def: 0, res: 0 });
  const h = makeBattle({ defs: { enemies: { e_d: dummy } }, timeLimit: 900, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 }, captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_4179_monstr', skillIndex: 2, uniEquipId: null }, row: 10, col: 5 },
      { uid: 2, kind: 'token', tokenId: 'token_10050_monstr_prosts', ownerUid: 1, row: 9, col: 5 }] });
  h.step();
  const u = h.unit(1);
  h.spawn('e_d', { pos: [9, 6] });
  u.skill.gainSp(999);
  assert.ok(u.skill.activate('test'));
  const swings = [];
  for (let i = 0; i < Math.round(5 / h.b.dt); i++) {
    h.step();
    for (const e of h.events.splice(0)) if (e[0] === 'swing' && e[1] === u.id) swings.push({ t: h.b.time, strike: e[2] });
  }
  assert.ok(swings.length >= 3, `${swings.length} swings`);
  const gaps = swings.slice(1).map((s, i) => s.t - swings[i].t);
  for (const g of gaps) assert.ok(g > 0.9, `she swings every ${g.toFixed(2)} s`);
  // the strike by her real clip's hit (0.667 of 1.5); `Attack`'s (0.567 of 2.833) lands it at 0.22 s
  for (const x of swings.slice(1)) assert.ok(x.strike > 0.4 && x.strike < 0.6, `strike ${x.strike}`);
});

test('歌蕾蒂娅 S3: the closing clips play through the sim\'s hold and the first attack cuts the last one; 锏\'s single End clip is not cut', () => {
  const g = actor('char_474_glady', 2);
  g.setSkill(true);
  run(g, 3);
  g.setSkill(false);
  assert.equal(g.current, 'Skill_3_Begin');
  run(g, 1);
  assert.equal(g.swing(0.5), false, 'no attack clip inside the row');
  run(g, 1.667);
  assert.equal(g.current, 'Skill_3_End');
  assert.ok(g.swing(0.5), 'the attack after the hold (2.667 s) shows');
  assert.equal(g.current, 'Attack');

  const k = actor('char_4116_blkkgt', 2);
  k.setSkill(true);
  run(k, 3);
  k.setSkill(false);
  assert.equal(k.current, 'Skill_3_End');
  run(k, 1);
  assert.equal(k.swing(0.5), false, 'her finisher plays out');
});

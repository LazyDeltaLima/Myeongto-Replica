// test/content/op_swllow.test.js — 그레이스롯 (char_367_swllow, a tier-1 piece of 规程 (act3autochess); kit ops/op-swllow.js): both forms, both skills, the talent, MAR-Y.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_1_07_a', B = 'chess_char_1_07_b';
const FORMS = [A, B];
const S1 = 'skchr_swllow_1', S2 = 'skchr_swllow_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 5];
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const talent = (id) => ACT3.chess[id].talents.find((t) => t.index === 0).bb;

test('T1: attack_speed always; the normal form rolls no ×atk_scale, the elite rolls each damage instance', () => {
  {
    const { h, u } = field(A, { skill: 0 });
    near(u.s.aspd, u.base.aspd + talent(A).attack_speed, 'normal: its attack speed');
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    h.run(12);
    assert.ok(hits(h, u, e).length >= 5, 'it attacked');
    assert.equal(new Set(hits(h, u, e).filter((c) => !c.dmg.isSkill).map((c) => Math.round(c.dmg.amount))).size, 1, 'normal: every plain hit the same');
    done(h);
  }
  const { h, u } = field(B, { skill: 0 });
  near(u.s.aspd, u.base.aspd + talent(B).attack_speed, 'elite: its attack speed');
  const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
  h.run(60);
  const atk = u.s.atk, plain = hits(h, u, e).filter((c) => !c.dmg.isSkill);
  const crit = plain.filter((c) => c.dmg.amount > atk * 1.01).length;
  const rate = crit / plain.length;
  assert.ok(rate > talent(B).prob / 2 && rate < talent(B).prob * 2, `about prob: ${crit}/${plain.length}`);
  for (const c of plain) if (c.dmg.amount > atk * 1.01) near(c.dmg.amount, atk * talent(B).atk_scale, 'its multiplier');
  done(h);
});

test('T1: any damage of hers rolls, a skill arrow on its own', () => {
  const { h, u } = field(B, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
  cast(u);
  h.run(rec(B, S2).duration - 1);
  const atk = u.s.atk, list = hits(h, u, e);
  const crit = new Set(list.map((c) => c.dmg.amount > atk * 1.01));
  assert.equal(crit.size, 2, 'both kinds within one skill');
  const attacks = new Map();
  for (const c of list) attacks.set(c.dmg.attackId, [...(attacks.get(c.dmg.attackId) ?? []), c.dmg.amount > atk * 1.01]);
  assert.ok([...attacks.values()].some((v) => new Set(v).size === 2), 'an attack with one critical arrow and one not');
  done(h);
});

test('S1: the next attack shoots 2 arrows at atk_scale, and charges to `ct` on the elite', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const r = rec(id, S1);
    assert.equal(u.skill.kind, r.maxChargeTime > 1 ? 'charges' : 'instant', id);
    assert.equal(r.maxChargeTime, id === A ? 1 : r.bb.cnt, `${id}: the table's charges`);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    cast(u);
    assert.ok(h.runUntil(() => hits(h, u, e).some((c) => c.dmg.isSkill), 8), `${id}: it shot`);
    h.run(0.1);
    const shots = hits(h, u, e).filter((c) => c.dmg.isSkill);
    assert.equal(shots.length, 2, `${id}: two arrows`);
    assert.equal(new Set(shots.map((c) => c.dmg.attackId)).size, 1, `${id}: one attack`);
    if (id === A) for (const c of shots) near(c.dmg.amount, u.s.atk * r.bb.atk_scale, `${id}: atk_scale`);
    done(h);
  }
});

test('S2: ATK +atk, every attack 3 arrows, for its duration', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const r = rec(id, S2), before = u.s.atk;
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    cast(u);
    near(u.s.atk, before * (1 + r.bb.atk), `${id}: ATK`);
    assert.ok(h.runUntil(() => hits(h, u, e).filter((c) => c.dmg.isSkill).length > 0, 5), `${id}: it shot`);
    const last = hits(h, u, e).at(-1).dmg.attackId;
    h.run(0.2);
    assert.equal(hits(h, u, e).filter((c) => c.dmg.attackId === last).length, 3, `${id}: three arrows`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 1), `${id}: ends`);
    near(u.s.atk, before, `${id}: ATK back`);
    done(h);
  }
});

test('MAR-Y: the elite only, attack_speed while a ground enemy stands in range: a stealthed one too, a flyer not, several once', () => {
  {
    const { h, u } = field(A, { skill: 0 });
    h.spawn('enemy_dummy', { pos: FRONT });
    h.run(0.2);
    assert.equal(u.findBuff('swllow_e_t_10[atk_speed]'), null, 'no module, no buff');
    done(h);
  }
  const mod = ACT3.chess[B].talents.find((t) => t.index === -1).bb.attack_speed;
  const { h, u } = field(B, { skill: 0 });
  const base = u.s.aspd;
  const fly = h.spawn('enemy_fly', { pos: FRONT });
  h.run(0.2);
  near(u.s.aspd, base, 'a flyer gives nothing');
  h.b.removeEnemy?.(fly);
  fly.alive = false;
  const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
  h.run(0.2);
  near(u.s.aspd, base + mod, 'two ground enemies: once');
  e1.alive = false; e2.alive = false;
  h.run(0.2);
  near(u.s.aspd, base, 'gone with them');
  const st = h.spawn('enemy_dummy', { pos: FRONT });
  st.s.flags.stealth = true;
  h.run(0.2);
  near(u.s.aspd, base + mod, 'a stealthed one counts');
  done(h);
});

test('The real match path, both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_367_swllow');
});

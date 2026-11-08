// test/content/op_greyy2.test.js — 그레이 더 라이트닝베어러 (char_1027_greyy2, a tier-2 piece of 规程 (act3autochess); kit ops/op-greyy2.js): both forms, both skills, the talent, BOM-X.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, fill, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_2_14_a', B = 'chess_char_2_14_b';
const FORMS = [A, B];
const S1 = 'skcom_quickattack[3]', S2 = 'skchr_greyy2_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const talent = (id) => ACT3.chess[id].talents.find((t) => t.index === 0).bb;
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const shock = (c) => c.dmg.tags?.includes('aftershock');
const orb = (c) => c.dmg.tags?.includes('greyy2:beacon');
const FRONT = [10, 6];

test('The trait: the blast then one aftershock at half ATK; BOM-X two, landing together 0.15 s after it', () => {
  for (const [id, n] of [[A, 1], [B, 2]]) {
    const { h, u } = field(id, { skill: 0 });
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    assert.ok(h.runUntil(() => hits(h, u, e).length > 0, 8), `${id}: it struck`);
    const t0 = h.b.time;
    assert.ok(h.runUntil(() => hits(h, u, e).some(shock), 1), `${id}: an aftershock`);
    near(h.b.time - t0, 0.15, `${id}: 0.15 s after`, 0.25);
    const list = hits(h, u, e).filter(shock);
    assert.equal(list.length, n, `${id}: in the same frame`);
    for (const c of list) near(c.dmg.amount, u.s.atk * 0.5, `${id}: half ATK`);
    h.run(0.3);
    assert.equal(hits(h, u, e).filter(shock).length, n, `${id}: and no later one`);
    done(h);
  }
});

test('T1: normal attacks only, the first damage and each aftershock rolling on their own for attack@sluggish s', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    h.run(120);
    const n = hits(h, u, e).length;
    const slows = h.hooksOf('statusApplied').filter((c) => c.target === e && c.status === 'sluggish' && c.source === u);
    const rate = slows.length / n;
    assert.ok(n > 50, `${id}: damage instances ${n}`);
    assert.ok(rate > talent(id)['attack@prob'] / 2 && rate < talent(id)['attack@prob'] * 1.5, `${id}: per instance: ${slows.length}/${n}`);
    done(h);
  }
});

test('T1 leaves a skill\'s damage alone (PRTS "仅普通攻击")', () => {
  const { h, u } = field(A, { skill: 1 });
  const e = h.spawn('enemy_dummy', { pos: [10, 12], res: 0 });
  for (let i = 0; i < 40; i++) h.b.dealDamage(u, e, { amount: 1, type: 'arts', isSkill: true, ignoreSelect: true, tags: ['skill', 'zone'] });
  assert.equal(h.hooksOf('statusApplied').filter((c) => c.target === e).length, 0);
  done(h);
});

test('S1: ATK +atk and attack_speed for its duration', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const r = rec(id, S1), atk = u.s.atk, aspd = u.s.aspd;
    cast(u);
    near(u.s.atk, atk * (1 + r.bb.atk), `${id}: ATK`);
    near(u.s.aspd, aspd + r.bb.attack_speed, `${id}: attack speed`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 1), `${id}: ends`);
    near(u.s.atk, atk, `${id}: back`);
    done(h);
  }
});

test('S2: the orb lands on a ground target and pulses at once, then every `interval`, for projectile_delay_time s, on ground enemies within 1 tile', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const b = rec(id, S2).bb;
    const e = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
    const near1 = h.spawn('enemy_dummy', { pos: [10, 7], res: 0 });
    const far = h.spawn('enemy_dummy', { pos: [10, 7.5], res: 0 });
    const zones = [], fx = h.b.fx.bind(h.b);
    h.b.fx = (k, d) => { if (k === 'zone') zones.push(h.b.time); return fx(k, d); };
    const flyer = h.spawn('enemy_fly', { pos: FRONT, res: 0 });
    cast(u);
    assert.ok(h.runUntil(() => hits(h, u, e).some(orb), 4), `${id}: the first pulse`);
    const t0 = h.b.time;
    near(t0, zones[0] + (FRONT[1] - u.x) / 8, `${id}: at once as it lands, not an interval later`, 0.15);
    h.run(b.projectile_delay_time + 2);
    const times = hits(h, u, e).filter(orb);
    assert.equal(times.length, Math.ceil(b.projectile_delay_time / b.interval), `${id}: its pulses`);
    for (const c of times) { assert.equal(c.dmg.type, 'arts'); assert.equal(!!c.dmg.isAttack, false); }
    near(times[1].t ?? t0 + b.interval, t0 + b.interval, `${id}: interval`, 0.2);
    assert.ok(hits(h, u, near1).some(orb), `${id}: a neighbour`);
    assert.equal(hits(h, u, far).some(orb), false, `${id}: beyond 1 tile`);
    assert.equal(hits(h, u, flyer).some(orb), false, `${id}: no flyer`);
    done(h);
  }
});

test('S2: its damage follows her current ATK, and it goes on after she leaves', () => {
  const { h, u } = field(A, { skill: 1 });
  const b = rec(A, S2).bb;
  const e = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
  cast(u);
  assert.ok(h.runUntil(() => hits(h, u, e).some(orb), 4), 'the first pulse');
  near(hits(h, u, e).filter(orb)[0].dmg.amount, u.s.atk * b.atk_scale, 'atk_scale');
  h.b.addBuff(u, { key: 'test', mods: { atkPct: 1 }, persist: true, allowDead: true });
  const was = hits(h, u, e).filter(orb).length, doubled = u.s.atk;
  assert.ok(h.runUntil(() => hits(h, u, e).filter(orb).length > was, 2), 'the next pulse');
  near(hits(h, u, e).filter(orb).at(-1).dmg.amount, doubled * b.atk_scale, 'at her ATK now');
  h.b.retreat(u);
  const left = hits(h, u, e).filter(orb).length;
  h.run(b.interval + 0.1);
  assert.ok(hits(h, u, e).filter(orb).length > left, 'after she left');
  done(h);
});

test('S2: 停顿 with `prob` for `sluggish` s on what it hits, from the skill and not the talent', () => {
  const { h, u } = field(B, { skill: 1 });
  const b = rec(B, S2).bb;
  const es = Array.from({ length: 10 }, () => h.spawn('enemy_dummy', { pos: FRONT, res: 0 }));
  cast(u);
  assert.ok(h.runUntil(() => hits(h, u, es[0]).some(orb), 4), 'the first pulse');
  h.step();
  // (its own 1.4 s, not the talent's 2 s of an arrow's blast)
  const s = h.hooksOf('statusApplied').filter((c) => c.status === 'sluggish' && c.source === u && Math.abs(c.duration - b.sluggish) < 1e-9);
  assert.ok(s.length > 0 && s.length < 10, `some of ten: ${s.length}`);
  done(h);
});

test('S2 keeps its SP when no ground target is left at the strike; the elite holds two charges', () => {
  const { h, u } = field(A, { skill: 1 });
  const rA = rec(A, S2);
  assert.equal(rA.maxChargeTime, rA.bb.ct);
  assert.equal(u.skill.kind, 'charges');
  const e = h.spawn('enemy_dummy', { pos: FRONT, res: 0 });
  fill(u);
  const sp = u.skill.sp;
  assert.ok(u.skill.activate('test'), 'cast');
  e.alive = false;
  h.run(2);
  assert.equal(hits(h, u, e).some(orb), false, 'no orb');
  assert.ok(u.skill.sp >= sp - 1e-6 || u.skill.charges > 0, `SP back: ${u.skill.sp}`);
  done(h);
});

test('The real match path, both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_1027_greyy2');
});

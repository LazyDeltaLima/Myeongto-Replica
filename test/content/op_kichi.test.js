// test/content/op_kichi.test.js — 키치세이 (char_4203_kichi, a tier-3 piece of 规程 (act3autochess); kit ops/op-kichi.js): both forms, both skills, the talent, RPR-X.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_3_17_a', B = 'chess_char_3_17_b';
const FORMS = [A, B];
const S1 = 'skchr_kichi_1', S2 = 'skchr_kichi_2';
const rec = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const talent = (id) => ACT3.chess[id].talents.find((t) => t.index === 0).bb;
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const FRONT = [10, 5];
const RAMP = 'skchr_kichi_01[atk_scale]';

test('The trait: every enemy in range at once, atk_scale on the front row (RPR-X 1.6)', () => {
  for (const [id, scale] of [[A, 1.5], [B, 1.6]]) {
    const { h, u } = field(id, { skill: 0 });
    const front = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    const side = h.spawn('enemy_dummy', { pos: [9, 6], def: 0 });
    assert.ok(h.runUntil(() => hits(h, u, front).length > 0 && hits(h, u, side).length > 0, 8), `${id}: both struck`);
    assert.equal(hits(h, u, side).length > 0, true);
    const f = hits(h, u, front)[0].final ?? hits(h, u, front)[0].amount, s = hits(h, u, side)[0].final ?? hits(h, u, side)[0].amount;
    near(f / s, scale, `${id}: the front row's multiplier`, 0.02);
    done(h);
  }
});

test('T1: each new enemy id she fells adds × (1 + damage_scale × stacks) up to max_stack_cnt; the same id adds none; a withdrawal clears them', () => {
  for (const id of FORMS) {
    const t = talent(id);
    const enemies = {};
    const { h, u } = field(id, { skill: 0, enemies });
    const stacks = () => u.findBuff('kichi_t[cnt]')?.stacks ?? 0;
    const fell = (key) => { const e = h.spawn(key, { pos: FRONT }); h.b.dealDamage(u, e, { amount: 1e12, type: 'true', ignoreSelect: true }); h.step(); };
    fell('enemy_dummy');
    assert.equal(stacks(), 1, `${id}: one kind`);
    fell('enemy_dummy');
    assert.equal(stacks(), 1, `${id}: the same id again`);
    fell('enemy_heavy'); fell('enemy_light'); fell('enemy_fly'); fell('enemy_biter'); fell('enemy_runner');
    assert.equal(stacks(), t.max_stack_cnt, `${id}: the cap`);
    const e = h.spawn('enemy_dummy', { pos: FRONT, def: 0 });
    const was = hits(h, u, e).length;
    h.b.dealDamage(u, e, { amount: 1000, type: 'phys', ignoreSelect: true });
    near(hits(h, u, e)[was].amount, 1000 * (1 + t.damage_scale * t.max_stack_cnt), `${id}: any damage of hers`, 0.01);
    h.b.retreat(u);
    h.step();
    h.b.getPlayer(u.ownerId).dp = 99;
    assert.ok(h.runUntil(() => u.alive && u.deployed, u.base.respawnTime + 5), `${id}: back`);
    assert.equal(stacks(), 0, `${id}: cleared`);
    fell('enemy_dummy');
    assert.equal(stacks(), 1, `${id}: the same id counts again`);
    done(h);
  }
});

test('S1: base attack time +base_attack_time s; a stack of ATK +atk after each attack up to max_stack_cnt, all gone with the skill', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 0 });
    const r = rec(id, S1), base = u.s.atk, bat = u.s.bat;
    h.spawn('enemy_dummy', { pos: FRONT });
    cast(u);
    near(u.s.bat, bat + r.bb.base_attack_time, `${id}: its attack time`);
    near(u.s.atk, base, `${id}: nothing before an attack`);
    const first = h.hooksOf('damaged').length;
    assert.ok(h.runUntil(() => h.hooksOf('damaged').length > first, 8), `${id}: an attack`);
    h.step();
    near(u.s.atk, base * (1 + r.bb.atk), `${id}: one stack`);
    assert.ok(h.runUntil(() => (u.findBuff(RAMP)?.stacks ?? 0) >= r.bb.max_stack_cnt, r.duration - 1), `${id}: its cap`);
    near(u.s.atk, base * (1 + r.bb.atk * r.bb.max_stack_cnt), `${id}: all stacks`);
    h.run(u.s.bat + 1);
    assert.equal(u.findBuff(RAMP).stacks, r.bb.max_stack_cnt, `${id}: and no more`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 1), `${id}: ends`);
    assert.equal(u.findBuff(RAMP), null, `${id}: all gone`);
    near(u.s.atk, base, `${id}: ATK back`);
    done(h);
  }
});

test('S2: ATK +atk, base attack time up; 停顿 → 束缚 → 晕眩 → 停顿 for all an attack hits, from 停顿 on each cast', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1 });
    const r = rec(id, S2), base = u.s.atk, bat = u.s.bat;
    const e1 = h.spawn('enemy_dummy', { pos: FRONT }), e2 = h.spawn('enemy_dummy', { pos: FRONT });
    cast(u);
    near(u.s.atk, base * (1 + r.bb.atk), `${id}: ATK`);
    near(u.s.bat, bat + r.bb.base_attack_time, `${id}: its attack time`);
    const seen = () => h.hooksOf('statusApplied').filter((c) => c.target === e1 && c.source === u);
    assert.ok(h.runUntil(() => seen().length >= 4, r.duration - 1), `${id}: four attacks`);
    assert.deepEqual(seen().slice(0, 4).map((c) => c.status), ['sluggish', 'bind', 'stun', 'sluggish'], id);
    const of2 = h.hooksOf('statusApplied').filter((c) => c.target === e2 && c.source === u).slice(0, 3).map((c) => c.status);
    assert.deepEqual(of2, ['sluggish', 'bind', 'stun'], `${id}: the other target alike`);
    assert.ok(h.runUntil(() => !u.skill.active, r.duration + 1), `${id}: ends`);
    done(h);
  }
});

test('S2: its durations are the blackboard\'s, and a new cast starts from 停顿', () => {
  const { h, u } = field(A, { skill: 1 });
  const r = rec(A, S2);
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  cast(u);
  const of = () => h.hooksOf('statusApplied').filter((c) => c.target === e && c.source === u);
  assert.ok(h.runUntil(() => of().length >= 2, 10), 'two attacks');
  const by = (k) => of().find((c) => c.status === k);
  near(by('sluggish').duration, r.bb['attack@sluggish'], '停顿');
  near(by('bind').duration, r.bb['attack@unmoveable'], '束缚');
  u.skill.end('test');   // (after two attacks: mid-cycle)
  assert.ok(!u.skill.active, 'ends');
  const was = of().length;
  cast(u);
  assert.ok(h.runUntil(() => of().length > was, 8), 'attacks again');
  assert.equal(of()[was].status, 'sluggish', 'from 停顿');
  done(h);
});

test('The real match path, both forms', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4203_kichi');
});

// test/content/op_hbound.test.js — 홈바운드 (char_4232_hbound, a tier-3 piece of 规程 (act3autochess); kit ops/op-hbound.js): both forms, both skills.
// Run: node --test test/content/op_hbound.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, realMatch } from '../helpers/seasonPieces.js';

const A = 'chess_char_3_05_a', B = 'chess_char_3_05_b';
const FORMS = [A, B];
const S1 = 'skchr_hbound_1', S2 = 'skchr_hbound_2';
const HIT = 'hbound_t_1[hitrate]', SLOW = 'hbound_s_1[dot]', HEAVY = 'hbound_s_2[heavy_damage]', SP = 'hbound_e_t_10';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, e = 1e-6) => assert.ok(Math.abs(a - b) < e * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const zoneDmg = (h, e) => h.hooksOf('damaged').filter((c) => c.target === e && c.dmg?.tags?.includes('zone'));
const zonesOf = (u) => u.mem.zones ?? [];
/** No plain attack: only the unit acts on the dummy. */
const quiet = (u) => { u.profile = { ...u.profile, noAttack: true }; u.atkCd = 1e9; };

test('the skill records: the charges of S1 (1, then 2) and S2 (1), a state cast with its strike', () => {
  assert.equal(ACT3.chess[A].skills[0].maxChargeTime, 1);
  assert.equal(ACT3.chess[B].skills[0].maxChargeTime, 2);
  for (const id of FORMS) for (const s of ACT3.chess[id].skills) {
    assert.equal(s.cast.mode, 'state', `${id} ${s.skillId}`);
    assert.ok(s.cast.hit > 0, `${id} ${s.skillId}`);
  }
  const { h, u } = field(B, { skill: 0 });
  assert.equal(u.skill.spec.kind, 'charges');
  done(h);
  const n = field(A, { skill: 0 });
  assert.equal(n.u.skill.spec.kind, 'instant');
  done(n.h);
});

test('S1: lands at speed 10 at its target, slows, ticks after 0.9 s and each 1 s for its duration; arts, no source, ATK of the throw', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    quiet(u);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    cast(u);
    h.strike(u);
    const z = zonesOf(u)[0];
    assert.ok(z, `${id}: thrown`);
    assert.deepEqual([z.x, z.y], [e.x, e.y], `${id}: at the target`);
    near(z.land - h.b.time, 2 / 10, `${id}: flight`, 0.05);
    const atk = u.s.atk;
    assert.ok(!e.findBuff(SLOW), `${id}: nothing while it flies`);
    h.runUntil(() => !!e.findBuff(SLOW), 2);
    near(e.findBuff(SLOW).mods.moveMul, 1 + b.move_speed, `${id}: slow`);
    u.base.atk *= 10;
    u.markDirty();
    const entered = h.b.time;
    h.runUntil(() => zoneDmg(h, e).length > 0, 2);
    near(h.b.time - entered, 0.9, `${id}: the first tick`, 0.05);
    const c = zoneDmg(h, e)[0];
    assert.equal(c.type, 'arts', id);
    assert.equal(c.dmg.sourceless, true, id);
    near(c.amount, atk * b.atk_scale, `${id}: amount`);
    h.runUntil(() => !zonesOf(u).length, b.projectile_delay_time + 1);
    assert.ok(!e.findBuff(SLOW), `${id}: ends with the unit`);
    const n = zoneDmg(h, e).length;
    assert.ok(n >= b.projectile_delay_time - 1 && n <= b.projectile_delay_time, `${id}: ${n} ticks in ${b.projectile_delay_time} s`);
    done(h);
  }
});

test('S1: slows of two units multiply; a flyer and a ground enemy outside the radius get nothing; leaving ends it', () => {
  const b = bbOf(B, S1);
  const { h, u } = field(B, { skill: 0 });
  quiet(u);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  const fly = h.spawn('enemy_fly', { pos: [10, 6] });
  const far = h.spawn('enemy_dummy', { pos: [10, 6 + b.projectile_range + 1] });
  cast(u);
  h.strike(u);
  h.runUntil(() => u.skill.active === false || u.skillStateUntil <= h.b.time, 3);
  cast(u);
  h.strike(u);
  h.runUntil(() => e.buffs.filter((x) => x.key === SLOW).length === 2, 3);
  near(e.s.moveMul ?? e.buffs.filter((x) => x.key === SLOW).reduce((m, x) => m * x.mods.moveMul, 1), (1 + b.move_speed) ** 2, 'two units');
  assert.ok(!fly.findBuff(SLOW), 'a flyer');
  assert.ok(!far.findBuff(SLOW), 'outside');
  const t = h.b.time;
  e.x = 2; e.y = 2;
  h.runUntil(() => !e.findBuff(SLOW), 1);
  assert.ok(h.b.time - t <= 0.45, 'gone at the next look');
  done(h);
});

test('S2: the light hit for all, the heavy one and its slow only from weight value on, taken back as the weight drops', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1 });
    quiet(u);
    const light = h.spawn('enemy_light', { pos: [10, 6] });
    const heavy = h.spawn('enemy_heavy', { pos: [11, 6] });
    assert.ok(b.projectile_range >= 2);
    cast(u);
    h.strike(u);
    h.runUntil(() => !!heavy.findBuff(HEAVY), 2);
    near(heavy.findBuff(HEAVY).mods.moveMul, 1 + b.move_speed, `${id}: heavy slow`);
    assert.ok(!light.findBuff(HEAVY), `${id}: not the light one`);
    h.run(2.2);
    const atk = zonesOf(u)[0].atk;
    const amounts = (e) => zoneDmg(h, e).map((c) => Math.round(c.amount));
    assert.deepEqual(new Set(amounts(light)), new Set([Math.round(atk * b.atk_scale)]), `${id}: light`);
    assert.deepEqual(new Set(amounts(heavy)), new Set([Math.round(atk * b.atk_scale), Math.round(atk * b.heavy_atk_scale)]), `${id}: heavy`);
    h.b.addBuff(heavy, { key: 'test:light', mods: { massFlat: -3 } });
    h.step(4);
    assert.ok(!heavy.findBuff(HEAVY), `${id}: taken back`);
    h.b.removeBuff(heavy, 'test:light');
    h.step(4);
    assert.ok(heavy.findBuff(HEAVY), `${id}: and given again`);
    done(h);
  }
});

test('T1: hit rate by weight, the smaller cut of several 홈바운드, one buff per enemy; an attack rolls once', () => {
  const t = ACT3.chess[B].talents[0].bb;
  assert.deepEqual([t.hitrate < 0, t.heavy_hitrate < t.hitrate, t.value], [true, true, 3]);
  const { h, u } = field(B, { skill: 1 });
  quiet(u);
  const light = h.spawn('enemy_light', { pos: [10, 6] });
  const heavy = h.spawn('enemy_heavy', { pos: [11, 6] });
  cast(u);
  h.strike(u);
  h.runUntil(() => !!light.findBuff(HIT) && !!heavy.findBuff(HIT), 2);
  near(light.findBuff(HIT).data.cut, -t.hitrate, 'light');
  near(heavy.findBuff(HIT).data.cut, -t.heavy_hitrate, 'heavy');
  assert.equal(light.buffs.filter((x) => x.key === HIT).length, 1);
  h.b.addBuff(light, { key: HIT, duration: 5, data: { cut: 0.01 } });
  h.run(0.4);
  near(light.findBuff(HIT).data.cut, 0.01, 'the smaller cut stays');
  done(h);
});

test('T1: an enemy in a unit misses its attacks at about the rate, one roll per attack', () => {
  const { h, u } = field(B, { skill: 1 });
  quiet(u);
  const e = h.spawn('enemy_biter', { pos: [10, 5] });
  cast(u);
  h.strike(u);
  h.runUntil(() => !!e.findBuff(HIT), 2);
  const cut = e.findBuff(HIT).data.cut;
  const swings = new Set(), landed = new Set();
  h.b.on('hit', (c) => { if (c.source === e && c.dmg?.isAttack) swings.add(c.dmg.attackId); }, { priority: 1000 });
  h.b.on('damaged', (c) => { if (c.source === e && c.dmg?.isAttack) landed.add(c.dmg.attackId); });
  u.s.maxHp = 1e9;
  u.hp = 1e9;
  h.run(25);
  assert.ok(swings.size >= 15, `swings ${swings.size}`);
  const missed = swings.size - landed.size;
  assert.ok(missed > 0, 'some miss');
  assert.ok(missed / swings.size < cut * 4, `${missed}/${swings.size} at ${cut}`);
  done(h);
});

test('the unit keeps acting after she falls', () => {
  const { h, u } = field(B, { skill: 1 });
  quiet(u);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  h.strike(u);
  h.b.loseHp(u, u.hp + 1);
  h.step();
  assert.equal(u.alive, false);
  h.run(3);
  assert.ok(zoneDmg(h, e).length >= 2, 'ticks after she fell');
  done(h);
});

test('with nothing to pick on the ground: the farthest tile straight ahead (a flyer in range fires the skill)', () => {
  const { h, u } = field(A, { skill: 0 });
  quiet(u);
  h.spawn('enemy_fly', { pos: [10, 5] });
  cast(u);
  h.strike(u);
  const z = zonesOf(u)[0];
  assert.deepEqual([z.x, z.y], [6, 10]);
  done(h);
});

test('ALC-X: SP + while a unit is out, in flight too, also a 쏜즈 더 로드스타 or 틴맨 one; the normal form has none', () => {
  const v = ACT3.chess[B].talents.find((t) => t.index === -1).bb.sp_recovery_per_sec;
  assert.equal(v, 0.1);
  const { h, u } = field(B, { skill: 1, more: [{ uid: 2, id: B, skill: 1, row: 9, col: 5 }] });
  quiet(u);
  h.step();
  assert.ok(!u.findBuff(SP), 'none out');
  h.unit(2).mem.tinZones = 1;
  h.step(2);
  assert.equal(u.findBuff(SP).mods.spRecoveryFlat, v, 'another alchemist\'s unit');
  h.unit(2).mem.tinZones = 0;
  h.step(2);
  assert.ok(!u.findBuff(SP));
  h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  h.strike(u);
  h.step();
  assert.ok(u.findBuff(SP), 'her own, in flight');
  done(h);
  const n = field(A, { skill: 1 });
  n.u.mem.tinZones = 1;
  n.h.step(2);
  assert.ok(!n.u.findBuff(SP));
  done(n.h);
});

test('the real match path: bought, placed and fought', async () => {
  const u = await realMatch(A, 'char_4232_hbound');
  assert.ok(u.skill);
});

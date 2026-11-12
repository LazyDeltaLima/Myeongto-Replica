// test/content/op_cammou.test.js — 클릭 (char_328_cammou, a tier-1 piece of 规程 (act3autochess); kit ops/op-cammou.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3, field, done, cast, begun, realMatch } from '../helpers/seasonPieces.js';
import { DRONE_TAG } from '../../server/sim/content/kits/ops/op-cammou.js';

const A = 'chess_char_1_09_a', B = 'chess_char_1_09_b';
const FORMS = [A, B];
const S1 = 'skcom_atk_up[2]', S2 = 'skchr_cammou_2';
const bbOf = (id, sk) => ACT3.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 6];
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const drones = (h, u, e) => hits(h, u, e).filter((c) => c.dmg?.tags?.includes(DRONE_TAG));

test('Talent: ASPD +attack_speed on both forms of its phase', () => {
  for (const id of FORMS) {
    const v = ACT3.chess[id].talents[0].bb.attack_speed;
    assert.equal(v, id === A ? 6 : 12);
    const { h, u } = field(id, { skill: 0 });
    near(u.s.aspd, u.base.aspd + v, `${id}: ASPD`);
    done(h);
  }
});

test('Trait: her attack is arts plus a drone addition that ramps on one target from init by delta, to the form\'s cap; a new target starts over', () => {
  for (const id of FORMS) {
    const tb = ACT3.chess[id].trait.bb;
    assert.equal(tb.max_atk_scale, id === A ? 1.1 : 1.2);
    const { h, u } = field(id, { skill: 0 });
    u.skill.locked = true;
    assert.deepEqual(u.profile.funnel, { init: tb.init_atk_scale, delta: tb.delta_atk_scale, max: tb.max_atk_scale });
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    const adds = () => hits(h, u, e).filter((c) => c.dmg?.tags?.includes('funnel'));
    assert.ok(h.runUntil(() => adds().length >= 9, 30), `${id}: drone hits`);
    const scales = adds().map((c) => c.dmg.amount / u.s.atk);
    near(scales[0], tb.init_atk_scale, `${id}: init`, 1e-3);
    near(scales[1], tb.init_atk_scale + tb.delta_atk_scale, `${id}: +delta`, 1e-3);
    near(scales[8], tb.max_atk_scale, `${id}: the cap`, 1e-3);
    assert.ok(Math.max(...scales) <= tb.max_atk_scale + 1e-6);
    done(h);
  }
});

test('S1: ATK +atk, the drone stays with her', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    const a0 = u.s.atk;
    cast(u);
    near(u.s.atk, a0 * (1 + b.atk), `${id}: ATK`, 1e-2);
    assert.equal(typeof u.profile.funnelMul, 'function');
    done(h);
  }
});

test('S2: range 3-3, ATK +atk; the drone locks one enemy and hits at her interval, its addition off meanwhile, back with the ramp as it ends', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1, seed: 11 });
    const grid = ACT3.chess[id].skills.find((s) => s.skillId === S2).rangeGrid;
    const before = u.rangeKeys.length;
    const a0 = u.s.atk;
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    const times = [];
    h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.tags?.includes(DRONE_TAG)) times.push(h.b.time); });
    cast(u);
    begun(h, u);   // (the skill starts after its begin clip: skills.js _beginCast)
    assert.ok(grid.length > before, `${id}: larger`);
    assert.equal(u.rangeKeys.length, grid.length, `${id}: the skill's`);
    near(u.s.atk, a0 * (1 + b.atk), `${id}: ATK`, 1e-2);
    assert.equal(u.profile.funnelMul, null, `${id}: no addition`);
    assert.ok(h.runUntil(() => drones(h, u, e).length >= 2, 10), `${id}: hits`);
    const d = drones(h, u, e);
    near(times[1] - times[0], u.s.interval, `${id}: her interval`, 0.05);
    assert.equal(d[0].dmg.isAttack, false, `${id}: no attack`);
    assert.equal(d[0].dmg.isSkill, true, `${id}: skill damage`);
    assert.equal(d[0].dmg.type, 'arts');
    assert.ok(h.runUntil(() => !u.skill.active, 30), `${id}: ends`);
    assert.equal(typeof u.profile.funnelMul, 'function', `${id}: the drone back`);
    done(h);
  }
});

test('S2: the lock outlives her range; the drone goes on through her stun; a dead target releases it', () => {
  const { h, u } = field(B, { skill: 1, seed: 11 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  cast(u);
  assert.ok(h.runUntil(() => drones(h, u, e).length >= 1, 5));
  assert.equal(u.mem.cammouDrone.lock, e);
  h.b.applyStatus(u, 'stun', { duration: 4, source: e });
  const n = drones(h, u, e).length;
  h.run(3);
  assert.ok(drones(h, u, e).length > n, 'through her stun');
  // a better target for her attacks: the drone stays where it is
  const other = h.spawn('enemy_dummy', { pos: [10, 7] });
  h.b.addBuff(other, { key: 'test:taunt', mods: { taunt: 5 } });
  const again = drones(h, u, other).length;
  h.run(2);
  assert.equal(drones(h, u, other).length, again, 'still on its lock');
  h.b.kill(e, null);
  assert.ok(h.runUntil(() => drones(h, u, other).length > again, 3), 'on to the next');
  done(h);
});

test('S2: the drone goes out with one of her attacks, on its target, and hits at once; after its enemy dies the next waits for her next attack', () => {
  for (const id of FORMS) {
    const { h, u } = field(id, { skill: 1, seed: 11 });
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    const other = h.spawn('enemy_dummy', { pos: [10, 7] });
    h.b.addBuff(e, { key: 'test:taunt', mods: { taunt: 5 } });
    const attacks = [], droneAt = [];
    h.b.on('attack', (c) => { if (c.attacker === u && u.skill.active) attacks.push({ t: h.b.time, target: c.targets?.[0] }); });
    h.b.on('damaged', (c) => { if (c.source === u && c.dmg?.tags?.includes(DRONE_TAG)) droneAt.push({ t: h.b.time, target: c.target }); });
    cast(u);
    assert.ok(h.runUntil(() => droneAt.length >= 1, 10), `${id}: a drone hit`);
    assert.ok(attacks.length >= 1 && attacks[0].t <= droneAt[0].t + 1e-9, `${id}: not before her first attack (${attacks[0]?.t} / ${droneAt[0].t})`);
    assert.equal(droneAt[0].target, attacks[0].target, `${id}: on that attack's target`);
    assert.ok(droneAt[0].t - attacks[0].t < 0.1, `${id}: at once`);
    h.b.kill(e, null);
    const tk = h.b.time;
    assert.ok(h.runUntil(() => droneAt.some((x) => x.target === other), 10), `${id}: on to the next`);
    const next = droneAt.find((x) => x.target === other), att = attacks.find((a) => a.t >= tk - 1e-9);
    assert.ok(att && att.t <= next.t + 1e-9 && att.target === other, `${id}: with her next attack (${att?.t} / ${next.t})`);
    done(h);
  }
});

test('S2: a new attack interval re-times the drone\'s wait keeping its progress', () => {
  const { h, u } = field(B, { skill: 1, seed: 11 });
  const e = h.spawn('enemy_dummy', { pos: FRONT });
  const times = [];
  h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.tags?.includes(DRONE_TAG)) times.push(h.b.time); });
  cast(u);
  assert.ok(h.runUntil(() => times.length >= 1, 10));
  const i0 = u.s.interval, t0 = times[0];
  h.runUntil(() => h.b.time >= t0 + i0 / 2 - 1e-9, 5);
  const ta = h.b.time, left = t0 + i0 - ta;
  h.b.addBuff(u, { key: 'test:aspd', mods: { aspd: 100 } });
  const i1 = u.s.interval;
  assert.ok(i1 < i0 * 0.9, 'faster');
  assert.ok(h.runUntil(() => times.length >= 2, 5));
  near(times[1] - ta, left * (i1 / i0), 'remaining × new ÷ old', 0.1);
  done(h);
});

test('S2: her attacks and the drone\'s hits each roll a stun for attack@stun s; no roll without the skill; the prob is the blackboard\'s', () => {
  for (const id of FORMS) {
    const b = bbOf(id, S2);
    const { h, u } = field(id, { skill: 1, seed: 3 });
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    const stuns = () => h.hooksOf('statusApplied').filter((c) => c.target === e && c.status === 'stun' && c.source === u);
    h.run(6);
    assert.equal(stuns().length, 0, `${id}: before the skill`);
    const chance = h.b.rng.chance, asked = [];
    h.b.rng.chance = (p) => { asked.push(p); return true; };
    const before = hits(h, u, e).length;
    cast(u);
    h.run(6);
    const during = hits(h, u, e).slice(before);
    const own = during.filter((c) => c.dmg?.isAttack).length, drone = during.filter((c) => c.dmg?.tags?.includes(DRONE_TAG)).length;
    assert.ok(own > 0 && drone > 0, `${id}: both hit: ${own} ${drone}`);
    assert.equal(stuns().length, own + drone, `${id}: one roll a hit`);
    assert.ok(asked.every((p) => p === b['attack@prob']), `${id}: attack@prob`);
    near(e.findBuff('stun')?.duration ?? b['attack@stun'], b['attack@stun'], `${id}: its time`);
    h.b.rng.chance = chance;
    done(h);
  }
});

test('Real match path', async () => {
  for (const id of FORMS) await realMatch(id, 'char_328_cammou');
});

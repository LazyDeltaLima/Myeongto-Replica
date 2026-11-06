// test/content/op_cammou.test.js — 클릭 (char_328_cammou, a tier-1 piece of the season not out yet; kit ops/op-cammou.js): both forms, both skills.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, realMatch } from '../helpers/nextSeason.js';
import { DRONE_TAG } from '../../server/sim/content/kits/ops/op-cammou.js';

const A = 'chess_char_1_ncammou_a', B = 'chess_char_1_ncammou_b';
const FORMS = [A, B];
const S1 = 'skcom_atk_up[2]', S2 = 'skchr_cammou_2';
const bbOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk).bb;
const near = (a, b, m, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const FRONT = [10, 6];
const hits = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);
const drones = (h, u, e) => hits(h, u, e).filter((c) => c.dmg?.tags?.includes(DRONE_TAG));

test('Talent: ASPD +attack_speed on both forms of its phase', () => {
  for (const id of FORMS) {
    const v = NEXT.chess[id].talents[0].bb.attack_speed;
    assert.equal(v, id === A ? 6 : 12);
    const { h, u } = field(id, { skill: 0 });
    near(u.s.aspd, u.base.aspd + v, `${id}: ASPD`);
    done(h);
  }
});

test('Trait: her attack is arts plus a drone addition that ramps on one target from init by delta, to the form\'s cap; a new target starts over', () => {
  for (const id of FORMS) {
    const tb = NEXT.chess[id].trait.bb;
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
    const grid = NEXT.chess[id].skills.find((s) => s.skillId === S2).rangeGrid;
    const before = u.rangeKeys.length;
    const a0 = u.s.atk;
    const e = h.spawn('enemy_dummy', { pos: FRONT });
    const times = [];
    h.b.on('damaged', (c) => { if (c.target === e && c.dmg?.tags?.includes(DRONE_TAG)) times.push(h.b.time); });
    cast(u);
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

// Operator attack forms that follow the official client's skill modes (charpack `Modes/<mode>/Body/Attack`):
// 塞雷娅 S3 钙质化's mode attacks allies only — its heal pulse — so she strikes no enemy while it runs; 号角 S2's blocked
// attack is an instant shell with its blast, the Default mode's a plain melee hit (no blast; 灰毫 too); a 领主's blocked attack (`Body/Combat`) strikes the enemy it blocks alone in the
// Default mode and, in 拉普兰德 S2's mode, that one plus one more in range (both pinned: the sim already strikes so).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { tileKeyOf } from '../../server/sim/targeting.js';

test('塞雷娅 S3 钙质化: no attack on the enemy she blocks while it runs, the 1 s heal pulse goes on; she attacks again after it', () => {
  const h = makeBattle({ autoFinish: false, captureNoisy: true, hooks: ['heal', 'damaged'],
    defs: {
      chess: { patient: chessRec({ id: 'patient', skill: null, stats: { maxHp: 100000 } }) },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0 }) },
    },
    units: [{ uid: 1, chessId: 'chess_char_5_11_b', skillIndex: 2, row: 10, col: 4 }, { uid: 2, chessId: 'patient', row: 10, col: 5 }] });
  h.step();
  const u = h.unit(1), p = h.unit(2);
  const e = h.spawn('dummy', { pos: [10, 4] });
  const hits = () => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e).length;
  assert.ok(h.runUntil(() => hits() > 0, 5), 'before S3 she attacks the enemy');
  p.hp = p.s.maxHp * 0.2;
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'S3 opens (TAKE_DAMAGE or the hit she takes)');
  // (a swing begun before the cast is the Default mode's: let it pass)
  h.run(1);
  const n = hits(), healed = h.hooksOf('heal').filter((c) => c.source === u && c.target === p).length;
  h.run(Math.min(10, u.skill.timeLeft - 0.5));
  assert.equal(hits(), n, 'no attack on enemies during S3');
  assert.ok(e.findBuff('saria:calcify'), 'the enemy in her area is still calcified');
  assert.ok(h.hooksOf('heal').filter((c) => c.source === u && c.target === p).length >= healed + 8, 'the heal pulse every second');
  assert.ok(h.runUntil(() => !u.skill.active, 40));
  assert.ok(h.runUntil(() => hits() > n, 5), 'after S3 she attacks again');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

test('号角 S2 暴风号令: the enemy she blocks takes the S2 shell at the strike (BlockedRangedAttack fires the instant ATTACH projectile_chr_horn_s2_melee), its blast on the one beside it', () => {
  const h = makeBattle({ autoFinish: false, captureNoisy: true, hooks: ['damaged'],
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0 }) } },
    units: [{ uid: 1, chessId: 'chess_char_5_08_b', skillIndex: 1, row: 10, col: 4 }] });
  h.step();
  const u = h.unit(1);
  const a = h.spawn('dummy', { pos: [10, 4] }), c = h.spawn('dummy', { pos: [10, 4.9] });
  assert.ok(h.runUntil(() => a.blockedBy === u, 1), 'she blocks the first');
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3));
  const t0 = h.b.time;
  let flying = 0;
  assert.ok(h.runUntil(() => {
    flying += h.b.projectiles.list.filter((p) => p.source === u).length;
    return h.hooksOf('damaged').some((x) => x.source === u && x.target === c && x.t > t0);
  }, 4), 'the blast reaches the other enemy');
  assert.equal(flying, 0, 'no shell in flight: the blocked one is hit at the strike');
  const swings = h.eventsOf('atk').filter((e) => e[1] === u.id && e[2] === a.id);
  assert.ok(swings.length && swings.every((e) => e[3] === 'none'), 'its attack event is the melee kind (the A clip, horn_s_2[signal_melee])');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

for (const [name, chessId] of [['号角', 'chess_char_5_08_b'], ['灰毫', 'chess_char_2_18_b']]) {
  test(`${name} (要塞) Default: the enemy she blocks takes a plain melee hit (MeleeAttack / BlockedMeleeAttack, no projectile) — no blast on the one beside it`, () => {
    const h = makeBattle({ autoFinish: false, captureNoisy: true, hooks: ['damaged'],
      defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0 }) } },
      units: [{ uid: 1, chessId, skillIndex: null, row: 10, col: 4 }] });
    h.step();
    const u = h.unit(1);
    const a = h.spawn('dummy', { pos: [10, 4] }), c = h.spawn('dummy', { pos: [10, 4.9] });
    assert.ok(h.runUntil(() => a.blockedBy === u, 1), 'she blocks the first');
    assert.ok(c.blockedBy !== u, 'the second stands beside it, unblocked (block count 1 would hold both otherwise)');
    const on = (t) => h.hooksOf('damaged').filter((x) => x.source === u && x.target === t).length;
    assert.ok(h.runUntil(() => on(a) >= 3, 12), 'she strikes the blocked one');
    assert.equal(on(c), 0, 'no blast on the other enemy');
    checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
  });
}

test('拉普兰德: the blocked attack (Combat) strikes the blocked enemy alone in the Default mode; in S2 狼魂 it and one more in range (the S2 attack selector, 2), never a third', () => {
  const h = makeBattle({ autoFinish: false, captureNoisy: true, hooks: ['damaged'],
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e8, atk: 0, speed: 0 }) } },
    units: [{ uid: 1, chessId: 'chess_char_2_16_b', skillIndex: 1, row: 10, col: 4 }] });
  h.step();
  const u = h.unit(1);
  const a = h.spawn('dummy', { pos: [10, 4] }), b = h.spawn('dummy', { pos: [10, 5] }), c = h.spawn('dummy', { pos: [10, 6] });
  assert.ok(h.runUntil(() => a.blockedBy === u, 1), 'she blocks the first');
  assert.ok(b.blockedBy !== u && c.blockedBy !== u, 'the other two are not blocked');
  for (const e of [b, c]) assert.ok(u.rangeKeys.includes(tileKeyOf(e)), 'the other two stand in her range');
  const hitsSince = (t0) => [a, b, c].map((e) => h.hooksOf('damaged').filter((x) => x.source === u && x.target === e && x.t > t0).length);
  let t0 = h.b.time;
  h.run(4);
  const [da, db, dc] = hitsSince(t0);
  assert.ok(da > 0 && db === 0 && dc === 0, `Default mode: the blocked enemy only (${da}/${db}/${dc})`);
  u.skill.gainSp(999);
  assert.ok(h.runUntil(() => u.skill.active, 3), 'S2 opens');
  h.run(1);   // a swing begun before the cast is the Default mode's
  t0 = h.b.time;
  h.run(6);
  const [sa, sb, sc] = hitsSince(t0);
  assert.ok(sa > 0 && sa === sb + sc, `S2: every strike hits the blocked enemy and one other (${sa}/${sb}/${sc})`);
  assert.ok(sb > 0, 'the other one is the nearer (b)');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

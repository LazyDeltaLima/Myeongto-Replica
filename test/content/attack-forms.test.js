// Operator attack forms that follow the official client's skill modes (charpack `Modes/<mode>/Body/Attack`):
// 塞雷娅 S3 钙质化's mode attacks allies only — its heal pulse — so she strikes no enemy while it runs; 号角 S2's blocked
// attack is an instant shell with its blast (pinned: the sim already strikes so).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

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

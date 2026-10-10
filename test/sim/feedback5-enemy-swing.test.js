// test/sim/feedback5-enemy-swing.test.js — an enemy's normal attack strikes at its clip's damage frame, and a stun before the
// frame cuts the swing (GitHub #187 point 1 「短轴眩晕无法打断敌人攻击，比如：六卡西米尔、异德三、忍冬三」, #170; PRTS 状态机
// ATTACK / COMBAT "每帧检查异常状态，若有则切换到异常状态的状态", PRTS 异常效果 STUNNED / DISARMED "正在进行的普通攻击将被中断") —
// server/sim/ai.js updateEnemy / enemyAttack / attackWindup. The damage frame is data/enemies.json `attackAnim.hit` (the
// clip's strike frame) × the clip scale (attackTiming: interval ÷ clip within [0.1, `_maxAnimScale`]); no clip known ⇒ no
// wind-up. Since 2026-10-10 (client code, docs/rules/sim.md 「일반 공격 타이밍」) the cooldown restarts as the swing starts
// and runs through a stun, so a cut swing is followed by the next one a whole interval after its start; a target that
// dies during the swing is a whiff (no damage, no cooldown back).
// Run: node --test test/sim/feedback5-enemy-swing.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';
import { attackWindup } from '../../server/sim/ai.js';

const HIT = 0.4;      // the clip's strike frame
const BAT = 2;        // attack interval
const near = (a, b, msg, ticks = 2) => assert.ok(Math.abs(a - b) <= ticks * TICK + 1e-9, `${msg}: ${a.toFixed(3)} vs ${b.toFixed(3)}`);

/** A wall operator and one enemy (melee on the wall's tile — blocked at once —, or ranged 3 tiles away). */
function field({ ranged = false, clip = true } = {}) {
  const rec = {
    ...enemyRec({ key: 'enemy_sw', hp: 1e9, atk: 100, bat: BAT, speed: 0, ...(ranged ? { range: 3 } : null) }),
    ...(clip ? { attackAnim: { clip: 'Attack', dur: 1, hit: HIT } } : null),
  };
  const h = makeBattle({
    defs: { chess: { t_wall: chessRec({ id: 't_wall', stats: { maxHp: 1e9, atk: 0, def: 0 }, skill: null }) }, enemies: { enemy_sw: rec } },
    units: [{ chessId: 't_wall', row: 10, col: 6 }], enemies: [{ key: 'enemy_sw', pos: ranged ? [10, 9] : [10, 6] }],
    content: 'none', autoFinish: false, timeLimit: 60, hooks: ['attack', 'damaged'], captureNoisy: true,
  });
  h.step();
  return { h, e: h.enemy('enemy_sw'), wall: h.unit('t_wall') };
}
const strikes = (h, e) => h.hooksOf('attack').filter((c) => c.attacker === e).map((c) => c.t);
const hits = (h, e) => h.hooksOf('damaged').filter((c) => c.source === e && c.dmg.isAttack).map((c) => c.t);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

test('attackWindup: the clip\'s strike frame × the clip scale (interval ÷ clip within [0.1, _maxAnimScale]); 0 with no clip', () => {
  const w = (anim, interval) => attackWindup({ def: { attackAnim: anim }, s: { interval } });
  assert.equal(w({ dur: 1, hit: 0.4 }, 2), 0.4, '_maxAnimScale 1: never stretched');
  assert.equal(w({ dur: 2, hit: 1 }, 1), 0.5, 'shortened when the attacks come quicker than the clip');
  assert.equal(w({ dur: 1, hit: 0.4, max: -1 }, 2), 0.8, '_maxAnimScale −1: stretched over the interval');
  assert.ok(Math.abs(w({ dur: 1, hit: 0.4, max: 1.1 }, 2) - 0.44) < 1e-12, '_maxAnimScale 1.1: stretched up to 10 %');
  assert.ok(Math.abs(w({ dur: 2, hit: 1 }, 0.1) - 0.1) < 1e-12, 'MIN_ANIM_SCALE 0.1: at most 10× faster');
  assert.equal(w({ dur: 1 }, 2), 1, 'no strike frame named: the strike as the swing ends (WaitForNextEvent waits the whole swing)');
  assert.ok(Math.abs(w({ dur: 1, hit: 0.4, wait: 0, pre: 0.3, max: -1 }, 2) - 0.6) < 1e-12, '_waitForAttackEvent 0: _preDelay × the scale');
  assert.equal(w(undefined, 2), 0);
});

test('a blocked enemy swings when its cooldown is over and strikes at the damage frame: the first strike one wind-up after the block (its cooldown long over), then one per attack interval', () => {
  const { h, e } = field();
  const t0 = h.b.time;   // blocked in the first tick
  h.run(4.6);
  const s = strikes(h, e);
  assert.ok(s.length >= 3, `${s.length} strikes`);
  near(s[0], t0 + HIT, 'the first strike: the whole wind-up from the block (it used to land at once)');
  near(s[1] - s[0], BAT, 'then one per interval', 1);
  near(s[2] - s[1], BAT, 'then one per interval', 1);
  assert.deepEqual(hits(h, e), s, 'melee: the damage at the strike');
  done(h);
});

for (const dur of [0.1, 0.2]) {
  test(`a ${dur} s stun before the damage frame cuts the swing: no strike at that frame, the next swing a whole interval after the cut one started (卡西米尔 6's pulse, 忍冬 S3)`, () => {
    const { h, e } = field();
    assert.ok(h.runUntil(() => strikes(h, e).length === 1, 2));
    const t1 = strikes(h, e)[0];
    // its next swing starts at t1 + BAT − HIT; the stun lands 0.2 s into it
    h.runUntil(() => h.b.time >= t1 + BAT - HIT + 0.2 - 1e-9, 3);
    assert.ok(e.swing, 'swinging');
    const tStun = h.b.time;
    h.b.applyStatus(e, 'stun', { duration: dur });
    h.run(BAT + HIT + 0.3);
    const s = strikes(h, e);
    assert.equal(s.filter((t) => t > t1 && t < tStun + dur).length, 0, 'the cut swing never struck');
    // the cooldown restarted as the cut swing started and ran through the stun (client: `CastToTarget` resets it,
    // `InterruptIfNot` leaves it): the next swing BAT after that start, its strike HIT later
    near(s[1], tStun - 0.2 + BAT + HIT, 'the next strike: a whole interval after the cut swing started, then its wind-up', 3);
    done(h);
  });
}

test('a stun during the cooldown (before the swing) does not hold it; 缴械 cuts a swing like a stun; a strike already made stays made (a ranged shot in flight lands)', () => {
  // the cooldown runs through a stun (client: `Entity.OnTick` ticks the abilities of every living entity): a 0.5 s stun
  // 0.5 s after a strike leaves the next one where it was
  const a = field();
  assert.ok(a.h.runUntil(() => strikes(a.h, a.e).length === 1, 2));
  const t1 = strikes(a.h, a.e)[0];
  a.h.run(0.5);
  a.h.b.applyStatus(a.e, 'stun', { duration: 0.5 });
  a.h.run(BAT + 0.3);
  near(strikes(a.h, a.e)[1], t1 + BAT, 'the cooldown ran on through the stun', 3);
  // a stun over the moment the next swing was due: it swings as the stun ends
  const t2 = strikes(a.h, a.e)[1];
  a.h.runUntil(() => a.h.b.time >= t2 + BAT - HIT - 0.3 - 1e-9, 3);
  a.h.b.applyStatus(a.e, 'stun', { duration: 0.6 });
  const tEnd = a.h.b.time + 0.6;
  a.h.run(1.5);
  near(strikes(a.h, a.e)[2], tEnd + HIT, 'swings as the stun ends', 3);
  done(a.h);
  // 缴械 mid-swing: the swing is cut, the next one a whole interval after its start
  const b = field();
  assert.ok(b.h.runUntil(() => strikes(b.h, b.e).length === 1, 2));
  const u1 = strikes(b.h, b.e)[0];
  b.h.runUntil(() => b.h.b.time >= u1 + BAT - HIT + 0.2 - 1e-9, 3);
  const tD = b.h.b.time;
  b.h.b.addBuff(b.e, { key: 'test:disarm', duration: 0.1, flags: { disarm: true } });
  b.h.run(BAT + HIT + 0.3);
  assert.equal(strikes(b.h, b.e).filter((t) => t > u1 && t < tD + 0.1).length, 0, '缴械 "正在进行的普通攻击将被中断"');
  near(strikes(b.h, b.e)[1], tD - 0.2 + BAT + HIT, 'the next swing a whole interval after the cut one started', 3);
  done(b.h);
  // ranged: stunned just after the strike — the shot flies on and lands
  const c = field({ ranged: true });
  assert.ok(c.h.runUntil(() => strikes(c.h, c.e).length === 1, 3));
  assert.equal(hits(c.h, c.e).length, 0, 'the shot is in flight');
  c.h.b.applyStatus(c.e, 'stun', { duration: 1 });
  c.h.run(0.6);
  assert.equal(hits(c.h, c.e).length, 1, 'a strike already made is not undone');
  done(c.h);
});

test('no attack clip known: no wind-up — it strikes as its swing starts; its cooldown runs through a stun', () => {
  const { h, e } = field({ clip: false });
  assert.equal(attackWindup(e), 0);
  h.step();
  assert.equal(strikes(h, e).length, 1, 'struck in its first tick blocked');
  const t1 = strikes(h, e)[0];
  h.runUntil(() => h.b.time >= t1 + BAT - 0.3 - 1e-9, 3);
  h.b.applyStatus(e, 'stun', { duration: 0.1 });
  h.run(0.6);
  near(strikes(h, e)[1], t1 + BAT, 'the stun did not hold its cooldown', 3);
  done(h);
});

test('the target dies during the swing: a whiff — no damage, the swing plays out, no cooldown back; `_selectTargetTiming` 1 takes the targets again at the strike, nobody = the cooldown refunded', () => {
  const wall2 = chessRec({ id: 't_wall2', stats: { maxHp: 1e9, atk: 0, def: 0 }, skill: null });
  const mk = (sel) => {
    const rec = { ...enemyRec({ key: 'enemy_sw', hp: 1e9, atk: 100, bat: BAT, speed: 0, range: 3 }), attackAnim: { clip: 'Attack', dur: 1, hit: HIT, ...(sel ? { sel } : null) } };
    const h = makeBattle({
      defs: { chess: { t_wall: chessRec({ id: 't_wall', stats: { maxHp: 1e9, atk: 0, def: 0 }, skill: null }), t_wall2: wall2 }, enemies: { enemy_sw: rec } },
      units: [{ chessId: 't_wall', row: 10, col: 7 }, { chessId: 't_wall2', row: 10, col: 6 }], enemies: [{ key: 'enemy_sw', pos: [10, 9] }],
      content: 'none', autoFinish: false, timeLimit: 60, hooks: ['attack', 'damaged'], captureNoisy: true,
    });
    h.step();
    return { h, e: h.enemy('enemy_sw') };
  };
  // AT_BEGINING (0): its target (the latest deployed in range) withdrawn mid-swing — no strike, the next one an interval on
  {
    const { h, e } = mk(0);
    assert.ok(e.swing, 'swinging from its first tick');
    const t0 = h.b.time - TICK, target = e.swing.targets[0];
    h.b.retreat(target, { reason: 'retreat', permanent: true });
    h.run(HIT + 0.2);
    assert.equal(strikes(h, e).length, 0, 'a whiff: no attack made');
    assert.equal(hits(h, e).length, 0);
    assert.ok(e.atkCd > BAT - HIT - 0.3, 'no cooldown back');
    h.run(BAT);
    near(strikes(h, e)[0], t0 + BAT + HIT, 'the next swing an interval after the whiffed one started', 3);
    done(h);
  }
  // BEFORE_SPELL_START (1): the targets are taken again at the strike — the other wall is hit
  {
    const { h, e } = mk(1);
    const target = e.swing.targets[0];
    h.b.retreat(target, { reason: 'retreat', permanent: true });
    assert.ok(h.runUntil(() => strikes(h, e).length === 1, HIT + 0.2));
    assert.notEqual(h.hooksOf('attack').find((c) => c.attacker === e).targets[0], target, 'struck the one left in reach');
    done(h);
  }
  // … and with nobody left in reach the cooldown is refunded: it swings again as soon as a target comes
  {
    const { h, e } = mk(1);
    for (const u of [h.unit('t_wall'), h.unit('t_wall2')]) h.b.retreat(u, { reason: 'retreat', permanent: true });
    h.run(HIT + 0.1);
    assert.equal(strikes(h, e).length, 0);
    assert.equal(e.atkCd, 0, 'cooldown refunded (FinishIfNot TARGET_DEAD before the strike → Reset(false))');
    done(h);
  }
});

test('麻痹 blocks the strike only: the cooldown runs on from the swing start', () => {
  const { h, e } = field();
  assert.ok(h.runUntil(() => strikes(h, e).length === 1, 2));
  const t1 = strikes(h, e)[0];
  h.b.addBuff(e, { key: 'palsy', status: 'palsy', stacks: 1, persist: true });
  h.run(BAT + 0.2);
  assert.equal(strikes(h, e).length, 1, 'the second strike was interrupted by 麻痹');
  h.run(BAT);
  near(strikes(h, e)[1], t1 + 2 * BAT, 'the third swing on its usual rhythm (no interval restarted at the strike)', 3);
  done(h);
});

// 塞雷娅 S1 急救 casts when an ally of its area is at ≤ half HP and heals with her next attack, no enemy needed (upstream
// e86c7c83, GitHub #406; its 黍 case is not in this fork's pool), and 凯尔希·思衡托 S2 casts for an enemy of its y-11, never
// for an injured ally alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
const GUARDIANS = [
  { chessId: 'chess_char_5_11_b', skillIndex: 0 },
];
function guardian(entry) {
  const h = makeBattle({ autoFinish: false, captureNoisy: true, hooks: ['heal', 'skillStart'],
    defs: { chess: { patient: chessRec({ id: 'patient', skill: null, stats: { maxHp: 100000 } }) } },
    units: [{ uid: 1, ...entry, row: 10, col: 4 }, { uid: 2, chessId: 'patient', row: 10, col: 5 }] });
  h.step();const u = h.unit(1), p = h.unit(2);u.skill.gainSp(999);return { h, u, p };
}
for (const entry of GUARDIANS) {
  const name = entry.chessId ? '塞雷娅' : '黍';
  test(`${name} S1 casts the moment an ally of its area is at ≤ half HP (技力 spent then), heals with her next attack, no enemy needed`, () => {
    const { h, u, p } = guardian(entry);
    p.hp = p.s.maxHp * 0.5001;h.run(0.5);assert.equal(u.skill.activations, 0);
    p.hp = p.s.maxHp * 0.5;u.atkCd = 1;
    h.step();assert.equal(u.skill.activations, 1, 'exact half HP: cast at once (NextAttackOrCombatSkill.DoTick)');
    assert.ok(u.skill.pending, 'its heal waits for her attack');
    h.run(0.5);assert.equal(p.hp, p.s.maxHp * 0.5, 'no heal before the attack interval');
    // (the heal lands at the attack's strike, after its wind-up — this fork's client attack timing)
    assert.ok(h.runUntil(() => p.hp > p.s.maxHp * 0.5, 2), 'that attack heals');
    p.hp = p.s.maxHp * 0.2;
    assert.ok(h.runUntil(() => h.hooksOf('heal').filter(c => c.source === u).length >= 2, 4));
    const heals = h.hooksOf('heal').filter(c => c.source === u);
    assert.ok(heals[1].t - heals[0].t >= u.base.bat - 0.04, 'the heals are paced by attacks');
    checkInvariants(h.b);assert.deepEqual(h.b.errors, []);
  });
  test(`${name} S1 preserves exact normal/fast attack intervals; under 缴械 it casts and the heal waits`, () => {
    for (const aspd of [0, 100]) {
      const { h, u, p } = guardian(entry);
      p.hp *= 0.1;
      if (aspd) h.b.addBuff(u, { key: 'test:aspd', mods: { aspd } });
      h.b.on('heal', c => { if (c.source === u) u.skill.gainSp(999); });
      h.b.applyStatus(u, 'disarm', { duration: 1 });
      h.run(0.5);
      assert.equal(u.skill.activations, 1, 'cast under 缴械');
      assert.equal(u.skill.pending, true, 'one cast waits for its attack (the other charge is not spent)');
      assert.equal(h.hooksOf('heal').filter(c => c.source === u).length, 0);
      h.run(4);
      const times = h.hooksOf('heal').filter(c => c.source === u).map(c => c.t);
      assert.ok(times.length >= 3);
      for (let i = 1; i < times.length; i++) assert.ok(Math.abs(times[i] - times[i - 1] - u.s.interval) < 1e-9);
      checkInvariants(h.b);assert.deepEqual(h.b.errors, []);
    }
  });
  test(`${name} S1 cannot heal a forbidden patient or cast while silenced; a waiting heal whose ally is healed meanwhile is dropped, its 技力 lost`, () => {
    const { h, u, p } = guardian(entry);p.hp *= 0.2;
    h.b.addBuff(p, { key: 'test:noheal', flags: { noHeal: true } });h.run(2);assert.equal(u.skill.activations, 0);
    h.b.removeBuff(p, 'test:noheal');h.b.applyStatus(u, 'silence', { duration: 2 });h.run(1);assert.equal(u.skill.activations, 0);
    h.run(1.1);assert.ok(u.skill.activations > 0);
    // a cast waiting for her next attack, no swing under way
    assert.ok(h.runUntil(() => u.skill.pending && !u.swing && u.atkCd > 0.2, 4));
    const charges = u.skill.charges, sp = u.skill.sp, n = u.skill.activations;
    p.hp = p.s.maxHp;h.step();
    assert.equal(u.skill.pending, false, 'dropped (ReplacementSkill._cancelIfSearchTargetFailed)');
    assert.equal(u.skill.charges, charges, 'no charge back');
    assert.ok(u.skill.sp <= sp + 0.1, 'no 技力 back');
    assert.equal(u.skill.activations, n);
    checkInvariants(h.b);assert.deepEqual(h.b.errors, []);
  });
}
for (const motion of ['WALK', 'FLY']) {
  test(`凯尔希·思衡托 S2 opens for a selectable ${motion} enemy only in the expanded range, without an injured ally`, () => {
    const h = makeBattle({ autoFinish: false,
      defs: { enemies: { target: enemyRec({ key: 'target', motion, hp: 1e8, atk: 0, speed: 0 }) } },
      units: [{ uid: 1, diy: { slot: 6, charId: 'char_1052_kalts2', skillIndex: 1 }, elite: true, row: 10, col: 4 }] });
    h.step();const u = h.unit(1);u.skill.gainSp(999);h.run(0.5);assert.equal(u.skill.activations, 0);
    const e = h.spawn('target', { pos: [10, 7] });h.b.applyStatus(e, 'sleep', { duration: 1 });
    assert.equal(h.b.enemiesInKeys(u.baseRangeKeys, u, { canHitFly: true }).length, 0);
    h.run(0.5);assert.equal(u.skill.activations, 0, 'sleep cannot open the mixed skill');
    assert.ok(h.runUntil(() => u.skill.active, 3));
    assert.equal(u.skill.activations, 1);checkInvariants(h.b);assert.deepEqual(h.b.errors, []);
  });
}

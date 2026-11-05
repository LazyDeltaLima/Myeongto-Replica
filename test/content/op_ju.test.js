// test/content/op_ju.test.js — 쥐 (char_4221_ju, a tier-2 piece of the season not out yet; kit ops/op-ju.js): both forms, both skills.
// Run: node --test test/content/op_ju.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEXT, field, done, cast, fill, realMatch } from '../helpers/nextSeason.js';
import { CRIPPLE, DONE, S2_START_DELAY, S2_GAP, isCrippled } from '../../server/sim/content/kits/ops/op-ju.js';

const A = 'chess_char_2_nju_a', B = 'chess_char_2_nju_b';
const FORMS = [A, B];
const S1 = 'skchr_ju_1', S2 = 'skchr_ju_2';
const skillOf = (id, sk) => NEXT.chess[id].skills.find((s) => s.skillId === sk);
const near = (a, b, m, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);
const RANGE_TILE = [10, 7];
const dmgOn = (h, u, e) => h.hooksOf('damaged').filter((c) => c.source === u && c.target === e);

test('T1 墨守: never lethal, 重伤 at ≤ 1 HP: slowed, unblockable, 禁疗, never his target, dead `interval` s later with no killer', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    const { h, u } = field(id);
    const e = h.spawn('enemy_dummy', { pos: RANGE_TILE });
    e.hp = 5;
    assert.equal(e.s.moveMul ?? 1, 1);
    h.runUntil(() => isCrippled(e), 6);
    assert.equal(e.alive, true, `${id}: kept`);
    assert.equal(e.hp, 1, `${id}: at 1 HP`);
    const b = e.findBuff(CRIPPLE);
    assert.ok(b.visible !== false);
    near(b.mods.moveMul, 1 + t.move_speed, `${id}: move`);
    assert.ok(e.s.flags.unblockable && e.s.flags.healFree && e.s.flags.noHeal, id);
    const hits = dmgOn(h, u, e).length;
    h.run(t.interval - 3);
    assert.equal(dmgOn(h, u, e).length, hits, `${id}: he does not attack it`);
    h.run(3.1);
    assert.equal(e.alive, false, `${id}: natural death`);
    assert.ok(h.hooksOf('kill').some((c) => c.victim === e && !c.killer), `${id}: no killer`);
    done(h);
  }
});

test('T1: whoever kills a 重伤 enemy gets `sp`; a damage that does not bring it to 1 HP gives none; 消失 waits', () => {
  for (const id of FORMS) {
    const t = NEXT.chess[id].talents[0].bb;
    const { h } = field(id, { others: [{ uid: 2, chessId: 'chess_char_1_02_a', row: 11, col: 4 }] });
    const k = h.unit(2);
    const e = h.spawn('enemy_dummy', { pos: RANGE_TILE });
    e.hp = 5;
    h.runUntil(() => isCrippled(e), 6);
    const sp0 = k.skill.sp;
    h.b.kill(e, k);
    assert.equal(e.alive, false);
    near(k.skill.sp - sp0, t.sp, `${id}: the killer's SP`);
    const f = h.spawn('enemy_dummy', { pos: RANGE_TILE });
    f.hp = 1e7;
    h.runUntil(() => f.hp < 1e7, 6);
    assert.ok(!isCrippled(f), `${id}: plain`);
    done(h);
  }
});

test('trait 攻城手: the heaviest first; SIE-X ×atk_scale on a weight ≥ 3 target (elite only), on the amount before DEF', () => {
  const { h, u } = field(B);
  assert.deepEqual([u.profile.priority, NEXT.chess[B].talents[0].bb.atk_scale, NEXT.chess[B].talents[0].bb.value], ['heaviest', 1.15, 3]);
  const light = h.spawn('enemy_light', { pos: [10, 6] }), heavy = h.spawn('enemy_heavy', { pos: RANGE_TILE });
  h.runUntil(() => heavy.hp < heavy.s.maxHp || light.hp < light.s.maxHp, 8);
  assert.ok(heavy.hp < heavy.s.maxHp, 'the heavy one');
  assert.equal(light.hp, light.s.maxHp, 'not the light one');
  near(heavy.s.maxHp - heavy.hp, u.s.atk * 1.15, 'SIE-X');
  done(h);
  const n = field(A);
  const e = n.h.spawn('enemy_heavy', { pos: RANGE_TILE });
  n.h.runUntil(() => e.hp < e.s.maxHp, 8);
  near(e.s.maxHp - e.hp, n.u.s.atk, 'no module');
  done(n.h);
});

test('S1 良弓难张: cast only for an enemy at ≤ half HP; scale × ATK on up to two such targets; while it waits no plain attack; two charges', () => {
  for (const id of FORMS) {
    const rec = skillOf(id, S1);
    const { h, u } = field(id, { skill: 0 });
    assert.equal(u.skill.id, S1);
    assert.deepEqual([u.skill.rule, u.skill.maxCharges], ['NEVER', 2], id);
    const high = h.spawn('enemy_dummy', { pos: RANGE_TILE });
    fill(u);
    h.run(0.3);
    assert.equal(u.skill.pending ?? false, false, `${id}: nobody low`);
    const low = h.spawn('enemy_dummy', { pos: [10, 6] }), low2 = h.spawn('enemy_dummy', { pos: [9, 6] }), low3 = h.spawn('enemy_dummy', { pos: [11, 6] });
    for (const x of [low, low2, low3]) x.hp = x.s.maxHp * 0.4;
    h.step();
    assert.equal(u.skill.pending, true, `${id}: cast at once`);
    const hp0 = high.hp, l0 = low.hp;
    h.runUntil(() => [low, low2, low3].some((x) => x.hp < x.s.maxHp * 0.4), 8);
    h.run(0.5);
    assert.equal(high.hp, hp0, `${id}: the high one is not hit`);
    const hit = [low, low2, low3].filter((x) => x.hp < x.s.maxHp * 0.4 - 1);
    assert.equal(hit.length, 2, `${id}: two targets (the selector's _maxNum)`);
    near(l0 - Math.min(...[low, low2, low3].map((x) => x.hp)), u.s.atk * rec.bb.atk_scale_s1, `${id}: scale`);
    // with no enemy low any more the charge it holds waits and he stands idle
    for (const x of [low, low2, low3]) h.b.kill(x, null);
    fill(u);
    h.run(1);
    assert.equal(u.skill.pending ?? false, false, id);
    done(h);
  }
});

test('S2 良翼难乘: ATK +, two targets; the extra damage ≥ 0.9 s after the check, one per 0.3 s, once per enemy, even between two 쥐', () => {
  for (const id of FORMS) {
    const bb = skillOf(id, S2).bb;
    const { h, u } = field(id, { more: [{ uid: 2, id, row: 11, col: 4 }] });
    const other = h.unit(2);
    const e1 = h.spawn('enemy_dummy', { pos: RANGE_TILE }), e2 = h.spawn('enemy_dummy', { pos: [10, 6] }), e3 = h.spawn('enemy_dummy', { pos: [9, 7] });
    const atk0 = u.s.atk;
    for (const x of [e1, e2, e3]) x.hp = x.s.maxHp * 0.3;
    cast(u);
    h.step();
    near(u.s.atk, atk0 * (1 + bb.atk), `${id}: ATK`);
    assert.equal(u.skill.spec.targeting.maxTargets, bb['attack@max_target_s2']);
    const extra = () => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('ju:extra'));
    h.run(S2_START_DELAY + S2_GAP - 0.1);
    assert.equal(extra().length, 0, `${id}: not before 0.9 s`);
    assert.ok(e1.findBuff(DONE) && e2.findBuff(DONE) && e3.findBuff(DONE), id);
    h.run(0.2);
    assert.equal(extra().length, 1, `${id}: the first at 0.9 s`);
    near(extra()[0].dmg.amount ?? u.s.atk * bb.atk_scale_s2_extra, u.s.atk * bb.atk_scale_s2_extra, `${id}: the amount`);
    h.run(S2_GAP);
    assert.equal(extra().length, 2, `${id}: the second 0.3 s on`);
    h.run(S2_GAP);
    assert.equal(extra().length, 3, `${id}: the third`);
    h.run(2);
    assert.equal(extra().length, 3, `${id}: once each`);
    // the mark stays: the other 쥐's S2 and a later cast of his do nothing to them
    fill(other);
    other.skill.activate('test');
    h.run(2);
    assert.equal(h.hooksOf('damaged').filter((c) => c.source === other && c.dmg?.tags?.includes('ju:extra')).length, 0, `${id}: shared mark`);
    done(h);
  }
});

test('S2: above hp_ratio no mark; below it after the skill no extra; a target marked as the skill ends still takes it; none if it is then untargetable', () => {
  const { h, u } = field(B);
  const e = h.spawn('enemy_dummy', { pos: RANGE_TILE }), s = h.spawn('enemy_dummy', { pos: [10, 6] });
  cast(u);
  h.run(0.5);
  assert.ok(!e.findBuff(DONE), 'above half');
  e.hp = e.s.maxHp * 0.3; s.hp = s.s.maxHp * 0.3;
  h.run(0.25);
  assert.ok(e.findBuff(DONE));
  u.skill.end('duration');
  h.run(0.5);
  h.b.addBuff(s, { key: 'test:gone', flags: { untargetable: true }, duration: 30 });
  h.run(2);
  const x = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.tags?.includes('ju:extra'));
  assert.deepEqual(x.map((c) => c.target === e), [true], 'the one still selectable, after the skill');
  const f = h.spawn('enemy_dummy', { pos: [11, 6] });
  f.hp = f.s.maxHp * 0.3;
  h.run(1);
  assert.ok(!f.findBuff(DONE), 'no skill, no mark');
  done(h);
});

test('real match path: his piece fights in a next match', async () => {
  for (const id of FORMS) await realMatch(id, 'char_4221_ju');
});

// When a timed skill's effects come (server/sim/skills.js `onStrike` / `onCastEnd`, docs/rules/sim.md 「즉발 스킬의 시전」): its skill ability
// waits for the clip's OnAttack (`_waitForAttackEvent`), the next ability of its sequence group for the clip's end. Every moment is
// asserted from both sides: nothing before it, the effect from then on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const TICK = 1 / 30;
const dummy = { d: enemyRec({ key: 'd', hp: 1e9, atk: 0, speed: 0 }) };

/** The operator on (9,5) with one skill, a dummy on `pos`; its cast started. */
function cast(chessId, skillIndex, { pos = [9, 6], units = [], foes = null } = {}) {
  const h = makeBattle({
    seed: 3, autoFinish: false, timeLimit: 90, defs: { enemies: dummy }, captureNoisy: true, hooks: ['damaged', 'statusApplied'],
    units: [{ chessId, skillIndex, row: 9, col: 5 }, ...units],
    enemies: (foes ?? [pos]).map((p) => ({ key: 'd', pos: p })),
  });
  h.run(1);
  const u = h.unit(chessId);
  assert.ok(u.skill.activate('test', { free: true }), 'cast');
  return { h, u, t0: h.b.time, e: h.b.enemies[0], t: u.skill.castTiming() };
}
const skillDmg = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isSkill && !c.dmg?.isAttack);
/** Step until `pred`; returns the seconds since `t0`, or null. */
function until(h, pred, t0, max = 5) {
  for (let i = 0; i < max / TICK; i++) {
    if (pred()) return h.b.time - t0;
    h.step();
  }
  return null;
}
const at = (got, want, what) => assert.ok(got != null && Math.abs(got - want) <= 2 * TICK, `${what}: ${got} s, expected ${want} s`);
const stun = (h, u, s = 0.2) => h.b.applyStatus(u, 'stun', { duration: s, resistApplied: true });

test('刺玫 S2: the protégé and its taunt come on the clip\'s OnAttack, and last `duration` s from there', REAL, () => {
  const { h, u, t0, t } = cast('chess_char_1_06_a', 1, { units: [{ chessId: 'chess_char_1_04_a', row: 9, col: 6 }] });
  assert.equal(u.mem.protege ?? null, null, 'nobody as the cast starts');
  at(until(h, () => u.mem.protege, t0), t.strike, 'the mark');
  const p = u.mem.protege;
  const b = p.findBuff('vendla:taunt');
  assert.ok(b);
  assert.ok(Math.abs(b.timeLeft - u.skill.duration) <= 2 * TICK, `the taunt holds ${b.timeLeft} s`);
  checkInvariants(h.b);
});

test('瑕光 S2: the sleep on the clip\'s OnAttack (0.5 s), the regeneration as the clip ends (1 s)', REAL, () => {
  const { h, u, t0, e, t } = cast('chess_char_3_12_a', 1, { pos: [9, 5], units: [{ chessId: 'chess_char_1_04_a', row: 9, col: 6 }] });
  const ally = h.unit('chess_char_1_04_a');
  assert.equal(t.strike, 0.5);
  assert.ok(!e.s.flags.sleep, 'awake as the cast starts');
  at(until(h, () => e.s.flags.sleep, t0), 0.5, 'the sleep');
  assert.ok(!ally.findBuff(`blemsh:regen:${u.id}`), 'no regeneration before the S2 mode');
  at(until(h, () => ally.findBuff(`blemsh:regen:${u.id}`), t0), 1, 'the regeneration');
  checkInvariants(h.b);
});

test('余 S2: the burst and the teleport on the clip\'s OnAttack (0.5 s)', REAL, () => {
  const { h, u, t0, e } = cast('chess_char_6_03_a', 1, { pos: [9, 6] });
  assert.equal(skillDmg(h, u).length, 0, 'no burst as the cast starts');
  assert.equal(e.x, 6, 'not moved yet');
  at(until(h, () => skillDmg(h, u).length, t0), 0.5, 'the burst');
  assert.equal(e.x, 5, 'on his tile');
  checkInvariants(h.b);
});

test('余 S3: the picture as the cast starts, the wall as the clip ends (Aura is the next ability)', REAL, () => {
  const { h, u, t0 } = cast('chess_char_6_03_a', 2, { pos: [9, 6] });
  assert.ok(h.eventsOf('fx').some((f) => f[1] === 'firewall'), 'yu_s_3[effect]: at ON_CAST_START');
  assert.equal(u.mem.yuWall ?? null, null, 'no wall yet');
  at(until(h, () => u.mem.yuWall, t0), 1.6, 'the wall');
  checkInvariants(h.b);
});

test('焰影苇草 S2: the fireballs on the clip\'s OnAttack, and they live their time from there', REAL, () => {
  const { h, u, t0, t } = cast('chess_char_6_08_a', 1, { units: [{ chessId: 'chess_char_1_04_a', row: 9, col: 6 }] });
  assert.equal(u.mem.reedFire ?? null, null);
  at(until(h, () => u.mem.reedFire, t0), t.strike, 'the fireballs');
  const buff = u.mem.reedFire[0].a.findBuff(`reed2:fireball:${u.id}`);
  assert.ok(buff && Math.abs(buff.timeLeft - u.skill.duration) <= 2 * TICK);
  checkInvariants(h.b);
});

test('仇白 S2: the targets as the cast starts, the burst + 1.2 s 停顿 on the clip\'s OnAttack, the mode\'s 停顿 as the clip ends', REAL, () => {
  const { h, u, t0, e } = cast('chess_char_6_15_a', 1, { pos: [9, 6] });
  assert.equal(skillDmg(h, u).length, 0, 'no burst as the cast starts');
  // (walked in after the cast started: `_selectTargetTiming` 0 has not picked it)
  const late = h.spawn('d', { pos: [9, 7] });
  at(until(h, () => skillDmg(h, u).length, t0), 0.5, 'the burst');
  assert.deepEqual(skillDmg(h, u).map((c) => c.target), [e], 'only what was there as the cast started');
  assert.ok(Math.abs(e.findBuff('sluggish').timeLeft - 1.2) <= 2 * TICK, 'sword_split\'s own 停顿');
  assert.ok(!late.findBuff('sluggish'), 'the mode\'s 停顿 has not begun');
  at(until(h, () => late.findBuff('sluggish'), t0), 1.167, 'the mode\'s 停顿');
  checkInvariants(h.b);
});

test('乌尔比安 S3: the throw on the clip\'s OnAttack, the hit where the anchor lands (15 tiles/s), the 【移动】 as the clip ends', REAL, () => {
  const { h, u, t0, e } = cast('chess_char_5_05_a', 2, { pos: [9, 8] });
  assert.equal(h.eventsOf('fx').filter((f) => f[1] === 'anchor').length, 0, 'not thrown yet');
  at(until(h, () => h.eventsOf('fx').some((f) => f[1] === 'anchor'), t0), 0.433, 'the throw');
  assert.equal(skillDmg(h, u).length, 0, 'it flies');
  at(until(h, () => skillDmg(h, u).length, t0), 0.433 + 3 / 15, 'the hit, 3 tiles out');
  assert.ok(e.s.flags.stun, 'and its stun');
  assert.equal(u.tileC, 5, 'he has not moved');
  at(until(h, () => u.tileC === 8, t0), 1, 'the 【移动】');
  checkInvariants(h.b);
});

test('锏 S3: the finisher on Skill_3_End\'s OnAttack, 0.333 s after the skill\'s time, in the skill\'s range', REAL, () => {
  const { h, u, e } = cast('chess_char_6_19_a', 2, { pos: [9, 6] });
  assert.ok(h.runUntil(() => !u.skill.active, 10));
  const end = h.b.time;
  const n = skillDmg(h, u).length;
  assert.ok(n > 0, 'the slashes');
  at(until(h, () => skillDmg(h, u).length > n, end), 0.333, 'the finisher');
  assert.equal(skillDmg(h, u).at(-1).target, e);
  checkInvariants(h.b);
});

test('歌蕾蒂娅 S3: the closing 捕网 on its FinalAttack\'s OnAttack, 0.367 s after the skill\'s time', REAL, () => {
  const { h, u, e } = cast('chess_char_4_12_a', 2, { pos: [9, 7] });
  assert.ok(h.runUntil(() => !u.skill.active, 40));
  const end = h.b.time;
  const pulls = () => h.eventsOf('fx').filter((f) => f[1] === 'pull').length;
  const n = pulls();
  at(until(h, () => pulls() > n, end), 0.367, 'the 捕网');
  assert.ok(e.alive);
  checkInvariants(h.b);
});

// ---- a stun ends the Skill state (`SkillState.OnTick`): what has not come yet is lost

test('a stun before the OnAttack loses the strike and what follows it: 仇白 S2, 瑕光 S2, 余 S3', REAL, () => {
  {
    const { h, u, e } = cast('chess_char_6_15_a', 1, { pos: [9, 6] });
    h.run(0.2);
    stun(h, u);
    h.run(2);
    assert.equal(skillDmg(h, u).length, 0, '仇白: no burst');
    assert.ok(!e.findBuff('sluggish'), '仇白: no 停顿');
    assert.ok(h.runUntil(() => !u.skill.active, 30));
    h.step();
    assert.equal(skillDmg(h, u).length, 0, '仇白: no closing burst, the mode never came');
    checkInvariants(h.b);
  }
  {
    const { h, u, e } = cast('chess_char_3_12_a', 1, { pos: [9, 5], units: [{ chessId: 'chess_char_1_04_a', row: 9, col: 6 }] });
    h.run(0.2);
    stun(h, u);
    h.run(2);
    assert.ok(!e.s.flags.sleep, '瑕光: no sleep');
    assert.ok(!h.unit('chess_char_1_04_a').findBuff(`blemsh:regen:${u.id}`), '瑕光: no regeneration');
    checkInvariants(h.b);
  }
  {
    const { h, u } = cast('chess_char_6_03_a', 2, { pos: [9, 6] });
    h.run(0.2);
    stun(h, u);
    h.run(2.5);
    assert.equal(u.mem.yuWall ?? null, null, '余: no wall');
    checkInvariants(h.b);
  }
});

test('a stun between the OnAttack and the clip\'s end keeps the strike and loses the rest: 瑕光 S2 sleeps, no regeneration; 乌尔比安 S3 hits, no 【移动】', REAL, () => {
  {
    const { h, u, e } = cast('chess_char_3_12_a', 1, { pos: [9, 5], units: [{ chessId: 'chess_char_1_04_a', row: 9, col: 6 }] });
    h.castStrike(u);
    assert.ok(e.s.flags.sleep);
    stun(h, u);
    h.run(1);
    assert.ok(!h.unit('chess_char_1_04_a').findBuff(`blemsh:regen:${u.id}`), 'no regeneration');
    checkInvariants(h.b);
  }
  {
    const { h, u } = cast('chess_char_5_05_a', 2, { pos: [9, 6] });
    h.castStrike(u);
    h.step(3);
    stun(h, u);
    h.run(1);
    assert.ok(skillDmg(h, u).length > 0, 'the anchor landed');
    assert.equal(u.tileC, 5, 'he stays');
    assert.ok(h.runUntil(() => !u.skill.active, 30));
    assert.equal(u.tileC, 5, 'nothing to return from');
    checkInvariants(h.b);
  }
});

test('a stun after the skill\'s time loses 锏 S3\'s finisher', REAL, () => {
  const { h, u } = cast('chess_char_6_19_a', 2, { pos: [9, 6] });
  assert.ok(h.runUntil(() => !u.skill.active, 10));
  const n = skillDmg(h, u).length;
  stun(h, u);
  h.run(1);
  assert.equal(skillDmg(h, u).length, n, 'no finisher');
  checkInvariants(h.b);
});

for (const [name, chessId, skillId, reached] of [
  ['余 S3', 'chess_char_6_03_a', 'skchr_yu_3', (u) => u.mem.yuWall],
]) {
  test(`the real match path: ${name}'s effect waits for its skill clip's end`, REAL, async () => {
    const { makeMatch, give } = await import('../match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
    const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    mh.toPrep(1);
    mh.setStage('act2autochess_m04');
    const m = mh.m, ps = mh.ps('p_0');
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const p = give(m, ps, chessId, 'hand');
    assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 9, col: 4 }, dir: 'RIGHT' }).ok, 'on the board');
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'ss', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    while (b.waveT0 == null) b.step();
    const u = b.allyUnits.find((x) => x.kind === 'op' && x.defId === chessId);
    assert.ok(u, 'in the battle');
    assert.equal(u.skill.id, skillId);
    assert.ok(u.skill.activate('test', { free: true }));
    const t0 = b.time, action = u.skill.castTiming().action;
    assert.ok(!reached(u), 'nothing as the cast starts');
    while (b.time < t0 + action - 2 * TICK) {
      b.step();
      assert.ok(!reached(u), `nothing before the clip's end: ${b.time - t0} s`);
    }
    for (let i = 0; i < 4; i++) b.step();
    assert.ok(reached(u), `at the clip's end, ${action} s`);
    assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
  });
}

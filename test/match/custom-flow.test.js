// test/match/custom-flow.test.js — the custom 규칙 모드's match-flow settings on the real match path (shared/ruleset.js,
// server/match/gamedata.js; maintainer decisions 2026-10-18): the bond picks and ban counts, the leader and stage bans,
// the round count (the custom round plan: every round-keyed table at its source round), the co-op prep length and the
// 目标生命值 rules (no per-round cap, one shared team LP and a leaver's part of it). Each draw keeps the official rng
// stream, so a ban moves only what it bans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { attachAudit } from '../../server/match/audit.js';
import { makeMatch } from './harness.js';

const custom = (c) => ({ preset: 'custom', custom: c });
/** A started match's setup draws. */
const setupOf = (m) => ({ stageId: m.stageId, factions: m.factions.join(), bossId: m.bossId, hiddenBossId: m.hiddenBossId, drawn: m.disabledBonds.join() });

test('custom with every official value: the same match as classic (draws, rounds, timers)', () => {
  for (const seed of [3, 11, 29]) {
    const a = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed, fake: true }).start();
    const b = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed, fake: true, ruleset: custom({}) }).start();
    assert.deepEqual(setupOf(b.m), setupOf(a.m));
    assert.equal(b.m.gd.plan, null);
    for (const r of [1, 3, 9, 14, 15]) {
      assert.equal(b.m.gd.prepTime(r), a.m.gd.prepTime(r));
      assert.deepEqual(b.m.gd.enemyScale(r), a.m.gd.enemyScale(r));
    }
    assert.equal(b.m.gd.lpCapPerRound, 10);
    assert.equal(b.m.publicView().srcRound, undefined);
    a.m.dispose();
    b.m.dispose();
  }
});

test('bonds: a banned bond is absent every match, an allowed one never; the counts come from the bonds left to the draw', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const off = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true }).start();
    const drawn = off.m.disabledBonds;
    const [allow, other] = [drawn[0], off.m.gd.bondIds.find((b) => !drawn.includes(b) && off.m.gd.bond(b).weight > 0 && off.m.gd.bond(b).isCore)];
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true, ruleset: custom({ bonds: { pick: { [allow]: 'allow', [other]: 'ban' } } }) }).start();
    const m = h.m;
    assert.ok(m.disabledBonds.includes(other), `seed ${seed}: the banned bond`);
    assert.ok(!m.disabledBonds.includes(allow), `seed ${seed}: never the allowed one`);
    const core = m.disabledBonds.filter((b) => b !== other && m.gd.bond(b).isCore).length;
    const addon = m.disabledBonds.filter((b) => b !== other && !m.gd.bond(b).isCore).length;
    assert.deepEqual([core, addon], [3, 4], `seed ${seed}: the difficulty's counts on top`);
    // the official absence: an operator that also has another bond still comes, one with only off bonds does not
    const offSet = new Set([...m.disabledBonds, ...m.staticInactiveBonds]);
    for (const id of m.gd.visibleChess) {
      const bonds = m.gd.chess(id).bonds || [];
      assert.equal(m.bannedChess.includes(id), bonds.length > 0 && bonds.every((b) => offSet.has(b)), id);
    }
    // the rest of the setup is the official draw
    const { drawn: _d, ...rest } = setupOf(m);
    const { drawn: _o, ...restOff } = setupOf(off.m);
    void _d; void _o;
    assert.deepEqual(rest, restOff);
    off.m.dispose();
    m.dispose();
  }
  // the counts: 0 / 0 leaves only the banned ones
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 4, fake: true, ruleset: custom({ bonds: { banCore: 0, banAddon: 0, pick: { yanShip: 'ban' } } }) }).start();
  assert.deepEqual(h.m.disabledBonds, ['yanShip']);
  assert.deepEqual(h.m.publicView().drawnDisabledBonds, ['yanShip']);
  h.m.dispose();
});

test('leaders and stages: the banned ones are never drawn, one of each group always stays', () => {
  const pool = ['boss_1', 'boss_2', 'boss_3', 'boss_4', 'boss_5', 'boss_6'];
  const stages = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 1, fake: true }).m.gd.mode.stages;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed, fake: true,
      ruleset: custom({ bosses: { ban: [...pool, 'boss_8', 'boss_9'] }, stages: { ban: stages.slice(1) } }) }).start();
    assert.equal(h.m.bossId, 'boss_7');
    assert.equal(h.m.hiddenBossId, 'boss_10');
    assert.equal(h.m.stageId, stages[0]);
    h.m.dispose();
  }
  // every leader / stage banned (a hand-made code): the official pools
  const all = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 9, fake: true, ruleset: custom({ bosses: { ban: [...pool, 'boss_7'] }, stages: { ban: stages } }) }).start();
  const off = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, seed: 9, fake: true }).start();
  assert.deepEqual(setupOf(all.m), setupOf(off.m));
  all.m.dispose();
  off.m.dispose();
});

test('rounds: fewer or more rounds follow the custom round plan — waves, timers, 机变 and stats at the source round', () => {
  const off = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed: 5, fake: true }).start();
  const og = off.m.gd;
  for (const [n, src, sp] of [
    [6, [1, 3, 9, 11, 13, 14, 15], [2, 3, 4]],
    [20, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 11, 12, 13, 11, 12, 13, 14, 15], [3, 9, 11]],
  ]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 1, bots: 2, seed: 5, fake: true, ruleset: custom({ flow: { rounds: n } }) });
    const m = h.m;
    const gd = m.gd;
    assert.deepEqual([gd.lastRound, gd.bossRound, gd.hiddenRound], [n, n, n + 1]);
    assert.deepEqual(Array.from({ length: n + 1 }, (_, i) => gd.srcRound(i + 1)), src);
    assert.deepEqual(gd.spRounds(), sp);
    for (let r = 1; r <= n + 1; r++) {
      const s = src[r - 1];
      assert.equal(gd.roundCfg(r), og.roundCfg(s), `R${r}: config of R${s}`);
      assert.equal(gd.prepTime(r), og.prepTime(s));
      assert.equal(gd.combatTimeLimit(r), og.combatTimeLimit(s));
      assert.equal(gd.income(r), og.income(s));
      if (r <= 13 || n < 14) assert.deepEqual(gd.enemyScale(r), og.enemyScale(s), `R${r}: stats of R${s}`);
    }
    if (n === 20) {
      // the added rounds rise on from R13 by the slope of R11–R13 (customRoundPlan), the final rounds as much
      assert.ok(gd.enemyScale(14).hpMul > og.enemyScale(13).hpMul);
      assert.ok(gd.enemyScale(19).hpMul > gd.enemyScale(16).hpMul);
      assert.ok(gd.enemyScale(20).hpMul > og.enemyScale(14).hpMul);
    }
    const audit = attachAudit(m);
    h.start();
    const seen = new Map();
    h.drive(() => {
      if (m.phase === PHASE.PREP && !seen.has(m.round)) seen.set(m.round, m.publicView());
      return h.ended != null;
    }, { maxSteps: 4e6 });
    assert.ok(h.ended, 'the match ended');
    assert.equal(m.errorCount, 0);
    assert.deepEqual(audit.violations, []);
    for (const [r, pub] of seen) {
      assert.equal(pub.lastRound, n);
      assert.equal(pub.bossRound, n);
      assert.equal(pub.srcRound, src[r - 1], `m.public.srcRound R${r}`);
    }
    m.dispose();
  }
  off.m.dispose();
});

test('prep: a co-op custom prep length (×1.5, ×2, fixed); 独立模拟 stays untimed', () => {
  for (const [prep, want] of [['x1.5', (p) => Math.round(p * 1.5)], ['x2', (p) => p * 2], ['fixed', () => 45]]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seed: 7, fake: true, ruleset: custom({ flow: { prep, prepSec: 45 } }) }).start();
    const m = h.m;
    h.toPrep(1);
    const official = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seed: 7, fake: true }).m.gd.prepTime(1);
    assert.equal(m.gd.prepTime(1), want(official), prep);
    assert.equal(m.publicView().prepSeconds, want(official));
    assert.equal(Math.round((m.deadline - m.sched.now()) / 1000), want(official), `${prep}: the deadline`);
    m.dispose();
  }
  const solo = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 7, fake: true, ruleset: custom({ flow: { prep: 'x2' } }) }).start();
  assert.equal(solo.m.gd.prepTime(1), null);
  solo.m.dispose();
});

const leakAll = (n) => (b) => (b.kind === 'normal' ? { leaks: Object.fromEntries(b.players.map((p) => [p, n])) } : {});

test('目标生命值: no per-round cap under 「解除上限」 (co-op only)', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seed: 921, fake: true, script: leakAll(15), ruleset: custom({ flow: { lpCapOff: true } }) }).start();
  const m = h.m;
  const audit = attachAudit(m);
  h.toPrep(1);
  const lp0 = h.ps('p_0').lp;
  h.drive(() => m.phase === PHASE.PREP && m.round === 2);
  assert.equal(h.ps('p_0').lp, lp0 - 15);
  assert.deepEqual(audit.violations, []);
  m.dispose();
  const solo = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 921, fake: true, ruleset: custom({ flow: { lpCapOff: true } }) });
  assert.equal(solo.m.gd.lpCapPerRound, 10, '独立模拟 keeps the cap');
  solo.m.dispose();
});

test('目标生命值: one team LP in every round under 「共享」 — charges come off it, nobody falls alone, 0 takes everyone', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, bots: 2, seed: 921, fake: true, script: leakAll(3), ruleset: custom({ flow: { lpShared: true } }) }).start();
  const m = h.m;
  const audit = attachAudit(m);
  h.toPrep(1);
  const start = m.order.reduce((s, p) => s + p.lpStart, 0);
  assert.equal(m.teamLp, start, 'the starting LPs added up');
  assert.equal(m.publicView().teamLp, start);
  h.drive(() => m.phase === PHASE.PREP && m.round === 2);
  assert.equal(m.teamLp, start - 4 * 3, 'every player\'s 3 off the one pool');
  assert.equal(m.order.reduce((s, p) => s + p.lp, 0), m.teamLp, 'the players hold shares of it');
  assert.equal(m.publicView().players.find((p) => p.playerId === 'p_0').lp, h.ps('p_0').lp);
  assert.deepEqual(audit.violations, []);
  // a share at 0 does not eliminate: the pool decides
  for (const p of m.order) p.lp = p === h.ps('p_0') ? m.teamLp : 0;
  h.drive(() => m.phase === PHASE.PREP && m.round === 3);
  assert.ok(m.order.every((p) => p.alive), 'nobody alone');
  m.teamLp = 5;
  h.drive(() => h.ended != null);
  assert.ok(m.order.every((p) => !p.alive && p.eliminatedRound === 3), 'all of them at 0');
  assert.equal(h.ended.victory, false);
  // (the pool set by hand above: the auditor's own LP checks are not asked about these rounds)
  m.dispose();
});

test('目标生命值 「共享」: a leaver takes the pool × its starting LP ÷ the starting LPs of the seats still in (rounded)', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, seed: 5, fake: true, ruleset: custom({ flow: { lpShared: true } }) }).start();
  const m = h.m;
  h.toPrep(1);
  for (const p of m.order) { p.lpStart = 28; p.lpAtFinal = 28; }
  m.teamLp = 60;
  m.onLeave('p_3');
  assert.equal(m.teamLp, 45, '60 × 28 / 112 = 15 off');
  assert.equal(h.ps('p_3').alive, false);
  assert.equal(m.alivePlayers().reduce((s, p) => s + p.lp, 0), 45);
  m.dispose();
  // the official Final Assault keeps the pool whole
  const off = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 4, seed: 5, fake: true }).start();
  off.toPrep(1);
  assert.equal(off.m.teamLp, null);
  off.m.dispose();
});

test('a whole custom co-op match (8 rounds, shared LP without a cap, ×1.5 prep) runs to its end with no audit violation', () => {
  for (const seed of [41, 42]) {
    const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, bots: 2, seed, fake: true, script: leakAll(1),
      ruleset: custom({ flow: { rounds: 8, lpShared: true, lpCapOff: true, prep: 'x1.5' }, bonds: { pick: { yanShip: 'ban' } } }) });
    const m = h.m;
    const audit = attachAudit(m);
    h.start();
    let finalTeam = null;
    h.drive(() => { if (m.phase === PHASE.FINAL_ASSAULT && finalTeam == null) finalTeam = m.teamLp; return h.ended != null; }, { maxSteps: 4e6 });
    assert.ok(h.ended);
    assert.equal(m.errorCount, 0);
    assert.deepEqual(audit.violations, []);
    assert.ok(finalTeam > 0, 'the Final Assault took the shared pool');
    m.dispose();
  }
});

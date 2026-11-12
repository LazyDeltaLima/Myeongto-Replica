// 规程's avatar badges (docs/rules/ui.md 「규정 HUD 새 요소」): the season's table constants, the 完美连胜
// count (server/match/match/settle.js → m.public players[].winStreak), the boss-damage share and top operator
// (views.js _badgeView bossPct / bossTop; the battle's bossTopUnits, b.progress `top`), and the page's step reading
// (ui/avatarBadges.js) and bond phase (ui/bondStrip.js bondPhaseOf). Through the real match path where a match is needed
// (test/match/harness.js → Match on the season's own data, fake battles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { bossTopUnits, battleProgress } from '../../server/sim/spec.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const BASE = hasGeneratedData() ? getData({ log: quiet }) : null;
const { stepOf, bossStep, streakStep } = await import('../../public/js/ui/avatarBadges.js');
const { bondPhaseOf } = await import('../../public/js/ui/bondStrip.js');

function coop(data, season, script = undefined) {
  return makeMatch({
    mode: 'coop', modeId: 'mode_multi_normal', difficulty: 'NORMAL', seed: 5, fake: true, data, season, script,
    seats: [
      { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
    ],
  });
}
const rowOf = (h, id) => h.m.publicView().players.find((p) => p.playerId === id);

test('the constants come from the season\'s table: 规程 has them, 盟约 none', REAL, () => {
  const c = ACT3.config.constants;
  assert.deepEqual(c.winStreakThresholds, [3, 5]);
  assert.deepEqual(c.bossDamageThresholds, [0.2, 0.5, 0.8]);
  assert.deepEqual(c.bossDamageRowThresholds, [30, 60, 100]);
  assert.equal(c.bossDamageStatsDelay, 5);
  for (const k of ['winStreakThresholds', 'bossDamageThresholds', 'bossDamageRowThresholds', 'bossDamageStatsDelay']) {
    assert.equal(BASE.config.constants[k], undefined, `盟约 has no ${k}`);
  }
});

test('完美连胜 counts the perfect rounds in a row; a round with a counted leak starts over', REAL, () => {
  // P1 leaks once in round 2
  const script = (b) => (b.kind === 'normal' && b.round === 2 && b.players.includes('p_1') ? { leaks: { p_1: 1 } } : null);
  const h = coop(ACT3, 'act3autochess', script).start();
  h.toPrep(2);
  assert.equal(rowOf(h, 'p_0').winStreak, 1);
  assert.equal(rowOf(h, 'p_1').winStreak, 1);
  h.toPrep(3);
  assert.equal(rowOf(h, 'p_0').winStreak, 2);
  assert.equal(rowOf(h, 'p_1').winStreak, undefined, 'the leak round reset it (0 is not sent)');
  assert.equal(h.ps('p_1').winStreak, 0);
  h.toPrep(4);
  assert.equal(rowOf(h, 'p_0').winStreak, 3);
  assert.equal(rowOf(h, 'p_1').winStreak, 1);
  // the delta broadcast carries it (the browser's merged m.public)
  h.flushAll();
  assert.equal(h.lastBc('m.public').players.find((p) => p.playerId === 'p_0').winStreak, 3);
});

test('盟约 sends no badge numbers (its table has no thresholds)', REAL, () => {
  const h = coop(BASE, undefined).start();
  h.toPrep(3);
  assert.equal(h.ps('p_0').winStreak, 2, 'counted all the same');
  assert.equal(rowOf(h, 'p_0').winStreak, undefined);
});

test('a boss round: the share of the leader in whole percent, floored, and each player\'s top operator', REAL, () => {
  const h = coop(ACT3, 'act3autochess').start();
  h.toPrep(2);
  const { m } = h;
  m.phase = PHASE.FINAL_ASSAULT;
  m.bossPool = { maxHp: 1000, byPlayer: new Map([['p_0', 199.9], ['p_1', 800]]) };
  m.fields = [{ fieldId: 'f0', kind: 'boss', players: ['p_0', 'p_1'], cc: true, bossTop: { p_0: 'chess_a', p_1: 'chess_b' } }];
  const badge = (id) => m._badgeView(h.ps(id));
  assert.deepEqual([badge('p_0').bossPct, badge('p_0').bossTop], [19, 'chess_a'], '199.9 of 1000 is not yet the 20 % step');
  assert.deepEqual([badge('p_1').bossPct, badge('p_1').bossTop], [80, 'chess_b']);
  m.phase = PHASE.PREP;
  assert.equal(badge('p_0').bossPct, undefined, 'only in a boss round');
});

test('the top operator against the leader: summons count for their board piece; b.progress carries it', () => {
  const piece = (uid, defId, boss) => ({ uid, defId, stats: { boss } });
  const a = piece(1, 'chess_a', 5);
  const b = piece(2, 'chess_b', 3);
  const summon = { uid: null, defId: 'token_x', ownerUnit: b, stats: { boss: 4 } };
  const battle = { kind: 'boss', players: [{ playerId: 'p_0', units: [a, b, summon] }, { playerId: 'p_1', units: [piece(3, 'chess_c', 0)] }] };
  assert.deepEqual(bossTopUnits(battle), { p_0: 'chess_b' }, 'b 3 + its summon 4 beat a 5; a player who dealt nothing is left out');
  assert.equal(bossTopUnits({ players: [] }), null);
  assert.deepEqual(battleProgress({ ...battle, time: 1, killed: 0, total: 0, _perPlayer: {} }).top, { p_0: 'chess_b' });
  assert.equal(battleProgress({ kind: 'normal', players: battle.players, time: 1, _perPlayer: {} }).top, undefined, 'boss fields only');
  assert.equal(validateC2S({ t: 'b.progress', battleId: 'b1', gt: 1, killed: 0, total: 0, top: { p_0: 'chess_b' } }), null);
  assert.equal(validateC2S({ t: 'b.progress', battleId: 'b1', gt: 1, killed: 0, total: 0, top: { p_0: 7 } }), 'bad field top');
});

test('the page\'s steps: streak 3 / 5, boss glow 20 / 50 / 80 %, list rows 30 / 60 / 100; bond phase only with two thresholds', () => {
  assert.deepEqual([2, 3, 4, 5, 9].map((n) => streakStep(n, [3, 5])), [0, 1, 1, 2, 2]);
  assert.deepEqual([19, 20, 49, 50, 80].map((p) => bossStep(p, [0.2, 0.5, 0.8])), [0, 1, 1, 2, 3]);
  assert.deepEqual([29, 30, 60, 100].map((p) => stepOf(p, [30, 60, 100])), [0, 1, 2, 3]);
  assert.equal(streakStep(5, undefined), 0);
  assert.equal(bondPhaseOf({ active: true, tier: 2 }, [3, 6]), 2);
  assert.equal(bondPhaseOf({ active: true, tier: 1 }, [2, 3]), 1);
  assert.equal(bondPhaseOf({ active: true, tier: 1 }, [2]), 0, '独行: one threshold, no mark (official CN screen)');
  assert.equal(bondPhaseOf({ active: false, tier: 0 }, [3, 6]), 0);
});

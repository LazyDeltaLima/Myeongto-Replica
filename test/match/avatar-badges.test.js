// 规程's avatar badges (docs/rules/ui.md 「규정 HUD 새 요소」): the season's table constants, the 完美连胜
// count (server/match/match/settle.js → m.public players[].winStreak), the boss-damage share and the leader ranking
// (views.js _badgeView bossPct, _leaderTopView m.public leaderTop; the battle's bossTopUnits, b.progress `top`), and the page's step reading
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

test('a boss round: the share of the leader in whole percent, floored, and the leader ranking\'s operator rows', REAL, () => {
  const h = coop(ACT3, 'act3autochess').start();
  h.toPrep(2);
  const { m } = h;
  m.phase = PHASE.FINAL_ASSAULT;
  m.bossPool = { maxHp: 1000, byPlayer: new Map([['p_0', 199.9], ['p_1', 800]]) };
  m.fields = [{ fieldId: 'f0', kind: 'boss', players: ['p_0', 'p_1'], cc: true, bossTop: {
    // p_0's page counted more than the pool credited it: the rows scale down to 199.9 (×0.5)
    p_0: { s: 399.8, r: [['chess_a', 300], ['chess_c', 99.8]] },
    p_1: { s: 800, r: [['chess_b', 500], ['chess_d', 290], ['chess_e', 10]] },
  } }];
  const badge = (id) => m._badgeView(h.ps(id));
  assert.equal(badge('p_0').bossPct, 19, '199.9 of 1000 is not yet the 20 % step');
  assert.equal(badge('p_1').bossPct, 80);
  assert.equal(badge('p_0').bossTop, undefined, 'the rows are the match\'s list now, not one per player');
  assert.deepEqual(m._leaderTopView(), [
    { pid: 'p_1', chess: 'chess_b', pct: 50 },
    { pid: 'p_1', chess: 'chess_d', pct: 29 },
    { pid: 'p_0', chess: 'chess_a', pct: 15 },
  ], 'the match\'s top 3 operators, one player in two rows (the official recording); p_0\'s 300 scaled to its credited 150');
  m.bossPool.byPlayer.set('p_0', 1);
  m.fields[0].bossTop.p_1 = { s: 0.4, r: [['chess_b', 0.4]] };
  m.bossPool.byPlayer.set('p_1', 0.4);
  assert.deepEqual(m._leaderTopView().map((r) => r.pct), [1, 1, 1], 'a listed operator shows at least 1 %');
  h.ps('p_1').alive = false;
  assert.deepEqual(m._leaderTopView().map((r) => r.pid), ['p_0', 'p_0'], 'alive players only');
  m.phase = PHASE.PREP;
  assert.equal(badge('p_0').bossPct, undefined, 'only in a boss round');
  assert.equal(m._leaderTopView(), null);
});

test('the leader ranking on the real match path: a client-run boss field\'s b.progress `top` reaches m.public leaderTop', REAL, () => {
  const h = makeMatch({
    mode: 'coop', modeId: 'mode_multi_normal', difficulty: 'NORMAL', seed: 7, fake: true, data: ACT3, season: 'act3autochess',
    clientCombat: true, instant: false, script: (b) => (b.kind === 'boss' ? { bossDps: 0 } : { duration: 2 }),
    seats: [
      { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
    ],
  }).start();
  const { m } = h;
  h.autoHumans();
  h.drive(() => m.phase === PHASE.FINAL_ASSAULT);
  const f = m.fields.find((x) => x.kind === 'boss' && x.mode === 'client');
  assert.ok(f, 'a client-run boss field');
  h.sched.advance(3000); // the field clock's budget (a report is credited only up to it)
  const top = { p_0: { s: 150, r: [['chess_a', 100], ['chess_b', 50]] }, p_1: { s: 60, r: [['chess_c', 60]] } };
  const msg = { t: 'b.progress', battleId: f.battleId, gt: 3, killed: 0, total: 0, bossDmg: 210, by: { p_0: 150, p_1: 60 }, top };
  assert.equal(validateC2S(msg), null);
  assert.deepEqual(m.handle(f.authority, msg), { ok: true });
  const credited = (pid) => m.bossPool.byPlayer.get(pid) || 0;
  assert.ok(credited('p_0') > 0, 'the pool credited the report');
  const rows = m.publicView().leaderTop;
  assert.ok(Array.isArray(rows) && rows.length === 3, `three rows (${JSON.stringify(rows)})`);
  assert.deepEqual(rows.map((r) => r.chess), ['chess_a', 'chess_c', 'chess_b'], 'by damage: 100, 60, 50');
  assert.ok(rows[0].pct >= rows[1].pct && rows[1].pct >= rows[2].pct, 'most first');
  assert.equal(rows.filter((r) => r.pid === 'p_0').length, 2, 'one player in two rows');
  m.dispose?.();
});

test('盟约 sends no leader ranking (its table has no thresholds)', REAL, () => {
  const h = coop(BASE, undefined).start();
  h.toPrep(2);
  const { m } = h;
  m.phase = PHASE.FINAL_ASSAULT;
  m.bossPool = { maxHp: 1000, byPlayer: new Map([['p_0', 500]]) };
  m.fields = [{ fieldId: 'f0', kind: 'boss', players: ['p_0', 'p_1'], cc: true, bossTop: { p_0: { s: 500, r: [['chess_a', 500]] } } }];
  assert.equal(m._leaderTopView(), null);
});

test('the operators against the leader: summons count for their board piece, top 3 per player; b.progress carries them', () => {
  const piece = (uid, defId, boss) => ({ uid, defId, stats: { boss } });
  const a = piece(1, 'chess_a', 5);
  const b = piece(2, 'chess_b', 3);
  const summon = { uid: null, defId: 'token_x', ownerUnit: b, stats: { boss: 4 } };
  const more = [piece(4, 'chess_f', 2), piece(5, 'chess_g', 2.4), piece(6, 'chess_h', 0.2)];
  const battle = { kind: 'boss', players: [{ playerId: 'p_0', units: [a, b, summon, ...more] }, { playerId: 'p_1', units: [piece(3, 'chess_c', 0)] }] };
  const p0 = { s: 17, r: [['chess_b', 7], ['chess_a', 5], ['chess_g', 2]] };
  assert.deepEqual(bossTopUnits(battle), { p_0: p0 },
    'b 3 + its summon 4 beat a 5; 2.4 beats 2 before rounding; the whole is every unit\'s; a player who dealt nothing is left out');
  assert.equal(bossTopUnits({ players: [] }), null);
  assert.deepEqual(battleProgress({ ...battle, time: 1, killed: 0, total: 0, _perPlayer: {} }).top, { p_0: p0 });
  assert.equal(battleProgress({ kind: 'normal', players: battle.players, time: 1, _perPlayer: {} }).top, undefined, 'boss fields only');
  const progress = (top) => validateC2S({ t: 'b.progress', battleId: 'b1', gt: 1, killed: 0, total: 0, top });
  assert.equal(progress({ p_0: p0 }), null);
  assert.equal(progress({ p_0: 'chess_b' }), null, 'a page from before the operator rows is not refused (its value is ignored)');
  assert.equal(progress({ p_0: 7 }), 'bad field top');
  assert.equal(progress({ p_0: { s: 1, r: [['chess_a', 1], ['chess_b', 1], ['chess_c', 1], ['chess_d', 1]] } }), 'bad field top', 'at most 3 rows');
  assert.equal(progress({ p_0: { s: 1, r: [['chess_a', -1]] } }), 'bad field top');
});

test('the page\'s steps: streak 3 / 5, boss glow 20 / 50 / 80 %, list rows 30 / 60 / 100', () => {
  assert.deepEqual([2, 3, 4, 5, 9].map((n) => streakStep(n, [3, 5])), [0, 1, 1, 2, 2]);
  assert.deepEqual([19, 20, 49, 50, 80].map((p) => bossStep(p, [0.2, 0.5, 0.8])), [0, 1, 1, 2, 3]);
  assert.deepEqual([29, 30, 60, 100].map((p) => stepOf(p, [30, 60, 100])), [0, 1, 2, 3]);
  assert.equal(streakStep(5, undefined), 0);
});

test('规程 bond phase: the table\'s phaseType + bondPhaseCountList, by members or by stacks (official CN screens)', { skip: !ACT3 }, () => {
  const rule = (id) => ACT3.bonds[id].phase;
  const on = (o) => ({ active: true, count: 0, layers: 0, ...o });
  // stack-counted: 远见 [80, 150], 奇迹 / 投资人 [0, 100], 灵巧 [0, 40]
  assert.equal(bondPhaseOf(on({ count: 2, layers: 12 }), rule('visiShip')), 0, '远见 12 stacks: no mark');
  assert.equal(bondPhaseOf(on({ count: 2, layers: 999 }), rule('visiShip')), 2, '远见 999: Ⅱ');
  assert.equal(bondPhaseOf(on({ count: 2, layers: 267 }), rule('miraShip')), 2, '奇迹 267: Ⅱ');
  assert.equal(bondPhaseOf(on({ count: 3, layers: 382 }), rule('investShip')), 2, '投资人 382: Ⅱ');
  assert.equal(bondPhaseOf(on({ count: 2, layers: 0 }), rule('skillfulShip')), 1, '灵巧 from 0 stacks: Ⅰ');
  assert.equal(bondPhaseOf(on({ count: 2, layers: 40 }), rule('skillfulShip')), 2);
  // member-counted: 乌萨斯 [3, 6] 6 and 8 members Ⅱ, 绝技 [2, 5], 奥术 [2, 3] Ⅰ; 独行 none
  assert.equal(bondPhaseOf(on({ count: 8, layers: 500 }), rule('ursusShip')), 2);
  assert.equal(bondPhaseOf(on({ count: 2, layers: 500 }), rule('suntShip')), 1);
  assert.equal(bondPhaseOf(on({ count: 2 }), rule('arcaneShip')), 1);
  assert.equal(bondPhaseOf(on({ count: 1, layers: 99 }), rule('soloShip')), 0, '独行: no phase (official CN screen)');
  assert.equal(bondPhaseOf({ active: false, count: 2, layers: 999 }, rule('visiShip')), 0, 'an inactive bond: no mark');
  // the six stack-counted bonds of the table, and no other
  const byLayers = Object.keys(ACT3.bonds).filter((id) => ACT3.bonds[id].phase?.by === 'layers').sort();
  assert.deepEqual(byLayers, ['investShip', 'miraShip', 'raidShip', 'skillfulShip', 'swiftShip', 'visiShip']);
  // a direction switch's effect has its own (炎 's other direction counts 3 / 6 / 9 members)
  assert.deepEqual(ACT3.effects.bondeffect_yan.phase, { by: 'members', at: [3, 6, 9] });
});

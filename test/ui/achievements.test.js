// 成就统计 (screens/achievements.js, after upstream 0.3.3) and the hub card's level (ui/level.js):
//   - a compacted record keeps what they read: the active bond ids, the trophies and the 卫戍认证 reward; the storage
//     budget keeps the record of the highest bond layers whole (its lineup is drawn)
//   - highestBondRecord: the settled, full record whose own active bond has the most layers
//   - aggregateStats: the trophies of settled 同盟模拟 matches only, per mode games / wins / hidden clears, the
//     single-match maxima, how often each bond was active at the settlement
//   - strategyBadgeIds: won at least victorCount times, 入门协议 not counted; trophyMedalOf: the highest medal reached
//   - the level: config.rewards.milestones are cumulative; the daily bonus once per day that reached the goal
//   - recordsOfSeason: one season's records
//   - the hub card and its short-screen plate open the window; the card shows the LV (source contract)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compactRecord, normalizeRecord, fitToBudget, highestBondRecord, aggregateStats, strategyBadgeIds, trophyMedalOf,
  recordsOfSeason, selfRowOf, bondMemberChess,
} from '../../public/js/ui/stats.js';
import { levelOf, dailyPointsFor, certTotal, dayKey } from '../../public/js/ui/level.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const config = JSON.parse(read('data/config.json'));

const row = (over = {}) => ({
  playerId: 'me', name: '박사', victory: true, roundsPassed: 14, bandId: 'band_amiya', title: { id: 'comment_1' }, trophies: 5, reward: 300,
  lineup: [{ id: 'chess_x', tier: 6, items: [] }],
  bonds: [{ bondId: 'yanShip', layers: 30, active: true }, { bondId: 'abyssShip', layers: 5, active: false }],
  stats: { gold: 150, merges: 12, kills: 200 },
  ...over,
});
const rec = (i, over = {}, rowOver = {}) => normalizeRecord({
  id: `r${i}`, t: 1_700_000_000_000 + i * 60_000, end: 'settled', victory: true, roundsPassed: 14, difficulty: 'HARD', roomMode: 'coop',
  selfId: 'me', modeId: 'mode_multi_hard', players: [row(rowOver)], ...over,
});

test('a compacted record keeps the active bond ids, the trophies and the reward; normalize keeps them', () => {
  const c = compactRecord(rec(1));
  const self = c.players[0];
  assert.deepEqual(self.usedBondIds, ['yanShip']);
  assert.equal(self.trophies, 5);
  assert.equal(self.reward, 300);
  const back = normalizeRecord(c);
  assert.deepEqual(selfRowOf(back).usedBondIds, ['yanShip']);
  assert.equal(JSON.stringify(compactRecord(back)), JSON.stringify(c), 'idempotent');
  assert.equal(aggregateStats([back]).bonds.yanShip.games, 1, 'a compacted record still counts its bonds');
});

test('the storage budget keeps the record of the highest bond layers whole', () => {
  // newest first: the peak is the oldest, far past the full ones
  const records = Array.from({ length: 60 }, (_, i) => rec(100 - i, {}, { bonds: [{ bondId: 'yanShip', layers: i === 59 ? 999 : 10, active: true }] }));
  const fit = fitToBudget(records);
  const peak = fit.find((r) => r.id === 'r41');
  assert.ok(peak && !peak.compact, 'the peak stays a full record');
  assert.ok(fit.find((r) => r.id === 'r42').compact, 'its neighbour is compacted');
});

test('highestBondRecord: the settled full record whose own active bond has the most layers', () => {
  const a = rec(1, {}, { bonds: [{ bondId: 'yanShip', layers: 40, active: true }] });
  const b = rec(2, {}, { bonds: [{ bondId: 'abyssShip', layers: 90, active: false }, { bondId: 'lgdShip', layers: 50, active: true }] });
  const quit = rec(3, { end: 'quit' }, { bonds: [{ bondId: 'yanShip', layers: 500, active: true }] });
  const compact = compactRecord(rec(4, {}, { bonds: [{ bondId: 'yanShip', layers: 400, active: true }] }));
  const best = highestBondRecord([a, b, quit, compact]);
  assert.equal(best.record.id, 'r2');
  assert.equal(best.bond.bondId, 'lgdShip');
  assert.equal(highestBondRecord([]), null);
});

test('aggregateStats: co-op trophies, per mode, the single-match maxima and the bonds used', () => {
  const agg = aggregateStats([
    rec(1, { hiddenCleared: true }),
    rec(2, { roomMode: 'solo' }, { trophies: 9, stats: { gold: 400, merges: 3, kills: 50 } }),
    rec(3, { victory: false }, { victory: false, stats: { gold: 10, merges: 40, kills: 900 } }),
    rec(4, { end: 'quit', victory: false }, { victory: false, roundsPassed: 3, trophies: 9 }),
  ]);
  assert.equal(agg.trophies, 10, 'the settled 同盟模拟 matches only');
  assert.deepEqual(agg.modes.coop, { games: 3, wins: 1, hiddenCleared: 1 });
  assert.deepEqual(agg.modes.solo, { games: 1, wins: 1, hiddenCleared: 0 });
  assert.deepEqual(agg.maxima, { gold: 400, merges: 40, kills: 900 });
  assert.equal(agg.bonds.yanShip.games, 3, 'active at the settlement, once a match');
  assert.equal(agg.bonds.abyssShip, undefined, 'an inactive bond is not counted');
  assert.equal(agg.byMode.coop, 3, 'the statistics page\'s counts stay');
});

test('strategyBadgeIds: won with a strategy at least its victorCount times; 入门协议 counts nothing', () => {
  const bands = { band_amiya: { bandId: 'band_amiya', sortId: 2, victorCount: 2 }, band_x: { bandId: 'band_x', sortId: 1, victorCount: 1 } };
  const records = [rec(1), rec(2, { difficulty: 'TRAINING' }), rec(3, { victory: false }, { victory: false })];
  assert.deepEqual(strategyBadgeIds(records, bands), []);
  assert.deepEqual(strategyBadgeIds([...records, rec(4)], bands), ['band_amiya']);
});

test('trophyMedalOf: the highest medal reached, whatever the order of the table', () => {
  const medals = config.trophies.medals;
  assert.equal(trophyMedalOf(0, medals).iconId, 'trophy_level1_icon');
  assert.equal(trophyMedalOf(29, [...medals].reverse()).iconId, 'trophy_level2_icon');
  assert.equal(trophyMedalOf(1000, medals).iconId, 'trophy_level5_icon');
});

test('the level: cumulative milestones; the daily bonus once per day that reached the goal', () => {
  const ms = config.rewards.milestones;
  assert.ok(ms.length >= 10 && ms[0].level === 1);
  assert.deepEqual(levelOf(0, ms), { lv: 0, into: 0, need: ms[0].tokens, max: false });
  assert.equal(levelOf(ms[1].tokens, ms).lv, 2);
  assert.equal(levelOf(ms.at(-1).tokens + 5, ms).max, true);
  const { daily, baseByRoundsPassed: table } = config.rewards;
  assert.equal(daily.need, 200);
  assert.equal(dailyPointsFor(14, table), table.findLast((r) => r.round <= 14).dailyPoint);
  assert.equal(dailyPointsFor(0, table), 0);
  // ten rounds passed are worth 100: two matches on one day reach the goal (200), one on the next does not
  const day = new Date(2026, 10, 8, 12).getTime();
  const r10 = { roundsPassed: 10 };
  const records = [rec(1, { t: day }, r10), rec(2, { t: day + 60_000 }, r10), rec(3, { t: day + 86_400_000 }, r10), rec(4, { t: day, end: 'quit' }, r10)];
  assert.equal(dayKey(day), dayKey(day + 60_000));
  assert.equal(certTotal(records, config.rewards, selfRowOf, day + 2 * 86_400_000), 3 * 300 + daily.bonus);
});

test('recordsOfSeason: the season\'s records (the default season has no field)', () => {
  const list = [rec(1), rec(2, { season: 'next' })];
  assert.deepEqual(recordsOfSeason(list, 'next').map((r) => r.id), ['r2']);
  assert.equal(recordsOfSeason(list, null).length, 2);
});

test('bondMemberChess: one per operator and tier, no golden / 自选 records, by tier', () => {
  const chess = [
    { chessId: 'b', charId: 'c2', tier: 2, bonds: ['yanShip'] }, { chessId: 'a', charId: 'c1', tier: 1, bonds: ['yanShip'] },
    { chessId: 'a2', charId: 'c1', tier: 1, bonds: ['yanShip'] }, { chessId: 'g', charId: 'c3', tier: 1, isGolden: true, bonds: ['yanShip'] },
    { chessId: 'd', charId: 'c4', tier: 6, isDiy: true, bonds: ['yanShip'] }, { chessId: 'o', charId: 'c5', tier: 1, bonds: ['lgdShip'] },
  ];
  assert.deepEqual(bondMemberChess(chess, 'yanShip').map((c) => c.chessId), ['a', 'b']);
});

test('the hub opens 成就统计 from the card and the short-screen plate; the card shows the LV (source contract)', () => {
  const lobby = read('public/js/screens/lobby.js');
  assert.match(lobby, /import \{ AchievementDialog \} from '\.\/achievements\.js';/);
  assert.match(lobby, /<\$\{AchievementCard\} onOpen=\$\{\(\) => setAchOpen\(true\)\}/);
  assert.match(lobby, /label=\$\{t\('成就统计'\)\} onClick=\$\{\(\) => setAchOpen\(true\)\}/);
  assert.match(lobby, /\$\{achOpen \? html`<\$\{AchievementDialog\} onClose=\$\{closeAch\} \/>` : null\}/);
  assert.match(lobby, /<b class="hub-ach__lv num">LV\.\$\{lv\}<\/b>/);
  assert.match(read('public/index.html'), /<link rel="stylesheet" href="\/css\/screens\/achievements\.css" \/>/);
  const win = read('public/js/screens/achievements.js');
  assert.match(win, /const more = \(\) => \{ onClose\(\); openStats\(\); \};/, '查看完整统计 opens 统计数据');
  assert.doesNotMatch(win, /saveStats|savePref|net\./, 'read-only');
});

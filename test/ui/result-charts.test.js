// The result screen's 伤害 / 联防 tabs as data (public/js/ui/gameLogic/resultCharts.js; maintainer decisions 2026-10-12):
// player colors (the chat faction's own color, seat order decides a clash, defaults validated as a set, the spare violet),
// the damage ranking by either column, the leader pool of a round choice, the 联防 flows, and the stored match record
// (public/js/ui/stats.js) keeping what the tabs need for the stats page's re-view.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playerColors, colorDistance, DEFAULT_PLAYER_COLORS, SPARE_PLAYER_COLORS, MIN_COLOR_DE, damageRanking, playerSum, leaderPool,
  uniteFlows, hasUnitCharts, normalizeResult,
} from '../../public/js/ui/gameLogic.js';
import { buildRecord, recordToResult, compactRecord } from '../../public/js/ui/stats.js';
import { CHAT_FACTIONS, chatFaction } from '../../shared/local.js';

const seats = (factions) => factions.map((f, i) => ({ playerId: `p${i}`, faction: f }));
const colorsOf = (factions) => [...playerColors(seats(factions)).values()];

test('player colors: the faction color as the chat shows it; no faction (or a bot) → the seat\'s default slot', () => {
  const c = colorsOf(['kjerag', 'victoria', null, 'laterano']);
  assert.deepEqual(c.map((x) => x.source), ['faction', 'faction', 'default', 'faction']);
  assert.deepEqual([c[0].color, c[1].color, c[3].color], ['kjerag', 'victoria', 'laterano'].map((id) => chatFaction(id).color));
  assert.equal(c[2].color, DEFAULT_PLAYER_COLORS[2]);
  assert.deepEqual(colorsOf([null, null, null, null]).map((x) => x.color), [...DEFAULT_PLAYER_COLORS], 'nobody picked: the four defaults by seat');
});

test('player colors: a later seat whose faction is the same or too close falls back; a default that collides is skipped', () => {
  // 쉐라그 – 에기르 is one of the close pairs (ΔE ≈ 9.5)
  assert.ok(colorDistance(chatFaction('kjerag').color, chatFaction('aegir').color) < MIN_COLOR_DE);
  for (const second of ['kjerag', 'aegir']) {
    const c = colorsOf(['kjerag', second]);
    assert.equal(c[0].source, 'faction', 'the earlier seat keeps its faction color');
    assert.equal(c[1].source, 'clash');
    assert.ok(colorDistance(c[0].color, c[1].color) >= MIN_COLOR_DE);
  }
  // 쉐라그 + 빅토리아 + a default: seat 3's own default (yellow ≈ 빅토리아) and every other default collide → the spare violet
  const c = colorsOf(['kjerag', 'victoria', null, 'aegir']);
  assert.equal(c[3].color, SPARE_PLAYER_COLORS[0]);
  // every one of the 9⁴ seatings (8 factions or none per seat): no two players share a color, and every pair the rule
  // produces is at least MIN_COLOR_DE apart — two default slots excepted (the defaults are validated as a set)
  const ids = [null, ...CHAT_FACTIONS.map((f) => f.id)];
  for (const a of ids) for (const b of ids) for (const c3 of ids) for (const d of ids) {
    const out = colorsOf([a, b, c3, d]);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      assert.notEqual(out[i].color, out[j].color, `${a} ${b} ${c3} ${d}: seats ${i} / ${j}`);
      const bothDefault = out[i].source !== 'faction' && out[j].source !== 'faction'
        && DEFAULT_PLAYER_COLORS.includes(out[i].color) && DEFAULT_PLAYER_COLORS.includes(out[j].color);
      if (!bothDefault) assert.ok(colorDistance(out[i].color, out[j].color) >= MIN_COLOR_DE, `${a} ${b} ${c3} ${d}: seats ${i} / ${j}`);
    }
  }
});

const players = [
  { playerId: 'a', units: [{ id: 'x', dmg: 900, final: 100, hidden: 50 }, { id: 'y', dmg: 100, final: 300, hidden: 0, assist: { b: 3 } }], unite: { sent: 2, through: 0 } },
  { playerId: 'b', units: [{ id: 'z', dmg: 500, final: 0, hidden: 0, assist: { a: 2 } }, { id: 'w', dmg: 0, final: 0, hidden: 0 }], unite: { sent: 5, through: 1 } },
];

test('damage ranking: sorted by the chosen column, zero rows dropped; player sums and the leader pool of a round', () => {
  assert.deepEqual(damageRanking(players, { sort: 'total' }).map((x) => x.unit.id), ['x', 'z', 'y']);
  assert.deepEqual(damageRanking(players, { sort: 'leader', round: 'sum' }).map((x) => [x.unit.id, x.leader]), [['y', 300], ['x', 150], ['z', 0]]);
  assert.deepEqual(damageRanking(players, { sort: 'leader', round: 'hidden' })[0].unit.id, 'x');
  assert.deepEqual([playerSum(players[0], 'total'), playerSum(players[0], 'leader', 'final')], [1000, 400]);
  const pools = { final: { maxHp: 1000, dealt: 1000 }, hidden: { maxHp: 800, dealt: 600 } };
  assert.deepEqual(leaderPool(pools, 'sum'), { maxHp: 1800, dealt: 1600 });
  assert.deepEqual(leaderPool(pools, 'hidden'), { maxHp: 800, dealt: 600 });
  assert.equal(leaderPool({ final: null, hidden: null }, 'sum'), null);
});

test('联防 flows: helper → leaker pairs, per-leaker rescued / sent / through, operator ranking', () => {
  const fl = uniteFlows(players);
  assert.deepEqual([fl.helped('a', 'b'), fl.helped('b', 'a'), fl.helped('a', 'a')], [3, 2, 0]);
  assert.deepEqual([fl.rescued.get('b'), fl.sent.get('b'), fl.through.get('b')], [3, 5, 1]);
  assert.deepEqual(fl.totals, { sent: 7, rescued: 5, through: 1 });
  assert.deepEqual(fl.ranking.map((x) => [x.unit.id, x.n]), [['y', 3], ['z', 2]]);
});

/** An m.result in the shape server/match/results.js emits, with the tabs' fields. */
const raw = () => ({
  victory: true, roundsPassed: 14, seed: 7, durationMs: 1000, modeId: 'mode_multi_normal', difficulty: 'NORMAL',
  bossPools: { final: { maxHp: 1000, dealt: 1000 }, hidden: null }, uniteRounds: 3,
  players: [
    { playerId: 'me', seat: 0, name: 'Me', faction: 'yan', unite: { sent: 4, through: 1 }, stats: { dmgDealt: 9 },
      units: [{ id: 'chess_x_b', golden: true, tier: 6, dmg: 9.4, final: 3, hidden: 0, sold: true, summon: true, assist: { you: 2, bad: -1 } }] },
    { playerId: 'you', seat: 1, name: 'You', stats: {} },
  ],
});

test('normalizeResult keeps the tabs\' fields; older payloads have none and hide the tabs', () => {
  const r = normalizeResult(raw(), null);
  assert.ok(hasUnitCharts(r));
  assert.deepEqual([r.bossPools.final, r.bossPools.hidden, r.uniteRounds], [{ maxHp: 1000, dealt: 1000 }, null, 3]);
  assert.deepEqual([r.players[0].faction, r.players[0].unite, r.players[1].units, r.players[1].unite], ['yan', { sent: 4, through: 1 }, [], null]);
  const old = raw();
  for (const p of old.players) delete p.units;
  assert.ok(!hasUnitCharts(normalizeResult(old, null)));
});

test('stats record: a settled record keeps the tabs\' fields for the re-view (bounded), a compacted one drops them', () => {
  const rec = buildRecord(raw(), { myId: 'me', now: 1 });
  const back = normalizeResult(recordToResult(rec), null);
  assert.ok(hasUnitCharts(back));
  assert.deepEqual(back.players[0].units[0], { id: 'chess_x_b', golden: true, tier: 6, dmg: 9, final: 3, hidden: 0, sold: true, summon: true, assist: { you: 2 } });
  assert.deepEqual([back.players[0].faction, back.players[0].unite, back.bossPools.final, back.uniteRounds], ['yan', { sent: 4, through: 1 }, { maxHp: 1000, dealt: 1000 }, 3]);
  const big = raw();
  big.players[0].units = Array.from({ length: 30 }, (_, i) => ({ id: `chess_${i}`, dmg: i }));
  assert.equal(buildRecord(big, { myId: 'me', now: 1 }).players[0].units.length, 16, 'a stored record keeps the top 16');
  assert.equal(compactRecord(rec).players[0].units, undefined);
});

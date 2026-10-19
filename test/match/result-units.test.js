// The settlement's per-operator numbers (server/match/unitTally.js → m.result players[].units / unite / faction,
// bossPools, uniteRounds): the result screen's 伤害 and 联防 tabs (screens/resultCharts.js, maintainer decision 2026-10-12).
//   - the real match path, client-side combat and the server-run fallback: every operator's damage adds up to the
//     player's 造成伤害, its leader damage to the player's 领袖伤害, 联防 knock-outs stay within what each leaker sent in,
//     the boss pools and the Hidden Core round are reported, the chat faction rides along (bots and unknown ids: none)
//   - tallyBattle on its own: a summon counts for its summoner (board summon piece and battle-created unit), leader
//     damage is capped at what the pool credited the player (a browser-run field counts against its local copy), a
//     unit no operator stands behind counts for nobody, rows survive elites (one row per base chess) and mark sold ones

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';
import { tallyBattle, unitRows } from '../../server/match/unitTally.js';
import { isBattleResult, RESULT_LIMITS } from '../../shared/protocol.js';

/** A whole co-op match in virtual time (client-side combat unless `clientCombat: false`), boosted toward the Hidden Core. */
function runCoop({ seed, clientCombat = true, boost = null }) {
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, bots: 2, seed, captureFrames: false, clientCombat, pace: 'instant' });
  h.autoHumans();
  const m = h.m;
  m.opts.factionOf = (pid) => (pid === 'p_0' ? 'kjerag' : pid === 'p_1' ? 'not-a-faction' : 'yan');
  m.start();
  let boosted = !boost;
  h.run(() => {
    if (!boosted && m.phase === PHASE.PREP) {
      boosted = true;
      for (const ps of m.players.values()) {
        ps.lp = boost.lp;
        for (const id of m.gd.bondIds) ps.layers[id] = boost.layers;
        ps.recompute();
      }
    }
    return h.ended != null;
  }, { maxSteps: 5e6 });
  assert.ok(h.ended, 'the match ended');
  assert.equal(m.errorCount, 0);
  const res = h.lastTo('p_0', 'm.result');
  m.dispose();
  if (h.clients) h.clients.closeAll();
  return res;
}

function checkResult(res, label) {
  assert.ok(res && Array.isArray(res.players) && res.players.length === 4, `${label}: a result`);
  assert.ok(res.bossPools && res.bossPools.final && res.bossPools.final.maxHp > 0, `${label}: the Final Assault pool`);
  assert.ok(res.bossPools.final.dealt >= 0 && res.bossPools.final.dealt <= res.bossPools.final.maxHp);
  assert.equal(!!res.bossPools.hidden, !!res.hiddenReached, `${label}: a Hidden Core pool exactly when it was fought`);
  assert.ok(Number.isInteger(res.uniteRounds) && res.uniteRounds >= 0);
  const byId = new Map(res.players.map((p) => [p.playerId, p]));
  // the chat faction: a known id only (the lobby's factionOf never answers for a bot — they cannot pick one — but the
  // result takes whatever the option says)
  assert.equal(byId.get('p_0').faction, 'kjerag');
  assert.equal(byId.get('p_1').faction, null, 'an unknown faction id is dropped');
  const rescued = new Map();
  for (const p of res.players) {
    assert.ok(Array.isArray(p.units) && p.units.length > 0 && p.units.length <= 24, `${label} ${p.playerId}: unit rows`);
    for (const u of p.units) {
      for (const k of ['dmg', 'final', 'hidden']) assert.ok(Number.isInteger(u[k]) && u[k] >= 0, `${label} ${p.playerId} ${u.id}.${k}`);
      if (!res.hiddenReached) assert.equal(u.hidden, 0);
      for (const [leaker, n] of Object.entries(u.assist || {})) {
        assert.notEqual(leaker, p.playerId, 'no knock-out of the own enemies');
        assert.ok(byId.has(leaker) && Number.isInteger(n) && n > 0);
        rescued.set(leaker, (rescued.get(leaker) || 0) + n);
      }
    }
    // every operator's damage adds up to the player's: equal up to the per-row rounding while no row was cut
    const dmg = p.units.reduce((s, u) => s + u.dmg, 0), lead = p.units.reduce((s, u) => s + u.final + u.hidden, 0);
    const slack = p.units.length + 2;
    if (p.units.length < 24) assert.ok(Math.abs(dmg - p.stats.dmgDealt) <= slack, `${label} ${p.playerId}: Σ dmg ${dmg} vs ${p.stats.dmgDealt}`);
    assert.ok(dmg <= p.stats.dmgDealt + slack);
    assert.ok(lead <= p.stats.bossDamage + slack, `${label} ${p.playerId}: Σ leader ${lead} ≤ ${p.stats.bossDamage}`);
    if (p.units.length < 24) assert.ok(lead >= p.stats.bossDamage - slack, `${label} ${p.playerId}: Σ leader ${lead} ≈ ${p.stats.bossDamage} (honest clients)`);
    assert.ok(p.unite && p.unite.sent >= 0 && p.unite.through >= 0);
  }
  // 联防: knock-outs of a leaker's enemies never exceed what it sent in
  for (const [leaker, n] of rescued) assert.ok(n <= byId.get(leaker).unite.sent, `${label}: ${leaker} rescued ${n} ≤ sent ${byId.get(leaker).unite.sent}`);
}

test('real match path, client-side combat: per-operator rows add up to the players\' numbers; factions, pools, 联防', () => {
  checkResult(runCoop({ seed: 3 }), 'cc seed 3');
});

test('real match path, server-run combat, boosted to the Hidden Core: both leader rounds are tallied apart', () => {
  const res = runCoop({ seed: 10, clientCombat: false, boost: { lp: 400, layers: 300 } });
  checkResult(res, 'server seed 10');
  assert.ok(res.hiddenReached, 'the boosted run reaches the Hidden Core');
  assert.ok(res.players.some((p) => p.units.some((u) => u.hidden > 0)), 'someone hit the hidden leader');
  assert.ok(res.players.some((p) => p.units.some((u) => u.final > 0)), 'someone hit the Final Assault leader');
});

/** A minimal PlayerState stand-in for tallyBattle / unitRows. */
function fakePs(board, extra = {}) {
  const map = new Map(board.map((p, i) => [`9,${i + 2}`, p]));
  return { playerId: 'p_0', board: map, hand: [], temp: [], unitTally: new Map(), ...extra };
}
const gd = {
  baseIdOf: (id) => id.replace(/_b$/, '_a'), isGolden: (id) => id.endsWith('_b'), tierOf: () => 6, standIn: () => null,
};

test('tallyBattle: summons count for their summoner (board summon piece, battle-created unit); orphans count for nobody', () => {
  const ps = fakePs([{ uid: 1, kind: 'chess', id: 'chess_x_a' }, { uid: 2, kind: 'token', id: 'token_t', ownerUid: 1 }]);
  tallyBattle(gd, ps, [
    { uid: 1, defId: 'char_x', kind: 'op', dmg: 100 },
    { uid: 2, defId: 'token_t', kind: 'token', dmg: 40 },
    { uid: null, defId: 'token_s', kind: 'token', dmg: 7, ownerUid: 1 },
    { uid: null, defId: 'enemy_bond_summon', kind: 'token', dmg: 999 },
  ]);
  const rows = unitRows(gd, ps);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].dmg, 147);
  assert.equal(rows[0].summon, true);
});

test('tallyBattle: leader damage is scaled down to what the pool credited the player; damage is taken as reported', () => {
  const ps = fakePs([{ uid: 1, kind: 'chess', id: 'chess_x_a' }, { uid: 3, kind: 'chess', id: 'chess_y_a' }]);
  tallyBattle(gd, ps, [{ uid: 1, dmg: 500, boss: 300 }, { uid: 3, dmg: 200, boss: 100 }], { boss: 'final', bossCap: 200 });
  tallyBattle(gd, ps, [{ uid: 1, dmg: 10, boss: 10 }], { boss: 'hidden', bossCap: 50 });
  const rows = unitRows(gd, ps);
  const x = rows.find((r) => r.id === 'chess_x_a'), y = rows.find((r) => r.id === 'chess_y_a');
  assert.deepEqual([x.final, y.final, x.hidden], [150, 50, 10], 'final scaled ×0.5 (400 reported, 200 credited); hidden under its cap');
  assert.deepEqual([x.dmg, y.dmg], [510, 200]);
});

test('unitRows: one row per base chess through an elite promotion; sold operators marked; 联防 assists kept by leaker', () => {
  const ps = fakePs([{ uid: 1, kind: 'chess', id: 'chess_x_a' }, { uid: 4, kind: 'chess', id: 'chess_z_a' }]);
  tallyBattle(gd, ps, [{ uid: 1, dmg: 10 }, { uid: 4, dmg: 5, assist: { p_1: 2, p_0: 9 } }]);
  ps.board = new Map([['9,2', { uid: 9, kind: 'chess', id: 'chess_x_b' }]]); // x elited (new uid), z sold
  tallyBattle(gd, ps, [{ uid: 9, dmg: 30, assist: { p_1: 1 } }]);
  const rows = unitRows(gd, ps);
  const x = rows.find((r) => r.id === 'chess_x_b'), z = rows.find((r) => r.id === 'chess_z_a');
  assert.deepEqual([x.dmg, x.golden, !!x.sold, x.assist], [40, true, false, { p_1: 1 }]);
  assert.deepEqual([z.dmg, z.sold, z.assist], [5, true, { p_1: 2 }], 'the own player id is never an assist');
  assert.equal(rows[0].id, 'chess_x_b', 'most damage first');
});

test('b.result wire check: the unit fields are optional and bounded (boss ≥ 0, assist a small id → count map, ownerUid a uid)', () => {
  const base = { reason: 'cleared', time: 10, killed: 0, total: 0, errors: 0, perPlayer: { p_0: { killed: 0, total: 0, leaked: [], perfect: true, layerGains: {}, unitsEnd: [], unitStats: [] } } };
  const withUnit = (u) => ({ ...base, perPlayer: { p_0: { ...base.perPlayer.p_0, unitStats: [{ uid: 1, defId: 'char_x', dmg: 1, kills: 0, heal: 0, taken: 0, attacks: 0, ...u }] } } });
  assert.ok(isBattleResult(withUnit({})));
  assert.ok(isBattleResult(withUnit({ boss: 12.5, assist: { p_1: 3 }, ownerUid: 7 })));
  assert.ok(!isBattleResult(withUnit({ boss: -1 })));
  assert.ok(!isBattleResult(withUnit({ assist: { p_1: 1.5 } })));
  const assist = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p_${i}`, 1]));
  assert.ok(isBattleResult(withUnit({ assist: assist(RESULT_LIMITS.players) })));
  assert.ok(!isBattleResult(withUnit({ assist: assist(RESULT_LIMITS.players + 1) })), 'at most RESULT_LIMITS.players leakers');
  assert.ok(!isBattleResult(withUnit({ ownerUid: 0 })));
});

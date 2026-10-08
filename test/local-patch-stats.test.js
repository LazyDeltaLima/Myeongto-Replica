// Local patch: one `[stats]` log line per finished match (server/local-stats.js, hooked in server/local-patch.js onMatchEnd).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../server/index.js';
import { Match as RealMatch } from '../server/match/Match.js';
import { matchStats, STATS_VERSION } from '../server/local-stats.js';
import { TestClient } from './helpers/wsClient.js';
import { PHASE } from '../shared/constants.js';

test('a finished real match logs one [stats] line with the result rows', async () => {
  const lines = [];
  const log = { info: (...a) => lines.push(a.map(String).join(' ')), warn() {}, debug() {}, error() {} };
  const srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: RealMatch, seedFn: () => 1312887319 });
  let a;
  try {
    a = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    a.id = (await a.hello('통계')).playerId;
    assert.equal((await a.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' })).t, 'ok');
    await a.waitFor('room.state', (s) => s.hostId === a.id);
    for (let i = 0; i < 2; i++) assert.equal((await a.request({ t: 'room.addBot' })).t, 'ok');
    assert.equal((await a.request({ t: 'room.start' })).t, 'ok');
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    const room = srv.lobby.getRoom([...srv.lobby.rooms.keys()][0]);
    room.match.finish({ victory: false, reason: 'defeat' });
    await delay(20);

    const stats = lines.filter((l) => l.startsWith('[stats] '));
    assert.equal(stats.length, 1, lines.join('\n'));
    const rec = JSON.parse(stats[0].slice('[stats] '.length));
    assert.equal(rec.v, STATS_VERSION);
    assert.equal(rec.room, room.code);
    assert.equal(rec.match, 1);
    assert.equal(rec.mode, 'coop');
    assert.equal(rec.difficulty, 'FUNNY');
    assert.equal(rec.victory, false);
    assert.equal(rec.reason, 'defeat');
    assert.equal(rec.players.length, 3);
    const human = rec.players.find((p) => !p.bot);
    assert.equal(human.name, '통계');
    assert.equal(rec.players.filter((p) => p.bot).length, 2);
    assert.ok('playerId' in human === false && !('seed' in rec), 'no session ids or seed');
    assert.ok(Array.isArray(human.lineup) && Array.isArray(human.bonds) && typeof human.stats === 'object');
  } finally {
    await a?.terminate();
    await srv.close();
  }
});

test('matchStats: compact lineup / bonds tuples, null without a summary', () => {
  const room = { code: 'ABCD', matchCount: 2, mode: 'solo', difficulty: 'ABYSS' };
  assert.equal(matchStats(room, null), null);
  const rec = matchStats(room, {
    victory: true, roundsPassed: 15, reason: 'victory', durationMs: 61_499, errors: 0,
    players: [{
      playerId: 'p_x', seat: 0, name: 'n', isBot: false, alive: true, victory: true, roundsPassed: 15,
      lineup: [{ id: 'char_1', tier: 3, golden: true, row: 0, col: 1, items: ['it_1'] }],
      bonds: [{ bondId: 'b_1', count: 3, active: true, tier: 1, layers: 2 }],
      stats: { kills: 4 },
      title: { id: 'comment_3', name: '坚若磐石', picId: 'comment_icon_3', text: '目标生命值损失最少' },
    }],
  });
  assert.equal(rec.durationS, 61);
  assert.deepEqual(rec.players[0].lineup, [['char_1', 3, true, ['it_1']]]);
  assert.deepEqual(rec.players[0].bonds, [['b_1', 2, true]]);
  assert.deepEqual(rec.players[0].stats, { kills: 4 });
  assert.equal(rec.players[0].title, 'comment_3');
});

// The in-match 重新开始 vote through the real platform (server/lobby.js onMatchEnd, feat — maintainer decision
// 2026-10-31): a passed vote replaces the match by a new one with a new seed and the next match number, back at the
// briefing, while the room stays in a match — no m.result, no replay, no [stats] line (the page records it as 中途退出).
// The match flow itself is test/match/restart-vote.test.js; here the phase gate is set by hand.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { Match } from '../server/match/Match.js';
import { TestClient } from './helpers/wsClient.js';
import { PHASE } from '../shared/constants.js';

/** generous waits: the whole suite runs these next to heavy files */
const W = 6000;

describe('in-match restart vote', () => {
  let srv;
  let url;
  let seeds = 2000;
  const open = [];
  const errors = [];
  const stats = [];
  const log = {
    info: (...a) => { const s = a.map(String).join(' '); if (s.startsWith('[stats]')) stats.push(s); },
    warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')),
  };

  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: Match, seedFn: () => ++seeds });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  after(async () => {
    await Promise.all(open.map((c) => c.terminate().catch(() => {})));
    await srv?.close();
    assert.deepEqual(errors, [], 'no server errors logged');
  });
  const player = async (name) => {
    const c = await TestClient.connect(url);
    open.push(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  const ok = async (c, msg) => { const r = await c.request(msg, W); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const briefing = (c) => c.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK, W);

  test('co-op: a unanimous restart starts a new match at the briefing; no replay, no [stats] line', async () => {
    const a = await player('Host');
    const b = await player('Guest');
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    await ok(b, { t: 'room.join', code: st.code });
    await ok(b, { t: 'room.ready', ready: true });
    await a.waitFor('room.state', (s) => s.seats.some((x) => x && x.playerId === b.id && x.ready), W);
    await ok(a, { t: 'room.start' });
    await briefing(a);
    const room = srv.lobby.getRoom(st.code);
    const first = room.match;
    first.phase = PHASE.PREP; // (the phase gate only)
    await ok(a, { t: 'g.restart', op: 'propose' });
    await b.waitFor('m.public', (p) => p.restartVote?.by === a.id, W);
    await ok(b, { t: 'g.restart', op: 'yes' });
    await a.waitFor('m.public', (p) => p.restarted === true, W);
    await a.waitFor('room.state', (s) => s.inMatch && s.matchNo === 2, W);
    await briefing(a);
    await briefing(b);
    assert.notEqual(room.match, first, 'a new match');
    assert.notEqual(room.match.seed, first.seed, 'with a new seed');
    assert.equal(first.disposed, true);
    assert.equal(room.replay, null);
    assert.equal(room.lastSummary, null);
    assert.equal(stats.length, 0);
  });
});

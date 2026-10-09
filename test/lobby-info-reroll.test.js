// The briefing's 重新抽取 vote through the real platform (server/lobby.js onMatchEnd, feat — user decision 2026-10-09):
// a reroll replaces the match by a new one with a new seed and the next match number while the room stays in a match
// (room.state matchNo), a tie hands the room back to its lobby; neither leaves a replay or a [stats] line, and the chat
// factions are cleared (they are picked after seeing the banned bonds).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer } from '../server/index.js';
import { Match } from '../server/match/Match.js';
import { INFO_REROLL_MIN_MS } from '../server/match/match/phases.js';
import { TestClient } from './helpers/wsClient.js';
import { PHASE } from '../shared/constants.js';

/** generous waits: the whole suite runs these next to heavy files */
const W = 6000;

describe('briefing reroll vote', () => {
  let srv;
  let url;
  let seeds = 1000;
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

  test('solo: a reroll starts a new match with a new seed and the next matchNo; no replay, no [stats] line', async () => {
    const a = await player('Solo');
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    await ok(a, { t: 'room.start' });
    await a.waitFor('room.state', (s) => s.inMatch && s.matchNo === 1, W);
    await briefing(a);
    const room = srv.lobby.getRoom(st.code);
    const first = room.match;
    await delay(INFO_REROLL_MIN_MS + 100);
    await ok(a, { t: 'g.infoReroll' });
    await a.waitFor('m.public', (p) => p.infoOutcome === 'reroll', W);
    const next = await a.waitFor('room.state', (s) => s.inMatch && s.matchNo === 2, W);
    assert.equal(next.inMatch, true);
    await briefing(a);
    assert.notEqual(room.match, first, 'a new match');
    assert.notEqual(room.match.seed, first.seed, 'with a new seed');
    assert.equal(first.disposed, true);
    assert.equal(room.replay, null);
    assert.equal(room.lastSummary, null);
    assert.equal(stats.length, 0, 'nothing played, nothing logged');
    await a.expectNone?.('m.result', () => true, 200);
  });

  test('co-op: a tie returns the room to its lobby; the chat factions are cleared', async () => {
    const a = await player('Host');
    const b = await player('Guest');
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    await ok(b, { t: 'room.join', code: st.code });
    await ok(b, { t: 'room.ready', ready: true });
    await a.waitFor('room.state', (s) => s.seats.some((x) => x && x.playerId === b.id && x.ready), W);
    await ok(a, { t: 'room.start' });
    await briefing(a);
    await briefing(b);
    await ok(b, { t: 'room.chatFaction', faction: 'yan' });
    await a.waitFor('room.factions', (m) => m.factions[b.id] === 'yan', W);
    await delay(INFO_REROLL_MIN_MS + 100);
    await ok(a, { t: 'g.infoReroll' });
    await ok(b, { t: 'g.infoReady' });
    await a.waitFor('m.public', (p) => p.infoOutcome === 'split', W);
    // (the inbox still holds the frames from before the start: wait for the one after the match)
    const back = await a.waitFor('room.state', (s) => !s.inMatch && s.matchNo === 1, W);
    assert.equal(back.inMatch, false);
    assert.equal(srv.lobby.getRoom(st.code).match, null);
    await a.waitFor('room.factions', (m) => Object.keys(m.factions).length === 0 && !m.factions[b.id], W);
    assert.equal(stats.length, 0);
  });

  test('room.diy reaches the running match during its briefing (진영별 선발 프리셋), and only the next one from the prep on', async () => {
    const a = await player('Diy');
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    await ok(a, { t: 'room.diy', picks: { chess_char_6_diy1_a: { charId: 'char_1035_wisdel', skillIndex: 0 } } });
    await ok(a, { t: 'room.start' });
    await briefing(a);
    const room = srv.lobby.getRoom(st.code);
    const ps = () => room.match.players.get(a.id);
    assert.equal(ps().diy.chess_char_6_diy1_a.charId, 'char_1035_wisdel');
    await ok(a, { t: 'room.diy', picks: { chess_char_6_diy1_a: { charId: 'char_2027_wang', skillIndex: 2 } } });
    assert.equal(ps().diy.chess_char_6_diy1_a.charId, 'char_2027_wang', 'the briefing takes it for this match');
    await a.waitFor('m.private', (p) => p.diy?.chess_char_6_diy1_a?.charId === 'char_2027_wang', W);
    room.match.phase = PHASE.PREP; // (the phase gate only; the match flow itself is test/match/diy-midmatch.test.js)
    const r = await a.request({ t: 'room.diy', picks: { chess_char_6_diy1_a: { charId: 'char_4132_ascln', skillIndex: 0 } } }, W);
    assert.equal(r.t, 'error');
    assert.equal(r.code, 'ROOM_STARTED');
    assert.equal(ps().diy.chess_char_6_diy1_a.charId, 'char_2027_wang', 'the prep keeps the match\'s picks');
    assert.equal(room.seatOf(a.id).diy.chess_char_6_diy1_a.charId, 'char_4132_ascln', 'the seat keeps it for the next match');
  });
});

// test/queue-vote.test.js — the 「바로 시작」 vote of an 8-player matchmaking queue (server/matchmaking.js header,
// maintainer decision 2026-11-02): five or more waiting may vote to start now; the Doctors who vote yes start together
// when they are five or more, every other one keeps its place in the queue.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, LARGE_MIN_PLAYERS } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const VOTE_MS = 3_000;

describe('8-player queue: 「바로 시작」 vote', () => {
  let srv;
  const open = new Set();
  const errors = [];
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, queueConfirmMs: 10_000, queueGraceMs: 10_000,
      queueVoteMs: VOTE_MS, queueVoteCooldownMs: 60_000,
      log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } });
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    srv.lobby.queue.shutdown();
  });
  after(async () => { await srv?.close(); assert.deepEqual(errors, [], 'no server errors logged'); });

  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
  /** `n` Doctors waiting in the 8-player queue of `difficulty` (the last one sees the count: `before` were waiting already) */
  const queued = async (n, prefix, difficulty = 'HARD', before = 0) => {
    const ps = [];
    for (let i = 0; i < n; i++) {
      const c = await player(`${prefix}${i + 1}`);
      await ok(c, { t: 'room.queue', difficulty, size: 8 });
      ps.push(c);
    }
    await ps[n - 1].waitFor('room.queueState', (m) => m.queued && m.count === before + n);
    return ps;
  };
  const vote = (c) => c.waitFor('room.matchFound', (m) => m.vote === true);

  test('protocol: room.queueVote takes no field', () => {
    assert.equal(validateC2S({ t: 'room.queueVote' }), null);
    assert.equal(LARGE_MIN_PLAYERS, 5);
  });

  test('only an 8-player queue of five or more votes', async () => {
    const solo4 = await player('F1');
    await ok(solo4, { t: 'room.queue', difficulty: 'NORMAL' });
    await err(solo4, { t: 'room.queueVote' }, ERR.BAD_TARGET);
    const outside = await player('F2');
    await err(outside, { t: 'room.queueVote' }, ERR.WRONG_PHASE);
    const ps = await queued(4, 'G');
    await err(ps[0], { t: 'room.queueVote' }, ERR.WRONG_PHASE);
    assert.equal(srv.lobby.queue.stats().confirming, 0);
  });

  test('six waiting: five yes start together in an 8-seat room, the one who waits keeps its place', async () => {
    const ps = await queued(6, 'V');
    await ok(ps[2], { t: 'room.queueVote' });
    const votes = await Promise.all(ps.map(vote));
    for (const v of votes) assert.deepEqual([v.players, v.need, v.accepted, v.declined, v.size, v.by], [6, 5, 1, 0, 8, 'V3']);
    assert.equal(votes[2].mine, true, 'the proposer has voted yes');
    // a second proposal while the vote runs
    await err(ps[0], { t: 'room.queueVote' }, ERR.ALREADY);
    await ok(ps[5], { t: 'room.queueAccept', accept: false });
    const noted = await ps[5].waitFor('room.matchFound', (m) => m.vote && m.no);
    assert.equal(noted.declined, 1);
    for (const c of [ps[0], ps[1], ps[3], ps[4]]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await ps[0].waitFor('room.state', (s) => s.inMatch);
    assert.equal(st.size, 8);
    assert.deepEqual(st.seats.filter(Boolean).map((s) => s.playerId), ps.slice(0, 5).map((c) => c.id));
    const back = await ps[5].waitFor('room.queueState', (m) => m.queued && m.vote === 'started');
    assert.deepEqual([back.started, back.count, back.size], [5, 1, 8]);
    assert.deepEqual([srv.lobby.queue.stats().waiting, srv.lobby.queue.stats().confirming], [1, 0]);
  });

  test('fewer than five yes: everyone waits on, and the queue takes no proposal for a while', async () => {
    const ps = await queued(5, 'W');
    await ok(ps[0], { t: 'room.queueVote' });
    await Promise.all(ps.map(vote));
    for (const c of ps.slice(1, 3)) await ok(c, { t: 'room.queueAccept', accept: true });
    for (const c of ps.slice(3)) await ok(c, { t: 'room.queueAccept', accept: false });
    const backs = await Promise.all(ps.map((c) => c.waitFor('room.queueState', (m) => m.queued && m.vote === 'failed')));
    for (const b of backs) assert.equal(b.count, 5);
    assert.equal(srv.lobby.queue.stats().waiting, 5);
    await err(ps[1], { t: 'room.queueVote' }, ERR.RATE);
  });

  test('a Doctor who does not answer stays in the queue; the five yes start when the time runs out', async () => {
    const ps = await queued(6, 'T', 'NORMAL');
    await ok(ps[0], { t: 'room.queueVote' });
    await Promise.all(ps.map(vote));
    for (const c of ps.slice(1, 5)) await ok(c, { t: 'room.queueAccept', accept: true });
    // every answer but the silent one: the vote waits for the time
    assert.equal(srv.lobby.queue.stats().confirming, 6);
    const st = await ps[0].waitFor('room.state', (s) => s.inMatch, VOTE_MS + 5_000);
    assert.equal(st.seats.filter(Boolean).length, 5);
    const back = await ps[5].waitFor('room.queueState', (m) => m.queued && m.vote === 'started');
    assert.equal(back.started, 5);
  });

  test('leaving during the vote takes only that Doctor out; the vote goes on without them', async () => {
    const ps = await queued(6, 'L', 'ABYSS');
    await ok(ps[0], { t: 'room.queueVote' });
    await Promise.all(ps.map(vote));
    await ok(ps[5], { t: 'room.unqueue' });
    const gone = await ps[5].waitFor('room.queueState', (m) => !m.queued);
    assert.equal(gone.reason, 'left');
    const left = await ps[1].waitFor('room.matchFound', (m) => m.vote && m.players === 5);
    assert.equal(left.accepted, 1);
    for (const c of ps.slice(1, 5)) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await ps[0].waitFor('room.state', (s) => s.inMatch);
    assert.equal(st.seats.filter(Boolean).length, 5);
    assert.equal(srv.lobby.queue.stats().waiting, 0);
  });

  test('a queued 8-seat room counts as yes only when every Doctor of it votes yes', async () => {
    const host = await player('R1');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'FUNNY', size: 8 });
    const room = await host.waitFor('room.state', (s) => s.hostId === host.id);
    const mates = [await player('R2'), await player('R3')];
    for (const c of mates) {
      await ok(c, { t: 'room.join', code: room.code });
      await ok(c, { t: 'room.ready', ready: true });
    }
    await host.waitFor('room.state', (s) => s.seats.filter(Boolean).length === 3 && s.seats.filter(Boolean).every((x) => x.ready || x.playerId === host.id));
    await ok(host, { t: 'room.queueRoom' });
    await host.waitFor('room.queueState', (m) => m.queued && m.party);
    const singles = await queued(3, 'S', 'FUNNY', 3);
    await host.waitFor('room.queueState', (m) => m.queued && m.count === 6);
    // a room member proposes; one of the room's Doctors waits: the room stays, three singles are not five
    await ok(mates[0], { t: 'room.queueVote' });
    await Promise.all([host, ...mates, ...singles].map(vote));
    await ok(host, { t: 'room.queueAccept', accept: true });
    await ok(mates[1], { t: 'room.queueAccept', accept: false });
    for (const c of singles) await ok(c, { t: 'room.queueAccept', accept: true });
    const back = await host.waitFor('room.queueState', (m) => m.queued && m.vote === 'failed');
    assert.deepEqual([back.party, back.count], [true, 6]);
    assert.equal(srv.lobby.rooms.get(room.code).matching, true, 'the room still waits in the queue');
  });
});

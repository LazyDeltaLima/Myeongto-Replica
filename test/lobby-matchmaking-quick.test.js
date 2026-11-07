// test/lobby-matchmaking-quick.test.js — 快速匹配 (server/matchmaking.js header; maintainer decisions 2026-11-07): a
// quick player waits for any ruleset and room size of the difficulty, completes the regular queues first (the one
// with the longest-waiting entry first, with as few quick players as it takes; 8-player queues and queued rooms
// included), and four quick players alone start a classic 4-seat room. Quick players never join a 「바로 시작」 vote.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, DIFFICULTIES } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const found = (c, pred = () => true) => c.waitFor('room.matchFound', pred);
const started = (c) => c.waitFor('room.state', (s) => s.inMatch === true);
const acceptAll = async (cs) => { for (const c of cs) await ok(c, { t: 'room.queueAccept', accept: true }); };

test('protocol: room.queue takes an optional boolean quick', () => {
  assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD', quick: true }), null);
  assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD', quick: false }), null);
  for (const quick of ['yes', 1, null]) assert.notEqual(validateC2S({ t: 'room.queue', difficulty: 'HARD', quick }), null, String(quick));
});

describe('快速匹配', () => {
  let srv;
  const open = new Set();
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch,
      queueConfirmMs: 10_000, queueGraceMs: 10_000, countsMinGapMs: 50 });
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    srv.lobby.queue.shutdown();
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.id = (await c.hello(name)).playerId;
    return c;
  };
  /** `n` new Doctors queued with `fields` (quick or a regular queue); each waits for its own waiting state. */
  const queued = async (n, prefix, fields) => {
    const ps = [];
    for (let i = 0; i < n; i++) {
      const c = await player(`${prefix}${i + 1}`);
      await ok(c, { t: 'room.queue', difficulty: 'NORMAL', ...fields });
      ps.push(c);
    }
    return ps;
  };
  const quick = (n, prefix = 'Q') => queued(n, prefix, { quick: true });

  test('four quick players alone: a classic 4-seat room; their messages say quick, the found group its ruleset', async () => {
    const qs = await quick(3);
    const st = await qs[2].waitFor('room.queueState', (s) => s.queued && s.count === 3);
    assert.equal(st.quick, true);
    assert.ok(!('ruleset' in st) && !('size' in st), JSON.stringify(st));
    qs.push(...await quick(1, 'R'));
    const ms = await Promise.all(qs.map((c) => found(c)));
    for (const m of ms) {
      assert.equal(m.quick, true);
      assert.equal(m.ruleset, 'classic');
      assert.ok(!('size' in m), JSON.stringify(m));
      assert.equal(m.players, 4);
    }
    await acceptAll(qs);
    const room = await started(qs[0]);
    assert.equal(room.ruleset.preset, 'classic');
    assert.equal(room.seats.length, 4);
    assert.deepEqual(room.seats.map((s) => s.playerId), qs.map((c) => c.id));
  });

  test('three casual + one quick: a casual group; the regular players are seated first and host', async () => {
    const q = (await quick(1))[0];
    const ks = await queued(2, 'K', { ruleset: 'casual' });
    // a quick player's count is every human waiting at the difficulty
    await q.waitFor('room.queueState', (s) => s.queued && s.count === 3);
    ks.push(...await queued(1, 'L', { ruleset: 'casual' }));
    const mq = await found(q);
    assert.equal(mq.ruleset, 'casual');
    assert.equal(mq.quick, true);
    const mk = await found(ks[0]);
    assert.ok(!('quick' in mk), 'a regular member is not told quick');
    await acceptAll([...ks, q]);
    const room = await started(ks[0]);
    assert.equal(room.ruleset.preset, 'casual');
    assert.equal(room.hostId, ks[0].id);
    assert.deepEqual(room.seats.map((s) => s.playerId), [...ks, q].map((c) => c.id));
  });

  test('regular queues first: one casual waiting, four quick arrive — the casual group takes three, the fourth waits', async () => {
    const [k] = await queued(1, 'K', { ruleset: 'casual' });
    const qs = await quick(4);
    const ms = await Promise.all([k, ...qs.slice(0, 3)].map((c) => found(c)));
    for (const m of ms) assert.equal(m.ruleset, 'casual');
    await qs[3].expectNone('room.matchFound');
    const st = await qs[3].waitFor('room.queueState', (s) => s.queued);
    assert.equal(st.count, 1, 'the group being confirmed is not counted');
  });

  test('regular queues before quick players alone: a dissolved quick group completes a waiting 8-player queue', async () => {
    const es = await queued(3, 'E', { size: 8 }); // needs five quick players
    const first = await quick(4);
    await Promise.all(first.map((c) => found(c, (m) => m.ruleset === 'classic')));
    const later = await quick(3, 'R');
    await later[2].waitFor('room.queueState', (s) => s.queued && s.count === 6);
    await ok(first[3], { t: 'room.queueAccept', accept: false });
    // six quick players are back: the 8-player queue takes the five oldest, not a classic four of them
    const back = [...first.slice(0, 3), ...later.slice(0, 2)];
    const ms = await Promise.all([...es, ...back].map((c) => found(c, (m) => m.accepted === 0)));
    for (const m of ms) assert.equal(m.size, 8);
    await later[2].expectNone('room.matchFound', (m) => m.accepted === 0);
  });

  test('the queue with the longest-waiting entry is completed first', async () => {
    const cs = await queued(3, 'C', { ruleset: 'classic' });
    const ks = await queued(3, 'K', { ruleset: 'casual' });
    const [q] = await quick(1);
    assert.equal((await found(q)).ruleset, 'classic');
    await Promise.all(cs.map((c) => found(c)));
    for (const c of ks) await c.expectNone('room.matchFound');
  });

  test('an 8-player queue is completed by quick players too', async () => {
    const es = await queued(6, 'E', { size: 8 });
    const qs = await quick(2);
    const ms = await Promise.all([...es, ...qs].map((c) => found(c)));
    for (const m of ms) { assert.equal(m.size, 8); assert.equal(m.players, 8); }
    await acceptAll([...es, ...qs]);
    const room = await started(qs[1]);
    assert.equal(room.seats.length, 8);
    assert.deepEqual(room.seats.map((s) => s.playerId), [...es, ...qs].map((c) => c.id));
  });

  test('a queued room\'s empty seats (빈자리 매칭) are filled by quick players, in that room', async () => {
    const [host, guest] = [await player('H'), await player('G')];
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'casual' });
    const lobbyRoom = await host.waitFor('room.state', (s) => s.hostId === host.id && s.mode === 'coop');
    await ok(guest, { t: 'room.join', code: lobbyRoom.code });
    await host.waitFor('room.state', (s) => s.seats[1]?.playerId === guest.id);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => s.seats[1]?.ready);
    await ok(host, { t: 'room.queueRoom' });
    const qs = await quick(2);
    const ms = await Promise.all([host, guest, ...qs].map((c) => found(c)));
    for (const m of ms) assert.equal(m.ruleset, 'casual');
    await acceptAll([host, guest, ...qs]);
    const room = await started(qs[0]);
    assert.equal(room.code, lobbyRoom.code);
    assert.equal(room.hostId, host.id);
    assert.deepEqual(room.seats.map((s) => s.playerId), [host, guest, ...qs].map((c) => c.id));
  });

  test('a quick player never joins a 「바로 시작」 vote and cannot propose one', async () => {
    const es = await queued(5, 'E', { size: 8 });
    const qs = await quick(2);
    await qs[1].waitFor('room.queueState', (s) => s.queued && s.count === 7);
    await err(qs[0], { t: 'room.queueVote' }, ERR.BAD_TARGET);
    await ok(es[0], { t: 'room.queueVote' });
    await Promise.all(es.map((c) => found(c, (m) => m.vote === true)));
    for (const c of qs) await c.expectNone('room.matchFound');
    await acceptAll(es.slice(1));
    await started(es[0]);
    for (const c of qs) await c.expectNone('room.matchFound');
    assert.equal((await qs[0].waitFor('room.queueState', (s) => s.queued && s.count === 2)).quick, true);
  });

  test('a quick player declining: it leaves the queue, the others go back and wait on', async () => {
    const ks = await queued(3, 'K', { ruleset: 'casual' });
    const [q] = await quick(1);
    await Promise.all([...ks, q].map((c) => found(c)));
    await ok(q, { t: 'room.queueAccept', accept: false });
    const gone = await q.waitFor('room.queueState', (s) => !s.queued);
    assert.equal(gone.reason, 'declined');
    assert.equal(gone.quick, true);
    assert.equal((await ks[0].waitFor('room.queueState', (s) => s.queued && s.count === 3)).ruleset, 'casual');
  });

  test('switching between quick and a regular queue moves the entry', async () => {
    const [p] = await quick(1);
    await p.waitFor('room.queueState', (s) => s.queued && s.quick);
    p.clearInbox();
    await ok(p, { t: 'room.queue', difficulty: 'NORMAL', ruleset: 'casual' });
    const st = await p.waitFor('room.queueState', (s) => s.queued);
    assert.equal(st.ruleset, 'casual');
    assert.ok(!st.quick);
    assert.equal(srv.lobby.queue.stats().waiting, 1);
  });

  test('lobby.queueCounts: `quick` per difficulty, the regular counts without the quick players', async () => {
    const watcher = await player('W');
    await quick(2);
    await queued(1, 'K', { ruleset: 'casual' });
    const msg = await watcher.waitFor('lobby.queueCounts', (m) => m.quick?.NORMAL === 2 && m.counts.casual.NORMAL === 1);
    assert.deepEqual(Object.keys(msg.quick), DIFFICULTIES);
    assert.equal(msg.counts.classic.NORMAL, 0);
    assert.equal(msg.counts8.classic.NORMAL, 0);
  });
});

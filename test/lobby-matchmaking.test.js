// test/lobby-matchmaking.test.js — 랜덤 매칭 (server/matchmaking.js, maintainer decisions 2026-10-13): a per-difficulty
// co-op queue; four players (or, after the fallback wait, players who chose a fallback) form a group that every member
// confirms, then the lobby seats them in queue order in a room of their own and starts its match at once.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

const FALLBACK_MS = 600;

function clientPool(getUrl) {
  const open = new Set();
  return {
    async connect() { const c = await TestClient.connect(getUrl()); open.add(c); return c; },
    async player(name, token) {
      const c = await this.connect();
      const w = await c.hello(name, token);
      c.id = w.playerId;
      c.token = w.token;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}
const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function queued(c, difficulty = 'NORMAL') {
  await ok(c, { t: 'room.queue', difficulty });
  return c.waitFor('room.queueState', (s) => s.queued && s.difficulty === difficulty);
}
async function players(pool, n, prefix = 'P') {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await pool.player(`${prefix}${i + 1}`));
  return out;
}
const found = (c, pred = () => true) => c.waitFor('room.matchFound', pred);
const started = (c) => c.waitFor('room.state', (s) => s.inMatch === true);
/** Until the server has seen the client's socket close (terminate() resolves on the client side first). */
async function offline(srv, c) {
  for (let i = 0; i < 200 && srv.lobby.registry.byId(c.id)?.connected; i++) await wait(10);
  assert.ok(!srv.lobby.registry.byId(c.id)?.connected, 'the server saw the drop');
}

describe('랜덤 매칭 (server/matchmaking.js)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch,
      queueFallbackMs: FALLBACK_MS, queueConfirmMs: 10_000, queueGraceMs: 10_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => {
    await pool.closeAll();
    // every socket closed: the queue forgets them when their grace runs out; start each test from an empty queue
    srv.lobby.queue.shutdown();
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('protocol: room.queue / room.unqueue / room.queueFallback / room.queueAccept', () => {
    assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD' }), null);
    assert.notEqual(validateC2S({ t: 'room.queue', difficulty: 'EASY' }), null);
    assert.notEqual(validateC2S({ t: 'room.queue' }), null);
    assert.equal(validateC2S({ t: 'room.unqueue' }), null);
    for (const fallback of ['bots', 'humans', null]) assert.equal(validateC2S({ t: 'room.queueFallback', fallback }), null);
    assert.notEqual(validateC2S({ t: 'room.queueFallback', fallback: 'solo' }), null);
    assert.notEqual(validateC2S({ t: 'room.queueFallback' }), null);
    assert.equal(validateC2S({ t: 'room.queueAccept', accept: true }), null);
    assert.notEqual(validateC2S({ t: 'room.queueAccept', accept: 1 }), null);
  });

  test('four players: a group to confirm, then a co-op room in queue order (first = host) and its match started', async () => {
    const ps = await players(pool, 4);
    for (const [i, c] of ps.entries()) {
      const st = await queued(c);
      if (i < 3) assert.equal(st.count, i + 1);
    }
    for (const c of ps) {
      const f = await found(c);
      assert.deepEqual([f.players, f.bots, f.accepted, f.mine, f.difficulty], [4, 0, 0, false, 'NORMAL']);
      assert.ok(f.inMs > 0 && f.inMs <= 10_000);
    }
    await ok(ps[2], { t: 'room.queueAccept', accept: true });
    const f = await found(ps[0], (m) => m.accepted === 1);
    assert.equal(f.mine, false);
    assert.equal((await found(ps[2], (m) => m.accepted === 1)).mine, true);
    for (const c of [ps[0], ps[1], ps[3]]) await ok(c, { t: 'room.queueAccept', accept: true });
    const states = await Promise.all(ps.map(started));
    const st = states[0];
    assert.equal(st.mode, 'coop');
    assert.equal(st.difficulty, 'NORMAL');
    assert.equal(st.hostId, ps[0].id);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), ps.map((c) => c.id));
    assert.ok(states.every((s) => s.code === st.code));
    assert.equal(srv.lobby.queue.stats().waiting + srv.lobby.queue.stats().confirming, 0);
  });

  test('difficulties never mix; room.unqueue leaves (queued:false, reason left)', async () => {
    const ps = await players(pool, 4);
    await queued(ps[0], 'FUNNY');
    await queued(ps[1], 'FUNNY');
    await queued(ps[2], 'NORMAL');
    const last = await queued(ps[3], 'NORMAL');
    assert.equal(last.count, 2);
    for (const c of ps) await c.expectNone('room.matchFound');
    await ok(ps[3], { t: 'room.unqueue' });
    assert.equal((await ps[3].waitFor('room.queueState', (s) => !s.queued)).reason, 'left');
    assert.equal((await ps[2].waitFor('room.queueState', (s) => s.queued && s.count === 1)).difficulty, 'NORMAL');
    await ok(ps[3], { t: 'room.unqueue' }); // idempotent
    // switching difficulty moves the entry (no queued:false in between)
    ps[1].clearInbox();
    await ok(ps[1], { t: 'room.queue', difficulty: 'NORMAL' });
    assert.equal((await ps[1].waitFor('room.queueState', (s) => s.queued)).count, 2);
    await ps[1].expectNone('room.queueState', (s) => !s.queued);
    assert.equal((await ps[0].waitFor('room.queueState', (s) => s.queued && s.count === 1)).difficulty, 'FUNNY');
  });

  test('a decline: that player leaves the queue, the others go back to its front in their old order', async () => {
    const ps = await players(pool, 5);
    for (const c of ps.slice(0, 4)) await queued(c);
    for (const c of ps.slice(0, 4)) await found(c);
    await queued(ps[4]); // arrives while the group is confirming
    await ok(ps[0], { t: 'room.queueAccept', accept: true });
    await ok(ps[1], { t: 'room.queueAccept', accept: false });
    assert.equal((await ps[1].waitFor('room.queueState', (s) => !s.queued)).reason, 'declined');
    // ps[0], ps[2], ps[3] go back in front of ps[4], which completes the next group of four
    const next = await Promise.all([ps[0], ps[2], ps[3], ps[4]].map((c) => found(c, (m) => m.accepted === 0 && m.players === 4)));
    assert.ok(next.every((m) => m.bots === 0));
    for (const c of [ps[4], ps[3], ps[2], ps[0]]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await started(ps[0]);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), [ps[0], ps[2], ps[3], ps[4]].map((c) => c.id));
    await err(ps[1], { t: 'room.queueAccept', accept: true }, ERR.WRONG_PHASE);
  });

  test('fallback: refused before the wait; a lone "bots" player starts with three AI teammates', async () => {
    const [p] = await players(pool, 1);
    const st = await queued(p);
    assert.ok(st.fallbackInMs > 0 && st.fallbackInMs <= FALLBACK_MS);
    assert.equal(st.fallback, null);
    await err(p, { t: 'room.queueFallback', fallback: 'bots' }, ERR.WRONG_PHASE);
    await wait(FALLBACK_MS + 50);
    await ok(p, { t: 'room.queueFallback', fallback: 'bots' });
    const f = await found(p);
    assert.deepEqual([f.players, f.bots], [1, 3]);
    await ok(p, { t: 'room.queueAccept', accept: true });
    const room = await started(p);
    assert.equal(room.hostId, p.id);
    assert.deepEqual(room.seats.map((s) => !!s && s.isBot), [false, true, true, true]);
  });

  test('fallback: two players who chose one start together, AI-filled only when both chose "bots"; a waiter is not taken', async () => {
    const [a, b, w] = await players(pool, 3);
    await queued(w); // keeps waiting for four
    await queued(a);
    await queued(b);
    await wait(FALLBACK_MS + 50);
    await ok(a, { t: 'room.queueFallback', fallback: 'humans' });
    await a.expectNone('room.matchFound');
    await ok(w, { t: 'room.queueFallback', fallback: null });
    await ok(b, { t: 'room.queueFallback', fallback: 'bots' });
    const f = await found(a);
    assert.deepEqual([f.players, f.bots], [2, 0], 'one "humans" choice: no AI');
    await found(b);
    await w.expectNone('room.matchFound');
    for (const c of [a, b]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await started(a);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), [a.id, b.id, null, null]);
    assert.equal((await w.waitFor('room.queueState', (s) => s.queued && s.count === 1)).fallback, null);
  });

  test('SP_MAX_BOTS caps the AI fill without refusing the match', async () => {
    const prev = process.env.SP_MAX_BOTS;
    process.env.SP_MAX_BOTS = '1';
    try {
      const [p] = await players(pool, 1);
      await queued(p, 'HARD');
      await wait(FALLBACK_MS + 50);
      await ok(p, { t: 'room.queueFallback', fallback: 'bots' });
      assert.equal((await found(p)).bots, 1, 'room.matchFound shows the capped fill');
      await ok(p, { t: 'room.queueAccept', accept: true });
      const st = await started(p);
      assert.equal(st.difficulty, 'HARD');
      assert.deepEqual(st.seats.map((s) => s && s.isBot), [false, true, null, null]);
    } finally {
      if (prev == null) delete process.env.SP_MAX_BOTS; else process.env.SP_MAX_BOTS = prev;
    }
  });

  test('a player in a lobby room leaves it to queue; one in a running match is refused', async () => {
    const [host, guest] = await players(pool, 2);
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const room = await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(guest, { t: 'room.join', code: room.code });
    await host.waitFor('room.state', (s) => s.seats[1]?.playerId === guest.id);
    await queued(guest);
    await host.waitFor('room.state', (s) => s.seats[1] === null);
    await err(guest, { t: 'room.ready', ready: true }, ERR.NOT_IN_ROOM);
    await ok(host, { t: 'room.start' });
    await started(host);
    await err(host, { t: 'room.queue', difficulty: 'NORMAL' }, ERR.ROOM_STARTED);
  });
});

describe('랜덤 매칭: confirmation timeout and disconnects', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch,
      queueFallbackMs: 60_000, queueConfirmMs: 1500, queueGraceMs: 1500 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => {
    await pool.closeAll();
    srv.lobby.queue.shutdown();
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('time runs out: the silent members leave (reason timeout), the ones who accepted keep their place', async () => {
    const ps = await players(pool, 4);
    for (const c of ps) await queued(c);
    for (const c of ps) { await found(c); c.clearInbox(); }
    await ok(ps[1], { t: 'room.queueAccept', accept: true });
    await ok(ps[3], { t: 'room.queueAccept', accept: true });
    for (const c of [ps[0], ps[2]]) assert.equal((await c.waitFor('room.queueState', (s) => !s.queued, 5000)).reason, 'timeout');
    const back = await ps[1].waitFor('room.queueState', (s) => s.queued, 5000);
    assert.equal(back.count, 2);
    await ps[3].waitFor('room.queueState', (s) => s.queued);
  });

  test('a waiting player who drops is skipped, then leaves after the grace; a resume within it keeps the place', async () => {
    const ps = await players(pool, 4);
    for (const c of ps.slice(0, 3)) await queued(c);
    await ps[2].terminate();
    await offline(srv, ps[2]);
    await queued(ps[3]); // three connected + one offline: no group
    await ps[3].expectNone('room.matchFound');
    await ps[0].waitFor('room.queueState', (s) => s.queued && s.count === 3, 5000);
    // ps[1] drops and comes back within the grace: still queued, its state resent
    await ps[1].terminate();
    await offline(srv, ps[1]);
    const again = await pool.connect();
    const w = await again.hello('P2', ps[1].token);
    assert.equal(w.resumed, true);
    assert.equal((await again.waitFor('room.queueState', (s) => s.queued)).difficulty, 'NORMAL');
    await again.expectNone('room.queueState', (s) => !s.queued, 600);
  });
});

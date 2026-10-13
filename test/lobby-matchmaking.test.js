// test/lobby-matchmaking.test.js — 랜덤 매칭 (server/matchmaking.js, maintainer decisions 2026-10-13): a per-difficulty
// co-op queue of single players and co-op rooms with empty seats; four humans (never fewer) form a group that every
// human confirms, then the lobby seats them — in the group's oldest queued room, or in queue order in a room of their
// own — and starts its match at once.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';

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
/** A co-op LOBBY room of the host with the guests seated (and ready unless told otherwise). */
async function coopRoom(host, guests, { ready = true, difficulty = 'NORMAL' } = {}) {
  await ok(host, { t: 'room.create', mode: 'coop', difficulty });
  const room = await host.waitFor('room.state', (s) => s.hostId === host.id && s.mode === 'coop');
  for (const [i, g] of guests.entries()) {
    await ok(g, { t: 'room.join', code: room.code });
    await host.waitFor('room.state', (s) => s.seats[i + 1]?.playerId === g.id);
    if (ready) await ok(g, { t: 'room.ready', ready: true });
  }
  if (ready && guests.length) await host.waitFor('room.state', (s) => s.seats.filter((x) => x && !x.isBot).every((x) => x.ready || x.playerId === host.id));
  return room;
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
      queueConfirmMs: 10_000, queueGraceMs: 10_000 });
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

  test('protocol: room.queue / room.queueRoom / room.unqueue / room.queueAccept (no fallback message)', () => {
    assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD' }), null);
    assert.notEqual(validateC2S({ t: 'room.queue', difficulty: 'EASY' }), null);
    assert.notEqual(validateC2S({ t: 'room.queue' }), null);
    assert.equal(validateC2S({ t: 'room.queueRoom' }), null);
    assert.equal(validateC2S({ t: 'room.unqueue' }), null);
    assert.notEqual(validateC2S({ t: 'room.queueFallback', fallback: 'bots' }), null);
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
      assert.deepEqual([f.players, f.accepted, f.mine, f.difficulty], [4, 0, false, 'NORMAL']);
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
    await Promise.all([ps[0], ps[2], ps[3], ps[4]].map((c) => found(c, (m) => m.accepted === 0 && m.players === 4)));
    for (const c of [ps[4], ps[3], ps[2], ps[0]]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await started(ps[0]);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), [ps[0], ps[2], ps[3], ps[4]].map((c) => c.id));
    await err(ps[1], { t: 'room.queueAccept', accept: true }, ERR.WRONG_PHASE);
  });

  test('pong n: the players online (sessions with a live socket), shown beside the ping', async () => {
    const ps = await players(pool, 3);
    const pong = await ps[0].request({ t: 'ping', c: 1 });
    assert.equal(pong.t, 'pong');
    assert.ok(Number.isInteger(pong.n) && pong.n >= 3, JSON.stringify(pong));
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

  test('never fewer than four: three waiting players get no group, however long they wait', async () => {
    const ps = await players(pool, 3);
    for (const c of ps) await queued(c);
    const st = await ps[0].waitFor('room.queueState', (s) => s.queued && s.count === 3);
    assert.equal(st.fallbackInMs, undefined, 'no fallback timer any more');
    assert.equal(st.party, false);
    await wait(300);
    for (const c of ps) await c.expectNone('room.matchFound');
  });

  test('a room queues its empty seats: the host only, every other human ready; its AI seats are freed', async () => {
    const [host, guest] = await players(pool, 2);
    const room = await coopRoom(host, [guest], { ready: false });
    await ok(host, { t: 'room.addBot' });
    await host.waitFor('room.state', (s) => s.seats[2]?.isBot);
    await err(guest, { t: 'room.queueRoom' }, ERR.NOT_HOST);
    await err(host, { t: 'room.queueRoom' }, ERR.NOT_READY);
    await ok(guest, { t: 'room.ready', ready: true });
    await ok(host, { t: 'room.queueRoom' });
    const st = await host.waitFor('room.state', (s) => s.matching === true);
    assert.equal(st.seats[2], null, 'the AI seat is freed');
    for (const c of [host, guest]) {
      const q = await c.waitFor('room.queueState', (s) => s.queued);
      assert.deepEqual([q.party, q.count, q.difficulty], [true, 2, 'NORMAL']);
    }
    // while queued: no join, no AI seat, no difficulty change, no start
    const [other] = await players(pool, 1, 'X');
    await err(other, { t: 'room.join', code: room.code }, ERR.MATCHING);
    await err(host, { t: 'room.addBot' }, ERR.MATCHING);
    await err(host, { t: 'room.setDifficulty', difficulty: 'HARD' }, ERR.MATCHING);
    await err(host, { t: 'room.start' }, ERR.MATCHING);
    // a solo room cannot queue
    const [solo] = await players(pool, 1, 'S');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await solo.waitFor('room.state', (s) => s.hostId === solo.id);
    await err(solo, { t: 'room.queueRoom' }, ERR.BAD_TARGET);
  });

  test('a room of two + two single players: the match starts in that room, the newcomers in its free seats', async () => {
    const [host, guest, a, b] = await players(pool, 4);
    const room = await coopRoom(host, [guest]);
    await ok(host, { t: 'room.queueRoom' });
    await host.waitFor('room.queueState', (s) => s.queued && s.party);
    await queued(a);
    await queued(b);
    for (const c of [host, guest, a, b]) assert.equal((await found(c)).players, 4);
    for (const c of [a, guest, b, host]) await ok(c, { t: 'room.queueAccept', accept: true });
    const states = await Promise.all([host, guest, a, b].map(started));
    for (const st of states) assert.equal(st.code, room.code);
    assert.equal(states[0].hostId, host.id, 'the room keeps its host');
    assert.deepEqual(states[0].seats.map((s) => s && s.playerId), [host.id, guest.id, a.id, b.id]);
    assert.equal(states[0].matching, false);
  });

  test('entries are fitted to four in queue order: a room of three skips a room of two for a single player', async () => {
    const [h3, g3a, g3b, h2, g2, s1] = await players(pool, 6);
    const r3 = await coopRoom(h3, [g3a, g3b]);
    const r2 = await coopRoom(h2, [g2]);
    await ok(h3, { t: 'room.queueRoom' });
    await h3.waitFor('room.queueState', (s) => s.queued && s.count === 3);
    await ok(h2, { t: 'room.queueRoom' });
    await h2.waitFor('room.queueState', (s) => s.queued && s.count === 5);
    for (const c of [h3, h2]) await c.expectNone('room.matchFound');
    await queued(s1);
    for (const c of [h3, g3a, g3b, s1]) await found(c);
    await h2.expectNone('room.matchFound');
    for (const c of [h3, g3a, g3b, s1]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await started(s1);
    assert.equal(st.code, r3.code);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), [h3.id, g3a.id, g3b.id, s1.id]);
    // the room of two still waits
    assert.equal((await g2.waitFor('room.queueState', (s) => s.queued && s.count === 2)).party, true);
    assert.equal(srv.lobby.getRoom(r2.code)?.matching, true);
  });

  test('two rooms of two: the older room hosts the match, the other room closes empty', async () => {
    const [h1, g1, h2, g2] = await players(pool, 4);
    const r1 = await coopRoom(h1, [g1]);
    const r2 = await coopRoom(h2, [g2]);
    await ok(h1, { t: 'room.queueRoom' });
    await h1.waitFor('room.queueState', (s) => s.queued);
    await ok(h2, { t: 'room.queueRoom' });
    for (const c of [h1, g1, h2, g2]) await found(c);
    for (const c of [h1, g1, h2, g2]) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await started(g2);
    assert.equal(st.code, r1.code);
    assert.equal(st.hostId, h1.id);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), [h1.id, g1.id, h2.id, g2.id]);
    assert.equal(srv.lobby.getRoom(r2.code), null, 'the second room is gone');
    await h2.expectNone('room.closed');
  });

  test('a queued room: any member cancels it whole (left / party); a member leaving the room cancels it (changed)', async () => {
    const [host, guest, third] = await players(pool, 3);
    await coopRoom(host, [guest, third]);
    await ok(host, { t: 'room.queueRoom' });
    await guest.waitFor('room.queueState', (s) => s.queued);
    await ok(guest, { t: 'room.unqueue' });
    assert.equal((await guest.waitFor('room.queueState', (s) => !s.queued)).reason, 'left');
    assert.equal((await host.waitFor('room.queueState', (s) => !s.queued)).reason, 'party');
    assert.equal((await third.waitFor('room.queueState', (s) => !s.queued)).reason, 'party');
    for (const c of [host, guest, third]) await c.waitFor('room.state', (s) => s.matching === false);
    // queue again (still ready); the third player leaves the room
    for (const c of [host, guest, third]) c.clearInbox();
    await ok(host, { t: 'room.queueRoom' });
    await host.waitFor('room.queueState', (s) => s.queued);
    await ok(third, { t: 'room.leave' });
    assert.equal((await third.waitFor('room.queueState', (s) => !s.queued)).reason, 'left');
    assert.equal((await host.waitFor('room.queueState', (s) => !s.queued)).reason, 'changed');
    assert.equal((await guest.waitFor('room.queueState', (s) => !s.queued && s.reason === 'changed')).difficulty, 'NORMAL');
    assert.equal(srv.lobby.queue.stats().waiting, 0);
  });

  test('a room member declines: the room leaves the queue (declined / party), the single players go back', async () => {
    const [host, guest, a, b] = await players(pool, 4);
    await coopRoom(host, [guest]);
    await ok(host, { t: 'room.queueRoom' });
    await host.waitFor('room.queueState', (s) => s.queued);
    await queued(a);
    await queued(b);
    for (const c of [host, guest, a, b]) await found(c);
    await ok(a, { t: 'room.queueAccept', accept: true });
    await ok(guest, { t: 'room.queueAccept', accept: false });
    assert.equal((await guest.waitFor('room.queueState', (s) => !s.queued)).reason, 'declined');
    assert.equal((await host.waitFor('room.queueState', (s) => !s.queued)).reason, 'party');
    assert.equal((await a.waitFor('room.queueState', (s) => s.queued && s.count === 2)).party, false);
    await host.waitFor('room.state', (s) => s.matching === false && !s.inMatch);
  });
});

describe('랜덤 매칭: confirmation timeout and disconnects', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch,
      queueConfirmMs: 1500, queueGraceMs: 1500 });
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

// test/lobby-size.test.js — room.setSize { size } (maintainer decision 2026-11-02; server/lobby.js header): the host of a
// co-op room switches it between 4 and 8 seats before the match. 4 → 8 frees the AI seats (the 8-player mode has none);
// 8 → 4 is refused while more than four seats are taken and moves the seated players into the first four seats.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { sizeOption } from '../public/js/screens/room.js';

function clientPool(getUrl) {
  const open = new Set();
  return {
    async player(name) {
      const c = await TestClient.connect(getUrl());
      open.add(c);
      const w = await c.hello(name);
      c.id = w.playerId;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const ids = (state) => state.seats.map((s) => s?.playerId ?? null);

test('protocol: room.setSize takes a room size (4 | 8), nothing else', () => {
  assert.equal(validateC2S({ t: 'room.setSize', size: 4 }), null);
  assert.equal(validateC2S({ t: 'room.setSize', size: 8 }), null);
  for (const size of [undefined, null, 0, 1, 5, 6, '8', 8.5, true]) {
    assert.notEqual(validateC2S({ t: 'room.setSize', size }), null, JSON.stringify(size));
  }
});

test('sizeOption: the host switches while not matchmaking; 4 locked above four seats; the AI seats 8 would free', () => {
  const seat = (i, isBot = false) => ({ seat: i, playerId: `p${i}`, name: `P${i}`, isBot, ready: true, connected: true });
  const four = { mode: 'coop', size: 4, hostId: 'p0', seats: [seat(0), seat(1, true), null, seat(3, true)] };
  assert.equal(sizeOption({ ...four, mode: 'solo', seats: [seat(0)] }, 'p0'), null);
  assert.deepEqual(sizeOption(four, 'p0'), { size: 4, editable: true, shrinkable: true, bots: 2 });
  assert.equal(sizeOption(four, 'p1').editable, false);
  assert.equal(sizeOption({ ...four, matching: true }, 'p0').editable, false);
  const eight = { mode: 'coop', size: 8, hostId: 'p0', seats: [seat(0), seat(1), seat(2), seat(3), null, null, null, null] };
  assert.equal(sizeOption(eight, 'p0').shrinkable, true);
  eight.seats[6] = seat(6);
  assert.equal(sizeOption(eight, 'p0').shrinkable, false);
  assert.equal(sizeOption({ ...four, largeBots: true }, 'p0').bots, 0, 'local debug mode keeps the AI seats');
});

describe('room.setSize (lobby)', () => {
  let srv;
  let pool;
  const errors = [];
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, queueConfirmMs: 10_000, queueGraceMs: 10_000,
      log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); srv.lobby.queue.shutdown(); });
  after(async () => { await srv?.close(); assert.deepEqual(errors, [], 'no server errors logged'); });

  test('4 → 8: host-only, frees the AI seats, keeps the humans in their seats and un-readies the guests', async () => {
    const host = await pool.player('Host');
    const guest = await pool.player('Guest');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const st = await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(host, { t: 'room.addBot' });
    await ok(guest, { t: 'room.join', code: st.code });
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => s.seats[2]?.playerId === guest.id && s.seats[2].ready);
    await err(guest, { t: 'room.setSize', size: 8 }, ERR.NOT_HOST);
    await ok(host, { t: 'room.setSize', size: 8 });
    const big = await guest.waitFor('room.state', (s) => s.size === 8);
    assert.equal(big.seats.length, 8);
    assert.deepEqual(ids(big), [host.id, null, guest.id, null, null, null, null, null], 'the AI seat is freed, the humans keep their seats');
    assert.equal(big.seats[2].ready, false);
    await err(host, { t: 'room.addBot' }, ERR.ROOM_FULL);
    await ok(host, { t: 'room.setSize', size: 8 }); // no change: no error
  });

  test('8 → 4: refused while five seats are taken; with four, they move into the first four seats in seat order', async () => {
    const ps = [];
    for (let i = 0; i < 6; i++) ps.push(await pool.player(`P${i + 1}`));
    await ok(ps[0], { t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 8 });
    const st = await ps[0].waitFor('room.state', (s) => s.hostId === ps[0].id);
    for (const c of ps.slice(1, 5)) await ok(c, { t: 'room.join', code: st.code });
    await ps[0].waitFor('room.state', (s) => !!s.seats[4]);
    await err(ps[0], { t: 'room.setSize', size: 4 }, ERR.ROOM_FULL);
    await ok(ps[2], { t: 'room.leave' });
    await ps[0].waitFor('room.state', (s) => !s.seats[2]);
    await ok(ps[5], { t: 'room.spectate', code: st.code });
    await ps[0].waitFor('room.state', (s) => s.spectators.length === 1);
    await ok(ps[0], { t: 'room.setSize', size: 4 });
    const small = await ps[1].waitFor('room.state', (s) => s.size === 4);
    assert.deepEqual(ids(small), [ps[0].id, ps[1].id, ps[3].id, ps[4].id]);
    assert.deepEqual(small.seats.map((s) => s.seat), [0, 1, 2, 3]);
    assert.equal(small.spectators[0].playerId, ps[5].id, 'spectators stay');
    // the next match is a 4-seat one
    for (const c of [ps[1], ps[3], ps[4]]) await ok(c, { t: 'room.ready', ready: true });
    await ps[0].waitFor('room.state', (s) => s.seats.slice(1).every((x) => x.ready));
    await ok(ps[0], { t: 'room.start' });
    await ps[0].waitFor('room.state', (s) => s.inMatch);
    assert.equal(srv.lobby.rooms.get(st.code).size, 4);
    await err(ps[0], { t: 'room.setSize', size: 8 }, ERR.ROOM_STARTED);
  });

  test('a solo room has no size to change; a matchmaking room keeps its size', async () => {
    const solo = await pool.player('Solo');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await solo.waitFor('room.state', (s) => s.hostId === solo.id);
    await err(solo, { t: 'room.setSize', size: 8 }, ERR.BAD_TARGET);
    const host = await pool.player('Queued');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(host, { t: 'room.queueRoom' });
    await host.waitFor('room.state', (s) => s.matching);
    await err(host, { t: 'room.setSize', size: 8 }, ERR.MATCHING);
    await ok(host, { t: 'room.unqueue' });
    await host.waitFor('room.state', (s) => !s.matching);
    await ok(host, { t: 'room.setSize', size: 8 });
    await host.waitFor('room.state', (s) => s.size === 8);
  });
});

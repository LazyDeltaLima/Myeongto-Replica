// An invitation's room with no player seat (server/lobby.js header 「Spectator seats」, maintainer decision 2026-11-14): a
// refused room.join of a co-op room (ROOM_FULL / ROOM_STARTED / MATCHING) carries the room's summary in its error frame,
// and the page (public/js/ui/inviteSpectate.js) offers a spectator seat — with 자리 예약 — instead of the error toast.
// The browser path: test/ui/spectator.e2e.test.js 「invitation link to a full room」.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { Match } from '../server/match/Match.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, MIN_SPECTATORS, PHASE } from '../shared/constants.js';
import { inviteRefusal, inviteRoomLine } from '../public/js/ui/inviteSpectate.js';

const W = 6000;

describe('a refused room.join says how full the room is', () => {
  let srv;
  let url;
  let open = [];
  const errors = [];
  const log = { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) };

  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log, MatchClass: Match, seedFn: () => 4242 });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  afterEach(async () => {
    await Promise.all(open.map((c) => c.terminate().catch(() => {})));
    open = [];
  });
  after(async () => {
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
  /** A co-op room of a host, a ready guest and two AI seats: every player seat taken. */
  const fullRoom = async () => {
    const host = await player('Host');
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    const { code } = await host.waitFor('room.state', (s) => s.hostId === host.id, W);
    const guest = await player('Guest');
    await ok(guest, { t: 'room.join', code });
    await ok(guest, { t: 'room.ready', ready: true });
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    return { host, guest, code };
  };

  test('ROOM_FULL in the lobby, then ROOM_STARTED with the round; the offer is taken with a reservation', async () => {
    const { host, guest, code } = await fullRoom();
    const watcher = await player('Watcher');
    await ok(watcher, { t: 'room.spectate', code });
    const late = await player('Late');
    const full = await late.request({ t: 'room.join', code }, W);
    assert.equal(full.code, ERR.ROOM_FULL);
    assert.deepEqual(full.room, { players: 4, seats: 4, round: 0, spectators: 1, spectatorSeats: MIN_SPECTATORS });

    await ok(host, { t: 'room.start' });
    await host.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK, W);
    srv.lobby.getRoom(code).match.round = 3; // (the summary only reads it)
    const started = await late.request({ t: 'room.join', code }, W);
    assert.equal(started.code, ERR.ROOM_STARTED);
    assert.deepEqual(started.room, { players: 4, seats: 4, round: 3, spectators: 1, spectatorSeats: MIN_SPECTATORS });

    // what the page then does: a spectator seat, and the reservation (accepted during the match)
    await ok(late, { t: 'room.spectate', code });
    await ok(late, { t: 'room.reserveSeat', on: true });
    const st = await guest.waitFor('room.state', (s) => s.spectators.some((x) => x.playerId === late.id && x.reserved), W);
    assert.equal(st.spectators.find((x) => x.playerId === late.id).reserved, 1);
  });

  test('MATCHING carries it too; a solo room and an unknown key do not', async () => {
    const { code } = await fullRoom();
    const r = srv.lobby.getRoom(code);
    r.seats[3] = null; // a free seat, so only the queue refuses
    r.matching = true; // (the state only: the queue itself is test/matchmaking*.test.js)
    const late = await player('Late');
    const matching = await late.request({ t: 'room.join', code }, W);
    assert.equal(matching.code, ERR.MATCHING);
    assert.equal(matching.room.players, 3);
    r.matching = false;

    const soloHost = await player('Solo');
    await ok(soloHost, { t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    const { code: solo } = await soloHost.waitFor('room.state', (s) => s.hostId === soloHost.id, W);
    const s = await late.request({ t: 'room.join', code: solo }, W);
    assert.equal(s.code, ERR.ROOM_FULL);
    assert.ok(!('room' in s), 'a solo room has no spectator seats to offer');
    const none = await late.request({ t: 'room.join', code: 'ZZZZ' }, W);
    assert.equal(none.code, ERR.ROOM_NOT_FOUND);
    assert.ok(!('room' in none));
  });
});

describe('the invited page: what a refusal turns into (ui/inviteSpectate.js)', () => {
  const room = { players: 4, seats: 4, round: 0, spectators: 1, spectatorSeats: 2 };
  test('an offer for the three refusals with a summary, a toast when the spectator seats are full, nothing else', () => {
    for (const code of [ERR.ROOM_FULL, ERR.ROOM_STARTED, ERR.MATCHING]) {
      assert.deepEqual(inviteRefusal({ code, room }, 'K7QX'), { kind: 'offer', offer: { code: 'K7QX', reason: code, room } });
    }
    assert.deepEqual(inviteRefusal({ code: ERR.ROOM_FULL, room: { ...room, spectators: 2 } }, 'K7QX'), { kind: 'noSeat' });
    assert.equal(inviteRefusal({ code: ERR.ROOM_FULL }, 'K7QX'), null, 'a solo room: the error toast as before');
    assert.equal(inviteRefusal({ code: ERR.ROOM_NOT_FOUND, room }, 'K7QX'), null);
    assert.equal(inviteRefusal(null, 'K7QX'), null);
  });
  test('the room line: seats, waiting room or round, spectator seats', () => {
    assert.equal(inviteRoomLine(room), '博士 4/4 · 等待室 · 观战席 1/2');
    assert.equal(inviteRoomLine({ ...room, round: 3 }), '博士 4/4 · 第 3 回合 · 观战席 1/2');
  });
});

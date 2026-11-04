// Seat reservation through the real platform and the real Match (server/lobby.js header 「Seat reservation」, feat —
// maintainer decision 2026-11-04): a spectator's room.reserveSeat seats it on a free seat when a match ends or restarts,
// or as soon as one comes free in LOBBY — first asked first, free seats only, a dropped spectator skipped.
// The page side: test/ui/spectator.e2e.test.js.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { Match } from '../server/match/Match.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, PHASE } from '../shared/constants.js';

/** generous waits: the whole suite runs these next to heavy files */
const W = 6000;

describe('seat reservation', () => {
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

  const player = async (name, token) => {
    const c = await TestClient.connect(url);
    open.push(c);
    const w = await c.hello(name, token);
    c.id = w.playerId;
    c.token = w.token;
    return c;
  };
  const ok = async (c, msg) => { const r = await c.request(msg, W); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const refused = async (c, msg, code) => { const r = await c.request(msg, W); assert.equal(r.code, code, `${msg.t}: ${JSON.stringify(r)}`); };
  const briefing = (c) => c.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK, W);
  const seated = (st, id) => st.seats.find((x) => x && x.playerId === id) || null;
  const watching = (st, id) => st.spectators.find((x) => x.playerId === id) || null;
  const roomOf = (code) => srv.lobby.getRoom(code);

  /** A co-op room with `humans` players (the first hosts) and `spectators` spectators, all still in LOBBY. */
  const room = async ({ humans = 2, spectators = 1, size } = {}) => {
    const ps = [];
    for (let i = 0; i < humans; i++) ps.push(await player(`P${i + 1}`));
    await ok(ps[0], { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic', ...(size ? { size } : {}) });
    const st = await ps[0].waitFor('room.state', (s) => s.hostId === ps[0].id, W);
    for (const c of ps.slice(1)) {
      await ok(c, { t: 'room.join', code: st.code });
      await ok(c, { t: 'room.ready', ready: true });
    }
    if (humans > 1) await ps[0].waitFor('room.state', (s) => s.seats.filter((x) => x && x.ready).length === humans - 1, W);
    const ss = [];
    for (let i = 0; i < spectators; i++) {
      const s = await player(`S${i + 1}`);
      await ok(s, { t: 'room.spectate', code: st.code });
      ss.push(s);
    }
    return { code: st.code, ps, ss, host: ps[0] };
  };
  const startMatch = async ({ host, ps, code }) => {
    await ok(host, { t: 'room.start' });
    for (const c of ps) await briefing(c);
    return roomOf(code);
  };
  /** The host alone proposes the restart when it is the only voter left; every other voter agrees. */
  const passRestart = async (r, voters) => {
    r.match.phase = PHASE.PREP; // (the phase gate only)
    await ok(voters[0], { t: 'g.restart', op: 'propose' });
    for (const c of voters.slice(1)) {
      await c.waitFor('m.public', (p) => p.restartVote?.by === voters[0].id, W);
      await ok(c, { t: 'g.restart', op: 'yes' });
    }
  };

  test('asking, taking back and the refusals; room.state says the place in the order', async () => {
    const { host, ss: [s1, s2] } = await room({ humans: 2, spectators: 2 });
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await refused(host, { t: 'room.reserveSeat', on: true }, ERR.ALREADY); // a player
    const outsider = await player('Out');
    await refused(outsider, { t: 'room.reserveSeat', on: true }, ERR.NOT_IN_ROOM);
    await ok(s2, { t: 'room.reserveSeat', on: true });
    await ok(s2, { t: 'room.reserveSeat', on: true }); // idempotent
    await ok(s1, { t: 'room.reserveSeat', on: true });
    const st = await host.waitFor('room.state', (x) => watching(x, s1.id)?.reserved === 2, W);
    assert.equal(watching(st, s2.id).reserved, 1, 'first asked first, not first seated');
    await ok(s2, { t: 'room.reserveSeat', on: false });
    const off = await host.waitFor('room.state', (x) => watching(x, s1.id)?.reserved === 1, W);
    assert.ok(!('reserved' in watching(off, s2.id)), 'taken back');
  });

  test('refused while the room is matchmaking', async () => {
    const { code, ss: [s] } = await room({ humans: 2, spectators: 1 });
    roomOf(code).matching = true; // (the state only: the queue itself is test/matchmaking*.test.js)
    await refused(s, { t: 'room.reserveSeat', on: true }, ERR.MATCHING);
    await ok(s, { t: 'room.reserveSeat', on: false });
    roomOf(code).matching = false;
  });

  test('restart vote: the seat of the player who left goes to the spectator, who plays the new match', async () => {
    const ctx = await room({ humans: 3, spectators: 1 });
    const { host, ps: [, stay, gone], ss: [s] } = ctx;
    const r = await startMatch(ctx);
    const first = r.match;
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(gone, { t: 'room.leave' });
    assert.ok(!r.seats.some((x) => x && x.playerId === s.id), 'a running match keeps the seat of the departed');
    await passRestart(r, [host, stay]);
    const st = await s.waitFor('room.state', (x) => x.inMatch && x.matchNo === 2, W);
    assert.ok(seated(st, s.id), 'in the new match');
    assert.equal(seated(st, s.id).seat, 2, 'the freed seat');
    assert.equal(st.spectators.length, 0);
    assert.notEqual(r.match, first);
    await briefing(s);
    assert.ok(r.match.players.has(s.id), 'a player of the new match');
    assert.equal(r.match.spectators.has(s.id), false);
    const priv = await s.waitFor('m.private', () => true, W);
    assert.ok(priv, 'with a private view');
  });

  test('restart vote: nothing free, the reservation waits; an AI seat is not taken', async () => {
    const ctx = await room({ humans: 2, spectators: 1 });
    const { host, ps: [, b], ss: [s] } = ctx;
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    const r = await startMatch(ctx);
    await ok(s, { t: 'room.reserveSeat', on: true });
    await passRestart(r, [host, b]);
    const st = await s.waitFor('room.state', (x) => x.inMatch && x.matchNo === 2, W);
    assert.equal(seated(st, s.id), null);
    assert.equal(watching(st, s.id).reserved, 1);
    assert.equal(st.seats.filter((x) => x?.isBot).length, 2);
    assert.ok(r.match.spectators.has(s.id), 'still watching');
  });

  test('8 seats: the reserved spectator makes the fifth Doctor the new match needs', async () => {
    const ctx = await room({ humans: 5, spectators: 1, size: 8 });
    const { host, ps, ss: [s] } = ctx;
    const r = await startMatch(ctx);
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(ps[4], { t: 'room.leave' });
    await passRestart(r, ps.slice(0, 4));
    const st = await host.waitFor('room.state', (x) => x.inMatch && x.matchNo === 2, W);
    assert.ok(seated(st, s.id));
    assert.equal(st.seats.filter(Boolean).length, 5);
  });

  test('a match that ends: seated, not ready, its result screen still replayed; the host waits for its ready', async () => {
    const ctx = await room({ humans: 2, spectators: 1 });
    const { host, ps: [, b], ss: [s] } = ctx;
    const r = await startMatch(ctx);
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(b, { t: 'room.leave' });
    r.match.finish({ victory: false });
    await s.waitFor('m.result', () => true, W);
    const st = await s.waitFor('room.state', (x) => !x.inMatch && !!seated(x, s.id), W);
    assert.equal(seated(st, s.id).ready, false);
    assert.equal(st.spectators.length, 0);
    assert.ok(r.replay?.frames.has(s.id), 'the replay stays for a reload on the result screen');
    await refused(host, { t: 'room.start' }, ERR.NOT_READY);
    // a reload on the result screen: the seat and the result come back
    await s.terminate();
    const back = await player('S1', s.token);
    const again = await back.waitFor('room.state', (x) => !!seated(x, back.id), W);
    assert.ok(seated(again, back.id));
    await back.waitFor('m.result', () => true, W);
  });

  test('two reservations, one seat: first asked sits, the other moves up; then LOBBY seats come free', async () => {
    const ctx = await room({ humans: 4, spectators: 2 });
    const { host, ps, ss: [s1, s2] } = ctx;
    const r = await startMatch(ctx);
    await ok(s2, { t: 'room.reserveSeat', on: true });
    await ok(s1, { t: 'room.reserveSeat', on: true });
    await ok(ps[3], { t: 'room.leave' });
    r.match.finish({ victory: false });
    const st = await host.waitFor('room.state', (x) => !x.inMatch && !!seated(x, s2.id), W);
    assert.equal(seated(st, s1.id), null);
    assert.equal(watching(st, s1.id).reserved, 1);
    // back in LOBBY a leaver's seat is taken at once, ahead of anyone joining by the code
    await ok(ps[2], { t: 'room.leave' });
    const st2 = await host.waitFor('room.state', (x) => !!seated(x, s1.id), W);
    assert.equal(seated(st2, s1.id).seat, 2);
    assert.equal(st2.spectators.length, 0);
  });

  test('LOBBY: the host removing an AI or raising the size hands over the seat; a free seat seats at once', async () => {
    const ctx = await room({ humans: 2, spectators: 2 });
    const { host, ss: [s1, s2] } = ctx;
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await ok(s1, { t: 'room.reserveSeat', on: true });
    await ok(host, { t: 'room.removeBot', seat: 3 });
    const st = await host.waitFor('room.state', (x) => !!seated(x, s1.id), W);
    assert.equal(seated(st, s1.id).seat, 3);
    assert.equal(st.seats.filter((x) => x?.isBot).length, 1);
    await ok(host, { t: 'room.removeBot', seat: 2 });
    await host.waitFor('room.state', (x) => x.seats[2] === null, W);
    await ok(s2, { t: 'room.reserveSeat', on: true }); // a free seat: asking is sitting
    await host.waitFor('room.state', (x) => seated(x, s2.id)?.seat === 2, W);
  });

  test('LOBBY: raising the size hands the new seats over', async () => {
    const ctx = await room({ humans: 4, spectators: 1 });
    const { host, ss: [s] } = ctx;
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(host, { t: 'room.setSize', size: 8 });
    const st = await host.waitFor('room.state', (x) => x.size === 8 && !!seated(x, s.id), W);
    assert.equal(seated(st, s.id).seat, 4);
  });

  test('a dropped spectator is skipped and keeps its place', async () => {
    const ctx = await room({ humans: 2, spectators: 2 });
    const { host, ps: [, b], ss: [s1, s2] } = ctx;
    const r = await startMatch(ctx);
    await ok(s1, { t: 'room.reserveSeat', on: true });
    await ok(s2, { t: 'room.reserveSeat', on: true });
    await s1.terminate();
    await host.waitFor('room.state', (x) => watching(x, s1.id)?.connected === false, W);
    await ok(b, { t: 'room.leave' });
    r.match.finish({ victory: false });
    const st = await host.waitFor('room.state', (x) => !x.inMatch && !!seated(x, s2.id), W);
    assert.equal(seated(st, s1.id), null);
    assert.equal(watching(st, s1.id).reserved, 1, 'kept, first now');
    assert.equal(st.seats.filter(Boolean).length, 2);
  });

  test('the loadout stored while spectating travels into the seat', async () => {
    const { code, host, ss: [s] } = await room({ humans: 2, spectators: 1 });
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await ok(s, { t: 'room.loadout', entries: {}, ops: {} });
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(host, { t: 'room.removeBot', seat: 2 });
    await host.waitFor('room.state', (x) => seated(x, s.id)?.seat === 2, W);
    assert.deepEqual(roomOf(code).seatOf(s.id).loadout, {});
    assert.deepEqual(roomOf(code).seatOf(s.id).ops, {});
  });

  test('leaving the spectator seat or being removed ends the reservation', async () => {
    const { code, host, ss: [s1, s2] } = await room({ humans: 2, spectators: 2 });
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await ok(s1, { t: 'room.reserveSeat', on: true });
    await ok(s2, { t: 'room.reserveSeat', on: true });
    await ok(s1, { t: 'room.leave' });
    const st = await host.waitFor('room.state', (x) => !watching(x, s1.id) && watching(x, s2.id)?.reserved === 1, W);
    assert.equal(st.spectators.length, 1);
    await ok(host, { t: 'room.removeSpectator', playerId: s2.id });
    await ok(host, { t: 'room.removeBot', seat: 3 });
    await host.waitFor('room.state', (x) => x.seats[3] === null, W);
    assert.equal(roomOf(code).reservedSpectators().length, 0);
  });

  test('no Doctor left: the room closes for its spectators, a reservation keeps nothing alive', async () => {
    const ctx = await room({ humans: 1, spectators: 1 });
    const { host, ss: [s] } = ctx;
    await startMatch(ctx);
    await ok(s, { t: 'room.reserveSeat', on: true });
    await ok(host, { t: 'room.leave' });
    assert.equal((await s.waitFor('room.closed', () => true, W)).reason, 'empty');
  });

  test('the host picks the spectator seats before the match, not during it, kept by the next match', async () => {
    const ctx = await room({ humans: 2, spectators: 1 });
    const { code, host, ps: [, b] } = ctx;
    await ok(host, { t: 'room.setSpectatorSeats', seats: 3 });
    assert.equal(roomOf(code).spectatorSeats, 3);
    const solo = await player('Solo');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await refused(solo, { t: 'room.setSpectatorSeats', seats: 3 }, ERR.BAD_TARGET);
    const r = await startMatch(ctx);
    await refused(host, { t: 'room.setSpectatorSeats', seats: 4 }, ERR.ROOM_STARTED);
    await passRestart(r, [host, b]);
    const st = await host.waitFor('room.state', (x) => x.inMatch && x.matchNo === 2, W);
    assert.equal(st.spectatorSeats, 3);
  });

  test('the drain hand-over keeps the seat count, the reservations and their order', async () => {
    const { code, host, ss: [s1, s2] } = await room({ humans: 2, spectators: 2 });
    await ok(host, { t: 'room.setSpectatorSeats', seats: 3 });
    await ok(host, { t: 'room.addBot' });
    await ok(host, { t: 'room.addBot' });
    await ok(s2, { t: 'room.reserveSeat', on: true });
    await ok(s1, { t: 'room.reserveSeat', on: true });
    const lobby = srv.lobby;
    const snap = JSON.parse(JSON.stringify(lobby.roomSnapshot(roomOf(code))));
    const person = (n) => ({ playerId: `p_${'0'.repeat(9)}${n}`, name: `H${n}`, token: `${n}`.repeat(32) });
    const copy = lobby.adoptRoom({
      ...snap, code: undefined, hostId: null,
      seats: [{ seat: 0, isBot: false, ...person(1) }, null, null, null],
      spectators: [{ ...person(2), reservedSeq: snap.spectators.find((x) => x.name === 'S1').reservedSeq },
        { ...person(3), reservedSeq: snap.spectators.find((x) => x.name === 'S2').reservedSeq }],
    });
    const state = copy.toState();
    assert.deepEqual(state.spectators.map((x) => [x.name, x.reserved]), [['H2', 2], ['H3', 1]]);
    assert.equal(copy.reserveSeq, 2);
    assert.equal(copy.spectatorSeats, 3);
    lobby.disposeRoom(copy, 'empty');
  });
});

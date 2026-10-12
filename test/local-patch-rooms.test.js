// The internal per-room status list: server/local-rooms.js behind GET /healthz/rooms (server/http/routes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startServer } from '../server/index.js';
import { Match as RealMatch } from '../server/match/Match.js';
import { roomRow } from '../server/local-rooms.js';
import { TestClient } from './helpers/wsClient.js';
import { PHASE } from '../shared/constants.js';

const get = (port, path, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

test('GET /healthz/rooms lists each room with its phase and round, inside only', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, MatchClass: RealMatch, seedFn: () => 1312887319 });
  const open = [];
  try {
    const empty = await get(srv.port, '/healthz/rooms');
    assert.equal(empty.status, 200);
    assert.deepEqual(JSON.parse(empty.body), { rooms: [] });

    const a = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.push(a);
    a.id = (await a.hello('방장')).playerId;
    assert.equal((await a.request({ t: 'room.create', mode: 'coop', difficulty: 'HARD' })).t, 'ok');
    await a.waitFor('room.state', (s) => s.hostId === a.id);
    assert.equal((await a.request({ t: 'room.addBot' })).t, 'ok');
    const b = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.push(b);
    await b.hello('대기');
    assert.equal((await b.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' })).t, 'ok');

    let rooms = JSON.parse((await get(srv.port, '/healthz/rooms')).body).rooms;
    assert.equal(rooms.length, 2);
    for (const r of rooms) assert.equal(r.phase, PHASE.LOBBY);

    assert.equal((await a.request({ t: 'room.start' })).t, 'ok');
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    rooms = JSON.parse((await get(srv.port, '/healthz/rooms')).body).rooms;
    const coop = rooms[0]; // running matches first
    assert.equal(coop.mode, 'coop');
    assert.equal(coop.difficulty, 'HARD');
    assert.equal(coop.phase, PHASE.INFO_CHECK);
    assert.equal(coop.humans, 1);
    assert.equal(coop.connected, 1);
    assert.equal(coop.bots, 1);
    assert.ok(typeof coop.stageId === 'string' && coop.matchMin === 0, JSON.stringify(coop));
    assert.ok(srv.lobby.rooms.has(coop.code), 'the code as it is');
    const solo = rooms[1];
    assert.deepEqual([solo.mode, solo.phase, solo.round, solo.matchMin], ['solo', PHASE.LOBBY, 0, null]);

    const proxied = await get(srv.port, '/healthz/rooms', { 'x-forwarded-for': '1.2.3.4' });
    assert.equal(proxied.status, 404);
    assert.ok(!proxied.body.includes(coop.code), 'no room code through the proxy');
  } finally {
    await Promise.all(open.map((c) => c.terminate().catch(() => {})));
    await srv.close();
  }
});

test('roomRow: departed seats are not counted, disconnected humans are', () => {
  const seat = (o) => ({ seat: 0, playerId: 'p', name: 'n', isBot: false, ready: false, connected: true, left: false, ...o });
  const room = {
    code: 'ABCD', mode: 'coop', difficulty: 'ABYSS', createdAt: 0, spectators: [{}],
    seats: [seat({}), seat({ connected: false }), seat({ left: true }), seat({ isBot: true }), null],
    match: { phase: PHASE.PREP, round: 7, stageId: 's', bossId: 'b', startedAt: 60_000, sched: { now: () => 60_000 * 13 } },
  };
  assert.deepEqual(roomRow(room, 60_000 * 15), {
    code: 'ABCD', mode: 'coop', difficulty: 'ABYSS', phase: PHASE.PREP, round: 7, stageId: 's', bossId: 'b',
    humans: 2, connected: 1, bots: 1, spectators: 1, ageMin: 15, matchMin: 12, awayMin: null,
  });
});

test('roomRow awayMin: since the last human dropped, null while one is connected or no drop time is known', () => {
  const seat = (o) => ({ seat: 0, playerId: 'p', name: 'n', isBot: false, ready: false, connected: false, left: false, ...o });
  const row = (seats) => roomRow({ code: 'ABCD', mode: 'solo', difficulty: 'ABYSS', createdAt: 0, spectators: [], seats, match: null }, 60_000 * 30);
  assert.equal(row([seat({ awayAt: 60_000 * 5 }), seat({ awayAt: 60_000 * 21 })]).awayMin, 9, 'the latest drop');
  assert.equal(row([seat({ awayAt: 60_000 * 5 }), seat({ connected: true })]).awayMin, null, 'one still connected');
  assert.equal(row([seat({ awayAt: 60_000 * 5 }), seat({ isBot: true, connected: true })]).awayMin, 25, 'bots do not count');
  assert.equal(row([seat({ awayAt: 60_000 * 25, left: true }), seat({ awayAt: 60_000 * 28 })]).awayMin, 2, 'departed seats do not count');
  assert.equal(row([seat({})]).awayMin, null, 'no drop time');
  assert.equal(row([]).awayMin, null, 'no human');
});

test('GET /healthz/rooms: a dropped solo player leaves connected 0 and awayMin 0 on the running match', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, MatchClass: RealMatch, seedFn: () => 1312887319 });
  const open = [];
  try {
    const a = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.push(a);
    a.id = (await a.hello('솔로')).playerId;
    assert.equal((await a.request({ t: 'room.create', mode: 'solo', difficulty: 'ABYSS' })).t, 'ok');
    assert.equal((await a.request({ t: 'room.start' })).t, 'ok');
    await a.waitFor('m.public', (p) => p.phase === PHASE.INFO_CHECK);
    let [r] = JSON.parse((await get(srv.port, '/healthz/rooms')).body).rooms;
    assert.deepEqual([r.connected, r.awayMin], [1, null]);
    await a.terminate();
    for (let i = 0; i < 50 && r.connected; i++) {
      await new Promise((res) => setTimeout(res, 20));
      [r] = JSON.parse((await get(srv.port, '/healthz/rooms')).body).rooms;
    }
    assert.deepEqual([r.humans, r.connected, r.awayMin], [1, 0, 0], JSON.stringify(r));
  } finally {
    await Promise.all(open.map((c) => c.terminate().catch(() => {})));
    await srv.close();
  }
});

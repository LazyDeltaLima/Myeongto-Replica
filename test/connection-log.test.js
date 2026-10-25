// test/connection-log.test.js — the connection log (server/lobby.js 「Seat log」, server/net.js 「Hello log」,
// server/http/websocket.js refusals): a seated player's drop, return, leave and expiry, a refused or unknown token, and
// a refused upgrade each leave one line, so a "could not reconnect" report can be traced in the server log.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';

const WINDOW = 600; // stands in for the 10-minute reconnect window

describe('connection log', () => {
  let srv;
  let url;
  const open = new Set();
  const lines = [];
  const errors = [];
  const log = {
    info: (...a) => lines.push(a.map(String).join(' ')),
    warn: (...a) => lines.push(a.map(String).join(' ')),
    debug() {},
    error: (...a) => errors.push(a.map(String).join(' ')),
  };

  before(async () => {
    srv = await startServer({
      port: 0, host: '127.0.0.1', log, MatchClass: StubMatch, reconnectWindowMs: WINDOW, maxConnectionsPerAddr: 1,
    });
    url = `ws://127.0.0.1:${srv.port}/ws`;
  });
  afterEach(async () => {
    await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
    open.clear();
    await delay(20);
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(errors, [], 'no server errors logged');
  });

  async function connect(wsOptions = {}) {
    const c = await TestClient.connect(url, { wsOptions });
    open.add(c);
    return c;
  }
  async function player(name, token, extra) {
    const c = await connect();
    const w = await c.hello(name, token, extra);
    Object.assign(c, { id: w.playerId, token: w.token, resumed: w.resumed });
    return c;
  }
  /** A co-op match of Host + Guest; returns the room code. */
  async function coopMatch(host, guest) {
    assert.equal((await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok');
    const { code } = await host.waitFor('room.state', (s) => s.hostId === host.id);
    assert.equal((await guest.request({ t: 'room.join', code })).t, 'ok');
    assert.equal((await guest.request({ t: 'room.ready', ready: true })).t, 'ok');
    assert.equal((await host.request({ t: 'room.start' })).t, 'ok');
    await host.waitFor('room.state', (s) => s.inMatch);
    return code;
  }
  const since = (n) => lines.slice(n);
  const has = (got, re) => got.some((l) => re.test(l));

  test('a seated player who drops, comes back and leaves the match: one line each, with round and phase', async () => {
    const host = await player('Host');
    const guest = await player('Guest');
    const code = await coopMatch(host, guest);
    const n = lines.length;
    await guest.terminate();
    await host.waitFor('room.state', (s) => s.seats.some((x) => x?.playerId === guest.id && !x.connected));
    const back = await player('Guest', guest.token);
    assert.equal(back.resumed, true);
    assert.equal((await back.request({ t: 'g.leave' })).t, 'ok');
    const got = since(n);
    const who = `\\[lobby\\] ${code} Guest \\(${guest.id}\\)`;
    assert.ok(has(got, new RegExp(`^${who} dropped \\(R\\d+ \\w+\\)$`)), got.join('\n'));
    assert.ok(has(got, new RegExp(`^${who} back after \\d+ s \\(R\\d+ \\w+\\)$`)), got.join('\n'));
    assert.ok(has(got, new RegExp(`^${who} left the match \\(R\\d+ \\w+\\)$`)), got.join('\n'));
  });

  test('a new socket that takes over a socket the server still holds is logged as a return', async () => {
    const host = await player('Host');
    const guest = await player('Guest');
    const code = await coopMatch(host, guest);
    const n = lines.length;
    const again = await player('Guest', guest.token);
    assert.equal(again.resumed, true);
    assert.ok(has(since(n), new RegExp(`^\\[lobby\\] ${code} Guest \\(${guest.id}\\) back on a new socket`)), since(n).join('\n'));
  });

  test('a hello refused with SESSION_IN_USE says so', async () => {
    const a = await player('Twin');
    const n = lines.length;
    const b = await connect();
    const r = await b.request({ t: 'hello', name: 'Twin', version: 1, token: a.token, noReplace: true });
    assert.equal(r.code, ERR.SESSION_IN_USE);
    assert.ok(has(since(n), new RegExp(`^\\[net\\] Twin: hello for ${a.id} refused, session in use \\(no-replace, its socket last answered \\d+ s ago\\)$`)),
      since(n).join('\n'));
  });

  test('a takeover hello replaces the socket that holds the session, and says so', async () => {
    const a = await player('Twin');
    const n = lines.length;
    const b = await connect();
    const w = await b.hello('Twin', a.token, { noReplace: true, takeover: true });
    assert.equal(w.resumed, true);
    assert.equal(w.playerId, a.id);
    assert.equal((await a.closed).code, 4001);
    assert.ok(has(since(n), new RegExp(`^\\[net\\] Twin: hello for ${a.id} took the session over from its other socket, its socket last answered \\d+ s ago$`)),
      since(n).join('\n'));
  });

  test('a refused hello probes the held socket: silent, the retry replaces it; answering, the retry is refused again', async () => {
    // a phone that slept: its socket is open but answers nothing, not even the protocol ping
    const asleep = await connect({ autoPong: false });
    const a = Object.assign(asleep, { id: (await asleep.hello('Sleeper')).playerId });
    const token = (await a.hello('Sleeper')).token;
    const awake = await player('Awake');
    const n = lines.length;
    const b = await connect(), c = await connect();
    const hello = (cl, name, tok) => cl.request({ t: 'hello', name, version: 1, token: tok, noReplace: true });
    assert.equal((await hello(b, 'Sleeper', token)).code, ERR.SESSION_IN_USE);
    assert.equal((await hello(c, 'Awake', awake.token)).code, ERR.SESSION_IN_USE);
    await delay(1700);
    const back = await hello(b, 'Sleeper', token);
    assert.equal(back.t, 'welcome');
    assert.equal(back.playerId, a.id);
    assert.equal((await a.closed).code, 4001);
    assert.equal((await hello(c, 'Awake', awake.token)).code, ERR.SESSION_IN_USE);
    assert.ok(has(since(n), new RegExp(`^\\[net\\] Sleeper: hello for ${a.id} replaced a socket that did not answer a probe, its socket last answered \\d+ s ago$`)),
      since(n).join('\n'));
  });

  test('an expired seat: the expiry, then the old token starting over as a new session', async () => {
    const host = await player('Host');
    const guest = await player('Guest');
    const code = await coopMatch(host, guest);
    const n = lines.length;
    await guest.terminate();
    await delay(WINDOW + 700);
    const back = await player('Guest', guest.token);
    assert.equal(back.resumed, false);
    const got = since(n);
    assert.ok(has(got, new RegExp(`^\\[lobby\\] ${code} Guest \\(${guest.id}\\) reconnect window expired, removed \\(R\\d+ \\w+\\)$`)), got.join('\n'));
    assert.ok(has(got, new RegExp(`^\\[net\\] Guest: token not known, new session ${back.id}$`)), got.join('\n'));
    assert.ok(!has(got, /back after/), 'no return was logged');
  });

  test('a refused upgrade is logged once per 10 s, with the forwarded address', async () => {
    const headers = { 'X-Forwarded-For': '203.0.113.7' };
    await connect({ headers });
    const n = lines.length;
    for (let i = 0; i < 3; i++) await assert.rejects(connect({ headers }));
    const got = since(n).filter((l) => l.startsWith('[ws]'));
    assert.deepEqual(got, ['[ws] refused (per-address) 203.0.113.7'], got.join('\n'));
  });
});

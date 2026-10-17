// test/local-generation.test.js — deploys that keep running matches: the server generation (server/local-generation.js:
// SP_GEN, accept / drain / standby, the cookie, /healthz/accept, the drain's refusals and its own end, SIGUSR2 words in
// server/http/boot.js) and the page side (public/js/ui/generation.js). docs/rules/ui.md 「무중단 배포」.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import {
  Generation, HandoffInbox, genName, parseGenControl, roomNeedsServer, AWAY_MIN, STALE_MIN, END_GRACE_MIN, DRAIN_CUT_MIN, DRAIN_MAX_MIN,
  HANDOFF_GRACE_MIN, HANDOFF_MAX_MIN,
} from '../server/local-generation.js';
import { RestartNotice } from '../server/local-restart.js';
import { S2C } from '../shared/protocol.js';
import { ERR, PHASE } from '../shared/constants.js';
import {
  installGeneration, genUrl, takeMoved, MOVE_DELAY_MS, TAB_ASK_MS, TAB_RETRY_MS, MATCH_POLL_MS, MOVED_KEY, MOVED_MAX_MS,
} from '../public/js/ui/generation.js';
import { updatedLines } from '../public/js/ui/updateNotice.js';
import { APP_VERSION } from '../shared/constants.js';
import { bannerVisible } from '../public/js/ui/connBanner.js';
import { store } from '../public/js/store.js';
import { TestClient } from './helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN = 60_000;

const get = (port, p, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

/** A lobby room as server/local-rooms.js roomRow reads it. */
function room(code, { match = null, seats = [], createdAt = 0 } = {}) {
  return { code, mode: 'solo', difficulty: 'FUNNY', match, seats, spectators: [], createdAt };
}
const running = (now, startedMinAgo) => ({ phase: 'PREP', round: 3, sched: { now: () => now }, startedAt: now - startedMinAgo * MIN });

describe('server generation: pieces', () => {
  test('SP_GEN names the slot; the restart file carries the state words', () => {
    assert.equal(genName({ SP_GEN: 'a' }), 'a');
    assert.equal(genName({ SP_GEN: ' b ' }), 'b');
    for (const v of [undefined, '', 'A', 'a-b', 'toolongname']) assert.equal(genName({ SP_GEN: v }), null, String(v));
    for (const w of ['accept', 'drain', 'standby', ' DRAIN\n']) assert.equal(parseGenControl(w), w.trim().toLowerCase());
    for (const w of ['30', 'cancel', 'go', '']) assert.equal(parseGenControl(w), null, w);
    assert.ok(S2C.includes('server.gen'));
    assert.equal(ERR.NEW_VERSION, 'NEW_VERSION');
    assert.deepEqual([AWAY_MIN, STALE_MIN, END_GRACE_MIN, DRAIN_CUT_MIN, DRAIN_MAX_MIN], [10, 60, 10, 150, 180]);
  });

  test('which rooms keep a draining server', () => {
    const now = 1000 * MIN;
    const on = { playerId: 'p', connected: true };
    const offFor = (m) => ({ playerId: 'p', connected: false, awayAt: now - m * MIN });
    assert.equal(roomNeedsServer(room('A', { match: running(now, 90), seats: [on] }), now), true, 'a connected player, whatever the age');
    assert.equal(roomNeedsServer(room('B', { match: running(now, 90), seats: [offFor(AWAY_MIN - 1)] }), now), true, 'a short drop');
    assert.equal(roomNeedsServer(room('C', { match: running(now, 5), seats: [offFor(AWAY_MIN)] }), now), false, 'parked');
    assert.equal(roomNeedsServer(room('D', { match: running(now, STALE_MIN - 1), seats: [{ playerId: 'p', connected: false }] }), now), true, 'no drop time: young match');
    assert.equal(roomNeedsServer(room('E', { match: running(now, STALE_MIN), seats: [{ playerId: 'p', connected: false }] }), now), false, 'no drop time: old match');
    assert.equal(roomNeedsServer(room('F', { seats: [on] }), now), false, 'a waiting room never');
    assert.equal(roomNeedsServer(room('G', { seats: [on] }), now, now - (END_GRACE_MIN - 1) * MIN), true, 'settlement after a drained match');
    assert.equal(roomNeedsServer(room('H', { seats: [on] }), now, now - END_GRACE_MIN * MIN), false, 'settlement grace over');
    assert.equal(roomNeedsServer(room('I', { seats: [offFor(0)] }), now, now), false, 'settlement nobody sees');
    assert.equal(PHASE.LOBBY, 'LOBBY');
  });

  test('an unnamed server never moves; a named one starts as SP_GEN_START says, drain is one-way', () => {
    const network = { conns: new Map(), reply: () => true };
    const lobby = { rooms: new Map(), now: () => 0, queue: { shutdown() {} }, disposeRoom() {} };
    const plain = new Generation({ lobby, network, env: {} });
    assert.equal(plain.state, 'accept');
    assert.equal(plain.set('drain'), false);
    assert.equal(plain.cookie(true), null);
    assert.equal(plain.welcomeInfo(), null);
    const g = new Generation({ lobby, network, env: { SP_GEN: 'b', SP_GEN_START: 'standby' } });
    assert.equal(g.state, 'standby');
    assert.equal(g.cookie(true), 'sp_gen=b; Path=/; Max-Age=86400; SameSite=Lax; Secure');
    assert.equal(g.cookie(false), 'sp_gen=b; Path=/; Max-Age=86400; SameSite=Lax');
    assert.deepEqual(g.welcomeInfo(), { gen: { id: 'b', state: 'standby' } });
    assert.equal(g.set('accept'), true);
    assert.equal(g.refusal(), null);
    let drained = 0;
    g.onDrained = () => { drained++; };
    assert.equal(g.set('drain'), true);
    assert.equal(drained, 1, 'nothing to wait for: at once');
    assert.deepEqual(g.refusal(), { error: ERR.NEW_VERSION });
    assert.equal(g.set('accept'), false, 'no way back');
    g.close();
  });

  test('the drain waits for its matches, starts the countdown at 150 min and stops when it is due', () => {
    const t0 = 0;
    let now = t0;
    const network = { conns: new Map(), reply: () => true };
    const r = room('LIVE', { match: { phase: 'PREP', round: 1, sched: { now: () => now }, startedAt: 0 }, seats: [{ playerId: 'p', connected: true }] });
    const lobby = { rooms: new Map([['LIVE', r]]), now: () => now, queue: { shutdown() {} }, disposeRoom() {} };
    const restart = new RestartNotice({ network, now: () => now, noStartMin: 0 });
    const g = new Generation({ lobby, network, restart, env: { SP_GEN: 'a' }, checkMs: 3_600_000 });
    let drained = 0;
    g.onDrained = () => { drained++; };
    g.set('drain');
    assert.equal(drained, 0);
    now = (DRAIN_CUT_MIN - 1) * MIN; g.check();
    assert.equal(restart.at, null, 'no countdown yet');
    now = DRAIN_CUT_MIN * MIN; g.check();
    assert.equal(restart.inMs(), (DRAIN_MAX_MIN - DRAIN_CUT_MIN) * MIN, 'the countdown for what is left');
    now = DRAIN_MAX_MIN * MIN - 1; g.check();
    assert.equal(drained, 0);
    now = DRAIN_MAX_MIN * MIN; g.check();
    assert.equal(drained, 1, 'due: the process ends');
    g.check();
    assert.equal(drained, 1, 'once');
    restart.close(); g.close();
  });
});

describe('server generation: a real server', () => {
  let srv;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.welcome = await c.hello(name);
    return c;
  };
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true, genEnv: { SP_GEN: 'a', SP_GEN_START: 'standby' } });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); });

  test('standby → accept → drain: cookie, /healthz/accept, welcome, refusals, waiting rooms closed, matches kept', async () => {
    let drained = 0;
    srv.generation.onDrained = () => { drained++; };
    const page = await get(srv.port, '/');
    assert.match(String(page.headers['set-cookie']), /^sp_gen=a; Path=\/; Max-Age=86400; SameSite=Lax$/);
    assert.match(String((await get(srv.port, '/', { 'x-forwarded-proto': 'https' })).headers['set-cookie']), /; Secure$/);
    assert.equal((await get(srv.port, '/healthz')).headers['set-cookie'], undefined, 'pages only');
    assert.equal((await get(srv.port, '/healthz/accept')).status, 503, 'standby');
    srv.generation.set('accept');
    assert.equal((await get(srv.port, '/healthz/accept')).status, 200);
    assert.equal((await get(srv.port, '/healthz/accept', { 'x-forwarded-for': '1.2.3.4' })).status, 200, 'through the proxy too');

    const playing = await player('Playing');
    assert.deepEqual(playing.welcome.gen, { id: 'a', state: 'accept' });
    await playing.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    const started = await playing.request({ t: 'room.start' });
    assert.equal(started.t, 'ok', JSON.stringify(started));
    const waiting = await player('Waiting');
    await waiting.request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' });
    const title = await player('Title');

    srv.generation.set('drain');
    assert.equal((await waiting.waitFor('room.closed')).reason, 'newVersion');
    for (const c of [playing, waiting, title]) assert.equal((await c.waitFor('server.gen')).state, 'drain');
    assert.equal((await get(srv.port, '/healthz/accept')).status, 503);
    const inside = JSON.parse((await get(srv.port, '/healthz')).body);
    assert.deepEqual([inside.gen, inside.genState], ['a', 'drain']);
    const outside = JSON.parse((await get(srv.port, '/healthz', { 'x-forwarded-for': '1.2.3.4' })).body);
    assert.deepEqual([outside.gen, outside.draining], ['a', true]);
    for (const msg of [{ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' }, { t: 'room.join', code: 'ABCDEF' }, { t: 'room.queue', difficulty: 'FUNNY' }]) {
      const r = await title.request(msg);
      assert.equal(r.code, ERR.NEW_VERSION, JSON.stringify(msg));
    }
    assert.deepEqual((await player('Late')).welcome.gen, { id: 'a', state: 'drain' });
    assert.equal(srv.lobby.rooms.size, 1, 'the running match stays');
    srv.generation.check();
    assert.equal(drained, 0, 'its player is connected');
  });
});

describe('server generation: waiting rooms handed to the new server', () => {
  let dir, a, b;
  const open = new Set();
  const connect = async (srv, name, token) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.welcome = await c.hello(name, token);
    return c;
  };
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sp-handoff-'));
    const env = (gen) => ({ SP_GEN: gen, SP_GEN_HANDOFF_DIR: dir });
    a = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true, genEnv: env('a') });
    b = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true, genEnv: env('b') });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await a?.close(); await b?.close(); rmSync(dir, { recursive: true, force: true }); });

  test('drain: the waiting room comes back on the new server with its code, host, seats, AI seat and settings', async () => {
    const host = await connect(a, 'Host');
    await host.request({ t: 'room.create', mode: 'coop', difficulty: 'HARD', ruleset: 'casual' });
    await host.request({ t: 'room.addBot' });
    const code = (await host.waitFor('room.state', (m) => m.seats.some((s) => s?.isBot))).code;
    const guest = await connect(a, 'Guest');
    assert.equal((await guest.request({ t: 'room.join', code })).t, 'ok');
    await guest.request({ t: 'room.ready', ready: true });
    await host.request({ t: 'room.setAiPicksLast', on: true });
    const solo = await connect(a, 'Solo');
    await solo.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });

    a.generation.set('drain');
    for (const c of [host, guest, solo]) {
      const closed = await c.waitFor('room.closed');
      assert.deepEqual([closed.reason, closed.moved], ['newVersion', true]);
    }
    const files = readdirSync(dir).filter((n) => n.endsWith('.json'));
    assert.equal(files.length, 2, 'one file per room');
    assert.ok(files.every((n) => n.startsWith('a-')));
    assert.equal(statSync(path.join(dir, files[0])).mode & 0o777, 0o600, 'the tokens stay private');
    assert.ok(readdirSync(dir).every((n) => !n.endsWith('.tmp')));

    // the host's page reloads onto b with its token: the room is rebuilt there and the hello resumes the seat
    const host2 = await connect(b, 'Host', host.welcome.token);
    assert.equal(host2.welcome.resumed, true);
    assert.equal(host2.welcome.playerId, host.welcome.playerId, 'same player');
    let st = await host2.waitFor('room.state');
    assert.equal(st.code, code);
    assert.equal(st.hostId, host.welcome.playerId);
    assert.deepEqual([st.mode, st.difficulty, st.ruleset.preset, st.aiPicksLast], ['coop', 'HARD', 'casual', true]);
    const seatOf = (state, id) => state.seats.find((s) => s?.playerId === id);
    assert.equal(seatOf(st, host.welcome.playerId).connected, true);
    assert.equal(seatOf(st, guest.welcome.playerId).connected, false, 'not back yet');
    assert.equal(seatOf(st, guest.welcome.playerId).ready, false, 'readies start over');
    assert.equal(st.seats.filter((s) => s?.isBot).length, 1);
    assert.equal(readdirSync(dir).filter((n) => n.endsWith('.json')).length, 1, 'the taken file is gone');

    const guest2 = await connect(b, 'Guest', guest.welcome.token);
    assert.equal(guest2.welcome.resumed, true);
    st = await host2.waitFor('room.state', (m) => m.seats.some((s) => s?.playerId === guest.welcome.playerId && s.connected));
    assert.equal(st.code, code);
    const solo2 = await connect(b, 'Solo', solo.welcome.token);
    assert.equal((await solo2.waitFor('room.state')).mode, 'solo');
    assert.equal(readdirSync(dir).filter((n) => n.endsWith('.json')).length, 0);
    const room = b.lobby.getRoom(code);
    assert.ok(room && b.lobby.graceTimers.size === 0, 'everyone is back: no grace left');
    await guest2.request({ t: 'room.ready', ready: true });
    const started = await host2.request({ t: 'room.start' });
    assert.equal(started.t, 'ok', `the room plays on the new server: ${JSON.stringify(started)}`);
    assert.equal((await connect(b, 'Stranger', 'f'.repeat(32))).welcome.resumed, false, 'an unknown token is a new player');
  });

  test('a match that ends during the drain hands its room over once it is back in its lobby', async () => {
    const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true, genEnv: { SP_GEN: 'c', SP_GEN_HANDOFF_DIR: dir } });
    try {
      const p = await connect(srv, 'Player');
      await p.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
      assert.equal((await p.request({ t: 'room.start' })).t, 'ok');
      srv.generation.set('drain');
      assert.equal(readdirSync(dir).filter((n) => n.startsWith('c-')).length, 0, 'a running match is not handed over');
      const room = [...srv.lobby.rooms.values()][0];
      srv.lobby.onMatchEnd(room, room.matchCtx, { reason: 'test' });
      await new Promise((r) => setImmediate(r));
      assert.equal(readdirSync(dir).filter((n) => n.startsWith('c-')).length, 1);
      assert.equal(srv.lobby.rooms.size, 1, 'the old server keeps it for the settlement screen');
      const back = await connect(b, 'Player', p.welcome.token);
      assert.equal((await back.waitFor('room.state')).code, room.code);
    } finally { await srv.close(); }
  });

  test('the new server keeps the absent players\' seats for the handoff grace; the inbox drops old files unread', () => {
    assert.deepEqual([HANDOFF_GRACE_MIN, HANDOFF_MAX_MIN], [3, 30]);
    const box = mkdtempSync(path.join(tmpdir(), 'sp-inbox-'));
    try {
      let now = 100 * MIN;
      const inbox = new HandoffInbox(box, () => now);
      const doc = (at, token) => JSON.stringify({ v: 1, from: 'a', at, room: { code: 'ABCD', seats: [{ seat: 0, isBot: false, token }], spectators: [] } });
      writeFileSync(path.join(box, 'a-old-ABCD.json'), doc(now - (HANDOFF_MAX_MIN + 1) * MIN, 'a'.repeat(32)));
      writeFileSync(path.join(box, 'a-new-ABCD.json'), doc(now, 'b'.repeat(32)));
      writeFileSync(path.join(box, 'broken.json'), '{');
      assert.equal(inbox.find('a'.repeat(32)), null);
      assert.deepEqual(readdirSync(box), ['a-new-ABCD.json'], 'the old and the broken file are deleted');
      const e = inbox.find('b'.repeat(32));
      assert.equal(e.room.code, 'ABCD');
      now += (HANDOFF_MAX_MIN + 1) * MIN;
      assert.equal(inbox.find('b'.repeat(32)), null, 'too old by now');
      assert.deepEqual(readdirSync(box), []);
      assert.equal(JSON.parse(doc(0, 'x')).v, 1);
      assert.equal(typeof readFileSync, 'function');
    } finally { rmSync(box, { recursive: true, force: true }); }
  });
});

describe('server generation: the process (server/http/boot.js)', () => {
  test('SIGUSR2 + the state words move it; a drain with nothing to keep ends the process with 0', { skip: process.platform === 'win32' && 'POSIX signal', timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-gen-'));
    const file = path.join(dir, 'restart');
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT, env: { ...process.env, PORT: '0', HOST: '127.0.0.1', SP_RESTART_FILE: file, SP_GEN: 'b', SP_GEN_START: 'standby' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let exited = null;
    const waiting = new Set();
    const settle = () => { for (const w of [...waiting]) w(); };
    child.stdout.on('data', (d) => { out += d; settle(); });
    child.stderr.on('data', (d) => { out += d; settle(); });
    child.on('exit', (code, signal) => { exited = { code, signal }; settle(); });
    const waitFor = (ok) => new Promise((resolve, reject) => {
      const done = (err) => { clearTimeout(timer); waiting.delete(check); if (err) reject(err); else resolve(); };
      const check = () => { if (ok()) done(); else if (exited) done(new Error(`child exited ${JSON.stringify(exited)}; output:\n${out}`)); };
      const timer = setTimeout(() => done(new Error(`timed out; output:\n${out}`)), 60_000);
      waiting.add(check);
      check();
    });
    try {
      await waitFor(() => /Local:/.test(out));
      writeFileSync(file, 'accept\n');
      child.kill('SIGUSR2');
      await waitFor(() => /\[gen\] b → accept/.test(out));
      writeFileSync(file, 'drain\n');
      child.kill('SIGUSR2');
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no exit; output:\n${out}`)), 60_000);
        const check = () => { if (exited) { clearTimeout(timer); waiting.delete(check); resolve(); } };
        waiting.add(check);
        check();
      });
      assert.match(out, /\[gen\] b drained \(no room needs this server\)/);
      assert.deepEqual(exited, { code: 0, signal: null }, out);
    } finally {
      if (!exited) child.kill('SIGTERM');
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('server generation: the page (public/js/ui/generation.js)', () => {
  /** A fake page: net events, timers run by hand, a BroadcastChannel bus shared by the tabs. */
  function harness(bus) {
    const on = new Map();
    const timers = [];
    const t = {
      reloads: 0, dropped: 0, inMatch: false, inRoom: false, kept: [],
      net: { url: null, on: (type, fn) => on.set(type, fn) },
      emit: (type, msg) => on.get(type)(msg),
      timers,
      run: async (ms) => {
        const due = timers.filter((x) => !x.done && x.ms <= ms);
        for (const x of due) { x.done = true; x.fn(); }
        await new Promise((r) => setImmediate(r));
      },
    };
    const channel = { onmessage: null, postMessage: (m) => { for (const c of bus) if (c !== channel) c.onmessage?.({ data: m }); }, close() {} };
    bus.push(channel);
    t.gen = installGeneration({
      net: t.net, inMatch: () => t.inMatch, wsUrl: () => 'wss://host/ws',
      reload: () => { t.reloads++; }, dropCookie: () => { t.dropped++; }, makeChannel: () => channel,
      remember: (m) => { t.kept.push(m); }, inRoom: () => t.inRoom,
      setTimeout: (fn, ms) => { const x = { fn, ms, done: false }; timers.push(x); return x; },
      clearTimeout: (x) => { if (x) x.done = true; },
    });
    return t;
  }

  afterEach(() => store.patch('ui', { genMove: null, buildStale: false }));

  test('the tab stays on its server: ws and healthz carry ?gen', () => {
    assert.equal(genUrl('/healthz', 'a'), '/healthz?gen=a');
    assert.equal(genUrl('/x?y=1', 'b'), '/x?y=1&gen=b');
    assert.equal(genUrl('/healthz', null), '/healthz');
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    assert.equal(p.net.url, 'wss://host/ws?gen=a');
    p.emit('welcome', {});
    assert.equal(p.net.url, null, 'an unnamed server: the default URL');
    p.emit('server.gen', { state: 'drain' });
    assert.equal(p.timers.length, 0, 'nothing to move away from');
    p.gen.close();
  });

  test('outside a match: the move dialog, then 3 s later the cookie goes, the move is remembered and the page reloads', async () => {
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    p.emit('server.gen', { id: 'a', state: 'drain' });
    assert.equal(store.get().ui.genMove, 'soon');
    assert.equal(bannerVisible({ status: 'online' }, true, false, false, false, 'soon'), false, 'the dialog (ui/updateNotice.js), not the banner');
    assert.equal(p.timers[0].ms, MOVE_DELAY_MS);
    await p.run(MOVE_DELAY_MS);
    await p.run(TAB_ASK_MS);
    assert.deepEqual([p.dropped, p.reloads], [1, 1]);
    assert.equal(p.kept.length, 1);
    assert.deepEqual([p.kept[0].from, p.kept[0].room], [APP_VERSION, false]);
    p.gen.close();
  });

  test('a waiting room handed over: the room move dialog, and the reloaded page knows it had a room', async () => {
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    p.emit('room.closed', { reason: 'newVersion', moved: true });
    p.emit('server.gen', { id: 'a', state: 'drain' });
    assert.equal(store.get().ui.genMove, 'room');
    await p.run(MOVE_DELAY_MS);
    await p.run(TAB_ASK_MS);
    assert.equal(p.reloads, 1);
    assert.equal(p.kept[0].room, true);
    p.gen.close();
    // a settlement screen still in its room when the match ended during the drain counts too
    const q = harness([]);
    q.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    q.inRoom = true;
    q.emit('server.gen', { id: 'a', state: 'drain' });
    assert.equal(store.get().ui.genMove, 'soon');
    await q.run(MOVE_DELAY_MS);
    await q.run(TAB_ASK_MS);
    assert.equal(q.kept[0].room, true);
    q.gen.close();
  });

  test('the reloaded page reads the move once; an old or broken one is not reported', () => {
    const mem = () => {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    };
    const st = mem();
    st.setItem(MOVED_KEY, JSON.stringify({ from: '1.4.6', room: true, at: 1000 }));
    assert.deepEqual(takeMoved(st, 1000 + MOVED_MAX_MS), { from: '1.4.6', room: true });
    assert.equal(takeMoved(st, 2000), null, 'once');
    st.setItem(MOVED_KEY, JSON.stringify({ from: '1.4.6', room: false, at: 0 }));
    assert.equal(takeMoved(st, MOVED_MAX_MS + 1), null, 'too old');
    st.setItem(MOVED_KEY, '{not json');
    assert.equal(takeMoved(st, 0), null);
    assert.equal(takeMoved(null, 0), null, 'no storage');
    assert.equal(updatedLines({ from: '1.4.6', room: false }, false, '1.4.7').length, 1);
    assert.equal(updatedLines({ from: '1.4.6', room: true }, true, '1.4.7').length, 2);
    assert.notEqual(updatedLines({ from: '1.4.6', room: true }, true, '1.4.7')[1], updatedLines({ from: '1.4.6', room: true }, false, '1.4.7')[1], 'moved vs not moved');
    assert.notEqual(updatedLines({ from: '1.4.7', room: false }, false, '1.4.7')[0], updatedLines({ from: '1.4.6', room: false }, false, '1.4.7')[0], 'same version: no arrow');
  });

  test('a closed waiting room, a NEW_VERSION refusal or a draining welcome move the page too', async () => {
    for (const trigger of [['room.closed', { reason: 'newVersion' }], ['error', { code: 'NEW_VERSION' }], ['welcome', { gen: { id: 'a', state: 'drain' } }]]) {
      const p = harness([]);
      p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
      p.emit(...trigger);
      await p.run(MOVE_DELAY_MS);
      await p.run(TAB_ASK_MS);
      assert.equal(p.reloads, 1, trigger[0]);
      p.gen.close();
    }
  });

  test('a match on screen waits for its end without a banner, then the banner and the reload 3 s later', async () => {
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    p.inMatch = true;
    p.emit('server.gen', { state: 'drain' });
    assert.equal(store.get().ui.genMove ?? null, null, 'no banner while the match is on screen');
    await p.run(MOVE_DELAY_MS);
    assert.equal(store.get().ui.genMove, 'match');
    assert.equal(store.get().ui.buildStale, false, 'not the build guard\'s 服务器已更新 banner');
    assert.equal(bannerVisible({ status: 'online' }, true, false, false, false, 'match'), false);
    await p.run(MATCH_POLL_MS);
    assert.equal(p.reloads, 0);
    p.inMatch = false;
    await p.run(MATCH_POLL_MS);
    assert.equal(store.get().ui.genMove, 'soon', 'the match is over: the move dialog');
    assert.equal(p.reloads, 0, 'not at once');
    await p.run(MOVE_DELAY_MS);
    await p.run(TAB_ASK_MS);
    assert.deepEqual([p.dropped, p.reloads], [1, 1]);
    p.gen.close();
  });

  test('another tab in a match on the same server keeps the cookie until that match is over', async () => {
    const bus = [];
    const mover = harness(bus);
    const player = harness(bus);
    const elsewhere = harness(bus);
    mover.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    player.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    elsewhere.emit('welcome', { gen: { id: 'b', state: 'accept' } });
    player.inMatch = true;
    elsewhere.inMatch = true;
    mover.emit('server.gen', { state: 'drain' });
    await mover.run(MOVE_DELAY_MS);
    await mover.run(TAB_ASK_MS);
    assert.equal(store.get().ui.genMove, 'tab');
    assert.equal(bannerVisible({ status: 'online' }, true, false, false, false, 'tab'), true);
    assert.deepEqual([mover.dropped, mover.reloads], [0, 0]);
    player.inMatch = false;
    await mover.run(TAB_RETRY_MS);
    await mover.run(TAB_ASK_MS);
    assert.deepEqual([mover.dropped, mover.reloads], [1, 1], 'a match on another server does not hold it');
    for (const h of [mover, player, elsewhere]) h.gen.close();
  });
});

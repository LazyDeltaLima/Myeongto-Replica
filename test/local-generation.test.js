// test/local-generation.test.js — deploys that keep running matches: the server generation (server/local-generation.js:
// SP_GEN, accept / drain / standby, the cookie, /healthz/accept, the drain's refusals and its own end, SIGUSR2 words in
// server/http/boot.js) and the page side (public/js/ui/generation.js). docs/rules/ui.md 「무중단 배포」.

import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import {
  Generation, genName, parseGenControl, roomNeedsServer, AWAY_MIN, STALE_MIN, END_GRACE_MIN, DRAIN_CUT_MIN, DRAIN_MAX_MIN,
} from '../server/local-generation.js';
import { RestartNotice } from '../server/local-restart.js';
import { S2C } from '../shared/protocol.js';
import { ERR, PHASE } from '../shared/constants.js';
import { installGeneration, genUrl, MOVE_DELAY_MS, TAB_ASK_MS, TAB_RETRY_MS, MATCH_POLL_MS } from '../public/js/ui/generation.js';
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
      reloads: 0, dropped: 0, inMatch: false,
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

  test('outside a match: the banner, then 3 s later the cookie goes and the page reloads', async () => {
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    p.emit('server.gen', { id: 'a', state: 'drain' });
    assert.equal(store.get().ui.genMove, 'soon');
    assert.equal(bannerVisible({ status: 'online' }, true, false, false, false, 'soon'), true);
    assert.equal(p.timers[0].ms, MOVE_DELAY_MS);
    await p.run(MOVE_DELAY_MS);
    await p.run(TAB_ASK_MS);
    assert.deepEqual([p.dropped, p.reloads], [1, 1]);
    p.gen.close();
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

  test('a match on screen waits for its end (服务器已更新 banner)', async () => {
    const p = harness([]);
    p.emit('welcome', { gen: { id: 'a', state: 'accept' } });
    p.inMatch = true;
    p.emit('server.gen', { state: 'drain' });
    await p.run(MOVE_DELAY_MS);
    assert.equal(store.get().ui.genMove, 'match');
    assert.equal(store.get().ui.buildStale, true);
    assert.equal(p.reloads, 0);
    p.inMatch = false;
    await p.run(MATCH_POLL_MS);
    await p.run(TAB_ASK_MS);
    assert.equal(p.reloads, 1);
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

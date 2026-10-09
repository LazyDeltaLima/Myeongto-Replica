// test/local-restart.test.js — the deploy's server-restart countdown (server/local-restart.js, server/http/boot.js
// SIGUSR2, the welcome / healthz fields, the disabled room.start refusal, public/js/ui/restartNotice.js toasts). docs/rules/ui.md 「서버 재시작 예고」.

import { describe, test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { RestartNotice, RESTART_MARKS_MIN, parseRestartFile, restartFile, noStartMinutes } from '../server/local-restart.js';
import { S2C } from '../shared/protocol.js';
import { installRestartNotice } from '../public/js/ui/restartNotice.js';
import { store } from '../public/js/store.js';
import { ERR } from '../shared/constants.js';
import { TestClient } from './helpers/wsClient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const getJson = (port, headers = {}) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/healthz', headers }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve(JSON.parse(body)));
  }).on('error', reject);
});

describe('restart countdown: pieces', () => {
  test('the file holds the minutes, or 0 / cancel to call it off', () => {
    assert.equal(parseRestartFile('30\n'), 30);
    assert.equal(parseRestartFile(' 0.5 '), 0.5);
    for (const s of ['0', 'cancel', 'OFF']) assert.equal(parseRestartFile(s), 0, s);
    for (const s of ['', '-1', 'soon', '1e3', String(24 * 60 + 1)]) assert.equal(parseRestartFile(s), null, s);
    assert.equal(restartFile({ SP_RESTART_FILE: '/x/y' }), '/x/y');
    assert.match(restartFile({}), /stronghold-restart$/);
  });

  test('server.restart is a protocol message; the marks are 30 / 10 / 5 / 3 / 1 minutes', () => {
    assert.ok(S2C.includes('server.restart'));
    assert.deepEqual([...RESTART_MARKS_MIN], [30, 10, 5, 3, 1]);
  });

  test('the client: toasts only — each mark, one on a welcome that brings news, the cancel to pages that knew', () => {
    const on = new Map();
    const shown = [];
    installRestartNotice({ net: { on: (type, fn) => on.set(type, fn) }, notify: (text, kind, opts) => shown.push([kind, opts.ttl]) });
    const welcome = (m) => on.get('welcome')(m);
    const push = (m) => on.get('server.restart')(m);
    welcome({});
    push({ inMs: null });
    assert.deepEqual(shown, [], 'nothing planned, nothing to cancel');
    welcome({ restart: { inMs: 12.5 * 60_000 } });
    assert.deepEqual(shown, [['warn', 6000]], 'a page that hears of it on hello');
    welcome({ restart: { inMs: 12 * 60_000 } });
    assert.equal(shown.length, 1, 'a resume that already knew: no second toast');
    push({ inMs: 10 * 60_000, mark: 10 });
    push({ inMs: 9 * 60_000 });
    assert.equal(shown.length, 2, 'marks only');
    push({ inMs: null });
    assert.deepEqual(shown.at(-1), ['info', 6000]);
    assert.equal(store.get().ui.restartAt, null);
    welcome({});
    assert.equal(shown.length, 3);
  });

  test('room.start refusal: off by default, on within SP_RESTART_NO_START_MIN', () => {
    const network = { conns: new Map(), reply: () => true };
    assert.equal(noStartMinutes({}), 0);
    assert.equal(noStartMinutes({ SP_RESTART_NO_START_MIN: '10' }), 10);
    assert.equal(noStartMinutes({ SP_RESTART_NO_START_MIN: 'x' }), 0);
    const off = new RestartNotice({ network, noStartMin: 0 });
    off.schedule(1);
    assert.equal(off.startRefusal(), null);
    off.close();
    const on = new RestartNotice({ network, noStartMin: 10 });
    assert.equal(on.startRefusal(), null, 'no countdown');
    on.schedule(30);
    assert.equal(on.startRefusal(), null, '30 min left');
    on.schedule(10);
    assert.deepEqual(on.startRefusal(), { error: ERR.RESTARTING });
    on.cancel();
    assert.equal(on.startRefusal(), null);
  });

  test('every mark reaches each socket that said hello, then the countdown is forgotten if no restart came', () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    try {
      const got = [];
      const conn = (session) => ({ session, closing: false });
      const network = { conns: new Map([[1, conn({})], [2, conn(null)], [3, { session: {}, closing: true }]]), reply: (c, m) => { got.push(m); return true; } };
      const n = new RestartNotice({ network, now: () => Date.now() });
      n.schedule(31);
      assert.deepEqual(got.map((m) => m.mark), [31], 'the start, to the one live hello');
      assert.equal(got[0].inMs, 31 * 60_000);
      mock.timers.tick(60_000);
      assert.deepEqual(got.map((m) => m.mark), [31, 30]);
      assert.equal(got[1].inMs, 30 * 60_000);
      mock.timers.tick(30 * 60_000);
      assert.deepEqual(got.map((m) => m.mark), [31, 30, 10, 5, 3, 1]);
      assert.equal(n.inMs(), 0);
      assert.deepEqual(n.welcomeInfo(), { restart: { inMs: 0 } });
      mock.timers.tick(10 * 60_000);
      assert.deepEqual(got.at(-1), { t: 'server.restart', inMs: null }, 'stale: called off');
      assert.equal(n.welcomeInfo(), null);
      // a short countdown starts at its own minutes and skips the marks above it; a second schedule replaces the first
      got.length = 0;
      n.schedule(4);
      n.schedule(2);
      mock.timers.tick(2 * 60_000);
      assert.deepEqual(got.map((m) => m.mark), [4, 2, 1]);
      n.cancel();
      n.cancel();
      assert.deepEqual(got.at(-1), { t: 'server.restart', inMs: null });
      assert.equal(got.filter((m) => m.inMs === null).length, 1, 'cancel tells everyone once');
    } finally {
      mock.timers.reset();
    }
  });
});

describe('restart countdown: a real server', () => {
  let srv;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    c.welcome = await c.hello(name);
    return c;
  };
  before(async () => { srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, quiet: true }); });
  afterEach(async () => { srv.restart.cancel(); await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); });

  test('the notice reaches every player; a late hello carries it in welcome; healthz counts down inside only', async () => {
    const a = await player('Alpha');
    assert.equal(a.welcome.restart, undefined);
    assert.equal((await getJson(srv.port)).restartInSec, null);
    const b = await player('Beta');
    await b.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    srv.restart.schedule(30);
    for (const c of [a, b]) {
      const m = await c.waitFor('server.restart');
      assert.equal(m.mark, 30);
      assert.ok(m.inMs > 29.9 * 60_000 && m.inMs <= 30 * 60_000, String(m.inMs));
    }
    const late = await player('Gamma');
    assert.ok(late.welcome.restart.inMs > 29.9 * 60_000, JSON.stringify(late.welcome.restart));
    assert.ok(Array.isArray(late.welcome.diyKitted), 'the lobby welcome fields stay');
    const h = await getJson(srv.port);
    assert.ok(h.restartInSec > 1790 && h.restartInSec <= 1800, String(h.restartInSec));
    assert.equal((await getJson(srv.port, { 'x-forwarded-for': '1.2.3.4' })).restartInSec, undefined, 'not through the proxy');
    srv.restart.cancel();
    assert.equal((await a.waitFor('server.restart', (m) => m.inMs === null)).mark, undefined);
    assert.equal((await player('Delta')).welcome.restart, undefined);
  });

  test('the room.start refusal reaches a player as RESTARTING when enabled (off on this server)', async () => {
    const c = await player('Solo');
    await c.request({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    srv.restart.schedule(5);
    assert.equal(srv.restart.noStartMs, 0, 'off unless SP_RESTART_NO_START_MIN');
    srv.restart.noStartMs = 10 * 60_000;
    try {
      const r = await c.request({ t: 'room.start' });
      assert.equal(r.code, ERR.RESTARTING, JSON.stringify(r));
    } finally { srv.restart.noStartMs = 0; }
  });
});

describe('restart countdown: SIGUSR2 on the process (server/http/boot.js)', () => {
  test('the signal reads the file and starts / cancels the countdown', { skip: process.platform === 'win32' && 'POSIX signal', timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sp-restart-'));
    const file = path.join(dir, 'restart');
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT, env: { ...process.env, PORT: '0', HOST: '127.0.0.1', SP_RESTART_FILE: file }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const waitOut = (re) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${re}; output:\n${out}`)), 60_000); // a loaded full-suite run can be slow to boot the child
      const check = () => { if (re.test(out)) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', (d) => { out += d; check(); });
      child.stderr.on('data', (d) => { out += d; check(); });
      check();
    });
    try {
      await waitOut(/Local:/);
      writeFileSync(file, '30\n');
      child.kill('SIGUSR2');
      await waitOut(/\[restart\] server restart in 30 min/);
      writeFileSync(file, 'nonsense');
      child.kill('SIGUSR2');
      await waitOut(/\[restart\] .*expected minutes/);
      writeFileSync(file, 'cancel');
      child.kill('SIGUSR2');
      await waitOut(/\[restart\] server restart cancelled/);
    } finally {
      child.kill('SIGTERM');
      await new Promise((r) => (child.exitCode != null ? r() : child.once('exit', r)));
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

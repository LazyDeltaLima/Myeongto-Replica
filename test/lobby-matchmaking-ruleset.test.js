// test/lobby-matchmaking-ruleset.test.js — 랜덤 매칭 per 규칙 모드 (server/matchmaking.js, shared/ruleset.js; maintainer
// decision 2026-10-15): one queue per difficulty AND ruleset, the room a group starts in carries the queue's ruleset, a
// queued room waits in its own ruleset's queue, and lobby.queueCounts tells every Doctor outside a match how many wait
// in each queue.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, DIFFICULTIES } from '../shared/constants.js';
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

async function queued(c, ruleset, difficulty = 'NORMAL') {
  await ok(c, ruleset ? { t: 'room.queue', difficulty, ruleset } : { t: 'room.queue', difficulty });
  return c.waitFor('room.queueState', (s) => s.queued && s.difficulty === difficulty && s.ruleset === (ruleset ?? 'classic'));
}
async function players(pool, n, prefix = 'P') {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await pool.player(`${prefix}${i + 1}`));
  return out;
}
const found = (c, pred = () => true) => c.waitFor('room.matchFound', pred);
const started = (c) => c.waitFor('room.state', (s) => s.inMatch === true);
const countsOf = (c, pred) => c.waitFor('lobby.queueCounts', pred);

test('protocol: room.queue takes an optional known preset', () => {
  assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD' }), null);
  assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD', ruleset: 'casual' }), null);
  for (const ruleset of ['custom', '', 1, null]) assert.notEqual(validateC2S({ t: 'room.queue', difficulty: 'HARD', ruleset }), null, String(ruleset));
});

describe('랜덤 매칭 per ruleset', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch,
      queueConfirmMs: 10_000, queueGraceMs: 10_000, countsMinGapMs: 50 });
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

  test('rulesets never mix: two classic + two casual of one difficulty form no group; switching ruleset moves the entry', async () => {
    const ps = await players(pool, 4);
    await queued(ps[0]); // no ruleset = classic
    await queued(ps[1], 'classic');
    await queued(ps[2], 'casual');
    const last = await queued(ps[3], 'casual');
    assert.equal(last.count, 2, 'its own queue only');
    for (const c of ps) await c.expectNone('room.matchFound');
    ps[3].clearInbox();
    await ok(ps[3], { t: 'room.queue', difficulty: 'NORMAL', ruleset: 'classic' });
    assert.equal((await ps[3].waitFor('room.queueState', (s) => s.queued)).count, 3);
    assert.equal((await ps[2].waitFor('room.queueState', (s) => s.queued && s.count === 1)).ruleset, 'casual');
  });

  test('four casual players: the group\'s new room has the casual ruleset and its match gets it', async () => {
    const ps = await players(pool, 4);
    for (const c of ps) await queued(c, 'casual', 'HARD');
    for (const c of ps) assert.equal((await found(c)).ruleset, 'casual');
    for (const c of ps) await ok(c, { t: 'room.queueAccept', accept: true });
    const states = await Promise.all(ps.map(started));
    assert.equal(states[0].ruleset.preset, 'casual');
    assert.equal(states[0].difficulty, 'HARD');
  });

  test('a queued room waits in its ruleset\'s queue: casual singles fill it, a classic one does not; the ruleset is locked meanwhile', async () => {
    const [host, guest, a, b, c] = await players(pool, 5);
    await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'casual' });
    const room = await host.waitFor('room.state', (s) => s.hostId === host.id);
    await ok(guest, { t: 'room.join', code: room.code });
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => s.seats[1]?.ready);
    await ok(host, { t: 'room.queueRoom' });
    assert.equal((await host.waitFor('room.queueState', (s) => s.queued && s.party)).ruleset, 'casual');
    await err(host, { t: 'room.setRuleset', preset: 'classic' }, ERR.MATCHING);
    await queued(c, 'classic');
    await queued(a, 'casual');
    await c.expectNone('room.matchFound');
    await queued(b, 'casual');
    for (const x of [host, guest, a, b]) await found(x);
    for (const x of [host, guest, a, b]) await ok(x, { t: 'room.queueAccept', accept: true });
    const st = await started(a);
    assert.equal(st.code, room.code);
    assert.equal(st.ruleset.preset, 'casual');
    await c.expectNone('room.matchFound');
  });

  test('lobby.queueCounts: every preset × difficulty, on hello and whenever a queue changes; never to a Doctor in a match', async () => {
    const watcher = await pool.player('W');
    const first = await countsOf(watcher, () => true);
    assert.deepEqual(Object.keys(first.counts).sort(), ['casual', 'classic']);
    for (const p of ['classic', 'casual']) assert.deepEqual(Object.keys(first.counts[p]).sort(), [...DIFFICULTIES].sort());
    const [a, b] = await players(pool, 2);
    await queued(a, 'casual', 'ABYSS');
    await queued(b, 'classic', 'ABYSS');
    const seen = await countsOf(watcher, (m) => m.counts.casual.ABYSS === 1 && m.counts.classic.ABYSS === 1);
    assert.equal(seen.counts.casual.NORMAL, 0);
    // a newcomer gets the current counts with its hello
    const late = await pool.player('L');
    assert.equal((await countsOf(late, () => true)).counts.casual.ABYSS, 1);
    await ok(a, { t: 'room.unqueue' });
    await countsOf(watcher, (m) => m.counts.casual.ABYSS === 0 && m.counts.classic.ABYSS === 1);
    // a Doctor in a running match hears nothing
    const solo = await pool.player('S');
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await ok(solo, { t: 'room.start' });
    await started(solo);
    solo.clearInbox();
    await queued(a, 'casual', 'ABYSS');
    await countsOf(watcher, (m) => m.counts.casual.ABYSS === 1);
    await solo.expectNone('lobby.queueCounts');
  });
});

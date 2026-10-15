// test/lobby-ruleset.test.js — 규칙 모드 of a room (room.create { ruleset? }, room.setRuleset { preset }; shared/ruleset.js):
// classic by default, host-only, before the match only, room.state.ruleset shows it to everybody, a change un-readies
// the guests like the difficulty, the match gets it as opts.ruleset and the room keeps it for its next match.
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
const seatOf = (state, id) => state.seats.find((s) => s && s.playerId === id) || null;
const presetOf = (state) => state.ruleset?.preset;
async function createRoom(c, extra = {}, mode = 'coop') {
  await ok(c, { t: 'room.create', mode, difficulty: 'NORMAL', ...extra });
  return c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === mode);
}
async function joinRoom(c, code) {
  await ok(c, { t: 'room.join', code });
  return c.waitFor('room.state', (s) => s.code === code && !!seatOf(s, c.id));
}

/** StubMatch that records the options each match was started with. */
const started = [];
class RecordingMatch extends StubMatch {
  constructor(opts) {
    super(opts);
    started.push(opts);
  }
}

test('protocol: room.create takes an optional preset; room.setRuleset takes exactly a known preset', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' }), null);
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'casual' }), null);
  assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'custom' }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'classic' }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'casual' }), null);
  for (const preset of [undefined, null, '', 'custom', 'CASUAL', 1, {}, []]) {
    assert.notEqual(validateC2S({ t: 'room.setRuleset', preset }), null, JSON.stringify(preset));
  }
});

describe('room ruleset (lobby)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: RecordingMatch, lobbyGraceMs: 60_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('classic by default with every option listed; room.create picks casual; solo rooms have one too', async () => {
    const a = await pool.player('A');
    const st = await createRoom(a);
    assert.equal(presetOf(st), 'classic');
    assert.equal(st.ruleset.options.infoReroll, false);
    const b = await pool.player('B');
    const cs = await createRoom(b, { ruleset: 'casual' });
    assert.equal(presetOf(cs), 'casual');
    assert.equal(cs.ruleset.options.bossHitClamp, true);
    const s = await pool.player('S');
    const solo = await createRoom(s, { ruleset: 'casual' }, 'solo');
    assert.equal(presetOf(solo), 'casual');
  });

  test('host-only; every seat sees it; a change un-readies the guests; a malformed preset never reaches the lobby', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    const js = await joinRoom(guest, st.code);
    assert.equal(presetOf(js), 'classic');
    await err(guest, { t: 'room.setRuleset', preset: 'casual' }, ERR.NOT_HOST);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready);
    await ok(host, { t: 'room.setRuleset', preset: 'casual' });
    const on = await guest.waitFor('room.state', (s) => presetOf(s) === 'casual');
    assert.equal(seatOf(on, guest.id).ready, false, 'the rules changed: the guest confirms again');
    await ok(host, { t: 'room.setRuleset', preset: 'casual' }); // the same preset again: ok, nothing changes
    await err(host, { t: 'room.setRuleset', preset: 'custom' }, ERR.BAD_MSG);
    await ok(host, { t: 'room.setRuleset', preset: 'classic' });
    await guest.waitFor('room.state', (s) => presetOf(s) === 'classic');
  });

  test('the match gets it at the start; it cannot change during the match; the room keeps it for the next match', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await ok(host, { t: 'room.setRuleset', preset: 'casual' });
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => presetOf(s) === 'casual' && seatOf(s, guest.id)?.ready);
    const n = started.length;
    await ok(host, { t: 'room.start' });
    await guest.waitFor('room.state', (s) => s.inMatch);
    assert.equal(started[n].ruleset?.preset, 'casual', 'opts.ruleset');
    await err(host, { t: 'room.setRuleset', preset: 'classic' }, ERR.ROOM_STARTED);
    guest.clearInbox();
    await ok(host, { t: 'g.infoReady' });
    await ok(guest, { t: 'g.infoReady' });
    const back = await guest.waitFor('room.state', (s) => !s.inMatch);
    assert.equal(presetOf(back), 'casual');
  });
});

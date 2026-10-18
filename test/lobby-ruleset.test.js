// test/lobby-ruleset.test.js — 규칙 모드 of a room (room.create { ruleset?, custom? }, room.setRuleset { preset, custom? };
// shared/ruleset.js): classic by default, host-only, before the match only, room.state.ruleset shows it to everybody, a
// change un-readies the guests like the difficulty, the match gets it as opts.ruleset and the room keeps it for its next
// match. A custom room carries its sanitized settings everywhere and never matchmakes (maintainer decision 2026-10-18).
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

test('protocol: room.create takes an optional preset; room.setRuleset takes exactly a known preset; custom settings are a bounded object', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' }), null);
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'casual' }), null);
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'custom' }), null);
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'custom', custom: { enemies: { hp: 150 } } }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'classic' }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'casual' }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'custom' }), null);
  assert.equal(validateC2S({ t: 'room.setRuleset', preset: 'custom', custom: {} }), null);
  for (const preset of [undefined, null, '', 'zany', 'CASUAL', 1, {}, []]) {
    assert.notEqual(validateC2S({ t: 'room.setRuleset', preset }), null, JSON.stringify(preset));
  }
  for (const custom of [null, 1, 'x', [], { pad: 'x'.repeat(5000) }]) {
    assert.notEqual(validateC2S({ t: 'room.setRuleset', preset: 'custom', custom }), null, JSON.stringify(custom).slice(0, 40));
    assert.notEqual(validateC2S({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL', ruleset: 'custom', custom }), null);
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
    await err(host, { t: 'room.setRuleset', preset: 'zany' }, ERR.BAD_MSG);
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

  test('custom: the settings travel sanitized; a change of a setting un-readies the guests, the same settings do not; the match gets them', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, { ruleset: 'custom', custom: { enemies: { hp: 5000 }, stages: { info: true }, junk: 1 } });
    assert.equal(presetOf(st), 'custom');
    assert.equal(st.ruleset.custom.enemies.hp, 1000, 'clamped into 10–1000 %');
    assert.equal(st.ruleset.custom.v, 1);
    assert.equal('junk' in st.ruleset.custom, false);
    assert.equal(st.ruleset.options.battlefieldInfo, true, 'the options follow the settings');
    assert.equal(st.ruleset.options.infoReroll, false);
    const guest = await pool.player('Guest');
    await joinRoom(guest, st.code);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready);
    guest.clearInbox();
    await ok(host, { t: 'room.setRuleset', preset: 'custom', custom: { enemies: { hp: 1000 }, stages: { info: true } } });
    await ok(host, { t: 'room.setRuleset', preset: 'custom', custom: { enemies: { hp: 1200 }, stages: { info: true } } });
    const room = srv.lobby.rooms.get(st.code);
    assert.ok(room.seatOf(guest.id).ready === true, 'the same settings (after sanitizing): nothing changed');
    assert.equal(room.ruleset.custom.enemies.hp, 1000);
    await ok(host, { t: 'room.setRuleset', preset: 'custom', custom: { enemies: { hp: 200 } } });
    const changed = await guest.waitFor('room.state', (s) => s.ruleset?.custom?.enemies?.hp === 200);
    assert.equal(seatOf(changed, guest.id).ready, false, 'the settings changed: the guest confirms again');
    assert.equal(changed.ruleset.options.battlefieldInfo, false);
    await ok(guest, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => seatOf(s, guest.id)?.ready);
    const n = started.length;
    await ok(host, { t: 'room.start' });
    await guest.waitFor('room.state', (s) => s.inMatch);
    assert.equal(started[n].ruleset?.preset, 'custom');
    assert.equal(started[n].ruleset.custom.enemies.hp, 200, 'opts.ruleset carries the settings');
  });

  test('custom: no matchmaking for the empty seats (room.queueRoom refused), room.queue never takes it', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, { ruleset: 'custom' });
    await err(host, { t: 'room.queueRoom' }, ERR.BAD_TARGET);
    assert.equal(srv.lobby.rooms.get(st.code).matching, false);
    await err(host, { t: 'room.queue', difficulty: 'NORMAL', ruleset: 'custom' }, ERR.BAD_MSG);
  });

  test('custom: the drain hand-over keeps the settings (roomSnapshot → adoptRoom); an older snapshot with a preset name still reads', async () => {
    const host = await pool.player('Host');
    const st = await createRoom(host, { ruleset: 'custom', custom: { flow: { rounds: 18 }, bonds: { pick: { yanShip: 'ban' } } } });
    const lobby = srv.lobby;
    const room = lobby.rooms.get(st.code);
    const snap = JSON.parse(JSON.stringify(lobby.roomSnapshot(room)));
    assert.deepEqual(snap.ruleset.preset, 'custom');
    // the next server adopts it with its humans' tokens: here a stand-in human the registry does not know yet
    const human = (n) => ({ seat: 0, isBot: false, playerId: `p_${'0'.repeat(9)}${n}`, name: 'H', token: `${n}`.repeat(32) });
    const again = lobby.adoptRoom({ ...snap, code: undefined, hostId: null, seats: [human(1), null, null, null], spectators: [] });
    assert.equal(again.ruleset.preset, 'custom');
    assert.equal(again.ruleset.custom.flow.rounds, 18);
    assert.deepEqual({ ...again.ruleset.custom.bonds.pick }, { yanShip: 'ban' });
    lobby.disposeRoom(again, 'test');
    const old = lobby.adoptRoom({ ...snap, code: undefined, hostId: null, seats: [human(2), null, null, null], spectators: [], ruleset: 'casual' });
    assert.equal(old.ruleset.preset, 'casual');
    lobby.disposeRoom(old, 'test');
  });
});

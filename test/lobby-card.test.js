// 名片干员 through the real server (server/lobby.js header 「名片干员」, after upstream 0.3.3): room.card { charId } keeps a
// seat card's operator on the session and the seat, room.state seats[].card shows it to the room, an unknown operator is
// BAD_MSG and leaves the stored one, '' clears it, the card follows the player into the next room, and an operator of
// any offered season is a card in a room of any season.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { getData } from '../server/data.js';

const W = 6000;
const chess = JSON.parse(readFileSync(new URL('../data/chess.json', import.meta.url), 'utf8'));
const records = Object.values(chess.chess || chess);
const visible = records.find((c) => c && !c.isDiy && c.visible !== false && typeof c.charId === 'string');
const hidden = records.find((c) => c && c.visible === false && typeof c.charId === 'string'
  && !records.some((o) => o !== c && o.charId === c.charId && o.visible !== false));

// an operator data/cards.json lists for 规程 (act3autochess) alone, not for 盟约 (act2autochess)
const ONLY3 = getData().cards?.operators?.find((o) => o.seasons.length === 1 && o.seasons[0] === 'act3autochess')?.charId;

describe('room.card (名片干员)', () => {
  let srv;
  let url;
  let open = [];
  const errors = [];
  const log = { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) };

  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log, seasons: ['act2autochess', 'act3autochess'] });
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
    const w = await c.hello(name);
    c.id = w.playerId;
    return c;
  };
  const ok = async (c, msg) => { const r = await c.request(msg, W); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
  const seatOf = (st, id) => st.seats.find((x) => x && x.playerId === id) || null;

  test('the data has a visible operator to pick', () => {
    assert.ok(visible, 'a visible chess record');
  });

  test('a pick shows on the seat for the room, \'\' clears it, an unknown id is refused and keeps the pick', async () => {
    const a = await player('A');
    const b = await player('B');
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    const st0 = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    assert.equal('card' in seatOf(st0, a.id), false, 'no card key before a pick');
    await ok(b, { t: 'room.join', code: st0.code });
    await ok(a, { t: 'room.card', charId: visible.charId });
    const seen = await b.waitFor('room.state', (s) => seatOf(s, a.id)?.card === visible.charId, W);
    assert.equal(seatOf(seen, b.id).card, undefined, 'the other seat has none');
    const bad = await a.request({ t: 'room.card', charId: 'char_9999_nobody' }, W);
    assert.equal(bad.code, ERR.BAD_MSG);
    if (hidden) assert.equal((await a.request({ t: 'room.card', charId: hidden.charId }, W)).code, ERR.BAD_MSG, 'a hidden preset is refused');
    assert.equal(seatOf(srv.lobby.getRoom(st0.code).toState(), a.id).card, visible.charId, 'the refused id left the pick');
    await ok(a, { t: 'room.card', charId: '' });
    await b.waitFor('room.state', (s) => seatOf(s, a.id) && !('card' in seatOf(s, a.id)), W);
  });

  test('another season\'s operator is accepted in a room of either season and stays on the seat (maintainer request 2026-11-18)', async () => {
    assert.ok(ONLY3, 'a 规程 operator 盟约 lacks');
    const a = await player('A');
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    assert.equal(srv.lobby.getRoom(st.code).season, 'act2autochess');
    await ok(a, { t: 'room.card', charId: ONLY3 });
    await a.waitFor('room.state', (s) => seatOf(s, a.id)?.card === ONLY3, W);
    await ok(a, { t: 'room.leave' });
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL', ruleset: 'classic' });
    await a.waitFor('room.state', (s) => s.mode === 'solo' && seatOf(s, a.id)?.card === ONLY3, W);
  });

  test('the card follows the player into the next room, and a pick outside a room is kept', async () => {
    const a = await player('A');
    await ok(a, { t: 'room.card', charId: visible.charId });
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL', ruleset: 'classic' });
    await a.waitFor('room.state', (s) => seatOf(s, a.id)?.card === visible.charId, W);
    await ok(a, { t: 'room.leave' });
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    await a.waitFor('room.state', (s) => s.mode === 'coop' && seatOf(s, a.id)?.card === visible.charId, W);
  });
});

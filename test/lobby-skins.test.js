// room.skins through the real server (server/lobby.js header 「Operator skins」, docs/rules/upstream.md 「오퍼레이터
// 스킨」): the wire check, storage on the session (any offered season's operators) and the seat (the room's season's),
// room.state seats[].skins for the room, the map riding into the match, and — unlike room.loadout / room.diy — a change
// while the match runs reaching it at once.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { getData } from '../server/data.js';
import { operatorCharIds } from '../shared/protocol.js';

const W = 6000;
// an operator of both seasons, one of 맹약 (act2autochess) only and one of 규정 (act3autochess) only
const A2 = operatorCharIds(getData());
const A3 = operatorCharIds(getData({ season: 'act3autochess' }));
const BOTH = [...A2].find((id) => A3.has(id));
const ONLY2 = [...A2].find((id) => !A3.has(id));
const ONLY3 = [...A3].find((id) => !A2.has(id));
const skinOf = (id, n = 1) => `${id}@test#${n}`;

describe('room.skins (operator skins)', () => {
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
  const err = async (c, msg, code) => { const r = await c.request(msg, W); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); };
  const seatOf = (st, id) => st.seats.find((x) => x && x.playerId === id) || null;

  test('the data has operators of both seasons and of each alone', () => {
    assert.ok(BOTH && ONLY2 && ONLY3);
  });

  test('a bad map is BAD_MSG and keeps the stored one; outside a room any season\'s operator is kept', async () => {
    const a = await player('A');
    await ok(a, { t: 'room.skins', skins: { [BOTH]: skinOf(BOTH), [ONLY3]: skinOf(ONLY3), char_9999_nobody: skinOf('char_9999_nobody') } });
    await err(a, { t: 'room.skins', skins: { [BOTH]: 'has space' } }, ERR.BAD_MSG);
    await err(a, { t: 'room.skins', skins: { chess_char_1_01_a: skinOf(BOTH) } }, ERR.BAD_MSG);
    await err(a, { t: 'room.skins', skins: [skinOf(BOTH)] }, ERR.BAD_MSG);
    await err(a, { t: 'room.skins' }, ERR.BAD_MSG);
    const s = srv.lobby.registry.byId(a.id);
    assert.deepEqual({ ...s.skins }, { [BOTH]: skinOf(BOTH), [ONLY3]: skinOf(ONLY3) }, 'unknown operator dropped, refusals kept the map');
  });

  test('a seat keeps its room\'s season\'s operators, the room sees them, a change is broadcast while it waits', async () => {
    const a = await player('A');
    const b = await player('B');
    await ok(a, { t: 'room.skins', skins: { [BOTH]: skinOf(BOTH), [ONLY3]: skinOf(ONLY3), [ONLY2]: skinOf(ONLY2) } });
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ruleset: 'classic' });
    const st0 = await a.waitFor('room.state', (st) => st.hostId === a.id, W);
    assert.deepEqual(seatOf(st0, a.id).skins, { [BOTH]: skinOf(BOTH), [ONLY2]: skinOf(ONLY2) }, 'the 맹약 room\'s operators only');
    await ok(b, { t: 'room.join', code: st0.code });
    const sb = await b.waitFor('room.state', (st) => !!seatOf(st, b.id), W);
    assert.equal('skins' in seatOf(sb, b.id), false, 'no key without a map');
    await ok(a, { t: 'room.skins', skins: { [BOTH]: skinOf(BOTH, 2) } });
    await b.waitFor('room.state', (st) => seatOf(st, a.id)?.skins?.[BOTH] === skinOf(BOTH, 2), W);
    await ok(a, { t: 'room.skins', skins: {} });
    await b.waitFor('room.state', (st) => seatOf(st, a.id) && !('skins' in seatOf(st, a.id)), W);
  });

  test('the map rides into the match, and a change while it runs reaches it at once (any phase)', async () => {
    const a = await player('A');
    await ok(a, { t: 'room.skins', skins: { [BOTH]: skinOf(BOTH) } });
    await ok(a, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL', ruleset: 'classic' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id, W);
    await ok(a, { t: 'room.start' });
    const pub = await a.waitFor('m.public', (p) => p.players?.some((x) => x.playerId === a.id), W);
    assert.deepEqual(pub.players.find((x) => x.playerId === a.id).skins, { [BOTH]: skinOf(BOTH) }, 'm.public players[].skins');
    const match = srv.lobby.getRoom(st.code).match;
    await ok(a, { t: 'room.skins', skins: { [BOTH]: skinOf(BOTH, 3) } });
    assert.deepEqual({ ...match.players.get(a.id).skins }, { [BOTH]: skinOf(BOTH, 3) });
  });
});

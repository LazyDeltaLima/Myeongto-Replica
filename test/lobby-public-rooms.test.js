// test/lobby-public-rooms.test.js — 공개방 (maintainer decisions 2026-11-20; server/lobby.js 「공개방」, server/matchmaking.js
// 「공개방」): a co-op room the host makes public is on the 연합 매칭 screen's list (lobby.rooms, never a private room and
// never a playerId) and a candidate for the waiting players of its difficulty and season — a group the queue completes
// at once first, then the room with the most humans; an offer is confirmed, a decline skips that room for a while; AI
// seats give way to a Doctor; a kicked Doctor is kept out for 10 minutes; a full and ready public room may start by
// itself. The last case plays the real match path (server/match/Match.js): a public room, a matched Doctor, the host's start.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { Match } from '../server/match/Match.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR } from '../shared/constants.js';
import { validateC2S, operatorCharIds } from '../shared/protocol.js';
import { getData } from '../server/data.js';
import { doctorNo } from '../shared/doctorNo.js';
import { doctorNo as clientDoctorNo } from '../public/js/ui/components.js';

const W = 4000;
// a 名片干员 of 맹약 (act2autochess) that is an operator of that season, so a seat's skins keep it, and another operator
const OPS = operatorCharIds(getData());
const CARD = getData().cards?.operators?.find((o) => o.seasons.includes('act2autochess') && OPS.has(o.charId))?.charId;
const OTHER = [...OPS].find((id) => id !== CARD);
const quietLog = () => {
  const errors = [];
  return { errors, log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } };
};
const ok = async (c, msg) => { const r = await c.request(msg, W); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg, W); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function clientPool(getUrl) {
  const open = new Set();
  return {
    /** `net`: an internet address the socket claims (X-Forwarded-For from loopback: net.js clientAddress) */
    async player(name, net = null) {
      const c = await TestClient.connect(getUrl(), net ? { wsOptions: { headers: { 'X-Forwarded-For': net } } } : {});
      open.add(c);
      const w = await c.hello(name);
      c.id = w.playerId;
      return c;
    },
    async closeAll() {
      await Promise.all([...open].map((c) => c.terminate().catch(() => {})));
      open.clear();
    },
  };
}

/** A co-op room of `host` (public unless told otherwise) with `bots` AI seats; resolves to its first state. */
async function room(host, { pub = true, bots = 0, ...create } = {}) {
  await ok(host, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ...(pub ? { public: true } : {}), ...create });
  const st = await host.waitFor('room.state', (s) => s.hostId === host.id && s.mode === 'coop', W);
  for (let i = 0; i < bots; i++) await ok(host, { t: 'room.addBot' });
  if (bots) await host.waitFor('room.state', (s) => s.seats.filter((x) => x?.isBot).length === bots, W);
  return st;
}
const queue = (c, extra = {}) => ok(c, { t: 'room.queue', difficulty: 'NORMAL', ...extra });
const offerOf = (c, pred = () => true) => c.waitFor('room.matchFound', (m) => !!m.room && pred(m), W);
const seated = (c, code) => c.waitFor('room.state', (s) => s.code === code && s.seats.some((x) => x?.playerId === c.id), W);

test('protocol: room.create { public }, room.setPublic, room.setAutoStart, lobby.watchRooms; room.queueRoom is gone', () => {
  assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', public: true }), null);
  assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', public: 1 }), null);
  for (const t of ['room.setPublic', 'room.setAutoStart', 'lobby.watchRooms']) {
    assert.equal(validateC2S({ t, on: true }), null, t);
    assert.notEqual(validateC2S({ t, on: 'yes' }), null, t);
    assert.notEqual(validateC2S({ t }), null, t);
  }
  assert.notEqual(validateC2S({ t: 'room.queueRoom' }), null);
});

test('doctorNo lives in shared/ (the server names a public room\'s host by it); the page shows the same number', () => {
  for (const id of ['p_0123456789', 'p_ffffffffff', '']) assert.equal(clientDoctorNo(id), doctorNo(id));
  assert.match(doctorNo('p_0123456789'), /^\d{4}$/);
});

describe('공개방 (server/lobby.js, server/matchmaking.js)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: StubMatch, lobbyGraceMs: 60_000,
      queueConfirmMs: 1200, queueGraceMs: 10_000, publicSkipMs: 900, kickBlockMs: 1500, autoStartMs: 400, joinRateMax: 3, joinRateWindowMs: 60_000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => {
    await pool.closeAll();
    srv.lobby.queue.shutdown();
    for (const r of [...srv.lobby.rooms.values()]) srv.lobby.disposeRoom(r, 'shutdown');
  });
  after(async () => {
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('private by default; public: co-op only, the host any time; room.state carries it', async () => {
    const host = await pool.player('Host');
    const st = await room(host, { pub: false });
    assert.equal(st.public, false);
    assert.equal(st.autoStart, false);
    assert.ok(!('matching' in st), 'no matchmaking room any more');
    const guest = await pool.player('Guest');
    await ok(guest, { t: 'room.join', code: st.code });
    await err(guest, { t: 'room.setPublic', on: true }, ERR.NOT_HOST);
    await ok(host, { t: 'room.setPublic', on: true });
    const pub = await guest.waitFor('room.state', (s) => s.public === true, W);
    assert.ok(srv.lobby.getRoom(st.code).publicSince > 0);
    assert.equal(pub.hostId, host.id);
    const solo = await pool.player('Solo');
    await err(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL', public: true }, ERR.BAD_MSG);
    await ok(solo, { t: 'room.create', mode: 'solo', difficulty: 'NORMAL' });
    await solo.waitFor('room.state', (s) => s.mode === 'solo', W);
    await err(solo, { t: 'room.setPublic', on: true }, ERR.BAD_TARGET);
  });

  test('lobby.rooms: every public room of every season, no private one, no playerId; a change goes out, a kicked watcher misses the room', async () => {
    const watcher = await pool.player('Watcher');
    await ok(watcher, { t: 'lobby.watchRooms', on: true });
    const empty = await watcher.waitFor('lobby.rooms', () => true, W);
    assert.deepEqual(empty.rooms, []);
    const a = await pool.player('Ash');
    const b = await pool.player('Bea');
    const c = await pool.player('Cid');
    assert.ok(CARD && OTHER, 'the data has a 名片干员 of 맹약');
    await ok(a, { t: 'room.card', charId: CARD });
    await ok(a, { t: 'room.skins', skins: { [CARD]: `${CARD}@test#1`, [OTHER]: `${OTHER}@test#1` } });
    const ra = await room(a, { bots: 1 });
    const rb = await room(b, { season: 'act3autochess', ruleset: 'custom', custom: { enemies: { hp: 150 } } });
    await room(c, { pub: false });
    const list = await watcher.waitFor('lobby.rooms', (m) => m.rooms.length === 2, W);
    const rowA = list.rooms.find((r) => r.code === ra.code);
    const rowB = list.rooms.find((r) => r.code === rb.code);
    assert.deepEqual(rowA.host, { name: 'Ash', no: doctorNo(a.id) });
    assert.deepEqual(rowA.seats.map((s) => s.kind), ['human', 'bot', 'empty', 'empty']);
    assert.equal(rowA.seats[0].host, true, 'the host\'s seat carries the crown (no playerId)');
    assert.ok(!rowA.seats.slice(1).some((s) => 'host' in s));
    assert.deepEqual([rowA.seats[0].card, rowA.seats[0].skin], [CARD, `${CARD}@test#1`],
      'a Doctor\'s seat: the 名片干员 and the skin that operator wears (the waiting room\'s seat card), no other skin');
    assert.ok(!('skin' in rowB.seats[0]) && !('card' in rowB.seats[0]), 'no card: no skin');
    assert.deepEqual([rowA.difficulty, rowA.ruleset, rowA.size, rowA.state, rowA.spectators, rowA.spectatorSeats], ['NORMAL', { preset: 'classic' }, 4, 'lobby', 0, 2]);
    assert.ok(!('season' in rowA) && !('custom' in rowA) && !('round' in rowA));
    assert.equal(typeof rowA.since, 'number');
    assert.equal(rowB.season, 'act3autochess');
    assert.equal(rowB.ruleset.preset, 'custom');
    assert.equal(rowB.custom.enemies.hp, 150, 'a custom room carries its settings');
    const raw = JSON.stringify(list);
    for (const id of [a.id, b.id, c.id, watcher.id]) assert.ok(!raw.includes(id), 'no playerId on the list');
    // the card's skin taken off: the row follows
    await ok(a, { t: 'room.skins', skins: {} });
    const bare = await watcher.waitFor('lobby.rooms', (m) => m.rooms.some((r) => r.code === ra.code && !('skin' in r.seats[0])), W);
    assert.equal(bare.rooms.find((r) => r.code === ra.code).seats[0].card, CARD);
    // the hub's 「공개방 N」 rides on lobby.queueCounts
    const counts = await watcher.waitFor('lobby.queueCounts', (m) => m.rooms?.act2autochess === 1 && m.rooms?.act3autochess === 1, W);
    assert.ok(counts.rooms);
    // a room going private leaves the list; a room's change is sent whole
    await ok(b, { t: 'room.setPublic', on: false });
    await watcher.waitFor('lobby.rooms', (m) => m.rooms.length === 1 && m.rooms[0].code === ra.code, W);
    // kicked from a room: that watcher's list misses it while the block runs (the others still see it)
    const other = await pool.player('Other');
    await ok(other, { t: 'lobby.watchRooms', on: true });
    await ok(watcher, { t: 'room.join', code: ra.code });
    await a.waitFor('room.state', (s) => s.seats.some((x) => x?.playerId === watcher.id), W);
    await ok(a, { t: 'room.kick', seat: 2, playerId: watcher.id });
    await watcher.waitFor('room.closed', (m) => m.reason === 'kicked', W);
    await err(watcher, { t: 'room.join', code: ra.code }, ERR.KICKED);
    watcher.clearInbox();
    await ok(watcher, { t: 'lobby.watchRooms', on: true });
    assert.deepEqual((await watcher.waitFor('lobby.rooms', () => true, W)).rooms, [], 'hidden from the kicked Doctor');
    assert.equal((await other.waitFor('lobby.rooms', (m) => m.rooms.length === 1, W)).rooms[0].code, ra.code);
    await ok(watcher, { t: 'lobby.watchRooms', on: false });
  });

  test('a waiting player is offered the public room that fits: its preset and size (regular) or any (quick, custom included)', async () => {
    const h1 = await pool.player('H1');
    const h2 = await pool.player('H2');
    const h3 = await pool.player('H3');
    const custom = await room(h2, { ruleset: 'custom', custom: { enemies: { hp: 200 } } });
    await wait(5);
    const casual = await room(h1, { ruleset: 'casual' });
    await room(h3, { difficulty: 'HARD' });
    const regular = await pool.player('Reg');
    await queue(regular, { ruleset: 'casual' });
    const offer = await offerOf(regular);
    assert.equal(offer.room.code, casual.code);
    assert.deepEqual([offer.players, offer.accepted, offer.mine, offer.ruleset, offer.difficulty], [1, 0, false, 'casual', 'NORMAL']);
    assert.deepEqual(offer.room.host, { name: 'H1', no: doctorNo(h1.id) });
    assert.ok(offer.inMs > 0 && offer.inMs <= 1200);
    assert.ok(!JSON.stringify(offer).includes(h1.id), 'no playerId in the offer');
    const classic = await pool.player('Cls');
    await queue(classic);
    await classic.expectNone('room.matchFound', () => true, 300); // no classic NORMAL public room; the custom one is quick-only
    const quick = await pool.player('Quick');
    await queue(quick, { quick: true });
    const q = await offerOf(quick);
    assert.equal(q.room.code, custom.code, 'a quick player: either room fits; one Doctor each, the one made public first');
    assert.equal(q.quick, true);
    assert.equal(q.custom.enemies.hp, 200, 'the custom room\'s settings to accept');
  });

  test('order: the room with the most humans, then the one made public first; a held seat counts as taken', async () => {
    const h = await players(4, 'R');
    const lonely = await room(h[0]);
    const busy = await room(h[1]);
    await ok(h[2], { t: 'room.join', code: busy.code });
    await seated(h[2], busy.code);
    await wait(5);
    await room(h[3]); // one Doctor too, made public later than `lonely`
    const ps = await players(3, 'Q');
    // the first is offered the busiest room
    await queue(ps[0]);
    assert.equal((await offerOf(ps[0])).room.code, busy.code);
    // the second: the busy room's last free seats are two, one held — still the busiest
    await queue(ps[1]);
    assert.equal((await offerOf(ps[1])).room.code, busy.code);
    // the third: the busy room's free seats are all held; of the one-Doctor rooms, the one made public first
    await queue(ps[2]);
    assert.equal((await offerOf(ps[2])).room.code, lonely.code);
  });

  test('a group the queue completes at once goes before a public room', async () => {
    const host = await pool.player('Host');
    await room(host);
    const ps = await players(4, 'Q');
    for (const c of ps.slice(0, 3)) { await queue(c); await offerOf(c); }
    for (const c of ps.slice(0, 3)) await ok(c, { t: 'room.queueAccept', accept: false });
    for (const c of ps.slice(0, 3)) await c.waitFor('room.queueState', (s) => s.queued, W);
    // a fourth completes a group of four with the three who declined: the group, not the room's free seat
    await queue(ps[3]);
    await ps[3].expectNone('room.matchFound', (m) => !!m.room, 200);
    for (const c of ps) {
      const f = await c.waitFor('room.matchFound', (m) => !m.room, W);
      assert.equal(f.players, 4);
    }
  });

  test('decline or silence: the player waits on and that room is skipped for a while; then offered again', async () => {
    const host = await pool.player('Host');
    const r = await room(host);
    const p = await pool.player('P');
    await queue(p);
    await offerOf(p);
    await ok(p, { t: 'room.queueAccept', accept: false });
    const back = await p.waitFor('room.queueState', (s) => s.queued, W);
    assert.equal(back.reason, undefined);
    assert.equal(srv.lobby.queue.stats().waiting, 1, 'still waiting');
    await p.expectNone('room.matchFound', () => true, 500);
    // the skip runs out: offered again; let it time out — skipped again, still queued
    const again = await offerOf(p);
    assert.equal(again.room.code, r.code);
    p.clearInbox();
    await p.waitFor('room.queueState', (s) => s.queued, 2500);
    await p.expectNone('room.matchFound', () => true, 300);
    assert.equal(srv.lobby.queue.stats().waiting, 1);
  });

  test('accepted: the player takes a seat, leaves the queue without a notice; the room full meanwhile: ROOM_FULL and it waits on', async () => {
    const host = await pool.player('Host');
    const r = await room(host, { bots: 2 });
    const p = await pool.player('P');
    await queue(p);
    await offerOf(p);
    await ok(p, { t: 'room.queueAccept', accept: true });
    const st = await seated(p, r.code);
    assert.equal(st.seats.filter((s) => s && !s.isBot).length, 2);
    await p.expectNone('room.queueState', (s) => s.queued === false, 200);
    assert.equal(srv.lobby.queue.stats().waiting + srv.lobby.queue.stats().confirming, 0);
    // the last seat: offered, then taken from the list before the answer
    // the AI seats left: offered, then taken from the list (AI seats give way) before the answer
    const q = await pool.player('Q');
    const full = await pool.player('Full');
    await queue(q);
    const off = await offerOf(q);
    assert.equal(off.room.code, r.code);
    await ok(full, { t: 'room.join', code: r.code });
    await seated(full, r.code);
    const third = await pool.player('Third');
    await ok(third, { t: 'room.join', code: r.code });
    await seated(third, r.code);
    q.clearInbox();
    await err(q, { t: 'room.queueAccept', accept: true }, ERR.ROOM_FULL);
    await q.waitFor('room.queueState', (s) => s.queued, W);
    assert.equal(srv.lobby.queue.stats().waiting, 1, 'still waiting, no skip');
  });

  test('an offer holds a seat for matchmaking only: one free seat, two waiting — one offer; the list\'s join is not refused', async () => {
    const h = await players(3, 'H');
    const r = await room(h[0]);
    for (const c of h.slice(1)) { await ok(c, { t: 'room.join', code: r.code }); await seated(c, r.code); }
    const [a, b] = await players(2, 'W');
    await queue(a);
    await offerOf(a);
    await queue(b);
    await b.expectNone('room.matchFound', () => true, 300);
    const lister = await pool.player('Lister');
    await ok(lister, { t: 'room.join', code: r.code });
    await seated(lister, r.code);
    await err(a, { t: 'room.queueAccept', accept: true }, ERR.ROOM_FULL);
  });

  test('AI seats give way in a public room, the last added first; a private room stays full', async () => {
    const host = await pool.player('Host');
    const r = await room(host, { bots: 3 });
    const bots = srv.lobby.getRoom(r.code).seats.filter((s) => s?.isBot);
    const last = bots.reduce((x, y) => (y.botSeq > x.botSeq ? y : x));
    const p = await pool.player('P');
    await queue(p);
    await offerOf(p);
    await ok(p, { t: 'room.queueAccept', accept: true });
    const st = await seated(p, r.code);
    assert.equal(st.seats.find((s) => s?.playerId === p.id).seat, last.seat, 'the last AI added gave its seat');
    assert.equal(st.seats.filter((s) => s?.isBot).length, 2);
    // the list's join takes the next one
    const q = await pool.player('Q');
    await ok(q, { t: 'room.join', code: r.code });
    assert.equal((await seated(q, r.code)).seats.filter((s) => s?.isBot).length, 1);
    const priv = await pool.player('Priv');
    const pr = await room(priv, { pub: false, bots: 3 });
    const late = await pool.player('Late');
    await err(late, { t: 'room.join', code: pr.code }, ERR.ROOM_FULL);
  });

  test('a queued player who joins from the list leaves the queue (reason room); an offer whose room goes private is withdrawn', async () => {
    const host = await pool.player('Host');
    const r = await room(host);
    const p = await pool.player('P');
    await queue(p, { ruleset: 'casual' }); // no casual room: just waiting
    await p.waitFor('room.queueState', (s) => s.queued, W);
    await ok(p, { t: 'room.join', code: r.code });
    assert.equal((await p.waitFor('room.queueState', (s) => s.queued === false, W)).reason, 'room');
    const q = await pool.player('Q');
    await queue(q);
    await offerOf(q);
    q.clearInbox();
    await ok(host, { t: 'room.setPublic', on: false });
    await q.waitFor('room.queueState', (s) => s.queued, W);
    await err(q, { t: 'room.queueAccept', accept: true }, ERR.WRONG_PHASE);
  });

  test('auto start: public rooms only; full and ready → counts and starts; a ready dropped stops the count', async () => {
    const host = await pool.player('Host');
    const { code } = await room(host, { pub: false });
    await err(host, { t: 'room.setAutoStart', on: true }, ERR.BAD_TARGET);
    await ok(host, { t: 'room.setPublic', on: true });
    await ok(host, { t: 'room.setAutoStart', on: true });
    for (let i = 0; i < 2; i++) await ok(host, { t: 'room.addBot' });
    const guest = await pool.player('Guest');
    await ok(guest, { t: 'room.join', code });
    const full = await seated(guest, code);
    assert.equal(full.autoStartAt, undefined, 'a Doctor not ready: no count');
    await ok(guest, { t: 'room.ready', ready: true });
    const counting = await host.waitFor('room.state', (s) => s.autoStartAt != null, W);
    assert.ok(counting.autoStartAt > Date.now() - 50);
    await ok(guest, { t: 'room.ready', ready: false });
    await host.waitFor('room.state', (s) => s.autoStartAt == null && !s.inMatch, W);
    await wait(500);
    assert.equal(srv.lobby.getRoom(code).match, null, 'the count stopped');
    await ok(guest, { t: 'room.ready', ready: true });
    const st = await host.waitFor('room.state', (s) => s.inMatch, W);
    assert.equal(st.autoStartAt, undefined);
    // going private turns it off
    await ok(host, { t: 'room.setPublic', on: false });
    assert.equal((await host.waitFor('room.state', (s) => s.public === false, W)).autoStart, false);
  });

  test('room.join from one network: at most joinRateMax in the window (RATE); local clients are exempt', async () => {
    const host = await pool.player('Host');
    const r = await room(host);
    const net = await pool.player('Net', '198.51.100.7');
    // a refused join counts too (a key guessed in a loop)
    assert.equal((await net.request({ t: 'room.join', code: 'ZZZZ' }, W)).code, ERR.ROOM_NOT_FOUND);
    await ok(net, { t: 'room.join', code: r.code });
    await ok(net, { t: 'room.join', code: r.code });
    await err(net, { t: 'room.join', code: r.code }, ERR.RATE);
    const local = await pool.player('Local');
    for (let i = 0; i < 5; i++) await err(local, { t: 'room.join', code: 'ZZZZ' }, ERR.ROOM_NOT_FOUND);
  });

  test('the drain hand-over keeps public, publicSince, autoStart, the AI order and the running kicks', async () => {
    const host = await pool.player('Host');
    const r = await room(host, { bots: 2 });
    await ok(host, { t: 'room.setAutoStart', on: true });
    await host.waitFor('room.state', (s) => s.autoStart, W);
    const src = srv.lobby.getRoom(r.code);
    src.kicks.set('p_00000000aa', Date.now() + 60_000);
    src.kicks.set('p_00000000bb', Date.now() - 1);
    const snap = JSON.parse(JSON.stringify(srv.lobby.roomSnapshot(src)));
    assert.deepEqual([snap.public, snap.autoStart, snap.publicSince], [true, true, src.publicSince]);
    assert.deepEqual(snap.kicks.map((k) => k.playerId), ['p_00000000aa']);
    srv.lobby.disposeRoom(src, 'newVersion');
    const back = srv.lobby.adoptRoom({ ...snap, code: 'QQQQ', seats: snap.seats.map((s) => (s && !s.isBot ? { ...s, token: 'a'.repeat(32) } : s)) });
    assert.ok(back);
    assert.deepEqual([back.public, back.autoStart, back.publicSince], [true, true, src.publicSince]);
    assert.equal(back.kicks.get('p_00000000aa') > Date.now(), true);
    assert.deepEqual(back.seats.filter((s) => s?.isBot).map((s) => s.botSeq), src.seats.filter((s) => s?.isBot).map((s) => s.botSeq));
    const old = srv.lobby.adoptRoom({ ...snap, code: 'QQQR', public: undefined, autoStart: undefined, kicks: undefined, seats: snap.seats.map((s) => (s && !s.isBot ? { ...s, token: 'b'.repeat(32) } : s)) });
    assert.deepEqual([old.public, old.autoStart, old.kicks.size], [false, false, 0], 'an older snapshot: private');
  });

  async function players(n, prefix) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(await pool.player(`${prefix}${i + 1}`));
    return out;
  }
});

describe('공개방 on the real match path (server/match/Match.js)', () => {
  let srv;
  let pool;
  const cap = quietLog();
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: cap.log, MatchClass: Match, seedFn: () => 4242, queueConfirmMs: 3000 });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  after(async () => {
    await pool.closeAll();
    await srv?.close();
    assert.deepEqual(cap.errors, [], 'no server errors logged');
  });

  test('a public room, a matched Doctor takes its AI seat, the host starts: both play the match', async () => {
    const host = await pool.player('Host');
    const r = await room(host, { bots: 3 });
    const doc = await pool.player('Doc');
    await queue(doc);
    const offer = await offerOf(doc);
    assert.equal(offer.room.code, r.code);
    await ok(doc, { t: 'room.queueAccept', accept: true });
    await seated(doc, r.code);
    await ok(doc, { t: 'room.ready', ready: true });
    await host.waitFor('room.state', (s) => s.seats.find((x) => x?.playerId === doc.id)?.ready, W);
    await ok(host, { t: 'room.start' });
    const st = await doc.waitFor('room.state', (s) => s.inMatch, W);
    assert.deepEqual(st.seats.filter((s) => s && !s.isBot).map((s) => s.playerId).sort(), [host.id, doc.id].sort());
    assert.equal(st.seats.filter((s) => s?.isBot).length, 2, 'one AI seat gave way');
    const pub = await doc.waitFor('m.public', (m) => Array.isArray(m.players) && m.players.some((p) => p.playerId === doc.id), 10_000);
    assert.equal(pub.players.length, 4);
    await ok(host, { t: 'lobby.watchRooms', on: false }); // (a Doctor in a match gets no list either way)
  });
});

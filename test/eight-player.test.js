// test/eight-player.test.js — the 8-player co-op mode (maintainer decisions 2026-10-16, 2026-10-19; a remake feature):
// its numbers (config.eightPlayer read by server/match/gamedata.js), the 8-seat room (server/lobby.js: humans only, eight
// to start), its own matchmaking queues (server/matchmaking.js) and a whole match through the real match path.
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { GameData } from '../server/match/gamedata.js';
import { generateDraft } from '../server/match/choices.js';
import { createRng } from '../server/sim/rng.js';
import { TestClient } from './helpers/wsClient.js';
import { ERR, LARGE_SEATS, MAX_SEATS } from '../shared/constants.js';
import { validateC2S, RESULT_LIMITS } from '../shared/protocol.js';
import { DATA, makeMatch } from './match/harness.js';
import { GEO } from '../shared/constants.js';
import { widenRow, widenStage, widenRoute, wideCols, WIDE_OFFSETS } from '../server/sim/wideStage.js';
import { normalizeStage, DataSource } from '../server/sim/simdata.js';
import { Battle } from '../server/sim/Battle.js';
import { buildUniteWave } from '../server/match/waves.js';

const big = (diff = 'HARD') => new GameData(DATA, `mode_multi_${diff.toLowerCase()}`, null, { seats: LARGE_SEATS });
const four = (diff = 'HARD') => new GameData(DATA, `mode_multi_${diff.toLowerCase()}`);

describe('8-player numbers (config.eightPlayer)', () => {
  test('one player\'s share is the 4-player one: shop pool × 4, item stock × 2', () => {
    const g4 = four(), g8 = big();
    for (const id of g4.visibleChess.slice(0, 20)) assert.equal(g8.poolCopies(id), g4.poolCopies(id) * 2, id);
    const items = Object.values(g4.shopItemsByTier).flat();
    assert.ok(items.length > 0);
    for (const id of items) assert.equal(g8.itemPoolCopies(id), g4.itemPoolCopies(id) * 2, id);
  });

  test('bans 1 / 2 from NORMAL up, FUNNY 0 / 1; a custom count still wins', () => {
    for (const d of ['NORMAL', 'HARD', 'ABYSS']) {
      assert.deepEqual(big(d).bans(d), { core: 1, addon: 2 });
      assert.deepEqual(four(d).bans(d), { core: 3, addon: 4 });
    }
    assert.deepEqual(big('FUNNY').bans('FUNNY'), { core: 0, addon: 1 });
    const custom = new GameData(DATA, 'mode_multi_hard', { bonds: { banCore: 2, banAddon: null } }, { seats: LARGE_SEATS });
    assert.deepEqual(custom.bans('HARD'), { core: 2, addon: 2 });
  });

  test('overtime 2 LP / s, 隐秘核心 > 2400 (fixed), leader HP up to 8 players, 12 机变 cards, 联防 up to 4 helpers', () => {
    const g4 = four(), g8 = big();
    assert.equal(g4.bossOvertimeDrainReal, 1);
    assert.equal(g8.bossOvertimeDrainReal, 2);
    assert.equal(g4.hiddenCore.multi, 1200);
    assert.equal(g8.hiddenCore.multi, 2400);
    assert.equal(g4.bossPoolShare(8), 4);
    assert.equal(g8.bossPoolShare(8), 8);
    assert.equal(g8.bossPoolShare(5), 5);
    assert.equal(g8.bossPoolShare(), 8);
    assert.deepEqual([g4.unite.maxHelpers, g8.unite.maxHelpers], [2, 4]);
    assert.deepEqual([g4.unite.wideFrom, g8.unite.wideFrom, g8.unite.wideTimeScale], [Infinity, 3, 2]);
    for (const r of [3, 9, 11]) {
      assert.equal(generateDraft(g4, createRng(r), r).cards.length, 6, `R${r}`);
      assert.equal(generateDraft(g8, createRng(r), r).cards.length, 12, `R${r}`);
    }
  });

  test('a solo match and a 4-seat co-op match keep their numbers whatever `seats` says', () => {
    const solo = new GameData(DATA, 'mode_single_hard', null, { seats: LARGE_SEATS });
    assert.equal(solo.large, null);
    assert.equal(new GameData(DATA, 'mode_multi_hard', null, { seats: MAX_SEATS }).large, null);
  });

  test('b.result / b.progress carry up to eight players', () => {
    assert.equal(RESULT_LIMITS.players, LARGE_SEATS);
  });
});

describe('8-player match (real match path)', () => {
  test('eight AI seats play a whole match: numbers in place, m.public size 8, no errors', () => {
    const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
    const h = makeMatch({ seats, size: LARGE_SEATS, difficulty: 'HARD', seed: 3 }).start();
    const m = h.m;
    assert.equal(m.size, LARGE_SEATS);
    assert.ok(m.gd.large);
    const id = m.gd.visibleChess[0];
    assert.equal(m.pool.cap(id), m.gd.poolCopies(id));
    h.runToEnd();
    assert.equal(h.lastBc('m.public').size, LARGE_SEATS);
    assert.deepEqual(h.logs.error, []);
  });

  test('a 4-seat co-op match has no `size` in m.public', () => {
    const h = makeMatch({ humans: 0, bots: 2, seed: 1 }).start();
    h.run(() => h.lastBc('m.public') != null);
    assert.equal('size' in h.lastBc('m.public'), false);
    assert.equal(h.m.size, MAX_SEATS);
  });
});

// ---- lobby and matchmaking ----------------------------------------------------------------------------------------

function clientPool(getUrl) {
  const open = new Set();
  return {
    async player(name) {
      const c = await TestClient.connect(getUrl());
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
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
async function players(pool, n, prefix = 'P') {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await pool.player(`${prefix}${i + 1}`));
  return out;
}

describe('8-player room and queue (server/lobby.js, server/matchmaking.js)', () => {
  let srv;
  let pool;
  const errors = [];
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, queueConfirmMs: 10_000, queueGraceMs: 10_000,
      log: { info() {}, warn() {}, debug() {}, error: (...a) => errors.push(a.map(String).join(' ')) } });
    pool = clientPool(() => `ws://127.0.0.1:${srv.port}/ws`);
  });
  afterEach(async () => { await pool.closeAll(); srv.lobby.queue.shutdown(); });
  after(async () => { await srv?.close(); assert.deepEqual(errors, [], 'no server errors logged'); });

  test('protocol: room.create / room.queue take size 4 | 8, nothing else', () => {
    assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 8 }), null);
    assert.equal(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 4 }), null);
    assert.notEqual(validateC2S({ t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 6 }), null);
    assert.equal(validateC2S({ t: 'room.queue', difficulty: 'HARD', size: 8 }), null);
    assert.notEqual(validateC2S({ t: 'room.queue', difficulty: 'HARD', size: '8' }), null);
    assert.equal(validateC2S({ t: 'room.kick', seat: 7, playerId: 'x' }), null);
  });

  test('an 8-seat room: no AI seat, a solo room is never 8, the start waits for all eight Doctors', async () => {
    const ps = await players(pool, 8);
    await err(ps[0], { t: 'room.create', mode: 'solo', difficulty: 'HARD', size: 8 }, ERR.BAD_MSG);
    await ok(ps[0], { t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 8 });
    const room = await ps[0].waitFor('room.state', (s) => s.hostId === ps[0].id);
    assert.equal(room.size, 8);
    assert.equal(room.seats.length, 8);
    await err(ps[0], { t: 'room.addBot' }, ERR.ROOM_FULL);
    for (const [i, c] of ps.slice(1, 7).entries()) {
      await ok(c, { t: 'room.join', code: room.code });
      await ok(c, { t: 'room.ready', ready: true });
      await ps[0].waitFor('room.state', (s) => s.seats[i + 1]?.playerId === c.id && s.seats[i + 1].ready);
    }
    await err(ps[0], { t: 'room.start' }, ERR.SEATS_OPEN);
    await ok(ps[7], { t: 'room.join', code: room.code });
    await ok(ps[7], { t: 'room.ready', ready: true });
    await ps[0].waitFor('room.state', (s) => s.seats[7]?.ready);
    await ok(ps[0], { t: 'room.start' });
    const st = await ps[0].waitFor('room.state', (s) => s.inMatch);
    assert.equal(st.size, 8);
    assert.equal(srv.lobby.rooms.get(room.code).size, 8);
  });

  test('a 4-seat room is unchanged: size 4, AI seats allowed', async () => {
    const [a] = await players(pool, 1, 'Q');
    await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'NORMAL' });
    const st = await a.waitFor('room.state', (s) => s.hostId === a.id);
    assert.deepEqual([st.size, st.seats.length], [4, 4]);
    await ok(a, { t: 'room.addBot' });
  });

  test('the 8-player queue: its own counts, a group of exactly eight, matched into an 8-seat room', async () => {
    const ps = await players(pool, 9, 'R');
    // one player in the 4-player queue of the same difficulty does not join the eight
    await ok(ps[8], { t: 'room.queue', difficulty: 'HARD' });
    for (const [i, c] of ps.slice(0, 8).entries()) {
      await ok(c, { t: 'room.queue', difficulty: 'HARD', size: 8 });
      if (i < 7) {
        const s = await c.waitFor('room.queueState', (m) => m.queued && m.size === 8);
        assert.equal(s.count, i + 1);
        assert.deepEqual([srv.lobby.queue.counts(LARGE_SEATS).classic.HARD, srv.lobby.queue.counts().classic.HARD], [i + 1, 1]);
      }
    }
    const founds = await Promise.all(ps.slice(0, 8).map((c) => c.waitFor('room.matchFound')));
    for (const f of founds) assert.deepEqual([f.players, f.size, f.difficulty], [8, 8, 'HARD']);
    for (const c of ps.slice(0, 8)) await ok(c, { t: 'room.queueAccept', accept: true });
    const st = await ps[0].waitFor('room.state', (s) => s.inMatch);
    assert.equal(st.size, 8);
    assert.deepEqual(st.seats.map((s) => s && s.playerId), ps.slice(0, 8).map((c) => c.id));
    // the 4-player queue still holds its one player
    assert.equal(srv.lobby.queue.counts().classic.HARD, 1);
    assert.equal(srv.lobby.queue.counts(LARGE_SEATS).classic.HARD, 0);
  });

  test('room.queueRoom of an 8-seat room waits for eight; seven never start', async () => {
    const ps = await players(pool, 7, 'S');
    await ok(ps[0], { t: 'room.create', mode: 'coop', difficulty: 'NORMAL', size: 8 });
    const room = await ps[0].waitFor('room.state', (s) => s.hostId === ps[0].id);
    for (const c of ps.slice(1, 3)) {
      await ok(c, { t: 'room.join', code: room.code });
      await ok(c, { t: 'room.ready', ready: true });
    }
    await ps[0].waitFor('room.state', (s) => s.seats.filter(Boolean).length === 3 && s.seats.filter(Boolean).every((x) => x.ready || x.playerId === ps[0].id));
    await ok(ps[0], { t: 'room.queueRoom' });
    const qs = await ps[0].waitFor('room.queueState', (m) => m.queued);
    assert.deepEqual([qs.size, qs.count, qs.party], [8, 3, true]);
    for (const c of ps.slice(3)) await ok(c, { t: 'room.queue', difficulty: 'NORMAL', size: 8 });
    await ps[0].waitFor('room.queueState', (m) => m.queued && m.count === 7);
    assert.equal(srv.lobby.queue.stats().confirming, 0, 'seven humans form no group');
  });
});

// ---- the wide 联防 field (server/sim/wideStage.js) --------------------------------------------------------------

describe('8-player 联防: the 2-helper field twice side by side', () => {
  const STAGE = 'act2autochess_m04';

  test('a stage row repeats columns 3–18 sixteen columns further; devices and map characters stand on both copies', () => {
    const row = '##ErrbrrrrSrrbrrrrS##';
    const wide = widenRow(row);
    assert.equal(wide.length, GEO.WIDE_COLS);
    assert.equal(wide, '##ErrbrrrrSrrbrrrrS' + 'rrbrrrrSrrbrrrrS' + '##');
    assert.deepEqual([wide[2], wide[10], wide[18], wide[26], wide[34]], ['E', 'S', 'S', 'S', 'S']);
    assert.deepEqual([wideCols(2), wideCols(3), wideCols(18), wideCols(19)], [[2], [3, 19], [18, 34], [35]]);
    const st = widenStage(normalizeStage(STAGE, DATA.stages[STAGE]));
    assert.ok(st._wide && st._norm);
    for (const r of st.rows) if (typeof r === 'string' && r.length) assert.equal(r.length, GEO.WIDE_COLS);
    const src = DATA.stages[STAGE].devices.filter((d) => d.pos[1] >= 3 && d.pos[1] <= 18).length;
    const total = DATA.stages[STAGE].devices.length;
    assert.equal(st.devices.length, total + src);
    const aliases = st.raw.mapChars.map((m) => m.alias);
    assert.equal(new Set(aliases).size, aliases.length, 'every map character alias stays unique');
  });

  test('a route enters at the far right, walks the right pair, the old spawn, then the left pair to the same exit', () => {
    const r = widenRoute({ motion: 'WALK', start: [9, 18], end: [9, 2], checkpoints: [[9, 10]] });
    assert.deepEqual(r, { motion: 'WALK', start: [9, 34], end: [9, 2], checkpoints: [[9, 26], [9, 18], [9, 10]] });
    assert.deepEqual(WIDE_OFFSETS, [24, 16, 8, 0]);
  });

  test('a walker on the wide field crosses all four halves and leaks at the exit, taking about twice as long', () => {
    const ds = new DataSource(DATA, null);
    const tpl = DATA.waves.act1autochess_escaped_multi;
    const walk = tpl.routes.findIndex((x) => x.motion === 'WALK');
    const key = Object.keys(DATA.enemies).find((k) => !DATA.enemies[k].tokenOnly && DATA.enemies[k].motion !== 'FLY' && /^enemy_10\d\d_/.test(k));
    const run = (wide) => {
      const routes = wide ? tpl.routes.map(widenRoute) : tpl.routes;
      const b = new Battle({ kind: 'unite', wide, stageId: STAGE, data: ds, timeLimit: 400, players: [{ playerId: 'p1', units: [] }],
        spawns: [{ time: 0, enemyKey: key, routeIndex: walk, count: 1, interval: 0, sourcePlayerId: 'p9' }], routes, logger: { warn() {}, error() {}, info() {} } });
      let maxX = -1;
      while (!b.finished && b.time < 400) {
        b.step();
        for (const e of b.enemies) maxX = Math.max(maxX, e.x);
      }
      return { b, maxX, time: b.time, leaked: b.result().perPlayer.p1?.leaked?.length ?? 0 };
    };
    const two = run(false), four = run(true);
    assert.equal(four.b.grid.tile(9, 34).pass, 'ALL');
    assert.deepEqual([four.b.rect.c0, four.b.rect.c1], [0, 36]);
    assert.ok(two.maxX <= 18.6 && four.maxX >= 33, `${two.maxX} / ${four.maxX}`);
    assert.ok(four.time > two.time * 1.6 && four.time < two.time * 2.4, `${two.time} s → ${four.time} s`);
  });
});

describe('8-player 联防 through the match', () => {
  test('3–4 helpers play the wide field for twice the round\'s time, on the halves from the right', () => {
    const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
    const h = makeMatch({ seats, size: LARGE_SEATS, difficulty: 'HARD', seed: 3 }).start();
    const m = h.m;
    const seen = [];
    const orig = m._uniteOpts.bind(m);
    m._uniteOpts = (plan, limit) => {
      const o = orig(plan, limit);
      seen.push({ n: plan.helpers.length, wide: o.wide === true, limit, base: m.wave.timeLimit, offsets: o.players.map((p) => p.colOffset), rect: o.rect });
      return o;
    };
    h.runToEnd();
    assert.deepEqual(h.logs.error, []);
    assert.ok(seen.some((s) => s.n >= 3), `a 联防 of 3+ helpers happened: ${JSON.stringify(seen.map((s) => s.n))}`);
    for (const s of seen) {
      if (s.n >= 3) {
        assert.equal(s.wide, true);
        assert.equal(s.limit, s.base * 2);
        assert.deepEqual(s.offsets, WIDE_OFFSETS.slice(0, s.n));
        assert.deepEqual(s.rect, GEO.UNITE_WIDE_RECT);
      } else {
        assert.equal(s.wide, false);
        assert.equal(s.limit, s.base);
        assert.deepEqual(s.rect, GEO.UNITE_RECT);
      }
    }
  });

  test('a 4-player match never plays the wide field', () => {
    const g = new GameData(DATA, 'mode_multi_hard');
    assert.equal(buildUniteWave(g, [], 2, 60).wide, false);
    assert.equal(Number.isFinite(g.unite.wideFrom), false);
  });
});

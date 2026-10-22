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
import { ERR, LARGE_SEATS, MAX_SEATS, DIFFICULTIES } from '../shared/constants.js';
import { validateC2S, RESULT_LIMITS } from '../shared/protocol.js';
import { DATA, makeMatch } from './match/harness.js';
import { GEO } from '../shared/constants.js';
import { widenRow, widenStage, widenRoute, wideCols, wideOffsets, wideRect } from '../server/sim/wideStage.js';
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

  test('bans: the 4-player counts of each difficulty (3 / 4 from NORMAL up, FUNNY 0 / 1); a custom count still wins', () => {
    for (const d of ['NORMAL', 'HARD', 'ABYSS']) {
      assert.deepEqual(big(d).bans(d), { core: 3, addon: 4 });
      assert.deepEqual(four(d).bans(d), { core: 3, addon: 4 });
    }
    assert.deepEqual(big('FUNNY').bans('FUNNY'), { core: 0, addon: 1 });
    const custom = new GameData(DATA, 'mode_multi_hard', { bonds: { banCore: 2, banAddon: null } }, { seats: LARGE_SEATS });
    assert.deepEqual(custom.bans('HARD'), { core: 2, addon: 4 });
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
    assert.deepEqual([g4.unite.wideFrom, g8.unite.wideFrom, g8.unite.wideTimePerHalf], [Infinity, 3, 0.5]);
    for (const r of [3, 9, 11]) {
      assert.equal(generateDraft(g4, createRng(r), r).cards.length, 6, `R${r}`);
      assert.equal(generateDraft(g8, createRng(r), r).cards.length, 12, `R${r}`);
    }
    // every family of R11 (悬赏决策 / 机密商店 / 战术决策) holds 12 cards: the six 机密商店 slots are drawn twice
    const seen = new Set();
    for (let s = 0; s < 60; s++) {
      const d = generateDraft(g8, createRng(1100 + s), 11);
      seen.add(d.family);
      assert.equal(d.cards.length, 12, `R11 ${d.family} seed ${s}`);
    }
    assert.ok(seen.has('shop'), 'the seeds reach a 机密商店');
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
    /** `net`: an internet address the socket claims (X-Forwarded-For from loopback: net.js clientAddress) — the per-network limits */
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
const ok = async (c, msg) => { const r = await c.request(msg); assert.equal(r.t, 'ok', `${msg.t}: ${JSON.stringify(r)}`); return r; };
const err = async (c, msg, code) => { const r = await c.request(msg); assert.equal(r.t, 'error', JSON.stringify(r)); assert.equal(r.code, code, JSON.stringify(r)); return r; };
async function players(pool, n, prefix = 'P', net = null) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await pool.player(`${prefix}${i + 1}`, net));
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

  test('protocol: g.choice takes every card of an 8-player 机变 draft (12), not one past it', () => {
    const n = generateDraft(big(), createRng(3), 3).cards.length;
    assert.equal(n, 12);
    for (let idx = 0; idx < n; idx++) assert.equal(validateC2S({ t: 'g.choice', idx }), null, `idx ${idx}`);
    assert.notEqual(validateC2S({ t: 'g.choice', idx: n }), null);
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

  test('local debug mode lets AI seats fill an 8-seat room; the start waits for every seat', async () => {
    const saved = process.env.SP_DEBUG_PAGE;
    process.env.SP_DEBUG_PAGE = '1';
    try {
      const [a, b] = await players(pool, 2, 'D');
      await ok(a, { t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 8 });
      const room = await a.waitFor('room.state', (s) => s.hostId === a.id);
      assert.equal(room.largeBots, true);
      await ok(b, { t: 'room.join', code: room.code });
      await ok(b, { t: 'room.ready', ready: true });
      await a.waitFor('room.state', (s) => s.seats[1]?.ready);
      for (let i = 0; i < 5; i++) await ok(a, { t: 'room.addBot' });
      await err(a, { t: 'room.start' }, ERR.SEATS_OPEN);
      await ok(a, { t: 'room.addBot' });
      await err(a, { t: 'room.addBot' }, ERR.ROOM_FULL);
      await ok(a, { t: 'room.start' });
      const st = await a.waitFor('room.state', (s) => s.inMatch);
      assert.deepEqual([st.size, st.seats.filter((s) => s?.isBot).length], [8, 6]);
    } finally {
      if (saved === undefined) delete process.env.SP_DEBUG_PAGE; else process.env.SP_DEBUG_PAGE = saved;
    }
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

  test('one network may queue eight for the 8-player queue (twice the 4-player limit); the count spans every queue', async () => {
    const ps = await players(pool, 10, 'N', '203.0.113.7');
    // the 4-player queues: four from one network (one per difficulty: no group forms), the fifth refused
    for (const [i, c] of ps.slice(0, 4).entries()) await ok(c, { t: 'room.queue', difficulty: DIFFICULTIES[i] });
    await err(ps[4], { t: 'room.queue', difficulty: 'NORMAL' }, 'RATE');
    // the 8-player queue: up to eight from the network, those four included
    for (const c of ps.slice(4, 8)) await ok(c, { t: 'room.queue', difficulty: 'NORMAL', size: 8 });
    await err(ps[8], { t: 'room.queue', difficulty: 'NORMAL', size: 8 }, 'RATE');
    // moving a queued player to another queue is not a new entry
    await ok(ps[0], { t: 'room.queue', difficulty: 'NORMAL', size: 8 });
    // another network is not counted
    const other = await pool.player('Other', '198.51.100.9');
    await ok(other, { t: 'room.queue', difficulty: 'NORMAL', size: 8 });
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

// ---- the wide 联防 fields (server/sim/wideStage.js) -------------------------------------------------------------

describe('8-player 联防: 3 helpers = the 1-helper half + the 2-helper field, 4 = the 2-helper field twice', () => {
  const STAGE = 'act2autochess_m04';

  test('a stage row: 3 halves repeat columns 11–18 eight columns further, 4 halves columns 3–18 sixteen further', () => {
    const row = '##ErrbrrrrSrrbrrrrS##';
    const w4 = widenRow(row, 4), w3 = widenRow(row, 3);
    assert.equal(w4, '##ErrbrrrrSrrbrrrrS' + 'rrbrrrrSrrbrrrrS' + '##');
    assert.equal(w3, '##ErrbrrrrSrrbrrrrS' + 'rrbrrrrS' + '##');
    assert.equal(w4.length, GEO.WIDE_COLS);
    assert.deepEqual([w3.length, wideRect(3).c1 + 1, wideRect(4).c1 + 1], [29, 29, 37]);
    assert.deepEqual([w4[2], w4[10], w4[18], w4[26], w4[34]], ['E', 'S', 'S', 'S', 'S']);
    assert.deepEqual([w3[2], w3[10], w3[18], w3[26]], ['E', 'S', 'S', 'S']);
    assert.deepEqual([wideCols(2, 4), wideCols(3, 4), wideCols(18, 4), wideCols(19, 4)], [[2], [3, 19], [18, 34], [35]]);
    assert.deepEqual([wideCols(10, 3), wideCols(11, 3), wideCols(18, 3), wideCols(20, 3)], [[10], [11, 19], [18, 26], [28]]);
    assert.equal(widenRow(row, 2), row, 'no wide field below 3 halves');
  });

  test('devices and map characters stand on each copy of their column; aliases stay unique', () => {
    for (const halves of [3, 4]) {
      const st = widenStage(normalizeStage(STAGE, DATA.stages[STAGE]), halves);
      assert.equal(st._wide, halves);
      for (const r of st.rows) if (typeof r === 'string' && r.length) assert.equal(r.length, wideRect(halves).c1 + 1);
      const first = halves === 4 ? 3 : 11;
      const src = DATA.stages[STAGE].devices.filter((d) => d.pos[1] >= first && d.pos[1] <= 18).length;
      assert.equal(st.devices.length, DATA.stages[STAGE].devices.length + src);
      const aliases = st.raw.mapChars.map((m) => m.alias);
      assert.equal(new Set(aliases).size, aliases.length);
    }
  });

  test('a route enters at the far right, walks the added halves, the old spawn, then the whole route to the same exit', () => {
    const walk = { motion: 'WALK', start: [9, 18], end: [9, 2], checkpoints: [[9, 10]] };
    assert.deepEqual(widenRoute(walk, 4), { motion: 'WALK', start: [9, 34], end: [9, 2], checkpoints: [[9, 26], [9, 18], [9, 10]] });
    assert.deepEqual(widenRoute(walk, 3), { motion: 'WALK', start: [9, 26], end: [9, 2], checkpoints: [[9, 18], [9, 10]] });
    const fly = { motion: 'FLY', start: [9, 18], end: [9, 2], checkpoints: [[9, 17], [12, 11], [10, 9], [9, 3]] };
    assert.deepEqual(widenRoute(fly, 3).checkpoints, [[9, 25], [12, 19], [9, 18], [9, 17], [12, 11], [10, 9], [9, 3]]);
    assert.deepEqual([wideOffsets(3), wideOffsets(4)], [[16, 8, 0], [24, 16, 8, 0]]);
  });

  test('a walker crosses every half and leaks at the exit: × 1.5 the time on 3 halves, × 2 on 4', () => {
    const ds = new DataSource(DATA, null);
    const tpl = DATA.waves.act1autochess_escaped_multi;
    const walk = tpl.routes.findIndex((x) => x.motion === 'WALK');
    const key = Object.keys(DATA.enemies).find((k) => !DATA.enemies[k].tokenOnly && DATA.enemies[k].motion !== 'FLY' && /^enemy_10\d\d_/.test(k));
    const run = (halves) => {
      const routes = halves ? tpl.routes.map((r) => widenRoute(r, halves)) : tpl.routes;
      const b = new Battle({ kind: 'unite', wide: halves, stageId: STAGE, data: ds, timeLimit: 400, players: [{ playerId: 'p1', units: [] }],
        spawns: [{ time: 0, enemyKey: key, routeIndex: walk, count: 1, interval: 0, sourcePlayerId: 'p9' }], routes, logger: { warn() {}, error() {}, info() {} } });
      let maxX = -1;
      while (!b.finished && b.time < 400) {
        b.step();
        for (const e of b.enemies) maxX = Math.max(maxX, e.x);
      }
      return { b, maxX, time: b.time };
    };
    const two = run(0), three = run(3), four = run(4);
    assert.deepEqual([three.b.rect.c1, four.b.rect.c1], [28, 36]);
    assert.ok(two.maxX <= 18.6 && three.maxX >= 25 && three.maxX <= 26.6 && four.maxX >= 33, `${two.maxX} / ${three.maxX} / ${four.maxX}`);
    assert.ok(three.time > two.time * 1.3 && three.time < two.time * 1.7, `${two.time} s → ${three.time} s`);
    assert.ok(four.time > two.time * 1.8 && four.time < two.time * 2.2, `${two.time} s → ${four.time} s`);
  });
});

describe('8-player 联防 through the match', () => {
  test('3–4 helpers play a wide field of a half each, for × 0.5 the round\'s time per half, on the halves from the right', () => {
    const seats = Array.from({ length: 8 }, (_, i) => ({ seat: i, playerId: `ai_${i}`, name: `AI${i}`, isBot: true, connected: true }));
    const h = makeMatch({ seats, size: LARGE_SEATS, difficulty: 'HARD', seed: 3 }).start();
    const m = h.m;
    const seen = [];
    const orig = m._uniteOpts.bind(m);
    m._uniteOpts = (plan, limit) => {
      const o = orig(plan, limit);
      seen.push({ n: plan.helpers.length, wide: o.wide ?? 0, limit, base: m.wave.timeLimit, offsets: o.players.map((p) => p.colOffset), rect: o.rect });
      return o;
    };
    h.runToEnd();
    assert.deepEqual(h.logs.error, []);
    assert.ok(seen.some((s) => s.n >= 3), `a 联防 of 3+ helpers happened: ${JSON.stringify(seen.map((s) => s.n))}`);
    for (const s of seen) {
      if (s.n >= 3) {
        assert.equal(s.wide, s.n);
        assert.equal(s.limit, s.base * s.n * 0.5);
        assert.deepEqual(s.offsets, wideOffsets(s.n));
        assert.deepEqual(s.rect, wideRect(s.n));
      } else {
        assert.equal(s.wide, 0);
        assert.equal(s.limit, s.base);
        assert.deepEqual(s.rect, GEO.UNITE_RECT);
      }
    }
  });

  test('a 4-player match never plays a wide field', () => {
    const g = new GameData(DATA, 'mode_multi_hard');
    assert.equal(buildUniteWave(g, [], 2, 60).wide, 0);
    assert.equal(Number.isFinite(g.unite.wideFrom), false);
  });
});

describe('8-player rooms × 규칙 모드: the custom settings compare with the 8-player official values', () => {
  test('officialBans: an 8-seat room has the 4-player table (3 / 4, FUNNY 0 / 1)', async () => {
    const { officialBans, customDiffs } = await import('../shared/ruleset.js');
    const cfg = DATA.config;
    assert.equal(cfg.eightPlayer.bans, undefined, 'no 8-player ban table (maintainer decision 2026-10-22)');
    assert.deepEqual(officialBans(cfg, 'HARD', LARGE_SEATS), { core: 3, addon: 4 });
    assert.deepEqual(officialBans(cfg, 'FUNNY', LARGE_SEATS), { core: 0, addon: 1 });
    assert.deepEqual(officialBans(cfg, 'HARD', MAX_SEATS), { core: 3, addon: 4 });
    assert.deepEqual(officialBans(cfg, 'HARD'), { core: 3, addon: 4 });
    assert.deepEqual(customDiffs({ bonds: { banCore: 3, banAddon: 4 } }, { bans: officialBans(cfg, 'HARD', LARGE_SEATS) }), [], 'the 4-player counts are no difference in an 8-seat room');
    assert.deepEqual(customDiffs({ bonds: { banCore: 1, banAddon: 2 } }, { bans: officialBans(cfg, 'HARD', LARGE_SEATS) }), ['bonds.banCore', 'bonds.banAddon']);
  });

  test('the room screen hides 「AI 队友最后选择」 in an 8-seat room (no AI seat)', async () => {
    const { aiLastOption } = await import('../public/js/screens/room.js');
    const room = { mode: 'coop', hostId: 'h', aiPicksLast: false };
    assert.equal(aiLastOption({ ...room, size: 8 }, 'h'), null);
    assert.deepEqual(aiLastOption({ ...room, size: 4 }, 'h'), { on: false, editable: true });
  });
});

// test/local-console.test.js — 콘솔 모드 (server/local-console.js, the room toggle in server/local-patch.js, the con.*
// validators of shared/local.js, the panel's lists in public/js/ui/consoleLists.js): who may send con.* (a console
// match's player on any server, anyone in local debug mode), each command, and the console match that never ends by
// its rules (docs/rules/ui.md 「콘솔 모드」). The commands run on the real match path (test/match/harness.js).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';
import { ERR } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { consoleIntent, consoleView, debugMode, lastConsoleRound, CONSOLE_MSGS } from '../server/local-console.js';
import { onMessage, onMatchCreate, onMatchEnd } from '../server/local-patch.js';
import { FeedbackInbox } from '../server/local-feedback.js';

const DEBUG_ENV = { SP_DEBUG_PAGE: '1' };
const OFF = {}; // a deployed server: no debug mode
const humans = () => [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }, { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true }];
const prep = () => { const h = makeMatch({ mode: 'coop', seats: humans(), seed: 3 }); h.start(); h.toPrep(1); return h; };
/** a solo console match at R1's prep */
const consoleMatch = (seed = 4) => { const h = makeMatch({ mode: 'solo', seed }); h.m.console = true; h.start(); h.toPrep(1); return h; };

describe('who may use the console', () => {
  test('debug mode: SP_DEBUG_PAGE=1 or SP_DEBUG_FUNDS, never with NODE_ENV=production', () => {
    assert.equal(debugMode({}), false, 'deployed servers set neither');
    assert.equal(debugMode({ SP_DEBUG_PAGE: '1' }), true);
    assert.equal(debugMode({ SP_DEBUG_FUNDS: '99' }), true);
    assert.equal(debugMode({ SP_DEBUG_FUNDS: 'lots' }), false);
    assert.equal(debugMode({ SP_DEBUG_PAGE: '1', SP_DEBUG_FUNDS: '99', NODE_ENV: 'production' }), false, 'the Docker image');
  });

  test('the protocol: every con.* and room.setConsole is validated; the old dbg.* messages are gone', () => {
    assert.equal(validateC2S({ t: 'room.setConsole', on: true }), null);
    assert.ok(validateC2S({ t: 'room.setConsole', on: 1 }));
    assert.equal(validateC2S({ t: 'con.funds', on: true }), null);
    assert.equal(validateC2S({ t: 'con.addDiy', charId: 'char_2027_wang', tier: 6, golden: true }), null);
    assert.match(validateC2S({ t: 'con.addDiy', charId: 'char_2027_wang', tier: 4 }), /tier/);
    assert.equal(validateC2S({ t: 'con.addItem', itemId: 'chess_item_1_01_e_a', golden: true }), null);
    assert.equal(validateC2S({ t: 'con.jumpRound', round: 14 }), null);
    assert.ok(validateC2S({ t: 'con.jumpRound', round: 0 }));
    assert.equal(validateC2S({ t: 'con.presetBoard', layers: 'max' }), null);
    assert.ok(validateC2S({ t: 'con.presetBoard', layers: 'lots' }));
    assert.equal(validateC2S({ t: 'con.setBoss', final: 'boss_7' }), null);
    assert.ok(validateC2S({ t: 'con.setBoss', final: 'enemy_1' }));
    assert.equal(validateC2S({ t: 'con.setLayers', bondId: 'yanShip', layers: 150 }), null);
    assert.ok(validateC2S({ t: 'con.setLayers', bondId: 'yanShip', layers: -1 }));
    assert.equal(validateC2S({ t: 'con.resetLayers' }), null);
    assert.equal(validateC2S({ t: 'con.end', to: 'lobby' }), null);
    assert.ok(validateC2S({ t: 'con.end', to: 'title' }));
    for (const t of CONSOLE_MSGS) assert.notEqual(validateC2S({ t }), 'unknown message type', t);
    assert.ok(validateC2S({ t: 'dbg.funds', on: true }), 'dbg.* is no message any more');
  });

  test('refused outside a console match when debug mode is off: the intent, the view, the lobby hook and a real server', async () => {
    const h = prep(), ps = h.ps('p_0');
    const funds = ps.funds;
    assert.equal(consoleIntent(h.m, 'p_0', { t: 'con.funds', on: true }, OFF).error, ERR.BAD_MSG);
    assert.equal(consoleIntent(h.m, 'p_0', { t: 'con.addDiy', charId: 'char_2027_wang', tier: 6 }, { SP_DEBUG_PAGE: '1', NODE_ENV: 'production' }).error, ERR.BAD_MSG);
    assert.equal(consoleView(ps, OFF), null, 'no panel');
    assert.equal(ps.funds, funds); assert.ok(!ps.hand.some((p) => p && /diy/.test(p.id)));
    const saved = { p: process.env.SP_DEBUG_PAGE, f: process.env.SP_DEBUG_FUNDS };
    delete process.env.SP_DEBUG_PAGE; delete process.env.SP_DEBUG_FUNDS;
    try {
      const lobby = { roomOf: () => ({ match: h.m }) };
      assert.equal(onMessage(lobby, { playerId: 'p_0' }, { t: 'con.addDiy', charId: 'char_2027_wang', tier: 6 }).error, ERR.BAD_MSG);
      assert.ok(!ps.hand.some((p) => p && /diy/.test(p.id)));
      assert.equal(h.ps('p_0').privateView().console, undefined, 'no m.private.console');
      const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log: { info() {}, warn() {}, debug() {}, error() {} } });
      const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
      try {
        await c.hello('Dbg');
        const r = await c.request({ t: 'con.funds', on: true });
        assert.equal(r.t, 'error'); assert.equal(r.code, ERR.NOT_IN_ROOM, 'outside a room');
      } finally { await c.terminate().catch(() => {}); await srv.close(); }
    } finally {
      if (saved.p !== undefined) process.env.SP_DEBUG_PAGE = saved.p;
      if (saved.f !== undefined) process.env.SP_DEBUG_FUNDS = saved.f;
    }
  });

  test('room.setConsole: a solo room\'s own player, before the match; room.state `console`; its match is a console match; co-op rooms never', async () => {
    const srv = await startServer({ port: 0, host: '127.0.0.1', MatchClass: StubMatch, log: { info() {}, warn() {}, debug() {}, error() {} } });
    const open = [];
    const player = async (name) => { const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`); open.push(c); c.id = (await c.hello(name)).playerId; return c; };
    try {
      const solo = await player('Solo');
      assert.equal((await solo.request({ t: 'room.setConsole', on: true })).code, ERR.NOT_IN_ROOM);
      assert.equal((await solo.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
      const off = await solo.waitFor('room.state', (s) => s.mode === 'solo');
      assert.equal(off.console, undefined, 'off by default');
      assert.equal((await solo.request({ t: 'room.setConsole', on: true })).t, 'ok');
      assert.equal((await solo.waitFor('room.state', (s) => s.console === true)).console, true);
      const room = [...srv.lobby.rooms.values()].find((r) => r.mode === 'solo');
      assert.equal(room.console, true);
      const coop = await player('Coop');
      assert.equal((await coop.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok');
      assert.equal((await coop.request({ t: 'room.setConsole', on: true })).code, ERR.BAD_TARGET, 'co-op rooms never');
      // the lobby marks the match it starts (StubMatch here; a real Match reads the flag the same way)
      const fake = {};
      onMatchCreate(room, fake);
      assert.equal(fake.console, true);
      const coopRoom = [...srv.lobby.rooms.values()].find((r) => r.mode === 'coop');
      coopRoom.console = true; const f2 = {}; onMatchCreate(coopRoom, f2); assert.equal(f2.console, undefined, 'a co-op room never makes one');
      assert.equal((await solo.request({ t: 'room.start' })).t, 'ok');
      await solo.waitFor('room.state', (s) => s.inMatch === true);
      assert.equal((await solo.request({ t: 'room.setConsole', on: false })).code, ERR.ROOM_STARTED, 'fixed for the match');
      assert.equal(srv.lobby.roomSnapshot(room).console, true, 'a waiting room handed to the next server keeps it');
    } finally { await Promise.all(open.map((c) => c.terminate().catch(() => {}))); await srv.close(); }
  });

  test('a console match: con.* from its player without debug mode; m.public.console and m.private.console', () => {
    const h = consoleMatch(), m = h.m, ps = h.ps('p_0');
    assert.deepEqual(consoleIntent(m, 'p_0', { t: 'con.funds', on: true }, OFF), { ok: true });
    assert.equal(ps.funds, 99);
    const v = consoleView(ps, OFF);
    assert.equal(v.console, true);
    assert.equal(v.fundsPin, true);
    assert.equal(v.boss.round, m.gd.bossRound);
    assert.equal(v.rounds.last, lastConsoleRound(m));
    assert.ok(v.boss.bosses.includes(m.bossId));
    assert.ok(Array.isArray(v.candidates) && v.candidates.length > 10);
    assert.equal(ps.privateView().console.console, true, 'm.private.console');
    h.flushAll();
    assert.equal(h.lastBc('m.public').console, true, 'm.public.console: the CONSOLE mark');
    assert.deepEqual(m.consoleLog.map((x) => x.t), ['funds'], 'the console log');
  });
});

describe('the commands (local debug mode in a co-op match, as the old debug panel)', () => {
  test('con.funds pins the sender\'s funds (others untouched) and unpins them', async () => {
    const { consoleIntent, consoleView } = await import('../server/local-console.js');
    const h = prep(), ps = h.ps('p_0'), other = h.ps('p_1');
    ps.funds = 7; other.funds = 5;
    assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.funds', on: true }, DEBUG_ENV), { ok: true });
    assert.equal(ps.funds, 99);
    assert.equal(consoleView(ps, DEBUG_ENV).fundsPin, true);
    assert.ok(ps.spend(10)); assert.equal(ps.funds, 99, 'spending never lowers it');
    assert.equal(other.funds, 5, 'another player keeps real funds');
    assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.funds', on: false }, DEBUG_ENV), { ok: true });
    assert.equal(ps.funds, 99, 'unpinned: starts from the pinned value');
    assert.ok(ps.spend(4)); assert.equal(ps.funds, 95);
    assert.equal(consoleView(ps, DEBUG_ENV).fundsPin, false);
    assert.deepEqual(consoleView(ps, DEBUG_ENV).candidates.map((c) => c.charId), ['char_2027_wang', 'char_1050_chen3', 'char_1035_wisdel', 'char_4182_oblvns', 'char_4132_ascln',
      'char_1052_kalts2', 'char_4231_clemnt', 'char_1015_aglna2', 'char_1042_phatm2', 'char_4244_tocka', 'char_4247_oxi', 'char_485_pallas', 'char_188_helage', 'char_4204_mantra',
      'char_4072_ironmn', 'char_4202_haruka', 'char_179_cgbird', 'char_4065_judge', 'char_4133_logos', 'char_4098_vvana',
      'char_4037_demetr', 'char_4226_veen', 'char_1051_headb2', 'char_4179_monstr', 'char_2025_shu', 'char_322_lmlee', 'char_416_zumama', 'char_4046_ebnhlz',
      'char_1034_jesca2', 'char_4055_bgsnow', 'char_180_amgoat', 'char_293_thorns', 'char_4009_irene', 'char_400_weedy', 'char_113_cqbw', 'char_4027_heyak', 'char_4228_closur', 'char_4246_dminon',
      'char_4217_makoto', 'char_1031_slent2', 'char_4088_hodrer', 'char_4230_mcnist'], 'the forty-two offered 自选 picks (shared/local-diy.js)');
  });

  test('con.addDiy sets a 自选 pick on a slot of the tier and puts its chess into the hand (merges), refuses a full hand and non-candidates', async () => {
    const { consoleIntent } = await import('../server/local-console.js');
    const h = prep(), ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (f) => consoleIntent(h.m, 'p_0', { t: 'con.addDiy', ...f }, DEBUG_ENV);
    assert.deepEqual(add({ charId: 'char_1035_wisdel', tier: 5, golden: true }), { ok: true });
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => p.id), ['chess_char_5_diy1_b'], 'an elite straight into the hand');
    assert.equal(ps.diy.chess_char_5_diy1_a.charId, 'char_1035_wisdel');
    for (let i = 0; i < 3; i++) assert.deepEqual(add({ charId: 'char_2027_wang', tier: 6 }), { ok: true });
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => p.id).sort(), ['chess_char_5_diy1_b', 'chess_char_6_diy1_b'], 'three normal copies merge into the elite');
    assert.equal(ps.gd.chess('chess_char_6_diy1_b').charId, 'char_2027_wang', 'the slot fields 望 for this player');
    assert.equal(add({ charId: 'char_112_siege', tier: 6 }).error, ERR.BAD_TARGET, 'only the five candidates');
    assert.deepEqual(add({ charId: 'char_4132_ascln', tier: 6 }), { ok: true }, 'the second tier-6 slot');
    assert.equal(add({ charId: 'char_1050_chen3', tier: 6 }).error, ERR.BAD_TARGET, 'both tier-6 slots taken by others');
    while (ps.hand.includes(null)) assert.deepEqual(add({ charId: 'char_4132_ascln', tier: 6, golden: true }), { ok: true });
    assert.equal(add({ charId: 'char_1050_chen3', tier: 5 }).error, ERR.HAND_FULL, 'the hand is full');
    assert.equal(ps.temp.filter(Boolean).length, 0, 'nothing spilled into temp');
  });

  test('con.addDiy puts one operator at both tiers (the roster\'s one-slot rule is not applied; it used to fail as HAND_FULL)', async () => {
    const { consoleIntent } = await import('../server/local-console.js');
    for (const order of [[5, 6], [6, 5]]) {
      const h = prep(), ps = h.ps('p_0');
      ps.hand.fill(null);
      for (const tier of order) assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.addDiy', charId: 'char_2027_wang', tier }, DEBUG_ENV), { ok: true }, `tier ${tier} after ${order[0]}`);
      assert.equal(ps.diy.chess_char_5_diy1_a.charId, 'char_2027_wang');
      assert.equal(ps.diy.chess_char_6_diy1_a.charId, 'char_2027_wang', 'the first pick is kept');
      assert.deepEqual(ps.hand.filter(Boolean).map((p) => ps.gd.chess(p.id).charId), ['char_2027_wang', 'char_2027_wang'], 'both pieces have a body');
    }
  });

  test('con.addDiy with the room\'s 自选编队 filling every slot: replaces a slot whose operator has no piece, keeps one with pieces', async () => {
    const { consoleIntent } = await import('../server/local-console.js');
    const pk = (charId) => ({ charId, skillIndex: 0, uniEquipId: null });
    const diy = { chess_char_5_diy1_a: pk('char_1035_wisdel'), chess_char_5_diy2_a: pk('char_4182_oblvns'), chess_char_6_diy1_a: pk('char_2027_wang'), chess_char_6_diy2_a: pk('char_1050_chen3') };
    const h = makeMatch({ mode: 'coop', seats: humans().map((s, i) => (i === 0 ? { ...s, diy } : s)), seed: 3 }); h.start(); h.toPrep(1);
    const ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (f) => consoleIntent(h.m, 'p_0', { t: 'con.addDiy', ...f }, DEBUG_ENV);
    assert.deepEqual(add({ charId: 'char_4132_ascln', tier: 6 }), { ok: true });
    assert.equal(ps.diy.chess_char_6_diy1_a.charId, 'char_4132_ascln', 'the first slot without a piece');
    assert.equal(ps.diy.chess_char_6_diy2_a.charId, 'char_1050_chen3');
    assert.deepEqual(add({ charId: 'char_2027_wang', tier: 6 }), { ok: true }, 'the other slot had no piece either');
    const full = add({ charId: 'char_1050_chen3', tier: 6 });
    assert.equal(full.error, ERR.BAD_TARGET, 'both slots now hold pieces');
    const { diySlotsFullOf } = await import('../public/js/ui/consoleLists.js');
    assert.deepEqual(diySlotsFullOf(full.detail), { tier: 6, names: ['阿斯卡纶', '望'] }, 'the panel toasts this refusal with the names (its detail)');
    assert.equal(diySlotsFullOf('not a DIY candidate'), null);
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => ps.gd.chess(p.id).charId).sort(), ['char_2027_wang', 'char_4132_ascln']);
  });

  test('con.addDiy skill / module: checked against the pick\'s forms, fought with in battle, no stock copies taken', async () => {
    const { consoleIntent, consoleView } = await import('../server/local-console.js');
    const { tileKey } = await import('../server/match/board.js');
    const h = prep(), m = h.m, ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (f) => consoleIntent(m, 'p_0', { t: 'con.addDiy', ...f }, DEBUG_ENV);
    assert.equal(add({ charId: 'char_2027_wang', tier: 6, golden: true, skill: 5 }).error, ERR.BAD_TARGET, 'no S6');
    assert.equal(add({ charId: 'char_2027_wang', tier: 6, golden: true, module: 'uniequip_002_wisdel' }).error, ERR.BAD_TARGET, 'another operator\'s module');
    assert.equal(ps.hand.filter(Boolean).length, 0);
    const stock = JSON.stringify([...(ps.diyStock?.entries || [])]), poolBefore = JSON.stringify([...m.pool.entries]);
    assert.deepEqual(add({ charId: 'char_2027_wang', tier: 6, golden: true, skill: 2, module: 'none' }), { ok: true });
    assert.deepEqual({ ...ps.diy.chess_char_6_diy1_a }, { charId: 'char_2027_wang', skillIndex: 2, uniEquipId: null });
    const piece = ps.hand.find(Boolean);
    ps.hand[ps.hand.indexOf(piece)] = null; ps.board.set(tileKey(10, 2), piece); ps.recompute();
    const u = ps.battleInput().units.find((x) => x.uid === piece.uid);
    assert.deepEqual(u.diy, { charId: 'char_2027_wang', skillIndex: 2, uniEquipId: null }, 'the battle fights with the choice');
    assert.equal(JSON.stringify([...m.pool.entries]), poolBefore, 'no pool copies taken');
    assert.equal(JSON.stringify([...(ps.diyStock?.entries || [])]), stock, 'no stock copies taken');
    const wang = consoleView(ps, DEBUG_ENV).candidates.find((c) => c.charId === 'char_2027_wang');
    assert.deepEqual(wang.tiers[6].skills.map((s) => s.index), [0, 1, 2]);
    assert.equal(wang.tiers[6].skills[0].name, '取势');
    assert.deepEqual(wang.tiers[6].modules.map((x) => x.id), ['none', 'uniequip_002_wang']);
  });

  test('con.addChess puts any normal chess (hidden ones too) into the hand without pool copies, merges, refuses 自选 slots / elite ids / a full hand', async () => {
    const { consoleIntent } = await import('../server/local-console.js');
    assert.equal(validateC2S({ t: 'con.addChess', chessId: 'chess_char_1_01_a', golden: true }), null);
    assert.equal(validateC2S({ t: 'con.addChess', chessId: 'chess_char_1_01_a' }), null);
    assert.ok(validateC2S({ t: 'con.addChess', chessId: 'char_498_inside' }));
    const h = prep(), m = h.m, ps = h.ps('p_0');
    ps.hand.fill(null);
    const add = (f, env = DEBUG_ENV) => consoleIntent(m, 'p_0', { t: 'con.addChess', ...f }, env);
    assert.equal(add({ chessId: 'chess_char_1_01_a' }, {}).error, ERR.BAD_MSG, 'off outside debug mode');
    const pool = JSON.stringify([...m.pool.entries]);
    const hidden = Object.keys(m.gd.raw.chess).find((id) => { const c = m.gd.chess(id); return c.isHidden && !c.isGolden && !c.isDiy; });
    assert.ok(hidden, 'data/chess.json has a hidden normal chess');
    assert.deepEqual(add({ chessId: hidden }), { ok: true }, 'a hidden chess too');
    assert.deepEqual(add({ chessId: 'chess_char_6_01_a', golden: true }), { ok: true });
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => p.id).sort(), [hidden, 'chess_char_6_01_b'].sort());
    assert.equal(JSON.stringify([...m.pool.entries]), pool, 'no pool copies taken');
    // (a merge still tops its elite up to goldenCopies from the pool: PlayerState._mergeChess, as for any gain)
    for (let i = 0; i < 3; i++) assert.deepEqual(add({ chessId: 'chess_char_1_01_a' }), { ok: true });
    assert.deepEqual(ps.hand.filter(Boolean).map((p) => p.id).sort(), [hidden, 'chess_char_1_01_b', 'chess_char_6_01_b'].sort(), 'three normal copies merge');
    assert.equal(add({ chessId: 'chess_char_1_01_b' }).error, ERR.BAD_TARGET, 'an elite id: golden instead');
    assert.equal(add({ chessId: 'chess_char_6_diy1_a' }).error, ERR.BAD_TARGET, 'a 自选 slot: con.addDiy');
    assert.equal(add({ chessId: 'chess_char_9_99_a' }).error, ERR.BAD_TARGET);
    while (ps.hand.includes(null)) assert.deepEqual(add({ chessId: 'chess_char_2_01_a', golden: true }), { ok: true });
    assert.equal(add({ chessId: 'chess_char_3_01_a' }).error, ERR.HAND_FULL);
    assert.equal(ps.temp.filter(Boolean).length, 0, 'nothing spilled into temp');
  });

  test('the panel lists every normal chess and the 自选 picks, filtered by bond / tier / name (public/js/ui/consoleLists.js)', async () => {
    const { debugEntries, filterDebugEntries } = await import('../public/js/ui/consoleLists.js');
    const { consoleView } = await import('../server/local-console.js');
    const h = prep(), ps = h.ps('p_0'), gd = h.m.gd;
    const cands = consoleView(ps, DEBUG_ENV).candidates;
    assert.ok(cands.every((c) => Array.isArray(c.bonds) && c.bonds.length), 'every 自选 pick has its bonds');
    const chess = Object.values(gd.raw.chess);
    const all = debugEntries(chess, cands, () => null, (id) => gd.bond(id));
    const normal = chess.filter((c) => !c.isGolden && !c.isDiy);
    assert.equal(all.length, normal.length + cands.length, 'every normal chess (hidden too) plus the picks');
    assert.ok(all.some((e) => e.hidden));
    assert.deepEqual(filterDebugEntries(all, { bond: 'diy' }).map((e) => e.cand.charId), cands.map((c) => c.charId).sort((a, b) => all.findIndex((e) => e.key === `diy:${a}`) - all.findIndex((e) => e.key === `diy:${b}`)));
    const yan6 = filterDebugEntries(all, { bond: 'yanShip', tier: 6 });
    assert.ok(yan6.length && yan6.every((e) => e.tiers.includes(6) && e.bonds.includes('yanShip')));
    assert.ok(yan6.some((e) => e.kind === 'diy' && e.cand.charId === 'char_2027_wang'), '望 is a 炎 pick of tier VI');
    assert.deepEqual(filterDebugEntries(all, { query: 'Insider' }).map((e) => e.key), ['chess_char_1_01_a'], 'the English appellation');
    assert.deepEqual(filterDebugEntries(all, { query: '隐现' }).map((e) => e.key), ['chess_char_1_01_a'], 'the Chinese name');
    assert.equal(filterDebugEntries(all, { tier: 1, bond: 'diy' }).length, 0);
  });

  test('con.addEnemy queues extra enemies for the sender\'s next battle only (a 0-coin one-battle bounty), con.clearEnemies drops them', async () => {
    const { consoleIntent, consoleView } = await import('../server/local-console.js');
    const { debugEnemyEntries } = await import('../public/js/ui/consoleLists.js');
    assert.equal(validateC2S({ t: 'con.addEnemy', enemyKey: 'enemy_1007_slime', count: 20 }), null);
    assert.equal(validateC2S({ t: 'con.addEnemy', enemyKey: 'enemy_1007_slime' }), null);
    assert.ok(validateC2S({ t: 'con.addEnemy', enemyKey: 'enemy_1007_slime', count: 21 }));
    assert.ok(validateC2S({ t: 'con.addEnemy', enemyKey: 'char_1_x' }));
    assert.equal(validateC2S({ t: 'con.clearEnemies' }), null);
    const h = prep(), m = h.m, ps = h.ps('p_0');
    const enemies = Object.values(m.gd.raw.enemies);
    const key = enemies.find((e) => e.rank === 'NORMAL' && !e.tokenOnly && !e.isFlyEnemy).key;
    const fly = enemies.find((e) => e.rank === 'ELITE' && !e.tokenOnly && e.isFlyEnemy).key;
    const token = enemies.find((e) => e.tokenOnly).key;
    const add = (f, env = DEBUG_ENV) => consoleIntent(m, 'p_0', { t: 'con.addEnemy', ...f }, env);
    assert.equal(add({ enemyKey: key }, {}).error, ERR.BAD_MSG, 'off outside debug mode');
    assert.equal(add({ enemyKey: token }).error, ERR.BAD_TARGET, 'a token-only summon');
    assert.equal(add({ enemyKey: 'enemy_9999_none' }).error, ERR.BAD_TARGET);
    assert.deepEqual(add({ enemyKey: key, count: 3 }), { ok: true });
    assert.deepEqual(add({ enemyKey: fly }), { ok: true });
    assert.deepEqual(consoleView(ps, DEBUG_ENV).enemies, [{ enemyKey: key, count: 3 }, { enemyKey: fly, count: 1 }]);
    const extra = (pid) => m._normalOpts(h.ps(pid)).spawns.filter((s) => s.tag === 'bounty');
    const sum = (list, k) => list.filter((s) => s.enemyKey === k).reduce((n, s) => n + s.count, 0);
    assert.equal(sum(extra('p_0'), key), 3, 'the battle spec of the sender');
    assert.equal(sum(extra('p_0'), fly), 1);
    assert.ok(extra('p_0').every((s) => !s.bounty), 'no coins on them');
    assert.equal(extra('p_1').length, 0, 'not the other player');
    assert.ok(ps.privateView().nextEnemies.some((e) => e.enemyKey === key && e.source === 'bounty'), 'in the 敌情 preview');
    assert.deepEqual(consoleIntent(m, 'p_0', { t: 'con.clearEnemies' }, DEBUG_ENV), { ok: true });
    assert.deepEqual(consoleView(ps, DEBUG_ENV).enemies, []);
    assert.equal(extra('p_0').length, 0);
    // they spawn in the round's battle and are gone after its settlement
    assert.deepEqual(add({ enemyKey: key, count: 2 }), { ok: true });
    const specs = [];
    const newBattle = m.newBattle;
    m.newBattle = function (opts) { if (opts.kind === 'normal') specs.push(opts); return newBattle.call(this, opts); };
    h.toPrep(2);
    const mine = specs.find((o) => o.fieldId === 'n:p_0');
    assert.equal(sum(mine.spawns, key) - sum(specs.find((o) => o.fieldId === 'n:p_1').spawns, key), 2, 'two more than the other field');
    assert.deepEqual(consoleView(ps, DEBUG_ENV).enemies, [], 'one battle only');
    const listed = debugEnemyEntries(enemies);
    assert.ok(!listed.some((e) => e.key === token) && listed.some((e) => e.key === fly), 'the panel leaves token-only summons out');
  });

  test('con.addItem puts an item (or its strengthened form) into the hand outside the equipment stock; refuses a golden id and a full zone', () => {
    const h = prep(), m = h.m, ps = h.ps('p_0');
    ps.hand.fill(null);
    const items = Object.values(m.gd.raw.items);
    const it = items.find((x) => !x.isGolden && x.itemType === 'EQUIP' && x.goldenId && x.goldenId !== x.id);
    const add = (f, env = DEBUG_ENV) => consoleIntent(m, 'p_0', { t: 'con.addItem', ...f }, env);
    assert.equal(add({ itemId: it.id }, OFF).error, ERR.BAD_MSG, 'off outside debug mode / a console match');
    const stock = m.itemPool.left(it.id);
    assert.deepEqual(add({ itemId: it.id }), { ok: true });
    assert.deepEqual(add({ itemId: it.id, golden: true }), { ok: true });
    const held = [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item').map((p) => p.id).sort();
    assert.deepEqual(held, [it.id, it.goldenId].sort());
    assert.equal(m.itemPool.left(it.id), stock, 'no stock copy taken');
    assert.equal(add({ itemId: it.goldenId }).error, ERR.BAD_TARGET, 'a golden id: golden instead');
    assert.equal(add({ itemId: 'chess_item_9_99_x' }).error, ERR.BAD_TARGET);
  });

  test('con.presetBoard rebuilds every seat\'s board around a bond now (AI too, kept as placed), with the layer level', () => {
    const h = makeMatch({ mode: 'coop', humans: 1, bots: 3, seed: 5 });
    h.start(); h.toPrep(1);
    const m = h.m, gd = m.gd;
    const preset = (f, env = DEBUG_ENV) => consoleIntent(m, 'p_0', { t: 'con.presetBoard', ...f }, env);
    assert.equal(preset({ layers: 'normal' }, OFF).error, ERR.BAD_MSG);
    assert.equal(preset({ bondId: 'noSuchShip', layers: 'normal' }).error, ERR.BAD_TARGET, 'a bond without chess');
    assert.deepEqual(preset({ bondId: 'yanShip', layers: 'normal' }), { ok: true });
    assert.equal(m.round, 1, 'the round stays');
    const core = new Map();
    for (const ps of m.order) {
      assert.equal(ps.deployCount, ps.deployCap, `${ps.playerId} full board`);
      assert.ok([...ps.board.values()].every((p) => p.kind !== 'chess' || gd.isGolden(p.id)), `${ps.playerId} every operator elite`);
      const top = Object.entries(ps.bonds).filter(([id, b]) => b.active && gd.bond(id).isCore).sort(([, a], [, b]) => b.layers - a.layers)[0];
      assert.ok(top && top[1].layers === 150, `${ps.playerId} core bond on the R14 curve`);
      core.set(ps.playerId, top[0]);
    }
    assert.equal(core.get('p_0'), 'yanShip', 'the sender\'s chosen bond');
    assert.equal(new Set(core.values()).size, m.order.length, 'distinct bonds per seat');
    h.invariants();
    const boards = () => m.order.filter((p) => p.isBot).map((p) => [...p.board].map(([k, x]) => `${k}:${x.id}`).sort().join(' '));
    const placed = boards();
    h.sched.advance(10000);
    assert.ok(m.order.filter((p) => p.isBot).every((p) => p.ready), 'the AI seats Ready');
    assert.deepEqual(boards(), placed, 'without rearranging');
  });

  test('con.end without the console: \'result\' ends the match as won / lost (the old debug finish); off outside debug mode', () => {
    let h = prep();
    assert.equal(consoleIntent(h.m, 'p_0', { t: 'con.end', to: 'result', victory: true }, OFF).error, ERR.BAD_MSG);
    assert.equal(h.m.ended, false);
    assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.end', to: 'result', victory: true }, DEBUG_ENV), { ok: true });
    assert.equal(h.m.ended, true);
    assert.equal(h.ended.reason, 'victory');
    assert.equal(h.ended.console, undefined, 'not a console match: recorded as usual');
    for (const id of ['p_0', 'p_1']) assert.equal(h.lastTo(id, 'm.result')?.victory, true);
    assert.equal(consoleIntent(h.m, 'p_0', { t: 'con.end', to: 'result', victory: false }, DEBUG_ENV).error, ERR.WRONG_PHASE, 'once');
    h = prep();
    consoleIntent(h.m, 'p_1', { t: 'con.end', to: 'result', victory: false }, DEBUG_ENV);
    assert.equal(h.ended.reason, 'defeat');
  });
});

describe('the console match never ends by its rules', () => {
  test('con.jumpRound: forward to the Final Assault and back to R2, the leader set beforehand; prep only; the rounds 1..last', () => {
    const h = consoleMatch(), m = h.m, gd = m.gd;
    const jump = (round) => consoleIntent(m, 'p_0', { t: 'con.jumpRound', round }, OFF);
    assert.equal(jump(lastConsoleRound(m) + 1).error, ERR.BAD_TARGET, 'past the last round');
    const leader = consoleView(h.ps('p_0'), OFF).boss.bosses.find((id) => id !== m.bossId);
    assert.deepEqual(consoleIntent(m, 'p_0', { t: 'con.setBoss', final: leader }, OFF), { ok: true });
    assert.equal(consoleIntent(m, 'p_0', { t: 'con.setBoss', final: 'boss_99' }, OFF).error, ERR.BAD_TARGET);
    assert.equal(m.bossId, leader);
    assert.deepEqual(jump(gd.bossRound), { ok: true });
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === gd.bossRound, { ready: false }), 'the Final Assault\'s prep');
    assert.ok(m.bossWaves.length >= 1, 'its field is planned');
    assert.ok(JSON.stringify(m.bossWaves).includes(gd.raw.bosses[leader].enemyKey), 'with the chosen leader');
    assert.deepEqual(jump(2), { ok: true }, 'back');
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === 2, { ready: false }));
    assert.equal(m.bossWaves, null, 'a normal round again');
    assert.equal(m.teamLp, null);
    h.invariants();
    h.drive(() => m.phase === 'COMBAT');
    assert.equal(jump(3).error, ERR.WRONG_PHASE, 'prep only');
  });

  test('LP run out in a normal round: not eliminated — LP back to the start value, the same round\'s prep again, a notice; no elimination toast', () => {
    const h = consoleMatch(), m = h.m, ps = h.ps('p_0');
    const start = m.gd.startLp(ps.bandId);
    for (const p of [...ps.board.values()]) ps.board.delete([...ps.board.entries()].find(([, x]) => x === p)[0]);
    ps.recompute();
    ps.lp = 1;
    const round = m.round;
    assert.ok(h.drive(() => m.phase === 'SETTLE'), 'the battle is fought');
    assert.ok(h.drive(() => m.phase === 'PREP', { ready: false }));
    assert.equal(h.ended, null, 'the match goes on');
    assert.equal(m.round, round, 'the same round again');
    assert.equal(ps.alive, true);
    assert.equal(ps.lp, start, 'LP back to the start value');
    assert.equal(consoleView(ps, OFF).note.kind, 'eliminated');
    assert.equal(consoleView(ps, OFF).note.round, round);
    assert.ok(!h.allTo('p_0', 'm.toast').some((x) => /淘汰/.test(x.msgid || x.text || '')), 'no elimination toast');
    h.invariants();
  });

  test('the Final Assault lost or cleared: back to its prep with a notice (LP restored when it ran out); the cleared one is remembered', () => {
    const h = consoleMatch(), m = h.m, ps = h.ps('p_0'), gd = m.gd;
    assert.deepEqual(consoleIntent(m, 'p_0', { t: 'con.jumpRound', round: gd.bossRound }, OFF), { ok: true });
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === gd.bossRound, { ready: false }));
    // the boss fight's end as bossRounds.js reports it (a lost fight, then a cleared one)
    ps.lp = 0;
    m.finish({ victory: false, reason: 'defeat' });
    assert.equal(m.ended, false);
    assert.equal(m.round, gd.bossRound);
    assert.equal(ps.lp, gd.startLp(ps.bandId));
    assert.equal(consoleView(ps, OFF).note.kind, 'defeat');
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === gd.bossRound, { ready: false }));
    m.finish({ victory: true, reason: 'victory' });
    assert.equal(m.ended, false);
    assert.equal(consoleView(ps, OFF).note.kind, 'cleared');
    assert.equal(m.consoleCleared, true);
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === gd.bossRound, { ready: false }), 'the same round\'s prep');
    // a real lost Final Assault (an empty board) goes back the same way
    ps.board.clear(); ps.recompute();
    const seq = consoleView(ps, OFF).note.seq;
    assert.ok(h.drive(() => consoleView(ps, OFF).note.seq > seq || h.ended != null, { ready: true }), 'the fight is played to its end');
    assert.equal(h.ended, null);
    assert.equal(consoleView(ps, OFF).note.kind, 'defeat');
    assert.ok(h.drive(() => m.phase === 'PREP' && m.round === gd.bossRound, { ready: false }));
    h.invariants();
  });

  test('con.setLayers / con.resetLayers: one bond\'s layers now (capped), the reset puts back what was there before', () => {
    const h = consoleMatch(), m = h.m, ps = h.ps('p_0');
    const before = { ...ps.layers };
    const set = (bondId, layers) => consoleIntent(m, 'p_0', { t: 'con.setLayers', bondId, layers }, OFF);
    assert.equal(set('noSuchShip', 5).error, ERR.BAD_TARGET);
    assert.deepEqual(set('yanShip', 60), { ok: true });
    assert.deepEqual(set('yanShip', 5000), { ok: true });
    assert.equal(ps.layers.yanShip, consoleView(ps, OFF).layerCap, 'capped');
    assert.equal(consoleView(ps, OFF).layersEdited, true);
    assert.deepEqual(set('yanShip', 0), { ok: true });
    assert.equal(ps.layers.yanShip, undefined);
    assert.deepEqual(set('yanShip', 12), { ok: true });
    assert.deepEqual(consoleIntent(m, 'p_0', { t: 'con.resetLayers' }, OFF), { ok: true });
    assert.deepEqual(ps.layers, before);
    assert.equal(consoleView(ps, OFF).layersEdited, false);
  });

  test('con.end: \'lobby\' / \'result\' end it for real, marked and logged — no [stats] line; a feedback report from the running match carries the log', () => {
    let h = consoleMatch();
    consoleIntent(h.m, 'p_0', { t: 'con.jumpRound', round: 3 }, OFF);
    assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.end', to: 'lobby' }, OFF), { ok: true });
    assert.equal(h.m.ended, true);
    assert.equal(h.ended.reason, 'consoleLobby');
    assert.deepEqual(h.ended.console.log.map((x) => x.t), ['jumpRound', 'end']);
    assert.equal(h.lastTo('p_0', 'm.result').reason, 'consoleLobby', 'the page goes back to the room');
    h = consoleMatch();
    assert.deepEqual(consoleIntent(h.m, 'p_0', { t: 'con.end', to: 'result' }, OFF), { ok: true });
    assert.equal(h.ended.reason, 'console', 'the settlement screen, shown only');
    // no [stats] line for it (local-patch.js onMatchEnd → local-stats.js)
    const lines = [];
    const lobby = { log: { info: (s) => lines.push(String(s)), warn() {}, error() {} }, feedback: new FeedbackInbox({ dir: null }) };
    onMatchEnd(lobby, { code: 'ABCD', matchCount: 1, mode: 'solo', seats: [], spectators: [], lastSummary: h.ended });
    assert.ok(!lines.some((l) => l.includes('[stats]')), 'no [stats] line');
    // the console's 「✎ 제보」 while the match runs
    const dir = mkdtempSync(path.join(os.tmpdir(), 'sp-console-fb-'));
    try {
      const inbox = new FeedbackInbox({ dir, log: { info() {}, warn() {}, error() {} } });
      const live = consoleMatch();
      consoleIntent(live.m, 'p_0', { t: 'con.jumpRound', round: 5 }, OFF);
      const room = { code: 'WXYZ', matchCount: 1, mode: 'solo', match: live.m, seats: [{ playerId: 'p_0', isBot: false }], seatOf: (id) => (id === 'p_0' ? { playerId: 'p_0', isBot: false } : null) };
      const lb = { feedback: inbox, roomOf: () => room };
      const fb = { t: 'fb.send', id: 'abcd1234', kind: 'bug', text: '13라운드에서 이상해요' };
      assert.equal(inbox.submit({ playerId: 'p_0' }, fb).error, ERR.WRONG_PHASE, 'no finished match, no live console');
      assert.deepEqual(onMessage(lb, { playerId: 'p_0', addr: '1.2.3.4' }, fb), { ok: true });
      const [file] = readdirSync(path.join(dir, 'inbox'));
      const rec = JSON.parse(readFileSync(path.join(dir, 'inbox', file), 'utf8'));
      assert.deepEqual(rec.console.map((x) => [x.t, x.round ?? x.r]), [['jumpRound', 5]]);
      inbox.stop();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

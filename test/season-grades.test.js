// 规程 rooms (server/lobby.js header 「规程等级」): a solo room of a season with `soloGrades` plays 规程等级 1–20 or 极速模拟
// (room `grade`, modeIdFor → mode_single_<grade> / mode_single_funny), every grade open; a season with `noCustomOrLarge`
// refuses the custom ruleset and 8 seats (room.create, room.setRuleset, room.setSize, room.queue); the strategy list
// leaves out a strategy's inactiveModeIds (bandDraft.js allowedBands, as GameData.bandAllowed); the mode descriptions
// carry no unlock clause (tools/build-data.mjs modeDescNoUnlock).

import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SEASON, seasonFeature } from '../shared/seasons.js';
import { ERR, FAST_GRADE, MAX_GRADE, firstGrade, gradeDifficulty, isGrade, modeIdFor } from '../shared/constants.js';
import { validateC2S } from '../shared/protocol.js';
import { getData } from '../server/data.js';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { allowedBands } from '../public/js/screens/bandDraft.js';
import { TestClient } from './helpers/wsClient.js';
import { makeMatch } from './match/harness.js';

const ACT3 = 'act3autochess';
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const DATA3 = getData({ log: quiet, season: ACT3 });

test('the season switches: 规程 has grades and no custom / 8-player room; 盟约 neither', () => {
  assert.deepEqual([seasonFeature(ACT3, 'soloGrades'), seasonFeature(ACT3, 'noCustomOrLarge')], [true, true]);
  assert.deepEqual([seasonFeature(DEFAULT_SEASON, 'soloGrades'), seasonFeature(DEFAULT_SEASON, 'noCustomOrLarge')], [false, false]);
});

test('modeIdFor: a graded solo room names its grade\'s mode, 极速模拟 the FUNNY one; every other room as before', () => {
  assert.equal(modeIdFor('solo', 'HARD', 9), 'mode_single_9');
  assert.equal(modeIdFor('solo', 'FUNNY', FAST_GRADE), 'mode_single_funny');
  assert.equal(modeIdFor('solo', 'NORMAL'), 'mode_single_normal');
  assert.equal(modeIdFor('solo', 'NORMAL', null), 'mode_single_normal');
  assert.equal(modeIdFor('coop', 'HARD', 9), 'mode_multi_hard');
  // every grade is a mode of the season's data, its difficulty the table's (极速模拟's FAST: the room says FUNNY)
  for (let g = FAST_GRADE; g <= MAX_GRADE; g++) {
    const mode = DATA3.config.modes[modeIdFor('solo', gradeDifficulty(g), g)];
    assert.ok(mode, `grade ${g}`);
    assert.equal(mode.type, 'SINGLE');
    assert.equal(g === FAST_GRADE ? 'FUNNY' : mode.difficulty, gradeDifficulty(g), `grade ${g}`);
  }
  assert.deepEqual(['FUNNY', 'NORMAL', 'HARD', 'ABYSS'].map(firstGrade), [1, 5, 9, 15]);
  assert.deepEqual([isGrade(0), isGrade(20), isGrade(21), isGrade(-1), isGrade(1.5), isGrade('3')], [true, true, false, false, false, false]);
});

test('protocol: room.create / room.setDifficulty take an optional grade 0–20', () => {
  const ok = (m) => validateC2S(m) === null;
  assert.ok(ok({ t: 'room.create', mode: 'solo', difficulty: 'HARD', season: ACT3, grade: 12 }));
  assert.ok(ok({ t: 'room.create', mode: 'solo', difficulty: 'HARD' }));
  assert.ok(!ok({ t: 'room.create', mode: 'solo', difficulty: 'HARD', grade: 21 }));
  assert.ok(ok({ t: 'room.setDifficulty', difficulty: 'FUNNY', grade: 0 }));
  assert.ok(ok({ t: 'room.setDifficulty', difficulty: 'FUNNY' }));
  assert.ok(!ok({ t: 'room.setDifficulty', difficulty: 'FUNNY', grade: '3' }));
});

test('the real match path: a grade\'s mode drives the match (rounds, difficulty, hidden core)', () => {
  const nine = makeMatch({ mode: 'solo', difficulty: 'HARD', modeId: 'mode_single_9', data: DATA3, season: ACT3, fake: true });
  assert.equal(nine.m.gd.mode.name, '规程等级9');
  assert.equal(nine.m.gd.difficulty, 'HARD');
  assert.equal(nine.m.gd.hiddenRound, 15);
  const fast = makeMatch({ mode: 'solo', difficulty: 'FUNNY', modeId: modeIdFor('solo', 'FUNNY', FAST_GRADE), data: DATA3, season: ACT3, fake: true });
  assert.equal(fast.m.gd.mode.name, '极速模拟');
  assert.equal(fast.m.gd.lastRound, 9);
  assert.equal(fast.m.gd.hiddenRound, null);
});

test('mode descriptions: no unlock clause (no unlocks on this server), the rest of the line kept', () => {
  for (const m of Object.values(DATA3.config.modes)) assert.ok(!/解锁/.test(m.desc ?? ''), m.modeId);
  assert.equal(DATA3.config.modes.mode_multi_hard.desc, '追加更多敌人');
  assert.equal(DATA3.config.modes.mode_single_15.desc, null);
});

test('strategy list: a strategy is left out of the modes it names inactive, as the server does', () => {
  const bands = [
    { bandId: 'a', sortId: 1, modeTypeList: ['SINGLE'], inactiveModeIds: ['mode_single_1'] },
    { bandId: 'b', sortId: 2, modeTypeList: ['SINGLE'] },
  ];
  assert.deepEqual(allowedBands(bands, 'SINGLE', 'mode_single_1').map((b) => b.bandId), ['b']);
  assert.deepEqual(allowedBands(bands, 'SINGLE', 'mode_single_2').map((b) => b.bandId), ['a', 'b']);
  assert.deepEqual(allowedBands(bands, 'SINGLE').map((b) => b.bandId), ['a', 'b']);
  // the season's own table: every mode's list is the one the server allows
  const all = Object.values(DATA3.bands);
  const named = all.filter((b) => Array.isArray(b.inactiveModeIds) && b.inactiveModeIds.length);
  assert.ok(named.length > 0, 'the season has mode-bound strategies');
  for (const modeId of Object.keys(DATA3.config.modes)) {
    const type = DATA3.config.modes[modeId].type;
    const mine = new Set(allowedBands(all, type, modeId).map((b) => b.bandId));
    for (const b of named) if (b.inactiveModeIds.includes(modeId)) assert.equal(mine.has(b.bandId), false, `${b.bandId} in ${modeId}`);
  }
});

describe('规程 rooms (lobby)', () => {
  const started = [];
  class RecordingMatch extends StubMatch {
    constructor(opts) { super(opts); started.push(opts); }
  }
  let srv;
  const open = new Set();
  const player = async (name) => {
    const c = await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);
    open.add(c);
    const w = await c.hello(name);
    c.id = w.playerId;
    return c;
  };
  const err = async (c, msg) => {
    const r = await c.request(msg);
    assert.deepEqual([r.t, r.code], ['error', ERR.BAD_MSG], JSON.stringify(msg));
  };
  before(async () => {
    srv = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: RecordingMatch, seasons: [DEFAULT_SEASON, ACT3] });
  });
  afterEach(async () => { await Promise.all([...open].map((c) => c.terminate().catch(() => {}))); open.clear(); });
  after(async () => { await srv?.close(); });

  test('a solo room: its grade (default: the first of the difficulty), changed by the host, played as its mode', async () => {
    const c = await player('Grade');
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'HARD', season: ACT3 })).t, 'ok');
    let st = await c.waitFor('room.state', (s) => s.hostId === c.id);
    assert.deepEqual([st.grade, st.difficulty], [9, 'HARD']);
    assert.equal((await c.request({ t: 'room.setDifficulty', difficulty: 'FUNNY', grade: 17 })).t, 'ok');
    st = await c.waitFor('room.state', (s) => s.grade === 17);
    assert.equal(st.difficulty, 'ABYSS'); // the grade's, not the one asked
    assert.equal((await c.request({ t: 'room.setDifficulty', difficulty: 'NORMAL' })).t, 'ok');
    st = await c.waitFor('room.state', (s) => s.grade === 5);
    assert.equal(st.difficulty, 'NORMAL');
    assert.equal((await c.request({ t: 'room.setDifficulty', difficulty: 'ABYSS', grade: FAST_GRADE })).t, 'ok');
    st = await c.waitFor('room.state', (s) => s.grade === FAST_GRADE);
    assert.equal(st.difficulty, 'FUNNY');
    const n = started.length;
    assert.equal((await c.request({ t: 'room.start' })).t, 'ok');
    await c.waitFor('room.state', (s) => s.inMatch);
    assert.deepEqual([started[n].modeId, started[n].season], ['mode_single_funny', ACT3]);
  });

  test('a grade is refused in any other room; the hand-over keeps it', async () => {
    const c = await player('NoGrade');
    await err(c, { t: 'room.create', mode: 'solo', difficulty: 'HARD', grade: 3 }); // 盟约
    await err(c, { t: 'room.create', mode: 'coop', difficulty: 'HARD', season: ACT3, grade: 3 });
    assert.equal((await c.request({ t: 'room.create', mode: 'coop', difficulty: 'HARD', season: ACT3 })).t, 'ok');
    const st = await c.waitFor('room.state', (s) => s.hostId === c.id && s.mode === 'coop');
    assert.equal('grade' in st, false);
    await err(c, { t: 'room.setDifficulty', difficulty: 'NORMAL', grade: 3 });
    // the waiting room's snapshot carries the grade, the new server's copy gets it back (a snapshot without one: the
    // first grade of its difficulty)
    assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL', season: ACT3, grade: 7 })).t, 'ok');
    const solo = await c.waitFor('room.state', (s) => s.grade === 7);
    const snap = srv.lobby.roomSnapshot(srv.lobby.rooms.get(solo.code));
    assert.equal(snap.grade, 7);
    const d = await player('NoGrade2');
    assert.equal((await d.request({ t: 'room.create', mode: 'solo', difficulty: 'ABYSS', season: ACT3 })).t, 'ok');
    const other = await d.waitFor('room.state', (s) => s.hostId === d.id);
    const snap2 = { ...srv.lobby.roomSnapshot(srv.lobby.rooms.get(other.code)) };
    delete snap2.grade;
    const next = await startServer({ port: 0, host: '127.0.0.1', log: quiet, MatchClass: StubMatch, seasons: [DEFAULT_SEASON, ACT3] });
    try {
      const copy = next.lobby.adoptRoom(snap);
      assert.ok(copy, 'adopted');
      assert.deepEqual([copy.grade, copy.difficulty], [7, 'NORMAL']);
      const old = next.lobby.adoptRoom(snap2);
      assert.ok(old, 'adopted');
      assert.deepEqual([old.grade, old.difficulty], [15, 'ABYSS']);
    } finally { await next.close(); }
  });

  test('no custom ruleset and no 8 seats in 规程 (create, setRuleset, setSize, queue); 盟约 keeps both', async () => {
    const c = await player('NoBig');
    await err(c, { t: 'room.create', mode: 'solo', difficulty: 'HARD', season: ACT3, ruleset: 'custom' });
    await err(c, { t: 'room.create', mode: 'coop', difficulty: 'HARD', season: ACT3, size: 8 });
    await err(c, { t: 'room.queue', difficulty: 'HARD', season: ACT3, size: 8 });
    assert.equal((await c.request({ t: 'room.create', mode: 'coop', difficulty: 'HARD', season: ACT3 })).t, 'ok');
    await c.waitFor('room.state', (s) => s.hostId === c.id && s.season === ACT3);
    await err(c, { t: 'room.setRuleset', preset: 'custom' });
    await err(c, { t: 'room.setSize', size: 8 });
    assert.equal((await c.request({ t: 'room.setRuleset', preset: 'casual' })).t, 'ok');
    // the quick queue of 规程 forms rooms of four
    assert.equal((await c.request({ t: 'room.queue', difficulty: 'HARD', season: ACT3, quick: true })).t, 'ok');
    assert.equal((await c.request({ t: 'room.unqueue' })).t, 'ok');
    assert.equal((await c.request({ t: 'room.create', mode: 'coop', difficulty: 'HARD', size: 8 })).t, 'ok');
    await c.waitFor('room.state', (s) => s.hostId === c.id && s.size === 8);
    assert.equal((await c.request({ t: 'room.setRuleset', preset: 'custom' })).t, 'ok');
  });
});

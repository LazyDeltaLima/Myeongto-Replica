// 确定自选编队 (规程's CUSTOM_CHECK step, server/match/match/diyChoose.js): the seat's 自选 picks are its 自选编队 (six
// slots per tier), the match fields none of them until the step after the strategy draft, where each seat chooses at most
// two per tier (activity constData diyCharLimitForLevels) and readies; 盟约 has no such step and fields its picks as before.
// Through the real match path (test/match/harness.js → Match on the season's own data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { getData } from '../../server/data.js';
import { GameData } from '../../server/match/gamedata.js';
import { PHASE, ERR } from '../../shared/constants.js';
import { C2S, validateC2S, checkDiyPicks, DIY_LIMITS } from '../../shared/protocol.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { info() {}, warn() {}, error() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const BASE = hasGeneratedData() ? getData({ log: quiet }) : null;

const pick = (charId, skillIndex = 0) => ({ charId, skillIndex, uniEquipId: null });
// a 规程 lineup: three tier-5 and three tier-6 picks (the 6★ owned pool fills either tier)
const LINEUP = {
  chess_char_5_diy1_a: pick('char_2027_wang', 2),
  chess_char_5_diy2_a: pick('char_1050_chen3', 1),
  chess_char_5_diy4_a: pick('char_1035_wisdel'),
  chess_char_6_diy1_a: pick('char_4182_oblvns'),
  chess_char_6_diy3_a: pick('char_4132_ascln'),
  chess_char_6_diy6_a: pick('char_1015_aglna2'),
};

function coop(seed = 3, seats = null) {
  return makeMatch({
    mode: 'coop', modeId: 'mode_multi_normal', difficulty: 'NORMAL', seed, data: ACT3, season: 'act3autochess',
    seats: seats ?? [
      { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: LINEUP },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
      { seat: 2, playerId: 'ai_2', name: 'AI2', isBot: true, connected: true },
    ],
  });
}
const privOf = (h, id) => [...h.sent].reverse().find(([to, m]) => to === id && m.t === 'm.private')?.[1];
const pubOf = (h) => [...h.bc].reverse().find((m) => m.t === 'm.public');
/** drive the start steps up to 确定自选编队 (the harness's drive readies it, so stop before) */
function toChoose(h) {
  const { m } = h;
  for (let i = 0; i < 1e5 && m.phase !== PHASE.DIY_CHOOSE; i++) {
    for (const ps of m.players.values()) {
      if (ps.isBot) continue;
      if (m.phase === PHASE.INFO_CHECK && !ps.infoReady) m.handle(ps.playerId, { t: 'g.infoReady' });
      if (m.phase === PHASE.BAND_DRAFT && m.draftTurn() === ps.playerId) m.handle(ps.playerId, { t: 'g.band', bandId: m.defaultBand(ps.playerId) });
    }
    if (m.phase !== PHASE.DIY_CHOOSE && !h.sched.runNext()) break;
  }
  assert.equal(m.phase, PHASE.DIY_CHOOSE);
  return h;
}

test('the step comes from the tables: 规程 has it (30 s, two per tier), 盟约 does not; 12 slots fit the wire', REAL, () => {
  assert.deepEqual(new GameData(ACT3, 'mode_multi_normal').diyChoose, { seconds: 30, perTier: { 5: 2, 6: 2 } });
  assert.equal(new GameData(BASE, 'mode_multi_normal').diyChoose, null);
  assert.equal(DIY_LIMITS.slots, 12);
  const twelve = Object.fromEntries(Object.keys(ACT3.backups.diy.slots).map((id) => [id, null]));
  assert.equal(Object.keys(twelve).length, 12);
  assert.ok('ok' in checkDiyPicks(twelve, { data: ACT3 }));
  assert.ok('ok' in checkDiyPicks(LINEUP, { data: ACT3 }));
  assert.ok(C2S['g.diyChoose'] && C2S['g.diyReady']);
  assert.equal(validateC2S({ t: 'g.diyChoose', slots: ['chess_char_5_diy1_a'] }), null);
  assert.equal(validateC2S({ t: 'g.diyReady', cancel: true }), null);
  assert.equal(typeof validateC2S({ t: 'g.diyChoose', slots: 'chess_char_5_diy1_a' }), 'string');
});

test('规程 co-op: nothing is fielded before the step; the chosen two per tier are fielded with their stock', REAL, () => {
  const h = coop().start();
  const { m } = h;
  const p0 = h.ps('p_0');
  assert.deepEqual(p0.diy, {}, 'the lineup is not fielded during the briefing');
  assert.deepEqual(Object.keys(p0.diyLineup), Object.keys(LINEUP));
  assert.equal(p0.diyStock.entries.size, 0);
  h.sched.advance(1);
  assert.deepEqual(Object.keys(privOf(h, 'p_0').diyChoose.lineup), Object.keys(LINEUP), 'm.private carries the lineup');

  toChoose(h);
  h.sched.advance(150); // m.public is throttled (≤ 10/s)
  const pub = pubOf(h);
  assert.equal(pub.diyChoose.seconds, 30);
  assert.ok(pub.deadline > 0, 'co-op: timed');
  assert.equal(pub.players.find((p) => p.playerId === 'ai_2').ready, true, 'an AI seat is ready at once');
  assert.equal(pub.players.find((p) => p.playerId === 'p_0').ready, false);

  // the limits: two per tier, slots of the lineup only, no change while ready
  const three = ['chess_char_5_diy1_a', 'chess_char_5_diy2_a', 'chess_char_5_diy4_a'];
  assert.equal(m.handle('p_0', { t: 'g.diyChoose', slots: three }).error, ERR.BAD_TARGET);
  assert.equal(m.handle('p_0', { t: 'g.diyChoose', slots: ['chess_char_5_diy3_a'] }).error, ERR.BAD_TARGET, 'an empty slot of the lineup');
  assert.equal(m.handle('p_0', { t: 'g.diyChoose', slots: ['chess_char_5_diy1_a', 'chess_char_5_diy1_a'] }).error, ERR.BAD_TARGET);
  const chosen = ['chess_char_6_diy3_a', 'chess_char_5_diy4_a', 'chess_char_5_diy1_a'];
  assert.deepEqual(m.handle('p_0', { t: 'g.diyChoose', slots: chosen }), { ok: true });
  assert.deepEqual(p0.diyChosen, ['chess_char_5_diy1_a', 'chess_char_5_diy4_a', 'chess_char_6_diy3_a'], 'kept in lineup order');
  assert.deepEqual(m.handle('p_0', { t: 'g.diyReady' }), { ok: true });
  assert.equal(m.handle('p_0', { t: 'g.diyChoose', slots: [] }).error, ERR.ALREADY);
  assert.deepEqual(m.handle('p_0', { t: 'g.diyReady', cancel: true }), { ok: true }, '取消准备');
  assert.equal(m.phase, PHASE.DIY_CHOOSE);
  m.handle('p_0', { t: 'g.diyReady' });
  m.handle('p_1', { t: 'g.diyReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BATTLE_CHECK, 'every awaited seat ready: 协议启动');
  assert.deepEqual(Object.keys(p0.diy), ['chess_char_5_diy1_a', 'chess_char_5_diy4_a', 'chess_char_6_diy3_a']);
  assert.equal(p0.diy.chess_char_6_diy3_a.charId, 'char_4132_ascln');
  assert.ok(p0.diyStock.has('chess_char_5_diy1_a') || p0.diyBanned.includes('chess_char_5_diy1_a'));
  assert.equal(p0.diyStock.has('chess_char_6_diy1_a'), false, 'an unchosen slot has no stock');
  assert.equal(p0.gd.chess('chess_char_6_diy3_a').charId, 'char_4132_ascln', 'the player\'s data view composes the chosen operator');
  assert.deepEqual(h.ps('p_1').diy, {});
  h.sched.advance(1);
  assert.deepEqual(Object.keys(privOf(h, 'p_0').diy), Object.keys(p0.diy), 'm.private carries the fielded picks');
  assert.equal(m.setDiy('p_0', LINEUP).error, ERR.WRONG_PHASE, 'after the step the lobby keeps a change for the next match');
  m.dispose();
});

test('规程: the step times out with what each seat chose; a lineup change in the draft drops a chosen slot it lost', REAL, () => {
  const h = coop(5).start();
  const { m } = h;
  const p0 = h.ps('p_0');
  const { chess_char_5_diy4_a: _drop, ...smaller } = LINEUP;
  void _drop;
  assert.deepEqual(m.setDiy('p_0', smaller), { ok: true }, 'the briefing takes a new lineup');
  assert.deepEqual(p0.diy, {});
  assert.equal(Object.keys(p0.diyLineup).length, 5);
  toChoose(h);
  m.handle('p_0', { t: 'g.diyChoose', slots: ['chess_char_5_diy2_a'] });
  assert.equal(m.setDiy('p_0', LINEUP).error, ERR.WRONG_PHASE, 'the lineup is fixed once the step runs');
  h.sched.advance(30_000 + 10);
  assert.equal(m.phase, PHASE.BATTLE_CHECK, 'the 30 s ran out');
  assert.deepEqual(Object.keys(p0.diy), ['chess_char_5_diy2_a']);
  m.dispose();
});

test('规程: a seat that leaves or goes AI 托管 is not waited for; a lone human is untimed', REAL, () => {
  const h = coop(7).start();
  const { m } = h;
  toChoose(h);
  m.handle('p_0', { t: 'g.diyReady' });
  m.handle('p_1', { t: 'g.autoplay', on: true });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  m.dispose();

  const solo = makeMatch({
    mode: 'solo', modeId: 'mode_single_1', difficulty: 'NORMAL', seed: 7, data: ACT3, season: 'act3autochess',
    seats: [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: LINEUP }],
  }).start();
  toChoose(solo);
  solo.sched.advance(150);
  assert.equal(pubOf(solo).deadline, 0);
  assert.equal(pubOf(solo).diyChoose.seconds, 0);
  solo.sched.advance(10 * 60_000);
  assert.equal(solo.m.phase, PHASE.DIY_CHOOSE, 'waits for 准备就绪');
  solo.m.handle('p_0', { t: 'g.diyChoose', slots: ['chess_char_6_diy1_a', 'chess_char_6_diy6_a'] });
  solo.m.handle('p_0', { t: 'g.diyReady' });
  assert.ok(solo.drive(() => solo.m.phase === PHASE.PREP));
  assert.deepEqual(Object.keys(solo.ps('p_0').diy), ['chess_char_6_diy1_a', 'chess_char_6_diy6_a']);
  solo.m.dispose();
});

test('盟约 keeps its flow: no step, the picks are fielded from the start', REAL, () => {
  const h = makeMatch({
    mode: 'coop', seed: 13,
    seats: [
      { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { chess_char_6_diy1_a: pick('char_1035_wisdel') } },
      { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
    ],
  }).start();
  assert.deepEqual(Object.keys(h.ps('p_0').diy), ['chess_char_6_diy1_a']);
  const phases = new Set();
  assert.ok(h.drive(() => { phases.add(h.m.phase); return h.m.phase === PHASE.PREP; }));
  assert.equal(phases.has(PHASE.DIY_CHOOSE), false);
  assert.equal(h.m.handle('p_0', { t: 'g.diyReady' }).error, ERR.WRONG_PHASE);
  h.sched.advance(1);
  assert.equal('diyChoose' in privOf(h, 'p_0'), false);
  h.m.dispose();
});

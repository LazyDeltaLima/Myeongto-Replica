// 진영별 선발 프리셋 on the server (local feature, maintainer decision 2026-10-09; server/match/match/platform.js setDiy and
// server/lobby.js room.diy): new 自选 picks reach the RUNNING match while its briefing or strategy draft runs and none of
// the player's 自选 stock has been drawn; from the prep on (or once drawn) the match keeps its picks and the lobby keeps the
// new ones for the next match (ROOM_STARTED).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { PHASE, ERR } from '../../shared/constants.js';

const REAL = { skip: !hasGeneratedData() };
const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const WISDEL = { charId: 'char_1035_wisdel', skillIndex: 0, uniEquipId: null };
const WANG = { charId: 'char_2027_wang', skillIndex: 2, uniEquipId: null };
const CHEN = { charId: 'char_1050_chen3', skillIndex: 1, uniEquipId: null };

function match() {
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6A]: WISDEL } },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
  ];
  return makeMatch({ mode: 'coop', seats, seed: 13 }); // seed 13: 炎 not banned (test/match/diy-shop.test.js)
}
const privOf = (h, id) => [...h.sent].reverse().find(([to, m]) => to === id && m.t === 'm.private')?.[1];

test('briefing and strategy draft: setDiy changes this match (picks, stock, m.private); the prep keeps them', REAL, () => {
  const h = match().start();
  const m = h.m;
  const p0 = h.ps('p_0');
  assert.equal(m.phase, PHASE.INFO_CHECK);
  assert.deepEqual(Object.keys(p0.diy), [T6A]);
  assert.deepEqual(m.setDiy('p_0', { [T6A]: WANG, [T6B]: CHEN }), { ok: true });
  assert.deepEqual(Object.keys(p0.diy).sort(), [T6A, T6B]);
  assert.equal(p0.diy[T6A].charId, WANG.charId);
  assert.ok(p0.diyStock.has(T6B), 'the new slot has its stock');
  h.sched.advance(1);
  assert.equal(privOf(h, 'p_0').diy[T6B].charId, CHEN.charId, 'm.private carries the new picks');

  for (const id of ['p_0', 'p_1']) m.handle(id, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.deepEqual(m.setDiy('p_0', { [T6A]: WISDEL }), { ok: true }, 'still during the strategy draft');
  assert.deepEqual(Object.keys(p0.diy), [T6A]);
  assert.equal(p0.diyStock.has(T6B), false, 'the dropped slot lost its stock');

  h.drive(() => m.phase === PHASE.PREP);
  assert.equal(m.setDiy('p_0', { [T6A]: WANG }).error, ERR.WRONG_PHASE);
  assert.equal(p0.diy[T6A].charId, WISDEL.charId, 'the prep keeps the match\'s picks');
  m.dispose();
});

test('a drawn 自选 stock locks the picks even before the prep; bots and unknown seats are refused', REAL, () => {
  const h = match().start();
  const m = h.m;
  const p0 = h.ps('p_0');
  const e = p0.diyStock.entries.get(T6A);
  e.left -= 1; // a copy went out (an effect / reward draw)
  assert.equal(m.setDiy('p_0', { [T6A]: WANG }).error, ERR.WRONG_PHASE);
  assert.equal(p0.diy[T6A].charId, WISDEL.charId);
  assert.equal(m.setDiy('nobody', { [T6A]: WANG }).error, ERR.NOT_IN_ROOM);
  m.dispose();
});

test('strategy draft: a 自选 operator swapped in takes its 潜能 / 练度 and skill this match (room.loadout shares setDiy\'s window, maintainer decision 2026-10-14)', REAL, () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6A]: WISDEL } }];
  const h = makeMatch({ mode: 'solo', seats, seed: 13 }).start();
  const m = h.m;
  const p0 = h.ps('p_0');
  m.handle('p_0', { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.deepEqual(m.setDiy('p_0', { [T6A]: WANG }), { ok: true });
  assert.deepEqual(m.setLoadout('p_0', {}, { [WANG.charId]: { potential: 2, cultivate: 1 } }), { ok: true });
  m.handle('p_0', { t: 'g.band', bandId: m.gd.bandDraft.timeoutBandId }); // the solo draft ends with this pick
  h.drive(() => m.phase === PHASE.PREP);
  assert.equal(m.setLoadout('p_0', {}, null).error, ERR.WRONG_PHASE, 'locked from the prep on');
  const lo = p0.loadoutFor(p0.gd.chess(T6A));
  assert.deepEqual([lo.skillIndex, lo.potential, lo.cultivate], [WANG.skillIndex, 2, 1]);
  assert.deepEqual(privOf(h, 'p_0').ops[WANG.charId], { potential: 2, cultivate: 1 });
  m.dispose();
});

// The battle-start deployment one piece at a time (docs/rules/sim.md 「작전 시작 차례 배치」, maintainer decision 2026-10-10):
// client `MainGameInBattle._StartBattle` → `_Prebuilt` (a piece, then WaitForFixedSeconds 0.2) → ON_BATTLE_STARTED and the
// wave scheduler. The sim deploys one group every PREBUILT_INTERVAL and starts the wave clock one interval after the last.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from './helpers/battleHarness.js';
import { PREBUILT_INTERVAL } from '../server/sim/constants.js';
import { prebuiltSeconds } from '../server/sim/spec.js';
import { hasGeneratedData } from '../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const OPS = ['chess_char_1_01_a', 'chess_char_1_02_a', 'chess_char_1_07_a', 'chess_char_2_01_a'];

test('one piece every 0.2 s in the scanning order, then battleStart and the wave clock (spawns); the time limit from the battle start', REAL, () => {
  assert.equal(PREBUILT_INTERVAL, 0.2);
  const h = makeBattle({
    flags: { prebuiltInterval: PREBUILT_INTERVAL }, timeLimit: 5, seed: 1,
    units: OPS.map((chessId, i) => ({ chessId, row: 10 + (i % 2), col: 3 + i })),
    enemies: [{ key: 'enemy_1007_slime', time: 0, route: 0 }],
  });
  const deployedAt = [];
  h.b.on('deploy', (c) => { if (c.unit.side === 'ally') deployedAt.push([c.unit.homeC, +h.b.time.toFixed(3)]); });
  let started = null, spawned = null;
  h.b.on('battleStart', () => { started = h.b.time; });
  h.b.on('enemySpawn', () => { if (spawned == null) spawned = h.b.time; });
  h.runUntil(() => spawned != null, 5);
  // the operators left column first, one per 0.2 s from 0
  assert.deepEqual(deployedAt, [[3, 0], [4, 0.2], [5, 0.4], [6, 0.6]]);
  assert.ok(Math.abs(started - 0.8) < 1e-6, `battleStart one interval after the last piece (${started})`);
  assert.ok(Math.abs(h.b.waveT0 - 0.8) < 1e-6);
  assert.ok(Math.abs(spawned - 0.8) < 1e-6, `the t = 0 spawn on the wave clock (${spawned})`);
  h.b.runToEnd(30);
  assert.equal(h.b.reason, 'timeout');
  // the time limit from the battle start, the deployment included (maintainer confirmation 2026-10-10: the official
  // countdown runs while the pieces come in)
  assert.ok(Math.abs(h.b.time - 5) < 0.05, `the time limit from the battle start (${h.b.time})`);
  assert.ok(Math.abs(prebuiltSeconds([{ units: OPS.map(() => ({ kind: 'chess' })) }]) - 0.8) < 1e-9);
  assert.ok(Math.abs(prebuiltSeconds([{ units: [{ kind: 'chess' }, { kind: 'token' }] }, { units: [{ kind: 'chess' }, { kind: 'chess' }] }]) - 0.6) < 1e-9, '2 operator groups + 1 summon group');
});

test('the real match path deploys one by one too (spec → createBattleFromSpec: the default interval)', REAL, async () => {
  const { makeMatch } = await import('./match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  OPS.slice(0, 3).forEach((id, i) => {
    const p = ps.acquireChess(id, { source: 'buy' });
    assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 3 + i }, dir: 'RIGHT' }).ok, id);
  });
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'pb', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  const times = [];
  b.on('deploy', (c) => { if (c.initial) times.push(b.time); });
  let started = null;
  b.on('battleStart', () => { started = b.time; });
  while (started == null && b.time < 10) b.step();
  const n = times.length;
  assert.ok(n >= 2, `pieces on the board (${n})`);
  for (let i = 1; i < n; i++) assert.ok(times[i] - times[i - 1] < 0.2 + 1e-6, 'a group every 0.2 s');
  assert.ok(Math.abs(started - prebuiltSeconds(spec.players)) < 1e-6, `battleStart after the deployment (${started} vs ${prebuiltSeconds(spec.players)})`);
  m.dispose?.();
});

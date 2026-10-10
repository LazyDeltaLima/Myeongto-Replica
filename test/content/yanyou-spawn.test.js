// 炎佑 (the 炎 bond's flying summon) appears where the client puts it (docs/rules/sim.md 「炎佑 등장 위치」): the wave
// level's `branches.dragon` spawn on its `extraRoutes[routeIndex]` start — client buff `bondeffect_yan` →
// `SummonEnemiesFollowBranchRoute` `_defaultBranchId "dragon"` (maintainer decision 2026-10-10: the client tiles).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const YAN = ['chess_char_1_03', 'chess_char_2_04', 'chess_char_3_03', 'chess_char_3_04', 'chess_char_4_15', 'chess_char_4_17', 'chess_char_5_03', 'chess_char_5_12', 'chess_char_6_03'];
const TILES = [[9, 3], [9, 4], [10, 3], [10, 4], [11, 3], [11, 4], [9, 5], [11, 5], [10, 5]];
const bonds = (n) => ({ yanShip: { count: n, layers: 1, active: true, tier: n >= 9 ? 3 : 2 } });
const yanOf = (h) => h.b.allyUnits.filter((u) => u.defId === 'enemy_9012_acloon' && u.alive);

/** The 炎佑 the instant they appear (the battleStart deployment), before they fly off. */
function firstYan(h) {
  for (let i = 0; i < 30 * 30 && !yanOf(h).length; i++) h.step(1);
  return yanOf(h);
}

test('normal round: the 炎佑 appears on the dragon branch start (11, 7), not on the old void-tile pick', REAL, () => {
  for (const waveTemplate of ['act1autochess_01', 'act1autochess_h03']) {
    const h = makeBattle({
      stageId: 'act2autochess_m01', waveTemplate, autoFinish: false, timeLimit: 60, seed: 3,
      units: YAN.slice(0, 6).map((id, i) => ({ chessId: `${id}_a`, row: TILES[i][0], col: TILES[i][1] })), bonds: bonds(6),
    });
    const y = firstYan(h);
    assert.equal(y.length, 1, waveTemplate);
    assert.deepEqual([y[0].x, y[0].y], [7, 11], `${waveTemplate}: was (10, 6) — airTile`);
  }
});

test('9 炎: both 炎佑 start on the same branch point', REAL, () => {
  const h = makeBattle({
    stageId: 'act2autochess_m02', waveTemplate: 'act1autochess_02', autoFinish: false, timeLimit: 60, seed: 5,
    units: YAN.map((id, i) => ({ chessId: `${id}_a`, row: TILES[i][0], col: TILES[i][1] })), bonds: bonds(9),
  });
  const y = firstYan(h);
  assert.equal(y.length, 2);
  for (const u of y) assert.deepEqual([u.tileR, u.tileC], [11, 7]);
});

test('two-helper 联防: (11, 16) within the route\'s ±0.5 spawn spread; boss field: (4, 10)', REAL, () => {
  const units = YAN.slice(0, 6).map((id, i) => ({ chessId: `${id}_a`, row: TILES[i][0], col: TILES[i][1] }));
  const u = makeBattle({ stageId: 'act2autochess_m01', kind: 'unite', waveTemplate: 'act1autochess_escaped_multi', autoFinish: false, timeLimit: 60, seed: 7, units, bonds: bonds(6) });
  const yu = firstYan(u);
  assert.equal(yu.length, 1);
  assert.ok(Math.abs(yu[0].x - 16) <= 0.5 + 1e-9 && Math.abs(yu[0].y - 11) <= 0.5 + 1e-9, `${yu[0].x}, ${yu[0].y}`);
  const b = makeBattle({ kind: 'boss', waveTemplate: 'act2autochess_h07_05', autoFinish: false, timeLimit: 60, seed: 7, units, bonds: bonds(6) });
  const yb = firstYan(b);
  assert.equal(yb.length, 1);
  assert.deepEqual([yb[0].x, yb[0].y], [10, 4]);
});

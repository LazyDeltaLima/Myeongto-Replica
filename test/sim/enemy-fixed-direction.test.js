// test/sim/enemy-fixed-direction.test.js — the official FIXED_DIRECTION enemy projectiles through the real battle path
// (buildBattleSpec → createBattleFromSpec, the shipped data): “萨米的意志”'s 冰凌 runs down the column tile by tile, and
// 重弩突袭者's 直击 bolt flies straight (docs/rules/sim.md 「FIXED_DIRECTION 투사체」 / 「萨米的意志 冰凌」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { attackWindup } from '../../server/sim/ai.js';
import { ROWS } from '../../server/sim/constants.js';
import { DATA } from '../match/harness.js';

const W = DATA.waves.act1autochess_h07_07;
const CHESS = 'chess_char_1_01_a';

function deerBattle(units) {
  const spawn = W.spawns.find((s) => s.key === 'enemy_9033_acdeer');
  const spec = buildBattleSpec({
    battleId: 'fd', fieldId: 'b:p', kind: 'boss', seed: 5, round: 8, bossId: W.bossId, routes: W.routes,
    players: [{ playerId: 'p', seat: 0, side: 'L', colOffset: 0, units, bonds: {} }],
    spawns: [{ time: 0, enemyKey: spawn.key, routeIndex: spawn.routeIndex, count: 1, tag: 'boss' }],
    enemyOverrides: W.overrides, boss: { poolHp: 1e7, poolMax: 1e7 }, flags: { layerGainsEnabled: false },
  });
  return createBattleFromSpec(JSON.parse(JSON.stringify(spec)), DATA);
}

test('real path: “萨米的意志” 冰凌 — a column\'s ally is hit (top row − its row) / speed + 1 s after the strike, not at the swing', () => {
  const b = deerBattle([{ chessId: CHESS, row: 12, col: 6, uid: 'u1' }, { chessId: CHESS, row: 9, col: 6, uid: 'u2' }]);
  b.start();
  const evs = [];
  let deer = null;
  for (let i = 0; i < 30 && !deer; i++) { b.step(); evs.push(...b.drainEvents()); deer = b.enemies.find((e) => e.defId === 'enemy_9033_acdeer'); }
  assert.ok(deer, 'the boss is on the field');
  const ops = b.allyUnits.filter((u) => u.kind === 'op');
  assert.equal(ops.length, 2);
  const speed = DATA.enemies.enemy_9033_acdeer.proj.speed;
  const taken = new Map(ops.map((u) => [u.id, null]));
  let swingAt = null, colFx = null;
  while (b.time < 12 && [...taken.values()].some((v) => v == null)) {
    b.step();
    for (const ev of evs.splice(0).concat(b.drainEvents())) {
      if (ev[0] === 'swing' && ev[1] === deer.id && swingAt == null) swingAt = b.time;
      if (ev[0] === 'fx' && ev[1] === 'column' && !colFx) colFx = ev[4];
      if (ev[0] === 'dmg' && taken.has(ev[1]) && taken.get(ev[1]) == null && ev[5] === deer.id) taken.set(ev[1], b.time);
    }
  }
  assert.ok(swingAt != null && colFx, 'a swing and its 冰凌');
  assert.equal(colFx.r0, ROWS - 1);
  for (const u of ops) {
    const want = swingAt + attackWindup(deer) + (ROWS - 1 - u.y) / speed + 1;
    assert.ok(taken.get(u.id) != null, `unit on stage row ${u.y} hit`);
    assert.ok(Math.abs(taken.get(u.id) - want) <= 0.07, `row ${u.y}: ${taken.get(u.id)} ≈ ${want}`);
  }
});

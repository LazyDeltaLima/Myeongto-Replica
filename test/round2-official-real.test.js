// Round-2 client-code fixes through the real match path (test/match/harness.js → buildBattleSpec → createBattleFromSpec):
// docs/rules/sim.md 「盟约·특질·장비·생성기 2라운드」.
//   - 拉特兰: an ammo skill gains RoundToInt(original count × (0.05 + 0.015·L)) bullets (client _UpdateMaxAdditionCount);
//   - 灵巧: the aura is judged once, when the receiver deploys, from the member pieces around it (client).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };

async function realBattle(lineup) {
  const { makeMatch } = await import('./match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  for (const [id, row, col] of lineup) {
    const p = ps.acquireChess(id, { source: 'buy' });
    assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, id);
  }
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'r2', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  return { b, spec, dispose: () => m.dispose?.() };
}

test('拉特兰 (real path): 隐现 14 bullets at 0 layers → +round(14 × 0.05) = +1 (the old floor(14 × 1.05) added none)', REAL, async () => {
  const { b, spec, dispose } = await realBattle([['chess_char_1_01_a', 10, 3], ['chess_char_2_01_a', 10, 4], ['chess_char_3_01_a', 10, 5]]);
  const st = spec.players[0].bonds.lateranoShip;
  assert.ok(st && st.active && st.layers === 0, JSON.stringify(st));
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  const u = b.allyUnits.find((x) => x.defId === 'chess_char_1_01_a');
  assert.equal(u.skill.kind, 'ammo');
  assert.equal(u.skill.ammo, 14);
  assert.ok(u.skill.activate('test', { free: true }));
  assert.equal(u.skill.ammoLeft, 15);
  dispose();
});

test('灵巧 (real path): a receiver deployed before the member sees its piece, and keeps the bonus after the member leaves', REAL, async () => {
  const OP = 'chess_char_1_01_a'; // 隐现: not 灵巧
  const { b, spec, dispose } = await realBattle([
    [OP, 10, 3], ['chess_char_1_14_a', 10, 4], ['chess_char_2_04_a', 12, 8],
  ]);
  assert.ok(spec.players[0].bonds.skillfulShip?.active, JSON.stringify(spec.players[0].bonds.skillfulShip));
  const order = [];
  b.on('deploy', (c) => { if (c.initial) order.push(c.unit.defId); });
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  assert.equal(order[0], OP, 'the receiver deploys first (left column)');
  const recv = b.allyUnits.find((x) => x.defId === OP), member = b.allyUnits.find((x) => x.defId === 'chess_char_1_14_a');
  assert.ok(recv.findBuff('bond:skillfulShip'), 'judged on its deployment from the member piece next to it');
  b.retreat(member, { reason: 'retreat' });
  b.step();
  assert.ok(recv.findBuff('bond:skillfulShip'), 'kept after the member left');
  dispose();
});

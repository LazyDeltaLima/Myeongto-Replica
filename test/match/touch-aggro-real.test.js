// 外勤医疗 (strategy band_amedic) through the real match path (test/match/harness.js → buildBattleSpec →
// createBattleFromSpec): the stage's map character — 预备干员-医疗, or Touch with two elite operators — ranks before the
// operators of the initial deployment in the aggro order (upstream PR #451, docs/rules/sim.md 「upstream 0.2.3 이식」):
// at equal taunt an enemy picks an operator first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { aggroCmp } from '../../server/sim/targeting.js';

const REAL = { skip: !hasGeneratedData() };

async function realBattle(lineup) {
  const { makeMatch } = await import('./harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  h.setStage('act2autochess_m01');
  const m = h.m, ps = h.ps('p_0');
  ps.bandId = 'band_amedic';
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  for (const [id, row, col] of lineup) {
    const p = ps.acquireChess(id, { source: 'buy' });
    assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, id);
  }
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'touch', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  return { b, dispose: () => m.dispose?.() };
}

for (const [label, lineup, mapChar] of [
  ['no elite → 预备干员-医疗', [['chess_char_1_02_a', 10, 5], ['chess_char_1_04_a', 11, 5]], 'char_605_cmedic'],
  ['two elites → Touch', [['chess_char_1_02_b', 10, 5], ['chess_char_1_04_b', 11, 5]], 'char_613_acmedc'],
]) {
  test(`外勤医疗 (real path, ${label}): the map character ranks before the deployed operators in the aggro order`, REAL, async () => {
    const { b, dispose } = await realBattle(lineup);
    const mc = b.allyUnits.find((u) => u.alive && u.defId === mapChar);
    assert.ok(mc, `${mapChar} stands on the field`);
    const ops = b.allyUnits.filter((u) => u.alive && u.kind !== 'token' && u.defId !== mapChar);
    assert.equal(ops.length, 2);
    for (const op of ops) {
      assert.ok(mc.deploySeq > op.deploySeq, 'its sim unit is still created at battleStart, after the operators');
      assert.ok(aggroCmp(op, mc) < 0, `${op.defId} is picked before the map character at equal taunt`);
    }
    dispose();
  });
}

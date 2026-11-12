// test/helpers/diyPickMatch.js — a 自选 pick through the real match path (CONTRIBUTING §6): seats[].diy → the Match's tier-6
// DIY slot bought into the hand → placed on the board → battleInput → BattleSpec → createBattleFromSpec, on 盟约's m04.
import assert from 'node:assert/strict';
import { makeMatch } from '../match/harness.js';

const T6 = 'chess_char_6_diy1_a';

/**
 * Field `charId` with `skillIndex` (and `uniEquipId`, null = none) on its tier-6 slot at (10, 7) facing `dir` (LEFT: m04's
 * enemies come from that side) and run the battle until its skill started once ('skillStart' — an attack-SP AUTO skill
 * counts no `activations`) or `secs` pass. Returns the battle unit, the battle and the casts seen.
 * @param {string} charId @param {number} skillIndex
 * @param {{ uniEquipId?: string|null, secs?: number, seed?: number, dir?: string }} [o]
 */
export async function realPickMatch(charId, skillIndex, { uniEquipId = null, secs = 120, seed = 11, dir = 'LEFT' } = {}) {
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: { charId, skillIndex, uniEquipId } } }];
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed }).start();
  mh.toPrep(3);
  mh.setStage('act2autochess_m04');
  const m = mh.m, ps = mh.ps('p_0');
  ps.initDiyStock?.(new Set());
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const w = ps.acquireChess(T6, { source: 'buy' });
  assert.ok(w, `${charId}: the pick's piece`);
  assert.ok(m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: 10, col: 7 }, dir }).ok, `${charId}: placed`);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  b.start();
  const u = b.allyUnits.find((x) => x.kind === 'op');
  assert.equal(u.def.charId, charId);
  let casts = 0;
  b.on('skillStart', (c) => { if (c.unit === u) casts++; });
  while (!b.finished && b.time < secs && !casts) b.step();
  for (let i = 0; i < 60 && !b.finished; i++) b.step();
  assert.equal(b.errors.length, 0, b.errors[0]?.error?.message);
  m.dispose?.();
  return { u, b, casts };
}

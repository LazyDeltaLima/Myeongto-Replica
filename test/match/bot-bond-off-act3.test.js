// 规程 (shared/seasons.js coreBondBan): the core bonds a match draws off ban their operators, so an AI seat never builds on
// one — no opening strategy of that bond (botPickBand), no focus on it (bondPlan). server/match/bot.js bondOff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT3 } from '../helpers/seasonPieces.js';
import { makeMatch, give } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { botPickBand, bondPlan } from '../../server/match/bot.js';

test('规程 AI seats skip a core bond the match drew off: never its strategy, never its focus (bot.js bondOff)', () => {
  const registry = createRegistry({ data: ACT3, log: { error() {}, warn() {}, info() {}, log() {} } });
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 5, registry, data: ACT3, season: 'act3autochess' }).start();
  const { m } = h;
  const gd = m.gd;
  const off = new Set(m.disabledBonds.filter((b) => gd.bond(b)?.isCore));
  const offBands = gd.bandIds().filter((id) => gd.bandBondIds(id).some((b) => off.has(b)));
  assert.ok(offBands.length > 0, `the match drew off a core bond some strategy rides on (${[...off]})`);
  const ps = h.ps('ai_0');
  for (let i = 0; i < 200; i++) {
    const id = botPickBand(m, ps);
    assert.ok(!offBands.includes(id), `draw ${i}: ${id} rides on a bond drawn off (${gd.bandBondIds(id)})`);
  }
  // a focus: the owned members of a drawn-off core bond outnumber the rest, yet the plan builds elsewhere
  h.toPrep(1, { band: 'band_amiya' }); // a strategy of no bond for the human seat
  for (const p of ps.allChess()) ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null);
  const offBond = [...off][0];
  const live = gd.bondIds.find((b) => gd.bond(b)?.isCore && !m.disabledBonds.includes(b) && !gd.modeInactiveBonds.has(b));
  const memberOf = (b, n) => Object.values(gd.raw.chess).filter((c) => c.visible && !c.isGolden && !c.isDiy && (c.bonds || []).includes(b)).slice(0, n);
  for (const c of memberOf(offBond, 4)) give(m, ps, c.chessId, 'hand');
  for (const c of memberOf(live, 1)) give(m, ps, c.chessId, 'hand');
  ps.recompute();
  const plan = bondPlan(m, ps);
  assert.notEqual(plan.focus, offBond, `focus on ${offBond}, a bond drawn off`);
  m.dispose();
});

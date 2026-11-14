// test/helpers/diyPickMatch.js — a 自选 pick through the real match path (CONTRIBUTING §6): seats[].diy → the Match's tier-6
// DIY slot bought into the hand → placed on the board → battleInput → BattleSpec → createBattleFromSpec, on 盟约's m04 (or
// another season's data and stage: `data` / `season` / `stage`; `slot` = another DIY slot record, its `_b` id an elite piece).
import assert from 'node:assert/strict';
import { makeMatch } from '../match/harness.js';

const T6 = 'chess_char_6_diy1_a';

/**
 * A season with 确定自选编队 (规程, server/match/match/diyChoose.js) fields only the picks chosen at that step, and the
 * harness's drive readies it without a choice: drive the start steps up to it, choose `slot` and ready.
 * @param {any} mh @param {string} slot
 */
function chooseDiy(mh, slot) {
  const m = mh.m;
  for (let i = 0; i < 1e5 && m.phase !== 'DIY_CHOOSE'; i++) {
    for (const ps of m.players.values()) {
      if (ps.isBot) continue;
      if (m.phase === 'INFO_CHECK' && !ps.infoReady) m.handle(ps.playerId, { t: 'g.infoReady' });
      if (m.phase === 'BAND_DRAFT' && m.draftTurn() === ps.playerId) m.handle(ps.playerId, { t: 'g.band', bandId: m.defaultBand(ps.playerId) });
    }
    if (m.phase !== 'DIY_CHOOSE' && !mh.sched.runNext()) break;
  }
  assert.equal(m.phase, 'DIY_CHOOSE', 'reached 确定自选编队');
  assert.ok(m.handle('p_0', { t: 'g.diyChoose', slots: [slot] }).ok, `chose ${slot}`);
}

/**
 * Field `charId` with `skillIndex` (and `uniEquipId`, null = none) on its tier-6 slot at (10, 7) facing `dir` (LEFT: m04's
 * enemies come from that side) and run the battle until its skill started once ('skillStart' — an attack-SP AUTO skill
 * counts no `activations`) or `secs` pass. Returns the battle unit, the battle and the casts seen.
 * @param {string} charId @param {number} skillIndex
 * @param {{ uniEquipId?: string|null, secs?: number, seed?: number, dir?: string, data?: any, season?: string, stage?: string, slot?: string, band?: string }} [o]
 */
export async function realPickMatch(charId, skillIndex, { uniEquipId = null, secs = 120, seed = 11, dir = 'LEFT', data, season, stage = 'act2autochess_m04', slot = T6, band } = {}) {
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const base = slot.replace(/_b$/, '_a');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [base]: { charId, skillIndex, uniEquipId } } }];
  const mh = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed, ...(data ? { data } : {}), ...(season ? { season } : {}) }).start();
  if (mh.m.gd.diyChoose) chooseDiy(mh, base);
  mh.toPrep(3, band ? { band } : undefined);
  mh.setStage(stage);
  const m = mh.m, ps = mh.ps('p_0');
  ps.initDiyStock?.(new Set());
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const w = ps.acquireChess(slot, { source: 'buy' });
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

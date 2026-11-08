// test/helpers/seasonPieces.js — fielding a piece of 卫戍协议：规程 (shared/seasons.js `act3autochess`, not public) in the kit tests:
// its record of data/seasons/act3autochess/chess.json with the skill asked for selected, and the real match path
// (test/seasons-act3.test.js).

import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { makeBattle, enemyRec, checkInvariants } from './battleHarness.js';
import { legalTileFor, makeMatch } from '../match/harness.js';

const quiet = { warn() {}, error() {}, info() {} };
export const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const BASE = getData({ log: quiet });

/**
 * The season's data on the default season's battlefield: the real match path of a piece test fields its pieces, bonds,
 * items and 特质 on the default season's modes, stages, waves, enemies and leaders, so a kit test does not depend on the
 * season's rooms (their mode ids are not the default season's) or on its new enemies' behaviour. The season's own stages,
 * waves and enemies are fought in test/seasons-act3-stages.test.js.
 */
export const ACT3_ON_BASE_FIELD = Object.freeze({
  ...ACT3,
  config: { ...ACT3.config, modes: BASE.config.modes, bandDraft: BASE.config.bandDraft },
  stages: BASE.stages, waves: BASE.waves, enemies: BASE.enemies, bosses: BASE.bosses, factions: BASE.factions,
});

/** The piece's record with its skill `i` selected (the tables will name one; a kit writes both). */
export function pieceRec(id, i = 1) {
  const rec = ACT3.chess[id];
  assert.ok(rec, id);
  return { ...rec, skill: rec.skills[i] };
}

const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
export const ENEMIES = Object.freeze({
  enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }), enemy_heavy: dummy('enemy_heavy', { mass: 3 }),
  enemy_light: dummy('enemy_light', { mass: 1 }), enemy_biter: dummy('enemy_biter', { atk: 400, range: 1.2, bat: 1 }),
  enemy_runner: dummy('enemy_runner', { speed: 1, hp: 1e6 }),
});

/**
 * A battle with the piece `id` as uid 1 at (10, 4) facing RIGHT, skill `skill`, plus `others` (harness units). `units`: more pieces of
 * this season: [{ uid, id, skill, row, col }].
 */
export function field(id, { skill = 1, row = 10, col = 4, dir, others = [], more = [], seed = 5, dp = 99, enemies = {}, hooks = [] } = {}) {
  const chess = { [id]: pieceRec(id, skill) };
  for (const m of more) chess[m.id] = pieceRec(m.id, m.skill ?? 1);
  const h = makeBattle({
    defs: { enemies: { ...ENEMIES, ...enemies }, chess, tokens: ACT3.tokens }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpInit: dp, dpPerSec: 0, dpMax: 999 },
    hooks: ['damaged', 'heal', 'skillStart', 'skillEnd', 'statusApplied', 'death', 'kill', 'deploy', ...hooks], captureNoisy: true,
    units: [{ uid: 1, chessId: id, row, col, ...(dir ? { dir } : {}) }, ...more.map((m) => ({ uid: m.uid, chessId: m.id, row: m.row, col: m.col })), ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}

export function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

/** The skill's SP full (a charge skill: one charge more). */
export const fill = (u) => u.skill.gainSp(u.skill.spCost + 1, 'test');

/** The skill as if its SP had filled, cast now. */
export function cast(u, reason = 'test') {
  fill(u);
  assert.ok(u.skill.activate(reason), `cast ${u.skill.id}`);
}

/** Real match path: a 规程 match buys, places and fights the piece (`id`) of that season's data (ACT3_ON_BASE_FIELD): no handler error. */
export async function realMatch(id, charId) {
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(3, { band: 'band_amiya' });
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const piece = ps.acquireChess(id, { source: 'buy' });
  const [row, col] = legalTileFor(m, ps, id, new Set());
  assert.equal(m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'n1', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  const u = b.allyUnits.find((x) => x.kind === 'op' && x.defId === id);
  assert.ok(u, 'on the field');
  assert.equal(u.def.charId, charId);
  for (let i = 0; i < 1800; i++) b.step();
  assert.deepEqual(b.errors, [], 'no handler error');
  m.dispose?.();
  return u;
}

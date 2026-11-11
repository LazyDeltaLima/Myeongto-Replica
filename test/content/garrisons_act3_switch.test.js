// 卫戍协议：规程's 特质 that call an operator of the 整备区 onto the field (server/sim/content/garrisons/effects/switch.js):
// 耀骑士临光 garrison_58 (act3autochess_gar_effect_switchhand_triggergar) and 历阵锐枪芬 garrison_223 → 224
// (act3autochess_gar_effect_switchcharinhand[trigger]). Synthetic operators carrying the season's garrison ids, on the
// season's data, then the real match path (the battle input's `reserve`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { ACT3, ACT3_ON_BASE_FIELD } from '../helpers/seasonPieces.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { makeMatch, legalTileFor } from '../match/harness.js';

const GB = (gid) => ACT3.garrisons[gid].bb;

function op(id, { g = [], bonds = [], ranged = false } = {}) {
  return {
    ...chessRec({
      id, profession: ranged ? 'CASTER' : 'WARRIOR', bonds, tier: 1,
      stats: { maxHp: 2000, atk: 500, def: 200, res: 10, aspd: 100, bat: 1, respawnTime: 5, spRecovery: 0, blockCnt: 2 },
      skill: null,
    }),
    garrisonIds: g,
  };
}
const DUMMY = enemyRec({ key: 'e_d', hp: 1e7, speed: 0, def: 0, res: 0, atk: 0 });
const B = (count = 3, layers = 0) => ({ count, active: count >= 3, tier: count >= 6 ? 2 : count >= 3 ? 1 : 0, layers });

/**
 * `board` = { id: [row, col, opts] }, `hand` = [[id, slot, opts]] (the battle input's reserve), `bonds` the player's
 * bond states.
 */
function fight({ board, hand = [], bonds }) {
  const chess = {};
  for (const [id, [, , o]] of Object.entries(board)) chess[id] = op(id, o);
  for (const [id, , o] of hand) chess[id] = op(id, o);
  const data = new DataSource({ ...ACT3, chess: { ...ACT3.chess, ...chess }, enemies: { ...ACT3.enemies, e_d: DUMMY } }, getDefaultSource());
  const h = makeBattle({
    data, bonds, timeLimit: 999, autoFinish: false, captureNoisy: true, hooks: ['deploy', 'layerGain'],
    units: Object.entries(board).map(([id, [row, col]]) => ({ chessId: id, row, col })),
    reserve: hand.map(([id, slot]) => ({ chessId: id, slot })),
    enemies: [{ key: 'e_d', pos: [13, 20] }],
  });
  h.run(2);
  return h;
}
const gains = (h) => h.result().perPlayer.p1.layerGains;
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
const NEAR = { g: ['garrison_58_a'], bonds: ['kazimierzShip', 'raidShip'] };
const FEN = { g: ['garrison_223_a', 'garrison_224_a'], bonds: ['kazimierzShip', 'visiShip'] };

test('耀骑士临光 garrison_58: knocked out, the rightmost 卡西米尔 / 突袭 ground operator of the 整备区 comes in on her tile; both gain +6 on their active bonds', () => {
  const n = GB('garrison_58_a').bond_add_count;
  const h = fight({
    board: { near_a: [10, 5, NEAR] },
    hand: [
      ['h2_a', 2, { bonds: ['kazimierzShip'] }],
      ['h6_a', 6, { bonds: ['raidShip', 'sargonShip'] }],
      ['h7_a', 7, { bonds: ['raidShip'], ranged: true }], // ranged: not on a ground tile
      ['h8_a', 8, { bonds: ['sargonShip'] }],              // neither bond
    ],
    bonds: { kazimierzShip: B(), raidShip: B(), sargonShip: B() },
  });
  const b = h.b;
  assert.deepEqual(b.allyUnits.filter((u) => u.reserve).map((u) => u.defId), ['h6_a', 'h2_a'], 'the candidates, rightmost first');
  const near = h.unit('near_a');
  const [r, c] = [near.tileR, near.tileC];
  b.kill(near);
  const h6 = b.allyUnits.find((u) => u.defId === 'h6_a');
  assert.ok(near.removed && !b.isDown(near), 'she leaves: no body, no redeploy');
  assert.ok(h6.alive && h6.deployed && h6.tileR === r && h6.tileC === c && h6.dir === near.dir, 'h6 on her tile');
  assert.ok(h.hooksOf('deploy').some((x) => x.unit === h6 && x.initial === false));
  // hers: 卡西米尔 + 突袭; the called one's: 突袭 + 萨尔贡 (its own active bonds)
  assert.deepEqual(gains(h), { kazimierzShip: n, raidShip: 2 * n, sargonShip: n });
  done(h);
});

test('耀骑士临光 garrison_58: no candidate — she lies down and still gains, up to the cap; a 突袭 retreat (move-like) does nothing', () => {
  const { bond_add_count: n, max_add_count_per_battle: cap } = GB('garrison_58_a');
  const h = fight({ board: { near_a: [10, 5, NEAR] }, hand: [['h8_a', 8, { bonds: ['sargonShip'] }]], bonds: { kazimierzShip: B(), raidShip: B() } });
  const b = h.b;
  const near = h.unit('near_a');
  b.retreat(near, { reason: 'raid' });
  assert.deepEqual(gains(h), {}, 'the 突袭 retreat is no finish of hers');
  h.run(1);
  for (let i = 0; i < 3; i++) {
    if (!near.alive) h.run(8);
    assert.ok(near.alive, `deployed again (${i})`);
    b.kill(near);
    assert.ok(b.isDown(near), 'no candidate: knocked out as usual');
  }
  assert.deepEqual(gains(h), { kazimierzShip: cap, raidShip: cap }, `+${n} a knock-out, ${cap} a battle`);
  done(h);
});

test('历阵锐枪芬 garrison_223 → 224: knocked out, a 卡西米尔 of the 整备区 (rightmost first) takes her tile; nothing without one, nothing on a retreat', () => {
  {
    const h = fight({
      board: { fen_a: [10, 5, FEN] },
      hand: [['h1_a', 1, { bonds: ['kazimierzShip'] }], ['h4_a', 4, { bonds: ['kazimierzShip', 'raidShip'] }], ['h9_a', 9, { bonds: ['raidShip'] }]],
      bonds: { kazimierzShip: B() },
    });
    const b = h.b;
    assert.deepEqual(b.allyUnits.filter((u) => u.reserve).map((u) => u.defId), ['h4_a', 'h1_a'], '卡西米尔 only');
    const fen = h.unit('fen_a');
    b.retreat(fen);
    assert.ok(!fen.removed && b.isDown(fen), 'a retreat is no 被击倒');
    h.run(8);
    assert.ok(fen.alive);
    const [r, c] = [fen.tileR, fen.tileC];
    b.kill(fen);
    const h4 = b.allyUnits.find((u) => u.defId === 'h4_a');
    assert.ok(fen.removed && h4.alive && h4.tileR === r && h4.tileC === c, 'h4 on her tile');
    assert.deepEqual(gains(h), {}, 'no layers');
    done(h);
  }
  {
    const h = fight({ board: { fen_a: [10, 5, FEN] }, hand: [['h9_a', 9, { bonds: ['raidShip'] }]], bonds: { kazimierzShip: B() } });
    const fen = h.unit('fen_a');
    h.b.kill(fen);
    assert.ok(!fen.removed && h.b.isDown(fen), 'no candidate: knocked out as usual');
    done(h);
  }
});

test('卡西米尔 6 + 耀骑士临光: one knock-out calls one operator (the 特质 first), and both share the 整备区 units', () => {
  const board = { near_a: [10, 3, NEAR] };
  for (let i = 0; i < 5; i++) board[`k${i}_a`] = [11, 3 + i, { bonds: ['kazimierzShip'] }];
  const h = fight({
    board,
    hand: [['h3_a', 3, { bonds: ['kazimierzShip'] }], ['h5_a', 5, { bonds: ['kazimierzShip', 'raidShip'] }]],
    bonds: { kazimierzShip: B(6), raidShip: B() },
  });
  const b = h.b;
  const reserve = b.allyUnits.filter((u) => u.reserve);
  assert.deepEqual(reserve.map((u) => u.defId).sort(), ['h3_a', 'h5_a'], 'one unit per hand slot');
  b.kill(h.unit('near_a'));
  assert.deepEqual(reserve.filter((u) => u.deployed).map((u) => u.defId), ['h5_a'], 'one called');
  const n = GB('garrison_58_a').bond_add_count;
  assert.deepEqual(gains(h), { kazimierzShip: 2 * n, raidShip: 2 * n }, 'by her 特质: her gain and the called one\'s');
  b.kill(h.unit('k1_a'));
  assert.deepEqual(reserve.filter((u) => u.deployed).map((u) => u.defId).sort(), ['h3_a', 'h5_a'], '卡西米尔\'s switch takes the next');
  done(h);
});

test('耀骑士临光 (real match): the 整备区\'s 卡西米尔 / 突袭 ground operators travel in the battle input and the rightmost takes her tile', () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 5, data: ACT3_ON_BASE_FIELD, season: 'act3autochess' }).start();
  h.toPrep(3, { band: 'band_amiya' });
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  ps.level = Math.max(ps.level, 6);
  const NEAR_ID = 'chess_char_6_05_a';
  const near = ps.acquireChess(NEAR_ID, { source: 'buy' });
  const [row, col] = legalTileFor(m, ps, NEAR_ID, new Set());
  assert.equal(m.handle('p_0', { t: 'g.move', uid: near.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }).ok, true);
  const visible = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.chessId !== NEAR_ID);
  const fits = visible.filter((c) => c.position === 'MELEE' && (c.bonds.includes('kazimierzShip') || c.bonds.includes('raidShip')) && !c.bonds.includes('maniShip')).slice(0, 2);
  const ranged = visible.find((c) => c.position !== 'MELEE' && c.bonds.includes('raidShip'));
  const other = visible.find((c) => c.position === 'MELEE' && !['kazimierzShip', 'raidShip', 'maniShip'].some((b) => c.bonds.includes(b)));
  assert.equal(fits.length, 2);
  const slots = fits.map((c) => { const p = ps.acquireChess(c.chessId, { source: 'buy' }); return [ps.hand.indexOf(p), c.chessId]; });
  for (const c of [ranged, other].filter(Boolean)) ps.acquireChess(c.chessId, { source: 'buy' });
  ps.recompute();
  const input = ps.battleInput();
  assert.deepEqual(input.reserve.map((u) => [u.slot, u.chessId]), [...slots].sort((a, x) => a[0] - x[0]), 'only the fitting hand operators travel');
  const battles = [];
  const newBattle = m.newBattle.bind(m);
  m.newBattle = (opts, o) => {
    const b = newBattle(opts, o);
    if (o?.preview) return b;
    battles.push(b);
    b.after(3, () => { const k = b.allyUnits.find((u) => u.ownerId === 'p_0' && u.defId === NEAR_ID && u.alive); if (k) { b._tile = [k.tileR, k.tileC]; b.kill(k); } });
    return b;
  };
  h.drive(() => m.round === 4 || h.ended != null);
  const b = battles.find((x) => x.players.some((p) => p.playerId === 'p_0'));
  assert.ok(b && b._tile, 'she was knocked out');
  const right = [...slots].sort((a, x) => x[0] - a[0])[0][1];
  const called = b.allyUnits.find((u) => u.reserve && u.defId === right);
  assert.ok(called && called.deploySeq > 0 && called.homeR === b._tile[0] && called.homeC === b._tile[1], 'the rightmost one came in on her tile');
  assert.equal(b.errorCount, 0);
  assert.equal(m.errorCount, 0);
  m.dispose?.();
});

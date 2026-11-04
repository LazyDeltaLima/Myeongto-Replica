// test/match/jesca2-shield-placement.test.js — where 涤火杰西卡's 机动盾牌 may be placed in prep: T1 "机动盾牌只能放置于涤火杰西卡四周"
// (tokens `ownerBeside`) — the server (PlayerState._legal / summonRange) and its client mirror (gameLogic canPlace).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR } from '../../shared/constants.js';
import { FIELD, canPlace, placeClass, tileKey } from '../../server/match/board.js';
import { placementContext, canPlace as clientCanPlace, diyGetter } from '../../public/js/ui/gameLogic.js';
import { DATA, makeMatch, checkInvariants } from './harness.js';

const SLOT = 'chess_char_5_diy1_a';
const JESCA = 'char_1034_jesca2';
const SHIELD = 'token_10032_jesca2_jckshd';

function prep() {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [SLOT]: { charId: JESCA, skillIndex: 0 } } }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 2101 }).start();
  h.toPrep(1);
  h.setStage('act2autochess_m01');
  const ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear();
  ps.hand.fill(null);
  ps.recompute();
  ps.funds = 100;
  return { m: h.m, ps };
}

const move = (m, uid, r, c) => m.handle('p_0', { t: 'g.move', uid, to: { area: 'board', row: r, col: c } });
const stackOf = (ps) => ps.hand.find((p) => p && p.kind === 'token' && p.id === SHIELD);

function clientOk(m, ps, uid, r, c) {
  const priv = ps.privateView();
  const getChess = diyGetter((id) => DATA.chess[id] ?? null, priv, DATA);
  const ctx = placementContext({
    priv, stage: m.stage, editable: true, getChess, backups: DATA.backups,
    getToken: (id) => DATA.tokens[id] ?? DATA.backups.tokens[id] ?? null, getItem: (id) => DATA.items[id] ?? null,
  });
  return clientCanPlace(ctx, uid, { area: 'board', row: r, col: c });
}

/** Place her on a ground tile that has at least two free ground tiles next to it; returns her piece and her tile. */
function placeHer(m, ps) {
  const piece = ps.acquireChess(SLOT, { source: 'buy' });
  assert.ok(piece, 'gained');
  const map = ps.deployMap(), pos = placeClass(ps, ps.gd.chess(SLOT));
  const ground = (r, c) => canPlace(map, 'melee', r, c);
  for (let r = FIELD.r1; r >= FIELD.r0; r--) for (let c = FIELD.c0; c <= FIELD.c1; c++) {
    if (!canPlace(map, pos, r, c)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => ground(r + a, c + b)).length < 2) continue;
    assert.deepEqual(move(m, piece.uid, r, c), { ok: true });
    return { her: piece, r, c };
  }
  throw new Error('no tile for her');
}

test('机动盾牌 goes only on the four tiles next to 涤火杰西卡, on the server and in the client mirror, whatever her facing', () => {
  const { m, ps } = prep();
  assert.equal(ps.gd.token(SHIELD).ownerBeside, true, 'built from T1\'s text');
  assert.equal(ps.gd.token(SHIELD).ownerRange, false);
  const { her, r, c } = placeHer(m, ps);
  const map = ps.deployMap();
  const stack = stackOf(ps);
  assert.ok(stack, 'her shield joined the hand');
  const beside = new Set([[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].map(([a, b]) => tileKey(a, b)));
  let far = 0, near = 0;
  for (let a = FIELD.r1; a >= FIELD.r0; a--) for (let b = FIELD.c0; b <= FIELD.c1; b++) {
    if (ps.board.has(tileKey(a, b)) || !canPlace(map, 'melee', a, b)) continue;
    const want = beside.has(tileKey(a, b));
    if (want) near++; else far++;
    assert.equal(ps._legal(stack, a, b), want, `server (${a}, ${b})`);
    assert.equal(clientOk(m, ps, stack.uid, a, b).ok, want, `client (${a}, ${b})`);
  }
  assert.ok(near >= 2 && far > 0, 'the stage tests both');
  // her facing moves no tile: every facing keeps the four tiles
  for (const dir of ['UP', 'LEFT', 'DOWN', 'RIGHT']) {
    assert.deepEqual([...ps.summonRange(stack, { key: tileKey(r, c), piece: her, dir })].sort(), [...beside].sort(), dir);
  }
  m.dispose();
});

test('the server refuses a far tile, takes a tile next to her, and the board stays legal', () => {
  const { m, ps } = prep();
  const { r, c } = placeHer(m, ps);
  const map = ps.deployMap();
  const stack = stackOf(ps);
  let far = null, near = null;
  for (let a = FIELD.r1; a >= FIELD.r0; a--) for (let b = FIELD.c0; b <= FIELD.c1; b++) {
    if (ps.board.has(tileKey(a, b)) || !canPlace(map, 'melee', a, b)) continue;
    if (Math.abs(a - r) + Math.abs(b - c) === 1) near ??= [a, b]; else far ??= [a, b];
  }
  assert.deepEqual(move(m, stack.uid, far[0], far[1]), { error: ERR.BAD_TILE }, 'a tile away from her');
  assert.deepEqual(move(m, stack.uid, near[0], near[1]), { ok: true }, 'a tile next to her');
  checkInvariants(m);
  m.dispose();
});

// Promote in place (升华 / 博士投影: PlayerState.promote) of a 自选 summoner standing on the board tops its summon stacks up
// to the ELITE's deploy limit, like an elite merged onto a tile (_mergeChess → grantTokensFor). 0.2.0 review round 17 (then
// 麦哲伦 with SUM-Y, an upstream pick this server does not offer): the promote used to leave the hand at the normal count.
// Here 望 with TRP-X: 7 棋子 as a normal piece, 8 as an elite (full potential) (the module's own deploy limit, active on the elite only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeMatch, legalTileFor } from './harness.js';

const REAL = { skip: !hasGeneratedData() && 'needs the generated data (npm run build-data)' };
const T6B = 'chess_char_6_diy2_a';
const WANG = 'char_2027_wang';
const TRP_X = 'uniequip_002_wang';

/** Summon copies of `uid` the player holds: placed on the board plus the stacks in the hand and 临时整备区. */
function summonsOf(ps, uid) {
  let n = 0;
  for (const p of [...ps.board.values(), ...ps.hand, ...ps.temp]) if (p && p.kind === 'token' && p.ownerUid === uid) n += p.count || 1;
  return n;
}

test('a promoted 自选 summoner on the board gets the elite\'s summon count (望 TRP-X: 7 → 8 棋子)', REAL, () => {
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6B]: { charId: WANG, skillIndex: 0, uniEquipId: TRP_X } } }];
  const h = makeMatch({ mode: 'solo', seats, seed: 21 }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.initDiyStock(new Set());
    const piece = ps.acquireChess(T6B, { source: 'buy' });
    assert.ok(piece, 'the 自选 望 was gained');
    const tile = legalTileFor(h.m, ps, piece.id);
    assert.deepEqual(h.m.handle('p_0', { t: 'g.move', uid: piece.uid, to: { area: 'board', row: tile[0], col: tile[1] }, dir: 'RIGHT' }), { ok: true });
    const limit = (p) => ps.gd.placeableTokens(p.id, ps.loadoutFor(ps.gd.chess(p.id))).reduce((a, t) => a + t.count, 0);
    const normal = limit(piece);
    assert.equal(summonsOf(ps, piece.uid), normal, 'placing the normal piece brings its own count');
    assert.equal(ps.promote(piece), true);
    const elite = limit(piece);
    assert.deepEqual([normal, elite], [7, 8], 'the elite\'s limit is above the normal one');
    assert.equal(summonsOf(ps, piece.uid), elite, 'the promote tops the stacks up to the elite limit');
  } finally { h.m.dispose(); }
});

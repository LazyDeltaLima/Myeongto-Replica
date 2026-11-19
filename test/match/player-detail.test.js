// The 队员信息 dialog's server half (docs/rules/ui.md 「팀원 정보 창」): m.public players[].lineup — the operators on each
// player's board (the body drawn, tier, elite, the field's equipment bar), board only, tier first, [] once eliminated — on the
// real match path (harness → Match.publicView).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, chessOfTier, legalTileFor, DATA } from './harness.js';

test('m.public players[].lineup: the board operators by tier, elites first, the field equipment bar, not the hand', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 7 }).start();
  h.toPrep(1);
  const m = h.m;
  const ps = h.ps('p_1');
  for (const k of [...ps.board.keys()]) ps.board.delete(k);
  ps.hand.fill(null);
  const t1 = chessOfTier(1);
  const t2 = chessOfTier(2);
  const gold = Object.values(DATA.chess).find((c) => c.visible && c.isGolden && c.tier === 1 && !c.isDiy);
  assert.ok(gold, 'a tier-1 elite in the data');
  const placed = [];
  const put = (id) => { const at = legalTileFor(m, ps, id); assert.ok(at, `a tile for ${id}`); placed.push(give(m, ps, id, 'board', at)); return placed.at(-1); };
  const a = put(t1[0]);
  const b = put(gold.chessId);
  const c = put(t2[0]);
  give(m, ps, t1[1], 'hand', 0);
  const item = Object.values(DATA.items).find((it) => !it.isGolden);
  const goldItem = Object.values(DATA.items).find((it) => it.isGolden);
  assert.ok(item && goldItem, 'a plain and a golden item in the data');
  a.items = [{ uid: 9001, id: item.id }, { uid: 9002, id: goldItem.id }];
  ps.recompute();
  const row = m.publicView().players.find((p) => p.playerId === 'p_1');
  assert.ok(Array.isArray(row.lineup), 'lineup sent');
  assert.equal(row.lineup.length, 3, 'the board operators only (the hand piece is left out)');
  assert.deepEqual(row.lineup.map((u) => u.tier), [2, 1, 1], 'tier first');
  assert.equal(row.lineup[1].golden, true, 'the elite before the plain operator of its tier');
  assert.equal(row.lineup[0].char, m.gd.chess(c.id).charId);
  const plain = row.lineup[2];
  assert.equal(plain.char, m.gd.chess(a.id).charId);
  assert.deepEqual(plain.equip, [0, 1], 'the field bar: one pill per item, the golden one gold');
  assert.equal(m.gd.equipSlotsOf(a.id), 2);
  assert.ok(!('slots' in plain), 'the usual two slots are not sent');
  assert.ok(!('equip' in row.lineup[0]), 'no bar without an item');
  assert.ok(!('golden' in plain));
  void b;
  // an eliminated player: nothing
  ps.alive = false;
  assert.deepEqual(m.publicView().players.find((p) => p.playerId === 'p_1').lineup, []);
  m.dispose();
});

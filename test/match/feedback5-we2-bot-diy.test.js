// test/match/feedback5-we2-bot-diy.test.js — 0.2.0 WE2 #13: AI 托管 of a human with 自选 picks buys the player's own slotted
// pieces more readily (bot.js buyScore +DIY_PIECE_BONUS) and levels the 调度中心 one round earlier for the step that opens a
// slotted tier (levelUp, diyOpensAt). Bots field no 自选 piece: nothing changes for them.
// Run: node --test test/match/feedback5-we2-bot-diy.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyScoreOf, levelUp, diyOpensAt, DIY_PIECE_BONUS, itemTarget } from '../../server/match/bot.js';
import { diyGameData } from '../../server/match/player/diy.js';
import { makeMatch, give, giveItem, chessOfTier, checkInvariants } from './harness.js';

const T5A = 'chess_char_5_diy1_a';
const PICK = { charId: 'char_1035_wisdel', skillIndex: 2, uniEquipId: 'uniequip_002_wisdel' }; // 维什戴尔 (协防: never banned)

function prep(seed = 911) {
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T5A]: PICK } },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true },
  ];
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', seats, seed }).start();
  h.toPrep(1);
  return { h, m: h.m, p0: h.ps('p_0'), p1: h.ps('p_1') };
}

test('#13 buyScore: the player\'s own 自选 piece scores DIY_PIECE_BONUS more than the same record without the 自选 mark', () => {
  const { m, p0 } = prep();
  const rec = p0.gd.chess(T5A);
  assert.ok(rec.diyFor, 'a composed 自选 record');
  const withMark = buyScoreOf(m, p0, T5A);
  // the same player and record, only the 自选 mark taken off (a view of the match's data with that record)
  const plain = { ...rec };
  delete plain.diyFor;
  const saved = p0.gd;
  p0.gd = diyGameData(m.gd, new Map([[T5A, plain]]));
  let without;
  try { without = buyScoreOf(m, p0, T5A); } finally { p0.gd = saved; }
  assert.equal(withMark - without, DIY_PIECE_BONUS);
  checkInvariants(m);
  m.dispose();
});

test('#13 levelUp: one round earlier for the step that opens a slotted tier (round 9: level 4 → 5 at a price above 2); a player without picks waits', () => {
  const { m, p0, p1 } = prep(912);
  m.round = 9;
  for (const ps of [p0, p1]) {
    ps.shop.level = 4;
    ps.shop.upgradePrice = 5;
    ps.funds = 6;
    const ids = chessOfTier(1).filter((id) => m.pool.has(id) && m.pool.left(id) > 0).slice(0, 6);
    for (const id of ids) give(m, ps, id, 'hand');
  }
  assert.ok(diyOpensAt(p0, 5) && !diyOpensAt(p1, 5) && !diyOpensAt(p0, 6));
  levelUp(m, p0);
  levelUp(m, p1);
  assert.equal(p0.shop.level, 5, 'p_0 (a tier-5 自选 piece) levels now');
  assert.equal(p1.shop.level, 4, 'p_1 waits for round 10 (LEVEL_TARGET)');
  m.dispose();
});

test('itemTarget: 信标 skips the player\'s own 自选 pieces ("无法装备给自编干员") — the next carrier, else none', () => {
  const { m, p0 } = prep(913);
  for (const p of p0.allChess()) p0.returnCopies(p);
  p0.board.clear(); p0.hand.fill(null);
  const diy = give(m, p0, T5A, 'hand');
  const beacon = giveItem(m, p0, 'chess_item_5_04_e_a');
  assert.equal(itemTarget(m, p0, beacon), null, 'only a 自选 piece: kept');
  const single = give(m, p0, chessOfTier(2).find((id) => m.pool.has(id) && m.pool.left(id) > 0), 'hand');
  assert.equal(itemTarget(m, p0, beacon)?.uid, single.uid, 'the pool operator, though the 自选 piece is of a higher tier');
  assert.ok(p0.find(diy.uid));
  m.dispose();
});

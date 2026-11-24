// server/sim/content/kits/ops/op-angel2.js — 新约能天使 (char_1041_angel2) 自选 kit: 6★ 怪杰 (特种), a 规程 自选 pick since
// 2026-11-14 (maintainer decision: a 6★ of 盟约's chess that 规程 does not field; 盟约 leaves its own chess out of its picks).
// It is 盟约's chess kit (chess_char_6_13-angel2.js, the same builder) and its summon's (token_10056_angel2_target, keyed by
// the token): that chess is a tier-6 piece at the 自选 statuses (E2 Lv1 rank 4; E2 Lv60 rank 7, the module at stage 3), with
// every skill under `skills` (its default, S2, filed there by shared/chessPick.js) and every number read from the record, so it plays the 自选
// forms as it plays the chess (the tier-5 elite's stage-1 module parts come from its record).
// Test: test/content/diy_act2_chess_picks.test.js.

import chess from './chess_char_6_13-angel2.js';
import { chessKitAsPick } from '../shared/chessPick.js';
/** @import { KitFns } from '../shared/tier1.js' */

/** @type {KitFns} */
export default {
  char_1041_angel2: chessKitAsPick(chess.chess_char_6_13_a, 'skchr_angel2_2'),
};

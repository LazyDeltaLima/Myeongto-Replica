// server/sim/content/kits/ops/op-reed2.js — 焰影苇草 (char_1020_reed2) 自选 kit: 6★ 咒愈师 (医疗), a 规程 自选 pick since
// 2026-11-14 (maintainer decision: a 6★ of 盟约's chess that 规程 does not field; 盟约 leaves its own chess out of its picks).
// It is 盟约's chess kit (chess_char_6_08-reed2.js, the same builder): that chess is a tier-6 piece at the 自选 statuses
// (E2 Lv1 rank 4; E2 Lv60 rank 7, modules at stage 3); shared/chessPick.js files its default S3 under `skills` and flags it
// on the record (the kit's 「灼痕效果持续至技能结束」 is S3's, onDefaultSkill), and every number is read from the record, so
// it plays the 自选 forms as it plays the chess (the tier-5 elite's stage-1 module parts come from its record).
// Test: test/content/diy_act2_chess_picks.test.js.

import chess from './chess_char_6_08-reed2.js';
import { chessKitAsPick } from '../shared/chessPick.js';

export default {
  // the chess's default S3 (its 「灼痕效果持续至技能结束」 is S3's: onDefaultSkill)
  char_1020_reed2: chessKitAsPick(chess.chess_char_6_08_a, 'skchr_reed2_3'),
};

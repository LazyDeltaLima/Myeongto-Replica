// server/sim/content/kits/ops/op-titi.js — 缇缇 (char_4056_titi) 自选 kit: 6★ 咒愈师 (医疗), a 规程 自选 pick since 2026-11-14
// (maintainer decision: a 6★ of 盟约's chess that 规程 does not field; 盟约 leaves its own chess out of its picks).
// It is 盟约's chess kit (chess_char_5_02-titi.js, the same builder): that chess is a tier-5 piece at the 自选 statuses (E2
// Lv1 rank 4; E2 Lv60 rank 7, the module at stage 1), with every skill under `skills` (its default, S3, filed there by shared/chessPick.js) and
// every number read from the record. The tier-6 elite's stage-3 module part — 凝固的时光 at 31 % / 42 % ATK
// (extra_atk_scale / damage_atk_scale, a talentChanges entry of talent 0) — is the same talent's numbers, which the kit
// reads from the composed record's talents; the trait is the same at every stage. Test: test/content/diy_act2_chess_picks.test.js.

import chess from './chess_char_5_02-titi.js';
import { chessKitAsPick } from '../shared/chessPick.js';
/** @import { KitFns } from '../shared/tier1.js' */

/** @type {KitFns} */
export default {
  char_4056_titi: chessKitAsPick(chess.chess_char_5_02_a, 'skchr_titi_3'),
};

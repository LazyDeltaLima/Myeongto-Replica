// test/render/eskill-clip-list.js — enemy skills whose official ability plays a three-part channel (a
// ThreePartChannelingAnimation: data/enemies.json / data/seasons/*/enemies.json `skillCast.*.chan`) that the view does
// NOT draw through render/units.js ESKILL_CLIPS, each with why (test/render/eskill-clip-coverage.test.js). A channel
// skill neither wired nor listed fails; so does a listed one that is wired. Keys: `<spine id> <skill, lower case>`.
//   notCast — the sim never casts it in this mode, so there is nothing to draw;
//   other   — the view draws it another way (named);
//   todo    — the sim casts it and the view plays no channel for it yet (the model stands or walks through the cast).

export const NOT_CAST = Object.freeze({
  'enemy_10042_prtrop buildbridge': 'no bridges in this mode (content/enemies/invisible.js: stealth only)',
  'enemy_10042_prtrop_2 buildbridge': 'no bridges in this mode (content/enemies/invisible.js: stealth only)',
  'enemy_10098_crhro read': 'its kit casts no `read` (content/enemies/special.js)',
  'enemy_10099_crvln read': 'its kit casts no `read` (content/enemies/special.js)',
  'enemy_1223_dmech charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
  'enemy_1223_dmech_2 charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
  'enemy_10003_trwlpl_2 initeat': 'a talent only a stage that sets its mode starts (content/enemies/bounty.js)',
});

export const OTHER = Object.freeze({
  'enemy_10003_trwlpl_2 eat': 'its digest form `eat` (render/units.js FORMS: Attack_Idle, closing on Attack_End)',
});

export const TODO = Object.freeze({
  'enemy_1404_msnip crossattack': 'not wired yet (with its down / up sets)',
  'enemy_1513_dekght chargeattack': 'not wired yet',
  'enemy_1517_xi shieldburst': 'not wired yet',
  'enemy_1517_xi shieldburstreborn': 'not wired yet',
  'enemy_1535_wlfmster fearcage': 'not wired yet',
  'enemy_1535_wlfmster wildcalling': 'not wired yet (whether the sim casts it unchecked)',
  'enemy_9009_acfort killothers': 'not wired yet',
  'enemy_9017_achunt 2': 'not wired yet (its 【最终之罚】 charge form is drawn: FORMS `charge`)',
  'enemy_9033_acdeer lasso': 'not wired yet',
  'enemy_10144_xdelk_2 skill': 'not wired yet',
  'enemy_1429_lrwzrd laser': 'not wired yet',
  'enemy_1429_lrwzrd_2 laser': 'not wired yet',
});

// test/render/eskill-clip-list.js — enemy skills whose official ability plays a three-part channel (a
// ThreePartChannelingAnimation: data/enemies.json / data/seasons/*/enemies.json `skillCast.*.chan`) that the view does
// NOT draw through render/units.js ESKILL_CLIPS, each with why (test/render/eskill-clip-coverage.test.js). A channel
// skill neither wired nor listed fails; so does a listed one that is wired. Keys: `<spine id> <skill, lower case>`.
// A skill the sim never casts in this mode is in test/content/enemy-not-cast-list.js, not here (nothing to draw).
//   other   — the view draws it another way (named);
//   todo    — the sim casts it and the view plays no channel for it yet (the model stands or walks through the cast).

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

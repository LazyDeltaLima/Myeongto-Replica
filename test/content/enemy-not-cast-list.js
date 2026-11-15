// test/content/enemy-not-cast-list.js — enemy skills of the data (`skillCast` of data/enemies.json and the seasons'
// enemies.json) that the sim never casts as an enemy skill in this mode, each with why. Written once here and read by
// every coverage test that would otherwise list them as exceptions: the channel clips (test/render/eskill-clip-coverage),
// the link lines (test/render/eskill-lasso-coverage, by the skill of the ability path) and the projectile-waiting casts
// (test/content/enemy-proj-wait-coverage). test/content/enemy-not-cast.test.js checks that each one is a skill of the data
// and that its enemy's kit builds no ability of that name. Keys: `<enemy key> <skill, lower case>`.

export const NOT_CAST = Object.freeze({
  'enemy_10042_prtrop buildbridge': 'no bridges in this mode (content/enemies/invisible.js: stealth only)',
  'enemy_10042_prtrop_2 buildbridge': 'no bridges in this mode (content/enemies/invisible.js: stealth only)',
  'enemy_10098_crhro read': 'its kit casts no `read` (content/enemies/special.js)',
  'enemy_10099_crvln read': 'its kit casts no `read` (content/enemies/special.js)',
  'enemy_1223_dmech charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
  'enemy_1223_dmech_2 charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
  'enemy_10003_trwlpl_2 initeat': 'a talent only a stage that sets its mode starts (content/enemies/bounty.js)',
  'enemy_9012_acloon skill': '炎佑 runs its mode 2 only (shared/skill-modes.js ENEMY_RECORD_MODES); on our side it is a bond summon whose 祛恶之焰 is content/tokens.js yanyouKit (模式乙 Skill_2)',
});

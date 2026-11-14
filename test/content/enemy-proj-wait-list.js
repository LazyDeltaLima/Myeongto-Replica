// test/content/enemy-proj-wait-list.js — enemy skills whose official ability waits for its projectile
// (`_waitForProjectileInvalid`: data/enemies.json / data/seasons/*/enemies.json `skillCast.*.proj`, a group's child too)
// that NO enemy kit casts as an open cast with `projAlive` (content/enemies.js projCastOver), each with why
// (test/content/enemy-proj-wait-coverage.test.js). Such a skill neither wired nor listed fails; so does a listed one that
// is wired. Keys: `<enemy key> <skill, lower case>`.
//   notCast — the sim never casts it as an enemy skill in this mode;
//   other   — another kit runs it (named), with its own end conditions.

export const NOT_CAST = Object.freeze({
  'enemy_1223_dmech charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
  'enemy_1223_dmech_2 charge_gunctrl': 'no 伦蒂尼姆城防副炮 to charge in this mode (content/enemies/reborn.js kitMech)',
});

export const OTHER = Object.freeze({
  'enemy_9012_acloon skill': '炎佑 is a bond summon on our side: its 祛恶之焰 is the ally duration skill of content/tokens.js yanyouKit (模式乙 Skill_2; 模式甲 Skill unused)',
  'enemy_9012_acloon skill_2': '炎佑 is a bond summon on our side: its 祛恶之焰 is the ally duration skill of content/tokens.js yanyouKit — the line ends on silence, stun, its target\'s death or leaving',
});

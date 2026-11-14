// test/render/eskill-lasso-list.js — the enemy abilities whose official projectile is a link with a line effect
// (LassoProjectile / HarpoonMovement with a renderer `_mainEffect`: tools/assets/local-enemy-bindings.json `$projectiles`
// with `link` and `trail`), each with how the view draws it (test/render/eskill-lasso-coverage.test.js). An ability of that
// kind missing here fails; so does a listed one the bindings no longer have. Keys: `<enemy id> <ability path>`.
//   LASSO   — drawn by render/fxgame.js elassoStart: the kit sends the channel's fx 'enemySkill' with `dur` and `tgt`
//             (castFx), and its stand-in beams are in LASSO_BEAMS — the value is the skill's name (the sim's `ability`);
//   OTHER   — drawn another way (named);
//   NOT_CAST — the sim never uses it in this mode;
//   TODO    — the sim uses it and the view draws a stand-in, not the official line.

export const LASSO = Object.freeze({
  'enemy_10034_cnvsax Modes/Attack/Body/Skills/fire': 'fire',
  'enemy_1275_dwlock_2 Skills/DeathEye/LineAttack': 'DeathEye',
});

export const OTHER = Object.freeze({
  'enemy_9012_acloon Modes/2/Body/Skills/Skill_2': '炎佑\'s 祛恶之焰: render/fxgame.js ebreathFx on the kit\'s fx \'yanyouFlame\'',
  'enemy_10018_sgrobh Modes/Default/Body/Attack': '玩具独轮车\'s plain attack: its harpoon line enemy_sgrobh_attack_01 (render/fxgame.js elinkShot on the \'atk\')',
  'enemy_10018_sgrobh Modes/Default/Body/Combat': 'the same line, its blocked attack',
  'enemy_10018_sgrobh Modes/Global/Body/Attack': 'the same, mode Global\'s enemy_sgrobh_attack_02',
  'enemy_10018_sgrobh Modes/Global/Body/Combat': 'the same, mode Global\'s blocked attack',
});

export const NOT_CAST = Object.freeze({
  'enemy_9012_acloon Modes/1/Body/Skills/Skill': '炎佑 runs its mode 2 only (shared/skill-modes.js ENEMY_RECORD_MODES)',
});

export const TODO = Object.freeze({
  'enemy_9017_achunt Skills/3': 'its chain (projectile_enemy_achunt_ray: enemy_achunt_chain / _end) is the sim\'s stand-in fx \'link\' faithLink (content/bosses.js)',
  'enemy_9017_achunt_2 Skills/3': 'the same chain',
});

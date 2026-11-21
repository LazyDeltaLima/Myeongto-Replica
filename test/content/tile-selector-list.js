// test/content/tile-selector-list.js — every ability of an enemy or token prefab whose selector picks a tile
// (tools/assets/local-enemy-bindings.json `sel.tile`: TileSelector and its subclasses), and what the sim does with it.
// test/content/tile-selectors.test.js reads it. 规程's 盐坨子炮 (EnemyCannon00D, a TileSelector DIST_DES_IN_FRONT_LINE) was written as
// a unit target — its top-aggro operator — until a CN player's report (2026-11-14).
//
//   sim: 'tile'   the sim picks a tile the way the selector does; `test` names a test that pins it (file 「name part」)
//   sim: 'none'   the sim never runs it here; `why`
//   sim: 'unit'   the sim picks a unit instead; `where` holds an [추정·…] mark saying why (or the fix is a bundles line)
// An ability whose selector only takes tiles / tokens of certain keys (ONLY_CERTAIN_TILE_KEY, `sel.keys`) that no
// stage has needs no line: the test finds it inert.

export const TILE_SELECTORS = Object.freeze({
  // 盐坨子炮 (规程 m10, docs/rules/sim.md 「규정 전장을 19×21 틀로」): this mode casts EnemyCannon00D only
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon00D': { sim: 'tile', where: 'server/sim/content/devices.js', key: 'DIST_DES_IN_FRONT_LINE', test: ['test/seasons-act3-stages.test.js', 'farthest tile of its lane'] },
  'trap_196_cnnon Modes/Default/Body/Talents/SelectNormalTarget': { sim: 'tile', where: 'server/sim/content/devices.js', key: 'DIST_DES_IN_FRONT_LINE', test: ['test/seasons-act3-stages.test.js', 'farthest tile of its lane'] },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon00': { sim: 'none', why: 'this mode casts EnemyCannon00D only (rules/sim.md 염괴포)' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon10': { sim: 'none', why: 'this mode casts EnemyCannon00D only (rules/sim.md 염괴포)' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon10D': { sim: 'none', why: 'this mode casts EnemyCannon00D only (rules/sim.md 염괴포)' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon01': { sim: 'none', why: 'ENEMY_WITH_BUFF: an enemy with the main story boss\'s mark enemy_crzjdg_2_self_mark, which no enemy of this mode carries' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon01D': { sim: 'none', why: 'ENEMY_WITH_BUFF: the main story boss\'s mark, as EnemyCannon01' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon11': { sim: 'none', why: 'ENEMY_WITH_BUFF: the main story boss\'s mark, as EnemyCannon01' },
  'trap_196_cnnon Modes/Default/Body/Talents/EnemyCannon11D': { sim: 'none', why: 'ENEMY_WITH_BUFF: the main story boss\'s mark, as EnemyCannon01' },
  'trap_196_cnnon Modes/Default/Body/Talents/SelectBossTarget': { sim: 'none', why: 'ENEMY_WITH_BUFF: the main story boss\'s mark, as EnemyCannon01' },
  // “邪魔的利刃”'s 国度: the 3×3 of tiles round its own tile, whoever stands there
  'enemy_2048_smgrd Talents/BlackFog': { sim: 'tile', where: 'server/sim/content/enemies/leaders.js', key: 'fog.tiles.add', test: ['test/content/enemies_bosses.test.js', 'covers the 8 tiles around it'] },
  // “萨米的意志”'s 冰凌: SmdeerTileSelector — the top tile of its target's column, then down the column
  'enemy_9033_acdeer Modes/Default/Body/Attack': { sim: 'tile', where: 'server/sim/content/bosses.js', key: 'SmdeerTileSelector', test: ['test/content/enemies_bosses.test.js', 'runs down the column from the top row'] },
  // 假想敌：械's 【洪流攻势】: the sim takes the operator with the highest block count, its four sides' tiles
  'enemy_9029_acfnc CommonAbilities/SkillSelector': { sim: 'unit', where: 'server/sim/content/bosses.js', key: '[추정·CN]' },
  'enemy_9029_acfnc_2 CommonAbilities/SkillSelector': { sim: 'unit', where: 'server/sim/content/bosses.js', key: '[추정·CN]' },
});

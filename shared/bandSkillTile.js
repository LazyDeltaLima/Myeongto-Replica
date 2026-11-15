// shared/bandSkillTile.js — which stage tiles a 规程 MAP_TILE 指令 may target, by the tile alone (its legend entry in
// stages.json `tiles`). The server's check (server/match/match/bandSkill.js _bandSkillTile, which the AI seats use too)
// and the drag highlight (public/js/ui/gameLogic/placement.js bandSkillTiles) both read this one predicate; they add
// what depends on the match (obstacle devices, the own pieces, the 宝藏探机 chests).
// Pure ESM: shared by the server and the browser.

/**
 * The enemies' red and blue doors (tile_start / tile_end): ground passable, yet no 指令 target — an official recording
 * shows 妮芙's 「溃心领域」 refusing them (upstream PR #951).
 */
export const DOOR_TILE_KEYS = Object.freeze(new Set(['tile_start', 'tile_end']));

/**
 * Is a stage tile (legend entry) a target of a MAP_TILE 指令 of `filter`? PASSABLE: a tile ground enemies walk, not a
 * door; PASSABLE_AND_BUILDABLE: also one an operator could stand on (`buildable` not NONE).
 * @param {any} tile the stage legend entry ({ tileKey, groundPassable, buildable, … })
 * @param {string} filter
 * @returns {boolean}
 */
export function bandSkillTileOk(tile, filter) {
  if (!tile || tile.groundPassable !== true || DOOR_TILE_KEYS.has(tile.tileKey)) return false;
  if (filter === 'PASSABLE_AND_BUILDABLE' && (!tile.buildable || tile.buildable === 'NONE')) return false;
  return true;
}

// server/sim/content/garrisons/shared.js — what garrisons/battle.js and the IN_BATTLE 特质 families of
// garrisons/effects/*.js share. Imports neither, so the tables garrisons/battle.js assembles are whole whichever file
// loads first.

import { rotateOffset } from '../../dir.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */

/**
 * One IN_BATTLE 特质 an operator carries (garrisons/battle.js install `add`): its unit, the garrison record `g` (id `gid`,
 * effect key `key`, `bb` / `bbStr`), the instance that granted it (ADD_BOND) or null, the per-battle cap and its key, the
 * key of its own buff, the event count `cnt` and the layer reader's steps `k` (−1 before the first read). The rest is
 * the state one family keeps on its instances, absent on the others: `allies` (_selfkillenemy), `locks` / `target` /
 * `seq` / `next` (_consume_ammo, set by its reset), `wholeUsed` (bond_actived_maxstack), `el` / `rate`
 * (block_eprecoverspeed), `bonds` (the layer readers), `seen` (firstdamgecold), `payload` (the effect garrison of a
 * garrison_trigger_buff one), `calls` (the switch's called operators and their copies).
 * @typedef {{ unit: Unit, g: Record<string, any>, gid: string, key: string, bb: Record<string, any>,
 *   bbStr: Record<string, any>, grantedBy: GarrisonInst | null, cap: number, capKey: string, buffKey: string, cnt: number,
 *   k: number, allies?: boolean, locks?: Map<Unit, number>, target?: number, seq?: number, next?: number,
 *   wholeUsed?: number, el?: string | null, rate?: Map<Unit, number>, bonds?: string[], seen?: Set<Unit>,
 *   payload?: Record<string, any> | null, calls?: Map<Unit, GarrisonInst> | null }} GarrisonInst
 */
/** An installer of one effect key: (battle, the instances of the key) — garrisons/battle.js INSTALLERS. @typedef {(battle: Battle, list: GarrisonInst[]) => void} Installer */


export const ids = (/** @type {unknown} */ s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
export const EMPTY = /** @type {readonly never[]} */ (Object.freeze([]));

/**
 * The instances of a list grouped by the unit that carries them.
 * @template {{ unit: Unit }} T
 * @param {readonly T[]} list
 * @returns {Map<Unit, T[]>}
 */
export const byUnit = (list) => {
  const m = new Map();
  for (const it of list) {
    let a = m.get(it.unit);
    if (!a) { a = []; m.set(it.unit, a); }
    a.push(it);
  }
  return m;
};

/**
 * The range_table grids the 规程 特质 name (bbStr range_id / bond_range_id; `[dRow, dCol]` facing RIGHT, dir.js rotates):
 * 0-1 self · 1-1 self + the tile in front · 1-5 the tile in front · b-4 the tile behind · x-4 the 3 × 3 square ("周围八格")
 * · x-5 the plus ("自身及周围四格") · x-1 the diamond of radius 2 ("周围12格"). The square and the diamond include the
 * holder's own tile, as the table does; a text that says 其他 / 身前 / 身后 leaves the holder out by its grid or its caller.
 */
/** @type {Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>>} */
export const RANGE_GRIDS = Object.freeze({
  '0-1': Object.freeze([[0, 0]]),
  '1-1': Object.freeze([[0, 0], [0, 1]]),
  '1-5': Object.freeze([[0, 1]]),
  'b-4': Object.freeze([[0, -1]]),
  'x-4': Object.freeze([[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]]),
  'x-5': Object.freeze([[1, 0], [0, -1], [0, 0], [0, 1], [-1, 0]]),
  'x-1': Object.freeze([[2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-1, -1], [-1, 0], [-1, 1], [-2, 0]]),
});

/** The board tile a unit stands on: an operator's tile, an enemy's rounded position (support tileKey). @param {Unit} u */
export const tileOf = (u) => (u.side === 'ally' ? [u.tileR, u.tileC] : [Math.round(u.y), Math.round(u.x)]);

/**
 * Whether `target` stands in range `rangeId` of `holder` (RANGE_GRIDS, rotated by the holder's facing). 'attack' = the
 * holder's attack range (support inRange); an unknown id is false.
 * @param {Unit | null | undefined} holder @param {Unit | null | undefined} target @param {string} rangeId
 * @param {(holder: Unit, target: Unit) => boolean} inRange
 */
export function inRangeOf(holder, target, rangeId, inRange) {
  if (!holder || !target) return false;
  if (rangeId === 'attack') return inRange(holder, target);
  const grid = RANGE_GRIDS[rangeId];


  if (!grid) return false;
  const [tr, tc] = tileOf(target);
  for (let i = 0; i < grid.length; i++) {
    const [dr, dc] = rotateOffset(grid[i][0], grid[i][1], holder.dir);
    if (holder.tileR + dr === tr && holder.tileC + dc === tc) return true;
  }
  return false;
}

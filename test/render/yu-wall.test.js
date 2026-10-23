// test/render/yu-wall.test.js — 余 S3 灶里乾坤's fire wall as the client assembles it (render/fxgame.js yuWallPieces;
// maintainer report 2026-10-10: the flames stand on his tile's front edge — facing right, on its right edge). The client:
// yu_skill3_range_01_source puts yu_skill3_range_01_root on every tile of his line; each root plays its piece at the tile
// centre + FOUR_WAYS[direction] × `_offset` 0.4 — the row piece facing up / down, the column piece of its screen side
// (_r / _l) facing left / right — and the end pieces at the line's ends.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yuWallPieces, YU_WALL_OFFSET } from '../../public/js/render/fxgame.js';
import { wallTiles } from '../../public/js/render/fx.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const INDEX = path.join(ROOT, 'public/assets/local/fx/index.json');

const RECT = { r0: 9, r1: 12, c0: 0, c1: 10 };   // shared/constants.js NORMAL_RECT

test('facing RIGHT: the column pieces stand 0.4 tiles right of his column, the roots on the tile centres', () => {
  const ps = yuWallPieces('RIGHT', wallTiles(3, 10, 'col', RECT), 5);
  const roots = ps.filter((p) => p.name === 'yu_skill3_range_01_root');
  assert.deepEqual(roots.map((p) => [p.y, p.x]), [[9, 3], [10, 3], [11, 3], [12, 3]]);
  const pieces = ps.filter((p) => p.name === 'yu_skill3_range_01_l');   // x 3.4 < the camera's 5: the left-side copy
  assert.equal(pieces.length, 4);
  for (const p of pieces) assert.equal(p.x, 3 + YU_WALL_OFFSET);
  assert.deepEqual(ps.filter((p) => /_end$/.test(p.name)).map((p) => [p.name, p.y]),
    [['yu_skill3_range_01_l_D_end', 9], ['yu_skill3_range_01_l_U_end', 12]]);
});

test('facing LEFT right of the camera: the _r copy on his left edge', () => {
  const ps = yuWallPieces('LEFT', wallTiles(8, 10, 'col', RECT), 5);
  const pieces = ps.filter((p) => p.name === 'yu_skill3_range_01_r');
  assert.equal(pieces.length, 4);
  for (const p of pieces) assert.equal(p.x, 8 - YU_WALL_OFFSET);
});

test('facing UP / DOWN: the row piece on the tile\'s upper / lower edge, end pieces at both ends', () => {
  const up = yuWallPieces('UP', wallTiles(4, 10, 'row', RECT), 5);
  const row = up.filter((p) => p.name === 'yu_skill3_range_01');
  assert.equal(row.length, 11);
  for (const p of row) assert.equal(p.y, 10 + YU_WALL_OFFSET);
  assert.deepEqual(up.filter((p) => /_end$/.test(p.name)).map((p) => [p.name, p.x]),
    [['yu_skill3_range_01_L_end', 0], ['yu_skill3_range_01_R_end', 10]]);
  const down = yuWallPieces('DOWN', wallTiles(4, 10, 'row', RECT), 5);
  for (const p of down.filter((q) => q.name === 'yu_skill3_range_01')) assert.equal(p.y, 10 - YU_WALL_OFFSET);
});

test('kitFx draws the wall from yuWallPieces (names matched without case), no turned row pieces', () => {
  assert.match(SRC, /for \(const p of yuWallPieces\(dir, wallTiles\(x, y, o\.axis === 'row' \? 'row' : 'col', rect\), midX\)\)/);
  assert.match(SRC, /b\.prefabs\.find\(\(p\) => p\.toLowerCase\(\) === n\.toLowerCase\(\)\)/);
  assert.doesNotMatch(SRC, /rotation\.set\(0, 0, Math\.PI \/ 2\)/);
});

test('every piece the wall names is extracted (when the local effects are installed)', { skip: !existsSync(INDEX) }, () => {
  const have = new Set(JSON.parse(readFileSync(INDEX, 'utf8')).bundles.yu.map((n) => n.toLowerCase()));
  const names = new Set();
  for (const dir of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
    for (const mid of [-1, 99]) for (const p of yuWallPieces(dir, wallTiles(4, 10, dir === 'UP' || dir === 'DOWN' ? 'row' : 'col', RECT), mid)) names.add(p.name);
  }
  for (const n of names) assert.ok(have.has(n.toLowerCase()), n);
});

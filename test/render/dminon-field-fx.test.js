// test/render/dminon-field-fx.test.js — 테리토리야 (char_4246_dminon)'s 国度 look and its tile moments (docs/rules/fx.md
// 「테리토리야 국가의 칸과 가장자리 선」): the outline loops of a tile set (render/fx/edges.js, the official
// RangeLineEffectHandler's edge lines), and on the real effect layer (dry) the field's tile effect on each tile, one edge line
// per loop, the spread / 此身为界 hit on each tile and 实质坍缩's hit on the enemy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeEdges } from '../../public/js/render/fx/edges.js';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { fxEvent } from '../helpers/fxEvent.js';

const count = (list, n) => list.filter((x) => x.split('@')[0] === n).length;

test('rangeEdges: one closed loop per outline, corners at the tiles\' edges, the turns only; a hole and a corner-touching tile are loops of their own', () => {
  assert.deepEqual(rangeEdges([]), []);
  assert.deepEqual(rangeEdges([[2, 3]]), [[[1.5, 2.5], [2.5, 2.5], [2.5, 3.5], [1.5, 3.5], [1.5, 2.5]]], 'one tile');
  assert.deepEqual(rangeEdges([[0, 0], [1, 0], [2, 0]]), [[[-0.5, -0.5], [2.5, -0.5], [2.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]]], 'a row: no corner on the straight edges');
  const l = rangeEdges([[0, 0], [1, 0], [0, 1]]);
  assert.equal(l.length, 1);
  assert.equal(l[0].length, 7, 'an L: six turns and the first again');
  assert.equal(rangeEdges([[0, 0], [1, 1]]).length, 2, 'two tiles touching at a corner');
  const ring = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) ring.push([x, y]);
  const r = rangeEdges(ring);
  assert.equal(r.length, 2, 'a ring: the outer loop and the hole');
  for (const loop of r) assert.deepEqual(loop[0], loop.at(-1), 'closed');
  assert.deepEqual(rangeEdges(ring), r, 'the same cells, the same loops');
});

test('테리토리야\'s 国度: dminon_talent_range_01 on each tile of his range, dminon_range_line_01 once per outline loop; the spread and 此身为界 play dminon_talent_range_hit_01 on each tile; 实质坍缩 dminon_talent_hit_01 on the enemy', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4246_dminon', 3, 0)], [9, unit(9, 'enemy', 'enemy_x', 4)]]);
  const cells = [[3, 9], [4, 9], [3, 10], [4, 10], [6, 10]];   // a square and a tile apart: two loops
  layer.onEvent(fxEvent('field', { x: 3, y: 10, id: 1, cells, gone: [] }), views);
  const a = take();
  assert.deepEqual([count(a, 'dminon_talent_range_01'), count(a, 'dminon_range_line_01')], [5, 2], `${a}`);
  layer.onEvent(fxEvent('aoe', { x: 8, y: 10, radius: 1, id: 1, skill: 'dminon:spread', cells: [[8, 9], [7, 10], [8, 10], [9, 10], [8, 11]] }), views);
  const b = take();
  assert.equal(count(b, 'dminon_talent_range_hit_01'), 5, `${b}`);
  assert.equal(count(b, 'dminon_talent_range_01'), 0, 'the area mark is not drawn either');
  layer.onEvent(fxEvent('aoe', { x: 3, y: 10, id: 1, skill: 'dminon:boundary', cells }), views);
  assert.equal(count(take(), 'dminon_talent_range_hit_01'), 5);
  layer.onEvent(['dmg', 9, 10, 'arts', 0, 1, 0, 1, [['dminon_t_1[dmg]', 1]]], views);
  const d = take();
  assert.equal(count(d, 'dminon_talent_hit_01'), 1, `${d}`);
}));

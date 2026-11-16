// test/render/aglna2-s3-edge.test.js — 予愿安洁莉娜 (char_1015_aglna2) S3's edge line (docs/rules/fx.md 「안젤리나 더 멜로우 위시
// S3 가장자리 선」): skchr_aglna2_3/Toggle/BlockToggle's RangeLineEffectEmitter draws aglna2_skill_03_range_line_01 along her
// range's outline while the skill runs. The sim sends the range tiles on S3's 'takeoff' and on each landing ('aglnaFlight'
// off); the line is the skill's (`life: 'skill'`: stopBuffs ends it with the skill) and its operator's (ended as she leaves).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { rangeEdges } from '../../public/js/render/fx/edges.js';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { fxEvent } from '../helpers/fxEvent.js';

const LINE = 'aglna2_skill_03_range_line_01';
const count = (list, n) => list.filter((x) => x.split('@')[0] === n).length;

test('the plan: an S3 takeoff or landing with `cells` holds the edge line in one slot until the skill ends; one without draws nothing', () => {
  for (const kind of ['takeoff', 'aglnaFlight']) {
    const p = kitOfficialPlan(kind, { id: 1, cells: [[3, 9]] }, 'aglna2');
    assert.deepEqual(p?.play, [{ n: LINE, edge: 'cells', slot: 'aglna2Edge', life: 'skill' }], `${kind}: the line, the skill's`);
    assert.equal(kitOfficialPlan(kind, { id: 1 }, 'aglna2'), null, `${kind} without her range (S1 / S2, a flight leaving, the landing home)`);
  }
});

test('予愿安洁莉娜 S3: aglna2_skill_03_range_line_01 once per outline loop of the range her takeoff / landing names; nothing on a takeoff without one', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1015_aglna2', 4, 2)]]);
  const range = [];
  for (let x = 3; x <= 5; x++) for (let y = 9; y <= 11; y++) range.push([x, y]);
  range.push([8, 10]);   // a tile apart: a second loop
  assert.equal(rangeEdges(range).length, 2);
  layer.onEvent(fxEvent('takeoff', { x: 4, y: 10, id: 1 }), views);
  assert.equal(count(take(), LINE), 0, 'S1 / S2: no line');
  layer.onEvent(fxEvent('takeoff', { x: 4, y: 10, id: 1, cells: range }), views);
  const a = take();
  assert.equal(count(a, LINE), 2, `${a}`);
  layer.onEvent(fxEvent('aglnaFlight', { x: 4, y: 10, id: 1, on: 1, tx: 7, ty: 11 }), views);
  assert.equal(count(take(), LINE), 0, 'a flight leaving: the line stays as it was');
  // landed: three loops now — the two it has move to the new outline, a third line is made
  layer.onEvent(fxEvent('aglnaFlight', { x: 7, y: 11, id: 1, on: 0, dir: 'RIGHT', cells: [[6, 10], [7, 10], [9, 10], [11, 10]] }), views);
  const b = take();
  assert.ok(count(b, LINE) >= 1, `her range where she landed: ${b}`);
}));

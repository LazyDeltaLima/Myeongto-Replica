// test/render/season-pieces-fx.test.js — the official effects of the 规程 season's pieces on the real effect layer (dry)
// (docs/rules/fx.md 「규정 기물의 이펙트 연결」): each plays its client prefab at the moment and on the unit the client names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';

const count = (list, n) => list.filter((x) => x.split('@')[0] === n).length;

test('사일런스 더 패러디그매틱 S3: 不死 shows slent2_skill_03_buff_02 on the ally it saves, not on her at the cast', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1031_slent2', 0, 2)], [5, unit(5, 'ally', 'char_002_amiya', 1)]]);
  layer.onEvent(['skill', 1, 2], views);
  assert.equal(count(take(), 'slent2_skill_03_buff_02'), 0, 'not at the cast');
  layer.onEvent(['fx', 'undying', 1, 0, { x: 1, y: 0, id: 5, src: 1, duration: 5 }], views);
  assert.equal(count(take(), 'slent2_skill_03_buff_02'), 1);
}));

test('외드레르 S1 / S3: hodrer_s[heal]\'s hodrer_skill_01_buff_01 on him as the attack heals him', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4088_hodrer', 0, 0)]]);
  layer.onEvent(['heal', 1, 120, 1, [['hodrer_s[heal]', 1]]], views);
  assert.equal(count(take(), 'hodrer_skill_01_buff_01'), 1);
  layer.onEvent(['heal', 1, 120, 1], views);
  assert.equal(count(take(), 'hodrer_skill_01_buff_01'), 0, 'not another heal');
}));

test('메커니스트 S2: its 屏障 breaking plays _end on the holder while the skill runs, _end_02 after it', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4230_mcnist', 0, 1)], [5, unit(5, 'ally', 'char_002_amiya', 1)]]);
  layer.onEvent(['fx', 'shieldBreak', 1, 0, { x: 1, y: 0, id: 5, src: 1, on: 1 }], views);
  const a = take();
  assert.deepEqual([count(a, 'mcnist_skill_02_buff_01_end'), count(a, 'mcnist_skill_02_buff_01_end_02')], [1, 0], `${a}`);
  layer.onEvent(['fx', 'shieldBreak', 1, 0, { x: 1, y: 0, id: 5, src: 1, on: 0 }], views);
  const b = take();
  assert.deepEqual([count(b, 'mcnist_skill_02_buff_01_end'), count(b, 'mcnist_skill_02_buff_01_end_02')], [0, 1], `${b}`);
}));

test('아미야 의료 형태: her trait heal plays amiya3_characteristic_01_hit on the ally; S1 amiya3_skill_01_range on her at each damage, not at the cast', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1037_amiya3', 0, 0)], [5, unit(5, 'ally', 'char_002_amiya', 1)]]);
  layer.onEvent(['heal', 5, 80, 1, [['trait', 1]]], views);
  assert.equal(count(take(), 'amiya3_characteristic_01_hit'), 1);
  layer.onEvent(['skill', 1, 1], views);
  assert.equal(count(take(), 'amiya3_skill_01_range'), 0, 'not at the cast');
  layer.onEvent(['fx', 'kitHit', 0, 0, { x: 0, y: 0, id: 1, k: 'amiya3:s1' }], views);
  assert.equal(count(take(), 'amiya3_skill_01_range'), 1);
}));

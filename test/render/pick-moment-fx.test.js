// test/render/pick-moment-fx.test.js — kit moments of 黍, 老鲤 and 黑键 on the real effect layer (dry): each plays its client prefab
// at the moment, on the unit the client names (docs/rules/fx.md 「선발 슈·리·에벤홀츠 키트 순간 이펙트」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';

const has = (list, n) => list.some((x) => x.split('@')[0] === n);
const on = (id, side, defId, x = 0) => [id, { id, x, y: 0, alive: true, info: { id, side, defId, skillIndex: 2 } }];

test('黍 S3: the mark sits on the enemy, the put-back plays where it stood and where it lands', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const views = new Map([on(1, 'ally', 'char_2025_shu'), on(9, 'enemy', 'enemy_x', 2)]);
  layer.onEvent(['skill', 1, 2], views);
  take();
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, tgt: 9, k: 'shu:mark' }], views);
  assert.ok(has(take(), 'shu_talent_buff_03'));
  layer.onEvent(['fx', 'teleport', 5, 0, { x: 5, y: 0, id: 9, src: 1 }], views);
  const t = take();
  assert.ok(has(t, 'shu_teleport_hit') && has(t, 'shu_teleport_hit_02'), `${t}`);
}));

test('老鲤 T2: the guard holds until it stops a stun, its stun on the one who tried; S3 a push on the enemy struck', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const views = new Map([on(1, 'ally', 'char_322_lmlee'), on(9, 'enemy', 'enemy_x', 2)]);
  layer.onEvent(['fx', 'shield', 0, 0, { x: 0, y: 0, id: 1, kind: 'lmlee' }], views);
  assert.ok(has(take(), 'lmlee_buff_02_start'));
  layer.onEvent(['fx', 'counter', 0, 0, { x: 0, y: 0, id: 1, tgt: 9, t: 2 }], views);
  assert.ok(has(take(), 'lmlee_buff_02_hit'));
  layer.onEvent(['fx', 'counter', 0, 0, { x: 0, y: 0, id: 1 }], views);
  assert.ok(!has(take(), 'lmlee_buff_02_hit'), 'nobody to stun');
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, tgt: 9, k: 'lmlee:s3push' }], views);
  assert.ok(has(take(), 'lmlee_skill_03_range_hit'));
}));

test('黑键 T2: the target alone plays beidong_hit, with others round it the module\'s mozu_hit', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const views = new Map([on(1, 'ally', 'char_4046_ebnhlz'), on(9, 'enemy', 'enemy_x', 2)]);
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, tgt: 9, k: 'ebnhlz:yiyin' }], views);
  const a = take();
  assert.ok(has(a, 'ebnhlz_beidong_hit') && !has(a, 'ebnhlz_mozu_hit'), `${a}`);
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, tgt: 9, k: 'ebnhlz:yiyinAoe' }], views);
  const b = take();
  assert.ok(has(b, 'ebnhlz_mozu_hit') && !has(b, 'ebnhlz_beidong_hit'), `${b}`);
}));

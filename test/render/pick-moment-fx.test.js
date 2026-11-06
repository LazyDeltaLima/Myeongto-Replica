// test/render/pick-moment-fx.test.js — kit moments of 黍, 老鲤, 黑键, W, 클로저, 브리지드, 크리스틴, 체르니 and 리프레사 on the real effect layer (dry): each plays
// its client prefab at the moment, on the unit the client names (docs/rules/fx.md 「선발 슈·리·에벤홀츠 키트 순간 이펙트」, 「W·클로저·브리지드·크리스틴·체르니·리프레사 키트 순간 이펙트」).

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

test('W: the damage of the moment plays no S1 / S3 prefab of hers: the grenade lands once, the bombs sit on their targets', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  for (const [skill, names] of [[0, ['cqbw_skill_01_hit']], [2, ['cqbw_skill_03_buff', 'cqbw_skill_03_buff_02', 'cqbw_skill_03_buff_03', 'cqbw_skill_03_hit']]]) {
    const u = on(1, 'ally', 'char_113_cqbw');
    u[1].info.skillIndex = skill;
    const views = new Map([u, on(8, 'enemy', 'enemy_x', 2), on(9, 'enemy', 'enemy_x', 3)]);
    layer.onEvent(['skill', 1, 1], views);
    layer.onEvent(['castHit', 1], views);
    take();
    layer.onEvent(['dmg', 8, 100, 'phys', 0, 1, 0, null], views);
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1, 0, null], views);
    const t = take();
    for (const n of names) assert.ok(!has(t, n), `${n} on a damaged enemy: ${t}`);
    layer.onEvent(['skill', 1, 0], views);
    take();
  }
}));

test('브리지드 S2: the cuts go through her three prefabs by the buff\'s count', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const views = new Map([on(1, 'ally', 'char_4177_brigid'), on(9, 'enemy', 'enemy_x', 2)]);
  const cut = (n) => { layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, src: 1, tgt: 9, k: 'brigid:cut', n }], views); return take(); };
  assert.deepEqual(cut(1), ['brigid_skill_02_hit_02']);
  assert.deepEqual(cut(2), ['brigid_skill_02_hit_02_02']);
  assert.deepEqual(cut(3), ['brigid_skill_02_hit_02_03']);
}));

test('체르니: T1 on the attacker; S2 opens without FinalAttack\'s prefabs, which come with its own moments', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const u = on(1, 'ally', 'char_4047_pianst');
  u[1].info.skillIndex = 1;
  const views = new Map([u, on(9, 'enemy', 'enemy_x', 2)]);
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, src: 1, tgt: 9, k: 'pianst:echo' }], views);
  assert.deepEqual(take(), ['pianst_beidong_hit']);
  layer.onEvent(['skill', 1, 1], views);
  layer.onEvent(['dmg', 9, 100, 'arts', 0, 1, 0, null], views);
  const start = take();
  for (const n of ['pianst_skill_02_end', 'pianst_skill_02_end_range', 'pianst_skill_02_end_hit']) assert.ok(!has(start, n), `${n} at the start: ${start}`);
  layer.onEvent(['fx', 'kitHit', 0, 0, { x: 0, y: 0, id: 1, src: 1, k: 'pianst:final', signal: 'final', t: 1.567 }], views);
  const cast = take();
  assert.ok(has(cast, 'pianst_skill_02_end') && has(cast, 'pianst_skill_02_end_range'), `${cast}`);
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, src: 1, tgt: 9, k: 'pianst:finalHit' }], views);
  assert.deepEqual(take(), ['pianst_skill_02_end_hit']);
}));

test('리프레사 S2: each shot lands with her prefab', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const u = on(1, 'ally', 'char_4031_liesel');
  u[1].info.skillIndex = 1;
  const views = new Map([u]);
  layer.onEvent(['fx', 'aoe', 2, 0, { x: 2, y: 0, id: 1, r: 1.7, skill: 'liesel' }], views);
  assert.ok(has(take(), 'liesel_skill_02_hit_01'));
}));

test('클로저 S3 and 크리스틴 T1 play their prefabs at their moments', { skip: NO_DATA }, () => withLayer(async ({ layer, take }) => {
  const views = new Map([on(1, 'ally', 'char_4228_closur'), on(2, 'ally', 'char_4198_christ'), on(9, 'enemy', 'enemy_x', 2)]);
  layer.onEvent(['fx', 'kitHit', 2, 0, { x: 2, y: 0, id: 1, src: 1, tgt: 9, k: 'closur:plane' }], views);
  assert.deepEqual(take(), ['closur_skill_03_airplane_01']);
  layer.onEvent(['fx', 'kitHit', 0, 0, { x: 0, y: 0, id: 2, k: 'christ:aura' }], views);
  assert.ok(has(take(), 'christ_buff_01'));
}));

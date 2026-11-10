// test/render/season-pieces-fx.test.js — the official effects of the 规程 season's pieces on the real effect layer (dry)
// (docs/rules/fx.md 「규정 기물의 이펙트 연결」): each plays its client prefab at the moment and on the unit the client names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';

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

test('체스트넛 S2: a heal on the same ally as the one before it (the \'atk\' signal \'Second\') hits with chnut_skill_02_hit_02, a first one with _hit_01', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4041_chnut', 0, 1)], [5, unit(5, 'ally', 'char_002_amiya', 1)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  const hits = () => { const a = take(); return [count(a, 'chnut_skill_02_hit_01'), count(a, 'chnut_skill_02_hit_02')]; };
  layer.onEvent(['atk', 1, 5, 'heal'], views);
  layer.onEvent(['heal', 5, 80, 1], views);
  assert.deepEqual(hits(), [1, 0], 'the first heal of the skill');
  layer.update(1);
  layer.onEvent(['atk', 1, 5, 'heal', 'Second'], views);
  layer.onEvent(['heal', 5, 80, 1], views);
  assert.deepEqual(hits(), [0, 1], 'the same ally again: projectile_chr_chnut_3');
}));

test('메테오라이트 S2: the kit\'s shell flies meteo_skill_02_trail and plays meteo_skill_02_hit on the enemy it traces only', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_219_meteo', 0, 1)], [2, unit(2, 'enemy', 'enemy_1007_slime', 2)], [3, unit(3, 'enemy', 'enemy_1007_slime', 2.5)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(['fx', 'kitHit', 0, 0, { x: 0, y: 0, id: 1, src: 1, target: 2, k: 'meteo:shell' }], views);
  for (let i = 0; i < 10; i++) layer.update(0.1);
  layer.onEvent(['dmg', 2, 900, 'phys', 0, 1, 0, null], views);
  layer.onEvent(['dmg', 3, 900, 'phys', 0, 1, 0, null], views);
  const a = take();
  assert.deepEqual([count(a, 'meteo_skill_02_trail'), a.filter((x) => x === 'meteo_skill_02_hit@2').length, a.filter((x) => x === 'meteo_skill_02_hit@3').length], [1, 1, 0], `${a}`);
}));

test('메커니스트 S3: the 结构性原理\'s charge flies the trail of its direction and side, its landing and each cross play their own hits', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const tok = (dir, facing) => ({ ...unit(7, 'ally', 'token_10069_mcnist_mcgraf', 3), dir, visFacing: facing });
  const run = (dir, facing) => {
    const views = new Map([[1, unit(1, 'ally', 'char_4230_mcnist', 0, 2)], [7, tok(dir, facing)]]);
    layer.onEvent(['fx', 'charge', 3, 0, { x: 3, y: 0, id: 7, src: 1, dir, tx: 3, ty: 4 }], views);
    for (let i = 0; i < 6; i++) layer.update(0.1);
    return take().filter((n) => n.includes('_trail_'));
  };
  assert.deepEqual(run('UP', -1), ['token_mcnist_mcgraf_skill_03_trail_02_up_left']);
  assert.deepEqual(run('UP', 1), ['token_mcnist_mcgraf_skill_03_trail_02_up_right']);
  assert.deepEqual(run('DOWN', -1), ['token_mcnist_mcgraf_skill_03_trail_03_down_left']);
  assert.deepEqual(run('DOWN', 1), ['token_mcnist_mcgraf_skill_03_trail_03_down_right']);
  assert.deepEqual(run('LEFT', -1), ['token_mcnist_mcgraf_skill_03_trail_01_left']);
  assert.deepEqual(run('RIGHT', 1), ['token_mcnist_mcgraf_skill_03_trail_01_right']);
  const views = new Map([[1, unit(1, 'ally', 'char_4230_mcnist', 0, 2)]]);
  layer.onEvent(['fx', 'aoe', 3, 4, { x: 3, y: 4, radius: 1.5, id: 1, skill: 'mcnist:charge' }], views);
  layer.onEvent(['fx', 'aoe', 5, 2, { x: 5, y: 2, radius: 2, id: 1, skill: 'mcnist:cross', tiles: [] }], views);
  const a = take();
  assert.deepEqual([count(a, 'token_mcnist_mcgraf_skill_03_hit_01'), count(a, 'mcnist_skill_03_hit_01')], [1, 1], `${a}`);
}));

test('메커니스트 S3 charge plan: from the 结构性原理\'s tile to its stop tile, 0.2 s late, 20 tiles / s', () => {
  const [p] = kitOfficialPlan('charge', { x: 3, y: 0, id: 7, src: 1, dir: 'RIGHT', tx: 6, ty: 0 }, 'mcnist', {}).play;
  assert.deepEqual([p.start, p.land, p.delay, p.fly, p.bundle], [[3, 0], [6, 0], 0.2, 20, 'mcnist_token']);
});

test('레이지 아이언하이드 T1 knock-out burst: projectile_chr_acrbot_t2\'s start effect on its tile (the CN char pack, bundle acrbot)', () => {
  assert.deepEqual(kitOfficialPlan('aoe', { x: 3, y: 2, r: 1.7, id: 7, skill: 'acrbot_t2' }, 'acrbot', {}).play,
    [{ n: 'char_acrbot_ability_02_die_01', on: 'point', life: 'once', bundle: 'acrbot' }]);
  assert.equal(kitOfficialPlan('aoe', { x: 3, y: 2, id: 7, skill: 'other' }, 'acrbot', {}), null);
});

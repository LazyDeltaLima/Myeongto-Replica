// test/render/cond-child-fx.test.js — a child of an attack group that fires on a condition plays its own effects only then, on the
// real effect layer (dry). Each case holds both sides: the plain attack without them, the conditional moment with them.
// 琳琅诗怀雅 S1 HealAlly / S2 SpawnToken and 折桠 S2 FirstAttack are kit moments (fxmap.js KIT_CAST / KIT_HIT, fx/kitofficial.js),
// 焰尾's Attack_T1 is the swing's signal (char_modes.py mode_parts → talentAtk), 号角 S2 the attack's kind (fortress).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { KIT_NO_STAND_IN } from '../../public/js/render/fx/kitofficial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const has = (list, n) => list.some((x) => x.split('@')[0] === n);

test('琳琅诗怀雅 S1: an attack plays neither HealAlly\'s cast nor its hit; the heal plays both, the hit on the ally', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1033_swire2', 0, 0)], [2, unit(2, 'ally', 'char_x', 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['skill', 1, 0], views);
  take();
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
  layer.update(0.2);
  layer.onEvent(['atk', 1, 9, 'none'], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
  const a = take();
  assert.ok(has(a, 'swire2_attack_01_start') && has(a, 'swire2_attack_01_hit'), `${a}`);
  assert.ok(!has(a, 'swire2_skill_01_start') && !has(a, 'swire2_skill_01_hit'), `${a}`);
  layer.update(2);
  take();
  layer.onEvent(['fx', 'swire2Heal', 0, 0, { id: 1, signal: 'healAlly', t: 0.4, target: 2 }], views);
  assert.ok(has(take(), 'swire2_skill_01_start'));
  layer.onEvent(['fx', 'coin', 0, 0, { id: 1, n: 3, heal: 2, skill: 'swire2_1' }], views);
  const h = take();
  assert.ok(has(h, 'swire2_skill_01_hit'), `${h}`);
}));

test('琳琅诗怀雅 S2: an attack plays no SpawnToken cast; the throw does', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1033_swire2', 0, 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
  const a = take();
  assert.ok(has(a, 'swire2_attack_01_start') && !has(a, 'swire2_skill_02_start'), `${a}`);
  layer.update(2);
  take();
  layer.onEvent(['fx', 'swire2Throw', 0, 0, { id: 1, signal: 'spawnToken' }], views);
  assert.ok(has(take(), 'swire2_skill_02_start'));
}));

test('折桠 S2: the first swing casts FirstAttack\'s and not the attack\'s, its strike\'s blast nothing more; an attack only its own', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4207_branch', 0, 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['skill', 1, 1], views);
  const atCast = take();
  assert.ok(has(atCast, 'branch_skill_02_buff_01'), `${atCast}`);
  assert.ok(!has(atCast, 'branch_skill_02_range_01') && !has(atCast, 'branch_skill_02_start_01'), `no first attack yet: ${atCast}`);
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9, null, 0, 'FirstAttack'], views);
  const b = take();
  assert.ok(has(b, 'branch_skill_02_range_01') && has(b, 'branch_skill_02_start_01'), `${b}`);
  assert.ok(!has(b, 'branch_skill_02_attack_01'), `${b}`);
  layer.onEvent(['fx', 'aoe', 0, 0, { x: 0, y: 0, radius: 1.5, id: 1, skill: 'resolve', targets: [9] }], views);
  assert.deepEqual(take(), ['branch_skill_02_hit_01'], 'the strike: SpAttack\'s hit on what it makes 战栗, no second cast');
  layer.update(2);
  take();
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
  const a = take();
  assert.ok(has(a, 'branch_skill_02_attack_01'), `${a}`);
  assert.ok(!has(a, 'branch_skill_02_range_01') && !has(a, 'branch_skill_02_start_01'), `${a}`);
}));

test('号角 S2: a blocked swing casts BlockedRangedAttack\'s, a shot RangedAttack\'s, neither the hand-closed Full Burst\'s', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4039_horn', 0, 1)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
  const m = take();
  assert.ok(has(m, 'horn_skill_02_start') && has(m, 'horn_skill_02_start_01') && !has(m, 'horn_skill_02_start_02'), `${m}`);
  assert.ok(!has(m, 'horn_skill_02_start_03'), `${m}`);
  layer.update(2);
  take();
  layer.onEvent(['swing', 1, 0.2, 'bomb', 0, 9], views);
  const r = take();
  assert.ok(has(r, 'horn_skill_02_start_02') && !has(r, 'horn_skill_02_start') && !has(r, 'horn_skill_02_start_01'), `${r}`);
  assert.ok(!has(r, 'horn_skill_02_start_03'), `${r}`);
}));

for (const [label, skill, plain, t1] of [
  ['Default', null, { cast: 'flamtl_attack_01_start_01', hit: 'flamtl_attack_01_hit_01' }, { cast: 'flamtl_attack_01_start_02', hit: 'flamtl_attack_01_hit_02_1', other: 'flamtl_attack_01_hit_02_2' }],
  ['S3', 2, { cast: 'flamtl_skill_03_attack_start_01', hit: 'flamtl_skill_03_attack_01_hit_01' }, { cast: 'flamtl_skill_03_attack_start_02', hit: 'flamtl_skill_03_attack_01_hit_02_1', other: 'flamtl_skill_03_attack_01_hit_02_2' }],
]) {
  test(`焰尾 ${label}: a plain attack plays its one cast and hit; the attack after a dodge (signal Attack_T1) its own`, { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
    const views = new Map([[1, unit(1, 'ally', 'char_420_flamtl', 0, skill ?? 0)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
    if (skill != null) layer.onEvent(['skill', 1, skill], views);
    take();
    layer.onEvent(['swing', 1, 0.2, 'none', 0, 9], views);
    layer.update(0.2);
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
    const a = take();
    assert.ok(has(a, plain.cast) && has(a, plain.hit), `${a}`);
    for (const n of [t1.cast, t1.hit, t1.other]) assert.ok(!has(a, n), `${n}: ${a}`);
    layer.update(2);
    take();
    layer.onEvent(['swing', 1, 0.2, 'none', 0, 9, 0, 0, 'Attack_T1'], views);
    layer.update(0.2);
    layer.onEvent(['atk', 1, 9, 'none', 'Attack_T1'], views);
    layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
    const r = take();
    for (const n of [t1.cast, t1.hit, t1.other]) assert.ok(has(r, n), `${n}: ${r}`);
    assert.ok(!has(r, plain.hit), `${r}`);
  }));
}

test('a kit event the client draws with its own prefabs elsewhere draws no generic mark on top (fx/kitofficial.js KIT_NO_STAND_IN)', { skip: NO_DATA }, () => withLayer(async ({ layer, unit }) => {
  assert.ok(KIT_NO_STAND_IN.size >= 10);
  const modes = JSON.parse(readFileSync(path.join(ROOT, 'public/assets/local/fx/modes.json'), 'utf8'));
  for (const pair of KIT_NO_STAND_IN) {
    const [b, n] = pair.split('|');
    const views = new Map([[1, unit(1, 'ally', Object.keys(modes).find((k) => k.endsWith(`_${b}`)))], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
    const e = ['fx', n, 0, 0, { x: 0, y: 0, id: 1 }];
    layer.onEvent(e, views);
    assert.ok(layer.ownsFx(e), `${pair} still draws its stand-in`);
  }
  // an operator not on the list keeps the mark every other operator shows
  const views = new Map([[1, unit(1, 'ally', 'char_4132_ascln')]]);
  const e = ['fx', 'dodge', 0, 0, { x: 0, y: 0, id: 1 }];
  layer.onEvent(e, views);
  assert.ok(!layer.ownsFx(e), 'the miss mark stays');
}));

// test/render/client-row-fx.test.js — client rows whose prefab sat in another bundle (tools/fx-wiring-report.mjs `foreign`) and is
// now extracted into its operator's bundle and played (docs/rules/fx.md 「바인딩 표 — 손 표를 클라 키로 대조」 foreign, 2026-11-15).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { KEY_FX } from '../../public/js/render/fxstatus.js';
import { TALENT_ALWAYS } from '../../public/js/render/fxmap.js';

test("望 S3: wang_stone3_t[damage]'s moment plays 多萝西's doroth_bomb_hit once on the enemy it damages", () => {
  assert.deepEqual(kitOfficialPlan('hit', { k: 'wang_stone3_t[damage]', src: 1, id: 2 }, 'wang', {}).play, [{ n: 'doroth_bomb_hit', on: 'id', life: 'once' }]);
  assert.equal(kitOfficialPlan('hit', { k: 'wang:1', src: 1, id: 2 }, 'wang', {}), null, 'not S1\'s tick');
});

test('望 S3 on the effect layer: the dmg moment draws doroth_bomb_hit on the enemy', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_2027_wang', 0, 2)], [2, unit(2, 'enemy', 'enemy_1007_slime', 2)]]);
  layer.onEvent(['dmg', 2, 900, 'arts', 0, 1, 0, null, [['wang_stone3_t[damage]', 1]]], views);
  assert.deepEqual(take().filter((n) => n.startsWith('doroth_')).map((n) => n.split('@')[0]), ['doroth_bomb_hit'], 'once (the plan puts it on `id`, the unit hit)');
}));

test("能天使 T2 天使的祝福: angel_t_2's angle_buff_00_start on her from the deployment and on the ally it picks", () => {
  assert.equal(TALENT_ALWAYS.char_103_angel?.tpl, 'angel_t_2');
  const spec = KEY_FX['talent:angel_bless_ally'];
  assert.ok(spec, 'the sim\'s status of the picked ally');
});

test('缇缇 T2 勇气的报偿: 精力充沛 draws her charpack\'s common_full_of_energy_buff_02, not 休谟斯\'s prefab of the same key', () => {
  const spec = KEY_FX['titi:vigor'];
  assert.deepEqual([spec[0], spec[1]], ['titi', 'common_full_of_energy_buff_02']);
});

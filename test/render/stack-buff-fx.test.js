// test/render/stack-buff-fx.test.js — the official effects that change with a buff's stacks (docs/rules/fx.md 「버프 스택 수로
// 바뀌는 이펙트」, 2026-10-21): fxstatus.js STACK_FX entries shown in their range of the kit's count (bounds 'max' / 'mid'
// from the count's event), 佩佩 S2's level by the status's fx hint, the held dodges, 佩佩 S3's hit range and 赤刃明霄陈's
// dodge moment (render/fx/kitofficial.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../public/js/render/fxstatus.js';
import { PLAYS } from '../helpers/fxPlays.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { UnitView } from '../../public/js/render/units.js';

const view = (spine, key, extra = {}) => ({
  info: { spine, defId: spine }, isEnemy: false, alive: true, flags: 0, statuses: new Set([key]), statusFrom: new Map([[key, { src: null, fx: null, n: 0 }]]), ...extra,
});
const names = (v) => [...F.wantedStatusFx(v, new Map(), null, PLAYS).values()].map((s) => s[1]).sort();
/** `v`'s effects after the kit's fx 'stacks' { n, ...o } of `key` (UnitView.onStatusCount). */
const at = (v, key, n, o = {}) => { UnitView.prototype.onStatusCount.call(v, key, n, { n, ...o }); return names(v); };

test('信仰搅拌机 T1: _01 below 3 stacks, swapped for _02 at 3 (SwitchableEffectByBuffStackCnt)', () => {
  const v = view('char_4194_rmixer', 'rmixer:t1');
  assert.deepEqual(at(v, 'rmixer:t1', 1, { max: 3 }), ['rmixer_buff_01']);
  assert.deepEqual(at(v, 'rmixer:t1', 2, { max: 3 }), ['rmixer_buff_01']);
  assert.deepEqual(at(v, 'rmixer:t1', 3, { max: 3 }), ['rmixer_buff_02']);
});

test("the max_stack_cnt effects come at the event's `max`; without it, never", () => {
  for (const [spine, key, first, top] of [
    ['char_1033_swire2', 'talent:swire2_buyer', 'swire2_buff_01_start', 'swire2_buff_01_start_02'],
    ['char_2015_dusk', 'dusk:realm', 'dusk_buff_03_start', 'dusk_buff_03_start_02'],
  ]) {
    const v = view(spine, key);
    assert.deepEqual(at(v, key, 1, { max: 8 }), [first], key);
    assert.deepEqual(at(v, key, 7, { max: 8 }), [first], key);
    assert.deepEqual(at(v, key, 8, { max: 8 }), [first, top].sort(), key);
    const w = view(spine, key);
    assert.deepEqual(at(w, key, 99), [first], `${key}: no max sent`);
  }
  for (const [key, top] of [['nymph:key', 'nymph_talent_buff_02'], ['rockr:rock', 'rockr_buff_01']]) {
    const v = view('x', key);
    assert.deepEqual(at(v, key, 9, { max: 10 }), [], key);
    assert.deepEqual(at(v, key, 10, { max: 10 }), [top], key);
  }
  const s = view('char_202_demkni', 'saria:suit');
  assert.deepEqual(at(s, 'saria:suit', 1, { max: 5 }), ['demkni_buff_01_self']);
});

test("阿斯卡纶's mark on an enemy: its key ends with her id; ascln_buff_02 joins at max and leaves below it", () => {
  const key = 'ascln:judg:17';
  const e = view('enemy_1007_slime', key, { isEnemy: true });
  assert.deepEqual(at(e, key, 2, { max: 3 }), ['ascln_buff_01']);
  assert.deepEqual(at(e, key, 3, { max: 3 }), ['ascln_buff_01', 'ascln_buff_02']);
  assert.deepEqual(at(e, key, 2, { max: 3 }), ['ascln_buff_01']);
});

test('玛恩纳 解放者: _L_01 from the first stack, _L_02 from mid_stack_cnt, _L_03 at max_stack_cnt', () => {
  const key = 'trait:libratorRamp', o = { mid: 20, max: 40 };
  const v = view('char_4064_mlynar', key);
  assert.deepEqual(at(v, key, 1, o), ['mlynar_attack_01_buff_L_01']);
  assert.deepEqual(at(v, key, 20, o), ['mlynar_attack_01_buff_L_01', 'mlynar_attack_01_buff_L_02']);
  assert.deepEqual(at(v, key, 40, o), ['mlynar_attack_01_buff_L_01', 'mlynar_attack_01_buff_L_02', 'mlynar_attack_01_buff_L_03']);
});

test("佩佩 S2's level effect by the status's fx hint; the held dodges", () => {
  for (const [lv, want] of [[1, ['pepe_buff_level_01']], [2, ['pepe_buff_level_02']], [3, ['pepe_buff_level_03']], [null, []]]) {
    const v = view('char_4058_pepe', 'pepe:rage', { statusFrom: new Map([['pepe:rage', { src: null, fx: lv, n: 0 }]]) });
    assert.deepEqual(names(v), want, `level ${lv}`);
  }
  assert.deepEqual(names(view('char_1050_chen3', 'chen3:evade')), ['chen3_Shield_buff_01']);
  assert.deepEqual(names(view('char_4191_tippi', 'tippi:evade')), ['tippi_buff_01']);
});

test("佩佩 S3: the hit range on the main target by her stacks before the attack; 赤刃明霄陈's dodge moment", () => {
  const range = (n) => kitOfficialPlan('stacks', { id: 1, tgt: 5, buff: 'pepe:tremor', n, max: 4 }, 'pepe').play.map((p) => [p.n, p.on, p.life]);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => range(n)[0][0]), [1, 1, 2, 2, 3].map((l) => `pepe_skill_03_hit_range_0${l}`));
  assert.deepEqual(range(0), [['pepe_skill_03_hit_range_01', 'tgt', 'once']]);
  assert.deepEqual(kitOfficialPlan('evadeReady', { id: 1 }, 'chen3').play.map((p) => p.n), ['chen3_buff_start_01', 'chen3_Shield_buff_02']);
});

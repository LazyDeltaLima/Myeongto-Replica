// test/render/status-buff-fx.test.js — the official buff effects of statuses (docs/rules/ui.md ⑤ 「버프 이펙트」): the client
// names an effect per buff (`overrideEffectKey`), so a 束缚 / 抵抗 / 禁疗 shows the applier's buff effect or nothing, a kit
// 护盾 its own; the drawn status icons stand in only while the effect layer is off (maintainer decision 2026-10-14).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import * as F from '../../public/js/render/fxstatus.js';

const DUMMY = enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, atk: 0 });
const MEDIC = 'chess_char_2_02_a';   // 赫默

describe('sim: the status on-event carries the applier, the fx hint and the 护盾 layers', () => {
  const setup = () => makeBattle({
    defs: { enemies: { enemy_dummy: DUMMY } }, autoFinish: false, timeLimit: 60, seed: 1,
    units: [{ chessId: MEDIC, row: 9, col: 4, dir: 'RIGHT' }],
    enemies: [{ key: 'enemy_dummy', pos: [9, 9] }],
  });
  test('applier id, then { fx } / { n } only when set; the off-event stays short', () => {
    const h = setup();
    h.run(0.5);
    const op = h.unit(MEDIC), e = h.b.aliveEnemies()[0];
    h.b.applyStatus(e, 'bind', { duration: 1, source: op });
    h.b.applyStatus(op, 'silence', { duration: 1 });
    h.b.applyStatus(e, 'sluggish', { duration: 1, source: op, fxTag: 's1' });
    h.b.addBuff(op, { key: 'nearl2:shield', shieldHits: 3, duration: 5, visible: true });
    h.run(1.5);
    const ev = h.eventsOf('status');
    const on = (id, k) => ev.find((x) => x[1] === id && x[2] === k && x[3] === 1);
    assert.deepEqual(on(e.id, 'bind'), ['status', e.id, 'bind', 1, op.id]);
    assert.deepEqual(on(op.id, 'silence'), ['status', op.id, 'silence', 1], 'no source: the old shape');
    assert.deepEqual(on(e.id, 'sluggish'), ['status', e.id, 'sluggish', 1, op.id, { fx: 's1' }]);
    assert.deepEqual(on(op.id, 'nearl2:shield'), ['status', op.id, 'nearl2:shield', 1, null, { n: 3 }]);
    assert.deepEqual(ev.find((x) => x[1] === e.id && x[2] === 'bind' && x[3] === 0), ['status', e.id, 'bind', 0]);
  });
});

describe('client: status → the official buff effect', () => {
  const unit = (spine, extra = {}) => ({ info: { spine, defId: spine }, isEnemy: false, alive: true, flags: 0, statuses: new Set(), ...extra });
  const enemy = (statuses, from) => ({ info: { defId: 'enemy_1001_bigbo' }, isEnemy: true, alive: true, flags: 0, statuses: new Set(statuses), statusFrom: new Map(from) });
  const names = (v) => [...F.wantedStatusFx(v).values()].map((s) => s[1]).sort();

  test('statusSource: the applier\'s fx code (resolved at the event), the hint and the layer count', () => {
    const views = new Map([[7, unit('char_469_indigo')]]);
    assert.deepEqual(F.statusSource(views, ['status', 1, 'bind', 1, 7]), { src: 'indigo', fx: null, n: 0 });
    assert.deepEqual(F.statusSource(views, ['status', 1, 'bind', 1, 9, { fx: 's1' }]), { src: null, fx: 's1', n: 0 });
    assert.deepEqual(F.statusSource(views, ['status', 1, 'x', 1, null, { n: 4 }]), { src: null, fx: null, n: 4 });
    assert.equal(F.statusSource(views, ['status', 1, 'stun', 1]), null);
  });

  test('束缚: the applier\'s buff effect; an applier without one (or none) draws nothing — no common badge', () => {
    assert.deepEqual(names(enemy(['bind'], [['bind', { src: 'indigo' }]])), ['indigo_buff_01_start']);
    assert.deepEqual(names(enemy(['bind'], [['bind', { src: 'ines' }]])), ['ines_imprison_01']);
    assert.deepEqual(names(enemy(['bind'], [['bind', { src: 'aglna2' }]])), []);
    assert.deepEqual(names(enemy(['bind'], [])), []);
    // 仇白: S1's bind only (qiubai_s_1[unmovable_effect]); the talent / module 落英 binds carry none
    assert.deepEqual(names(enemy(['bind'], [['bind', { src: 'qiubai', fx: 's1' }]])), ['qiubai_skill_01_buff']);
    assert.deepEqual(names(enemy(['bind'], [['bind', { src: 'qiubai', fx: null }]])), []);
  });

  test('抵抗 / 禁疗 / kit buffs: 灵知 → common_ resistance_01, 史尔特尔 by her own code, 寒檀 by her talent buff', () => {
    assert.deepEqual(names(unit('char_4207_branch', { statuses: new Set(['resist']), statusFrom: new Map([['resist', { src: 'gnosis' }]]) })), ['common_ resistance_01']);
    assert.deepEqual(names(unit('char_4042_lumen', { statuses: new Set(['resist']), statusFrom: new Map([['resist', { src: 'lumen' }]]) })), []);
    assert.deepEqual(names(unit('char_350_surtr', { statuses: new Set(['healFree']) })), ['surtr_buff_01_start']);
    assert.deepEqual(names(unit('char_341_sntlla', { statuses: new Set(['sntlla:born', 'resist']), statusFrom: new Map([['resist', { src: 'sntlla' }]]) })), ['common_ resistance_01']);
    assert.deepEqual(names(unit('char_4139_papyrs', { statuses: new Set(['papyrs:shield', 'generic:shield:skchr_x_2']) })), ['papyrs_talent_01'], 'a generic 护盾 has none');
  });

  test('新约能天使 S2 barrier by holder; element bursts by side', () => {
    assert.deepEqual(names(unit('char_1041_angel2', { statuses: new Set(['angel2:barrier']) })), ['angel2_skill_2_buff_01']);
    assert.deepEqual(names(unit('char_1014_nearl2', { statuses: new Set(['angel2:barrier']) })), ['angel2_skill_2_buff_02']);
    assert.deepEqual(names(unit('char_1014_nearl2', { statuses: new Set(['apoptosisBurst', 'burnBurst', 'erosionDown']) })), ['buff_burn', 'buff_defdown', 'common_darkdamage_debuff']);
    assert.deepEqual(names(enemy(['apoptosisBurst', 'burnBurst', 'erosionDown'], [])), ['common_darkdamage_debuff']);
  });

  test('耀骑士临光 S2: one shield per layer left, one fewer per parry (UnitView.onStatusHit)', async () => {
    const v = unit('char_1014_nearl2', { statuses: new Set(['nearl2:shield']), statusFrom: new Map([['nearl2:shield', { src: null, fx: null, n: 3 }]]) });
    assert.deepEqual(names(v), ['nearl2_skill_02_buff_02', 'nearl2_skill_02_buff_03', 'nearl2_skill_02_buff_04']);
    const { UnitView } = await import('../../public/js/render/units.js');
    UnitView.prototype.onStatusHit.call(v, 'nearl2:shield');
    UnitView.prototype.onStatusHit.call(v, 'nearl2:shield');
    assert.deepEqual(names(v), ['nearl2_skill_02_buff_02']);
  });

  test('sync: buff effects are keyed by bundle/prefab (one per name, as the client) and end with the status; icons off with the layer', () => {
    const v = enemy(['bind'], [['bind', { src: 'mizuki' }]]);
    const calls = [];
    let layer = true;
    const fxGame = {
      statusLayer: () => layer, statusReady: () => true,
      statusOn: (u, b, n, k) => { (u._fxStatusOn ||= new Set()).add(k); calls.push(`on:${k}`); },
      statusOff: (u, k) => { u._fxStatusOn.delete(k); calls.push(`off:${k}`); },
    };
    F.syncStatusFx(new Map([[1, v]]), fxGame, true);
    assert.deepEqual(calls, ['on:mizuki/mizuki_skill_02_buff_02']);
    assert.equal(v._statusIcons, false);
    v.statuses.delete('bind');
    F.syncStatusFx(new Map([[1, v]]), fxGame, true);
    assert.deepEqual(calls.slice(1), ['off:mizuki/mizuki_skill_02_buff_02']);
    v._fxStatusOn.add('golden');   // fxgolden.js's prep glow is not ours to end
    layer = false;
    F.syncStatusFx(new Map([[1, v]]), fxGame, true);
    assert.ok(v._fxStatusOn.has('golden'));
    assert.equal(v._statusIcons, true, 'quality low: the drawn icons stand in');
  });
});


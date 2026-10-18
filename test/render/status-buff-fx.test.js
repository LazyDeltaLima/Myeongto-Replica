// test/render/status-buff-fx.test.js — the official buff effects of statuses (docs/rules/ui.md ⑤ 「버프 이펙트」): the client
// names an effect per buff (`overrideEffectKey`), so a 束缚 / 抵抗 / 禁疗 shows the applier's buff effect or nothing, a kit
// 护盾 its own; the drawn status icons stand in only while the effect layer is off (maintainer decision 2026-10-14).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import * as F from '../../public/js/render/fxstatus.js';
import { statusIconKey } from '../../public/js/render/style.js';

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

  test('talent buffs (2026-10-16): per-applier keys match without their id, a buff standing for two prefabs shows both', () => {
    const e = (k) => ({ info: { defId: 'enemy_1001_bigbo' }, isEnemy: true, alive: true, flags: 0, statuses: new Set([k]) });
    assert.deepEqual(names(e('pasngr:enhance:12')), ['pasngr_beidong_buff_01']);
    assert.deepEqual(names(e('udflow:dot:3')), ['udflow_debuff_01']);
    assert.deepEqual(names(unit('char_4130_mlynar', { statuses: new Set(['agoat2:mist:7', 'inside:ammo:9', 'rosmon:stable']) })), ['agoat2_recover_01', 'inside_buff_01_start', 'rosmon_buff_01_start']);
    assert.deepEqual(names(unit('char_1028_texas2', { statuses: new Set(['texas2:swordplay', 'texas2:recast']) })), ['texas2_buff_01_start', 'texas2_buff_02_start', 'texas2_buff_02_start_02']);
    assert.deepEqual(names(unit('char_1047_halo2', { statuses: new Set(['halo2:t2full']) })), ['halo2_talent_02']);
    assert.deepEqual(names(unit('char_2015_dusk', { statuses: new Set(['dusk:pending']) })), ['dusk_buff_04_start']);
    // at the prefab's own spawn point (fxgame.js playStatus → lifted), and no drawn icon while the layer is off
    for (const k of ['agoat2:mist:7', 'pasngr:enhance:1', 'udflow:dot:1', 'rosmon:stable', 'inside:ammo:9', 'dusk:pending', 'halo2:t2', 'halo2:t2full', 'texas2:swordplay', 'texas2:recast']) {
      const spec = F.KEY_FX[k.replace(/:\d+$/, '')];
      for (const s of Array.isArray(spec[0]) ? spec : [spec]) assert.equal(s[2], F.OWN, k);
      assert.equal(statusIconKey(k), null, `${k}: no icon`);
    }
  });

  test('新约能天使 S2 barrier by holder; element bursts by side', () => {
    assert.deepEqual(names(unit('char_1041_angel2', { statuses: new Set(['angel2:barrier']) })), ['angel2_skill_2_buff_01']);
    assert.deepEqual(names(unit('char_1014_nearl2', { statuses: new Set(['angel2:barrier']) })), ['angel2_skill_2_buff_02']);
    assert.deepEqual(names(unit('char_1014_nearl2', { statuses: new Set(['apoptosisBurst', 'burnBurst', 'erosionDown']) })), ['buff_burn', 'buff_defdown', 'common_darkdamage_debuff']);
    assert.deepEqual(names(enemy(['apoptosisBurst', 'burnBurst', 'erosionDown'], [])), ['common_darkdamage_debuff']);
  });

  test('战场#06 沙尘暴: an operator in the wind wears map_desert_03_<the side it comes from> and buff_desert_01, an enemy nothing', () => {
    const op = (fx) => unit('char_002_amiya', { statuses: new Set(['terrain:sandstorm']), statusFrom: new Map([['terrain:sandstorm', { src: null, fx, n: 0 }]]) });
    assert.deepEqual(names(op('DOWN')), ['buff_desert_01', 'map_desert_03_up'], 'the m06 storm blows DOWN');
    assert.deepEqual(names(op('RIGHT')), ['buff_desert_01', 'map_desert_03_left']);
    for (const s of F.wantedStatusFx(op('DOWN')).values()) assert.equal(s[2], F.OWN, `${s[1]} at its own spawn point`);
    // sand_storm[enemy]'s slow_down names no effect: not the 'slow' fallback
    assert.deepEqual(names(enemy(['terrain:sandstormSlow'], [])), []);
  });

  test('耀骑士临光 S2: one shield per layer left, one fewer per parry (UnitView.onStatusHit)', async () => {
    const v = unit('char_1014_nearl2', { statuses: new Set(['nearl2:shield']), statusFrom: new Map([['nearl2:shield', { src: null, fx: null, n: 3 }]]) });
    assert.deepEqual(names(v), ['nearl2_skill_02_buff_02', 'nearl2_skill_02_buff_03', 'nearl2_skill_02_buff_04']);
    const { UnitView } = await import('../../public/js/render/units.js');
    UnitView.prototype.onStatusHit.call(v, 'nearl2:shield');
    UnitView.prototype.onStatusHit.call(v, 'nearl2:shield');
    assert.deepEqual(names(v), ['nearl2_skill_02_buff_02']);
  });

  test("泥岩's layers: bottom _03_start, then _02_, top _01_ — set by fx 'stacks' (onStatusCount), one fewer per parry", async () => {
    const { UnitView } = await import('../../public/js/render/units.js');
    const v = unit('char_311_mudrok', { statuses: new Set(['mudrok:layers']), statusFrom: new Map([['mudrok:layers', { src: null, fx: null, n: 1 }]]) });
    assert.deepEqual(names(v), ['mudrok_buff_03_start']);
    UnitView.prototype.onStatusCount.call(v, 'mudrok:layers', 3);
    assert.deepEqual(names(v), ['mudrok_buff_01_start', 'mudrok_buff_02_start', 'mudrok_buff_03_start']);
    UnitView.prototype.onStatusHit.call(v, 'mudrok:layers');
    assert.deepEqual(names(v), ['mudrok_buff_02_start', 'mudrok_buff_03_start'], 'the top one breaks first');
    // a count for a status the view does not have is dropped
    UnitView.prototype.onStatusCount.call(v, 'other', 2);
    assert.equal(v.statusFrom.has('other'), false);
  });

  test("卡涅利安's S3 mark: [part] from 1 stack, [full] added at 5", async () => {
    const { UnitView } = await import('../../public/js/render/units.js');
    const e = enemy(['billro:mark'], [['billro:mark', { src: 'billro', fx: null, n: 0 }]]);
    assert.deepEqual(names(e), ['billro_skill_03_buff_03_01'], 'no count yet: one stack');
    UnitView.prototype.onStatusCount.call(e, 'billro:mark', 4);
    assert.deepEqual(names(e), ['billro_skill_03_buff_03_01']);
    UnitView.prototype.onStatusCount.call(e, 'billro:mark', 5);
    assert.deepEqual(names(e), ['billro_skill_03_buff_03_01', 'billro_skill_03_buff_03_02']);
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


// 2026-10-14 (maintainer report, YouTube captures of 伊内丝's / 卡涅利安's bind): a status effect's sortingOrder < 0
// renderers are behind the model (render/fxgame.js playStatus splits 'backOnly' at 'high'), the rest stays in front
describe('status effects: sortingOrder < 0 behind the unit', () => {
  const mat = { shader: 'Torappu/Particles/Additive', tex: {}, floats: {}, colors: {} };
  const node = (name, parent, extra = {}) => ({ name, parent, active: true, pos: [0, 0, 0], rot: [0, 0, 0, 1], scale: [1, 1, 1], ...extra });
  const k = (s) => ({ m: 0, s });
  const ps = (order) => ({ dur: 1, loop: true, delay: k(0), speedMul: 1, space: 0, scaling: 1, prewarm: false, life: k(1), speed: k(0), color: { m: 0, a: [1, 1, 1, 1] },
    size: k(1), rot: k(0), max: 1, gravity: k(0), flipRot: 0, rate: k(1), bursts: [], mods: {},
    render: { mode: 0, mesh: null, mat: 'm', lengthScale: 2, velScale: 0, align: 2, pivot: [0, 0, 0], order, fudge: 0, maxSize: 2, streams: [0, 1, 3, 4] } });
  const def = (orders) => ({ name: 'x', duration: 4, materials: { m: mat }, clips: [], geoms: {}, lib: null,
    nodes: [node('x', -1), ...orders.map((o, i) => node(`p${i}`, 0, { pos: [0, 0.609, 0.152], ps: ps(o) }))] });

  test("FxInstance split 'backOnly': only order < 0 on FX_BACK — order 0 stays in front even behind the unit (the 冻结 block)", async () => {
    const fxp = await import('../../public/js/render/fxplayer.js');
    const F2 = 1 << fxp.FX_FRONT, B = 1 << fxp.FX_BACK;
    const layers = (split) => { const i = new fxp.FxInstance(def([-1, 0, 7]), { quality: 'high', split }); const m = i.systems.map((s) => s.mesh.layers.mask); i.dispose(); return m; };
    assert.deepEqual(layers('backOnly'), [B, F2, F2]);
    assert.deepEqual(layers(true), [B, B, F2], 'a caster effect: order 0 behind the unit stays back (unchanged)');
    assert.equal(fxp.hasBackOrder(def([0, 7])), false);
    assert.equal(fxp.hasBackOrder(def([-1, 0])), true);
  });

  test('the bind prefabs: 伊内丝 glow and 卡涅利安 sand planes behind, their lines / strands in front', async (t) => {
    const fs = await import('node:fs');
    const fxp = await import('../../public/js/render/fxplayer.js');
    const load = (k) => { const f = new URL(`../../public/assets/local/fx/${k}.json`, import.meta.url); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
    const ines = load('ines/ines_imprison_01'), billro = load('billro/billro_skill_02_buff_03');
    if (!ines || !billro) return t.skip('effects not extracted');
    const back = (d) => d.nodes.filter((n) => [n.mesh, n.ps?.render].some((r) => (r?.order || 0) < 0)).map((n) => n.name);
    assert.ok(fxp.hasBackOrder(ines) && fxp.hasBackOrder(billro));
    assert.deepEqual(back(ines), ['glow_01 (3)', 'bg_01'], 'bg_01: a built-in Quad (order -5)');
    assert.deepEqual(back(billro), ['plane01 (6)', 'plane01_2', 'baoshan2']);
    assert.equal(fxp.hasBackOrder(load('buff/buff_sleep') || { nodes: [] }), false, 'no back renderer: not split');
    assert.ok(fxp.hasBackOrder(load('mizuki/mizuki_skill_02_buff_02') || { nodes: [{ mesh: { order: -1 } }] }), 'its built-in Quads an / bg (order -1)');
  });
});

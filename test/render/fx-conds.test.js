// test/render/fx-conds.test.js — the binding rows behind conditions (묶음 K3, docs/rules/fx.md 「바인딩 표」 「조건 뒤 행」):
// render/fx/conds.js judges a row's conditions in the state a plan or a status spec gives, and the entries that moved from
// hand names to their client key pick what the hand tables picked (the effect event golden covers the moments the corpus
// reaches; this pins every branch). The keys' plays come from the tables on disk (test/helpers/fxBindings.js keyPlays).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, whenPlays } from '../../public/js/render/fx/conds.js';
import { KIT_OFFICIAL, kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { wantedStatusFx, STATUS_FX, SOURCE_FX, KEY_FX, STACK_FX } from '../../public/js/render/fxstatus.js';
import { keyPlays, planTpls } from '../helpers/fxBindings.js';

const P = keyPlays();
const none = new Set();

test('judge: the direction, the skill, the mode, stack counts, buffs held; null when the state cannot tell', () => {
  assert.equal(judge('CheckCharacterDefaultDirection(UP)', { back: true }, none), true);
  assert.equal(judge('!CheckCharacterDefaultDirection(UP)', { back: false }, none), true);
  assert.equal(judge('CheckCharacterDefaultDirection(DOWN)', { back: false }, none), null, 'only UP is told');
  assert.equal(judge('CheckCharacterDefaultDirection(UP)', {}, none), null);
  assert.equal(judge('SwitchDirection(RIGHT)', { dir: 'RIGHT' }, none), true);
  assert.equal(judge('CheckSkillIndex(1)', { skill: 1 }, none), true);
  assert.equal(judge('!CheckUnitCurrentMode(1)', { mode: 2 }, none), true);
  const s = { stacks: { 'a[atk]': 3 }, bb: { max_stack_cnt: 3 } };
  assert.equal(judge('FilterByBuffStackCount(GE @max_stack_cnt a[atk])', s, none), true);
  assert.equal(judge('FilterByBuffStackCount(EQUALS @max_stack_cnt a[atk])', s, none), true);
  assert.equal(judge('!FilterByBuffStackCount(GE 2 a[atk])', s, none), false);
  assert.equal(judge('FilterByBuffStackCount(GE @mid_stack_cnt a[atk])', s, none), null, 'an unknown bound');
  assert.equal(judge('!FilterByBuffStackCount(GE @mid_stack_cnt a[atk])', s, none), null, 'not true either');
  assert.equal(judge('FilterByBuffStackCount(GE 1 b)', s, none), null, 'an uncounted buff');
  assert.equal(judge('CheckContainsBuff(x|y)', { buffs: [] }, new Set(['y'])), true);
  assert.equal(judge('CheckContainsBuff(x&y)', { buffs: [] }, new Set(['y'])), false);
  assert.equal(judge('!CheckContainsBuff(x)', { buffs: [] }, none), true, 'a buff the state does not name is not held');
  assert.equal(judge('CheckContainsBuff(x)', {}, none), null, 'no buff list: cannot tell');
  assert.equal(judge('Dice', {}, none), null);
  assert.equal(judge('Dice', { all: true }, none), true);
  assert.equal(judge('!Dice', { all: true }, none), true, 'the event stands for each condition as written');
});

test('whenPlays: a kept buff from any count up to now, the buffs it creates for the next rows, the counted buff itself', () => {
  const k = { when: [
    { role: 'held', n: 'part', b: 'm[part]', if: ['!FilterByBuffStackCount(GE 5 c)', 'FilterByBuffStackCount(GE 1 c)'] },
    { role: 'held', n: 'full', b: 'm[full]', if: ['FilterByBuffStackCount(GE 5 c)'] },
    { role: 'held', n: 'next', b: 'm[next]', if: ['CheckContainsBuff(m[full])'] },
    { role: 'held', n: 'own', b: 'c', if: ['FilterDamageModifer'] },
    { role: 'once', n: 'hit', if: ['!FilterByBuffStackCount(GE 5 c)'] },
  ] };
  const at = (n) => whenPlays(k, { stacks: { c: n }, buffs: [] }).map((r) => r.n).sort();
  assert.deepEqual(at(0), ['hit']);
  assert.deepEqual(at(1), ['hit', 'own', 'part']);
  assert.deepEqual(at(6), ['full', 'next', 'own', 'part'], '[part] stays (created at 1), a once row looks at the count now');
  assert.deepEqual(whenPlays(k, null), []);
});

/** The prefab names of a kit plan's plays (kitOfficialPlan with the plays on disk). */
const planNames = (ev, bundle, o, c = {}) => (kitOfficialPlan(ev, { id: 1, x: 0, y: 0, tgt: 2, ...o }, bundle, { ...c, plays: P })?.play || []).map((p) => p.n).sort();
const has = (...keys) => keys.every((k) => P.keys[k]);

test('号角 S2 / S3 过载: _back when deployed facing UP, else _front (CheckCharacterDefaultDirection)', { skip: !has('horn_s_2[overload_switch_effect]', 'horn_s_3[overload_switch_effect]') }, () => {
  assert.deepEqual(planNames('overload', 'horn', {}, { skill: 1, back: false }), ['horn_skill_02_buff_03_front']);
  assert.deepEqual(planNames('overload', 'horn', {}, { skill: 1, back: true }), ['horn_skill_02_buff_03_back']);
  assert.deepEqual(planNames('overload', 'horn', {}, { skill: 2, back: false }), ['horn_skill_03_buff_02_03_front']);
  assert.deepEqual(planNames('overload', 'horn', {}, { skill: 2, back: true }), ['horn_skill_03_buff_02_03_back']);
  assert.equal(kitOfficialPlan('overload', { id: 1 }, 'horn', { skill: 0, plays: P }), null);
});

test('佩佩 S3: the range effect by her stacks before the attack (≥ max _03, ≥ 2 _02, else _01)', { skip: !has('pepe_s_3_fx') }, () => {
  const lv = (n, max) => planNames('stacks', 'pepe', { n, max });
  assert.deepEqual(lv(0, 4), ['pepe_skill_03_hit_range_01']);
  assert.deepEqual(lv(1, 4), ['pepe_skill_03_hit_range_01']);
  assert.deepEqual(lv(2, 4), ['pepe_skill_03_hit_range_02']);
  assert.deepEqual(lv(3, 4), ['pepe_skill_03_hit_range_02']);
  assert.deepEqual(lv(4, 4), ['pepe_skill_03_hit_range_03']);
  const p = kitOfficialPlan('stacks', { id: 1, tgt: 2, n: 4, max: 4 }, 'pepe', { plays: P }).play;
  assert.ok(p.every((x) => x.on === 'tgt' && x.life === 'once' && !('when' in x)), 'on the target, once, no state left on the play');
});

test('the events that stand for their key\'s conditions: 寒芒克洛丝 S2, 烛煌 T2, 妮芙 T1; 凯尔希·思衡托 S3 mark; 缪尔赛思 copy', { skip: !has('kroos2_s_2[warming_counter]', 'blaze2_t_2', 'nymph_t_1[listener]', 'kalts2_s_3[indicator_fx]', 'mlyss_wtrman_switch_range_trigger') }, () => {
  assert.deepEqual(planNames('quadShot', 'kroos2', {}), ['kroos2_skill_02_buff_01', 'kroos2_skill_02_buff_02', 'kroos2_skill_02_buff_03']);
  const down = kitOfficialPlan('downed', { id: 1 }, 'blaze2', { plays: P });
  assert.deepEqual(down.play.map((p) => p.n).sort(), ['blaze2_revive_buff', 'blaze2_revive_buff_03']);
  assert.ok(down.pass && down.play.every((p) => p.life === 'tag' && p.tag === 'blazeDown' && p.leave));
  const soul = kitOfficialPlan('soul', { id: 4, t: 3 }, 'nymph', { plays: P }).play;
  assert.deepEqual(soul.map((p) => [p.n, p.on, p.life]), [['nymph_talent_buff_01', 'id', 3]]);
  const mark = kitOfficialPlan('kalts2Mark', { id: 1, ids: [6], off: [7] }, 'kalts2', { plays: P }).play;
  assert.deepEqual(mark, [{ slot: 'mark7', off: true }, { unit: 6, slot: 'mark6', n: 'kalts2_skill_03_indicator_head_01' }]);
  const copy = (mode) => kitOfficialPlan('copy', { id: 5, by: 1, mode }, 'mlyss', { plays: P }).play.map((p) => [p.n, p.bundle, p.on, p.life]);
  assert.deepEqual(copy('Range'), [['token_10030_mlyss_wtrman_c1_to_c3', 'mlyss_token', 'id', 'once']]);
  assert.deepEqual(copy('Melee'), [['token_10030_mlyss_wtrman_c1_to_c2', 'mlyss_token', 'id', 'once']]);
});

/** The `bundle/prefab` effects a unit with one status `k` (its count info `from`) shows. */
const shown = (k, from = null, extra = {}) => [...wantedStatusFx({ statuses: [k], statusFrom: new Map([[k, from]]), ...extra }, new Map(), null, P).values()]
  .map((s) => `${s[0]}/${s[1]}`).sort();

test('STACK_FX by the key\'s rows: the prefabs at each count (夕, 洛洛, 阿斯卡纶, 卡涅利安 mark, 玛恩纳)', { skip: !has('dusk_t_1', 'rockr_t_1', 'ascln_t_1', 'billro_s_3[mark_effect]', 'mlynar_tr') }, () => {
  assert.deepEqual(shown('dusk:realm', { n: 1, max: 15 }), ['dusk/dusk_buff_03_start']);
  assert.deepEqual(shown('dusk:realm', { n: 15, max: 15 }), ['dusk/dusk_buff_03_start', 'dusk/dusk_buff_03_start_02']);
  assert.deepEqual(shown('rockr:rock', { n: 2, max: 3 }), []);
  assert.deepEqual(shown('rockr:rock', { n: 3, max: 3 }), ['rockr/rockr_buff_01']);
  assert.deepEqual(shown('ascln:judg:7', { n: 1, max: 3 }), ['ascln/ascln_buff_01']);
  assert.deepEqual(shown('ascln:judg:7', { n: 3, max: 3 }), ['ascln/ascln_buff_01', 'ascln/ascln_buff_02']);
  assert.deepEqual(shown('billro:mark', { n: 1 }), ['billro/billro_skill_03_buff_03_01']);
  assert.deepEqual(shown('billro:mark', { n: 5 }), ['billro/billro_skill_03_buff_03_01', 'billro/billro_skill_03_buff_03_02'], '[part] stays');
  const ramp = (n, mid) => shown('trait:libratorRamp', { n, max: 40, ...(mid ? { mid } : {}) }).map((x) => x.slice(-2));
  assert.deepEqual(ramp(1, 20), ['01']);
  assert.deepEqual(ramp(20, 20), ['01', '02']);
  assert.deepEqual(ramp(40, 20), ['01', '02', '03']);
  assert.deepEqual(ramp(40, 0), ['01'], 'no mid_stack_cnt: neither [b] nor [c] (they need [b])');
  const [spec] = wantedStatusFx({ statuses: ['billro:mark'], statusFrom: new Map([['billro:mark', { n: 1 }]]) }, new Map(), null, P).values();
  assert.equal(spec[2], 1.1, 'at the head');
});

test('status specs whose buff stands for its key\'s conditions', { skip: !has('chen3_t2[evade]', 'papyrs_t_1[shield_core]', 'reed2_t_1', 'char_lemuen_range_aim') }, () => {
  assert.deepEqual(shown('chen3:evade'), ['chen3/chen3_Shield_buff_01']);
  assert.deepEqual(shown('tippi:evade'), ['tippi/tippi_buff_01']);
  assert.deepEqual(shown('papyrs:shield'), ['papyrs/papyrs_talent_01']);
  assert.deepEqual(shown('pasngr:enhance'), ['pasngr/pasngr_beidong_buff_01']);
  assert.deepEqual(shown('halo2:t2full'), ['halo2/halo2_talent_02']);
  assert.deepEqual(shown('bind', { src: 'ines' }, { isEnemy: true }), ['ines/ines_imprison_01']);
  assert.deepEqual(shown('bind', { src: 'mlyss' }, { isEnemy: true }), ['mlyss_token/token_10030_mlyss_wtrman_c3_debuff_01']);
  assert.deepEqual(shown('reed2:scorch', { src: 'reed2' }), ['reed2/reed2_debuff_01']);
  assert.deepEqual(shown('lemuen:wanted'), ['lemuen/lemuen_talent_buff_01']);
  const [w] = wantedStatusFx({ statuses: ['lemuen:wanted'] }, new Map(), null, P).values();
  assert.deepEqual(w.slice(2), [1.1, 2.0], 'at the head, held at 2 s');
});

test('`all` never picks between prefabs: the key\'s conditional rows share one condition set or one prefab', () => {
  const uses = [];
  for (const [ev, by] of Object.entries(KIT_OFFICIAL)) for (const [b, fn] of Object.entries(by)) {
    for (const k of planTpls(fn)) {
      const src = fn.toString();
      if (/when: ALL/.test(src)) uses.push([`${ev}.${b}`, k]);
    }
  }
  const walk = (v, at) => {
    if (Array.isArray(v) && v[1]?.when?.all) uses.push([at, v[1].tpl]);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  for (const [name, t] of Object.entries({ STATUS_FX, SOURCE_FX, KEY_FX, STACK_FX })) walk(t, name);
  assert.ok(uses.length >= 12, `${uses.length} uses`);
  for (const [at, k] of uses) {
    const w = P.keys[k]?.when || [];
    const conds = new Set(w.map((r) => JSON.stringify(r.if))), names = new Set(w.map((r) => r.n));
    assert.ok(conds.size <= 1 || names.size <= 1, `${at}: ${k} picks between ${[...names].join(' / ')}`);
  }
});

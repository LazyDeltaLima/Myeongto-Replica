// test/render/kit-named-keys.test.js — a client key a kit names plays without a hand table row (docs/rules/fx.md 「클라 키로 재생」):
// a 'hit' moment (kitofficial.js momentPlan), a status named after its key (fxstatus.js namedSpec), both from
// tools/build-fx-plays.mjs (`moment`, `b`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPlays, kitNamedKeys, momentOf, bindingRows } from '../../tools/build-fx-plays.mjs';
import { KIT_OFFICIAL, kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
import { KEY_FX, wantedStatusFx } from '../../public/js/render/fxstatus.js';
import { kitOwned, wiringReport } from '../../tools/fx-wiring-report.mjs';

const row = (key, fx, moment, target, conds = []) => ({ key, src: 'template', moment, kind: 'effect', fx, target, life: '', conds });

test('momentOf: one prefab on the unit hit, or a hand plan', () => {
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_BUFF_TRIGGER', 'BUFF_OWNER')]), 'x_hit');
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_TAKE_DAMAGE', 'MODIFIER_TARGET', ['Dice'])]), 'x_hit', 'its condition is the sim\'s');
  assert.equal(momentOf('a', [row('a', 'x_hit', 'ON_BUFF_START', 'TARGET'), row('a', 'x_hit', 'ON_BUFF_START', 'TARGET', ['Dice'])]), 'x_hit');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), row('a', 'x_2', 'ON_BUFF_START', 'TARGET')]), null, 'two prefabs: the rows leave it open');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_TAKE_DAMAGE', 'BUFF_SOURCE'), row('a', 'x_2', 'ON_TAKE_DAMAGE', 'BUFF_OWNER')]), null, 'one on the giver');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_OUTPUT_MODIFIER', 'BUFF_OWNER')]), null, 'the owner of an output buff deals the hit');
  assert.equal(momentOf('a', [{ ...row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), kind: 'buff' }]), null, 'a buff lasts: no moment');
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'BUFF_OWNER'), { ...row('a', 'x_2', '_buffs', 'OWNER'), kind: 'buff' }]), null, 'the buff has an effect of its own');
  assert.equal(momentOf('b', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET')]), null);
  const index = { bundles: { x: ['x_1'] } };
  assert.equal(momentOf('a', [row('a', 'x_1', 'ON_BUFF_START', 'TARGET'), row('a', 'y_2', 'ON_BUFF_START', 'TARGET')], index), 'x_1', 'prefabs not extracted do not count');
});

test('kitNamedKeys: the kits\' string literals that are keys, not comments, operators or skills', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'kit-keys-'));
  try {
    mkdirSync(path.join(dir, 'ops'));
    writeFileSync(path.join(dir, 'ops', 'op-x.js'), [
      "// 'x_t_1[comment]' in a line comment", "/* 'x_t_1[block]' */",
      "battle.dealDamage(u, t, { moment: 'x_t_1[moment]' }); // 'x_t_1[tail]'",
      "const key = 'x_s_2[buff]', other = 'not_a_row', sk = 'skchr_x_1', c = 'char_1_x', st = 'stun';",
    ].join('\n'));
    const rows = ['x_t_1[comment]', 'x_t_1[block]', 'x_t_1[tail]', 'x_t_1[moment]', 'x_s_2[buff]', 'skchr_x_1', 'char_1_x', 'stun'].map((k) => ({ key: k }));
    assert.deepEqual(kitNamedKeys(rows, dir), ['x_s_2[buff]', 'x_t_1[moment]']);
    const tables = { template: [row('x_t_1[moment]', 'x_hit', 'ON_BUFF_TRIGGER', 'BUFF_OWNER'),
      { ...row('x_s_2[buff]', 'x_buff', '_buffs', 'OWNER'), kind: 'buff', life: 'LIMITED:@duration' }], local: null, index: { bundles: { x: ['x_hit', 'x_buff'] } } };
    const { keys } = buildPlays(tables, dir);
    assert.deepEqual([keys['x_t_1[moment]'].b, keys['x_t_1[moment]'].moment], ['x', 'x_hit']);
    assert.deepEqual([keys['x_s_2[buff]'].b, keys['x_s_2[buff]'].held], ['x', ['x_buff']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const PLAYS = { keys: {
  'x_t_1': { held: [], once: [], end: [], b: 'x', moment: 'x_hit' },
  'x_s_2[buff]': { held: ['x_buff'], once: [], end: [], b: 'x' },
  'x_s_3[cond]': { held: [], once: [], end: [], b: 'x', when: [{ role: 'held', n: 'x_cond', if: ['Dice'] }] },
  'cited_only': { held: ['y_buff'], once: [], end: [] },
} };

test("a 'hit' moment with no rule plays its one prefab on the unit hit; a rule comes first", () => {
  const plan = kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'x', { plays: PLAYS });
  assert.deepEqual(plan.play.map((p) => [p.n, p.on, p.life]), [['x_hit', 'id', 'once']]);
  assert.equal(kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'other', { plays: PLAYS }), null, 'another operator\'s key');
  assert.equal(kitOfficialPlan('hit', { k: 'x_t_1', id: 5 }, 'x', {}), null, 'no plays file');
  assert.equal(kitOfficialPlan('hit', { k: 'cited_only', id: 5 }, 'x', { plays: PLAYS }), null);
  assert.equal(kitOfficialPlan('stacks', { k: 'x_t_1', id: 5 }, 'x', { plays: PLAYS }), null, 'only the moments');
  const hand = kitOfficialPlan('hit', { k: 'bubble_t_1[atk_down]', by: 4, life: 5 }, 'bubble', { plays: { keys: { 'bubble_t_1[atk_down]': { b: 'bubble', moment: 'wrong' } } } });
  assert.deepEqual(hand.play.map((p) => p.n), ['bubble_talent_buff']);
});

test('every moment the rows answer agrees with its hand plan: the rule reads the rows as those plans do', () => {
  const { template, local } = bindingRows();
  const rows = [...template, ...(local || [])];
  const compared = [];
  for (const [bundle, rule] of Object.entries(KIT_OFFICIAL.hit)) {
    for (const k of new Set(rows.map((r) => r.key))) {
      let hand;
      try { hand = rule({ k, id: 1, src: 2, by: 3, life: 5 }, { skill: 0, back: false, foe: false }); } catch { continue; }
      const once = hand?.play?.filter((p) => p.life === 'once') ?? [];
      if (!once.length) continue;
      const auto = momentOf(k, rows);
      if (!auto) continue;
      compared.push(k);
      assert.ok(once.some((p) => p.n === auto), `${bundle} ${k}: the rows give ${auto}, its plan ${once.map((p) => p.n)}`);
      for (const p of once.filter((q) => q.n === auto)) assert.ok(['id', 'op'].includes(p.on), `${k}: on ${p.on}`);
    }
  }
  assert.ok(compared.length >= 10, `compared ${compared.length}`);
});

const held = (statuses, plays = PLAYS) => [...wantedStatusFx({ flags: 0, isEnemy: false, statuses: new Set(statuses), statusFrom: new Map() }, new Map(), null, plays).keys()];

test('a status named after a key a kit names draws what the buff holds, without a table row', () => {
  assert.deepEqual(held(['x_s_2[buff]']), ['x/x_buff']);
  assert.deepEqual(held(['x_s_2[buff]:12']), ['x/x_buff'], 'one per applier');
  assert.deepEqual(held(['x_s_3[cond]']), ['x/x_cond'], 'behind conditions: the sim gave the buff');
  assert.deepEqual(held(['cited_only']), [], 'a key only a hand table cites');
  assert.deepEqual(held(['talent:unknown']), []);
  assert.deepEqual(held(['x_s_2[buff]'], null), [], 'no plays file');
  assert.deepEqual(held(['stun']), ['stun'], 'the catalogue status');
  assert.deepEqual(held(['talent:demetr:means'], { keys: { 'talent:demetr:means': { held: ['other'], b: 'other' }, 'demetr_t1[def_dec_core]': { held: ['demetr_buff_01'], once: [], end: [] } } }), ['demetr/demetr_buff_01'], 'a KEY_FX row comes first');
});

test('a status named after its client key draws what the same buff\'s KEY_FX row draws', () => {
  const plays = buildPlays();
  const compared = [];
  for (const [status, spec] of Object.entries(KEY_FX)) {
    const t = Array.isArray(spec) ? spec[1] : null;
    if (!t?.tpl || spec[2] !== 'own' || !plays.keys[t.tpl]) continue;
    const named = { keys: { ...plays.keys, [t.tpl]: { ...plays.keys[t.tpl], b: spec[0] } } };
    const hand = held([status], named);
    if (!hand.length) continue;
    compared.push(t.tpl);
    assert.deepEqual(held([t.tpl], named).sort(), hand.sort(), `${status} = ${t.tpl}`);
  }
  if (plays.keys['logos_t_2[core]']?.held?.length) assert.ok(compared.length >= 5, `compared ${compared.length}`);
});

test('the wiring report: prefabs nothing reaches, and a drawn prefab the name rule also plays', () => {
  const modes = { char_1_x: { modes: [], skills: [{}, {}, {}] } };
  const tables = { template: [{ key: 'x_s_1', fx: 'x_skill_01_buff', moment: '_buffs', target: 'OWNER', kind: 'buff' }], local: null,
    index: { bundles: { x: ['x_skill_01_buff', 'x_orphan', 'x_emitted', 'x_named'] }, emitted: { x: ['x_emitted'] } } };
  const hand = [{ table: 'KEY_FX', entry: 'x:buff', src: ['x_s_1'], plays: [{ n: 'x_skill_01_buff', life: 'held' }] }];
  const r = wiringReport({ tables, modes, hand, names: new Set(['x_named']) }).x;
  assert.equal(r.char, 'char_1_x');
  assert.deepEqual(r.nameless, ['x_orphan']);
  assert.deepEqual(r.overlap.map((o) => [o.fx, o.skill, o.tables]), [['x_skill_01_buff', 1, ['KEY_FX x:buff']]]);
  const quiet = wiringReport({ tables, modes, hand, owned: new Set(['x_skill_01_buff']) }).x;
  assert.deepEqual(quiet.overlap, [], 'KIT_OWNED silences the name rule');
});

test('the wiring report reads KIT_OWNED from fxgame.js', () => {
  const owned = kitOwned();
  assert.ok(owned.has('yu_skill3_range_01') && owned.has('oxi_buff_03') && owned.size > 50);
  assert.ok(!owned.has('2026-10-11'), 'not its comments');
});

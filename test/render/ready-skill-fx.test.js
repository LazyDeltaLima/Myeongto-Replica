// test/render/ready-skill-fx.test.js — a skill's ReadySkillEffect (docs/rules/fx.md 「스킬 준비 이펙트」): on the operator while the skill can be
// used, gone as it starts (`_stopBeforeCast`) or as it ends, and never drawn from the skill's start by the `_buff` / `_start` name rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { activationEffects, readySpecs } from '../../public/js/render/fxmap.js';
import { readyHolds, wantedStatusFx } from '../../public/js/render/fxstatus.js';
import { KIT_OFFICIAL, tplPlays } from '../../public/js/render/fx/kitofficial.js';
import { UF } from '../../shared/constants.js';

const FX = new URL('../../public/assets/local/fx/', import.meta.url);
const extracted = existsSync(new URL('modes.json', FX)) && existsSync(new URL('index.json', FX));
const readFx = (f) => JSON.parse(readFileSync(new URL(f, FX), 'utf8'));

const view = (o = {}) => ({ flags: 0, sp: 0, spMax: 10, charge: 0, ...o });
const run = (v, stop, steps) => steps.map((s) => { Object.assign(v, s); return readyHolds(v, stop); });

test('`_stopBeforeCast`: on once the SP is full, off as the skill starts, on again at the next full SP', () => {
  assert.deepEqual(run(view(), true, [{ sp: 5 }, { sp: 10 }, { sp: 0, flags: UF.SKILL }, { sp: 0, flags: 0 }, { sp: 10 }]),
    [false, true, false, false, true]);
});

test('without it: on through the skill, off as the skill ends', () => {
  assert.deepEqual(run(view(), false, [{ sp: 10 }, { sp: 3, flags: UF.SKILL }, { sp: 1, flags: UF.SKILL }, { sp: 0, flags: 0 }]),
    [true, true, true, false]);
});

test('a full SP bar while a timed skill runs is not «ready»: the skill is using it', () => {
  assert.equal(readyHolds(view({ sp: 10, flags: UF.SKILL }), true), false);
});

test('a stored charge shows it though the SP bar refills from 0, also through a skill spending another charge', () => {
  assert.deepEqual(run(view(), true, [{ sp: 2, charge: 1 }, { sp: 2, charge: 1, flags: UF.SKILL }, { sp: 2, charge: 0, flags: 0 }]), [true, true, false]);
});

test('not created in an abnormal state; created before one, it stays (the client looks only until it has created them)', () => {
  for (const bad of [UF.STUNNED, UF.FROZEN, UF.SLEEP]) {
    assert.deepEqual(run(view(), true, [{ sp: 10, flags: bad }, { sp: 10, flags: 0 }]), [false, true], 'waits for it to end');
    assert.deepEqual(run(view(), true, [{ sp: 10, flags: 0 }, { sp: 10, flags: bad }]), [true, true], 'stays');
  }
});

test('readySpecs: the operator\'s bundle first, another operator\'s by the name, nothing unextracted', () => {
  const bundles = { ju: ['ju_a'], totter: ['totter_b'] };
  const r = readySpecs({ fx: ['ju_a', 'totter_b', 'totter_c', 'nope_d'], stop: 1 }, 'ju', bundles);
  assert.equal(r.stop, true);
  assert.deepEqual(r.specs.map(([k]) => k), ['ju/ju_a', 'totter/totter_b']);
  assert.deepEqual(r.specs[1][1], ['totter', 'totter_b', 'own']);
  assert.equal(readySpecs({ fx: ['nope_d'], stop: 0 }, 'ju', bundles), null);
  assert.equal(readySpecs(undefined, 'ju', bundles), null);
});

test('wantedStatusFx shows them on an operator only, and asks nothing of an enemy', () => {
  const ready = { stop: true, specs: [['ju/ju_a', ['ju', 'ju_a', 'own']]] };
  let asked = 0;
  const of = () => { asked++; return ready; };
  assert.deepEqual([...wantedStatusFx(view({ sp: 10 }), new Map(), null, null, of).keys()], ['ju/ju_a']);
  assert.deepEqual([...wantedStatusFx(view({ sp: 3 }), new Map(), null, null, of).keys()], []);
  assert.equal(asked, 2);
  assert.deepEqual([...wantedStatusFx(view({ sp: 10, isEnemy: true }), new Map(), null, null, of).keys()], []);
  assert.equal(asked, 2);
  assert.deepEqual([...wantedStatusFx(view({ sp: 10 }), new Map()).keys()], [], 'no reader: as before');
});

test('the name rules leave a ready prefab to it: a `_buff` and a `_start` name', () => {
  const pre = ['x_skill_01_buff_01', 'x_skill_01_buff_02', 'x_skill_01_start_01'];
  const plain = activationEffects({ skills: [{}] }, pre, 0);
  assert.ok(plain.loops.includes('x_skill_01_buff_01') && plain.start.includes('x_skill_01_start_01'), 'the name rules would take both');
  const a = activationEffects({ skills: [{ ready: { fx: ['x_skill_01_buff_01', 'x_skill_01_start_01'], stop: 0 } }] }, pre, 0);
  assert.deepEqual(a.loops, ['x_skill_01_buff_02']);
  assert.deepEqual(a.start, []);
});

// the client's skills with one, read from its skill prefabs (a class no binding row tells apart); a new one has to be looked at
const READY = Object.freeze({
  char_4051_akkord: 0, char_4065_judge: 1, char_4098_vvana: 1, char_4132_ascln: 0, char_4163_rosesa: 0, char_4221_ju: 1, char_446_aroma: 1,
});

test('every operator with a ReadySkillEffect has it in modes.json, extracted, and no activation draws it', { skip: !extracted && 'needs the extracted effects' }, () => {
  const modes = readFx('modes.json'), { bundles } = readFx('index.json');
  const got = Object.fromEntries(Object.entries(modes).flatMap(([id, m]) => (m.skills || []).filter((s) => s?.ready).map((s) => [id, s.ready.stop])));
  assert.deepEqual(got, { ...READY });   // not empty: the sweep below goes over them
  for (const id of Object.keys(READY)) {
    const b = id.replace(/^char_\d+_/, ''), i = modes[id].skills.findIndex((s) => s?.ready), sk = modes[id].skills[i];
    const r = readySpecs(sk.ready, b, bundles);
    assert.equal(r?.specs.length, sk.ready.fx.length, `${id}: all extracted`);
    const a = activationEffects(modes[id], bundles[b], i);
    for (const n of sk.ready.fx) assert.ok(!a.loops.includes(n) && !a.start.includes(n), `${id}: ${n} is not the skill's`);
  }
});

test('风絮 S2\'s splash: its projectile\'s trail flies from her target to each unit healed, its hit as it lands', () => {
  const plan = KIT_OFFICIAL.taraxaSplash.taraxa({ id: 1, from: 2, tgt: [3] }, {});
  const [fly] = plan.play.flatMap((p) => tplPlays(p, { keys: { projectile_chr_taraxa_s2_2: { held: [], once: [], end: [], trail: ['trail_02'], hit: ['hit_01'] } } }));
  assert.equal(fly.n, 'trail_02');
  assert.deepEqual([fly.fly, fly.from, fly.to], [5, 'from', 'tgt']);
  assert.deepEqual(fly.hit, ['hit_01']);
});

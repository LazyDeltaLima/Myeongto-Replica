// test/render/kit-marks-fx.test.js — 2026-10-21 (docs/rules/fx.md 「안 나오던 공식 이펙트 메우기 — 묶음 D」): official effects
// no binding played before —
//  - 圣聆初雪 S2's frozen protection point: sbell2_tile_frozen while it stands, sbell2_tile_defrost where it stood as it goes
//    (icetgt_a[effect] overrideEffectKey / ON_OWNER_FINISH);
//  - 凛御银灰 S3's eagle: svash2_skill_03_trail_02 with each attack of the skill (Svash2ProjectileEffectBehaviour);
//  - 琳琅诗怀雅 S3's end: her S3_End mode's casts, coins or not;
//  - 凯尔希·思衡托 S3: teleport_02 on the 待投放 operators, the head marks the selector would pick;
//  - 克莱门莎 S2: her carriage mark _mark_01 → _mark_02 when full, ended at the stop;
//  - 秘术师 (深靛): a store's cast and the held energy (modes.json `charge`), all released by the next attack.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';
// the plays of the kit plans' client keys (tools/build-fx-plays.mjs plays.json) these cases use
import { PLAYS } from '../helpers/fxPlays.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

test('char_modes.py: 深靛\'s ChargableAttackGroup — a held effect per stored energy, the store\'s cast', () => {
  assert.deepEqual(MODES.char_469_indigo.charge, {
    hold: [['indigo_attack_charge_02'], ['indigo_attack_charge_03'], ['indigo_attack_charge_04'], ['indigo_attack_charge_05']],
    cast: ['indigo_attack_charge_01_start'],
  });
});

test('kitofficial: the plans of the frozen point, the S3_End casts, the 待投放 operators and the head marks', () => {
  assert.deepEqual(kitOfficialPlan('summon', { id: 7, src: 1, token: 'token_10058_sbell2_icetgt' }, 'sbell2', { plays: PLAYS }).play,
    [{ on: 'id', life: 'unit', n: 'sbell2_tile_frozen', end: 'sbell2_tile_defrost' }]);
  assert.equal(kitOfficialPlan('summon', { id: 7, src: 1, token: 'token_x' }, 'sbell2'), null);
  assert.deepEqual(kitOfficialPlan('coin', { id: 1, skill: 'swire2_3', targets: [] }, 'swire2', { plays: PLAYS }).play.map((p) => p.n),
    ['swire2_skill_03_range', 'swire2_skill_03_start_03', 'swire2_skill_03_start_03_02'], 'coins or not');
  assert.equal(kitOfficialPlan('coin', { id: 1, n: 2 }, 'swire2'), null, 'a coin gained: nothing');
  assert.deepEqual(kitOfficialPlan('kalts2Mark', { id: 1, ids: [5], off: [4] }, 'kalts2', { plays: PLAYS }).play,
    [{ slot: 'mark4', off: true }, { n: 'kalts2_skill_03_indicator_head_01', unit: 5, slot: 'mark5' }]);
});

const BINDS = { char_469_indigo: { modes: ['Default'], cast: [[]], hit: [[]], trail: [[]], charge: MODES.char_469_indigo.charge } };
const files = {
  '/assets/local/fx/index.json': { bundles: {
    sbell2: ['sbell2_tile_frozen', 'sbell2_tile_defrost'],
    svash2: ['svash2_skill_03_trail_02'],
    swire2: ['swire2_skill_03_start_03', 'swire2_skill_03_start_03_02', 'swire2_skill_03_range'],
    kalts2: ['kalts2_skill_03_teleport_02', 'kalts2_skill_03_indicator_head_01'],
    clemnt: ['clemnt_skill_02_bullet_01', 'clemnt_skill_02_bullet_range_01', 'clemnt_skill_02_mark_01', 'clemnt_skill_02_mark_02'],
    indigo: ['indigo_attack_charge_01_start', 'indigo_attack_charge_02', 'indigo_attack_charge_03', 'indigo_attack_charge_04', 'indigo_attack_charge_05'],
  } },
  '/assets/local/fx/modes.json': BINDS,
  '/assets/local/fx/plays.json': PLAYS,
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const unit = (id, side, defId, x = 0, skillIndex = 0, kind = 'op') => ({ id, x, y: 0, alive: true, info: { id, side, defId, skillIndex, kind } });
    const take = () => seen.splice(0).map((p) => `${p.kind}:${p.names.join('+')}${p.on != null ? `@${p.on}` : ''}`);
    await run({ layer, unit, take });
  } finally { globalThis.fetch = fetch0; }
}

test('圣聆初雪 S2: the frozen point thaws where it stood', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1046_sbell2')], [7, unit(7, 'ally', 'token_10058_sbell2_icetgt', 3, 0, 'token')]]);
  layer.onEvent(['fx', 'summon', 3, 0, { x: 3, y: 0, id: 7, src: 1, token: 'token_10058_sbell2_icetgt' }], views);
  assert.deepEqual(take(), ['spawn:sbell2_tile_frozen@7']);
  layer.onEvent(['die', 7, 'killed'], views);
  assert.deepEqual(take().filter((p) => p.includes('sbell2')), ['spawn:sbell2_tile_defrost']);
  layer.onEvent(['die', 7, 'killed'], views);
  assert.deepEqual(take().filter((p) => p.includes('sbell2')), [], 'once');
}));

test('凛御银灰: the eagle flies with each attack of his S3 only', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1045_svash2', 0, 2)], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  layer.onEvent(['atk', 1, 9, 'melee'], views);
  assert.ok(!take().some((p) => p.includes('trail_02')), 'no skill: no eagle');
  views.get(1)._fxSkillOn = true;
  layer.onEvent(['atk', 1, 9, 'melee'], views);
  assert.ok(take().includes('spawn:svash2_skill_03_trail_02@1'));
  views.get(1).info.skillIndex = 1;
  layer.onEvent(['atk', 1, 9, 'melee'], views);
  assert.ok(!take().some((p) => p.includes('trail_02')), 'S2: none');
}));

test('琳琅诗怀雅 S3\'s end: the S3_End casts on her even without coins', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1033_swire2')]]);
  layer.onEvent(['fx', 'coin', 0, 0, { id: 1, n: 0, spent: 0, skill: 'swire2_3', targets: [] }], views);
  await settle();
  assert.deepEqual(take(), ['skillStart:swire2_skill_03_range+swire2_skill_03_start_03+swire2_skill_03_start_03_02']);
}));

test('凯尔希·思衡托 S3: teleport_02 on each 待投放 operator; the head marks on and off', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_1052_kalts2', 0, 2)], [4, unit(4, 'ally', 'char_x', 1)], [5, unit(5, 'ally', 'char_y', 1)]]);
  layer.onEvent(['fx', 'kalts2Mark', 0, 0, { id: 1, ids: [4, 5], off: [] }], views);
  assert.deepEqual(take().sort(), ['spawn:kalts2_skill_03_indicator_head_01@4', 'spawn:kalts2_skill_03_indicator_head_01@5']);
  layer.onEvent(['fx', 'kalts2Mark', 0, 0, { id: 1, ids: [4, 5], off: [] }], views);
  assert.deepEqual(take(), [], 'kept');
  layer.onEvent(['fx', 'kalts2Takeoff', 0, 0, { id: 1, signal: 'takeoff', t: 1, picks: [4, 5] }], views);
  assert.deepEqual(take().sort(), ['spawn:kalts2_skill_03_teleport_02@4', 'spawn:kalts2_skill_03_teleport_02@5']);
  layer.onEvent(['fx', 'kalts2Mark', 0, 0, { id: 1, ids: [], off: [4, 5] }], views);
  layer.onEvent(['fx', 'kalts2Mark', 0, 0, { id: 1, ids: [5], off: [] }], views);
  assert.deepEqual(take(), ['spawn:kalts2_skill_03_indicator_head_01@5'], 'marked again after it was off');
}));

test('克莱门莎 S2: _mark_01 with the carriage, _mark_02 once full', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_4231_clemnt')]]);
  layer.onEvent(['fx', 'anchor', 3, 0, { x: 3, y: 0, fromX: 0, fromY: 0, id: 1, dur: 1 }], views);
  assert.deepEqual(take(), ['spawn:clemnt_skill_02_bullet_01', 'spawn:clemnt_skill_02_mark_01@1']);
  layer.update(0.3);
  layer.onEvent(['fx', 'cabinFull', 1, 0, { x: 1, y: 0, id: 1 }], views);
  assert.deepEqual(take(), ['spawn:clemnt_skill_02_mark_02@1']);
  layer.update(0.8);
  layer.onEvent(['fx', 'tide', 3, 0, { x: 3, y: 0, r: 1.5, dur: 5, id: 1 }], views);
  assert.deepEqual(take(), ['spawn:clemnt_skill_02_bullet_range_01']);
}));

test('深靛: a store casts and holds the energy of its index; the release ends them, the next store starts again at the first', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'ally', 'char_469_indigo')], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
  for (const n of [1, 2]) layer.onEvent(['fx', 'mysticStore', 0, 0, { id: 1, signal: 'store', n }], views);
  await settle();
  assert.deepEqual(take(), ['attackStart:indigo_attack_charge_01_start', 'spawn:indigo_attack_charge_02@1',
    'attackStart:indigo_attack_charge_01_start', 'spawn:indigo_attack_charge_03@1']);
  layer.onEvent(['atk', 1, 9, 'arrow'], views);
  take();
  layer.onEvent(['fx', 'mysticStore', 0, 0, { id: 1, signal: 'store', n: 1 }], views);
  await settle();
  assert.deepEqual(take(), ['attackStart:indigo_attack_charge_01_start', 'spawn:indigo_attack_charge_02@1']);
}));

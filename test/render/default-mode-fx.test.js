// test/render/default-mode-fx.test.js — the Default mode's own effects (maintainer decision 2026-10-21; docs/rules/fx.md
// 「기본 모드 attach」): the client attaches a mode's abilities with the mode, so the effects of the buffs they hold and the
// auras they attach (modes.json `attach[0]`) show while the operator stands in her Default mode and end when a skill switches
// her mode. char_modes.py now reads a mode's UnitMode `_generalAbilities` wherever they sit (the 阵法术师 trait buffs) and
// leaves out the buffs an ability hands to its targets (마운틴's buff_weak); fxgame.js defaultModeFx plays them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultModeEffects } from '../../public/js/render/fxmap.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { kitOfficialPlan } from '../../public/js/render/fx/kitofficial.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const at = (id, mode) => MODES[id].attach[MODES[id].modes.indexOf(mode)];

test('extracted: the Default mode attach of every operator that has one', () => {
  const got = Object.fromEntries(Object.entries(MODES).filter(([k, v]) => k !== '$comment' && v.attach?.[0]?.length).map(([k, v]) => [k, v.attach[0]]));
  assert.deepEqual(got, {
    char_1012_skadi2: ['skadi2_buff_01_range'],     // Default/Body/HealAura `_passiveBuffs` skadi2_heal[effect]
    char_344_beewax: ['beewax_buff_01_start'],      // Modes/Default itself: beewax_c_disarmed
    char_388_mint: ['mint_buff_01_range'],          // Default/Talent/1 AuraAbility `_effects`
    char_4013_kjera: ['kjera_token_default'],       // a drone's look (droneIdle)
    char_4040_rockr: ['rockr_token_01'],
    char_4054_malist: ['malist_drone'],
    char_4134_cetsyr: ['cetsyr_buff_01'],           // Default/Body/CommonAbility/Effect cetsyr_common_effect
    char_426_billro: ['billro_beidong_buff_03'],    // Default/Trait_Eff billro_trait_eff
  });
});

test('extracted: 阵法术师 trait buffs off in the skill modes, 卡涅利安 S1_Enhance keeps hers', () => {
  assert.deepEqual(at('char_426_billro', 'S1_Enhance'), ['billro_beidong_buff_03'], 'its _generalAbilities: Trait_Eff only');
  for (const m of ['S1', 'S2', 'S2_Enhance', 'S3', 'S3_Enhance']) assert.ok(!at('char_426_billro', m).includes('billro_beidong_buff_03'), m);
  for (const m of ['S1', 'S2']) assert.deepEqual(at('char_344_beewax', m), [], m);
  assert.ok(!at('char_388_mint', 'S2').includes('mint_buff_01_range'));
});

test('extracted: a buff handed to the attack\'s targets is no attach (마운틴 buff_weak, 深靛 indigo_buff_01_start)', () => {
  for (const id of ['char_264_f12yin', 'char_469_indigo']) {
    for (const list of MODES[id].attach) assert.ok(!list.includes('buff_weak') && !list.includes('indigo_buff_01_start'), id);
    assert.equal(MODES[id].attachFoe, undefined, id);
  }
});

test('defaultModeEffects: attach[0] minus the drones\', the always-on, the enemy-held and the kit-owned ones; extracted only', () => {
  const bind = { modes: ['Default', 'S1'], attach: [['a_aura', 'a_drone', 'a_back', 'a_common', 'a_foe', 'a_kit', 'a_missing'], ['s1_x']],
    funnels: [[{ idle: ['a_drone'], back: ['a_back'] }, { proj: 'p' }], []], common: ['a_common'], attachFoe: [['a_foe'], []] };
  const pre = ['a_aura', 'a_drone', 'a_back', 'a_common', 'a_foe', 'a_kit', 's1_x'];
  assert.deepEqual(defaultModeEffects(bind, pre, new Set(['a_kit'])), ['a_aura']);
  assert.deepEqual(defaultModeEffects(bind, pre), ['a_aura', 'a_kit']);
  assert.deepEqual(defaultModeEffects(null, pre), []);
  assert.deepEqual(defaultModeEffects(bind, null), []);
  // the drone operators: their Default attach is the drones' look, drawn by droneIdle — not twice
  for (const id of ['char_4040_rockr', 'char_4054_malist', 'char_4013_kjera']) assert.deepEqual(defaultModeEffects(MODES[id], MODES[id].attach[0]), [], id);
});

test('卡涅利安 charged S1 (S1_Enhance): the trait look comes back for the skill; not uncharged', () => {
  const names = (o) => (kitOfficialPlan('shell', o, 'billro', { skill: 0 })?.play || []).filter((p) => p.n === 'billro_beidong_buff_03');
  assert.deepEqual(names({ id: 1, charged: 1 }), [{ n: 'billro_beidong_buff_03', on: 'op', life: 'skill' }]);
  assert.deepEqual(names({ id: 1, charged: 0 }), []);
});

const BINDS = Object.fromEntries(['char_388_mint', 'char_426_billro', 'char_344_beewax', 'char_4040_rockr'].map((id) => [id, MODES[id]]));
// an operator whose S1 switches no mode (attackMode −1) and whose S2 does
BINDS.char_9_fake = { modes: ['Default', 'S2'], cast: [[], []], hit: [[], []], trail: [[], []], attach: [['fake_aura'], []] };
const files = {
  '/assets/local/fx/index.json': { bundles: {
    mint: ['mint_buff_01_range', 'mint_skill_01_range'], billro: ['billro_beidong_buff_03'], beewax: ['beewax_buff_01_start'], rockr: ['rockr_token_01'], fake: ['fake_aura'],
  } },
  '/assets/local/fx/modes.json': BINDS,
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
    const unit = (id, defId, skillIndex = 0) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'ally', defId, skillIndex, kind: 'op' } });
    const take = () => seen.splice(0).filter((p) => p.tag === 'mode0').map((p) => `${p.names.join('+')}@${p.by}`);
    await run({ layer, unit, take });
  } finally { globalThis.fetch = fetch0; }
}

test('薄绿: her talent aura on deploy, off for a skill that switches her mode, back at its end', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'char_388_mint', 0)]]);
  layer.onEvent(['deploy', 1], views);
  layer.update(0.1);
  assert.deepEqual(take(), ['mint_buff_01_range@1']);
  layer.onEvent(['skill', 1, 1], views);
  assert.deepEqual(take(), [], 'S1 mode: off');
  layer.onEvent(['skill', 1, 0], views);
  assert.deepEqual(take(), ['mint_buff_01_range@1'], 'Default again');
  layer.onEvent(['skill', 1, 0], views);
  assert.deepEqual(take(), [], 'kept, not restarted');
}));

test('卡涅利安 / 蜜蜡: the trait look while no skill runs', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'char_426_billro', 0)], [2, unit(2, 'char_344_beewax', 1)]]);
  layer.onEvent(['deploy', 1], views);
  layer.onEvent(['deploy', 2], views);
  layer.update(0.1);
  assert.deepEqual(take().sort(), ['beewax_buff_01_start@2', 'billro_beidong_buff_03@1']);
  layer.onEvent(['skill', 2, 1], views);
  layer.onEvent(['skill', 2, 0], views);
  assert.deepEqual(take(), ['beewax_buff_01_start@2']);
}));

test('a skill that switches no mode keeps the Default mode\'s look; 洛洛\'s drone look stays droneIdle\'s', () => withLayer(async ({ layer, unit, take }) => {
  const views = new Map([[1, unit(1, 'char_4040_rockr', 0)], [3, unit(3, 'char_9_fake', 0)]]);
  layer.onEvent(['deploy', 1], views);
  layer.onEvent(['deploy', 3], views);
  layer.update(0.1);
  assert.deepEqual(take(), ['fake_aura@3'], '洛洛: her Default attach is the drones\' (droneIdle), no mode0 entry');
  layer.onEvent(['skill', 3, 1], views);
  layer.onEvent(['skill', 3, 0], views);
  assert.deepEqual(take(), [], 'S1 (no mode): kept through it, not restarted');
  views.get(3).info.skillIndex = 1;
  layer.onEvent(['skill', 3, 1], views);
  assert.deepEqual(take(), [], 'S2 mode: off');
  layer.onEvent(['skill', 3, 0], views);
  assert.deepEqual(take(), ['fake_aura@3']);
  layer.onEvent(['deploy', 3], views);
  layer.update(0.1);
  assert.deepEqual(take(), ['fake_aura@3'], 'a redeploy restarts it');
}));

test('fxgame.js: started on deploy and at each skill on / off; pinned, non-buff entries a mode switch fades', () => {
  assert.match(SRC, /defaultModeFx\(v, true\);/);
  assert.match(SRC, /droneIdle\(v\);[^\n]*\n\s+defaultModeFx\(v\);/);
  assert.match(SRC, /\{ owner: id, buff: false, onCaster: true, until: null, tag: 'mode0', pinned: true \}/);
  assert.match(SRC, /const m = v\._fxSkillOn \? modeNow\(v\) \?\? -1 : 0;/);
  assert.match(SRC, /if \(l\.tag === 'mode0' && l\.owner === id\) l\.inst\.stop\(force\);/);
});

// test/render/common-ability-fx.test.js — an operator's always-on effects (2026-10-16, decompile check): client
// `Unit.AttachCommonAbilities` attaches the prefab root's `_commonAbilities` with the unit, outside its modes; the buffs
// those abilities put on it for good (`lifeTimeType` 2) show their effects for its whole deployment — 新约能天使's wings and
// halo, 引星棘刺's weapon glow. char_modes.py writes them as `common`; fxgame.js plays them on each 'deploy' (alwaysOn) and
// keeps them out of the live-effect cap (liveOverCap `pinned`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commonEffects } from '../../public/js/render/fxmap.js';
import { liveOverCap } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');

test('the extracted always-on effects: the passive INFINITY buffs of the common abilities only', () => {
  const got = Object.fromEntries(Object.entries(MODES).filter(([k, v]) => k !== '$comment' && v.common).map(([k, v]) => [k, v.common]));
  assert.deepEqual(got, {
    char_1039_thorn2: ['thorn2_weapon_buff_01', 'thorn2_weapon_buff_02', 'thorn2_weapon_buff_03', 'thorn2_weapon_buff_04'],
    char_1041_angel2: ['angel2_R_wing_01', 'angel2_R_wing_02', 'angel2_R_wing_03', 'angel2_L_wing_01', 'angel2_L_wing_02', 'angel2_L_wing_03', 'angel2_Halo_01'],
    char_1046_sbell2: ['sbell2_idle'],
    char_2015_dusk: ['dusk_buff_02_start', 'dusk_buff_05_start'],
    char_245_cello: ['cello_common_fx01', 'cello_common_fx03', 'cello_common_fx05'],
    char_4134_cetsyr: ['cetsyr_buff_range_01'],
  });
  // 凯尔希·思衡托's RespawnBorn is a cast (its clip and cast effects), not a passive: its teleport end stays the kit's
  assert.equal(MODES.char_1052_kalts2?.common, undefined);
});

test('commonEffects: extracted prefabs only, minus the kit-owned ones', () => {
  const bind = { common: ['a_wing', 'a_halo', 'a_kit'] };
  assert.deepEqual(commonEffects(bind, ['a_wing', 'a_kit']), ['a_wing', 'a_kit']);
  assert.deepEqual(commonEffects(bind, ['a_wing', 'a_kit'], new Set(['a_kit'])), ['a_wing']);
  assert.deepEqual(commonEffects(null, ['a_wing']), []);
  assert.deepEqual(commonEffects({}, null), []);
});

test('liveOverCap never ends a pinned entry and does not count it', () => {
  const now = 10;
  const pinned = Array.from({ length: 6 }, () => ({ pinned: true, until: null }));
  const lasting = Array.from({ length: 3 }, () => ({ buff: true }));
  const short = Array.from({ length: 3 }, () => ({ until: now + 1 }));
  const list = [...pinned, ...lasting, ...short];
  const out = liveOverCap(list, now, 2, 2);
  assert.equal(out.length, 2);
  assert.ok(out[0] === lasting[0] && out[1] === short[0], 'the oldest unpinned of each kind');
  assert.equal(liveOverCap([...pinned], now, 0, 0).length, 0);
});

test('fxgame.js starts them on deploy as pinned, non-buff entries ended by the unit\'s die', () => {
  assert.match(SRC, /alwaysOn\(v, id\);/);
  // not a `buff` entry: stopBuffs ends those with every skill
  assert.match(SRC, /\{ owner: id, buff: false, onCaster: true, until: null, tag: 'common', pinned: true \}/);
  // a redeploy ends the old ones first
  assert.match(SRC, /l\.tag === 'common' && l\.owner === id\) l\.inst\.stop\(true\)/);
});

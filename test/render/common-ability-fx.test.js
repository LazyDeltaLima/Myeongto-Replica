// test/render/common-ability-fx.test.js — an operator's always-on effects (2026-10-16, official client): client
// `Unit.AttachCommonAbilities` attaches the prefab root's `_commonAbilities` with the unit, outside its modes; the buffs
// those abilities put on it for good (`lifeTimeType` 2) show their effects for its whole deployment — 新约能天使's wings and
// halo, 引星棘刺's weapon glow. char_modes.py writes them as `common`; fxgame.js plays them on each 'deploy' (alwaysOn) and
// keeps them out of the live-effect cap (liveOverCap `pinned`).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { castEnd, commonEffects, TALENT_ALWAYS, skillHeld, skillEdge } from '../../public/js/render/fxmap.js';
import { PLAYS } from '../helpers/fxPlays.js';
import { keyPlays } from '../helpers/fxBindings.js';
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

test('commonEffects: the always-on talents by charId (TALENT_ALWAYS), after the common abilities', () => {
  assert.deepEqual(commonEffects({ common: ['cello_common_fx01'] }, null, null, 'char_245_cello', PLAYS), ['cello_common_fx01', 'cello_buff_01']);
  assert.deepEqual(commonEffects(null, ['flower_buff_01_range'], null, 'char_181_flower', PLAYS), ['flower_buff_01_range']);
  assert.deepEqual(commonEffects(null, [], null, 'char_423_blemsh', PLAYS), [], 'not extracted');
  assert.deepEqual(commonEffects(null, null, null, 'char_245_cello'), [], 'without the plays: none');
  // by the talent's client key (2026-10-23): its held prefabs are the operator's own
  for (const [id, t] of Object.entries(TALENT_ALWAYS)) for (const n of PLAYS.keys[t.tpl]?.held || []) assert.ok(n.startsWith(`${id.replace(/^char_\d+_/, '')}_`), n);
});

test('协律 T1 and the skills\' own template buffs (SKILL_HELD) by client key (2026-10-24, 묶음 S2)', () => {
  const plays = keyPlays();   // template rows: no client-only file needed
  assert.deepEqual(commonEffects(null, null, null, 'char_4051_akkord', plays), ['akkord_buff_01']);
  // 圣约送葬人's every skill, 凯尔希·思衡托 S3, 赤刃明霄陈 S2
  for (const i of [0, 1]) assert.deepEqual(skillHeld('char_1032_excu2', i, null, plays), ['excu2_cherub_buff_01']);
  assert.deepEqual(skillHeld('char_1052_kalts2', 2, null, plays), ['kalts2_skill_03_buff_weapon_01']);
  assert.deepEqual(skillHeld('char_1052_kalts2', 1, null, plays), []);
  assert.deepEqual(skillHeld('char_1050_chen3', 1, null, plays), ['chen3_skill_02_F_buff_02']);
  assert.deepEqual(skillHeld('char_1050_chen3', 1, ['chen3_skill_02_buff_01'], plays), [], 'not extracted');
  assert.deepEqual(skillHeld('char_1050_chen3', 1, null, null), [], 'without the plays: none');
  // the activation's loops take them (fxgame.js activation)
  assert.match(SRC, /skillHeld\(v\?\.info\?\.spine \|\| v\?\.info\?\.defId, skillIdx\(v\), b\.prefabs, plays, faceBack\(v\)\)/);
});

test('圣约送葬人 S3\'s buff by the deploy facing, 伺夜 S3\'s attack-end effect (2026-10-24, 묶음 S7)', () => {
  const plays = keyPlays();   // template rows
  // excu2_s_3[trait]: [effect][f] buff_01 unless deployed facing UP, [effect][b] buff_01_back then — the name rule's front copy is the kit's
  assert.deepEqual(skillHeld('char_1032_excu2', 2, null, plays), ['excu2_cherub_buff_01', 'excu2_skill_03_buff_01']);
  assert.deepEqual(skillHeld('char_1032_excu2', 2, null, plays, true), ['excu2_cherub_buff_01', 'excu2_skill_03_buff_01_back']);
  assert.match(SRC, /KIT_OWNED = new Set\([^;]*'excu2_skill_03_buff_01'\]\)/s);
  // EndAnimEffectEmitter: its S3 mode only, extracted only
  const bind = { modes: ['Default', 'S3'] };
  assert.deepEqual(castEnd('char_427_vigil', bind, 1, null), ['vigil_skill_03_ABC_idle_into']);
  assert.deepEqual(castEnd('char_427_vigil', bind, 0, null), []);
  assert.deepEqual(castEnd('char_427_vigil', bind, 1, ['vigil_skill_03_A_start_01']), [], 'not extracted');
  assert.deepEqual(castEnd('char_1032_excu2', bind, 1, null), []);
  // a fixed frame after the cast's end, unless a new cast began or it was cut
  assert.match(SRC, /castsDelayed\.push\(\{ t: c\.end \+ FIXED_FRAME_S, run: \(\) => \{ if \(v\._fxCast === c && !c\.cut && v\.alive !== false\)/);
  // a right copy listed alone plays as its left / right pair (凯尔希·思衡托 S3, 寒檀 S2: effectsFor skips `_left` names)
  assert.match(SRC, /names\[i\]\.replace\(\/_right\(\?=_\|\$\)\/, '_left'\)/);
});

test('凛御银灰\'s 战鹰: on his arm from deploy (TALENT_ALWAYS `born`), off it at S3\'s start, back at its end (SKILL_EDGE) (2026-10-24, 묶음 S5)', () => {
  const plays = keyPlays();   // template rows
  assert.deepEqual(commonEffects(null, null, null, 'char_1045_svash2', plays), ['svash2_eagle_sit_birth_01']);
  assert.deepEqual(commonEffects(null, ['svash2_birth_01'], null, 'char_1045_svash2', plays), [], 'not extracted');
  assert.deepEqual(skillEdge('char_1045_svash2', 2, 'start', null, plays), ['svash2_eagle_flyToHand_01', 'svash2_eagle_sit_showAndHide_01']);
  assert.deepEqual(skillEdge('char_1045_svash2', 2, 'end', null, plays), ['svash2_eagle_sit_01']);
  assert.deepEqual(skillEdge('char_1045_svash2', 1, 'start', null, plays), []);
  assert.deepEqual(skillEdge('char_1045_svash2', 2, 'end', null, null), [], 'without the plays: none');
  // the activation's start takes the start ones; the skill's end plays the end ones as pinned non-buff entries (stopBuffs
  // leaves them, a redeploy's alwaysOn and the 'die' end them); a FlyToPredefinedLocation prefab flies from spawn too
  assert.match(SRC, /skillEdge\(v\?\.info\?\.spine \|\| v\?\.info\?\.defId, skillIdx\(v\), 'start', b\.prefabs, plays\)/);
  assert.match(SRC, /stopBuffs\(v\.id \?\? v\.info\.id, true\); skillEnd\(v\);/);
  assert.match(SRC, /function skillEnd\(v\)[\s\S]{0,600}tag: 'common', pinned: true/);
  assert.match(SRC, /if \(l && def\.fly\) startFly\(l\);/);
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

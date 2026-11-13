// test/render/summon-attack-fx.test.js — a summon's own attack effects (docs/rules/fx.md 「소환물의 공격 이펙트」): its modes.json
// row (tools/local-extract/char_modes.py token_modes — the token prefab's modes read as an operator's charpack, its skill
// prefabs' effects by its owner's skill index) plays on the operators' attack path, from its owner's `<code>_token` bundle or
// the owner's own; such a bundle plays only what the bindings name. 打字机 (token_10026_bgsnow_subbow) deployed facing down
// holds Default[D] / S3[D] (bgsnow_subbow_direction, bgsnow_subbow_s3[switch]: CheckCharacterDefaultDirection DOWN), whose
// cast is the `_down` copy. Node has no WebP: the trace lists the prefabs the layer starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { attackMode, boundEffects } from '../../public/js/render/fxmap.js';
import { fxEvent } from '../helpers/fxEvent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MLY = 'token_10030_mlyss_wtrman', TW = 'token_10026_bgsnow_subbow', CANNON = 'token_10009_weedy_cannon', WOLF = 'token_10028_vigil_wolf', SHADOW = 'token_10022_kazema_shadow';
const SLOTS = (up, side, down) => [up, side, down, side];
// the rows as char_modes.py writes them (trimmed to the fields the layer reads)
const ROWS = {
  [TW]: { owner: 'char_4055_bgsnow', start: 'token_bgsnow_subbow_birth_01', modes: ['Default', 'Default[D]', 'S3', 'S3[D]'], downMode: [1, 1, 3, 3],
    // (Default[D] / S3[D]: their NONE entries' slot 0, the `_down` copy)
    cast: [['token_bgsnow_subbow_attack_start_01'], ['token_bgsnow_subbow_attack_start_01_down'], ['token_bgsnow_subbow_skill_start_01'], ['token_bgsnow_subbow_skill_start_01_down']],
    hit: [['token_bgsnow_subbow_attack_hit_01'], ['token_bgsnow_subbow_attack_hit_01'], ['token_bgsnow_subbow_skill_03_hit_01'], ['token_bgsnow_subbow_skill_03_hit_01']],
    trail: [['token_bgsnow_subbow_attack_trail_01'], ['token_bgsnow_subbow_attack_trail_01'], ['token_bgsnow_subbow_skill_03_trail_01'], ['token_bgsnow_subbow_skill_03_trail_01']],
    dirs: [
      { t: 3, s: SLOTS('token_bgsnow_subbow_attack_start_01_up', 'token_bgsnow_subbow_attack_start_01', '') },
      { t: 0, s: ['token_bgsnow_subbow_attack_start_01_down', 'token_10026_bgsnow_subbow_attack_start_01', '', 'token_10026_bgsnow_subbow_attack_start_01'] },
      { t: 3, s: SLOTS('token_bgsnow_subbow_skill_start_01_up', 'token_bgsnow_subbow_skill_start_01', '') },
      { t: 0, s: ['token_bgsnow_subbow_skill_start_01_down', 'token_10026_bgsnow_subbow_attack_start_01', '', 'token_10026_bgsnow_subbow_attack_start_01'] },
    ],
    skills: [{}, { cast: ['token_bgsnow_subbow_skill_start_01'], target: ['token_bgsnow_subbow_skill_02_hit_01'], shot: ['token_bgsnow_subbow_skill_02_trail_01'], shotHit: ['token_bgsnow_subbow_skill_02_hit_01'] }, {}] },
  [CANNON]: { owner: 'char_400_weedy', modes: ['Default'], cast: [['token_weedy_attack_01_start']], hit: [['token_weedy_attack_01_hit']], trail: [['token_weedy_attack_01_trail']] },
  // its attacks are the hand-drawn pack's (fxgame.js packAtk); the row's Recharge cast is no name rule's door to 伺夜's own
  [WOLF]: { owner: 'char_427_vigil', start: '', dead: '', modes: ['Recharge', 'Default'], base: 1, cast: [['vigil_token_start'], []], hit: [[], []], trail: [[], []] },
  // 缪尔赛思's 流形: Recharge 0 (c0), Default 1 (c1), Melee 2 / Range 3 after a copy, Range_S2 / Melee_S3 while her S2 / S3 runs
  [MLY]: { owner: 'char_249_mlyss', modes: ['Recharge', 'Default', 'Melee', 'Range', 'Range_S2', 'Melee_S3'], base: 1,
    cast: [[], [], ['token_10030_mlyss_wtrman_c2_attack_start_01', 'token_10030_mlyss_wtrman_c2_combat_start_01'], ['token_10030_mlyss_wtrman_c3_attack_start_01', 'token_10030_mlyss_wtrman_c3_combat_start_01'],
      ['token_10030_mlyss_wtrman_c3_attack_start_01'], ['token_10030_mlyss_wtrman_c2_attack_start_01', 'token_10030_mlyss_wtrman_c2_combat_start_01']],
    hit: [[], ['token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'], ['token_10030_mlyss_wtrman_c2c3_attack_hit_01', 'token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'],
      ['token_10030_mlyss_wtrman_c2c3_attack_hit_01', 'token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'], ['token_10030_mlyss_wtrman_c2c3_attack_hit_01'],
      ['token_10030_mlyss_wtrman_c2c3_attack_hit_01', 'token_10030_mlyss_wtrman_c1c2c3_combat_hit_01']],
    combatSplit: [null, null, null, { attack: { cast: ['token_10030_mlyss_wtrman_c3_attack_start_01'], hit: ['token_10030_mlyss_wtrman_c2c3_attack_hit_01'] },
      combat: { cast: ['token_10030_mlyss_wtrman_c3_combat_start_01'], hit: ['token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'] } }, null, null],
    trail: [[], [], [], [], [], []] },
  [SHADOW]: { owner: 'char_4016_kazema', modes: ['Default'], cast: [['kazema_attack_01_start_b']], hit: [['kazema_attack_01_hit_b']], trail: [[]] },
};
const files = {
  '/assets/local/fx/index.json': { bundles: {
    bgsnow: ['bgsnow_attack_01_start', 'bgsnow_skill_03_start'],
    bgsnow_token: ['token_bgsnow_subbow_attack_hit_01', 'token_bgsnow_subbow_attack_start_01', 'token_bgsnow_subbow_attack_start_01_down',
      'token_bgsnow_subbow_attack_start_01_up', 'token_bgsnow_subbow_attack_trail_01', 'token_bgsnow_subbow_birth_01', 'token_bgsnow_subbow_skill_02_hit_01',
      'token_bgsnow_subbow_skill_02_trail_01', 'token_bgsnow_subbow_skill_03_buff_01', 'token_bgsnow_subbow_skill_03_hit_01', 'token_bgsnow_subbow_skill_03_trail_01',
      'token_bgsnow_subbow_skill_start_01', 'token_bgsnow_subbow_skill_start_01_down', 'token_bgsnow_subbow_skill_start_01_up'],
    weedy_token: ['token_weedy_attack_01_hit', 'token_weedy_attack_01_start', 'token_weedy_attack_01_trail'],
    vigil: ['vigil_attack_start_01', 'vigil_token_start', 'vigil_attack_hit'],
    kazema: ['kazema_attack_01_hit_a', 'kazema_attack_01_hit_b', 'kazema_attack_01_start_a', 'kazema_attack_01_start_b'],
    mlyss: ['mlyss_attack_01_start'],
    mlyss_token: ['token_10030_mlyss_wtrman_c2_attack_start_01', 'token_10030_mlyss_wtrman_c2_combat_start_01', 'token_10030_mlyss_wtrman_c3_attack_start_01',
      'token_10030_mlyss_wtrman_c3_combat_start_01', 'token_10030_mlyss_wtrman_c2c3_attack_hit_01', 'token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'],
    common: ['common_call_start_01'],
  } },
  '/assets/local/fx/modes.json': ROWS,
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
    const tok = (id, defId, skillIndex = 0, dir = 'RIGHT') => ({ id, x: 0, y: 0, alive: true, dir, info: { id, side: 'ally', kind: 'token', defId, spine: defId, skillIndex } });
    const foe = (id, x) => ({ id, x, y: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const take = (kind = null) => seen.splice(0).filter((p) => !kind || p.kind === kind).map((p) => `${p.kind}:${p.names.join('+')}`);
    await run({ layer, tok, foe, take });
  } finally { globalThis.fetch = fetch0; }
}
const attack = (layer, views, id, tgt) => {
  layer.onEvent(['swing', id, 0.067, 'arrow'], views);
  layer.onEvent(['atk', id, tgt, 'arrow'], views);
  layer.onEvent(['dmg', tgt, 100, 'phys', 0, id], views);
};

test('attackMode: a summon\'s `base` outside a skill', () => {
  assert.equal(attackMode(ROWS[WOLF], false, 0), 1);
  assert.equal(attackMode(ROWS[TW], false, 2), 0);
  assert.equal(attackMode(ROWS[TW], true, 2), 2, 'S3 by the name rule');
});

test('打字机: its cast by facing, its hit; deployed facing down the `_down` copies; S3 its skill shots', () => withLayer(async ({ layer, tok, foe, take }) => {
  const right = tok(1, TW, 0), down = tok(2, TW, 2, 'DOWN'), s3 = tok(3, TW, 2);
  const views = new Map([[1, right], [2, down], [3, s3], [9, foe(9, 2)]]);
  attack(layer, views, 1, 9);
  assert.deepEqual(take().filter((s) => !s.startsWith('spawn:')), ['attackStart:token_bgsnow_subbow_attack_start_01', 'attackHit:token_bgsnow_subbow_attack_hit_01']);
  layer.update(1);
  attack(layer, views, 2, 9);
  assert.deepEqual(take().filter((s) => !s.startsWith('spawn:')), ['attackStart:token_bgsnow_subbow_attack_start_01_down', 'attackHit:token_bgsnow_subbow_attack_hit_01'], 'Default[D]');
  layer.update(1);
  layer.onEvent(['skill', 3, 1], views);
  assert.deepEqual(take(), [], 'no name rule: its S3 buff prefab is named by nothing of the client');
  attack(layer, views, 3, 9);
  assert.deepEqual(take().filter((s) => !s.startsWith('spawn:')), ['attackStart:token_bgsnow_subbow_skill_start_01', 'attackHit:token_bgsnow_subbow_skill_03_hit_01']);
  layer.update(1);
  layer.onEvent(['skill', 2, 1], views);
  take();
  attack(layer, views, 2, 9);
  assert.deepEqual(take().filter((s) => !s.startsWith('spawn:')), ['attackStart:token_bgsnow_subbow_skill_start_01_down', 'attackHit:token_bgsnow_subbow_skill_03_hit_01'], 'S3[D]');
}));

test('打字机 facing up: the `_up` copy (FOUR_DIR); S2 点题 casts sktok_bgsnow_2\'s effect by facing', () => withLayer(async ({ layer, tok, foe, take }) => {
  const up = tok(1, TW, 0, 'UP'), s2 = tok(2, TW, 1, 'UP');
  const views = new Map([[1, up], [2, s2], [9, foe(9, 2)]]);
  attack(layer, views, 1, 9);
  assert.deepEqual(take().filter((s) => !s.startsWith('spawn:')), ['attackStart:token_bgsnow_subbow_attack_start_01_up', 'attackHit:token_bgsnow_subbow_attack_hit_01']);
  layer.update(1);
  layer.onEvent(['skill', 2, 1], views);
  assert.deepEqual(take(), ['skillStart:token_bgsnow_subbow_skill_start_01_up']);
}));

test('工程蓄水炮: its start and hit, its shell\'s trail bound; 风笛\'s 影子 from her own bundle', () => withLayer(async ({ layer, tok, foe, take }) => {
  // (the trail itself flies on the real player only — launchTrail: the arena check)
  assert.deepEqual(boundEffects(ROWS[CANNON], files['/assets/local/fx/index.json'].bundles.weedy_token, 0, 'trail'), ['token_weedy_attack_01_trail']);
  const views = new Map([[1, tok(1, CANNON)], [2, tok(2, SHADOW)], [9, foe(9, 3)]]);
  attack(layer, views, 1, 9);
  assert.deepEqual(take().filter((x) => !x.startsWith('spawn:')), ['attackStart:token_weedy_attack_01_start', 'attackHit:token_weedy_attack_01_hit']);
  layer.update(1);
  attack(layer, views, 2, 9);
  assert.deepEqual(take().filter((x) => !x.startsWith('spawn:')), ['attackStart:kazema_attack_01_start_b', 'attackHit:kazema_attack_01_hit_b']);
}));

test('缪尔赛思\'s 流形: Default before its copy; the copy\'s Melee / Range, Range_S2 while her S2 runs', () => withLayer(async ({ layer, tok, foe, take }) => {
  const m = tok(1, MLY, 1), her = { id: 5, x: 1, y: 0, alive: true, info: { id: 5, side: 'ally', kind: 'op', defId: 'char_249_mlyss', spine: 'char_249_mlyss', skillIndex: 1 } };
  const views = new Map([[1, m], [5, her], [9, foe(9, 2)]]);
  const shown = () => take().filter((x) => x.startsWith('attack'));
  attack(layer, views, 1, 9);
  assert.deepEqual(shown(), ['attackHit:token_10030_mlyss_wtrman_c1c2c3_combat_hit_01'], 'Default (c1): its hit only');
  layer.update(1);
  layer.onEvent(fxEvent('copy', { x: 0, y: 0, id: 1, src: 7, mode: 'Range', by: 5 }), views);
  take();
  attack(layer, views, 1, 9);
  assert.deepEqual(shown(), ['attackStart:token_10030_mlyss_wtrman_c3_attack_start_01', 'attackHit:token_10030_mlyss_wtrman_c2c3_attack_hit_01'], 'Range, a ranged swing');
  layer.update(1);
  layer.onEvent(['skill', 5, 1], views);
  take();
  attack(layer, views, 1, 9);
  assert.deepEqual(shown(), ['attackStart:token_10030_mlyss_wtrman_c3_attack_start_01', 'attackHit:token_10030_mlyss_wtrman_c2c3_attack_hit_01'], 'Range_S2');
  layer.update(1);
  layer.onEvent(fxEvent('copy', { x: 0, y: 0, id: 1, src: 8, mode: 'Melee', by: 5 }), views);
  layer.onEvent(['skill', 5, 0], views);
  layer.update(1);
  take();
  layer.onEvent(['swing', 1, 0.2, 'melee', null, 9, 1], views);   // at an enemy it blocks
  layer.onEvent(['atk', 1, 9, 'melee'], views);
  assert.ok(shown().includes('attackStart:token_10030_mlyss_wtrman_c2_attack_start_01'), 'Melee: its own cast, not Range\'s');
}));

test('伺夜\'s wolves: no name rule plays her own attack effects on them', () => withLayer(async ({ layer, tok, foe, take }) => {
  const views = new Map([[1, tok(1, WOLF)], [9, foe(9, 1)]]);
  layer.onEvent(['swing', 1, 0.2, 'melee'], views);
  assert.ok(!take().some((x) => /vigil_attack_start/.test(x)));
}));

// the extracted rows (git-ignored): the extractor's reading of the prefabs
const FX = path.join(ROOT, 'public/assets/local/fx/modes.json');
test('char_modes.py token_modes: the summons\' rows', { skip: !existsSync(FX) && 'no extracted effects' }, () => {
  const m = JSON.parse(readFileSync(FX, 'utf8'));
  assert.deepEqual(m[TW].modes, ROWS[TW].modes);
  assert.deepEqual(m[TW].cast, ROWS[TW].cast, 'the NONE entries\' slot 0');
  assert.deepEqual(m[TW].downMode, [1, 1, 3, 3], 'bgsnow_subbow_direction 0 → 1, bgsnow_subbow_s3[switch] 2 → 3');
  assert.deepEqual(m[TW].skills[1].shot, ['token_bgsnow_subbow_skill_02_trail_01'], 'sktok_bgsnow_2');
  assert.deepEqual(m[CANNON].trail, [['token_weedy_attack_01_trail']]);
  assert.equal(m['token_10037_mitm_trshrb'].base, 1, '樱桃三号: Reborn is mode 0');
  assert.ok(!m['token_10017_skadi2_dedant']?.cast, '斯卡蒂的海嗣: no attack effects, its auras only');
});

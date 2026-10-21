// test/render/skill-shot-alt-fx.test.js — 2026-10-21 (이펙트 연결 전수 ①·②, docs/rules/fx.md 「모드 없는 스킬의 투사체 꼬리」·
// 「타격별 투사체·쏠 때 대상 이펙트」):
//  - a skill whose window has no attack shoots its skill's projectile from its kit event (fxgame.js skillShotOut): 流星 S2's
//    arrows ('volley'), 崖心 S2's harpoon ('pull'), 锡人's alchemy unit ('zone' — its reach effects as it lands); the hits
//    wait for the landing;
//  - an ability group casts one child per attack (client AbilityRandomGroup, char_modes.py ability_groups → altFx): the child
//    of the clip the model swings plays its own cast / hits / shot-start effects (迷迭香, 凛御银灰, 仇白);
//  - a mode with a COMBAT state ability (Body/Combat) casts and hits with its effects on a swing at an enemy it blocks
//    (combatSplit — 仇白's arrow vs her sword).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { activationEffects, altGroup, combatEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const CHESS = read('data/chess.json');
const chessOf = (charId) => Object.values(CHESS.chess || CHESS).find((c) => c?.charId === charId);

test('char_modes.py: an ability group\'s children keep their own effects (altFx), the mode\'s lists the shared ones', () => {
  const r = MODES.char_391_rosmon;
  assert.deepEqual(r.altFx[0], { pick: 'other', groups: [
    { anim: 'Attack_A', cast: ['rosmon_attack_A_start'], start: ['rosmon_attack_A_hit_01'] },
    { anim: 'Attack_B', cast: ['rosmon_attack_B_start'], start: ['rosmon_attack_B_hit_01'] },
  ] }, '迷迭香: AbilityRandomGroup Random + _diffFromLastOneIfNotFirst');
  assert.deepEqual(r.cast[0], ['rosmon_attack_A_start_02'], 'the cast both children share');
  assert.deepEqual(r.tgtStart[0], []);
  assert.deepEqual(r.hitGroups[0].starts, [[], []]);
  assert.deepEqual(MODES.char_1045_svash2.altFx[0].groups.map((g) => [g.anim, g.cast]),
    [['Attack_A', ['svash2_attack_start_A_01', 'svash2_attack_start_A_02']], ['Attack_B', ['svash2_attack_start_B_01']], ['Attack_C', ['svash2_attack_start_C_01']]],
    '凛御银灰: the ThreePartOneshotAnimation `_oneshotAnim` of each child');
  assert.deepEqual(MODES.char_4010_etlchi.altFx[2].pick, 'loop');
  assert.equal(MODES.char_4010_etlchi.altFx[2].from, 1, '隐德来希 S3: Loop reads m_loopIndex + 1 first');
  const q = MODES.char_4082_qiubai;
  assert.equal(q.altFx[0].combat, 1, '仇白: the group is her Body/Combat');
  assert.deepEqual(q.combatSplit[0], { attack: { cast: ['qiubai_attack_start_01'], hit: ['qiubai_attack_hit_01'] }, combat: { cast: [], hit: [] } });
  assert.ok(!q.cast[0].includes('qiubai_attack_combat_A_start_01'), 'no blocked-enemy cast with her arrows');
});

test('altGroup: the clip the model swings, else by the group\'s pick; a COMBAT group only on a blocked-enemy swing', () => {
  const r = MODES.char_391_rosmon;
  assert.equal(altGroup(r, 0, 'Attack_B', false).index, 1);
  assert.equal(altGroup(r, 0, null, false, 1, 0.99).index, 0, '\'other\': never the one just cast');
  const e = MODES.char_4010_etlchi;
  assert.equal(altGroup(e, 2, null, false, -1).index, 1, 'Loop: the second child first');
  assert.equal(altGroup(e, 2, null, false, 1).index, 0);
  const q = MODES.char_4082_qiubai;
  assert.equal(altGroup(q, 0, 'Attack', false), null, 'her ranged attack: no Combat child');
  assert.deepEqual(altGroup(q, 0, 'Combat_B', true).hit, ['qiubai_attack_combat_B_hit_01']);
  const pre = ['qiubai_attack_start_01', 'qiubai_attack_hit_01'];
  assert.deepEqual(combatEffects(q, pre, 0, 'hit', false), ['qiubai_attack_hit_01']);
  assert.deepEqual(combatEffects(q, pre, 0, 'hit', true), []);
  assert.equal(combatEffects(r, pre, 0, 'hit', true), null, 'no Body/Combat: the whole list');
  // the children's own effects are still the mode's attacks', not a skill activation's
  assert.ok(!activationEffects(e, ['etlchi_skill_03_start_01', 'etlchi_skill_03_start_02'], 2).start.includes('etlchi_skill_03_start_02'));
});

const pick = (id, keys) => Object.fromEntries(keys.filter((k) => k in MODES[id]).map((k) => [k, MODES[id][k]]));
const BIND = (id) => pick(id, ['modes', 'skillMode', 'cast', 'castOpt', 'hit', 'hitGroups', 'tgtStart', 'trail', 'skills', 'altFx', 'combatSplit']);
const OPS = ['char_126_shotst', 'char_173_slchan', 'char_4151_tinman', 'char_391_rosmon', 'char_4082_qiubai'];
const files = {
  '/assets/local/fx/index.json': { bundles: {
    shotst: ['shotst_skill_02_trail', 'shotst_skill_01_hit'],
    slchan: ['slchan_skill_01_trail', 'slchan_skill_02_line', 'slchan_skill_02_hit', 'slchan_skill_01_buff'],
    tinman: ['tinman_skill_02_trail_02', 'tinman_skill_02_range_01', 'tinman_skill_02_start_01'],
    rosmon: ['rosmon_attack_A_start', 'rosmon_attack_B_start', 'rosmon_attack_A_start_02', 'rosmon_attack_A_hit_01', 'rosmon_attack_B_hit_01', 'rosmon_attack_A_hit_02'],
    qiubai: ['qiubai_attack_start_01', 'qiubai_attack_hit_01', 'qiubai_attack_combat_A_start_01', 'qiubai_attack_combat_A_hit_01', 'qiubai_attack_combat_B_start_01', 'qiubai_attack_combat_B_hit_01'],
  } },
  '/assets/local/fx/modes.json': Object.fromEntries(OPS.map((id) => [id, BIND(id)])),
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, unitDef: (info) => chessOf(info.defId) ?? null,
      trace: (p) => seen.push(p) });
    await settle();
    const op = (id, defId, skillIndex = 0, x = 0) => ({ id, x, y: 0, alive: true, info: { id, side: 'ally', defId, skillIndex } });
    const foe = (id, x) => ({ id, x, y: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const take = (kind = null) => seen.splice(0).filter((p) => !kind || p.kind === kind).map((p) => `${p.kind}:${p.names.join('+')}${p.at != null ? `@${p.at}` : ''}`);
    await run({ layer, op, foe, take });
  } finally { globalThis.fetch = fetch0; }
}

test('流星 S2 \'volley\': an arrow at each target, its hit as it lands (not at the damage)', () => withLayer(async ({ layer, op, foe, take }) => {
  const views = new Map([[1, op(1, 'char_126_shotst', 1)], [8, foe(8, 2)], [9, foe(9, 3)]]);
  layer.onEvent(['skill', 1, 1], views);
  take();
  layer.onEvent(['fx', 'volley', 0, 0, { id: 1, targets: [8, 9], skill: 'shotst_2' }], views);
  layer.onEvent(['dmg', 8, 300, 'phys', 0, 1], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 1], views);
  assert.deepEqual(take(), ['spawn:shotst_skill_02_trail', 'spawn:shotst_skill_02_trail'], 'the trails; no hit yet');
  layer.update(0.6);   // 3 tiles at projectile_shotst_s2's 6 tiles / s
  assert.deepEqual(take('attackHit').sort(), ['attackHit:shotst_skill_01_hit@8', 'attackHit:shotst_skill_01_hit@9']);
}));

test('崖心 S2 \'pull\': the harpoon at the enemy it drags (the event names her: `src`)', () => withLayer(async ({ layer, op, foe, take }) => {
  const views = new Map([[2, op(2, 'char_173_slchan', 1)], [9, foe(9, 2)]]);
  layer.onEvent(['skill', 2, 1], views);
  take();
  layer.onEvent(['fx', 'pull', 1, 0, { id: 9, fromX: 2, fromY: 0, src: 2 }], views);
  layer.onEvent(['dmg', 9, 300, 'true', 0, 2], views);
  assert.deepEqual(take(), ['spawn:slchan_skill_01_trail']);
  layer.update(0.3);
  assert.deepEqual(take('attackHit'), ['attackHit:slchan_skill_02_hit+slchan_skill_01_buff@9']);
}));

test('锡人 S2 \'zone\': the alchemy unit flies first, its reach effects play as it lands', () => withLayer(async ({ layer, op, take }) => {
  const views = new Map([[3, op(3, 'char_4151_tinman', 1)]]);
  layer.onEvent(['skill', 3, 1], views);
  take();
  layer.onEvent(['fx', 'zone', 1.5, 0, { x: 1.5, y: 0, radius: 1.5, dur: 10, id: 3, skill: 'tinman' }], views);
  assert.deepEqual(take('spawn'), ['spawn:tinman_skill_02_trail_02'], 'at projectile_chr_tinman_s2\'s 3 tiles / s');
  layer.update(0.6);
  assert.deepEqual(take('spawn').sort(), ['spawn:tinman_skill_02_range_01', 'spawn:tinman_skill_02_start_01']);
}));

test('迷迭香 / 仇白: the child of the swung clip casts; 仇白\'s sword only at an enemy she blocks', () => withLayer(async ({ layer, op, foe, take }) => {
  const swung = (v, clip) => { v.actor = { _attackClip: () => ({ loop: clip }), _loopOf: (c) => c.loop }; };
  const r = op(1, 'char_391_rosmon'), q = op(2, 'char_4082_qiubai');
  const views = new Map([[1, r], [2, q], [9, foe(9, 1)]]);
  swung(r, 'Attack_B');
  layer.onEvent(['swing', 1, 0.3, 'arrow'], views);
  layer.update(0.3);
  layer.onEvent(['atk', 1, 9, 'arrow'], views);
  const got = take().filter((p) => p.startsWith('attackHit') || p.includes('start'));
  assert.ok(got.some((p) => p.includes('rosmon_attack_B_start')), `Attack_B's cast: ${got}`);
  assert.ok(!got.some((p) => p.includes('rosmon_attack_A_start+') || p.endsWith('rosmon_attack_A_start')), 'not Attack_A\'s');
  assert.ok(got.includes('attackHit:rosmon_attack_B_hit_01@9'), 'projectile_chr_rosmon_B\'s start effect on the target');
  layer.update(1);
  take();
  swung(q, 'Combat_B');
  layer.onEvent(['swing', 2, 0.3, 'arrow', 0, null, 1], views);   // 7th field 1: at an enemy she blocks
  layer.update(0.3);
  layer.onEvent(['atk', 2, 9, 'arrow'], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 2], views);
  const sword = take().join(' ');
  assert.match(sword, /qiubai_attack_combat_B_start_01/);
  assert.match(sword, /qiubai_attack_combat_B_hit_01@9/);
  assert.doesNotMatch(sword, /qiubai_attack_start_01|qiubai_attack_hit_01/, 'not her arrow\'s');
  layer.update(1);
  swung(q, 'Attack');
  layer.onEvent(['swing', 2, 0.3, 'arrow'], views);
  layer.update(0.3);
  layer.onEvent(['atk', 2, 9, 'arrow'], views);
  layer.onEvent(['dmg', 9, 300, 'phys', 0, 2], views);
  const arrow = take().join(' ');
  assert.match(arrow, /qiubai_attack_start_01/);
  assert.match(arrow, /qiubai_attack_hit_01@9/);
  assert.doesNotMatch(arrow, /combat/, 'no sword at range');
}));

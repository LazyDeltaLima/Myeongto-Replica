// test/render/strike-groups-fx.test.js — an attack's per-strike hits (2026-10-16, decompile check, docs/rules/fx.md 「타격별 명중」).
// The client's MultiHitUberEffectEmitter (`OnCastOnTarget` RVA 0xCBB0B0) plays `_hitGroups[n]` on the target of the cast's
// n-th strike (`spellCnt`, 0 at the cast start), the last group past the end, `_useLoopHitEffect` n modulo the groups.
// char_modes.py did not read the field: 锏's attack, 赤刃明霄陈 S1 / S3, 德克萨斯 S2 and 阿斯卡纶 S1 had no hit binding at all
// (a name-mapped hit), and only the first strike of the attack played one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

test('char_modes.py: the per-strike hit groups of the modes and skills', () => {
  assert.deepEqual(MODES.char_4116_blkkgt.hitGroups, [{ g: [['blkkgt_attack_hit_1'], ['blkkgt_attack_hit_2']] }, { g: [['blkkgt_attack_hit_1'], ['blkkgt_attack_hit_2']] }], '锏 Default / S1');
  assert.deepEqual(MODES.char_1050_chen3.hitGroups[1], { g: [['chen3_skill_01_hit_01'], ['chen3_skill_01_hit_02']] }, '赤刃明霄陈 S1');
  assert.deepEqual(MODES.char_1050_chen3.hitGroups[3], { g: [['chen3_skill_03_hit_01'], ['chen3_skill_03_hit_02'], ['chen3_skill_03_hit_03']], loop: 1 }, 'S3: in turn');
  assert.deepEqual(MODES.char_1028_texas2.hitGroups[2], { g: [['texas2_skill_02_hit'], ['texas2_skill_02_hit_02']] }, '德克萨斯 S2');
  assert.deepEqual(MODES.char_4132_ascln.skills[0].hitGroups, { g: [['ascln_skill_01_hit_01'], ['ascln_skill_01_hit_02']] }, '阿斯卡纶 S1 skchr_ascln_1');
  // a group's loop hits end like the mode's (hitLoop: `_oneshot` 0, ended at ON_CAST_END)
  assert.equal(MODES.char_4116_blkkgt.hitLoop.blkkgt_attack_hit_2, 3);
});

const pick = (id, keys) => Object.fromEntries(keys.filter((k) => k in MODES[id]).map((k) => [k, MODES[id][k]]));
const BIND = (id) => pick(id, ['modes', 'skillMode', 'cast', 'hit', 'hitGroups', 'hitLoop', 'trail', 'skills']);
const files = {
  '/assets/local/fx/index.json': {
    bundles: {
      blkkgt: ['blkkgt_attack_hit_1', 'blkkgt_attack_hit_2'],
      chen3: ['chen3_skill_03_hit_01', 'chen3_skill_03_hit_02', 'chen3_skill_03_hit_03'],
      ascln: ['ascln_attack_hit_01', 'ascln_skill_01_hit_01', 'ascln_skill_01_hit_02'],
    },
  },
  '/assets/local/fx/modes.json': { char_4116_blkkgt: BIND('char_4116_blkkgt'), char_1050_chen3: BIND('char_1050_chen3'), char_4132_ascln: BIND('char_4132_ascln') },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('fxgame.js: the i-th damage of an attack in one tick plays hit group i, the last past the end; loop groups in turn', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const op = (id, defId, skillIndex = 0) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'ally', defId, skillIndex } });
    const bag = { id: 9, x: 1, y: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } };
    const blk = op(1, 'char_4116_blkkgt'), chen = op(2, 'char_1050_chen3', 2), asc = op(3, 'char_4132_ascln', 0);
    const views = new Map([[1, blk], [2, chen], [3, asc], [9, bag]]);
    const hits = () => plays.splice(0).filter((p) => p.kind === 'attackHit' || p.kind === 'skillHit').map((p) => p.names.join('+'));
    const tick = () => layer.update(0.2); // past HIT_GAP_S
    // (no await between the events: in node the first spawn's WebP check fails the layer)
    // 锏's normal attack: two strikes in one tick, then a DoT tick later (no strike)
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 1, 0], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 1, 0], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 1, 0], views);   // a third strike: the last group
    assert.deepEqual(hits(), ['blkkgt_attack_hit_1', 'blkkgt_attack_hit_2', 'blkkgt_attack_hit_2']);
    tick();
    layer.onEvent(['dmg', 9, 50, 'arts', 0, 1, 1], views);
    assert.deepEqual(hits(), [], 'a later tick is no strike of that attack');
    // 赤刃明霄陈 S3 (mode 3, loop): three strikes in turn, a fourth from the first again
    layer.onEvent(['skill', 2, 1], views);
    tick();
    layer.onEvent(['atk', 2, 9, 'none'], views);
    for (let i = 0; i < 4; i++) layer.onEvent(['dmg', 9, 900, 'arts', 0, 2, 0], views);
    assert.deepEqual(hits().slice(-4), ['chen3_skill_03_hit_01', 'chen3_skill_03_hit_02', 'chen3_skill_03_hit_03', 'chen3_skill_03_hit_01']);
    // the sim numbers the strikes ('dmg' 8th field): a hit without a number in the same tick (a talent's extra) is none
    tick();
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 1, 0, 0], views);
    layer.onEvent(['dmg', 9, 76, 'arts', 0, 1, 0, null], views);
    layer.onEvent(['dmg', 9, 500, 'phys', 0, 1, 0, 1], views);
    assert.deepEqual(hits(), ['blkkgt_attack_hit_1', 'blkkgt_attack_hit_2']);
    // 阿斯卡纶 S1 switches no mode (−1): its skill prefab's groups; her normal attack keeps its mode's hit
    tick();
    layer.onEvent(['atk', 3, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 700, 'phys', 0, 3, 0], views);
    assert.deepEqual(hits(), ['ascln_attack_hit_01']);
    tick();
    layer.onEvent(['skill', 3, 1], views);
    layer.onEvent(['atk', 3, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 900, 'phys', 0, 3, 0], views);
    layer.onEvent(['dmg', 9, 900, 'phys', 0, 3, 0], views);
    assert.deepEqual(hits(), ['ascln_skill_01_hit_01', 'ascln_skill_01_hit_02']);
  } finally { globalThis.fetch = fetch0; }
});

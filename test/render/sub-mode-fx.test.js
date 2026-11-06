// test/render/sub-mode-fx.test.js — every mode a running skill switches to on the way (shared/skill-modes.js SKILL_SUB_MODES)
// is drawn: from the sim fx that marks the switch until the skill ends, its attacks play that mode's cast / hit effects. The
// table used to drive the sounds alone, the effects only followed its `teleport` entries, and the coverage test
// (mode-switch-coverage.test.js) took the whole table as followed: 维什戴尔's 过载, 乌尔比安 S3 and 寒芒克洛丝 S2 kept their
// first mode's effects with nothing to say so.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { fxBundleOf, SKILL_END_CAST } from '../../public/js/render/fxmap.js';
import { isOwnSubMode, skillModeIndex, SKILL_SUB_MODES } from '../../shared/skill-modes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const settle = () => new Promise((r) => setTimeout(r, 10));

// (fxgame.js keeps the first index it loads for the module's life: one set of files for every operator here)
const IDS = [...Object.keys(SKILL_SUB_MODES), 'char_1041_angel2', 'char_1032_excu2', 'char_4191_tippi'];
const prefabsOf = (M) => [...new Set([M.cast, M.hit, M.attach, M.modeStart, M.trail].flat(2).filter((x) => typeof x === 'string'))];
const FILES = {
  '/assets/local/fx/index.json': { bundles: { ...Object.fromEntries(IDS.map((id) => [fxBundleOf(id), prefabsOf(MODES[id])])), common: ['common_char_birth_01'] } },
  // (the served modes.json, tools/assets → public/assets/local/fx: no `skillEnd`, `switchTo`)
  '/assets/local/fx/modes.json': Object.fromEntries(IDS.map((id) => [id, (({ skillEnd, switchTo, ...rest }) => rest)(MODES[id])])),
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};

/** A dry effect layer with one operator and a dummy enemy. */
async function rig(id, skillIndex) {
  const M = MODES[id];
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  const seen = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
  await settle();
  const op = { id: 1, x: 2, y: 2, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: id, spine: id, skillIndex } };
  const foe = { id: 9, x: 3, y: 2, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_1007_slime' } };
  const views = new Map([[1, op], [9, foe]]);
  const take = () => seen.splice(0).flatMap((p) => p.names || []);
  // (update takes a frame's dt: a swing, its wind-up, the strike. A frame past the strike would start a new cast, and a
  // looping cast effect still loading past its end is dropped)
  const strike = async () => {
    layer.onEvent(['swing', 1, 0.5, null, 9], views);
    await settle();
    layer.update(0.5);
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['dmg', 9, 10, 'phys', false, 1], views);
    await settle();
    layer.update(0.05);
    await settle();
    return take();
  };
  return { M, layer, views, take, strike };
}

/** Every SKILL_SUB_MODES entry with the skill it belongs to: [charId, fx kind, sub mode, skill index, the skill's own mode]. */
const ENTRIES = Object.entries(SKILL_SUB_MODES).flatMap(([id, subs]) => Object.entries(subs).flatMap(([fx, name]) => {
  const b = MODES[id];
  const i = b.switchTo.findIndex((_, k) => isOwnSubMode(b.modes, skillModeIndex(b.modes, k, b.skillMode), name));
  return [[id, fx, name, i, skillModeIndex(b.modes, i, b.skillMode)]];
}));

test('every sub mode of the table belongs to a skill of its operator', () => {
  for (const [id, fx, name, i] of ENTRIES) assert.ok(i >= 0, `${id} ${fx} → ${name}`);
});

for (const [id, fx, name, i, own] of ENTRIES) {
  test(`${id} S${i + 1}: '${fx}' switches its attacks' effects to ${name} until the skill ends`, async () => {
    const fetch0 = globalThis.fetch;
    try {
      const { M, layer, views, take, strike } = await rig(id, i);
      const k = M.modes.indexOf(name);
      const list = (role, m) => M[role]?.[m] || [];
      const only = (role) => list(role, k).filter((n) => !list(role, own).includes(n));
      // (a name of the other mode's other role is that role's: Mon3tr's monstr_skill_03_heal is S3's cast and S3_Reborn's hit)
      const left = (role) => list(role, own).filter((n) => !list('cast', k).includes(n) && !list('hit', k).includes(n));
      layer.onEvent(['skill', 1, 1], views);
      await settle();
      take();
      layer.onEvent(['fx', fx, 2, 2, { id: 1, x: 2, y: 2 }], views);
      layer.update(0.05);
      await settle();
      take();
      const after = await strike();
      for (const n of only('cast')) assert.ok(after.includes(n), `${name}: ${n} (${after})`);
      // (a mode's hit list holds what any of its hits draws: Mon3tr's strike and her heal)
      if (only('hit').length) assert.ok(only('hit').some((n) => after.includes(n)), `${name}: one of ${only('hit')} (${after})`);
      for (const n of [...left('cast'), ...left('hit')]) assert.ok(!after.includes(n), `${name}: not ${n} (${after})`);
      layer.onEvent(['skill', 1, 0], views);
      layer.update(0.05);
      await settle();
      take();
      const off = await strike();
      for (const n of [...only('cast'), ...only('hit')]) assert.ok(!off.includes(n), `after the skill: not ${n} (${off})`);
    } finally { globalThis.fetch = fetch0; }
  });
}

test('乌尔比安 S1\'s anchor is no switch: S3_Respawn_A is S3\'s (the same fx kind, another skill)', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { layer, views, take, strike } = await rig('char_4145_ulpia', 0);
    layer.onEvent(['skill', 1, 1], views);
    await settle();
    take();
    layer.onEvent(['fx', 'anchor', 2, 2, { id: 1, x: 2, y: 2 }], views);
    layer.update(0.05);
    await settle();
    take();
    const after = await strike();
    for (const n of ['ulpia_skill_03_start_01', 'ulpia_skill_03_hit_01']) assert.ok(!after.includes(n), `${n} (${after})`);
  } finally { globalThis.fetch = fetch0; }
});

test('another unit\'s anchor (src: the caster, id: its target) switches nothing on the target', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { layer, views, take, strike } = await rig('char_4145_ulpia', 2);
    layer.onEvent(['skill', 1, 1], views);
    await settle();
    take();
    layer.onEvent(['fx', 'anchor', 2, 2, { id: 1, src: 5, x: 2, y: 2 }], views);
    layer.update(0.05);
    await settle();
    take();
    const after = await strike();
    assert.ok(after.includes('ulpia_attack_start_01') && !after.includes('ulpia_skill_03_start_01'), `${after}`);
  } finally { globalThis.fetch = fetch0; }
});

test('新约能天使 S3 picks its mode by the way she faces as it starts (angel2_s_3[switch_mode]): facing down S3_Down\'s shots', async () => {
  const fetch0 = globalThis.fetch;
  try {
    for (const [dir4, on, off] of [['DOWN', 'angel2_attack_loop_hit_01', 'angel2_skill_3_loop_hit_01'], ['RIGHT', 'angel2_skill_3_loop_hit_01', 'angel2_attack_loop_hit_01']]) {
      const { layer, views, take, strike } = await rig('char_1041_angel2', 2);
      views.get(1).face = { dir4 };
      layer.onEvent(['skill', 1, 1], views);
      await settle();
      take();
      const after = await strike();
      assert.ok(after.includes(on) && !after.includes(off), `${dir4}: ${after}`);
    }
  } finally { globalThis.fetch = fetch0; }
});

test('a closing mode\'s cast plays as the skill ends, not before and not for another skill (SKILL_END_CAST)', async () => {
  const fetch0 = globalThis.fetch;
  try {
    for (const [id, i, want] of [['char_1032_excu2', 2, ['excu2_skill_03_end_01', 'excu2_skill_03_end_02']], ['char_4191_tippi', 0, ['tippi_land_F', 'common_land_ground']], ['char_4191_tippi', 1, ['tippi_land_F', 'common_land_ground']]]) {
      assert.ok(SKILL_END_CAST[id][i].life > 0);
      assert.equal(MODES[id].modes[MODES[id].skillEnd[i]], SKILL_END_CAST[id][i].mode, 'the mode the client ends the skill in');
      const { layer, views, take } = await rig(id, i);
      layer.onEvent(['skill', 1, 1], views);
      await settle();
      const on = take();
      for (const n of want) assert.ok(!on.includes(n), `${id}: not at the start: ${n} (${on})`);
      layer.onEvent(['skill', 1, 0], views);
      await settle();
      const off = take();
      for (const n of want) assert.equal(off.filter((x) => x === n).length, 1, `${id}: once at the end: ${n} (${off})`);
      assert.ok(!off.includes('tippi_line_01_1'), `${id}: her lines end with the skill (${off})`);
    }
    const { layer, views, take } = await rig('char_1032_excu2', 1);
    layer.onEvent(['skill', 1, 1], views);
    await settle();
    take();
    layer.onEvent(['skill', 1, 0], views);
    await settle();
    assert.ok(!take().some((n) => n.includes('_end_')), 'S2 has no closing mode');
  } finally { globalThis.fetch = fetch0; }
});

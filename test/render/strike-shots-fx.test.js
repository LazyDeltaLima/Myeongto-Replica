// test/render/strike-shots-fx.test.js — a shot's effects on its target as it leaves, and the projectiles of an attack's later
// strikes (2026-10-16, official client, docs/rules/fx.md 「타격별 투사체·쏠 때 대상 이펙트」).
// The client plays a projectile's `_effectsToTargetWhenStart` on its target as it is shot (char_modes.py read them for skills
// only); a MultiRangedAttack shoots strike n's own projectile (`GetProjectileKey`: `_additionalProjectile(s)`,
// 伺夜 S3's three arrows, 迷迭香's aftershock) and its hits — char_modes.py kept only the first projectile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { activationEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));

test('char_modes.py: tgtStart per mode, the strikes\' own projectiles (hitGroups shots / starts / base)', () => {
  assert.deepEqual(MODES.char_172_svrash.tgtStart, [['svrash_attack_01_trail'], [], []], '银灰 projectile_svrash');
  const r = MODES.char_391_rosmon.hitGroups[0];
  assert.deepEqual(r.g, [['rosmon_attack_A_hit_02', 'rosmon_attack_A_range'], ['rosmon_attack_A_hit_02']], '迷迭香: projectile_chr_rosmon_A, then _after_shock');
  assert.deepEqual(r.starts, [[], []], 'Attack_A\'s rosmon_attack_A_hit_01 is its child\'s own (altFx, test/render/skill-shot-alt-fx.test.js)');
  assert.equal(MODES.char_391_rosmon.hitGroups[1].g.length, 4, 'S2: _additionalTimes 3 → four strikes');
  const v = MODES.char_427_vigil.hitGroups[1];
  assert.deepEqual(v.g, [['vigil_skill_03_hit_1'], ['vigil_skill_03_hit_2'], ['vigil_skill_03_hit_3']], '伺夜 S3 _additionalProjectiles');
  assert.deepEqual(v.shots, [['vigil_skill_03_trail_01'], ['vigil_skill_03_trail_02'], ['vigil_skill_03_trail_03']]);
  assert.deepEqual(MODES.char_4054_malist.skills[1].hitGroups.g, [['malist_skill_hit'], ['malist_skill_hit_2']], '至简 S2 _additionalProjectile');
  // 迷迭香 S2's range is her shots' (on the target as each leaves), not a loop on her for the whole skill
  const idx = { rosmon: ['rosmon_skill_02_buff', 'rosmon_skill_02_range', 'rosmon_skill_02_range_02'] };
  assert.ok(!activationEffects(MODES.char_391_rosmon, idx.rosmon, 1).loops.includes('rosmon_skill_02_range'));
});

const pick = (id, keys) => Object.fromEntries(keys.filter((k) => k in MODES[id]).map((k) => [k, MODES[id][k]]));
const BIND = (id) => pick(id, ['modes', 'skillMode', 'cast', 'hit', 'hitGroups', 'tgtStart', 'trail', 'skills', 'altFx']);
const files = {
  '/assets/local/fx/index.json': {
    bundles: {
      rosmon: ['rosmon_attack_A_hit_01', 'rosmon_attack_A_hit_02', 'rosmon_attack_A_range'],
      vigil: ['vigil_skill_03_hit_1', 'vigil_skill_03_hit_2', 'vigil_skill_03_hit_3'],
      svrash: ['svrash_attack_01_trail', 'svrash_attack_01_hit'],
    },
  },
  '/assets/local/fx/modes.json': { char_391_rosmon: BIND('char_391_rosmon'), char_427_vigil: BIND('char_427_vigil'), char_172_svrash: BIND('char_172_svrash') },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('fxgame.js: the shot\'s start effects on its target at the attack; each strike\'s projectile hit, a numbered later strike too', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const plays = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
    await settle();
    const op = (id, defId, skillIndex = 0) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'ally', defId, skillIndex } });
    const bag = { id: 9, x: 1, y: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } };
    const views = new Map([[1, op(1, 'char_391_rosmon')], [2, op(2, 'char_427_vigil', 2)], [3, op(3, 'char_172_svrash')], [9, bag]]);
    const got = () => plays.splice(0).filter((p) => p.at === 9).map((p) => p.names.join('+'));
    const tick = (s = 0.3) => layer.update(s);
    // (no await between the events: in node the first spawn's WebP check fails the layer)
    views.get(1).actor = { _attackClip: () => ({ loop: 'Attack_A' }), _loopOf: (c) => c.loop };   // her Attack_A child (altFx)
    layer.onEvent(['atk', 1, 9, 'arrow'], views);
    assert.deepEqual(got(), ['rosmon_attack_A_hit_01'], '迷迭香: projectile_chr_rosmon_A `_effectsToTargetWhenStart`');
    layer.onEvent(['dmg', 9, 739, 'phys', 0, 1, 0, 0], views);
    tick();
    layer.onEvent(['dmg', 9, 370, 'phys', 0, 1, 0, 1], views);   // her aftershock, 0.3 s later (professions.js 轰击术师)
    assert.deepEqual(got(), ['rosmon_attack_A_hit_02+rosmon_attack_A_range', 'rosmon_attack_A_hit_02']);
    tick();
    layer.onEvent(['skill', 2, 1], views);
    layer.onEvent(['atk', 2, 9, 'arrow'], views);
    for (let i = 0; i < 3; i++) layer.onEvent(['dmg', 9, 567, 'phys', 0, 2, 0, i], views);
    assert.deepEqual(got(), ['vigil_skill_03_hit_1', 'vigil_skill_03_hit_2', 'vigil_skill_03_hit_3'], '伺夜 S3: each arrow its own hit');
    layer.onEvent(['atk', 3, 9, 'arrow'], views);
    layer.onEvent(['dmg', 9, 675, 'phys', 0, 3, 0, 0], views);
    assert.deepEqual(got(), ['svrash_attack_01_trail', 'svrash_attack_01_hit'], '银灰: on the target as it leaves, then the hit');
  } finally { globalThis.fetch = fetch0; }
});

// test/local-patch-fxmodes.test.js — skill effects on every attack of the skill (local patch, docs/LOCAL-PATCH.md 「스킬 중 공격
// 이펙트」): the attack-mode effect bindings tools/local-extract/char_modes.py writes (tools/assets/local-char-modes.json,
// public/assets/local/fx/modes.json) and the helpers render/fxgame.js decides with (render/fxmap.js attackMode / boundEffects).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attackMode, boundEffects } from '../public/js/render/fxmap.js';
import { loadCharModes } from '../tools/assets/skill-mode-sfx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = path.join(ROOT, 'public', 'assets', 'local', 'fx');
const extracted = existsSync(path.join(FX, 'modes.json')) && existsSync(path.join(FX, 'index.json'));

describe('attack-mode effect bindings', () => {
  const bind = { modes: ['Default', 'S2', 'S2_Overload', 'S3'], cast: [['a_start'], ['s2_start'], ['ov_start'], ['s3_start', 's3_down_x']], hit: [['a_hit'], [], [], ['s3_hit', 's3_hit_2', 's3_hit_3']] };

  test('attackMode: Default when no skill runs, the running skill\'s mode, -1 for a skill without one, null unbound', () => {
    assert.equal(attackMode(bind, false, 2), 0);
    assert.equal(attackMode(bind, true, 2), 3);
    assert.equal(attackMode(bind, true, 1), 1);
    assert.equal(attackMode(bind, true, 0), -1, 'S1 switches no mode');
    assert.equal(attackMode(null, true, 2), null);
  });

  test('boundEffects: only the extracted prefabs, in order; nothing for no mode', () => {
    const pre = ['a_start', 'a_hit', 's3_start', 's3_hit_2', 's3_hit'];
    assert.deepEqual(boundEffects(bind, pre, 3, 'cast'), ['s3_start']);
    assert.deepEqual(boundEffects(bind, pre, 3, 'hit'), ['s3_hit', 's3_hit_2']);
    assert.deepEqual(boundEffects(bind, pre, -1, 'cast'), []);
    assert.deepEqual(boundEffects(bind, null, 0, 'cast'), []);
  });

  test('local-char-modes.json: cast / hit / trail per mode, no directional copies; the mode\'s own shot first', () => {
    const modes = loadCharModes(ROOT);
    for (const [id, e] of Object.entries(modes)) {
      for (const role of ['cast', 'hit', 'trail']) {
        assert.equal(e[role]?.length, e.modes.length, `${id} ${role}`);
        for (const list of e[role]) for (const n of list) assert.doesNotMatch(n, /_(up|down|left|back)(_|$)/i, `${id} ${n}`);
      }
    }
    const w = modes.char_1035_wisdel;
    assert.deepEqual(w.cast[3], ['wisdel_skill_03_start'], '维什戴尔 S3 casts on each attack');
    assert.deepEqual(w.cast[0], ['wisdel_attack_a_start'], 'of Attack_A/B/C only the first');
    assert.equal(modes.char_1038_whitw2.proj[1][0], 'projectile_chr_whitw2_s1', '荒芜拉普兰德 S1: her shot before the drones');
    assert.deepEqual(modes.char_1038_whitw2.hit[0], ['whitw2_hit_01'], 'the drones\' hits are theirs, not the attack\'s');
    assert.deepEqual(w.trail[0], ['wisdel_attack_01_trail'], 'a ranged attack\'s projectile trail (its _mainEffect)');
    assert.deepEqual(w.trail[3], ['wisdel_skill_03_trail'], 'S3\'s own projectile');
    assert.ok(Object.values(modes).filter((e) => e.trail[0].length).length >= 14, 'the ranged operators of the extracted 25 at least');
  });

  test('modes.json for the effect layer matches the committed bindings (when the effects are extracted)', { skip: !extracted && 'no extracted effects' }, () => {
    const fx = JSON.parse(readFileSync(path.join(FX, 'modes.json'), 'utf8'));
    const modes = loadCharModes(ROOT);
    for (const [id, e] of Object.entries(modes)) assert.deepEqual(fx[id]?.cast, e.cast, id);
    const index = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles;
    // every operator with extracted effects: the skill modes cast extracted prefabs (25 at the time of writing)
    let withCast = 0;
    for (const [id, e] of Object.entries(fx)) {
      const pre = index[id.replace(/^char_\d+_/, '')];
      if (!pre) continue;
      for (let n = 1; n < e.modes.length; n++) if (boundEffects(e, pre, n, 'cast').length) withCast++;
    }
    assert.ok(withCast >= 25, `skill modes with extracted cast effects: ${withCast}`);
  });
});

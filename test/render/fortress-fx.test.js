// test/render/fortress-fx.test.js — a 要塞's cast and hit effects follow the attack it makes (maintainer report 2026-10-10:
// the enemies 号角 blocks got her ranged blast). Client charpack: her Default MeleeAttack / BlockedMeleeAttack hit with
// horn_attack_01_hit only; RangedAttack casts horn_attack_01_start_02 and shoots projectile_chr_horn, whose hit is
// horn_attack_01_hit_02. char_modes.py writes the split (modes.json `fortress`), render/fxmap.js fortressEffects picks by
// the sim's 'swing' / 'atk' kind ('none' while she blocks).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fortressEffects } from '../../public/js/render/fxmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');

test('char_modes.py: 号角 and 灰毫 carry the melee / ranged split of their 要塞 modes', () => {
  const h = MODES.char_4039_horn;
  const d = h.fortress[h.modes.indexOf('Default')];
  assert.deepEqual(d.melee, { cast: [], hit: ['horn_attack_01_hit'] });
  assert.deepEqual(d.ranged, { cast: ['horn_attack_01_start_02'], hit: ['horn_attack_01_hit_02'] });
  const s3 = h.fortress[h.modes.indexOf('S3')];
  assert.deepEqual(s3.melee.hit, ['horn_skill_03_hit']);
  assert.deepEqual(s3.ranged.hit, ['horn_skill_03_hit_02']);
  // S2 shoots while blocking too (BlockedRangedAttack): no split
  assert.equal(h.fortress[h.modes.indexOf('S2')], null);
  assert.ok(MODES.char_431_ashlok.fortress.some(Boolean));
  // only 要塞 modes are split
  const split = Object.entries(MODES).filter(([id, m]) => !id.startsWith('$') && m.fortress).map(([id]) => id).sort();
  assert.deepEqual(split, ['char_4039_horn', 'char_431_ashlok']);
});

test('fortressEffects: melee lists for kind none, ranged ones otherwise, null without a split', () => {
  const h = MODES.char_4039_horn;
  const all = ['horn_attack_01_hit', 'horn_attack_01_hit_02', 'horn_attack_01_start_02'];
  assert.deepEqual(fortressEffects(h, all, 0, 'hit', 'none'), ['horn_attack_01_hit']);
  assert.deepEqual(fortressEffects(h, all, 0, 'hit', 'bomb'), ['horn_attack_01_hit_02']);
  assert.deepEqual(fortressEffects(h, all, 0, 'cast', 'none'), []);
  assert.deepEqual(fortressEffects(h, all, 0, 'cast', 'bomb'), ['horn_attack_01_start_02']);
  assert.equal(fortressEffects(h, all, 1, 'hit', 'none'), null, 'S2: the whole list');
  assert.equal(fortressEffects(h, all, 0, 'hit', null), null, 'kind unknown: the whole list');
  assert.equal(fortressEffects(MODES.char_1040_blaze2, all, 0, 'hit', 'none'), null);
});

test('fxgame: swing, strike and hit go through boundFor with the attack\'s kind', () => {
  assert.match(SRC, /const \{ names: own, split \} = boundFor\(src, mode, 'cast', kind\);/);
  assert.match(SRC, /lastAtk\.set\(tgt\.id \?\? tgt\.info\?\.id, \{ src, t: clockS, mode, kind: e\[3\], shot, combat: !!src\._fxCombat, sig \}\);/);
  assert.match(SRC, /let \{ names: hitList, split \} = tp\?\.replace \? .*\n\s+: sg\?\.base \?/);
  assert.match(SRC, /: a\.shot \? .* : boundFor\(a\.src, a\.mode, 'hit', a\.kind, !!a\.combat\);/);
  assert.match(SRC, /if \(split \|\| bound\(a\.src, a\.mode, 'input'\)\.length\) return;/);
});

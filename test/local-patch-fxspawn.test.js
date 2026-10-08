// local patch (docs/LOCAL-PATCH.md 「이펙트 붙는 자리 MP_SPECIAL_0」, user report 2026-10-08): an effect whose `_spawnLocation`
// is 8 (the client's SpawnLocation.MP_SPECIAL_0) plays at the model's SpecialPoint0 bone — 비르투오사's cello
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const FX = new URL('../public/assets/local/fx/cello/cello_skill_03_buff_front_02.json', import.meta.url);

test('fxgame: _spawnLocation 8 follows 비르투오사\'s F_Weapon_Chord / B_Weapon_Chord bone; other spawns keep SPAWN_FRAC', () => {
  const src = readFileSync(new URL('../public/js/render/fxgame.js', import.meta.url), 'utf8');
  assert.match(src, /const SPECIAL_BONES = \{ char_245_cello: \['F_Weapon_Chord', 'B_Weapon_Chord'\] \};/);
  assert.match(src, /if \(def\?\.spawn === 8 && v && SPECIAL_BONES\[/);
  assert.match(src, /const SPAWN_FRAC = \{ 2: 0\.5, 4: 1\.1 \};/, 'the body / head lifts are unchanged');
});

test('the extracted 비르투오사 S3 glow is a _spawnLocation 8 prefab', { skip: !existsSync(FX) && 'no extracted effects' }, () => {
  assert.equal(JSON.parse(readFileSync(FX, 'utf8')).spawn, 8);
});

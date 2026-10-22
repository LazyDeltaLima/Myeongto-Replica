// test/render/fx-face-switch.test.js — the rest of the client's direction / place behaviours (decompile check 2026-10-22,
// docs/rules/fx.md 「이펙트 방향」·「붙는 자리」): SwitchableEffectByFaceDirection (`swFace`: 新约能天使's down copies),
// SwitchableThreeFaceEffect (`three`: 维什戴尔 S3's up copy through the back switch), RandomDirection (`rdir`: 锏 S2),
// FollowTileHeight (`tileH`), and a buff's effect held by its unit while other unheld effects stay where they were made.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faceSwitchCopy } from '../../public/js/render/fx/face.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const load = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));

test('fx_extract.py reads the four root scripts and lists the face copies as emitted', () => {
  assert.match(EXTRACT, /SWITCH_FACE_SCRIPT = -4364771506185570144/);
  assert.match(EXTRACT, /THREE_FACE_SCRIPT = 5365557655193992920/);
  assert.match(EXTRACT, /RANDOM_DIRECTION_SCRIPT = 1115230818793786687/);
  assert.match(EXTRACT, /FOLLOW_TILE_HEIGHT_SCRIPT = 2994498389723426252/);
  assert.match(EXTRACT, /\('swFace', self\.switch_face\), \('three', self\.three_face\), \('rdir', self\.random_direction\),/);
  assert.match(EXTRACT, /for k in \('swFace', 'three'\):/);
});

test('faceSwitchCopy: the copy for the owner\'s faceDirection, none for RIGHT or an empty slot', () => {
  const sw = { down: 'angel2_attack_down_loop_start_01', oneShot: 1 };
  assert.equal(faceSwitchCopy(sw, 'DOWN'), 'angel2_attack_down_loop_start_01');
  assert.equal(faceSwitchCopy(sw, 'UP'), null);
  assert.equal(faceSwitchCopy(sw, 'RIGHT'), null);
  assert.equal(faceSwitchCopy({ up: 'u', down: 'd', left: 'l' }, 'LEFT'), 'l');
  assert.equal(faceSwitchCopy(null, 'DOWN'), null);
});

test('play() swaps in the copy with the owner\'s faceVector; a _oneShot copy runs its own course, else it ends with this one', () => {
  const body = SRC.slice(SRC.indexOf('async function play('), SRC.indexOf('// ---- SwitchableEffectByFaceDirection'));
  assert.match(body, /const copy = faceCopy\(def, ground\.info \? ground : view, b\.bundle\);/);
  assert.match(body, /if \(c\) \{ own = !!def\.swFace\.oneShot; n = copy; def = c; \}/);
  assert.match(body, /const fourWay = !copy && turns\(view\)\.has\(n\);/);
  assert.match(body, /const aimed = !copy && /);
  assert.match(body, /const until = own \? clockS \+ \(def\.duration \|\| 3\) \+ 0\.5 \+ inst\.lead \/ sp\n\s+: buff \? null : endAt \?\? clockS \+ \(n === copy \? dur0 : def\.duration \|\| 3\)/);
  assert.match(body, /cast: own \? null : cast/);
  assert.match(SRC, /function faceCopy\(def, unit, bundle\) \{\n\s+const name = unit \? faceSwitchCopy\(def\?\.swFace, facingDir\(unit\)\) : null;/);
});

test('SwitchableThreeFaceEffect: its up copy is the back switch (the down face is not drawn here)', () => {
  assert.match(SRC, /const b = def\?\.back \|\| \(def\?\.three\?\.up \? \{ effect: def\.three\.up \} : null\);/);
});

test('FxInstance turns an effect with `rdir` to a random vector of its range (FLIP_TWO_SIDE: both sides)', async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const def = { name: 'rdir', duration: 1, nodes: [], materials: [], face: { rot: 1 }, rdir: [-1, -1, 0, 1, 1, 0] };
  const flips = new Set();
  for (let i = 0; i < 40; i++) flips.add(!!new fxp.FxInstance(def, { quality: 'high', facing: 1 }).turn?.flip);
  assert.deepEqual([...flips].sort(), [false, true]);
  const right = { ...def, rdir: [0.5, -1, 0, 1, 1, 0] };
  for (let i = 0; i < 10; i++) assert.equal(new fxp.FxInstance(right, { quality: 'high', facing: -1 }).turn.flip, false, 'x > 0 always: never flipped, whatever the owner faces');
});

test('FollowTileHeight: the frame loop moves the effect\'s height toward its tile\'s by speed × time, at once as it plays', () => {
  assert.match(SRC, /if \(l\.inst\.def\?\.tileH > 0\) stepTileHeight\(l, dt \* rate2\);/);
  const body = SRC.slice(SRC.indexOf('function stepTileHeight('), SRC.indexOf('function setPaused('));
  assert.match(body, /const p = l\.inst\.object\.position, h = tileTop\(p\.x, p\.y\);/);
  assert.match(body, /if \(l\.tileZ == null\) l\.tileZ = h;/);
  assert.match(body, /l\.tileZ \+= Math\.sign\(d\) \* Math\.min\(Math\.abs\(d\), l\.inst\.def\.tileH \* g\);/);
});

test('placement: a buff\'s effect is held by its unit; an unheld cast / hit is put once where it was made', () => {
  assert.match(SRC, /return !v \|\| !v\.info \|\| !at \|\| at\.placed \|\| def\?\.mount \|\| buff \|\| def\?\.face\?\.hold \? at : placedOnce\(v, at\);/);
  assert.match(SRC, /const anchor = lifted\(ground, def, buff\);/);
  assert.match(SRC, /const anchor = frac === 'own' \? lifted\(view, def, true\) :/);
  assert.match(SRC, /if \(!drop\) at = lifted\(at, def, !!entry\.buff\);/);
});

test('the extracts carry the new records (skipped without public/assets)', { skip: !existsSync(path.join(FX, 'angel2')) && 'no extracted fx' }, () => {
  assert.deepEqual(load('angel2/angel2_attack_loop_start_01').swFace, { down: 'angel2_attack_down_loop_start_01', oneShot: 1 });
  assert.deepEqual(load('angel2/angel2_skill_3_begin_start_01').swFace, { down: 'angel2_skill_3_down_begin_start_01' });
  assert.deepEqual(load('wisdel/wisdel_skill_03_start').three, { up: 'wisdel_skill_03_up_start', down: 'wisdel_skill_03_down_start', start: 1 });
  assert.deepEqual(load('blkkgt/blkkgt_skill_02_hit_2').rdir, [-1, -1, 0, 1, 1, 0]);
  assert.equal(load('ines/ines_range_01').tileH, 2);
  assert.equal(load('sbell2/sbell2_ground_01').tileH, 1000);
  const idx = load('index');
  assert.ok(idx.emitted.angel2.includes('angel2_attack_down_loop_start_01'));
  assert.ok(idx.emitted.wisdel.includes('wisdel_skill_03_up_start'));
});

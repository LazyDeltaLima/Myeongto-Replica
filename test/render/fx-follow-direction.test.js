// test/render/fx-follow-direction.test.js — the client's FollowDirection (decompile check 2026-10-22, docs/rules/fx.md
// 「이펙트 방향」): an effect with it on its root is turned again as it plays and every frame after to its owner's direction
// (`_FollowDirection` RVA 0xE81360 → `Effect.Behaviour.FaceTo`) — fx_extract.py `follow`, fx/face.js followDir, the frame
// loop's stepFollow in render/fxgame.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { faceTurn, followDir } from '../../public/js/render/fx/face.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const L = { x: -1, y: 0 }, R = { x: 1, y: 0 };

test('face (no source set): the drawn side as faceVector, reversed with _leftIsDefault', () => {
  assert.deepEqual(followDir({ src: 'face' }, { side: -1 }), L);
  assert.deepEqual(followDir({ src: 'face' }, { side: 1, to: { x: 0, y: 1 } }), R, 'facing up: still its drawn side');
  assert.deepEqual(followDir({ src: 'face', left: 1 }, { side: 1 }), L);
  // a FLIP_TWO_SIDE buff mirrors when its owner turns left, and back
  const buff = { rot: 1 };
  assert.deepEqual(faceTurn(buff, followDir({ src: 'face' }, { side: -1 })), { flip: true });
  assert.deepEqual(faceTurn(buff, followDir({ src: 'face' }, { side: 1 })), { flip: false });
});

test('four: the face vector itself (Entity.m_faceTo); owner: its deploy direction', () => {
  assert.deepEqual(followDir({ src: 'four' }, { side: 1, to: { x: -0.6, y: 0.8 } }), { x: -0.6, y: 0.8 });
  assert.deepEqual(followDir({ src: 'owner' }, { side: 1, deploy: 'UP' }), { x: 0, y: 1 });
  assert.equal(followDir({ src: 'owner' }, { side: 1, deploy: null }), null, 'no deploy direction (an enemy): it keeps its turn');
  // a FOUR_DIRECTION range authored UP lies along a DOWN deploy
  assert.deepEqual(faceTurn({ rot: 2, dir: 0 }, followDir({ src: 'owner' }, { deploy: 'DOWN' })), { z: 180 });
});

test('faceTo: LEFT / RIGHT by the face vector\'s x — straight up counts as left only with _flipWhenFaceToVertical', () => {
  assert.deepEqual(followDir({ src: 'faceTo' }, { to: { x: -0.3, y: 1 } }), L);
  assert.deepEqual(followDir({ src: 'faceTo' }, { to: { x: 0, y: 1 } }), R);
  assert.deepEqual(followDir({ src: 'faceTo', vflip: 1 }, { to: { x: 0, y: 1 } }), L);
  assert.deepEqual(followDir({ src: 'faceTo', left: 1 }, { to: { x: 1, y: 0 } }), L);
});

test('lorr: the drawn side as the client compares it (without _leftIsDefault the other way); move: none', () => {
  assert.deepEqual(followDir({ src: 'lorr' }, { side: -1 }), R);
  assert.deepEqual(followDir({ src: 'lorr', left: 1 }, { side: -1 }), L);
  assert.equal(followDir({ src: 'move' }, { side: 1 }), null);
  assert.equal(followDir(null, { side: 1 }), null);
});

test('the frame loop turns a following effect (once with _onlyFollowOnPlay)', () => {
  assert.match(SRC, /if \(l\.inst\.turn && l\.inst\.def\?\.follow && !\(l\.followed && l\.inst\.def\.follow\.once\)\) stepFollow\(l\);/);
  assert.match(SRC, /function stepFollow\(l\) \{[\s\S]*?followDir\(l\.inst\.def\.follow,[\s\S]*?l\.inst\.applyTurn\(t\);/);
});

test('the extracts carry `follow` (skipped without public/assets)', { skip: !existsSync(path.join(FX, 'agoat2')) && 'no extracted fx' }, () => {
  const load = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));
  assert.deepEqual(load('agoat2/agoat2_skill_02_range_01').follow, { src: 'owner' });
  assert.deepEqual(load('agoat2/agoat2_birth_01').follow, { src: 'faceTo', vflip: 1 });
  assert.deepEqual(load('svash2/svash2_birth_01').follow, { src: 'faceTo', vflip: 1, once: 1 });
  assert.deepEqual(load('ghost2/ghost2_skill_02_buff_01').follow, { src: 'four' });
  assert.equal(load('agoat2/agoat2_skill_02_range_01').face.rot, 2);
});

// 「이펙트 붙는 자리」 (decompile check 2026-10-22): a model-point effect without a FollowMountPoint is placed once — with the
// muzzle's turn for MUZZLE_POINT 3, mirrored as π − θ for a model drawn facing left — and moves with its unit only when held
test('a model-point effect without a mount is placed once; held ones ride with the unit, MUZZLE_POINT takes its turn', () => {
  assert.match(SRC, /if \(!def\?\.mount\) return placedAt\(v, def, key, spawn, at, buff\);/);
  const body = SRC.slice(SRC.indexOf('function placedAt('), SRC.indexOf('const ownerOf = '));
  assert.match(body, /const hold = !!def\?\.face\?\.hold \|\| buff;/);
  assert.match(body, /if \(spawn === 3\) \{[\s\S]*?pointTurn\([\s\S]*?< 0 \? Math\.PI - t : t;/);
  assert.match(body, /get x\(\) \{ first\(\); return hold \? ex\(v\) \+ p0\.x - b0\.x : p0\.x; \}/);
});

test('the extracts carry `_holdByOwner` as face `hold` (skipped without public/assets)', { skip: !existsSync(path.join(FX, 'angel')) && 'no extracted fx' }, () => {
  const load = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));
  assert.equal(load('angel/angle_attack_01_start').face.hold, undefined, '엑시아\'s muzzle flash stays where it was made');
  assert.equal(load('angel/angle_attack_01_start').spawn, 3);
  assert.equal(load('buff/buff_stun').face.hold, 1, 'a status is held');
});

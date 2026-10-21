// test/render/fx-direction.test.js — maintainer report (LOCAL-PATCH.md 「이펙트 방향 — 방향 칸·마운트 회전」): 아르케토 S3's
// cast fan stood upright whatever her facing. Two causes: the directional copies of an emitter entry (`_effects` slots
// 0 UP, 1 RIGHT, 2 DOWN, 3 LEFT, picked by `_directionType`) were all played or dropped by name, and a FollowMountPoint
// with `_keepOriginRotation` 0 did not take its point's bone turn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirCopies } from '../../public/js/render/fxgame.js';
import { pointTurn } from '../../public/js/render/fxpoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const FAN = path.join(ROOT, 'public/assets/local/fx/archet/archet_skill_03_start.json');

const ARCHET = MODES.char_332_archet.dirs;
const S3_CAST = MODES.char_332_archet.cast[1];

test('char_modes.py records the client\'s directional slots (아르케토 S3 start_02: U_OR_D)', () => {
  assert.deepEqual(ARCHET, [{ t: 2, s: ['archet_skill_03_start_02', '', 'archet_skill_03_start_02_B', ''] }]);
  // the binding itself still lists both copies — the pick is the player's
  assert.ok(S3_CAST.includes('archet_skill_03_start_02') && S3_CAST.includes('archet_skill_03_start_02_B'));
  // 16 operators carry such entries (13 of the maintainer's list + 데겐블레허 S2 from skills.ab + 克莱门莎 and 予愿安洁莉娜, CN client)
  assert.equal(Object.values(MODES).filter((m) => m && Array.isArray(m.dirs)).length, 16);
});

test('U_OR_D: facing up plays the UP copy, every other facing the DOWN one — never both', () => {
  const pick = (d, left = false) => dirCopies(ARCHET, S3_CAST, d, left).names;
  assert.deepEqual(pick(0), ['archet_skill_03_start', 'archet_skill_03_start_02', 'archet_skill_03_start_01']);
  for (const [d, left] of [[1, false], [2, false], [3, true]]) {
    assert.deepEqual(pick(d, left), ['archet_skill_03_start', 'archet_skill_03_start_02_B', 'archet_skill_03_start_01']);
  }
});

test('FOUR_DIR: the facing\'s own copy, the up / down copies the name rule used to drop come back', () => {
  const g = MODES.char_1023_ghost2.dirs;
  const base = ['ghost2_skill_03_start_02'];
  assert.deepEqual(dirCopies(g, base, 0, false).names, ['ghost2_skill_03_start_02_up']);
  assert.deepEqual(dirCopies(g, base, 1, false).names, ['ghost2_skill_03_start_02']);
  assert.deepEqual(dirCopies(g, base, 2, false).names, ['ghost2_skill_03_start_02_down']);
  assert.deepEqual(dirCopies(g, base, 3, true).names, ['ghost2_skill_03_start_02']);
});

test('L_OR_R: the side\'s own copy, not mirrored again; NONE: slot 0; an empty slot plays nothing', () => {
  const lr = [{ t: 1, s: ['', 'bpipe_skill_03_start_02_right', '', 'bpipe_skill_03_start_02_left'] }];
  const right = dirCopies(lr, ['bpipe_skill_03_start_02_right'], 1, false);
  assert.deepEqual(right.names, ['bpipe_skill_03_start_02_right']);
  const left = dirCopies(lr, ['bpipe_skill_03_start_02_right'], 3, true);
  assert.deepEqual(left.names, ['bpipe_skill_03_start_02_left']);
  assert.ok(left.unflip.has('bpipe_skill_03_start_02_left'), 'a copy authored for the left is not mirrored');
  const none = [{ t: 0, s: ['wisdel_skill_03_start', 'wisdel_skill_03_start', 'wisdel_skill_03_down_start', 'wisdel_skill_03_start'] }];
  assert.deepEqual(dirCopies(none, ['wisdel_skill_03_start'], 2, false).names, ['wisdel_skill_03_start']);
  const ud = [{ t: 2, s: ['', '', 'x_down', ''] }];
  assert.deepEqual(dirCopies(ud, ['a', 'x_down'], 0, false).names, ['a']);
  assert.deepEqual(dirCopies(null, ['a', 'b'], 0, false).names, ['a', 'b']);
});

test('pointTurn: the bone\'s world rotation (radians, y up) when the point turns with it, else null', () => {
  const sk = { findBone: (n) => (n === 'F_Muzzle' || n === 'B_Muzzle' ? { getWorldRotationX: () => -90 } : null) };
  const entry = { F: { bone: 'F_Muzzle', rot: 1, at: [168, 230] }, B: { bone: 'B_Muzzle', rot: 1, at: [169, 243] } };
  // the runtime's y-down angle −90° is the client's +90° (her fan opens behind her — maintainer 2026-10-08)
  assert.equal(pointTurn(entry, sk, false), Math.PI / 2);
  assert.equal(pointTurn(entry, sk, true), Math.PI / 2);
  assert.equal(pointTurn({ F: { bone: 'F_Muzzle', rot: 0 } }, sk, false), null, 'a point that does not turn');
  assert.equal(pointTurn({ F: { at: [0, 400] } }, sk, false), null, 'a fixed spot');
  assert.equal(pointTurn(entry, null, false), null);
});

test('a mounted effect with _keepOriginRotation 0 turns its root about the board normal every frame', () => {
  assert.match(SRC, /const turns = def\?\.mount && def\.mount\.keepOriginRotation === 0;/);
  // every frame (2026-10-10, decompile check: client FollowMountPoint._FollowMountPoint each LateUpdate) — no first-frame copy
  assert.match(SRC, /get rot\(\) \{ return turns \? pointTurn\(ptsOf\(v\)\?\.\[key\]/);
  assert.doesNotMatch(SRC, /turn0 \?\?=/);
  assert.match(SRC, /if \(r != null && l\.inst\.nodes\?\.\[0\]\) l\.inst\.nodes\[0\]\.rotation\.set\(0, 0, r\);/);
  // the directional pick runs on every play()
  assert.match(SRC, /const \{ names, unflip \} = dirPick\(view, given \|\| effectsFor\(b\.prefabs, kind, skillIndex\)[^;]*\);/);
});

test('the extracted fan carries its mount (skipped without public/assets)', { skip: !existsSync(FAN) && 'no extracted fx' }, () => {
  const d = JSON.parse(readFileSync(FAN, 'utf8'));
  assert.equal(d.mount?.type, 2, 'MUZZLE');
  assert.equal(d.mount?.keepOriginRotation, 0);
});

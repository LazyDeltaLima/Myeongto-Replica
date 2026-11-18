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
import { NO_DATA, withLayer } from '../helpers/fxDryLayer.js';
import { pointScale, pointTurn, pointTurnOn, pointUp, rootTurn } from '../../public/js/render/fxpoints.js';

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
  // 28 operators carry such entries (키치세이's attack and skill starts, 2026-11-07, EN client; 13 of the maintainer's list + 데겐블레허 S2 from skills.ab + 克莱门莎, 予愿安洁莉娜 and
  // 冻河's attack start (2026-11-01), CN client; 斥罪, 逻各斯 and 薇薇安娜, 2026-11-03, EN client; 怒潮凛冬's S3 fifth hammer,
  // 2026-11-03, EN client; 涤火杰西卡's attack and skill starts, 2026-11-04, EN client; 矩's attack and S1 starts, 2026-11-05, EN client; 可露希尔's attack and skill starts, 2026-11-06, EN client; 历阵锐枪芬's S2 attack and 摆渡人's attack, 2026-11-06, EN client; 烈夏's attack and S2 starts, 2026-11-06, EN client; 国度's S3 range and start, 2026-11-08, CN client; 赫德雷's S3 start, 2026-11-08, EN client;
  // 机械师's attack and skill starts, 2026-11-08, CN client; 奥尔佳's attack and skill starts, 2026-11-08, CN client)
  assert.equal(Object.values(MODES).filter((m) => m && Array.isArray(m.dirs)).length, 32);
});

test('U_OR_D: facing up plays the UP copy, every other facing the DOWN one — never both', () => {
  const pick = (d, left = false) => dirCopies(ARCHET, S3_CAST, d, left).names;
  assert.deepEqual(pick(0), ['archet_skill_03_start', 'archet_skill_03_start_02', 'archet_skill_03_start_01']);
  for (const [d, left] of [[1, false], [2, false], [3, true]]) {
    assert.deepEqual(pick(d, left), ['archet_skill_03_start', 'archet_skill_03_start_02_B', 'archet_skill_03_start_01']);
  }
});

// 2026-11-07 (official client: TryGetEffect reads the owner's `faceToBack` = CharacterAnimator m_activeFace == _back): U_OR_D,
// UD_OR_LR and FOUR_DIR_FIXED go by the model shown, not the facing. A unit turned up and then to a side keeps its Back model
// (FaceSwitcher.StartSwitch keeps the up / down half for a side), so its side swing plays the UP copy; a Front model held
// facing up (forceFaceFront) plays the DOWN one.
test('U_OR_D / UD_OR_LR / FOUR_DIR_FIXED: by the Back model shown (`faceToBack`), not by the facing', () => {
  const pick = (d, left, back) => dirCopies(ARCHET, S3_CAST, d, left, back).names;
  assert.ok(pick(3, true, true).includes('archet_skill_03_start_02'), 'back model, facing left: the UP copy');
  assert.ok(!pick(3, true, true).includes('archet_skill_03_start_02_B'));
  assert.ok(pick(0, false, false).includes('archet_skill_03_start_02_B'), 'front model facing up: the DOWN copy');
  const ud = [{ t: 4, s: ['a_up', 'a_right', 'a_down', 'a_left'] }];
  assert.deepEqual(dirCopies(ud, ['a_up'], 1, false, true).names, ['a_up']);
  assert.deepEqual(dirCopies(ud, ['a_up'], 0, false, false).names, ['a_down']);
  // FOUR_DIR_FIXED (클로저's attack start): back → slot 0, else facing down → slot 2, else the drawn side
  const fixed = [{ t: 5, s: ['c_back', 'c', 'c_down', 'c'] }];
  assert.deepEqual(dirCopies(fixed, ['c'], 1, false, true).names, ['c_back']);
  assert.deepEqual(dirCopies(fixed, ['c'], 0, false, false).names, ['c']);
  assert.deepEqual(dirCopies(fixed, ['c'], 2, false, true).names, ['c_back']);
  assert.deepEqual(dirCopies(fixed, ['c'], 2, false, false).names, ['c_down']);
  assert.deepEqual(dirCopies(fixed, ['c'], 3, true, false).names, ['c']);
  // with no `back` given, the old default: facing up
  assert.deepEqual(dirCopies(fixed, ['c'], 0, false).names, ['c_back']);
});

test('the layer picks by the view\'s Back model (`_wantsBack`): 矩 and 클로저 striking sideways with their Back model', { skip: NO_DATA }, () => withLayer(async ({ layer, unit, take }) => {
  const view = (id, defId, dir4, back) => Object.assign(unit(id, 'ally', defId), { face: { lr: dir4 === 'LEFT' ? -1 : 1, ud: back ? 'UP' : 'DOWN', dir4 }, _wantsBack: () => back });
  const has = (list, n) => list.some((x) => x.split('@')[0] === n);
  const swing = (v) => {
    const views = new Map([[v.id, v], [9, unit(9, 'enemy', 'enemy_x', 2)]]);
    layer.onEvent(['deploy', v.id], views);
    layer.update(0.1);
    take();
    layer.onEvent(['swing', v.id, 0.2, 'none', 0, 9], views);
    layer.update(0.3);
    layer.onEvent(['atk', v.id, 9, 'none'], views);
    const got = take();
    layer.update(2);
    take();
    return got;
  };
  // 矩's attack start (U_OR_D): slot 0 ju_attack_01_start_02, slot 2 ju_attack_01_start_01
  let a = swing(view(1, 'char_4221_ju', 'RIGHT', true));
  assert.ok(has(a, 'ju_attack_01_start_02') && !has(a, 'ju_attack_01_start_01'), `back model, right: ${a}`);
  a = swing(view(2, 'char_4221_ju', 'RIGHT', false));
  assert.ok(has(a, 'ju_attack_01_start_01') && !has(a, 'ju_attack_01_start_02'), `front model, right: ${a}`);
  a = swing(view(3, 'char_4228_closur', 'LEFT', true));
  assert.ok(has(a, 'closur_attack_start_01_back') && !has(a, 'closur_attack_start_01'), `back model, left: ${a}`);
  a = swing(view(4, 'char_4228_closur', 'UP', false));
  assert.ok(has(a, 'closur_attack_start_01') && !has(a, 'closur_attack_start_01_back'), `front model held facing up: ${a}`);
}));

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

test('pointUp (2026-11-02, MountPoint.get_faceTo): the point Transform\'s up on the board — the bone\'s turn, π − t when flipped, y × cos 30°', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  const c30 = Math.cos(Math.PI / 6);
  const at = (deg) => ({ findBone: (n) => (n === 'F_Muzzle' ? { getWorldRotationX: () => deg } : null) });
  const entry = { F: { bone: 'F_Muzzle', rot: 1 } };
  assert.ok(near(pointUp(entry, at(0), false, 1), [0, c30]), 'an unturned gun: the board\'s y axis');
  assert.ok(near(pointUp(entry, at(-90), false, 1), [-1, 0]), 'turned +90° (Unity): its up points left');
  // facing left the client's bone reads π − t and the flip is a negative y scale, which Transform.up ignores
  assert.ok(near(pointUp(entry, at(-90), false, -1), [-1, 0]));
  assert.ok(near(pointUp(entry, at(0), false, -1), [0, -c30]));
  assert.ok(near(pointUp({ F: { at: [0, 400] } }, at(-90), false, -1), [0, c30]), 'a point that does not turn: the Graphic\'s up');
  assert.ok(near(pointUp(entry, null, false, 1), [0, c30]));
});

test('pointTurnOn / rootTurn (2026-11-18, maintainer report: 바르카리스 S2 weapon effect, 고프닉 aura): a point\'s turn on a model drawn facing left is π − t, and a mirrored root is set so that it shows that', () => {
  const sk = { findBone: (n) => (n === 'C_Weapon_D_I' ? { getWorldRotationX: () => -30 } : null) };
  const entry = { F: { bone: 'C_Weapon_D_I', rot: 1 } };
  const t = Math.PI / 6;
  assert.ok(Math.abs(pointTurnOn(entry, sk, false, 1) - t) < 1e-9, 'facing right: the bone\'s turn');
  assert.ok(Math.abs(pointTurnOn(entry, sk, false, -1) - (Math.PI - t)) < 1e-9,
    'facing left the client\'s flipped skeleton gives π − t (docs/rules/fx.md 「마운트 회전」): an unmirrored effect must turn to the other side');
  assert.equal(pointTurnOn({ F: { bone: 'C_Weapon_D_I', rot: 0 } }, sk, false, -1), null, 'a point that does not turn');
  assert.equal(rootTurn(0.4, 1), 0.4);
  assert.ok(Math.abs(rootTurn(Math.PI - t, -1) - t) < 1e-9, 'inside a mirror (followScaleSign): the mirrored root shows π − t');
  // one entry: fxgame.js never reads the unmirrored bone angle itself (the cause — the mount path took pointTurn as is)
  assert.doesNotMatch(SRC, /\bpointTurn\(/, 'fxgame.js reads a point\'s turn only through fxpoints.js pointTurnOn (docs/rules/fx.md 「마운트 회전」)');
  assert.match(SRC, /const drawnSide = \(v\) => \(Number\.isFinite\(v\?\.modelSX\)/);
});

test('pointScale (2026-10-27, BoneFollower.DoLateUpdate): the bone\'s local scale with `ls` 1, its world scale with 2, else 1; null without the bone', () => {
  const bone = { scaleX: 1.4, scaleY: 0.6, getWorldScaleX: () => 0.5, getWorldScaleY: () => 0.25 };
  const sk = { findBone: (n) => (n === 'F_Weapon' ? bone : null) };
  assert.deepEqual(pointScale({ F: { bone: 'F_Weapon', rot: 1, ls: 1 } }, sk, false), [1.4, 0.6]);
  assert.deepEqual(pointScale({ F: { bone: 'F_Weapon', ls: 2 } }, sk, false), [0.5, 0.25]);
  assert.deepEqual(pointScale({ F: { bone: 'F_Weapon', rot: 1 } }, sk, false), [1, 1], 'no followLocalScale');
  assert.deepEqual(pointScale({ F: { bone: 'F_Weapon2', ls: 1 }, B: { bone: 'F_Weapon', ls: 1 } }, sk, false), [1.4, 0.6], 'the other side\'s bone');
  assert.equal(pointScale({ F: { at: [0, 400] } }, sk, false), null, 'a fixed spot');
  assert.equal(pointScale({ F: { bone: 'F_Weapon', ls: 1 } }, null, false), null);
  // fxgame: a `_followScale` mount reads it as `scale`
  assert.match(SRC, /get scale\(\) \{ return grows \? pointScale\(ptsOf\(v\)\?\.\[key\], v\.actor\?\.spine\?\.skeleton, !!v\.entryBack\) : null; \}/);
});

test('a mounted effect with _keepOriginRotation 0 turns its root about the board normal every frame', () => {
  assert.match(SRC, /const turns = def\?\.mount && def\.mount\.keepOriginRotation === 0;/);
  // every frame (2026-10-10, official client: FollowMountPoint._FollowMountPoint each LateUpdate) — no first-frame copy
  assert.match(SRC, /get rot\(\) \{ return turns \? pointTurnOn\(ptsOf\(v\)\?\.\[key\], v\.actor\?\.spine\?\.skeleton, !!v\.entryBack, drawnSide\(v\)\) : null; \}/);
  assert.doesNotMatch(SRC, /turn0 \?\?=/);
  assert.match(SRC, /if \(r != null && l\.inst\.nodes\?\.\[0\]\) l\.inst\.nodes\[0\]\.rotation\.set\(0, 0, rootTurn\(r, l\.inst\.unity\?\.scale\?\.x \?\? 1\)\);/);
  // the directional pick runs on every play()
  assert.match(SRC, /const \{ names: picked, unflip \} = dirPick\(view, given \|\| effectsFor\(b\.prefabs, kind, skillIndex\)[^;]*\);/);
});

test('the extracted fan carries its mount (skipped without public/assets)', { skip: !existsSync(FAN) && 'no extracted fx' }, () => {
  const d = JSON.parse(readFileSync(FAN, 'utf8'));
  assert.equal(d.mount?.type, 2, 'MUZZLE');
  assert.equal(d.mount?.keepOriginRotation, 0);
});

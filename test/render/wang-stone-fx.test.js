// test/render/wang-stone-fx.test.js — 望's stone effects, user re-report 2026-10-08 (LOCAL-PATCH.md 「사용자 제보 3차」):
// #2-1 the activation wisps flashed once (dropped after their clip; the stones linked in the prep never showed them —
// their 'wangLink' sat in the pre-entry buffer, which dropped fx), #2-2 the birth cross sat on the ball, off its tile,
// #2-7 the blast drew more than the client plays (token_wang_skill_03_hit_03 2 tiles off, the hit effects at the stone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stoneBlastFx, inStoneBlast } from '../../public/js/render/fxgame.js';
import { keepEarly } from '../../public/js/screens/game/early.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const prefab = (bundle, name) => JSON.parse(readFileSync(path.join(FX, bundle, `${name}.json`), 'utf8'));
const haveFx = existsSync(path.join(FX, 'wang_token', 'token_wang_01_buff.json')) && existsSync(path.join(FX, 'wang', 'wang_passive_01_buff_02.json'));

test('#2-7 a stone blast plays the client\'s cast effect at the stone and its hit effect on the enemies only', () => {
  assert.deepEqual(stoneBlastFx(1), { at: ['token_wang_skill_01_hit'], target: null });
  assert.deepEqual(stoneBlastFx(2), { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' });
  assert.deepEqual(stoneBlastFx(2, true), { at: ['token_wang_skill_02_hit'], target: 'token_wang_skill_02_hit_02' });
  assert.deepEqual(stoneBlastFx(3), { at: ['token_wang_skill_03_hit'], target: null });
  assert.deepEqual(stoneBlastFx(3, true), { at: ['token_wang_skill_03_hit'], target: 'token_wang_skill_03_hit_02' });
  for (const s of [1, 2, 3]) for (const f of [false, true]) {
    const fx = stoneBlastFx(s, f);
    assert.ok(![...fx.at, fx.target].includes('token_wang_skill_03_hit_03'), 'the unreferenced offset copy is never played');
  }
  // the hit effects go through the 'dmg' of the same moment (stoneHit before pendingHit)
  assert.match(SRC, /if \(stoneHit\(tid, views\)\) return;[^\n]*\n\s+if \(pendingHit\(tid, views\)\) return;/);
});

test('#2-7 the blast areas match the kit (op-wang.js trigger): own tile, S2 link lines ±3, S3 x-1 diamond', () => {
  const tiles = (skill, axes) => {
    const out = [];
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (inStoneBlast(skill, axes, dx, dy)) out.push([dx, dy]);
    return out;
  };
  assert.deepEqual(tiles(1), [[0, 0]]);
  assert.equal(tiles(3).length, 13);
  assert.ok(tiles(3).every(([x, y]) => Math.abs(x) + Math.abs(y) <= 2));
  assert.deepEqual(tiles(2, ['h']).map(([x, y]) => `${x},${y}`).sort(), ['-1,0', '-2,0', '-3,0', '0,0', '1,0', '2,0', '3,0']);
  assert.deepEqual(tiles(2, ['v']).map(([x, y]) => `${x},${y}`).sort(), ['0,-1', '0,-2', '0,-3', '0,0', '0,1', '0,2', '0,3']);
  assert.equal(tiles(2, ['h', 'v']).length, 13);
  // an enemy a little off the tile centre (walking) still counts by its tile
  assert.ok(inStoneBlast(3, null, 1.4, 0.6));
  assert.ok(!inStoneBlast(3, null, 2.4, 0.6));
});

test('#2-1 the pre-entry buffer keeps a stone\'s wangLink (the prep-linked stones activate before the view enters)', () => {
  assert.ok(keepEarly(['fx', 'wangLink', 5, 10, { id: 7, axes: ['v'], first: true }]));
  assert.ok(!keepEarly(['fx', 'zone', 5, 10, { token: 'token_10064_wang_stone1' }]), 'a blast is cosmetic: not replayed');
  assert.ok(!keepEarly(['fx', 'summon', 5, 10, { id: 7 }]));
  assert.ok(keepEarly(['spawn', { id: 7 }]));
});

test('#2-1 the activation effect is kept on the stone\'s ball until its die', () => {
  // activation (STONE_ON): bound to the stone view and kept (playAt keep) until its 'die'
  assert.match(SRC, /const on = isStone\(sv\) \? \{ at: ballOf\(sv\), owner: o\.id, keep: true \} : \{ at: onBall \};/);
  assert.match(SRC, /if \(l\.inst\.done && !\(l\.keep && !l\.inst\.stopping\)\) \{ dropLive\(l\); live\.splice\(i, 1\); \}/);
  // the 3-second replay of the 跟子's rings (637a43e0, an assumption) is gone
  assert.doesNotMatch(SRC, /FOLLOWER_CYCLE|l\.cycle/);
});

test('#2-2 the birth effects (the gold cross, the 跟子\'s rings) play on the stone\'s ground, not on its ball', () => {
  // births (STONE_BORN): the view itself (its ground), never the ball anchor
  assert.match(SRC, /playAt\(\[STONE_BORN\.follower\], v, \{ owner: o\.id, under: true, bundle: FOLLOWER_FX \}\)/);
  assert.match(SRC, /playAt\(\[STONE_BORN\.stone\], v, \{ owner: o\.id, under: true \}\)/);
  assert.match(SRC, /playAt\(\[STONE_BORN\.stone\], v, \{ owner: id, under: true \}\)/);
  assert.doesNotMatch(SRC, /STONE_BORN\.[a-z]+\], ballOf/);
});

test('#2-1 the extracted activation prefabs: wisps that dissolve in and stay (skipped without public/assets)', { skip: !haveFx && 'no extracted fx' }, () => {
  // the activation wisps (`line` meshes) dissolve IN (_Amount 1 → ~0) and stay: nothing ends them but the effect
  for (const [b, n] of [['wang_token', 'token_wang_01_buff'], ['wang', 'wang_passive_01_buff_02']]) {
    const d = prefab(b, n);
    const amount = d.clips[0].tracks.filter((t) => t.prop === 'mat:_Amount');
    assert.ok(amount.length >= 4, n);
    for (const t of amount) {
      const keys = t.curves[0].filter((k) => k[0] > -1e30);
      assert.equal(keys[0][4], 1, `${n} starts dissolved`);
      assert.ok(keys[keys.length - 1][4] < 0.05, `${n} ends shown`);
    }
    assert.ok(d.nodes.some((x) => x.mesh && x.active !== false && /^line/.test(x.name)), `${n} has its wisp meshes`);
  }
  // a placed stone's birth effect has the wisps but off: they come with its activation only
  const birth0 = prefab('wang_token', 'token_wang_birth_01_buff');
  assert.ok(birth0.nodes.filter((x) => x.name === 'line' || x.name === 'line1').every((x) => x.active === false));
});

test('#2-2 the extracted birth cross: flat 1-tile looping quads at the root (skipped without public/assets)', { skip: !haveFx && 'no extracted fx' }, () => {
  const birth = prefab('wang_token', 'token_wang_birth_01_buff');
  // its looping cross: flat 1-tile quads at the root's ground (no height of their own)
  const sz = birth.nodes.filter((x) => x.ps && /^sz/.test(x.name));
  assert.ok(sz.length && sz.every((x) => x.ps.loop && x.ps.render.align === 2 && x.ps.size.s === 1 && x.pos.every((c) => c === 0)));
});

test('#2-7 the extracted token_wang_skill_03_hit_03 is the S3 blast again, 2 tiles off (skipped without it)', { skip: !existsSync(path.join(FX, 'wang_token', 'token_wang_skill_03_hit_03.json')) && 'no extracted fx' }, () => {
  // token_wang_skill_03_hit_03: every system 2 tiles off the root along its rotation_z — the S3 blast again, beside it
  const h3 = prefab('wang_token', 'token_wang_skill_03_hit_03');
  const sys = h3.nodes.filter((x) => x.ps);
  assert.ok(sys.length > 10 && sys.every((x) => x.pos[0] === 2), 'offset copy');
});

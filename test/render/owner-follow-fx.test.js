// test/render/owner-follow-fx.test.js — the field-less effect scripts read from the official client (2026-10-25,
// docs/rules/fx.md 「추출 누락 보고」): FollowOwner (`followOwner`: at its point every frame), FollowOwnerRootTileHeight
// (`rootTile`: at the height its owner stands on), PauseEffectIfNotMove (`pauseMove`: an enemy owner not moving by
// itself pauses it), and a RectTransform node read as a Transform.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { movePause } from '../../public/js/render/fx/pause.js';
import { PAUSE_KEYS } from '../../public/js/render/fxplayer.js';
import { ANIM } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const COVERAGE = readFileSync(path.join(ROOT, 'tools/local-extract/fx_coverage.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const load = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));

test('PauseEffectIfNotMove: an enemy owner that is not walking pauses it; any other owner leaves it', () => {
  const enemy = (anim) => ({ info: { side: 'enemy' }, anim });
  assert.equal(movePause(enemy(ANIM.MOVE)), false);
  for (const a of [ANIM.IDLE, ANIM.ATTACK, ANIM.SKILL, ANIM.STUN]) assert.equal(movePause(enemy(a)), true);
  assert.equal(movePause({ info: { side: 'ally' }, anim: ANIM.IDLE }), null, 'not an Enemy: the cast fails, nothing done');
  assert.equal(movePause({ info: { side: 'enemy' } }), null, 'no animation state yet');
  assert.equal(movePause(null), null);
  assert.ok(PAUSE_KEYS.includes('pauseMove'));
  assert.match(SRC, /\} else if \(pz\.k === 'pauseMove'\) \{\n        const x = movePause\(v\);\n        if \(x != null\) l\.pzSelf = x;/);
});

test('FollowOwner and FollowOwnerRootTileHeight: placed again every frame / at the height the owner stands on', () => {
  // a FollowOwner effect is never put once (placedOnce); at a model point its point and turn are read every frame
  assert.match(SRC, /def\?\.face\?\.hold \|\| def\?\.followOwner \? at : placedOnce\(v, at\);\n    return def\?\.rootTile && v && r \? onRootTile\(v, r\) : r;/);
  assert.match(SRC, /const follow = !!def\?\.followOwner;[^\n]*\n    let p0 = null, b0 = null, r0 = null;\n    const first = \(\) => \{\n      if \(p0 && !follow\) return;/);
  assert.match(SRC, /function onRootTile\(v, at\) \{\n    return \{\n      get x\(\) \{ return at\.x; \}, get y\(\) \{ return at\.y; \}, get z\(\) \{ return v\.z \|\| 0; \}/);
  // 浮空's effect goes through the status anchor
  assert.match(SRC, /\(view\.z \|\| 0\) \+ \(def\.rootTile \? 0 : view\.hover \|\| 0\)/);
});

test('fx_extract.py reads the three scripts and a RectTransform node; the coverage table knows them', () => {
  assert.match(EXTRACT, /FOLLOW_OWNER_SCRIPT = -2862109401119915025\nROOT_TILE_SCRIPT = -1576532863054725745\nPAUSE_MOVE_SCRIPT = -1569843327534094582/);
  assert.match(EXTRACT, /if t in \('Transform', 'RectTransform'\):/);
  assert.match(EXTRACT, /out_def\.update\(self\.owner_follow\(root\)\)/);
  assert.match(COVERAGE, /'FollowOwner', 'FollowOwnerRootTileHeight', 'PauseEffectIfNotMove'\}/);
  assert.match(COVERAGE, /COMPONENTS_READ = \{'Transform', 'RectTransform',/);
  for (const k of ['component:RectTransform', 'script:FollowOwner\'', 'script:FollowOwnerRootTileHeight', 'script:PauseEffectIfNotMove']) {
    assert.ok(!COVERAGE.includes(`'${k}`), `${k} is read, not a known gap`);
  }
});

test('the extracts carry them (skipped without public/assets)', { skip: !existsSync(path.join(FX, 'flower')) && 'no extracted fx' }, () => {
  assert.equal(load('flower/flower_attack_01_start').followOwner, 1);
  assert.equal(load('hsguma/hsguma_attack_01_start').followOwner, 1);
  assert.equal(load('common/common_levitate_01').rootTile, 1);
  const nodes = (n, out = []) => { if (Array.isArray(n)) n.forEach((c) => nodes(c, out)); else if (n && typeof n === 'object') { out.push(n); Object.values(n).forEach((c) => nodes(c, out)); } return out; };
  if (existsSync(path.join(FX, 'mcmstr/mcmstr_buff_03_start.json'))) {
    assert.ok(nodes(load('mcmstr/mcmstr_buff_03_start')).some((n) => n.pauseMove === 1), 'its pauseMove node');
  }
});

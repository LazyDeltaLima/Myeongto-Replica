// test/render/disappear-fx.test.js — two effect behaviours the sim now tells the view about (2026-11-20, official client;
// docs/rules/fx.md 「사라진 적의 이펙트 멈춤」·「블랙보드 값으로 고르는 이펙트」):
// - PauseEffectIfDisappeared (`pauseGone`: 隐德来希's five hit effects) and LineEffectEmitterDynamic `_pauseWhenDisappear`
//   (`lineDyn.gonePause`: her S3 line) pause while the enemy is disappeared — the sim's ['hide', id, 1|0] (Battle._setHidden:
//   a DISAPPEAR leg, a 驮兽 passenger), which the snapshot alone cannot tell from a leak;
// - SwitchableEffectByBlackboardValue (`swBB`: 灼藤's enemy_ftsjc_buff) shows `_effects[v − 1]` for the value of its buff's
//   blackboard key — the sim's count of the status standing for enemy_ftsjc[first_attack] (its fx 'stacks', effect_level).
// No three.js here: the live loop is checked in its source, the sim on a battle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAUSE_KEYS } from '../../public/js/render/fxplayer.js';
import { makeBattle } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('public/js/render/fxgame.js');
const EXTRACT = read('tools/local-extract/fx_extract.py');
const COVERAGE = read('tools/local-extract/fx_coverage.py');
const FX = path.join(ROOT, 'public/assets/local/fx');
const load = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));
const fn = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to, SRC.indexOf(from)));

const arena = () => makeBattle({ content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600 });
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 } });

test('sim: an enemy hidden and shown again sends [\'hide\', id, 1|0], with or without its disappear effect (Battle._setHidden)', () => {
  const h = arena();
  h.step();
  const e = put(h, 'enemy_1007_slime', [10, 5]);
  for (const fx of [true, false]) {
    h.events.length = 0;
    h.b._setHidden(e, true, { fx });
    h.b._setHidden(e, true, { fx });   // no change: nothing sent
    h.b._setHidden(e, false, { fx });
    h.step();
    assert.deepEqual(h.eventsOf('hide').map((x) => x.slice(1)), [[e.id, 1], [e.id, 0]], `fx ${fx}: the view's disappeared flag (docs/rules/fx.md 「사라진 적의 이펙트 멈춤」)`);
    assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'disappear' || x[1] === 'appear').length, fx ? 2 : 0);
  }
  // a hidden-tab backlog and a catch-up frame keep it (battle/runner.js keepsState): a lost show would hold the effects paused
  assert.match(read('public/js/battle/runner.js'), /const STATE_EV = new Set\(\[[^\]]*'hide'[^\]]*\]\);/);
});

test('sim: 灼藤\'s ramp status names enemy_ftsjc[first_attack] and counts its effect_level — 1, 2 from half the ramp, 3 from 99 %', () => {
  const h = arena();
  h.step();
  const v = put(h, 'enemy_10067_ftsjc', [10, 5]);
  const t0 = h.b.time;
  const seen = [];
  for (let i = 0; i < 60 * 30 && seen.length < 3; i++) {
    h.step();
    for (const x of h.events.splice(0)) {
      if (x[0] === 'status' && x[1] === v.id && x[2] === 'ab:pow' && x[3] === 1) {
        assert.equal(x[5]?.fx, 'buff:enemy_ftsjc[first_attack]', 'its fxTag: the client buff whose effect is enemy_ftsjc_buff');
        assert.equal(seen.length, 0, 'the status comes before its first count');
      }
      if (x[0] === 'fx' && x[1] === 'stacks' && x[4]?.id === v.id) seen.push([x[4].buff, x[4].n, h.b.time - t0]);
    }
  }
  assert.deepEqual(seen.map((s) => s.slice(0, 2)), [['ab:pow', 1], ['ab:pow', 2], ['ab:pow', 3]], 'one count per stage, in order');
  // the ramp's time from the talent (pow.time 50 s) ticked every 0.5 s: half at 25 s, 0.99 at 49.5 s
  assert.ok(Math.abs(seen[1][2] - 25) < 0.6, `stage 2 at ${seen[1][2]}`);
  assert.ok(Math.abs(seen[2][2] - 49.5) < 0.6, `stage 3 at ${seen[2][2]}`);
});

test('fxgame.js: the disappeared set follows the sim\'s \'hide\' and is cleared with the unit', () => {
  assert.match(SRC, /else if \(e\[0\] === 'hide'\) \{ if \(e\[2\]\) disappeared\.add\(e\[1\]\); else disappeared\.delete\(e\[1\]\); \}/);
  assert.match(SRC, /if \(e\[0\] === 'die'\) \{ gone\.add\(e\[1\]\); onField\.delete\(e\[1\]\); disappeared\.delete\(e\[1\]\); \}/);
  assert.match(SRC, /gone\.clear\(\); disappeared\.clear\(\); bbSwitches\.length = 0;/);
});

test('fxgame.js PauseEffectIfDisappeared: paused while the unit it sits on is disappeared, its end waiting; put on the new view as it shows', () => {
  assert.ok(PAUSE_KEYS.includes('pauseGone'));
  assert.match(SRC, /\} else if \(pz\.k === 'pauseGone'\) \{\n        l\.pzSelf = goneHold\(l, pz, dtGame\);/);
  assert.match(SRC, /if \(l\.inst\.pausers\?\.length\) stepPauses\(l, dt \* rate2\);/);
  const g = fn('function goneHold(', 'function stepPauses(');
  assert.match(g, /if \(id != null && disappeared\.has\(id\)\) \{\n      pz\.held = true; pz\.wait = null;\n      if \(l\.until != null\) l\.until \+= dtGame;/, 'a paused effect does not run: its end waits');
  assert.match(g, /if \(gone\.has\(id\)\) \{ pz\.held = false; if \(!l\.inst\.stopping\) l\.inst\.stop\(\); return false; \}/, 'died while hidden: it ends');
  assert.match(g, /l\.view = lifted\(v, l\.inst\.def, !!l\.buff\);/, 'the old view left the board: the new one carries it');
  // a hit effect's client owner is its target (HitEffectOptions.OnCastOnTarget): play()'s anchor carries the ground's id
  assert.match(SRC, /const sitsOn = \(l\) => \(l\.unit \? ownerOf\(l\.unit\) : l\.view\?\.info \? l\.view\.id : l\.on \?\? l\.owner\) \?\? null;/);
});

test('fxgame.js `_pauseWhenDisappear`: the line and its start effect pause while an end is disappeared, its buff running on', () => {
  const s = fn('function stepLines()', 'const reb = rec.dyn?.endDead');
  assert.match(s, /if \(rec\.dyn\?\.gonePause && rec\.l && lineHeld\(rec\)\) \{ if \(clockS > rec\.until\) \{/);
  const h = fn('function lineHeld(rec)', 'function stepLines()');
  assert.match(h, /pauseLine\(rec, true\);/);
  assert.match(h, /if \(now && now\.alive !== false && !now\.remove\) rec\[end\] = now;/);
  assert.match(fn('function pauseLine(rec, on)', 'function lineHeld('), /for \(const l of \[rec\.l, rec\.spLive\]\) if \(l\) \{ l\.pzSelf = on; setPaused\(l\); \}/);
});

test('fxgame.js SwitchableEffectByBlackboardValue: the root draws nothing, the effect for the status\'s count plays and the last one finishes', () => {
  assert.match(SRC, /if \(def\.swBB && !bb\) \{ if \(!bbSwitches\.some\(\(x\) => x\.view === view && x\.key === key\)\) bbSwitches\.push\(/);
  const s = fn('function stepSwitchBB()', '\n  }\n');
  assert.match(s, /const v = bbValue\(x\.view, x\.sw\.buff\);/);
  assert.match(s, /if \(l\.bbSw !== x \|\| l\.inst\.stopping\) continue;\n\s+finishMe\(l\);/, 'the last one: FinishMe');
  assert.match(fn('function finishMe(l)', '\n  }\n'), /if \(fin > 0\) \{ l\.inst\.finish\(\); if \(!\(l\.finishAt <= clockS \+ fin\)\) l\.finishAt = clockS \+ fin; \} else l\.inst\.stop\(true\);/);
  assert.match(s, /const n = v >= 1 && v <= x\.sw\.fx\.length \? x\.sw\.fx\[v - 1\] : null;/);
  assert.match(SRC, /if \(bbSwitches\.length\) stepSwitchBB\(\);/);
});

test('fx_extract.py reads PauseEffectIfDisappeared, `_pauseWhenDisappear` and SwitchableEffectByBlackboardValue; the coverage knows them as read', () => {
  assert.match(EXTRACT, /PAUSE_GONE_SCRIPT = 8401462487392191767\nSWITCH_BB_SCRIPT = -7751344843855468294/);
  assert.match(EXTRACT, /if t\.get\('_pauseWhenDisappear'\):\n                out\['gonePause'\] = 1/);
  assert.match(EXTRACT, /\('tileH', self\.tile_height\), \('swBB', self\.switch_bb\)\)/);
  assert.match(COVERAGE, /'PauseEffectIfDisappeared', 'SwitchableEffectByBlackboardValue',\n/);
  for (const k of ['script:PauseEffectIfDisappeared', 'script:SwitchableEffectByBlackboardValue', 'field:LineEffectEmitterDynamic._pauseWhenDisappear ≠ 0']) {
    assert.ok(!COVERAGE.includes(`'${k}': (_`), `${k} is read, not a known gap`);
  }
});

test('the extracts carry them (skipped without public/assets)', { skip: !existsSync(path.join(FX, 'etlchi')) && 'no extracted fx' }, () => {
  for (const n of ['attack_hit_01', 'innate_hit_01', 'skill_01_hit_01', 'skill_02_hit_01', 'skill_03_hit_01']) {
    assert.equal(load(`etlchi/etlchi_${n}`).nodes[0].pauseGone, 1, `etlchi_${n}: PauseEffectIfDisappeared on its root`);
  }
  for (const n of ['line_01', 'line_01_end']) assert.equal(load(`etlchi/etlchi_skill_03_${n}`).lineDyn.gonePause, 1, n);
  if (!existsSync(path.join(FX, 'pfx_enemy_5/enemy_ftsjc_buff.json'))) return;
  assert.deepEqual(load('pfx_enemy_5/enemy_ftsjc_buff').swBB,
    { buff: 'enemy_ftsjc[first_attack]', key: 'effect_level', fx: ['enemy_ftsjc_buff_01', 'enemy_ftsjc_buff_02', 'enemy_ftsjc_buff_03'], iv: 0.2 });
  for (const n of ['01', '02', '03']) assert.ok(existsSync(path.join(FX, `pfx_enemy_5/enemy_ftsjc_buff_${n}.json`)), `enemy_ftsjc_buff_${n} extracted`);
  assert.deepEqual(load('enemy-modes').enemy_10067_ftsjc.buffFx['enemy_ftsjc[first_attack]'], ['enemy_ftsjc_buff'], 'the ramp buff\'s effect');
});

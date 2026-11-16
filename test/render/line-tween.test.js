// test/render/line-tween.test.js — a LineEffectEmitterDynamic line with `_tweenEndPosition` (2026-11-16, docs/rules/fx.md
// 「선 끝이 시작에서 자라남」): the official client's `_UpdateMountPoint` draws the end at lerp(start point, end point,
// clamp(t / `_tweenDuration`)) + the end offset from the line's OnPlay; fx_extract.py carries it as `lineDyn.tween` and
// render/fxgame.js stepLine grows the end with lineTween / lineTweenEnd. 逻各斯 S2's lock line logos_skill2_line_01 (0.2 s)
// jumped to its target at once before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { lineTween, lineTweenEnd } from '../../public/js/render/fxgame.js';

const SRC = readFileSync(new URL('../../public/js/render/fxgame.js', import.meta.url), 'utf8');
const LOGOS = new URL('../../public/assets/local/fx/logos/logos_skill2_line_01.json', import.meta.url);

test('lineTween: t / duration clamped to [0, 1]; a line without a tween is grown at once', () => {
  assert.equal(lineTween(0.2, 0), 0);
  assert.equal(lineTween(0.2, 0.05), 0.25);
  assert.equal(lineTween(0.2, 0.5), 1);
  assert.equal(lineTween(0.2, -1), 0);
  assert.equal(lineTween(0, 0), 1);
});

test('lineTweenEnd: the end lerped out of the start point, then the end offset (Unity +x, +y → scene x, z)', () => {
  const e = lineTweenEnd({ x: 0, y: 0, z: 1 }, { x: 4, y: 2, z: 3 }, 0.25, [0.5, 0.25]);
  assert.deepEqual(e, { x: 1.5, y: 0.5, z: 1.75 });
  assert.deepEqual(lineTweenEnd({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 3 }, 1, null), { x: 4, y: 2, z: 3 });
});

test('stepLine grows a line by its `lineDyn.tween` from its first frame (the start offset is not in the lerp)', () => {
  const body = SRC.slice(SRC.indexOf('function stepLine(rec)'), SRC.indexOf('function stepLine(rec)') + 900);
  assert.match(body, /const tw = Number\(rec\.dyn\.tween\) \|\| 0;/, 'stepLine reads lineDyn.tween (docs/rules/fx.md 「선 끝이 시작에서 자라남」)');
  assert.match(body, /if \(tw > 0 && rec\.t0 == null\) rec\.t0 = clockS;/, 'its time starts at the first step (the client\'s OnPlay)');
  assert.match(body, /lineTweenEnd\(elinePoint\(rec\.src, rec\.dyn\.sMount, lineT, null\), elinePoint\(rec\.tgt, rec\.dyn\.eMount, lineB, null\), k, rec\.dyn\.eOff\)/);
});

test('the extracted 逻各斯 S2 lock line carries its 0.2 s tween (when the local effects are installed)', (t) => {
  if (!existsSync(LOGOS)) return t.skip('local effects not extracted');
  assert.equal(JSON.parse(readFileSync(LOGOS, 'utf8')).lineDyn?.tween, 0.2);
});

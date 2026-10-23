// test/render/status-finish.test.js — 2026-10-11, docs/rules/ui.md ⑤ 「끝내는 시점」: an ended status effect goes as the client
// finishes a buff's effect — Entity.OnBuffFinish → RemoveBuffEffect (RVA 0x36001C0) → Effect.FinishMe (RVA 0xC88FE0): its
// parts stop and it is recycled `delayToRecycle` s later, a ParticleEffect's `_delayToFinish` (get_delayToRecycle RVA 0xCB3470)
// — at once when that is 0 (buff_stun). The value comes from the extracted prefab (`finish`, tools/local-extract/fx_extract.py
// delay_to_finish: the root effect component's raw float #5). No three.js here: the live loop is checked in its source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('fxgame.js statusOff: `now` finishes the effect (its first system, FxInstance.finish) and removes it its prefab `finish` later (0 / none: at once)', () => {
  const s = src('../../public/js/render/fxgame.js');
  const off = s.slice(s.indexOf('statusOff(view, key, now = false) {'), s.indexOf('ownsFx(e)'));
  assert.match(off, /const fin = now \? Number\(l\.inst\.def\?\.finish\) : 0;/, 'the delay is the prefab\'s, only for an ended status (`now`)');
  assert.match(off, /if \(fin > 0\) \{ l\.inst\.finish\(\); l\.finishAt = clockS \+ fin; \} else l\.inst\.stop\(now\);/);
  // the frame loop removes it on the battle clock once the delay has passed
  assert.match(s, /if \(l\.finishAt != null && clockS >= l\.finishAt\) \{ l\.finishAt = null; l\.inst\.stop\(true\); \}/);
  // fxstatus.js still ends every drawn status with `now` (test/local-patch-status-boomerang.test.js)
  assert.match(src('../../public/js/render/fxstatus.js'), /fxGame\.statusOff\(v, k, true\)/);
});

test('fx_extract.py: `finish` = the root ParticleEffect\'s _delayToFinish, --finish-only rewrites only it', () => {
  const py = src('../../tools/local-extract/fx_extract.py');
  const fn = py.slice(py.indexOf('def delay_to_finish('), py.indexOf('def finish_only('));
  // the root effect component recognised by its shape (root_effect, like spawn_location), its field s+1
  assert.match(fn, /pe = self\.root_effect\(root\)/);
  assert.match(py, /'delayToFinish': f\(s \+ 1\)/);
  assert.match(py, /out_def\['finish'\] = finish/);
  assert.match(py, /'--finish-only'/);
});

// After `fx_extract.py --finish-only` (the extracted prefabs are not in the repository): the values read from the EN client
// (2026-10-11): buff_stun 0 (the mark goes at once, as before), buff_slowdown 0.5, buff_cold 0.06.
const FX = new URL('../../public/assets/local/fx/', import.meta.url);
const prefab = (b, n) => { const u = new URL(`${b}/${n}.json`, FX); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : null; };
const extracted = prefab('buff', 'buff_slowdown');
test('extracted status prefabs carry the client\'s _delayToFinish', { skip: !extracted || !('finish' in extracted) ? 'finish not extracted yet (fx_extract.py --finish-only)' : false }, () => {
  assert.equal(prefab('buff', 'buff_slowdown').finish, 0.5);
  assert.equal(prefab('buff', 'buff_cold').finish, 0.06);
  assert.equal(prefab('buff', 'buff_stun')?.finish, undefined, 'buff_stun: 0 — no field, removed at once');
});

test('fxgame.js stopBuffs: a skill ending leaves the statuses its unit wears playing (they end with statusOff)', () => {
  const s = src('../../public/js/render/fxgame.js');
  // a status entry is `buff` (isLasting) with `again`; stopped by the skill's end, `again` restarted it from its start
  assert.match(s, /buff: true, status: key, again: \(\) => playStatus\(/);
  const fn = s.slice(s.indexOf('function stopBuffs('), s.indexOf('function stopOwned('));
  assert.match(fn, /if \(l\.buff && !l\.status && l\.owner === ownerId\) l\.inst\.stop\(now\);/);
});

// 2026-10-27 (effect bundle W2d, official client): the side switches (SwitchableBackEffect / SwitchableRightEffect
// `_UpdateFace(force)`), the same-place cap of looping effects (ParticleEffectManager.CheckEffectByPos), OnPlayEmitter's
// `_keepPauseSync`, a dynamic line's `endDead`, the shared material of FxUVTweener and the TrailRenderer texture modes —
// docs/rules/fx.md 「뒷면·좌우 전환·선 끝·같은 자리 상한·공유 재질」.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const PLAYER = readFileSync(path.join(ROOT, 'public/js/render/fxplayer.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const prefab = (p) => JSON.parse(readFileSync(path.join(FX, `${p}.json`), 'utf8'));
const has = (...ps) => ps.every((p) => existsSync(path.join(FX, `${p}.json`)));

const body = (head) => {
  const at = SRC.indexOf(head);
  assert.ok(at >= 0, head);
  return SRC.slice(at, SRC.indexOf('\n  }\n', at) + 4);
};
const line = (head) => { const at = SRC.indexOf(head); assert.ok(at >= 0, head); return SRC.slice(at, SRC.indexOf('\n', at)); };

/** stepSwitch / setPaused / the switch makers / posCapped from fxgame.js; startBack records the copies it would make. */
function harness() {
  const env = { clockS: 0, live: [], made: [], faceBack: (u) => !!u.back };
  const src = [body('function setPaused(l)'), line('const faceRight = '), body('function rightSwitch(def, unit, bundle)'),
    body('function backSwitch(def, unit, bundle)'), body('function stepSwitch(l, sw)'), line('const POS_MAX = '), line('const posCells = '),
    body('function posCapped(inst)'),
    'function startBack(l, sw) { const e = entry(sw.name); e.backOf = l; env.live.push(e); env.made.push(e); sw.entry = e; }',
    'return { stepSwitch, setPaused, rightSwitch, backSwitch, posCapped };'].join('\n');
  return { env, ...new Function('env', 'entry', `with (env) { ${src} }`)(env, entry) };
}
function entry(name, extra = {}) {
  return { paused: false, inst: { def: { name }, stopping: false, done: false, object: { visible: true, position: { x: 0, y: 0, z: 0 } }, stop() { this.stopping = true; } }, ...extra };
}

test('fx_extract.py carries the W2d fields', () => {
  for (const [k, f] of [['rightOnce', '_onlyCheckOnPlay'], ['rightRev', '_reverseLeftRight'], ['force', '_forceCheckInUpdate'], ['sync', '_syncPlayBackSpeed'],
    ['keepPause', '_keepPauseSync'], ['shared', 'useSharedMaterial'], ['buffSrc', '_checkBuffSourceForFinish']]) {
    assert.match(EXTRACT, new RegExp(`'${k}'[^\\n]*'${f}'|'${f}'[^\\n]*\\n?[^\\n]*'${k}'`), k);
  }
  assert.match(EXTRACT, /return bool\(t\['_isLoop'\]\) and not t\['_ignoredByParticleEffectManager'\]/);
  assert.match(EXTRACT, /out\['endDead'\] = 'alive'[\s\S]{0,120}out\['endDead'\] = 'reborn'/);
});

test('the extracted records', { skip: !has('chen3/chen3_skill_03_buff_L_01', 'svash2/svash2_attack_start_A_01', 'yu/yu_skill3_range_01') && 'no extracted effects' }, () => {
  const chen = prefab('chen3/chen3_skill_03_buff_L_01');
  assert.equal(chen.right, 'chen3_skill_03_buff_R_01');
  assert.equal(chen.rightOnce, undefined, '`_onlyCheckOnPlay` 0: checked every frame');
  assert.deepEqual([prefab('svash2/svash2_attack_start_A_01').back.force, prefab('svash2/svash2_attack_start_A_01').back.sync], [1, 1]);
  assert.equal(prefab('yu/yu_skill3_range_01').posCap, undefined, '`_ignoredByParticleEffectManager`');
  if (has('buff/buff_slowdown')) assert.equal(prefab('buff/buff_slowdown').posCap, 1);
});

test('a right switch: the left copy plays; turning right pauses it and makes the right copy once, then they pause / play on in turn', () => {
  const h = harness();
  const unit = { info: {}, visFacing: -1 };
  const l = entry('chen3_skill_03_buff_L_01');
  l.rightSw = h.rightSwitch({ right: 'chen3_skill_03_buff_R_01' }, unit, 'chen3');
  h.env.live.push(l);
  h.stepSwitch(l, l.rightSw);
  assert.deepEqual([l.paused, h.env.made.length], [false, 0], 'facing left at play: itself');
  unit.visFacing = 1;
  h.stepSwitch(l, l.rightSw);
  assert.deepEqual([l.paused, l.inst.object.visible, h.env.made.length], [true, false, 1]);
  const copy = h.env.made[0];
  unit.visFacing = -1;
  h.stepSwitch(l, l.rightSw);
  assert.deepEqual([l.paused, copy.paused, copy.inst.stopping], [false, true, false], 'the copy is paused, not finished');
  unit.visFacing = 1;
  h.stepSwitch(l, l.rightSw);
  assert.deepEqual([l.paused, copy.paused, h.env.made.length], [true, false, 1], 'the same copy plays on');
  // `_onlyCheckOnPlay`: the side at play only; `_reverseLeftRight`: the right copy while facing left
  const once = entry('clemnt_skill_03_buff_01_L');
  once.rightSw = h.rightSwitch({ right: 'r', rightOnce: 1 }, unit, 'clemnt');
  h.stepSwitch(once, once.rightSw);
  unit.visFacing = -1;
  h.stepSwitch(once, once.rightSw);
  assert.equal(once.paused, true, 'not checked again');
  const rev = entry('x');
  rev.rightSw = h.rightSwitch({ right: 'r', rightRev: 1 }, unit, 'b');
  h.stepSwitch(rev, rev.rightSw);
  assert.equal(rev.paused, true);
});

test('a back switch: `_forceCheckInUpdate` writes again every frame and makes a finished copy again; `_oneShot` finishes the front', () => {
  const h = harness();
  const unit = { info: {}, back: true };
  const l = entry('f');
  l.backSw = h.backSwitch({ back: { effect: 'b', force: 1 } }, unit, 'x');
  h.stepSwitch(l, l.backSw);
  assert.equal(h.env.made.length, 1);
  l.pzSelf = false; h.setPaused(l);   // another behaviour's write …
  h.stepSwitch(l, l.backSw);
  assert.equal(l.paused, true, '… is written over the next frame');
  h.env.made[0].inst.stopping = true;
  h.stepSwitch(l, l.backSw);
  assert.equal(h.env.made.length, 2, 'made again');
  const plain = entry('g');
  plain.backSw = h.backSwitch({ back: { effect: 'b' } }, unit, 'x');
  h.stepSwitch(plain, plain.backSw);
  plain.pzSelf = false; h.setPaused(plain);
  h.stepSwitch(plain, plain.backSw);
  assert.equal(plain.paused, false, 'unforced: only a change is written');
  const one = entry('o');
  one.backSw = h.backSwitch({ back: { effect: 'b', oneShot: 1 } }, unit, 'x');
  h.stepSwitch(one, one.backSw);
  assert.equal(one.inst.stopping, true);
});

test('the same-place cap: a fourth looping effect of one prefab in both cells is not played; another prefab or place is', () => {
  const h = harness();
  const mk = (name, x, y) => { const e = entry(name); e.inst.def.posCap = 1; e.inst.object.position = { x, y, z: 0 }; return e; };
  for (let i = 0; i < 3; i++) {
    const e = mk('buff_slowdown', 2.2, 3.7);
    assert.equal(h.posCapped(e.inst), false);
    e.posCell = e.inst.posCell;
    h.env.live.push(e);
  }
  assert.equal(h.posCapped(mk('buff_slowdown', 2.3, 3.8).inst), true);
  assert.equal(h.posCapped(mk('buff_cold', 2.3, 3.8).inst), false);
  assert.equal(h.posCapped(mk('buff_slowdown', 2.9, 3.8).inst), false, 'the shifted grid\'s cell differs');
  const off = mk('buff_slowdown', 2.3, 3.8);
  off.inst.def.posCap = 0;
  assert.equal(h.posCapped(off.inst), false, 'not counted by the manager');
  h.env.live[0].inst.stopping = true;
  assert.equal(h.posCapped(mk('buff_slowdown', 2.3, 3.8).inst), false, 'a finishing one no longer counts');
});

test('wiring: both switches stepped, the emitter\'s pause sync, a line ended by an end in its 重生, the shared offsets, the trail modes', () => {
  assert.match(SRC, /if \(l\.backSw\) stepSwitch\(l, l\.backSw\);\n\s*if \(l\.rightSw\) stepSwitch\(l, l\.rightSw\);/);
  assert.match(SRC, /rightSw: rightSwitch\(def, at \|\| view, b\.bundle\)/);
  assert.match(SRC, /rightSw: rightSwitch\(def, unit, bundle\)/);
  assert.doesNotMatch(SRC, /n = def\.right; def = r;/, 'no pick at play any more');
  assert.match(SRC, /if \(em\.play\?\.keepPause && em\.kids && !!l\.paused !== !!em\.paused\)/);
  assert.match(SRC, /const reb = rec\.dyn\?\.endDead === 'alive';[^\n]*\n[^\n]*\(reb && v\.form === 'reborn'\)/);
  assert.match(SRC, /if \(posCapped\(inst\)\) \{ inst\.dispose\(\); return null; \}/);
  assert.match(PLAYER, /if \(uvt\.shared && key\) uvShared\(u, key, TEX_ST\[name\]\);/);
  assert.match(PLAYER, /trailU\[k\] = tr\.texMode === 1 \? trailU\[k\] : tr\.texMode === 2 \? u : tr\.texMode === 3 \? k : f;/);
  assert.match(PLAYER, /if \(tr\.align === 1\) z\.setFromMatrixColumn\(tmpM, 2\)\.normalize\(\); else z\.set\(0, 0, 0\);/);
});

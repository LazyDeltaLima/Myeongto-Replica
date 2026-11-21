// test/render/on-emitter-fx.test.js — docs/rules/fx.md 「OnPlayEmitter · OnFinishEmitter」: an effect whose node carries the
// client's OnPlayEmitter creates its prefabs on its owner when it plays (`_preDelay` later unless `_instant`) and, with
// `_clearWhenFinish`, finishes them with itself; an OnFinishEmitter creates its prefabs when the effect finishes. The name
// rules leave the prefabs an emitter creates to it (index.json `emitted`). Before, the children either never played
// (远牙 S3's _XZ ground copy, the `_end` rings) or the `_buff` name rule started them with the skill (歌蕾蒂娅 S2, 苏尔特 S3, 望 S3).
// A SwitchableBackEffect's back copy is listed too: the name rule played 远牙 S3's fartth_skill_03_buff_02_B beside its front.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeIndex } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const SURTR = path.join(FX, 'surtr/surtr_skill_03_buff.json');
const TINMAN = path.join(FX, 'tinman/tinman_skill_01_range_01.json');
const extracted = existsSync(SURTR) && existsSync(TINMAN);

const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  return src.slice(at, src.indexOf('\n  }\n', at) + 4);
};
/** A one-statement `const name = …;` of fxgame.js. */
const constOf = (name) => {
  const at = SRC.indexOf(`  const ${name} = `);
  assert.ok(at >= 0, name);
  return SRC.slice(at, SRC.indexOf(';\n', at) + 1);
};
const HELD = `${constOf('emitsOnly')}\n${constOf('ended')}`;
/** stepOnEmit's FinishMe (`finishMe`) with a clock of its own (`clockS`, set by the caller through the returned setter). */
const FINISH = `let clockS = 0;\nconst setClock = (t) => { clockS = t; };\n${body(SRC, 'function finishMe(l)')}`;

test('fx_extract.py reads OnPlayEmitter / OnFinishEmitter by their field names into `onPlay` / `onFinish`, and lists their prefabs in `emitted`', () => {
  assert.match(EXTRACT, /ON_PLAY_EMITTER_SCRIPT = -5498265793651067281/);
  assert.match(EXTRACT, /ON_FINISH_EMITTER_SCRIPT = 2565987927806955259/);
  assert.match(EXTRACT, /'pre': 0 if t\.get\('_instant'\) else/);
  assert.match(EXTRACT, /node\.update\(self\.on_emitters\(go\)\)/);
  assert.match(EXTRACT, /set_emitted\(index, bundle, out\)/);
});

test('the extracted emitters: 苏尔特 S3 buff → its three parts, cleared with it; 锡人 S1 range → its end at the effect\'s place', { skip: !extracted && 'no extracted effects' }, () => {
  const surtr = JSON.parse(readFileSync(SURTR, 'utf8')).nodes[0].onPlay;
  assert.deepEqual(surtr, { effects: ['surtr_skill_03_buff_02', 'surtr_skill_03_buff_03', 'surtr_skill_03_buff_04'], pre: 0, face: false, clear: true, srcPos: false });
  const tin = JSON.parse(readFileSync(TINMAN, 'utf8')).nodes[0].onFinish;
  assert.deepEqual(tin, { effects: ['tinman_skill_01_end_01'], face: false, effPos: true });
  const index = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8'));
  for (const n of surtr.effects) assert.ok(index.emitted.surtr.includes(n), n);
  assert.ok(index.emitted.fartth.includes('fartth_skill_03_buff_02_B'), 'a back copy (SwitchableBackEffect) is its front\'s');
  // every emitted prefab is extracted in its bundle
  for (const f of ['index.json', 'enemy-index.json']) {
    const ix = JSON.parse(readFileSync(path.join(FX, f), 'utf8'));
    for (const [b, list] of Object.entries(ix.emitted || {})) for (const n of list) assert.ok(ix.bundles[b].includes(n), `${b}/${n}`);
  }
});

test('stepOnEmit: the play list once its time comes (not while waiting / ended), the finish list once when it ends, clear stops the kids', async () => {
  const make = new Function('onEmitPlay', 'onEmitNow', 'onEmitIf', `${HELD}\n${FINISH}\n${body(SRC, 'function stepOnEmit(l)')}\nreturn stepOnEmit;`);
  const calls = [];
  const kid = { inst: { stopping: false, stop(now) { this.stopping = true; this.now = now; } } };
  const step = make((l, rec, here) => { calls.push([rec.effects[0], here]); return [kid]; }, (l, em) => l.inst.time >= em.play.pre, () => true);
  const em = { o: { userData: {} }, play: { effects: ['a'], pre: 0.2, clear: true, srcPos: false }, finish: { effects: ['z'], effPos: true } };
  const l = { inst: { stopping: false, done: false, wait: 0.1, time: 0, onEmit: [em] } };
  step(l);
  assert.equal(calls.length, 0, 'still waiting');
  l.inst.wait = 0; l.inst.time = 0.1; step(l);
  assert.equal(calls.length, 0, 'before `_preDelay`');
  l.inst.time = 0.2; step(l); step(l);
  assert.deepEqual(calls, [['a', false]], 'once');
  l.inst.stopping = true; step(l); step(l);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(calls, [['a', false], ['z', true]], 'the finish list once, at the effect\'s place');
  assert.equal(kid.inst.stopping, true, '`_clearWhenFinish`');
  assert.equal(kid.inst.now, true, 'FinishMe: a kid without `_delayToFinish` goes at once, its particles with it (docs/rules/fx.md 「감싸개 상태 이펙트」)');
  const late = { o: { userData: {} }, play: { effects: ['b'], pre: 0 }, finish: null };
  step({ inst: { stopping: true, done: false, wait: 0, time: 1, onEmit: [late] } });
  assert.equal(calls.length, 2, 'an effect that ended before its time plays nothing');
});

// (2026-11-16) OnPlayEmitterIf (official client OnPlay: with a valid owner it plays only when each check of `_checkType` holds — MOTION_MODE
// the owner's changeableMotionMode): `onPlayIf` records with `if` { motion }, checked once as the effect plays. The one user is
// buff_frozen_to_enemy (c2e_freeze's effect): buff_frozen_to_walk on a ground enemy, buff_frozen_to_fly on a flying one.
test('OnPlayEmitterIf: the extract writes `onPlayIf` with its motion check (and stops on a check the render does not make); stepOnEmit plays one only when its owner passes, checked once', () => {
  assert.match(EXTRACT, /ON_PLAY_EMITTER_IF_SCRIPT = -7374104420286372940/);
  assert.match(EXTRACT, /out\.setdefault\('onPlayIf', \[\]\)\.append\(rec\)/);
  assert.match(EXTRACT, /raise SystemExit\(f'OnPlayEmitterIf on \{go\}: _checkType/);
  const BFTE = path.join(FX, 'buff/buff_frozen_to_enemy.json');
  if (existsSync(BFTE)) {
    const root = JSON.parse(readFileSync(BFTE, 'utf8')).nodes[0];
    assert.deepEqual(root.onPlayIf.map((r) => [r.effects, r.if, r.clear]), [[['buff_frozen_to_walk'], { motion: 0 }, true], [['buff_frozen_to_fly'], { motion: 1 }, true]]);
  }
  const cond = new Function('lastViews', `${body(SRC, 'function onEmitIf(l, cond)')}\nreturn onEmitIf;`);
  const views = new Map([[1, { flying: false }], [2, { flying: true }]]);
  const iff = cond(views);
  const on = (id) => ({ view: { info: {}, id } });
  assert.equal(iff(on(1), { motion: 0 }), true, 'WALK on a ground unit');
  assert.equal(iff(on(1), { motion: 1 }), false, 'FLY on a ground unit');
  assert.equal(iff(on(2), { motion: 1 }), true, 'FLY on a flying unit');
  assert.equal(iff(on(9), { motion: 0 }), false, 'no owner: nothing');
  assert.equal(iff(on(9), undefined), true, 'a plain OnPlayEmitter');
  const make = new Function('onEmitPlay', 'onEmitNow', 'onEmitIf', `${HELD}\n${body(SRC, 'function stepOnEmit(l)')}\nreturn stepOnEmit;`);
  const calls = [];
  let flying = false;
  const step = make((l, rec) => { calls.push(rec.effects[0]); return []; }, () => true, (l, c) => (c ? (flying ? 1 : 0) === c.motion : true));
  const walk = { o: { userData: {} }, play: { effects: ['walk'], pre: 0, if: { motion: 0 } }, finish: null };
  const fly = { o: { userData: {} }, play: { effects: ['fly'], pre: 0, if: { motion: 1 } }, finish: null };
  const l = { inst: { stopping: false, done: false, wait: 0, time: 0, onEmit: [walk, fly] } };
  step(l);
  flying = true; step(l);
  assert.deepEqual(calls, ['walk'], 'the ground one only — and a failed check is not tried again when the unit takes off');
});

// (2026-11-17, maintainer report: no ice on a frozen enemy since 2026-11-16) buff_frozen_to_enemy draws nothing itself, so its
// FxInstance is `done` as it is made: stepOnEmit took it for ending and never played its child, and the status loop made it again
// every frame. A status wrapper like it is `held` (fxgame.js playStatus) until the status stops it.
const BFTE_FILE = path.join(FX, 'buff/buff_frozen_to_enemy.json');
test('a status effect that only emits (buff_frozen_to_enemy) plays its child on its first step and stays until it is stopped, then clears it', { skip: !existsSync(BFTE_FILE) && 'no extracted effects' }, async () => {
  const fxp = await import('../../public/js/render/fxplayer.js');
  const inst = new fxp.FxInstance(JSON.parse(readFileSync(BFTE_FILE, 'utf8')), { quality: 'high' });
  assert.equal(inst.done, true, 'an empty root is done as it is made — the cause; if this changes, the hold may go');
  const fns = new Function(`${HELD}\nreturn { emitsOnly, ended };`)();
  assert.equal(fns.emitsOnly(inst), true, 'buff_frozen_to_enemy is an emitting wrapper');
  assert.match(body(SRC, 'async function playStatus('), /held: emitsOnly\(inst\)/, 'playStatus holds a wrapper (docs/rules/fx.md 「감싸개 상태 이펙트」)');
  for (const re of [/if \(ended\(l\) && l\.status && l\.again/, /if \(ended\(l\) && !\(l\.keep && !l\.inst\.stopping\)/]) assert.match(SRC, re, 'the live loop asks ended(l), not inst.done');
  const make = new Function('onEmitPlay', 'onEmitNow', 'onEmitIf', `${HELD}\n${FINISH}\n${body(SRC, 'function stepOnEmit(l)')}\nreturn { stepOnEmit, ended };`);
  const calls = [];
  const kid = { inst: { stopping: false, stop(now) { this.stopping = true; this.now = now; } } };
  const { stepOnEmit, ended } = make((l, rec) => { calls.push(rec.effects[0]); return [kid]; }, () => true, (l, c) => (c ? c.motion === 0 : true));
  const l = { inst, held: fns.emitsOnly(inst) };
  inst.update(1 / 60);
  stepOnEmit(l);
  assert.deepEqual(calls, ['buff_frozen_to_walk'], 'the ground child plays on the first step');
  assert.equal(ended(l), false, 'held while the status is on: not restarted, not dropped');
  stepOnEmit(l);
  assert.equal(calls.length, 1, 'once');
  inst.stop(true);
  stepOnEmit(l);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(ended(l), true, 'stopped: it ends');
  assert.equal(kid.inst.stopping, true, 'and its `_clearWhenFinish` child with it');
  assert.equal(kid.inst.now, true, 'at once (FinishMe, no `_delayToFinish`): a soft stop left the ice on the enemy ~5 s after the 冻结 ended');
});

// (2026-11-21, maintainer report: the ice stayed on an enemy whose 冻结 had ended, so it looked as if a frozen enemy walked) the
// client's OnPlayEmitter.OnFinish → Effect.FinishEffects: FinishMe(false) on each kept kid — recycled its `_delayToFinish`
// later, at once without one. A soft stop() let buff_frozen_to_walk's smoke (up to 5.5 s) run out with the ice meshes drawn.
const WALK_FILE = path.join(FX, 'buff/buff_frozen_to_walk.json');
const CYCLONE_FILE = path.join(FX, 'heyak/heyak_cyclone_01.json');
test('a wrapper\'s `_clearWhenFinish` kids end by FinishMe: at once without `_delayToFinish` (冻结 ice), else that much later (오올헤약 회오리)', { skip: !(existsSync(WALK_FILE) && existsSync(CYCLONE_FILE)) && 'no extracted effects' }, async () => {
  const make = new Function('onEmitPlay', 'onEmitNow', 'onEmitIf', `${HELD}\n${FINISH}\n${body(SRC, 'function stepOnEmit(l)')}\nreturn { stepOnEmit, setClock };`);
  const kidOf = (file) => ({ inst: { def: JSON.parse(readFileSync(file, 'utf8')), stopping: false,
    stop(now) { this.stopping = true; this.now = now; }, finish() { this.stopping = true; this.finished = true; } } });
  const ice = kidOf(WALK_FILE), wind = kidOf(CYCLONE_FILE);
  assert.ok(!(Number(ice.inst.def.finish) > 0), 'buff_frozen_to_walk has no `_delayToFinish`');
  assert.equal(wind.inst.def.finish, 0.2, 'heyak_cyclone_01 `_delayToFinish`');
  for (const [kid, at] of [[ice, 3], [wind, 7]]) {
    const { stepOnEmit, setClock } = make(() => [kid], () => true, () => true);
    setClock(at);
    const em = { o: { userData: {} }, play: { effects: [kid.inst.def.name], pre: 0, clear: true, srcPos: false }, finish: null };
    const l = { inst: { stopping: false, done: false, wait: 0, time: 0, onEmit: [em] } };
    stepOnEmit(l);
    l.inst.stopping = true;
    stepOnEmit(l);
    await Promise.resolve(); await Promise.resolve();
    if (kid === ice) assert.equal(ice.inst.now, true, `${kid.inst.def.name}: stop(true) — a soft stop() keeps it ~5 s (docs/rules/fx.md 「감싸개 상태 이펙트」)`);
    else { assert.equal(wind.inst.finished, true, 'heyak_cyclone_01: FxInstance.finish'); assert.equal(wind.finishAt, at + 0.2, 'gone `_delayToFinish` later'); }
  }
});

test('the kids come from the emitting effect\'s bundle on its owner; the name rules and 予愿安洁莉娜\'s landing leave them to their emitter', () => {
  const play = body(SRC, 'function onEmitPlay(l, rec, here)');
  assert.match(play, /l\.inst\.def\?\.bundle/);
  assert.match(play, /lastViews\?\.get\(l\.view\.id\)/);
  assert.match(SRC, /if \(l\.inst\.onEmit\?\.length\) stepOnEmit\(l\)/);
  assert.match(SRC, /effectsFor\(b\.prefabs, kind, skillIndex\)\.filter\(\(n\) => !emittedIn\(b\.bundle\)\.has\(n\) && !packedIn\(b\.bundle\)\.has\(n\) && !\(kind === 'skillHit' && KIT_OWNED\.has\(n\)\)\)/);
  assert.match(SRC, /new Set\(\[\.\.\.ownedNow\(\), \.\.\.em\]\)/);
  assert.match(SRC, /pickName\(b, k\)\)\.filter\(\(k\) => k && !emittedIn\(b\.bundle\)\.has\(k\)\)/);
});

test('mergeIndex merges the enemies\' `emitted` lists with the operators\'', () => {
  const m = mergeIndex({ bundles: { a: ['x', 'y'] }, emitted: { a: ['y'] } }, { bundles: { e: ['p', 'q'], a: ['z'] }, emitted: { e: ['q'], a: ['z'] } });
  assert.deepEqual(m.emitted, { a: ['y', 'z'], e: ['q'] });
});

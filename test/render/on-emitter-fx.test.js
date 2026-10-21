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
  const make = new Function('onEmitPlay', 'onEmitNow', `${body(SRC, 'function stepOnEmit(l)')}\nreturn stepOnEmit;`);
  const calls = [];
  const kid = { inst: { stopping: false, stop() { this.stopping = true; } } };
  const step = make((l, rec, here) => { calls.push([rec.effects[0], here]); return [kid]; }, (l, em) => l.inst.time >= em.play.pre);
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
  const late = { o: { userData: {} }, play: { effects: ['b'], pre: 0 }, finish: null };
  step({ inst: { stopping: true, done: false, wait: 0, time: 1, onEmit: [late] } });
  assert.equal(calls.length, 2, 'an effect that ended before its time plays nothing');
});

test('the kids come from the emitting effect\'s bundle on its owner; the name rules and 予愿安洁莉娜\'s landing leave them to their emitter', () => {
  const play = body(SRC, 'function onEmitPlay(l, rec, here)');
  assert.match(play, /l\.inst\.def\?\.bundle/);
  assert.match(play, /lastViews\?\.get\(l\.view\.id\)/);
  assert.match(SRC, /if \(l\.inst\.onEmit\?\.length\) stepOnEmit\(l\)/);
  assert.match(SRC, /effectsFor\(b\.prefabs, kind, skillIndex\)\.filter\(\(n\) => !emittedIn\(b\.bundle\)\.has\(n\) && !packedIn\(b\.bundle\)\.has\(n\)\)/);
  assert.match(SRC, /new Set\(\[\.\.\.KIT_OWNED, \.\.\.em\]\)/);
  assert.match(SRC, /pickName\(b, k\)\)\.filter\(\(k\) => k && !emittedIn\(b\.bundle\)\.has\(k\)\)/);
});

test('mergeIndex merges the enemies\' `emitted` lists with the operators\'', () => {
  const m = mergeIndex({ bundles: { a: ['x', 'y'] }, emitted: { a: ['y'] } }, { bundles: { e: ['p', 'q'], a: ['z'] }, emitted: { e: ['q'], a: ['z'] } });
  assert.deepEqual(m.emitted, { a: ['y', 'z'], e: ['q'] });
});

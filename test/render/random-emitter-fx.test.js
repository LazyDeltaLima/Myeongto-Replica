// test/render/random-emitter-fx.test.js — docs/rules/fx.md 「RandomEmitter · FlyToPredefinedLocation」: common.ab's charge cast
// common_charge_cost_start_01 (德克萨斯 and four more) plays three common_charge_cost_01 copies 0.1 s in, each at a random point
// of a box around it (RandomEmitter `_DoEmit`), and each copy flies to the DP counter in 0.5 s and finishes
// (FlyToPredefinedLocation `OnPlay`: DOMove, InQuad, unscaled time, OnComplete → FinishMe). Before, only the cast itself played.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
const EXTRACT = readFileSync(path.join(ROOT, 'tools/local-extract/fx_extract.py'), 'utf8');
const FX = path.join(ROOT, 'public/assets/local/fx');
const START = path.join(FX, 'texas/common_charge_cost_start_01.json');
const COPY = path.join(FX, 'texas/common_charge_cost_01.json');
const extracted = existsSync(START) && existsSync(COPY);

const body = (src, head) => {
  const at = src.indexOf(head);
  assert.ok(at >= 0, head);
  return src.slice(at, src.indexOf('\n  }\n', at) + 4);
};

test('fx_extract.py reads RandomEmitter into the node `emit` and FlyToPredefinedLocation into the root `fly`', () => {
  assert.match(EXTRACT, /RANDOM_EMITTER_SCRIPT = -1593825680945881793/);
  assert.match(EXTRACT, /node\['emit'\] = emit/);
  assert.match(EXTRACT, /out_def\['fly'\] = fly/);
});

test('the extracted charge cast: three copies 0.1 s in, in its box; the copy flies to COST in 0.5 s', { skip: !extracted && 'no extracted effects' }, () => {
  const start = JSON.parse(readFileSync(START, 'utf8'));
  const emits = start.nodes.filter((n) => n.emit).map((n) => n.emit);
  assert.deepEqual(emits, [{ effect: 'common_charge_cost_01', count: 3, pre: 0.1, per: 0, from: [-0.5, -0.5, -0.5], to: [0.5, 0.5, -1] }]);
  assert.deepEqual(JSON.parse(readFileSync(COPY, 'utf8')).fly, { loc: 0, dur: 0.5, ease: 5, real: true });
  // every bundle that packs the cast packs its copy too
  const index = JSON.parse(readFileSync(path.join(FX, 'index.json'), 'utf8')).bundles;
  for (const [b, list] of Object.entries(index)) {
    if (list.includes('common_charge_cost_start_01')) assert.ok(list.includes('common_charge_cost_01'), b);
  }
});

test('FxInstance lists its emitter nodes', { skip: !extracted && 'no extracted effects' }, async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const { FxInstance } = await import('../../public/js/render/fxplayer.js');
  const def = JSON.parse(readFileSync(START, 'utf8'));
  def.geoms = new Proxy({}, { get: () => new THREE.BufferGeometry() });
  def.lib = { texture: () => new THREE.Texture() };
  const inst = new FxInstance(def, { quality: 'high' });
  assert.equal(inst.emitters.length, 1);
  assert.equal(inst.emitters[0].rec.effect, 'common_charge_cost_01');
  assert.equal(inst.emitters[0].o, inst.nodes[def.nodes.findIndex((n) => n.emit)]);
});

test('stepEmitters: nothing before `pre` (game seconds; effect time runs at its speed), then `count` copies `per` apart, once', () => {
  const make = new Function('emitCopy', 'emitAt', `${body(SRC, 'function stepEmitters(l)')}\nreturn stepEmitters;`);
  const out = [];
  const step = make((l, rec, p) => out.push(p), () => 'p');
  const em = { o: { userData: { t0: 0 } }, rec: { count: 3, pre: 0.1, per: 0.05 }, next: 0 };
  const l = { speed: 2, inst: { stopping: false, wait: 0, time: 0, emitters: [em] } };
  l.inst.time = 0.19; step(l);
  assert.equal(out.length, 0, '0.095 game s');
  l.inst.time = 0.2; step(l);
  assert.equal(out.length, 1, 'the first at 0.1 game s');
  l.inst.time = 0.5; step(l); step(l);
  assert.equal(out.length, 3, 'the rest by 0.2 game s, never more than count');
  const stopped = { ...l, inst: { ...l.inst, stopping: true, emitters: [{ ...em, next: 0 }] } };
  step(stopped);
  assert.equal(out.length, 3, 'an ended effect emits nothing');
});

test('stepFly: InQuad from where it was made to the place, on real time when `real`, then the copy is stopped', async () => {
  const THREE = await import('../../public/vendor/three.module.js');
  const make = new Function(`${body(SRC, 'function stepFly(l, dt, dtGame)')}\nreturn stepFly;`);
  const stepFly = make();
  let stops = 0;
  const l = {
    inst: { object: { position: new THREE.Vector3() }, stopping: false, stop() { stops++; } },
    fly: { from: new THREE.Vector3(0, 0, 0), to: new THREE.Vector3(4, 0, 0), dur: 0.5, real: true, t: 0, ease: (t) => t * t },
  };
  stepFly(l, 0.25, 99);
  assert.ok(Math.abs(l.inst.object.position.x - 1) < 1e-9, 'half the time, a quarter of the way');
  assert.equal(stops, 0);
  stepFly(l, 0.25, 0);
  assert.equal(l.inst.object.position.x, 4);
  assert.equal(l.fly, null);
  assert.equal(stops, 1, 'OnComplete → FinishMe');
});

test('the copies are made at the box point through the emitter node, in the emitting effect\'s bundle, and fly when they carry `fly`', () => {
  assert.match(body(SRC, 'const emitAt = (em) =>'), /applyMatrix4\(em\.o\.matrixWorld\)/);
  const copy = body(SRC, 'async function emitCopy(l, rec, p)');
  assert.match(copy, /l\.inst\.def\?\.bundle/);
  assert.match(copy, /if \(e && def\.fly\) startFly\(e\)/);
  assert.match(SRC, /if \(l\.inst\.emitters\?\.length\) stepEmitters\(l\)/);
  assert.match(SRC, /const FLY_PLACE = \{ 0: '\.dpbox' \}/);
});

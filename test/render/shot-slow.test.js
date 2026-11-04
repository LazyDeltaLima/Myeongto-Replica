// test/render/shot-slow.test.js — what the sim's fx 'shotSlow' (逻各斯 S3, server/sim/content/kits/ops/op-logos.js) changes
// in the shots already drawn: which one it names, the procedural shot's flight and the hit effects timed for a landing.
// The official trails in a browser: test/render/logos-shot-slow.browser.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotOf } from '../../public/js/render/fx/shotslow.js';
import { FxProjectiles } from '../../public/js/render/fx/projectiles.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { createFxLayer } from '../../public/js/render/fxgame.js';

test('shotOf: the oldest shot of that shooter and target not yet in the state the event sets', () => {
  const a = { esrc: 1, etgt: 9 }, b = { esrc: 1, etgt: 9 }, c = { esrc: 1, etgt: 8 }, d = { esrc: 2, etgt: 9 }, ally = { esrc: null, etgt: 9 };
  const list = [ally, d, c, a, b];
  assert.ok(shotOf(list, { from: 1, tgt: 9, rate: 0.05 }) === a);
  a.rate = 0.05;
  assert.ok(shotOf(list, { from: 1, tgt: 9, rate: 0.05 }) === b, 'the next one: a is slowed already');
  assert.ok(shotOf(list, { from: 1, tgt: 9, rate: 1 }) === a, 'released: a slowed one');
  assert.ok(shotOf(list, { from: 1, tgt: 8, rate: 1 }) === null, 'none slowed');
  assert.ok(shotOf(list, { from: 3, tgt: 9, rate: 0.05 }) === null, 'another shooter');
  assert.ok(shotOf(list, { from: 2, tgt: null, rate: 0.05 }) === d, 'no target in the sim: any of that shooter');
  assert.ok(shotOf(list, { from: 1, tgt: 9, clear: 1 }) === a, 'cleared: a slowed one first');
  assert.ok(shotOf(list, { from: 1, tgt: 8, clear: 1 }) === c, 'cleared: else the oldest');
  assert.ok(shotOf([{ t: 5, run() {} }], { from: 1, tgt: 9, rate: 0.05 }) === null, 'what is no shot is left alone');
});

test('the event draws nothing of its own (no sparkle of an unknown kind)', () => {
  assert.equal(fxSpec('shotSlow', {}).a, 'none');
});

/** Anything a sprite is asked: every property is callable and answers another of itself. */
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : (t[k] ??= stub())), set: (t, k, v) => { t[k] = v; return true; }, apply: () => stub() });
const point = { x: 0, y: 0, s: 1 };
function flying(rate) {
  const fx = new FxProjectiles();
  let impacts = 0;
  Object.assign(fx, { rich: false, ctx: { cam: () => ({ project: (x, y, z, out) => Object.assign(out ?? {}, { x, y, s: 1 }) }) }, _p: { ...point }, _q: { ...point }, projs: [],
    _impact: () => { impacts++; }, _releaseProj: () => {} });
  const tgt = { id: 9, x: 5, y: 0, alive: true };
  const pr = { spec: { look: 'orb', len: 1, width: 0.2, head: 0.3 }, kind: 'enemy', esrc: 1, etgt: 9, tgt, rate: 1, gone: false, t: 0, dur: 1, fade: 0, hit: false, emit: 0, arc: 0, ang: 0,
    x0: 0, y0: 0, z0: 0, tx: 5, ty: 0, tz: 0, ox0: 0, otx: 0, trail: stub(), halo: stub(), core: stub(), shadow: stub(), body: stub() };
  fx.projs.push(pr);
  if (rate != null) fx.shotSlow({ from: 1, tgt: 9, rate });
  return { fx, pr, tgt, impacts: () => impacts };
}

test('a procedural shot flies at the rate it is told, lands late, and is back at full speed when released', () => {
  const { fx, pr, impacts } = flying(0.05);
  assert.equal(pr.rate, 0.05);
  fx._updateProjs(1);
  assert.ok(Math.abs(pr.t - 0.05) < 1e-9, `a second at 5 %: ${pr.t}`);
  assert.equal(impacts(), 0, 'still flying where it would have landed');
  fx.shotSlow({ from: 1, tgt: 9, rate: 1 });
  fx._updateProjs(0.5);
  assert.ok(Math.abs(pr.t - 0.55) < 1e-9, `released: ${pr.t}`);
  fx._updateProjs(0.5);
  assert.equal(impacts(), 1, 'lands');
});

test('a cleared procedural shot goes without landing; a slowed one whose target fell goes with it', () => {
  const a = flying(0.05);
  a.fx.shotSlow({ from: 1, tgt: 9, clear: 1 });
  a.fx._updateProjs(0.016);
  assert.equal(a.fx.projs.length, 0, 'gone');
  assert.equal(a.impacts(), 0, 'no impact');
  const b = flying(0.05);
  b.tgt.alive = false;
  b.fx._updateProjs(0.016);
  assert.equal(b.fx.projs.length, 0, 'gone with its target');
  assert.equal(b.impacts(), 0, 'no impact');
});

const FILES = {
  '/assets/local/fx/index.json': { bundles: { b: ['trail', 'hit'] } },
  '/assets/local/fx/enemy-modes.json': {
    $fx: { trail: ['b', 'trail'], hit: ['b', 'hit'] },
    enemy_gun: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { 1: { cast: [], opt: {}, hit: [], proj: { key: 'p_shot', trail: ['trail'], hit: ['hit'] } } } },
  },
};

test('the hit effects timed for a content shot wait for it while it is slowed, and never come for a cleared one', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, rate: () => 1, enemyDef: () => null, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    const foe = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'enemy', defId: 'enemy_gun' }, actor: { roles: { attack: { loop: 'Attack' } } } };
    const op = { id: 9, x: 3, y: 0, alive: true, info: { id: 9, side: 'ally' } };
    const views = new Map([[1, foe], [9, op]]);
    layer.onEvent(['tick'], views);
    const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 }, vp = { width: 10, height: 10 };
    const hits = () => seen.filter((p) => p.kind === 'spawn' && p.names.includes('hit')).length;
    const run = (s) => { for (let i = 0; i < Math.round(s * 20); i++) layer.update(0.05, cam, vp); };
    const shot = () => layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 1, tgt: 9, key: 'p_shot', move: 'TRACE_TARGET_WITH_SPEED', speed: 3, t: 1 }], views);
    const slow = (o) => layer.onEvent(['fx', 'shotSlow', 0, 0, { id: 7, from: 1, tgt: 9, ...o }], views);

    shot();
    run(0.5);
    slow({ rate: 0.05 });
    run(5);                    // 0.5 s of flight left at 5 %: 10 s
    assert.equal(hits(), 0, 'not at its old landing');
    slow({ rate: 1 });         // 5 s at 5 % flew 0.25 s of it: 0.25 s left
    run(0.1);
    assert.equal(hits(), 0, 'released: the rest of its flight');
    run(0.3);
    assert.equal(hits(), 1, 'lands when its flight is flown');

    shot();
    slow({ rate: 0.05 });
    slow({ clear: 1 });
    run(30);
    assert.equal(hits(), 1, 'a cleared shot never lands');

    shot();
    run(1.2);
    assert.equal(hits(), 2, 'an untouched shot lands on time');
  } finally { globalThis.fetch = fetch0; }
});

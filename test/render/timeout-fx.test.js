// test/render/timeout-fx.test.js — a boss round past its countdown wears the official time-out camera effect
// (docs/rules/fx.md 「시간 초과 화면 효과」): render/fxgame.js setTimeOut, render/app.js setTimeOut (kept across the
// battles shown), screens/game.js (m.public.overtimeAt → the view, and the danger sound the moment it comes). Its own
// file: the layer caches the index per process.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer, TIME_OUT_SCREEN } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PREFAB = path.join(ROOT, 'public/assets/local/fx/screen/screen_com_poison_04.json');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const macrotask = () => new Promise((r) => setImmediate(r));

test('the time-out global buff\'s camera effect (act1autochess_time_out_global_buff _timeOutCameraEffect)', () => {
  assert.equal(TIME_OUT_SCREEN, 'screen_com_poison_04');
});

test('setTimeOut: on plays it once on the camera, off plays nothing, quality low draws nothing', async () => {
  const fetch0 = globalThis.fetch;
  const files = { '/assets/local/fx/index.json': { bundles: { screen: [TIME_OUT_SCREEN] } } };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    let quality = 'high';
    const layer = createFxLayer({ host: null, above: null, quality: () => quality, dry: true, trace: (p) => seen.push(`${p.kind} ${p.names.join('+')} by ${p.by}`) });
    await macrotask(); // the index loads
    await layer.setTimeOut(true);
    assert.deepEqual(seen, [`timeOut ${TIME_OUT_SCREEN} by null`]);
    seen.length = 0;
    await layer.setTimeOut(false);
    assert.deepEqual(seen, []);
    quality = 'low';
    await layer.setTimeOut(true);
    assert.deepEqual(seen, []);
  } finally { globalThis.fetch = fetch0; }
});

test('the view keeps the time-out across the battles it shows; the game screen turns it on at m.public.overtimeAt', () => {
  const fxg = read('public/js/render/fxgame.js');
  assert.match(fxg, /tag: 'timeOut', camera: true/, 'on the camera, followed like the storm\'s sand');
  // (a dry layer loads nothing, so these are pinned here) an off or a clear() while the prefab loads drops it
  assert.match(fxg, /stormGen\+\+; outGen\+\+;/);
  assert.match(fxg, /if \(!mod \|\| !def \|\| gen !== outGen\) return;\n\s+const inst = new mod\.fxp\.FxInstance\(def, \{ quality: q\(\) \}\);\n\s+addLive\(inst, \{ view: null, owner: null, buff: true, keep: true, pinned: true, tag: 'timeOut'/);
  const app = read('public/js/render/app.js');
  assert.match(app, /if \(timeOut && !battleMeta\.prep\) fxGame\.setTimeOut\(true\);/, 'enterBattle wears it again (fxGame.clear ended it)');
  assert.match(app, /setTimeOut\(on\) \{\n\s+if \(destroyed \|\| timeOut === !!on\) return false;/);
  const game = read('public/js/screens/game.js');
  assert.match(game, /const timeOutAt = isBossPhase\(phase\) && !shownOver && Number\(pub\?\.overtimeAt\) > 0/);
  // off with the shown battle's end, as the official buff ends with its battle
  assert.match(game, /const shownOver = cc \? !!battleState\?\.done : .*f\.live === false\);/);
  assert.match(game, /audio\.sfx\('danger'\)/, 'ON_ACT1AUTOCHESS_ENTER_DANGER (tools/assets/audio.mjs UI_SFX danger)');
  assert.match(read('tools/assets/audio.mjs'), /danger: \{ bank: 'battle\.ON_ACT1AUTOCHESS_ENTER_DANGER' \}/);
});

test('the extracted prefab (skipped without public/assets): a looping smoke and the Dissolve AB flow sheet', { skip: !existsSync(PREFAB) && 'no extracted fx' }, () => {
  const def = JSON.parse(readFileSync(PREFAB, 'utf8'));
  assert.ok(def.nodes.some((n) => n.ps?.loop === true), 'a looping particle system: on until stopped');
  assert.ok(def.nodes.some((n) => n.mesh && /Dissolve AB/.test(def.materials[n.mesh.mat]?.shader || '')));
});

// test/render/horn-flare-fx.test.js — 号角 S1's flare stands where her shell ended, up at its target's hit point.
// Official client: skchr_horn_1's RangedAttackGroup fires projectile_chr_horn_s1 (the shell, its trail) and, beside it on the
// same ParacurveMovement to the same target, projectile_chr_horn_s1_light, whose `_effectsWhenReached` (horn_skill_01_hit_02,
// _buff) have no `_forceReachTargetGround` / `_followTargetGround` / `_useTraceTargetWhenReach`: EffectBehaviour.OnProjectileReached
// creates them on the projectile, Effect.Play(ILocatable) puts them at its mapPositionV3 where it reached (the target's hit
// mount point), and Effect._InitLocation leaves a `_spawnLocation` 0 NONE prefab without `_overwriteHeight` there. fxgame.js
// zoneFx played them on the ground under the sim's spot, {x, y, 0}.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { bodyPoint } from '../../public/js/render/fx/camera.js';
import { onModelPlane } from '../../public/js/render/fxpoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const CHESS = JSON.parse(readFileSync(path.join(ROOT, 'data/chess.json'), 'utf8'));
const records = Array.isArray(CHESS.chess) ? CHESS.chess : Object.values(CHESS.chess || CHESS);
const record = (id) => records.find((r) => r && r.chessId === id) || null;

const CHAR = 'char_4039_horn', CHESS_ID = 'chess_char_5_08_a';
const FLARE = ['horn_skill_01_hit_02_buff', 'horn_skill_01_hit_02'];

test('data: 号角 S1\'s zone is her flare projectile\'s reach effects, not on a projectile body', () => {
  assert.deepEqual(MODES[CHAR].skills[0].zone, { fx: FLARE, aura: [], onProj: 0 });
  assert.equal(MODES[CHAR].skillMode[0], null, 'S1 switches no attack mode: its attack carries the shot (takeShot)');
});

const settle = () => new Promise((r) => setTimeout(r, 10));
const files = {
  '/assets/local/fx/index.json': { bundles: { horn: [...FLARE, 'horn_skill_01_trail_02', 'horn_attack_01_trail_02'] } },
  '/assets/local/fx/modes.json': { [CHAR]: MODES[CHAR] },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const CAM = presetCamera('normal', { width: 1920, height: 1080 });
async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : record(info?.defId)) });
    await settle();
    const op = { id: 1, x: 2, y: 9, alive: true, info: { id: 1, side: 'ally', defId: CHESS_ID, spine: CHAR, skillIndex: 0, kind: 'op' } };
    const views = new Map([[1, op], [9, { id: 9, x: 5, y: 9, z: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } }]]);
    const step = (dt) => layer.update(dt, CAM);
    layer.onEvent(['deploy', 1], views);
    step(0.1);
    seen.length = 0;
    const flares = () => seen.splice(0).filter((p) => p.kind === 'spawn' && FLARE.includes(p.names[0]));
    await run({ layer, views, step, flares });
  } finally { globalThis.fetch = fetch0; }
}
const endOf = (v) => {
  const p = onModelPlane(CAM, v.x, v.y, 0, bodyPoint(CAM, v, 0.5, v.x), { x: 0, y: 0, z: 0 });
  return [p.x, p.y, p.z];
};
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

for (const dies of [false, true]) {
  test(`号角 S1: the flare stands at her shell's end, up at the target's hit point${dies ? ' (its target died in flight)' : ''} (docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」)`, () => withLayer(async ({ layer, views, step, flares }) => {
    layer.onEvent(['skill', 1, true], views);
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    layer.onEvent(['skill', 1, false], views);   // an instant skill: its window ends with the attack
    step(0.3);
    if (dies) { layer.onEvent(['die', 9, 'killed'], views); views.get(9).alive = false; }
    step(0.3);
    const want = endOf(views.get(9));
    layer.onEvent(['fx', 'zone', 5, 9, { id: 1, r: 1.7, duration: 6 }], views);
    const got = flares();
    assert.deepEqual(got.map((p) => p.names[0]).sort(), [...FLARE].sort());
    for (const p of got) {
      assert.ok(p.pt && near(p.pt, want), `${p.names[0]} at ${p.pt}, the shell's end ${want}: not on the ground under the sim's spot (the cause: zoneFx placing an attack-carried shot's reach effects at {x, y, 0}, not at shotTo of the shot's target)`);
    }
    assert.ok(want[2] > 0.2, `up in the air (${want})`);
  }));
}

test('号角 S1: a zone no attack of hers carried (none in 3 s) stays on the ground at the sim\'s spot', () => withLayer(async ({ layer, views, step, flares }) => {
  layer.onEvent(['skill', 1, true], views);
  layer.onEvent(['atk', 1, 9, 'bomb'], views);
  layer.onEvent(['skill', 1, false], views);
  step(3.5);
  layer.onEvent(['fx', 'zone', 5, 9, { id: 1, r: 1.7, duration: 6 }], views);
  const got = flares();
  assert.equal(got.length, 2);
  for (const p of got) assert.deepEqual(p.pt, [5, 9, 0]);
}));

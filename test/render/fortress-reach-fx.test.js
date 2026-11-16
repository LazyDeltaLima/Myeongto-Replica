// test/render/fortress-reach-fx.test.js — maintainer report 2026-11-01 「애쉬락·혼 같은 포트리스 디펜더의 투사체도 날아가는 도중에
// 적이 죽으면 사라진다」. Official client: the 要塞 shells (projectile_chr_ashlok / _s2, projectile_chr_horn / _s2 / _s3) carry
// their blast as `_effectsWhenReached` only, played where the shell reaches the ground whatever became of its target; the sim
// lands their splash there (ai.js `hitDead`). fxgame.js played the blast at the target's 'dmg' alone, so a target that died in
// flight left the shell to end without it — reachFx plays it at the flight's end on the ground where the target was.
// 2026-11-16 (official client: EffectBehaviour.OnProjectileReached with `_forceReachTargetGround`): the blast stands at the
// shell's own board x, y where it reached its target's hit mount point (its trail's end, shotTo) on the ground — behind
// the target's feet by the hit point's h cos 30° on the model's plane — live target or not (fxgame.js shellLand).

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

const OPS = {
  ashlok: { charId: 'char_431_ashlok', chessId: 'chess_char_2_18_a', hit: 'ashlok_attack_01_hit', melee: 'ashlok_attack_01_hit_02' },
  horn: { charId: 'char_4039_horn', chessId: 'chess_char_5_08_a', hit: 'horn_attack_01_hit_02', melee: 'horn_attack_01_hit' },
};

test('data: 灰毫 and 号角 are 要塞 whose Default shell flies (PARACURVE) and whose ranged hit is the shell\'s blast', () => {
  for (const o of Object.values(OPS)) {
    const r = record(o.chessId);
    assert.equal(r?.subProfessionId, 'fortress', o.chessId);
    assert.equal(r.shot?.base?.move, 'PARACURVE', o.chessId);
    assert.ok(r.shot.base.speed > 0, o.chessId);
    assert.deepEqual(MODES[o.charId].fortress[0].ranged.hit, [o.hit], o.charId);
  }
});

const settle = () => new Promise((r) => setTimeout(r, 10));
// (one table for every layer: the effect index is read once per module)
const files = {
  '/assets/local/fx/index.json': { bundles: Object.fromEntries(Object.values(OPS).map((o) => [o.charId.replace(/^char_\d+_/, ''), [o.hit, o.melee]])) },
  '/assets/local/fx/modes.json': Object.fromEntries(Object.values(OPS).map((o) => [o.charId, MODES[o.charId]])),
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
async function withLayer(o, run, cam = null) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : record(info?.defId)) });
    await settle();
    const y0 = cam ? 9 : 0;
    const op = { id: 1, x: 2, y: y0, alive: true, info: { id: 1, side: 'ally', defId: o.chessId, spine: o.charId, skillIndex: 0, kind: 'op' } };
    const foe = (id, x) => ({ id, x, y: y0, z: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const views = new Map([[1, op], [9, foe(9, 5)], [8, foe(8, 5.5)]]);
    const pts = [];
    const hits = () => seen.splice(0).filter((p) => p.names.some((n) => /_hit/.test(n))).map((p) => {
      if (p.pt) pts.push(p.pt);
      return `${p.names.join('+')}@${p.at ?? (p.pt ? 'ground' : 'none')}`;
    });
    const step = (dt) => layer.update(dt, cam);
    layer.onEvent(['deploy', 1], views);
    step(0.1);
    seen.length = 0;
    await run({ layer, views, hits, step, pts });
  } finally { globalThis.fetch = fetch0; }
}

for (const [name, o] of Object.entries(OPS)) {
  // 3 tiles at 5 tiles / s: the shell lands 0.6 s after the shot
  test(`${name}: a live target gets the blast at its 'dmg', and nothing more at the flight's end`, () => withLayer(o, async ({ layer, views, hits, step, pts }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    step(0.55);
    assert.deepEqual(hits(), [], 'not at the shot');
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
    layer.onEvent(['dmg', 8, 100, 'phys', 0, 1], views);   // the splash victim: not the shot's target
    step(0.2);
    assert.deepEqual(hits(), [`${o.hit}@ground`]);
    assert.deepEqual(pts, [[5, 0, 0]], 'under the shell, on the ground (no camera: the hit point straight over the feet)');
  }));

  test(`${name}: a target that dies in flight still gets the blast on the ground where it was, as the shell lands`, () => withLayer(o, async ({ layer, views, hits, step }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    step(0.2);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    step(0.3);
    assert.deepEqual(hits(), [], 'not before the shell lands');
    layer.onEvent(['dmg', 8, 100, 'phys', 0, 1], views);   // the splash where it lands
    step(0.2);
    assert.deepEqual(hits(), [`${o.hit}@ground`]);
  }));

  test(`${name}: the shell that kills its target plays the blast once`, () => withLayer(o, async ({ layer, views, hits, step, pts }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    step(0.55);
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    step(0.3);
    assert.deepEqual(hits(), [`${o.hit}@ground`]);
    assert.deepEqual(pts, [[5, 0, 0]], 'under the shell, on the ground (no camera: the hit point straight over the feet)');
  }));

  test(`${name}: a blocked enemy's melee blow is no shell`, () => withLayer(o, async ({ layer, views, hits, step }) => {
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    step(1);
    assert.deepEqual(hits(), []);
  }));
}

// Through the battle camera: the hit point of an enemy without a points table is half its drawn height, on the model's plane
// (fxgame.js shotTo) — the blast lands under it, h cos 30° rows behind the feet, at the ground
const CAM = presetCamera('normal', { width: 1920, height: 1080 });
const landOf = (v) => {
  const p = onModelPlane(CAM, v.x, v.y, 0, bodyPoint(CAM, v, 0.5, v.x), { x: 0, y: 0, z: 0 });
  return [p.x, p.y, 0];
};
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);
for (const [name, o] of Object.entries(OPS)) {
  for (const dies of [false, true]) {
    test(`${name}: the blast stands behind the feet under the shell's end${dies ? ' (its target died in flight)' : ''} — the client's _forceReachTargetGround (docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」)`, () => withLayer(o, async ({ layer, views, hits, step, pts }) => {
      layer.onEvent(['atk', 1, 9, 'bomb'], views);
      step(0.2);
      if (dies) { layer.onEvent(['die', 9, 'killed'], views); views.get(9).alive = false; }
      step(0.35);
      if (!dies) layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
      step(0.2);
      assert.deepEqual(hits(), [`${o.hit}@ground`]);
      const want = landOf(views.get(9));
      assert.ok(pts.length === 1 && near(pts[0], want), `the blast at ${pts[0]}, the shell's end over the ground ${want}: not at the target's feet (the cause: a blast placed on the target, not by shellLand)`);
      assert.ok(want[1] - views.get(9).y > 0.3 && Math.abs(want[0] - views.get(9).x) < 0.05, `h cos 30° behind the feet (${want})`);
    }, CAM));
  }
}

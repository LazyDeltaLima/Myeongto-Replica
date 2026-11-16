// test/render/greyy2-orb-fx.test.js — 그레이 더 라이트닝베어러 (char_1027_greyy2) S2: the orb's field stands under where the orb
// reached its target, on the ground. Official client: skchr_greyy2_2's RangedAttack (`_projectileDestination` 0) fires
// projectile_chr_greyy2_s2 at the target's hit mount point and its TRACE_TARGET_WITH_SPEED movement follows that point
// (BasicMovement.OnInit / GetTraceTargetMapPosition); its EffectBehaviour (`_forceReachTargetGround`, `_followTargetGround`)
// makes greyy2_skill_02_range at the orb's board x, y where it reached, on the target's ground (EffectBehaviour.OnProjectileReached)
// — the extracted shot record's `ground`. fxgame.js zoneFx flew the orb to the sim's spot {x, y, 0} (the target's root at the
// strike) and played the field there: docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」 어느 투사체가 그런가.

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
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const MODES = read('tools/assets/local-char-modes.json');
const CHESS = read('data/seasons/act3autochess/chess.json');
const records = Array.isArray(CHESS.chess) ? CHESS.chess : Object.values(CHESS.chess || CHESS);
const record = (id) => records.find((r) => r && r.chessId === id) || null;

const CHAR = 'char_1027_greyy2', CHESS_ID = 'chess_char_2_14_a';
const FIELD = 'greyy2_skill_02_range';

test('data: 그레이 더 라이트닝베어러 S2\'s zone is her orb\'s ground reach effect', () => {
  assert.deepEqual(MODES[CHAR].skills[1].zone.fx, [FIELD]);
  for (const id of [CHESS_ID, 'chess_char_2_14_b']) {
    const s = record(id).shot.skills[1];
    assert.equal(s.key, 'projectile_chr_greyy2_s2');
    assert.equal(s.move, 'TRACE_TARGET_WITH_SPEED');
    assert.deepEqual(s.ground, [FIELD], `${id}: its reach effect lands on the ground`);
  }
});

const settle = () => new Promise((r) => setTimeout(r, 10));
const files = {
  '/assets/local/fx/index.json': { bundles: { greyy2: [FIELD, 'greyy2_skill_02_trail', 'greyy2_skill_02_hit_02', 'greyy2_attack_trail'] } },
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
    const op = { id: 1, x: 2, y: 9, alive: true, info: { id: 1, side: 'ally', defId: CHESS_ID, spine: CHAR, skillIndex: 1, kind: 'op' } };
    const views = new Map([[1, op], [9, { id: 9, x: 6, y: 9, z: 0, alive: true, info: { id: 9, side: 'enemy', defId: 'enemy_x' } }]]);
    const step = (dt) => layer.update(dt, CAM);
    layer.onEvent(['deploy', 1], views);
    step(0.1);
    seen.length = 0;
    const fields = () => seen.splice(0).filter((p) => p.kind === 'spawn' && p.names[0] === FIELD);
    await run({ layer, views, step, fields });
  } finally { globalThis.fetch = fetch0; }
}
/** Under the hit point of a unit without a points table, on its ground (fxgame.js shotTo, shellLand). */
const landOf = (v) => {
  const p = onModelPlane(CAM, v.x, v.y, 0, bodyPoint(CAM, v, 0.5, v.x), { x: 0, y: 0, z: 0 });
  return [p.x, p.y, 0];
};
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-6);

for (const walk of [0, 0.4]) {
  test(`그레이 더 라이트닝베어러 S2: the field stands under where the orb reached its target${walk ? ' (it walked on in flight)' : ''} (docs/rules/fx.md 「포트리스 포탄의 폭발은 떨어진 자리에」)`, () => withLayer(async ({ layer, views, step, fields }) => {
    const t = views.get(9);
    layer.onEvent(['skill', 1, true], views);
    layer.onEvent(['fx', 'zone', 6, 9, { id: 1, r: 1, duration: 8.5 }], views);   // the kit's order (op-greyy2.js onStrike)
    layer.onEvent(['skill', 1, false], views);
    assert.deepEqual(fields(), [], 'nothing before the orb lands');
    t.x += walk;
    step(0.6);   // 4 tiles at the orb's speed 8 (+ walk)
    const got = fields();
    assert.equal(got.length, 1);
    const want = landOf(t);
    assert.ok(got[0].pt && near(got[0].pt, want), `${FIELD} at ${got[0].pt}, under the orb's end ${want}: not at the sim's spot [6, 9, 0] (the cause: zoneFx flying a ground-reaching skill shot to the zone's spot, not to its target — shot record \`ground\`)`);
    assert.ok(want[1] > t.y + 0.1, `a row behind the target's feet (${want})`);
  }));
}

test('그레이 더 라이트닝베어러 S2: with nobody standing at the spot, the field stays at the sim\'s spot', () => withLayer(async ({ layer, views, step, fields }) => {
  views.delete(9);
  layer.onEvent(['skill', 1, true], views);
  layer.onEvent(['fx', 'zone', 6, 9, { id: 1, r: 1, duration: 8.5 }], views);
  layer.onEvent(['skill', 1, false], views);
  step(0.6);
  const got = fields();
  assert.equal(got.length, 1);
  assert.deepEqual(got[0].pt, [6, 9, 0]);
}));

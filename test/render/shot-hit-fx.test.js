// test/render/shot-hit-fx.test.js — maintainer report 2026-10-31 「이격 블레이즈 S3가 발사된 후, 목표 적이 죽으면 타격 이펙트가
// 안 나옴」 (docs/rules/sim.md 「대상이 먼저 죽은 즉시 AttachToTarget 샷」). Official client: a ranged attack casts on each target
// as it shoots (RangedAttack.OnCastOnTarget → AbilityStandard.OnCastOnTarget → its behaviours → UberEffectEmitter →
// HitEffectOptions.OnCastOnTarget), so the hit effects of the emitter beside a shooting ability start on the target at the
// shot. char_modes.py marks them castOpt t: 3; fxgame.js shotHitFx plays them at the 'atk', attackHit no more at the 'dmg'.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = JSON.parse(readFileSync(path.join(ROOT, 'tools/assets/local-char-modes.json'), 'utf8'));
const B = 'char_1040_blaze2';

test('extracted: the hits of an emitter beside a shooting ability are castOpt t 3 — 烛煌 S3, 录武官, 能天使 S2 / S3 only', () => {
  const got = [];
  for (const [id, m] of Object.entries(MODES)) {
    if (id === '$comment') continue;
    (m.castOpt || []).forEach((o, i) => { for (const [n, x] of Object.entries(o || {})) if (x?.t === 3) got.push(`${id}/${m.modes[i]}/${n}`); });
  }
  assert.deepEqual(got.sort(), [
    'char_103_angel/S2-3/angle_attack_02_hit',
    'char_1040_blaze2/S3/blaze2_skill_03_hit', 'char_1040_blaze2/S3/blaze2_skill_03_hit_02',
    'char_4196_reckpr/Default/reckpr_attack_hit',
  ]);
  assert.deepEqual(MODES[B].castOpt[3].blaze2_skill_03_hit, { s: 4, e: 3, o: 1, t: 3 });
  // the Default shot's hit is its projectile's (_effectsWhenHit): at the hit, as before
  assert.equal(MODES[B].castOpt[0].blaze2_attack_01_hit, undefined);
});

const files = {
  '/assets/local/fx/index.json': { bundles: { blaze2: ['blaze2_skill_03_hit', 'blaze2_skill_03_hit_02', 'blaze2_skill_03_start', 'blaze2_attack_01_hit', 'blaze2_attack_01_start'] } },
  '/assets/local/fx/modes.json': { [B]: MODES[B] },
  '/assets/local/fx/enemy-index.json': { bundles: {} },
  '/assets/local/fx/enemy-modes.json': { $fx: {} },
};
const settle = () => new Promise((r) => setTimeout(r, 10));
async function withLayer(run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p) });
    await settle();
    const op = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', defId: B, spine: B, skillIndex: 2, kind: 'op' } };
    const foe = (id) => ({ id, x: 3, y: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const views = new Map([[1, op], [9, foe(9)], [8, foe(8)]]);
    const hits = () => seen.splice(0).filter((p) => p.names.some((n) => /_hit/.test(n))).map((p) => `${p.names.join('+')}@${p.at}`);
    layer.onEvent(['deploy', 1], views);
    layer.onEvent(['skill', 1, 1], views);
    layer.update(0.1);
    seen.length = 0;
    await run({ layer, views, hits });
  } finally { globalThis.fetch = fetch0; }
}

test('烛煌 S3: the falling fire starts on the target at the shot, not again at the bolt\'s hit', () => withLayer(async ({ layer, views, hits }) => {
  layer.onEvent(['swing', 1, 0, 'bolt', null, 9], views);
  layer.onEvent(['atk', 1, 9, 'bolt'], views);
  assert.deepEqual(hits(), ['blaze2_skill_03_hit+blaze2_skill_03_hit_02@9'], 'at the shot, on its target');
  layer.update(0.3);
  layer.onEvent(['dmg', 9, 100, 'arts', 0, 1], views);
  layer.onEvent(['dmg', 8, 100, 'arts', 0, 1], views);   // the splash victim: no cast target
  assert.deepEqual(hits(), [], 'nothing more when the bolt lands');
}));

test('烛煌 S3: a target that dies before the bolt lands still had its fire (the shot\'s)', () => withLayer(async ({ layer, views, hits }) => {
  layer.onEvent(['atk', 1, 9, 'bolt'], views);
  layer.onEvent(['die', 9, 'killed'], views);
  views.get(9).alive = false;
  layer.update(0.3);
  layer.onEvent(['dmg', 8, 100, 'arts', 0, 1], views);
  assert.deepEqual(hits(), ['blaze2_skill_03_hit+blaze2_skill_03_hit_02@9']);
}));

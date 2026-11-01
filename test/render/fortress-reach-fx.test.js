// test/render/fortress-reach-fx.test.js — maintainer report 2026-11-01 「애쉬락·혼 같은 포트리스 디펜더의 투사체도 날아가는 도중에
// 적이 죽으면 사라진다」. Official client: the 要塞 shells (projectile_chr_ashlok / _s2, projectile_chr_horn / _s2 / _s3) carry
// their blast as `_effectsWhenReached` only, played where the shell reaches the ground whatever became of its target; the sim
// lands their splash there (ai.js `hitDead`). fxgame.js played the blast at the target's 'dmg' alone, so a target that died in
// flight left the shell to end without it — reachFx plays it at the flight's end on the ground where the target was.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';

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
async function withLayer(o, run) {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(p),
      unitDef: (info) => (info?.side === 'enemy' ? null : record(info?.defId)) });
    await settle();
    const op = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', defId: o.chessId, spine: o.charId, skillIndex: 0, kind: 'op' } };
    const foe = (id, x) => ({ id, x, y: 0, z: 0, alive: true, info: { id, side: 'enemy', defId: 'enemy_x' } });
    const views = new Map([[1, op], [9, foe(9, 3)], [8, foe(8, 3.5)]]);
    const hits = () => seen.splice(0).filter((p) => p.names.some((n) => /_hit/.test(n))).map((p) => `${p.names.join('+')}@${p.at ?? 'ground'}`);
    layer.onEvent(['deploy', 1], views);
    layer.update(0.1);
    seen.length = 0;
    await run({ layer, views, hits });
  } finally { globalThis.fetch = fetch0; }
}

for (const [name, o] of Object.entries(OPS)) {
  // 3 tiles at 5 tiles / s: the shell lands 0.6 s after the shot
  test(`${name}: a live target gets the blast at its 'dmg', and nothing more at the flight's end`, () => withLayer(o, async ({ layer, views, hits }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    layer.update(0.55);
    assert.deepEqual(hits(), [], 'not at the shot');
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
    layer.onEvent(['dmg', 8, 100, 'phys', 0, 1], views);   // the splash victim: not the shot's target
    layer.update(0.2);
    assert.deepEqual(hits(), [`${o.hit}@9`]);
  }));

  test(`${name}: a target that dies in flight still gets the blast on the ground where it was, as the shell lands`, () => withLayer(o, async ({ layer, views, hits }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    layer.update(0.2);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    layer.update(0.3);
    assert.deepEqual(hits(), [], 'not before the shell lands');
    layer.onEvent(['dmg', 8, 100, 'phys', 0, 1], views);   // the splash where it lands
    layer.update(0.2);
    assert.deepEqual(hits(), [`${o.hit}@ground`]);
  }));

  test(`${name}: the shell that kills its target plays the blast once`, () => withLayer(o, async ({ layer, views, hits }) => {
    layer.onEvent(['atk', 1, 9, 'bomb'], views);
    layer.update(0.55);
    layer.onEvent(['dmg', 9, 100, 'phys', 0, 1], views);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    layer.update(0.3);
    assert.deepEqual(hits(), [`${o.hit}@9`]);
  }));

  test(`${name}: a blocked enemy's melee blow is no shell`, () => withLayer(o, async ({ layer, views, hits }) => {
    layer.onEvent(['atk', 1, 9, 'none'], views);
    layer.onEvent(['die', 9, 'killed'], views);
    views.get(9).alive = false;
    layer.update(1);
    assert.deepEqual(hits(), []);
  }));
}

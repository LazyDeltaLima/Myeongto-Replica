// test/render/enemy-mortar-fx.test.js — 帝国炮火先兆者's shells (2026-10-22, docs/rules/fx.md 「적 포탄 — 帝国炮火先兆者」):
// fx 'bombardShell' / 'bombard' (content/enemies/fly.js kitShell) draw its projectile's official effects — the reticle on the
// spot as it fires, the self-falling shell just before the landing, the hit at the landing — and own the events, so fx.js's
// procedural mortar stays off; an enemy without extracted effects keeps the procedural one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const PROJ = { key: 'projectile_enemy_emppnt', mount: 2, trail: ['m_trail'], reached: ['m_hit'], targetStart: ['m_start'] };
const files = {
  '/assets/local/fx/index.json': { bundles: { b: ['m_trail', 'm_hit', 'm_start'] } },
  '/assets/local/fx/enemy-modes.json': {
    $fx: { m_trail: ['b', 'm_trail'], m_hit: ['b', 'm_hit'], m_start: ['b', 'm_start'] },
    enemy_1112_emppnt: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: PROJ } }] },
    enemy_bare: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: { key: 'p_none', trail: ['nope'] } } }] },
  },
};
const DEFS = { enemy_1112_emppnt: { proj: { key: 'projectile_enemy_emppnt', move: 'ATTACH', delay: 3, speed: 0 } }, enemy_bare: { proj: { key: 'p_none' } } };
const settle = () => new Promise((r) => setTimeout(r, 10));

test('帝国炮火先兆者: reticle as it fires, the shell falls just before the landing, its hit at the landing', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => DEFS[id] ?? null, trace: (p) => seen.push(p) });
    await settle();
    const foe = (id, defId) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } } } });
    const views = new Map([[1, foe(1, 'enemy_1112_emppnt')], [2, foe(2, 'enemy_bare')]]);
    const take = () => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names.join('+'));
    layer.onEvent(['tick'], views);
    take();

    const shell = ['fx', 'bombardShell', 3, 1, { x: 3, y: 1, id: 1, r: 1.2, t: 3 }];
    layer.onEvent(shell, views);
    assert.equal(layer.ownsFx(shell), true, 'no procedural mortar');
    assert.deepEqual(take(), ['m_start'], 'the reticle on the spot at once');
    layer.update(2.6);
    assert.deepEqual(take(), [], 'the shell is not in the air yet');
    layer.update(0.2);
    assert.deepEqual(take(), ['m_trail'], 'it falls by itself over its last 0.27 s');
    const land = ['fx', 'bombard', 3, 1, { x: 3, y: 1, r: 1.2, kind: 'emppnt' }];
    layer.onEvent(land, views);
    assert.equal(layer.ownsFx(land), true);
    assert.deepEqual(take(), ['m_hit']);
    const again = ['fx', 'bombard', 3, 1, { x: 3, y: 1, r: 1.2, kind: 'emppnt' }];
    layer.onEvent(again, views);
    assert.equal(layer.ownsFx(again), false, 'one landing per shell');

    // nothing of its projectile extracted: the procedural mortar and blast stay
    const bare = ['fx', 'bombardShell', 0, 0, { x: 0, y: 0, id: 2, r: 1.2, t: 3 }];
    layer.onEvent(bare, views);
    assert.equal(layer.ownsFx(bare), false);
    assert.deepEqual(take(), []);
  } finally { globalThis.fetch = fetch0; }
});

// test/render/ac-boss-fx-bare.test.js — 假想敌：鳍's fx events with none of its effects extracted (ac-boss-fx.test.js: the
// extracted case; a file of its own because the effect layer loads its tables once per process): the stand-ins stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const EEL = 'enemy_9037_aceel_2';
const settle = () => new Promise((r) => setTimeout(r, 10));
async function layerWith() {
  const files = {
    '/assets/local/fx/index.json': { bundles: { b: [] } },
    '/assets/local/fx/enemy-modes.json': { $fx: {}, [EEL]: {
      modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_aceel', mount: 2, trail: ['line'], hit: ['hit'] } } }],
      buffFx: { 'aceel[shield]': ['sh_loop'] }, buffBlocked: { 'aceel[shield]': ['sh_end'] } } },
  };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const stood = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null, standIn: (k, x, y, ex) => stood.push([k, x, y, ex]) });
  await settle();
  const foe = (id, defId) => ({ id, x: id, y: 0, alive: true, isEnemy: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } } } });
  const ally = (id) => ({ id, x: id, y: 1, alive: true, info: { id, side: 'ally', defId: 'char_x' } });
  const views = new Map([[1, foe(1, EEL)], [3, ally(3)], [4, ally(4)]]);
  layer.onEvent(['tick'], views);
  return { layer, views, stood };
}

test('鳍 / 茧 fx events: nothing extracted — the stand-ins stay', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { layer, views, stood } = await layerWith(false);
    for (const [kind, o] of [['phase', { id: 1, kind: 'aceelShield' }], ['phase', { id: 1, kind: 'aceelShieldEnd' }],
      ['link', { from: 3, to: 4, kind: 'aceelChain', dur: 0.2, id: 1, key: 'projectile_enemy_aceel' }]]) {
      const e = ['fx', kind, 0, 0, o];
      layer.onEvent(e, views);
      assert.equal(layer.ownsFx(e), false, `${kind} ${o.kind}`);
    }
    // 2026-11-11: 萨尔贡 6's 流沙 without its map effect extracted: the stand-in zone on its tile — since 2026-11-16 drawn by
    // the layer from its records (`standIn`, keyed), so a re-entry or a lost context draws it again
    const e = ['fx', 'zone', 5, 3, { r: 0.5, dur: 1e4, kind: 'sargonSand', tiles: 'box', id: 3 }];
    layer.onEvent(e, views);
    assert.equal(layer.ownsFx(e), true, 'owned: the stand-in comes from the record');
    assert.deepEqual(stood.map((s) => [s[0], s[1], s[2], s[3].kind, typeof s[3].key]), [['zone', 5, 3, 'sargonSand', 'string']]);
  } finally { globalThis.fetch = fetch0; }
});

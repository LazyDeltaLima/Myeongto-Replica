// test/render/enemy-death-shot-fx.test.js — the death shots of 高能源石虫 / 冰爆源石虫 / 卷心籽 / 假想敌：蚀裂 / 刺胄之弹
// (2026-10-31, docs/rules/fx.md 「적 장판 — 污染秽蚀」): the sim's death fx name the enemy and its ability — 'explode'
// { id, ability: 'boom' } (content/enemies/archetypes.js deathBoom), 刺胄之弹's 'zone' { id, ability: 'killed' }
// (content/bosses.js shellZone) and its arrival 'explode' { id: 假想敌：胄, ability: '1' } (the boss skill's
// projectile_enemy_acstmr that carries it → enemy_acstmr_explode), 蚀裂's 'enemyShot' { zone: 1 } then its 毒雾 'zone' { id, ability: '1' } (content/enemies/dot.js)
// — and fxgame.js eprojAreaFx draws that ability's projectile effects instead of the procedural ring / zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const FX = ['bs_start', 'ft_boom', 'ac_start', 'ac_trail', 'ac_hit', 'ac_idle', 'st_range', 'st_move', 'st_explode'];
const files = {
  '/assets/local/fx/index.json': { bundles: { b: FX } },
  '/assets/local/fx/enemy-modes.json': {
    $fx: Object.fromEntries(FX.map((n) => [n, ['b', n]])),
    enemy_1021_bslime: { modes: [{ name: 'Default', anim: [] }], skills: { boom: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_bslime', targetStart: ['bs_start'] } } } },
    enemy_10065_ftzlc: { modes: [{ name: 'Default', anim: [] }], skills: { boom: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_ftzlc', reached: ['ft_boom'] } } } },
    enemy_9006_actoxi: {
      modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { 1: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_actoxi', trail: ['ac_trail'], hit: ['ac_hit'], reached: ['ac_idle'], start: ['ac_start'], raise: 0.6 } } },
    },
    enemy_9016_acstmr: { modes: [{ name: 'Default', anim: [] }], skills: { killed: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_acstmr_s1', reached: ['st_range'] } } } },
    enemy_9013_acstmk: {
      modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { 1: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_acstmr', trail: ['st_move'], reached: ['st_explode'], speed: 0.45 } } },
    },
    enemy_bare: { modes: [{ name: 'Default', anim: [] }], skills: { boom: { cast: [], opt: {}, hit: [], proj: { key: 'p_none', targetStart: ['nope'] } } } },
  },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('death shots: bursts once, areas for their time, 蚀裂\'s cloud flies and stands where it lands', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null, trace: (p) => seen.push(p) });
    await settle();
    const foe = (id, defId, alive = false) => ({ id, x: 0, y: 0, alive, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } } } });
    const op = { id: 9, x: 3, y: 0, alive: true, info: { id: 9, side: 'ally' } };
    const views = new Map([[1, foe(1, 'enemy_1021_bslime')], [2, foe(2, 'enemy_10065_ftzlc')], [3, foe(3, 'enemy_9006_actoxi')],
      [4, foe(4, 'enemy_9016_acstmr', true)], [5, foe(5, 'enemy_bare')], [6, foe(6, 'enemy_9013_acstmk', true)], [9, op]]);
    const take = () => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names.join('+'));
    layer.onEvent(['tick'], views);
    take();

    // 高能源石虫 / 卷心籽: the boom projectile's target-start / reach effect where it died, no ring
    const slime = ['fx', 'explode', 1, 2, { r: 1.25, kind: 'deathBoom', id: 1, ability: 'boom' }];
    layer.onEvent(slime, views);
    assert.equal(layer.ownsFx(slime), true, 'no procedural ring');
    assert.deepEqual(take(), ['bs_start']);
    const seed = ['fx', 'explode', 1, 2, { r: 1.25, kind: 'deathBoom', id: 2, ability: 'boom' }];
    layer.onEvent(seed, views);
    assert.equal(layer.ownsFx(seed), true);
    assert.deepEqual(take(), ['ft_boom']);

    // 刺胄之弹's landing: its range effect for the zone's time
    const shell = ['fx', 'zone', 4, 4, { r: 1.5, dur: 9.95, kind: 'helmShell', tiles: 'box', id: 4, ability: 'killed' }];
    layer.onEvent(shell, views);
    assert.equal(layer.ownsFx(shell), true);
    assert.deepEqual(take(), ['st_range']);

    // its arrival burst: the reach effect of the boss skill's projectile that carried it, once (its trail flew with the shot)
    const blast = ['fx', 'explode', 4, 4, { r: 1.5, kind: 'helmShell', tiles: 'box', id: 6, ability: '1' }];
    layer.onEvent(blast, views);
    assert.equal(layer.ownsFx(blast), true, 'no procedural blast');
    assert.deepEqual(take(), ['st_explode']);
    // fired by a boss whose view is gone: the procedural blast stays
    const orphan = ['fx', 'explode', 4, 4, { r: 1.5, kind: 'helmShell', tiles: 'box', id: 7, ability: '1' }];
    layer.onEvent(orphan, views);
    assert.equal(layer.ownsFx(orphan), false);
    assert.deepEqual(take(), []);

    // 假想敌：蚀裂: start where it leaves and the hit on the killer with the shot — not the cloud, which stands with the zone
    layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 3, tgt: 9, key: 'projectile_enemy_actoxi', move: 'PARACURVE', speed: 5, t: 0, zone: 1 }], views);
    assert.deepEqual(take().sort(), ['ac_hit', 'ac_start']);
    views.delete(3);   // its dying view is gone by the landing: the record its shot left still draws the cloud
    const cloud = ['fx', 'zone', 3, 0, { r: 0.8, dur: 10, kind: 'poison', id: 3, ability: '1' }];
    layer.onEvent(cloud, views);
    assert.equal(layer.ownsFx(cloud), true, 'no procedural poison zone');
    assert.deepEqual(take(), ['ac_idle']);

    // nothing of its projectile extracted: the ring stays
    const bare = ['fx', 'explode', 0, 0, { r: 1.25, kind: 'deathBoom', id: 5, ability: 'boom' }];
    layer.onEvent(bare, views);
    assert.equal(layer.ownsFx(bare), false);
    assert.deepEqual(take(), []);
  } finally { globalThis.fetch = fetch0; }
});

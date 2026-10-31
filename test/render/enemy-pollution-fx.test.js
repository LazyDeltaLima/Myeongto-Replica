// test/render/enemy-pollution-fx.test.js — 【污染秽蚀】 of 萨卡兹枯朽战士 / 萨卡兹枯朽战车 (2026-10-31, docs/rules/fx.md
// 「적 장판 — 污染秽蚀」): the sim's fx 'zone' { id, ability } (content/enemies/helpers.js zone) draws the effects of that
// ability's official projectile on the spot until the zone's time is up and owns the event, so fx.js's procedural zone stays
// off; an ability with nothing extracted keeps the procedural zone and does not replay the ability's cast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const files = {
  '/assets/local/fx/index.json': { bundles: { b: ['p_range', 't_range', 't_start'] } },
  '/assets/local/fx/enemy-modes.json': {
    $fx: { p_range: ['b', 'p_range'], t_range: ['b', 't_range'], t_start: ['b', 't_start'] },
    enemy_1267_nhpbr: {
      modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { 'talent/polluteddie': { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_nhpbr_polluted', targetStart: ['p_range'] } },
        polluteddie: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_nhpbr_polluted', targetStart: ['p_range'] } } },
    },
    enemy_1272_nhtank: {
      modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { pollutedrangedatk: { cast: ['t_start'], opt: {}, hit: [], proj: { key: 'projectile_enemy_nhtank_polluted', reached: ['t_range'] }, anim: 'Attack' } },
    },
    enemy_bare: {
      modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: [], opt: {}, hit: [] } }],
      skills: { pollutedrangedatk: { cast: ['t_start'], opt: {}, hit: [], proj: { key: 'p_none', reached: ['nope'] } } },
    },
  },
};
const settle = () => new Promise((r) => setTimeout(r, 10));

test('污染秽蚀: the ability projectile\'s effects on the spot for the zone\'s time; nothing extracted → the procedural zone', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: () => null, trace: (p) => seen.push(p) });
    await settle();
    const foe = (id, defId, alive = true) => ({ id, x: 0, y: 0, alive, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } } } });
    const views = new Map([[1, foe(1, 'enemy_1267_nhpbr', false)], [2, foe(2, 'enemy_1272_nhtank')], [3, foe(3, 'enemy_bare')]]);
    const take = () => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names.join('+'));
    layer.onEvent(['tick'], views);
    take();

    // the warrior's death zone (its view is still there, dying)
    const die = ['fx', 'zone', 7, 10, { r: 2, dur: 8, kind: 'pollution', id: 1, ability: 'PollutedDie' }];
    layer.onEvent(die, views);
    assert.equal(layer.ownsFx(die), true, 'no procedural zone');
    assert.deepEqual(take(), ['p_range']);

    // the tank's shell zone: the reach effect only — its cast (t_start) played with the attack, not again at the landing
    const shell = ['fx', 'zone', 7, 10, { r: 1.7, dur: 10, kind: 'pollution', id: 2, ability: 'PollutedRangedAtk' }];
    layer.onEvent(shell, views);
    assert.equal(layer.ownsFx(shell), true);
    assert.deepEqual(take(), ['t_range']);

    // nothing of its projectile extracted: the procedural zone stays and the cast is not replayed
    const bare = ['fx', 'zone', 0, 0, { r: 1.7, dur: 10, kind: 'pollution', id: 3, ability: 'PollutedRangedAtk' }];
    layer.onEvent(bare, views);
    assert.equal(layer.ownsFx(bare), false);
    assert.deepEqual(take(), []);

    // a zone without a source keeps the procedural one
    const anon = ['fx', 'zone', 0, 0, { r: 1, dur: 3, kind: 'pollution' }];
    layer.onEvent(anon, views);
    assert.equal(layer.ownsFx(anon), false);
  } finally { globalThis.fetch = fetch0; }
});

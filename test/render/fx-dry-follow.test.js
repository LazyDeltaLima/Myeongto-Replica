// test/render/fx-dry-follow.test.js — render/fxgame.js `dry` (tools/fx-golden.mjs, docs/rules/fx.md 「이벤트 기록 골든」): a
// dry layer loads no prefab, and still traces what a started prefab creates once it plays, from its JSON alone — its
// OnPlayEmitter / OnFinishEmitter prefabs (`spawn:emit`, on the unit it sits on) and its RandomEmitter copies
// (`spawn:random`, at a point), then theirs; the status effects render/fxstatus.js turns on (`status`); the board's
// 沙尘暴 (`storm`, setStorm) and 荒芜拉普兰德's S3 wolves (`spawn:wolf`), which load before they trace in a browser. Its own
// file: the layer caches the index per process (the first test's, every bundle the file's tests play).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const macrotask = () => new Promise((r) => setImmediate(r));

test('a dry layer traces the prefabs a started prefab creates', async () => {
  const files = {
    '/assets/local/fx/index.json': { bundles: { bond: ['p', 'kid', 'end', 'copy', 'grand'], screen: ['screen_desert_up_to_down'], map: ['map_desert_02_down'], whitw2: ['whitw2_skill_03_token_trail_01'] } },
    '/assets/local/fx/bond/p.json': { nodes: [{ onPlay: { effects: ['kid', 'absent'] }, onFinish: { effects: ['end'] } }, { emit: { effect: 'copy', count: 3 } }] },
    '/assets/local/fx/bond/kid.json': { nodes: [{ onFinish: { effects: ['grand', 'p'] } }] },
  };
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = new Set();
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true,
      trace: (p) => seen.add(`${p.kind}:${p.tag} ${p.names.join('+')} on ${p.on}`) });
    await macrotask(); // the index loads
    const views = new Map([[7, { id: 7, info: { id: 7, side: 'player' }, x: 1, y: 1, z: 0, alive: true, facing: 1 }]]);
    layer.onEvent(['tplfx', 7, 'p', null], views); // a template effect on unit 7 (spawn)
    await macrotask();
    assert.deepEqual([...seen].sort(), [
      'spawn:emit end on 7',      // p's OnFinishEmitter
      'spawn:emit grand on 7',    // kid's, in turn …
      'spawn:emit kid on 7',      // p's OnPlayEmitter (`absent` is not in the bundle)
      'spawn:emit p on 7',        // … and its `p`, not followed a second time
      'spawn:random copy on null', // p's RandomEmitter copies, at a point
      'spawn:tplfx p on 7',
    ]);
  } finally { globalThis.fetch = fetch0; }
});

test('a status effect is traced once per unit and key, with what it creates', async () => {
  const fetch0 = globalThis.fetch;
  const files = { '/assets/local/fx/bond/p.json': { nodes: [{ onPlay: { effects: ['kid'] } }] } };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(`${p.kind}:${p.tag ?? ''} ${p.names.join('+')} by ${p.by} on ${p.on ?? null}`) });
    await macrotask(); // the index (the first test's, cached for the process)
    const v = { id: 3, info: { id: 3, side: 'enemy' }, x: 0, y: 0, z: 0, alive: true };
    assert.ok(layer.statusReady('bond', 'p'));
    layer.statusOn(v, 'bond', 'p', 'stun', 0.5);
    layer.statusOn(v, 'bond', 'p', 'stun', 0.5); // already on: nothing
    await macrotask();
    assert.deepEqual(seen, ['status: p by 3 on null', 'spawn:emit kid by 3 on null']);
  } finally { globalThis.fetch = fetch0; }
});

test('a dry layer traces the 沙尘暴 board effects and the S3 wolves (no load)', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, json: async () => null });
  try {
    const seen = [];
    const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => seen.push(`${p.kind}:${p.tag ?? ''} ${p.names.join('+')} by ${p.by}`) });
    await macrotask(); // the index (the first test's, cached for the process)
    await layer.setStorm([{ c0: 0, c1: 12, dir: 'DOWN' }], [{ r: 12, c: 3, z: 0 }]);
    assert.deepEqual(seen.splice(0), ['storm: screen_desert_up_to_down by null', 'storm: map_desert_02_down by null']);
    const views = new Map([[5, { id: 5, info: { id: 5, side: 'player' }, x: 3, y: 10, z: 0, alive: true, facing: 1 }]]);
    layer.onEvent(['fx', 'whitw2Drones', 3, 10, { id: 5, d: [4, 10, 2, 10] }], views);
    layer.onEvent(['fx', 'whitw2Drones', 3, 10, { id: 5, d: [4.1, 10, 2, 10] }], views); // the same two wolves move on
    await macrotask();
    assert.deepEqual(seen, ['spawn:wolf whitw2_skill_03_token_trail_01 by 5', 'spawn:wolf whitw2_skill_03_token_trail_01 by 5']);
  } finally { globalThis.fetch = fetch0; }
});

// test/render/fx-dry-follow.test.js — render/fxgame.js `dry` (tools/fx-golden.mjs, docs/rules/fx.md 「이벤트 기록 골든」): a
// dry layer loads no prefab, and still traces what a started prefab creates once it plays, from its JSON alone — its
// OnPlayEmitter / OnFinishEmitter prefabs (`spawn:emit`, on the unit it sits on) and its RandomEmitter copies
// (`spawn:random`, at a point), then theirs. Its own file: the layer caches the index per process.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const macrotask = () => new Promise((r) => setImmediate(r));

test('a dry layer traces the prefabs a started prefab creates', async () => {
  const files = {
    '/assets/local/fx/index.json': { bundles: { bond: ['p', 'kid', 'end', 'copy', 'grand'] } },
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

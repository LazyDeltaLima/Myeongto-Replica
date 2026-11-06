// A 秘术师's held energies. 维伊's emitter (MergeableChargeUberEffectEmitter) fills slots: every third store merges and
// replaces the two it took; each held slot casts its `change` effect as a real attack starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer, mergeableSlot } from '../../public/js/render/fxgame.js';

const rank = (r, i) => `veen_telent_01_rank_0${r}${i ? `_${i + 1}` : ''}`;
const change = (r, i) => `veen_telent_01_rank_0${r}_change${i ? `_${i + 1}` : ''}`;
const hold = (r, cnt) => Array.from({ length: cnt }, (_, i) => [rank(r, i), change(r, i)]);
const release = (r, cnt) => Array.from({ length: cnt }, (_, i) => [change(r, i)]);
const CHARGE = { hold: hold(1, 5), cast: [], merged: hold(2, 4), mergeSize: 3, release: release(1, 5), mergedRelease: release(2, 4) };
const prefabs = [...CHARGE.hold.flat(), ...CHARGE.merged.flat()];
const FILES = {
  '/assets/local/fx/index.json': { bundles: { veen: prefabs, indigo: ['indigo_store_a', 'indigo_store_b'] } },
  '/assets/local/fx/modes.json': {
    char_4226_veen: { modes: ['Default'], charge: CHARGE },
    char_469_indigo: { modes: ['Default'], charge: { hold: [['indigo_store_a'], ['indigo_store_b']], cast: [] } },
  },
};

async function layerWith() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
  await new Promise((r) => setTimeout(r, 20));
  globalThis.fetch = fetch0;
  const view = (id, defId) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'ally', kind: 'op', defId, spine: defId } });
  const views = new Map([[1, view(1, 'char_4226_veen')], [2, view(2, 'char_469_indigo')]]);
  const store = (id, n) => layer.onEvent(['fx', 'mysticStore', 0, 0, { id, n, signal: 'store' }], views);
  const swing = (id) => layer.onEvent(['swing', id, 0.5, 'ranged'], views);
  const got = () => plays.splice(0).filter((q) => q.kind === 'spawn' || q.kind === 'attackStart').flatMap((q) => q.names);
  return { store, swing, got };
}

test('mergeableSlot: every store of 维伊\'s nine goes where the emitter puts it', () => {
  const seq = Array.from({ length: 9 }, (_, i) => mergeableSlot(i + 1, 3));
  assert.deepEqual(seq.map((s) => s.slot), [0, 1, 0, 1, 2, 1, 2, 3, 2]);
  assert.deepEqual(seq.map((s) => s.merge), [false, false, true, false, false, true, false, false, true]);
});

test('chargeStore: 维伊\'s third store plays the merged energy, the next ones sit after it', async () => {
  const { store, got } = await layerWith();
  const at = (n) => { store(1, n); return got(); };
  assert.deepEqual(at(1), [rank(1, 0), change(1, 0)]);
  assert.deepEqual(at(2), [rank(1, 1), change(1, 1)]);
  assert.deepEqual(at(3), [rank(2, 0), change(2, 0)]);
  assert.deepEqual(at(4), [rank(1, 1), change(1, 1)]);
  assert.deepEqual(at(5), [rank(1, 2), change(1, 2)]);
  assert.deepEqual(at(6), [rank(2, 1), change(2, 1)]);
});

test('chargeSwing: a real attack casts each held slot\'s effect once, merged slots their own', async () => {
  const { store, swing, got } = await layerWith();
  for (const n of [1, 2, 3, 4]) store(1, n);
  got();
  swing(1);
  assert.deepEqual(got().sort(), [change(2, 0), change(1, 1)].sort());
});

test('an emitter that does not merge keeps its one stage per store and casts nothing on the swing', async () => {
  const { store, swing, got } = await layerWith();
  store(2, 1);
  store(2, 2);
  assert.deepEqual(got(), ['indigo_store_a', 'indigo_store_b']);
  swing(2);
  assert.deepEqual(got(), []);
});

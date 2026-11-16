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

// 黑键 (MultiExChargeUberEffectEmitter): each mode's ExChargeAttack ability holds the trait's energies (orange, by n) and the
// elite ones (red, by e) on two emitters; the mode switch detaches one ability and attaches the next (S3: all red); the sim's
// 'mysticHeld' says what stays after a release (the elite ones at a normal target), S2's spending and S3's turning.
const ebn = (kind, i) => `ebnhlz_attack_${kind}${i ? `_${i + 1}` : ''}`;
const EBN_DEFAULT = {
  hold: [0, 1, 2, 3].map((i) => [ebn('charge_orange', i)]), release: [0, 1, 2, 3].map((i) => [ebn('start_02_orange', i)]),
  exHold: [[ebn('charge_red', 4)]], exRelease: [[ebn('start_02_red', 4)]],
};
const EBN_S3 = { exHold: [0, 1, 2, 3, 4].map((i) => [ebn('charge_red', i)]), exRelease: [0, 1, 2, 3, 4].map((i) => [ebn('start_02_red', i)]) };
const EBN = { modes: ['Default', 'S1', 'S3'], skillMode: [1, null, 2], cast: [['ebnhlz_attack_start_01'], ['ebnhlz_attack_start_01'], ['ebnhlz_attack_start_01']], charge: { cast: [], byMode: [EBN_DEFAULT, EBN_DEFAULT, EBN_S3] } };

// (the layer reads index.json / modes.json once for the module: the same FILES as the tests above)
FILES['/assets/local/fx/index.json'].bundles.ebnhlz = [...new Set(['ebnhlz_attack_start_01', ...EBN.charge.byMode.flatMap((m) => Object.values(m).flat(2))])];
FILES['/assets/local/fx/modes.json'].char_4046_ebnhlz = EBN;

async function ebnLayer() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (FILES[url] ? { ok: true, json: async () => FILES[url] } : { ok: false, json: async () => null });
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (q) => plays.push(q), dry: true });
  await new Promise((r) => setTimeout(r, 20));
  globalThis.fetch = fetch0;
  const v = { id: 1, x: 0, y: 0, alive: true, info: { id: 1, side: 'ally', kind: 'op', defId: 'char_4046_ebnhlz', spine: 'char_4046_ebnhlz', skillIndex: 2 } };
  const views = new Map([[1, v]]);
  const ev = (kind, o) => layer.onEvent(['fx', kind, 0, 0, { id: 1, ...o }], views);
  // (the mode's own cast, ebnhlz_attack_start_01, is the swing's: not the charge's)
  const got = () => plays.splice(0).filter((q) => q.kind === 'spawn' || q.kind === 'attackStart').flatMap((q) => q.names).filter((n) => n !== 'ebnhlz_attack_start_01');
  return { layer, views, ev, got };
}

test('chargeStore by mode: 黑键 stores orange by the trait\'s count and red by the elite count', async () => {
  const { ev, got } = await ebnLayer();
  ev('mysticStore', { n: 1, e: 0, signal: 'store' });
  assert.deepEqual(got(), [ebn('charge_orange', 0)]);
  ev('mysticStore', { n: 2, e: 0, signal: 'store' });
  ev('mysticStore', { n: 3, e: 0, signal: 'store' });
  assert.deepEqual(got(), [ebn('charge_orange', 1), ebn('charge_orange', 2)]);
  ev('mysticStore', { n: 4, e: 1, elite: 1, signal: 'store' });
  assert.deepEqual(got(), [ebn('charge_red', 4)], 'the elite energy is the ex emitter\'s first group');
});

test('chargeSwing by mode: every held group of both emitters casts its start_02', async () => {
  const { layer, views, ev, got } = await ebnLayer();
  ev('mysticStore', { n: 1, e: 0, signal: 'store' });
  ev('mysticStore', { n: 2, e: 0, signal: 'store' });
  ev('mysticStore', { n: 3, e: 1, elite: 1, signal: 'store' });
  got();
  layer.onEvent(['swing', 1, 0.5, 'ranged'], views);
  assert.deepEqual(got().sort(), [ebn('start_02_orange', 0), ebn('start_02_orange', 1), ebn('start_02_red', 4)].sort());
});

test('S3 attaches its own ability: the held energies come back red; mysticHeld keeps the elite one at a normal target', async () => {
  const { layer, views, ev, got } = await ebnLayer();
  ev('mysticStore', { n: 1, e: 0, signal: 'store' });
  ev('mysticStore', { n: 2, e: 0, signal: 'store' });
  got();
  layer.onEvent(['skill', 1, true], views);   // S3 (skillIndex 2) → mode S3
  ev('mysticHeld', { n: 0, e: 2 });           // the sim turned both elite
  assert.deepEqual(got().filter((n) => n.includes('charge')), [ebn('charge_red', 0), ebn('charge_red', 1)]);
  layer.onEvent(['skill', 1, false], views);  // back to Default: one elite kept, one normal
  ev('mysticHeld', { n: 1, e: 1 });
  assert.deepEqual(got().filter((n) => n.includes('charge')).sort(), [ebn('charge_orange', 0), ebn('charge_red', 4)].sort());
  ev('mysticHeld', { n: 0, e: 1 });           // a release at a normal enemy: the orange one leaves, the red stays
  layer.onEvent(['atk', 1, null, 'ranged'], views);   // (the attack itself ends nothing: the sim's count does)
  got();
  layer.onEvent(['swing', 1, 0.5, 'ranged'], views);
  assert.deepEqual(got(), [ebn('start_02_red', 4)]);
});

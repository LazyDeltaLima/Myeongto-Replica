// test/render/token-aura-fx.test.js — a summon's skill aura (docs/rules/fx.md 「소환물 스킬 오라」, render/fxgame.js tokenAura):
// modes.json keyed by the token id (tools/local-extract/char_modes.py token_auras — the client's skill prefab AuraAbility
// `_effects` and the token prefab's `_startEffect`), the prefabs in the owner's bundle or `<owner>_token`. Node has no WebP:
// the trace counts the prefabs the layer starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { unitInfo } from '../../server/sim/snapshot.js';

const DOLL = 'token_10006_vodfox_doll', SEA = 'token_10017_skadi2_dedant';
const files = {
  '/assets/local/fx/index.json': { bundles: {
    vodfox: ['vodfox_attack_01_hit', 'vodfox_skill_02_buff'],
    skadi2_token: ['token_skadi2_birth_01_start', 'token_skadi2_skill_01_buff', 'token_skadi2_skill_02_buff', 'token_skadi2_skill_03_buff'],
    common: ['common_call_start_01', 'common_char_die_01'],
  } },
  '/assets/local/fx/modes.json': {
    [DOLL]: { owner: 'char_254_vodfox', aura: { 0: ['vodfox_skill_02_buff'], 1: ['vodfox_skill_02_buff'] } },
    [SEA]: { owner: 'char_1012_skadi2', aura: { 0: ['token_skadi2_skill_01_buff'], 1: ['token_skadi2_skill_02_buff'], 2: ['token_skadi2_skill_03_buff'] },
      start: 'token_skadi2_birth_01_start' },
  },
};
const settle = () => new Promise((r) => setTimeout(r, 5));

async function layerWith() {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
  await settle();
  const got = () => plays.splice(0).filter((p) => p.kind === 'spawn').map((p) => p.names[0]).sort();
  return { layer, got, restore: () => { globalThis.fetch = fetch0; } };
}
const tok = (id, defId, skillIndex) => ({ id, x: 1, y: 1, alive: true, info: { id, side: 'ally', kind: 'token', defId, spine: defId, skillIndex } });

test('诅咒娃娃: its aura from its deploy on, once, and the generic token birth (its prefab names none)', async () => {
  const { layer, got, restore } = await layerWith();
  try {
    const d = tok(1, DOLL, 1);
    const views = new Map([[1, d]]);
    layer.onEvent(['deploy', 1], views);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['common_call_start_01', 'vodfox_skill_02_buff']);
    for (let i = 0; i < 20; i++) layer.update(0.02, null, null);
    assert.deepEqual(got(), [], 'one aura for the deployment');
  } finally { restore(); }
});

test('斯卡蒂的海嗣: the aura of its owner\'s skill and its own birth effect; a view built mid-battle starts the aura too', async () => {
  const { layer, got, restore } = await layerWith();
  try {
    const s = tok(2, SEA, 2);
    const views = new Map([[2, s]]);
    layer.onEvent(['deploy', 2], views);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['token_skadi2_birth_01_start', 'token_skadi2_skill_03_buff']);
    // another field's 海嗣 (S1 chosen) seen without its deploy event
    const s1 = tok(3, SEA, 0);
    views.set(3, s1);
    layer.update(0.02, null, null);
    assert.deepEqual(got(), ['token_skadi2_skill_01_buff']);
    // gone: nothing starts again
    s1.alive = false;
    layer.onEvent(['die', 3, 'expired'], views);
    for (let i = 0; i < 80; i++) layer.update(0.02, null, null);
    assert.ok(!got().includes('token_skadi2_skill_01_buff'));
  } finally { restore(); }
});

test('a token without an aura entry, and an operator, play no aura', async () => {
  const { layer, got, restore } = await layerWith();
  try {
    const other = tok(4, 'token_10000_silent_healrb', 0);
    const op = { id: 5, x: 0, y: 0, alive: true, info: { id: 5, side: 'ally', kind: 'op', defId: 'char_254_vodfox', spine: 'char_254_vodfox', skillIndex: 1 } };
    const views = new Map([[4, other], [5, op]]);
    layer.onEvent(['deploy', 4], views);
    layer.onEvent(['deploy', 5], views);
    for (let i = 0; i < 5; i++) layer.update(0.02, null, null);
    const seen = got();
    assert.ok(seen.includes('common_call_start_01'), 'the deploys ran');
    assert.ok(!seen.some((n) => /_buff$/.test(n)), seen.join());
  } finally { restore(); }
});

test('the sim: a 海嗣\'s snapshot skillIndex is its owner\'s chosen skill (data/tokens.json variant bySkill → the token skill index)', () => {
  for (const sk of [0, 1, 2]) {
    const h = makeBattle({ seed: 1, timeLimit: 30, autoFinish: false, units: [{ chessId: 'chess_char_6_04_b', row: 10, col: 3, uid: 1, skillIndex: sk }] });
    h.step();
    const owner = h.b.allyUnits.find((u) => u.kind === 'op');
    const t = h.b.spawnToken(owner, SEA, 10, 6, { anySource: true });
    assert.ok(t, 'spawned');
    assert.equal(unitInfo(t).skillIndex, sk);
  }
});

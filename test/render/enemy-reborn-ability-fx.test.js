// test/render/enemy-reborn-ability-fx.test.js — the ability a RebornTalent with `_useAbilityToHandle` casts at the fake
// death (2026-10-31, docs/rules/fx.md 「적 상태의 버프 이펙트」 재생을 다루는 능력): enemy-modes.json `rebornAbility` drawn on
// its events — ON_CAST_START as the 重生 starts, ON_ATTACK_FINISH as its closing clip starts, ON_CAST_END as it ends; a
// rebirth the sim holds no 重生 form for (守墓石像) at its mode switch. No three.js: the spawns the layer decides (trace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const FX = ['rv2', 'rv3', 'm2', 'loop', 'loop_end', 'flash', 'burst', 'bomb_range'];
const EMODES = {
  $fx: Object.fromEntries(FX.map((n) => [n, ['b', n]])),
  // 扎罗-like: a loop to ON_ATTACK_FINISH, the end clip's one-shot, a BuffToOwner buff on ON_ATTACK_FINISH
  enemy_1535_wlfmster: { modes: [{ name: 'M1', anim: ['Attack'] }, { name: 'M2', anim: ['Attack'] }],
    rebornAbility: [{ mode: 0, to: 1, cast: ['rv2', 'rv3'], opt: { rv2: { s: 2, e: 6, o: 0 }, rv3: { s: 6, e: 3, o: 1 } }, buffs: [{ fx: 'm2', ev: 6 }] }] },
  // 主角阵营角色-like: a loop to ON_CAST_END, a one-shot on it, an IMMEDIATELY buff on it
  enemy_10098_crhro: { modes: [{ name: 'Default', anim: ['Attack'] }],
    rebornAbility: [{ to: 0, cast: ['loop', 'loop_end'], opt: { loop: { s: 2, e: 3, o: 0 }, loop_end: { s: 3, e: 3, o: 1 } }, buffs: [{ fx: 'flash', ev: 3, once: 1 }] }] },
  // 守墓石像-like: only a BuffToOwner buff on ON_CAST_START, the rebirth into its Stone mode
  enemy_1172_dugago: { modes: ['Walk', 'Stone', 'Fly', 'NoReborn'].map((name) => ({ name, anim: ['Attack'] })),
    rebornAbility: [{ mode: 0, to: 1, cast: [], opt: {}, buffs: [{ fx: 'burst', ev: 2 }] }] },
  // 巨大的丑东西-like: the self-destruct ability bomb[reborning], a one-shot at ON_CAST_START
  enemy_1512_mcmstr: { modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'Bird', anim: [] }],
    rebornAbility: [{ to: 1, cast: ['bomb_range'], opt: { bomb_range: { s: 2, e: 3, o: 1 } }, buffs: [] }] },
};
const files = {
  '/assets/local/fx/index.json': { bundles: { b: FX } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });

const settle = () => new Promise((r) => setTimeout(r, 5));
const enemy = (id, defId, end = null) => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'enemy', defId },
  actor: { roles: { attack: { loop: 'Attack' } }, current: 'Move' }, _formSpec() { return this.form === 'reborn' && end ? { end } : null; } });

async function setup(views) {
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
  await settle();
  const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
  layer.onEvent(['tick'], views);
  const step = () => layer.update(0.016, cam, { width: 10, height: 10 });
  step();
  const spawned = () => plays.filter((p) => p.kind === 'spawn').map((p) => `${p.by}:${p.names[0]}:${p.tag}`);
  return { step, spawned };
}

test('rebirth ability: its cast effects and owner buffs on the 重生\'s start, closing clip and end', async () => {
  const w = enemy(1, 'enemy_1535_wlfmster', 'A_revive_3'), c = enemy(2, 'enemy_10098_crhro');
  const { step, spawned } = await setup(new Map([[1, w], [2, c]]));
  w.form = 'reborn'; c.form = 'reborn'; step();
  assert.deepEqual(spawned(), ['1:rv2:rebornAb:6', '2:loop:rebornAb:3'], 'ON_CAST_START: the loops, held to their end events');
  w.actor.current = 'A_revive_3'; step();
  assert.deepEqual(spawned().slice(2), ['1:rv3:reborn', '1:m2:rebornAb:3'],
    'the closing clip: ON_ATTACK_FINISH — the end one-shot and the buff, held to the 重生\'s end (the sim\'s status follows)');
  w.form = 'form2'; c.form = 'form2'; step(); step();
  assert.deepEqual(spawned().slice(4), ['2:loop_end:reborn', '2:flash:reborn'], 'ON_CAST_END: the one-shot and the IMMEDIATELY buff\'s flash');
});

test('rebirth ability: a view first seen mid-重生 plays only what comes after; a rebirth into a mode without a 重生 form', async () => {
  const c = { ...enemy(2, 'enemy_10098_crhro'), form: 'reborn' }, s = enemy(3, 'enemy_1172_dugago');
  const { step, spawned } = await setup(new Map([[2, c], [3, s]]));
  assert.deepEqual(spawned(), [], 'built during the 重生: its start was missed');
  c.form = 'form2'; step();
  assert.deepEqual(spawned(), ['2:loop_end:reborn', '2:flash:reborn']);
  s.form = 'stone'; step();
  assert.deepEqual(spawned().slice(2), ['3:burst:reborn'], 'the statue: ON_CAST_START at the switch into Stone (its own length)');
  s.form = 'fly'; step();
  assert.equal(spawned().length, 3, 'not again into Fly');
});

test('rebirth ability: 巨大的丑东西\'s official bomb replaces the stand-in ring and blast of the sim\'s self-destruct', async () => {
  const m = enemy(4, 'enemy_1512_mcmstr'), w = enemy(1, 'enemy_1535_wlfmster');
  const views = new Map([[4, m], [1, w]]);
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', trace: (p) => plays.push(p) });
  await settle();
  layer.onEvent(['tick'], views);
  const tel = ['fx', 'telegraph', 0, 0, { x: 0, y: 0, r: 3, dur: 2.17, kind: 'mechBomb', id: 4 }];
  const boom = ['fx', 'explode', 0, 0, { x: 0, y: 0, r: 3, kind: 'mechBomb', id: 4 }];
  const other = ['fx', 'telegraph', 0, 0, { x: 0, y: 0, r: 3, dur: 2.17, kind: 'mechBomb', id: 1 }];
  for (const e of [tel, boom, other]) layer.onEvent(e, views);
  assert.equal(layer.ownsFx(tel), true);
  assert.equal(layer.ownsFx(boom), true);
  assert.equal(layer.ownsFx(other), false, 'an enemy without the bomb among its rebirth ability\'s effects keeps the stand-in');
  const step = () => layer.update(0.016, { liftFor: () => 0, scaleAt: () => 64, dist: 10 }, { width: 10, height: 10 });
  step();
  m.form = 'reborn'; step();
  assert.deepEqual(plays.filter((p) => p.kind === 'spawn').map((p) => `${p.by}:${p.names[0]}:${p.tag}`), ['4:bomb_range:reborn']);
});

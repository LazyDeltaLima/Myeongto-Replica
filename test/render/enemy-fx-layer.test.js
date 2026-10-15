// test/render/enemy-fx-layer.test.js — render/fxgame.js's enemy layer driven with stub tables (2026-10-10, docs/rules/fx.md
// 「적 이펙트 바인딩」): a content shot's stand-in beam, the mode change told to the sound (audio.enemyMode), the dead
// effect's fallback (client Enemy.get_deadEffect) and the death puff it replaces. No three.js here: the browser-only
// parts (WebP, the player) stay off, so these are the decisions taken before anything is drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';

const SHOT = 'projectile_enemy_acfort_skill';
const EMODES = {
  $fx: { t_trail: ['b', 't_trail'], t_hit: ['b', 't_hit'], my_die: ['b', 'my_die'] },
  enemy_x: {
    modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'Fly', anim: ['Fly_Attack'] }],
    skills: { fireweapon: { cast: [], opt: {}, hit: [], proj: { key: SHOT, mount: 2, trail: ['t_trail'], hit: ['t_hit'], speed: 10 } } },
    dead: 'my_die',
  },
  enemy_y: { modes: [{ name: 'Default', anim: ['Attack'] }] },
  // 萨米的意志-like: the 冰凌 projectile places a sub-projectile per tile (its reach effect extracted) …
  enemy_deer: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [],
    proj: { key: 'p_ice', mount: 7, move: 'FIXED_DIRECTION', speed: 5, sub: [{ key: 'p_ice_2', reached: ['t_hit'], life: 1 }] } } }] },
  // … and one whose sub effect is not extracted (the stand-in pillars)
  enemy_deer2: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [],
    proj: { key: 'p_ice_b', mount: 7, move: 'FIXED_DIRECTION', speed: 5, sub: [{ key: 'p_ice_b2', reached: ['not_extracted'], life: 1 }] } } }] },
  // 子代-like: a held skill (its loop cast to ON_CAST_END, an `_onlyOnce` hit held to the end)
  enemy_brood: { modes: [{ name: 'Default', anim: [] }],
    skills: { sktok_dstnta: { cast: ['t_trail'], opt: { t_trail: { s: 2, e: 3, o: 0 } }, hit: ['t_hit'], hopt: { t_hit: { e: 3, once: 1 } } } } },
  enemy_snip: { modes: [{ name: 'Default', anim: ['Attack'] }],
    skills: { crossattack: { cast: [], opt: {}, hit: [], proj: { key: 'p_bolt', mount: 2, trail: ['t_trail'], hit: ['t_hit'], move: 'FIXED_DIRECTION', speed: 5 } } } },
};
const files = {
  '/assets/local/fx/index.json': { bundles: { b: ['t_trail', 't_hit', 'my_die'] } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });

const settle = () => new Promise((r) => setTimeout(r, 5));
const enemy = (id, defId, clip = 'Attack') => ({ id, x: 0, y: 0, alive: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: clip } }, current: 'Move' } });
const ally = (id) => ({ id, x: 3, y: 0, alive: true, info: { id, side: 'ally', defId: 'char_x' } });

test('enemy layer: mode change → audio.enemyMode(unitId, defId, mode, previous); dead effect + its fallback; a shot\'s stand-in beam', async () => {
  const calls = [];
  const audio = { enemyMode: (...a) => calls.push(a) };
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', audio: () => audio });
  await settle();
  const e = enemy(1, 'enemy_x'), f = enemy(3, 'enemy_y'), a = ally(2);
  const views = new Map([[1, e], [2, a], [3, f]]);
  layer.onEvent(['tick'], views);
  const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
  layer.update(0.016, cam, { width: 10, height: 10 });   // first sight: the mode is noted, not announced
  assert.equal(calls.length, 0);
  e.actor.roles.attack.loop = 'Fly_Attack';                 // the clip set of its 'Fly' form
  layer.update(0.016, cam, { width: 10, height: 10 });
  assert.deepEqual(calls, [[1, 'enemy_x', 1, 0]]);
  layer.update(0.016, cam, { width: 10, height: 10 });
  assert.equal(calls.length, 1, 'once per change');
  // its own dead effect is extracted: drawn officially (no procedural puff); another enemy falls back to
  // common_enemy_die_01, not extracted here → the puff stays
  assert.equal(layer.ownsDeath(e), true);
  assert.equal(layer.ownsDeath(f), false);
  assert.equal(layer.ownsDeath(a), false);
  // a FireWeapon stand-in beam is not drawn when its projectile's trail can be; another beam kind is
  const beam = ['fx', 'beam', 0, 0, { x: 0, y: 0, from: 1, to: 2, kind: 'fireWeapon' }];
  layer.onEvent(beam, views);
  assert.equal(layer.ownsFx(beam), true);
  const other = ['fx', 'beam', 0, 0, { x: 0, y: 0, from: 1, to: 2, kind: 'chainLightning' }];
  layer.onEvent(other, views);
  assert.equal(layer.ownsFx(other), false);
  // the shot itself is handled (its kind draws nothing procedural) without breaking on a missing target
  assert.doesNotThrow(() => layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 1, tgt: 2, key: SHOT, move: 'TRACE_TARGET_WITH_SPEED', speed: 10, t: 0.3, ability: 'FireWeapon' }], views));
  assert.doesNotThrow(() => layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 1, tgt: 99, key: SHOT, t: 0.3 }], views));
  // an audio object without the method (or none) never breaks the view
  const layer2 = createFxLayer({ host: null, above: null, quality: () => 'low', audio: () => ({}) });
  await settle();
  const g = enemy(5, 'enemy_x');
  const v2 = new Map([[5, g]]);
  layer2.onEvent(['tick'], v2);
  layer2.update(0.016, cam, { width: 10, height: 10 });
  g.actor.roles.attack.loop = 'Fly_Attack';
  assert.doesNotThrow(() => layer2.update(0.016, cam, { width: 10, height: 10 }));
});

test('enemy layer: 萨米的意志 冰凌 (fx column) tile by tile — official sub effects own it; else the stand-in pillar per shown tile at its hit time', async () => {
  const pillars = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', fieldRect: () => ({ r0: 2, r1: 5, c0: 0, c1: 20 }),
    standIn: (k, x, y, ex) => pillars.push({ k, x, y, ex }) });
  await settle();
  const deer = enemy(7, 'enemy_deer'), deer2 = enemy(8, 'enemy_deer2'), a = ally(2);
  const views = new Map([[7, deer], [8, deer2], [2, a]]);
  const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
  layer.update(0.016, cam, { width: 10, height: 10 });
  // boss_7's swing (kind 'none', no 'atk' follows) takes the enemy branch without breaking
  assert.doesNotThrow(() => layer.onEvent(['swing', 7, 1, 'none'], views));
  const col = (id, key, sub) => ['fx', 'column', 4, 3, { x: 4, y: 3, c: 4, id, key, sub, r0: 18, dir: [0, -1], speed: 5, dist: 1, life: 1 }];
  const official = col(7, 'p_ice', 'p_ice_2');
  layer.onEvent(official, views);
  assert.equal(layer.ownsFx(official), true);
  const standin = col(8, 'p_ice_b', 'p_ice_b2');
  layer.onEvent(standin, views);
  assert.equal(layer.ownsFx(standin), true, 'render/fx.js does not draw the whole column at once');
  // tile row r is hit (18 − r) / 5 + 1 s after the strike; only rows 2–5 are on the drawn field
  const at = [];
  for (let i = 0; i < 300; i++) {
    layer.update(0.02, cam, { width: 10, height: 10 });
    while (at.length < pillars.length) at.push(Math.round((i + 1) * 0.02 * 100) / 100);
  }
  assert.deepEqual(pillars.map((p) => p.y), [5, 4, 3, 2]);
  assert.ok(pillars.every((p) => p.k === 'column' && p.x === 4));
  at.forEach((t, i) => assert.ok(Math.abs(t - ((18 - pillars[i].y) / 5 + 1)) < 0.03, `row ${pillars[i].y} at ${t}`));
  // an old-shape column (no r0) is left to render/fx.js as before
  const old = ['fx', 'column', 4, 3, { x: 4, y: 3, id: 7 }];
  layer.onEvent(old, views);
  assert.equal(layer.ownsFx(old), false);
});

test('enemy layer: a straight (FIXED_DIRECTION) shot with dir / range — with or without a predicted target', async () => {
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
  await settle();
  const s = enemy(9, 'enemy_snip'), a = ally(2);
  const views = new Map([[9, s], [2, a]]);
  layer.update(0.016, { liftFor: () => 0, scaleAt: () => 64, dist: 10 }, { width: 10, height: 10 });
  assert.doesNotThrow(() => layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 9, tgt: 2, key: 'p_bolt', move: 'FIXED_DIRECTION', speed: 5, t: 0.55, dir: [1, 0], range: 2.75 }], views));
  assert.doesNotThrow(() => layer.onEvent(['fx', 'enemyShot', 0, 0, { id: 9, tgt: null, key: 'p_bolt', move: 'FIXED_DIRECTION', speed: 5, t: 10, dir: [0, 1], range: 50 }], views));
});

test('enemy layer: a held skill (fx enemySkill `hold`) lasts until its enemySkillEnd — its damage stays its hit past 3 s, none after', async () => {
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high' });
  await settle();
  const b = enemy(11, 'enemy_brood'), a = ally(2);
  const views = new Map([[11, b], [2, a]]);
  const cam = { liftFor: () => 0, scaleAt: () => 64, dist: 10 };
  layer.update(0.016, cam, { width: 10, height: 10 });
  layer.onEvent(['fx', 'enemySkill', 0, 0, { x: 0, y: 0, id: 11, ability: 'sktok_dstnta', n: 1, hold: 1 }], views);
  assert.equal(b._fxESkill?.hold, true);
  for (let i = 0; i < 250; i++) layer.update(0.02, cam, { width: 10, height: 10 });   // 5 s: past the 3 s window of a plain cast
  assert.doesNotThrow(() => layer.onEvent(['dmg', 2, 150, 0, 'phys', 11], views));
  assert.equal(b._fxESkill.hold, true);
  assert.ok(b._fxESkill.held.has('2:t_hit'), 'the `_onlyOnce` hit is held on the unit it hit');
  layer.onEvent(['fx', 'enemySkillEnd', 0, 0, { x: 0, y: 0, id: 11, ability: 'sktok_dstnta' }], views);
  assert.equal(b._fxESkill.hold, false);
  assert.ok(b._fxESkill.t < 0, 'its later damage is no hit of it');
  // a plain cast (no `hold`) is not held
  layer.onEvent(['fx', 'enemySkill', 0, 0, { x: 0, y: 0, id: 11, ability: 'sktok_dstnta', n: 2 }], views);
  assert.equal(b._fxESkill.hold, false);
});

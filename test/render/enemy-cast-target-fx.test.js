// test/render/enemy-cast-target-fx.test.js — an enemy ability's CastTargetEffectOptions of ON_CAST_START (the prefab's
// `_castTargetEffects`) go on its cast's targets as the cast starts, not on each unit its damage hits (2026-11-26,
// docs/rules/fx.md 「적 범위 공격의 경고 칸」): tools/local-extract/enemy_bindings.py emit_part writes them as `castTgt`
// (timed by `castTgtOpt`), render/fxgame.js ecastTgtFx plays them on the sim's 'enemySkill' `tgt` / `tgts`, the enemy
// 'swing' 6th field, or a kit attack's 'beam' `to`. Until then they sat in `hit`: 鼠王's sand cross appeared on every unit
// its sand hit, seconds after the cast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { fxEvent } from '../helpers/fxEvent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const NAMES = ['mk_start', 'mk_hit', 'mk_range', 'fc_lock', 'el_buff', 'el_hit', 'mn_start', 'mn_lock', 'mn_hit', 'pc_lock', 'pc_trail'];
const LOOP = { s: 2, e: 3, o: 0 }, ONCE = { s: 2, e: 3, o: 1 };
const EMODES = {
  $fx: Object.fromEntries(NAMES.map((n) => [n, ['b', n]])),
  // 鼠王-like: DriftSand's sand cross on the unit it casts on
  enemy_mk: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { driftsand: { cast: ['mk_start'], opt: { mk_start: ONCE }, hit: ['mk_hit'],
    castTgt: ['mk_range'], castTgtOpt: { mk_range: ONCE }, anim: 'Skill_1' } } },
  // 假想敌：械-like: SommonSquad locks two units to the cast's end
  enemy_fc: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { sommonsquad: { cast: [], opt: {}, hit: [], castTgt: ['fc_lock'],
    castTgtOpt: { fc_lock: LOOP }, anim: 'Skill_1' } } },
  // 乌顶巨角卢鲁-like: a channel (`dur`) whose cast-target effect lasts it
  enemy_el: { modes: [{ name: 'Default', anim: ['Attack'] }], skills: { skill: { cast: [], opt: {}, hit: ['el_hit'], castTgt: ['el_buff'],
    castTgtOpt: { el_buff: LOOP } } } },
  // 自制投石机-like: its attack's lock-on on the swing's target
  enemy_mn: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: ['mn_start'], opt: { mn_start: ONCE }, hit: ['mn_hit'], castTgt: ['mn_lock'],
    castTgtOpt: { mn_lock: LOOP } } }] },
  // 假想敌：管-like: its kit's attack ('beam' acdumlStrike, no swing)
  enemy_pc: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [], castTgt: ['pc_lock'], castTgtOpt: { pc_lock: LOOP },
    proj: { key: 'projectile_enemy_acduml', mount: 2, trail: ['pc_trail'], speed: 10 } } }] },
};
const files = {
  '/assets/local/fx/index.json': { bundles: { b: NAMES } },
  '/assets/local/fx/enemy-modes.json': EMODES,
};
globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });

const settle = () => new Promise((r) => setTimeout(r, 5));
const enemy = (id, defId) => ({ id, x: 6, y: 1, alive: true, info: { id, side: 'enemy', defId }, actor: { roles: { attack: { loop: 'Attack' } }, current: 'Move' } });
// an attacker whose clip gives the cast its length (castSpan): Attack 3 s, its hit at 2.4 s
const clipped = (id, defId) => {
  const v = enemy(id, defId);
  return { ...v, actor: { ...v.actor, _attackClip: () => ({ loop: 'Attack' }), dur: () => 3, _hitTime: () => 2.4 } };
};
const ally = (id, x, y) => ({ id, x, y, alive: true, info: { id, side: 'ally', defId: 'char_x' } });

test('enemy cast-target effects: on the cast\'s targets as it starts, not on the units its damage hits', async () => {
  const plays = [];
  const layer = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, trace: (p) => plays.push(p) });
  await settle();
  const views = new Map([[1, enemy(1, 'enemy_mk')], [2, enemy(2, 'enemy_fc')], [3, enemy(3, 'enemy_el')], [4, clipped(4, 'enemy_mn')],
    [5, enemy(5, 'enemy_pc')], [10, ally(10, 2, 3)], [11, ally(11, 4, 2)]]);
  layer.onEvent(['tick'], views);
  const spawned = () => plays.splice(0).filter((p) => p.kind === 'spawn');
  const tick = (n = 1) => { for (let i = 0; i < n; i++) layer.update(1 / 60, { dist: 20 }, { width: 100, height: 100 }); };

  // 鼠王 DriftSand on 10: the sand cross there at the cast start, once
  layer.onEvent(fxEvent('enemySkill', { x: 6, y: 1, id: 1, ability: 'DriftSand', n: 1, tgt: 10 }), views);
  let got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'mk_start' && p.by === 1), `its cast effect on it: ${JSON.stringify(got)}`);
  const cr = got.filter((p) => p.names[0] === 'mk_range');
  assert.equal(cr.length, 1, `one sand cross: ${JSON.stringify(got)}`);
  assert.ok(cr[0].on === 10 && cr[0].tag === 'cast', `on the cast's target, once (docs/rules/fx.md 「적 범위 공격의 경고 칸」): ${JSON.stringify(cr[0])}`);
  // its damage 2 s later on 10 and 11: the hits, not the sand cross again
  tick(120);
  layer.onEvent(['dmg', 10, 50, 'phys', false, 1], views);
  layer.onEvent(['dmg', 11, 50, 'phys', false, 1], views);
  got = spawned();
  assert.deepEqual(got.filter((p) => p.names[0] === 'mk_hit').map((p) => p.on).sort(), [10, 11], `its hits on both: ${JSON.stringify(got)}`);
  assert.ok(!got.some((p) => p.names[0] === 'mk_range'), `no sand cross on the units its damage hit: ${JSON.stringify(got)}`);

  // 假想敌：械 SommonSquad on 11 and 10 (`tgts`, the main one first): a lock on each
  layer.onEvent(fxEvent('enemySkill', { x: 6, y: 1, id: 2, ability: 'SommonSquad', n: 1, tgt: 11, tgts: [11, 10] }), views);
  got = spawned();
  assert.deepEqual(got.filter((p) => p.names[0] === 'fc_lock').map((p) => p.on), [11, 10], `a lock on each target: ${JSON.stringify(got)}`);

  // 乌顶巨角卢鲁's channel on 10 (`dur`): its effect held on 10 as the skill's ('eskill', stopped at its end)
  layer.onEvent(fxEvent('enemySkill', { x: 6, y: 1, id: 3, ability: 'skill', n: 1, dur: 8, tgt: 10 }), views);
  got = spawned();
  const eb = got.find((p) => p.names[0] === 'el_buff');
  assert.ok(eb && eb.on === 10 && eb.by === 3 && eb.tag === 'eskill', `held on the target to the channel's end: ${JSON.stringify(got)}`);

  // 自制投石机's swing at 11: the lock-on there at the swing (to its cast's end), not at the hit
  layer.onEvent(['swing', 4, 2.4, 'enemy', 0, 11], views);
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'mn_start' && p.by === 4), `its swing's cast effect: ${JSON.stringify(got)}`);
  const ml = got.find((p) => p.names[0] === 'mn_lock');
  assert.ok(ml && ml.on === 11 && ml.tag === 'castLoop', `the lock-on on the swing's target: ${JSON.stringify(got)}`);
  tick(144);
  layer.onEvent(['atk', 4, 11, 'enemy'], views);
  layer.onEvent(['dmg', 11, 50, 'phys', false, 4], views);
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'mn_hit' && p.on === 11), `its hit: ${JSON.stringify(got)}`);
  assert.ok(!got.some((p) => p.names[0] === 'mn_lock'), `no second lock-on at the strike or the hit: ${JSON.stringify(got)}`);
  // a swing that names no target: the lock-on at the strike, on the attack's target
  tick(60);
  layer.onEvent(['swing', 4, 2.4, 'enemy', 0, null], views);
  assert.ok(!spawned().some((p) => p.names[0] === 'mn_lock'), 'no target yet');
  tick(144);
  layer.onEvent(['atk', 4, 10, 'enemy'], views);
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'mn_lock' && p.on === 10), `the lock-on at the strike: ${JSON.stringify(got)}`);

  // 假想敌：管's kit attack ('beam' from → to): the lock-on on `to`
  layer.onEvent(fxEvent('beam', { x: 6, y: 1, from: 5, to: 10, kind: 'acdumlStrike' }), views);
  got = spawned();
  assert.ok(got.some((p) => p.names[0] === 'pc_lock' && p.on === 10 && p.by === 5), `the lock-on on the beam's target: ${JSON.stringify(got)}`);

  // low quality: none
  const low = createFxLayer({ host: null, above: null, quality: () => 'low', dry: true, trace: (p) => plays.push(p) });
  await settle();
  low.onEvent(['tick'], views);
  low.onEvent(fxEvent('enemySkill', { x: 6, y: 1, id: 1, ability: 'DriftSand', n: 1, tgt: 10 }), views);
  assert.ok(!spawned().some((p) => p.names[0] === 'mk_range'), 'none at low quality');
});

// the generated render table puts every ON_CAST_START cast-target effect of the client bindings in `castTgt`, never `hit`
const BIND = join(ROOT, 'tools/assets/local-enemy-bindings.json');
const REAL = join(ROOT, 'public/assets/local/fx/enemy-modes.json');
test('enemy-modes.json: every ON_CAST_START `_castTargetEffects` of the bindings is a `castTgt`, none a `hit`', { skip: !existsSync(REAL) && 'no extracted effects' }, () => {
  const bind = JSON.parse(readFileSync(BIND, 'utf8')), em = JSON.parse(readFileSync(REAL, 'utf8'));
  /** every part of an enemy's render entry */
  const parts = (/** @type {any} */ e) => [...(e.modes || []).flatMap((/** @type {any} */ m) => [m?.melee, m?.ranged, ...Object.values(m?.skills || {})]),
    ...Object.values(e.skills || {})].filter(Boolean);
  let seen = 0;
  for (const [id, b] of Object.entries(bind)) {
    if (id[0] === '$' || !em[id]) continue;
    const names = new Set(Object.values(/** @type {any} */ (b).abilities || {}).flatMap((/** @type {any} */ a) => (a?.castTargetEffects || [])
      .filter((/** @type {any} */ x) => (x.start ?? 2) === 2).flatMap((/** @type {any} */ x) => x.fx)));
    if (!names.size) continue;
    const ps = parts(em[id]);
    for (const n of names) {
      seen++;
      assert.ok(ps.some((p) => p.castTgt?.includes(n) && p.castTgtOpt?.[n]), `${id}: ${n} is no castTgt (tools/local-extract/enemy_bindings.py emit_part; docs/rules/fx.md 「적 범위 공격의 경고 칸」)`);
      assert.ok(!ps.some((p) => p.hit?.includes(n)), `${id}: ${n} sits in \`hit\` — it would play on each unit the damage hits, not on the cast's target as the cast starts (tools/local-extract/enemy_bindings.py emit_part; docs/rules/fx.md 「적 범위 공격의 경고 칸」)`);
    }
  }
  assert.ok(seen >= 8, `the sweep saw the known cases (鼠王, 乌顶巨角卢鲁, 假想敌：械 / 管, 自制投石机): ${seen}`);
  assert.deepEqual(em.enemy_1509_mousek?.skills?.driftsand?.castTgt, ['mousek_skill_01_range_02', 'mousek_skill_01_range'], '鼠王 DriftSand');
});

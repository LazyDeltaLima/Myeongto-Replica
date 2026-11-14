// test/render/stuck-shot-fx.test.js — W's C4 drawn by its projectile's official effects (2026-11-14, docs/rules/fx.md
// 「W의 폭탄 C4」): projectile_enemy_cqbw_s1 sits on its target for its life — its `_effectsToTargetWhenStart`
// (enemy_cqbw_skill_01_buff) on the target from the moment it is put on to its stop, then its `_effectsWhenReached`
// (enemy_cqbw_skill_02_hit) where it stopped: on the target, or on the spot when the target fell meanwhile (the damage
// that drew it before has no target then), once — not again on the damage, no stand-in ring or blast. The sim's events
// come from the real kit (content/enemies/leaders.js); the render runs on a sample binding (no extracted effects needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const quiet = { warn() {}, error() {}, info() {} };
const GD = getData({ log: quiet });
const W = 'enemy_1504_cqbw';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

function field() {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [W]: GD.enemies[W] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 5, uid: 1 }],
  });
  h.step();
  return h;
}

// the part of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const emodes = () => ({
  [W]: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: [],
    proj: { key: 'projectile_enemy_cqbw', mount: 2, trail: ['enemy_cqbw_attack_01_trail'], hit: ['enemy_cqbw_attack_01_hit'], move: 'OTHER', speed: 5, raise: 0.3 } } }],
  skills: { c4: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_cqbw_s1', mount: 2, reached: ['enemy_cqbw_skill_02_hit'], targetStart: ['enemy_cqbw_skill_01_buff'] }, anim: 'Skill' } } },
});
const NAMES = ['enemy_cqbw_attack_01_trail', 'enemy_cqbw_attack_01_hit', 'enemy_cqbw_skill_02_hit', 'enemy_cqbw_skill_01_buff'];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n, ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => GD.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxOf = (evs, kind, k) => evs.filter((e) => e[0] === 'fx' && e[1] === kind && (!k || e[4]?.kind === k));
const spawned = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);
const step = (L, dt) => L.update(dt, { dist: 20 }, { width: 100, height: 100 });

/** A W in range of the wall, run until its first charge is put on and has stopped: the events, the two fx, the wall. */
function charge() {
  const h = field();
  const e = h.spawn(W, { pos: [10, 7.5], routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  h.run(30);
  const [tel] = fxOf(h.events, 'telegraph', 'c4'), [boom] = fxOf(h.events, 'explode', 'c4');
  const wall = h.allies()[0];
  assert.ok(tel && boom, 'W puts a charge on and it stops');
  assert.ok(tel[4].caster === e.id && tel[4].tgt === wall.id && boom[4].caster === e.id && boom[4].tgt === wall.id,
    'the sim names the charge\'s caster and target (content/enemies/leaders.js enemy_1504_cqbw) — the view draws on them');
  const dmg = h.events.slice(h.events.indexOf(boom)).find((x) => x[0] === 'dmg' && x[1] === wall.id && x[5] === e.id);
  assert.ok(dmg, 'its damage follows the stop');
  return { h, e, wall, tel, boom, dmg };
}

test('W\'s C4: its target-start effect on the target from the charge to its stop, then its reach effect there once — not again on the damage, no stand-in', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { e, wall, tel, boom, dmg } = charge();
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    L.onEvent(tel, views);
    assert.equal(L.ownsFx(tel), true, 'no stand-in ring');
    assert.deepEqual(spawned(seen), [`enemy_cqbw_skill_01_buff>${wall.id}`], 'the charge\'s mark on its target');
    step(L, 3.2);
    L.onEvent(boom, views);
    L.onEvent(dmg, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    assert.deepEqual(spawned(seen), [`enemy_cqbw_skill_02_hit>${wall.id}`], 'its reach effect once, on its target — nothing more on the damage');
  } finally { globalThis.fetch = fetch0; }
});

test('W\'s C4 whose target fell before it stopped: its reach effect on the spot (no damage comes to draw it), and W fallen meanwhile still draws it', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { e, wall, tel, boom } = charge();
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    L.onEvent(['tick'], views);
    L.onEvent(tel, views);
    seen.length = 0;
    step(L, 2);
    views.delete(wall.id);   // its target gone
    views.delete(e.id);      // and W too
    L.onEvent(boom, views);
    assert.equal(L.ownsFx(boom), true, 'no stand-in blast');
    const at = seen.filter((p) => p.kind === 'spawn');
    assert.deepEqual(at.map((p) => p.names[0]), ['enemy_cqbw_skill_02_hit'], 'its reach effect');
    assert.ok(at[0].on == null && at[0].by == null, 'on the spot where the charge stopped (the sim\'s explode x / y), owned by no unit');
  } finally { globalThis.fetch = fetch0; }
});

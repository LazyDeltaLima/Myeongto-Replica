// test/render/critic-soul-fx.test.js — 规程's 魂灵法骸 / 魂灵残迹 drawn by their official effects (2026-11-12,
// docs/rules/fx.md 「규정 영혼의 유해 무리」): the souls they hold as their [fx_ctrl]'s stack buffs (enemy_common_soul_01 …
// _0n together), counted from the sim's fx 'capture' / 'orbit' / 'laser'; 魂灵法骸's fireball (projectile_enemy_lrmzrd's
// trail) circling it from 'orbit' to 'orbitEnd', its hit on the unit it strikes; 魂灵残迹's laser line from 'laser' to
// 'laserEnd', its hit on each unit the laser strikes. The sim's events come from the real 规程 kits
// (content/enemies/critic.js); the render runs on a sample binding (the extracted effects are not needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer } from '../../public/js/render/fxgame.js';
import { wantedStatusFx } from '../../public/js/render/fxstatus.js';
import { fxSpec } from '../../public/js/render/fx/kinds.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const LRMZRD = 'enemy_1431_lrmzrd', LRWZRD = 'enemy_1429_lrwzrd', LRSOUL = 'enemy_1428_lrsoul';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const walls = (cells) => cells.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 }));

function field(keys, units) {
  const enemies = Object.fromEntries(keys.map((k) => [k, ACT3.enemies[k]]));
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units,
  });
  h.step();
  return h;
}
const put = (h, key, pos) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const SOULS = { 'enemy_v050[fx][stack_3]': ['enemy_common_soul_03'], 'enemy_v050[fx][stack_2]': ['enemy_common_soul_02'], 'enemy_v050[fx][stack_1]': ['enemy_common_soul_01'] };
const emodes = () => ({
  [LRMZRD]: { modes: [{ name: 'Default', anim: ['Attack'], melee: { cast: ['enemy_Irmzrd_attack_start_01'], opt: { enemy_Irmzrd_attack_start_01: { s: 2, e: 3, o: 0 } }, hit: ['enemy_Irmzrd_attack_hit_01'] } }],
    skills: { summonfireball: { cast: ['enemy_Irmzrd_skill_start_01'], opt: { enemy_Irmzrd_skill_start_01: { s: 2, e: 3, o: 0 } }, hit: [],
      proj: { key: 'projectile_enemy_lrmzrd', mount: 2, trail: ['enemy_Irmzrd_buff_01'], hit: ['enemy_Irmzrd_skill_hit_01'] }, anim: 'Skill' } },
    buffFx: SOULS },
  [LRWZRD]: { modes: [{ name: 'Default', anim: ['Attack'], ranged: { cast: ['enemy_lrwzrd_attack_start_01'], opt: { enemy_lrwzrd_attack_start_01: { s: 2, e: 3, o: 0 } }, hit: [],
    proj: { key: 'projectile_enemy_lrwzrd_1', mount: 2, trail: ['enemy_lrwzrd_attack_taril_01'], hit: ['enemy_lrwzrd_attack_hit_01'], move: 'TRACE_TARGET_WITH_SPEED', speed: 18.0 } } }],
    skills: { laser: { cast: ['enemy_lrwzrd_skill_01_start_01'], opt: { enemy_lrwzrd_skill_01_start_01: { s: 2, e: 3, o: 0 } }, hit: [],
      proj: { key: 'projectile_enemy_lrwzrd_right', mount: 2, trail: ['enemy_lrwzrd_skill_line_01'], hit: ['enemy_lrwzrd_skill_hit_02'], move: 'OTHER', speed: 1000.0 } } },
    buffFx: SOULS },
});
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_[A-Za-z0-9_]+"/g).map((s) => JSON.parse(s)).filter((n) => !/^enemy_\d/.test(n) && !n.includes('[')))];

async function layer() {
  const m = emodes();
  m.$fx = Object.fromEntries(NAMES.map((n) => [n.toLowerCase(), ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => ACT3.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const fxOf = (evs, kind) => evs.filter((e) => e[0] === 'fx' && e[1] === kind);
const spawned = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn').map((p) => `${p.names[0]}${p.on != null ? '>' + p.on : ''}`);
/** The soul effects the status layer wants on `v` now (the layer's own enemy buff lookup). */
const soulFx = (L, v) => [...wantedStatusFx(v, new Map(), L.enemyBuffFx).keys()].filter((k) => k.includes('soul'));
/** The field's events from now on, each with the battle time it came at (`at`, a WeakMap by event). */
function record(h) {
  const at = new WeakMap(), ev0 = h.b._ev.bind(h.b);
  h.b._ev = (x) => { if (x && typeof x === 'object') at.set(x, h.b.time); return ev0(x); };
  return at;
}
/** Feed the layer events `evs` in order, its clock moved on to each event's battle time; up to the one `until` takes. */
function feed(L, evs, views, at, until = () => false) {
  for (const e of evs) {
    const t = at.get(e);
    if (t != null && L._t != null && t > L._t + 1e-9) L.update(t - L._t, { dist: 20 }, { width: 100, height: 100 });
    if (t != null) L._t = Math.max(L._t ?? t, t);
    L.onEvent(e, views);
    if (until(e)) return e;
  }
  return null;
}

test('魂灵法骸: its souls as enemy_common_soul_01 … _0n together, one spent per fireball; the fireball\'s trail from \'orbit\' to \'orbitEnd\', its hit on the unit it struck — no stand-ins', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([LRMZRD, LRSOUL], walls([[11, 7]]));   // 1.41 away: inside the orbit's reach
    const at = record(h);
    const e = put(h, LRMZRD, [10, 6]);
    for (let i = 0; i < 3; i++) put(h, LRSOUL, [10, 6]);
    h.run(0.1);
    h.runUntil(() => fxOf(h.events, 'orbitEnd').length >= 1, 25);
    const evs = h.events;
    const caps = fxOf(evs, 'capture'), [orbit] = fxOf(evs, 'orbit'), [end] = fxOf(evs, 'orbitEnd');
    assert.ok(caps.length === 3 && orbit && end && end[4].tgt != null, 'the sim captures three souls, casts a fireball that strikes');
    const { L, seen } = await layer();
    const v = viewOf(e);
    const views = new Map([[e.id, v], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    seen.length = 0;
    assert.deepEqual(soulFx(L, v), [], 'no soul yet');
    feed(L, evs, views, at, (x) => x === caps[0]);
    assert.equal(L.ownsFx(caps[0]), true);
    assert.deepEqual(soulFx(L, v), ['b/enemy_common_soul_01'], 'one soul');
    feed(L, evs.slice(evs.indexOf(caps[0]) + 1), views, at, (x) => x === caps[2]);
    assert.deepEqual(soulFx(L, v), ['b/enemy_common_soul_01', 'b/enemy_common_soul_02', 'b/enemy_common_soul_03'], 'three souls: all three');
    seen.length = 0;
    feed(L, evs.slice(evs.indexOf(caps[2]) + 1), views, at, (x) => x === orbit);
    assert.equal(L.ownsFx(orbit), true, 'no stand-in for the fireball');
    assert.ok(spawned(seen).includes('enemy_Irmzrd_buff_01'), 'its trail, circling the mage');
    assert.deepEqual(soulFx(L, v), ['b/enemy_common_soul_01', 'b/enemy_common_soul_02'], 'a soul spent');
    feed(L, evs.slice(evs.indexOf(orbit) + 1), views, at, (x) => x === end);
    assert.equal(L.ownsFx(end), true);
    assert.deepEqual(spawned(seen).filter((s) => s.startsWith('enemy_Irmzrd_skill_hit')), [`enemy_Irmzrd_skill_hit_01>${end[4].tgt}`], 'its hit on the wall it met');
  } finally { globalThis.fetch = fetch0; }
});

test('魂灵残迹: its laser line from \'laser\' to \'laserEnd\', all souls gone with it, its hit on the unit the laser strikes — no stand-ins', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const h = field([LRWZRD, LRSOUL], walls([[12, 8]]));   // up its column, out of its 1.7 range
    const at = record(h);
    const e = put(h, LRWZRD, [10, 8]);
    for (let i = 0; i < 2; i++) put(h, LRSOUL, [10, 8]);
    h.run(1.6);
    h.b.applyStatus(e, 'stun', { duration: 1, source: null });
    h.run(0.1);
    const evs = h.events;
    const [laser] = fxOf(evs, 'laser'), [end] = fxOf(evs, 'laserEnd'), cast = fxOf(evs, 'enemySkill').find((x) => x[4].ability === 'Laser');
    assert.ok(laser && end && cast, 'the sim casts the laser and a stun ends it');
    const { L, seen } = await layer();
    const v = viewOf(e);
    const views = new Map([[e.id, v], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    L.onEvent(['tick'], views);
    feed(L, evs, views, at, (x) => x === laser);
    assert.equal(L.ownsFx(laser), true, 'no stand-in for the laser');
    const s = spawned(seen);
    assert.ok(s.includes('enemy_lrwzrd_skill_line_01'), `its line (${s})`);
    assert.deepEqual(soulFx(L, v), [], 'every soul spent');
    const hits = evs.slice(evs.indexOf(laser), evs.indexOf(end)).filter((x) => x[0] === 'dmg' && x[5] === e.id);
    assert.ok(hits.length >= 2, 'the laser strikes the wall');
    feed(L, evs.slice(evs.indexOf(laser) + 1), views, at, (x) => x === end);
    assert.equal(L.ownsFx(end), true);
    assert.deepEqual(spawned(seen).filter((n) => n.startsWith('enemy_lrwzrd_skill_hit')), hits.map((d) => `enemy_lrwzrd_skill_hit_02>${d[1]}`), 'its hit on each strike');
  } finally { globalThis.fetch = fetch0; }
});

test('the 魂灵 fx kinds draw no procedural stand-in', () => {
  for (const k of ['capture', 'orbit', 'orbitEnd', 'laser', 'laserEnd']) assert.equal(fxSpec(k, {}).a, 'none', k);
});

test('the extracted binding: the 魂灵 group\'s effects these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), want = emodes();
  for (const k of [LRMZRD, `${LRMZRD}_2`]) {
    assert.deepEqual(m[k].skills.summonfireball.proj, want[LRMZRD].skills.summonfireball.proj, k);
    assert.deepEqual(m[k].buffFx, SOULS, k);
  }
  for (const k of [LRWZRD, `${LRWZRD}_2`]) {
    assert.deepEqual(m[k].skills.laser.proj, want[LRWZRD].skills.laser.proj, k);
    assert.deepEqual(m[k].buffFx, SOULS, k);
  }
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});

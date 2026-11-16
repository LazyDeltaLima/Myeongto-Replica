// test/render/cannon-fx.test.js — 规程 m10's 盐坨子炮 drawn by its official effects (2026-11-12, docs/rules/fx.md
// 「규정 대포 「염괴포」」): an enemy-side stage device the sim runs by its key (content/devices.js tickCannon) — no unit, so
// render/app.js hands the battle's cannons to the effect layer (setCannons: stageCannons of the stage on the battle rect),
// which lays each one's trap_cnnon_idle (held) and trap_cnnon_start as the battle starts; the sim's fx 'cannon' draws its
// cast (trap_cnnon_attack_start) and shell (projectile_trap_cnnon_small_death's trail from the muzzle to the tile), its
// passenger mark (DurbusAbility `_passengerEffects` trap_cnnon_buff, from boarding to the shell's landing), and the landing
// 'explode' kind cnnonShell the shell's reach effect on the tile and its hit effect on each unit hit. The sim's events come
// from a real m10 battle; the render runs on a sample binding (the extracted effects are not needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createFxLayer, stageCannons, CANNON_KEY, CANNON_MUZZLE } from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const M10 = 'act3autochess_m10';
const guardRec = (id) => chessRec({ id, profession: 'WARRIOR', skill: null, rangeGrid: [[0, 0]], stats: { atk: 0, maxHp: 1e6, def: 0, res: 0, blockCnt: 2 } });
const standStill = (pos) => ({ motion: 'WALK', start: pos, end: [9, 2], checkpoints: [{ type: 'WAIT', time: 99 }] });

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const ROW = {
  modes: [{ name: 'Default', anim: [] }], dead: '', aura: ['trap_cnnon_idle'], buffFx: { 'trap_cnnon[born]': ['trap_cnnon_start'] }, passenger: ['trap_cnnon_buff'],
  skills: { enemycannon00d: { cast: ['trap_cnnon_attack_start'], opt: {}, hit: [],
    proj: { key: 'projectile_trap_cnnon_small_death', mount: 2, trail: ['trap_cnnon_trail_1'], hit: ['trap_cnnon_explode_hit'], reached: ['trap_cnnon_explode_1'], move: 'OTHER', speed: 5, raise: 0.7, noRaise: 1.3 } } },
};
const NAMES = ['trap_cnnon_idle', 'trap_cnnon_start', 'trap_cnnon_buff', 'trap_cnnon_attack_start', 'trap_cnnon_trail_1', 'trap_cnnon_explode_1', 'trap_cnnon_explode_hit'];

async function layer(row = ROW, load = () => 0) {
  const m = { [CANNON_KEY]: row, $fx: Object.fromEntries(NAMES.map((n) => [n, ['trap', n]])) };
  const files = { '/assets/local/fx/index.json': { bundles: { trap: NAMES } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', load, dry: true, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  const frame = () => L.update(1 / 60, { dist: 20 }, { width: 100, height: 100 });
  return { L, seen, frame };
}
const spawns = (seen) => seen.splice(0).filter((p) => p.kind === 'spawn' || p.kind === 'cannonCarryOff');
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });

/** A real m10 battle at the (13,6) cannon: a walker on board, one guard in its lane at (9,6); every event with its time. */
function battle() {
  const h = makeBattle({ stageId: M10, defs: { stages: { [M10]: ACT3.stages[M10] }, chess: { t_far: guardRec('t_far') },
    enemies: { enemy_walk: enemyRec({ key: 'enemy_walk', hp: 1e7, speed: 1, mass: 1 }) } },
  units: [{ chessId: 't_far', row: 9, col: 6 }], enemies: [{ key: 'enemy_walk', pos: [12.4, 6], route: standStill([12.4, 6]) }],
  autoFinish: false, timeLimit: 60 });
  const evs = [], ev0 = h.b._ev.bind(h.b);
  h.b._ev = (t) => { evs.push({ e: t, at: h.b.time }); return ev0(t); };
  return { h, evs };
}

test('stageCannons: m10\'s 盐坨子炮 whose lane reaches the battle rect, as the sim takes them', () => {
  const st = ACT3.stages[M10];
  const all = st.devices.filter((d) => d.key === CANNON_KEY).map((d) => `${d.pos[0]},${d.pos[1]}`).sort();
  assert.deepEqual(all, ['13,14', '13,6', '6,14', '6,6']);
  const { h } = battle();
  const got = stageCannons(st, h.b.grid.rect).map((k) => `${k.r},${k.c},${k.dir}`).sort();
  assert.ok(got.includes('13,6,DOWN'), `the normal field's own cannon: ${got}`);
  // the sim's lane rule: a cannon is the battle's when one of its five lane tiles is on the rect
  for (const k of stageCannons(st, null)) {
    const lane = [0, 1, 2, 3, 4].some((i) => h.b.grid.inRect(k.r - i, k.c));
    assert.equal(got.includes(`${k.r},${k.c},${k.dir}`), lane, `${k.r},${k.c}`);
  }
  assert.deepEqual(stageCannons(st, { r0: 0, r1: 1, c0: 0, c1: 1 }), [], 'a rect no lane reaches: none');
  assert.deepEqual(stageCannons(ACT3.stages.act3autochess_m01, null), [], 'another stage: none');
});

test('setCannons: each cannon\'s idle (held, SpecialPoint0) and born effects once the battle starts; none in prep; again after a clear() only with the next battle', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { L, seen, frame } = await layer();
    L.setCannons([{ r: 13, c: 6, z: 0.2, dir: 'DOWN' }]);
    frame();
    const s = spawns(seen);
    assert.deepEqual(s.map((p) => `${p.tag}:${p.names[0]}`).sort(), ['cannonBorn:trap_cnnon_start', 'cannonIdle:trap_cnnon_idle']);
    for (const p of s) assert.deepEqual(p.at, { x: 6, y: 13, z: 0.2 });
    frame();
    assert.deepEqual(spawns(seen), [], 'laid once');
    L.clear();
    frame();
    assert.deepEqual(spawns(seen), [], 'a clear() ends them until the next battle\'s setCannons');
    L.setCannons([]);
    frame();
    assert.deepEqual(spawns(seen), []);
  } finally { globalThis.fetch = fetch0; }
});

test('the sim\'s \'cannon\' events: passenger mark from boarding to landing, cast and shell from the muzzle to the tile, the reach on the tile and the hit on the unit hit', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, evs } = battle();
    h.run(13.5);   // the first shot at 12 s (m10 sub-levels: char_skill_cd_mul ×2), lands 0.8 s later
    const fx = evs.filter((x) => x.e[0] === 'fx' && (x.e[1] === 'cannon' || x.e[4]?.kind === 'cnnonShell'));
    assert.deepEqual(fx.map((x) => (x.e[1] === 'cannon' ? (x.e[4].fire ? 'fire' : `carry${x.e[4].carry}`) : 'land')), ['carry1', 'fire', 'land', 'carry0']);
    const far = h.unit('t_far');
    assert.deepEqual(fx[2].e[4].hit, [far.id]);

    const { L, seen, frame } = await layer();
    const views = new Map([...h.b.allies(), ...h.b.enemies].map((u) => [u.id, viewOf(u)]));
    L.setCannons(stageCannons(ACT3.stages[M10], h.b.grid.rect).map((k) => ({ ...k, z: 0 })));
    frame();
    seen.length = 0;
    const tags = (e) => { L.onEvent(e, views); return spawns(seen).map((p) => (p.kind === 'cannonCarryOff' ? 'off' : `${p.tag}:${p.names[0]}${p.on != null ? '>' + p.on : ''}`)); };
    assert.deepEqual(tags(fx[0].e), ['cannonPax:trap_cnnon_buff']);
    assert.ok(L.ownsFx(fx[0].e));
    L.onEvent(fx[1].e, views);
    const fire = spawns(seen);
    assert.deepEqual(fire.map((p) => `${p.tag}:${p.names[0]}`), ['cannonCast:trap_cnnon_attack_start', 'cannonShell:trap_cnnon_trail_1']);
    assert.deepEqual(fire[0].at, { x: 6, y: 13, z: 0 }, 'the cast at SpecialPoint0 (the root)');
    assert.ok(Math.abs(fire[1].at.y - (13 - CANNON_MUZZLE.fwd)) < 1e-9 && fire[1].at.z === CANNON_MUZZLE.up && fire[1].at.x === 6, 'the shell from the muzzle, along the barrel (DOWN = −row)');
    assert.deepEqual(fire[1].to, { x: 6, y: 9 });
    assert.deepEqual(tags(fx[2].e), ['cannonBlast:trap_cnnon_explode_1', `cannonHit:trap_cnnon_explode_hit>${far.id}`]);
    assert.ok(L.ownsFx(fx[2].e), 'no stand-in blast');
    assert.deepEqual(tags(fx[3].e), ['off']);
    // a cannon not laid on this battle (another field's): its events are not drawn here
    const other = { ...fx[1], e: ['fx', 'cannon', 14, 13, fx[1].e[4]] };
    assert.deepEqual(tags(other.e), []);
    assert.ok(!L.ownsFx(other.e));
  } finally { globalThis.fetch = fetch0; }
});

// 2026-11-14 (docs/rules/render.md 「적응 부하 단계」): the view's load level 3 leaves no official effect out — the
// cannon's shell and blast, an enemy-side device's, used to stay procedural there
test('at load level 3 the cannon\'s cast, shell, blast and hit are the same as at level 0', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, evs } = battle();
    h.run(13.5);
    const fx = evs.filter((x) => x.e[0] === 'fx' && (x.e[1] === 'cannon' || x.e[4]?.kind === 'cnnonShell'));
    const drawn = async (lod) => {
      const { L, seen, frame } = await layer(ROW, () => lod);
      const views = new Map([...h.b.allies(), ...h.b.enemies].map((u) => [u.id, viewOf(u)]));
      L.setCannons(stageCannons(ACT3.stages[M10], h.b.grid.rect).map((k) => ({ ...k, z: 0 })));
      frame();
      seen.length = 0;
      const out = [];
      for (const x of fx.slice(0, 3)) { L.onEvent(x.e, views); out.push(...spawns(seen).map((p) => `${p.tag}:${p.names[0]}`), `owns ${L.ownsFx(x.e)}`); }
      return out;
    };
    const at0 = await drawn(0), at3 = await drawn(3);
    assert.ok(at0.includes('cannonShell:trap_cnnon_trail_1') && at0.includes('cannonBlast:trap_cnnon_explode_1'), at0.join(', '));
    assert.deepEqual(at3, at0);
  } finally { globalThis.fetch = fetch0; }
});

test('at quality \'low\' the cannon\'s events stay with the procedural FX (the module caches the tables: a missing binding is the extracted-binding case below)', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { seen } = await layer();
    const low = createFxLayer({ host: null, above: null, quality: () => 'low', dry: true, trace: (p) => seen.push(p) });
    await new Promise((r) => setTimeout(r, 10));
    low.setCannons([{ r: 13, c: 6, z: 0, dir: 'DOWN' }]);
    low.update(1 / 60, { dist: 20 }, { width: 100, height: 100 });
    const land = ['fx', 'explode', 6, 9, { r: 1.5, kind: 'cnnonShell', hit: [] }];
    low.onEvent(land, new Map());
    assert.ok(!low.ownsFx(land));
    assert.deepEqual(seen.filter((p) => p.kind === 'spawn'), []);
  } finally { globalThis.fetch = fetch0; }
});

test('render/app.js hands the battle\'s cannons to the layer (none in prep)', () => {
  const app = read('public/js/render/app.js');
  assert.match(app, /fxGame\.setCannons\(battleMeta\.prep \? \[\] : stageCannons\(stageRec, rect\)/);
});

test('the extracted binding: trap_196_cnnon\'s row and its effects', (t) => {
  const modesPath = new URL('public/assets/local/fx/enemy-modes.json', ROOT);
  if (!existsSync(modesPath)) return t.skip('no extracted effects');
  const m = JSON.parse(readFileSync(modesPath, 'utf8'));
  const row = m[CANNON_KEY];
  assert.ok(row, 'enemy_bindings.py reads the stage device');
  assert.deepEqual(row.aura, ROW.aura);
  assert.deepEqual(row.buffFx['trap_cnnon[born]'], ROW.buffFx['trap_cnnon[born]']);
  assert.deepEqual(row.passenger, ROW.passenger);
  assert.deepEqual(row.skills.enemycannon00d, ROW.skills.enemycannon00d);
  const idx = JSON.parse(read('public/assets/local/fx/enemy-index.json'));
  for (const n of NAMES) {
    assert.deepEqual(m.$fx[n], ['trap', n], n);
    assert.ok(idx.bundles.trap.includes(n), `${n} extracted`);
  }
});

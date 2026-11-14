// test/render/eskill-lasso.test.js — enemy channel skills whose projectile is a link (2026-11-14, docs/rules/fx.md
// 「적 채널 스킬의 줄 투사체」): the sim's fx 'enemySkill' { id, ability, tgt, dur } of 节日爵士乐手's 狂欢式演奏 ('fire') and
// 萨卡兹王庭军精锐术师's 死亡之眼 ('DeathEye') draws the projectile's HarpoonRenderer effect (`proj.trail`) from the caster to
// its target for the channel — on the caster when the projectile has `_spawnOnSource` (`proj.onSrc`: the jazz player's flame),
// else on the line's head (the 死亡之眼's) — and the sim's stand-in beams of the channel ('beam' jazzFire / deathEye /
// deathEyeEnd) are not drawn meanwhile; an early end ('enemySkillEnd', a cut 'deathEyeEnd') ends the line; the channel's
// hits keep its hit effects to its end (eskillHit, not only the first 3 s). Until then the jazz player's flame was the
// stand-in beam (maintainer report 2026-11-14).
// The sim's events come from the real kits (content/enemies/invisible.js kitJazz, element.js kitDeathEye); the render runs on
// a sample binding (the extracted one is compared at the end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as FXGAME from '../../public/js/render/fxgame.js';
import { getData } from '../../server/data.js';
import { makeBattle, chessRec } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';

const MODES = new URL('../../public/assets/local/fx/enemy-modes.json', import.meta.url);
const quiet = { warn() {}, error() {}, info() {} };
const D = getData({ log: quiet });
const JAZZ = 'enemy_10034_cnvsax', DW = 'enemy_1275_dwlock_2';
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e9, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

/** Still walls at (row, col) and enemy `key` at `pos`, every event logged with its battle time. */
function field(key, walls, pos) {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'normal', sharedBoss: null, enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [key]: D.enemies[key] } },
    kits: { t_wall: () => ({ trait: { noAttack: true } }) },
    units: walls.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 })),
  });
  h.step();
  const b = h.battle, ev0 = b._ev.bind(b), rec = [];
  b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
  const e = h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag: null });
  return { h, e, rec };
}

// the parts of the extracted binding these cases read (enemy-modes.json, enemy_bindings.py)
const emodes = () => ({
  [JAZZ]: { modes: [{ name: 'Default', anim: [] }, { name: 'Attack', anim: ['Attack'], ranged: { cast: [], opt: {}, hit: ['enemy_cnvsax_hit_01'] } }],
    skills: { fire: { cast: [], opt: {}, hit: [], proj: { key: 'projectile_enemy_cnvsax', mount: 2, trail: ['enemy_cnvsax_skill_line_01'], hit: ['enemy_cnvsax_hit_02'],
      move: 'OTHER', speed: 10.0, link: 3600.0, onSrc: 1 } } } },
  [DW]: { modes: [{ name: 'Default', anim: [] }],
    skills: { deatheye: { cast: ['enemy_dwlock_skill_start_01'], opt: { enemy_dwlock_skill_start_01: { s: 2, e: 3, o: 0 } }, hit: ['enemy_dwlock_skill_hit_01'],
      hopt: { enemy_dwlock_skill_hit_01: { e: 3, once: 1 } },
      proj: { key: 'projectile_enemy_dwlock_line', mount: 2, trail: ['enemy_dwlock_skill_line_01'], move: 'OTHER', speed: 8.0, link: 8.0 } } } },
});
const NAMES = [...new Set(JSON.stringify(emodes()).match(/"enemy_[A-Za-z0-9_-]+"/g).map((s) => JSON.parse(s)).filter((n) => !/^enemy_\d/.test(n)))];

async function layer(without = []) {
  // (the bindings and the effect index are loaded once per module: a case with another binding takes a module of its own)
  const { createFxLayer } = without.length ? await import(`../../public/js/render/fxgame.js?without=${without.join(',')}`) : FXGAME;
  const m = emodes();
  const names = NAMES.filter((n) => !without.includes(n));
  m.$fx = Object.fromEntries(names.map((n) => [n.toLowerCase(), ['b', n]]));
  const files = { '/assets/local/fx/index.json': { bundles: { b: names } }, '/assets/local/fx/enemy-modes.json': m };
  globalThis.fetch = async (url) => (files[url] ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null });
  const seen = [];
  const L = createFxLayer({ host: null, above: null, quality: () => 'high', dry: true, enemyDef: (id) => D.enemies[id] || null, trace: (p) => seen.push(p) });
  await new Promise((r) => setTimeout(r, 10));
  return { L, seen };
}
const viewOf = (u) => ({ id: u.id, x: u.x, y: u.y, alive: true, isEnemy: u.side === 'enemy', form: null, flags: 0, statuses: new Set(),
  info: { id: u.id, side: u.side === 'enemy' ? 'enemy' : 'ally', defId: u.defId ?? 'char_x', form: null } });
const CAM = { dist: 20 }, VP = { width: 100, height: 100 };
/**
 * Plays the logged events `rec` (from battle time t0) into layer `L`, the layer's clock following the battle's; `on(e, t)`
 * sees each event after the layer took it.
 */
function play(L, views, rec, t0, t1, on = () => {}) {
  let at = t0;
  L.update(0, CAM, VP);
  for (const [t, e] of rec) {
    if (t < t0 - 1e-9) continue;
    if (t > t1 + 1e-9) break;
    while (t - at > 1e-9) { const d = Math.min(0.05, t - at); L.update(d, CAM, VP); at += d; }
    L.onEvent(e, views);
    on(e, t);
  }
}
const fxIs = (e, kind, k) => e[0] === 'fx' && e[1] === kind && (k == null || e[4]?.kind === k || e[4]?.ability === k);

test('节日爵士乐手 (real kit): 狂欢式演奏 draws its flame line on itself for the 10.5 s channel; no stand-in beam; its hit effect on every tick to the end', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'fire')), 30);
    h.run(11);
    const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'fire'));
    const wall = h.allies()[0];
    assert.ok(Math.abs(cast[4].dur - 10.5) < 1e-9 && cast[4].tgt === wall.id, 'the sim casts at its blocker for 10.5 s');
    const beams = rec.filter(([t, x]) => t >= t0 && fxIs(x, 'beam', 'jazzFire'));
    assert.equal(beams.length, 21, 'a stand-in beam each 0.5 s tick');
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    const hits = [];
    play(L, views, rec, t0, t0 + 10.6, (x, t) => {
      if (fxIs(x, 'beam', 'jazzFire')) assert.equal(L.ownsFx(x), true, `the beam at ${(t - t0).toFixed(1)} s is not drawn`);
      if (x[0] === 'dmg' && x[5] === e.id) hits.push(t - t0);
    });
    const lines = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_cnvsax_skill_line_01');
    assert.equal(lines.length, 1, 'one line for the channel');
    assert.equal(lines[0].on, e.id, 'made on the jazz player (`_spawnOnSource`), not on its target');
    const hitFx = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_cnvsax_hit_02');
    assert.ok(hits.some((t) => t > 9), 'the channel hits to its end');
    assert.ok(hitFx.length >= 18 && hitFx.every((p) => p.on === wall.id), `its hit effect on the target at the ticks past 3 s too (${hitFx.length})`);
    assert.ok(!seen.some((p) => p.kind === 'lassoEnd'), 'played out: no early end');
  } finally { globalThis.fetch = fetch0; }
});

test('节日爵士乐手 (real kit): a silence ends the channel — the line ends with its \'enemySkillEnd\'', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'fire')), 30);
    const [t0] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'fire'));
    h.run(3);
    h.battle.applyStatus(e, 'silence', { duration: 1 });
    h.run(1);
    const [t1] = rec.find(([, x]) => fxIs(x, 'enemySkillEnd', 'fire'));
    const wall = h.allies()[0];
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    play(L, views, rec, t0, t1);
    assert.deepEqual(seen.filter((p) => p.kind === 'lassoEnd').map((p) => [p.names[0], p.by]), [['enemy_cnvsax_skill_line_01', e.id]], 'the line ends there');
  } finally { globalThis.fetch = fetch0; }
});

test('萨卡兹王庭军精锐术师 (real kit): 死亡之眼 draws its line on the line\'s head (no `_spawnOnSource`); its target falling cuts it', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(DW, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'DeathEye')), 40);
    const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'DeathEye'));
    h.run(2.5);
    const wall = h.allies().find((u) => u.id === cast[4].tgt);
    h.battle.kill(wall, null);
    h.run(1.2);
    const [t1, cut] = rec.find(([, x]) => fxIs(x, 'beam', 'deathEyeEnd'));
    const start = rec.find(([t, x]) => t >= t0 && fxIs(x, 'beam', 'deathEye'))[1];
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    play(L, views, rec, t0, t1);
    const lines = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_dwlock_skill_line_01');
    assert.equal(lines.length, 1, 'one line');
    assert.equal(lines[0].on, null, 'made on the line\'s head (a moving point), not on a unit');
    assert.equal(L.ownsFx(start), true, 'its start beam is not drawn');
    assert.equal(L.ownsFx(cut), true, 'nor the cut');
    assert.deepEqual(seen.filter((p) => p.kind === 'lassoEnd').map((p) => p.names[0]), ['enemy_dwlock_skill_line_01'], 'the cut ends the line');
  } finally { globalThis.fetch = fetch0; }
});

test('a link line that is not extracted leaves the stand-in beams drawn', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.filter(([, x]) => fxIs(x, 'beam', 'jazzFire')).length >= 2, 30);
    const [t0] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'fire'));
    const wall = h.allies()[0];
    const { L, seen } = await layer(['enemy_cnvsax_skill_line_01']);
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    let n = 0;
    play(L, views, rec, t0, h.battle.time, (x) => { if (fxIs(x, 'beam', 'jazzFire')) { n++; assert.equal(L.ownsFx(x), false, 'the stand-in beam stays'); } });
    assert.ok(n >= 2);
    assert.ok(!seen.some((p) => p.kind === 'spawn' && /skill_line/.test(p.names[0])));
  } finally { globalThis.fetch = fetch0; }
});

test('the extracted binding: the parts these cases read', { skip: !existsSync(MODES) && 'no extracted enemy effects' }, () => {
  const m = JSON.parse(readFileSync(MODES, 'utf8')), w = emodes();
  assert.deepEqual(m[JAZZ].skills.fire, w[JAZZ].skills.fire);
  assert.deepEqual(m[JAZZ].modes, w[JAZZ].modes);
  assert.deepEqual(m[DW].skills.deatheye, w[DW].skills.deatheye);
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});

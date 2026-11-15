// test/render/eskill-lasso.test.js — enemy channel skills whose projectile is a link (2026-11-14, docs/rules/fx.md
// 「적 채널 스킬의 줄 투사체」): the sim's fx 'enemySkill' { id, ability, tgt, hold } of 节日爵士乐手's 狂欢式演奏 ('fire') and
// 萨卡兹王庭军精锐术师's 死亡之眼 ('DeathEye') draws the projectile's HarpoonRenderer effect (`proj.trail`) from the caster to
// its target for the channel — on the caster when the projectile has `_spawnOnSource` (`proj.onSrc`: the jazz player's flame),
// else on the line's head (the 死亡之眼's) — and the sim's stand-in beams of the channel ('beam' jazzFire / deathEye /
// deathEyeEnd) are not drawn meanwhile; the cast's end ('enemySkillEnd' — content/enemies.js chanEnd, as the channel ends or
// sooner) or a cut 'deathEyeEnd' ends the line; the channel's
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
const JAZZ = 'enemy_10034_cnvsax', DW = 'enemy_1275_dwlock_2', ROBH = 'enemy_10018_sgrobh', GUN2 = 'enemy_9017_achunt_2', SPRING = 'enemy_9020_actrpc';
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
      move: 'OTHER', speed: 10.0, link: 3600.0, onSrc: 1, rope: 'enemy_cnvsax_skill_line_01' } } } },
  [DW]: { modes: [{ name: 'Default', anim: [] }],
    skills: { deatheye: { cast: ['enemy_dwlock_skill_start_01'], opt: { enemy_dwlock_skill_start_01: { s: 2, e: 3, o: 0 } }, hit: ['enemy_dwlock_skill_hit_01'],
      hopt: { enemy_dwlock_skill_hit_01: { e: 3, once: 1 } },
      proj: { key: 'projectile_enemy_dwlock_line', mount: 2, trail: ['enemy_dwlock_skill_line_01'], move: 'OTHER', speed: 8.0, link: 8.0, rope: 'enemy_dwlock_skill_line_01' } } } },
  [ROBH]: { modes: ['Default', 'Global'].map((name, i) => {
    const part = { cast: ['enemy_sgrobh_attack_start_01'], opt: { enemy_sgrobh_attack_start_01: { s: 2, e: 3, o: 0 } }, hit: [],
      proj: { key: `projectile_enemy_sgrobh_${i + 1}`, mount: 2, trail: [`enemy_sgrobh_attack_0${i + 1}`], hit: ['enemy_sgrobh_attack_hit_01'], move: 'OTHER', speed: 30.0, link: 0.2, rope: `enemy_sgrobh_attack_0${i + 1}` } };
    return { name, anim: [i ? 'Attack2' : 'Attack'], melee: part, ranged: part };
  }) },
  [GUN2]: { modes: [{ name: 'Default', anim: ['Attack'] }, { name: 'S1', anim: [] }],
    skills: { 3: { cast: [], opt: {}, hit: [], buff: ['enemy_achunt_skill_1', 'enemy_achunt_shield'],
      proj: { key: 'projectile_enemy_achunt_ray', mount: 2, trail: ['enemy_achunt_chain_end', 'enemy_achunt_chain'], move: 'OTHER', speed: 10.0, link: 100000.0,
        rope: 'enemy_achunt_chain', hook: 1 } } } },
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

test('节日爵士乐手 (real kit): 狂欢式演奏 draws its flame line on itself for the 10.5 s channel, to the cast\'s end; no stand-in beam; its hit effect on every tick to the end', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(JAZZ, [[10, 5]], [10, 5]);
    h.runUntil(() => rec.some(([, x]) => fxIs(x, 'enemySkill', 'fire')), 30);
    h.run(11);
    const [t0, cast] = rec.find(([, x]) => fxIs(x, 'enemySkill', 'fire'));
    const wall = h.allies()[0];
    assert.ok(cast[4].hold === 1 && cast[4].tgt === wall.id, 'the sim casts at its blocker, held to its end');
    const [t1] = rec.find(([, x]) => fxIs(x, 'enemySkillEnd', 'fire'));
    assert.ok(Math.abs(t1 - t0 - 10.5) < 0.1, `the cast ends with the 10.5 s channel (${(t1 - t0).toFixed(3)})`);
    const beams = rec.filter(([t, x]) => t >= t0 && fxIs(x, 'beam', 'jazzFire'));
    assert.equal(beams.length, 21, 'a stand-in beam each 0.5 s tick');
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], [wall.id, viewOf(wall)]]);
    const hits = [];
    play(L, views, rec, t0, t1, (x, t) => {
      if (fxIs(x, 'beam', 'jazzFire')) assert.equal(L.ownsFx(x), true, `the beam at ${(t - t0).toFixed(1)} s is not drawn`);
      if (x[0] === 'dmg' && x[5] === e.id) hits.push(t - t0);
    });
    const lines = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_cnvsax_skill_line_01');
    assert.equal(lines.length, 1, 'one line for the channel');
    assert.equal(lines[0].on, e.id, 'made on the jazz player (`_spawnOnSource`), not on its target');
    const hitFx = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_cnvsax_hit_02');
    assert.ok(hits.some((t) => t > 9), 'the channel hits to its end');
    assert.ok(hitFx.length >= 18 && hitFx.every((p) => p.on === wall.id), `its hit effect on the target at the ticks past 3 s too (${hitFx.length})`);
    assert.deepEqual(seen.filter((p) => p.kind === 'lassoEnd').map((p) => p.names[0]), ['enemy_cnvsax_skill_line_01'], 'the cast\'s end ends the line');
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

test('玩具独轮车 (real kit): each plain attack draws its harpoon\'s line (a link shot: HARPOON `_speed` 30, `_linkDuration` 0.2) to each of its two targets — not the stand-in shot', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const { h, e, rec } = field(ROBH, [[10, 5], [10, 6]], [10, 6.4]);
    h.runUntil(() => rec.filter(([, x]) => x[0] === 'atk' && x[1] === e.id).length >= 4, 30);
    const atks = rec.filter(([, x]) => x[0] === 'atk' && x[1] === e.id);
    assert.ok(new Set(atks.map(([, x]) => x[2])).size === 2, 'the sim strikes both walls');
    const { L, seen } = await layer();
    const views = new Map([[e.id, viewOf(e)], ...h.allies().map((u) => [u.id, viewOf(u)])]);
    play(L, views, rec, atks[0][0], atks[atks.length - 1][0], (x) => {
      if (x[0] === 'atk' && x[1] === e.id) assert.equal(L.arrowKind(x), 'officialTrail', 'its line, not the stand-in shot');
    });
    const lines = seen.filter((p) => p.kind === 'spawn' && p.names[0] === 'enemy_sgrobh_attack_01');
    assert.equal(lines.length, atks.length, 'one line per strike');
    assert.ok(lines.every((p) => p.on == null), 'made on the line\'s head (no `_spawnOnSource`)');
  } finally { globalThis.fetch = fetch0; }
});

test('假想敌：铳 (real kit): 【盲信之誓】 draws its chain (HarpoonRenderer enemy_achunt_chain, the body enemy_achunt_chain_end on its head) to each “碎铳之簧” once and holds it every tick — not the stand-in link', async () => {
  const fetch0 = globalThis.fetch;
  try {
    const pool = (hp) => ({ hp, maxHp: hp, damage(pid, a) { this.hp = Math.max(0, this.hp - a); } });
    const h = makeBattle({
      kind: 'boss', sharedBoss: pool(1e7), seed: 3, autoFinish: false, timeLimit: 400, content: 'generic', extraContent: [enemiesMod, bossesMod],
      enemies: [], defs: { chess: { t_wall: WALL }, enemies: { [GUN2]: D.enemies[GUN2], [SPRING]: D.enemies[SPRING] } },
      kits: { t_wall: () => ({ trait: { noAttack: true } }) }, units: [{ chessId: 't_wall', row: 10, col: 7, uid: 1 }],
    });
    h.step();
    const b = h.battle, ev0 = b._ev.bind(b), rec = [];
    b._ev = (e) => { rec.push([b.time, e]); return ev0(e); };
    const put = (key, pos, tag) => { const u = h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: 0 }, tag }); u.profile.noAttack = true; return u; };
    const gun = put(GUN2, [3, 10], 'boss'), sp = put(SPRING, [3, 4], 'part');
    h.run(4.5);
    const links = rec.filter(([, x]) => fxIs(x, 'link', 'faithLink'));
    assert.ok(links.length >= 3 && links.every(([, x]) => x[4].from === gun.id && x[4].to === sp.id), 'the sim links 铳 to its spring every second');
    const { L, seen } = await layer();
    const views = new Map([[gun.id, viewOf(gun)], [sp.id, viewOf(sp)]]);
    play(L, views, rec, links[0][0], links[links.length - 1][0], (x) => {
      if (fxIs(x, 'link', 'faithLink')) assert.equal(L.ownsFx(x), true, 'no stand-in link');
    });
    const names = seen.filter((p) => p.kind === 'spawn').map((p) => p.names[0]);
    assert.deepEqual(names.filter((n) => /achunt_chain/.test(n)), ['enemy_achunt_chain', 'enemy_achunt_chain_end'], 'one chain and one body, held across the ticks');
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
  assert.deepEqual(m[ROBH].modes, w[ROBH].modes);
  assert.deepEqual(m[GUN2].skills['3'], w[GUN2].skills['3']);
  for (const n of NAMES) assert.ok(m.$fx[n.toLowerCase()], `${n} extracted`);
});

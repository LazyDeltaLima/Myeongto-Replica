// test/seasons-act3-enemies.test.js — the enemies and leaders of 卫戍协议：规程 (shared/seasons.js `act3autochess`, not
// public) where its tables differ from the default season's: the same kits read the season's records (DataSource over
// data/seasons/act3autochess/enemies.json), so a behaviour the new tables change is pinned here, next to the default
// season's test in test/content/enemies_bosses.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getData } from '../server/data.js';
import { makeBattle, chessRec } from './helpers/battleHarness.js';
import * as enemiesMod from '../server/sim/content/enemies.js';
import * as bossesMod from '../server/sim/content/bosses.js';

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const BASE = getData({ log: quiet });
const E3 = ACT3.enemies, E0 = BASE.enemies;

// ---------------------------------------------------------------------------------------------------------------
// coverage: every enemy a 规程 match can spawn is authored (enemies.js KITS / bosses.js BOSS_KITS) or stats-only with a
// reason, as in the default season — or still on one of these lists, which only shrink (a key that gains a kit must leave
// its list). Reachable = the keys named by the season's waves, leaders, enemy effects / choices / strategies, its
// 特训敌人 entries and the escorts each entry brings (factions.json entries[*].N / E …), and every enemy those name.

// the leader fields: the units of the leaders' waves
const LEADER_FIELD = [
  'enemy_10196_ubba_2', 'enemy_1424_lrboom', 'enemy_1435_dsflys', 'enemy_9024_acsgnt', 'enemy_9040_accrit',
];
// 特训敌人 entries of 规程 (its new types CRITIC 精锐 / REBORN 重生 among them) and their escorts and offspring
const SPECIAL_TYPE = [
  'enemy_10163_mnctur_2', 'enemy_1064_snsbr', 'enemy_1067_snslime_2', 'enemy_1103_wdkght_2', 'enemy_1104_lfkght',
  'enemy_1104_lfkght_3', 'enemy_1131_sbeast', 'enemy_1131_sbeast_2', 'enemy_1132_sarchn', 'enemy_1132_sarchn_2',
  'enemy_1133_harchn', 'enemy_1133_harchn_2', 'enemy_1137_plasm', 'enemy_1138_tumor', 'enemy_1191_krgrg',
  'enemy_1191_krgrg_2', 'enemy_1213_mtrsnp', 'enemy_1216_cansld', 'enemy_1219_mtrbty', 'enemy_1220_dzoms',
  'enemy_1220_dzoms_2', 'enemy_1221_dzomg', 'enemy_1221_dzomg_2', 'enemy_1222_dpvt', 'enemy_1222_dpvt_2',
  'enemy_1223_dmech', 'enemy_1223_dmech_2', 'enemy_1224_dsuply', 'enemy_1224_dsuply_2', 'enemy_1225_dkmage',
  'enemy_1225_dkmage_2', 'enemy_1226_dklord', 'enemy_1226_dklord_2', 'enemy_1309_mhboar_2', 'enemy_1360_dfello',
  'enemy_1361_dthrow', 'enemy_1361_dthrow_2', 'enemy_1362_dfat', 'enemy_1362_dfat_2', 'enemy_1363_spnshd_2',
  'enemy_1373_ltnhor', 'enemy_1373_ltnhor_2', 'enemy_1375_ltnclr', 'enemy_1375_ltnclr_2', 'enemy_1376_ltndru',
  'enemy_1376_ltndru_2', 'enemy_1385_winbom', 'enemy_1385_winbom_2', 'enemy_1388_wingnt', 'enemy_1388_wingnt_2',
  'enemy_1403_gunsho', 'enemy_1403_gunsho_2', 'enemy_1405_boomer_2', 'enemy_1406_chghmr', 'enemy_1409_bdguad_2',
  'enemy_1428_lrsoul', 'enemy_1429_lrwzrd', 'enemy_1429_lrwzrd_2', 'enemy_1431_lrmzrd', 'enemy_1431_lrmzrd_2',
  'enemy_1434_dsshel', 'enemy_1436_dsdivi', 'enemy_1436_dsdivi_2', 'enemy_1437_dsfull', 'enemy_1437_dsfull_2',
  'enemy_9030_acpara', 'enemy_9031_acrefd', 'enemy_9034_acblk', 'enemy_9039_acrefm',
];
// enemies an enemy effect, choice or strategy of 规程 puts on the field
const EFFECT_SPAWN = [
  'enemy_10003_trwlpl_2', 'enemy_10077_mpbarr', 'enemy_10123_uareap', 'enemy_10146_nscola', 'enemy_10147_nsbomb',
  'enemy_10196_ubba', 'enemy_10229_agactr_2', 'enemy_1413_mmstck', 'enemy_2135_shkrbt', 'enemy_9025_aclts',
  'enemy_9026_acltm', 'enemy_9038_achest',
];
const PENDING = new Set([...LEADER_FIELD, ...SPECIAL_TYPE, ...EFFECT_SPAWN]);

const SEASON_DIR = new URL('../data/seasons/act3autochess/', import.meta.url);
const readSeason = (f) => fs.readFileSync(new URL(f, SEASON_DIR), 'utf8');
const KEY_RX = /enemy_\d+_[a-z0-9]+(?:_\d+)?/g;

/** The 规程 enemy keys a match can spawn. */
function reachable() {
  const keysIn = (text) => [...new Set(text.match(KEY_RX) ?? [])].filter((k) => E3[k]);
  const roots = new Set();
  for (const f of ['waves', 'bosses', 'choices', 'effects', 'bands']) for (const k of keysIn(readSeason(`${f}.json`))) roots.add(k);
  const F = JSON.parse(readSeason('factions.json'));
  for (const x of Object.values(F.entries)) {
    roots.add(x.key);
    for (const slot of Object.keys(F.templateSlots)) for (const a of x[slot] ?? []) roots.add(a.key);
  }
  const out = new Set();
  const add = (k) => { if (out.has(k)) return; out.add(k); for (const c of keysIn(JSON.stringify(E3[k]))) add(c); };
  for (const k of roots) add(k);
  return out;
}

test('every enemy a 规程 match can spawn is authored or stats-only, else on a pending list (which only shrinks)', () => {
  const { KITS, STATS_ONLY } = enemiesMod, { BOSS_KITS } = bossesMod;
  const authored = (k) => !!(KITS[k] || BOSS_KITS[k] || STATS_ONLY[k]);
  const reach = reachable();
  assert.ok(reach.size > 300, `${reach.size} reachable`);
  const missing = [...reach].filter((k) => !authored(k) && !PENDING.has(k));
  assert.deepEqual(missing, [], 'reachable, no kit and not listed');
  const done = [...PENDING].filter((k) => authored(k));
  assert.deepEqual(done, [], 'authored now: take them off the pending lists');
  const stray = [...PENDING].filter((k) => !reach.has(k));
  assert.deepEqual(stray, [], 'listed but not reachable');
  assert.equal(new Set([...LEADER_FIELD, ...SPECIAL_TYPE, ...EFFECT_SPAWN]).size, LEADER_FIELD.length + SPECIAL_TYPE.length + EFFECT_SPAWN.length, 'one list each');
});

const WALL = (id, o = {}) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def: o.def ?? 0, res: 0, blockCnt: o.block ?? 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
const pool = (hp) => ({ hp, maxHp: hp, damage(_pid, a) { this.hp = Math.max(0, this.hp - a); } });

/** A leader field whose enemies are the given season's records (the default season's when `season` is BASE). */
function bossArena(season, keys, o = {}) {
  const enemies = Object.fromEntries(keys.map((k) => [k, season.enemies[k]]));
  return makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'boss', sharedBoss: pool(1e7), enemies: [],
    defs: { chess: { t_wall: WALL('t_wall'), t_wall2: WALL('t_wall2', { def: 900 }) }, enemies },
    kits: { t_wall: NOATK, t_wall2: NOATK }, ...o,
  });
}
const put = (h, key, pos, o = {}) => h.spawn(key, { pos, routeIndex: 0, mods: { speedMul: o.move ? 1 : 0 }, tag: o.tag === undefined ? 'boss' : o.tag });

test('规程 假想敌：铳 is blockable outside 【最终之罚】 and shoots its blocker; the default season\'s stays unblockable', () => {
  // the tables: the default season has 「无法被阻挡」 as a line of its own, 规程 only inside 最终之罚 (「技能持续期间」)
  const lines = (E) => E.enemy_9017_achunt.abilities.map((a) => a.text);
  assert.ok(lines(E0).includes('无法被阻挡'));
  assert.ok(!lines(E3).includes('无法被阻挡') && lines(E3).some((t) => t.includes('技能持续期间，无法被阻挡')));

  const run = (season, setup) => {
    // the gun walks row 2 toward (2, 2), already in touch with t_wall standing in its way (a ranged enemy stops to shoot
    // and, its ASPD stacked, would stand at range forever); the DEF 900 t_wall2 a row below is in its range (2)
    const h = bossArena(season, ['enemy_9017_achunt'], { units: [{ chessId: 't_wall', row: 2, col: 7 }, { chessId: 't_wall2', row: 3, col: 6 }], setup });
    h.step();
    const e = put(h, 'enemy_9017_achunt', [2, 8], { move: true });
    e.x = 7.6;
    return { h, e };
  };
  const noCharge = (b) => { b.enemyOverrides = { enemy_9017_achunt: { skills: [] } }; };   // 最终之罚 kept out

  const old = run(BASE, noCharge);
  old.h.runUntil(() => old.e.stats.attacks >= 2, 30);
  assert.ok(old.e.s.flags.unblockable && !old.e.blockedBy, 'default season: always unblockable');
  assert.ok(old.h.unit('t_wall2').stats.taken > 0 && old.h.unit('t_wall').stats.taken === 0, 'default season: the highest-DEF unit in range');

  const { h, e } = run(ACT3, noCharge);
  h.runUntil(() => e.blockedBy, 5);
  assert.ok(!e.s.flags.unblockable, '规程: blockable');
  assert.ok(e.blockedBy === h.unit('t_wall'), `blocked by the unit in its way (x ${e.x.toFixed(2)})`);
  const n = e.stats.attacks, before = h.unit('t_wall').stats.taken;
  h.runUntil(() => e.stats.attacks >= n + 2, 30);
  assert.ok(e.stats.attacks >= n + 2 && h.unit('t_wall').stats.taken > before, 'attacks while blocked');
  assert.ok(h.unit('t_wall').stats.taken > 0 && h.unit('t_wall2').stats.taken === 0, 'Default `_combat`: its blocker, not the higher-DEF unit in range');

  // 最终之罚 (achunt_s_1[speed]: BLOCK_FREE for the charge's duration): let go, charges, then blockable again
  const c = run(ACT3);
  c.h.runUntil(() => c.e.blockedBy, 5);
  assert.ok(c.e.blockedBy, 'blocked before the charge');
  c.h.runUntil(() => c.e.findBuff('boss:charge'), 40);
  c.h.step();
  assert.ok(c.e.s.flags.unblockable && !c.e.blockedBy, 'unblockable while charging');
  c.h.runUntil(() => !c.e.findBuff('boss:charge'), E3.enemy_9017_achunt.talents.bb['3.duration'] + 1);
  assert.ok(!c.e.s.flags.unblockable, 'blockable again after the charge');
});

test('规程 enemies with a kit: their silenceable abilities are exactly their SILENCE lines', () => {
  const { KITS } = enemiesMod, { BOSS_KITS } = bossesMod;
  const own = [...Object.keys(KITS), ...Object.keys(BOSS_KITS)].filter((k) => !E0[k]);
  assert.ok(own.length > 0);
  const h = bossArena(ACT3, own);
  h.step();
  for (const key of own) {
    assert.ok(E3[key], `${key}: a 规程 enemy`);
    const e = put(h, key, [10, 7]);
    const data = E3[key].abilities.some((a) => a.format === 'SILENCE');
    const kit = !!(e.mem.ab && e.mem.ab.list.some((a) => a && (a.sil || a.silAware)));
    assert.equal(kit, data, key);
  }
});

test('量变之械: its first damage is doubled once (FirstAtkDouble.damage_scale); dealt while silenced, the bonus is gone', () => {
  const key = 'enemy_9028_acfncb', atk = E3[key].stats.atk, scale = E3[key].talents.bb['FirstAtkDouble.damage_scale'];
  assert.equal(scale, 2);
  const hits = (silenceFirst) => {
    const h = bossArena(ACT3, [key], { kind: 'normal', sharedBoss: null, units: [{ chessId: 't_wall', row: 9, col: 6 }] });
    h.step();
    const e = put(h, key, [9, 7], { move: true, tag: null });   // walks row 9 into t_wall
    if (silenceFirst) h.b.applyStatus(e, 'silence', { duration: 1e3, source: null });
    const w = h.unit('t_wall'), out = [];
    let last = 0;
    for (let n = 1; n <= 3; n++) {
      h.runUntil(() => e.stats.attacks >= n && w.stats.taken > last, 20);
      out.push(w.stats.taken - last); last = w.stats.taken;
      if (silenceFirst && n === 1) h.b.removeStatus(e, 'silence');
    }
    return out;
  };
  assert.deepEqual(hits(false), [atk * scale, atk, atk]);
  assert.deepEqual(hits(true), [atk, atk, atk]);
});

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：械 (boss_11 / boss_14) on its own field: stage act3autochess_m01, wave act3autochess_h07_08 (the boss on (3, 10),
// the 冲击之械 branch `acfnca` on row 4 at columns 8 / 12, parts' branches left_acfncb / right_acfncb)

const seasonJson = (f) => JSON.parse(readSeason(f));
const FNC_TPL = seasonJson('waves.json').act3autochess_h07_08;
const M01 = seasonJson('stages.json').act3autochess_m01;
const FNC = 'enemy_9029_acfnc', FNC2 = 'enemy_9029_acfnc_2', ARMOR = 'enemy_9027_acfnca', PART = 'enemy_9028_acfncb';

/** The 械 field with walls (ground tiles of m01: (4, 4), (5, 6), (5, 8)); the template reaches the kits through the opts only. */
function machineField(key, { hp = 1e7, walls = [['t_wall', 4, 4], ['t_wall2', 5, 6]] } = {}) {
  const h = bossArena(ACT3, [key, ARMOR, PART], {
    stage: M01, sharedBoss: { hp, maxHp: 1e7, damage(_pid, a) { this.hp = Math.max(0, this.hp - a); } },
    units: walls.map(([chessId, row, col]) => ({ chessId, row, col })),
    setup(b) { b.opts.waveTemplate = FNC_TPL; },
  });
  h.step();
  const boss = h.spawn(key, { pos: [3, 10], routeIndex: 0, tag: 'boss' });
  return { h, boss };
}
const alive = (h, key) => h.b.enemies.filter((o) => o.alive && o.defId === key);
const runFor = (h, s) => { const t = h.b.time; h.runUntil(() => h.b.time >= t + s - 1e-9, s + 1); };

test('假想敌：械: self-bound, every hit summons a 量变之械 by its target; 冲击之械 once at 50 % HP halve the damage from beyond them', () => {
  const half = E3[FNC].talents.bb['Armor.hp_ratio'], cut = E3[FNC].talents.bb['Armor.damage_scale'];
  assert.equal(half, 0.5); assert.equal(cut, 0.5);
  const { h, boss } = machineField(FNC);
  assert.ok(boss.s.flags.noMove && boss.s.flags.bind && boss.s.flags.unblockable, 'CommonAbilities/Unmovable: UNMOVABLE + BLOCK_FREE');
  const w = h.unit('t_wall');
  h.runUntil(() => boss.stats.attacks >= 1 && alive(h, PART).length > 0, 15);
  const hit = [w, h.unit('t_wall2')].find((u) => u.stats.taken > 0);
  assert.ok(hit, 'a wall was shot');
  const near = alive(h, PART).filter((p) => Math.abs(p.x - hit.x) <= 1.5 && Math.abs(p.y - hit.y) <= 1.5);
  assert.ok(near.length >= 1, 'a 量变之械 in the 3×3 of the operator hit (acfnc_t1)');
  runFor(h, 3);
  assert.equal(alive(h, ARMOR).length, 0, 'no 冲击之械 above half HP');

  // below half HP (acfnc_t2[summon], checked every 0.5 s): two 冲击之械 on the branch's tiles, once
  h.b.sharedBoss.hp = 0.4e7;
  runFor(h, 1);
  const armors = alive(h, ARMOR).sort((p, q) => p.x - q.x);
  assert.deepEqual(armors.map((o) => [o.y, o.x]), [[4, 8], [4, 12]]);
  assert.ok(armors.every((o) => o.s.flags.invulnerable && o.s.flags.untargetable), '未释放【威光冲击】时无法被攻击');
  runFor(h, 20);
  assert.equal(alive(h, ARMOR).length, 2, 'summoned once (acfnc[finish_t2]), never launched by boss_11');
  assert.ok(alive(h, ARMOR).every((o) => o.x === 8 || o.x === 12), 'they stay');

  // acfnc[armor-damage-scale]: an attacker beyond a 冲击之械 (column 4 < 8) × (1 − 0.5); in its column or between, full
  const pool = () => h.b.sharedBoss.hp;
  let p0 = pool(); h.b.dealDamage(w, boss, { amount: 1000, type: 'true' });
  const far = p0 - pool();
  p0 = pool(); h.b.dealDamage(h.unit('t_wall2'), boss, { amount: 1000, type: 'true' });   // column 6: still beyond 8
  const far2 = p0 - pool();
  assert.ok(Math.abs(far - 1000 * (1 - cut)) < 1e-6 && Math.abs(far2 - far) < 1e-6, `from beyond: ${far}, ${far2}`);
  const { h: h2, boss: b2 } = machineField(FNC, { hp: 0.4e7, walls: [['t_wall', 5, 8]] });
  runFor(h2, 1);
  assert.equal(alive(h2, ARMOR).length, 2);
  const q0 = h2.b.sharedBoss.hp; h2.b.dealDamage(h2.unit('t_wall'), b2, { amount: 1000, type: 'true' });
  assert.ok(Math.abs(q0 - h2.b.sharedBoss.hp - 1000) < 1e-6, 'the 冲击之械 column itself: full damage');
});

test('假想敌：械 隐秘核心: bouncing shot, 冲击之械 at once, launched at 10 s, falling past the last operator, a slowing laser, pushed back by damage', () => {
  const { h, boss } = machineField(FNC2);
  assert.equal(alive(h, ARMOR).length, 2, 'acfnc_t2[summon-immediately]');
  const w = h.unit('t_wall'), w2 = h.unit('t_wall2');
  // projectile_enemy_acfnc_2: `attack@hit_times` 2 hits, the second × 0.8 on the other operator (RANDOM; alone: the same)
  h.runUntil(() => w.stats.taken > 0 && w2.stats.taken > 0, 15);
  assert.ok(w.stats.taken > 0 && w2.stats.taken > 0, 'the shot bounced to the other operator');
  // LaunchArmor (cooldown 10, WithArmor mode only): both fly outward along row 4
  runFor(h, 10.5 - h.b.time);
  const [L, R] = alive(h, ARMOR).sort((p, q) => p.x - q.x);
  assert.equal(L.mem.fnc.state, 'fly'); assert.equal(R.mem.fnc.state, 'fly');
  assert.ok(L.x < 8 && R.x > 12, 'outward');
  h.runUntil(() => L.mem.fnc.state === 'down' && R.mem.fnc.state === 'down', 20);
  assert.ok(Math.abs(L.x - 4) < 1e-6, 'left: down on the column of the last operator ahead (t_wall on (4, 4); acfnca[no-char-executor])');
  assert.ok(Math.abs(R.x - 17) < 1e-6, 'right: nobody ahead, down at its route end (4, 17)');
  assert.ok(!L.s.flags.invulnerable && !L.s.flags.untargetable, 'hittable once down (acfnca[finish-invincible])');
  runFor(h, 0.5);
  // Bound: projectile_enemy_acfnca, a laser 2.9 wide between them — the operators on rows 3–5 between columns 4 and 17
  assert.equal(w.s.aspd, Math.max(20, 100 + E3[ARMOR].skills.find((s) => s.prefabKey === 'Bound').bb.attack_speed));
  assert.ok(w.findBuff('boss:acfncaArea') && w2.findBuff('boss:acfncaArea'));
  // SetTakeDamageMoveBackEnemyParam: every 500 damage 0.05 back toward the boss, at most 0.5 per second
  const x0 = L.x;
  h.b.dealDamage(w, L, { amount: 5000, type: 'true' });
  runFor(h, 0.5);
  assert.ok(Math.abs(L.x - x0 - 0.25) < 0.02, `capped at 0.5/s (${L.x})`);
  runFor(h, 1);
  assert.ok(Math.abs(L.x - x0 - 0.5) < 1e-6, `0.5 for 5000 damage (${L.x})`);
  // KillArmorAura: one reaching the boss → every 冲击之械 goes; 【衰颓与复兴】 (SP 45) brings two new ones
  L.x = boss.x - 1;
  runFor(h, 0.2);
  assert.equal(alive(h, ARMOR).length, 0, 'all destroyed');
  h.runUntil(() => alive(h, ARMOR).length === 2, 50);
  assert.deepEqual(alive(h, ARMOR).map((o) => [o.y, o.x]).sort((p, q) => p[1] - q[1]), [[4, 8], [4, 12]], 'SkSummonArmor');
  assert.ok(boss.mem.lpSp[0] < 1, 'its SP spent');
});

test('假想敌：械 【洪流攻势】: 量变之械 on every passable side of the operator with the highest block count', () => {
  // t_wall (block 3) on (4, 4): its sides (3, 4) and (5, 4) are ground, (4, 3) / (4, 5) are not; t_wall2 blocks 3 too but is listed later
  const { h, boss } = machineField(FNC, { walls: [['t_wall', 4, 4]] });
  const sk = E3[FNC].skills.find((s) => s.prefabKey === 'SommonSquad');
  assert.equal(sk.spCost, 25);
  h.runUntil(() => boss.mem.lpSp && boss.mem.lpSp[0] >= 24.9, 30);
  const before = alive(h, PART).length;
  runFor(h, 0.5);
  const fresh = alive(h, PART).slice(before).map((p) => [Math.round(p.y), Math.round(p.x)]).sort();
  assert.deepEqual(fresh, [[3, 4], [5, 4]]);
});

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：茧 (boss_12 / boss_15) and 淤困之茧, on the default boss field with one or two players (p1 the left half, the
// leader's own field — it stands on column 10 —, p2 the right one)

const SPIDER = 'enemy_9035_acspider', SPIDER2 = 'enemy_9035_acspider_2', WEB = 'enemy_9036_acweb';
const NET = (key) => E3[key].skills.find((s) => s.prefabKey === 'Net');

/** `left` / `right`: [row, col, hp] of walls on p1's / p2's half (absolute tiles). */
function spiderField(key, { left = [], right = [], hp = 1e7 } = {}) {
  const wall = (pid, list, base) => list.map(([row, col], i) => ({ uid: base + i, chessId: 't_wall', row, col, abs: true }));
  const h = bossArena(ACT3, [key, WEB], {
    sharedBoss: { hp, maxHp: 1e7, damage(_pid, a) { this.hp = Math.max(0, this.hp - a); } },
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: wall('p1', left, 1) },
      ...right.length ? [{ playerId: 'p2', seat: 1, side: 'R', colOffset: 8, units: wall('p2', right, 101) }] : [],
    ],
  });
  h.step();
  const set = (list, base) => list.map(([, , v], i) => { const u = h.b.allies().find((a) => a.uid === base + i); if (v) u.hp = v; return u; });
  const L = set(left, 1), R = set(right, 101);
  const boss = h.spawn(key, { pos: [3, 10], routeIndex: 0, tag: 'boss' });
  return { h, boss, L, R };
}

test('假想敌：茧: never walks; each shot volley takes the max_target highest-HP units of every field; 伪装 evade at each 25 % of HP lost', () => {
  const bb = E3[SPIDER].talents.bb;
  assert.equal(bb['Passive.attack@max_target'], 3); assert.equal(bb['Passive.attack@batch_max_target'], 6);
  const { h, boss, L, R } = spiderField(SPIDER, {
    left: [[2, 3, 1e6], [2, 5, 4e6], [4, 3, 3e6], [4, 5, 2e6]], right: [[2, 15, 1e6], [4, 15, 5e6]],
  });
  assert.ok(boss.s.flags.noMove && boss.s.flags.unblockable, 'acspider[passive]: UNMOVABLE_PRIVATE + BLOCK_FREE');
  const x0 = boss.x, y0 = boss.y;
  h.runUntil(() => boss.stats.attacks >= 1 && [...L, ...R].filter((u) => u.stats.taken > 0).length >= 5, 20);
  assert.deepEqual(L.map((u) => u.stats.taken > 0), [false, true, true, true], 'its own field: the 3 with the most HP');
  assert.deepEqual(R.map((u) => u.stats.taken > 0), [true, true], 'the other field: both (fewer than 3)');
  runFor(h, 5);
  assert.ok(boss.x === x0 && boss.y === y0, 'stays where it appeared');

  // acspider[evade-ticker]: HP under 75 % → 伪装 (Evade.duration s, Evade.prob of phys and arts dodged); not again above 50 %
  assert.equal(boss.findBuff('boss:acspiderEvade'), null);
  h.b.sharedBoss.hp = 0.7e7;
  runFor(h, 1.1);
  const ev = boss.findBuff('boss:acspiderEvade');
  assert.ok(ev, 'evading');
  assert.equal(boss.s.dodgePhys, bb['Evade.prob']); assert.equal(boss.s.dodgeArts, bb['Evade.prob']);
  runFor(h, bb['Evade.duration'] - 1);
  assert.ok(boss.findBuff('boss:acspiderEvade'), `${bb['Evade.duration']} s`);
  runFor(h, 1.5);
  assert.equal(boss.findBuff('boss:acspiderEvade'), null, 'over, and 70 % is above the next step (50 %)');
  h.b.sharedBoss.hp = 0.45e7;
  runFor(h, 1.1);
  assert.ok(boss.findBuff('boss:acspiderEvade'), 'the 50 % step');
});

test('淤困之茧: 【淤困捕食】 webs max_target random operators of every field on their tiles; bound: no attack, block or skill start; −4 % HP a second, 25 s; its operator gone, it goes', () => {
  const net = NET(SPIDER), wb = E3[WEB].talents.bb;
  assert.deepEqual([net.initCooldown, net.cooldown, net.bb.max_target, net.bb.batch_max_target], [15, 25, 2, 4]);
  const { h, L, R } = spiderField(SPIDER, { left: [[2, 3], [2, 5], [4, 3]], right: [[2, 15]] });
  h.runUntil(() => alive(h, WEB).length >= 3, 20);
  assert.ok(h.b.time >= net.initCooldown - 1e-6, `not before its first cooldown (${h.b.time})`);
  runFor(h, 0.5);
  const webs = alive(h, WEB);
  assert.equal(webs.length, 3, 'two on its own field, the one operator of the other');
  const bound = [...L, ...R].filter((u) => webs.some((w) => w.x === u.tileC && w.y === u.tileR));
  assert.equal(bound.length, 3, 'each on an operator\'s own tile');
  assert.ok(R[0] === bound.find((u) => R.includes(u)), 'the other field\'s operator');
  for (const u of bound) assert.ok(u.s.flags.disarm && u.s.flags.noBlock && u.s.flags.skillLock, 'acweb[bundling]: FORCE_DISARMED + BLOCK_FREE + SKILL_NOT_ACTIVATABLE');
  const free = L.find((u) => !bound.includes(u));
  assert.ok(free && !free.s.flags.disarm && !free.s.flags.skillLock, 'the operator without a web');
  assert.ok(webs.every((w) => w.s.taunt === wb['Bundling.taunt_level']), 'taunt level 1: 更容易受到攻击');
  // acweb[bleeding]: −hp_ratio of its max HP every 1 s
  const w0 = webs[0], hp0 = w0.hp;
  runFor(h, 3);
  assert.ok(Math.abs(hp0 - w0.hp - 3 * wb['Bundling.hp_ratio'] * w0.s.maxHp) < 1e-6, `${hp0} → ${w0.hp}`);
  // ON_OWNER_FINISH: the operator dies → its web dies
  const victim = bound.find((u) => R.includes(u)), vw = webs.find((w) => w.x === victim.tileC && w.y === victim.tileR);
  h.b.kill(victim, null);
  h.step();
  assert.ok(!vw.alive, 'the web of a dead operator');
  // the web dies (acweb[existing], 25 s) → the operators are free again
  const other = webs.filter((w) => w !== vw);
  h.runUntil(() => other.every((w) => !w.alive), wb['Bundling.duration'] + 1);
  h.step();
  // (the next 【淤困捕食】 lands about then: an operator keeps one binding per live web on its tile)
  for (const u of bound.filter((x) => x !== victim)) {
    const live = alive(h, WEB).filter((w) => w.x === u.tileC && w.y === u.tileR).length;
    assert.equal(u.buffs.filter((x) => x.key === 'boss:acweb').length, live, 'released by the dead web');
    assert.equal(!!u.s.flags.skillLock, live > 0);
  }
});

test('淤困之茧: a bound operator starts no skill (SKILL_NOT_ACTIVATABLE) and makes no attack, while its SP still charges', () => {
  const guard = chessRec({ id: 't_guard', profession: 'WARRIOR', stats: { atk: 300, blockCnt: 2 }, skill: { spCost: 5, initSp: 0, duration: 3, bb: { atk: 0.5 } } });
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, kind: 'normal',
    defs: { chess: { t_guard: guard }, enemies: { [WEB]: E3[WEB], enemy_dummy: { ...E3[WEB], key: 'enemy_dummy', talents: { bb: {}, bbStr: {} }, stats: { ...E3[WEB].stats, maxHp: 1e7 } } } },
    units: [{ chessId: 't_guard', row: 9, col: 5 }], enemies: [],
  });
  h.step();
  const u = h.unit('t_guard');
  const dummy = h.spawn('enemy_dummy', { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 } });
  const web = h.spawn(WEB, { pos: [9, 5], routeIndex: 0 });
  h.step();
  assert.ok(u.s.flags.skillLock && u.s.flags.disarm && u.s.flags.noBlock, 'bound');
  const atk0 = u.stats.attacks;
  h.run(8);
  assert.equal(u.skill.ready, true, 'SP charged');
  assert.equal(u.skill.activations, 0, 'no skill start while bound');
  assert.equal(u.stats.attacks, atk0, 'no attack while bound');
  h.b.kill(web, null);
  h.run(2);
  assert.ok(!u.s.flags.skillLock, 'released');
  assert.equal(u.skill.activations, 1, 'casts once free');
  assert.ok(dummy.alive);
});

test('假想敌：茧 隐秘核心: 4 per field and poison on hit; 【悲惨之雨】 on its own field, then the other one: ASPD −50 and 真实 every 0.5 s there only', () => {
  const bb = E3[SPIDER2].talents.bb, rain = E3[SPIDER2].skills.find((s) => s.prefabKey === 'AcidRain');
  assert.deepEqual([rain.initCooldown, rain.cooldown, rain.bb.duration, rain.bb.damage, rain.bb.attack_speed, rain.bb.interval], [25, 30, 25, 75, -50, 0.5]);
  const { h, boss, L, R } = spiderField(SPIDER2, { left: [[2, 3], [2, 5], [4, 3], [4, 5], [3, 3]], right: [[2, 15]] });
  h.runUntil(() => boss.stats.attacks >= 1 && [...L, ...R].filter((u) => u.stats.taken > 0).length >= 5, 20);
  assert.equal(L.filter((u) => u.stats.taken > 0).length, bb['Passive.attack@max_target'], '4 of its own field');
  const p = R[0].findBuff('boss:acspiderPoison');
  assert.ok(p, 'acspider[poison]');
  const t0 = R[0].stats.taken;
  runFor(h, 1.05);
  assert.ok(R[0].stats.taken - t0 >= bb['Poison.attack@damage'] - 1e-6, 'the poison ticks');
  // 【悲惨之雨】 (Left: its own field) at 25 s
  runFor(h, rain.initCooldown + 0.6 - h.b.time);
  assert.ok(L.every((u) => u.findBuff('boss:acspiderRain')) && !R[0].findBuff('boss:acspiderRain'), 'p1\'s field');
  assert.equal(L[4].s.aspd, Math.max(20, 100 + rain.bb.attack_speed));
  const lt = L[4].stats.taken;
  runFor(h, 1);
  assert.ok(L[4].stats.taken - lt >= 2 * rain.bb.damage - 1e-6, '75 真实 every 0.5 s');
  runFor(h, rain.bb.duration);
  assert.ok(L.every((u) => !u.findBuff('boss:acspiderRain')), `over after ${rain.bb.duration} s`);
  // the next cast (cooldown 30 from the first): Right, the other field
  h.runUntil(() => R[0].findBuff('boss:acspiderRain'), rain.cooldown);
  assert.ok(L.every((u) => !u.findBuff('boss:acspiderRain')), 'only p2\'s field');
});

// ---------------------------------------------------------------------------------------------------------------
// 假想敌：鳍 (boss_13 / boss_16): walking row 9 of the normal test field into t_wall on (9, 6)

const EEL = 'enemy_9037_aceel', EEL2 = 'enemy_9037_aceel_2';
const eelSk = (key, name) => E3[key].skills.find((s) => s.prefabKey === name);

function eelField(key, units = [{ chessId: 't_wall', row: 9, col: 6 }]) {
  const h = bossArena(ACT3, [key], { kind: 'normal', sharedBoss: null, units });
  h.step();
  const hits = [];
  h.b.on('damaged', (c) => { if (c.source && c.source.defId === key && c.dmg.type !== 'element') hits.push({ t: c.target, n: c.amount, tags: c.dmg.tags || [], at: h.b.time }); });
  const neural = [];
  h.b.on('damaged', (c) => { if (c.source && c.source.defId === key && c.dmg.type === 'element') neural.push(c.target); });
  return { h, hits, neural };
}

test('假想敌：鳍: shielded while unblocked (×(1 − damage_resistance) on phys and arts); blocked, the shield turns into one ×damage_scale attack; neural on every hit', () => {
  const sg = eelSk(EEL, 'ShieldGen'), atk = E3[EEL].stats.atk, ep = E3[EEL].talents.bb['Passive.attack@ep_damage_ratio'];
  assert.deepEqual([sg.bb.damage_resistance, sg.bb.damage_scale, ep], [0.4, 1.5, 0.4]);
  const { h, hits, neural } = eelField(EEL);
  const e = put(h, EEL, [9, 9], { move: true, tag: null });
  runFor(h, 0.2);
  assert.ok(e.findBuff('boss:aceelShield') && !e.blockedBy, 'aceel[shield] while walking');
  const w = h.unit('t_wall');
  const hp0 = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp0 - e.hp - 1000 * (1 - E3[EEL].stats.res / 100) * (1 - sg.bb.damage_resistance)) < 1e-6, `arts × 0.6 (${hp0 - e.hp})`);
  const hp1 = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'true' });
  assert.ok(Math.abs(hp1 - e.hp - 1000) < 1e-6, 'true damage untouched');
  h.runUntil(() => e.blockedBy === w, 20);
  h.step();
  assert.ok(!e.findBuff('boss:aceelShield'), 'blocked: the shield gone');
  const hp2 = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp2 - e.hp - 700) < 1e-6, 'no shield while blocked');
  h.runUntil(() => hits.length >= 2, 20);
  assert.deepEqual(hits.slice(0, 2).map((x) => Math.round(x.n)), [atk * sg.bb.damage_scale, atk], 'the first blocked attack × 1.5, then plain');
  assert.ok(!e.findBuff('boss:aceelPower'));
  assert.ok(neural.length >= 2 && neural.every((t) => t === w), '神经损伤 with each');
  assert.ok(w.elem.neural > 0);
  // the blocker gone: the shield comes back
  h.b.kill(w, null);
  runFor(h, 0.3);
  assert.ok(e.findBuff('boss:aceelShield'), 'unblocked again: ShieldGen');
});

test('假想敌：鳍 【离子环波】: at its cooldown, arts ATK × atk_scale and neural on every ground unit within range_radius', () => {
  const dis = eelSk(EEL, 'Discharge');
  assert.deepEqual([dis.initCooldown, dis.cooldown, dis.bb.range_radius, dis.bb.atk_scale], [24, 24, 1.5, 1.25]);
  const { h, hits } = eelField(EEL, [{ chessId: 't_wall', row: 9, col: 6 }, { chessId: 't_wall2', row: 10, col: 6 }, { chessId: 't_wall2', row: 11, col: 7, uid: 9 }]);
  const e = put(h, EEL, [9, 7], { tag: null });
  h.runUntil(() => hits.some((x) => x.tags.includes('aceelDischarge')), 30);
  const ds = hits.filter((x) => x.tags.includes('aceelDischarge'));
  assert.ok(Math.abs(ds[0].at - dis.initCooldown) < 0.5, `at ${ds[0].at}`);
  const near = new Set(ds.map((x) => x.t));
  assert.ok(near.has(h.unit('t_wall')) && near.size === 2 && ![...near].some((u) => u.tileR === 11), 'the two within 1.5 (beside it, diagonal), not the one two rows away');
  assert.ok(Math.abs(ds.find((x) => x.t === h.unit('t_wall')).n - E3[EEL].stats.atk * dis.bb.atk_scale) < 1e-6);
  assert.ok(e.alive);
});

test('假想敌：鳍 隐秘核心: each attack stacks its target (× 1 + 0.2 per stack, at most 5) and jumps to 2 + 1 per stack more within 1.5, × 0.75 each jump', () => {
  const bb = E3[EEL2].talents.bb, atk = E3[EEL2].stats.atk;
  assert.deepEqual([bb['Charge.atk'], bb['Charge.max_stack_cnt'], bb['Charge.attack@chain.max_target'], bb['Charge.attack@chain.atk_scale'], bb['Passive.attack@projectile_range']], [0.2, 5, 2, 0.75, 1.5]);
  const units = [[9, 6], [10, 6], [10, 5], [11, 5], [11, 4], [12, 4], [12, 3]].map(([row, col], i) => ({ chessId: i ? 't_wall2' : 't_wall', row, col, uid: i + 1 }));
  const { h, hits } = eelField(EEL2, units);
  const e = put(h, EEL2, [9, 9], { move: true, tag: null });
  h.b.on('tick', () => { for (const u of h.b.allies()) u.elem.neural = 0; });   // no 神经损伤 burst (its stun would end the block)
  const isMain = (x) => !x.tags.length;
  h.runUntil(() => hits.filter(isMain).length >= 3, 30);
  const w = h.unit('t_wall');
  const mains = hits.filter(isMain);
  const pScale = eelSk(EEL2, 'ShieldGen').bb.damage_scale;
  // it walked in shielded: the first blocked attack is the power attack (× 1.75), no stack yet
  const first = mains[0].n / atk;
  assert.ok(Math.abs(first - pScale) < 1e-6, `first × ${first}`);
  assert.ok(Math.abs(mains[1].n - atk * (1 + bb['Charge.atk'])) < 1e-6, `second × 1.2 (${mains[1].n / atk})`);
  assert.ok(Math.abs(mains[2].n - atk * (1 + 2 * bb['Charge.atk'])) < 1e-6, 'third × 1.4');
  // jumps after the first hit: 2 + 1 (one stack), each × 0.75 more, scaled by the main target's stacks
  const firstAt = mains[0].at, jumps1 = hits.filter((x) => x.tags.includes('aceelChain') && Math.abs(x.at - firstAt) < 1e-6);
  assert.equal(jumps1.length, 3, 'three jumps (2 + 1 per stack)');
  const s1 = 1 + bb['Charge.atk'];
  const f = first;   // the power scale rides on the jumps of that attack
  assert.deepEqual(jumps1.map((x) => Math.round(x.n)), [0.75, 0.5625, 0.421875].map((k) => Math.round(atk * k * s1 * f)));
  assert.ok(!jumps1.some((x) => x.t === w), 'never back on the main target');
  h.runUntil(() => hits.filter(isMain).length >= 8, 60);
  const last = hits.filter(isMain).at(-1);
  assert.ok(Math.abs(last.n - atk * (1 + bb['Charge.max_stack_cnt'] * bb['Charge.atk'])) < 1e-6, 'capped at 5 stacks (× 2)');
  assert.ok(e.alive);
});

test('假想敌：鳍 隐秘核心 雷暴: every 10 s a thunderbolt on the operator of its field with the most units in its 3×3', () => {
  const bb = E3[EEL2].talents.bb;
  const units = [[9, 1], [10, 1], [11, 1], [12, 8]].map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 }));
  const { h, hits } = eelField(EEL2, units);
  const e = put(h, EEL2, [9, 10], { tag: null });
  h.runUntil(() => hits.some((x) => x.tags.includes('aceelThunder')), 12);
  const th = hits.filter((x) => x.tags.includes('aceelThunder'));
  assert.equal(th.length, 1);
  assert.ok(Math.abs(th[0].at - 10) < 0.1, `at ${th[0].at}`);
  const t = th[0].t;
  assert.deepEqual([t.tileR, t.tileC], [10, 1], 'three units in its 3×3');
  assert.ok(Math.abs(th[0].n - E3[EEL2].stats.atk * bb['Weather.atk_scale']) < 1e-6, 'arts, RES 0');
  runFor(h, 10);
  assert.equal(hits.filter((x) => x.tags.includes('aceelThunder')).length, 2, 'every 10 s');
  assert.ok(e.alive);
});

const JU = 'enemy_2124_dyjsfg';

/** 矩兽 walking row 9 to its blocker t_wall at (9, 6); `units` replace that layout. */
function juField(units = [{ chessId: 't_wall', row: 9, col: 6 }], keys = []) {
  const h = bossArena(ACT3, [JU, ...keys], { kind: 'normal', sharedBoss: null, units });
  h.step();
  const hits = [];
  h.b.on('damaged', (c) => { const tags = c.dmg.tags || []; if (tags.some((t) => /^dyjsfg/.test(t))) hits.push({ t: c.target, n: c.amount, tags, at: h.b.time }); });
  return { h, hits };
}

test('矩兽: no attack damage; 【尚同】 ATK × 1 within 1.6 every 2.5 s, and on each block a strike on the blocker and ATK × 2 there 0.5 s later; 【明力】 × (1 − 0.9) walking, × (1 − 0.35) standing, 抵抗 0.8; block volume 3', () => {
  const bb = E3[JU].talents.bb, atk = E3[JU].stats.atk, res = E3[JU].stats.res;
  const crush = E3[JU].skills.find((s) => s.prefabKey === 'CombatAoe');
  assert.deepEqual([bb['Trample.interval'], bb['Trample.range_radius'], bb['Trample.atk_scale'], crush.bb.combat_atk_scale, crush.bb.range_radius], [2.5, 1.6, 1, 2, 1.6]);
  assert.deepEqual([bb['Huge.enemy_dyjsfg_high_damage_resistance.damage_resistance'], bb['Huge.enemy_dyjsfg_low_damage_resistance.damage_resistance'], bb['Huge.one_minus_status_resistance']], [0.9, 0.35, -0.8]);
  const { h, hits } = juField([{ chessId: 't_wall', row: 9, col: 6 }, { chessId: 't_wall2', row: 10, col: 6 }, { chessId: 't_wall2', row: 12, col: 6, uid: 9 }]);
  const e = put(h, JU, [9, 7.9], { move: true, tag: null });
  assert.equal(e.blockWeight, 3, 'the prefab\'s _blockVolume');
  const w = h.unit('t_wall');
  runFor(h, 0.15);
  assert.ok(!e.blockedBy && e.moving);
  let hp = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp - e.hp - 1000 * (1 - res / 100) * 0.1) < 1e-6, `walking: × 0.1 (${hp - e.hp})`);
  h.runUntil(() => e.blockedBy === w, 20);
  const blockedAt = h.b.time;
  runFor(h, 0.15);
  hp = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp - e.hp - 1000 * (1 - res / 100) * 0.65) < 1e-6, `standing: × 0.65 (${hp - e.hp})`);
  hp = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'true' });
  assert.ok(Math.abs(hp - e.hp - 1000) < 1e-6, 'true damage untouched');
  h.runUntil(() => hits.some((x) => x.tags.includes('dyjsfgCrush')), 5);
  const cr = hits.filter((x) => x.tags.includes('dyjsfgCrush'));
  assert.ok(Math.abs(cr[0].at - blockedAt - 0.5) < 0.05, `0.5 s after the block (${cr[0].at - blockedAt})`);
  assert.deepEqual(new Set(cr.map((x) => x.t)), new Set([w, h.unit('t_wall2')]), 'the two within 1.6, not the one three rows away');
  assert.ok(Math.abs(cr.find((x) => x.t === w).n - atk * 2) < 1e-6);
  const st = hits.filter((x) => x.tags.includes('dyjsfgStrike'));
  assert.ok(st.length === 1 && st[0].t === w && Math.abs(st[0].n - atk) < 1e-6 && Math.abs(cr[0].at - st[0].at - 0.5) < 1e-6, 'the skill\'s MeleeAttack on the blocker, ATK × 1, 0.5 s before the crush');
  runFor(h, 12);
  assert.equal(new Set(hits.filter((x) => x.tags.includes('dyjsfgCrush')).map((x) => x.at)).size, 1, 'once per block');
  const tr = hits.filter((x) => x.tags.includes('dyjsfgTrample') && x.t === w);
  assert.ok(tr.length >= 4, `${tr.length} tramples`);
  for (let k = 1; k < tr.length; k++) assert.ok(Math.abs(tr[k].at - tr[k - 1].at - 2.5) < 0.05, 'every 2.5 s');
  assert.ok(Math.abs(tr[0].n - atk) < 1e-6);
  assert.ok(!hits.some((x) => x.t === h.unit(9)), 'out of range');
  assert.equal(w.stats.taken, hits.filter((x) => x.t === w).reduce((s, x) => s + x.n, 0), 'nothing but its talents: Combat is an EmptyAnimatedAbility');
  // 抵抗 0.8: a 5 s stun lasts 1 s
  h.b.applyStatus(e, 'stun', { duration: 5, source: w });
  assert.ok(e.s.flags.stun);
  runFor(h, 1.05);
  assert.ok(!e.s.flags.stun, 'stun × 0.2');
});

test('矩兽 【非命】 at half HP: ATK +50 %, speed × 2, block volume 4 from its next block on; 【兼爱】 0.75 s after it falls: the other enemies out, every unit 2 × ATK phys', () => {
  const bb = E3[JU].talents.bb, atk = E3[JU].stats.atk;
  assert.deepEqual([bb['Overload.atk'], bb['Overload.move_speed'], bb['Overload.block_volume'], bb['OutOfControll.atk_scale']], [0.5, 2, 1, 2]);
  const other = 'enemy_1422_lrsldr';
  const { h, hits } = juField([{ chessId: 't_wall', row: 9, col: 6 }, { chessId: 't_wall', row: 9, col: 3, uid: 5 }, { chessId: 't_wall2', row: 12, col: 0, uid: 9 }], [other]);
  const e = put(h, JU, [9, 7.9], { move: true, tag: null });
  const w = h.unit('t_wall');
  h.runUntil(() => e.blockedBy === w, 20);
  const speed0 = e.s.moveSpeed;
  h.b.loseHp(e, e.s.maxHp * 0.51, { sourceless: true });
  runFor(h, 0.2);
  assert.ok(Math.abs(e.s.atk - atk * 1.5) < 1e-6 && Math.abs(e.s.moveSpeed - speed0 * 2) < 1e-6, 'ATK +50 %, speed × 2');
  assert.ok(e.blockedBy === w && e.blockWeight === 3, 'its blocker keeps it: the volume it counted');
  h.b.kill(w, null);
  runFor(h, 0.2);
  assert.equal(e.blockWeight, 4);
  h.runUntil(() => e.x < 2.6 || !e.alive || e.blockedBy, 30);
  assert.ok(!e.blockedBy && e.x < 2.6, 'a block-3 unit can block it no more');
  const o = put(h, other, [11, 9], { tag: null });
  const before = hits.length;
  h.b.kill(e, h.unit(5));
  const fellAt = h.b.time;
  runFor(h, 0.7);
  assert.ok(o.alive && hits.length === before, 'nothing before 0.75 s');
  runFor(h, 0.1);
  assert.ok(!o.alive, 'the other enemies leave');
  const last = hits.filter((x) => x.tags.includes('dyjsfgLast'));
  assert.ok(Math.abs(last[0].at - fellAt - 0.75) < 0.05);
  assert.deepEqual(new Set(last.map((x) => x.t)), new Set([h.unit(5), h.unit(9)]), 'every unit on the field');
  assert.ok(Math.abs(last.find((x) => x.t === h.unit(5)).n - atk * 1.5 * 2) < 1e-6, 'its ATK as it fell (overloaded) × 2');
});

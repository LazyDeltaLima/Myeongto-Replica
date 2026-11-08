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

// the leader fields: the new leaders (假想敌：械 / 茧 / 鳍, 矩兽), their parts and the units of their waves
const LEADER_FIELD = [
  'enemy_10196_ubba_2', 'enemy_1424_lrboom', 'enemy_1435_dsflys', 'enemy_2124_dyjsfg', 'enemy_9024_acsgnt',
  'enemy_9035_acspider',
  'enemy_9035_acspider_2', 'enemy_9036_acweb', 'enemy_9037_aceel', 'enemy_9037_aceel_2', 'enemy_9040_accrit',
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

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
import { TICK } from '../server/sim/constants.js';

const quiet = { warn() {}, error() {}, info() {} };
const ACT3 = getData({ log: quiet, season: 'act3autochess' });
const BASE = getData({ log: quiet });
const E3 = ACT3.enemies, E0 = BASE.enemies;

// ---------------------------------------------------------------------------------------------------------------
// coverage: every enemy a 规程 match can spawn is authored (enemies.js KITS / bosses.js BOSS_KITS) or stats-only with a
// reason, as in the default season — or still on one of these lists, which only shrink (a key that gains a kit must leave
// its list). Reachable = the keys named by the season's waves, leaders, enemy effects / choices / strategies, its
// 特训敌人 entries and the escorts each entry brings (factions.json entries[*].N / E …), and every enemy those name.

// the leader fields: the units of the leaders' waves (“不眠雪山”, the waves' `acsgnt` branch, is 谢拉格's bond summon now)
const LEADER_FIELD = [];
// 特训敌人 entries of 规程 (its new types CRITIC 精锐 / REBORN 重生 among them) and their escorts and offspring
const SPECIAL_TYPE = [
  'enemy_10163_mnctur_2', 'enemy_1064_snsbr', 'enemy_1067_snslime_2',
  'enemy_1213_mtrsnp', 'enemy_1216_cansld', 'enemy_1219_mtrbty', 'enemy_1309_mhboar_2', 'enemy_1363_spnshd_2',
  'enemy_1373_ltnhor', 'enemy_1373_ltnhor_2', 'enemy_1375_ltnclr', 'enemy_1375_ltnclr_2', 'enemy_1376_ltndru',
  'enemy_1376_ltndru_2', 'enemy_1385_winbom', 'enemy_1385_winbom_2', 'enemy_1388_wingnt', 'enemy_1388_wingnt_2',
  'enemy_1428_lrsoul', 'enemy_1429_lrwzrd', 'enemy_1429_lrwzrd_2', 'enemy_1431_lrmzrd', 'enemy_1431_lrmzrd_2',
  'enemy_9031_acrefd', 'enemy_9034_acblk', 'enemy_9039_acrefm',
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

test('规程 new enemies: the client\'s shots and skill casts (EN, the CN client for those EN lacks), clip lengths from their models', () => {
  // tools/local-extract/attack_timing.py / enemy_projectiles.py --season-new: 假想敌：茧 shoots projectile_enemy_acspider
  // (TRACE 10), its 【淤困捕食】 Net plays Skill_1 to its clip (_timeMode 1); 假想敌：械 隐秘核心's three skills have the attack
  // and combat families and restart its attack (resetMain); 矩兽's CombatAoe has the COMBAT family only
  assert.deepEqual(E3.enemy_9035_acspider.proj, { key: 'projectile_enemy_acspider', mount: 'MUZZLE', life: 10, move: 'TRACE_TARGET_WITH_SPEED', speed: 10 });
  assert.deepEqual(Object.keys(E3.enemy_9029_acfnc_2.skillCast).sort(), ['launcharmor', 'sksummonarmor', 'sommonsquad']);
  for (const c of Object.values(E3.enemy_9029_acfnc_2.skillCast)) assert.ok(c.family === 3 && c.resetMain === 1, JSON.stringify(c));
  assert.equal(E3.enemy_2124_dyjsfg.skillCast.combataoe.family, 2);
  // the clip lengths and OnAttack frames come from the models in data/assets.json — the web `spine` or, for the 17 only the
  // local client has, `spineLocal` (tools/build-data.mjs enemySpine): 假想敌：茧's Net plays Skill_1 (2.1 s), 矩兽's CombatAoe
  // strikes at its Attack clip's OnAttack frame
  assert.deepEqual(E3.enemy_9035_acspider.skillCast.net, { family: 3, clip: 'Skill_1', dur: 2.1, hit: 1.033, max: 1, time: 1 });
  assert.deepEqual(E3.enemy_2124_dyjsfg.skillCast.combataoe, { family: 2, clip: 'Attack', dur: 1.5, hit: 0.6, max: 1, time: 1 });
  assert.equal(E3.enemy_9035_acspider.attackAnim.dur, 1.9);
  const fresh = Object.keys(E3).filter((k) => !E0[k]);
  assert.ok(fresh.filter((k) => E3[k].skillCast).length >= 35);
  // every new enemy that attacks has its clip; the three without one deal no attack (applyWay NONE: 冲击之械, 淤困之茧 — no
  // model —, “模拟宝藏”)
  assert.deepEqual(fresh.filter((k) => !E3[k].attackAnim).sort(), ['enemy_9027_acfnca', 'enemy_9036_acweb', 'enemy_9038_achest']);
  for (const k of fresh.filter((k) => !E3[k].attackAnim)) assert.equal(E3[k].applyWay, 'NONE', k);
  // a clip still named but missing: 假想敌：械's SommonSquad names `Skill_1`, which its animator's `_animations` table maps to
  // A_Skill_1 / B_Skill_1 (not read yet)
  const miss = fresh.filter((k) => Object.values(E3[k].skillCast || {}).some((c) => c.miss)).sort();
  assert.deepEqual(miss, ['enemy_9029_acfnc', 'enemy_9029_acfnc_2']);
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
/** `f(ability)` as enemy `e` starts a skill's cast (the fx 'enemySkill' content/enemies.js makes). */
const onSkill = (h, e, f) => { const fx = h.b.fx.bind(h.b); h.b.fx = (kind, p) => { if (kind === 'enemySkill' && p?.id === e.id) f(p.ability); return fx(kind, p); }; };

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
  const casts = [], shots = [];
  onSkill(h, boss, (ability) => casts.push([ability, Math.round(h.b.time)]));
  h.b.on('hit', ({ source, target }) => { if (source === boss) shots.push(target); });
  // LaunchArmor (cooldown 10, WithArmor mode only): both fly outward along row 4
  runFor(h, 10.5 - h.b.time);
  // the skills take the attack slots (skillCast, 「적 스킬 = 일반 공격 차례」): 【洪流攻势】 (cooldown 45, ready at once) at
  // the first one, LaunchArmor at the one at 10 s, each restarting the attack's cooldown (resetMain) — no shot yet
  assert.deepEqual(casts, [['SommonSquad', 0], ['LaunchArmor', 10]]);
  assert.equal(boss.stats.attacks, 0);
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
  // projectile_enemy_acfnc_2: `attack@hit_times` 2 hits, the second × 0.8 on the other operator (RANDOM; alone: the same)
  assert.ok(boss.stats.attacks >= 1 && shots.includes(w) && shots.includes(w2), 'the shot bounced to the other operator');
});

test('假想敌：械 【洪流攻势】: 量变之械 on every passable side of the operator with the highest block count', () => {
  // t_wall (block 3) on (4, 4): its sides (3, 4) and (5, 4) are ground, (4, 3) / (4, 5) are not; t_wall2 blocks 3 too but is listed later
  const { h, boss } = machineField(FNC, { walls: [['t_wall', 4, 4]] });
  const sk = E3[FNC].skills.find((s) => s.prefabKey === 'SommonSquad');
  assert.equal(sk.spCost, 25);
  let cast = null;
  onSkill(h, boss, (ability) => { if (ability === 'SommonSquad') cast ??= h.b.time; });
  h.runUntil(() => boss.mem.lpSp && boss.mem.lpSp[0] >= 24.9, 30);
  const full = h.b.time, before = alive(h, PART).length;
  // cast at the next attack slot once the SP is full (the slots every `bat` 10 s from the first at once), in place of a shot
  h.runUntil(() => cast != null, 12);
  const slot = (t) => (t - TICK + 1e-6) % E3[FNC].stats.bat;
  assert.ok(cast >= full && slot(cast) < 0.05, `at an attack slot (${cast})`);
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
  // the forced CombatAoe plays its Attack clip (1.5 s) and strikes at its OnAttack frame, 0.6 s; the crush 0.5 s after that
  const hit = E3[JU].skillCast.combataoe.hit;
  assert.equal(hit, 0.6);
  assert.ok(Math.abs(cr[0].at - blockedAt - hit - 0.5) < 0.05, `0.6 + 0.5 s after the block (${cr[0].at - blockedAt})`);
  assert.deepEqual(new Set(cr.map((x) => x.t)), new Set([w, h.unit('t_wall2')]), 'the two within 1.6, not the one three rows away');
  assert.ok(Math.abs(cr.find((x) => x.t === w).n - atk * 2) < 1e-6);
  const st = hits.filter((x) => x.tags.includes('dyjsfgStrike'));
  assert.ok(st.length === 1 && st[0].t === w && Math.abs(st[0].n - atk) < 1e-6 && Math.abs(cr[0].at - st[0].at - 0.5) < 1e-6 && Math.abs(st[0].at - blockedAt - hit) < 0.05, 'the skill\'s MeleeAttack on the blocker, ATK × 1, at the clip\'s attack frame, 0.5 s before the crush');
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

test('矩兽 【尚同】 block strike: a stun before the clip\'s attack frame, or its blocker gone, cuts the cast — no strike, no crush', () => {
  for (const cut of ['stun', 'gone']) {
    const { h, hits } = juField([{ chessId: 't_wall', row: 9, col: 6 }]);
    const e = put(h, JU, [9, 7.9], { move: true, tag: null });
    const w = h.unit('t_wall');
    h.runUntil(() => e.blockedBy === w, 20);
    runFor(h, 0.3);   // before the 0.6 s frame
    if (cut === 'stun') h.b.applyStatus(e, 'stun', { duration: 5, source: w });
    else h.b.kill(w, null);
    runFor(h, 2);
    assert.equal(hits.filter((x) => x.tags.includes('dyjsfgStrike') || x.tags.includes('dyjsfgCrush')).length, 0, cut);
  }
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

/** A field of the given 规程 enemies; `hits` = every damage they deal (element apart). */
function waveField(keys, units) {
  const h = bossArena(ACT3, keys, { kind: 'normal', sharedBoss: null, units });
  h.step();
  const hits = [];
  h.b.on('damaged', (c) => { if (c.source && keys.includes(c.source.defId) && c.dmg.type !== 'element') hits.push({ t: c.target, n: c.amount, src: c.source, at: h.b.time }); });
  return { h, hits };
}

test('纤核漂游者: a unit on a high tile first (HATRED_DES_HIGHLAND_FIRST), neural damage ATK × 0.15 on every hit, 失衡免疫', () => {
  const key = 'enemy_1435_dsflys';
  assert.equal(E3[key].talents.bb['0.attack@ep_damage_ratio'], 0.15);
  // the high-tile unit deployed first: by 仇恨值 alone the later, low one would be shot
  const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 11, col: 2, uid: 1 }, { chessId: 't_wall', row: 11, col: 4, uid: 2 }]);
  assert.equal(h.b.grid.tile(11, 2).height, 'HIGH');
  const e = put(h, key, [11, 3.4], { tag: null });
  assert.ok(e.s.flags.noDisplace, 'dsflys_immune: UNBALANCE_IMMUNE');
  h.runUntil(() => hits.length >= 3, 30);
  assert.ok(hits.slice(0, 3).every((x) => x.t === h.unit(1)), 'the high-tile unit');
  assert.ok(h.unit(1).elem.neural > 0 && !(h.unit(2).elem.neural > 0), 'neural with each hit');
});

test('恶尘源石虫: knocked out, ATK × 3.5 physical on the ground units within 1.3 (projectile_lrboom); silenced, none', () => {
  const key = 'enemy_1424_lrboom';
  assert.equal(E3[key].talents.bb['Boom.atk_scale'], 3.5);
  const run = (silence) => {
    const { h } = waveField([key], [{ chessId: 't_wall', row: 11, col: 6, uid: 1 }, { chessId: 't_wall', row: 11, col: 8, uid: 2 }]);
    const e = put(h, key, [11, 4.8], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: h.unit(1) });
    h.step();
    const t0 = [h.unit(1).stats.taken, h.unit(2).stats.taken];
    h.b.kill(e, h.unit(1));
    h.step();
    return [h.unit(1).stats.taken - t0[0], h.unit(2).stats.taken - t0[1]];
  };
  const [near, far] = run(false);
  assert.ok(Math.abs(near - E3[key].stats.atk * 3.5) < 1e-6 && far === 0, `1.2 away hit (${near}), 3.2 away not (${far})`);
  assert.deepEqual(run(true), [0, 0], 'the SILENCE line');
});

test('搏命享受者: the other enemies within 1.7 take physical and arts damage × 0.75, one buff per 搏命享受者 (two multiply)', () => {
  const key = 'enemy_10196_ubba_2', other = 'enemy_1424_lrboom';
  const dr = E3[key].talents.bb['Talent1.damage_resistance'];
  assert.equal(dr, 0.25);
  const { h } = waveField([key, other], [{ chessId: 't_wall', row: 12, col: 4 }]);
  const near = put(h, other, [10, 9], { tag: null }), far = put(h, other, [10, 14], { tag: null });
  const u1 = put(h, key, [10, 8], { tag: null });
  runFor(h, 0.5);
  const w = h.unit('t_wall'), res = E3[other].stats.res;
  const hit = (e) => { const hp = e.hp; h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false }); return hp - e.hp; };
  assert.ok(Math.abs(hit(near) - 1000 * (1 - res / 100) * (1 - dr)) < 1e-6, 'within 1.7');
  assert.ok(Math.abs(hit(far) - 1000 * (1 - res / 100)) < 1e-6, 'out of range');
  assert.ok(Math.abs(hit(u1) - 1000 * (1 - E3[key].stats.res / 100)) < 1e-6, 'not itself');
  put(h, key, [10, 9.5], { tag: null });   // 0.5 from the near one, 1.5 from the first
  runFor(h, 0.5);
  assert.ok(Math.abs(hit(near) - 1000 * (1 - res / 100) * (1 - dr) ** 2) < 1e-6, 'two of them: × 0.75²');
  assert.ok(Math.abs(hit(u1) - 1000 * (1 - E3[key].stats.res / 100) * (1 - dr)) < 1e-6, 'each in the other\'s aura');
});

test('假想敌：丛生: its first damage on each unit × 2 (accrit[critical-hit]) and 5 s HEAL_FREE on it; a unit once hit, plain', () => {
  const key = 'enemy_9040_accrit', bb = E3[key].talents.bb, atk = E3[key].stats.atk;
  assert.deepEqual([bb['CriticalHit.damage_scale'], bb['CriticalHit.duration']], [2, 5]);
  const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 9, col: 6 }]);
  const e = put(h, key, [9, 9], { move: true, tag: null });
  const w = h.unit('t_wall');
  h.runUntil(() => hits.length >= 1, 30);
  const at = h.b.time;
  assert.ok(Math.abs(hits[0].n - atk * 2) < 1e-6, `first × 2 (${hits[0].n})`);
  assert.ok(w.s.flags.noHeal && w.s.flags.healFree, 'HEAL_FREE');
  h.runUntil(() => hits.length >= 2, 30);
  assert.ok(Math.abs(hits[1].n - atk) < 1e-6, 'then plain');
  h.runUntil(() => h.b.time >= at + 5.2, 10);
  assert.ok(!w.s.flags.noHeal && !w.s.flags.healFree, 'HEAL_FREE for 5 s');
  assert.ok(e.alive);
});

// ---------------------------------------------------------------------------------------------------------------
// REBORN 复苏 (enemies/reborn.js): the 萨卡兹子裔 and their 重生造物

const DPVT = 'enemy_1222_dpvt', DZOMS = 'enemy_1220_dzoms', DZOMG = 'enemy_1221_dzomg';
/** Element damage enemy keys deal, as { t, n, el }. */
const elemHits = (h, keys) => { const out = []; h.b.on('damaged', (c) => { if (c.source && keys.includes(c.source.defId) && c.dmg.type === 'element') out.push({ t: c.target, n: c.amount, el: c.dmg.element }); }); return out; };
/** Put enemy `key` on a wall's tile, walking, and run until that wall blocks it. */
const blockedOn = (h, key, w) => { const e = put(h, key, [w.tileR, w.tileC + 0.3], { move: true, tag: null }); h.runUntil(() => e.blockedBy === w, 5); assert.ok(e.blockedBy === w, `${key} blocked`); return e; };

test('萨卡兹子裔战士: knocked out, one 大君之触 `deathrattle.delay` (1) s later where it fell — silenced too; the battle waits for it', () => {
  assert.equal(E3[DPVT].talents.bb['deathrattle.delay'], 1);
  assert.equal(E3[DPVT].talents.bbStr['deathrattle.enemy_key'], DZOMS);
  for (const silence of [false, true]) {
    const { h } = waveField([DPVT, DZOMS], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, DPVT, [10, 6], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    h.b.kill(e, h.unit('t_wall'));
    assert.ok(h.b._hasPendingEnemySchedules(), 'the battle waits for the summon');
    runFor(h, 0.9);
    assert.equal(alive(h, DZOMS).length, 0, 'not before the delay');
    runFor(h, 0.2);
    const c = alive(h, DZOMS);
    assert.equal(c.length, 1, `one 大君之触 (silenced ${silence})`);
    assert.ok(Math.abs(c[0].x - 6) < 1e-6 && Math.abs(c[0].y - 10) < 1e-6, 'where it fell');
  }
});

test('大君之赐: physical and arts damage taken × 0.1; its blocker blocks one more per 重生造物 it blocks, until they are gone', () => {
  const bb = E3[DZOMG].talents.bb;
  assert.deepEqual([bb['dmg_res.damage_resistance'], bb['buff_to_blocker.block_cnt']], [0.9, 1]);
  const { h } = waveField([DZOMG], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const w = h.unit('t_wall'), base = w.s.blockCnt;
  const e = blockedOn(h, DZOMG, w);
  runFor(h, 0.2);
  assert.equal(w.s.blockCnt, base + 1, 'one blocked: +1');
  const e2 = blockedOn(h, DZOMG, w);
  runFor(h, 0.2);
  assert.equal(w.s.blockCnt, base + 2, 'two blocked: +2');
  const res = E3[DZOMG].stats.res, hp = e.hp;
  h.b.dealDamage(w, e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp - e.hp - 1000 * (1 - res / 100) * 0.1) < 1e-6, `arts × 0.1 (${hp - e.hp})`);
  h.b.kill(e, w); h.b.kill(e2, w);
  runFor(h, 0.3);
  assert.equal(w.s.blockCnt, base, 'back once they are gone');
});

test('萨卡兹子裔补给车: 重生造物 ATK +10 % per 补给车 and 凋亡 ATK × 0.1 per 补给车 on each hit; a silenced one gives nothing', () => {
  const SUP = 'enemy_1224_dsuply', bb = E3[SUP].talents.bb;
  assert.deepEqual([bb['aura.enemy_dsuply_t[attr_buff].atk'], bb['aura.ep_damage_ratio']], [0.1, 0.1]);
  const { h } = waveField([DZOMS, SUP], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const ep = elemHits(h, [DZOMS]);
  const w = h.unit('t_wall'), atk = E3[DZOMS].stats.atk;
  const z = blockedOn(h, DZOMS, w);
  const s1 = put(h, SUP, [3, 14], { tag: null }), s2 = put(h, SUP, [4, 14], { tag: null });
  runFor(h, 0.3);
  assert.ok(Math.abs(z.s.atk - atk * 1.2) < 1e-6, `two 补给车: × 1.2 (${z.s.atk})`);
  h.runUntil(() => ep.length >= 1, 10);
  assert.ok(ep[0].el === 'apoptosis' && Math.abs(ep[0].n - atk * 1.2 * 0.1 * 2) < 1e-6, `凋亡 ATK × 0.1 × 2 (${ep[0].n})`);
  h.b.applyStatus(s1, 'silence', { duration: 30, source: null });
  runFor(h, 0.3);
  assert.ok(Math.abs(z.s.atk - atk * 1.1) < 1e-6, 'one silenced: × 1.1');
  h.b.applyStatus(s2, 'silence', { duration: 30, source: null });
  runFor(h, 0.3);
  assert.ok(Math.abs(z.s.atk - atk) < 1e-6, 'both silenced: plain');
});

test('萨卡兹子裔集恨者: ATK +15 % per 重生造物 on the field (up to 6); knocked out, a 大君之赐', () => {
  const LORD = 'enemy_1226_dklord';
  assert.deepEqual([E3[LORD].talents.bb['aura.atk'], E3[LORD].talents.bb['aura.max_valid_stack_cnt']], [0.15, 6]);
  const { h } = waveField([LORD, DZOMS, DZOMG], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const e = put(h, LORD, [3, 14], { tag: null }), atk = E3[LORD].stats.atk;
  runFor(h, 0.3);
  assert.equal(e.s.atk, atk, 'none: plain');
  for (let i = 0; i < 8; i++) put(h, i % 2 ? DZOMS : DZOMG, [3 + (i % 3), 10 + i * 0.3], { tag: null });
  runFor(h, 0.3);
  assert.ok(Math.abs(e.s.atk - atk * (1 + 0.15 * 6)) < 1e-6, `eight: capped at six (${e.s.atk})`);
  h.b.kill(e, null);
  runFor(h, 1.1);
  assert.equal(alive(h, DZOMG).length, 5, 'its own 大君之赐 joins the four');
});

test('萨卡兹子裔链术师: arts on 4 units, each jump to the nearest within 1.6 × 0.85 once more; 凋亡 ATK × 0.3 with the same fall-off', () => {
  const key = 'enemy_1225_dkmage', bb = E3[key].talents.bb, atk = E3[key].stats.atk;
  assert.deepEqual([bb['epdamage.attack@max_target'], bb['epdamage.attack@chain.atk_scale'], bb['epdamage.attack@projectile_range']], [4, 0.85, 1.6]);
  // a decoy deployed first (the lowest priority) at (9, 1): within 1.6 of the first target, but farther than the next on the row
  const walls = [{ chessId: 't_wall', row: 9, col: 1, uid: 9 }, ...[2, 3, 4, 5, 7].map((col, i) => ({ chessId: 't_wall', row: 10, col, uid: i + 1 }))];
  const { h, hits } = waveField([key], walls);
  const ep = elemHits(h, [key]);
  put(h, key, [10, 0.5], { tag: null });
  h.runUntil(() => hits.length >= 4, 15);
  // the jumps are dealt inside the first hit's damage event, so they are recorded before it: by the damage, largest first
  const one = hits.slice(0, 4).sort((p, q) => q.n - p.n);
  assert.deepEqual(one.map((x) => (x.n / atk).toFixed(6)), [1, 0.85, 0.85 ** 2, 0.85 ** 3].map((v) => v.toFixed(6)));
  assert.deepEqual(one.map((x) => x.t.tileC), [2, 3, 4, 5], 'from the first along the nearest; not the decoy (1.41 away), not the 5th (2 away)');
  assert.deepEqual(ep.slice(0, 4).map((x) => (x.n / atk).toFixed(6)).sort().reverse(), [0.3, 0.3 * 0.85, 0.3 * 0.85 ** 2, 0.3 * 0.85 ** 3].map((v) => v.toFixed(6)));
});

test('萨卡兹子裔轰击者: its shell lies 4 s where it landed, then physical ATK on the units within 1.1 of that spot', () => {
  const key = 'enemy_1361_dthrow', bb = E3[key].talents.bb, atk = E3[key].stats.atk;
  assert.deepEqual([bb['Attack.attack@projectile_delay_time'], bb['Attack.attack@projectile_radius']], [4, 1.1]);
  const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 10, col: 4, uid: 1 }, { chessId: 't_wall', row: 10, col: 5, uid: 2 }, { chessId: 't_wall', row: 10, col: 2, uid: 3 }]);
  const shells = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'telegraph' && p?.kind === 'dthrowShell') shells.push({ at: h.b.time, x: p.x }); return fx(kind, p); };
  put(h, key, [10, 6.5], { tag: null });
  h.runUntil(() => hits.length >= 2, 20);
  assert.ok(shells.length >= 1, 'a shell landed');
  assert.ok(Math.abs(hits[0].at - shells[0].at - 4) < 0.05, `4 s after it landed (${(hits[0].at - shells[0].at).toFixed(2)})`);
  const first = hits.filter((x) => Math.abs(x.at - hits[0].at) < 1e-6);
  const at = first.map((x) => x.t.tileC).sort();
  assert.ok(at.includes(shells[0].x === 4 ? 4 : 5) && !at.includes(2), `within 1.1 of the spot (${at})`);
  for (const x of first) assert.ok(Math.abs(x.n - atk) < 1e-6, 'ATK × 1 (DEF 0)');
});

test('萨卡兹子裔责罚者: every 4th attack (spCost 3) hits and stuns 4 s its blocker and every unit touching its 1-tile circle; silenced, plain attacks', () => {
  const key = 'enemy_1362_dfat', s = E3[key].skills.find((x) => x.prefabKey === 'StunAttack');
  assert.deepEqual([s.spCost, s.bb.stun], [3, 4]);
  const run = (silence) => {
    const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 10, col: 6, uid: 1 }, { chessId: 't_wall', row: 11, col: 6, uid: 2 }, { chessId: 't_wall', row: 12, col: 6, uid: 3 }]);
    const e = blockedOn(h, key, h.unit(1));
    if (silence) h.b.applyStatus(e, 'silence', { duration: 60, source: null });
    h.runUntil(() => e.stats.attacks >= 4, 40);
    h.step();
    return { h, hits };
  };
  const { h, hits } = run(false);
  assert.ok(h.unit(1).s.flags.stun && h.unit(2).s.flags.stun && !h.unit(3).s.flags.stun, 'the blocker and the one a row down, not two rows down');
  assert.ok(hits.some((x) => x.t === h.unit(2)) && !hits.some((x) => x.t === h.unit(3)), 'the one a row down is hit');
  const q = run(true);
  assert.ok(!q.h.unit(1).s.flags.stun && !q.hits.some((x) => x.t === q.h.unit(2)), 'silenced: none');
});

test('新生血裔: arts × (0.2 × enemies its target blocks + 1), heals 2.2 × the damage; knocked out, a 血珀', () => {
  const key = 'enemy_1360_dfello', bb = E3[key].talents.bb, atk = E3[key].stats.atk;
  assert.deepEqual([bb['DamageUp.scale_ratio'], bb['DamageUp.add_on'], bb['vampire.heal_scale']], [0.2, 1, 2.2]);
  const { h, hits } = waveField([key, DZOMS], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const w = h.unit('t_wall');
  const e = blockedOn(h, key, w);
  e.hp = e.s.maxHp / 2;
  const hp = e.hp;
  h.runUntil(() => hits.length >= 1, 10);
  assert.ok(Math.abs(hits[0].n - atk * 1.2) < 1e-6, `one blocked: × 1.2 (${hits[0].n})`);
  assert.ok(Math.abs(e.hp - hp - hits[0].n * 2.2) < 1e-6, 'heals 2.2 × the damage');
  blockedOn(h, DZOMS, w);
  const own = () => hits.filter((x) => x.src === e);
  h.runUntil(() => own().length >= 2, 10);
  assert.ok(Math.abs(own()[1].n - atk * 1.4) < 1e-6, `two blocked: × 1.4 (${own()[1].n})`);
  h.b.kill(e, w);
  assert.equal(alive(h, 'enemy_1367_dseed').length, 1, 'a 血珀');
});

test('萨卡兹子裔寄生者: an enemy knocked out within 1.5 summons a 大君之赐 at once — not a 大君之赐 or 大君之触, not while it is silenced', () => {
  const key = 'enemy_9030_acpara';
  assert.equal(E3[key].talents.bb['Aura.range_radius'], 1.5);
  assert.equal(E3[key].talents.bbStr['Aura.enemy_key'], DZOMG);
  const { h } = waveField([key, DPVT, DZOMS, DZOMG], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const p = put(h, key, [10, 8], { tag: null });
  h.step();
  const near = put(h, DPVT, [10, 9.2], { tag: null }), far = put(h, DPVT, [10, 10], { tag: null });
  assert.ok(Math.abs(near.x - p.x - 1.2) < 1e-6 && Math.abs(far.x - p.x - 2) < 1e-6 && near.y === p.y, 'placed on one row');
  h.b.kill(far, null);
  assert.equal(alive(h, DZOMG).length, 0, '2 away: none');
  h.b.kill(near, null);
  assert.equal(alive(h, DZOMG).length, 1, '1.2 away: one, at once');
  h.b.kill(alive(h, DZOMG)[0], null);
  assert.equal(alive(h, DZOMG).length, 0, 'a 大君之赐 knocked out: none');
  h.b.kill(put(h, DZOMS, [10, 8.5], { tag: null }), null);
  assert.equal(alive(h, DZOMG).length, 0, 'a 大君之触 knocked out: none (its validator)');
  h.b.applyStatus(p, 'silence', { duration: 10, source: null });
  h.b.kill(put(h, DPVT, [10, 8.5], { tag: null }), null);
  assert.equal(alive(h, DZOMG).length, 0, 'silenced: none');
});

// ---------------------------------------------------------------------------------------------------------------
// REBORN 复苏: the 变异 beasts, the 饲育者 and 集养者, two 骑士团 knights

const SBEAST = 'enemy_1131_sbeast', HARCHN = 'enemy_1133_harchn', PLASM = 'enemy_1137_plasm', TUMOR = 'enemy_1138_tumor';

test('变异沙地兽: knocked out, 2 畸变赘生物 `deathrattle.delay` (0.2) s later where it fell; silenced, none', () => {
  const bb = E3[SBEAST].talents.bb;
  assert.deepEqual([bb['deathrattle.cnt'], bb['deathrattle.delay'], E3[SBEAST].talents.bbStr['deathrattle.enemy_key']], [2, 0.2, PLASM]);
  for (const silence of [false, true]) {
    const { h } = waveField([SBEAST, PLASM], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, SBEAST, [10, 6], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    h.b.kill(e, h.unit('t_wall'));
    runFor(h, 0.15);
    assert.equal(alive(h, PLASM).length, 0, 'not before the delay');
    runFor(h, 0.1);
    const c = alive(h, PLASM);
    assert.equal(c.length, silence ? 0 : 2, `silenced ${silence}`);
    for (const o of c) assert.ok(Math.abs(o.x - 6) < 0.3 && Math.abs(o.y - 10) < 1e-6, 'where it fell');
  }
});

test('变异巨岩蛛: one 畸变赘生物 at the SummonToken clip event every 5 s (from the start); knocked out, 4', () => {
  const s = E3[HARCHN].skills[0];
  assert.deepEqual([s.prefabKey, s.cooldown, s.initCooldown, s.bbStr.enemy_key], ['SummonToken', 5, 5, PLASM]);
  const hit = E3[HARCHN].skillCast.summontoken.hit;
  const { h } = waveField([HARCHN, PLASM], [{ chessId: 't_wall', row: 10, col: 5 }]);
  const e = put(h, HARCHN, [10, 6], { tag: null });
  let cast = null;
  onSkill(h, e, (ab) => { if (ab === 'SummonToken' && cast == null) cast = h.b.time; });
  h.runUntil(() => cast != null, 8);
  assert.ok(cast != null && cast >= 5 - 1e-6 && cast < 8, `cast at its first attack slot after 5 s (${cast})`);
  runFor(h, hit - 0.05);
  assert.equal(alive(h, PLASM).length, 0, 'not before the clip event');
  runFor(h, 0.1);
  assert.equal(alive(h, PLASM).length, 1, 'one at the event');
  h.b.kill(e, h.unit('t_wall'));
  runFor(h, 0.3);
  assert.equal(alive(h, PLASM).length, 5, 'four more when it falls');
});

test('畸变恶性瘤: while blocked its blocker\'s attack speed × 0.2 (one buff for two); unblocked, back', () => {
  assert.equal(E3[TUMOR].talents.bb['atkSpeedDown.attack_speed'], -0.8);
  const { h } = waveField([TUMOR], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const w = h.unit('t_wall'), base = w.s.aspd;
  const e = blockedOn(h, TUMOR, w);
  runFor(h, 0.2);
  assert.ok(Math.abs(w.s.aspd - Math.max(20, base * 0.2)) < 1e-9, `× 0.2 (${w.s.aspd})`);
  h.b.addBuff(w, { key: 't:aspd', mods: { aspd: 50 }, persist: true });
  assert.ok(Math.abs(w.s.aspd - (base + 50) * 0.2) < 1e-9, `(base + 50) × 0.2 — a MULTIPLIER (${w.s.aspd})`);
  blockedOn(h, TUMOR, w);
  runFor(h, 0.2);
  assert.ok(Math.abs(w.s.aspd - (base + 50) * 0.2) < 1e-9, 'two block it: still one buff');
  for (const o of alive(h, TUMOR)) h.b.kill(o, w);
  void e;
  runFor(h, 0.3);
  assert.equal(w.s.aspd, base + 50, 'back once none blocks');
});

test('微核沉积者: knocked out, a 赘生甲壳 (3000 HP, DEF 320, blocks 20) on its tile that blocks enemies; none on an occupied tile', () => {
  const ct = '.cache/gamedata/excel/character_table.json';
  if (fs.existsSync(ct)) {
    const d = JSON.parse(fs.readFileSync(ct, 'utf8')).trap_156_dsshell.phases[0].attributesKeyFrames[0].data;
    assert.deepEqual([d.maxHp, d.def, d.magicResistance, d.blockCnt], [3000, 320, 0, 20], 'the official table');
  }
  const key = 'enemy_1434_dsshel';
  const { h } = waveField([key, PLASM], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const e = put(h, key, [10, 6], { tag: null });
  h.step();
  h.b.kill(e, h.unit('t_wall'));
  const sh = h.b.allyUnits.find((u) => u.alive && u.defId === 'trap_156_dsshell');
  assert.ok(sh && sh.kind === 'device' && sh.tileR === 10 && sh.tileC === 6, 'on its tile');
  assert.deepEqual([sh.s.maxHp, sh.s.def, sh.s.blockCnt], [3000, 320, 20]);
  const p = put(h, PLASM, [10, 7.4], { move: true, tag: null });
  p.route.pts = null;
  h.runUntil(() => p.blockedBy === sh, 5);
  assert.ok(p.blockedBy === sh, 'an enemy is blocked by it');
  const e2 = put(h, key, [12, 2], { tag: null });
  h.b.kill(e2, null);
  assert.equal(h.b.allyUnits.filter((u) => u.alive && u.defId === 'trap_156_dsshell').length, 1, 'no shell on the wall\'s tile');
});

test('蕴核饲育者: knocked out, 微核沉积者 (20 %) / 诡核集养者 (else 50 %) / 单核掠食者, its move speed × 3', () => {
  const key = 'enemy_1437_dsfull', bb = E3[key].talents.bb, bs = E3[key].talents.bbStr;
  assert.deepEqual([bb['0.prob1'], bb['0.prob2'], bb['0.move_speed']], [0.2, 0.5, 2]);
  const kids = [bs['0.enemy_1'], bs['0.enemy_2'], bs['0.enemy_3']];
  assert.deepEqual(kids, ['enemy_1434_dsshel', 'enemy_1436_dsdivi', 'enemy_1433_dsbasi']);
  for (const [rolls, want] of [[[true], 0], [[false, true], 1], [[false, false], 2]]) {
    const { h } = waveField([key, ...kids], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, key, [10, 6], { move: true, tag: null });
    h.step();
    const seen = [];
    h.b.rng.chance = (p) => { seen.push(p); return rolls.shift(); };
    const x0 = e.x, y0 = e.y;
    h.b.kill(e, h.unit('t_wall'));
    assert.deepEqual(seen, [0.2, 0.5].slice(0, seen.length), 'prob1 first, then prob2');
    const out = kids.map((k) => alive(h, k));
    assert.deepEqual(out.map((l) => l.length), [0, 1, 2].map((i) => (i === want ? 1 : 0)), `roll ${want}`);
    const o = out[want][0];
    assert.ok(Math.abs(o.s.moveSpeed - E3[kids[want]].stats.moveSpeed * 3) < 1e-9, `× 3 (${o.s.moveSpeed})`);
    assert.ok(Math.abs(o.x - x0) < 1e-6 && Math.abs(o.y - y0) < 1e-6, 'where it fell');
  }
});

test('诡核集养者: below half HP once, its 1.833 s Skill clip standing, then a copy with its HP ratio that never splits; silenced, it waits', () => {
  const key = 'enemy_1436_dsdivi';
  assert.equal(E3[key].talents.bb['0.hp_ratio'], 0.5);
  assert.equal(E3[key].skills[0].bbStr.enemy_key, key);
  const len = E3[key].skillCast['0'].dur;
  for (const silence of [false, true]) {
    const { h } = waveField([key], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, key, [10, 6], { move: true, tag: null });
    h.step();
    let casts = 0;
    onSkill(h, e, (ab) => { if (ab === '0') casts++; });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 1, source: null });
    h.b.dealDamage(null, e, { amount: e.s.maxHp * 0.45, type: 'true', canDodge: false });
    assert.equal(casts, 0, 'above half: nothing');
    h.b.dealDamage(null, e, { amount: e.s.maxHp * 0.1, type: 'true', canDodge: false });
    assert.equal(casts, silence ? 0 : 1, `below half (silenced ${silence})`);
    if (silence) {
      runFor(h, 1.1);
      h.b.dealDamage(null, e, { amount: 1, type: 'true', canDodge: false });
      assert.equal(casts, 1, 'the listener waits: the next damage after the silence');
    }
    const x0 = e.x;
    runFor(h, len - 0.05);
    assert.equal(alive(h, key).length, 1, 'not before the clip ends');
    assert.ok(Math.abs(e.x - x0) < 1e-9, 'it stands while it casts');
    runFor(h, 0.1);
    const all = alive(h, key);
    assert.equal(all.length, 2, 'a copy');
    const c = all.find((o) => o !== e);
    assert.ok(Math.abs(c.hpRatio - e.hpRatio) < 1e-9, `the same HP ratio (${c.hpRatio} / ${e.hpRatio})`);
    h.b.dealDamage(null, c, { amount: c.s.maxHp * 0.3, type: 'true', canDodge: false });
    h.b.dealDamage(null, e, { amount: e.s.maxHp * 0.1, type: 'true', canDodge: false });
    runFor(h, len + 0.2);
    assert.equal(alive(h, key).length, 2, 'neither splits again');
  }
});

test('沸血骑士团精锐: ATK +10 % and ASPD +5 per enemy knocked out, 10 at most; full, its next attack in the mode Rage', () => {
  const key = 'enemy_1103_wdkght_2', bb = E3[key].talents.bb;
  assert.deepEqual([bb['enhance.atk'], bb['enhance.attack_speed'], bb['enhance.max_stack_cnt']], [0.1, 5, 10]);
  const { h } = waveField([key, PLASM], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const w = h.unit('t_wall');
  const e = put(h, key, [12, 9], { tag: null });
  h.step();
  const atk0 = e.s.atk, as0 = e.s.aspd;
  for (let i = 1; i <= 12; i++) {
    h.b.kill(put(h, PLASM, [12, 3], { tag: null }), w);
    const n = Math.min(10, i);
    assert.ok(Math.abs(e.s.atk - atk0 * (1 + 0.1 * n)) < 1e-6 && e.s.aspd === as0 + 5 * n, `${i} knocked out: ${n} stacks`);
  }
  assert.equal(e.mode ?? null, null, 'no attack yet: the default mode');
  e.x = w.tileC + 0.3; e.y = w.tileR;
  e.mods.speedMul = 1;
  h.runUntil(() => e.stats.attacks >= 1, 10);
  assert.equal(e.mode, 'Rage', 'the mode Rage from its next attack');
});

test('锋盔骑士团学徒 / “左手”泰特斯·白杨: the highest-ATK unit without it ATK × 0.5 for 25 s at the clip event (every 25 / 10 s); 重生 5 s at full HP', () => {
  const ATK = (id, atk) => chessRec({ id, profession: 'TANK', stats: { atk, maxHp: 1e7, def: 0, res: 0, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
  for (const [key, cd] of [['enemy_1104_lfkght', 25], ['enemy_1104_lfkght_3', 10]]) {
    const s = E3[key].skills[0];
    assert.deepEqual([s.prefabKey, s.cooldown, s.initCooldown, s.bb.atk, s.bb.duration, E3[key].talents.bb['reborn.duration']], ['AtkDesWeaken', cd, cd, -0.5, 25, 5]);
    const hit = E3[key].skillCast.atkdesweaken.hit;
    const h = makeBattle({
      content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600, kind: 'normal', enemies: [],
      defs: { chess: { t_wall: WALL('t_wall'), t_a5: ATK('t_a5', 500), t_a9: ATK('t_a9', 1200) }, enemies: { [key]: E3[key] } },
      kits: { t_wall: NOATK, t_a5: NOATK, t_a9: NOATK },
      units: [{ chessId: 't_wall', row: 10, col: 5 }, { chessId: 't_a5', row: 12, col: 1 }, { chessId: 't_a9', row: 12, col: 3 }],
    });
    h.step();
    const e = put(h, key, [10, 6], { tag: null });
    const a5 = h.unit('t_a5'), a9 = h.unit('t_a9');
    const casts = [];
    onSkill(h, e, (ab) => { if (ab === 'AtkDesWeaken') casts.push(h.b.time); });
    h.runUntil(() => casts.length >= 1, 30);
    assert.ok(casts[0] >= cd - 1e-6 && casts[0] < cd + 2, `first cast at ${casts[0]}`);
    runFor(h, hit - 0.05);
    assert.equal(a9.s.atk, 1200, 'not before the clip event');
    runFor(h, 0.1);
    assert.deepEqual([a9.s.atk, a5.s.atk], [600, 500], 'the highest ATK, × 0.5');
    h.runUntil(() => casts.length >= 2, 30);
    runFor(h, hit + 0.05);
    // 10 s: the highest ATK still has the cut (600 > 500), so the next one is picked; 25 s: 学徒's second cast comes as
    // the first cut ends (cooldown 25 + its cast), so 1200 is picked again
    assert.deepEqual([a9.s.atk, a5.s.atk], cd < 25 ? [600, 250] : [600, 500], `second cast at ${casts[1]}`);
    // 重生: knocked out, 5 s, then full HP
    h.b.kill(e, a5);
    assert.ok(e.alive, 'the first knock-out is a 重生');
    runFor(h, 4.9);
    assert.ok(e.s.flags.untargetable, 'still standing up');
    runFor(h, 0.2);
    assert.ok(!e.s.flags.untargetable && e.hp === e.s.maxHp, 'up again at full HP');
    h.b.kill(e, a5);
    assert.ok(!e.alive, 'the second is the end');
  }
});

// ---------------------------------------------------------------------------------------------------------------
// CRITIC 精锐 (content/enemies/critic.js)

const KRGRG = 'enemy_1191_krgrg', KRGRG2 = 'enemy_1191_krgrg_2';

test('冰原卫法者: knocked out, 1.2 s later ATK × 1.3 arts + 5 s cold on the ground units of both sides within 1.65; silenced, none', () => {
  const bb = E3[KRGRG].talents.bb;
  assert.deepEqual([bb['boom.atk_scale'], bb['boom.cold'], E3[KRGRG].abilities[0].format], [1.3, 5, 'SILENCE']);
  for (const silence of [false, true]) {
    // the wall 1 tile left of it, another wall 2 below; an enemy 1 to its right, another 2 to its right
    const { h, hits } = waveField([KRGRG, KRGRG2], [{ chessId: 't_wall', row: 10, col: 5 }, { chessId: 't_wall2', row: 12, col: 6 }]);
    const e = put(h, KRGRG, [10, 6], { tag: null });
    const near = put(h, KRGRG2, [10, 7], { tag: null }), far = put(h, KRGRG2, [10, 8], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    const w = h.unit('t_wall'), w2 = h.unit('t_wall2');
    h.b.kill(e, w);
    runFor(h, 1.1);
    assert.equal(hits.filter((x) => x.src === e).length, 0, 'not before the projectile\'s 1.2 s life ends');
    runFor(h, 0.2);
    const got = hits.filter((x) => x.src === e);
    if (silence) { assert.equal(got.length, 0, 'silenced: no blast'); continue; }
    assert.deepEqual(got.map((x) => x.t).sort((p, q) => p.id - q.id), [w, near].sort((p, q) => p.id - q.id), 'the wall and the enemy within 1.65, not those 2 away');
    assert.ok(Math.abs(got.find((x) => x.t === w).n - 600 * 1.3) < 1e-6, 'ATK × 1.3 arts (RES 0)');
    assert.ok(Math.abs(got.find((x) => x.t === near).n - 600 * 1.3 * 0.5) < 1e-6, 'on the enemy too, through its RES 50');
    assert.ok(w.findBuff('cold') && near.findBuff('cold') && !far.findBuff('cold') && !w2.findBuff('cold'), '5 s cold on both sides');
  }
});

test('冰原御法者: in its 失衡 state it loses 50 every 0.066 s (unbalanced_bleed, as 弧光锋卫)', () => {
  const bb = E3[KRGRG2].talents.bb;
  assert.deepEqual([bb['unbalanced_bleed.damage'], bb['unbalanced_bleed.interval']], [50, 0.066]);
  const { h } = waveField([KRGRG2], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const e = put(h, KRGRG2, [10, 6], { tag: null });
  h.step();
  runFor(h, 1);
  assert.equal(e.hp, e.s.maxHp, 'no loss outside 失衡');
  e.unbalanceUntil = h.b.time + 0.66;
  runFor(h, 1);
  const lost = e.s.maxHp - e.hp;
  assert.ok(lost >= 50 * 9 && lost <= 50 * 11, `about 10 × 50 in 0.66 s (${lost})`);
});

const CHGHMR = 'enemy_1406_chghmr', GUNSHO = 'enemy_1403_gunsho', BDGUAD = 'enemy_1409_bdguad_2', BOOMER = 'enemy_1405_boomer_2';

test('战线推进者: its first attack each time it is blocked is PowerHit — ATK × 1.8 at its Skill clip\'s event; silenced, plain attacks', () => {
  const s = E3[CHGHMR].skills[0];
  assert.deepEqual([s.prefabKey, s.bb.atk, E3[CHGHMR].skillCast.powerhit.clip, E3[CHGHMR].skillCast.powerhit.hit], ['PowerHit', 0.8, 'Skill', 1.9]);
  const atk = E3[CHGHMR].stats.atk;
  for (const silence of [false, true]) {
    // walks row 10 into t_wall (col 5)
    const { h, hits } = waveField([CHGHMR], [{ chessId: 't_wall', row: 10, col: 5 }]);
    const e = put(h, CHGHMR, [10, 7], { move: true, tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 1e3, source: null });
    const w = h.unit('t_wall');
    h.runUntil(() => hits.length >= 2, 30);
    const first = hits[0].n, second = hits[1].n;
    if (silence) { assert.deepEqual([first, second], [atk, atk], 'silenced: plain attacks'); continue; }
    assert.ok(Math.abs(first - atk * 1.8) < 1e-6 && Math.abs(second - atk) < 1e-6, `PowerHit then a plain attack (${first}, ${second})`);
    assert.ok(!e.findBuff('ab:chghmrPower'), 'the ATK lasts only while it casts');
    // the block ends (its blocker stunned, the enemy held where it stands) and comes back: the mark again, PowerHit again
    h.b.addBuff(e, { key: 't:hold', persist: true, flags: { noMove: true } });
    h.b.applyStatus(w, 'stun', { duration: 1, source: null });
    h.runUntil(() => !e.blockedBy, 2);
    assert.ok(!e.blockedBy, 'unblocked while its blocker is stunned');
    const n = hits.length;
    h.runUntil(() => hits.length > n, 30);
    assert.ok(e.blockedBy === w && Math.abs(hits[n].n - atk * 1.8) < 1e-6, `PowerHit as it is blocked again (${hits[n].n})`);
  }
});

test('速射轻弩手: 直击 on its row / column at any distance — 3 bolts 0.1 s apart from its clip\'s event, physical ATK on the first ally touched', () => {
  const s = E3[GUNSHO].skills[0];
  assert.deepEqual([s.prefabKey, s.cooldown, s.initCooldown, s.proj.move, s.proj.speed, E3[GUNSHO].skillCast.crossattack.hit], ['CrossAttack', 5, 2, 'FIXED_DIRECTION', 5, 1.033]);
  // the wall 9 tiles away on its row (beyond 重弩突袭者's old 6), another off its row and column
  const { h, hits } = waveField([GUNSHO], [{ chessId: 't_wall', row: 10, col: 1 }, { chessId: 't_wall2', row: 12, col: 4 }]);
  const e = put(h, GUNSHO, [10, 10], { tag: null });
  const casts = [];
  onSkill(h, e, (ab) => { if (ab === 'CrossAttack') casts.push(h.b.time); });
  h.runUntil(() => hits.length >= 3, 10);
  assert.equal(casts.length, 1);
  assert.deepEqual(hits.map((x) => x.t), [h.unit('t_wall'), h.unit('t_wall'), h.unit('t_wall')], 'three bolts, the aligned wall');
  assert.ok(hits.every((x) => Math.abs(x.n - E3[GUNSHO].stats.atk) < 1e-6), 'physical ATK × 1');
  assert.ok(Math.abs(hits[1].at - hits[0].at - 0.1) < 0.04 && Math.abs(hits[2].at - hits[1].at - 0.1) < 0.04, 'spaced 0.1 s');
  const flight = (9 - 0.3 - 0.5) / 5;   // reach = the bolt's 0.3 + an ally's collider
  assert.ok(hits[0].at - casts[0] > 1.033 + flight - 0.1, `the first leaves at the clip's event (${(hits[0].at - casts[0]).toFixed(3)})`);
  runFor(h, 1);
  assert.equal(hits.length, 3, 'one cast');
});

test('马特奥的近卫: 直击 — 2 bombs at its clip\'s events bursting on the first ally touched, ATK × 0.5 within 1.1; damage taken × 0.6 while unblocked', () => {
  const s = E3[BDGUAD].skills[0];
  assert.deepEqual([s.prefabKey, s.bb.times, s.bb.atk_scale, s.bb.projectile_range, E3[BDGUAD].talents.bb['DmgResist.damage_resistance']], ['CrossBomb', 2, 0.5, 1.1, 0.4]);
  const { h, hits } = waveField([BDGUAD], [{ chessId: 't_wall', row: 10, col: 3 }, { chessId: 't_wall2', row: 11, col: 3 }]);
  const e = put(h, BDGUAD, [10, 8], { tag: null });
  const casts = [];
  onSkill(h, e, (ab) => { if (ab === 'CrossBomb') casts.push(h.b.time); });
  h.runUntil(() => hits.length >= 4, 10);
  const w = h.unit('t_wall'), w2 = h.unit('t_wall2');
  const atk = E3[BDGUAD].stats.atk;
  assert.equal(hits.filter((x) => x.t === w).length, 2, 'two bombs on the aligned wall');
  assert.equal(hits.filter((x) => x.t === w2).length, 2, 'and their bursts on the wall beside it (DEF 900)');
  assert.ok(hits.filter((x) => x.t === w).every((x) => Math.abs(x.n - atk * 0.5) < 1e-6), 'ATK × 0.5');
  const at = hits.filter((x) => x.t === w).map((x) => x.at);
  assert.ok(Math.abs(at[1] - at[0] - (2.033 - 1.867)) < 0.04, `the clip's next event (${(at[1] - at[0]).toFixed(3)})`);
  // unblocked: arts × 0.6 after RES 30
  const before = e.hp;
  h.b.dealDamage(null, e, { amount: 1000, type: 'arts' });
  assert.ok(Math.abs(before - e.hp - 1000 * 0.7 * 0.6) < 1e-6, `unblocked: × 0.6 (${before - e.hp})`);
});

test('无畏掷弹兵: its first damage unblocked throws 4 bombs (ATK × 2 within 1.1 of each ally touched), then the mode Light — move +0.7, weight −2; silenced, none', () => {
  const s = E3[BOOMER].skills[0];
  assert.deepEqual([s.prefabKey, s.bb.atk_scale, s.bb.projectile_range, E3[BOOMER].talents.bb['Light.move_speed'], E3[BOOMER].talents.bb['Light.mass_level']], ['Bomb', 2, 1.1, 0.7, -2]);
  for (const silence of [false, true]) {
    // walls left, right and below (no deployable tile above in this field): the bomb thrown up flies on
    const units = [[10, 3], [10, 9], [12, 6]].map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 }));
    const { h, hits } = waveField([BOOMER], units);
    const e = put(h, BOOMER, [10, 6], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 1e3, source: null });
    const dirs = [];
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (kind, p) => { if (kind === 'enemyShot' && p?.id === e.id) dirs.push(p.dir.join(',')); return fx(kind, p); };
    h.step();
    h.b.dealDamage(null, e, { amount: 1, type: 'true' });
    runFor(h, 3);
    if (silence) { assert.equal(hits.length, 0, 'silenced: no bombs'); assert.ok(e.mode !== 'D2L'); continue; }
    const walls = h.b.allies().filter((u) => u.alive);
    assert.equal(hits.length, 3, 'one bomb on each wall');
    assert.deepEqual(new Set(hits.map((x) => x.t)), new Set(walls), 'right, left and down');
    assert.deepEqual(dirs, ['1,0', '0,1', '-1,0', '0,-1'], 'four bombs, four ways');
    assert.ok(hits.every((x) => Math.abs(x.n - E3[BOOMER].stats.atk * 2) < 1e-6), 'ATK × 2');
    assert.equal(e.mode, 'Light');
    assert.equal(e.s.massLevel, E3[BOOMER].stats.massLevel - 2);
    h.b.dealDamage(null, e, { amount: 1, type: 'true' });
    runFor(h, 3);
    assert.equal(hits.length, 3, 'once');
    assert.equal(e.mode, 'Light', 'and it stays in Light');
  }
  // blocked: its damage taken throws nothing, and it keeps its melee attack
  const { h, hits } = waveField([BOOMER], [{ chessId: 't_wall', row: 10, col: 5 }]);
  const e = put(h, BOOMER, [10, 7], { move: true, tag: null });
  h.runUntil(() => e.blockedBy, 10);
  h.b.dealDamage(null, e, { amount: 1, type: 'true' });
  runFor(h, 3);
  assert.ok(e.mode !== 'D2L' && e.mode !== 'Light' && hits.every((x) => Math.abs(x.n - E3[BOOMER].stats.atk) < 1e-6), 'blocked: no bombs');
});

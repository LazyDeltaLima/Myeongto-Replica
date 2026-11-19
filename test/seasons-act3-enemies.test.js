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
import { TICK, COLS } from '../server/sim/constants.js';
import { bodyKeys, bodyOnTile } from '../server/sim/body.js';

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
const SPECIAL_TYPE = [];
// enemies an enemy effect, choice or strategy of 规程 puts on the field
const EFFECT_SPAWN = [];
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
  // no clip named but missing: 假想敌：械's SommonSquad names the key `Skill_1`, which its animator's `_animations` table
  // turns into A_Skill_1 (3.467 s, strike 2 s; docs/rules/sim.md 「적 클립의 키 표」 — a 0 s cast until 2026-11-14)
  const miss = fresh.filter((k) => Object.values(E3[k].skillCast || {}).some((c) => c.miss)).sort();
  assert.deepEqual(miss, []);
  assert.deepEqual((({ clip, dur, hit }) => ({ clip, dur, hit }))(E3.enemy_9029_acfnc.skillCast.sommonsquad), { clip: 'A_Skill_1', dur: 3.467, hit: 2 });
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
/** When enemy `e`'s skill `name` takes effect, s from its cast's start (content/enemies.js castStrikeAt: the frame its ability waits for). */
const strikeOf = (e, name) => { const k = e.mem.ab.sk[name]; return enemiesMod.castStrikeAt(e, k.cast, k.bb); };
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
  // LaunchArmor (cooldown 10, WithArmor mode only): both fly outward along row 4 — at B_Skill_2's frame (stretched over
  // its 10 s cast: 2.5 s in)
  runFor(h, 14 + strikeOf(boss, 'LaunchArmor') + 0.5 - h.b.time);
  // the skills take the attack slots (skillCast, 「적 스킬 = 일반 공격 차례」): 【洪流攻势】 (cooldown 45, ready at once) at
  // the first one — its A_Skill_1 casts 3.467 s (「적 클립의 키 표」) and the attack's cooldown restarts at its end
  // (resetMain, waitFirst) —, LaunchArmor (ready at 10 s) at the next slot, 14 s — no shot yet
  assert.deepEqual(casts, [['SommonSquad', 0], ['LaunchArmor', 14]]);
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
  assert.ok(boss.mem.lpSp[0] < strikeOf(boss, 'SkSummonArmor') + 1, 'its SP spent as it was cast (A_Skill_2, 2.5 s before they come)');
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
  runFor(h, strikeOf(boss, 'SommonSquad') + 0.5);   // (they come at A_Skill_1's frame, 2 s in)
  const fresh = alive(h, PART).slice(before).map((p) => [Math.round(p.y), Math.round(p.x)]).sort();
  assert.deepEqual(fresh, [[3, 4], [5, 4]]);
});

// official client: a casting EnemySkill sets SP_RECOVER_STOPPED on its enemy (registeredAsModifier from CastToTarget to
// _OnCastFinish), so the time SP stands still through the cast — 【洪流攻势】 (cooldown 0, spCost 25) is ready again 25 s
// after its A_Skill_1 ENDS (content/bosses.js skillSp / spGain; docs/rules/ui.md 「전투 화면 UI」 보스 SP 바)
test('假想敌：械 SP: spent as 【洪流攻势】 begins, still through its cast, +1/s again from its end', () => {
  const { h, boss } = machineField(FNC);
  let cast = null;
  onSkill(h, boss, (ability) => { if (ability === 'SommonSquad') cast ??= h.b.time; });
  h.runUntil(() => cast != null, 45);
  assert.ok(cast != null, 'cast');
  const len = boss.mem.ab.casting.until - cast;
  assert.ok(Math.abs(len - E3[FNC].skillCast.sommonsquad.dur) < 0.05, `A_Skill_1 (${len})`);
  runFor(h, len - 0.2);
  assert.ok(boss.mem.lpSp[0] < 1e-9, `SP 0 to the cast's end (${boss.mem.lpSp[0]})`);
  runFor(h, 1.2);
  const want = h.b.time - (cast + len);
  assert.ok(Math.abs(boss.mem.lpSp[0] - want) < 0.05, `SP counted from the end: ${boss.mem.lpSp[0]} ≈ ${want}`);
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

test('假想敌：械 / 假想敌：茧 (both copies) are 巨型单位: the prefab box 4.95 × 2.95 one row up — a 5 × 3 block, as 胄 / 管', () => {
  for (const key of [FNC, FNC2, SPIDER, SPIDER2]) {
    assert.deepEqual(E3[key].hitArea, { w: 4.95, h: 2.95, dx: 0, dy: 1 }, key);
    const { boss } = key.includes('acfnc') ? machineField(key) : spiderField(key, { left: [[2, 3]] });
    const tiles = bodyKeys(boss).map((k) => [Math.floor(k / COLS), k % COLS]);
    assert.equal(tiles.length, 15, `${key}: ${JSON.stringify(tiles)}`);
    const r = Math.round(boss.y), c = Math.round(boss.x);
    for (const [dr, dc, on] of [[0, 0, true], [2, -2, true], [2, 2, true], [0, 2, true], [-1, 0, false], [3, 0, false], [0, 3, false]]) {
      assert.equal(bodyOnTile(boss, r + dr, c + dc), on, `${key}: tile (${r + dr}, ${c + dc})`);
    }
  }
});

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
  // 【悲惨之雨】 (Left: its own field) at 25 s, cast at an attack slot: its selectable group's child Skill_2 (1.833 s,
  // `_timeMode` 1) is the cast — the boss makes no normal attack meanwhile (until 2026-11-20 a cast of 0)
  let castAt = null;
  onSkill(h, boss, (ab) => { if (ab === 'AcidRain' && castAt == null) castAt = { t: h.b.time, left: (boss.mem.ab.casting?.until ?? h.b.time) - h.b.time }; });
  runFor(h, rain.initCooldown + 0.6 - h.b.time);
  assert.ok(castAt && Math.abs(castAt.left - 1.833) <= TICK + 1e-6, `AcidRain casts its child's clip (${castAt && castAt.left})`);
  // the rain falls as Skill_2 has played (it has no attack event), its first tick 0.5 s later
  runFor(h, castAt.t + strikeOf(boss, 'AcidRain') + 0.6 - h.b.time);
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
  assert.ok(Math.abs(ds[0].at - dis.initCooldown - strikeOf(e, 'Discharge')) < 0.5, `at Skill1's frame after its cooldown (${ds[0].at})`);
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

test('恶尘源石虫: knocked out, ATK × 3.5 physical on the ground units within 1.3 as projectile_lrboom\'s 1 s life ends; silenced, none', () => {
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
    const early = h.unit(1).stats.taken - t0[0];
    runFor(h, 1);
    return [h.unit(1).stats.taken - t0[0], h.unit(2).stats.taken - t0[1], early];
  };
  const [near, far, early] = run(false);
  // the projectile stays 1 s where it fell (`_lifeTime`, `_alwaysReachInTheEnd`) and strikes as its life ends
  assert.equal(early, 0, 'nothing at the knock-out');
  assert.ok(Math.abs(near - E3[key].stats.atk * 3.5) < 1e-6 && far === 0, `1.2 away hit (${near}), 3.2 away not (${far})`);
  assert.deepEqual(run(true), [0, 0, 0], 'the SILENCE line');
});

test('搏命享受者: the enemies within 1.7 — itself too (`_selfOption` DEFAULT) — take physical and arts damage × 0.75, one buff per 搏命享受者 (two multiply)', () => {
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
  assert.ok(Math.abs(hit(u1) - 1000 * (1 - E3[key].stats.res / 100) * (1 - dr)) < 1e-6, 'itself too');
  put(h, key, [10, 9.5], { tag: null });   // 0.5 from the near one, 1.5 from the first
  runFor(h, 0.5);
  assert.ok(Math.abs(hit(near) - 1000 * (1 - res / 100) * (1 - dr) ** 2) < 1e-6, 'two of them: × 0.75²');
  assert.ok(Math.abs(hit(u1) - 1000 * (1 - E3[key].stats.res / 100) * (1 - dr) ** 2) < 1e-6, 'its own aura and the other\'s');
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

test('萨卡兹子裔战士: knocked out, one 大君之触 `deathrattle.delay` (1) s later on the centre of the tile it fell on ± 0.1 — silenced too; the battle waits for it', () => {
  assert.equal(E3[DPVT].talents.bb['deathrattle.delay'], 1);
  assert.equal(E3[DPVT].talents.bbStr['deathrattle.enemy_key'], DZOMS);
  for (const silence of [false, true]) {
    const { h } = waveField([DPVT, DZOMS], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, DPVT, [10, 6], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    e.x = 6.4; e.y = 9.7;   // off the centre of tile (10, 6)
    h.b.kill(e, h.unit('t_wall'));
    assert.ok(h.b._hasPendingEnemySchedules(), 'the battle waits for the summon');
    runFor(h, 0.9);
    assert.equal(alive(h, DZOMS).length, 0, 'not before the delay');
    runFor(h, 0.2);
    const c = alive(h, DZOMS);
    assert.equal(c.length, 1, `one 大君之触 (silenced ${silence})`);
    // SummonEnemiesFollowMyRoute: the nearest walkable tile's centre, then ± `_randomOffsetBound` 0.1 on each axis
    const dx = c[0].x - 6, dy = c[0].y - 10;
    assert.ok(Math.abs(dx) <= 0.1 + 1e-9 && Math.abs(dy) <= 0.1 + 1e-9 && (dx !== 0 || dy !== 0), `the tile centre ± 0.1 (${dx}, ${dy})`);
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

test('萨卡兹子裔责罚者: after 3 attacks (spCost 3) StunAttack is cast in place of the 4th — its Skill clip, and at its attack event its blocker and every unit touching its 1-tile circle take ATK and a 4 s stun; silenced, plain attacks', () => {
  const key = 'enemy_1362_dfat', s = E3[key].skills.find((x) => x.prefabKey === 'StunAttack');
  assert.deepEqual([s.spCost, s.bb.stun], [3, 4]);
  assert.deepEqual(E3[key].skillCast.stunattack, { family: 3, clip: 'Skill', dur: 1.6, hit: 0.567, max: 1, time: 0 });
  const run = (silence) => {
    const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 10, col: 6, uid: 1 }, { chessId: 't_wall', row: 11, col: 6, uid: 2 }, { chessId: 't_wall', row: 12, col: 6, uid: 3 }]);
    const e = blockedOn(h, key, h.unit(1));
    if (silence) h.b.applyStatus(e, 'silence', { duration: 60, source: null });
    const casts = [], ready = [];
    onSkill(h, e, (ability) => casts.push({ ability, at: h.b.time, attacks: e.stats.attacks }));
    const fx = h.b.fx.bind(h.b);
    h.b.fx = (kind, p) => { if (kind === 'enemySkillReady' && p?.id === e.id) ready.push({ on: p.on, ability: p.ability, attacks: e.stats.attacks, at: h.b.time }); return fx(kind, p); };
    return { h, hits, e, casts, ready };
  };
  const { h, hits, e, casts, ready } = run(false);
  assert.ok(h.runUntil(() => casts.length > 0, 40), 'cast');
  const c = casts[0];
  // the ready hint (ReadyEnemySkillEffect enemy_dfat_skill_hint): on as the third attack fills the SP, off as the cast
  // finishes (OnCastFinish; `_stopBeforeCast` 0 — not as it starts)
  assert.deepEqual(ready.map((x) => [x.on, x.ability, x.attacks]), [[1, 'StunAttack', 3]], 'still on while it casts');
  assert.equal(c.ability, 'StunAttack');
  assert.equal(c.attacks, 3, 'after three normal attacks');
  assert.ok(Math.abs(e.skillAnimUntil - c.at - 1.6) < 1e-6, `its Skill clip, 1.6 s (${e.skillAnimUntil - c.at})`);   // the tick's snapshot
  assert.ok(Math.abs(e.castLeft - (1.6 - (h.b.time - c.at))) < TICK + 1e-6, 'it stands for the cast');
  const atk = e.stats.attacks;
  h.runUntil(() => h.b.time >= c.at + 0.567 - 0.05, 2);
  assert.ok(!h.unit(1).s.flags.stun, 'nothing before the attack event');
  h.runUntil(() => h.unit(1).s.flags.stun, 1);
  const first = hits.find((x) => x.at >= c.at);
  assert.ok(first && first.at - c.at >= 0.567 - 1e-6 && first.at - c.at <= 0.567 + TICK, `at the clip's attack event, the first tick after it (${first && (first.at - c.at).toFixed(3)})`);
  assert.ok(h.unit(1).s.flags.stun && h.unit(2).s.flags.stun && !h.unit(3).s.flags.stun, 'the blocker and the one a row down, not two rows down');
  const own = hits.filter((x) => x.at >= c.at);
  assert.ok(own.some((x) => x.t === h.unit(1)) && own.some((x) => x.t === h.unit(2)) && !own.some((x) => x.t === h.unit(3)), 'both hit, the third not');
  assert.equal(e.stats.attacks, atk, 'in place of the normal attack');
  h.runUntil(() => ready.length > 1, 3);
  assert.deepEqual([ready[1].on, ready[1].ability], [0, 'StunAttack']);
  assert.ok(Math.abs(ready[1].at - c.at - 1.6) <= TICK + 1e-6, `off as the cast finishes (${(ready[1].at - c.at).toFixed(3)})`);
  // the SP starts again: the next cast after three more attacks; its targets are taken as it starts (`_selectTargetSource`
  // FROM_OWNER) — the one a row down withdrawn before the attack event is not hit
  assert.ok(h.runUntil(() => casts.length > 1, 60), 'cast again');
  assert.equal(casts[1].attacks, 6, 'three more attacks');
  h.b.retreat(h.unit(2));
  const n2 = hits.length;
  h.runUntil(() => h.b.time >= casts[1].at + 0.567 + 2 * TICK, 2);
  assert.ok(hits.slice(n2).some((x) => x.t === h.unit(1)) && !hits.slice(n2).some((x) => x.t === h.unit(2)), 'the withdrawn one is not hit');
  // a cast cut short (a stun) clears it at once, and only once
  const k = run(false);
  assert.ok(k.h.runUntil(() => k.casts.length > 0, 40));
  k.h.b.applyStatus(k.e, 'stun', { duration: 3, source: null });
  k.h.step();
  assert.deepEqual(k.ready.map((x) => x.on), [1, 0], 'off as the cast is cut');
  k.h.runUntil(() => k.h.b.time >= k.casts[0].at + 2, 3);
  assert.deepEqual(k.ready.map((x) => x.on), [1, 0], 'no second off at the cast\'s planned end');
  const q = run(true);
  q.h.runUntil(() => q.e.stats.attacks >= 5, 40);
  assert.ok(!q.casts.length && !q.h.unit(1).s.flags.stun && !q.hits.some((x) => x.t === q.h.unit(2)), 'silenced: plain attacks, no cast');
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

test('变异沙地兽: knocked out, 2 畸变赘生物 `deathrattle.delay` (0.2) s later on the centre of the tile it fell on ± `offset_bound` 0.2 each; silenced, none', () => {
  const bb = E3[SBEAST].talents.bb;
  assert.deepEqual([bb['deathrattle.cnt'], bb['deathrattle.delay'], E3[SBEAST].talents.bbStr['deathrattle.enemy_key']], [2, 0.2, PLASM]);
  for (const silence of [false, true]) {
    const { h } = waveField([SBEAST, PLASM], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const e = put(h, SBEAST, [10, 6], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    e.x = 5.6;   // off the centre of tile (10, 6)
    h.b.kill(e, h.unit('t_wall'));
    runFor(h, 0.15);
    assert.equal(alive(h, PLASM).length, 0, 'not before the delay');
    runFor(h, 0.1);
    const c = alive(h, PLASM);
    assert.equal(c.length, silence ? 0 : 2, `silenced ${silence}`);
    assert.equal(E3[SBEAST].talents.bb['deathrattle.offset_bound'], 0.2);
    for (const o of c) assert.ok(Math.abs(o.x - 6) <= 0.2 + 1e-9 && Math.abs(o.y - 10) <= 0.2 + 1e-9, `the tile centre ± 0.2 (${o.x}, ${o.y})`);
    if (c.length === 2) assert.ok(c[0].x !== c[1].x && c[0].y !== c[1].y, 'each its own draw on both axes');
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

/** A 赘生甲壳 at (10, 6) (a 微核沉积者 knocked out there) and enemy `key` walking at it from (10, 7.4), nothing else in the way. */
function shellAndWalker(key) {
  const { h } = waveField(['enemy_1434_dsshel', key], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const d = put(h, 'enemy_1434_dsshel', [10, 6], { tag: null });
  h.step();
  h.b.kill(d, h.unit('t_wall'));
  const sh = h.b.allyUnits.find((u) => u.alive && u.defId === 'trap_156_dsshell');
  const e = put(h, key, [10, 7.4], { move: true, tag: null });
  e.route.pts = null;
  return { h, sh, e };
}

test('赘生甲壳: an obstacle-like tile (enemies go round it at cost 1000), the ground block reach 0.7071, gone with it', () => {
  const { h, sh, e } = shellAndWalker(PLASM);
  assert.ok(h.b.grid.isCrate(10, 6) && !h.b.grid.isBlocked(10, 6), 'obstacle-like, not impassable');
  h.runUntil(() => e.blockedBy === sh, 5);
  assert.ok(e.blockedBy === sh);
  // contact at the ground radius (a crate's 0.4472 would let it come nearer first)
  assert.ok(Math.hypot(e.x - sh.x, e.y - sh.y) > 0.45, `blocked from ${Math.hypot(e.x - sh.x, e.y - sh.y).toFixed(3)}`);
  h.b.kill(sh, null);
  h.step();
  assert.ok(!h.b.grid.isCrate(10, 6), 'its tile is plain again');
});

test('复核洋流使者: at a 赘生甲壳 casts 0 → 1, eats it at the Skill clip\'s end (2.6 s): mode 1, HP +60 % (no max_hp key) and ATK +40 %, once', () => {
  const key = 'enemy_1438_dspred';
  assert.deepEqual(E3[key].skills.map((s) => [s.prefabKey, s.cooldown, s.bb]), [['0', 1000000, { range_radius: 0.35 }], ['1', 0, { maxhp: 0.7, atk: 0.4 }]]);
  assert.equal(E3[key].skillCast['1'].dur, 2.6);
  const { h, sh, e } = shellAndWalker(key);
  const hp0 = e.s.maxHp, atk0 = e.s.atk;
  h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'enemySkill' && x[4]?.id === e.id && x[4].ability === '1'), 10);
  const t0 = h.b.time;
  const casts = h.eventsOf('fx').filter((x) => x[1] === 'enemySkill' && x[4]?.id === e.id).map((x) => x[4].ability);
  assert.deepEqual(casts, ['0', '1'], 'skill 0, then skill 1 at once');
  assert.ok(sh.alive && Math.hypot(e.x - sh.x, e.y - sh.y) <= 1.5 * 0.35 + 0.25 + 1e-6, 'in reach (1.5 × 0.35 + its collider: before the block), the shell still there');
  e.hp = e.s.maxHp / 2;
  h.runUntil(() => !sh.alive, 4);
  assert.ok(!sh.alive, 'the shell is gone');
  assert.ok(Math.abs(h.b.time - t0 - 2.6) < 0.06, `at the clip's end (${(h.b.time - t0).toFixed(3)} s)`);
  assert.equal(e.mode, '1');
  assert.ok(Math.abs(e.s.maxHp - hp0 * 1.6) < 1e-6 && Math.abs(e.s.atk - atk0 * 1.4) < 1e-6, `HP ${e.s.maxHp} ATK ${e.s.atk}`);
  assert.ok(Math.abs(e.hp / e.s.maxHp - 0.5) < 1e-6, 'its HP ratio kept');
  assert.ok(h.eventsOf('status').some((x) => x[1] === e.id && x[2] === 'ab:dspredEat' && x[3] === 1), 'shown (dspred_tr_1[attribute])');

  // a second shell later: never eaten (skill 1 casts once, skill 0's cooldown 1000000)
  const d2 = put(h, 'enemy_1434_dsshel', [10, 5], { tag: null });
  h.step();
  h.b.kill(d2, h.unit('t_wall'));
  runFor(h, 6);
  assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'enemySkill' && x[4]?.id === e.id).length, 2, 'no second cast');
});

test('复核洋流使者: a cast cut before its end (stunned) eats nothing — and it does not try again', () => {
  const { h, sh, e } = shellAndWalker('enemy_1438_dspred');
  h.runUntil(() => h.eventsOf('fx').some((x) => x[1] === 'enemySkill' && x[4]?.id === e.id && x[4].ability === '1'), 10);
  runFor(h, 1);
  h.b.applyStatus(e, 'stun', { duration: 1, source: null });
  runFor(h, 6);
  assert.ok(sh.alive || sh.hp < sh.s.maxHp, 'not eaten (at most chopped)');
  assert.ok(e.mode !== '1' && !e.findBuff('ab:dspredEat'), 'no mode 1, no buff');
  assert.equal(h.eventsOf('fx').filter((x) => x[1] === 'enemySkill' && x[4]?.id === e.id).length, 2, 'one try');
});

test('元核孽生者: blocked by a 赘生甲壳 it wakes unhurt, breaks the shell at a fifth of its max HP (真实) and walks on', () => {
  const key = 'enemy_1439_dslntf', bb = E3[key].talents.bb;
  assert.deepEqual([bb['3.hp_ratio'], bb['3.range_radius']], [0.2, 0.5]);
  const { h, sh, e } = shellAndWalker(key);
  const taken = [];
  h.b.on('damaged', (c) => { if (c.target === e) taken.push(c); });
  h.runUntil(() => !sh.alive, 20);
  assert.ok(!sh.alive, 'the shell breaks');
  assert.equal(e.mode, '1', 'awake (mode 1)');
  assert.ok(e.findBuff('ab:combat'), '临战');
  assert.equal(taken.length, 1, 'hurt once: the break');
  assert.equal(taken[0].dmg.type, 'true');
  assert.ok(Math.abs(e.hp - e.s.maxHp * 0.8) < 1e-6, `HP ${e.hp} of ${e.s.maxHp}`);
  assert.ok(h.eventsOf('fx').some((x) => x[1] === 'kitHit' && x[4]?.k === 'dslntf:break' && x[4].id === e.id), 'its effect');
  const p0 = [e.x, e.y];
  runFor(h, 3);
  assert.ok(!e.blockedBy && Math.hypot(e.x - p0[0], e.y - p0[1]) > 0.5, 'walks on (once its swing is out)');
});

test('元核孽生者: asleep (mode 0) a shell within reach stays; hurt, it wakes and breaks it at once', () => {
  const key = 'enemy_1439_dslntf';
  const { h } = waveField(['enemy_1434_dsshel', key], [{ chessId: 't_wall', row: 12, col: 2 }]);
  const d = put(h, 'enemy_1434_dsshel', [10, 6], { tag: null });
  h.step();
  h.b.kill(d, h.unit('t_wall'));
  const sh = h.b.allyUnits.find((u) => u.alive && u.defId === 'trap_156_dsshell');
  const e = put(h, key, [10, 6.73], { tag: null });   // held still, 0.73 from it: within 0.5 + its collider, past the block reach 0.7071
  runFor(h, 2);
  assert.ok(sh.alive && e.mode == null && !e.blockedBy, 'asleep: talent 3 is mode 1\'s');
  h.b.dealDamage(null, e, { amount: 1, type: 'true' });
  h.step();
  assert.ok(!sh.alive && e.mode === '1', 'awake: broken');
  assert.ok(Math.abs(e.hp - (e.s.maxHp * 0.8 - 1)) < 1e-6, 'a fifth of its max HP');
});

test('蕴核饲育者: drawn as it comes in (its derived buff shows which), knocked out: 微核沉积者 (20 %) / 诡核集养者 (else 50 %) / 单核掠食者, its move speed × 3', () => {
  const key = 'enemy_1437_dsfull', bb = E3[key].talents.bb, bs = E3[key].talents.bbStr;
  assert.deepEqual([bb['0.prob1'], bb['0.prob2'], bb['0.move_speed']], [0.2, 0.5, 2]);
  const kids = [bs['0.enemy_1'], bs['0.enemy_2'], bs['0.enemy_3']];
  assert.deepEqual(kids, ['enemy_1434_dsshel', 'enemy_1436_dsdivi', 'enemy_1433_dsbasi']);
  for (const [rolls, want] of [[[true], 0], [[false, true], 1], [[false, false], 2]]) {
    const { h } = waveField([key, ...kids], [{ chessId: 't_wall', row: 12, col: 2 }]);
    const seen = [], chance = h.b.rng.chance;
    h.b.rng.chance = (p) => { seen.push(p); return rolls.shift(); };
    const e = put(h, key, [10, 6], { move: true, tag: null });
    h.b.rng.chance = chance;
    assert.deepEqual(seen, [0.2, 0.5].slice(0, seen.length), 'prob1 first, then prob2 — as it comes in');
    assert.equal(seen.length, want === 0 ? 1 : 2);
    h.step();
    const st = h.eventsOf('status').filter((x) => x[1] === e.id && x[2] === 'ab:dsfullDerived' && x[3] === 1);
    assert.deepEqual(st.map((x) => x[5] && x[5].fx), [`buff:dsfull_tr_1[derived][${want + 1}]`], 'the derived buff it drew, on it');
    runFor(h, 0.5);
    h.b.rng.chance = () => assert.fail('no roll at the knock-out');
    const x0 = e.x, y0 = e.y;
    h.b.kill(e, h.unit('t_wall'));
    h.b.rng.chance = chance;
    const out = kids.map((k) => alive(h, k));
    assert.deepEqual(out.map((l) => l.length), [0, 1, 2].map((i) => (i === want ? 1 : 0)), `roll ${want}`);
    const o = out[want][0];
    assert.ok(Math.abs(o.s.moveSpeed - E3[kids[want]].stats.moveSpeed * 3) < 1e-9, `× 3 (${o.s.moveSpeed})`);
    assert.ok(o.x === Math.round(x0) && o.y === Math.round(y0) && o.x !== x0, `the centre of the tile it fell on, no jitter (${o.x}, ${o.y} / ${x0}, ${y0})`);
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
  const full = () => h.eventsOf('status').filter((x) => x[1] === e.id && x[2] === 'ab:wdkghtFull' && x[3] === 1);
  for (let i = 1; i <= 12; i++) {
    h.b.kill(put(h, PLASM, [12, 3], { tag: null }), w);
    const n = Math.min(10, i);
    assert.ok(Math.abs(e.s.atk - atk0 * (1 + 0.1 * n)) < 1e-6 && e.s.aspd === as0 + 5 * n, `${i} knocked out: ${n} stacks`);
    // wdkght_t[effect] (enemy_wdkght_skill_01_start_03) comes with the knock-out that fills the stacks, once
    const f = full();
    assert.deepEqual(f.map((x) => x[5] && x[5].fx), i >= 10 ? ['buff:wdkght_t[effect]'] : [], `${i}: the full-stack effect ${i >= 10 ? 'once, from the 10th' : 'not yet'}`);
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
  // 1.5 s of the state from ~1.03 s after the spawn: the check at 2 s finds it, the one at 3 s ends it (its talent's buff
  // krgrg_t_1[bleed] triggers every 1 s) — 1 s of bleeding
  e.unbalanceUntil = h.b.time + 1.5;
  runFor(h, 2.2);
  const lost = e.s.maxHp - e.hp;
  assert.equal(lost, 50 * 15, `15 × 50 between the two checks (${lost})`);
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
    h.step();
    assert.equal(e.findBuff('ab:chghmrMark')?.fxTag, 'buff:enemy_chghmr_damage_up[mark]', 'the mark as it spawns');
    h.runUntil(() => hits.length >= 2, 30);
    const first = hits[0].n, second = hits[1].n;
    if (silence) { assert.deepEqual([first, second], [atk, atk], 'silenced: plain attacks'); continue; }
    assert.ok(Math.abs(first - atk * 1.8) < 1e-6 && Math.abs(second - atk) < 1e-6, `PowerHit then a plain attack (${first}, ${second})`);
    assert.ok(!e.findBuff('ab:chghmrPower'), 'the ATK lasts only while it casts');
    assert.ok(!e.findBuff('ab:chghmrMark'), 'the mark spent');
    // the block ends (its blocker stunned, the enemy held where it stands) and comes back: the mark again, PowerHit again
    h.b.addBuff(e, { key: 't:hold', persist: true, flags: { noMove: true } });
    h.b.applyStatus(w, 'stun', { duration: 1, source: null });
    h.runUntil(() => !e.blockedBy, 2);
    assert.ok(!e.blockedBy, 'unblocked while its blocker is stunned');
    const n = hits.length;
    h.runUntil(() => hits.length > n, 30);
    assert.ok(e.blockedBy === w && Math.abs(hits[n].n - atk * 1.8) < 1e-6, `PowerHit as it is blocked again (${hits[n].n})`);
    assert.ok(!e.findBuff('ab:chghmrMark'), 'spent again');
  }
});

test('速射轻弩手: 直击 on its row / column at any distance — 3 bolts 0.1 s apart from its clip\'s event, physical ATK on the first ally touched', () => {
  const s = E3[GUNSHO].skills[0];
  assert.deepEqual([s.prefabKey, s.cooldown, s.initCooldown, s.proj.move, s.proj.speed, E3[GUNSHO].skillCast.crossattack.hit], ['CrossAttack', 5, 2, 'FIXED_DIRECTION', 5, 1.033]);
  // the wall 9 tiles away on its row (beyond 重弩突袭者's old 6), another off its row and column
  const { h, hits } = waveField([GUNSHO], [{ chessId: 't_wall', row: 10, col: 1 }, { chessId: 't_wall2', row: 12, col: 4 }]);
  const e = put(h, GUNSHO, [10, 10], { tag: null });
  const casts = [], shots = [];
  onSkill(h, e, (ab) => { if (ab === 'CrossAttack') casts.push(h.b.time); });
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'enemyShot' && p?.id === e.id) shots.push({ x: p.x, y: p.y, dir: p.dir.join(',') }); return fx0(kind, p); };
  h.runUntil(() => hits.length >= 3, 10);
  assert.equal(casts.length, 1);
  // from its Muzzle in the Skill clip (facing left): 0.603 forward, 0.404 up
  assert.ok(shots.length === 3 && shots.every((p) => Math.abs(p.x - (10 - 0.603)) < 1e-6 && Math.abs(p.y - 10.404) < 1e-6 && p.dir === '-1,0'), JSON.stringify(shots[0]));
  assert.deepEqual(hits.map((x) => x.t), [h.unit('t_wall'), h.unit('t_wall'), h.unit('t_wall')], 'three bolts, the aligned wall');
  assert.ok(hits.every((x) => Math.abs(x.n - E3[GUNSHO].stats.atk) < 1e-6), 'physical ATK × 1');
  assert.ok(Math.abs(hits[1].at - hits[0].at - 0.1) < 0.04 && Math.abs(hits[2].at - hits[1].at - 0.1) < 0.04, 'spaced 0.1 s');
  const flight = (9 - 0.3 - 0.5) / 5;   // reach = the bolt's 0.3 + an ally's collider
  assert.ok(hits[0].at - casts[0] > 1.033 + flight - 0.1, `the first leaves at the clip's event (${(hits[0].at - casts[0]).toFixed(3)})`);
  runFor(h, 1);
  assert.equal(hits.length, 3, 'one cast');
});

test('速射轻弩手 attacking quicker than its clip: its cast is squeezed (`_timeMode` 0) and its first bolt leaves at the clip\'s event × that scale (enemies/helpers.js atCastEvent → castStrikeAt)', () => {
  const { h } = waveField([GUNSHO], [{ chessId: 't_wall', row: 10, col: 1 }]);
  const e = put(h, GUNSHO, [10, 10], { tag: null });
  h.b.addBuff(e, { key: 't:aspd', persist: true, mods: { aspd: 100 } });   // attack interval 2 → 1 s, under the clip's 1.567 s
  const casts = [], shots = [];
  onSkill(h, e, (ab) => { if (ab === 'CrossAttack') casts.push(h.b.time); });
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'enemyShot' && p?.id === e.id) shots.push(h.b.time); return fx0(kind, p); };
  h.runUntil(() => shots.length >= 3, 10);
  const c = E3[GUNSHO].skillCast.crossattack, k = e.s.interval / c.dur;
  assert.ok(k < 0.7, `the cast plays squeezed (${k})`);
  const first = shots[0] - casts[0];
  // (until 2026-11-20 at the clip's own 1.033 s, past the squeezed cast's end — the ability waits for the event as it plays)
  assert.ok(Math.abs(first - c.hit * k) <= TICK + 1e-6, `the first bolt at ${(c.hit * k).toFixed(3)} s (${first.toFixed(3)})`);
  assert.ok(Math.abs(shots[1] - shots[0] - 0.1) <= TICK + 1e-6, 'the next one `_triggerDelta` 0.1 s later');
});

test('速射轻弩手: a bolt up its column leaves from the Skill_Up clip\'s Muzzle (0.236 to its facing side, 0.745 up)', () => {
  const { h } = waveField([GUNSHO], [{ chessId: 't_wall', row: 12, col: 4 }]);
  const e = put(h, GUNSHO, [9, 4], { tag: null });
  const shots = [];
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'enemyShot' && p?.id === e.id) shots.push({ x: p.x, y: p.y, dir: p.dir.join(',') }); return fx0(kind, p); };
  h.runUntil(() => shots.length >= 1, 10);
  assert.ok(Math.abs(shots[0].x - (4 + 0.236)) < 1e-6 && Math.abs(shots[0].y - (9 + 0.745)) < 1e-6 && shots[0].dir === '0,1', JSON.stringify(shots[0]));
});

test('马特奥的近卫: 直击 — 2 bombs at its clip\'s events bursting on the first ally touched, ATK × 0.5 within 1.1 of where each stopped; damage taken × 0.6 while unblocked', () => {
  const s = E3[BDGUAD].skills[0];
  assert.deepEqual([s.prefabKey, s.bb.times, s.bb.atk_scale, s.bb.projectile_range, E3[BDGUAD].talents.bb['DmgResist.damage_resistance']], ['CrossBomb', 2, 0.5, 1.1, 0.4]);
  const { h, hits } = waveField([BDGUAD], [{ chessId: 't_wall', row: 10, col: 3 }, { chessId: 't_wall2', row: 11, col: 3 }]);
  const e = put(h, BDGUAD, [10, 8], { tag: null });
  const casts = [], shots = [];
  onSkill(h, e, (ab) => { if (ab === 'CrossBomb') casts.push(h.b.time); });
  const fx0 = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'enemyShot' && p?.id === e.id) shots.push({ at: h.b.time, x: p.x, y: p.y }); return fx0(kind, p); };
  h.runUntil(() => hits.length >= 2, 10);
  runFor(h, 1);
  const w = h.unit('t_wall'), w2 = h.unit('t_wall2');
  const atk = E3[BDGUAD].stats.atk;
  assert.equal(hits.filter((x) => x.t === w).length, 2, 'two bombs on the aligned wall');
  // each bomb flies from its muzzle, 0.051 / 0.062 above row 10 (Muzzle_1 / Muzzle_2, facing left), and stops 0.5 short of
  // the wall (its 0.3 circle + the wall's collider): the wall on row 11 is ≈ 1.07 from there — in (from row 10 itself, 1.118: out)
  assert.equal(hits.filter((x) => x.t === w2).length, 2, 'the wall beside it: within 1.1 of each stop point');
  assert.ok(hits.filter((x) => x.t === w).every((x) => Math.abs(x.n - atk * 0.5) < 1e-6), 'ATK × 0.5');
  assert.equal(shots.length, 2);
  assert.ok(Math.abs(shots[1].at - shots[0].at - (2.033 - 1.867)) < 0.04, `the clip's next event (${(shots[1].at - shots[0].at).toFixed(3)})`);
  // facing left (the wall is on its left): Muzzle_1, then Muzzle_2 (`_mountPointGroup` MUZZLE, SPECIAL_0)
  assert.ok(Math.abs(shots[0].x - (8 - 0.224)) < 1e-6 && Math.abs(shots[0].y - (10 + 0.051)) < 1e-6, `bomb 1 from Muzzle_1 (${shots[0].x}, ${shots[0].y})`);
  assert.ok(Math.abs(shots[1].x - (8 - 0.564)) < 1e-6 && Math.abs(shots[1].y - (10 + 0.062)) < 1e-6, `bomb 2 from Muzzle_2 (${shots[1].x}, ${shots[1].y})`);
  // unblocked: arts × 0.6 after RES 30
  const before = e.hp;
  h.b.dealDamage(null, e, { amount: 1000, type: 'arts' });
  assert.ok(Math.abs(before - e.hp - 1000 * 0.7 * 0.6) < 1e-6, `unblocked: × 0.6 (${before - e.hp})`);
});

test('马特奥的近卫: the blast is centred where the bomb stopped (its 0.3 circle met the ally), not on the ally — a unit a tile behind is out', () => {
  const { h, hits } = waveField([BDGUAD], [{ chessId: 't_wall', row: 10, col: 3 }, { chessId: 't_wall2', row: 10, col: 2 }]);
  const e = put(h, BDGUAD, [10, 8], { tag: null });
  const booms = [];
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (kind, p) => { if (kind === 'explode' && p?.kind === 'bomb' && p.id === e.id) booms.push(p); return fx(kind, p); };
  h.runUntil(() => booms.length >= 2, 10);
  const w = h.unit('t_wall'), w2 = h.unit('t_wall2');
  assert.equal(booms.length, 2);
  for (const p of booms) assert.ok(Math.abs(p.y - 10) < 0.1 && p.x > w.x + 0.3 && p.x <= w.x + 0.55 + 1e-6, `stopped short of the wall (x ${p.x.toFixed(3)})`);
  assert.equal(hits.filter((x) => x.t === w).length, 2, 'the wall it touched');
  assert.equal(hits.filter((x) => x.t === w2).length, 0, 'the unit behind it: beyond 1.1 of the stop point');
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
    assert.equal(e.form, 'Light', 'the view\'s form (fx phase)');
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

const MTRSNP = 'enemy_1213_mtrsnp', CANSLD = 'enemy_1216_cansld', MTRBTY = 'enemy_1219_mtrbty';
const walls = (cells) => cells.map(([row, col], i) => ({ chessId: 't_wall', row, col, uid: i + 1 }));

test('寻路者狙击手: ammo 1 — its first attack plain, the mode HeadShot right after it, two HeadShots (ATK × 2) on the one bullet, then plain again', () => {
  assert.deepEqual([E3[MTRSNP].sp.initSp, E3[MTRSNP].talents.bb['shotbuff.attack@headshot_atk_scale'], E3[MTRSNP].talents.bb['shotbuff.attack@headshot_sp']], [1, 2, -1]);
  const { h, hits } = waveField([MTRSNP], walls([[10, 4]]));
  const e = put(h, MTRSNP, [10, 6], { tag: null });
  const atk = E3[MTRSNP].stats.atk;
  h.runUntil(() => hits.length >= 5, 30);
  assert.deepEqual(hits.slice(0, 5).map((x) => x.n / atk), [1, 2, 2, 1, 1], 'plain, HeadShot × 2 (the second on the SP the attack began with), plain');
  assert.ok(hits[1].at - hits[0].at < E3[MTRSNP].stats.bat - 0.5, `the HeadShot follows the switch at once (${(hits[1].at - hits[0].at).toFixed(2)} s)`);
  assert.ok(Math.abs(hits[2].at - hits[1].at - E3[MTRSNP].stats.bat) < 0.1, 'the second on its cooldown');
  assert.ok(e.mode !== 'HeadShot' && e.mem.ab.list[0].sp === 0, 'out of ammo, its first mode');
});

test('寻路者破阵者: ammo 2 — unblocked it switches to HeadShot at once and lobs 3 shells (3 × 3 box, ATK × 1), then fights only its blocker', () => {
  assert.deepEqual([E3[CANSLD].sp.initSp, E3[CANSLD].stats.rangeRadius, E3[CANSLD].projModes.HeadShot.move], [2, 2.5, 'PARACURVE']);
  // the target 2.4 tiles away; one wall 1 tile beyond it (in the box, out of reach), one 2 tiles beyond (out of the box)
  const { h, hits } = waveField([CANSLD], walls([[10, 4], [10, 3], [10, 2]]));
  const e = put(h, CANSLD, [10, 6.4], { tag: null });
  runFor(h, 0.15);
  assert.equal(e.mode, 'HeadShot', 'enemy_melee_and_ranged_spmode_check: unblocked with ammo, 0.1 s');
  const atk = E3[CANSLD].stats.atk;
  runFor(h, 30);
  const on = (uid) => hits.filter((x) => x.t === h.unit(uid));
  assert.deepEqual([on(1).length, on(2).length, on(3).length], [3, 3, 0], 'three shells: the target and the wall in its box');
  assert.ok(hits.every((x) => Math.abs(x.n - atk) < 1e-6), 'physical ATK × 1');
  assert.ok(e.mode !== 'HeadShot' && e.profile.melee, 'out of ammo: the melee mode');
  const n = hits.length;
  runFor(h, 15);
  assert.equal(hits.length, n, 'unblocked, its melee mode reaches nobody');
});

test('寻路者传令兵: HeadShot arts ATK × 1.5 and 15 s 缴械 + 沉默, the next on a unit without it; out of ammo, arts melee on its blocker', () => {
  assert.deepEqual([E3[MTRBTY].talents.bb['shotbuff.attack@headshot_atk_scale'], E3[MTRBTY].talents.bb['shotbuff.attack@headshot_disarmed_duration']], [1.5, 15]);
  const atk = E3[MTRBTY].stats.atk;
  {
    const { h, hits } = waveField([MTRBTY], walls([[10, 4], [11, 5]]));
    put(h, MTRBTY, [10, 6], { tag: null });
    h.runUntil(() => hits.length >= 2, 20);
    const [a, b] = hits;
    assert.ok(a.t !== b.t, 'the second shot on the unit without 缴械');
    assert.ok(hits.slice(0, 2).every((x) => Math.abs(x.n - atk * 1.5) < 1e-6), 'arts ATK × 1.5');
    for (const x of [a, b]) assert.ok(x.t.s.flags.disarm && x.t.s.flags.silence, '缴械 and 沉默');
    const hitA = a.at;
    h.runUntil(() => !a.t.s.flags.disarm, 20);
    assert.ok(Math.abs(h.b.time - hitA - 15) < 0.1, `15 s (${(h.b.time - hitA).toFixed(2)})`);
    assert.equal(hits.length, 2, 'then its melee mode: nobody blocked, no attack');
  }
  // walking into its blocker: the shots first (in reach as it comes), then arts melee ATK × 1
  const { h, hits } = waveField([MTRBTY], walls([[10, 5]]));
  const e = put(h, MTRBTY, [10, 7], { move: true, tag: null });
  h.runUntil(() => hits.length >= 4, 40);
  assert.ok(e.blockedBy === h.unit(1));
  assert.deepEqual(hits.slice(0, 4).map((x) => x.n / atk), [1.5, 1.5, 1, 1]);
});

const LTNHOR = 'enemy_1373_ltnhor', LTNCLR = 'enemy_1375_ltnclr', LTNDRU = 'enemy_1376_ltndru';
/** The 乐团 stays in its first mode with the table's numbers: no 变奏 (no env_008_act29side_audio_type_switcher here). */
const noVariation = (e, key, deco) => {
  assert.ok(e.mode == null || e.mode === 'Default', `${key}: its first mode`);
  assert.equal(e.s.atk, E3[key].stats.atk, `${key}: ATK as the table`);
  assert.ok(Math.abs(e.s.interval - E3[key].stats.bat) < 1e-9, `${key}: attack interval as the table`);
  const d = e.findBuff(`ab:${deco}`);
  assert.ok(d && d.fxTag === `buff:enemy_act29side[${deco}]`, `${key}: only the decoration ${deco}`);
};
/** Damage of `hits` grouped into volleys (hits less than 0.3 s apart). */
const volleys = (hits) => {
  const out = [];
  for (const x of hits) { const v = out[out.length - 1]; if (v && x.at - v[v.length - 1].at < 0.3) v.push(x); else out.push([x]); }
  return out;
};

test('残党乐团圆号手: 2 attacks charge its SP, then attackTwoTarget — its blocker-or-range picks, 2 units, physical ATK; silenced, 1 unit each time', () => {
  assert.deepEqual([E3[LTNHOR].sp.maxSp, E3[LTNHOR].sp.increment, E3[LTNHOR].skills[0].spCost, E3[LTNHOR].skills[0].prefabKey], [2, 0, 2, 'attackTwoTarget']);
  for (const key of [LTNHOR, `${LTNHOR}_2`]) {
    for (const silence of [false, true]) {
      // two walls 1 tile from it (in its 1.5 range), one 3 tiles away
      const { h, hits } = waveField([key], walls([[10, 5], [11, 6], [10, 3]]));
      const e = put(h, key, [10, 6], { tag: null });
      if (silence) h.b.applyStatus(e, 'silence', { duration: 1e3, source: null });
      const casts = [];
      onSkill(h, e, (ab) => { if (ab === 'attackTwoTarget') casts.push(h.b.time); });
      h.step();
      noVariation(e, key, 'enthu_fx_deco_only');
      runFor(h, E3[key].stats.bat * 6 + 1);
      const v = volleys(hits);
      assert.ok(v.length >= 6, `${v.length} volleys`);
      assert.deepEqual(v.slice(0, 6).map((x) => x.length), silence ? [1, 1, 1, 1, 1, 1] : [1, 1, 2, 1, 1, 2], 'attack, attack, the skill on two');
      if (!silence) {
        assert.equal(casts.length, 2);
        assert.deepEqual(new Set(v[2].map((x) => x.t)), new Set([h.unit(1), h.unit(2)]), 'the two walls in range');
      }
      assert.ok(hits.every((x) => Math.abs(x.n - E3[key].stats.atk) < 1e-6 && x.t !== h.unit(3)), 'physical ATK, nobody out of range');
    }
  }
});

test('残党乐团管乐家: ATK +30 every 0.5 s while unblocked (30 stacks at most), its first attack after the walk carries them, its attack\'s end clears them', () => {
  const bb = E3[LTNCLR].talents.bb;
  assert.deepEqual([bb['atkboostCore.atk'], bb['atkboostCore.max_stack_count'], E3[LTNCLR].applyWay], [30, 30, 'MELEE']);
  const atk = E3[LTNCLR].stats.atk;
  {
    // standing alone: the stacks stop at 30
    const { h } = waveField([LTNCLR], walls([[2, 2]]));
    const e = put(h, LTNCLR, [10, 6], { tag: null });
    h.step();
    noVariation(e, LTNCLR, 'depressed_fx_deco_only');
    runFor(h, 0.55);
    assert.equal(e.findBuff('ab:ltnclrBoost')?.stacks, 1, 'the first at 0.5 s');
    runFor(h, 20);
    assert.equal(e.findBuff('ab:ltnclrBoost')?.stacks, 30);
    assert.equal(e.s.atk, atk + 30 * 30, 'ATK FINAL_ADDITION 30 × 30');
  }
  // walking into its blocker
  const { h, hits } = waveField([`${LTNCLR}_2`], walls([[10, 5]]));
  const key = `${LTNCLR}_2`, atk2 = E3[key].stats.atk;
  const e = put(h, key, [10, 8], { move: true, tag: null });
  const w = h.unit(1);
  h.runUntil(() => e.blockedBy === w, 20);
  const k = e.findBuff('ab:ltnclrBoost')?.stacks ?? 0;
  assert.ok(k >= 2, `${k} stacks on the way`);
  h.runUntil(() => hits.length >= 1, 10);
  assert.equal(e.findBuff('ab:ltnclrBoost')?.stacks, k, 'blocked: no more stacks; kept until the attack ends');
  assert.ok(Math.abs(hits[0].n - (atk2 + 30 * k)) < 1e-6, `the boosted first attack (${hits[0].n})`);
  h.runUntil(() => !e.findBuff('ab:ltnclrBoost'), 3);
  assert.ok(!e.findBuff('ab:ltnclrBoost'), 'its attack\'s end clears them');
  h.runUntil(() => hits.length >= 2, 10);
  assert.ok(Math.abs(hits[1].n - atk2) < 1e-6, 'then plain arts ATK');
});

test('残党乐团鼓手: range 1.5 (the prefab\'s, the table −1); 2 attacks, then aoeAttack — arts ATK within 2, 0.2 s after its clip\'s event; silenced, none', () => {
  assert.deepEqual([E3[LTNDRU].stats.rangeRadius, E3[LTNDRU].sp.type, E3[LTNDRU].skills[0].prefabKey, E3[LTNDRU].skillCast.aoeattack.hit], [0, 'INCREASE_WHEN_ATTACK', 'aoeAttack', 0.667]);
  for (const key of [LTNDRU, `${LTNDRU}_2`]) {
    for (const silence of [false, true]) {
      // a wall 1 tile from it (in range), one 2 tiles (out of range, in the blast), one 3 tiles (neither)
      const { h, hits } = waveField([key], walls([[10, 5], [12, 6], [10, 3]]));
      const e = put(h, key, [10, 6], { tag: null });
      if (silence) h.b.applyStatus(e, 'silence', { duration: 1e3, source: null });
      const casts = [];
      onSkill(h, e, (ab) => { if (ab === 'aoeAttack') casts.push(h.b.time); });
      h.step();
      noVariation(e, key, 'enthu_fx_deco_only');
      runFor(h, E3[key].stats.bat * 7 + 1);
      const atk = E3[key].stats.atk;
      const blast = hits.filter((x) => x.t === h.unit(2));
      assert.ok(hits.every((x) => Math.abs(x.n - atk) < 1e-6) && !hits.some((x) => x.t === h.unit(3)), 'arts ATK, nothing 3 tiles away');
      if (silence) { assert.equal(blast.length + casts.length, 0, 'silenced: no blast'); continue; }
      assert.ok(casts.length >= 2 && blast.length === casts.length, `one blast a cast (${casts.length}, ${blast.length})`);
      assert.ok(Math.abs(blast[0].at - casts[0] - 0.667 - 0.2) < 0.04, `0.2 s after the event (${(blast[0].at - casts[0]).toFixed(3)})`);
      const near = hits.filter((x) => x.t === h.unit(1));
      assert.ok(near.filter((x) => x.at < casts[0]).length === 2, 'two attacks before the first cast');
      assert.ok(near.some((x) => Math.abs(x.at - blast[0].at) < 1e-6), 'the blast takes the wall in range too');
    }
  }
});

test('残党乐团鼓手: knocked out within the 0.2 s of enemy_ltndru[AOE], the blast comes at once where it fell (the buff finishes with it)', () => {
  const { h, hits } = waveField([LTNDRU], walls([[10, 5], [12, 6]]));
  const e = put(h, LTNDRU, [10, 6], { tag: null });
  const casts = [];
  onSkill(h, e, (ab) => { if (ab === 'aoeAttack') casts.push(h.b.time); });
  h.runUntil(() => casts.length >= 1, 30);
  runFor(h, 0.667 + 0.1);   // past the clip's event: the buff is on, 0.1 s left of it
  const before = hits.filter((x) => x.t === h.unit(2)).length;
  assert.equal(before, 0, 'not yet');
  const t = h.b.time;
  h.b.kill(e, h.unit(1));
  const blast = hits.filter((x) => x.t === h.unit(2));
  assert.equal(blast.length, 1, 'the blast as it falls');
  assert.ok(Math.abs(blast[0].at - t) < 1e-9 && Math.abs(blast[0].n - E3[LTNDRU].stats.atk) < 1e-6, 'arts ATK, at once');
  runFor(h, 0.5);
  assert.equal(hits.filter((x) => x.t === h.unit(2)).length, 1, 'once');
});

const WINGNT = 'enemy_1388_wingnt', WINBOM = 'enemy_1385_winbom';

test('“投石机”: its first attack lobs an arts ATK × 1.5 snowball (range 2.5) on the target and the 4 tiles beside it; then the mode Normal, melee', () => {
  assert.deepEqual([E3[WINGNT].stats.rangeRadius, E3[WINGNT].stats.rawRangeRadius, E3[WINGNT].talents.bb['FirstAttack.attack@first_atk_scale'], E3[WINGNT].proj.move],
    [0, 2.5, 1.5, 'PARACURVE']);
  for (const key of [WINGNT, `${WINGNT}_2`]) {
    // the target 2.6 tiles away (the only one in reach: 2.5 + the collider); beside it a wall in its row and one in its
    // column (in the cross), one on its diagonal and one 2 tiles along its row (out of it)
    const { h, hits } = waveField([key], walls([[10, 4], [10, 3], [9, 4], [9, 3], [10, 2]]));
    const e = put(h, key, [10, 6.6], { tag: null });
    const types = new Set();
    h.b.on('damaged', (c) => { if (c.source === e) types.add(c.dmg.type); });
    h.runUntil(() => hits.length > 0, 10);
    const atk = E3[key].stats.atk;
    runFor(h, 0.1);
    assert.equal(hits.length, 3, 'three units struck');
    assert.deepEqual([1, 2, 3].map((u) => hits.filter((x) => x.t === h.unit(u)).length), [1, 1, 1], 'the target, the one beside it and the one above');
    assert.ok(hits.every((x) => Math.abs(x.n - atk * 1.5) < 1e-6) && [...types].join() === 'arts', 'arts ATK × 1.5 (RES 0)');
    runFor(h, 1.5);
    assert.ok(e.mode === 'Normal' && e.profile.melee, 'the cast over: the mode Normal, melee');
    runFor(h, 15);
    assert.equal(hits.length, 3, 'unblocked, its melee reaches nobody: one snowball only');
  }
  // stunned before its strike: no snowball, still the Default mode — and its next attack throws it
  const { h, hits } = waveField([WINGNT], walls([[10, 4]]));
  const e = put(h, WINGNT, [10, 6.4], { tag: null });
  h.runUntil(() => !!e.swing, 10);
  h.b.applyStatus(e, 'stun', { duration: 2, source: null });
  runFor(h, 1.9);
  assert.ok(e.mode !== 'Normal' && hits.length === 0, 'cut before the strike: no throw, Default');
  h.runUntil(() => hits.length > 0, 10);
  runFor(h, 1.5);
  assert.equal(e.mode, 'Normal', 'thrown later: Normal');
});

test('“喷射罐”: a 4 s arts channel of 3 hits (0.6, 1.6, 2.6 s), then 3 s 缴械; knocked out, arts ATK + 10 s cold on the ground units within 1.55 1 s later', () => {
  const bb = E3[WINBOM].talents.bb;
  assert.deepEqual([bb['Boom.attack@times'], bb['Boom.attack@cooldown'], bb['Boom.attack@attack_cd'], bb['Boom.atk_scale'], bb['Boom.freeze'], E3[WINBOM].stats.rangeRadius],
    [3, 4, 3, 1, 10, 1]);
  for (const key of [WINBOM, `${WINBOM}_2`]) {
    const { h, hits } = waveField([key], walls([[10, 5]]));
    const e = put(h, key, [10, 6], { tag: null });
    const types = new Set();
    h.b.on('damaged', (c) => { if (c.source === e) types.add(c.dmg.type); });
    h.runUntil(() => hits.length >= 6, 30);
    const atk = E3[key].stats.atk;
    assert.ok(hits.every((x) => Math.abs(x.n - atk) < 1e-6) && [...types].join() === 'arts', 'arts ATK × 1 (RES 0)');
    const at = hits.map((x) => x.at - hits[0].at);
    for (const [i, want] of [[1, 1], [2, 2], [3, 7], [4, 8], [5, 9]]) assert.ok(Math.abs(at[i] - want) < 0.05, `hit ${i} at ${at[i].toFixed(3)} (${want})`);
    assert.ok(e.stats.attacks === 2, 'two attacks: one for each channel');
    const sig = h.eventsOf('fx').filter((x) => x[1] === 'enemySkill' && x[4]?.id === e.id).map((x) => [x[4].ability, x[4].n, x[4].dur, x[4].tgt]);
    const wid = h.b.allies()[0].id;
    assert.deepEqual(sig, [['Flame', 1, 4, wid], ['Flame', 2, 4, wid]], 'the view hears each channel, its length and its target');
  }
  // the 缴械 after the channel
  {
    const { h, hits } = waveField([WINBOM], walls([[10, 5]]));
    const e = put(h, WINBOM, [10, 6], { tag: null });
    h.runUntil(() => hits.length >= 1, 10);
    const t0 = hits[0].at - 0.6;
    h.runUntil(() => h.b.time >= t0 + 4.3, 10);
    assert.ok(e.s.flags.disarm, 'enemy_winbom_attack_cd: disarmed after the channel');
    h.runUntil(() => h.b.time >= t0 + 7.1, 10);
    assert.ok(!e.s.flags.disarm, '3 s');
  }
  // a stun at 1 s cuts the channel: no third hit, 缴械 from then — and its cooldown (4 s from the cast) the next attack's
  {
    const { h, hits } = waveField([WINBOM], walls([[10, 5]]));
    const e = put(h, WINBOM, [10, 6], { tag: null });
    h.runUntil(() => hits.length >= 1, 10);
    const t0 = hits[0].at - 0.6;
    h.runUntil(() => h.b.time >= t0 + 1.7, 10);
    h.b.applyStatus(e, 'stun', { duration: 0.5, source: null });
    runFor(h, 0.1);
    assert.ok(e.s.flags.disarm, 'the cut cast ends too: 缴械');
    h.runUntil(() => hits.length >= 3, 10);
    assert.ok(Math.abs(hits[2].at - t0 - 1.7 - 3 - 0.6) < 0.1, `the next channel once the 3 s are over (${(hits[2].at - t0).toFixed(2)})`);
  }
  // knocked out
  for (const silence of [false, true]) {
    // a wall 1 tile from it, one 2 tiles; an enemy beside it
    const { h, hits } = waveField([WINBOM], walls([[10, 5], [10, 8]]));
    const e = put(h, WINBOM, [10, 6.4], { tag: null });
    const near = put(h, KRGRG, [10, 7], { tag: null });
    if (silence) h.b.applyStatus(e, 'silence', { duration: 10, source: null });
    h.step();
    const w = h.unit(1);
    h.b.kill(e, w);
    const n0 = hits.length;
    runFor(h, 0.95);
    assert.equal(hits.length, n0, 'not before the projectile\'s 1 s life ends');
    runFor(h, 0.1);
    const got = hits.slice(n0);
    if (silence) { assert.equal(got.length, 0, 'silenced: no blast'); continue; }
    assert.deepEqual(got.map((x) => x.t), [w], 'the wall within 1.55 only — not the one 1.6 away, not the enemy');
    assert.ok(Math.abs(got[0].n - E3[WINBOM].stats.atk) < 1e-6, 'arts ATK × 1');
    assert.ok(w.findBuff('cold') && !h.unit(2).findBuff('cold') && !near.findBuff('cold'), '10 s cold on the operators\' side');
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 魂灵 group: 注能 / 粹影魂灵法骸, 魂灵涡流, 聚焦 / 棱镜魂灵残迹

const LRMZRD = 'enemy_1431_lrmzrd', LRSOUL = 'enemy_1428_lrsoul', LRWZRD = 'enemy_1429_lrwzrd';
const souls = (e) => (e.findBuff('ab:soul') ? e.findBuff('ab:soul').stacks : 0);
const fxOf = (h, kind) => {
  const out = [], prev = h.b.fx.bind(h.b);
  h.b.fx = (k, p) => { if (k === kind) out.push({ ...p, at: h.b.time }); return prev(k, p); };
  return out;
};

test('魂灵法骸 / 魂灵残迹: a 魂灵涡流 meeting the aura (0.25 + its collider 0.25) is captured — +1 soul, the vortex dies; 3 souls at most', () => {
  for (const key of [LRMZRD, LRWZRD]) {
    // no operator on the field: neither casts (the fireball's / laser's conditions aside, the mage stands with souls)
    const { h } = waveField([key, LRSOUL], []);
    const e = put(h, key, [10, 6], { tag: null });
    const far = put(h, LRSOUL, [10, 6.55], { tag: null });
    const v = [1, 2, 3, 4].map((i) => put(h, LRSOUL, [10, 6 + 0.1 * i], { tag: null }));
    runFor(h, 0.1);
    assert.equal(souls(e), 3, `${key}: three souls`);
    assert.equal(v.filter((o) => !o.alive).length, 3, 'three vortices taken');
    assert.ok(v.filter((o) => o.alive).length === 1, 'the fourth walks on (FinishBuff)');
    assert.ok(far.alive, '0.55 away: outside the aura');
  }
  // a vortex refused at 3 souls is not offered again while it stays in the aura — not after the laser spent the souls;
  // once it has left and comes back, it is
  const { h } = waveField([LRWZRD, LRSOUL], walls([[10, 1]]));
  const laser = fxOf(h, 'laser');
  const e = put(h, LRWZRD, [10, 6], { tag: null });
  for (let i = 0; i < 4; i++) put(h, LRSOUL, [10, 6.1], { tag: null });
  runFor(h, 0.1);
  const left = h.b.enemies.filter((o) => o.alive && o.defId === LRSOUL);
  assert.equal(left.length, 1);
  h.runUntil(() => laser.length > 0, 5);
  runFor(h, 1);
  assert.ok(souls(e) === 0 && left[0].alive, 'souls spent, the vortex still inside: not captured');
  left[0].x = 7;
  runFor(h, 0.1);
  left[0].x = 6.1;
  runFor(h, 0.1);
  assert.ok(!left[0].alive && souls(e) === 1, 'out and in again: captured');
});

test('魂灵法骸: a soul → one arts fireball (ATK × atk_scale) circling it 0.9 away at 50°/s, spent on the first unit it meets; 3 fireballs lock the skill', () => {
  for (const key of [LRMZRD, `${LRMZRD}_2`]) {
    const bb = E3[key].skills[0].bb;
    // a wall 2 tiles below the mage: the orbit (0.9 + 0.45 + 0.25 = 1.6) never reaches it — then one 1.5 below (it does)
    const { h, hits } = waveField([key, LRSOUL], walls([[12, 6]]));
    const orbit = fxOf(h, 'orbit');
    const e = put(h, key, [10, 6], { tag: null });
    for (let i = 0; i < 3; i++) put(h, LRSOUL, [10, 6], { tag: null });
    runFor(h, 0.1);
    assert.equal(souls(e), 3);
    runFor(h, 50);
    assert.equal(orbit.length, 3, `${key}: one fireball for each soul (cooldown 15 + the 1.5 s clip)`);
    assert.ok(orbit[1].at - orbit[0].at > 16.4 && orbit[1].at - orbit[0].at < 16.6, `15 s apart after the clip (${(orbit[1].at - orbit[0].at).toFixed(2)})`);
    assert.equal(souls(e), 0, 'a soul spent on each');
    assert.equal(hits.length, 0, 'nobody in reach');
    put(h, LRSOUL, [10, 6], { tag: null });
    runFor(h, 20);
    assert.equal(souls(e), 1, 'captured');
    assert.equal(orbit.length, 3, 'three fireballs: locked, the soul kept');
    // brought 1.1 from the wall (not blocked by it), its fireballs strike it one by one and the lock is gone: the kept
    // soul is cast
    e.x = 6; e.y = 10.9;
    h.runUntil(() => hits.length >= 1, 8);
    runFor(h, 0.05);
    assert.equal(orbit.length, 3, 'the first strike…');
    h.runUntil(() => orbit.length >= 4, 3);
    assert.equal(souls(e), 0, '…unlocks it: the kept soul becomes the next fireball');
    runFor(h, 10);
    assert.equal(hits.length, 4, 'all four strike the wall, one hit each');
    assert.ok(hits.every((x) => Math.abs(x.n - E3[key].stats.atk * bb.atk_scale) < 1e-6));
  }
  {
    const key = LRMZRD;
    const { h, hits } = waveField([key, LRSOUL], walls([[11, 7]]));   // 1.41 away: inside the orbit's reach
    assert.equal(h.b.allies().length, 1);
    const orbit = fxOf(h, 'orbit'), done = fxOf(h, 'orbitEnd');
    const e = put(h, key, [10, 6], { tag: null });
    put(h, LRSOUL, [10, 6], { tag: null });
    runFor(h, 2);
    assert.equal(orbit.length, 1);
    assert.ok(Math.abs(orbit[0].at - h.b.time + 2 - 0.1 - E3[key].skillCast.summonfireball.hit) < 0.5, 'at the clip\'s event');
    const types = new Set();
    h.b.on('damaged', (c) => { if (c.source === e) types.add(c.dmg.type); });
    h.runUntil(() => hits.length > 0, 10);
    const w = h.unit(1);
    assert.equal(hits[0].t, w);
    assert.equal([...types].join(), 'arts');
    assert.ok(Math.abs(hits[0].n - E3[key].stats.atk * E3[key].skills[0].bb.atk_scale) < 1e-6, 'arts ATK × atk_scale (RES 0)');
    assert.equal(done.length, 1, 'spent');
    // the unit sits up-right of it at 45° (row 0 is the bottom: +y = up a row); the fireball, born at 180° (facing left),
    // turns counter-clockwise — down first, so about 200° until it meets the unit
    const turned = (hits[0].at - orbit[0].at) * 50;
    assert.ok(turned > 190 && turned < 215, `met after ${turned.toFixed(0)}°`);
    runFor(h, 20);
    assert.equal(hits.length, 1, 'one hit: no soul left');
    // its death takes the fireballs with it
    put(h, LRSOUL, [10, 6], { tag: null });
    const n = done.length;
    h.runUntil(() => orbit.length >= 2, 30);
    h.b.kill(e, null);
    assert.equal(done.length, n + 1, 'gone with the mage');
  }
});

test('魂灵残迹: with a soul and a unit in its row / column (any distance), an 8 s arts laser to the map edge — every 1 s on each unit in it, ATK climbing by atk_step to atk_ladder × souls; all souls spent', () => {
  for (const key of [LRWZRD, `${LRWZRD}_2`]) {
    const bb = E3[key].skills[0].bb, atk = E3[key].stats.atk;
    // its row: a wall 5 tiles left and one 2 tiles right (both out of its 1.7 range), the left one the higher 仇恨值: the
    // laser goes left, not through the one behind it; off the row: one at (11, 3)
    const { h, hits } = waveField([key, LRSOUL], walls([[10, 10], [10, 3], [11, 3]]));
    assert.equal(h.b.allies().length, 3);
    const w = h.unit(2);
    w.aggroSeq = 99;
    const laser = fxOf(h, 'laser'), cast = fxOf(h, 'enemySkill');
    const e = put(h, key, [10, 8], { tag: null });
    put(h, LRSOUL, [10, 8], { tag: null });
    const types = new Set();
    h.b.on('damaged', (c) => { if (c.source === e) types.add(c.dmg.type); });
    h.runUntil(() => laser.length > 0, 5);
    assert.equal(cast.length, 1);
    assert.ok(Math.abs(laser[0].at - cast[0].at - 0.2) < 0.04, `after the 0.2 s pre-delay (${(laser[0].at - cast[0].at).toFixed(3)})`);
    assert.equal(souls(e), 0, 'every soul spent');
    assert.equal(laser[0].to[0], 0, 'to the map\'s left edge');
    runFor(h, 9);
    const on = hits.filter((x) => x.t === w);
    assert.equal(on.length, 8, `${key}: 0.2 … 7.2 s`);
    assert.ok(hits.every((x) => x.t === w), 'nobody behind it, nobody off its row');
    const boost = (k) => 1 + Math.min(k * bb.atk_step, bb.atk_ladder * 1);
    assert.deepEqual(on.map((x) => (x.n / atk / bb.atk_scale).toFixed(4)), [0, 1, 2, 3, 4, 5, 6, 7].map((k) => boost(k).toFixed(4)));
    assert.ok(on.every((x, i) => i === 0 || Math.abs(x.at - on[i - 1].at - 1) < 0.05), 'one hit a second');
    assert.ok(Math.abs(on[0].at - laser[0].at) < 0.04, 'the first as it leaves');
    assert.equal([...types].join(), 'arts');
  }
  // three souls: the cap is atk_ladder × 3; up its column when the unit stands there; a stun cuts the laser
  {
    const bb = E3[LRWZRD].skills[0].bb, atk = E3[LRWZRD].stats.atk;
    const { h, hits } = waveField([LRWZRD, LRSOUL], walls([[12, 8]]));   // 2 rows away: out of its 1.7 range
    const laser = fxOf(h, 'laser'), ended = fxOf(h, 'laserEnd');
    const e = put(h, LRWZRD, [10, 8], { tag: null });
    for (let i = 0; i < 3; i++) put(h, LRSOUL, [10, 8], { tag: null });
    h.runUntil(() => laser.length > 0, 5);
    assert.deepEqual(laser[0].to, [8, h.b.grid.rows - 1], 'along its column, to the map\'s edge');
    h.runUntil(() => hits.length >= 3, 5);
    assert.deepEqual(hits.map((x) => (x.n / atk / bb.atk_scale).toFixed(4)),
      [1, 1 + bb.atk_step, 1 + Math.min(2 * bb.atk_step, 3 * bb.atk_ladder)].map((v) => v.toFixed(4)));
    h.b.applyStatus(e, 'stun', { duration: 1, source: null });
    runFor(h, 0.05);
    assert.equal(ended.length, 1, 'the cut cast ends the laser');
    assert.ok(!e.findBuff('ab:lrwzrdBoost'), 'and the ATK boost');
    runFor(h, 5);
    assert.equal(hits.length, 3, 'no more hits');
  }
  // no unit in its row or column: no laser, the soul kept
  {
    const { h } = waveField([LRWZRD, LRSOUL], walls([[11, 3]]));
    const laser = fxOf(h, 'laser');
    const e = put(h, LRWZRD, [10, 8], { tag: null });
    put(h, LRSOUL, [10, 8], { tag: null });
    runFor(h, 20);
    assert.equal(laser.length, 0);
    assert.equal(souls(e), 1);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// 特训敌人 special entries of 规程 and their escorts: 假想敌：影役 / 镜眼 / 镜波, the new escorts of the old entries

const ACREFM = 'enemy_9039_acrefm', ACREFD = 'enemy_9031_acrefd', ACBLK = 'enemy_9034_acblk';
const SNSBR = 'enemy_1064_snsbr', SNSLIME2 = 'enemy_1067_snslime_2', SPNSHD2 = 'enemy_1363_spnshd_2';
const MHBOAR2 = 'enemy_1309_mhboar_2', MNCTUR2 = 'enemy_10163_mnctur_2';
const killNow = (h, e) => h.b.dealDamage(null, e, { amount: 1e9, type: 'true' });

test('假想敌：镜眼: 折射 RES +70; arts damage it takes slows the source\'s ASPD −50 for 3 s (refilled); physical none; silenced, none', () => {
  const bb = E3[ACREFM].talents.bb;
  assert.deepEqual([bb['refracting.magic_resistance'], bb['refracting.attack_speed'], bb['refracting.duration']], [70, -50, 3]);
  const { h } = waveField([ACREFM], walls([[10, 3]]));
  const e = put(h, ACREFM, [10, 7], { tag: null });
  const w = h.unit(1), aspd0 = w.s.aspd;
  h.step();
  assert.equal(e.s.res, E3[ACREFM].stats.res + 70, 'refraction');
  h.b.dealDamage(w, e, { amount: 10, type: 'phys' });
  h.b.dealDamage(w, e, { amount: 10, type: 'true' });
  h.step();
  assert.equal(w.s.aspd, aspd0, 'physical, true: nothing');
  h.b.dealDamage(w, e, { amount: 10, type: 'arts' });
  h.step();
  assert.equal(w.s.aspd, aspd0 - 50, 'arts: −50');
  runFor(h, 2);
  h.b.dealDamage(w, e, { amount: 10, type: 'arts' });
  runFor(h, 2.5);
  assert.equal(w.s.aspd, aspd0 - 50, 'a second hit refills the 3 s');
  runFor(h, 0.6);
  assert.equal(w.s.aspd, aspd0, 'and it ends 3 s after it');
  h.b.applyStatus(e, 'silence', { duration: 100, source: null });
  h.step();
  assert.equal(e.s.res, E3[ACREFM].stats.res, 'silenced: no refraction');
  h.b.dealDamage(w, e, { amount: 10, type: 'arts' });
  h.step();
  assert.equal(w.s.aspd, aspd0, 'silenced: no slow');
});

test('假想敌：镜波: knocked out, a paracurve shot to the lowest-RES enemy within 1.2 — RES +10 on its arrival, once; silenced, none', () => {
  const bb = E3[ACREFD].talents.bb;
  assert.deepEqual([bb['refracting.range_radius'], bb['refracting.acrefd[magic-resistance].magic_resistance']], [1.2, 10]);
  for (const silence of [false, true]) {
    const { h } = waveField([ACREFD, ACREFM, SNSBR], []);
    const e = put(h, ACREFD, [10, 6], { tag: null });
    const hi = put(h, ACREFM, [10, 6.5], { tag: null });   // RES 70 (折射), nearer
    const lo = put(h, SNSBR, [10, 7], { tag: null });       // RES 0, 1.0 away
    const far = put(h, SNSBR, [10, 4.5], { tag: null });    // RES 0, 1.5 away: out of reach
    const shots = fxOf(h, 'enemyShot');
    h.step();
    if (silence) h.b.applyStatus(e, 'silence', { duration: 100, source: null });
    h.step();
    killNow(h, e);
    h.step();
    if (silence) { runFor(h, 1); assert.equal(shots.length, 0, 'silenced: no shot'); assert.equal(lo.s.res, 0); continue; }
    assert.equal(shots.length, 1);
    assert.equal(shots[0].tgt, lo.id, 'the lowest RES within reach');
    assert.equal(shots[0].key, 'projectile_enemy_acrefd');
    assert.equal(lo.s.res, 0, 'not before it lands (1.0 at 4 tiles/s)');
    runFor(h, 0.3);
    assert.equal(lo.s.res, 10);
    assert.equal(far.s.res, 0); assert.equal(hi.s.res, 70);
    // a second 镜波 knocked out by the same enemy adds nothing (maxStackCnt 1)
    const e2 = put(h, ACREFD, [10, 7.5], { tag: null });
    h.step();
    killNow(h, e2);
    runFor(h, 1);
    assert.equal(lo.s.res, 10, 'one at a time');
  }
});

test('假想敌：影役: stealthed; the operators within 1.8 (+ their collider) block 1 fewer — one, however many 影役; gone with the unit leaving or the 影役', () => {
  const bb = E3[ACBLK].talents.bb;
  assert.deepEqual([bb['Aura.range_radius'], bb['Aura.block_cnt']], [1.8, -1]);
  const { h } = waveField([ACBLK], [{ chessId: 't_wall', row: 10, col: 3, uid: 1 }, { chessId: 't_wall', row: 10, col: 8, uid: 2 }]);
  const near = h.unit(1), far = h.unit(2), cap = near.s.blockCnt;
  const e = put(h, ACBLK, [10, 5], { tag: null });
  h.step(); h.step();
  assert.ok(e.s.flags.stealth, '隐匿');
  assert.equal(near.s.blockCnt, cap - 1, '2.0 away: inside (1.8 + 0.25)');
  assert.equal(far.s.blockCnt, cap, '3.0 away: outside');
  const e2 = put(h, ACBLK, [10, 4], { tag: null });
  h.step(); h.step();
  assert.equal(near.s.blockCnt, cap - 1, 'two auras: still −1');
  killNow(h, e);
  h.step(); h.step();
  assert.equal(near.s.blockCnt, cap - 1, 'the other 影役 still reaches it');
  e2.x = 7;
  h.step(); h.step();
  assert.equal(near.s.blockCnt, cap, 'out of every aura: back');
  assert.equal(far.s.blockCnt, cap - 1, '1.0 away now');
  killNow(h, e2);
  h.step(); h.step();
  assert.equal(far.s.blockCnt, cap, 'the last 影役 gone: back');
});

test('雪怪小队: its attack on a 冻结 target × 1.5 (e2c_frozen_atkscale); 冰爆源石虫·α: knocked out, ATK × 2 physical within 1.65 + 10 s cold, 1 s later', () => {
  assert.equal(E3[SNSBR].talents.bb['atkup.atk_scale'], 1.5);
  {
    const { h, hits } = waveField([SNSBR], walls([[10, 5]]));
    const e = put(h, SNSBR, [10, 7], { move: true, tag: null });
    h.runUntil(() => hits.length >= 1, 20);
    assert.ok(Math.abs(hits[0].n - E3[SNSBR].stats.atk) < 1e-6, 'plain');
    h.b.applyStatus(h.unit(1), 'freeze', { duration: 100, source: e });
    h.runUntil(() => hits.length >= 2, 20);
    assert.ok(Math.abs(hits[1].n - E3[SNSBR].stats.atk * 1.5) < 1e-6, 'frozen: × 1.5');
  }
  const bb = E3[SNSLIME2].talents.bb;
  assert.deepEqual([bb['boom.atk_scale'], bb['boom.freeze']], [2, 10]);
  // the blast is projectile_snslime's circle (1.65, not its attack range 1.9), as its 1 s life ends
  const { h, hits } = waveField([SNSLIME2], walls([[10, 4], [10, 2], [10, 7]]));
  const e = put(h, SNSLIME2, [10, 5.3], { tag: null });
  h.step();
  killNow(h, e);
  runFor(h, 0.9);
  assert.equal(hits.length, 0, 'nothing before the projectile\'s life ends');
  runFor(h, 0.2);
  assert.equal(hits.length, 1, 'the unit 1.3 away only (1.7 and 3.3 away: outside)');
  assert.equal(hits[0].t, h.unit(1));
  assert.ok(Math.abs(hits[0].n - E3[SNSLIME2].stats.atk * 2) < 1e-6);
  assert.ok(h.unit(1).s.flags.cold && !h.unit(2).s.flags.cold, 'cold on the unit hit');
});

test('萨卡兹骸骨卫士长: damage taken → its operator source ASPD −40 for 5 s, not refreshed while held; knocked out, 2 血珀 on its route', () => {
  const bb = E3[SPNSHD2].talents.bb;
  assert.deepEqual([bb['Summon.attack_speed'], bb['Summon.duration'], bb['Summon.cnt'], E3[SPNSHD2].talents.bbStr['Summon.enemy_key']], [-40, 5, 2, 'enemy_1367_dseed']);
  assert.equal(E3[SPNSHD2].stats.tauntLevel, 2);
  const { h } = waveField([SPNSHD2, 'enemy_1367_dseed'], walls([[10, 3]]));
  const e = put(h, SPNSHD2, [10, 7], { tag: null });
  const w = h.unit(1), aspd0 = w.s.aspd;
  h.step();
  h.b.dealDamage(w, e, { amount: 10, type: 'phys' });
  h.step();
  assert.equal(w.s.aspd, aspd0 - 40);
  runFor(h, 3);
  h.b.dealDamage(w, e, { amount: 10, type: 'arts' });
  runFor(h, 2.1);
  assert.equal(w.s.aspd, aspd0, 'UNIQUE: the hit at 3 s did not refresh it');
  killNow(h, e);
  runFor(h, 1);
  assert.equal(h.b.enemies.filter((o) => o.alive && o.defId === 'enemy_1367_dseed').length, 2, '2 血珀');
});

test('狂暴凶豕兽: weight 2; unblocked, 3 s, then MOVE_SPEED × (1 + 0.333 n) every 0.333 s; crash on a unit it meets walking = speed × 800; its attack while charging + speed × 600 ends the charge; a stun ends it', () => {
  const bb = E3[MHBOAR2].talents.bb;
  assert.deepEqual([bb['Rush.mhboar_t[trigger].move_speed'], bb['Rush.mhboar_t[trigger].interval'], bb['Rush.mhboar_t[trigger].trig_cnt'], bb['Rush.mhboar_t_predelay.predelay'], bb['FirstAttack.atk_scale'], bb['Crash.atk_scale']], [0.333, 0.333, 35, 3, 600, 800]);
  const base = E3[MHBOAR2].stats.moveSpeed;
  {
    // no operator: the charge builds — nothing before 3 s, a stack after
    const { h } = waveField([MHBOAR2], []);
    const e = put(h, MHBOAR2, [10, 10], { move: true, tag: null });
    assert.equal(e.blockWeight, 2);
    runFor(h, 3);
    assert.ok(Math.abs(e.s.moveSpeed - base) < 1e-9, 'the 3 s wait');
    runFor(h, 0.5);
    assert.ok(Math.abs(e.s.moveSpeed - base * (1 + 0.333)) < 1e-9, 'one stack');
    runFor(h, 0.7);
    assert.ok(Math.abs(e.s.moveSpeed - base * (1 + 0.333 * 3)) < 1e-9, 'three stacks');
    h.b.applyStatus(e, 'stun', { duration: 0.5, source: null });
    runFor(h, 0.2);
    assert.ok(!e.findBuff('ab:mhboarRush'), 'a stun ends the charge');
    runFor(h, 0.5);
    assert.ok(Math.abs(e.s.moveSpeed - base) < 1e-9, 'and a new one waits its 3 s again');
  }
  // a 1-block wall cannot block it: it walks through, crashing into it; a 3-block one blocks it — its first attack
  // carries speed × 600 and ends the charge
  const units = [{ chessId: 't_wall', row: 10, col: 8, uid: 1 }, { chessId: 't_wall', row: 10, col: 5, uid: 2 }];
  const { h, hits } = waveField([MHBOAR2], units);
  const one = h.unit(1), three = h.unit(2);
  h.b.addBuff(one, { key: 't:block1', persist: true, mods: { blockCnt: -2 } });
  h.step();
  assert.equal(one.s.blockCnt, 1);
  assert.ok(h.b.grid.isLow(10, 8) && h.b.grid.isLow(10, 5));
  const e = put(h, MHBOAR2, [10, 10], { move: true, tag: null });
  h.runUntil(() => hits.some((x) => x.t === one), 40);
  const crash = hits.find((x) => x.t === one);
  assert.ok(!e.blockedBy, 'the 1-block wall does not block it');
  assert.ok(Math.abs(crash.n - e.s.moveSpeed * 800) < 1e-6 && e.s.moveSpeed > base, 'crash: speed × 800');
  runFor(h, 1);
  assert.equal(hits.filter((x) => x.t === one).length, 1, 'once while it stays inside');
  h.runUntil(() => e.blockedBy === three, 40);
  assert.ok(e.blockedBy === three, 'the 3-block wall blocks it');
  assert.equal(hits.filter((x) => x.t === three).length, 1, 'crashing into its blocker as it walks in');
  // standing (blocked), a unit coming into the aura is not crashed (IfEnemyIsMovingBySelf)
  const [ox, oy] = [one.x, one.y];
  one.x = e.x + 0.3; one.y = e.y;
  h.step(); h.step();
  one.x = ox; one.y = oy;
  assert.equal(hits.filter((x) => x.t === one).length, 1, 'no crash while it stands');
  const speed = e.s.moveSpeed, n0 = hits.length;
  h.runUntil(() => hits.some((x, i) => i >= n0 && x.t === three && x.n > E3[MHBOAR2].stats.atk * 1.5), 20);
  const big = hits.slice(n0).filter((x) => x.t === three);
  assert.ok(big.some((x) => Math.abs(x.n - speed * 600) < 1e-6), 'its attack: + speed × 600');
  assert.ok(Math.abs(e.s.moveSpeed - base) < 1e-9, 'and the charge is over');
  assert.ok(big.filter((x) => Math.abs(x.n - E3[MHBOAR2].stats.atk) < 1e-6).length === 1, 'with its plain attack');
  runFor(h, 10);
  assert.equal(hits.slice(n0).filter((x) => x.n > E3[MHBOAR2].stats.atk * 1.5).length, 1, 'blocked, no new charge');
});

test('神勇的帕拉杜利斯: unblocked with an operator ahead on its row, 冲锋 — Skill_Begin 1 s, then Run to the marked tile; the first unit met takes ATK × 2, Skill_End 0.333 s, back to Default', () => {
  const s = E3[MNCTUR2].skills.find((x) => x.prefabKey === 'rush');
  assert.deepEqual([s.cooldown, s.initCooldown, E3[MNCTUR2].talents.bb['CollideChar.atk_scale_collide']], [10, 5, 2]);
  // behind it (to its right) a unit it never charges; ahead (left, its way) the target
  const { h, hits } = waveField([MNCTUR2], walls([[10, 3], [10, 10]]));
  const ahead = h.unit(1), behind = h.unit(2);
  const e = put(h, MNCTUR2, [10, 9], { move: true, tag: null });
  const casts = [];
  onSkill(h, e, (a) => casts.push({ a, at: h.b.time }));
  h.runUntil(() => casts.length >= 1, 10);
  assert.equal(casts[0].a, 'rush');
  assert.ok(casts[0].at >= 5 - 1e-6, 'its initial cooldown');
  const x0 = e.x;
  runFor(h, 0.9);
  assert.ok(Math.abs(e.x - x0) < 1e-6 && e.mode !== 'Run', 'Skill_Begin: it stands');
  h.runUntil(() => e.mode === 'Run', 1);
  assert.deepEqual([e.trace.r, e.trace.c], [10, 3], 'to the marked tile');
  h.runUntil(() => hits.length > 0, 30);
  assert.equal(hits[0].t, ahead);
  assert.ok(Math.abs(hits[0].n - E3[MNCTUR2].stats.atk * 2) < 1e-6, 'ATK × 2');
  assert.ok(!behind.stats?.taken, 'never the unit behind');
  assert.ok(casts.some((c) => c.a === 'rushEndNormal'));
  assert.ok(e.trace == null, 'no more trace');
  runFor(h, 0.4);
  assert.ok(e.mode !== 'Run', 'back to Default after Skill_End');
  assert.equal(hits.filter((x) => x.n > E3[MNCTUR2].stats.atk * 1.5).length, 1, 'one hit');

  // a unit on a high tile ahead (row 10, column 1): it runs to the last low tile of the row (column 3), meets nobody there
  // (1.0 from the unit) and ends the charge
  const f = waveField([MNCTUR2], walls([[10, 1]]));
  const e2 = put(f.h, MNCTUR2, [10, 9], { move: true, tag: null });
  const c2 = [];
  onSkill(f.h, e2, (a) => c2.push(a));
  f.h.runUntil(() => e2.mode === 'Run', 10);
  assert.deepEqual([e2.trace.r, e2.trace.c], [10, 3], 'the last walkable tile');
  f.h.runUntil(() => c2.includes('rushEndNormal'), 20);
  assert.ok(c2.includes('rushEndNormal'), 'reaching the spot ends the charge');
  assert.ok(Math.abs(e2.x - 3) < 1e-6 && f.hits.length === 0, 'reached, nobody met');

  // stunned during Skill_Begin: the cut cast still ends with ON_CAST_END (AbilityStandard.OnCastEnd, any reason) and the
  // check buff came at the spell (the cast's start) — Run at the cut; it stands out the stun, then charges
  const g = waveField([MNCTUR2], walls([[10, 3]]));
  const e3 = put(g.h, MNCTUR2, [10, 9], { move: true, tag: null });
  const c3 = [];
  onSkill(g.h, e3, (a) => c3.push(a));
  g.h.runUntil(() => c3.length >= 1, 10);
  runFor(g.h, 0.3);
  g.h.b.applyStatus(e3, 'stun', { duration: 1.5, source: null });
  g.h.step();
  assert.ok(e3.mode === 'Run' && e3.trace && e3.trace.c === 3, 'cut: Run at once, to the marked tile');
  const x3 = e3.x;
  runFor(g.h, 1.3);
  assert.ok(Math.abs(e3.x - x3) < 1e-6 && g.hits.length === 0, 'stunned: it stands');
  g.h.runUntil(() => g.hits.length > 0, 20);
  assert.ok(g.hits[0].t === g.h.unit(1) && Math.abs(g.hits[0].n - E3[MNCTUR2].stats.atk * 2) < 1e-6, 'then the charge hits');
  assert.ok(c3.includes('rushEndNormal'));
  // killed during Skill_Begin: CheckUnitAlive — no Run
  const k = waveField([MNCTUR2], walls([[10, 3]]));
  const e4 = put(k.h, MNCTUR2, [10, 9], { move: true, tag: null });
  const c4 = [];
  onSkill(k.h, e4, (a) => c4.push(a));
  k.h.runUntil(() => c4.length >= 1, 10);
  k.h.b.kill(e4, null);
  k.h.step();
  assert.ok(e4.mode !== 'Run' && !e4.trace, 'dead: no Run');
});

// ---------------------------------------------------------------------------------------------------------------
// the main-story enemies only 规程's 悬赏 cards bring (content/enemies/bounty.js; 搏命养家者 / 赏金猎人“骑士” in special.js)

/** Every fx of `kind` (and `sub` kind) the battle sends from now. */
function fxLog(h, kind, sub = null) {
  const out = [], orig = h.b.fx.bind(h.b);
  h.b.fx = (k, p) => { if (k === kind && (!sub || (p && p.kind === sub))) out.push({ ...p, at: h.b.time }); return orig(k, p); };
  return out;
}

test('开天汽水瓶: loses 120 HP a second (sourceless); every 0.5 s MOVE_SPEED × (1 + 0.3 n), n ≤ 25 — a stun starts it over', () => {
  const key = 'enemy_10146_nscola', bb = E3[key].talents.bb;
  assert.deepEqual([bb['Passive.fixed_value_damage'], bb['Passive.enemy_nscola[speed].move_speed'], bb['Passive.enemy_nscola[speed].interval'], bb['Passive.enemy_nscola[speed].max_time']], [120, 0.3, 0.5, 25]);
  const { h } = waveField([key], []);
  const e = put(h, key, [10, 12], { move: true, tag: null });
  const hp0 = e.hp, base = e.s.moveSpeed;
  runFor(h, 1.05);
  assert.ok(Math.abs(hp0 - e.hp - 120) < 1e-6, `1 s: 120 lost (${hp0 - e.hp})`);
  assert.ok(Math.abs(e.s.moveSpeed - base * 1.6) < 1e-9, 'two steps: × 1.6');
  h.b.applyStatus(e, 'stun', { duration: 0.6, source: null });   // over its next step (1.5 s)
  runFor(h, 0.6);
  assert.ok(Math.abs(e.s.moveSpeed - base) < 1e-9, 'stunned at its step: back to 1');
  runFor(h, 0.5);
  assert.ok(Math.abs(e.s.moveSpeed - base * 1.3) < 1e-9, 'then again from 1');
});

test('遮天面包机: every 2.5 s (the first 2.5 s in) a bomb on the spot under it — 0.5 s later ATK × 2 physical on the ground units within 1', () => {
  const key = 'enemy_10147_nsbomb', bb = E3[key].talents.bb;
  assert.deepEqual([bb['Passive.interval'], bb['Passive.range_radius'], bb['Passive.atk_scale']], [2.5, 1, 2]);
  const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 10, col: 6, uid: 1 }, { chessId: 't_wall', row: 10, col: 8, uid: 2 }]);
  const booms = fxLog(h, 'explode', 'nsbomb');
  const e = put(h, key, [10, 6.5], { tag: null });
  const t0 = h.b.time;
  h.runUntil(() => booms.length >= 1, 10);
  assert.ok(Math.abs(booms[0].at - t0 - 3) < 0.05, `the first lands 2.5 + 0.5 s in (${booms[0].at - t0})`);
  assert.equal(hits.length, 1, 'one unit within 1');
  assert.ok(hits[0].t === h.unit(1) && Math.abs(hits[0].n - e.s.atk * 2) < 1e-6, 'ATK × 2 on the near one');
  h.runUntil(() => booms.length >= 2, 10);
  assert.ok(Math.abs(booms[1].at - booms[0].at - 2.5) < 0.05, 'every 2.5 s');
});

test('遮天面包机: stunned it still drops its bombs (TriggerAbility `_checkCanUseAblityFlag` off, no stun test on the cast)', () => {
  const key = 'enemy_10147_nsbomb';
  const { h, hits } = waveField([key], [{ chessId: 't_wall', row: 10, col: 6 }]);
  const booms = fxLog(h, 'explode', 'nsbomb');
  const e = put(h, key, [10, 6], { tag: null });
  h.b.applyStatus(e, 'stun', { duration: 20, source: null });
  assert.ok(e.s.flags.stun);
  runFor(h, 5.6);
  assert.ok(e.s.flags.stun, 'still stunned');
  assert.equal(booms.length, 2, 'two bombs in 5.6 s');
  assert.equal(hits.length, 2);
});

test('炫目刀技厨师: the ground enemies within 2.5 — itself too — ASPD +50, RES +25; a flyer or one farther, not', () => {
  const key = 'enemy_10229_agactr_2', other = 'enemy_1424_lrboom', fly = 'enemy_10146_nscola';
  const bb = E3[key].talents.bb;
  assert.deepEqual([bb['AuraAttributeUp.range_radius'], bb['AuraAttributeUp.attack_speed'], bb['AuraAttributeUp.magic_resistance']], [2.5, 50, 25]);
  const { h } = waveField([key, other, fly], []);
  const cook = put(h, key, [10, 8], { tag: null }), near = put(h, other, [10, 10], { tag: null });
  const far = put(h, other, [10, 4], { tag: null }), air = put(h, fly, [10, 9], { tag: null });
  runFor(h, 0.5);
  for (const [u, k, on] of [[cook, key, true], [near, other, true], [far, other, false], [air, fly, false]]) {
    assert.equal(u.s.aspd, E3[k].stats.aspd + (on ? 50 : 0), `${k} aspd`);
    assert.equal(u.s.res, E3[k].stats.res + (on ? 25 : 0), `${k} res`);
  }
});

test('内测版自助出餐终端: unblocked it never swings; Spawn (Skill clip, 3 s in, then 5 s after each cast) — one 迷茫的修理小助手 at its clip event', () => {
  const key = 'enemy_10077_mpbarr', kid = 'enemy_10073_mpcar';
  assert.equal(E3[key].skills[0].bbStr.enemy_key, kid);
  const { h } = waveField([key, kid], []);
  const kids = () => h.b.enemies.filter((x) => x.alive && x.defId === kid);
  const e = put(h, key, [10, 10], { tag: null });
  const t0 = h.b.time;
  h.runUntil(() => kids().length >= 1, 10);
  assert.ok(Math.abs(h.b.time - t0 - 3.9) < 0.1, `first at 3 + 0.9 s (${h.b.time - t0})`);
  assert.ok(kids()[0].route, 'on a route');
  h.runUntil(() => kids().length >= 2, 15);
  assert.ok(Math.abs(h.b.time - t0 - 11.4) < 0.15, `second at 3 + 2.5 + 5 + 0.9 s (${h.b.time - t0})`);
  assert.ok(e.alive);
});

test('破城者: weight 3; SkyProjectile (10 s, the first 5 s in) — up to 3 missiles 0.2 s apart, each on a ground unit not hit yet, landing 0.6 s later: ATK × 0.7 physical within 1.1', () => {
  const key = 'enemy_10123_uareap';
  assert.equal(E3[key].skills[0].bb.atk_scale, 0.7);
  const run = (cols) => {
    const { h, hits } = waveField([key], cols.map((c, i) => ({ chessId: 't_wall', row: 10, col: c, uid: i + 1 })));
    const booms = fxLog(h, 'explode', 'uareap'), casts = fxLog(h, 'enemySkill');
    const e = put(h, key, [10, 7], { tag: null });
    assert.equal(e.blockWeight, 3);
    h.runUntil(() => booms.length >= 1, 10);
    const anim = e.skillAnimUntil;
    runFor(h, 1);
    return { h, hits: hits.filter((x) => x.at >= booms[0].at - 1e-9 && x.at <= booms[0].at + 0.5), booms, e, casts, anim };
  };
  {
    const { booms, h, hits, e, casts, anim } = run([6, 8]);
    assert.equal(casts.length, 1);
    // one F_Skill clip over the whole sequence: the buff's two fixed updates + the clip (2.233 s), not castSkill's 0.5 s
    assert.ok(Math.abs(anim - casts[0].at - (2 * TICK + 2.233)) < 1e-6, `skill clip to the cast's end (${anim - casts[0].at})`);
    assert.equal(booms.length, 2, 'two units in range: two missiles');
    assert.ok(Math.abs(booms[1].at - booms[0].at - 0.2) < 0.02, '0.2 s apart');
    assert.notEqual(booms[0].x, booms[1].x, 'each on another unit');
    for (const u of [h.unit(1), h.unit(2)]) assert.ok(hits.some((x) => x.t === u && Math.abs(x.n - e.s.atk * 0.7) < 1e-6), 'ATK × 0.7');
  }
  assert.equal(run([5, 6, 8, 9]).booms.length, 2, 'a unit farther than 1.7 + 0.25 is not shot');
});

test('聆风猎手: hit by a unit while not blocked → blinks onto that unit\'s tile (the nearest ground tile), its attack ready; 30 s before the next', () => {
  const key = 'enemy_2135_shkrbt';
  assert.equal(E3[key].skills[0].bb.cooldown, 30);
  const { h } = waveField([key], [{ chessId: 't_wall', row: 10, col: 4, uid: 1 }, { chessId: 't_wall', row: 11, col: 2, uid: 2 }]);
  const e = put(h, key, [10, 12], { tag: null });
  h.step();
  h.b.dealDamage(h.unit(1), e, { amount: 10, type: 'phys', canDodge: false });
  assert.deepEqual([e.x, e.y], [4, 10], 'onto the low tile of its attacker');
  assert.equal(e.atkCd, 0);
  e.x = 12; e.y = 10;
  h.b.dealDamage(h.unit(2), e, { amount: 10, type: 'phys', canDodge: false });
  assert.deepEqual([e.x, e.y], [12, 10], 'cooling down: stays');
  runFor(h, 30);
  if (e.blockedBy) h.b._unblock(e);
  e.x = 12; e.y = 10;
  h.b.dealDamage(h.unit(2), e, { amount: 10, type: 'phys', canDodge: false });
  assert.ok(h.b.grid.groundPassable(Math.round(e.y), Math.round(e.x)) && !(e.x === 2 && e.y === 11), 'the attacker on a high tile: the nearest ground tile');
  assert.ok(Math.hypot(e.x - 2, e.y - 11) <= 1 + 1e-9, `next to it (${e.x}, ${e.y})`);
});

test('暴走食人花: a unit within 1 (blocked or not) is bitten — Attack_Begin 1.5 s, at 0.8 s devoured (killed); then 20 s digesting (mode Eat, no move, stun-immune); then again', () => {
  const key = 'enemy_10003_trwlpl_2';
  assert.equal(E3[key].skills.find((s) => s.prefabKey === 'Eat').bb.duration, 20);
  const { h } = waveField([key], [{ chessId: 't_wall', row: 10, col: 7, uid: 1 }, { chessId: 't_wall', row: 10, col: 9, uid: 2 }]);
  const e = put(h, key, [10, 8], { tag: null });
  const t0 = h.b.time;
  h.runUntil(() => !h.unit(1).alive || !h.unit(2).alive, 5);
  assert.ok(Math.abs(h.b.time - t0 - 0.8) < 0.1, `devoured at the clip's event (${h.b.time - t0})`);
  runFor(h, 1);
  assert.equal(e.mode, 'Eat', 'digesting');
  assert.ok(e.s.flags.noMove);
  assert.equal(h.b.applyStatus(e, 'stun', { duration: 1, source: null }), false, 'stun-immune meanwhile');
  assert.equal(h.b.applyStatus(e, 'fear', { duration: 1, source: null }), false, 'and fear-immune (enemy_trwlpl_s), unlike its bite');
  const left = [h.unit(1), h.unit(2)].find((u) => u.alive);
  runFor(h, 15);
  assert.ok(left.alive, 'no bite while it digests');
  h.runUntil(() => !left.alive, 10);
  assert.ok(h.b.time - t0 > 21.5, `the next after 1.5 + 20 s (${h.b.time - t0})`);
});

test('搏命养家者 (the 悬赏 card\'s) = 搏命享受者\'s aura: itself and the enemies within 1.7 take damage × 0.75', () => {
  const key = 'enemy_10196_ubba';
  assert.equal(E3[key].talents.bb['Talent1.damage_resistance'], 0.25);
  const { h } = waveField([key], [{ chessId: 't_wall', row: 12, col: 4, uid: 1 }]);
  const e = put(h, key, [10, 8], { tag: null });
  runFor(h, 0.5);
  const hp = e.hp;
  h.b.dealDamage(h.unit(1), e, { amount: 1000, type: 'arts', canDodge: false });
  assert.ok(Math.abs(hp - e.hp - 1000 * (1 - E3[key].stats.res / 100) * 0.75) < 1e-6);
});

test('赏金猎人“骑士”: as 萨卡兹穿刺手 — accelerating while free, its first hit after the block adds move speed × 550 ARTS damage and ends the rush', () => {
  const key = 'enemy_1413_mmstck', bb = E3[key].talents.bb;
  assert.deepEqual([bb['Rush.enemy_mmstck_t[trigger].move_speed'], bb['Rush.enemy_mmstck_t[trigger].trig_cnt'], bb['FirstAttack.atk_scale']], [0.5, 25, 550]);
  const { h } = waveField([key], [{ chessId: 't_wall', row: 10, col: 5, uid: 1 }]);
  const rush = [];
  h.b.on('damaged', (c) => { if (c.dmg && c.dmg.tags && c.dmg.tags.includes('rush')) rush.push(c.dmg.type); });
  const e = put(h, key, [10, 12], { move: true, tag: null });
  runFor(h, 1.05);
  assert.ok(e.s.moveSpeed > E3[key].stats.moveSpeed * 1.9, 'two layers: × 2');
  h.runUntil(() => rush.length >= 1, 40);
  assert.deepEqual(rush, ['arts']);
  assert.ok(!e.findBuff('ab:rush'), 'the rush ends');
});

test('规程 补给线 leaves the leaders\' summons 刺胄之弹 and “裂管之音”/“断弦之音” out (enemy_exclude): their HP takes the round without its 补给线 share; 盟约 and the other summons keep it', () => {
  const SHELL = 'enemy_9016_acstmr', ECHO = 'enemy_9023_acdums', YOKAI = 'enemy_1005_yokai';
  // the data: 规程's 补给线 / 补给线II add the two summons to enemy_exclude, 盟约's do not
  const ex = (D, id) => D.effects[id].buffs.flatMap((b) => String(b.bbStr?.enemy_exclude ?? '').split('|'));
  for (const id of ['aceffect_enemy_2', 'aceffect_enemy_2_2']) {
    assert.ok(ex(ACT3, id).includes(SHELL) && ex(ACT3, id).includes(ECHO), `规程 ${id}`);
    assert.ok(!ex(BASE, id).includes(SHELL) && !ex(BASE, id).includes(ECHO), `盟约 ${id}`);
  }
  // co-op 终极's boss round carries a 补给线 share (config enemyScale supplyHp)
  assert.ok(ACT3.config.modes.mode_multi_abyss.enemyScale['14'].supplyHp > 1);
  const enemyScale = { hpMul: 2.6, atkMul: 1.5, speedMul: 1.3, supplyHpMul: 1.3 };
  // the season's level (its branches: 死亡集群's boss_summon_enemy, 管's summon_enemy — the spawns go through branchSpawn)
  const field = (season, keys, tpl) => {
    const id = `${season === ACT3 ? 'act3autochess' : 'act1autochess'}_${tpl}`;
    assert.ok(season.waves[id], id);
    const h = bossArena(season, keys, {
      flags: { enemyScale }, units: [{ chessId: 't_wall', row: 10, col: 6 }], setup: (b) => { b.opts.templateId = id; },
      defs: { chess: { t_wall: WALL('t_wall'), t_wall2: WALL('t_wall2', { def: 900 }) }, enemies: Object.fromEntries(keys.map((k) => [k, season.enemies[k]])), waves: { [id]: season.waves[id] }, effects: season.effects },
    });
    h.step();
    return h;
  };
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, b), `${msg}: ${a} ≈ ${b}`);
  for (const [season, name, cut] of [[ACT3, '规程', true], [BASE, '盟约', false]]) {
    const E = season.enemies;
    const h = field(season, ['enemy_9013_acstmk', SHELL, YOKAI], 'h07_01');
    put(h, 'enemy_9013_acstmk', [3, 10], { tag: 'boss' }).profile.noAttack = true;
    assert.ok(h.runUntil(() => alive(h, SHELL).length > 0 && alive(h, YOKAI).length > 0, 120), `${name}: 刺胄之弹 and 死亡集群`);
    const shell = alive(h, SHELL)[0], yokai = alive(h, YOKAI)[0];
    assert.equal(shell.s.maxHp, Math.ceil(E[SHELL].stats.maxHp * (cut ? 2.6 / 1.3 : 2.6) - 1e-9), `${name} 刺胄之弹 hits`);   // 频次: whole hits (setHits)
    assert.equal(shell.mods.supplyHpMul, cut ? undefined : 1.3, `${name} 刺胄之弹 share`);
    near(shell.base.atk, E[SHELL].stats.atk * 1.5, `${name} 刺胄之弹 ATK (攻坚装备 kept)`);
    const ratio = E.enemy_9013_acstmk.skills.find((s) => s.prefabKey === '2').bb['summon.hp_ratio'] ?? 1;
    near(yokai.s.maxHp, E[YOKAI].stats.maxHp * 2.6 * ratio, `${name} 妖怪 HP: the whole round (not excluded)`);
    const p = field(season, ['enemy_9021_acduml', ECHO], 'h07_03');
    put(p, 'enemy_9021_acduml', [3, 10], { tag: 'boss' });
    assert.ok(p.runUntil(() => alive(p, ECHO).length > 0, 120), `${name}: 假想敌：管 summons`);
    assert.equal(alive(p, ECHO)[0].s.maxHp, Math.ceil(E[ECHO].stats.maxHp * (cut ? 2.6 / 1.3 : 2.6) - 1e-9), `${name} 余音 hits`);
  }
});

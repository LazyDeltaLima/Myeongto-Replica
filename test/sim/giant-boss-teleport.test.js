// Giant bosses are never moved by a 强制位移 to a tile (docs/rules/sim.md 「거대 보스」): the client's ForceSetToTilePosition —
// 余 S2 (yu_s_2[try_tp]) and 黍 S3's mark (shu_s_3[enemy][mark]) — does nothing to an `isGiantBoss` unit (a prefab whose root
// is EnemyGiantBoss), and 克莱门莎 S2's cabin follows the same rule [ASSUMED, CN-only mover]. The kits once looked at 自缚
// (`selfBound`) only, so 规程's 假想敌：械 — held by 束缚 alone — was teleported onto 余 (a maintainer report). Data: enemies.json
// `giantBoss`, read from the prefab by tools/local-extract/enemy_bindings.py (tools/build-data.mjs enemyGiantBoss).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../../server/data.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const SEASONS = hasGeneratedData() ? [['default', getData({ log: quiet })], ['act3autochess', getData({ log: quiet, season: 'act3autochess' })]] : [];
/** Every giant boss record of both seasons: [season, key, record]. */
const GIANTS = SEASONS.flatMap(([s, d]) => Object.values(d.enemies).filter((e) => e.giantBoss).map((e) => [s, e.key, e]));
const CAUSE = 'a giant boss (data `giantBoss`: EnemyGiantBoss prefab) must never be moved by a 强制位移 to a tile — docs/rules/sim.md 「거대 보스」';
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
/** A giant boss record that stands still and does no harm (its own data otherwise: `giantBoss`, `hitArea`, weight 0). */
const still = (rec, o = {}) => ({ ...rec, stats: { ...rec.stats, atk: 0, moveSpeed: 0, massLevel: 0, ...o } });

test('the giant bosses of the data: the EnemyGiantBoss prefabs, each with its HP panel and its root box as hit area (and 冲击之械, a root box without the class)', REAL, () => {
  const keys = [...new Set(GIANTS.map(([, k]) => k))].sort();
  assert.deepEqual(keys, [
    'enemy_1521_dslily', 'enemy_9013_acstmk', 'enemy_9013_acstmk_2', 'enemy_9021_acduml', 'enemy_9021_acduml_2',
    'enemy_9029_acfnc', 'enemy_9029_acfnc_2', 'enemy_9032_aclionk', 'enemy_9033_acdeer', 'enemy_9035_acspider', 'enemy_9035_acspider_2',
  ]);
  const boxOnly = [];
  for (const [s, d] of SEASONS) {
    for (const e of Object.values(d.enemies)) {
      if (e.giantBoss) assert.ok(e.hitArea, `${s} ${e.key}: a giant boss has its root box as hit area`);
      else if (e.hitArea) boxOnly.push(`${s} ${e.key}`);
    }
  }
  // any prefab root BoxCollider2D is a hit area (the ENEMY-layer root collider every range meets), EnemyGiantBoss or not
  assert.deepEqual(boxOnly, ['act3autochess enemy_9027_acfnca'], 'a hit area without giantBoss: only 冲击之械 (docs/rules/sim.md 「거대 보스」)');
  assert.deepEqual(SEASONS[1][1].enemies.enemy_9027_acfnca.hitArea, { w: 1, h: 2.95, dx: 0, dy: 0 }, '冲击之械: its prefab root box 1 × 2.95');
  for (const [s, k, e] of GIANTS) {
    assert.ok(e.giantBoss.sx > 0 && e.giantBoss.off.length === 2, `${s} ${k}: HP panel`);
    assert.deepEqual([e.hitArea.w, e.hitArea.h, e.hitArea.dy], [4.95, 2.95, 1], `${s} ${k}: PRTS 巨型单位 4.95 × 2.95, 1.0 up`);
    assert.equal(e.hitArea.dx, k === 'enemy_9021_acduml_2' ? 1 : 0, `${s} ${k}: 隐秘核心 1.0 right`);
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// 余 S2: every giant boss of both seasons on his x-1, beside a regular enemy that is teleported

const YU = 'chess_char_6_03_a';
const hold = (r, c) => ({ motion: 'WALK', start: [r, c], end: [9, 2], checkpoints: [{ type: 'WAIT', time: 99 }] });

/** Its record under another key: no boss kit attaches (content/bosses.js keys its kits and SELF_BOUND by enemy id). */
const bare = (k) => k.replace(/^enemy_/, 'enemy_bare_');

test('余 S2 teleports a ground enemy of x-1 onto his tile, never a giant boss of either season (its record alone: no boss kit)', REAL, () => {
  let ran = 0;
  for (const [s, k, rec] of GIANTS) {
    const h = makeBattle({
      seed: 5, timeLimit: 120, autoFinish: false,
      defs: { enemies: { [bare(k)]: { ...still(rec), key: bare(k) }, enemy_regular: enemyRec({ key: 'enemy_regular', hp: 1e6, speed: 0 }) } },
      units: [{ chessId: YU, row: 10, col: 5, dir: 'RIGHT', skillIndex: 1, carryState: { sp: 999 } }],
      enemies: [{ key: bare(k), route: hold(10, 7), time: 0 }, { key: 'enemy_regular', route: hold(11, 6), time: 0 }],
    });
    h.step(1);
    const yu = h.unit(YU);
    const [g, r] = [bare(k), 'enemy_regular'].map((x) => h.b.enemies.find((e) => e.defId === x));
    assert.ok(g.def.giantBoss && !g.s.flags.selfBound && !g.s.flags.noMove, `${s} ${k}: a giant boss record, nothing else holding it`);
    const at = [g.x, g.y];
    h.b.dealDamage(r, yu, { amount: 1, type: 'phys' });   // TAKE_DAMAGE
    assert.ok(yu.skill.active && yu.skill.id === 'skchr_yu_2', `${s} ${k}: S2 cast`);
    h.castStrike(yu);
    assert.deepEqual([r.y, r.x], [yu.tileR, yu.tileC], `${s} ${k}: the regular enemy is teleported onto 余`);
    assert.deepEqual([g.x, g.y], at, `${s} ${k}: ${CAUSE}`);
    assert.ok(!h.eventsOf('fx').some((f) => f[1] === 'teleport' && f[4].id === g.id), `${s} ${k}: no teleport fx for it`);
    done(h);
    ran++;
  }
  assert.ok(ran >= 11, `every giant boss ran (${ran})`);
});

test('余 S2 on 规程\'s 假想敌：械 with its own kit (束缚 only, not 自缚): it stays on its tile (full content: his kit and its kit)', REAL, () => {
  const ACT3 = SEASONS[1][1];
  for (const key of ['enemy_9029_acfnc', 'enemy_9029_acfnc_2']) {
    const h = makeBattle({
      seed: 7, autoFinish: false, timeLimit: 600,
      kind: 'boss', sharedBoss: { hp: 1e7, maxHp: 1e7, damage(_pid, a) { this.hp = Math.max(0, this.hp - a); } }, enemies: [],
      stage: ACT3.stages.act3autochess_m01,   // its own field: the boss on (3, 10), ground below it on row 5
      defs: { enemies: { [key]: ACT3.enemies[key], enemy_regular: enemyRec({ key: 'enemy_regular', hp: 1e6, speed: 0 }) } },
      units: [{ chessId: YU, row: 5, col: 10, dir: 'RIGHT', skillIndex: 1, carryState: { sp: 999 } }],
      setup(b) { b.opts.waveTemplate = ACT3.waves.act3autochess_h07_08; },
    });
    h.step();
    const boss = h.spawn(key, { pos: [3, 10], routeIndex: 0, tag: 'boss' });   // on 余's x-1 (two rows up)
    const r = h.spawn('enemy_regular', { pos: [5, 9], routeIndex: 0, mods: { speedMul: 0 } });
    h.step();
    const yu = h.unit(YU);
    assert.ok(boss.s.flags.bind && boss.s.flags.noMove && !boss.s.flags.selfBound, `${key}: held by 束缚 (kitMachine), not 自缚`);
    const at = [boss.x, boss.y];
    h.b.dealDamage(r, yu, { amount: 1, type: 'phys' });
    assert.ok(yu.skill.active && yu.skill.id === 'skchr_yu_2', `${key}: S2 cast`);
    h.castStrike(yu);
    assert.deepEqual([r.y, r.x], [yu.tileR, yu.tileC], `${key}: the regular enemy is teleported (the path is open)`);
    assert.deepEqual([boss.x, boss.y], at, `${key}: ${CAUSE}`);
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// 克莱门莎 S2's cabin: every giant boss (weight 0 here, so the weight cap cannot hide it) stays out

test('克莱门莎 S2 boards a light enemy, never a giant boss of either season', REAL, () => {
  let ran = 0;
  for (const [s, k, rec] of GIANTS) {
    const h = makeBattle({
      seed: 23, autoFinish: false, timeLimit: 180,
      defs: { enemies: { [bare(k)]: { ...still(rec), key: bare(k) }, light: enemyRec({ key: 'light', hp: 1e8, speed: 0, mass: 3 }) } },
      units: [{ uid: 1, diy: { slot: 6, charId: 'char_4231_clemnt', skillIndex: 1 }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }],
    });
    h.step();
    const u = h.unit(1);
    const g = h.spawn(bare(k), { pos: [10, 4] });
    const l = h.spawn('light', { pos: [10, 4] });
    u.skill.gainSp(999, 'init');
    assert.equal(u.skill.activate('test'), true);
    h.runUntil(() => !u.skill._begin, 3);
    h.run(0.7);
    const p = u.mem.clemntCabin?.passengers ?? [];
    assert.ok(p.includes(l), `${s} ${k}: the light enemy rides`);
    assert.ok(!p.includes(g), `${s} ${k}: ${CAUSE}`);
    done(h);
    ran++;
  }
  assert.ok(ran >= 11, `every giant boss ran (${ran})`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 黍 S3's mark: a walking enemy that is a giant boss is marked but never put back

test('黍 S3: a marked enemy walking max_distance away is put back, unless it is a giant boss', REAL, () => {
  const GIANT = SEASONS[1][1].enemies.enemy_9029_acfnc.giantBoss;
  const ally = chessRec({ id: 't_a', skill: null, stats: { maxHp: 10000, atk: 0, def: 0, blockCnt: 0, respawnTime: 5 } });
  for (const giant of [false, true]) {
    const walk = { ...enemyRec({ key: 'enemy_walk', hp: 1e9, speed: 1, mass: 0 }), ...(giant ? { giantBoss: GIANT } : {}) };
    const h = makeBattle({
      defs: { enemies: { enemy_walk: walk }, chess: { t_a: ally } }, timeLimit: 900, autoFinish: false, seed: 5,
      flags: { dpPerSec: 0, dpMax: 999 },
      units: [{ uid: 1, diy: { slot: 'chess_char_5_diy1_a', charId: 'char_2025_shu', skillIndex: 2 }, elite: false, row: 10, col: 5 },
        { uid: 2, chessId: 't_a', row: 11, col: 7 }],
    });
    h.step();
    const u = h.unit(1), a = h.unit(2);
    // sow row 9 cols 6-8 around (9, 7) with a heal of hers (the ally there for the moment)
    h.b.relocate(a, 9, 7);
    h.b.heal(u, a, 1);
    h.b.relocate(a, 11, 7);
    a.hp = a.s.maxHp * 0.5;   // S3 casts for an injured ally of x-2
    u.skill.gainSp(999, 'init');
    assert.ok(h.runUntil(() => u.skill.active, 1), 'S3 cast');
    const w = h.spawn('enemy_walk', { routeIndex: 0 });
    assert.equal(!!w.def.giantBoss, giant);
    assert.ok(h.runUntil(() => u.mem.shuMarks?.has(w.id), 15), `${giant ? 'giant' : 'regular'}: marked on a sown tile`);
    const m = u.mem.shuMarks.get(w.id);
    let ported = false, farthest = m.c;
    for (let i = 0; i < 600 && !ported; i++) {
      h.step();
      const c = Math.round(w.x);
      farthest = Math.min(farthest, c);
      if (c === m.c && farthest < m.c) ported = true;
    }
    if (giant) {
      assert.ok(!ported && farthest <= m.c - 4, `${CAUSE} (walked on to column ${farthest})`);
      assert.ok(!h.eventsOf('fx').some((f) => f[1] === 'teleport' && f[4].id === w.id), 'no teleport fx');
    } else {
      assert.ok(ported, 'the regular enemy is put back on its sown tile');
    }
    checkInvariants(h.b);
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
  }
});

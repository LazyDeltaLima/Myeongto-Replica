// The enemy collider in operator ranges (maintainer decision 2026-10-17). The official client gives the enemy prefabs a
// CircleCollider2D of radius 0.1, and an operator's normal-attack search is a 2D physics overlap of its range's tile
// boxes with that circle (PRTS 作战机制 "索敌抬手等均使用碰撞箱"; official client, maintainer's notes): an attack range,
// and a skill's attack range, take an enemy within 0.1 of one of their tiles. A MANUAL skill's automatic cast on its
// rangeId tiles (`LitePhysicsUtil._CheckContainsPosition`) checks the tile of the enemy's position only, and so do the tile
// rules; blocking keeps the centre distance. Upstream 5bf337a5 (its tests adapted: its skill trigger took the collider).
// Run: node --test test/sim/collider-range.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { colliderKeys, bodyInRange, bodyInRangeTile, bodyInKeys, bodyKeys } from '../../server/sim/body.js';
import { COLS, ENEMY_COLLIDER_RADIUS, BLOCK_RADIUS } from '../../server/sim/constants.js';
import { absoluteRangeKeys } from '../../server/sim/targeting.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const tiles = (u) => colliderKeys(u).map((k) => [Math.floor(k / COLS), k % COLS]);
const foe = (x, y) => ({ x, y, side: 'enemy' });
const bodyKeysOf = (u) => bodyKeys(u).sort((a, b) => a - b);

test('colliderKeys: the tile of the position, and a neighbour only when the 0.1 circle overlaps it (touching does not)', () => {
  assert.equal(ENEMY_COLLIDER_RADIUS, 0.1);
  assert.deepEqual(tiles(foe(3, 4)), [[4, 3]]);
  assert.deepEqual(tiles(foe(3.45, 4)), [[4, 3], [4, 4]], '0.05 from the edge: both columns');
  assert.deepEqual(tiles(foe(3.4, 4)), [[4, 3]], 'exactly 0.1 from the edge: touching only');
  assert.deepEqual(tiles(foe(3.6, 4)), [[4, 4]]);
  assert.deepEqual(tiles(foe(2.5, 4)), [[4, 2], [4, 3]], 'on the edge (the tile rule says column 2, half to even)');
  assert.deepEqual(tiles(foe(3.41, 4.41)), [[4, 3], [4, 4], [5, 3]], 'the corner is 0.127 away: no diagonal tile');
  assert.deepEqual(tiles(foe(3.47, 4.47)), [[4, 3], [4, 4], [5, 3], [5, 4]], 'the corner is 0.042 away: the diagonal too');
  assert.deepEqual(tiles(foe(-0.55, 4)), [[4, 0]], 'off the grid, its circle still reaches column 0');
  // an ally stands on its tile; a huge enemy's rectangle is its collider (no circle added)
  assert.deepEqual(tiles({ x: 3.45, y: 4, side: 'ally' }), [[4, 3]]);
  const huge = { x: 10, y: 9, side: 'enemy', hitArea: { w: 4.95, h: 2.95, dx: 0, dy: 1 } };
  assert.deepEqual(colliderKeys(huge).length, 15);
  // the helpers
  assert.ok(bodyInRange(foe(3.45, 4), [4 * COLS + 4]) && !bodyInKeys(foe(3.45, 4), [4 * COLS + 4]));
  assert.ok(bodyInRangeTile(foe(3.45, 4), 4, 4) && !bodyInRangeTile(foe(3.45, 4), 4, 5) && !bodyInRangeTile(foe(3, 4), -1, 3));
});

const RANGE = [[0, 0], [0, 1], [0, 2]];
const SN = chessRec({ id: 'sn', profession: 'SNIPER', skill: null, rangeGrid: RANGE, stats: { atk: 100, bat: 1, blockCnt: 0, def: 0 } });
const GD = chessRec({ id: 'gd', profession: 'WARRIOR', skill: null, rangeGrid: [[0, 0], [0, 1]], stats: { atk: 1, bat: 1, blockCnt: 1, maxHp: 1e7, def: 0 } });
// a MANUAL skill on the basic strategy, ready at once: with a rangeId (the data's customRangeGrid = its range) or without
const skilled = (id, customRangeGrid) => chessRec({
  id, profession: 'SNIPER', rangeGrid: RANGE, stats: { atk: 100, bat: 1, blockCnt: 0, def: 0 },
  skill: { spCost: 1, initSp: 1, duration: 5, trigger: customRangeGrid ? { rule: 'DEFAULT', customRangeGrid } : { rule: 'DEFAULT' } },
});
const ENEMIES = {
  walker: enemyRec({ key: 'walker', hp: 1e7, atk: 0, speed: 1 }),
  still: enemyRec({ key: 'still', hp: 1e7, atk: 0, speed: 0 }),
};

function arena(units, enemies) {
  const h = makeBattle({
    autoFinish: false, timeLimit: 60, flags: { bornTime: 0 }, hooks: ['skillStart'], captureNoisy: true,
    defs: { chess: { sn: SN, gd: GD, sk_rid: skilled('sk_rid', RANGE), sk_def: skilled('sk_def', null) }, enemies: ENEMIES }, units, enemies,
  });
  const hits = [];
  h.b.on('damaged', (c) => { if (c.dmg?.isAttack) hits.push({ src: c.source?.id ?? null, tgt: c.target.id }); });
  return { h, hits };
}
/** Hold the first enemy at (x, 10) for this tick's index. */
const hold = (h, e, x) => { e.x = x; e.y = 10; h.step(); e.x = x; e.y = 10; };

test('a blocker on the last tile of a ranged range: the enemy it blocks stands outside that tile and is not hit', () => {
  // 狙击 on (10, 3) facing right: cols 3–5. The guard on (10, 5), the range's last tile, facing left toward the walker.
  const { h, hits } = arena(
    [{ uid: 1, chessId: 'sn', row: 10, col: 3, dir: 'RIGHT' }, { uid: 2, chessId: 'gd', row: 10, col: 5, dir: 'LEFT' }],
    [{ key: 'walker', route: { motion: 'WALK', start: [10, 9], end: [10, 0], checkpoints: [] } }],
  );
  h.step();
  const sn = h.unit(1), gd = h.unit(2), e = h.b.enemies[0];
  assert.ok(h.runUntil(() => e.blockedBy === gd, 20), 'the guard blocks the walker');
  // blocked at the contact distance (中点判定, unchanged): its centre about 0.71 past the guard's centre
  assert.ok(e.x - gd.x > 0.69 && e.x - gd.x <= BLOCK_RADIUS.ground + 1e-9, `blocked at ${(e.x - gd.x).toFixed(3)}`);
  assert.ok(e.x - ENEMY_COLLIDER_RADIUS > 5.5, 'its collider stays outside the guard\'s tile, the range\'s last');
  h.run(6);
  assert.equal(e.blockedBy, gd);
  assert.equal(hits.filter((x) => x.src === sn.id).length, 0, 'the sniper never hits it');
  assert.ok(hits.filter((x) => x.src === gd.id && x.tgt === e.id).length >= 4, 'its blocker does (blockers always hit what they block)');
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('a normal attack takes an enemy whose centre is 0.05 past the range\'s last tile; 0.15 past it is out', () => {
  for (const [x, inRange] of [[5.55, true], [5.65, false], [5.5, true], [5.45, true]]) {
    const { h, hits } = arena([{ uid: 1, chessId: 'sn', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 6] }]);
    h.step();
    const sn = h.unit(1), e = h.b.enemies[0];
    hold(h, e, x);
    assert.equal(h.b.enemiesInKeys(sn.rangeKeys, sn, sn.profile).includes(e), inRange, `x ${x}: the range`);
    // the tile rule: 5.5 rounds half to even onto column 6, outside the range
    assert.equal(h.b.enemiesOnTiles(sn.rangeKeys, sn, sn.profile).includes(e), x < 5.5, `x ${x}: the tile rule`);
    h.run(2);
    assert.equal(hits.some((d) => d.src === sn.id && d.tgt === e.id), inRange, `x ${x}: hit`);
    checkInvariants(h.b);
  }
});

test('the same enemy 0.05 past the last tile does not cast a skill on its rangeId tiles (the point); one on the tile does', () => {
  // sk_rid: MANUAL, basic strategy with a rangeId (its own 3 tiles) — the client's _CheckContainsPosition, the tile of the
  // position. Its normal attacks still hit the enemy (the collider).
  const out = arena([{ uid: 1, chessId: 'sk_rid', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 6] }]);
  out.h.step();
  const u = out.h.unit(1), e = out.h.b.enemies[0];
  hold(out.h, e, 5.55);
  assert.equal(u.skill.rule, 'DEFAULT');
  assert.ok(u.skill.triggerGrid && u.skill.ready, 'a ready skill with a trigger grid');
  for (let i = 0; i < 90; i++) hold(out.h, e, 5.55);   // 3 s: 15 automatic-operation passes
  assert.equal(out.h.hooksOf('skillStart').length, 0, 'no automatic cast: the enemy\'s position is on column 6');
  assert.ok(out.hits.some((d) => d.src === u.id && d.tgt === e.id), 'its normal attacks hit it (the collider)');
  checkInvariants(out.h.b);
  // the enemy moved 0.1 in, onto column 5: the next pass casts
  for (let i = 0; i < 9 && !out.h.hooksOf('skillStart').length; i++) hold(out.h, e, 5.45);
  assert.equal(out.h.hooksOf('skillStart').length, 1, 'cast once its position is on a rangeId tile');
  checkInvariants(out.h.b);
  // without a rangeId the basic strategy asks the attack search (the unit attacking): the collider casts it
  const def = arena([{ uid: 1, chessId: 'sk_def', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 6] }]);
  def.h.step();
  const d = def.h.b.enemies[0];
  for (let i = 0; i < 12 && !def.h.hooksOf('skillStart').length; i++) hold(def.h, d, 5.55);
  assert.equal(def.h.hooksOf('skillStart').length, 1, 'no rangeId: cast on the attack search (collider)');
  checkInvariants(def.h.b);
});

test('the SKILL_RANGE and CUSTOM_RANGE kit rules check their grid by the tile of the position too', () => {
  const { h } = arena([{ uid: 1, chessId: 'sn', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 6] }]);
  h.step();
  const sn = h.unit(1), e = h.b.enemies[0];
  hold(h, e, 5.55);
  assert.ok(h.b.enemiesInKeys(sn.rangeKeys, sn, sn.profile).includes(e), 'in the attack range');
  assert.equal(h.b.anyEnemyOnTiles(sn.rangeKeys), false, 'not on its tiles');
  hold(h, e, 5.45);
  assert.ok(h.b.anyEnemyOnTiles(sn.rangeKeys));
  // unitsInGrid (skill areas): the collider
  hold(h, e, 5.55);
  assert.ok(h.b.unitsInGrid(sn, RANGE).includes(e));
});

test('foesInColliderRadius: a radius effect PRTS marks 碰撞判定 reaches 0.1 further than foesInRadius', () => {
  const { h } = arena([{ uid: 1, chessId: 'sn', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 8] }, { key: 'still', pos: [10, 9] }]);
  h.step();
  const [a, b] = h.b.enemies;
  a.x = 8 + 1.55; a.y = 10;   // 1.55 from (8, 10)
  b.x = 8 + 1.65; b.y = 11;   // farther than 1.6
  assert.deepEqual(h.b.foesInRadius(8, 10, 1.5).map((e) => e.id), []);
  assert.deepEqual(h.b.foesInColliderRadius(8, 10, 1.5).map((e) => e.id), [a.id]);
});

test('the per-tick index (inlined for speed) lists every enemy on exactly its colliderKeys and, for tile rules, on bodyKeys', () => {
  const { h } = arena([{ uid: 1, chessId: 'sn', row: 10, col: 3, dir: 'RIGHT' }], [{ key: 'still', pos: [10, 6] }]);
  h.step();
  const e = h.b.enemies[0];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 400; i++) {
    e.x = -0.6 + rnd() * 21.2; e.y = -0.6 + rnd() * 19.2;
    if (i % 7 === 0) e.x = Math.round(e.x) + 0.5;       // on an edge
    if (i % 11 === 0) e.y = Math.round(e.y) - 0.45;     // 0.05 from an edge
    h.b._buildEnemyIndex();
    const inRange = [], onTile = [];
    for (let k = 0; k < h.b._eb.length; k++) { if (h.b._eb[k].includes(e)) inRange.push(k); if (h.b._et[k].includes(e)) onTile.push(k); }
    assert.deepEqual(inRange, colliderKeys(e).sort((a, b) => a - b), `range buckets at (${e.x}, ${e.y})`);
    assert.deepEqual(onTile, bodyKeysOf(e), `tile bucket at (${e.x}, ${e.y})`);
    assert.equal(e._ebMulti, inRange.length > 1);
  }
});

test('real product path (BattleSpec, act2 m01, a real wave): attacks take enemies by the collider, rangeId casts only by the position\'s tile', () => {
  const ds = getDefaultSource();
  const BLAZE = 'chess_char_5_03_a';   // 烛煌: S3 on its rangeId 4-11 (the DEFAULT trigger's customRangeGrid)
  const tpl = ds.getWave('act1autochess_05');
  const spawns = tpl.spawns.map((s) => ({ time: s.time, enemyKey: s.key, routeIndex: s.routeIndex, count: s.count, interval: s.interval }));
  const spec = buildBattleSpec({
    battleId: 'collider', fieldId: 'n:p1', kind: 'normal', seed: 4242, modeId: 'mode_multi_hard', round: 5, stageId: 'act2autochess_m01',
    timeLimit: 110, players: [{ playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, playerEffects: [], units: [
      { uid: 1, kind: 'chess', chessId: BLAZE, row: 11, col: 6, dir: 'RIGHT', skillIndex: 2 },
      { uid: 2, kind: 'chess', chessId: 'chess_char_3_12_a', row: 10, col: 8, dir: 'RIGHT' },
      { uid: 3, kind: 'chess', chessId: 'chess_char_1_10_a', row: 11, col: 8, dir: 'RIGHT' },
    ] }], spawns, routes: tpl.routes, flags: {}, waveId: 'act1autochess_05',
  });
  const b = createBattleFromSpec(spec, ds, { recordEvents: false, quiet: true });
  const u = b.allyUnits.find((x) => x.uid === 1);
  assert.equal(u.def.skill.id, 'skchr_blaze2_3');
  assert.ok(u.skill.triggerGrid, 'S3 casts on its rangeId');
  // her target search (acquireTargets → Battle.enemiesInKeys on her range) returns enemies in range by their 0.1 collider
  // only, and she strikes them (the swing keeps the target it took at its start — AttackState does not recheck the range)
  let casts = 0, castOnTile = 0;
  const colliderOnly = new Set(), struck = new Set();
  const search = b.enemiesInKeys.bind(b);
  b.enemiesInKeys = (keys, attacker, prof) => {
    const r = search(keys, attacker, prof);
    if (attacker === u && keys === u.rangeKeys && !u.skill.active) for (const t of r) if (!bodyInKeys(t, u.rangeKeySet)) colliderOnly.add(t.id);
    return r;
  };
  b.on('beforeAttack', (c) => { if (c.attacker === u && !u.skill.active) for (const t of c.targets ?? []) struck.add(t.id); });
  b.on('skillStart', (c) => {
    if (c.unit !== u) return;
    casts++;
    const trig = new Set(absoluteRangeKeys(u.skill.triggerGrid, u.tileR, u.tileC, u.dir, 0));
    if (b.enemies.some((e) => e.alive && e.deployed && !e.hidden && bodyInKeys(e, trig))) castOnTile++;
  });
  for (let i = 0; i < 110 * 30 && !b.finished; i++) b.step();
  assert.equal(b.errors.length, 0);
  assert.ok([...colliderOnly].some((id) => struck.has(id)), `an enemy found by its 0.1 collider only was struck (${colliderOnly.size} found)`);
  assert.ok(casts >= 1, `S3 cast (${casts})`);
  assert.equal(castOnTile, casts, 'every automatic cast had an enemy standing on a rangeId tile');
});

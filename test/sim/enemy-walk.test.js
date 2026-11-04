// How an enemy walks its route, as the official client does (Enemy._MoveByCursor over DirectionCursor and
// MoveController): each tick it heads for next[its current tile] of the flow field (never the centres of the tiles
// between), turns to the next checkpoint within 0.05 of one (0.05 being Route.CheckReached for the route's end), and
// its velocity follows that direction by steering (factor 8, at most force 10 in this mode's prefabs). ai.js walkRoute.
//
// The report: 战场#04 活性源石, the lower gate (9,10), operators on (9,8) and (10,8) with (9,9) free: with the upper one
// gone, the lower one did not block an enemy coming through the (9,9) checkpoint, which rounds 8 to 13 use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { BLOCK_RADIUS_SQ, COLS, MOVE_SCALE, ROWS } from '../../server/sim/constants.js';
import { obstacleAvoidForce } from '../../server/sim/ai.js';
import { Grid } from '../../server/sim/grid.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const REAL = { skip: !hasGeneratedData() };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const M04 = 'act1autochess_m04';
const SWORD = 'enemy_1010_demon';   // 살카즈 대검사
const OP = 'test_walk_op';
const WAVES = JSON.parse(readFileSync(new URL('../../data/waves.json', import.meta.url)));
const wave = (id) => (WAVES.templates ?? WAVES)[id];
const ROUND8 = () => wave('act1autochess_h01').routes[0];   // the lower gate through the checkpoint (9,9)
const ROUND1 = () => wave('act1autochess_01').routes[0];    // the lower gate with no checkpoint

function field(route, tiles, key = SWORD) {
  const h = makeBattle({
    stageId: M04, routes: [route], autoFinish: false, timeLimit: 200,
    defs: { chess: { [OP]: chessRec({ id: OP, stats: { atk: 0, blockCnt: 1, maxHp: 1e6, respawnTime: 999 }, skill: null }) } },
    units: tiles.map(([row, col], i) => ({ chessId: OP, row, col, uid: i + 1 })),
    enemies: [{ key, time: 0, routeIndex: 0 }],
  });
  return h;
}

/** Steps until `done(enemy)` or `limit` seconds, returning the enemy (spawned on the first tick). */
function runUntil(h, done, limit = 30) {
  let e = null;
  const end = h.b.time + limit;
  while (h.b.time < end && !h.b.finished) {
    h.step(1);
    e = e ?? h.b.enemies[0] ?? null;
    if (e && done(e)) break;
  }
  return e;
}

test('the data still holds the case: round 1 has no checkpoint at the lower gate, round 8 goes through (9,9)', REAL, () => {
  assert.deepEqual(ROUND1().start, [9, 10]);
  assert.deepEqual(ROUND1().checkpoints, []);
  assert.deepEqual(ROUND8().start, [9, 10]);
  assert.deepEqual(ROUND8().checkpoints, [[9, 9]]);
});

for (const [name, route] of [['through the checkpoint (9,9)', ROUND8], ['with no checkpoint', ROUND1]]) {
  test(`战场#04, lower gate ${name}: the operator on (9,8) alone blocks the enemy`, REAL, () => {
    const h = field(route(), [[9, 8]]);
    const e = runUntil(h, (x) => x.blockedBy || !x.alive || x.x < 7);
    assert.ok(e.blockedBy && e.blockedBy.tileR === 9 && e.blockedBy.tileC === 8, `at (${e.y}, ${e.x}), alive ${e.alive}`);
    checkInvariants(h.b);
  });

  test(`战场#04, lower gate ${name}: the operator on (9,8) takes the enemy over when the one on (10,8) falls`, REAL, () => {
    const h = field(route(), [[9, 8], [10, 8]]);
    const e = runUntil(h, (x) => x.blockedBy || !x.alive || x.x < 7);
    assert.ok(e.blockedBy, 'one of them blocks it');
    const other = h.allies().find((u) => u !== e.blockedBy);
    h.b.kill(e.blockedBy);
    runUntil(h, (x) => x.blockedBy || !x.alive || x.x < 7, 2);
    assert.ok(e.blockedBy === other, `the other one takes it: at (${e.y}, ${e.x})`);
    checkInvariants(h.b);
  });
}

test('real match path: on 战场#04 the operator on (9,8) blocks the enemy of round 8 once the one on (10,8) has fallen', REAL, async () => {
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const YAK = 'chess_char_1_02_a';
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  m.stageId = M04;
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  for (const [row, col] of [[9, 8], [10, 8]]) {
    const p = ps.acquireChess(YAK, { source: 'buy' });
    const res = m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row, col }, dir: 'RIGHT' });
    assert.ok(res.ok, `deploys on (${row},${col}): ${JSON.stringify(res)}`);
  }
  const spec = buildBattleSpec({
    ...m._normalOpts(ps), battleId: 'walk', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent,
    spawns: [{ time: 150, enemyKey: SWORD, routeIndex: 0, count: 1, interval: 0 }], routes: [ROUND8()], timeLimit: 200,
  });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && !b.finished && b.time < 10) b.step();
  const top = b.allyUnits.find((u) => u.tileR === 10 && u.tileC === 8);
  const low = b.allyUnits.find((u) => u.tileR === 9 && u.tileC === 8);
  assert.ok(top && low, 'both on the field');
  b.kill(top);
  const e = b.spawnEnemy(SWORD, { routeIndex: 0, mods: { atkMul: 0 } });
  const end = b.time + 30;
  while (b.time < end && !b.finished && e.alive && !e.blockedBy && e.x > 7) b.step();
  assert.ok(e.blockedBy === low, `blocked by the lower one: at (${e.y}, ${e.x}), alive ${e.alive}`);
  assert.deepEqual(b.errors ?? [], []);
  m.dispose?.();
});

test('an enemy heads for next[its current tile]: entering (10,8) from the diagonal it turns to (10,4) short of the centre', REAL, () => {
  const h = field(ROUND8(), []);
  let rowAtCol8 = null, minToCp = Infinity;
  const e = runUntil(h, (x) => {
    minToCp = Math.min(minToCp, Math.hypot(x.x - 9, x.y - 9));
    if (rowAtCol8 == null && x.x <= 8) rowAtCol8 = x.y;
    return !x.alive || x.x < 7;
  });
  assert.ok(e, 'it walked');
  // (the straight line (9.5, 8.5) → (10,4) is 9.556 at col 8; the centre (10,8) would be 10)
  assert.ok(rowAtCol8 > 9.5 && rowAtCol8 < 9.62, `row ${rowAtCol8} at col 8`);
  const d2 = (rowAtCol8 - 9) ** 2 + 0;
  assert.ok(d2 < BLOCK_RADIUS_SQ.ground, 'inside the block circle of (9,8)');
  // it turned to the next leg within 0.05 of the checkpoint (its velocity carries it a little further): never on the centre
  assert.ok(minToCp > 0.01 && minToCp <= 0.05, `closest to (9,9): ${minToCp}`);
});

// A flat stage (test/helpers/battleHarness.js flatStage): the road is free on every side.
function flatWalker(key, speed = 2) {
  return makeBattle({
    routes: [{ motion: key === 'enemy_1041_lazerd' ? 'FLY' : 'WALK', start: [10, 18], end: [10, 2], checkpoints: [] }],
    autoFinish: false, timeLimit: 100, units: [],
    defs: { enemies: { [key]: enemyRec({ key, hp: 1e7, speed }) } },
    enemies: [{ key, time: 0, routeIndex: 0 }],
  });
}

test('steering: from rest the velocity follows the direction by factor 8 (force at most 10) and stays at the speed', () => {
  const h = flatWalker('enemy_walk_plain');
  const speed = 2 * MOVE_SCALE, dt = 1 / 30;
  let e = null;
  while (!e) { h.step(1); e = h.b.enemies[0] ?? null; }
  const x0 = e.x, v0 = e.moveVx;
  assert.ok(near(v0, -Math.min(speed * 8, 10) * dt, 1e-9), `first tick's velocity ${v0}`);
  h.step(1);
  assert.ok(near(e.x, x0 + (v0 + (-speed - v0) * 8 * dt) * dt, 1e-9), 'the second step closes 8 × the gap to the speed');
  for (let i = 0; i < 90; i++) h.step(1);
  assert.ok(near(e.moveVx, -speed, 1e-3), `at the speed after 3 s: ${e.moveVx}`);
  assert.ok(Math.abs(e.moveVx) <= speed + 1e-12, 'never above it');
});

test('steering: a drone (prefab factor 20, force 100) turns quicker than a walker', () => {
  const h = flatWalker('enemy_1041_lazerd');
  const dt = 1 / 30;
  let e = null;
  while (!e) { h.step(1); e = h.b.enemies[0] ?? null; }
  assert.ok(near(e.moveVx, -2 * MOVE_SCALE * 20 * dt, 1e-9), `first tick's velocity ${e.moveVx}`);
});

test('the velocity outlives a stand: an enemy that stopped walks on at its old velocity', () => {
  const h = flatWalker('enemy_walk_plain');
  let e = null;
  while (!e || e.x > 12) { h.step(1); e = h.b.enemies[0] ?? null; }
  const v = e.moveVx;
  e.pauseUntil = h.b.time + 1;
  while (h.b.time < e.pauseUntil + 1e-9) h.step(1);
  assert.ok(near(e.moveVx, v, 1e-3), 'kept through the pause');
});

test('the wall\'s force: unit length, from what is within 0.25 of the tile\'s centre past the body edge, never along open floor', () => {
  // a road row 10 between walls: rows 9 and 11 at the tile (10,5) walled, the rest open
  const rows = Array.from({ length: ROWS }, () => '#'.repeat(COLS));
  rows[10] = 'r'.repeat(COLS);
  const legend = { '#': { tileKey: 'tile_forbidden', height: 'HIGH', buildable: 'NONE', passable: 'FLY_ONLY' }, r: { tileKey: 'tile_road', height: 'LOW', buildable: 'ALL', passable: 'ALL' } };
  const g = new Grid({ rows, legend }, { r0: 0, r1: ROWS - 1, c0: 0, c1: COLS - 1 });
  assert.deepEqual(obstacleAvoidForce(g, 5, 10, false), { x: 0, y: 0 }, 'on the centre line');
  assert.deepEqual(obstacleAvoidForce(g, 5, 10.2, false), { x: 0, y: 0 }, 'within 0.25 of the centre');
  assert.deepEqual(obstacleAvoidForce(g, 5, 10.3, false), { x: 0, y: -1 }, 'past it: back down');
  assert.deepEqual(obstacleAvoidForce(g, 5, 9.7, false), { x: 0, y: 1 }, 'and up');
  // a wall to the side: the 0.2 half body counts
  const rows2 = rows.slice();
  rows2[10] = 'r'.repeat(6) + '#' + 'r'.repeat(COLS - 7);
  const g2 = new Grid({ rows: rows2, legend }, g.rect);
  assert.deepEqual(obstacleAvoidForce(g2, 5.04, 10, false), { x: 0, y: 0 }, '0.04 + 0.2 is short of 0.25');
  assert.deepEqual(obstacleAvoidForce(g2, 5.1, 10, false), { x: -1, y: 0 }, '0.1 + 0.2 is past it');
  // on a tile it cannot stand on: toward the nearest it can
  assert.deepEqual(obstacleAvoidForce(g2, 6.3, 10, false), { x: 1, y: 0 }, 'out of the wall, to the nearer side');
  // a flyer minds no wall it can fly over
  assert.deepEqual(obstacleAvoidForce(g, 5, 10.3, true), { x: 0, y: 0 });
});

test('every ground route of every stage: the walker arrives and never stands on a tile it cannot walk', REAL, () => {
  const stages = JSON.parse(readFileSync(new URL('../../data/stages.json', import.meta.url)));
  for (const [id, st] of Object.entries(stages)) {
    for (const k of Object.keys(st.groundPathsWithDevices ?? {})) {
      const [start, end] = k.split('->').map((s) => s.split(',').map(Number));
      const kind = start[0] < 6 ? 'boss' : start[1] > 10 ? 'unite' : 'normal';
      const h = makeBattle({
        stageId: id, kind, routes: [{ motion: 'WALK', start, end, checkpoints: [] }], autoFinish: false, timeLimit: 400, units: [],
        defs: { enemies: { walker: enemyRec({ key: 'walker', hp: 1e9, speed: 2 }) } }, enemies: [{ key: 'walker', time: 0, routeIndex: 0 }],
      });
      const b = h.b;
      let e = null;
      while (b.time < 200 && !b.finished && !(e && !e.alive)) {
        h.step(1);
        e = e ?? b.enemies[0] ?? null;
        if (e && e.alive && !e.hidden) assert.ok(b.grid.walkable(Math.round(e.y), Math.round(e.x)), `${id} ${k}: on (${e.y}, ${e.x})`);
      }
      assert.ok(e && !e.alive, `${id} ${k}: arrives`);
      assert.deepEqual(b.errors ?? [], []);
    }
  }
});

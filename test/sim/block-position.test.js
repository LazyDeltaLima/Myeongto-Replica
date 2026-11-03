// Where a blocked enemy is held — the official client (Character._AddBlockee → BlockBalancer.CalculateBlockOffset →
// Enemy.RegisterBlocker → Enemy._MoveToBlockPosition): the enemy keeps its offset from the blocker's centre, lengthened
// to the minimum block distance 0.5 and turned a little off the blocker's other enemies when it would land within 0.1 of
// one, and slides there linearly over 0.2 s. An enemy walking into contact (≈ 0.71) is not moved.
//
// Flat stage: lower-gate enemies walk row 9 from the gate (9,10) to the goal (9,2), towards smaller columns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { blockOffset } from '../../server/sim/battle/blocking.js';
import { BLOCK_MIN_DIST, BLOCK_MOVE_TIME, BLOCK_SEARCH_TICKS } from '../../server/sim/constants.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';

const OP = 'test_block_pos';
const op = (blockCnt) => chessRec({ id: OP, stats: { atk: 0, blockCnt, maxHp: 1e6, respawnTime: 999 }, skill: null });
const foe = (key, speed) => enemyRec({ key, hp: 1e7, speed });

function lane(blockCnt = 1, enemies = []) {
  return makeBattle({
    defs: { chess: { [OP]: op(blockCnt) }, enemies: { enemy_walk: foe('enemy_walk', 1), enemy_still: foe('enemy_still', 0) } },
    units: [{ chessId: OP, row: 9, col: 6 }], enemies, timeLimit: 100, content: 'none',
  });
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// the blocker finds a new enemy at its next search, every BLOCK_SEARCH_TICKS ticks (Battle._searchBlockees)
function untilBlocked(h, e) {
  for (let i = 0; i < BLOCK_SEARCH_TICKS && !e.blockedBy; i++) h.step(1);
  assert.ok(e.blockedBy, 'blocked within one search period');
}

test('blockOffset: kept as it is from 0.5 out, lengthened to 0.5 inside, the zero vector stays', () => {
  assert.deepEqual(blockOffset([], { x: 6.7, y: 9 }, 6, 9), { x: 0.7000000000000002, y: 0 });
  const o = blockOffset([], { x: 6.12, y: 9.16 }, 6, 9);   // offset (0.12, 0.16), length 0.2
  assert.ok(near(Math.hypot(o.x, o.y), BLOCK_MIN_DIST) && near(o.x / o.y, 0.75), `${o.x}, ${o.y}`);
  assert.deepEqual(blockOffset([], { x: 6, y: 9 }, 6, 9), { x: 0, y: 0 });
});

test('blockOffset: within 0.1 of a held enemy the new one turns off it, 0.2 of the separation, the length kept', () => {
  // the same spot as a held enemy: sideways, perpendicular to the held enemy's own offset
  const same = blockOffset([{ x: 6.7, y: 9, blockMove: null }], { x: 6.7, y: 9 }, 6, 9);
  assert.ok(near(Math.hypot(same.x, same.y), 0.7), 'length kept');
  const l = Math.hypot(0.7, 0.2), want = { x: 0.7 * 0.7 / l, y: -0.2 * 0.7 / l };   // offset (0.7, 0) + 0.2 × (0, −1)
  assert.ok(near(same.x, want.x, 1e-6) && near(same.y, want.y, 1e-6), `${same.x}, ${same.y}`);
  // 0.05 off one held enemy: pushed away from it (and only it — another held 0.4 or more away adds nothing)
  const held = [{ x: 6.7, y: 9.05, blockMove: null }, { x: 6, y: 9.7, blockMove: null }];
  const away = blockOffset(held, { x: 6.7, y: 9 }, 6, 9);
  assert.ok(away.y < 0 && near(Math.hypot(away.x, away.y), 0.7), `${away.x}, ${away.y}`);
  // no held enemy within 0.1: unchanged, however close the others are
  assert.deepEqual(blockOffset([{ x: 6.7, y: 9.15, blockMove: null }], { x: 6.7, y: 9 }, 6, 9), { x: 0.7000000000000002, y: 0 });
  // a held enemy still sliding counts where it is going (Enemy.stableBlockPosition)
  const sliding = { x: 6.2, y: 9, blockMove: { x1: 6.7, y1: 9 } };
  assert.notDeepEqual(blockOffset([sliding], { x: 6.7, y: 9 }, 6, 9), { x: 0.7000000000000002, y: 0 });
});

test('an enemy walking into contact is held where it touched', () => {
  const h = lane(1, [{ key: 'enemy_walk', time: 0 }]);
  const u = h.unit(OP);
  assert.ok(h.runUntil(() => h.b.enemies[0]?.blockedBy === u, 30));
  const e = h.b.enemies[0], x = e.x;
  assert.equal(e.blockMove, null, 'no slide');
  h.run(1);
  assert.equal(e.x, x);
  checkInvariants(h.b);
});

test('an enemy inside 0.5 of its new blocker slides out to 0.5 over 0.2 s, linearly', () => {
  const h = lane(1);
  h.step(1);
  const e = h.spawn('enemy_still', { pos: [9.16, 6.12] });   // [row, col]: offset (0.12, 0.16) from the operator
  untilBlocked(h, e);
  assert.equal(e.blockedBy, h.unit(OP));
  const x0 = 6.12, y0 = 9.16, x1 = 6 + 0.3, y1 = 9 + 0.4;
  const t0 = h.b.time;
  h.step(1);
  const k = (h.b.time - t0) / BLOCK_MOVE_TIME;
  assert.ok(k > 0 && k < 1);
  assert.ok(near(e.x, x0 + (x1 - x0) * k, 1e-6) && near(e.y, y0 + (y1 - y0) * k, 1e-6), `mid-slide ${e.x}, ${e.y}`);
  h.run(BLOCK_MOVE_TIME);
  assert.ok(near(e.x, x1, 1e-9) && near(e.y, y1, 1e-9), `at 0.5: ${e.x}, ${e.y}`);
  assert.equal(e.blockMove, null);
  assert.equal(e.blockedBy, h.unit(OP));
  checkInvariants(h.b);
});

test('two enemies blocked at the same spot are spread apart', () => {
  const h = lane(2);
  h.step(1);
  const a = h.spawn('enemy_still', { pos: [9, 6.7] });
  h.step(1);
  const b = h.spawn('enemy_still', { pos: [9, 6.7] });
  h.run(1);
  assert.equal(a.blockedBy, h.unit(OP));
  assert.equal(b.blockedBy, h.unit(OP));
  assert.ok(near(a.x, 6.7, 1e-9) && near(a.y, 9, 1e-9), 'the first stays');
  assert.ok(near(Math.hypot(b.x - 6, b.y - 9), 0.7, 1e-6) && b.y < 9 - 0.1, `the second turned off it: ${b.x}, ${b.y}`);
  checkInvariants(h.b);
});

test('a blocker that leaves during the slide does not end it: the enemy reaches its block position, then walks on', () => {
  // Enemy.UnregisterBlocker leaves m_blockTween running, and BattleTweenMgr.Tick sets the position before the units tick:
  // the walk the released enemy makes is undone by the slide's next step until the slide ends
  const h = lane(1);
  h.step(1);
  const e = h.spawn('enemy_walk', { pos: [9.16, 6.12] });   // [row, col]: inside 0.5, so it slides out
  untilBlocked(h, e);
  assert.ok(e.blockMove, 'a slide');
  const tx = e.blockMove.x1, ty = e.blockMove.y1, t0 = h.b.time;
  h.step(1);
  h.b.retreat(h.unit(OP));
  assert.equal(e.blockedBy, null);
  assert.ok(e.blockMove, 'still sliding');
  while (e.blockMove) h.step(1);
  assert.ok(near(h.b.time - t0, BLOCK_MOVE_TIME, 1 / 30 + 1e-9), `ended after 0.2 s (${h.b.time - t0})`);
  assert.ok(Math.hypot(e.x - tx, e.y - ty) <= 1 / 30 + 1e-6, `at its block position, one step of walk at most: ${e.x}, ${e.y}`);
  const x = e.x;
  h.run(1);
  assert.ok(e.x < x - 0.3, 'walking on');
  checkInvariants(h.b);
});

test('a status that makes it unblockable during the slide ends it where it stands (Enemy.OnTick → ReleaseFromBlocker)', () => {
  const h = lane(1);
  h.step(1);
  const e = h.spawn('enemy_still', { pos: [9.16, 6.12] });
  untilBlocked(h, e);
  h.step(1);
  h.b.addBuff(e, { key: 'test:free', duration: 5, flags: { unblockable: true } });
  const x = e.x, y = e.y;
  h.step(2);
  assert.equal(e.blockMove, null);
  assert.equal(e.blockedBy, null);
  assert.ok(near(e.x, x) && near(e.y, y), 'stopped where it stood');
  checkInvariants(h.b);
});

test('a push during the slide ends it where the push left the enemy (失衡 → Enemy.ReleaseFromBlocker)', () => {
  const h = lane(1);
  h.step(1);
  const e = h.spawn('enemy_still', { pos: [9, 6.1] });
  untilBlocked(h, e);
  h.step(1);
  assert.ok(e.blockMove, 'sliding');
  assert.ok(h.b.displace(e, { x: 0, y: -1 }, 0.3) > 0);
  const x = e.x, y = e.y;
  h.step(1);
  assert.ok(near(e.x, x) && near(e.y, y), 'not pulled back to the old block position');
  // (still within its operator's reach: blocked again at its next search, a new slide from where the push left it)
  if (e.blockedBy && !e.blockMove) assert.fail('blocked without a slide');
  untilBlocked(h, e);
  assert.ok(near(e.x, x) && near(e.y, y), 'standing where the push left it until the new block');
  assert.ok(e.blockMove && near(e.blockMove.x0, x) && near(e.blockMove.y0, y));
  checkInvariants(h.b);
});

// The real match path (test/match/harness.js → buildBattleSpec → createBattleFromSpec): 角峰 (a defender, blocks 3) on
// the board; two enemies put on his tile — as when he is deployed or lands on them — are pushed out to 0.5, apart.
const YAK = 'chess_char_1_02_a';
test('real path: two enemies on the defender\'s tile are held 0.5 from his centre, not on top of each other', { skip: !hasGeneratedData() }, async () => {
  const { makeMatch } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true }];
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  h.toPrep(3);
  const m = h.m, ps = h.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = ps.acquireChess(YAK, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 4 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'blockpos', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  b._pending.length = 0;
  const yak = b.allyUnits.find((u) => u.defId === YAK);
  assert.ok(yak && yak.deployed);
  const mods = { speedMul: 0, atkMul: 0 };
  const a = b.spawnEnemy('enemy_1007_slime', { pos: [yak.y, yak.x + 0.2], mods });
  const c = b.spawnEnemy('enemy_1007_slime', { pos: [yak.y, yak.x + 0.2], mods });
  const end = b.time + 0.5;
  while (b.time < end) b.step();
  assert.ok(a.blockedBy === yak && c.blockedBy === yak, 'both blocked');
  for (const e of [a, c]) assert.ok(near(Math.hypot(e.x - yak.x, e.y - yak.y), 0.5, 1e-9), `0.5 from his centre (${e.x}, ${e.y})`);
  assert.ok(Math.hypot(a.x - c.x, a.y - c.y) > 0.05, 'turned off each other');
  assert.deepEqual(b.errors ?? [], []);
  m.dispose?.();
});

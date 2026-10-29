// Tile effects that the official client selects through a physics range (a selector on a box range: the enemy's 0.1
// CircleCollider2D overlapping the tile), so an enemy 0.05 past the tile's edge is taken and one 0.15 past it is not
// (maintainer decision 2026-10-17, checked against the client prefabs): 瑕光 S2 own-tile sleep, 琳琅诗怀雅's champagne bomb
// (her tier kit and the plain token kit), 克莱门莎 S3 bombardment, 望's stones. The tile effects that the client runs on
// the enemy's current tile — 烛煌's burning tiles, 圣聆初雪's snow, 乌尔比安 S3's anchor stop tile, the 突袭 "1-1" check —
// keep the point (docs/rules/sim.md 「적 충돌 반경 0.1」).
// Run: node --test test/sim/collider-tile-effects.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';

const ds = getDefaultSource();
const IDX = (id, skillId) => ds.rawChess(id).skills.find((s) => s.skillId === skillId).index;
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e8, speed: 0, def: 0, res: 0, atk: 0, ...o });
const done = (h) => { assert.deepEqual(h.b.errors.map((e) => `${e.label} ${e.message}`), []); checkInvariants(h.b); };
/** Move an enemy to (x, y) and keep it there, unblocked. */
const place = (h, e, x, y) => {
  e.x = x; e.y = y;
  h.b.addBuff(e, { key: 'test:loose', duration: Infinity, flags: { unblockable: true } });
  return e;
};

test('瑕光 S2: an enemy whose collider overlaps her tile sleeps (0.05 past the edge), one 0.15 past it does not', () => {
  const id = 'chess_char_3_12_a', sk = 'skchr_blemsh_2';
  const h = makeBattle({ defs: { enemies: { enemy_d: dummy('enemy_d', { atk: 200, bat: 1 }), enemy_n: dummy('enemy_n') } }, timeLimit: 60,
    units: [{ chessId: id, row: 10, col: 4, skillIndex: IDX(id, sk) }], enemies: [{ key: 'enemy_d', pos: [10, 4] }] });
  const u = h.unit(id);
  h.run(1);
  const inside = place(h, h.spawn('enemy_n', { pos: [10, 5] }), 4.55, 10);
  const outside = place(h, h.spawn('enemy_n', { pos: [11, 4] }), 4, 10.65);
  u.skill.gainSp(u.skill.spCost * u.skill.maxCharges + 1, 'test');
  assert.ok(h.runUntil(() => u.skill.active, 3), 'TAKE_DAMAGE from the blocked enemy');
  h.step();
  assert.ok(h.enemy('enemy_d').s.flags.sleep, 'the blocked enemy');
  assert.ok(inside.s.flags.sleep, '0.05 past the edge: asleep');
  assert.ok(!outside.s.flags.sleep, '0.15 past the edge: awake');
  done(h);
});

const SWIRE = 'chess_char_3_04_a', TRAP = 'token_10031_swire2_gdtrap';
const traps = (h) => h.b.allyUnits.filter((t) => t.alive && t.defId === TRAP);

for (const [label, dx, fires] of [['0.05 past the edge sets it off', 0.55, true], ['0.15 past the edge does not', 0.65, false]]) {
  test(`琳琅诗怀雅 champagne bomb (her kit): an enemy ${label}`, () => {
    const h = makeBattle({ defs: { enemies: { enemy_n: dummy('enemy_n') } }, timeLimit: 60, units: [{ chessId: SWIRE, row: 9, col: 5 }] });
    h.step();
    const bomb = traps(h)[0];
    assert.ok(bomb, 'the deployment coin became a bomb');
    // beside the bomb along its row, towards the middle of the field (the harness field is columns 0–10)
    const side = bomb.tileC >= 5 ? -1 : 1;
    assert.ok(!traps(h).some((t) => t !== bomb && t.tileR === bomb.tileR && t.tileC === bomb.tileC + side), 'no other bomb on that side');
    place(h, h.spawn('enemy_n', { pos: [bomb.tileR, bomb.tileC] }), bomb.tileC + side * dx, bomb.tileR);
    h.run(0.3);
    assert.equal(!bomb.alive, fires);
    done(h);
  });

  test(`琳琅诗怀雅 champagne bomb (token kit): an enemy ${label}`, () => {
    const h = makeBattle({ defs: { enemies: { enemy_n: dummy('enemy_n') } }, timeLimit: 60, units: [{ chessId: SWIRE, row: 2, col: 2 }] });
    h.step();
    for (const t of traps(h)) h.b.retreat(t, { reason: 'expired', permanent: true });
    const bomb = h.b.spawnToken(h.unit(SWIRE), TRAP, 11, 7);
    assert.ok(bomb && bomb.alive, 'a plain token on 11,7');
    place(h, h.spawn('enemy_n', { pos: [11, 8] }), 7 + dx, 11);
    h.run(0.3);
    assert.equal(!bomb.alive, fires);
    done(h);
  });
}

test('克莱门莎 S3 bombardment: the cross takes an enemy 0.05 past its edge, not one 0.15 past it', () => {
  const h = makeBattle({ seed: 23, autoFinish: false, timeLimit: 180, defs: { enemies: { dummy: dummy('dummy') } }, hooks: ['damaged'], captureNoisy: true,
    units: [{ uid: 1, diy: { slot: 6, charId: 'char_4231_clemnt', skillIndex: 2 }, elite: true, potential: 6, row: 10, col: 3, dir: 'RIGHT' }] });
  h.step();
  const u = h.unit(1);
  u.skill.gainSp(999, 'init');
  assert.equal(u.skill.activate('test'), true);
  h.b.rng = () => 0.99;
  const remote = h.spawn('dummy', { pos: [11, 6] });
  // the cross around 11,6: its right arm 11,7 ends at x 7.5, its left arm 11,5 at x 4.5
  const inside = place(h, h.spawn('dummy', { pos: [11, 8] }), 7.55, 11);
  const outside = place(h, h.spawn('dummy', { pos: [11, 4] }), 4.35, 11);
  h.b.dealDamage(u, remote, { amount: 1000, type: 'element', element: 'erosion' });
  h.step();
  u.skill.stop();
  h.run(3.1); // its three hits 1, 2 and 3 s after the shell is fired
  const bombs = h.hooksOf('damaged').filter((c) => c.dmg?.tags?.includes('clemnt:bomb'));
  assert.equal(bombs.filter((c) => c.target === remote && c.type === 'phys').length, 3, 'the marked enemy');
  assert.equal(bombs.filter((c) => c.target === inside && c.type === 'phys').length, 3, '0.05 past the right arm');
  assert.equal(bombs.filter((c) => c.target === outside).length, 0, '0.15 past the left arm');
  assert.ok(Math.abs(inside.x - 7.55) < 1e-6 && Math.abs(outside.x - 4.35) < 1e-6, 'they stayed put');
  done(h);
});

const WANG = 'char_2027_wang', STONE = 'token_10064_wang_stone1';
// diagonally off the stone's corner (x 6.5, y 9.5): the enemy's root tile is 10,7, never a 跟子 tile (those are beside the stone)
for (const [label, d, fires] of [['0.042 past its corner sets it off', 0.53, true], ['0.141 past its corner does not', 0.6, false]]) {
  test(`望 stone: an enemy ${label} (its 跟子 keeps the root tile)`, () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false, defs: { enemies: { held: dummy('held') } },
      units: [{ diy: { slot: 6, charId: WANG, skillIndex: 0, uniEquipId: 'uniequip_002_wang' }, elite: true, row: 11, col: 3, uid: 1 },
        { kind: 'token', tokenId: STONE, ownerUid: 1, row: 9, col: 6, uid: 50 }] });
    h.step(2);
    const e = place(h, h.spawn('held', { pos: [10, 7] }), 6 + d, 9 + d);
    h.b.addBuff(e, { key: 'test:hold', duration: Infinity, flags: { invulnerable: true } });
    const stone = h.b.allyUnits.find((u) => u.kind === 'token' && u.defId === STONE && !u.mem?.wangFollower && u.homeR === 9 && u.homeC === 6);
    assert.ok(h.runUntil(() => stone.mem.active, 2), 'linked by its battle-start 跟子');
    const f = h.b.allyUnits.find((u) => u.kind === 'token' && u.alive && u.mem.wangFollower);
    assert.ok(!f || f.tileR !== 10 || f.tileC !== 7, 'no 跟子 on the enemy\'s root tile');
    h.run(1.2);
    assert.equal(!!stone.mem.wangUsed, fires);
    assert.ok(Math.abs(e.x - 6 - d) < 1e-6 && Math.abs(e.y - 9 - d) < 1e-6, 'it stayed put');
    // (errors only, as test/local-patch-diy-wang.test.js: a 跟子 is not in the occupancy map checkInvariants compares)
    assert.deepEqual(h.b.errors.map((x) => `${x.label} ${x.message}`), []);
  });
}

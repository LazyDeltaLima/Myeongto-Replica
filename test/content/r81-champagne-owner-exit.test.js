// test/content/r81-champagne-owner-exit.test.js — 琳琅诗怀雅's 香槟炸弹 leaves with her (upstream `23b1279d`, a narrow port
// of upstream PR #872, upstream #871; docs/rules/sim.md 「香槟炸弹은 琳琅诗怀雅와 함께 떠난다」).
// Official: her S2 skill prefab's extra ability carries `swire2_skill_2[kill]`, template die_to_kill_token (ON_OWNER_FINISH →
// KillTokens, whatever the reason). The durability rule (禁疗, no HP loss, never gone because of its HP) stays. Both
// creation paths (her kit's bomb and the token kit); a bomb placed in the same tick as her death leaves too; another
// player's bomb stays. Upstream's file without its 规程 自选 case (that season has no 琳琅诗怀雅 自选 here), plus one case
// on the real match path.
// Run: node --test test/content/r81-champagne-owner-exit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { FORCED_EXIT } from '../../server/sim/constants.js';

const TRAP = 'token_10031_swire2_gdtrap';
const DRONE = 'token_10000_silent_healrb';
const SW = 'chess_char_3_04_a';
const WHY = 'her bomb must leave with her: tokens.js champagneLeavesWithOwner (official die_to_kill_token), docs/rules/sim.md 「香槟炸弹은 琳琅诗怀雅와 함께 떠난다」';

function field(extra = {}) {
  const row9 = '##ERRrrRrrSrrrrrrrS##';
  return makeBattle({
    flat: { rows: { 9: row9, 10: '##hrrRrrrrfrrrrrrrf##', 11: '##hrrRrrrrfrrrrrrrf##' } },
    defs: { enemies: { e_w: enemyRec({ key: 'e_w', hp: 1e6, speed: 1, def: 0, atk: 0 }) } },
    timeLimit: 60, autoFinish: false, hooks: ['death', 'heal'], captureNoisy: true,
    units: [{ uid: 1, chessId: SW, row: 9, col: 5 }],
    ...extra,
  });
}

/** Shop 琳琅诗怀雅 on (9,5); the only free x-6 tile is (9,6). She throws one bomb there. */
function herBomb(extra = {}) {
  const h = field(extra);
  h.step();
  const sw = h.unit(1);
  sw.mem.coins = 1;
  assert.ok(h.runUntil(() => h.b.allyUnits.some((t) => t.alive && t.defId === TRAP && t.ownerUnit === sw), 6), 'she threw a bomb');
  const bomb = h.b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.ownerUnit === sw);
  assert.deepEqual([bomb.tileR, bomb.tileC], [9, 6]);
  return { h, bomb, sw };
}

function left(bomb) {
  assert.equal(bomb.alive, false, WHY);
  assert.equal(bomb.removed, true);
  assert.equal(bomb.removeReason, 'expired');
  assert.equal(bomb.hp, bomb.s.maxHp, 'leaving with her does not spend its HP');
}

test('香槟炸弹 (her kit): a knock-out takes her bombs; the durability rule still holds until then', () => {
  const { h, bomb, sw } = herBomb();
  assert.ok(bomb.s.flags.noHeal && bomb.s.flags.healFree);
  assert.equal(h.b.heal(sw, bomb, 500), 0);
  h.b.dealDamage(null, bomb, { amount: 1e6, type: 'true', tags: ['test'] });
  h.b.loseHp(bomb, 1e6, { tags: ['test'] });
  assert.ok(bomb.alive && bomb.hp === bomb.s.maxHp, 'not gone because of its HP');
  const other = h.b.spawnToken(sw, DRONE, 10, 4, { duration: 30, anySource: true });
  assert.ok(other && other.alive, 'a non-bomb summon spawned');
  h.b.kill(sw);
  left(bomb);
  assert.equal(bomb.deathAt, sw.deathAt);
  assert.ok(other.alive && other.deployed, 'only her bombs leave');
  assert.equal(h.b.unitAt(9, 6), null, 'the tile is free');
  checkInvariants(h.b);
});

test('香槟炸弹 (her kit): a retreat, a permanent retreat and a 联防 forced exit take her bombs', () => {
  const { h, bomb, sw } = herBomb();
  h.b.retreat(sw);
  left(bomb);
  assert.equal(sw.removeReason, 'retreat');
  assert.equal(sw.removed, false, 'an ordinary retreat still lays her down');
  checkInvariants(h.b);

  const again = herBomb();
  again.h.b.retreat(again.sw, { permanent: true });
  left(again.bomb);
  assert.equal(again.sw.removed, true);
  checkInvariants(again.h.b);

  // 联防's opening forced exit uses this reason; ON_OWNER_FINISH does not filter it
  const forced = herBomb();
  forced.h.b.retreat(forced.sw, { reason: FORCED_EXIT });
  left(forced.bomb);
  assert.equal(forced.sw.removeReason, FORCED_EXIT);
  checkInvariants(forced.h.b);
});

test('香槟炸弹 (her kit): another player\'s bomb stays when she is knocked out', () => {
  const h = makeBattle({
    kind: 'unite',
    flat: { rows: { 9: '##ERRrrRrrSrrrrrrrS##', 10: '##hrrRrrrrfrrrrrrrf##', 11: '##hrrRrrrrfrrrrrrrf##' } },
    timeLimit: 30, autoFinish: false,
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, bonds: {}, units: [{ uid: 1, kind: 'chess', chessId: SW, row: 9, col: 5 }] },
      { playerId: 'p2', seat: 1, side: 'R', colOffset: 8, bonds: {}, units: [{ uid: 1, kind: 'chess', chessId: SW, row: 9, col: 5 }] },
    ],
  });
  h.step();
  const mine = h.b.allyUnits.find((u) => u.ownerId === 'p1' && u.kind === 'op');
  const theirs = h.b.allyUnits.find((u) => u.ownerId === 'p2' && u.kind === 'op');
  mine.mem.coins = 1;
  theirs.mem.coins = 1;
  assert.ok(h.runUntil(() => h.b.allyUnits.filter((t) => t.alive && t.defId === TRAP).length >= 2, 6), 'each threw a bomb');
  const mineBomb = h.b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.ownerUnit === mine);
  const theirBomb = h.b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.ownerUnit === theirs);
  assert.ok(mineBomb && theirBomb);
  h.b.kill(mine);
  left(mineBomb);
  assert.ok(theirBomb.alive && theirBomb.deployed, 'the other player\'s bomb stays');
  checkInvariants(h.b);
});

test('香槟炸弹 (her kit): a bomb she places in the same tick as her death leaves too', () => {
  const h = field();
  h.step();
  const sw = h.unit(1);
  sw.mem.coins = 1;
  h.b.on('tick', () => {
    if (!sw.alive) return;
    const bomb = h.b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.ownerUnit === sw);
    if (bomb) h.b.kill(sw);
  }, { priority: -5 });
  assert.ok(h.runUntil(() => !sw.alive, 6), 'she died in the tick she threw');
  const bomb = h.b.allyUnits.find((t) => t.defId === TRAP && t.ownerUnit === sw);
  assert.ok(bomb, 'the throw landed');
  left(bomb);
  assert.equal(bomb.deathAt, sw.deathAt, 'same tick');
  checkInvariants(h.b);
});

test('香槟炸弹 (token kit): one spawned in her death handler, the same tick, leaves; a drone spawned with it stays', () => {
  // her deploy coin would fill (9,6) before the handler runs; hold it so that tile stays free
  const h = field({ setup(b) {
    b.on('deploy', (ctx) => { if (ctx.unit?.defId === SW) ctx.unit.mem.coins = 0; }, { priority: -10 });
  } });
  h.step();
  const sw = h.unit(1);
  let born = null;
  let drone = null;
  h.b.on('death', (ctx) => {
    if (ctx.unit !== sw) return;
    born = h.b.spawnToken(sw, TRAP, 9, 6);
    drone = h.b.spawnToken(sw, DRONE, 10, 4, { duration: 30, anySource: true });
  });
  h.b.kill(sw);
  assert.ok(born && drone);
  left(born);
  assert.equal(born.deathAt, sw.deathAt);
  assert.ok(drone.alive && drone.deployed, 'the recall is the bomb\'s, not every summon\'s');
  checkInvariants(h.b);
});

test('香槟炸弹 (token kit): an already placed bomb leaves when she retreats, and still goes off while she stands', () => {
  const hold = (b) => b.on('deploy', (ctx) => { if (ctx.unit?.defId === SW) ctx.unit.mem.coins = 0; }, { priority: -10 });
  const h = field({ setup: hold });
  h.step();
  const sw = h.unit(1);
  const bomb = h.b.spawnToken(sw, TRAP, 9, 6);
  assert.ok(bomb && bomb.s.flags.noHeal && bomb.s.flags.healFree);
  assert.equal(h.b.heal(sw, bomb, 500), 0);
  h.b.retreat(sw);
  left(bomb);
  checkInvariants(h.b);

  const standing = field({ enemies: [{ key: 'e_w', route: 0, time: 1 }], setup: hold });
  standing.step();
  const live = standing.b.spawnToken(standing.unit(1), TRAP, 9, 6);
  assert.ok(standing.runUntil(() => !live.alive, 30), '见面礼 still spends the bomb');
  const e = standing.b.enemies.find((x) => x.alive);
  assert.ok(e && e.hp < 1e6 && e.findBuff('sluggish'));
  assert.equal(live.removeReason, 'expired');
  assert.ok(standing.unit(1).alive, 'she was still standing');
  checkInvariants(standing.b);
});

// The real match path (test/match/harness.js → buildBattleSpec → createBattleFromSpec): her S2 throws a bomb in a real
// battle, and her retreat takes it with her.
test('香槟炸弹 (real path): the bomb she throws leaves when she retreats', { skip: !hasGeneratedData() }, async () => {
  const { makeMatch, DATA } = await import('../match/harness.js');
  const { buildBattleSpec, createBattleFromSpec } = await import('../../server/sim/spec.js');
  const { checkLoadout } = await import('../../shared/protocol.js');
  // S2 throws the bombs; the 干员调配 default is S1 (LOADOUT_DEFAULT_DEVIATIONS)
  const loadout = checkLoadout({ [SW]: { skill: 1 } }, (id) => DATA.chess[id] ?? null).loadout;
  const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout }];
  const hm = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 3 }).start();
  hm.toPrep(3);
  const m = hm.m, ps = hm.ps('p_0');
  for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
  ps.board.clear(); ps.hand.fill(null); ps.recompute();
  const p = ps.acquireChess(SW, { source: 'buy' });
  assert.ok(m.handle('p_0', { t: 'g.move', uid: p.uid, to: { area: 'board', row: 10, col: 4 }, dir: 'RIGHT' }).ok);
  const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'champ-exit', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
  let started = false;
  b.on('battleStart', () => { started = true; });
  while (!started && b.time < 10) b.step();
  b._pending.length = 0;
  const sw = b.allyUnits.find((u) => u.defId === SW);
  assert.equal(sw.skill?.id, 'skchr_swire2_2', 'S2 is selected');
  b.spawnEnemy('enemy_1007_slime', { pos: [sw.tileR - 1, sw.tileC + 8], mods: { speedMul: 0, atkMul: 0 } });   // keeps the battle running
  sw.mem.coins = 1;
  const mine = () => b.allyUnits.find((t) => t.alive && t.defId === TRAP && t.ownerUnit === sw);
  for (let i = 0; i < 600 && !mine() && !b.finished; i++) b.step();
  const bomb = mine();
  assert.ok(bomb, 'she threw a bomb in the real battle');
  b.retreat(sw);
  left(bomb);
  assert.ok(!b.finished, 'the battle still runs');
  m.dispose?.();
});

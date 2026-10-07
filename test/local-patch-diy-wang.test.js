// test/local-patch-diy-wang.test.js — 望 (char_2027_wang) kit changes of the user's decisions of 2026-10-07
// (server/sim/content/kits/ops/op-wang.js; research/2026-10-07-diy-kit-diff.md §1 W2 / W7 / W8 / W10 / W12):
// - W2  an activated stone / 跟子 goes off whenever a selectable enemy IS on its trigger area (every tick) — one already
//       standing there when it activates too;
// - W7  连星's slow: independent stacks with their own timers in the 直接乘算 stage (their values add up), speed ≥ 0.1;
// - W8  跟子 ties: up > right > down > left as drawn (PRTS), left / right swapped on a mirrored field;
// - W10 during S3 a used stone may come back onto a walking enemy's tile inside her range (not outside it / outside S3);
// - W12 S3: per deployment the talent's 跟子 free + ≤ 3 extra, one ammo each (user 2026-10-07: confirmed in game);
// - 跟子 skip a knocked-out operator's tile (downOn, as upstream).
// The last describe runs S3 through the real match path (Match board → buildBattleSpec → createBattleFromSpec).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, enemyRec } from './helpers/battleHarness.js';
import * as WANG from '../server/sim/content/kits/ops/op-wang.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUPS = JSON.parse(readFileSync(path.join(ROOT, 'data/backups.json'), 'utf8'));
const CHAR = 'char_2027_wang';
const STONE = 'token_10064_wang_stone1';
const ENEMY = 'enemy_1422_lrsldr';
const BIG = 'enemy_1001_bigbo';
/** Synthetic dummies: a flyer and a walker that never move on their own (speed 0) and never die. */
const KITE = enemyRec({ key: 'enemy_kite', hp: 1e9, speed: 0, mass: 0, motion: 'FLY' });
const POST = enemyRec({ key: 'enemy_post', hp: 1e9, speed: 1, mass: 0 });
const pick = (sk, elite = true) => ({ charId: CHAR, skillIndex: sk, uniEquipId: elite ? 'uniequip_002_wang' : null });
/** 望 in the first tier-6 DIY slot (uid 1), the elite form. */
const op = (sk, row, col, rest = {}) => ({ diy: { slot: 6, ...pick(sk) }, elite: true, row, col, uid: 1, ...rest });
const stone = (row, col, uid) => ({ kind: 'token', tokenId: STONE, ownerUid: 1, row, col, uid });
const stoneOn = (h, r, c) => h.b.allyUnits.find((u) => u.kind === 'token' && u.defId === STONE && !u.mem?.wangFollower && u.homeR === r && u.homeC === c);
/** Use a placed stone up the way its trigger does (mem.wangUsed, then a permanent retreat: it waits for its redeploy). */
const useUp = (h, s) => { s.mem.wangUsed = true; h.b.retreat(s, { reason: 'expired', permanent: true }); };
/** A walking enemy held on (r, c): stunned, and invulnerable so the blasts never kill it (it stays selectable). */
const holdEnemy = (h, r, c, key = BIG) => {
  const e = h.spawn(key, { pos: [r, c], route: 0 });
  h.b.applyStatus(e, 'stun', { duration: 999 });
  h.b.addBuff(e, { key: 'test:hold', duration: Infinity, flags: { invulnerable: true } });
  return e;
};
/**
 * The 跟子 of each of her deployments, in order: a deployment (a stone from the stock through spawnToken with a placed
 * stone's kit, or a used stone's Battle.redeploy) opens a group, each 跟子 spawned after it (spawnToken with a 跟子 kit)
 * joins it. `on()` gates the counting. Returns the group list (each { r, c, fol: [{ r, c }…] }: its tile, its 跟子).
 */
const trackDeployments = (b, on = () => true) => {
  const groups = [];
  const spawn = b.spawnToken.bind(b), redeploy = b.redeploy.bind(b);
  b.spawnToken = (...a) => {
    const u = spawn(...a);
    if (u && u.defId === STONE && on()) {
      if (a[4]?.kit?.fromTokens) groups.push({ r: u.tileR, c: u.tileC, fol: [] });
      else if (a[4]?.kit && groups.length) groups[groups.length - 1].fol.push({ r: u.tileR, c: u.tileC });
    }
    return u;
  };
  b.redeploy = (u, o) => { const ok = redeploy(u, o); if (ok && u.defId === STONE && on()) groups.push({ r: u.tileR, c: u.tileC, fol: [] }); return ok; };
  return groups;
};
const trapHitsFrom = (h, r, c) => h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap') && d.source?.tileR === r && d.source?.tileC === c).length;

describe('望 kit — user decisions 2026-10-07 (op-wang.js)', () => {
  test('W2: an enemy already standing on a stone when it activates sets it off (presence, checked every tick)', () => {
    // a lone stone (inactive) at 9,6 with an enemy held on it; S1's automatic deployment then puts a stone next to it
    // (autoTile: next to her stones, nearest to an enemy) — the stone activates with the enemy already there
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op(0, 11, 3), stone(9, 6, 50)] });
    h.step(2);
    const w = h.unit(1);
    holdEnemy(h, 9, 6);
    h.run(1.5);
    const a = stoneOn(h, 9, 6);
    assert.equal(a.mem.active, undefined, 'the lone stone is not activated');
    assert.equal(trapHitsFrom(h, 9, 6), 0, 'an inactive stone never goes off');
    h.b.players[0].dp = 99;
    w.skill.activate('manual', { free: true }); // S1 「立即获得两枚棋子」 → automatic deployment next to her stone
    h.run(0.5);
    assert.ok(h.allies().some((u) => u.kind === 'token' && !u.mem.wangFollower && !(u.tileR === 9 && u.tileC === 6)), 'a stone was deployed');
    assert.equal(a.mem.wangUsed, true, 'the stone at 9,6 went off on the enemy already standing on it (and was used up)');
    assert.ok(h.hooksOf('statusApplied').some((x) => x.status === 'sluggish'), '取势: 停顿 on that enemy');
    assert.equal(h.b.errors.length, 0);
  });

  test('W7: 连星 slow — independent stacks with their own timers, their values add up in the 直接乘算 stage, speed ≥ 0.1', () => {
    assert.equal(typeof WANG.addWangSlow, 'function', 'addWangSlow exported');
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false, units: [op(1, 11, 3)] });
    h.step(2);
    const w = h.unit(1);
    const e = h.spawn(BIG, { pos: [9, 8], route: 0 });
    h.step(1);
    const base = e.base.moveSpeed;
    const ratio = () => e.s.moveSpeed / base;
    WANG.addWangSlow(h.b, w, e, -0.4, 6);
    assert.ok(Math.abs(ratio() - 0.6) < 1e-9, `1 stack: ×0.6 (${ratio()})`);
    h.run(1);
    WANG.addWangSlow(h.b, w, e, -0.4, 6);
    assert.ok(Math.abs(ratio() - 0.2) < 1e-9, `2 stacks: 1 − 0.4 − 0.4 = ×0.2, not 0.36 and not a refresh (${ratio()})`);
    assert.ok(e.buffs.some((b) => b.status === 'slow'), 'shown as 减速 (status slow)');
    h.run(5.2); // the first one ends (6 s), the second one keeps its own timer
    assert.ok(Math.abs(ratio() - 0.6) < 1e-9, `first stack expired on its own timer (${ratio()})`);
    h.run(1);
    assert.ok(Math.abs(ratio() - 1) < 1e-9, `both expired (${ratio()})`);
    assert.ok(!e.buffs.some((b) => b.key === 'wang:slow'), 'the holder buff goes with the last stack');
    for (let i = 0; i < 4; i++) WANG.addWangSlow(h.b, w, e, -0.4, 6);
    assert.ok(Math.abs(e.s.moveSpeed - 0.1) < 1e-9, `4 stacks (1 − 1.6 < 0): the floor 0.1 (${e.s.moveSpeed})`);
    h.b.applyStatus(e, 'sluggish', { duration: 3, source: w }); // 停顿 ×0.2 on top: still ≥ 0.1
    h.step(2);
    assert.ok(e.s.moveSpeed >= 0.1 - 1e-9, `floor with other slows (${e.s.moveSpeed})`);
  });

  test('W7: 连星 triggers stack their slows on an enemy (no plain 减速 status that the next trigger replaces)', () => {
    // a flyer held on 9,6 (flyers never hold a stone's return off) sets the 9,6 stone off at each return (~2.25 s); its
    // row blast hits it and a walker held on 9,4 each time — within 6 s the stacks pile up
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false, defs: { enemies: { enemy_kite: KITE, enemy_post: POST } },
      units: [op(1, 11, 3), stone(9, 6, 50), stone(9, 7, 51)] });
    h.step(2);
    h.b.players[0].dp = 99;
    const post = h.spawn('enemy_post', { pos: [9, 4], route: 0 });
    h.b.applyStatus(post, 'stun', { duration: 999 });
    const kite = h.spawn('enemy_kite', { pos: [9, 6], route: 2 });
    let most = 0, okMul = true;
    h.b.on('tick', () => {
      for (const e of [kite]) {
        const b = e.buffs.find((x) => x.key === 'wang:slow');
        if (!b) continue;
        most = Math.max(most, b.data.list.length);
        // (speed 0: no floor to raise) the stage = max(0, 1 + Σ)
        if (Math.abs(b.mods.moveMul - Math.max(0, 1 + b.data.list.reduce((n, x) => n + x.v, 0))) > 1e-9) okMul = false;
      }
    });
    for (let i = 0; i < 10 / 0.05; i++) { h.b.players[0].dp = 99; h.step(1); }
    assert.ok(trapHitsFrom(h, 9, 6) >= 6, `the 9,6 stone went off again and again (${trapHitsFrom(h, 9, 6)})`);
    assert.ok(most >= 2, `an enemy carried ≥ 2 stacks at once (${most})`);
    assert.ok(okMul, 'stage = max(0, 1 + Σ move_speed)');
    assert.equal(h.hooksOf('statusApplied').filter((x) => x.status === 'slow').length, 0, 'no applyStatus slow');
  });

  test('W8: 跟子 ties go up > right > down > left as drawn (PRTS), never seeded random', () => {
    const firstFollower = (seed, extra) => {
      const h = makeBattle({ seed, captureNoisy: true, timeLimit: 60, autoFinish: false,
        units: [op(0, 11, 3), stone(11, 5, 50), ...extra] });
      h.step(2);
      h.b.players[0].dp = 99;
      const groups = trackDeployments(h.b);
      useUp(h, stoneOn(h, 11, 5));
      h.runUntil(() => groups.length && groups[0].fol.length, 5);
      return groups[0]?.fol[0] ?? null;
    };
    for (const seed of [1, 5, 7, 11, 13, 17, 23]) {
      // 11,5 with 11,6 (right) a stone: up 12,5 / down 10,5 / left 11,4 all deployable ground, no enemy → up
      assert.deepEqual(firstFollower(seed, [stone(11, 6, 51)]), { r: 12, c: 5 }, `seed ${seed}: up first`);
      // up taken by a stone: right
      assert.deepEqual(firstFollower(seed, [stone(12, 5, 51)]), { r: 11, c: 6 }, `seed ${seed}: right when up is taken`);
    }
  });

  test('module (uniequip_002_wang): deploy limit 7 — seven prep stones all stand, stock 0; without it 6', () => {
    const seven = [4, 5, 6, 7, 8, 9, 10].map((c, i) => stone(9, c, 50 + i));
    for (const [elite, cap] of [[true, 7], [false, 6]]) {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 30, autoFinish: false,
        units: [{ ...op(0, 11, 3), elite, diy: { slot: 6, ...pick(0, elite) } }, ...seven], enemies: [] });
      h.step(1);
      const s = h.unit(1).mem.wang;
      assert.equal(s.fieldCap, cap, `deploy limit (elite ${elite})`);
      assert.equal(h.b.allyUnits.filter((u) => u.kind === 'token' && u.alive && !u.mem.wangFollower).length, cap, 'stones standing');
      assert.equal(s.stock, 0, 'stock = limit − placed, never below 0');
    }
  });

  test('跟子 never land on a knocked-out operator (downOn, as upstream; user decision 2026-10-07)', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, autoFinish: false,
      units: [op(0, 11, 3), stone(11, 5, 50), stone(11, 6, 51)] });
    h.step(2);
    h.b.players[0].dp = 99;
    // a down body on 12,5 (up — the first in the PRTS order): the battle's own downOn answers for that tile
    const down = h.b.downOn.bind(h.b);
    h.b.downOn = (r, c, except) => (r === 12 && c === 5 ? h.unit(1) : down(r, c, except));
    const groups = trackDeployments(h.b);
    useUp(h, stoneOn(h, 11, 5));
    h.runUntil(() => groups.length && groups[0].fol.length, 5);
    assert.deepEqual(groups[0]?.fol[0], { r: 10, c: 5 }, 'up holds a down body, right a stone → down');
  });

  test('W8: on a mirrored field (boss right side, drawn col → 20 − col) right and left swap', () => {
    const slots = BACKUPS.diy.slots;
    const base = Object.keys(slots).find((id) => slots[id].tier === 6);
    const players = [{ playerId: 'p1', seat: 0, side: 'R', colOffset: 0, bonds: {}, bandId: null, playerEffects: [],
      units: [{ uid: 1, kind: 'chess', chessId: slots[base].goldenId, diy: pick(0), row: 11, col: 3 },
        { uid: 50, kind: 'token', tokenId: STONE, ownerUid: 1, row: 11, col: 5 }, { uid: 51, kind: 'token', tokenId: STONE, ownerUid: 1, row: 12, col: 5 }] }];
    for (const seed of [1, 5, 7, 11, 13, 17]) {
      const h = makeBattle({ seed, kind: 'boss', captureNoisy: true, timeLimit: 60, autoFinish: false, players });
      h.step(2);
      const ps = h.b.getPlayer('p1');
      assert.equal(ps.mirror, true, 'the mirrored side');
      const stones = h.allies().filter((u) => u.kind === 'token' && u.defId === STONE);
      assert.equal(stones.length, 2);
      const low = stones.reduce((m, s) => (s.tileR < m.tileR ? s : m)); // board row 11: its up neighbour (board 12) is the other stone
      ps.dp = 99;
      const groups = trackDeployments(h.b);
      useUp(h, low);
      h.runUntil(() => groups.length && groups[0].fol.length, 5);
      // up is taken; "right" as drawn on the mirrored field is −col on the field
      assert.deepEqual(groups[0]?.fol[0], { r: low.homeR, c: low.homeC - 1 }, `seed ${seed}: right as drawn = field col − 1 (${JSON.stringify(groups)})`);
    }
  });

  test('W10: during S3 a used stone comes back onto a walking enemy\'s tile inside her range — not outside it, not without S3', () => {
    // her S3 range (4-12 from 11,3) covers cols 3–7 of rows 9–12; six prep stones keep the field full (no S3 stand-in drop)
    const layout = [[12, 4], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9]];
    const run = (cast, home) => {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
        units: [op(2, 11, 3), ...layout.map(([r, c], i) => stone(r, c, 50 + i))] });
      h.step(2);
      const w = h.unit(1);
      if (cast) { w.skill.activate('manual', { free: true }); h.step(1); assert.ok(w.skill.active); }
      else w.skill.opReadyAt = Infinity;
      assert.equal(!!w.rangeKeySet.has(12 * 21 + 4), true, '12,4 is in her range');
      assert.equal(!!w.rangeKeySet.has(home[0] * 21 + home[1]), home[1] <= 7);
      const s = stoneOn(h, home[0], home[1]);
      useUp(h, s);
      const e = holdEnemy(h, home[0], home[1]);
      let backOnFoe = false;
      h.b.on('deploy', (c) => { if (c.unit === s && e.alive && Math.round(e.y) === home[0] && Math.round(e.x) === home[1]) backOnFoe = true; });
      for (let i = 0; i < 6 / 0.05; i++) { h.b.players[0].dp = 99; h.step(1); }
      if (cast) assert.ok(w.skill.active, 'S3 still running');
      return backOnFoe;
    };
    assert.equal(run(true, [12, 4]), true, 'S3, in her range: back onto the enemy\'s tile');
    assert.equal(run(true, [12, 9]), false, 'S3, outside her range: waits (trait)');
    assert.equal(run(false, [12, 4]), false, 'no S3: waits (trait)');
  });

  test('W12: S3 deployment = the talent\'s 跟子 free + ≤ 3 extra, one ammo each (stand-in drop and returns alike)', () => {
    // stand-in drop: a stone on a held enemy's tile with four free neighbours → 4 跟子, 3 ammo; 2 free → 2 跟子, 1 ammo
    // (four prep stones: the field keeps room for the second drop while the first stone waits to come back)
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op(2, 11, 3), ...[6, 7, 8, 9].map((c, i) => stone(12, c, 50 + i))] });
    h.step(2);
    const w = h.unit(1);
    w.skill.activate('manual', { free: true });
    h.step(1);
    assert.ok(w.skill.active);
    for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    const groups = trackDeployments(h.b, () => w.skill.active);
    const seen = [];
    for (const [r, c] of [[10, 5], [9, 3]]) {
      const a0 = w.skill.ammoLeft, g0 = groups.length;
      const e = holdEnemy(h, r, c);
      h.run(1.2);
      const mine = groups.slice(g0).filter((g) => g.r === r && g.c === c);
      assert.equal(mine.length, 1, `one deployment on ${r},${c} (${JSON.stringify(groups.slice(g0))})`);
      // (a used stone coming back elsewhere in the window is a deployment of its own: count only this one's ammo)
      const others = groups.slice(g0).filter((g) => g !== mine[0]).reduce((n, g) => n + Math.max(0, g.fol.length - 1), 0);
      seen.push([a0 - w.skill.ammoLeft - others, mine[0].fol.length]);
      h.b.kill(e);
      for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    }
    assert.deepEqual(seen[0], [3, 4], '10,5: 4 跟子 (1 free + 3 extra), 3 ammo');
    assert.deepEqual(seen[1], [1, 2], '9,3: up 10,3 + right 9,4 only (down off the field, left the goal) → 2 跟子, 1 ammo');
  });

  test('W12: S3 returns of used stones — every deployment spends exactly (跟子 built − 1) ammo, never more than 3', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op(2, 11, 3), ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 2 }] });
    h.step(2);
    const w = h.unit(1);
    w.skill.activate('manual', { free: true });
    h.step(1);
    const groups = trackDeployments(h.b, () => w.skill.active);
    let spent = 0, want = 0;
    for (let i = 0; i < 30 / 0.05 && w.skill.active; i++) {
      h.b.players[0].dp = 99;
      const a0 = w.skill.ammoLeft, g0 = groups.length;
      h.step(1);
      // (the step S3 ends in is left out: the ammo left then returns as stones, it is not spent)
      if (!w.skill.active) break;
      spent += a0 - w.skill.ammoLeft;
      for (const g of groups.slice(g0)) { assert.ok(g.fol.length <= 4, `≤ 4 跟子 a deployment (${g.fol.length})`); want += Math.max(0, g.fol.length - 1); }
    }
    const sizes = groups.map((g) => g.fol.length);
    assert.ok(sizes.some((n) => n >= 2), `deployments with paid 跟子 happened (${sizes})`);
    assert.equal(spent, want, `ammo spent = Σ(跟子 − 1) (${sizes})`);
  });
});

describe('望 S3 through the real match path (seats[].diy → Match board → buildBattleSpec → createBattleFromSpec)', () => {
  test('m04 round 4, six prep stones: each deployment during S3 spends (跟子 built − 1) ≤ 3 ammo', async () => {
    const T6 = 'chess_char_6_diy1_a';
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pick(2, false) } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed: 11 }).start();
    h.toPrep(4);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    assert.equal(ps.diy?.[T6]?.charId, CHAR);
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const wp = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(m.handle('p_0', { t: 'g.move', uid: wp.uid, to: { area: 'board', row: 9, col: 3 }, dir: 'RIGHT' }).ok);
    for (let c = 4; c <= 9; c++) {
      const card = ps.hand.find((p) => p && p.kind === 'token' && p.id === STONE);
      assert.ok(card && m.handle('p_0', { t: 'g.move', uid: card.uid, to: { area: 'board', row: 9, col: c } }).ok, `stone on 9,${c}`);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    b.start();
    const wu = b.allyUnits.find((u) => u.kind === 'op');
    assert.equal(wu.def.charId, CHAR);
    while (b.time < 8) b.step();
    wu.skill.activate('manual', { free: true });
    b.step();
    const groups = trackDeployments(b, () => wu.skill.active);
    let spent = 0, want = 0;
    while (!b.finished && b.time < 30 && wu.skill.active) {
      const a0 = wu.skill.ammoLeft, g0 = groups.length;
      b.step();
      if (!wu.skill.active) break; // the ending step: the ammo left returns as stones (not spent)
      spent += a0 - wu.skill.ammoLeft;
      for (const g of groups.slice(g0)) { assert.ok(g.fol.length <= 4); want += Math.max(0, g.fol.length - 1); }
    }
    const sizes = groups.map((g) => g.fol.length);
    assert.ok(groups.length > 0, 'deployments during S3');
    assert.ok(spent > 0, `ammo spent (${sizes})`);
    assert.equal(spent, want, `ammo = Σ(跟子 − 1) over the deployments (${sizes})`);
    assert.equal(wu.mem.wang.ammo, wu.skill.active ? wu.skill.ammoLeft : wu.mem.wang.ammo, 'the kit count = the engine count');
    assert.equal(b.errors.length, 0);
    m.dispose?.();
  });
});

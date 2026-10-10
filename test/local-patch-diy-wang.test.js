// test/local-patch-diy-wang.test.js — 望 (char_2027_wang) kit changes of the maintainer's decisions of 2026-10-07
// (server/sim/content/kits/ops/op-wang.js; maintainer's notes 2026-10-07 §1 W2 / W7 / W8 / W10 / W12):
// - W2  an activated stone / 跟子 goes off whenever a selectable enemy IS on its trigger area (every tick) — one already
//       standing there when it activates too;
// - W7  连星's slow: independent stacks with their own timers in the 直接乘算 stage (their values add up), speed ≥ 0.1;
// - W8  跟子 ties: up > right > down > left as drawn (PRTS), left / right swapped on a mirrored field;
// - W10 during S3 a used stone may come back onto a walking enemy's tile inside her range (not outside it / outside S3);
// - W12 S3: per deployment the talent's 跟子 free + ≤ 3 extra, one ammo each (maintainer 2026-10-07: confirmed in game);
// - 跟子 skip a knocked-out operator's tile (downOn, as upstream).
// The S3 describe runs S3 through the real match path (Match board → buildBattleSpec → createBattleFromSpec); the last one
// checks every tick of S1 / S2 / S3 battles on that path for two of her stones on one tile.

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
 * joins the latest group next to it (they are built one per 4 frames, so another deployment may come in between).
 * `on()` gates the counting. Returns the group list (each { r, c, t, fol: [{ r, c, t }…] }: its tile and time, its 跟子).
 * `paidOf(g)`: the 跟子 built after the deployment's own tick — the S3 extras, one ammo each (the talent's free one comes
 * with the stone, or not at all when it finds no tile).
 */
/** `o` with a non-enumerable time `t` (deepEqual on the groups stays about tiles). */
const stamp = (o, t) => Object.defineProperty(o, 't', { value: t, enumerable: false });
const trackDeployments = (b, on = () => true) => {
  const groups = [];
  const spawn = b.spawnToken.bind(b), redeploy = b.redeploy.bind(b);
  b.spawnToken = (...a) => {
    const u = spawn(...a);
    if (u && u.defId === STONE && on()) {
      if (a[4]?.kit?.fromTokens) groups.push(stamp({ r: u.tileR, c: u.tileC, fol: [] }, b.time));
      else if (a[4]?.kit && a[4].kit.followerFrom !== 'instant' && groups.length) {
        // a deployment's 跟子 (BuildStone) — S3's start ones (InstantSpawn, one per 0.25 s) belong to no deployment
        const g = groups.findLast((x) => Math.abs(x.r - u.tileR) + Math.abs(x.c - u.tileC) === 1) ?? groups[groups.length - 1];
        g.fol.push(stamp({ r: u.tileR, c: u.tileC }, b.time));
      }
    }
    return u;
  };
  b.redeploy = (u, o) => { const ok = redeploy(u, o); if (ok && u.defId === STONE && on()) groups.push(stamp({ r: u.tileR, c: u.tileC, fol: [] }, b.time)); return ok; };
  return groups;
};
/**
 * The paid 跟子 of a deployment: all but the talent's free one, which lands FOLLOWER_PRE_DELAY (0.25 s → the 8th frame,
 * 0.267 s) after its stone; the paid ones follow 4 frames apart (0.4 s on).
 */
const paidOf = (g) => g.fol.filter((f) => f.t > g.t + 0.3).length;
const trapHitsFrom = (h, r, c) => h.hooksOf('damaged').filter((d) => d.dmg?.tags?.includes('trap') && d.source?.tileR === r && d.source?.tileC === c).length;

describe('望 kit — maintainer decisions 2026-10-07 (op-wang.js)', () => {
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
    h.step(1);
    assert.ok(h.allies().some((u) => u.kind === 'token' && !u.mem.wangFollower && !(u.tileR === 9 && u.tileC === 6)), 'a stone was deployed');
    assert.equal(a.mem.active, true, 'linked at once');
    // armed 30 frames after the link, on the frame after (client WangStoneTriggerManager `_tokenStoneExplodeDelay` 30)
    h.run(0.95);
    assert.equal(trapHitsFrom(h, 9, 6), 0, 'not armed yet 0.95 s after the link');
    h.run(0.15);
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
    // (each return re-arms 30 frames after its link: client `_tokenStoneExplodeDelay`)
    for (let i = 0; i < 15 * 30; i++) { h.b.players[0].dp = 99; h.step(1); }
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

  test('跟子 tile order = the client\'s WangTileSelector (TALENT): ground before high ground, then an enemy on it, then undeployable, then up > right > down > left', () => {
    // flat stage: column 2 rows 10–12 deployable high ground, column 10 undeployable ground
    const firstFollower = (at, enemies = []) => {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, autoFinish: false, units: [op(0, 9, 6), stone(at[0], at[1], 50)] });
      h.step(2);
      h.b.players[0].dp = 99;
      for (const [r, c] of enemies) holdEnemy(h, r, c);
      const groups = trackDeployments(h.b);
      useUp(h, stoneOn(h, at[0], at[1]));
      h.runUntil(() => groups.length && groups[0].fol.length, 5);
      return groups[0]?.fol[0] ?? null;
    };
    // an enemy on the high-ground neighbour (11,2): ground first — up 12,3 (PRTS's order put the enemy tile first)
    assert.deepEqual(firstFollower([11, 3], [[11, 2]]), { r: 12, c: 3 });
    // an enemy on a ground neighbour: that one before the plain ground ones
    assert.deepEqual(firstFollower([11, 3], [[10, 3]]), { r: 10, c: 3 });
    // undeployable ground (11,10) before deployable ground
    assert.deepEqual(firstFollower([11, 9]), { r: 11, c: 10 });
  });

  test('module (uniequip_002_wang): deploy limit 8 — eight prep stones all stand, stock 0; without it 7 (full potential)', () => {
    const eight = [3, 4, 5, 6, 7, 8, 9, 10].map((c, i) => stone(9, c, 50 + i));
    for (const [elite, cap] of [[true, 8], [false, 7]]) {
      const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 30, autoFinish: false,
        units: [{ ...op(0, 11, 3), elite, diy: { slot: 6, ...pick(0, elite) } }, ...eight], enemies: [] });
      h.step(1);
      const s = h.unit(1).mem.wang;
      assert.equal(s.fieldCap, cap, `deploy limit (elite ${elite})`);
      assert.equal(h.b.allyUnits.filter((u) => u.kind === 'token' && u.alive && !u.mem.wangFollower).length, cap, 'stones standing');
      assert.equal(s.stock, 0, 'stock = limit − placed, never below 0');
    }
  });

  test('跟子 never land on a knocked-out operator (downOn, as upstream; maintainer decision 2026-10-07)', () => {
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

  test('a deployment on a 跟子\'s tile removes it — a stone\'s return, an operator\'s move (PRTS 铸子 备注; maintainer decision 2026-10-09)', () => {
    // 「跟子所在格进行部署（或进行类似部署的行为）时，该跟子会随之消失」: until 2026-10-09 the stone waited for the 跟子 to go off
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 60, autoFinish: false,
      units: [op(0, 11, 3), stone(11, 5, 50), stone(11, 6, 51), stone(12, 5, 52)] });
    h.step(2);
    h.b.players[0].dp = 99;
    const fol = () => h.allies().filter((u) => u.mem?.wangFollower && u.alive);
    const groups = trackDeployments(h.b);
    useUp(h, stoneOn(h, 11, 5));
    h.run(0.5);
    useUp(h, stoneOn(h, 12, 5)); // comes back 0.5 s after 11,5, whose 跟子 takes its empty home first (up)
    h.runUntil(() => groups.length && groups[0].fol.length, 5);   // its 跟子 lands 0.25 s after it (BuildStone _preDelay)
    assert.deepEqual(groups[0].fol, [{ r: 12, c: 5 }], '11,5 is back, its 跟子 on the waiting stone\'s home 12,5');
    h.runUntil(() => stoneOn(h, 12, 5).alive, 5);
    assert.ok(stoneOn(h, 12, 5).alive, 'the stone came back at once — it did not wait for the 跟子');
    assert.ok(!fol().some((f) => f.tileR === 12 && f.tileC === 5), 'the 跟子 on its tile is gone');
    h.run(0.4);   // 12,5's own 跟子 lands 0.25 s after it
    // an operator's move onto a 跟子 (乌尔比安-like moveRedeploy: "类似部署的行为")
    const f = fol()[0];
    assert.ok(f, 'a 跟子 is on the field (12,5\'s own)');
    assert.ok(h.b.moveRedeploy(h.unit(1), f.tileR, f.tileC), '望 moves onto it');
    assert.ok(!f.alive, 'removed by the move');
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
    // her S3 range (4-12 from 11,3) covers cols 3–7 of rows 9–12; seven prep stones (full potential) keep the field full
    // (no S3 stand-in drop)
    const layout = [[12, 4], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9], [9, 10]];
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
    h.run(2.5);   // S3's start 跟子 land one per 0.25 s (InstantSpawn) — cleared before the drops
    assert.ok(w.skill.active);
    for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    const groups = trackDeployments(h.b, () => w.skill.active);
    const seen = [];
    for (const [r, c] of [[10, 5], [9, 3]]) {
      const a0 = w.skill.ammoLeft, g0 = groups.length, ws = h.b.time;
      const e = holdEnemy(h, r, c);
      h.run(1.9);   // the next stand-in drop (1 s pace) + its 跟子 0.25 s later, one per 4 frames
      const mine = groups.slice(g0).filter((g) => g.r === r && g.c === c);
      assert.equal(mine.length, 1, `one deployment on ${r},${c} (${JSON.stringify(groups.slice(g0))})`);
      // (another deployment's paid 跟子 built in the window — a used stone coming back, the previous or next drop — spend
      // their own ammo: count only this one's)
      const others = groups.filter((g) => g !== mine[0]).reduce((n, g) => n + g.fol.filter((f) => f.t > g.t + 0.3 && f.t >= ws - 1e-9 && f.t <= h.b.time + 1e-9).length, 0);
      seen.push([a0 - w.skill.ammoLeft - others, mine[0].fol.length]);
      // one per 4 frames (client WangStoneTriggerManager `_stoneBuildDelay` 4), the first with the stone
      const ts = mine[0].fol.map((f) => f.t);
      assert.ok(Math.abs(ts[0] - mine[0].t - 8 * h.TICK) < 1e-6, `the talent's 跟子 0.25 s (the 8th frame) after the stone (BuildStone _preDelay) (${ts[0] - mine[0].t})`);
      for (let i = 1; i < ts.length; i++) assert.ok(Math.abs(ts[i] - ts[i - 1] - 4 * h.TICK) < 1e-6, `4 frames apart (${ts.map((t) => t.toFixed(3))})`);
      h.b.kill(e);
      for (const f of h.allies().filter((u) => u.kind === 'token' && u.alive && u.mem.wangFollower)) h.b.retreat(f, { reason: 'expired', permanent: true });
    }
    assert.deepEqual(seen[0], [3, 4], '10,5: 4 跟子 (1 free + 3 extra), 3 ammo');
    assert.deepEqual(seen[1], [1, 2], '9,3: up 10,3 + right 9,4 only (down off the field, left the goal) → 2 跟子, 1 ammo');
  });

  test('W12: S3 returns of used stones — every deployment spends one ammo per S3 跟子 built after its stone (≤ 3)', () => {
    const h = makeBattle({ seed: 5, captureNoisy: true, timeLimit: 120, autoFinish: false,
      units: [op(2, 11, 3), ...[4, 5, 6, 7, 8, 9].map((c, i) => stone(9, c, 50 + i))],
      enemies: [{ key: ENEMY, time: 0, route: 0, count: 8, interval: 2 }] });
    h.step(2);
    const w = h.unit(1);
    const groups = trackDeployments(h.b, () => w.skill.active);   // before the cast: its first deployment's 跟子 come over 4-frame steps
    w.skill.activate('manual', { free: true });
    let spent = 0, a0 = 0;
    for (let i = 0; i < 30 / 0.05 && w.skill.active; i++) {
      h.b.players[0].dp = 99;
      a0 = w.skill.ammoLeft;
      h.step(1);
      // (the step S3 ends in is left out: the ammo left then returns as stones, it is not spent — unless the last ammo ended it)
      if (!w.skill.active) break;
      spent += a0 - w.skill.ammoLeft;
    }
    if (!w.skill.active && h.hooksOf('skillEnd').filter((c) => c.unit === w).at(-1)?.reason === 'ammo') spent += a0;
    // (the 跟子 of a deployment are built one per 4 frames: counted once the battle has moved on)
    const sizes = groups.map((g) => g.fol.length);
    for (const n of sizes) assert.ok(n <= 4, `≤ 4 跟子 a deployment (${n})`);
    const want = groups.reduce((t, g) => t + paidOf(g), 0);
    assert.ok(sizes.some((n) => n >= 2), `deployments with paid 跟子 happened (${sizes})`);
    assert.equal(spent, want, `ammo spent = Σ paid 跟子 (${sizes})`);
  });
});

describe('望 S3 through the real match path (seats[].diy → Match board → buildBattleSpec → createBattleFromSpec)', () => {
  test('m04 round 4, six prep stones: each deployment during S3 spends one ammo per S3 跟子 built after its stone (≤ 3)', async () => {
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
    const groups = trackDeployments(b, () => wu.skill.active);   // before the cast: 跟子 come one per 4 frames
    let ended = null;
    b.on('skillEnd', (c) => { if (c.unit === wu) ended = c.reason; });
    wu.skill.activate('manual', { free: true });
    let spent = 0, a0 = 0;
    while (!b.finished && b.time < 30 && wu.skill.active) {
      a0 = wu.skill.ammoLeft;
      b.step();
      if (!wu.skill.active) break; // the ending step: the ammo left returns as stones (not spent) — unless the last ammo ended it
      spent += a0 - wu.skill.ammoLeft;
    }
    if (ended === 'ammo') spent += a0;
    const sizes = groups.map((g) => g.fol.length);
    for (const n of sizes) assert.ok(n <= 4);
    const want = groups.reduce((t, g) => t + paidOf(g), 0);
    assert.ok(groups.length > 0, 'deployments during S3');
    assert.ok(spent > 0, `ammo spent (${sizes})`);
    assert.equal(spent, want, `ammo = Σ paid 跟子 over the deployments (${sizes})`);
    assert.equal(wu.mem.wang.ammo, wu.skill.active ? wu.skill.ammoLeft : wu.mem.wang.ammo, 'the kit count = the engine count');
    assert.equal(b.errors.length, 0);
    m.dispose?.();
  });
});

/**
 * Report 3 (2026-10-08, user: 望 stones suspected to stack on one tile), through the real match path. Every tick:
 * no tile holds two placed stones, two 跟子, or a stone / 跟子 of hers with another ally. The one overlap the sim could
 * have (maintainer's notes 2026-10-08 2-3): a used placed stone coming back on its home tile (Battle.redeploy
 * checks `_occ` only) onto a 跟子 — a projectile that holds no tile — put there by a neighbour's deployment while the
 * stone waited. PRTS 铸子 备注 「跟子所在格进行部署（或进行类似部署的行为）时，该跟子会随之消失」 (maintainer decision 2026-10-09,
 * upstream 5a045731 (b)): the return removes that 跟子 (`gone` counts them); until then the stone waited for it [추정].
 */
describe('望 stones never share a tile (real match path)', () => {
  const T6 = 'chess_char_6_diy1_a';
  const runWang = async ({ sk, stones, seed, until }) => {
    const { makeMatch } = await import('./match/harness.js');
    const { buildBattleSpec, createBattleFromSpec } = await import('../server/sim/spec.js');
    const seats = [{ seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, diy: { [T6]: pick(sk, false) } }];
    const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seats, seed }).start();
    h.toPrep(4);
    h.setStage('act2autochess_m04');
    const m = h.m, ps = h.ps('p_0');
    ps.initDiyStock?.(new Set());
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.recompute();
    const wp = ps.acquireChess(T6, { source: 'buy' });
    assert.ok(m.handle('p_0', { t: 'g.move', uid: wp.uid, to: { area: 'board', row: 10, col: 5 }, dir: 'RIGHT' }).ok);
    for (const [r, c] of stones) {
      const card = ps.hand.find((p) => p && p.kind === 'token' && p.id === STONE);
      assert.ok(card && m.handle('p_0', { t: 'g.move', uid: card.uid, to: { area: 'board', row: r, col: c } }).ok, `stone on ${r},${c}`);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), battleId: 'lp', fieldId: 'n:p_0', kind: 'normal', content: m.battleContent });
    const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    const how = new Map(); // unit → how it last came on the field ('redeploy' | 'stock' | 'follower')
    const spawn = b.spawnToken.bind(b), redeploy = b.redeploy.bind(b);
    const seen = { redeploy: 0, stock: 0, follower: 0, gone: 0 };
    // a 跟子 retreated while another ally of hers stands on its tile = removed by that deployment (a trigger spends one
    // with nobody on its tile: a 跟子 never lands on a unit's tile)
    const retreat = b.retreat.bind(b);
    b.retreat = (u, o) => {
      if (u?.mem?.wangFollower && b.allyUnits.some((a) => a !== u && a.alive && a.deployed && a.tileR === u.tileR && a.tileC === u.tileC)) seen.gone++;
      return retreat(u, o);
    };
    b.spawnToken = (...a) => { const u = spawn(...a); if (u?.defId === STONE) { const k = a[4]?.kit?.follower ? 'follower' : 'stock'; how.set(u, k); seen[k]++; } return u; };
    b.redeploy = (u, o) => { const ok = redeploy(u, o); if (ok && u.defId === STONE) { how.set(u, 'redeploy'); seen.redeploy++; } return ok; };
    b.start();
    const wu = b.allyUnits.find((u) => u.kind === 'op');
    assert.equal(wu.def.charId, CHAR);
    const pairs = new Map(); // "r,c:idA+idB" → { kind, last } at the tick the pair first shared the tile
    const deep = new Set(); // 跟子 seen on a 深水区 tile
    let s3 = 0;
    while (!b.finished && b.time < until) {
      const before = new Map([...b.allyUnits].map((u) => [u, u.alive && u.deployed]));
      b.step();
      if (wu.skill?.active && wu.skill.id === 'skchr_wang_3') s3++;
      const at = new Map();
      for (const u of b.allyUnits) {
        if (!u.alive || !u.deployed || u.removed) continue;
        if (u.mem?.wangFollower && b.grid.tile(u.tileR, u.tileC).key === 'tile_deepsea') deep.add(u.id);
        const k = `${u.tileR},${u.tileC}`;
        (at.get(k) ?? at.set(k, []).get(k)).push(u);
      }
      for (const [k, us] of at) {
        if (us.length < 2) continue;
        const key = `${k}:${us.map((u) => u.id).join('+')}`;
        if (pairs.has(key)) continue;
        const tag = (u) => (u.defId !== STONE ? 'U' : u.mem?.wangFollower ? 'F' : 'S');
        const fresh = us.filter((u) => !before.get(u)); // came on the field this tick
        pairs.set(key, { kind: us.map(tag).sort().join('+'), last: fresh.map((u) => `${tag(u)}:${how.get(u)}`) });
      }
    }
    m.dispose?.();
    return { pairs: [...pairs.values()], seen, s3, deep: deep.size, errors: b.errors };
  };
  const LAYOUTS = {
    // the six stones round her (10,5) on the m04 lanes: S3 deployments and returns among them
    near: [[10, 4], [11, 5], [12, 5], [11, 4], [9, 6], [9, 4]],
    // two lanes further off: S1 refills, returns whose 跟子 land on a neighbour's home tile
    far: [[12, 4], [9, 7], [12, 7], [9, 8], [12, 8], [9, 9]],
    one: [[10, 4]],
    // next to m04's 深水区 column 6 (rows 10–12): a stone's 跟子 would take the water first (「不可部署地块」, class 0)
    side: [[11, 5], [12, 5], [10, 7], [11, 7], [12, 7], [9, 6]],
  };
  // (seeds re-picked 2026-10-10 when 跟子 took the client's tile order, came one per 4 frames and stones armed after 30
  // frames: the former S2 one seed 2 / S3 one seed 1 no longer had a return land on a 跟子)
  for (const [sk, layout, seed] of [[0, 'far', 1], [1, 'one', 1], [2, 'near', 1], [2, 'one', 2]]) {
    test(`S${sk + 1} ${layout} seed ${seed}: no two placed stones / 跟子 on a tile — a return onto a 跟子 removes it`, async () => {
      const r = await runWang({ sk, stones: LAYOUTS[layout], seed, until: 60 });
      assert.equal(r.errors.length, 0);
      assert.ok(r.seen.redeploy > 0 && r.seen.follower > 0, `returns and 跟子 happened (${JSON.stringify(r.seen)})`);
      // (seen: far 0, one 1, near 3, S3 one 3) — fails on the former rule, where the stone waited and `gone` stayed 0
      if (layout !== 'far') assert.ok(r.seen.gone > 0, `a deployment removed a 跟子 on its tile (${JSON.stringify(r.seen)})`);
      if (sk === 2) assert.ok(r.s3 > 0, 'S3 ran');
      if (layout === 'one') assert.ok(r.seen.stock > 0, 'stones deployed from the stock');
      assert.deepEqual(r.pairs, [], 'nothing of hers ever shares a tile (a deployment on a 跟子 removes it)');
      for (const p of r.pairs) {
        assert.equal(p.kind, 'F+S', `only a stone with a 跟子 ever shares a tile (${JSON.stringify(p)})`);
        // the stone is the one that came: its return (Battle.redeploy) — never a stock deployment, never a 跟子 landing on a stone
        assert.ok(p.last.includes('S:redeploy') && !p.last.includes('S:stock') && (p.last.length === 1 || p.last.includes('F:follower')), JSON.stringify(p));
      }
    });
  }
  // report (maintainer decision 2026-10-08): no 跟子 on 深水区 — the talent's around a stone, S3's on enemy tiles. Before
  // the fix these runs put 1–7 跟子 each in m04's water (19 in all over the scratch check of six runs).
  for (const [sk, layout, seed] of [[1, 'side', 2], [2, 'near', 1], [2, 'side', 1], [0, 'near', 4]]) {
    test(`S${sk + 1} ${layout} seed ${seed}: no 跟子 on a 深水区 tile`, async () => {
      const r = await runWang({ sk, stones: LAYOUTS[layout], seed, until: 90 });
      assert.equal(r.errors.length, 0);
      assert.ok(r.seen.follower > 0, `跟子 were built (${JSON.stringify(r.seen)})`);
      assert.equal(r.deep, 0, 'no 跟子 stood in the deep water');
    });
  }
});

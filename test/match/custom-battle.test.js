// test/match/custom-battle.test.js — the custom 규칙 모드's battle settings (shared/ruleset.js simRuleFlags,
// server/match/gamedata.js enemyScale / leaderScale / bossHpMul / layerCap; maintainer decisions 2026-10-18): the enemy
// and leader stat percents on the round's official multipliers shaped by the curve, the 限伤 value and its 不限制 mode,
// and the lifted 999-layer cap — on the real match path (harness → buildBattleSpec → createBattleFromSpec). Every
// official value leaves the multipliers and the battle specs as a classic match has them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, GEO, BOND_LAYER_CAP, layerGainRoom, layerCapOf, bossHitLimitOf } from '../../shared/constants.js';
import { sanitizeCustom, curveScale, simRuleFlags } from '../../shared/ruleset.js';
import { GameData } from '../../server/match/gamedata.js';
import { bossPoolHp, SharedBossPool } from '../../server/match/finalAssault.js';
import { buildBossWave, setupMatchWaves } from '../../server/match/waves.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import { FakeBattle } from './fakeBattle.js';
import { DATA, makeMatch, checkInvariants } from './harness.js';

const custom = (c) => ({ preset: 'custom', custom: c });
const MODES = Object.keys(DATA.config.modes).filter((id) => id !== 'mode_training_1');
const close = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

test('every official value: the enemy and leader multipliers, the leader pools and the layer cap of a classic match', () => {
  for (const modeId of MODES) {
    const a = new GameData(DATA, modeId);
    const b = new GameData(DATA, modeId, sanitizeCustom({}));
    for (let r = 1; r <= 16; r++) {
      assert.deepEqual(b.enemyScale(r), a.enemyScale(r), `${modeId} R${r}`);
      assert.deepEqual(b.leaderScale(r), a.leaderScale(r), `${modeId} R${r} leaders`);
      assert.deepEqual(a.leaderScale(r), a.enemyScale(r), `${modeId} R${r}: officially the leaders take the round's`);
    }
    for (const id of Object.keys(DATA.bosses)) {
      assert.equal(bossPoolHp(b, id, 2), bossPoolHp(a, id, 2), `${modeId} ${id}`);
      assert.equal(b.bossPoolHp(id, 2), a.bossPoolHp(id, 2));
    }
    assert.equal(b.layerCap, BOND_LAYER_CAP);
    assert.equal(b.bossHpMul('boss_1'), 1);
  }
  assert.deepEqual(simRuleFlags(custom({})), {});
});

test('enemy and leader percents on the curve: normal enemies take the 敌人 ones, the leaders and their summons the 敌方领袖 ones', () => {
  const c = sanitizeCustom({
    enemies: { hp: 200, atk: 50, def: 300, res: 400, speed: 80, curve: 'steep' },
    leaders: { hp: 300, atk: 150, def: 50, res: 200 },
  });
  const off = new GameData(DATA, 'mode_multi_hard');
  const gd = new GameData(DATA, 'mode_multi_hard', c);
  const b1 = off.baseEnemyScale(1);
  for (const r of [1, 5, 10, 14, 15]) {
    const base = off.baseEnemyScale(r);
    const e = gd.enemyScale(r);
    close(e.hpMul, curveScale(base.hpMul, b1.hpMul, 'steep') * 2, `R${r} hp`);
    close(e.atkMul, curveScale(base.atkMul, b1.atkMul, 'steep') * 0.5, `R${r} atk`);
    close(e.speedMul, base.speedMul * 0.8, `R${r} speed`);
    assert.equal(e.defMul, 3);
    assert.equal(e.resMul, 4);
    assert.equal(e.supplyHpMul, base.supplyHpMul, 'the 补给线 share stays the official ratio');
    const l = gd.leaderScale(r);
    close(l.hpMul, curveScale(base.hpMul, b1.hpMul, 'steep') * 3, `R${r} leader summons' hp`);
    close(l.atkMul, curveScale(base.atkMul, b1.atkMul, 'steep') * 1.5, `R${r} leader atk`);
    assert.equal(l.speedMul, base.speedMul, 'the leaders keep the round speed');
    assert.equal(l.defMul, 0.5);
    assert.equal(l.resMul, 2);
  }
  assert.ok(gd.enemyScale(14).hpMul / 2 > off.enemyScale(14).hpMul, 'steep rises faster than the official');
  // the shared pool: × the leader HP percent (both pool sizes)
  for (const id of ['boss_1', 'boss_8']) {
    assert.equal(bossPoolHp(gd, id, 4), Math.round(bossPoolHp(off, id, 4) * 3));
    assert.equal(gd.bossPoolHp(id, 4), bossPoolHp(gd, id, 4));
  }
  // flat: every round at round 1's multipliers; 100 % DEF / RES add no field
  const flat = new GameData(DATA, 'mode_multi_hard', sanitizeCustom({ enemies: { curve: 'flat' } }));
  for (const r of [2, 9, 14]) {
    assert.equal(flat.enemyScale(r).hpMul, b1.hpMul);
    assert.equal(flat.enemyScale(r).atkMul, b1.atkMul);
    assert.equal(flat.enemyScale(r).speedMul, off.baseEnemyScale(r).speedMul, 'the speed is not on the curve');
    assert.ok(!('defMul' in flat.enemyScale(r)) && !('resMul' in flat.enemyScale(r)));
  }
});

test('the boss wave: the leader spawns with the 敌方领袖 multipliers, its parts and escorts with the 敌人 ones', () => {
  const c = sanitizeCustom({ enemies: { atk: 200, def: 300 }, leaders: { atk: 50, res: 150 } });
  const gd = new GameData(DATA, 'mode_multi_hard', c);
  const off = new GameData(DATA, 'mode_multi_hard');
  const setup = setupMatchWaves(gd, createRng(3));
  for (const [bossId, round] of [['boss_1', 14], ['boss_8', 15]]) {
    const wave = buildBossWave(gd, createRng(1), setup.factions, round, { bossId, solo: false });
    const base = off.enemyScale(round);
    const leaders = wave.spawns.filter((s) => s.tag === 'boss');
    const others = wave.spawns.filter((s) => s.tag !== 'boss');
    assert.ok(leaders.length && others.length, `${bossId}: a leader and other enemies`);
    for (const s of leaders) {
      close(s.mods.atkMul, base.atkMul * 0.5, `${bossId} leader atk`);
      assert.equal(s.mods.resMul, 1.5);
      assert.ok(!('hpMul' in s.mods) && !('defMul' in s.mods), 'no HP multiplier (the pool), no DEF at 100 %');
    }
    for (const s of others) {
      close(s.mods.atkMul, base.atkMul * 2, `${bossId} ${s.enemyKey} atk`);
      assert.equal(s.mods.defMul, 3);
      assert.ok(!('resMul' in s.mods));
    }
  }
});

test('real match path: a normal field spawns its enemies with the custom stats, RES never above 100; a classic one as before', () => {
  const run = (ruleset) => {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', seed: 5, ruleset }).start();
    h.toPrep(2);
    const spec = buildBattleSpec({ battleId: 'cb.normal', ...h.m._normalOpts(h.ps('p_0')) });
    const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
    for (let i = 0; i < 30 * 40 && b.enemies.length < 3; i++) b.step();
    const seen = new Map();
    for (const e of b.units.filter((u) => u.side === 'enemy')) if (!seen.has(e.defId)) seen.set(e.defId, { base: { ...e.base }, res: e.s.res });
    h.m.dispose();
    return { spec, seen };
  };
  const off = run(undefined);
  const cus = run(custom({ enemies: { hp: 50, def: 200, res: 1000 } }));
  assert.ok(off.seen.size > 0, 'enemies spawned');
  assert.deepEqual(off.spec.flags.noLayerCap, undefined);
  let compared = 0;
  for (const [key, o] of off.seen) {
    const x = cus.seen.get(key);
    if (!x) continue;
    compared++;
    close(x.base.maxHp, o.base.maxHp * 0.5, `${key} hp`);
    close(x.base.def, o.base.def * 2, `${key} def`);
    close(x.base.atk, o.base.atk, `${key} atk`);
    assert.ok(x.res <= 100, `${key}: RES ${x.res} stays ≤ 100`);
    if (o.base.res > 0) assert.equal(x.res, Math.min(100, o.base.res * 10));
  }
  assert.ok(compared > 0, 'the same enemies on both fields');
});

test('限伤 value and 不限制 on a real boss field; 按上限计算 lands at the custom value', () => {
  const gd = new GameData(DATA, 'mode_multi_hard');
  const setup = setupMatchWaves(gd, createRng(3));
  const players = [
    { playerId: 'p_0', seat: 0, side: 'L', colOffset: 0, units: [], bonds: {}, playerEffects: [] },
    { playerId: 'p_1', seat: 1, side: 'R', colOffset: 8, units: [], bonds: {}, playerEffects: [] },
  ];
  const field = (bosses) => {
    const pool = new SharedBossPool(1e8);
    const wave = buildBossWave(gd, createRng(1), setup.factions, 14, { bossId: 'boss_1', solo: false });
    const spec = buildBattleSpec({
      battleId: 'cb.boss', fieldId: 'b1', kind: 'boss', seed: 5, modeId: 'mode_multi_hard', round: 14, stageId: 'act2autochess_m01',
      rect: { ...GEO.BOSS_RECT }, timeLimit: null, players, spawns: wave.spawns, routes: wave.routes,
      flags: { layerGainsEnabled: false, ...gd.dp, ...simRuleFlags(custom({ bosses })) },
      enemyOverrides: wave.overrides, waveId: wave.templateId, bossId: 'boss_1', boss: { poolHp: pool.maxHp, poolMax: pool.maxHp },
    });
    const b = createBattleFromSpec(spec, undefined, { sharedBoss: pool, recordEvents: true, quiet: true });
    for (let i = 0; i < 30 * 120 && !b.enemies.some((e) => e.alive && e.isBoss); i++) b.step();
    const L = b.enemies.find((e) => e.alive && e.isBoss);
    assert.ok(L, 'the leader spawned');
    const hit = (n) => { const before = pool.hp; b.dealDamage(null, L, { amount: n, type: 'true', ignoreSleep: true }); return before - pool.hp; };
    return { spec, hit };
  };
  const v = field({ hitLimit: 500000 });
  assert.equal(v.spec.flags.bossHitLimit, 500000);
  assert.equal(v.hit(400000), 400000, 'over the official 300000, under the custom value: lands');
  assert.equal(v.hit(500000), 0, 'at the custom value: cancelled');
  const none = field({ hitMode: 'none' });
  assert.equal(none.spec.flags.bossHitLimit, 0);
  assert.equal(none.hit(5e6), 5e6, '不限制: any hit lands');
  const cl = field({ hitMode: 'clamp', hitLimit: 1000000 });
  assert.equal(cl.hit(2e6), 1e6, '按上限计算 at the custom value');
  assert.equal(cl.hit(999999), 999999);
  const off = field({});
  assert.equal(off.spec.flags.bossHitLimit, undefined);
  assert.equal(off.hit(300000), 0, 'the official limit');
  assert.equal(bossHitLimitOf({ bossHitLimit: -1 }), 300000, 'a malformed value is the official one');
  assert.equal(bossHitLimitOf({ bossHitLimit: 0 }), Infinity);
});

test('lifted layer cap: prep-side gains, the settlement and the battle\'s live copy go past 999; every battle spec carries it', () => {
  assert.equal(layerCapOf({ noLayerCap: true }), Infinity);
  assert.equal(layerCapOf({}), 999);
  assert.equal(layerGainRoom(995, 20, Infinity), 20);
  assert.equal(layerGainRoom(995, 20), 4);
  FakeBattle.reset();
  const h = makeMatch({
    mode: 'coop', humans: 2, seed: 82, fake: true, ruleset: custom({ bonds: { noLayerCap: true }, flow: { rounds: 6 } }),
    script: (b) => (b.round === 1 ? { layerGains: { p_0: { yanShip: 50 }, p_1: { yanShip: 50 } } } : {}),
  }).start();
  const m = h.m;
  h.toPrep(1);
  const [a, b] = [h.ps('p_0'), h.ps('p_1')];
  a.layers.yanShip = 980;
  h.drive(() => m.phase === PHASE.SETTLE);
  assert.equal(a.layers.yanShip, 1030, '980 + 50: no cap');
  assert.equal(b.layers.yanShip, 50);
  checkInvariants(m);
  assert.equal(a.addLayers('yanShip', 2000, { reason: 'test' }), 2000, 'prep-side: no cap');
  assert.equal(a.layers.yanShip, 3030);
  checkInvariants(m);
  // the battles of the match: normal, 联防, boss — each spec carries the flag (the browsers clamp as the server)
  h.runToEnd();
  const kinds = new Set();
  for (const fb of FakeBattle.instances) {
    assert.equal(fb.opts.flags.noLayerCap, true, `${fb.kind} R${fb.round}`);
    kinds.add(fb.kind);
  }
  assert.ok(kinds.has('normal') && kinds.has('boss'), [...kinds].join());
  FakeBattle.reset();
});

test('the battle\'s live copy: Battle.addLayers past 999 under the flag, 999 without', () => {
  const live = (flags) => {
    const spec = buildBattleSpec({
      battleId: 'cb.layers', kind: 'normal', seed: 1, modeId: 'mode_single_hard', round: 1, stageId: 'act2autochess_m01', rect: { ...GEO.NORMAL_RECT },
      timeLimit: 60, players: [{ playerId: 'P', seat: 0, side: 'L', colOffset: 0, units: [], bonds: { yanShip: { count: 3, active: true, tier: 1, layers: 990 } }, playerEffects: [] }],
      spawns: [], routes: [], flags: { layerGainsEnabled: true, ...flags },
    });
    const b = createBattleFromSpec(spec, undefined, { recordEvents: false, quiet: true });
    b.step();
    return [b.addLayers('P', 'yanShip', 20, 'garrison'), b.getPlayer('P').bonds.yanShip.layers];
  };
  assert.deepEqual(live({}), [9, 999]);
  assert.deepEqual(live(simRuleFlags(custom({ bonds: { noLayerCap: true } }))), [20, 1010]);
});

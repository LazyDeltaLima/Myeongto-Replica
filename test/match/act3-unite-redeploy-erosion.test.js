// Two 规程 (act3autochess) rules that differ from the 盟约, each a season switch of shared/seasons.js:
// - uniteKeepsRedeploy: a 联防 helper's operator knocked out at the end of its own combat keeps the rest of its redeploy
//   timer (PRTS 卫戍协议/帮助 §联防阶段 "自卫戍协议：规程·序列Ⅰ起，作战结束时为退场状态的干员在联防阶段将继承剩余再部署时间";
//   docs/rules/sim.md 「규정 연합 방어 — 남은 재배치 시간」). The 盟约 one starts its full timer again (test/match/unitedown.test.js).
// - leaderTakesErosion: an enemy leader takes 侵蚀 (erosion) damage (a CN player's report: 克莱门莎's erosion lands on the
//   规程 leader); the 盟约 leader does not ("最终攻势中，敌方领袖不会受到侵蚀损伤"; docs/rules/sim.md 「규정 리더 적의 침식」).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { Battle } from '../../server/sim/Battle.js';
import { createBattleFromSpec } from '../../server/sim/spec.js';
import { DataSource, getDefaultSource, hasGeneratedData } from '../../server/sim/simdata.js';
import { DOWN_STATE, FORCED_EXIT } from '../../server/sim/constants.js';
import { getData } from '../../server/data.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { FakeBattle } from './fakeBattle.js';
import { makeMatch, give, legalTileFor, checkInvariants } from './harness.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';

const REAL = { skip: !hasGeneratedData() };
const quiet = { warn() {}, error() {}, info() {}, debug() {} };
const ACT3 = hasGeneratedData() ? getData({ log: quiet, season: 'act3autochess' }) : null;
const WALL = chessRec({ id: 't_wall', profession: 'TANK', stats: { atk: 0, maxHp: 1e6, def: 0, res: 0, blockCnt: 3, respawnTime: 40 }, rangeGrid: [[0, 0]], skill: null });
const DUMMY = enemyRec({ key: 'enemy_dummy', hp: 1e9, atk: 0, speed: 0 });
/** A battle over the default season's data, or with `season`'s config (what dataFile(battle, 'config') reads). */
const arena = (season) => makeBattle({
  content: 'generic', extraContent: [bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
  units: [{ chessId: 't_wall', row: 9, col: 4 }], kits: { t_wall: () => ({ trait: { noAttack: true } }) },
  ...(season
    ? { data: new DataSource({ chess: { t_wall: WALL }, enemies: { enemy_dummy: DUMMY }, config: { season } }, getDefaultSource()) }
    : { defs: { chess: { t_wall: WALL }, enemies: { enemy_dummy: DUMMY } } }),
});

class NoFinish extends Battle {
  constructor(o) { super({ ...o, autoFinish: false, timeLimit: 1e6 }); }
}

test('规程: a knocked-out operator reports the rest of its redeploy timer in unitsEnd (respawnLeft); the 盟约 result has none', REAL, () => {
  for (const season of ['act3autochess', null]) {
    const h = arena(season);
    h.step();
    const u = h.unit('t_wall');
    h.b.dealDamage(null, u, { amount: 1e7, type: 'true', canDodge: false });
    assert.ok(!u.alive && h.b.isDown(u));
    h.run(10);
    h.b.forceEnd();
    const end = h.b.result().perPlayer[u.ownerId].unitsEnd.find((x) => x.uid === u.uid);
    if (season) {
      assert.ok(Math.abs(end.respawnLeft - (u.respawnAt - h.b.time)) < 0.011 && end.respawnLeft > 20 && end.respawnLeft < 40,
        `规程: the rest of the timer (${end.respawnLeft} s) — shared/seasons.js uniteKeepsRedeploy, docs/rules/sim.md 「규정 연합 방어 — 남은 재배치 시간」`);
    } else {
      assert.equal(end.respawnLeft, undefined, '盟约: no respawnLeft (its digest stays as it was)');
    }
  }
});

for (const clientCombat of [true, false]) {
  test(`规程 联防 (${clientCombat ? 'client-side combat' : 'server-run fallback'}): an operator down at the end of its own combat keeps the rest of its redeploy timer`, REAL, () => {
    const dead = new Set();
    const left = {};
    const h = makeMatch({
      mode: 'coop', modeId: 'mode_multi_normal', humans: 3, seed: 3702, fake: true, clientCombat, data: ACT3, season: 'act3autochess',
      script: (b) => (b.kind === 'normal' ? { leaks: { p_0: 3 }, deadUids: [...dead], respawnLeft: left } : {}),
    }).start();
    const m = h.m;
    h.toPrep(1);
    const t1 = Object.values(ACT3.chess).filter((c) => c.visible && !c.isGolden && c.tier <= 2 && m.pool.has(c.chessId)).map((c) => c.chessId).sort();
    const melee = t1.filter((id) => ACT3.chess[id].position === 'MELEE');
    const ranged = t1.filter((id) => ACT3.chess[id].position === 'RANGED');
    const place = (ps, id) => give(m, ps, id, 'board', legalTileFor(m, ps, id));
    const p1 = h.ps('p_1'), p2 = h.ps('p_2');
    const down1 = place(p1, melee[0]);
    place(p1, ranged[0]);
    place(p1, ranged[1]);
    const down2 = place(p2, melee[1]);
    place(p2, ranged[2]);
    dead.add(down1.uid); left[down1.uid] = 7.5;
    dead.add(down2.uid); left[down2.uid] = 0;
    h.drive(() => m.phase === PHASE.UNITE);
    assert.deepEqual(m.unitePlan.helpers.map((p) => p.playerId), ['p_1', 'p_2']);

    let players, b;
    if (clientCombat) {
      const f = m.fields[0];
      players = f.spec.players;
      b = createBattleFromSpec(f.spec, new DataSource(ACT3, null), { BattleClass: NoFinish, recordEvents: true });
    } else {
      const u = FakeBattle.instances.find((x) => x.kind === 'unite');
      players = u.opts.players;
      b = new NoFinish({ ...u.opts, data: m.ds, logger: quiet });
    }
    const inp = (pid, uid) => players.find((p) => p.playerId === pid).units.find((x) => x.uid === uid);
    assert.deepEqual(inp('p_1', down1.uid)?.carryState, { down: true, respawnLeft: 7.5 }, 'the input carries the rest of the timer (unite.js)');
    assert.deepEqual(inp('p_2', down2.uid)?.carryState, { down: true, respawnLeft: 0 });

    do b.step(); while (b.waveT0 == null);
    const unitOf = (uid, pid) => b.allyUnits.find((u) => u.uid === uid && u.ownerId === pid);
    const u1 = unitOf(down1.uid, 'p_1'), u2 = unitOf(down2.uid, 'p_2');
    for (const u of [u1, u2]) assert.ok(u && !u.alive && b.isDown(u) && u.removeReason === FORCED_EXIT, 'forced out at the start');
    assert.ok(Math.abs(u1.respawnAt - u1.deathAt - 7.5) < 1e-6,
      `the inherited 7.5 s, not its full ${u1.base.respawnTime} s (shared/seasons.js uniteKeepsRedeploy, docs/rules/sim.md 「규정 연합 방어 — 남은 재배치 시간」)`);
    assert.ok(u2.respawnAt <= u2.deathAt + 1e-9, 'a timer already run out: it waits only for DP / its tile');
    assert.notEqual(b._downState(u2), DOWN_STATE.COUNTING);
    // back once the inherited timer is done and the DP reaches its cost (a short timer can leave it waiting for DP)
    while (b.time < u1.respawnAt + 40 && !u1.alive) b.step();
    assert.ok(u1.alive && u1.deployed && b.time >= u1.deathAt + 7.5, `redeployed at ${b.time.toFixed(2)} s`);
    checkInvariants(m);
    m.dispose();
  });
}

test('规程: an enemy leader takes 侵蚀 (erosion); the 盟约 leader does not', REAL, () => {
  for (const season of ['act3autochess', null]) {
    const h = arena(season);
    h.step();
    const u = h.unit('t_wall');
    const e = h.spawn('enemy_dummy', { pos: [9, 6], routeIndex: 0, mods: { speedMul: 0 }, tag: 'boss' });
    assert.ok(e.isBoss);
    h.b.dealDamage(u, e, { type: 'element', element: 'erosion', amount: 300 });
    if (season) assert.ok(e.elem.erosion > 0, `规程: the leader's erosion gauge fills (${e.elem.erosion}) — shared/seasons.js leaderTakesErosion, docs/rules/sim.md 「규정 리더 적의 침식」`);
    else assert.equal(e.elem.erosion, 0, '盟约: "最终攻势中，敌方领袖不会受到侵蚀损伤"');
  }
});

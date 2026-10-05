// Local NAS patch, battle side: enemy fixes kept out of the upstream content files so that merging upstream releases
// stays conflict-free. content/index.js loads this file as one more domain module (one line: DOMAIN_NAMES.push), so it
// runs wherever the sim runs — the server and the browser (client-run boss / hidden fields).
//
// “帝国的甲胄” (enemy_10027_vtsk, the 隐秘核心 假想敌：胄 escort), per PRTS “帝国的甲胄”:
//   出场 · 回忆里的誓死  "在全场范围内的1名当前生命值最高的我方单位所在位置创造一个持续5.85秒、碰撞范围3×3的弹道，弹道在延迟1.33秒后
//                      对碰撞范围内的1名当前生命值最高的我方单位造成攻击力100%的物理伤害，此后每0.53秒重复一次，最多命中8次"
//                      upstream (content/enemies.js KITS.enemy_10027_vtsk): all 8 hits in one tick 0.5 s after it appears.
//   蓄力 · 回忆里的怒守  "仅被阻挡时可触发" — a melee triple hit, 100 % ATK each. upstream: fires on the 15 s cooldown and
//                      turns the next attack into three hits even when that attack is the unblocked ranged one.
// How: an enemySpawn hook that runs before content/enemies.js's (priority 100) takes `Appear` / `MultiCombat` out of the
// enemy's ability record, so the upstream kit builds neither; the versions below are attached instead (its ranged ×0.8
// stays upstream's). When upstream fixes either skill, drop it here — test/local-patch.test.js pins upstream's current
// behaviour so a merge that changes it fails there. Expected upstream failure while this patch is in: the “帝国的甲胄”
// case of test/sim/feedback1f-liftoff.test.js (F3 review) counts all 8 barrage hits 1.5 s after the spawn.
//
// 假想敌：胄 死亡集群 vs 限伤 (local decision 2026-10-05): a drone's death costs the leader 2 % of the shared pool
// (content/bosses.js kitHelm, one Battle.loseHp), and a leader hit of ≥ BOSS_HIT_LIMIT is cancelled (sim/damage.js
// leaderHitCancelled). With the local per-player pool (server/local-patch.js) a pool above 15 M — 隐秘核心 终极 with
// three or four players — made every drone kill do nothing. While such a drone's death is dispatched, a loss on a
// leader at or above the limit is passed on in equal parts below it (same total, credit and HP; other hits keep 限伤).
// Expected upstream failure: 「限伤 vs 【死亡集群】」 of test/sim/playtest6_limits.test.js (it asserts the cancel).

import { abOf, attach, hurt, allTargets, areaAlliesInTiles } from './enemies.js';
import { BOSS_HIT_LIMIT } from '../../../shared/constants.js';

export const VTSK = 'enemy_10027_vtsk';
/** 回忆里的誓死 (PRTS): first hit after 1.33 s, one every 0.53 s, the 3×3 弹道 lasts 5.85 s. */
export const BARRAGE_DELAY = 1.33, BARRAGE_STEP = 0.53, BARRAGE_LIFE = 5.85;

export function install(battle) {
  battle.on('enemySpawn', ({ enemy }) => { if (enemy && enemy.defId === VTSK) patchVtsk(battle, enemy); }, { priority: 101 });
  exemptDroneLink(battle);
}

const HELM = /^enemy_9013_acstmk/;
/** The 死亡集群 drone key of a 假想敌：胄 (its skill 2 enemy_key; content/bosses.js kitHelm's default). */
const droneKeyOf = (boss) => ((boss.def && boss.def.skills) || []).find((s) => s && s.prefabKey === '2')?.bbStr?.enemy_key ?? 'enemy_1005_yokai';
const isHelmDrone = (b, u) => !!u && u.side === 'enemy' && !u.isBoss
  && b.enemies.some((o) => o.isBoss && HELM.test(o.defId) && droneKeyOf(o) === u.defId);

/** Whether a 'death' event marked by exemptDroneLink is being dispatched (Battle.emit's open frames). */
function inDroneDeath(b) {
  for (let i = 0; i < (b._emitDepth | 0); i++) if (b._frameName?.[i] === 'death' && b._frameCtx?.[i]?.localDroneLink) return true;
  return false;
}

/** Before content/enemies.js's death dispatch (priority 50) the event is marked; a 胄 drone's link loss is split below 限伤. */
function exemptDroneLink(b) {
  b.on('death', (c) => { if (isHelmDrone(b, c.unit)) c.localDroneLink = true; }, { priority: 51 });
  const loseHp = b.loseHp.bind(b);
  b.loseHp = (target, amount, opts) => {
    if (!target || !target.isBoss || !(BOSS_HIT_LIMIT > 0) || !(Math.ceil(amount) >= BOSS_HIT_LIMIT) || !inDroneDeath(b)) return loseHp(target, amount, opts);
    const n = Math.ceil(amount / (BOSS_HIT_LIMIT - 1));
    let sum = 0;
    for (let i = 0; i < n && target.alive; i++) sum += loseHp(target, amount / n, opts) || 0;
    return sum;
  };
}

function patchVtsk(b, e) {
  const ab = abOf(b, e);
  const ap = ab.sk.Appear, mc = ab.sk.MultiCombat;
  delete ab.sk.Appear;
  delete ab.sk.MultiCombat;
  attach(b, e, [ap && barrage(ap.bb.times ?? 0), mc && chargedTriple(mc)]);
}

/** 回忆里的誓死: one 3×3 zone on the highest-HP ally's tile; each pulse hits the highest-HP ally inside it, ≤ `times` hits. */
function barrage(times) {
  return {
    spawn(b, e) {
      const lock = allTargets(b, e).sort((p, q) => q.hp - p.hp)[0];
      if (!lock || !(times > 0)) return;
      const r = lock.tileR, c = lock.tileC;
      b.fx('telegraph', { x: lock.x, y: lock.y, r: 1, tiles: 'box', dur: BARRAGE_LIFE, kind: 'barrage', id: e.id });
      let hits = 0;
      for (let k = 0; BARRAGE_DELAY + k * BARRAGE_STEP <= BARRAGE_LIFE + 1e-9; k++) {
        b.after(BARRAGE_DELAY + k * BARRAGE_STEP, () => {
          // the zone goes with its source [ASSUMED: PRTS does not say whether the 弹道 outlives the enemy]
          if (!e.alive || hits >= times) return;
          const t = areaAlliesInTiles(b, e, r, c, 'box', 1).sort((p, q) => q.hp - p.hp)[0];
          if (!t) return;
          hits++;
          b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'barrage' });
          hurt(b, e, t, e.s.atk, 'phys');
        }, { owner: e });
      }
    },
  };
}

/** 回忆里的怒守: ready on the data cooldown, cast only while blocked; that melee attack lands as three 100 % hits. */
function chargedTriple(mc) {
  const n = mc.bb.times ?? 1;
  return {
    cd: mc.cd, icd: mc.icd,
    cond: (b, e) => !!e.blockedBy,
    fire(b, e, a) { a.ready = n; },
    dealt(c, b, e, a) {
      if (!(a.ready > 1) || c.target !== e.blockedBy) return;
      const m = a.ready;
      a.ready = 0;
      for (let i = 1; i < m; i++) hurt(b, e, c.target, e.s.atk, 'phys');
    },
  };
}

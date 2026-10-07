// server/sim/content/kits/ops/op-chen3.js — 赤刃明霄陈 (char_1050_chen3) 自选 operator kit — local patch: the nas-local 선발
// kit (formerly kits/diy.js, docs/LOCAL-PATCH.md 「선발 오퍼레이터」) on upstream's 自选 framework; it replaces upstream's
// op-chen3.js (the owner's rule: where the two differ, ours wins). Kit contract: ../README.md ("How to add an operator
// (自选)"); `chess` = the composed 自选 record (shared/diy.js diyRecordOf), every number from it.
// fx kinds the client draws / sounds from (render/fxgame.js, audio.js kitHitKey): 'chen3Qi' { x, y, id, dir } (S3 剑气 path),
// 'kitHit' { k: 'chen3:s3' }, 'swordStorm' { id } (S2 slashes), 'teleport'.
//
// 赤刃明霄陈 (术战者) — 形意洞照 / 寒暑觉知; S1 赤霄·奔夜, S2 赤霄·绝影-驰, S3 赤霄·天喟
//
// Trait: arts damage (branch). 形意洞照: ATK +atk, ASPD +attack_speed, every damage of hers is 弱点伤害 (the less
// resisted of phys / arts — items/battle.js weaknessRetype; PRTS: "根据目标防御力和法术抗性变更伤害类型").
// 寒暑觉知: every stack_time s without taking damage she heals ATK × random(heal_atk_scale_min…max) % and dodges the
// next physical / arts attack; taking damage restarts the clock (PRTS 备注). Module: ASPD +8 while blocking nobody.
// S2 (PRTS 备注): a slash every 0.4 s, 无敌 meanwhile; a knocked-out target passes on to the nearest other enemy within
// 1.7 of it, else of her range, remaining slashes +1; at the end she 【移动】s to a standing, deployable target's tile;
// then ATK +respawn_buff.atk and respawn_buff.prob phys / arts dodge until the skill ends.
// S3 剑气 (PRTS 备注): "剑气可对空，碰撞半径1.3，移动速度1.5，每次转向前对每个敌人仅判定一次伤害"; "在距离前进方向上的
// 侵入点/保护目标/高度类型为高地的地块的距离不低于0.25时，顺时针旋转90°". Current-HP hp_ratio arts (≥ projectile_min_atk_scale × ATK).
// (2026-10-06) — EN client battle/prefabs/[uc]projectiles.ab `projectile_chr_chen3_s3`:
//   movement: straight (_moveType 4) from her facing (_useSourceDirection), _speed 1.5; untimed (_lifeTimeType 2 — [inferred]:
//     other type-2 projectiles carry _lifeTime 0) and finished at the skill end by chen3_s3[finish_projectile]
//     (FinishManagedProjectiles, _managedBySource).
//   turning (ChangeStateWithHighlandBehaviour): _hitDistance 0.25, _hitEps 0.02, checks _checkHitHighland, _checkHitMapEdge,
//     _checkTileStart (侵入点), _checkTileEnd (保护目标) on the NEXT tile ahead (_CheckNextTile*, _GetDistanceToNextTile) →
//     _ChangeDirection, _clearTargetsAlreadyHitListWhenHit. Nothing else is an obstacle: lowland impassable tiles and
//     things standing on a tile (roadblocks) are not ([inferred] from the flag list). It has no direction field; clockwise
//     is PRTS. The distance is to the next tile's near edge ([inferred] from "_GetDistanceToNextTile" and PRTS), so it turns
//     0.25 past the centre of the last free tile — before 2026-10-06 we looked 0.75 ahead and turned 0.5 too early, counted
//     lowland impassable / blocked tiles and ignored 侵入点.
//   hits: CircleCollider2D radius 1.3 (_ignoreRangeScale), _hitPasserby every 0.03 s (_interval; the sim ticks 1/30 s),
//     ground + air, each enemy once until a turn clears the list (_canHitSameTargetMultipleTimes 0, _maxHitNum 9999).

import { DIRS, dirVec, normDir } from '../../../dir.js';
import { isHpLoss } from '../../../damage.js';
import { canTargetEnemy } from '../../../targeting.js';
import { weaknessRetype } from '../../items/battle.js';
import { talentBb } from '../shared/tier1.js';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const live = (u) => !!u && u.alive && u.deployed && !u.removed && !u.hidden;
const skillGridOf = (def) => (def?.skill?.rangeGrid?.length ? def.skill.rangeGrid : null);
const ANY = Object.freeze({ canHitFly: true });
const inRange = (battle, unit) => battle.enemiesInKeys(unit.rangeKeys || [], unit, ANY);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const QI_SPEED = 1.5, QI_RADIUS = 1.3, QI_LOOK = 0.25, QI_EPS = 0.02, S2_INTERVAL = 0.4, S2_PASS_RADIUS = 1.7;

/**
 * One tick of the S3 剑气 (exported for tests). `st` = { x, y, d } (x = col, y = row, d ∈ UP/RIGHT/DOWN/LEFT) is updated in
 * place: turn 90° clockwise while the next tile ahead is an obstacle within QI_LOOK (+ QI_EPS), then move `dist`, stopping
 * on the QI_LOOK mark in front of an obstacle. Returns the number of turns. `grid` needs inRect(r, c) and tile(r, c).
 */
export function chen3QiAdvance(grid, st, dist) {
  const wall = (r, c) => {
    if (!grid.inRect(r, c)) return true;                                  // _checkHitMapEdge
    const t = grid.tile(r, c);
    return t.height === 'HIGH' || t.special === 'start' || t.special === 'end';  // highland / 侵入点 / 保护目标
  };
  const ahead = (d) => {
    const [dr, dc] = dirVec(d), r0 = Math.round(st.y), c0 = Math.round(st.x);
    const past = dr ? (st.y - r0) * dr : (st.x - c0) * dc;              // how far past the centre of its tile
    return { gap: 0.5 - past, wall: wall(r0 + dr, c0 + dc) };
  };
  let turns = 0;
  for (; turns < 4; turns++) {
    const a = ahead(st.d);
    if (!a.wall || a.gap > QI_LOOK + QI_EPS) break;
    st.d = DIRS[(DIRS.indexOf(st.d) + 1) % 4];
  }
  const a = ahead(st.d);
  const move = a.wall ? Math.max(0, Math.min(dist, a.gap - QI_LOOK)) : dist;
  const [dr, dc] = dirVec(st.d);
  st.x += dc * move; st.y += dr * move;
  return turns;
}

function chen3(bb, chess, def) {
  const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
  const moduleAspd = num(chess?.trait?.bb?.attack_speed, 0);

  /** 剑气 of S3: a virtual mover (chen3QiAdvance), damage once per enemy per straight run. */
  const releaseQi = (battle, unit) => {
    const st = { x: unit.x, y: unit.y, d: normDir(unit.dir) };
    let hitSet = new Set();
    let steps = 0;
    const seq = unit.deploySeq;
    const minDmg = unit.s.atk * num(bb.projectile_min_atk_scale, 5.5), ratio = num(bb.hp_ratio, 0.06);
    const STEP = 1 / 30;   // the sim tick (constants.js TICK); the client hit interval is 0.03 s
    const job = battle.every(STEP, () => {
      if (unit.deploySeq !== seq || !unit.alive || !unit.skill?.active || unit.skill.id !== 'skchr_chen3_3') { job.cancel(); return; }
      const turned = chen3QiAdvance(battle.grid, st, QI_SPEED * STEP) > 0;
      if (turned) hitSet = new Set();   // _clearTargetsAlreadyHitListWhenHit: "每次转向前对每个敌人仅判定一次伤害"
      const { x, y, d } = st;
      // render/fxgame.js moves her official S3 trail along it: every 0.1 s and at once on a turn (re-aims the dragon)
      if (turned || steps % 3 === 0) battle.fx('chen3Qi', { x, y, id: unit.id, dir: d });
      if (++steps % 9 === 0) battle.fx('swordStorm', { x, y, r: 0.5 }); // procedural fallback (render/fx.js)
      // local patch: only selectable enemies (PRTS AOE判定 "每个可以被选中的敌人": no unrevealed 隐匿 / untargetable)
      let struck = false;
      for (const e of battle.foesInRadius(x, y, QI_RADIUS)) {
        if (!e.alive || hitSet.has(e.id)) continue;
        hitSet.add(e.id);
        struck = true;
        battle.dealDamage(unit, e, { amount: Math.max(minDmg, e.hp * ratio), type: 'arts', isSkill: true, tags: ['skill', 'chen3Qi'] });
      }
      if (struck) battle.fx('kitHit', { x, y, id: unit.id, k: 'chen3:s3' }); // local patch: its hit sound (projectile_chr_chen3_s3, audio.js)
    }, { owner: unit });
  };

  /** S2: 10 slashes (+1 per kill), passing on; then the 【移动】 and the buff. */
  const slashes = (battle, unit) => {
    const seq = unit.deploySeq;
    const scale = num(bb.atk_scale, 4.3);
    const grid = skillGridOf(def);
    // local patch (audit 2026-10-06): unitsInGrid lists every enemy on the grid — only selectable ones (no unrevealed
    // 隐匿 / untargetable), as the range picks below (enemiesInKeys → canTargetEnemy)
    const keys = grid ? battle.unitsInGrid(unit, grid, { side: 'enemy' }).filter((e) => canTargetEnemy(unit, e, ANY)) : inRange(battle, unit);
    const first = keys.filter((e) => e.alive).sort((a, b) => dist(a, unit) - dist(b, unit))[0]
      || inRange(battle, unit).sort((a, b) => dist(a, unit) - dist(b, unit))[0];
    // local patch: cast on a 隐匿 enemy alone (the skill-range trigger ignores selectability) — wait for a selectable one
    if (!first) {
      if (unit.skill?.active && unit.skill.id === 'skchr_chen3_2') battle.after(0.2, () => { if (unit.deploySeq === seq && unit.skill?.active && unit.skill.id === 'skchr_chen3_2') slashes(battle, unit); }, { owner: unit });
      return;
    }
    battle.addBuff(unit, { key: 'chen3:s2:inv', duration: 10 * S2_INTERVAL + 2, flags: { invulnerable: true, disarm: true } });
    let target = first, left = 10;
    const step = () => {
      if (unit.deploySeq !== seq || !unit.alive) return;
      if (!target || !target.alive) {
        const near = battle.foesInRadius(target ? target.x : unit.x, target ? target.y : unit.y, S2_PASS_RADIUS).filter((e) => e.alive);
        target = (near.length ? near : inRange(battle, unit)).sort((a, b) => dist(a, unit) - dist(b, unit))[0] || null;
      }
      if (target && left > 0) {
        left--;
        battle.fx('swordStorm', { x: target.x, y: target.y, id: unit.id, r: 0.6 });
        battle.dealDamage(unit, target, { amount: unit.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', 'chen3S2'] });
        if (!target.alive) left++;
        battle.after(S2_INTERVAL, step, { owner: unit });
        return;
      }
      battle.removeBuff?.(unit, 'chen3:s2:inv');
      // the 【移动】 to a standing target's tile (deployable for her, free)
      if (target && target.alive && !target.isFlying) {
        const r = Math.round(target.y), c = Math.round(target.x);
        if ((r !== unit.tileR || c !== unit.tileC) && battle.grid.canStand(r, c) && !battle.grid.isObstacle(r, c) && !battle.isReservedTile?.(r, c)) {
          const fromX = unit.x, fromY = unit.y;
          if (battle.moveRedeploy(unit, r, c)) battle.fx('teleport', { x: unit.x, y: unit.y, id: unit.id, fromX, fromY });
        }
      }
      if (unit.alive && unit.skill?.active) {
        const p = num(bb['chen3_s2[respawn_buff].prob'], 0.5);
        battle.addBuff(unit, { key: 'chen3:s2:after', duration: Math.max(0.5, num(unit.skill.timeLeft, 2)),
          mods: { atkPct: num(bb['chen3_s2[respawn_buff].atk'], 2.6), dodgePhys: p, dodgeArts: p } });
      }
    };
    step();
  };

  return {
    skills: {
      // 赤霄·奔夜: ATK +atk, two hits, the struck enemies lose their special abilities until the skill ends (silence)
      skchr_chen3_1: {
        kind: 'duration', mods: { atkPct: num(bb.atk) },
        attack: {
          hits: 2,
          onEachHit({ battle, unit, target }) {
            if (target?.alive) battle.applyStatus(target, 'silence', { duration: Math.max(0.1, num(unit.skill?.timeLeft, 1)), source: unit });
          },
        },
      },
      // 赤霄·绝影-驰
      skchr_chen3_2: { kind: 'duration', onStart({ battle, unit }) { slashes(battle, unit); } },
      // 赤霄·天喟: the 剑气 + range 3-12, each attack ≤ max_target ground enemies × 3 hits at attack@atk_scale
      skchr_chen3_3: {
        kind: 'duration',
        hitsFly: true, // local patch: the 剑气 hits flyers — a flyer on the 3-12 casts it too (local-skill-range.js)
        targeting: { rangeGrid: skillGridOf(def), maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), showOwnRange: true },
        attack: { atkScale: num(bb['attack@atk_scale'], 1.8), hits: 3, maxTargets: Math.max(1, num(bb['attack@max_target'], 3)), groundOnly: true, canHitFly: false },
        onStart({ battle, unit }) { releaseQi(battle, unit); },
      },
    },
    talents: [
      { install(battle, unit) { // 形意洞照
        battle.addBuff(unit, { key: 'chen3:t1', mods: { atkPct: num(t0.atk), aspd: num(t0.attack_speed) }, persist: true, allowDead: true });
        battle.on('hit', (c) => { if (c.source === unit && c.dmg && (c.dmg.type === 'phys' || c.dmg.type === 'arts')) weaknessRetype(c.dmg, unit, c.target); }, { owner: unit, priority: -10 });
      } },
      { install(battle, unit) { // 寒暑觉知
        const T = num(t1.stack_time, 7), lo = num(t1.heal_atk_scale_min, 30) / 100, hi = num(t1.heal_atk_scale_max, 160) / 100;
        let since = battle.time, dodge = false;
        battle.on('damaged', (c) => { if (c.target === unit && c.amount > 0 && !isHpLoss(c.dmg)) since = battle.time; }, { owner: unit });
        battle.on('hit', (c) => {
          if (c.target !== unit || !dodge || !c.dmg?.isAttack || (c.dmg.type !== 'phys' && c.dmg.type !== 'arts')) return;
          dodge = false; c.dmg.cancel = true; since = battle.time;
          battle.fx('dodge', { x: unit.x, y: unit.y, id: unit.id });
        }, { owner: unit, priority: 4 });
        battle.every(0.2, () => {
          if (!live(unit) || battle.time - since < T) return;
          since = battle.time;
          battle.heal(unit, unit, unit.s.atk * (lo + battle.rng() * (hi - lo)), { self: true });
          dodge = true;
        }, { owner: unit });
      } },
      { install(battle, unit) { // module trait: ASPD while blocking nobody
        if (!moduleAspd) return;
        battle.every(0.25, () => {
          if (!live(unit)) return;
          const want = !(unit.blocking && unit.blocking.length);
          const has = unit.buffs.some((b) => b.key === 'chen3:mod');
          if (want && !has) battle.addBuff(unit, { key: 'chen3:mod', duration: Infinity, mods: { aspd: moduleAspd } });
          else if (!want && has) battle.removeBuff?.(unit, 'chen3:mod');
        }, { owner: unit });
      } },
    ],
  };
}

export default {
  char_1050_chen3: (bb, chess, def) => chen3(bb, chess, def),
};

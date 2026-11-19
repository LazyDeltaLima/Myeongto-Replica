// server/sim/content/kits/ops/chess_char_5_15-thorn2.js — 引星棘刺 (char_1039_thorn2) kit, tier 5.
// Conventions of the tier-5 kits: ../shared/tier5.js; kit contract and rules: ../README.md.

import { COLS, ALLY_COLLIDER_RADIUS, ENEMY_COLLIDER_RADIUS } from '../../../constants.js';
import { hitRect } from '../../../body.js';
import { sortEnemyTargets } from '../../../targeting.js';
import { toLocal } from '../../../dir.js';
import {
  AURA_IV, AURA_DUR, RING1, num, on, talent, skillGrid, maxCharges, mods, isOp, selectedId, lazySkills,
  instantKind, whileOn, permBuff,
} from '../shared/tier5.js';
import { hypot } from '../../../detmath.js';

// ---------------------------------------------------------------------------------------------------------------
// S3 “我的海疆”'s area (official client: skchr_thorn2_3 `PolygonProjectileToTile` → projectile_chr_thorn2_s3_polygon,
// `Thorn2PolygonRange` · `PolygonSelectorHitBehaviour`; docs/rules/sim.md 「스킬 프리팹의 대상 트리거」, 쏜즈 더 로드스타 S3의 영역). One area per cast
// over the tiles of the operators her units went to, taken as it strikes: their convex hull (`_DoCalculateHull`, Graham scan;
// a point inside the others' triangle and the middle one of three in a row drop out — `_OptimizeLineCollider`); two tiles are
// a rectangle `_polygonLineColliderWide` 0.325 wide along their segment (half of it each side — PRTS 备注 says 0.65), three
// a polygon whose edges are pushed out `_polygonColliderOffset` 0.325 (each edge moved along its outer normal; the corners
// stay cut), one tile that point. An enemy is in it when its collider touches it (`DoFindTargets_DISPOSE`: a physics pre-search
// in the box collider's bounds, then `PolygonCircle` / `PolygonRectangle` with the unit's hit colliders). The box is only
// recomputed from three result points (`_GetBoxColliderData`), so one tile keeps the box of the pooled projectile's last
// area of two tiles or more: hits on the point when that box covers her tile, none on a projectile never used before (a
// zero box at the map origin). The kit always takes the first case (PRTS 备注 「仅存在1点时，判定区域为一点」) [추정·엔진: which
// pooled projectile comes out depends on what that client used it for earlier in the match — docs/rules/sim.md 「스킬 프리팹의
// 대상 트리거」, 쏜즈 더 로드스타 S3의 영역].
const SEA_LINE_HALF = 0.325 / 2, SEA_OFFSET = 0.325;
/** `_delayToStart` of its `AttachToTarget`: the area reaches (and starts hitting) this long after the strike. */
const SEA_DELAY = 0.5;
/**
 * The unit thrown at each operator (projectile_chr_thorn2_s3: `_lifeTime` 0.5 LIMITED, its EffectBehaviour
 * `_clearReachedEffectWhenStop`): its reach effects (thorn2_token_start, thorn2_skill_03_token) end as it stops, this long
 * after the throw — the 'zone' fx's `life` (render/fxgame.js zoneFx).
 */
const SEA_TOKEN_LIFE = 0.5;

/**
 * The area over tile centres `pts` ([x, y]): `{ point: [x, y] }` for one, else `{ poly, hull }` (convex, counter-clockwise;
 * `hull` the tiles left after `_DoCalculateHull` / `_OptimizeLineCollider`'s drop, before the push — `resultForEffect`, the
 * points `Thorn2S3Renderer` draws its line through: the 'seaArea' fx).
 */
function seaArea(pts) {
  const u = [];
  for (const p of pts) if (!u.some((q) => q[0] === p[0] && q[1] === p[1])) u.push(p);
  u.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (u.length <= 1) return u.length ? { point: u[0] } : null;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of u) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (let i = u.length - 1; i >= 0; i--) { const p = u[i]; while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), p) <= 0) hi.pop(); hi.push(p); }
  const h = lo.slice(0, -1).concat(hi.slice(0, -1));   // counter-clockwise, collinear points dropped
  if (h.length === 2) {
    const [a, b] = h, len = hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len * SEA_LINE_HALF, ny = (b[0] - a[0]) / len * SEA_LINE_HALF;
    return { poly: [[a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], hull: h };
  }
  const poly = [];
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], len = hypot(b[0] - a[0], b[1] - a[1]);
    const ox = (b[1] - a[1]) / len * SEA_OFFSET, oy = -(b[0] - a[0]) / len * SEA_OFFSET;   // outer normal of a CCW edge
    poly.push([a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy]);
  }
  return { poly, hull: h };
}

/** Does the circle (x, y, r) touch the area (`PolygonCircle`: an edge within r, or the centre inside)? */
function seaTouchesCircle(area, x, y, r) {
  const r2 = r * r + 1e-9;
  if (area.point) { const dx = x - area.point[0], dy = y - area.point[1]; return dx * dx + dy * dy <= r2; }
  const P = area.poly;
  let inside = true;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const ex = b[0] - a[0], ey = b[1] - a[1], px = x - a[0], py = y - a[1];
    if (ex * py - ey * px < 0) inside = false;
    const l2 = ex * ex + ey * ey, t = l2 > 0 ? Math.max(0, Math.min(1, (px * ex + py * ey) / l2)) : 0;
    const dx = px - t * ex, dy = py - t * ey;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return inside;
}

/** Does the rectangle R ({ x0, x1, y0, y1 }) touch the area (`PolygonRectangle`; both convex: no separating axis)? */
function seaTouchesRect(area, R) {
  if (area.point) { const [x, y] = area.point; return x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1; }
  const P = area.poly, Q = [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]];
  const axes = [[1, 0], [0, 1]];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; axes.push([a[1] - b[1], b[0] - a[0]]); }
  for (const [ax, ay] of axes) {
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, y] of P) { const d = x * ax + y * ay; if (d < p0) p0 = d; if (d > p1) p1 = d; }
    for (const [x, y] of Q) { const d = x * ax + y * ay; if (d < q0) q0 = d; if (d > q1) q1 = d; }
    if (p1 < q0 - 1e-9 || q1 < p0 - 1e-9) return false;
  }
  return true;
}

/**
 * The enemies the area hits this moment: every enemy (ground and air, `_targetMotion` 3) whose collider touches it, and the
 * enemies blocked by an ally standing in it — operators and summons, no devices (`SelectorHitBehaviourWithAllyBlockedEnemy`:
 * its `_allySelector`, `_professionMask` 767 = all but TRAP, `_ignoreAllyTargetFree`, finds the allies in the same area and
 * hits each one's `blockedEnemies`; PRTS 备注 「处于判定区域中的我方单位…阻挡敌人时，被阻挡的敌人视为处于判定区域内」).
 */
function seaTargets(battle, z) {
  const A = z.area, pts = A.point ? [A.point] : A.poly;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  let reach = 0;
  for (const p of pts) reach = Math.max(reach, hypot(p[0] - cx, p[1] - cy));
  const out = new Set();
  // a wide net (a huge enemy's rectangle reaches past its centre), then the exact test
  for (const e of battle.foesInRadius(cx, cy, reach + 3)) {
    const R = e.side === 'enemy' ? hitRect(e) : null;
    if (R ? seaTouchesRect(A, R) : seaTouchesCircle(A, e.x, e.y, e.side === 'enemy' ? ENEMY_COLLIDER_RADIUS : 0)) out.add(e);
  }
  for (const a of battle.allies()) {
    if (!a.blocking || !a.blocking.length || a.hidden || !seaTouchesCircle(A, a.x, a.y, ALLY_COLLIDER_RADIUS)) continue;
    for (const e of a.blocking) if (e.blockedBy === a && e.alive && !e.hidden && !e.s.flags.untargetable) out.add(e);
  }
  return [...out];
}

/** Straight-road length through each tile (max of the horizontal and vertical runs of ground-passable tiles). */
const ROAD_CACHE = new WeakMap();
function straightRun(battle, r, c) {
  let m = ROAD_CACHE.get(battle);
  if (!m) {
    m = new Map();
    const g = battle.grid, R = battle.rect;
    const pass = (rr, cc) => g.groundPassable(rr, cc, true);
    for (let rr = R.r0; rr <= R.r1; rr++) {
      for (let cc = R.c0; cc <= R.c1; cc++) {
        if (!pass(rr, cc)) continue;
        let h = 1, v = 1;
        for (let k = cc - 1; k >= R.c0 && pass(rr, k); k--) h++;
        for (let k = cc + 1; k <= R.c1 && pass(rr, k); k++) h++;
        for (let k = rr - 1; k >= R.r0 && pass(k, cc); k--) v++;
        for (let k = rr + 1; k <= R.r1 && pass(k, cc); k++) v++;
        m.set(rr * COLS + cc, Math.max(h, v));
      }
    }
    ROAD_CACHE.set(battle, m);
  }
  return m.get(r * COLS + c) ?? 0;
}

export default {
  // ---------------------------------------------------------------------------------------------------------------
  // 引星棘刺 — S2 解构涌潮 (instant / 2 charges elite): throws an alchemy unit at the target: for 12/15 s ground enemies
  // around it get healing ×0.5, take 120/140 % ATK arts per second, allies recover 12/15 % ATK per second; the unit drifts
  // along the throw direction and its radius grows. T1 心相: ATK +10 %, +3 s when another op is in range.
  // T2 视界: allies ASPD +5, enemies −5 (doubled on straight roads ≥ 6 tiles). Module (elite): +0.1 SP/s with a unit out.
  // S1 度算浪波 (instant): an alchemy unit thrown at the ally in her range with the lowest HP ratio: for
  // projectile_delay_time s (+3 s 心相) allies on the landing tile and the 8 around it get DEF +def and recover
  // hp_recovery_per_sec_ratio × ATK per second. The recovery of S1 / S2 ("每秒回复/恢复相当于攻击力…的生命") is 生命回复速度,
  // an hpRegen buff per alchemy unit set at each 1 s pulse until the next — the wording and blackboard key of 锡人 S2, whose
  // PRTS 备注 says "生命恢复的提供方式为增加目标的“生命回复速度”属性，不受治疗加成和禁疗影响" (the only other 炼金师): 不屈者 and
  // 禁疗 units recover too (community report: 炼金单元无法给不屈者等禁疗的干员提供生命恢复; it was a heal up to 0.2.1).
  // S3 “我的海疆”: passive — her range is the skill range; active
  // (instant) — alchemy units on the max_target_token operators in her range with the lowest block count, and one area over
  // their tiles (seaArea, above): from SEA_DELAY s after the strike, for projectile_delay_time s, the enemies in it and those
  // blocked by an ally in it get ATK/DEF/RES −, one strongest instance over her casts (不叠加), and take atk_scale × ATK arts
  // per second once per area (two casts' areas add up), everything ramping +per_interval each `interval` s up to
  // max_stack_cnt steps.
  chess_char_5_15_a: (bb, chess, def) => {
    const t0 = talent(chess, 0), t1 = talent(chess, 1), tm = talent(chess, -1);
    const sid = selectedId(chess, def);
    const baseDur = num(bb.projectile_delay_time, num(bb.remaining_time, 12));
    const r0 = num(bb.projectile_range, 1.1), grow = num(bb.value), speed = num(bb.projectile_move_speed);
    const healMul = Math.max(0, num(bb.heal_scale, 1));
    const extend = (battle, unit) => (battle.alliesInGrid(unit).some((a) => a !== unit && isOp(a)) ? Math.min(num(t0.projectile_extend), num(t0.projectile_extend_max, Infinity)) : 0);
    // S3 ramp: value after `steps` intervals, clamped towards the max ("效果逐渐提升…15秒后达到最大")
    const ramp = (base, per, max, steps) => {
      const v = num(base) + num(per) * steps;
      return num(max) < num(base) ? Math.max(num(max), v) : Math.min(num(max, v), v);
    };
    /** One tick (AURA_IV) of an S1 guard zone / S3 sea zone. */
    const tickSpecial = (battle, unit, z, seaHits) => {
      if (z.type === 'guard') {
        const inZone = (a) => Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1;
        const allies = battle.alliesFor(unit).filter(inZone);
        // one DEF buff per alchemy unit, so two units on one ally add up (+60 +60; PRTS 度算浪波 备注 「效果均可叠加」,
        // GitHub #388 — one shared key let the last unit's buff replace the other's)
        z.defKey ??= `thorn2:bastion:${unit.id}:${unit.mem.bastionSeq = (unit.mem.bastionSeq ?? 0) + 1}`;
        for (const a of allies) battle.addBuff(a, { key: z.defKey, duration: AURA_DUR, mods: mods({ defFlat: num(bb.def) }) });
        if (z.acc >= 1 - 1e-9) {
          z.acc -= 1;
          const regen = unit.s.atk * num(bb.hp_recovery_per_sec_ratio);   // 生命回复速度 (see the header)
          if (regen > 0) for (const a of allies) battle.addBuff(a, { key: z.key, duration: 1 + 2 * battle.dt, source: unit, mods: { hpRegen: regen } });
        }
        return;
      }
      // sea: the area stays over the tiles it was cast on (PRTS 备注 「生成的炼金单元/区域独立于干员存在」); z.t counts from
      // its reach (SEA_DELAY after the strike: nothing before — its colliders are made in `OnProjectileReached`). The first
      // burn lands as it reaches, then one per `interval` (so the 15th step — the max — is reached 15 s after it reaches,
      // for the debuff and the damage alike: `ProjectileBBIncreaseByTimeBehaviour` / `CacheAtkToBBBehaviour`
      // `_onlyIncreaseReached`)
      if (z.t < AURA_IV - 1e-9) return;
      const iv = Math.max(0.1, num(bb.interval, 1));
      const steps = Math.min(Math.max(0, num(bb.max_stack_cnt, 15)), Math.floor((z.t - AURA_IV + 1e-9) / iv));
      const foes = seaTargets(battle, z);
      for (const e of foes) seaHits.set(e, Math.max(seaHits.get(e) ?? -1, steps));
      if (z.acc >= iv - 1e-9) {
        z.acc -= iv;
        const scale = ramp(bb.atk_scale, bb.atk_scale_per_interval, bb.max_atk_scale, steps);
        z.burn = { foes, scale }; // dealt after the debuffs of this tick are on
      }
    };
    return {
      skills: lazySkills({
        skchr_thorn2_1: () => ({
          kind: instantKind(chess, def),
          // an AUTO skill (skill_table 自动触发) that throws at an ally: it fires as soon as its SP is full, with or
          // without an enemy — the basic DEFAULT rule waited for an attack, so with no enemy around it sat at 7/7
          // (GitHub #124 「引星棘刺一技能不会在满技力时自动释放」)
          trigger: { rule: 'SP_FULL' },
          onStart({ battle, unit }) {
            // PRTS 备注 「※优先选择生命比例最低>最晚部署的我方单位（不含装置职业单位）」: the lowest HP ratio, a tie to the
            // latest deployment (alliesInGrid has no devices); until 0.2.2 a tie went to more blocking, then the nearer
            const t = battle.alliesInGrid(unit).filter((a) => a.hp > 0).sort((a, b) => a.hpRatio - b.hpRatio || b.deploySeq - a.deploySeq || a.id - b.id)[0];
            if (!t) return;
            const key = `thorn2:guard:${unit.id}:${unit.mem.zoneSeq = (unit.mem.zoneSeq ?? 0) + 1}`;   // its regen buff ("效果均可叠加")
            const z = { type: 'guard', r: t.tileR, c: t.tileC, x: t.x, y: t.y, t: 0, acc: 0, dur: num(bb.projectile_delay_time, 6) + extend(battle, unit), key };
            (unit.mem.zones ??= []).push(z);
            battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r: RING1, duration: z.dur });
          },
        }),
        skchr_thorn2_3: () => ({
          kind: instantKind(chess, def),
          // the skill ability (prefab `Token`, a RangedAttack, `_selectTargetTiming` 1: its targets as it strikes) selects
          // with a `Selector` set up as the skill trigger's: the operators in her skill range, the fewest blocked first, then
          // the latest deployed (`_postFilter` 61), up to `max_target_token` (skills.js trigAllyTargets). Its
          // `thorn2_s_3[buff]` filter leaves no one out: no node of the skill, its projectiles, her charpack or the buff
          // templates attaches that buff (docs/rules/sim.md 「스킬 프리팹의 대상 트리거」)
          onStrike({ battle, unit, skill }) {
            const n = Math.max(1, num(bb.max_target_token, 3));
            const ops = skill.trigAllyTargets(skill.cast?.trig, n)
              ?? battle.alliesInGrid(unit).filter(isOp).sort((a, b) => (a.s.blockCnt || 0) - (b.s.blockCnt || 0) || b.deploySeq - a.deploySeq).slice(0, n);
            // `projectile_delay_time` (+ 心相's extension) is the area's time from its reach (`AttachToTarget` `_delayAfterReached`
            // → `EnsureLifeTime`; its own `_lifeTime` 10 is unused: `_lifeTimeType` INFINITY)
            const dur = num(bb.projectile_delay_time, 19) + extend(battle, unit);
            if (!ops.length) return;
            // one area over the operators' tiles (`polygonRangeTiles` = the cast targets' tiles; at most 4 points)
            const area = seaArea(ops.slice(0, 4).map((a) => [a.tileC, a.tileR]));
            (unit.mem.zones ??= []).push({ type: 'sea', anchors: ops, area, t: -SEA_DELAY, acc: Math.max(0.1, num(bb.interval, 1)) - AURA_IV - SEA_DELAY, dur });
            for (const a of ops) {
              // `thrown`: the unit thrown at that operator (skill prefab Token → projectile_chr_thorn2_s3, whose STOP sounds);
              // `duration` the area's time (the stand-in ring), `life` its own (SEA_TOKEN_LIFE)
              battle.fx('zone', { x: a.x, y: a.y, id: unit.id, r: RING1, duration: SEA_DELAY + dur, life: SEA_TOKEN_LIFE, thrown: 1 });
            }
            // the area's line (projectile_chr_thorn2_s3_polygon's Thorn2S3Renderer `_mainEffect` thorn2_skill_03_line, laid as
            // it reaches): through `pts` (the hull; closed from three, `m_isLoop`), for the area's time; one tile draws none
            // (`resultForEffect` empty: every point of the line is the same) — render/fx/kitofficial.js 'seaArea'
            if (area.hull) battle.fx('seaArea', { x: unit.x, y: unit.y, id: unit.id, pts: area.hull.map(([x, y]) => [x, y]), delay: SEA_DELAY, duration: dur });
          },
        }),
      }),
      skill: {
        kind: maxCharges(chess, def) > 1 ? 'charges' : 'instant',
        // Mark picks its enemy as the cast starts (`_selectTargetTiming` 0); without one Token looks for a tile as it strikes (1)
        onStart({ battle, unit, skill }) {
          const list = battle.enemiesInKeys(unit.rangeKeys, unit, unit.profile);
          sortEnemyTargets(battle, unit, list, null);
          skill.castPick = list.find((e) => !e.isFlying) ?? list[0] ?? null;
        },
        onStrike({ battle, unit, skill }) {
          let t = skill.castPick?.alive ? skill.castPick : null;
          if (!t) {
            // PRTS 备注: no enemy in range → thrown at the farthest tile straight ahead inside her range
            let best = null;
            for (const k of unit.rangeKeys || []) {
              const r = Math.floor(k / COLS), c = k % COLS;
              if (!battle.grid.inRect(r, c)) continue;
              const [lat, d] = toLocal(r - unit.tileR, c - unit.tileC, unit.dir);
              if (lat !== 0) continue;
              if (d > 0 && (!best || d > best.d)) best = { d, x: c, y: r };
            }
            if (!best) return;
            t = best;
          }
          const extra = battle.alliesInGrid(unit).some((a) => a !== unit && isOp(a)) ? Math.min(num(t0.projectile_extend), num(t0.projectile_extend_max, Infinity)) : 0;
          // it drifts away from her deployment tile ("移动方向始终为远离棘刺部署位置中心的方向")
          const dx = t.x - unit.x, dy = t.y - unit.y, len = hypot(dx, dy) || 1;
          // `key`: the fx re-sent every second as the unit drifts and grows is this one zone — the client updates it in
          // place instead of stacking a new layer each second (render/fx/zones.js; community report of 2026-10-06)
          const key = `thorn2:${unit.id}:${unit.mem.zoneSeq = (unit.mem.zoneSeq ?? 0) + 1}`;
          const z = { x: t.x, y: t.y, vx: (dx / len) * speed, vy: (dy / len) * speed, t: 0, acc: 0, dur: baseDur + extra, key };
          (unit.mem.zones ??= []).push(z);
          battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r: r0, duration: z.dur, key, reach: 1 });
        },
      },
      talents: [
        { install(battle, unit) {
          permBuff(battle, unit, 'thorn2:mind', { atkPct: num(t0.atk) });
          // thorn2_t_1 gives thorn2_t_1[effect] (overrideEffectKey thorn2_weapon_buff_05) while projectile_extend_cur reaches
          // projectile_extend_max, and finishes it below: the extension her zones get now, at its cap — a buff without mods
          // for the client's effect (render/fxstatus.js KEY_FX)
          const max = num(t0.projectile_extend_max, Infinity);
          if (Number.isFinite(max) && max > 0) whileOn(battle, unit, AURA_IV, () => {
            if (extend(battle, unit) >= max - 1e-9) battle.addBuff(unit, { key: 'thorn2:full', duration: AURA_DUR, refresh: 'replace', visible: true });
          });
        } },
        { install(battle, unit) { // 视界
          const cnt = num(t1.cnt, 6);
          const ally = num(t1.attack_speed_ally), allyX = num(t1.attack_speed_ally_extra), foe = num(t1.attack_speed_enemy), foeX = num(t1.attack_speed_enemy_extra);
          // the official Talent/2 tiles_ally (CharacterSharedTileAuraAbility, `_showEffectWhenAttach`) shows thorn2_buff on the
          // tiles her card chose as she deploys, until she leaves — `cells` [[x, y]…]: the tiles of a straight road ≥ cnt [추정:
          // the card's chosen rows / columns are these] (render/fx/kitofficial.js 'roadTiles')
          battle.on('deploy', (c) => {
            if (c.unit !== unit || c.move) return;
            // Talent/2 global_ally `_passiveBuffs` thorn2_t_2[audio]: its PlayAudio thorn2_t_2_start as the talent attaches
            battle.fx('kitHit', { x: unit.x, y: unit.y, id: unit.id, k: 'thorn2:t2' });
            const R = battle.rect, cells = [];
            for (let r = R.r0; r <= R.r1; r++) for (let cc = R.c0; cc <= R.c1; cc++) if (straightRun(battle, r, cc) >= cnt) cells.push([cc, r]);
            if (cells.length) battle.fx('roadTiles', { x: unit.x, y: unit.y, id: unit.id, cells });
          }, { owner: unit });
          whileOn(battle, unit, AURA_IV, () => {
            for (const a of battle.alliesFor(unit)) {
              const v = ally + (straightRun(battle, a.tileR, a.tileC) >= cnt ? allyX : 0);
              if (v) battle.addBuff(a, { key: 'thorn2:vision', duration: AURA_DUR, mods: { aspd: v } });
            }
            for (const e of battle.enemies) {
              if (!e.alive || e.hidden) continue;
              const v = foe + (straightRun(battle, Math.round(e.y), Math.round(e.x)) >= cnt ? foeX : 0);
              if (v) battle.addBuff(e, { key: 'thorn2:vision', duration: AURA_DUR, mods: { aspd: v } });
            }
          });
        } },
      ],
      install(battle, unit) {
        const sp = num(tm.sp_recovery_per_sec);
        if (sid === 'skchr_thorn2_3') { // S3 被动效果：攻击范围扩大 (her own range, so also the DEFAULT trigger range)
          const g = skillGrid(chess, def);
          if (g) { unit.rangeGrid = g; battle.refreshRange(unit); }
        }
        // alchemy units keep working after she falls (they are already thrown)
        battle.every(AURA_IV, () => {
          const zones = unit.mem.zones;
          if (!zones || !zones.length) return;
          const R = battle.rect;
          const seaHits = new Map();
          for (const z of zones) {
            z.t += AURA_IV;
            z.acc += AURA_IV;
            if (z.type) { tickSpecial(battle, unit, z, seaHits); continue; }
            z.x = Math.max(R.c0, Math.min(R.c1, z.x + z.vx * AURA_IV));
            z.y = Math.max(R.r0, Math.min(R.r1, z.y + z.vy * AURA_IV));
            const r = r0 + grow * z.t;
            const foes = battle.foesInRadius(z.x, z.y, r).filter((e) => !e.isFlying);
            for (const e of foes) battle.addBuff(e, { key: 'thorn2:rot', duration: AURA_DUR, mods: { healingTakenMul: healMul } });
            if (z.acc >= 1 - 1e-9) {
              z.acc -= 1;
              for (const e of foes) battle.dealDamage(unit, e, { amount: unit.s.atk * num(bb.atk_scale), type: 'arts', isSkill: true, tags: ['skill', 'alchemy'], moment: 'thorn2_s2_damage' });
              const regen = unit.s.atk * num(bb.hp_recovery_per_sec_ratio_chr);   // 生命回复速度 (see the header)
              if (regen > 0) {
                for (const a of battle.alliesInRadius(z.x, z.y, r, null)) {
                  if (battle.allySelectable(a, unit)) battle.addBuff(a, { key: `${z.key}:regen`, duration: 1 + 2 * battle.dt, source: unit, mods: { hpRegen: regen } });
                }
              }
              battle.fx('zone', { x: z.x, y: z.y, id: unit.id, r, duration: Math.max(0, z.dur - z.t), key: z.key });
            }
          }
          for (const [e, steps] of seaHits) { // S3 debuff: 不叠加 — the strongest zone wins
            if (!e.alive) continue;
            battle.addBuff(e, { key: 'thorn2:sea', duration: AURA_DUR, visible: true, mods: mods({
              atkPct: ramp(bb.atk, bb.atk_per_interval, bb.max_atk, steps),
              defPct: ramp(bb.def, bb.def_per_interval, bb.max_def, steps),
              resMul: 1 + ramp(bb.magic_resistance, bb.magic_resistance_per_interval, bb.max_magic_resistance, steps),
            }) });
          }
          for (const z of zones) {
            if (!z.burn) continue;
            for (const e of z.burn.foes) if (e.alive) battle.dealDamage(unit, e, { amount: unit.s.atk * z.burn.scale, type: 'arts', isSkill: true, tags: ['skill', 'mySea'], moment: 'thorn2_s3_enemy_buff' });
            z.burn = null;
          }
          unit.mem.zones = zones.filter((z) => z.t < z.dur - 1e-9);
          if (chess?.isGolden && sp > 0 && on(unit) && unit.mem.zones.length) battle.addBuff(unit, { key: 'thorn2:module', duration: AURA_DUR, mods: { spRecoveryFlat: sp } });
        }, { owner: unit });
      },
    };
  },
};

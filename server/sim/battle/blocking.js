// server/sim/battle/blocking.js — Battle methods: blocking: the contact rule (block radius, capacity, fenced tiles,
// 起飞), the blocked targets of a blocker, block release and the 隐匿 switch-off after a block ends.
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).

import { ROWS, COLS, BLOCK_RADIUS_SQ, BLOCK_MIN_DIST, BLOCK_MOVE_TIME, STEALTH_RESTORE } from '../constants.js';
import { canTargetEnemy, stealthOffKey } from '../targeting.js';
import { hypot } from '../detmath.js';

// BlockBalancer: a new enemy within 0.1 of an enemy its blocker already holds (squared 0.01) is turned away from them —
// each held enemy within 0.4 (squared 0.16) pushes by (0.4 − d) × 50, one within 0.1 sideways — by 0.2 of the sum's direction
const MIN_DIST_BTW_BLOCKEES_SQR = 0.010000001;
const CLOSE_DIST_BTW_BLOCKEES_SQR = 0.16000001;
const MERGE_FACTOR_OF_SEPARATION = 0.2;

/** Unity's Vector2.normalized: the zero vector below a length of 1e-5. */
function normalized(x, y) {
  const l = hypot(x, y);
  return l > 1e-5 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

/** Enemy.stableBlockPosition: where a held enemy is going while its block slide runs, else where it stands. */
function stableBlockPosition(x) {
  const m = x.blockMove;
  return m ? { x: m.x1, y: m.y1 } : { x: x.x, y: x.y };
}

/**
 * BlockBalancer.CalculateBlockOffset: the offset from the blocker's centre (bx, by) at which enemy `e` is held, given the
 * enemies the blocker already holds (`held`, before `e` is added).
 */
export function blockOffset(held, e, bx, by) {
  let ox = e.x - bx, oy = e.y - by;
  if (ox * ox + oy * oy < BLOCK_MIN_DIST * BLOCK_MIN_DIST) {
    const n = normalized(ox, oy);   // (an enemy exactly on the centre stays there: the zero vector)
    ox = n.x * BLOCK_MIN_DIST; oy = n.y * BLOCK_MIN_DIST;
  }
  const px = bx + ox, py = by + oy;
  if (!held.some((h) => {
    const p = stableBlockPosition(h), dx = px - p.x, dy = py - p.y;
    return dx * dx + dy * dy < MIN_DIST_BTW_BLOCKEES_SQR;
  })) {
    return { x: ox, y: oy };
  }
  let sx = 0, sy = 0;
  for (const h of held) {
    const p = stableBlockPosition(h);
    const dx = px - p.x, dy = py - p.y, d2 = dx * dx + dy * dy;
    if (d2 < MIN_DIST_BTW_BLOCKEES_SQR) {
      const n = normalized(p.y - by, -(p.x - bx));   // perpendicular to that enemy's own offset
      sx += n.x; sy += n.y;
    } else if (d2 < CLOSE_DIST_BTW_BLOCKEES_SQR) {
      const n = normalized(dx, dy), k = (0.4 - Math.sqrt(d2)) * 50;
      sx += n.x * k; sy += n.y * k;
    }
  }
  const s = normalized(sx, sy);
  const dir = normalized(ox + s.x * MERGE_FACTOR_OF_SEPARATION, oy + s.y * MERGE_FACTOR_OF_SEPARATION);
  const len = hypot(ox, oy);
  return { x: dir.x * len, y: dir.y * len };
}

export class BattleBlocking {
  /**
   * Try to block enemy `e` where it stands. Returns true if it is (now) blocked. Official contact rule (constants.js
   * BLOCK_RADIUS, PRTS 游戏数据基础 §阻挡半径): the enemy's position within the blocker's block radius of the blocker's
   * centre (ground 0.7071 — the tile's circumscribed circle, reaching 0.21 tile into the side neighbours; air 0.8944;
   * devices 0.4472), and the blocker has free capacity for the enemy's block weight (and may block it at all: a unit on
   * a fenced tile blocks no ground enemy, _blockerFor). Checked every tick for every
   * unblocked enemy, moving or not, so an enemy overlapping an operator is taken over as soon as its blocker is gone or
   * the operator's capacity frees up (user playtest #5 item 4) — a stunned or frozen one too, an operator redeployed
   * onto it included (晕眩 / 冻结 hold no 不可阻挡: ai.js updateEnemy, GitHub #232). Several blockers in contact → the
   * nearest [ASSUMED], ties → the first in row-then-column scan order. The air radius grows with the blocker's
   * 阻挡半径倍率 (PRTS 游戏数据基础 "飞行阻挡半径 = 0.8944 × 阻挡半径倍率"; mod `blockRadiusScale` = 倍率 − 1: 凯尔希·思衡托's
   * 遗尘守望 / S1, +0.23); ground blocking ignores it (PRTS 数值范围 "对地面阻挡的单位不生效"). Below 1.5 tiles the 3×3 scan
   * still finds every blocker.
   * Never blocked: an enemy holding 不可阻挡 (PRTS 异常效果 BLOCK_FREE 「无法阻挡/被阻挡，自动解除阻挡」) — the flag itself
   * (恐惧 / 诱导 carry it), 浮空, and 沉睡 (SLEEPING = 无法行动+无敌+不可阻挡: a sleeper takes no block slot, DESIGN §24.9);
   * once it wakes it is blocked again only by a blocker with room.
   * The blocked enemy keeps the side it came from: it slides to the blocker's centre plus its offset at contact,
   * lengthened to 0.5 and turned off the blocker's other enemies (blockOffset, _moveToBlockPosition; official client
   * Character._AddBlockee → BlockBalancer.CalculateBlockOffset → Enemy.RegisterBlocker) — an enemy blocked by contact
   * while walking in is already ≈ 0.71 away and stays put; one an operator lands or is deployed on is pushed out.
   */
  _checkBlock(e) {
    if (e.blockedBy || e.hidden || !e.alive) return !!e.blockedBy;
    const f = e.s.flags;
    if (f.unblockable || f.levitate || f.fear || f.sleep) return false;
    const r0 = Math.round(e.y), c0 = Math.round(e.x);
    const w = e.blockWeight ?? 1;
    let u = null, bd = Infinity, ur = 0, uc = 0;
    const fly = e.isFlying;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      if (r < 0 || r >= ROWS) continue;
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        // a diagonal neighbour's centre is ≥ √0.5 away: out of reach of the ground (and device) radius
        if (c < 0 || c >= COLS || (!fly && r !== r0 && c !== c0)) continue;
        const o = this._occ[r * COLS + c];
        if (!o || !this._blockerFor(o, e, w)) continue;
        const d2 = (e.x - c) * (e.x - c) + (e.y - r) * (e.y - r);
        const k = fly ? 1 + (o.s.blockRadiusScale || 0) : 1;
        const r2 = o.kind === 'device' ? BLOCK_RADIUS_SQ.device : fly ? BLOCK_RADIUS_SQ.fly * k * k : BLOCK_RADIUS_SQ.ground;
        if (d2 < r2 && d2 < bd) { u = o; bd = d2; ur = r; uc = c; }
      }
    }
    if (!u) return false;
    const off = blockOffset(u.blocking.filter((x) => x.blockedBy === u), e, uc, ur);
    e.blockedBy = u;
    u.blocking.push(e);
    e.moving = false;
    this._moveToBlockPosition(e, uc + off.x, ur + off.y);
    if (this._hooks.blocked) this.emit('blocked', { blocker: u, enemy: e });
    return true;
  }

  /**
   * Enemy._MoveToBlockPosition: slide enemy `e` from where it stands to (x, y) over BLOCK_MOVE_TIME s, linearly
   * (_tickBlockMove). The client's tween is not stopped when the block ends (Enemy.UnregisterBlocker only clears the
   * blocker) — it runs on after a release too.
   */
  _moveToBlockPosition(e, x, y) {
    if (x === e.x && y === e.y) { e.blockMove = null; return; }
    e.blockMove = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, px: e.x, py: e.y };
  }

  /**
   * One tick of enemy `e`'s block slide (before its own update, the enemy loop of battle/lifecycle.js). Anything else that
   * moved it since the last step — a push / pull, a relocation, its own walk after a release — or its leaving the field
   * ends the slide where it stands [ASSUMED·미조사: what ends the client's `m_blockTween` early is not checked yet].
   */
  _tickBlockMove(e, dt) {
    const m = e.blockMove;
    if (!m) return;
    if (e.hidden || e.x !== m.px || e.y !== m.py) { e.blockMove = null; return; }
    m.t += dt;
    const k = m.t >= BLOCK_MOVE_TIME - 1e-9 ? 1 : m.t / BLOCK_MOVE_TIME;
    e.x = m.x0 + (m.x1 - m.x0) * k;
    e.y = m.y0 + (m.y1 - m.y0) * k;
    if (e.route) e.route.pts = null;   // a walk after a release re-plans from where it now stands
    if (k >= 1) e.blockMove = null;
    else { m.px = e.x; m.py = e.y; }
  }

  /**
   * The enemies ally `u` blocks that it may target with `profile` — always selectable by their blocker, inside its range
   * or not, whatever its facing ("可以选择且优先选择阻挡单位", PRTS 选择器; ai.js acquireTargets, the skills' DEFAULT
   * trigger). That holds for a ranged operator on a melee tile too: the user's rule after playtest #6, "阻挡了就一定要能
   * 打到" — whatever blocks an enemy can hit it, wherever it stands (the official client keeps a blocked enemy on the side
   * it came from, BlockBalancer.CalculateBlockOffset — not at its blocker's front) (DESIGN §20; it replaces the playtest #5 QA's melee-only restriction). Only for attacks that hit enemies: a heal
   * attack never asks — it keeps selecting injured allies while its unit blocks (PRTS 卫戍协议/帮助 "对于医疗干员
   * （咒愈师分支除外），攻击目标为需要治疗的单位"; PRTS 选择器 adds only the blocked units its side can pick).
   */
  blockedTargets(u, profile) {
    const out = [];
    if (!u || !u.blocking || !u.blocking.length) return out;
    for (const e of u.blocking) if (e.blockedBy === u && canTargetEnemy(u, e, profile)) out.push(e);
    return out;
  }

  /**
   * Can ally/device `u` block enemy `e` (block weight `w`) right now — everything but the contact distance. A unit on a
   * tile ground units cannot pass blocks no ground enemy: the fenced tiles (围墙 tile_fence_bound / 围栏 tile_fence —
   * low ground, deployable, passable to flyers only) — PRTS 围墙 / 围栏 地形机制 "部署在其中的单位，若当前阻挡类型为'地面
   * 阻挡'则无法阻挡敌人". The gate reads the tile's ground passability; on the stages the fenced tiles are the only low
   * tiles ground units cannot pass. Air blocking (blockFly against flyers) stays [ASSUMED: PRTS restricts the rule to
   * 地面阻挡]. Nothing walks onto such a tile, so it matters for an enemy pushed or pulled against the fence
   * (Battle.displace stops it at the tile edge, 0.5 from the fenced unit — inside the ground block radius). An airborne
   * unit (起飞, flag `liftoff`: "不阻挡地面敌人…可以阻挡飞行敌人") blocks flyers only.
   */
  _blockerFor(u, e, w) {
    // flag `noNewBlock`: a unit that takes no new enemy by contact — it blocks only those content hands it (酒神's 迷狂牢笼,
    // PRTS "只在生成/刷新时判定阻挡新的敌人"); the blocks it holds go on as usual
    if (!u.alive || !u.deployed || u.hidden || u.s.flags.noBlock || u.s.flags.sleep || u.s.flags.noNewBlock) return false;
    if (e.isFlying && !(u.s.flags.blockFly || (u.profile && u.profile.blockFly))) return false;
    // ground enemies: only a ground unit that has not taken off (起飞 "不阻挡地面敌人": flag `liftoff`), standing on a tile
    // ground units can pass (not a fenced 围墙 / 围栏 tile)
    if (!e.isFlying && (!u.ground || u.s.flags.liftoff || this.grid.tile(u.tileR, u.tileC).pass !== 'ALL')) return false;
    const cap = u.s.blockCnt;
    if (cap <= 0) return false;
    let used = 0;
    for (const x of u.blocking) used += x.blockWeight ?? 1;
    return used + w <= cap;
  }

  _unblock(e) {
    const bl = e.blockedBy;
    if (!bl) return;
    const i = bl.blocking.indexOf(e);
    if (i >= 0) bl.blocking.splice(i, 1);
    e.blockedBy = null;
    this._stealthSwitch(e);
  }

  /** Release every enemy blocked by ally `u` (death, retreat, block count drop, substitution…). */
  releaseBlocked(u) {
    if (!u || !u.blocking || !u.blocking.length) return;
    const was = u.blocking;
    u.blocking = [];
    for (const e of was) if (e.blockedBy === u) { e.blockedBy = null; this._stealthSwitch(e); }
  }

  /**
   * A block on enemy `e` just ended (every release goes through here: `_unblock`, `releaseBlocked`, ai.js
   * enforceBlockCapacity). Each 隐匿 source it holds stays switched off for its restore time — PRTS 作战机制 §隐匿 "对于
   * 绝大部分可隐匿的敌人而言，在被我方单位阻挡后会解除隐匿，不被阻挡的3秒后重新进入隐匿" (STEALTH_RESTORE), or the source's
   * own "（解除阻挡N秒后恢复）" (buff `data.stealthRestore`, content/enemies/helpers.js STEALTH_RESTORE_BY_KEY: 0 s / 1 s on some enemy pages) — as a
   * `stealthOff` buff per source; meanwhile it is targetable, operator splash reaches it and it is drawn solid
   * (targeting.js enemyStealthed). A new block inside the window lifts it again and its end restarts the window. Our
   * operators' 隐匿 / 迷彩 are never lifted by blocking (only enemies get here).
   */
  _stealthSwitch(e) {
    if (!e || e.side !== 'enemy' || !e.alive || !e.s.flags.stealth) return;
    for (const b of e.buffs.slice()) {
      if (!b.flags || !b.flags.stealth) continue;
      const t = Number.isFinite(b.data?.stealthRestore) ? b.data.stealthRestore : STEALTH_RESTORE;
      if (t > 0) this.addBuff(e, { key: stealthOffKey(b.key), duration: t, flags: { stealthOff: true } });
    }
  }
}

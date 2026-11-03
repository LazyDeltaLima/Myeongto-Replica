// server/sim/battle/blocking.js — Battle methods: blocking: the contact rule (block radius, capacity, fenced tiles,
// 起飞), the blocked targets of a blocker, block release and the 隐匿 switch-off after a block ends.
// Installed on Battle.prototype by server/sim/Battle.js (a method container: never instantiated; `this` is the battle).

import { ROWS, COLS, BLOCK_RADIUS_SQ, BLOCK_MIN_DIST, BLOCK_MOVE_TIME, BLOCK_SEARCH_TICKS, BLOCK_WEIGHT_GAP, STEALTH_RESTORE } from '../constants.js';
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
   * Ally / device `u`'s search for enemies to block — the blocker's side of the contact rule, as the official client does
   * it (Character.OnTick → `m_findBlockeeTicker.Tick()` → _SearchBlockee). Every blocker searches after the enemies moved
   * and before any ally acts (battle/lifecycle.js, the `blockSearch` phase) [추정·미조사: the client's search follows
   * Unit.OnTick inside Character.OnTick; whether the attacks run there is not read], when its ticker is due
   * (_blockSearchDue): it takes the enemies in contact that it may block, nearest first, while its capacity lasts. Contact (constants.js BLOCK_RADIUS, PRTS 游戏数据基础 §阻挡半径; Character
   * .CheckInBlockRange): the enemy's position within the blocker's block radius of the blocker's centre (ground 0.7071 —
   * the tile's circumscribed circle, reaching 0.21 tile into the side neighbours; air 0.8944; devices 0.4472). The air
   * radius grows with the blocker's 阻挡半径倍率 (PRTS 游戏数据基础 "飞行阻挡半径 = 0.8944 × 阻挡半径倍率"; mod
   * `blockRadiusScale` = 倍率 − 1: 凯尔希·思衡托's 遗尘守望 / S1, +0.23); ground blocking ignores it (PRTS 数值范围 "对地面阻挡
   * 的单位不生效"). Below 1.5 tiles the 3×3 tile scan finds every enemy in reach.
   * Order (FilterUtil.FilterWithVolume over Character._CheckBlockable): the candidates by their squared distance to the
   * blocker in steps of BLOCK_WEIGHT_GAP (WeightedTarget.CompareTo), each taken if its block weight (Enemy.blockVolume)
   * still fits — a heavy one that does not is passed over for a lighter one behind it. Equal steps go by the enemies'
   * `deploySeq`, the order they came onto the field (Entity.CompareTo compares `instanceUid`, which BObject.OnAllocate
   * numbers from one counter as each unit is taken from the pool). Two blockers in reach of one enemy: the first to
   * search takes it — the units tick in `instanceUid` order (ObjectManager.OnFixedUpdate over BObject.CompareTo: every
   * battle unit has the base `priority`), so of two blockers searching in one tick the one deployed first goes first
   * (battle/lifecycle.js sorts the ready ones by `deploySeq`; a redeployment or 【移动】 is a new unit, numbered anew).
   * Every enemy that has no blocker is a candidate, moving or not, so an enemy overlapping an operator is taken over as
   * soon as its blocker is gone or the operator's capacity frees up (user playtest #5 item 4) — a stunned or frozen one
   * too, an operator redeployed onto it included (晕眩 / 冻结 hold no 不可阻挡: ai.js updateEnemy, GitHub #232).
   * Never blocked: an enemy holding 不可阻挡 (PRTS 异常效果 BLOCK_FREE 「无法阻挡/被阻挡，自动解除阻挡」) — the flag itself
   * (恐惧 / 诱导 carry it), 浮空, and 沉睡 (SLEEPING = 无法行动+无敌+不可阻挡: a sleeper takes no block slot, DESIGN §24.9);
   * once it wakes it is blocked again only by a blocker with room.
   * Out of turn: searchBlockeeImmediate. The 迷狂牢笼 (PropLikeStaticBlockToken) does not search this way: its kit
   * (op-phatm2.js cageBlock) — every other device searches like an operator (Trap → Token → Character).
   */
  _searchBlockees(u, all = false) {
    if (!u.alive || !u.deployed || u.hidden || u.s.flags.noBlock || u.s.flags.sleep || u.s.flags.noNewBlock) return;
    // only a unit standing on its field tile blocks (a flying ally — 炎佑 — holds none: deploy.js)
    if (this._occ[u.tileR * COLS + u.tileC] !== u) return;
    const cap = u.s.blockCnt;
    let used = 0;
    for (const x of u.blocking) used += x.blockWeight ?? 1;
    if (used >= cap) return;
    const ur = u.tileR, uc = u.tileC, et = this._et;
    const k = 1 + (u.s.blockRadiusScale || 0);
    const cands = [];
    const consider = (e) => {
      if (e.blockedBy || e.hidden || !e.alive) return;
      const f = e.s.flags;
      if (f.unblockable || f.levitate || f.fear || f.sleep) return;
      const w = e.blockWeight ?? 1;
      if (!this._blockerFor(u, e, w)) return;
      const d2 = (e.x - uc) * (e.x - uc) + (e.y - ur) * (e.y - ur);
      const r2 = u.kind === 'device' ? BLOCK_RADIUS_SQ.device : e.isFlying ? BLOCK_RADIUS_SQ.fly * k * k : BLOCK_RADIUS_SQ.ground;
      if (d2 >= r2 || cands.some((x) => x.e === e)) return;   // (a large enemy is listed on each tile of its body)
      cands.push({ e, w, step: Math.floor(d2 / BLOCK_WEIGHT_GAP), i: e.deploySeq });
    };
    // `all`: out of turn the tile index is a tick old (pulls moved enemies since): every enemy on the field
    if (all) for (const e of this.enemies) consider(e);
    else {
      for (let r = ur - 1; r <= ur + 1; r++) {
        if (r < 0 || r >= ROWS) continue;
        for (let c = uc - 1; c <= uc + 1; c++) {
          if (c < 0 || c >= COLS) continue;
          for (const e of et[r * COLS + c]) consider(e);
        }
      }
    }
    if (!cands.length) return;
    cands.sort((a, b) => a.step - b.step || a.i - b.i);
    for (const { e, w } of cands) {
      if (used + w > cap) continue;
      used += w;
      this._addBlockee(u, e);
    }
  }

  /**
   * One tick of `u`'s search ticker (PeriodicTicker(BLOCK_SEARCH_TICKS) — `Tick` counts down, `Next` restarts it once it
   * is due): true every BLOCK_SEARCH_TICKS ticks, the first on its first tick as a new unit — BObject.OnAllocate →
   * Character.OnReset → `Reset(false)` for every deployment, a redeployment and a 【移动】 too (deploy.js, tiles.js
   * moveRedeploy: the client's mover is born again, ulpia_s3_switch_mode[born] ON_OWNER_BORN).
   */
  _blockSearchDue(u) {
    if (u.blockSearchTick > 0) u.blockSearchTick--;
    if (u.blockSearchTick > 0) return false;
    u.blockSearchTick = BLOCK_SEARCH_TICKS;
    return true;
  }

  /**
   * Character.SearchBlockeeImmediate: `u` searches now, out of turn (`_SearchBlockee(true)`: the ticker is not waited
   * for; one that is due starts again). The client calls it for the shooter as a pulling projectile stops on a living
   * target (HarpoonProjectile / NetCatcherProjectile / PullHitTargetBehaviour .OnProjectileStop — the pulls of 崖心 S2,
   * 歌蕾蒂娅, 百炼嘉维尔 S2, 乌尔比安 S1, 锏 S3 in this mode: their kits call this after the pull) and from the
   * CharSearchBlockeeImmediate node (玛恩纳's mlynar_s_cast at his skill's start: professions.js installLibrator).
   */
  searchBlockeeImmediate(u) {
    if (!u || !u.alive) return;
    if (u.blockSearchTick === 0) u.blockSearchTick = BLOCK_SEARCH_TICKS;
    this._searchBlockees(u, true);
  }

  /**
   * Character._AddBlockee: ally `u` blocks enemy `e`. The blocked enemy keeps the side it came from: it slides to the
   * blocker's centre plus its offset at contact, lengthened to 0.5 and turned off the blocker's other enemies (blockOffset,
   * _moveToBlockPosition; BlockBalancer.CalculateBlockOffset → Enemy.RegisterBlocker) — an enemy blocked by contact
   * while walking in is already ≈ 0.71 away and stays put; one an operator lands or is deployed on is pushed out.
   */
  _addBlockee(u, e) {
    const ur = u.tileR, uc = u.tileC;
    const off = blockOffset(u.blocking.filter((x) => x.blockedBy === u), e, uc, ur);
    e.blockedBy = u;
    u.blocking.push(e);
    e.moving = false;
    this._moveToBlockPosition(e, uc + off.x, ur + off.y);
    if (this._hooks.blocked) this.emit('blocked', { blocker: u, enemy: e });
  }

  /**
   * Enemy._MoveToBlockPosition: slide enemy `e` from where it stands to (x, y) over BLOCK_MOVE_TIME s, linearly
   * (_tickBlockMove). What ends it early is the enemy's own release, `_unblock` (Enemy.ReleaseFromBlocker kills
   * `m_blockTween` where it stands: a push / pull, a blink, a relocation, 浮空, 不可阻挡, leaving the field); a release by
   * the blocker's side does not (Character.RemoveBlockee → Enemy.UnregisterBlocker only clears the blocker), so the slide
   * runs on after its blocker died, left or let go.
   */
  _moveToBlockPosition(e, x, y) {
    if (x === e.x && y === e.y) { e.blockMove = null; return; }
    e.blockMove = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0 };
  }

  /**
   * One tick of enemy `e`'s block slide, before its own update (battle/lifecycle.js) as the client's BattleTweenMgr.Tick
   * runs first in BattleController.OnTick: the slide sets the position outright, so an enemy its blocker let go walks
   * from where the slide put it and the slide wins again on the next tick, until it ends at its target (then it walks
   * on from there that same tick). An enemy holding 不可阻挡 / 浮空 / 恐惧 / 沉睡 (Enemy.OnTick: isBlockFree →
   * ReleaseFromBlocker) or off the field stops where it stands.
   */
  _tickBlockMove(e, dt) {
    const m = e.blockMove;
    if (!m) return;
    const f = e.s.flags;
    if (e.hidden || f.unblockable || f.levitate || f.fear || f.sleep) { e.blockMove = null; return; }
    m.t += dt;
    const k = m.t >= BLOCK_MOVE_TIME - 1e-9 ? 1 : m.t / BLOCK_MOVE_TIME;
    e.x = m.x0 + (m.x1 - m.x0) * k;
    e.y = m.y0 + (m.y1 - m.y0) * k;
    if (e.route) e.route.pts = null;   // a walk after a release re-plans from where it now stands
    if (k >= 1) e.blockMove = null;
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

  /**
   * Enemy.ReleaseFromBlocker — enemy `e` is let go for its own reason (a push / pull, a blink or relocation, 不可阻挡 /
   * 浮空 / 恐惧 / 沉睡, leaving the field, death): its blocker drops it and its block slide stops where it stands, blocked
   * or not.
   */
  _unblock(e) {
    e.blockMove = null;
    this._unregisterBlocker(e);
  }

  /**
   * Enemy.UnregisterBlocker — enemy `e`'s blocker drops it (the blocker died, left, was stunned or lost the capacity):
   * the block slide runs on (_moveToBlockPosition).
   */
  _unregisterBlocker(e) {
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

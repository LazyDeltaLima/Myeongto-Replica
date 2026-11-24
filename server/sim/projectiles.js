// server/sim/projectiles.js — projectile flight & impact (DESIGN §5.4 addProjectile).
//
// A projectile homes on `target` (a unit) or flies to a fixed point `to` ({x,y}). On arrival `onHit(ctx)` runs
// with ctx = { battle, projectile, target (null if it died / point shot), x, y }. When a homing target dies
// mid-flight the projectile fizzles, unless `hitDead: true` (then it lands at the last known position).
// A straight shot (`dir` {x,y}, an official FIXED_DIRECTION projectile) flies that way at `speed` without a target and
// asks `sweep(projectile)` after each step for a unit it touches: the first one ends it there (`onHit` with that target);
// none within `maxAge` s and it ends unseen (`onExpire(ctx)` if given).
// A projectile is a battle object of its own (the client's Projectile is a BObject): it takes a `seq` from the units'
// counter (Battle._deploySeq) when fired and flies in the units' tick line (battle/lifecycle.js _tickUnits, step()),
// first in the step after the one it was fired in — fired in a unit's turn, by a timer before the line or by the
// automatic pass after it (the client's objects fire theirs in their own tick, which the copied line of that step no
// longer holds); it hits or ends in its own turn.
// `moveScale` (default 1) is the share of each step it lives: its flight and its age both run at it (the client's
// Projectile.OnTick multiplies its clock and its behaviours' step by the movement's GetTimeScale, which is the move scale;
// 逻各斯 S3's aura sets it, docs/rules/sim.md 「moveScale」).
// `ends` { from: [dx, dy], to: [dx, dy] } (shared/shotFlight.js shotEnds): the shot leaves `from` that far off (its
// muzzle on the board) and flies to that far off its target (the target's hit point) — the official flight between the
// two mount points (docs/rules/sim.md 「투사체의 출발·도착 점」); it still lands on the target's own spot (onHit x, y).

import { PROJECTILE_SPEED } from './constants.js';
import { hypot } from './detmath.js';
/** @import { Battle } from './Battle.js' */

/** A projectile in flight (ProjectileSystem.add's record). @typedef {ReturnType<ProjectileSystem['add']>} Projectile */

let seq = 0;
/** @param {unknown} v @param {number} d @returns {number} */
const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class ProjectileSystem {
  /** @param {Battle} battle */
  constructor(battle) {
    this.battle = battle;
    /** @type {Projectile[]} */
    this.list = [];
    /** > 0 while an `onHit` runs: the damage dealt then flew as a projectile (damage.js dealDamage `isProjectile`). */
    this.landing = 0;
  }

  /** @param {Record<string, any>} p the shot's options (header) */
  add(p) {
    const from = p.from || { x: 0, y: 0 };
    // non-finite coordinates would never "arrive" (NaN distance) and leak the projectile for maxAge
    const fx = fin(from.x, 0), fy = fin(from.y, 0);
    const lead = p.ends && !p.dir ? p.ends : null;
    const ox = fin(lead?.from?.[0], 0), oy = fin(lead?.from?.[1], 0);
    const target = p.target && typeof p.target === 'object' ? p.target : null;
    const proj = {
      id: ++seq,
      isProjectile: true,
      seq: ++this.battle._deploySeq,   // its place in the tick line
      // the step it was fired in: it first flies in the next one (one fired between steps, in the next step)
      firedAt: this.battle._stepping ? this.battle.tickCount : this.battle.tickCount - 1,
      done: false,                     // hit, ended or fizzled: dropped from `list` after the pass
      x: fx + ox,
      y: fy + oy,
      target,
      // the target "life" it was fired at: an op that dies and is redeployed mid-flight is a new target (fizzle)
      tseq: target ? target.deploySeq : 0,
      tx: fin(p.to ? p.to.x : (target ? target.x : fx), fx),
      ty: fin(p.to ? p.to.y : (target ? target.y : fy), fy),
      // where it flies to off the target's spot (`ends.to`: the hit point; none at a fixed point)
      ax: p.to ? 0 : fin(lead?.to?.[0], 0),
      ay: p.to ? 0 : fin(lead?.to?.[1], 0),
      speed: p.speed > 0 ? p.speed : PROJECTILE_SPEED,
      onHit: p.onHit ?? null,
      visual: p.visual ?? 'arrow',
      source: p.source ?? (p.from && p.from.id != null ? p.from : null),
      hitDead: !!p.hitDead,
      // may 逻各斯 S3 slow / wipe it (tools/local-extract/enemy_projectiles.py `adjust` / `elim`; the client's movementAdjustable / eliminatable)
      fixed: !!p.fixed,
      noWipe: !!p.noWipe,
      data: p.data ?? null,
      dir: /** @type {{ x: number, y: number } | null} */ (null),
      sweep: typeof p.sweep === 'function' ? p.sweep : null,
      onExpire: p.onExpire ?? null,
      age: 0,
      maxAge: p.maxAge > 0 ? p.maxAge : 10,
      moveScale: 1,
    };
    if (p.dir) {
      const dx = fin(p.dir.x, 0), dy = fin(p.dir.y, 0), n = hypot(dx, dy);
      proj.dir = n > 0 ? { x: dx / n, y: dy / n } : { x: 0, y: 0 };
      proj.target = null;
      proj.tseq = 0;
    }
    this.list.push(proj);
    return proj;
  }

  /** Every projectile in flight, one step each in their order (the units' tick runs them in its line instead). @param {number} dt */
  update(dt) {
    const list = this.list;
    for (let i = 0, n = list.length; i < n; i++) if (!list[i].done && this.list === list) this.step(list[i], dt);
    this.compact();
  }

  /** Drop the projectiles that ended. */
  compact() {
    if (this.list.some((p) => p.done)) this.list = this.list.filter((p) => !p.done);
  }

  /** One step of projectile `p`: it flies, then hits (onHit), ends unseen (onExpire) or fizzles in this same turn.
   * @param {Projectile} p @param {number} dt */
  step(p, dt) {
    if (p.done) return;
    const t = dt * p.moveScale;
    p.age += t;
    if (p.dir) {
      p.x += p.dir.x * p.speed * t;
      p.y += p.dir.y * p.speed * t;
      const hit = p.sweep ? this.battle._safe(() => p.sweep(p), 'projectile.sweep', p.source) : null;
      if (hit) { p.target = hit; p.tseq = hit.deploySeq; this._land(p); }
      else if (p.age >= p.maxAge) {
        p.done = true;
        if (p.onExpire) this.battle._safe(() => p.onExpire({ battle: this.battle, projectile: p, target: null, x: p.x, y: p.y }), 'projectile.onExpire', p.source);
      }
      return;
    }
    if (p.target) {
      if (p.target.alive && !p.target.hidden && p.target.deploySeq === p.tseq) { p.tx = fin(p.target.x, p.tx); p.ty = fin(p.target.y, p.ty); }
      else if (!p.hitDead) { p.done = true; return; } // fizzle
      else p.target = null;
    }
    const dx = p.tx + p.ax - p.x, dy = p.ty + p.ay - p.y;
    const d = hypot(dx, dy);
    const step = p.speed * t;
    if (d <= step || p.age >= p.maxAge) {
      p.x = p.tx; p.y = p.ty;
      this._land(p);
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  }

  /** @param {Projectile} p */
  _land(p) {
    p.done = true;
    if (!p.onHit) return;
    const t = p.target && p.target.alive && p.target.deploySeq === p.tseq ? p.target : null;
    this.battle._safe(() => {
      this.landing++;
      try { p.onHit({ battle: this.battle, projectile: p, target: t, x: p.x, y: p.y }); } finally { this.landing--; }
    }, 'projectile.onHit', p.source);
  }

  clear() { this.list = []; }
}

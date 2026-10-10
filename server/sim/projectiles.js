// server/sim/projectiles.js — projectile flight & impact (DESIGN §5.4 addProjectile).
//
// A projectile homes on `target` (a unit) or flies to a fixed point `to` ({x,y}). On arrival `onHit(ctx)` runs
// with ctx = { battle, projectile, target (null if it died / point shot), x, y }. When a homing target dies
// mid-flight the projectile fizzles, unless `hitDead: true` (then it lands at the last known position).
// A straight shot (`dir` {x,y}, an official FIXED_DIRECTION projectile) flies that way at `speed` without a target and
// asks `sweep(projectile)` after each step for a unit it touches: the first one ends it there (`onHit` with that target);
// none within `maxAge` s and it ends unseen (`onExpire(ctx)` if given).

import { PROJECTILE_SPEED } from './constants.js';
import { hypot } from './detmath.js';

let seq = 0;
const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export class ProjectileSystem {
  constructor(battle) {
    this.battle = battle;
    /** @type {object[]} */
    this.list = [];
  }

  add(p) {
    const from = p.from || { x: 0, y: 0 };
    // non-finite coordinates would never "arrive" (NaN distance) and leak the projectile for maxAge
    const fx = fin(from.x, 0), fy = fin(from.y, 0);
    const target = p.target && typeof p.target === 'object' ? p.target : null;
    const proj = {
      id: ++seq,
      x: fx,
      y: fy,
      target,
      // the target "life" it was fired at: an op that dies and is redeployed mid-flight is a new target (fizzle)
      tseq: target ? target.deploySeq : 0,
      tx: fin(p.to ? p.to.x : (target ? target.x : fx), fx),
      ty: fin(p.to ? p.to.y : (target ? target.y : fy), fy),
      speed: p.speed > 0 ? p.speed : PROJECTILE_SPEED,
      onHit: p.onHit ?? null,
      visual: p.visual ?? 'arrow',
      source: p.source ?? (p.from && p.from.id != null ? p.from : null),
      hitDead: !!p.hitDead,
      data: p.data ?? null,
      dir: null,
      sweep: typeof p.sweep === 'function' ? p.sweep : null,
      onExpire: p.onExpire ?? null,
      age: 0,
      maxAge: p.maxAge > 0 ? p.maxAge : 10,
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

  update(dt) {
    if (!this.list.length) return;
    const keep = [];
    const arrived = [];
    const expired = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.dir) {
        p.x += p.dir.x * p.speed * dt;
        p.y += p.dir.y * p.speed * dt;
        const hit = p.sweep ? this.battle._safe(() => p.sweep(p), 'projectile.sweep', p.source) : null;
        if (hit) { p.target = hit; p.tseq = hit.deploySeq; arrived.push(p); }
        else if (p.age >= p.maxAge) expired.push(p);
        else keep.push(p);
        continue;
      }
      if (p.target) {
        if (p.target.alive && !p.target.hidden && p.target.deploySeq === p.tseq) { p.tx = fin(p.target.x, p.tx); p.ty = fin(p.target.y, p.ty); }
        else if (!p.hitDead) continue; // fizzle
        else p.target = null;
      }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = hypot(dx, dy);
      const step = p.speed * dt;
      if (d <= step || p.age >= p.maxAge) {
        p.x = p.tx; p.y = p.ty;
        arrived.push(p);
      } else {
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
        keep.push(p);
      }
    }
    this.list = keep;
    for (const p of arrived) {
      if (!p.onHit) continue;
      const t = p.target && p.target.alive && p.target.deploySeq === p.tseq ? p.target : null;
      this.battle._safe(() => p.onHit({ battle: this.battle, projectile: p, target: t, x: p.x, y: p.y }), 'projectile.onHit', p.source);
    }
    for (const p of expired) {
      if (p.onExpire) this.battle._safe(() => p.onExpire({ battle: this.battle, projectile: p, target: null, x: p.x, y: p.y }), 'projectile.onExpire', p.source);
    }
  }

  clear() { this.list = []; }
}

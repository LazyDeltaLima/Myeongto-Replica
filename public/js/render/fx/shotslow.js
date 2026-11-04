// public/js/render/fx/shotslow.js — which drawn shot a sim fx 'shotSlow' names.
//
// The view flies its own copy of each shot from the moment it left and never reads the sim's projectiles, so what changes one
// in the air is told: 'shotSlow' { from: its shooter, tgt: its target or null, rate: the share of its speed from now | clear: 1
// it is gone } (逻各斯 S3: the client's Projectile.RegisterMoveScale through the skill's ProjectileAura; docs/rules/fx.md).
// An entry here is anything with `esrc` / `etgt` (the shooter's and target's ids) and `rate` (undefined = 1): a trail
// record, a procedural shot or the landing effects timed for a shot.

/** Slowed official trails that do not count against the trail cap (fxgame.js trailFull): 12 moving + these. */
export const MAX_SLOWED = 24;

/**
 * The entry of `list` event `o` means: same shooter and target (`tgt` null: the shot has no target, a straight one, or its target
 * fell — any of that shooter), the oldest first, as the oldest of them reaches the range first and leaves it first. One already
 * in the state `o` sets is another shot; a cleared shot may be either state, slowed ones first.
 */
export function shotOf(list, o) {
  let other = null;
  for (const x of list) {
    if (x.esrc == null || x.esrc !== o.from || (o.tgt != null && x.etgt !== o.tgt)) continue;
    const slowed = x.rate < 1;
    if (o.clear) { if (slowed) return x; other ??= x; continue; }
    if (slowed !== Number(o.rate) < 1) return x;
  }
  return other;
}

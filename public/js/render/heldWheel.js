// render/heldWheel.js — local patch (docs/LOCAL-PATCH.md 「回环射手 부메랑」, maintainer report 2026-10-08): the 回环射手's
// one boomerang, in her hand while she holds it. Not named boomerang.js: EasyPrivacy's path rule `/boomerang.js` (an
// analytics script's name, on by default in uBlock Origin) blocked it, and with it the whole render engine import.
//
// The client (EN, checked 2026-10-08): 跃跃's projectile projectile_chr_caper (battle/prefabs/[uc]projectiles.ab) flies
// out at `_speed` 15, `_comeBack` 1 at `_comeBackSpeedScale` 0.25 (3.75 back, the sim's BOOMERANG_RETURN_SPEED) with
// its `_mainEffect` caper_attack_01_trail kept on the way back (`_clearMainEffectWhenReached` 0) — the effect's `wheel`
// particle is the wheel she throws (texture caper_wheel = her Spine region C_Weapon_03). Her skeleton keeps that region
// out of the default skin: it is the only attachment of the Spine skin 'Bullet', and her trait ability (Others/Direction/
// Trait, 「持有回旋投射物时才能够攻击」) names `_skinKey` "Bullet" — the wheel in her hand is that skin, on while she holds
// the projectile [추정: the switch itself is native code; every animation keys C_Weapon_03, none hides it]. Without the
// skin (this renderer before) the wheel never showed in her hand.
//
// Thrown / caught by the drawn flights (render/fx/projectiles.js procedural boomerang, render/fxgame.js the official
// trail), so the wheel leaves the hand when the flight starts and is back when that flight ends: `view._boomOut` counts
// the flights out. The sim gates her next attack on its own catch (server/sim/ai.js throwBoomerang).

/** The Spine skin of a held projectile (char_4100_caper: C_Weapon_03, the wheel). */
export const HELD_SKIN = 'Bullet';

/** A drawn boomerang left `view`'s hand. */
export function boomerangThrown(view) {
  if (view) view._boomOut = (view._boomOut || 0) + 1;
}

/** A drawn boomerang flight of `view` ended (caught, or dropped with its thrower). */
export function boomerangCaught(view) {
  if (view && view._boomOut > 0) view._boomOut--;
}

/**
 * Show / hide the held projectile on `actor` (render/spine.js SpineActor) for `view`: the skeleton's HELD_SKIN while no
 * flight of it is out. Skeletons without that skin are left alone. Called every frame (cheap: a cached skin, a flag).
 */
export function syncHeldWeapon(actor, view) {
  const sk = actor?.spine?.skeleton;
  if (!sk) return;
  if (actor._heldSkin === undefined) {
    try { actor._heldSkin = sk.data?.findSkin?.(HELD_SKIN) || null; } catch { actor._heldSkin = null; }
  }
  const skin = actor._heldSkin;
  if (!skin) return;
  if (view) tracked.add(view);
  const held = !(view?._boomOut > 0);
  if (actor._held === held) return;
  actor._held = held;
  sk.setSkin(held ? skin : null);
  // the slots it covers now (the animations' attachment keys resolve them through the skin every frame as well)
  for (const e of skin.getAttachments()) {
    const slot = sk.slots[e.slotIndex];
    if (slot) slot.setAttachment(held ? e.attachment : null);
  }
  // the skin change shows only after an update: a held pose (SpineActor.poseHeld — lying in the end of its Die clip when
  // the last flight lands) is updated and redrawn once more
  actor._applied = false;
}

const tracked = new Set();   // the views with a held-projectile skin (heldStats)
/** Dev / E2E: [{ id, out: flights out, held: skin on }] of the live views with a held projectile. */
export function heldStats() {
  const out = [];
  for (const v of tracked) {
    if (v.destroyed) { tracked.delete(v); continue; }
    out.push({ id: v.id ?? null, out: v._boomOut || 0, held: v.actor?._held ?? null });
  }
  return out;
}

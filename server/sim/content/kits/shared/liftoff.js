// server/sim/content/kits/shared/liftoff.js — the take-off and landing clips of a 起飞 skill (蒂比, 予愿安洁莉娜).
//
// The official client switches such a skill through a take-off mode before its own and a landing mode after it (charpack
// `Modes/<S>_TakeOff`, `<S>_Landing`, tools/assets/local-attack-timing.json): each of those modes' attack ability is the
// clip itself (`_timeMode` 1 FROM_ANIMATION, `_allowNoTarget`), so the unit attacks nothing while it plays — the take-off
// within the skill's time, the landing after it, still in the air (docs/rules/diy.md 「새 시즌 아스테시아·콘트레일·에단」). 云迹 (op-ctrail.js)
// and 风絮 (op-taraxa.js) keep their own copies of the same rule.

/** 起飞 (gamedata_const ba.liftoff): no ground enemy blocked or selecting the unit, flyers blocked. */
export const LIFTOFF_FLAGS = Object.freeze({ blockFly: true, liftoff: true });
/** The ends of a skill that leave through its landing mode; the others (a knock-out, a withdrawal …) land at once. */
const LANDS = new Set(['duration', 'ammo', 'stop', 'stopped']);

/**
 * The mode switch into a take-off or landing mode cuts the swing in progress: the attack abilities of those operators'
 * modes detach with `_interruptAbilityOnDetach` (`det` 1 in tools/assets/local-attack-timing.json).
 */
function cutSwing(unit) { unit.swing = null; unit.castLeft = 0; }

/** The take-off clip (`clip` s) as the skill starts: no attack until it has played. */
export function holdTakeOff(battle, unit, clip) {
  if (!(clip > 0)) return;
  cutSwing(unit);
  unit.skillStateUntil = Math.max(unit.skillStateUntil ?? 0, battle.time + clip);
}

/**
 * The landing clip (`clip` s) after the skill's end `reason`: the unit stays airborne (buff `key` with LIFTOFF_FLAGS) and
 * attacks nothing until it has played, then `onLanded` (the flyers it held are let go). A skill cast again meanwhile
 * keeps it in the air (the buff goes, the skill's own flags hold it). Any other end lands at once.
 */
export function landAfter(battle, unit, clip, { key, reason, onLanded }) {
  battle.removeBuff(unit, key);
  if (!(clip > 0) || !LANDS.has(reason) || !unit.alive || !unit.deployed) { onLanded?.(); return; }
  battle.addBuff(unit, { key, flags: LIFTOFF_FLAGS, tags: ['skill'] });
  cutSwing(unit);
  unit.skillStateUntil = Math.max(unit.skillStateUntil ?? 0, battle.time + clip);
  const seq = unit.deploySeq, n = unit.skill?.activations;
  battle.after(clip, () => {
    if (!unit.alive || !unit.deployed || unit.deploySeq !== seq) return;
    battle.removeBuff(unit, key);
    if (unit.skill?.activations === n) onLanded?.();
  }, { owner: unit });
}

// public/js/screens/game/marks.js — class-name join and the field highlight styles the match screen passes to the view.

export const cx = (...p) => p.flat().filter(Boolean).join(' ');

export const HUD_HZ_MS = 200;

/** Range tiles of the selected unit (its own highlight group: the wheel's 'facing' group may be up at the same time). */
export const SEL_RANGE = Object.freeze({ group: 'selRange', color: 0xff9c33, fill: 0.3, line: 0.95 });
/** The same for a heal range (a medic's: ui/facing.js healRange) — the 3D board stripes it blue. */
export const SEL_RANGE_HEAL = Object.freeze({ ...SEL_RANGE, color: 0x33c8ff, heal: true });
/** The same for the skill's range the field menu's toggle shows — red (GridRangeDrawer.TurnOnSkill). */
export const SEL_RANGE_SKILL = Object.freeze({ ...SEL_RANGE, color: 0xff3b30, skill: true });

/** The tile an armed merge-completing card's elite will take (its own group; gold like the promotion cue, render/fx.js). */
export const MERGE_HL = Object.freeze({ group: 'mergeTile', color: 0xffd45a, fill: 0.34, line: 1 });

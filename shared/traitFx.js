// shared/traitFx.js — the effect 规程 plays over an operator when one of its 特质 takes effect (docs/rules/fx.md
// 「규정 특질 발동 이펙트」).
//
// 规程's garrison table gives each 特质 an `eventEffect` (data/seasons/act3autochess/garrisons.json): map_v079_buff02
// (support, eventTypeIcon icon_support), _03 (battle, icon_battle: crossed swords) or _04 (gold, icon_gold); the bond
// ones (icon_bond) have null there, yet the official screen shows map_v079_buff01 (the chain-link icon) over them — over
// 雪猎 when bought and when 铃兰's 指令 runs its 「获得时」 特质, over the bond 特质 that gain layers in battle (official
// recordings, maintainer check 2026-11-12). The four prefabs (CN battle/prefabs/effects/map.ab, the `map` bundle) are one
// look — two icons and a glow rising for 0.6 s at the head (`_spawnLocation` 4) — each with its type's icon. The default
// season's table has no such field: nothing is played there.

/** The extracted bundle of the four prefabs. */
export const TRAIT_FX_BUNDLE = 'map';
/** The bond 特质's effect (not named by the table: the official screen). */
export const BOND_TRAIT_FX = 'map_v079_buff01';

/**
 * The effect a 特质 plays when it takes effect, or null: its record's `eventEffect`, else map_v079_buff01 for a bond one
 * of a table that has the field.
 * @param {{ eventEffect?: string|null, eventTypeIcon?: string|null }|null|undefined} g a garrisons.json record
 */
export function traitEventFx(g) {
  if (!g || typeof g !== 'object' || !('eventEffect' in g)) return null;
  if (typeof g.eventEffect === 'string' && g.eventEffect) return g.eventEffect;
  return g.eventTypeIcon === 'icon_bond' ? BOND_TRAIT_FX : null;
}

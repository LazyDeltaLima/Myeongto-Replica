// server/sim/content/kits/shared/powers.js — the faction ("【拉特兰】干员", "卡西米尔干员") test of operator talents.
// The official client tests an operator's own talents and skills against the character's group tags, never its 盟约:
// templates `CheckCharacterGroupTag`, prefab `FilterGroupTagTargetValidator` and deck selectors' `filterTag` all go
// through `BattleCharacterData.CheckGroupTag`, which compares the character_table `nationId`, `groupId`, `teamId` and
// every `subPower` entry's three ids (Texas: lungmen, penguin, siracusa). The 卫戍协议 chess data is built by the
// ordinary converter, so a chess keeps its tags whatever bonds the season gives it (checked in the official client;
// docs/rules/sim.md 「진영 판정은 소속 태그」). Only the mode's own templates (bond effects, items, bands) filter by bond.

/**
 * The group tags of a unit: data `powers` (tools/build-data.mjs powersOf), else its `nationId` alone (a record built
 * before the field, a test record). Tokens carry none.
 * @param {any} u
 * @returns {readonly string[]}
 */
export function powersOf(u) {
  const raw = u?.def?.raw;
  if (Array.isArray(raw?.powers)) return raw.powers;
  const nation = raw?.nationId ?? u?.def?.nationId ?? null;
  return nation ? [nation] : [];
}

/**
 * Whether a unit carries any of the group tags (`CheckGroupTag` over a tag list: any one matches).
 * @param {any} u
 * @param {...string} tags
 */
export function hasPower(u, ...tags) {
  const own = powersOf(u);
  return own.length > 0 && tags.some((t) => own.includes(t));
}

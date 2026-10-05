// render/fxmap.js — which extracted effect plays for which battle event (local NAS patch, docs/LOCAL-PATCH.md).
//
// Effect bundles are named after the operator (battle/prefabs/effects/<name>.ab, the charId without its char_NNN_
// prefix: char_1050_chen3 → chen3) and the prefabs follow the client's naming: <name>_attack_start_01 / _attack_hit_01,
// <name>_skill_0N_start_01 / _buff_01 / _hit_01, <name>_birth_01_start. Skin / collab variants carry a suffix
// (_iteration#4, _sale#14, _avemujica#1 …) and are left out: the remake draws the default skin.
// [ASSUMED] the mapping by name; the client binds effects per ability in its charpack prefabs (`_startEffect` …).

/** Effect bundle of an operator (charId without its numeric prefix). */
export const fxBundleOf = (charId) => String(charId || '').replace(/^char_\d+_/, '');

/** A skin / collab variant of a prefab (not the default skin). */
export const isVariant = (name) => /#\d+|_sale|_iteration|_avemujica|_cn_topolect/i.test(name);

/**
 * Prefabs of a bundle grouped by use: attack, skill1..3, birth, other (variants dropped).
 * @param {string[]} prefabs
 */
/** A copy of an effect for an up / down / left / back facing (the remake draws units facing left or right). */
export const isDirectional = (name) => /_(up|down|left|back)(_|$)/i.test(name);

export function effectGroups(prefabs) {
  const g = { attack: [], skill1: [], skill2: [], skill3: [], birth: [], other: [] };
  for (const p of prefabs || []) {
    if (isVariant(p) || isDirectional(p)) continue;
    const m = /_skill_?0?(\d)/i.exec(p); // _skill_03_ / _skill_3_ (angel2) / skill3_ (yu)
    if (m && g[`skill${m[1]}`]) g[`skill${m[1]}`].push(p);
    else if (/_attack/i.test(p)) g.attack.push(p);
    else if (/_birth|_born/i.test(p)) g.birth.push(p);
    else g.other.push(p);
  }
  for (const k of Object.keys(g)) g[k].sort();
  return g;
}

/**
 * Effects of a battle event for an operator, from its bundle's prefab list:
 *   'attackStart' (on the attacker), 'attackHit' (on the target), 'skillStart' / 'skillBuff' (looping while the skill
 *   is active) / 'skillHit' (on the target, during the skill) of skill index `skillIndex` (0-based), 'birth'.
 * @returns {string[]} prefab names (several play together: e.g. _start_01 and _start_02)
 */
export function effectsFor(prefabs, kind, skillIndex = 0) {
  const g = effectGroups(prefabs);
  const s = g[`skill${skillIndex + 1}`] || [];
  switch (kind) {
    case 'attackStart': return g.attack.filter((p) => /attack_start/i.test(p));
    case 'attackHit': return g.attack.filter((p) => /attack_hit/i.test(p)).slice(0, 1);
    case 'skillStart': return s.filter((p) => /_start/i.test(p));
    case 'skillBuff': return s.filter((p) => /_buff/i.test(p) && !/_[BF]_/.test(p)).slice(0, 2);
    case 'skillHit': return s.filter((p) => /_hit/i.test(p)).slice(0, 1);
    case 'skillTrail': return s.filter((p) => /_trail_01$/i.test(p)).slice(0, 1);
    case 'birth': return g.birth.filter((p) => /start|_01/.test(p)).slice(0, 1);
    default: return [];
  }
}

// Per-model skill clip overrides (local patch, docs/LOCAL-PATCH.md "우타게 S2 애니메이션"): anim-roles.mjs gives every
// skill index of a model without numbered Skill_n clips the unnumbered Skill_* family. For a skill whose official
// ability attacks with the plain Attack clip that is wrong — the renderer then plays another skill's stance while it
// is active.
//
// 宴 (char_337_utage): her only skill clips Skill_Start/Skill_Loop/Skill_End are S1 分神 (停止攻击, the phone stance).
// EN client battle/prefabs/[uc]skills.ab: skchr_utage_1 carries the anim component `_default { beginAnim "Skill_Start",
// loopAnim "Skill_Loop", endAnim "Skill_End" }` (+ switch_mode 1); skchr_utage_2 has no anim component at all (only
// switch_mode 2, utage_s_2[self_damage], utage_s_2[respawn]).
// EN client charpack char_337_utage.ab: the operator has 3 modes; the S2 落地斩·破门 mode (_addIndexToSignalId 1)
// attacks with `_animKey "Attack"`, `_damageType 2` (arts) and the utage_skill_02_start/_hit effects, while the S1
// mode carries an animator hooker (`_excludeAnimKeys ["Idle","Attack","Born"]`) that swaps her clips to the Skill_*
// family. So S2 = the normal Attack clip (skill clip `via: 'attack'`, like resolveSkill's own fallback).

/** model key (tools/assets/plan.mjs `op:<charId>:<dir>`) prefix → { [0-based skill index]: 'attack' } */
export const SKILL_CLIP_OVERRIDES = Object.freeze({
  'op:char_337_utage:': Object.freeze({ 1: 'attack' }),
});

/** Apply SKILL_CLIP_OVERRIDES to resolveRoles' result for model `key` (mutates and returns `anims`). */
export function applyAnimOverrides(key, anims) {
  if (!anims || typeof key !== 'string') return anims;
  for (const [prefix, map] of Object.entries(SKILL_CLIP_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, how] of Object.entries(map)) {
      if (how !== 'attack' || !anims.attack) continue;
      const clip = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
      if (anims.skills && anims.skills[i]) anims.skills[i] = clip;
      if (anims.skill && anims.skill.index === Number(i)) anims.skill = clip;
    }
  }
  return anims;
}

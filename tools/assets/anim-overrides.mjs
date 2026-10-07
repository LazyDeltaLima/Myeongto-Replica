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
//
// A clip object replaces the skill's clips outright — models whose clip numbers are not their skill numbers (the S1 is a
// common buff without clips of its own, so the numbers shift; user report 2026-10-07, research/2026-10-07-user-issues):
// 泥岩 (char_311_mudrok): S2 岩崩锤 strikes with `Skill_1` ([uc]skills.ab skchr_mudrok_2 attack ability `_animKey
// "Skill_1"`, 1.6 s) — `strike: true`: the clip is that empowered attack's, played by the attack, not at the cast
// (render/spine.js). `Skill_2_*` is S3 秽壤的血脉's (SleepAura `_default {Skill_2_Begin, Skill_2_Sleep, Skill_2_Awake}`,
// then charpack mode S3 `_replaceAnimPairs` Idle→Skill_2_Idle, Attack→Skill_2_Attack); the 10 s sleep itself is not
// modelled — the dormant operator stands in Skill_2_Idle.
// 莫斯提马 (char_213_mostma): S2 荒时之锁 = skchr_mostma_2's anim component `_default {Skill_Begin, Skill_Loop, Skill_End}`;
// S3 序时之匙 switches to charpack mode 1 (switch_mode_restart_fsm blackboard `mode 1`), whose attack is `_animKey
// "Skill_2_Loop"` / `_endAnimKey "Skill_2_Idle"` (Graphic Idle→Skill_2_Idle) — resolveSkill had the two swapped, so her
// S3 stood in S2's channel pose without an attack motion.
const clips = (o) => Object.freeze({ begin: null, loop: null, end: null, idle: null, ...o });

/** model key (tools/assets/plan.mjs `op:<charId>:<dir>`) prefix → { [0-based skill index]: 'attack' | clip object } */
export const SKILL_CLIP_OVERRIDES = Object.freeze({
  'op:char_337_utage:': Object.freeze({ 1: 'attack' }),
  'op:char_311_mudrok:': Object.freeze({
    1: clips({ loop: 'Skill_1', strike: true }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Attack', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  'op:char_213_mostma:': Object.freeze({
    1: clips({ begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
});

/** Apply SKILL_CLIP_OVERRIDES to resolveRoles' result for model `key` (mutates and returns `anims`). */
export function applyAnimOverrides(key, anims) {
  if (!anims || typeof key !== 'string') return anims;
  for (const [prefix, map] of Object.entries(SKILL_CLIP_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, how] of Object.entries(map)) {
      let clip = null;
      if (how === 'attack' && anims.attack) clip = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
      else if (how && typeof how === 'object') clip = { ...how, index: Number(i) };
      if (!clip) continue;
      if (anims.skills && anims.skills[i]) anims.skills[i] = clip;
      if (anims.skill && anims.skill.index === Number(i)) anims.skill = clip;
    }
  }
  return anims;
}

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
// common buff without clips of its own, so the numbers shift; maintainer report 2026-10-07, maintainer's notes 2026-10-07):
// 泥岩 (char_311_mudrok): S2 岩崩锤 strikes with `Skill_1` ([uc]skills.ab skchr_mudrok_2 attack ability `_animKey
// "Skill_1"`, 1.6 s) — `strike: true`: the clip is that empowered attack's, played by the attack, not at the cast
// (render/spine.js). `Skill_2_*` is S3 秽壤的血脉's (SleepAura `_default {Skill_2_Begin, Skill_2_Sleep, Skill_2_Awake}`,
// then charpack mode S3 `_replaceAnimPairs` Idle→Skill_2_Idle, Attack→Skill_2_Attack). The kit models the 10 s sleep, but
// the renderer does not draw it yet (Skill_2_Sleep / Skill_2_Awake, test/render/clip-coverage-list.js): the dormant
// operator stands in Skill_2_Idle.
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
  // 焰影苇草 (char_1020_reed2): S3's charpack mode pairs Attack→Skill_3_Attack, Idle→Skill_3_Loop (EN client) — resolveSkill
  // used the Loop stance as her attack, so she stood through S3 with no attack motion (maintainer report 2026-10-07)
  'op:char_1020_reed2:': Object.freeze({
    2: clips({ begin: 'Skill_3_Begin', loop: 'Skill_3_Attack', end: 'Skill_3_End', idle: 'Skill_3_Loop' }),
  }),
  'op:char_213_mostma:': Object.freeze({
    1: clips({ begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // The skill prefabs and charpack modes of the EN client (docs/rules/render.md 「Spine 클립 커버리지」, maintainer's notes
  // 2026-10-14), where the resolver's guess by name plays another skill's clips:
  // 灵知 (char_206_gnosis): S3 失温症 = skchr_gnosis_3 ThreePartChannelingAnimation `_default {Skill_4_Begin, Skill_4_Loop,
  // Skill_4_End}`; Skill_3 is the charged S2's (charpack mode S2+ pairs Skill_2→Skill_3).
  'op:char_206_gnosis:': Object.freeze({
    2: clips({ begin: 'Skill_4_Begin', loop: 'Skill_4_Loop', end: 'Skill_4_End' }),
  }),
  // 歌蕾蒂娅 (char_474_glady): S2's cast clip is skchr_glady_2 `_beginAnim "Skill_2_Startup"` (`_playSkillBeginAnim 1`);
  // Skill_2_Begin / _Loop / _End are the S2 mode's attack channel.
  'op:char_474_glady:': Object.freeze({
    1: clips({ begin: 'Skill_2_Startup', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // 伊内丝 (char_4087_ines): S3 独影归途 = an ability group whose first ability (`_animKey "Start_Skill"`) leaves the
  // shadow sentry; her attacks stay the ordinary ones (loop = idle: no skill attack clip).
  'op:char_4087_ines:': Object.freeze({
    2: clips({ begin: 'Start_Skill', loop: 'Idle' }),
  }),
  // 缄默德克萨斯 (char_1028_texas2): the S2 / S3 deploy burst (skchr_texas2_{2,3} AnimationEmitBehaviour ON_CAST_START
  // anim `Start_n`; charpack modes S2 / S3 pair Born→Start_n, Idle→Skill_n_Idle) opens the skill.
  'op:char_1028_texas2:': Object.freeze({
    1: clips({ begin: 'Start_2', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
    2: clips({ begin: 'Start_3', loop: 'Skill_3_Loop', end: 'Skill_3_End', idle: 'Skill_3_Idle' }),
  }),
  // 银灰 (char_172_svrash): every attack of the S2 mode is `Modes/S2/Body/Attack _animKey "Combat"`; `Skill` is S3's.
  'op:char_172_svrash:': Object.freeze({
    1: clips({ loop: 'Combat' }),
  }),
  // The client plays clips by key only: the skill prefabs and modes name keys, and the skin's key table (chararts
  // DefaultSkin SpineAnimator._animations) turns each into a clip name. Where the clip numbers are not the skill numbers:
  // 安洁莉娜 (char_291_aglina): S1 is a mode with the plain Attack and no clip of its own; S2's `_default` keys
  // Skill_1_Begin / _Loop / _End are the clips Skill1_*; S3's Skill_2_Begin / _Loop / _End are Skill1_Begin, Skill2_Loop,
  // Skill2_End (no key names Skill2_Begin).
  'op:char_291_aglina:': Object.freeze({
    0: 'attack',
    1: clips({ begin: 'Skill1_Begin', loop: 'Skill1_Loop', end: 'Skill1_End' }),
    2: clips({ begin: 'Skill1_Begin', loop: 'Skill2_Loop', end: 'Skill2_End' }),
  }),
  // 焰尾 (char_420_flamtl): S1 is a buff without a clip; S2 skchr_flamtl_2 `_animKey "Skill_2"` is the clip Skill_1; S3's
  // keys Skill_3_* (its begin and the S3 mode's Idle / Attack pairs) are the clips Skill_2_*.
  'op:char_420_flamtl:': Object.freeze({
    0: 'attack',
    1: clips({ loop: 'Skill_1' }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // 塞雷娅 (char_202_demkni): S1 skchr_demkni_1 attacks with `_animKey "Attack"`; S2's heal key `Heal` is the clip
  // Attack_2; Skill_Begin / _Loop / _End are S3 钙质化's.
  'op:char_202_demkni:': Object.freeze({
    0: 'attack',
    1: clips({ loop: 'Attack_2' }),
  }),
});

/**
 * Apply SKILL_CLIP_OVERRIDES to resolveRoles' result for model `key` (mutates and returns `anims`). `names` (the
 * skeleton's clip names, optional): an override clip the model lacks is dropped — one side's skeleton can miss a clip
 * the other has (泥岩 Back has no Skill_2_Begin / _Awake / _Sleep: its S3 starts straight in Skill_2_Attack / _Idle).
 */
export function applyAnimOverrides(key, anims, names = null) {
  if (!anims || typeof key !== 'string') return anims;
  for (const [prefix, map] of Object.entries(SKILL_CLIP_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, how] of Object.entries(map)) {
      let clip = null;
      if (how === 'attack' && anims.attack) clip = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
      else if (how && typeof how === 'object') {
        clip = { ...how, index: Number(i) };
        if (names) for (const f of ['begin', 'loop', 'end', 'idle']) if (clip[f] && !names.includes(clip[f])) clip[f] = null;
      }
      if (!clip) continue;
      if (anims.skills && anims.skills[i]) anims.skills[i] = clip;
      if (anims.skill && anims.skill.index === Number(i)) anims.skill = clip;
    }
  }
  return anims;
}

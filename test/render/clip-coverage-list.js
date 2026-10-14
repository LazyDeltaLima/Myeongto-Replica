// test/render/clip-coverage-list.js — every Spine clip of an operator model that the renderer does not reach through
// the model's roles (data/assets.json `anims`) or render/units.js FORMS / FORTRESS_CLIPS, per charId, with its status.
// test/render/clip-coverage.test.js fails on a clip missing here and on an entry that no longer applies; the rules and
// how to settle an entry: docs/rules/render.md 「Spine 클립 커버리지」.
//
// Status (one string, the reason after the colon):
//   'render: <file> <how>' — the renderer plays it by name outside the roles (<file> under public/js/, which must
//                        name the clip);
//   'none: <evidence>' — the official client does not play it in this mode, or it needs no drawing here (cite the
//                        prefab field / decompiled method / recording that shows it);
//   'todo: <groups> — <where>' — the client plays it and the renderer does not yet. Every entry of the first listing
//                        (2026-10-12) was checked against the client on 2026-10-14 (maintainer's notes); the letter names
//                        the client mechanism that plays the clip, one renderer change per letter (docs/rules/render.md
//                        「Spine 클립 커버리지」): A blocked-target attack, B alternate attack clip, C first-attack begin /
//                        attack end, D skill sub-mode clip pairs, E equipped skill default mode, F skill mode Die pair,
//                        G skill prefab clip, H talent / trait state, I mix clip, J skin key table, U up-facing clip.
//                        [ASSUMED] where the client fields leave the timing open.
// Clips whose name contains `Down` (the facing-down variants) are one gap of their own (DOWN_FAMILY in the test), not
// listed here.

export const UNPLAYED = {
  char_1015_aglna2: {
    Skill_2_Takeoff_Begin: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_End: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_Loop: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_3_Restart_Begin: 'todo: G — skill prefab clip [ASSUMED]',
  },
  char_1021_kroos2: {
    Skill_Loop_2: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
  },
  char_1023_ghost2: {
    Attack2: 'none: back-only clip, not a key of the skin SpineAnimator._animations (the client plays clips by key only)',
  },
  char_1028_texas2: {
    Default_2: 'none: setup pose (0 s); no ability, mode pair or mix names it',
    Default_3: 'none: setup pose (0 s); no ability, mode pair or mix names it',
    Start_3_2: 'todo: G — skill prefab clip',
  },
  char_1032_excu2: {
    Attack_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Attack_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_3_Attack_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
  },
  char_1035_wisdel: {
    Skill_2_Overload_Begin: 'todo: D+I — skill sub-mode clip pairs (mode _replaceAnimPairs); mix clip (SpineAnimator._mixSettings)',
    Skill_2_Overload_End: 'todo: D+I — skill sub-mode clip pairs (mode _replaceAnimPairs); mix clip (SpineAnimator._mixSettings)',
    Skill_2_Overload_Idle: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Overload_Loop: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
  },
  char_1040_blaze2: {
    Revive_Begin: 'todo: H — talent / trait state',
    Revive_End: 'todo: H — talent / trait state',
    Revive_Idle: 'todo: H — talent / trait state',
  },
  char_1041_angel2: {
    Skill_1_Close: 'todo: G — skill prefab clip [ASSUMED]',
    Skill_3_Skill: 'todo: G — skill prefab clip',
  },
  char_1045_svash2: {
    Skill_3_Deploy: 'none: only when the 风雪之眼 card is used by hand during S3 (skchr_svash2_3 BirdAura AnimationEmitBehaviour via svash2_s_3[*_bird_onuse]); no hand deployment in this mode [ASSUMED]',
  },
  char_1050_chen3: {
    Start_2: 'todo: E — equipped skill default mode (_defaultModeIndex, Born pair)',
  },
  char_1052_kalts2: {
    Skill_3_Restart_Begin: 'todo: G — skill prefab clip',
    Skill_3_Restart_End: 'todo: G — skill prefab clip',
  },
  char_2027_wang: {
    Default_2: 'none: setup pose of mode S2 (replaces Default, 0 s; charpack Modes/S2 _replaceAnimPairs)',
  },
  char_206_gnosis: {
    Skill_3: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs): the charged S2, mode S2+ Skill_2→Skill_3',
  },
  char_263_skadi: {
    Attack_Begin: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
    Attack_End: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
  },
  char_279_excu: {
    Attack_Up: 'todo: U — up-facing clip (AbstractAnimatedAbility.GetAnimKey)',
    Skill_Up_Begin: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_End: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_Loop: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
  },
  char_291_aglina: {
    Skill2_Begin: 'none: not a key of the skin SpineAnimator._animations (S3 key Skill_2_Begin plays Skill1_Begin; the client plays clips by key only)',
  },
  char_308_swire: {
    Attack_Up: 'todo: U — up-facing clip (AbstractAnimatedAbility.GetAnimKey)',
  },
  char_311_mudrok: {
    Skill_2_Awake: 'todo: G — skill prefab clip',
    Skill_2_Sleep: 'todo: G — skill prefab clip',
  },
  char_4016_kazema: {
    Default_B: 'none: setup pose of the stand-in form (0 s); only the buff template of another unit (parrot_m1_t) names it',
  },
  char_4058_pepe: {
    Skill_3_Loop_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
  },
  char_4064_mlynar: {
    Idle_2: 'todo: H — talent / trait state [ASSUMED]',
  },
  char_4116_blkkgt: {
    Skill_2_B: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); S2 plays Skill_2',
  },
  char_4145_ulpia: {
    Skill_3_Back: 'todo: E — equipped skill default mode (_defaultModeIndex, Born pair)',
    Skill_3_ReStart_A: 'todo: E — equipped skill default mode (_defaultModeIndex, Born pair)',
    Skill_3_ReStart_B: 'todo: E — equipped skill default mode (_defaultModeIndex, Born pair) [ASSUMED]',
  },
  char_4182_oblvns: {
    Skill_2_Idle_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Loop_A: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Loop_B: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Trans_A: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_2_Trans_B: 'todo: G — skill prefab clip',
  },
  char_420_flamtl: {
    Skill_2_Attack_2: 'todo: H+J — talent / trait state; skin key table (SpineAnimator._animations)',
  },
  char_4211_snhunt: {
    Reload_Begin: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
    Reload_Break: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
    Reload_End: 'todo: C+I — first-attack begin / attack end (ThreePartOneshotAnimation); mix clip (SpineAnimator._mixSettings)',
    Reload_Loop: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
  },
  char_427_vigil: {
    Attack_Begin: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
    Attack_End: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
    Skill3_ABC_Idle_Into: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation)',
  },
  char_440_pinecn: {
    Skill_1_Up: 'todo: U — up-facing clip (AbstractAnimatedAbility.GetAnimKey)',
    Skill_2_Up: 'todo: U — up-facing clip (AbstractAnimatedAbility.GetAnimKey)',
  },
  char_469_indigo: {
    Attack_Charge: 'todo: H — talent / trait state',
  },
  char_474_glady: {
    Skill_2_Begin: 'todo: C — first-attack begin / attack end (ThreePartOneshotAnimation): the attack channel begin of the S2 mode',
    Skill_3_Chant: 'todo: D — skill sub-mode clip pairs (mode _replaceAnimPairs)',
    Skill_3_Startup: 'todo: G — skill prefab clip',
  },
  char_498_inside: {
    Attack_Idle: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); attack is Attack_Begin/Loop/End',
  },
};

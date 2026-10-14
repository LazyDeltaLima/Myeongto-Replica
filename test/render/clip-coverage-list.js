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
  },
  char_1023_ghost2: {
    Attack2: 'none: back-only clip, not a key of the skin SpineAnimator._animations (the client plays clips by key only)',
  },
  char_1028_texas2: {
    Default_2: 'none: setup pose (0 s); no ability, mode pair or mix names it',
    Default_3: 'none: setup pose (0 s); no ability, mode pair or mix names it',
  },
  char_1041_angel2: {
    Skill_1_Close: 'none: the S1 burst after a stop by hand (Modes/S1_Burst_Mode); this mode has no manual stop — no client message stops a skill and server/sim/skills.js stop() has no caller',
  },
  char_1045_svash2: {
    Skill_3_Deploy: 'none: only when the 风雪之眼 card is used by hand during S3 (skchr_svash2_3 BirdAura AnimationEmitBehaviour via svash2_s_3[*_bird_onuse]); no hand deployment in this mode [ASSUMED]',
  },
  char_2027_wang: {
    Default_2: 'none: setup pose of mode S2 (replaces Default, 0 s; charpack Modes/S2 _replaceAnimPairs)',
  },
  char_279_excu: {
    Skill_Up_Begin: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_End: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_Loop: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
  },
  char_291_aglina: {
    Skill2_Begin: 'none: not a key of the skin SpineAnimator._animations (S3 key Skill_2_Begin plays Skill1_Begin; the client plays clips by key only)',
  },
  char_4016_kazema: {
    Default_B: 'none: setup pose of the stand-in form (0 s); only the buff template of another unit (parrot_m1_t) names it',
  },
  char_4087_ines: {
    Start_Skill: 'none: skchr_ines_3/First _animKey — S3 is cast only as she deploys (ON_DEPLOY) and the official game shows no Start_Skill after the deployment (maintainer 2026-10-14)',
  },
  char_4116_blkkgt: {
    Skill_2_B: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); S2 plays Skill_2',
  },
  char_498_inside: {
    Attack_Idle: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); attack is Attack_Begin/Loop/End',
  },
};

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
//   'todo: <hint>'     — not checked yet. Hints from the first listing (2026-10-12): `official <skill id | mode name>` =
//                        the EN client's skill prefab anim component / `_animKey` or that charpack mode names the clip (a
//                        likely omission — check first); `no official reference` = neither does (look at the buff
//                        templates and the decompiled code); `CN only` = the operator is not in the EN client (read the
//                        CN prefabs field by field, [ASSUMED]).
// Clips whose name contains `Down` (the facing-down variants) are one gap of their own (DOWN_FAMILY in the test), not
// listed here.

export const UNPLAYED = {
  char_1015_aglna2: {
    Skill_1_Die: 'todo: CN only',
    Skill_2_Die: 'todo: CN only',
    Skill_2_Takeoff_Begin: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_End: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_Loop: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_3_Combat: 'todo: CN only',
    Skill_3_Die: 'todo: CN only',
    Skill_3_Restart_Begin: 'todo: CN only',
    Start_2: 'todo: CN only',
  },
  char_1019_siege2: {
    Attack_2: 'todo: no official reference',
  },
  char_1021_kroos2: {
    Skill_Loop_2: 'todo: official mode S2_Sub',
  },
  char_1023_ghost2: {
    Attack2: 'todo: no official reference',
  },
  char_1028_texas2: {
    Default_2: 'todo: no official reference',
    Default_3: 'todo: no official reference',
    Start_2: 'todo: official mode S2',
    Start_3: 'todo: official mode S3',
    Start_3_2: 'todo: official skchr_texas2_3',
  },
  char_1032_excu2: {
    Attack_B: 'todo: official mode S3, mode Default, mode S2, mode S1',
    Skill_2_Attack_B: 'todo: official mode S2',
    Skill_3_Attack_B: 'todo: official mode S3',
  },
  char_1035_wisdel: {
    Attack_B: 'todo: official mode Default',
    Attack_C: 'todo: official mode Default',
    Skill_2_Overload_Begin: 'todo: no official reference',
    Skill_2_Overload_End: 'todo: no official reference',
    Skill_2_Overload_Idle: 'todo: official mode S2_Overload',
    Skill_2_Overload_Loop: 'todo: official mode S2_Overload',
  },
  char_1039_thorn2: {
    Start_2: 'todo: official mode S3',
  },
  char_1040_blaze2: {
    Revive_Begin: 'todo: no official reference',
    Revive_End: 'todo: no official reference',
    Revive_Idle: 'todo: official mode Reborn',
  },
  char_1041_angel2: {
    Skill_1_Close: 'todo: official mode S1, mode S1_Burst_Mode',
    Skill_3_Skill: 'todo: official mode S3_Down, mode S3',
  },
  char_1045_svash2: {
    Attack_B: 'todo: no official reference',
    Attack_C: 'todo: no official reference',
    Skill_3_Deploy: 'todo: no official reference',
  },
  char_1046_sbell2: {
    Skill_3_Attack_B: 'todo: no official reference',
    Skill_3_Attack_C: 'todo: no official reference',
  },
  char_1050_chen3: {
    Start_2: 'todo: official mode S2Respawn',
  },
  char_1052_kalts2: {
    Skill_3_Restart_Begin: 'todo: CN only',
    Skill_3_Restart_End: 'todo: CN only',
  },
  char_140_whitew: {
    Combat: 'todo: official mode Default, mode S2',
  },
  char_172_svrash: {
    Combat: 'todo: official mode Default, mode S2',
  },
  char_2027_wang: {
    Attack_1_B: 'todo: no official reference',
    Attack_2_A: 'todo: official mode S2',
    Attack_2_B: 'todo: official mode S2',
    Default_2: 'todo: official mode S2',
    Idle_2: 'todo: official mode S2',
    Skill_3_Attack_B: 'todo: no official reference',
    Start_2: 'todo: official mode S2',
  },
  char_202_demkni: {
    Attack_2: 'todo: no official reference',
  },
  char_206_gnosis: {
    Skill_4_Begin: 'todo: official skchr_gnosis_3',
    Skill_4_End: 'todo: official skchr_gnosis_3',
    Skill_4_Loop: 'todo: official skchr_gnosis_3',
  },
  char_263_skadi: {
    Attack_Begin: 'todo: official mode Default, mode S2, mode S3',
    Attack_End: 'todo: official mode Default, mode S2, mode S3',
  },
  char_264_f12yin: {
    Attack_B: 'todo: no official reference',
  },
  char_279_excu: {
    Attack_Up: 'todo: no official reference',
    Skill_Up_Begin: 'todo: no official reference',
    Skill_Up_End: 'todo: no official reference',
    Skill_Up_Loop: 'todo: no official reference',
  },
  char_291_aglina: {
    Idle_Charge: 'todo: no official reference',
  },
  char_294_ayer: {
    Combat: 'todo: official mode Default',
  },
  char_308_swire: {
    Attack_Up: 'todo: no official reference',
  },
  char_311_mudrok: {
    Skill_2_Awake: 'todo: official skchr_mudrok_3',
    Skill_2_Sleep: 'todo: official skchr_mudrok_3',
  },
  char_391_rosmon: {
    Attack_B: 'todo: official mode Default',
    Stun_Skill_3: 'todo: no official reference',
  },
  char_4010_etlchi: {
    Skill_3_Loop_B: 'todo: official mode S3',
  },
  char_4016_kazema: {
    Default_B: 'todo: no official reference',
    Die_2: 'todo: no official reference',
  },
  char_4058_pepe: {
    Skill_3_Loop_B: 'todo: official mode S3',
  },
  char_4064_mlynar: {
    Idle_2: 'todo: official mode Default',
  },
  char_4082_qiubai: {
    Combat_A: 'todo: official mode S2, mode Default',
    Combat_B: 'todo: official mode S2, mode Default',
  },
  char_4087_ines: {
    Combat: 'todo: official mode Default, mode S2, mode S3',
    Skill_2_Combat: 'todo: official mode S2',
    Start_Skill: 'todo: official skchr_ines_3',
  },
  char_4116_blkkgt: {
    Skill_2_B: 'todo: no official reference',
  },
  char_4132_ascln: {
    Attack_B: 'todo: official mode Default',
  },
  char_4145_ulpia: {
    Skill_2_Die: 'todo: official mode S2',
    Skill_3_Back: 'todo: official mode S3_Restore',
    Skill_3_ReStart_A: 'todo: no official reference',
    Skill_3_ReStart_B: 'todo: no official reference',
  },
  char_4182_oblvns: {
    Combat: 'todo: official mode Default',
    Skill_2_Idle_B: 'todo: official mode S2_AttackSpeed, mode S2_Fever_Mag',
    Skill_2_Loop_A: 'todo: official mode S2_Fever, mode S2_Atk',
    Skill_2_Loop_B: 'todo: official mode S2_AttackSpeed, mode S2_Fever_Mag',
    Skill_2_Trans_A: 'todo: official mode S2_Fever, mode S2_Atk',
    Skill_2_Trans_B: 'todo: official skchr_oblvns_2',
  },
  char_4191_tippi: {
    Die_2: 'todo: official mode S2_TakeOff, mode S1_TakeOff, mode S1, mode S2, mode S1_Landing, mode S2_Landing',
  },
  char_420_flamtl: {
    Skill_2_Attack_2: 'todo: no official reference',
  },
  char_4211_snhunt: {
    Reload_Begin: 'todo: official mode Default',
    Reload_Break: 'todo: official mode Default',
    Reload_End: 'todo: no official reference',
    Reload_Loop: 'todo: no official reference',
  },
  char_427_vigil: {
    Attack_Begin: 'todo: official mode Default',
    Attack_End: 'todo: official mode Default',
    Skill3_ABC_Idle_Into: 'todo: official mode S3',
    Skill3_Attack_B: 'todo: no official reference',
    Skill3_Attack_C: 'todo: no official reference',
  },
  char_440_pinecn: {
    Skill_1_Up: 'todo: no official reference',
    Skill_2_Up: 'todo: no official reference',
  },
  char_469_indigo: {
    Attack_Charge: 'todo: no official reference',
  },
  char_474_glady: {
    Skill_2_Startup: 'todo: official skchr_glady_2',
    Skill_3_Chant: 'todo: official mode S3',
    Skill_3_Startup: 'todo: official skchr_glady_3',
  },
  char_498_inside: {
    Attack_Idle: 'todo: no official reference',
  },
  char_617_sharp2: {
    Combat: 'todo: CN only',
  },
};

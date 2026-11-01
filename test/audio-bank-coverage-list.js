// test/audio-bank-coverage-list.js — every official sound bank of a 선발 operator (zh_CN audio_data.json, a `battle.` bank
// whose name carries the operator's codename as a word) whose sound file the asset manifest (data/assets.json `audio`)
// never plays, per charId, with its status. test/audio-bank-coverage.test.js fails on a bank missing here and on an entry
// that no longer applies (its file is played now); the rules: docs/rules/audio.md 「선발 소리 뱅크 커버리지」.
//
// Status (one string, the reason after the colon):
//   'none: <evidence>' — the official client does not sound it in this mode (cite the prefab field / client method);
//   'todo: <where>' — the client sounds it and we do not yet (where it fires, as far as known).
// The first listing (2026-11-01) is the banks unplayed when the test was written; none of them was checked yet.

export const UNSOUNDED = {
  char_1050_chen3: {
    'ON_CUSTOM_TRIGGER.chen3_talent_evade_start_audio': 'todo: talent evade start (a custom trigger, source node not read)',
  },
  char_1035_wisdel: {
    'ON_ABILITY_ON.sktok_wisdel_wward': 'todo: her 残影 token\'s skill ability ON',
  },
  char_4182_oblvns: {
    'ON_SKILL_START.skchr_oblvns_2.2': 'todo: S2 with a numbered signal id (docs/rules/audio.md 「스킬 종료음」 안 한 것)',
    'ON_SKILL_FINISH.skchr_oblvns_2.2': 'todo: S2 with a numbered signal id (docs/rules/audio.md 「스킬 종료음」 안 한 것)',
  },
  char_1052_kalts2: {
    'ON_ABILITY_START.char_1052_kalts2.T.-1': 'todo: a talent ability START',
    'ON_PROJECTILE_REACH.projectile_chr_kalts2_s3_2': 'todo: S3 second projectile REACH',
    'ON_BUFF_START.kalts2_respawn_range': 'todo: the respawn range buff',
  },
  char_1015_aglna2: {
    'ON_PLAY_ANIMATION.aglna2_born': 'todo: her deployment clip\'s audio event',
    'ON_PROJECTILE_BORN.projectile_chr_aglna2_s2_fly': 'todo: S2 glide projectile BORN',
    'ON_BUFF_START.aglna2_s_2[enemy][levitate]': 'todo: S2 on an enemy lifted',
    'ON_BUFF_START.aglna2_s_2[enemy][ground_bound]': 'todo: S2 on an enemy held to the ground',
    'ON_PLAY_ANIMATION.aglna2_s_2[Begin]': 'todo: S2 Skill_2_Begin clip\'s audio event',
    'ON_SKILL_START.skchr_aglna2_3.move_like_projectile.skill_start': 'todo: S3 start with its flight',
    'ON_PROJECTILE_BORN.projectile_chr_aglna2_s3_fly': 'todo: S3 flight projectile BORN',
    'ON_PLAY_ANIMATION.aglna2_restart': 'todo: a restart clip\'s audio event',
  },
  char_1042_phatm2: {
    'ON_ABILITY_START.token_10054_phatm2_encdool.T.1': 'todo: her token\'s talent ability START',
    'ON_PROJECTILE_HIT.projectile_token_phatm2_encdool': 'todo: her token\'s projectile HIT',
    'ON_ABILITY_START.sktok_phatm2_encdool_2.extra.0': 'todo: her token\'s S2 extra ability START',
    'ON_CUSTOM_TRIGGER.phatm2_s2_boom_damage': 'todo: S2 burst damage (a custom trigger)',
  },
  char_4244_tocka: {
    // her attack group (AbilityFirstSucceedGroup: T2Attack while she holds T2's mark, else NormalAttack) is read without its
    // group kind (tools/local-extract/char_audio.py ability_info), so the builder takes attack.0.1 / 0.2 in turn and never
    // attaches T2Attack's projectile; the same shape as 蕾缪安's Modes/S2/Body/M2Attack, which the fields alone cannot tell apart
    'ON_PROJECTILE_HIT.projectile_chr_tocka_t2': 'todo: T2Attack\'s hit — the attack group kind (char_audio.py), then the swing signal T2Attack picks the child',
  },
};

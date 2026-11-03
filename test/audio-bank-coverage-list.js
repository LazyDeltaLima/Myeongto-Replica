// test/audio-bank-coverage-list.js — every official sound bank of a 선발 operator (zh_CN audio_data.json, a `battle.` bank
// whose name carries the operator's codename, or one of her summons' own codes, as a word) whose sound file the asset
// manifest (data/assets.json `audio`) never plays, per charId, with its status. test/audio-bank-coverage.test.js fails on a
// bank missing here and on an entry that no longer applies (its file is played now); the rules: docs/rules/audio.md
// 「선발 소리 뱅크 커버리지」. Where a bank's signal comes from: tools/local-extract/link_sheet.py.
//
// Status (one string, the reason after the colon):
//   'none: <evidence>' — the official client does not sound it in this mode (cite the prefab field / client method);
//   'todo: <where>' — the client sounds it and we do not yet (where it fires, as far as known).
// The first listing (2026-11-01) had 25; all its `todo` entries were wired the same day. The 白铁 / 遥 / 真言 ones (2026-11-03) too.

export const UNSOUNDED = {
  char_4202_haruka: {
    // no buff template, prefab node or ability of the EN client plays this signal (S3's levitation ending sounds nothing)
    'ON_CUSTOM_TRIGGER.haruka_shield_break_enemy': 'none: no source plays it — haruka_s_3_debuff carries haruka_shield_start_enemy (START / TRIGGER banks only)',
  },
  char_179_cgbird: {
    'ON_BUFF_START.mstrfd_bird_crash[audio]': 'none: not hers — an mstrfd_ bank (no unit of this mode); "bird" is also her 幻影\'s code',
    'ON_PROJECTILE_BORN.projectile_chr_svash2_s3_bird': 'none: not hers — 凛御银灰 S3\'s bird; "bird" is also her 幻影\'s code',
  },
  char_4182_oblvns: {
    // S2 is a ToggleSkillWithEndAnimation (`_appendModeIndexToBeginAudioSignal`): PlayBeginAudio sounds ON_SKILL_START, or
    // ON_SKILL_FINISH once toggled, at skchr_oblvns_2.<current mode index>; here her one cast comes from mode 2 (S2_Atk)
    'ON_SKILL_START.skchr_oblvns_2.1': 'none: an untoggled cast from mode 1 (S2_AttackSpeed) — her only cast here is from mode 2, the skill\'s _defaultModeIndex',
    'ON_SKILL_FINISH.skchr_oblvns_2.1': 'none: a toggled cast — the automatic battle never casts a toggled skill (AutoChessBattleTrigger._CheckToggleSkill)',
  },
  char_4098_vvana: {
    // 斥罪, 逻各斯, 薇薇安娜 joined 2026-11-03; 斥罪's and 逻各斯's were wired the same day. These need the sim to mark the cast
    // (S1 蓄力 / S3 from the second cast) and the audio plan a mode its skill casts in instead of its own (docs/rules/audio.md)
    'ON_ABILITY_ON.skchr_vvana_1.2': 'todo: S1 cast in 蓄力 mode (mode 2, both charges)',
    'ON_ABILITY_START.char_4098_vvana.attack.4': 'todo: S3 attack from the second cast (mode 4: S3_2)',
    'ON_ABILITY_HIT.char_4098_vvana.attack.4': 'todo: S3 hit from the second cast (mode 4: S3_2)',
  },
};

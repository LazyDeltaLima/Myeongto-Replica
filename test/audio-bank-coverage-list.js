// test/audio-bank-coverage-list.js — every official sound bank of a 선발 operator (zh_CN audio_data.json, a `battle.` bank
// whose name carries the operator's codename, or one of her summons' own codes, as a word) whose sound file the asset
// manifest (data/assets.json `audio`) never plays, per charId, with its status. test/audio-bank-coverage.test.js fails on a
// bank missing here and on an entry that no longer applies (its file is played now); the rules: docs/rules/audio.md
// 「선발 소리 뱅크 커버리지」. Where a bank's signal comes from: tools/local-extract/link_sheet.py.
//
// Status (one string, the reason after the colon):
//   'none: <evidence>' — the official client does not sound it in this mode (cite the prefab field / client method);
//   'todo: <where>' — the client sounds it and we do not yet (where it fires, as far as known).
// The first listing (2026-11-01) had 25; all its `todo` entries were wired the same day. The 白铁 / 遥 / 真言 ones
// (2026-11-03) too, the 贝洛内 / 维伊 / 怒潮凛冬 / Mon3tr ones the same day, and the 黍 / 老鲤 / 黑键 ones (2026-11-04) the day
// after they joined.

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
  // 제시카 더 리버레이티드 / 파죰카 / 에이야퍄들라 (2026-11-04): listed as they joined, not wired yet
  char_1034_jesca2: {
    'ON_PROJECTILE_STOP.projectile_chr_jesca2_s3_bomb': 'todo: S3 shell burst (kit explode, TAG_BOMB)',
    'ON_BUFF_START.jesca2_jckshd_turnaround': 'todo: she turns to her 机动盾牌 (jesca2_jckshd_dir_set)',
  },
  char_4055_bgsnow: {
    'ON_PROJECTILE_HIT.projectile_chr_bgsnow_subbow': 'todo: the typewriter\'s shot hits',
    'ON_ABILITY_START.sktok_bgsnow_subbow_2': 'todo: the typewriter\'s S2 copy cast',
    'ON_PROJECTILE_HIT.projectile_chr_bgsnow_subbow_s2': 'todo: the typewriter\'s S2 copy hits',
    'ON_ABILITY_START.sktok_bgsnow_subbow_3': 'todo: the typewriter\'s S3 copy cast',
    'ON_PROJECTILE_HIT.projectile_chr_bgsnow_subbow_s3': 'todo: the typewriter\'s S3 copy hits',
  },
  char_180_amgoat: {
    'ON_PROJECTILE_REACH.projectile_amgoat_s2_b': 'todo: S2 explosion (kit explosion)',
    'ON_ABILITY_START.char_180_amgoat_sanrio#2.attack': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_ABILITY_START.skchr_amgoat_2_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_s2_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_SKILL_START.skchr_amgoat_3_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_s3_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
  },
};

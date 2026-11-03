// test/audio-bank-coverage-list.js — every official sound bank of a 선발 operator (zh_CN audio_data.json, a `battle.` bank
// whose name carries the operator's codename, or one of her summons' own codes, as a word) whose sound file the asset
// manifest (data/assets.json `audio`) never plays, per charId, with its status. test/audio-bank-coverage.test.js fails on a
// bank missing here and on an entry that no longer applies (its file is played now); the rules: docs/rules/audio.md
// 「선발 소리 뱅크 커버리지」. Where a bank's signal comes from: tools/local-extract/link_sheet.py.
//
// Status (one string, the reason after the colon):
//   'none: <evidence>' — the official client does not sound it in this mode (cite the prefab field / client method);
//   'todo: <where>' — the client sounds it and we do not yet (where it fires, as far as known).
// The first listing (2026-11-01) had 25; all its `todo` entries were wired the same day.

export const UNSOUNDED = {
  char_4072_ironmn: {
    'ON_ABILITY_START.sktok_ironmn_pile3': 'todo: 铁钳号·原型机\'s skill (its projectile shot, kit pile3 skill)',
    'ON_PROJECTILE_REACH.projectile_chr_ironmn_pile3': 'todo: that projectile landing on its first enemy',
  },
  char_4202_haruka: {
    'ON_CUSTOM_TRIGGER.haruka_shield_start_ally': 'todo: T1 a bubble given (kit bubble)',
    'ON_CUSTOM_TRIGGER.haruka_shield_break_ally': 'todo: T1 a bubble breaking (kit burst)',
    'ON_BUFF_START.haruka_shield_start_enemy': 'todo: S3 an enemy set off a bubble and is levitated (kit levitate)',
    'ON_BUFF_TRIGGER.haruka_shield_start_enemy': 'todo: S3 its levitation damage tick',
    'ON_CUSTOM_TRIGGER.haruka_shield_break_enemy': 'todo: S3 the levitation ending',
    'ON_CUSTOM_TRIGGER.haruka_s2_damage': 'todo: S2 the extra arts damage around a healed unit (haruka_s_2 ON_AFTER_OUTPUT_HEAL PlayAudio)',
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
  char_4204_mantra: {
    // 真言 joined 2026-11-03; her custom-trigger sounds are not wired yet
    'ON_CUSTOM_TRIGGER.mantra_t_tile': 'todo: T2 全局洞悉 picking her 侵入点 (kit fx mantraGate)',
    'ON_CUSTOM_TRIGGER.mantra_s_1_proj_normal': 'todo: S1 hit on a target not in its 神经 burst (the attack\'s fail branch)',
    'ON_CUSTOM_TRIGGER.mantra_s_1_proj_element': 'todo: S1 hit on a target in its 神经 burst (IsTargetInEPBreakRecovery branch)',
    'ON_CUSTOM_TRIGGER.mantra_s_2_proj_normal': 'todo: S2 hit or jump on a target not in its 神经 burst (the attack\'s fail branch)',
    'ON_CUSTOM_TRIGGER.mantra_s_2_proj_element': 'todo: S2 hit or jump on a target in its 神经 burst (PlayProjectileAudio of projectile_chr_mantra_s2)',
    'ON_CUSTOM_TRIGGER.mantra_s_3_element': 'todo: S3 溢出麻痹 bounce (kit fx mantraArc)',
  },
};

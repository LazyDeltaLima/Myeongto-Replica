// test/audio-bank-coverage-list.js — every official sound bank of a 선발 operator (zh_CN audio_data.json, a `battle.` bank
// whose name carries the operator's codename, or one of her summons' own codes, as a word) whose sound file the asset
// manifest (data/assets.json `audio`) never plays, per charId, with its status. test/audio-bank-coverage.test.js fails on a
// bank missing here and on an entry that no longer applies (its file is played now); the rules: docs/rules/audio.md
// 「선발 소리 뱅크 커버리지」. Where a bank's signal comes from: tools/local-extract/link_sheet.py.
//
// Status (one string, the reason after the colon):
//   'none: <evidence>' — the official client does not sound it in this mode (cite the prefab field / client method);
//   'todo: <where>' — the client sounds it and we do not yet (where it fires, as far as known).
// The first listing (2026-11-01) had 25; all its `todo` entries were wired the same day. The 白铁 / 遥 / 真言 ones (2026-11-03) too, and the 贝洛内 / 维伊 / 怒潮凛冬 / Mon3tr ones the same day.

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
  // 黍 / 老鲤 / 森蚺 / 黑键 (2026-11-04): listed as they joined, not wired yet
  char_2025_shu: {
    'ON_BUFF_START.shu_s_3[enemy][mark]': 'todo: S3 离离枯荣 an enemy marked on a sown tile (the kit\'s mark buff)',
    'ON_BUFF_TRIGGER.shu_s_3[enemy][mark]': 'todo: S3 离离枯荣 the marked enemy put back (the kit\'s teleport)',
    'ON_ABILITY_ON.char_2025_shu.T.1': 'todo: T1 百谷长青 her heal sowing tiles',
  },
  char_322_lmlee: {
    'ON_PROJECTILE_REACH.projectile_chr_lmlee_s2': 'todo: S2 驱凶辟邪 the mark\'s burst',
    'ON_BUFF_START.lmlee_skill_3_knockback': 'todo: S3 贵客盈门 an enemy pushed by his attack',
    'ON_BUFF_START.lmlee_telent_2_start': 'todo: T2 有备无患 the guard taken (merchantPay)',
  },
  char_4046_ebnhlz: {
    'ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.ExChargeAttackDefault.0': 'todo: an energy stored (default mode)',
    'ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.1.ExChargeAttackS1.0': 'todo: an energy stored (S1 mode)',
    'ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.2.ExChargeAttackS3.0': 'todo: an energy stored (S3 mode)',
    'ON_ABILITY_ON.sktok_ebnhlz_token': 'todo: 旧日残影 activated (its 闪回)',
    'ON_BUFF_START.buff_ebnhlz[audio]': 'todo: the elite energy (T1) stored',
  },
};

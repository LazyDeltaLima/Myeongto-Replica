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
  char_4037_demetr: {
    // 贝洛内, 维伊, 怒潮凛冬 and Mon3tr joined 2026-11-03; their sounds are not wired yet (the next sound session)
    'ON_BUFF_START.demetr_s2_attack_spell_on_audio': 'todo: S2 军师的手段 as it starts',
    'ON_ABILITY_START.skchr_demetr_3.extra.1': 'todo: S3 清算 a 【移动】 (FlyToTarget)',
    'ON_ABILITY_START.skchr_demetr_3.extra.2': 'todo: S3 清算 the return (RespawnEnd)',
    'ON_ABILITY_START.char_4037_demetr.attack.3.1': 'todo: S3 attack (mode 3, Loop_A)',
    'ON_ABILITY_HIT.char_4037_demetr.attack.3.1': 'todo: S3 hit (mode 3, Loop_A)',
    'ON_ABILITY_START.char_4037_demetr.attack.3.2': 'todo: S3 attack (mode 3, Loop_B)',
    'ON_ABILITY_HIT.char_4037_demetr.attack.3.2': 'todo: S3 hit (mode 3, Loop_B)',
  },
  char_4226_veen: {
    'ON_CUSTOM_TRIGGER.veen_charge_normal': 'todo: trait an energy stored (kit storeEnergy)',
    'ON_CUSTOM_TRIGGER.veen_charge_merge': 'todo: T1 three energies merge into a 转置能量',
    'ON_PROJECTILE_HIT.projectile_chr_veen': 'todo: a stored energy landing (kit veenVolley)',
    'ON_PROJECTILE_HIT.projectile_chr_veen_merged': 'todo: a 转置能量 landing (kit veenVolley)',
    'ON_PROJECTILE_HIT.projectile_chr_veen_s2': 'todo: S2 a stored energy landing',
    'ON_PROJECTILE_HIT.projectile_chr_veen_s2_merged': 'todo: S2 a 转置能量 landing',
  },
  char_1051_headb2: {
    'ON_CUSTOM_TRIGGER.headb2_highland_aoe': 'todo: T1 汹涌怒火 a 高台 splash (kit highland round)',
  },
  char_4179_monstr: {
    'ON_BUFF_START.monstr_s_3[respawn]': 'todo: S3 策略：熔毁 the 【移动】 onto the 重构体 tile',
    'ON_ABILITY_START.char_4179_monstr.attack.4': 'todo: S3 attack (mode 4, S3_Reborn)',
    'ON_ABILITY_HIT.char_4179_monstr.attack.4': 'todo: S3 hit (mode 4)',
    'ON_ABILITY_START.char_4179_monstr.combat.4': 'todo: S3 attack on a blocked enemy (mode 4 Combat)',
    'ON_ABILITY_HIT.char_4179_monstr.combat.4': 'todo: S3 hit on a blocked enemy (mode 4 Combat)',
    'ON_ABILITY_START.skchr_monstr_3.extra.0': 'todo: S3 the return (Respawn)',
  },
};

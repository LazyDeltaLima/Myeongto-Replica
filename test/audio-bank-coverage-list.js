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
// after they joined; the 涤火杰西卡 / 鸿雪 and 棘刺 ones (2026-11-04) the same day; the 结城理 ones (2026-11-12) the day after.

export const UNSOUNDED = {
  // 焰影苇草 / 新约能天使 (2026-11-14, 规程 picks of 盟约's chess kits): banks their 盟约 chess does not sound either
  char_1020_reed2: {
    'ON_PROJECTILE_REACH.projectile_chr_reed2_aoe_effect': 'todo: not wired for her 盟约 chess either; where the client fires it not looked up yet',
  },
  char_1041_angel2: {
    'ON_ABILITY_START.char_1041_angel2.attack.5.Burst': 'todo: not wired for her 盟约 chess either; where the client fires it not looked up yet',
  },
  // 클로저: closur_ourbase_signal picks the 指挥中心's range by CheckSkillIndex and plays nothing — no buff template or prefab node of the EN or CN
  // client carries closur_ourbase_s1 … _s3 (_s2's and _s3's files are the range loops' own, so only _s1 shows here)
  char_4228_closur: {
    'ON_CUSTOM_TRIGGER.closur_ourbase_s1': 'none: no client node carries the signal',
  },
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
  // 鸿雪's 打字机: its skill's START signal is its skill id (BasicSkill._GenerateSignalId: sktok_bgsnow_<n>, no prefab key
  // override in character_table) — these banks name the token instead and nothing sounds them
  char_4055_bgsnow: {
    'ON_ABILITY_START.sktok_bgsnow_subbow_2': 'none: the typewriter\'s S2 copy signals sktok_bgsnow_2 (its skill id), which has no bank',
    'ON_ABILITY_START.sktok_bgsnow_subbow_3': 'none: the typewriter\'s S3 copy signals sktok_bgsnow_3 (its skill id), which has no bank',
  },
  char_180_amgoat: {
    'ON_ABILITY_START.char_180_amgoat_sanrio#2.attack': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_ABILITY_START.skchr_amgoat_2_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_s2_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_SKILL_START.skchr_amgoat_3_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
    'ON_PROJECTILE_REACH.projectile_amgoat_s3_sanrio#2': 'none: her \'sanrio#2\' outfit\'s bank — this mode draws the default model',
  },
  char_400_weedy: {
    // "cannon" is also her 工程蓄水炮's code (token_10009_weedy_cannon, whose skill is sktok_weedy_token)
    'ON_ABILITY_ON.sktok_cannon_1': 'none: not hers — 脉冲防御模组 (trap_028_cannon, a stage device)\'s skill',
    'ON_ABILITY_ON.sktok_cannon_2': 'none: not hers — 脉冲防御模组 (trap_028_cannon, a stage device)\'s skill',
    'ON_OPERA_TRIGGER.cannon_hit': 'none: not hers — a stage script\'s (ON_OPERA_TRIGGER) bank',
  },
  char_4246_dminon: {
    // 国度 (2026-11-08): the kit's own damage — 此身为界's flight, 实质坍缩's tick, S3's spread — carries no sound moment yet
    'ON_PROJECTILE_BORN.projectile_chr_dminon_dead': 'todo: 此身为界 after a knock-out (op-dminon.js boundary, KO_DELAY later)',
    'ON_PROJECTILE_REACH.projectile_chr_dminon_dead': 'todo: 此身为界 after a knock-out, its landing (op-dminon.js boundary)',
    'ON_PROJECTILE_REACH.projectile_chr_dminon_withdraw': 'todo: 此身为界 on a retreat, its landing (op-dminon.js boundary)',
    'ON_CUSTOM_TRIGGER.dminon_talent_hit': 'todo: 实质坍缩\'s 1 s tick (op-dminon.js COLLAPSE)',
    'ON_CUSTOM_TRIGGER.dminon_s3_expand': 'todo: S3\'s spread (op-dminon.js spread)',
  },
  char_4230_mcnist: {
    // 机械师 (a 规程 chess, a 盟约 pick since 2026-11-12): her code is also the event enemy enemy_8010_mcnist's (the test
    // leaves out the banks that name the enemy; these four name only the code)
    'ON_CUSTOM_TRIGGER.mcnist_shield': "none: not hers — the enemy's 屏障 (buff enemy_mcnist_shield / _advance PlayAudio)",
    'ON_CUSTOM_TRIGGER.mcnist_shield_break': "none: not hers — the enemy's 屏障 (buff enemy_mcnist_shield / _advance PlayAudio)",
    'ON_CUSTOM_TRIGGER.mcnist_shield_advance': "none: not hers — the enemy's 屏障 (buff enemy_mcnist_shield / _advance PlayAudio)",
    'ON_CUSTOM_TRIGGER.mcnist_shield_break_advance': "none: not hers — the enemy's 屏障 (buff enemy_mcnist_shield / _advance PlayAudio)",
  },
};

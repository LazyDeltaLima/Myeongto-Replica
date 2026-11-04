// test/audio-skill-silence-list.js — the cases of test/audio-skill-silence.test.js whose hits sound no impact of their skill,
// with the reason; the rules: docs/rules/audio.md 「스킬 타격음 전수」. The test fails on a case missing here and on an entry
// that no longer applies. Each string: what the run shows, then the status and its reason:
//   'silent' — hits land during the skill and no impact sounds at all;
//   'other'  — impacts sound, none of them from the skill's own banks;
//   'none: <evidence>' — the official game has no impact for it, or the run does not reach it;
//   'todo: <where>' — an official bank exists and this moment does not reach it (not heard against the official game).
// A new operator's silent skill does not belong here until its banks are read: `node tools/local-extract/link_sheet.py`.

const NO_BANK = 'no impact bank carries its code for this mode (audio_data.json; modes[i].noHit)';

export const SILENT_SKILLS = {
  chess_char_2_01_b: `silent none: 送葬人 S2 — ${NO_BANK}`,
  chess_char_3_01_b: `silent none: 能天使 S3 — ${NO_BANK}`,
  chess_char_4_02_b: `silent none: 莫斯提马 S3 — ${NO_BANK}; ON_ABILITY_HIT.skchr_mostma_2 is S2's`,
  chess_char_5_01_b: `silent none: 圣约送葬人 S2 — ${NO_BANK}`,
  chess_char_5_18_b: `silent none: 百炼嘉维尔 S2 — ${NO_BANK}`,
  chess_char_6_04_b: 'silent none: 浊心斯卡蒂 S3 — no impact bank carries her code; the periodic damage sounds its p_skill_tidesurging',
  'char_188_helage S3': 'silent none: 赫拉格 S3 — its strike is ON attack.2 p_skill_huirenzhan, a skill-group file, and it plays',
  'char_4072_ironmn S2': `silent none: 白铁 S2 — ${NO_BANK}`,
  'char_4182_oblvns S2': 'other none: 丰川祥子 S2 — its one hit in the window is the _r shot; the _p bank is the slow shot, not reached here',
  'char_4037_demetr S3': 'other none: 贝洛内 S3 — the attacks run its teleport sub-mode\'s s1 / s2 banks; the base mode\'s _n is not reached here',

  chess_char_3_13_b: 'silent todo: 至简 S2 — ON_PROJECTILE_HIT.projectile_chr_malist_s2_2 (p_imp_staffcannon_h)',
  chess_char_5_15_b: 'silent todo: 引星棘刺 S2 — ON_PROJECTILE_REACH.projectile_chr_thorn2_s2 (p_imp_trshldacy_h) for the zone\'s first hits',
  'char_1035_wisdel S1': 'silent todo: 维什戴尔 S1 — ON_PROJECTILE_HIT.projectile_chr_wisdel_s1 (p_imp_dkmrcaygn_d)',
  'char_2025_shu S3': 'silent todo: 黍 S3 — its attack group falls to child 2 (no HIT bank); ON_ABILITY_HIT attack.2.1 is child 1 (signal Attack), which the sim does not name',
  chess_char_1_18_b: 'other todo: 宴 S2 — its attacks sound the Default bank, not ON_ABILITY_HIT attack.2 (p_imp_darksword_n)',
  chess_char_5_05_b: 'other todo: 乌尔比安 S3 — ON_PROJECTILE_REACH.projectile_chr_ulpia_s3 (p_imp_wtrbatnchr_s) is not reached; attack.3 HIT plays',
  'char_1015_aglna2 S1': 'other todo: 予愿安洁莉娜 S1 — its attacks sound the Default banks, not the S1 mode\'s (p_imp_arstrnstf_d)',
};

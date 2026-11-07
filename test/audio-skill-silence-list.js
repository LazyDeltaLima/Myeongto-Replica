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
  'char_4065_judge S2': 'other none: 斥罪 S2 — it makes no attack, so its mode\'s p_imp_gavel_n is not cast; each pulse sounds judge_s_2[audio] (p_imp_gavel_h)',
  'char_4037_demetr S3': 'other none: 贝洛内 S3 — the attacks run its teleport sub-mode\'s s1 / s2 banks; the base mode\'s _n is not reached here',
};

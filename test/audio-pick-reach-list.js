// test/audio-pick-reach-list.js — the 선발 operators' official banks (the set of test/audio-bank-coverage.test.js) whose file
// the asset manifest holds only through another unit's or another moment's entry, and that her own sweep runs never sound,
// per charId, with the status. test/audio-pick-reach.test.js fails on such a bank missing here and on an entry that no longer
// applies (the bank is sounded now, or one of her own entries names its file); the rules: docs/rules/audio.md 「선발 소리
// 뱅크 커버리지」 「도달 시험」. Where a bank's signal comes from: tools/local-extract/link_sheet.py.
//
// Status (one string, the reason after the colon), as in test/audio-bank-coverage-list.js:
//   'none: <evidence>' — the official client does not sound it in this mode, or it is not hers;
//   'todo: <where>' — the client sounds it at a moment of hers and nothing of hers plays it yet.
// The first listing (2026-11-17) had 21: the 16 manual-stop banks below and five (나이팅게일 S3's ability START was sounded
// the same day: skill-mode-sfx.mjs castCues).

/**
 * Every ON_SKILL_SPECIAL_POINT bank: the client sounds it when a skill is stopped by hand
 * (CastSkillWithLimitTimes.DiscardRemainingCountInternal, CastSkillWithSuspendable.TriggerSpecialAudioSignal,
 * ToggleSkillWithEndAnimation.PlayBeginEffectAndAudio), and the automatic battle has no such stop (docs/rules/audio.md
 * 「공격 소리 신호」 「안 한 것」). Its file b_char_boostclose is in the manifest as other skills' end sound.
 */
export const MANUAL_STOP = /^ON_SKILL_SPECIAL_POINT\./;

export const UNREACHED = {
  char_179_cgbird: {
    // "bird" is also her 幻影's code (token_<n>_cgbird_bird); the file is 凛御银灰's kit key svash2:s3hit
    'ON_PROJECTILE_HIT.projectile_chr_svash2_s3_bird': 'none: not hers — 凛御银灰 S3\'s bird (buff svash2_s_3[bird_on_target])',
    'ON_PROJECTILE_HIT.projectile_chr_svash2_s3_bird_self': 'none: not hers — 凛御银灰 S3\'s bird (buff svash2_s_3[bird_on_self])',
  },
  char_180_amgoat: {
    'ON_PROJECTILE_REACH.projectile_amgoat_s2_b': 'none: no client node carries the key — S2\'s projectile is projectile_amgoat_s2 (skills:skchr_amgoat_2 _projectileKey, its HIT bank)',
  },
  char_113_cqbw: {
    'ON_PROJECTILE_REACH.projectile_cqbw': 'none: no client node carries the key — her attack\'s projectile is projectile_chr_cqbw (charpack Modes/Default/Body/Attack _projectileKey)',
  },
};

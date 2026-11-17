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

/**
 * Banks one of her own entries plays (so the test above passes them) that her runs still never sound, per charId, with the
 * reason the runs cannot reach that moment — what the runs' board (test/audio-pick-reach.test.js onBoard: her hand summons
 * placed, three ground dummies that never move nor hit, two flying ones, allies wounded now and then) lacks. A reason that
 * starts with 'gap:' is a moment the runs do reach where our sounds play another file (docs/rules/audio.md 「선발 소리 뱅크
 * 커버리지」 「도달 시험」 says what is open). Listed by the pick (2026-11-17: 望 and 机械师, whose 22 and 15 came from her hand
 * summons missing on the board; then 凯尔希·思衡托, 遥, 结城理, Mon3tr and 涤火杰西卡); the test prints the picks still without
 * reasons, and an entry whose bank her runs reach now fails.
 */
/** A heal's landing (the 'heal' event) sounds the common sfx.battle.heal (ON_MODIFIER_HEAL) only, never her shot's own bank. */
const HEAL_LANDING = 'gap: it lands on an ally as a heal, and a heal sounds only the common ON_MODIFIER_HEAL (audio.js \'heal\'), not the heal projectile\'s own bank';
const NO_HIT = 'no dummy deals damage';

export const OUT_OF_REACH = {
  char_4230_mcnist: {
    'ON_CUSTOM_TRIGGER.mcnist_s_2_shield': 'the break of an S2 屏障 (audio.js shieldBreak → mcnist:s2shield), and no dummy deals damage',
  },
  char_1052_kalts2: {
    // S2's HealAlly child (op-kalts2.js s2CanAttack): with no enemy to select in her y-11
    'ON_ABILITY_ON.char_1052_kalts2.attack.4.2': 'S2 shoots an ally only with no enemy in her range, and the dummies stand until her 10 S2 shots are spent',
    'ON_PROJECTILE_REACH.projectile_chr_kalts2_s2_heal': `S2's shot at an ally (no enemy in her range while S2 runs) — and ${HEAL_LANDING}`,
    'ON_PROJECTILE_STOP.projectile_chr_kalts2_s2_sub_heal': `S2's shot at an ally (no enemy in her range while S2 runs) — and ${HEAL_LANDING}`,
  },
  char_4202_haruka: {
    // T1: a bubble breaks 0.5 s after an enemy's damage lowered its holder's HP; S3 levitates that enemy
    'ON_CUSTOM_TRIGGER.haruka_shield_break_ally': `a bubble breaks on an enemy's damage to its holder (op-haruka.js T1), and ${NO_HIT}`,
    'ON_BUFF_START.haruka_shield_start_enemy': `S3 levitates the enemy whose damage set a bubble off, and ${NO_HIT}`,
    'ON_BUFF_TRIGGER.haruka_shield_start_enemy': `the damage ticks on that levitated enemy (S3), and ${NO_HIT}`,
    // the trait: while a skill runs every attack heals
    'ON_PROJECTILE_HIT.projectile_chr_haruka_s1': `S1's attacks heal (the trait) — ${HEAL_LANDING}`,
    'ON_PROJECTILE_HIT.projectile_chr_haruka_s3': `S3's attacks heal (the trait) — ${HEAL_LANDING}`,
  },
  char_4217_makoto: {
    'ON_CUSTOM_TRIGGER.makoto_skill_02_execute': 'S2 塔纳托斯 knocks out a feared enemy under kill_atk_scale × ATK HP, and the dummies keep 1e9 HP',
    // the switch to 俄耳甫斯: a lethal hit on his S3 <替身>
    'ON_CUSTOM_TRIGGER.makoto_skill_03_2_range_appear': `S3 switches to 俄耳甫斯 on a lethal hit, and ${NO_HIT}`,
    'ON_CUSTOM_TRIGGER.makoto_skill_03_heal_hit': `S3 俄耳甫斯's heals, after the switch on a lethal hit, and ${NO_HIT}`,
  },
  char_4179_monstr: {
    'ON_PROJECTILE_HIT.projectile_chr_monstr': `her attack heals (链愈师) — ${HEAL_LANDING}`,
    'ON_PROJECTILE_HIT.projectile_chr_monstr_s1': `S1's heal — ${HEAL_LANDING}`,
    'ON_PROJECTILE_HIT.projectile_chr_monstr_s2': `S2's heal — ${HEAL_LANDING}`,
  },
  char_1034_jesca2: {
    // a Spine event value of her model's clips (render/spine.js → AudioManager.spineEvent)
    'ON_SPINE_EVENT_TRIGGER.char_1034_jesca2.skill_1': 'a Spine event of her model, and the runs draw none; the stand-in for a model without events (audio.js _spineStrike) takes only Attack_<n> / Skill_<k>_<n> values',
    'ON_SPINE_EVENT_TRIGGER.char_1034_jesca2.skill_3': 'a Spine event of her model, and the runs draw none; the stand-in for a model without events (audio.js _spineStrike) takes only Attack_<n> / Skill_<k>_<n> values',
  },
};

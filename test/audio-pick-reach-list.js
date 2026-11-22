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
 * placed, three ground dummies that never move nor hit, two flying ones, allies wounded now and then, her DP kept up) lacks.
 * A reason that starts with 'gap:' is a moment the runs do reach where our sounds play another file (docs/rules/audio.md
 * 「선발 소리 뱅크 커버리지」 「도달 시험」 says what is open). Listed by the pick (2026-11-17: 望 and 机械师, whose 22 and 15 came
 * from her hand summons missing on the board; then 凯尔希·思衡托, 遥, 结城理, Mon3tr and 涤火杰西卡; then the other 20); a bank
 * without a reason fails, and so does an entry whose bank her runs reach now.
 */
/** A heal's landing (the 'heal' event) sounds the common sfx.battle.heal (ON_MODIFIER_HEAL) only, never her shot's own bank. */
const HEAL_LANDING = 'gap: it lands on an ally as a heal, and a heal sounds only the common ON_MODIFIER_HEAL (audio.js \'heal\'), not the heal projectile\'s own bank';
const NO_HIT = 'no dummy deals damage';
const NO_MOVE = 'the dummies never move';
/** The runs field her and her summons only. */
const ALONE = 'the runs field no other operator';
const DUMMY_HP = 'the dummies keep 1e9 HP';
/** Her model's clip events (render/spine.js → AudioManager.spineEvent); the runs draw no model. */
const SPINE = 'a Spine event of her model, and the runs draw none; the stand-in for a model without events (audio.js _spineStrike) takes only Attack_<n> / Skill_<k>_<n> values';
/**
 * A cast skill whose skill ability's ON / HIT her manifest entry keeps as the attack cues of the skill's mode (modes[i]), with
 * no castCues entry: the cast ends before any attack of that mode, and only its start sounds (modes[i].deferStart).
 */
const CAST_IN_MODE = (what) => `gap: ${what} — her entry keeps it among the attack cues of the skill's mode (modes[i]), no castCues, and the cast ends before any attack: only its start sounds`;

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
    'ON_SPINE_EVENT_TRIGGER.char_1034_jesca2.skill_1': SPINE,
    'ON_SPINE_EVENT_TRIGGER.char_1034_jesca2.skill_3': SPINE,
  },
  char_4182_oblvns: {
    // T1 持续攻击: with no enemy in her range she plays a note at the tile she faces (op-oblvns.js; 'atk' with no target)
    'ON_PROJECTILE_BORN.projectile_chr_oblvns_talent': 'gap: her 持续攻击 note (no enemy in range, no skill — reached after the dummies fall) sounds her RangedMulti attack cue p_atk_mjckyrdnt_h, not this birth (the attack group\'s RangedAlways child, test/audio-cond-group-list.js \'none\')',
    'ON_PROJECTILE_BORN.projectile_chr_oblvns_s2_slow_t': 'S2\'s organ note with no enemy in her range (持续攻击 while S2 runs), and the dummies stand until S2 ends — when they fall, as the talent note above',
    'ON_PROJECTILE_BORN.projectile_chr_oblvns_s3_mag': 'gap: S3\'s two organ notes of each attack (fx oblvnsNote born, m \'s3m\') sound nothing as they leave; only her attack\'s _s3_phy birth (mode 2 cue) sounds',
  },
  char_1042_phatm2: {
    'ON_ABILITY_START.sktok_phatm2_encdool_2.extra.0': `the Boom of 本能的召唤: an enemy it lures reaches it (op-phatm2.js \`callBoom\`), and ${NO_MOVE}`,
  },
  char_4244_tocka: {
    'ON_ABILITY_ON.skchr_tocka_1': CAST_IN_MODE('S1\'s skill ability ON (modes[0])'),
    'ON_ABILITY_HIT.skchr_tocka_1': CAST_IN_MODE('S1\'s skill ability HIT on the ally it marks (modes[0], kd[0])'),
    'ON_BUFF_SHOW_EFFECT.tocka_s1_shield_start_audio': `S1's 屏障 starts on the first damage its ally takes, and ${NO_HIT}`,
    'ON_ABILITY_ON.skchr_tocka_2': CAST_IN_MODE('S2\'s skill ability ON (modes[1])'),
    'ON_PROJECTILE_HIT.projectile_chr_tocka_s2': `S2's shot flies to the latest deployed other operator (none: she takes it herself, no shot), and ${ALONE}`,
    'ON_BUFF_START.tocka_s3_trigger_start_audio': `S3 puts its effect on an operator of her range but herself, and ${ALONE}`,
    'ON_BUFF_SHOW_EFFECT.tocka_s3_bonus_start_audio': `S3's effect goes off as its holder (not she) starts a skill, and ${ALONE}`,
  },
  char_4204_mantra: {
    'ON_CUSTOM_TRIGGER.mantra_s_1_proj_element': 'S1\'s rider on an enemy in its 神经 burst, and the runs\' three S1 shots (15 % of each as 神经 损伤) fill no dummy\'s gauge',
    'ON_CUSTOM_TRIGGER.mantra_s_3_element': `S3's 溢出麻痹 needs 麻痹 above the cap 2: her cast gives 2, the next grant comes as another operator of her range starts a skill, and ${ALONE}`,
  },
  char_4072_ironmn: {
    // 铁钳号·原型机 (S3's device): its skill charges only from the attacks that select it, after every real enemy (嘲讽 −2)
    'ON_ABILITY_START.sktok_ironmn_pile3': '铁钳号·原型机 gains SP only from attacks at it, and an attack takes it only with no real enemy (嘲讽 −2): the dummies stand till the kill phase, and then its skill has no enemy',
    'ON_PROJECTILE_REACH.projectile_chr_ironmn_pile3': '铁钳号·原型机\'s shot — its skill is never cast (the START above)',
  },
  char_179_cgbird: {
    'ON_ABILITY_HIT.skchr_cgbird_2': 'gap: S2\'s heal gives each ally it heals a 法术护盾 (its skill ability HIT, b_char_addshield) — a heal sounds only the common ON_MODIFIER_HEAL (audio.js \'heal\')',
  },
  char_4133_logos: {
    'ON_CUSTOM_TRIGGER.logos_s1_kill': `S1 executes an enemy of his range under kill_atk_scale × ATK HP, and ${DUMMY_HP}`,
    'ON_PROJECTILE_BORN.projectile_chr_logos_s1_2': `the shot leaving an enemy S1 executed, and ${DUMMY_HP}`,
  },
  char_4098_vvana: {
    'ON_SPINE_EVENT_TRIGGER.char_4098_vvana.Audio_Attack_S1': SPINE,
    // vvana_s_3[check]: from the second S3 of a deployment its attacks are mode 4 S3_2 (fx vvanaS3Later)
    'ON_ABILITY_START.char_4098_vvana.attack.4': 'S3\'s second cast of a deployment (mode 4 S3_2), and the runs cast each skill once',
    'ON_ABILITY_HIT.char_4098_vvana.attack.4': 'S3\'s second cast of a deployment (mode 4 S3_2), and the runs cast each skill once',
  },
  char_4037_demetr: {
    'ON_ABILITY_START.skchr_demetr_3.extra.1': 'S3\'s next 【移动】 (FlyToTargetSecond): 1 s without his damage or the elite he attacked last falling — he hits a dummy all along, and the dummies are no elites',
  },
  char_4226_veen: {
    // the trait: she stores an energy only with no valid target (every enemy of her range under her 战争技艺), 3 make one 转置能量
    'ON_PROJECTILE_HIT.projectile_chr_veen_merged': 'a 转置能量 merges from 3 stored energies, and she stores only when every enemy of her range carries her 战争技艺: five dummies keep one unmarked (one store, at her deployment)',
    'ON_PROJECTILE_HIT.projectile_chr_veen_s2_merged': 'S2\'s 转置能量 — no 转置能量 merges (the line above)',
  },
  char_1051_headb2: {
    'ON_CUSTOM_TRIGGER.headb2_highland_aoe': 'the 高台 splash needs a 高台 within 1.0 of her target, and the dummy she fights (10,6) has none around it (the field\'s 高台 rows end at row 8)',
    'ON_SPINE_EVENT_TRIGGER.char_1051_headb2.s3_attack_audio_1': SPINE,
    'ON_SPINE_EVENT_TRIGGER.char_1051_headb2.s3_attack_audio_2': SPINE,
    'ON_SPINE_EVENT_TRIGGER.char_1051_headb2.s3_attack_audio_3': SPINE,
    'ON_SPINE_EVENT_TRIGGER.char_1051_headb2.s3_attack_audio_4': SPINE,
    'ON_SPINE_EVENT_TRIGGER.char_1051_headb2.s3_attack_audio_5': SPINE,
  },
  char_2025_shu: {
    // the trait: her normal attack is a melee strike on her own tile (range 0-1)
    'ON_ABILITY_START.char_2025_shu.attack': 'her normal attack strikes only an enemy on her own tile (one she blocks), and the dummies stand beside her',
    'ON_ABILITY_HIT.char_2025_shu.attack': 'her normal attack strikes only an enemy on her own tile (one she blocks), and the dummies stand beside her',
    'ON_ABILITY_ON.char_2025_shu.attack.2.2': 'S3\'s Heal child: an attack with no target heals (S3 备注), and the dummies stand in her S3 range until it ends',
    'ON_BUFF_START.shu_s_3[enemy][mark]': `S3's 【播种标记】 marks a ground enemy entering a sown tile, and ${NO_MOVE}`,
    'ON_BUFF_TRIGGER.shu_s_3[enemy][mark]': `S3 puts a marked enemy back once it walked far from its tile, and ${NO_MOVE}`,
  },
  char_416_zumama: {
    // the trait: no SP while she blocks nobody, so the runs never cast her skills
    'ON_SKILL_START.skchr_zumama_2': 'she gains no SP while she blocks nobody (her trait), and the dummies stand beside her unblocked: no skill of hers is cast',
    'ON_ABILITY_HIT.char_416_zumama.attack.1': 'S2\'s attacks — no skill of hers is cast (she blocks nobody)',
    'ON_SKILL_START.skchr_zumama_3': 'she gains no SP while she blocks nobody (her trait), and the dummies stand beside her unblocked: no skill of hers is cast',
    'ON_ABILITY_HIT.char_416_zumama.attack.2': 'S3\'s attacks — no skill of hers is cast (she blocks nobody)',
    'ON_ABILITY_START.skchr_zumama_3': 'S3\'s cast — no skill of hers is cast (she blocks nobody)',
    'ON_SKILL_FINISH.skchr_zumama_3': 'S3\'s end — no skill of hers is cast (she blocks nobody)',
    'ON_SPINE_EVENT_TRIGGER.char_416_zumama.skill': SPINE,
  },
  char_4046_ebnhlz: {
    'ON_ABILITY_ON.char_4046_ebnhlz.attack.2': 'S3 attacks only an elite or leader enemy, and the dummies are of the normal level',
    'ON_PROJECTILE_HIT.projectile_chr_ebnhlz_s3_elite': 'S3 attacks only an elite or leader enemy, and the dummies are of the normal level',
  },
  char_293_thorns: {
    // the 领主 trait: his melee ability (combat) strikes an enemy he blocks
    'ON_ABILITY_ON.char_293_thorns.combat': 'his melee strike (combat) is at an enemy he blocks, and the dummies never walk into his block',
    'ON_ABILITY_HIT.char_293_thorns.combat': 'his melee strike (combat) is at an enemy he blocks, and the dummies never walk into his block',
    'ON_BUFF_START.thorns_s_2[audio]': `S2's Thorn cast is set off by 普通伤害 an enemy deals him, and ${NO_HIT}`,
    'ON_ABILITY_ON.char_293_thorns.combat.2': 'S3\'s melee strike (combat) is at an enemy he blocks, and the dummies never walk into his block',
    'ON_ABILITY_HIT.char_293_thorns.combat.2': 'S3\'s melee strike (combat) is at an enemy he blocks, and the dummies never walk into his block',
  },
  char_4009_irene: {
    'ON_SPINE_EVENT_TRIGGER.char_4009_irene.Skill_3_Attack': SPINE,
  },
  char_400_weedy: {
    'ON_ABILITY_ON.skchr_weedy_3': CAST_IN_MODE('S3\'s skill ability ON (modes[2])'),
  },
  char_113_cqbw: {
    // the key of the enemy W's grenade (projectile_enemy_cqbw_s1 has the same file), as projectile_cqbw in UNREACHED
    'ON_PROJECTILE_REACH.projectile_cqbw_s1': 'none: no client node carries the key — S1\'s grenade is projectile_chr_cqbw_s1 (skills:skchr_cqbw_1 _projectileKey, its REACH sounds)',
    'ON_ABILITY_ON.skchr_cqbw_1': CAST_IN_MODE('S1\'s skill ability ON (modes[0])'),
    'ON_ABILITY_ON.sktok_cqbw_token': 'gap: 此面向敌 goes off (kitHit cqbw:mineArm, then cqbw:mineHit 1.5 s later) and only its leaving (b_char_tokendead) sounds, not its ability ON',
    'ON_PROJECTILE_REACH.projectile_chr_cqbw_s3': 'gap: S3\'s D12 bombs stick (kitHit cqbw:bomb) as S3 ends, and nothing sounds — kd[2] holds this REACH and plays only on damage while the skill runs',
    'ON_PROJECTILE_HIT.projectile_chr_cqbw_s3': 'gap: the D12 bombs go off 3 s after S3 ended (kitHit cqbw:bombHit), and nothing sounds — kd[2] plays only while the skill runs',
  },
  char_1031_slent2: {
    'ON_BUFF_START.slent2_shallow_grave_audio': `S3 keeps an operator of her range alive on lethal damage, and ${NO_HIT}`,
  },
  char_1020_reed2: {
    'ON_PROJECTILE_REACH.projectile_chr_reed2_aoe_effect': 'S3\'s spread goes off when an enemy holding its mark falls while S3 runs, and the runs kill the dummies after the skill\'s end',
  },
};

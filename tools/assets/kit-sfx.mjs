// Skill hit sounds of the locally wired kits (local patch, docs/LOCAL-PATCH.md 「공식 전투 이펙트」): their skill damage
// comes from kit code (stones, 剑气, notes, the shades, the drones), not from an attack event, so the per-unit `hit`
// sound never played for it. The official client plays these banks on those hits (EN client audio_data.json, every
// bank below exists with its own file). The client maps the kits' battle.fx events to these keys
// (public/js/audio.js kitHitKey) and plays `sfx.kit[key]`, limited per key.

export const KIT_HIT_BANKS = Object.freeze({
  // 望: a stone going off — S1 取势 (wang_stone1_t damage), S2 连星 line blast, S3-equipped diamond; the first link
  'wang:1': 'battle.ON_CUSTOM_TRIGGER.wang_stone1_t[damage_audio]',
  'wang:2': 'battle.ON_ABILITY_HIT.sktok_wang_2.extra.0',
  'wang:3': 'battle.ON_ABILITY_HIT.sktok_wang_3',
  'wang:link': 'battle.ON_CUSTOM_TRIGGER.wang_stone1_line_up',
  // local patch (maintainer report 2026-10-07): the pop itself (public/js/audio.js kitStartKey) — a placed stone's token
  // ability start; a 跟子's (projectile) S2 behaviour trigger; a 跟子 landing (its projectile birth, #1). 'wang:1' (the
  // impact) now sounds on every tick of S1's DoT (wang_stone1_t[damage_audio], triggerInterval 1 — kits/diy.js)
  'wang:1s': 'battle.ON_ABILITY_START.sktok_wang_1',
  'wang:2s': 'battle.ON_ABILITY_START.sktok_wang_2.extra.0',
  'wang:2fs': 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_wang_stone2',
  'wang:3s': 'battle.ON_ABILITY_START.sktok_wang_3',
  'wang:thrown': 'battle.ON_PROJECTILE_BORN.projectile_chr_wang_stone1',
  // 赤刃明霄陈: S2 slashes, S3 剑气 (projectile_chr_chen3_s3)
  'chen3:s2': 'battle.ON_ABILITY_HIT.skchr_chen3_2',
  'chen3:s3': 'battle.ON_PROJECTILE_HIT.projectile_chr_chen3_s3',
  // 维什戴尔: S2 aftershock shells, the 残影 bomb, the shade's (wisdel_wward) shot
  'wisdel:s2': 'battle.ON_PROJECTILE_HIT.projectile_chr_wisdel_s2',
  'wisdel:bomb': 'battle.ON_PROJECTILE_HIT.projectile_chr_wisdel_s1_shock',
  'wisdel:token': 'battle.ON_PROJECTILE_HIT.projectile_chr_wisdel_token',
  // 丰川祥子: a note reaching its target, by note kind (render/fxgame.js names them alike)
  'oblvns:base': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns',
  'oblvns:talent': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns_talent',
  'oblvns:s1': 'battle.ON_CUSTOM_TRIGGER.projectile_chr_oblvns_s1_hit',
  'oblvns:piano': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns_s2',
  'oblvns:organ': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns_s2_slow',
  'oblvns:s3': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns_s3_phy',
  'oblvns:s3m': 'battle.ON_PROJECTILE_HIT.projectile_chr_oblvns_s3_mag',
  // 荒芜拉普兰德: a drone's strike (S3 wolves: funnel_s3; S1 / S2 drones: funnel_s1_1 / funnel_s2)
  'whitw2:s1': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel_s1_1',
  'whitw2:s2': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel_s2',
  'whitw2:s3': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel_s3',
  // 蕾缪安 S3 (maintainer report 2026-10-07): the lock mark (its buff's show effect), the bombardment's start (S3_End mode
  // ability, once: the first shell), each shell landing (projectile_chr_lemuen_s3_attack reached)
  'lemuen:mark': 'battle.ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim',
  'lemuen:s3end': 'battle.ON_ABILITY_START.char_4193_lemuen.attack.4',
  'lemuen:shell': 'battle.ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack',
  // 归溟幽灵鲨 (maintainer report 2026-10-08 「S2 종료 후 대역 전환」): the switch to her <替身> (sim fx 'substitute',
  // professions.js installDollkeeper) — its buff start p_skill_sharpstandborn and the stand-in's show effect
  // p_skill_sharpstandspell (11.6 s, cut 0.8 s by ghost2_stand_effect_end: public/js/audio.js on her switch back / death);
  // back to the 本体 (fx 'swap') ghost2_switch2normal p_skill_sharpborn
  'ghost2:stand': 'battle.ON_BUFF_START.ghost2_switch2stand',
  'ghost2:standin': 'battle.ON_BUFF_SHOW_EFFECT.ghost2_standin[switch]',
  'ghost2:normal': 'battle.ON_BUFF_START.ghost2_switch2normal',
  // 2026-10-10, docs/rules/audio.md 「버프·커스텀 트리거 소리」 (EN client buff templates; public/js/audio.js signalKeys):
  // 혼 S2 / S3 — every strike (ON_ABILITY_SPELL_ON of horn_s_<n>[signal_melee|signal_ranged]) creates an IMMEDIATELY buff
  // whose audioSignal is `horn_s_<n>[overload|normal][melee|ranged].attack` (overload = horn_s_<n>[overload_mark] on her);
  // the overload's own start buff
  ...Object.fromEntries([2, 3].flatMap((n) => ['normal', 'overload'].flatMap((o) => ['melee', 'ranged'].map((r) =>
    [`horn:${n}:${o}:${r}`, `battle.ON_BUFF_START.horn_s_${n}[${o}][${r}].attack`])))),
  'horn:2:ovs': 'battle.ON_BUFF_START.horn_s_2[overload_start]',
  'horn:3:ovs': 'battle.ON_BUFF_START.horn_s_3[overload_start]',
  // 락락 S2 — the overload's start / finish (rockr_s_2[overload] ON_BUFF_FINISH), her own attack's start and hit, normal or
  // overloaded (rockr_s_2[attack_start_audio] / [attack_hit_audio] → rockr_s2_common_attack_*[_overload])
  'rockr:ovs': 'battle.ON_BUFF_START.rockr_overload_start',
  'rockr:ovf': 'battle.ON_BUFF_START.rockr_overload_finish',
  'rockr:atk': 'battle.ON_BUFF_START.rockr_s2_common_attack_start',
  'rockr:atko': 'battle.ON_BUFF_START.rockr_s2_common_attack_start_overload',
  'rockr:hit': 'battle.ON_BUFF_START.rockr_s2_common_attack_hit',
  'rockr:hito': 'battle.ON_BUFF_START.rockr_s2_common_attack_hit_overload',
  // 티티 S3 — an enemy waking up (titi_s_3[dmg_ticker] → PlayAudio titi_s_3[awake] on it)
  'titi:awake': 'battle.ON_CUSTOM_TRIGGER.titi_s_3[awake]',
  // 圣聆初雪 T1 — a snow tile's effect created anew (SnowAccumulation `_playAudioWhenEffectChanged` → its `_audioSignal` at her)
  'sbell2:snow': 'battle.ON_CUSTOM_TRIGGER.sbell2_snow_refresh_audio',
  // 아스카론 S2 — an enemy carrying ascln_s_2[enemy] killed (ON_OWNER_KILLED → PlayAudio ASCLN_S_2_BOMB at her)
  'ascln:s2bomb': 'battle.ON_CUSTOM_TRIGGER.ASCLN_S_2_BOMB',
  // 2026-10-11, docs/rules/audio.md 「재능·소환물 능력 소리」: talent abilities (`<charId>.T.<n>`, UnitMode signal rules) —
  // 크루스 더 킨 글린트's 中的 shot (its own attack ability T.1: START + ON), 이그제큐터 디 엑스 포에데레's 受选之人 extra shot
  // (T.1 START), 노시스's 殊途同归 going off 10 s after deployment (T.2 START)
  'kroos2:t1s': 'battle.ON_ABILITY_START.char_1021_kroos2.T.1',
  'kroos2:t1': 'battle.ON_ABILITY_ON.char_1021_kroos2.T.1',
  'excu2:t1': 'battle.ON_ABILITY_START.char_1032_excu2.T.1',
  'gnosis:t2': 'battle.ON_ABILITY_START.char_206_gnosis.T.2',
  // 실버애쉬 더 레인프로스트: S2's slash (its ability skchr_svash2_2's ON — the kit's slash has no attack event), S3's attacks
  // fire projectile_chr_svash2_s3 (its BORN at each strike)
  'svash2:s2': 'battle.ON_ABILITY_ON.skchr_svash2_2',
  'svash2:s3born': 'battle.ON_PROJECTILE_BORN.projectile_chr_svash2_s3',
  // 2026-10-29: 薄绿 S2's end burst (its FinalAttack — AbilityStandard.OnAttackFinished sounds ON_ABILITY_ATTACK_FINISH)
  'mint:s2end': 'battle.ON_ABILITY_ATTACK_FINISH.skchr_mint_2',
  // 뮤엘시스's 流形 (token_10030_mlyss_wtrman): the copy turning melee / ranged (mlyss_wtrman_s_begin's audio buffs), S3's
  // pull pulse of a melee copy (mlyss_s_3[token_melee_holder] audio buff, ON_BUFF_TRIGGER every pulse)
  'mlyss:melee': 'battle.ON_BUFF_START.mlyss_wtrman_s_melee_audio',
  'mlyss:range': 'battle.ON_BUFF_START.mlyss_wtrman_s_range_audio',
  'mlyss:pull': 'battle.ON_BUFF_TRIGGER.mlyss_s_3[melee_audio]',
  // 2026-10-22: 佩佩 S3 — every attack puts pepe_s_3_fx on its main target, whose ON_BUFF_START plays (PlayAudio, on the
  // target) pepe_s3_hit_03 at her pepe_s3_range[atk] stacks ≥ max_stack_cnt, _02 at ≥ 2, else _01 — with the matching
  // pepe_skill_03_hit_range_0N effect (public/js/audio.js signalFxKey, the kit's 'stacks' fx)
  'pepe:s3:1': 'battle.ON_CUSTOM_TRIGGER.pepe_s3_hit_01',
  'pepe:s3:2': 'battle.ON_CUSTOM_TRIGGER.pepe_s3_hit_02',
  'pepe:s3:3': 'battle.ON_CUSTOM_TRIGGER.pepe_s3_hit_03',
  // 2026-10-22: 帝国炮火先兆者 / 中枢先兆者's shell (content/enemies/fly.js kitShell; public/js/audio.js kitHitKey) — its attack's
  // end as it fires, its attack's hit and its projectile's hit at the landing (the _2 banks hold the same files)
  'emppnt:aim': 'battle.ON_ABILITY_END.enemy_1112_emppnt.attack',
  'emppnt:hit': 'battle.ON_ABILITY_HIT.enemy_1112_emppnt.attack',
  'emppnt:shell': 'battle.ON_PROJECTILE_HIT.projectile_enemy_emppnt',
  // 2026-10-22, docs/rules/audio.md 「버프·커스텀 트리거 소리」 (EN client buff templates; public/js/audio.js kitHitKey /
  // signalFxKey / skillDamageKey / dotTickKey): 刺玫 S2's counter (vendla_s_2[extra_damage] on the attacker); 洛洛 S2's
  // released drone hitting (rockr_s_2[funnel_hit_audio], _overload while overloaded); 协律 S2's sonic boom at an operator
  // (akkord_s_2[aoe_damage] PlayAudio); 隐德来希 S2's sickles on each enemy (etlchi_s_2[audio]); 锡人's alchemy unit on each
  // enemy every second (tinman_s_2[buff] PlayAudio); 蕾缪安 S3's lock on an enemy (lemuen_s_3 ON_ABILITY_CAST_ON_TARGET)
  'vendla:s2': 'battle.ON_BUFF_START.vendla_s_2[extra_damage]',
  'rockr:funnel': 'battle.ON_BUFF_START.rockr_s2_funnel_attack_hit',
  'rockr:funnelo': 'battle.ON_BUFF_START.rockr_s2_funnel_attack_hit_overload',
  'akkord:s2': 'battle.ON_CUSTOM_TRIGGER.akkord_aoe_audio',
  'etlchi:s2': 'battle.ON_BUFF_START.etlchi_s_2[audio]',
  'tinman:s2': 'battle.ON_CUSTOM_TRIGGER.tinman_s_2[audio]',
  'lemuen:s3lock': 'battle.ON_BUFF_START.lemuen_s3_audio_triggered',
  // 卡涅利安's charge stages outside the skill (billro_s_N[eff_cond]: [half] at 1 charge, [full] at 2 — public/js/audio.js
  // billroChargeKey, the kit's 'charges')
  ...Object.fromEntries([1, 2, 3].flatMap((n) => [[`billro:s${n}:half`, `battle.ON_BUFF_START.billro_s_${n}_reach_half`],
    [`billro:s${n}:full`, `battle.ON_BUFF_START.billro_s_${n}_reach_enhance`]])),
  // 灵知 / 流明 S2's charge stages ([effect1] at 1 charge, [effect2] at 2 — public/js/audio.js chargeStageKey; 流明's are
  // its buffs' show-effect banks)
  'gnosis:s2:1': 'battle.ON_BUFF_START.gnosis_s_2[audio1]',
  'gnosis:s2:2': 'battle.ON_BUFF_START.gnosis_s_2[audio2]',
  'lumen:s2:1': 'battle.ON_BUFF_SHOW_EFFECT.lumen_s_2[audio1]',
  'lumen:s2:2': 'battle.ON_BUFF_SHOW_EFFECT.lumen_s_2[audio2]',
  // 圣聆初雪: an enemy taking the talent's damage as it enters snow (sbell2_t1[enemy_enter] PlayAudio), S2's snow tick on
  // each enemy (sbell2_t1[s2_dot] PlayAudio) — the kit's kitHit
  'sbell2:enter': 'battle.ON_CUSTOM_TRIGGER.sbell2_snow_tile_enter_damage_audio',
  'sbell2:s2dot': 'battle.ON_CUSTOM_TRIGGER.sbell2_skill2_dot_audio',
});

/**
 * sfx.kit: key → sound leaf (keys whose bank has no file are left out).
 * @param {{ bank: (name: string) => string[] }} audio indexed audio_data (tools/assets/audio.mjs indexAudio)
 * @param {(paths: string[]) => any} soundLeaf plan.mjs leaf builder
 * @param {string[]} [notes] plan notes (a missing bank is reported)
 */
export function kitHitSfx(audio, soundLeaf, notes = []) {
  const out = {};
  for (const [key, bank] of Object.entries(KIT_HIT_BANKS)) {
    const paths = audio.bank(bank);
    if (paths && paths.length) out[key] = soundLeaf(paths);
    else notes.push(`kit hit SFX ${key}: no sound in ${bank}`);
  }
  return out;
}

/** sfx.kitGrp: key → the mixer group of its bank (public/js/audioOfficial.js); keys without one are left out. */
export function kitHitGroups(audio) {
  const out = {};
  if (typeof audio.groupOf !== 'function') return out;
  for (const [key, bank] of Object.entries(KIT_HIT_BANKS)) { const g = audio.groupOf(audio.bank(bank)); if (g) out[key] = g; }
  return out;
}

/**
 * sfx.kitLimit: key → { max, pop: true } for the keys whose bank cuts its oldest copy when full (`popOldest`, at most
 * `maxSoundAllowed` at once) — public/js/audio.js plays those so every hit sounds (蕾缪安 S3: five shells 0.3 s apart on a
 * 1.6 s file, maintainer report 2026-10-07) instead of dropping the newest at the unit sounds' 2.
 * @param {{ bank: (name: string) => string[], limitOf?: (p: string[]) => ({ max: number, pop: boolean }|null) }} audio
 */
export function kitHitLimits(audio) {
  const out = {};
  if (typeof audio.limitOf !== 'function') return out;
  for (const [key, bank] of Object.entries(KIT_HIT_BANKS)) { const l = audio.limitOf(audio.bank(bank)); if (l?.pop) out[key] = { max: l.max, pop: true }; }
  return out;
}

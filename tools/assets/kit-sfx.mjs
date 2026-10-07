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
  // local patch (user report 2026-10-07 #5): the pop itself (public/js/audio.js kitStartKey) — a placed stone's token
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
  // 蕾缪安 S3 (user report 2026-10-07 #10): the lock mark (its buff's show effect), the bombardment's start (S3_End mode
  // ability, once: the first shell), each shell landing (projectile_chr_lemuen_s3_attack reached)
  'lemuen:mark': 'battle.ON_BUFF_SHOW_EFFECT.char_lemuen_range_aim',
  'lemuen:s3end': 'battle.ON_ABILITY_START.char_4193_lemuen.attack.4',
  'lemuen:shell': 'battle.ON_PROJECTILE_REACH.projectile_chr_lemuen_s3_attack',
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
 * 1.6 s file, user report 2026-10-07 #10) instead of dropping the newest at the unit sounds' 2.
 * @param {{ bank: (name: string) => string[], limitOf?: (p: string[]) => ({ max: number, pop: boolean }|null) }} audio
 */
export function kitHitLimits(audio) {
  const out = {};
  if (typeof audio.limitOf !== 'function') return out;
  for (const [key, bank] of Object.entries(KIT_HIT_BANKS)) { const l = audio.limitOf(audio.bank(bank)); if (l?.pop) out[key] = { max: l.max, pop: true }; }
  return out;
}

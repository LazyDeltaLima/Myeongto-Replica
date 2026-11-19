// Skill hit sounds of the locally wired kits (local patch, docs/LOCAL-PATCH.md 「공식 전투 이펙트」): their skill damage
// comes from kit code (stones, 剑气, notes, the shades, the drones), not from an attack event, so the per-unit `hit`
// sound never played for it. The official client plays these banks on those hits (EN client audio_data.json, every
// bank below exists with its own file). The client maps the kits' battle.fx events to these keys
// (public/js/audio.js kitHitKey) and plays `sfx.kit[key]`, limited per key.

export const KIT_HIT_BANKS = Object.freeze({
  // 오올헤약: S3's whirlwind landing; the 浮空 of her skills (heyak_s_1[levitate], heyak_s_2 / _3[hit_levitate] CreateBuff `audioSignal`)
  'heyak:windHit': 'battle.ON_PROJECTILE_HIT.projectile_chr_heyak_s3',
  'heyak:lift': 'battle.ON_BUFF_START.heyak_levitate',
  // 乌有 S2: its begin's extra signal (skchr_nothin_2 `_playExtraSignalAtSkillBegin`)
  'nothin:s2': 'battle.ON_SKILL_SPECIAL_POINT.skchr_nothin_2',
  // 风絮: her FlyStart modes' attack ability (the take-off clip): its start; the FlyEnd one is the skill's end sound (`ends`)
  'taraxa:up1': 'battle.ON_ABILITY_START.char_4222_taraxa.attack.1',
  'taraxa:up2': 'battle.ON_ABILITY_START.char_4222_taraxa.attack.4',
  // 矩 S2: the extra damage's PlayAudio (ju_s_2[damage] ON_BUFF_FINISH, `_audioSignal`)
  'ju_s_2[damage]': 'battle.ON_CUSTOM_TRIGGER.ju_s_2[damage][audio]',
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
  // 2026-11-01: S2's Aim — the first child of its mode's M2Attack (AbilityFirstSucceedGroup, signal attack.2.1), which the
  // kit casts as its own channel, not as an attack (public/js/audio.js signalFxKey / kitHitKey): START as the aim begins
  // (fx 'lemuenAim' on 1), ON and its projectile_chr_lemuen_s2's HIT at the shot (fx 'crit' from her)
  'lemuen:aim': 'battle.ON_ABILITY_START.char_4193_lemuen.attack.2.1',
  'lemuen:snipe': 'battle.ON_ABILITY_ON.char_4193_lemuen.attack.2.1',
  'lemuen:s2hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_lemuen_s2',
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
  // 크루스 더 킨 글린트's 中的 shot (its own attack ability T.1: START at the swing, ON at the strike), 이그제큐터 디 엑스 포에데레's 受选之人 extra shot
  // (T.1 START), 노시스's 殊途同归 going off 10 s after deployment (T.2 START)
  'kroos2:t1s': 'battle.ON_ABILITY_START.char_1021_kroos2.T.1',
  'kroos2:t1': 'battle.ON_ABILITY_ON.char_1021_kroos2.T.1',
  'excu2:t1': 'battle.ON_ABILITY_START.char_1032_excu2.T.1',
  'gnosis:t2': 'battle.ON_ABILITY_START.char_206_gnosis.T.2',
  // 실버애쉬 더 레인프로스트: S2's slash (its ability skchr_svash2_2's ON — the kit's slash has no attack event); S3: the bird's
  // aura projectile_chr_svash2_s3 (BirdAura_Self, cast once as the skill starts: its own buff svash2_s_3[self_bird_onuse]) and
  // 2026-11-02 the bird's strike — the S3 mode's attack puts svash2_s_3[trigger_self] on him → BirdAttack → svash2_s_3[bird_on_self]
  // shoots projectile_chr_svash2_s3_bird_self at the enemies, its HIT
  'svash2:s2': 'battle.ON_ABILITY_ON.skchr_svash2_2',
  'svash2:s3born': 'battle.ON_PROJECTILE_BORN.projectile_chr_svash2_s3',
  'svash2:s3hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_svash2_s3_bird_self',
  // 2026-10-29: 薄绿 S2's end — her skill ability's ON_ABILITY_ATTACK_FINISH as the end clip starts (audio.js on the 'skill' off)
  'mint:s2end': 'battle.ON_ABILITY_ATTACK_FINISH.skchr_mint_2',
  // 2026-10-29: 歌蕾蒂娅 S3's tornado as it forms (its Chant, the sequence's 2nd child — kit fx 'tornado')
  'glady:s3': 'battle.ON_ABILITY_ON.skchr_glady_3.2',
  // 뮤엘시스's 流形 (token_10030_mlyss_wtrman): the copy turning melee / ranged (mlyss_wtrman_s_begin's audio buffs), S3's
  // pull pulse of a melee copy (mlyss_s_3[token_melee_holder] audio buff, ON_BUFF_TRIGGER every pulse)
  'mlyss:melee': 'battle.ON_BUFF_START.mlyss_wtrman_s_melee_audio',
  'mlyss:range': 'battle.ON_BUFF_START.mlyss_wtrman_s_range_audio',
  'mlyss:pull': 'battle.ON_BUFF_TRIGGER.mlyss_s_3[melee_audio]',
  // 2026-11-20: its fall (mlyss_wtrman_t_1[listener] ON_BEFORE_TRY_SET_HP_ZERO creates mlyss_wtrman_t_1[audio], audioSignal
  // [fakedeath] — no ON_UNIT_DEAD: it does not die) and its switch cast out of Recharge (Talents/1 mlyss_wtrman_switch /
  // _melee / _range, signal T.1: its START as its born trigger or its mlyss_wtrman_t_1[trigger] casts it, 1 s before the
  // reborn) — the kit's 'manifoldDown' / 'manifoldUp'
  'mlyss:fakedeath': 'battle.ON_BUFF_START.mlyss_wtrman_t_1[fakedeath]',
  'mlyss:reborn': 'battle.ON_ABILITY_START.token_10030_mlyss_wtrman.T.1',
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
  // 2026-10-29, docs/rules/audio.md 「스킬·재능 투사체 소리」 (charpack / skill / projectile prefabs; public/js/audio.js):
  // an unreleased drone's shot on its 驭械术师's attack — the Default mode's Funnel ability projectile (荒芜拉普兰德's
  // Funnel1–3 fire …_funnel_1–3, whose `_overrideAudioSignal` is projectile_chr_whitw2_funnel; 至简's has no bank)
  'kjera:funnel': 'battle.ON_PROJECTILE_HIT.projectile_chr_kjera_funnel',
  'whitw2:funnel': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel',
  'whitw2:funnelS1': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel_s1_1',
  'rockr:funnelN': 'battle.ON_PROJECTILE_HIT.projectile_chr_rockr_funnel',
  // 耶拉 S2's released drone Funnel_0 (projectile_chr_kjera_funnel_s2_1; Funnel_1's …_s2_2 has none): each hit, and its
  // TriggerAudioSignalBehaviour (OnHitTarget: `_preDelay` 0.6 s ÷ the ability's playback speed after each hit)
  'kjera:s2': 'battle.ON_PROJECTILE_HIT.projectile_chr_kjera_funnel_s2_1',
  'kjera:s2end': 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_kjera_funnel_s2_1',
  // 至简 S2: the second shot of the next attack (skchr_malist_2 `_additionalProjectile`; the first, …_s1s2, has no bank)
  'malist:s2': 'battle.ON_PROJECTILE_HIT.projectile_chr_malist_s2_2',
  // 荒芜拉普兰德 S3: the wolves released (cruise projectiles …_funnel_s3_<n>, `_overrideAudioSignal` …_funnel_s3: BORN), a
  // roaming wolf marking the enemy it found (its MovementController's buff, audioSignal whitw2_find_target_mark: SHOW_EFFECT),
  // a locked wolf's strike (…_funnel_s3_<n>_attach → …_funnel_s3_attach: HIT)
  'whitw2:s3born': 'battle.ON_PROJECTILE_BORN.projectile_chr_whitw2_funnel_s3',
  'whitw2:mark': 'battle.ON_BUFF_SHOW_EFFECT.whitw2_find_target_mark',
  'whitw2:s3lock': 'battle.ON_PROJECTILE_HIT.projectile_chr_whitw2_funnel_s3_attach',
  // 引星棘刺 S3: each alchemy unit thrown at an operator (skill prefab Token → projectile_chr_thorn2_s3, STOP)
  'thorn2:s3': 'battle.ON_PROJECTILE_STOP.projectile_chr_thorn2_s3',
  // 2026-11-04: 引星棘刺 S2's unit landing and each tick on an enemy (thorn2_s2_damage PlayAudio); 维什戴尔 S1's shot; 乌尔比安 S3's
  // anchor landing, enemies or none (the skill's AOEAttack projectile)
  'thorn2:s2': 'battle.ON_PROJECTILE_REACH.projectile_chr_thorn2_s2',
  'thorn2:s2hit': 'battle.ON_CUSTOM_TRIGGER.thorn2_s2_projectile_hit',
  'wisdel:s1': 'battle.ON_PROJECTILE_HIT.projectile_chr_wisdel_s1',
  'ulpia:s3reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_ulpia_s3',
  // 维什戴尔 S3: each attack's AimEff marks its target (wisdel_s_3_mark[target], audioSignal WISDEL_S3_MARK)
  'wisdel:s3mark': 'battle.ON_BUFF_START.WISDEL_S3_MARK',
  // 溯光星源 S3: LinkEnemy links one more enemy (halo2_s_3_link, audioSignal the same name)
  'halo2:s3link': 'battle.ON_BUFF_START.halo2_s_3_link',
  // 新约能天使 T1 火力电台: a bombing landing (TalentBomb → projectile_chr_angel2_t1, REACH)
  'angel2:t1': 'battle.ON_PROJECTILE_REACH.projectile_chr_angel2_t1',
  // 克莱门莎 (CN client buff templates / projectile prefabs): S2's carriage fired (clemnt_s2[emit_projectile] →
  // projectile_chr_clemnt_s2_lr / _ud BORN) and, as it stops, the vortex (→ …_s2_range BORN); S3's shell on a marked enemy
  // (clemnt_s3[emit_projectile] → projectile_chr_clemnt_s3: REACH, then its two audio behaviours every 1 s — the fall
  // 0.5 s and the impact 1 s after it reached); T1's won roll on the target (clemnt_t1[dice_damage] ON_AFTER_OUTPUT_DAMAGE
  // PlayAudio)
  'clemnt:s2cab': 'battle.ON_PROJECTILE_BORN.projectile_chr_clemnt_s2_lr',
  'clemnt:s2tide': 'battle.ON_PROJECTILE_BORN.projectile_chr_clemnt_s2_range',
  'clemnt:s3reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_clemnt_s3',
  'clemnt:s3fall': 'battle.ON_CUSTOM_TRIGGER.clemnt_s3_projectile_tick_fall_audio',
  'clemnt:s3hit': 'battle.ON_CUSTOM_TRIGGER.clemnt_s3_projectile_tick_reach_audio',
  'clemnt:t1': 'battle.ON_CUSTOM_TRIGGER.clemnt_t1_power_attack_audio',
  // 2026-11-01 塔露拉 (CN client prefabs): S3's 簇火 — each lane's projectile_chr_oxi_s_3_heatwave fired (BORN) and exploding
  // (HIT); S3's 过载 (the skill prefab's AudioOnEventBehaviour on event 8, once); a footprint tile leased (oxi_fire_field_lease
  // `_effectSettings` castedTimeThreshold 1 audioSignal)
  'oxi:s3fire': 'battle.ON_PROJECTILE_BORN.projectile_chr_oxi_s_3_heatwave',
  'oxi:s3hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_oxi_s_3_heatwave',
  'oxi:s3ovs': 'battle.ON_CUSTOM_TRIGGER.oxi_s_3_overload',
  'oxi:field': 'battle.ON_CUSTOM_TRIGGER.oxi_fire_field_create',
  // 2026-11-17: 焰影苇草 S3's spread — a 灼痕 enemy killed during S3 (reed2_t_1[skill_3_diffuse] ON_OWNER_KILLED) gets the
  // projectile of its blackboard `projectile` at its FOOT, which reaches at once (reed2_debuff_boom_01: the kit's fx scorchBurst)
  'reed2:s3boom': 'battle.ON_PROJECTILE_REACH.projectile_chr_reed2_aoe_effect',
  // 2026-11-01 冻河 (CN buff templates: the audioSignal of the buffs they create; public/js/audio.js statusSoundKey / kitHitKey):
  // S1 屏障, S2 attack speed, S3 ATK bonus (SHOW_EFFECT), S3 triggered effect (START); S2's projectile reaching its ally
  'tocka:s1shield': 'battle.ON_BUFF_SHOW_EFFECT.tocka_s1_shield_start_audio',
  'tocka:s2auto': 'battle.ON_BUFF_SHOW_EFFECT.tocka_s2_auto_skill_audio',
  'tocka:s3bonus': 'battle.ON_BUFF_SHOW_EFFECT.tocka_s3_bonus_start_audio',
  'tocka:s3trigger': 'battle.ON_BUFF_START.tocka_s3_trigger_start_audio',
  'tocka:s2hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_tocka_s2',
  // 2026-11-01 (public/js/audio.js kitHitKey / kitStartKey / kitMomentKeys; the linking sheet tools/local-extract/link_sheet.py):
  // 赤刃明霄陈 T2's held dodge gained (chen3_t2[evade] ON_BUFF_ENABLE PlayAudio); 魂灵之影's strike (its skill's RangedAttack ON)
  'chen3:t2evade': 'battle.ON_CUSTOM_TRIGGER.chen3_talent_evade_start_audio',
  'wisdel:tokenon': 'battle.ON_ABILITY_ON.sktok_wisdel_wward',
  // 凯尔希·思衡托 S3: the transport starting (Talents/-1 StartTransporting START), its flight projectile_chr_kalts2_s3_2
  // reaching the anchor (REACH) and the landing's respawn (CommonAbility/RespawnBorn BuffDuringCastingFixed audioSignal)
  'kalts2:s3start': 'battle.ON_ABILITY_START.char_1052_kalts2.T.-1',
  'kalts2:s3reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_kalts2_s3_2',
  'kalts2:respawn': 'battle.ON_BUFF_START.kalts2_respawn_range',
  // 予愿安洁莉娜 (CN client): her model's AudioWhenPlayAnimation (clip → signal: Born and Skill_1_Begin →
  // aglna2_born, Skill_2_Begin → aglna2_s_2[Begin], Skill_3_Restart_Begin → aglna2_restart), S2's sweep fired (BORN) and
  // each enemy it lifts / holds down (aglna2_s_2[enemy] CreateBuff audioSignal), S3's flight body (BORN)
  'aglna2:born': 'battle.ON_PLAY_ANIMATION.aglna2_born',
  'aglna2:s2begin': 'battle.ON_PLAY_ANIMATION.aglna2_s_2[Begin]',
  'aglna2:restart': 'battle.ON_PLAY_ANIMATION.aglna2_restart',
  'aglna2:s2fly': 'battle.ON_PROJECTILE_BORN.projectile_chr_aglna2_s2_fly',
  'aglna2:levitate': 'battle.ON_BUFF_START.aglna2_s_2[enemy][levitate]',
  'aglna2:groundbind': 'battle.ON_BUFF_START.aglna2_s_2[enemy][ground_bound]',
  'aglna2:s3fly': 'battle.ON_PROJECTILE_BORN.projectile_chr_aglna2_s3_fly',
  // 酒神's 本能的召唤: its attract ability (Talents/1, ProjectileToTileAbility) on each enemy it lures and that projectile's
  // HIT; as it leaves — its skill's Boom (extra.0, only when a lured enemy reached it), token_phatm2_encdool_kill's
  // boom_start, each enemy's phatm2_s_2[damage] start (boom_hit) and every tick of it (phatm2_s2_boom_damage)
  'phatm2:lure': 'battle.ON_ABILITY_START.token_10054_phatm2_encdool.T.1',
  'phatm2:lurehit': 'battle.ON_PROJECTILE_HIT.projectile_token_phatm2_encdool',
  'phatm2:boom': 'battle.ON_ABILITY_START.sktok_phatm2_encdool_2.extra.0',
  'phatm2:boomstart': 'battle.ON_CUSTOM_TRIGGER.token_encdool_boom_start',
  'phatm2:boomhit': 'battle.ON_CUSTOM_TRIGGER.token_encdool_boom_hit',
  'phatm2:s2dmg': 'battle.ON_CUSTOM_TRIGGER.phatm2_s2_boom_damage',
  // 2026-10-30 (public/js/audio.js kitHitKey): 叙拉古 [ex]'s proc on the target (act2autochess_bond_eff_siracusa[ex][buff]
  // PlayAudio); a hit a block layer stops whole (BlockDamage.Execute plays ON_DAMAGE_BLOCK at the holder: fx 'parry')
  'siracusa:ex': 'battle.ON_CUSTOM_TRIGGER.siracusa_ex_attack',
  'block': 'battle.ON_DAMAGE_BLOCK',
  // 2026-11-01 (public/js/audio.js TPL_FX_SOUNDS): 卡西米尔 [ex]'s pulse on each enemy it hits — the AOEDamage `_buffs`
  // [ex_damage_effect] carries audioSignal kazimierz_ex_attack beside its effect, sounded as the buff starts
  'kazimierz:ex': 'battle.ON_BUFF_START.kazimierz_ex_attack',
  // 2026-11-03, docs/rules/audio.md 「버프·커스텀 트리거 소리」 (EN client buff templates and charpack prefabs; public/js/audio.js):
  // 魔王's 微尘 reaching its unit (the running skill's projectile HIT) and back in her orbit (its cooldown_ready custom
  // trigger; S3's never leave) — cetsyrMoteKey
  'cetsyr:hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_cetsyr_talent',
  'cetsyr:hit1': 'battle.ON_PROJECTILE_HIT.projectile_chr_cetsyr_talent_s1',
  'cetsyr:hit2': 'battle.ON_PROJECTILE_HIT.projectile_chr_cetsyr_talent_s2',
  'cetsyr:hit3': 'battle.ON_PROJECTILE_HIT.projectile_chr_cetsyr_talent_s3',
  'cetsyr:ready': 'battle.ON_CUSTOM_TRIGGER.projectile_chr_cetsyr_talent_cooldown_ready',
  'cetsyr:ready1': 'battle.ON_CUSTOM_TRIGGER.projectile_chr_cetsyr_talent_s1_cooldown_ready',
  'cetsyr:ready2': 'battle.ON_CUSTOM_TRIGGER.projectile_chr_cetsyr_talent_s2_cooldown_ready',
  // 维什戴尔 S2's 过载 (wisdel_s_2[overload_start] PlayAudio); 菲莱 S2's blast at her (philae_s_2[cd]) and on each enemy
  // (philae_s_2[ep]); 缇缇 S3's sleep spreading to an enemy (titi_s_3[effect_line]) and T1's tick on a sleeping enemy
  // (titi_t_1[enemy_sleeping], kit kitHit)
  'wisdel:s2ovs': 'battle.ON_CUSTOM_TRIGGER.WISDEL_S_OVERLOAD',
  'philae:aoe': 'battle.ON_BUFF_START.philae_aoe',
  'philae:aoehit': 'battle.ON_BUFF_START.philae_aoe_hit',
  'titi:spread': 'battle.ON_CUSTOM_TRIGGER.titi_s_3[spread_from]',
  'titi:t1': 'battle.ON_CUSTOM_TRIGGER.titi_t_1',
  // 2026-11-07, docs/rules/audio.md 「공식 소리 신호 잇기」 (the linking sheet, tools/local-extract/link_sheet.py):
  // 旅骨 (CN client): a thrown unit's HitTile ON (no enemy to throw at), its REACH and STOP, the ticks' PlayAudio (S1 hbound_s_1[dot], S2's
  // hbound_s_2[heavy_damage]; its hbound_s_2_heavy has no bank and [buff] no PlayAudio)
  'hbound:s1on': 'battle.ON_ABILITY_ON.skchr_hbound_1.2',
  'hbound:s2on': 'battle.ON_ABILITY_ON.skchr_hbound_2.2',
  'hbound:s1reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_hbound_s1',
  'hbound:s2reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_hbound_s2',
  'hbound:s1stop': 'battle.ON_PROJECTILE_STOP.projectile_chr_hbound_s1',
  'hbound:s2stop': 'battle.ON_PROJECTILE_STOP.projectile_chr_hbound_s2',
  'hbound:s1dot': 'battle.ON_CUSTOM_TRIGGER.hbound_s1_dot',
  'hbound:s2dot': 'battle.ON_CUSTOM_TRIGGER.hbound_s2_dot',
  // 莉赛尔 S2: the ability's ON, each of its three projectiles' REACH (one file); 车尔尼: S2's FinalAttack START, T1's echo
  // (pianst_t_1 CreateBuff audioSignal); 布丽吉德 S2's cut (brigid_s2[cut] PlayAudio); 克里斯汀 S2 and 灰烬·引雷 S2's orb: REACH, each
  // tick's SelectorHitBehaviour `_playAudioWhenSelect` (ON_PROJECTILE_BEHAVIOUR_TRIGGER)
  'liesel:s2on': 'battle.ON_ABILITY_ON.skchr_liesel_2',
  'liesel:s2reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_liesel_s2_1',
  'pianst:final': 'battle.ON_ABILITY_START.skchr_pianst_2.extra.0',
  'pianst:echo': 'battle.ON_BUFF_START.pianst_t[InverseDamage]',
  'brigid:cut': 'battle.ON_CUSTOM_TRIGGER.brigid_s2_cut_audio',
  'christ:s2reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_christ_s2',
  'christ:s2tick': 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_christ_s2',
  'greyy2:s2on': 'battle.ON_ABILITY_ON.skchr_greyy2_2',
  'greyy2:s2reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_greyy2_s2',
  'greyy2:s2tick': 'battle.ON_PROJECTILE_BEHAVIOUR_TRIGGER.projectile_chr_greyy2_s2',
  // 慕斯 T1's attack (each of its two hits); 米特姆 S1's blast (mitm_s_1 PlayAudio) and S2's form (mitm_s_2[to_token] PlayAudio), 樱桃三号's
  // way back (trshrb_switch = Talents/1, START); 罗贝塔's machine: Running (PassiveBuffAbility audioSignal), a layer stopping a hit
  // (robrta_mach_t CreateBuff audioSignal), S2's end clip (`_fireAttackFinishEvent`)
  'frncat:t1hit': 'battle.ON_ABILITY_HIT.char_185_frncat.T.1',
  'mitm:s1': 'battle.ON_CUSTOM_TRIGGER.explode',
  'mitm:s2': 'battle.ON_CUSTOM_TRIGGER.state_change',
  'mitm:reborn': 'battle.ON_ABILITY_START.token_10037_mitm_trshrb.T.1',
  'robrta:run': 'battle.ON_BUFF_START.robrta_mach_running[audio]',
  'robrta:block': 'battle.ON_BUFF_START.robrta_mach_t[audio]',
  'robrta:s2end': 'battle.ON_ABILITY_ATTACK_FINISH.skchr_robrta_2',
  // 引星棘刺 T2 as it attaches (thorn2_t_2[audio] PlayAudio, Talent/2 global_ally `_passiveBuffs`); 可露希尔: S1's shield on a 援军 (its
  // ApplyShield audioSignal), S3's plane (CachedBuffToCastTargetsBehaviour audioSignal), the 指挥中心 into its 战术点形态
  // (closur_ourbase_t_1[listener] CreateBuff audioSignal)
  'thorn2:t2': 'battle.ON_CUSTOM_TRIGGER.thorn2_t_2_start',
  'closur:s1block': 'battle.ON_BUFF_SHOW_EFFECT.closur_s_1[block]',
  'closur:plane': 'battle.ON_BUFF_START.closur_s3_airplane',
  'closur:fakedeath': 'battle.ON_BUFF_START.closur_ourbase[fake_death]',
  'closur:range2': 'battle.ON_BUFF_START.token_closur_ourbase_range_02_loop_start',
  'closur:range3': 'battle.ON_BUFF_START.token_closur_ourbase_range_03_loop_start',
  // 假想敌：管 and 弦, whose attacks are the kit's shots (bosses.js pipeCore): the strike, the projectile's REACH
  'acduml:strike2': 'battle.ON_ABILITY_START.enemy_9021_acduml_2.attack.0.1',
  'acdumm:strike': 'battle.ON_ABILITY_ON.enemy_9022_acdumm.attack.0.1',
  'acduml:reach': 'battle.ON_PROJECTILE_REACH.projectile_enemy_acduml',
  'acdumm:reach': 'battle.ON_PROJECTILE_REACH.projectile_enemy_acdumm',
  // 蕾缪安's attack ending (its BuffToOwner lemuen_attack_end_audio's ON_BUFF_FINISH, 0.76 s after the strike); 风丸's 折纸生花
  // (Talents/1 START: her stand-in state, the summoned <替身>); 缪尔赛思 S3 on a ranged 流形 (mlyss_s_3[token_range_trigger]);
  // a waiting operator's 凛御银灰 S2 slash as it redeploys — the range (svash2_s_2[build][effect]) and each enemy it hits
  // (svash2_s_2[signal])
  'lemuen:atkend': 'battle.ON_BUFF_FINISH.lemuen_attack_end_audio',
  'kazema:t1': 'battle.ON_ABILITY_START.char_4016_kazema.T.1',
  'kazema:t1token': 'battle.ON_ABILITY_START.token_10022_kazema_shadow.T.1',
  'mlyss:s3range': 'battle.ON_BUFF_START.mlyss_s_3[range_audio]',
  'svash2:range': 'battle.ON_CUSTOM_TRIGGER.svash2_s_2[range]',
  'svash2:s2redhit': 'battle.ON_BUFF_START.svash2_s_2[hit]',
  // 2026-11-03, docs/rules/audio.md 「버프·커스텀 트리거 소리」 (EN client templates and prefabs; public/js/audio.js): 真言's
  // 侵入点 mark (Talents/2 TileListener AttachListenerToTileAbility `_effectSettings` audioSignal, played at the tile as its
  // mark effect is made), each S1 / S2 hit by its IsTargetInEPBreakRecovery branch (PlayProjectileAudio, kit kitHit), each
  // object an S3 溢出麻痹 bounce hits (mantra_s_3[enemy_trigger]); 铁钳号·原型机's skill (its ability START) and its projectile
  // reaching (the kit's blast, fx 'aoe' ironmn:crab);
  'mantra:t2': 'battle.ON_CUSTOM_TRIGGER.mantra_t_tile',
  'mantra:s1': 'battle.ON_CUSTOM_TRIGGER.mantra_s_1_proj_normal',
  'mantra:s1el': 'battle.ON_CUSTOM_TRIGGER.mantra_s_1_proj_element',
  'mantra:s2': 'battle.ON_CUSTOM_TRIGGER.mantra_s_2_proj_normal',
  'mantra:s2el': 'battle.ON_CUSTOM_TRIGGER.mantra_s_2_proj_element',
  'mantra:s3': 'battle.ON_CUSTOM_TRIGGER.mantra_s_3_element',
  'ironmn:pile3s': 'battle.ON_ABILITY_START.sktok_ironmn_pile3',
  'ironmn:pile3hit': 'battle.ON_PROJECTILE_REACH.projectile_chr_ironmn_pile3',
  // 遥: a bubble given (haruka_t_1 ON_BUFF_START PlayAudio) and breaking (haruka_t_1_delay ON_BUFF_TRIGGER), S3's levitation
  // (haruka_s_3_debuff, created with audioSignal haruka_shield_start_enemy: its START and each damage TRIGGER), S2's extra
  // damage at a healed unit (haruka_s_2 ON_AFTER_OUTPUT_HEAL PlayAudio, enemies or none)
  'haruka:t1': 'battle.ON_CUSTOM_TRIGGER.haruka_shield_start_ally',
  'haruka:break': 'battle.ON_CUSTOM_TRIGGER.haruka_shield_break_ally',
  'haruka:lev': 'battle.ON_BUFF_START.haruka_shield_start_enemy',
  'haruka:float': 'battle.ON_BUFF_TRIGGER.haruka_shield_start_enemy',
  'haruka:s2': 'battle.ON_CUSTOM_TRIGGER.haruka_s2_damage',
  // 斥罪 S2's pulse on each enemy it hits (judge_s_2[aoe] AOEDamage `_buffs` judge_s_2[audio]); 逻各斯 S1's execution
  // (logos_s_1 PlayAudio after the kill damage, fx 'logosExecute'), its follow-up shot leaving the fallen enemy and T1 语汇演化's
  // shot leaving / landing (kit kitHit, fx 'logosLexicon')
  'judge:s2hit': 'battle.ON_BUFF_START.judge_s_2[audio]',
  'logos:s1kill': 'battle.ON_CUSTOM_TRIGGER.logos_s1_kill',
  'logos:s1shot': 'battle.ON_PROJECTILE_BORN.projectile_chr_logos_s1_2',
  'logos:t1shot': 'battle.ON_PROJECTILE_BORN.projectile_chr_logos_t',
  'logos:t1hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_logos_t',
  // 贝洛内 S2's shot (the S2 mode's Attack BuffToOwner, `_runActionOnEvent` ON_SPELL_ON: demetr_s2[audio] with this
  // audioSignal), S3's FlyToTargetSecond and RespawnEnd (skchr_demetr_3 `_extraAbilities` 1 / 2; FlyToTarget, 0, has no bank);
  // 维伊's store (MergeableChargeUberEffectEmitter.CreateChargeEffects: the normal signal, or the merge one for the store that
  // makes a 转置能量) and her stored energies landing (the ChargeAttack abilities' projectiles, S2 ChargeAttackS2's);
  // 怒潮凛冬's 高台 splash (Headb2AttackHighlandAOEBase._TriggerAOEFromTile: `_aoeAudioSignal` at every 高台 tile, enemies or
  // none); Mon3tr S3's move onto her 重构体 (monstr_s_3_buff[respawn] creates monstr_s_3[audio] after RespawnCharacter) and its
  // return (skchr_monstr_3 `_extraAbilities` 0, RespawnEnd)
  'demetr:s2atk': 'battle.ON_BUFF_START.demetr_s2_attack_spell_on_audio',
  'demetr:s3fly': 'battle.ON_ABILITY_START.skchr_demetr_3.extra.1',
  'demetr:s3back': 'battle.ON_ABILITY_START.skchr_demetr_3.extra.2',
  'veen:store': 'battle.ON_CUSTOM_TRIGGER.veen_charge_normal',
  'veen:merge': 'battle.ON_CUSTOM_TRIGGER.veen_charge_merge',
  'veen:hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_veen',
  'veen:mhit': 'battle.ON_PROJECTILE_HIT.projectile_chr_veen_merged',
  'veen:s2hit': 'battle.ON_PROJECTILE_HIT.projectile_chr_veen_s2',
  'veen:s2mhit': 'battle.ON_PROJECTILE_HIT.projectile_chr_veen_s2_merged',
  'headb2:highland': 'battle.ON_CUSTOM_TRIGGER.headb2_highland_aoe',
  // 2026-11-04: 怒潮凛冬 S3's hammers — the ability's ON at each spell, the spell count at the end of the signal
  'headb2:s3hit0': 'battle.ON_ABILITY_ON.skchr_headb2_3.0',
  'headb2:s3hit1': 'battle.ON_ABILITY_ON.skchr_headb2_3.1',
  'headb2:s3hit2': 'battle.ON_ABILITY_ON.skchr_headb2_3.2',
  'headb2:s3hit3': 'battle.ON_ABILITY_ON.skchr_headb2_3.3',
  'headb2:s3hit4': 'battle.ON_ABILITY_ON.skchr_headb2_3.4',
  'monstr:s3move': 'battle.ON_BUFF_START.monstr_s_3[respawn]',
  'monstr:s3back': 'battle.ON_ABILITY_START.skchr_monstr_3.extra.0',
  // 2026-11-04: 黍 — T1's DoFarm (AttachListenerToTileAbility.AttachToTile: its spell-on signal for each newly sown tile),
  // S3's 【播种标记】 on an enemy (shu_s_3[enemy][enter] CreateBuff audioSignal) and its put-back (the mark's ON_BUFF_TRIGGER);
  // 老鲤 — S2's mark bursting (lmlee_s_2[paper] ON_BUFF_FINISH EmitProjectile projectile_chr_lmlee_s2), S3's push past its
  // Dice (lmlee_s_3[knockback] → lmlee_skill_3_audio[knockback]), T2's guard (lmlee_tr → lmlee_t_2[bounce]); 黑键 — a stored
  // energy (his ExChargeAttack abilities' Charge ON, one per mode: Default / S1 / S3), 旧日残影's 闪回 (sktok_ebnhlz_token ON),
  // the passive ebnhlz_c buff on him as he deploys (CommonAbilities/Passive audioSignal buff_ebnhlz[audio])
  'shu:t1': 'battle.ON_ABILITY_ON.char_2025_shu.T.1',
  'shu:mark': 'battle.ON_BUFF_START.shu_s_3[enemy][mark]',
  'shu:back': 'battle.ON_BUFF_TRIGGER.shu_s_3[enemy][mark]',
  'lmlee:s2burst': 'battle.ON_PROJECTILE_REACH.projectile_chr_lmlee_s2',
  'lmlee:s3push': 'battle.ON_BUFF_START.lmlee_skill_3_knockback',
  'lmlee:t2': 'battle.ON_BUFF_START.lmlee_telent_2_start',
  'ebnhlz:charge': 'battle.ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.ExChargeAttackDefault.0',
  'ebnhlz:charge1': 'battle.ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.1.ExChargeAttackS1.0',
  'ebnhlz:charge3': 'battle.ON_ABILITY_ON.Charge.char_4046_ebnhlz.attack.2.ExChargeAttackS3.0',
  'ebnhlz:flash': 'battle.ON_ABILITY_ON.sktok_ebnhlz_token',
  'ebnhlz:born': 'battle.ON_BUFF_START.buff_ebnhlz[audio]',
  // 涤火杰西卡 — S3's shell stopping on the first enemy it passes or at its end (ExtraBomb ProjectileToTileAbility's
  // projectile_chr_jesca2_s3_bomb STOP), her turn to a 机动盾牌 placed beside her (jesca2_jckshd_dir_set gives her
  // jesca2_jckshd_dir_set[effect], audioSignal jesca2_jckshd_turnaround)
  'jesca2:s3bomb': 'battle.ON_PROJECTILE_STOP.projectile_chr_jesca2_s3_bomb',
  // (2026-11-04) the shot: the S3 attack group's ExtraBomb child; 琳琅诗怀雅 S1's HealAlly child (start, heal landing)
  'jesca2:s3shell': 'battle.ON_ABILITY_START.char_1034_jesca2.attack.3.1',
  'swire2:heal': 'battle.ON_ABILITY_START.char_1033_swire2.attack.1.1',
  'swire2:healhit': 'battle.ON_ABILITY_HIT.char_1033_swire2.attack.1.1',
  // (2026-11-04) 琳琅诗怀雅 S2's SpawnToken child, 新约能天使 S3's S3FireToToken child: START (their attack groups' other children)
  'swire2:throw': 'battle.ON_ABILITY_START.char_1033_swire2.attack.2.1',
  'angel2:s3fire': 'battle.ON_ABILITY_START.char_1041_angel2.attack.3.1',
  'jesca2:turn': 'battle.ON_BUFF_START.jesca2_jckshd_turnaround',
  // 棘刺 S2: each Thorn cast (its BuffDuringCasting gives him thorns_s_2[audio] as the cast starts)
  'thorns:s2': 'battle.ON_BUFF_START.thorns_s_2[audio]',
  // 2026-11-03, docs/rules/audio.md 「적 버프·커스텀 트리거 소리」 (EN client enemy prefabs and buff templates; public/js/audio.js
  // enemyBuffSounds): a prisoner freed (its Liberty mode's enemy_liberty[state]) and freed by another (LibertyOthersAbility's
  // enemy_liberty_force); 阿利斯泰尔's piece picked up (enemy_vtmstr_equip_*[char] PlayAudio) and its vest taken
  // (enemy_vtlionk_s2 PlayAudio at the boss); 绯红歌伶's war song (csdcr_t → csdcr_skill[audio]); a hand of 假想敌：胄 shot
  // down (acstma / acstmb_s_1[special_stun]); “余音”'s ensembles, pulse and form switch (acdums_audio[…], acdums_t_1);
  // 昆图斯's 物种爆发 (dslily_doom[effect], 1 s triggers) and “萨米的意志”'s doom (enemy_smdeer_doom[audio] ends after 1.8 s)
  'liberty:state': 'battle.ON_BUFF_START.enemy_liberty[state]',
  'liberty:force': 'battle.ON_BUFF_START.enemy_liberty_force',
  'vtmstr:equip': 'battle.ON_CUSTOM_TRIGGER.enemy_vtmstr_getEquip',
  'vtlionk:shld': 'battle.ON_CUSTOM_TRIGGER.enemy_vtlionk_skill_shld',
  'csdcr:skill': 'battle.ON_BUFF_START.csdcr_skill[audio]',
  'acstma:stun': 'battle.ON_BUFF_START.acstma_s_1[special_stun]',
  'acstmb:stun': 'battle.ON_BUFF_START.acstmb_s_1[special_stun]',
  'acdums:passion': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[passion]',
  'acdums:passion2': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[passion][delay]',
  'acdums:depassion': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[depassion]',
  'acdums:depassion2': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[depassion][delay]',
  'acdums:aoe': 'battle.ON_CUSTOM_TRIGGER.acdums_audio[aoe]',
  'acdums:switcha': 'battle.ON_CUSTOM_TRIGGER.enemy_9023_acdums.switch_a',
  'acdums:switchb': 'battle.ON_CUSTOM_TRIGGER.enemy_9023_acdums.switch_b',
  'dslily:doom': 'battle.ON_BUFF_TRIGGER.dslily_doom[audio]',
  'smdeer:doom': 'battle.ON_CUSTOM_TRIGGER.enemy_smdeer_doom[audio]',
  // the 重生 ones: 扎罗's knock-out (M1 Talents/Reborn BuffToOwner ON_CAST_START enemy_wlfmster_trigger_fear), “巨大的丑东西”
  // up again (its RebornTalent's buff mcmstr_t_state_1[reborn]), a 守墓石像 taking wing (Switch2Fly/Born2Fly dugago_reborn),
  // an ember / 假想敌：再生 standing up (Prop mode Revive[Trigger] / enemy_acpupp_revive_listener's trigger), 喷气人 landing
  // (enemy_balloon_s[fly]'s end → balloon_s[land])
  'wlfmster:reborn': 'battle.ON_BUFF_START.enemy_wlfmster_reborn_start',
  'mcmstr:reborn': 'battle.ON_BUFF_START.mcmstr_t_state_1[reborn]',
  'dugago:reborn': 'battle.ON_BUFF_START.dugago_reborn',
  'duskls:revive': 'battle.ON_BUFF_TRIGGER.enemy_duskls_revive',
  'duskld:revive': 'battle.ON_BUFF_TRIGGER.enemy_duskld_revive',
  'acpupp:revive': 'battle.ON_CUSTOM_TRIGGER.acpupp_revive_1',
  'balloon:land': 'battle.ON_BUFF_START.balloon_s[land]',
  // the sim's own sound moments of them (fx 'kitHit', or `n` on the fx of that moment): 假想敌：铳's charge on each unit
  // (achunt_s_1[damage]) and its 【盲信之誓】 link on each unit (achunt_line_damage); “碎铳之簧”'s chase on each unit
  // (actrp*_s_1[damage]) and 法术护盾's counter on the attacker (actrpa_t_1); 深溟巢涌者's pulse (enemy_dsubrl_aoe[hit]) and
  // 鼎沸's (enemy_cjhot_t[aoe]) on each unit; 水遁忍者's spin (ymgtop_m1_t[rotate_attack]); 伊利昂的木驮兽 taking a passenger on
  // (enemy_mntrjn_add); 鸭爵 starting to run (duckmi_speed_up); a 愧悔魂灵圣杯 taking its share (enemy_lrrook[audio]);
  // “邪魔的利刃”'s hits (enemy_smgrd_damage_up) and its 国度 moving (enemy_smgrd_t_blackfog); 吉兆飞鳞 floating again (parrot_a[fly])
  'achunt:charge': 'battle.ON_BUFF_START.achunt_s_1[damage].hit_target',
  'achunt:chain': 'battle.ON_CUSTOM_TRIGGER.achunt_line_damage.chain_hit',
  'actrp:dash': 'battle.ON_BUFF_START.achunt_summonee.hit',
  'actrpa:shieldhit': 'battle.ON_CUSTOM_TRIGGER.actrpa_t_1.shield_hit',
  'dsubrl:hit': 'battle.ON_BUFF_TRIGGER.enemy_dsubrl_aoe[hit]',
  'cjhot:hit': 'battle.ON_CUSTOM_TRIGGER.enemy_cjhot_hit[audio]',
  'ymgtop:hit': 'battle.ON_CUSTOM_TRIGGER.ymgtop_hit_audio',
  'mntrjn:add': 'battle.ON_CUSTOM_TRIGGER.enemy_mntrjn_add',
  'duckmi:run': 'battle.ON_BUFF_START.duckmi_speed_up',
  'lrrook:share': 'battle.ON_BUFF_START.enemy_lrrook_take_dmg',
  'smgrd:up': 'battle.ON_CUSTOM_TRIGGER.smgrd_damage_up',
  'smgrd:hit': 'battle.ON_CUSTOM_TRIGGER.smgrd_damage',
  'smgrd:fog': 'battle.ON_CUSTOM_TRIGGER.smgrd_t_blackfog',
  'parrot:fly': 'battle.ON_CUSTOM_TRIGGER.parrot_fly',
  // 2026-11-03: 假想敌：骨刺 entering its Horror / Cute mode (each mode's passive audioSignal), 元核孽生者 waking
  // (dslntf_tr_1 PlayAudio `Awake`), 灼藤's first-attack burst (enemy_ftsjc[aoe]), “萨科塔之眼” taking a bullet
  // (hlegle_a[steal]), “帝国的甲胄”'s barrage range (enemy_vtsk_skillRange's end)
  'acbunn:horror': 'battle.ON_BUFF_START.enemy_acbunn[horror]',
  'acbunn:cute': 'battle.ON_BUFF_START.enemy_acbunn[cute]',
  'dslntf:awake': 'battle.ON_CUSTOM_TRIGGER.Awake',
  'ftsjc:aoe': 'battle.ON_CUSTOM_TRIGGER.enemy_ftsjc.aoe',
  'hlegle:steal': 'battle.ON_CUSTOM_TRIGGER.hlegle_steal_bullet_audio',
  'vtsk:range': 'battle.ON_CUSTOM_TRIGGER.enemy_vtsk_skillRange',
  // a hand of 假想敌：胄 back as its copy (acstma_s_1[copy_health] → mode 2 Back_End, passive acstma/acstmb_passive[unmovable])
  'acstma:back': 'battle.ON_BUFF_START.enemy_acstma_back',
  'acstmb:back': 'battle.ON_BUFF_START.enemy_acstmb_back',
  // 2026-11-11 (CN prefabs): 假想敌：鳍 (隐秘核心)'s storm talent aceel[thurder-trigger] (audioSignal Aceel_ThurderEnv, as it
  // starts — the 鳍's appearance), 假想敌：茧 (隐秘核心)'s 悲惨之雨 tile listeners' end (`_effectSettings` endAudioSignal acid_rain)
  'aceel:thunder': 'battle.ON_BUFF_START.Aceel_ThurderEnv',
  'acspider:rainend': 'battle.ON_CUSTOM_TRIGGER.acid_rain',
  // 2026-11-12, docs/rules/audio.md 「원소 폭발 소리」: an element burst as it starts — the enemy's burst buff carries the signal
  // (buff table ep_break_fire / water / sanity / anger_enemy audioSignal; ep_break_dark_enemy creates a buff with it), the
  // operator's burst template creates one (ep_break_fire / water / sanity / dark_char). START and SHOW_EFFECT both sound at
  // the buff's start (Entity.OnBuffStart → AddBuffEffect); only 灼燃 has a SHOW_EFFECT bank
  'ep:fire': 'battle.ON_BUFF_START.ep_break_fire_audio',
  'ep:fireshow': 'battle.ON_BUFF_SHOW_EFFECT.ep_break_fire_audio',
  'ep:water': 'battle.ON_BUFF_START.ep_break_water_audio',
  'ep:sanity': 'battle.ON_BUFF_START.ep_break_sanity_audio',
  'ep:dark': 'battle.ON_BUFF_START.ep_break_dark_audio',
  'ep:anger': 'battle.ON_BUFF_START.ep_break_anger_audio',
  // 2026-11-12 (EN prefabs and buff templates): a 萨卡兹子裔 knocked out — enemy_vampires[bloodsucker_summon] (ON_OWNER_KILLED,
  // not a FALLDOWN: CreateBuff with audioSignal bloodsucker_summon[audio]) / enemy_dthrow_summon[dzoms] (PlayAudio
  // enemy_summon_dzoms), both as it falls, before the summon's delay; 魂灵法骸 / 魂灵残迹 taking a soul (…[captureSoul]'s soulBuff,
  // audioSignal enemy_lrmzrd / lrwzrd_capture_soul); 神勇的帕拉杜利斯 setting off (Skills/rush ActionToOwner: SwitchMode Run +
  // PlayAudio enemy_mnctur_run) and striking (enemy_mnctur_collide_char PlayAudio enemy_mnctur_rush_hit); 假想敌：镜眼's
  // slow put on an arts attacker (acrefm[atk-spd-down] audioSignal enemy_9039_acrefm.refracting: a SHOW_EFFECT bank)
  'bloodsucker:summon': 'battle.ON_BUFF_START.bloodsucker_summon[audio]',
  'dzoms:summon': 'battle.ON_CUSTOM_TRIGGER.enemy_summon_dzoms',
  'lrmzrd:capture': 'battle.ON_BUFF_START.enemy_lrmzrd_capture_soul',
  'lrwzrd:capture': 'battle.ON_BUFF_START.enemy_lrwzrd_capture_soul',
  'mnctur:run': 'battle.ON_CUSTOM_TRIGGER.enemy_mnctur_run',
  'mnctur:hit': 'battle.ON_CUSTOM_TRIGGER.enemy_mnctur_rush_hit',
  'acrefm:slow': 'battle.ON_BUFF_SHOW_EFFECT.enemy_9039_acrefm.refracting',
  // 2026-11-12 (docs/rules/audio.md 「규정 새 적 소리 — 셋째」): the 悬赏 enemies — 遮天面包机's bomb dropped (enemy_nsbomb[passive]
  // TriggerAbility Bomb: the Talents/Passive ability's ON, signal T.Passive) and landed (its projectile's REACH: it needs no
  // target); 聆风猎手's Blink (Skills/Blink START) and its end (shkrbt_blink_end); 暴走食人花 digesting to the end
  // (enemy_trwlpl_s ON_BUFF_FINISH, alive: PlayAudio enemy_trwlpl_eat_complete) or killed while digesting (its
  // ON_BEFORE_TRY_SET_HP_ZERO out of mode 0: PlayAudio enemy_trwlpl_eat_failed); 赘生甲壳 made and destroyed (its own
  // ON_UNIT_BORN / ON_UNIT_DEAD banks)
  'nsbomb:drop': 'battle.ON_ABILITY_ON.enemy_10147_nsbomb.T.Passive',
  'nsbomb:reach': 'battle.ON_PROJECTILE_REACH.projectile_enemy_nsbomb',
  'shkrbt:blink': 'battle.ON_ABILITY_START.enemy_2135_shkrbt.Blink',
  'shkrbt:blinkend': 'battle.ON_CUSTOM_TRIGGER.shkrbt_blink_end',
  'trwlpl:digested': 'battle.ON_CUSTOM_TRIGGER.enemy_trwlpl_eat_complete',
  'trwlpl:vomit': 'battle.ON_CUSTOM_TRIGGER.enemy_trwlpl_eat_failed',
  'dsshell:born': 'battle.ON_UNIT_BORN.trap_156_dsshell',
  'dsshell:dead': 'battle.ON_UNIT_DEAD.trap_156_dsshell',
  // 염괴포 (trap_196_cnnon, the 规程 stage cannon) taking an enemy aboard: its DurbusAbility's `_buffsWhenCarryPassenger`
  // cnnon_carry_enemy, audioSignal cnnon_carry_enemy_audio. Its shot here is the talent EnemyCannon00D and the shell
  // projectile_trap_cnnon_small_death — neither sets a signal of its own, and zh_CN audio_data has banks only for the main
  // story boss's EnemyCannon00 / 10 and projectile_trap_cnnon_small / large: the shot and the landing sound nothing
  'cnnon:carry': 'battle.ON_BUFF_START.cnnon_carry_enemy_audio',
  // 2026-11-12 (docs/rules/diy.md 「선발 추가 사일런스 더 패러디그매틱·외드레르·메커니스트」 소리): 淬羽赫默 S3's 不死 (slent2_s_3
  // ON_BEFORE_TRY_SET_HP_ZERO: CreateBuff with audioSignal slent2_shallow_grave_audio); 机械师 S2's 屏障 breaking while S2 runs
  // (mcnist_s_2_shield ON_TAKE_DAMAGE, the burst branch: PlayAudio mcnist_s_2_shield), S3's 结构性原理 charge (its
  // projectile's BORN and REACH — the four projectiles with banks share these files) and the cross landing
  'slent2:grave': 'battle.ON_BUFF_START.slent2_shallow_grave_audio',
  'mcnist:s2shield': 'battle.ON_CUSTOM_TRIGGER.mcnist_s_2_shield',
  'mcnist:s3born': 'battle.ON_PROJECTILE_BORN.projectile_chr_mcnist_s3_token',
  'mcnist:s3reach': 'battle.ON_PROJECTILE_REACH.projectile_chr_mcnist_s3_token',
  'mcnist:s3hit': 'battle.ON_CUSTOM_TRIGGER.mcnist_skill_attack_hit',
  // 2026-11-13 (docs/rules/audio.md 「유키 마코토 페르소나 소리」, CN client): 结城理's switches — the SwitchEnd step's
  // AudioOnEventBehaviour (ON_CAST_START) of makoto[switch2stand_s1 / _s2 / _s3_1 / _s3_2], the AlloutAttack one of
  // makoto[switch2normal_allout] —, the OnPlayAudioPlayer of his effect prefabs (the modes' range `_start` attach effects,
  // makoto_talent_finish_01's flash and damage, makoto_skill_01_heal_01, makoto_skill_02_hit_01_finish) and the PlayAudio of
  // his buff templates (makoto_s3_1_standin ON_CALCULATE_DAMAGE by the damage type, makoto_s3_2_be_healed ON_BUFF_FINISH)
  'makoto:s1gun': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_01_orpheus_gun',
  'makoto:s2gun': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_02_thanatos_gun',
  'makoto:s3gun': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_thanatos_gun',
  'makoto:s3orpheus': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_orpheus_gun',
  'makoto:s2range': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_02_range_appear',
  'makoto:s3range1': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_1_range_appear',
  'makoto:s3range2': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_2_range_appear',
  'makoto:allout': 'battle.ON_CUSTOM_TRIGGER.makoto_allout_start',
  'makoto:alloutFlash': 'battle.ON_CUSTOM_TRIGGER.makoto_allout_flash',
  'makoto:alloutHit': 'battle.ON_CUSTOM_TRIGGER.makoto_allout_damage',
  'makoto:s1heal': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_01_heal_hit',
  'makoto:execute': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_02_execute',
  'makoto:s3phys': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_1_physical',
  'makoto:s3arts': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_1_magical',
  'makoto:s3heal': 'battle.ON_CUSTOM_TRIGGER.makoto_skill_03_heal_hit',
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

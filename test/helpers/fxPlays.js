// test/helpers/fxPlays.js — a fixed copy of the plays (tools/build-fx-plays.mjs → public/assets/local/fx/plays.json, git-ignored)
// of the client keys the render tests play, so they run without the client-only binding rows: each pair is one the hand
// effect tables named themselves before they named the key (docs/rules/fx.md 「바인딩 표」 「클라 키로 재생」). Empty roles
// left out; a key's rows behind conditions (`when`, 묶음 K3) whole, as the table has them. test/render/fx-bindings.test.js
// checks it against the tables when the client-only rows are there.

export const PLAYS = Object.freeze({ keys: {
  'indigo_t[unmovable]': { held: ['indigo_buff_01_start'] },
  'mizuki_s_2[unmovable]': { held: ['mizuki_skill_02_buff_02'] },
  'gnosis_t_2[effect]': { held: ['common_ resistance_01'] },
  'surtr_t_2[withdraw]': { held: ['surtr_buff_01_start'] },
  'sntlla_t_1[atk]': { held: ['common_ resistance_01'] },
  'udflow_t_1': { held: ['udflow_debuff_01'] },
  'agoat2_t_1': { held: ['agoat2_recover_01'] },
  'inside_t_1[active]': { held: ['inside_buff_01_start'] },
  'rosmon_t_2': { held: ['rosmon_buff_01_start'] },
  'texas2_t_2': { held: ['texas2_buff_01_start'] },
  'dusk_t_2[spawn]': { held: ['dusk_buff_04_start'] },
  'halo2_t_2[fx]': { held: ['halo2_talent_01'] },
  'ep_break_dark[damage]': { held: ['common_darkdamage_debuff'] },
  'ep_fire_magic_res_down': { held: ['buff_burn'] },
  'ep_water_def_down': { held: ['buff_defdown'] },
  'archet_t_2': { held: ['archet_buff_01_start'] },
  'demkni_t_1': { held: ['demkni_buff_01_self'] },
  'catsld_t_1[shield_mark]': { held: ['token_cathy_catsld_shield_01'], end: ['token_cathy_catsld_shield_01_end'] },
  'cello_t_1': { held: ['cello_buff_01'] },
  'flower_t_1[eff]': { held: ['flower_buff_01_range'] },
  'blemsh_t_2': { held: ['blemsh_buff_01_start'] },
  'projectile_chr_oblvns': { trail: ['oblvns_attack_01_trail'], hit: ['oblvns_attack_01_hit'] },
  'projectile_chr_oblvns_talent': { trail: ['oblvns_talent_trail'], hit: ['oblvns_attack_01_hit'] },
  'projectile_chr_oblvns_s1_1': { trail: ['oblvns_skill_01_trail'], hit: ['oblvns_skill_01_hit'] },
  'projectile_chr_oblvns_s1_8': { trail: ['oblvns_skill_01_trail_08'], hit: ['oblvns_skill_01_hit'] },
  'projectile_chr_oblvns_s2': { trail: ['oblvns_skill_02_trail_02'], hit: ['oblvns_skill_02_hit_02'] },
  'projectile_chr_oblvns_s2_slow': { trail: ['oblvns_skill_02_trail'], hit: ['oblvns_skill_02_hit'] },
  'projectile_chr_oblvns_s3_phy': { trail: ['oblvns_skill_03_trail_02'], hit: ['oblvns_skill_03_hit_02'] },
  'projectile_chr_oblvns_s3_mag': { trail: ['oblvns_skill_03_trail'], hit: ['oblvns_skill_03_hit'] },
  'char_1033_swire2/Modes/S3_End/Body/Trigger': { held: ['swire2_skill_03_range', 'swire2_skill_03_start_03', 'swire2_skill_03_start_03_02'] },
  'projectile_chr_swire2_s_3': { trail: ['swire2_skill_03_trail'], hit: ['swire2_skill_03_hit_02'] },
  'char_1041_angel2/Modes/S3/Body/Attack/S3FireToToken': { held: ['angel2_skill_3_begin_start_001'] },
  'projectile_chr_angel2_s3_start': { trail: ['angel2_skill_3_begin_trail_01'], reach: ['angel2_skill_3_begin_range_01'] },
  'projectile_chr_sntlla_s2': { reach: ['sntlla_skill_02_start_01'], hit: ['sntlla_attack_hit_02'] },
  'icetgt_a[effect]': { held: ['sbell2_tile_frozen'], end: ['sbell2_tile_defrost'] },
  'kalts2_s_3[withdraw]': { once: ['kalts2_skill_03_teleport_02'] },
  // 묶음 K3: rows behind conditions travel as `when` (render/fx/conds.js)
  'horn_s_2[overload_switch_effect]': { when: [
    { role: 'held', n: 'horn_skill_02_buff_03_back', b: 'horn_s_2[overload_switch_effect_down]', if: ['CheckCharacterDefaultDirection(UP)'] },
    { role: 'held', n: 'horn_skill_02_buff_03_front', b: 'horn_s_2[overload_switch_effect_normal]', if: ['!CheckCharacterDefaultDirection(UP)'] },
  ] },
  'horn_s_3[overload_switch_effect]': { when: [
    { role: 'held', n: 'horn_skill_03_buff_02_03_back', b: 'horn_s_3[overload_switch_effect_down]', if: ['CheckCharacterDefaultDirection(UP)'] },
    { role: 'held', n: 'horn_skill_03_buff_02_03_front', b: 'horn_s_3[overload_switch_effect_normal]', if: ['!CheckCharacterDefaultDirection(UP)'] },
  ] },
  'pepe_s_3_fx': { when: [
    { role: 'once', n: 'pepe_skill_03_hit_range_01', if: ['!FilterByBuffStackCount(GE @max_stack_cnt pepe_s3_range[atk])', '!FilterByBuffStackCount(GE 2 pepe_s3_range[atk])'] },
    { role: 'once', n: 'pepe_skill_03_hit_range_02', if: ['!FilterByBuffStackCount(GE @max_stack_cnt pepe_s3_range[atk])', 'FilterByBuffStackCount(GE 2 pepe_s3_range[atk])'] },
    { role: 'once', n: 'pepe_skill_03_hit_range_03', if: ['FilterByBuffStackCount(GE @max_stack_cnt pepe_s3_range[atk])'] },
  ] },
  'kroos2_s_2[warming_counter]': { when: [
    { role: 'held', n: 'kroos2_skill_02_buff_01', b: 'kroos_s_2[warmed_effect_01]', if: ['FilterByBuffStackCount(GE @max_stack_count kroos2_s_2[warming_counter])', 'CheckUnitCurrentMode(2)'] },
    { role: 'held', n: 'kroos2_skill_02_buff_02', b: 'kroos_s_2[warmed_effect_02]', if: ['FilterByBuffStackCount(GE @max_stack_count kroos2_s_2[warming_counter])', 'CheckUnitCurrentMode(2)'] },
    { role: 'held', n: 'kroos2_skill_02_buff_03', b: 'kroos_s_2[warmed_effect_03]', if: ['FilterByBuffStackCount(GE @max_stack_count kroos2_s_2[warming_counter])', 'CheckUnitCurrentMode(2)'] },
  ] },
  'blaze2_t_2': { held: ['blaze2_revive_buff_03'], when: [
    { role: 'held', n: 'blaze2_revive_buff', b: 'blaze2_t_2[reborn_state]', if: ['!CheckUnitCurrentMode(1)'] },
  ] },
  'nymph_t_1[listener]': { when: [
    { role: 'held', n: 'nymph_talent_buff_01', b: 'nymph_t_1[ep_damage]', if: ['FilterEPBreakRecoveryType', '!CheckContainsBuff(nymph_e_003_t_1[ep_damage]|nymph_t_1[ep_damage])'] },
    { role: 'held', n: 'nymph_talent_buff_01', b: 'nymph_t_1[ep_damage]', if: ['FilterEPBreakRecoveryType'] },
  ] },
  'kalts2_s_3[indicator_fx]': { held: ['kalts2_skill_03_indicator_head_01'] },
  'mlyss_wtrman_switch_melee_trigger': { once: ['token_10030_mlyss_wtrman_c1_to_c2'] },
  'mlyss_wtrman_switch_range_trigger': { once: ['token_10030_mlyss_wtrman_c1_to_c3'] },
  'char_lemuen_range_aim': { held: ['lemuen_talent_buff_01'] },
  'reed2_t_1': { when: [
    { role: 'held', n: 'reed2_debuff_01', b: 'reed2_talent_1[debuff]', if: ['Dice', 'CheckContainsBuff(reed2_talent_1[debuff])', '!FilterByBlackboardValue'] },
    { role: 'held', n: 'reed2_debuff_01', b: 'reed2_talent_1[debuff]', if: ['Dice', 'CheckContainsBuff(reed2_talent_1[debuff])', 'FilterByBlackboardValue'] },
    { role: 'held', n: 'reed2_debuff_01', b: 'reed2_talent_1[debuff]', if: ['Dice'] },
  ] },
  'ines_t_1[enemy][unmove]': { when: [
    { role: 'held', n: 'ines_imprison_01', b: 'ines_t_1[enemy][unmove]', if: ['IsDamage', 'IfTarget', '!CheckContainsBuff(ines_t_1[enemy][mark])'] },
  ] },
  'mlyss_s_3[unmoveable]': { when: [
    { role: 'held', n: 'token_10030_mlyss_wtrman_c3_debuff_01', b: 'mlyss_s_3[unmoveable]', if: ['FilterAbilityFamily'] },
  ] },
  'qiubai_s_1[unmovable_effect]': { when: [
    { role: 'held', n: 'qiubai_skill_01_buff', b: 'qiubai_unmovable[effect]', if: ['!CheckAbnormalImmune'] },
  ] },
  'papyrs_t_1[shield_core]': { when: [
    { role: 'held', n: 'papyrs_talent_01', b: 'papyrs_t_1[shield_core]', if: ['IsCharacter', 'CheckContainsBuff(papyrs_t_1[shield_core])', '!FilterByBlackboardValue'] },
    { role: 'held', n: 'papyrs_talent_01', b: 'papyrs_t_1[shield_core]', if: ['IsCharacter', 'CheckContainsBuff(papyrs_t_1[shield_core])', 'FilterByBlackboardValue'] },
    { role: 'held', n: 'papyrs_talent_01', b: 'papyrs_t_1[shield_core]', if: ['IsCharacter'] },
  ] },
  'pasngr_t_1[enhance]': { when: [
    { role: 'held', n: 'pasngr_beidong_buff_01', b: 'pasngr_t_1[enhance]', if: ['FilterByTargetHpRatio'] },
  ] },
  'halo2_t_2[full]': { when: [
    { role: 'held', n: 'halo2_talent_02', b: 'halo2_t_2[full]', if: ['CheckMainBuffId', 'IfTargetEqual', 'FilterByBuffStackCount(GE @max_stack_cnt halo2_t_2[attack_speed])'] },
  ] },
  'chen3_t2[evade]': { when: [
    { role: 'held', n: 'chen3_Shield_buff_01', b: 'chen3_t2[evade]', if: ['FilterByBuffStackCount(GE @stack_time chen3_t2[stack])'] },
    { role: 'held', n: 'chen3_Shield_buff_01', b: 'chen3_t2[evade]', if: ['FilterByCharacterSharedBlackboard', 'FilterByBlackboardValue', 'FilterByCharacterSharedBlackboard'] },
  ] },
  'tippi_t[evade]': { when: [
    { role: 'held', n: 'tippi_buff_01', b: 'tippi_t[evade]', if: ['FilterByBuffStackCount(GE @stack_time tippi_t[stack])'] },
  ] },
  'dusk_t_1': { held: ['dusk_buff_03_start'], when: [
    { role: 'held', n: 'dusk_buff_03_start_02', b: 'dusk_t_1[effect]', if: ['FilterByBuffStackCount(EQUALS @max_stack_cnt dusk_t_1[atk])'] },
  ] },
  'rockr_t_1': { when: [
    { role: 'held', n: 'rockr_buff_01', b: 'rockr_t_1[effect_1]', if: ['FilterByBuffStackCount(EQUALS @max_stack_cnt rockr_t_1[atk])'] },
  ] },
  'ascln_t_1': { when: [
    { role: 'held', n: 'ascln_buff_01', b: 'ascln_t_1[debuff]', if: ['CheckMotionMode'] },
    { role: 'held', n: 'ascln_buff_01', b: 'ascln_t_1[debuff]', if: ['FilterDamageModifer'] },
    { role: 'held', n: 'ascln_buff_02', b: 'ascln_t_1[max_eff]', if: ['FilterByBuffStackCount(GE @max_stack_cnt ascln_t_1[debuff])'] },
  ] },
  'billro_s_3[mark_effect]': { when: [
    { role: 'held', n: 'billro_skill_03_buff_03_01', b: 'billro_s_3[mark_effect][part]', if: ['!FilterByBuffStackCount(GE 5 billro_s_3[charge][enhance])', 'FilterByBuffStackCount(GE 1 billro_s_3[charge][enhance])'] },
    { role: 'held', n: 'billro_skill_03_buff_03_02', b: 'billro_s_3[mark_effect][full]', if: ['FilterByBuffStackCount(GE 5 billro_s_3[charge][enhance])'] },
  ] },
  'mlynar_tr': { when: [
    { role: 'held', n: 'mlynar_attack_01_buff_L_01', b: 'mlynar_tr_effect[a]', if: ['!CheckContainsBuff(mlynar_s_cast)'] },
    { role: 'held', n: 'mlynar_attack_01_buff_L_02', b: 'mlynar_tr_effect[b]', if: ['!CheckContainsBuff(mlynar_s_cast)', 'CheckContainsBuff(mlynar_tr_effect[a])', 'FilterByBuffStackCount(GE @mid_stack_cnt mlynar_tr_atk)'] },
    { role: 'held', n: 'mlynar_attack_01_buff_L_03', b: 'mlynar_tr_effect[c]', if: ['!CheckContainsBuff(mlynar_s_cast)', 'CheckContainsBuff(mlynar_tr_effect[a])', 'FilterByBuffStackCount(GE @mid_stack_cnt mlynar_tr_atk)', 'CheckContainsBuff(mlynar_tr_effect[b])', 'FilterByBuffStackCount(GE @max_stack_cnt mlynar_tr_atk)'] },
  ] },
} });

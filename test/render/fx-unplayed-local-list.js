// test/render/fx-unplayed-local-list.js — the client-only binding rows (public/assets/local/fx/bindings.json) with an extracted
// prefab that nothing in render/ plays (test/helpers/fxBindings.js unplayed): an operator's or summon's effect the official
// client shows and this one does not. Each has a status:
//   'ok: …'   drawn another way, or never shown in this mode — say which;
//   'todo: …' the official effect is not drawn yet.
// The 重构体's idle and aura effects sat among such rows, unseen, until 2026-11-04. test/render/fx-bindings.test.js checks the
// list both ways, so a new operator's unplayed rows have to be looked at. 'key|prefab' → status.

export const UNPLAYED_LOCAL = Object.freeze({
  "skchr_aglna2_3/Toggle/BlockToggle|aglna2_skill_03_range_line_01": "todo: S3 BlockToggle's edge line (_edgeLineRendererEffectKey)",
  "mlyss_wtrman_t_1[trigger]|token_10030_mlyss_wtrman_c0": "todo: 流形's Recharge look (c0) while it waits to stand up again (its mode 0's buff)",
  "mlyss_wtrman_t_1[listener]|token_10030_mlyss_wtrman_c1_to_c0": "todo: 流形 back to c0 as it falls (its form by mode)",
  "mlyss_wtrman_t_1[listener]|token_10030_mlyss_wtrman_c2_to_c0": "todo: 流形 back to c0 as it falls (its form by mode)",
  "mlyss_wtrman_t_1[listener]|token_10030_mlyss_wtrman_c3_to_c0": "todo: 流形 back to c0 as it falls (its form by mode)",
  "char_206_gnosis/Others/Direction/Talents/1|buff_frozen_to_enemy": "todo: 灵知 T1's hit on a frozen enemy",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_buff_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_buff_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_buff_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_buff_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_buff_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_buff_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_buff_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_buff_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_charge_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_charge_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_charge_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_charge_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_charge_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_charge_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_charge_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_charge_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "projectile_chr_ebnhlz_elite|ebnhlz_attack_hit_red": "todo: 黑键's elite shots (projectile_chr_ebnhlz_elite / _s1_elite: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_start_02_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_start_02_orange_2": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_start_02_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_start_02_orange_3": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_start_02_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_start_02_orange_4": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackDefault|ebnhlz_attack_start_02_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "char_4046_ebnhlz/Trait/ChargeAttackGroup/ExChargeAttackS1|ebnhlz_attack_start_02_orange": "todo: 黑键's store stages in the elite's colour (_chargeEffectGroups: the render keeps the normal ones)",
  "projectile_chr_ebnhlz_elite|ebnhlz_attack_trail_red": "todo: 黑键's elite shots (projectile_chr_ebnhlz_elite / _s1_elite: the render keeps the normal ones)",
  "projectile_chr_ebnhlz_s1_elite|ebnhlz_skill_01_hit_red": "todo: 黑键's elite shots (projectile_chr_ebnhlz_elite / _s1_elite: the render keeps the normal ones)",
  "projectile_chr_ebnhlz_s1_elite|ebnhlz_skill_01_trail_red": "todo: 黑键's elite shots (projectile_chr_ebnhlz_elite / _s1_elite: the render keeps the normal ones)",
  "haruka_t_1|haruka_talent_01_buff": "todo: 遥's bubble (haruka_t_1 _activeBuffs): the kit's 'shield' event draws another",
  "headb2_t_2[fx]|headb2_buff": "todo: 怒潮凛冬's high-ground hit and tile effects (_hitEffectKey / _tileEffectKey)",
  "projectile_chr_horn_s2_full_02|horn_skill_02_hit_02_02_02": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_melee_02|horn_skill_02_hit_02_02_02": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_03|horn_skill_02_hit_02_02_03": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_melee_03|horn_skill_02_hit_02_02_03": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_04|horn_skill_02_hit_02_02_04": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_melee_04|horn_skill_02_hit_02_02_04": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_05|horn_skill_02_hit_02_02_05": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_melee_05|horn_skill_02_hit_02_02_05": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_02|horn_skill_02_trail_02_02": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_03|horn_skill_02_trail_02_03": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_04|horn_skill_02_trail_02_04": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_horn_s2_full_05|horn_skill_02_trail_02_05": "todo: 号角 S2's stored shots by stage (projectile_chr_horn_s2_full_* / melee_*)",
  "projectile_chr_svash2_s3_bird|svash2_skill_03_trail_left_01": "todo: 凛御银灰 S3's bird trail by direction (_effectsAlignToProjectileDirection)",
  "projectile_chr_svash2_s3_bird|svash2_skill_03_trail_right_01": "todo: 凛御银灰 S3's bird trail by direction (_effectsAlignToProjectileDirection)",
  "thorns_t_1|thorns_buff_01_start": "todo: 棘刺 T1's hit, a LIMITED buff of length 0",
});

// The client-only rows whose prefab is extracted nowhere (tools/fx-wiring-report.mjs `foreign`: it sits in another bundle or a
// shared one), each looked at (2026-11-15): 'ok: …' never shown in this mode — say why; 'todo: …' shown but not drawn yet.
// A row the client draws here is extracted into its operator's bundle (fx_extract.py --bundle <it> --pack <the bundle> --prefab …)
// and leaves this list. test/render/fx-overlap.test.js checks it both ways. 'key|prefab' → status.
export const FOREIGN_LOCAL = Object.freeze({
  'char_325_bison/Modes/S2/Body/Attack|moeshd_attack_01_hit': "ok: 拜松 S2 holds no attack in this mode (the kit's S2 does not swing)",
  'char_325_bison/Modes/S2/Body/Attack|moeshd_attack_01_start': "ok: 拜松 S2 holds no attack in this mode (the kit's S2 does not swing)",
  'projectile_chr_qiubai_s1_effect|qiubai_skill_01_buff_boom': 'ok: 仇白 S1 is not offered — her pieces carry S3 in both seasons and she is no 补位',
  ...Object.fromEntries([['3', 'L_01'], ['4', 'L_02'], ['5', 'R_01'], ['6', 'R_02']].flatMap(([i, side]) => [`gdglow_token_exp_${side}`, 'gdglow_token_explosion_01']
    .map((n) => [`projectile_chr_gdglow_funnel_s12_${i}|${n}`, "ok: 洛洛 S2Funnel's `_extraProjectileKeys` (澄闪's funnels) are only gathered to preload "
      + '(RangedAttack.GatherProjectiles is the one reader of the private field, 공식 클라에서 확인): she never fires them']))),
  'char_4211_snhunt/Others/Direction/Talents/-1|common_hunter_bullet_01': "todo: the 猎手 HUD bullet bar (hunter_bullet_bar_plugin, UIFollowHunterBulletSlider "
    + '`_effectKey`) plays it as rounds are added — a HUD piece this remake does not draw yet; the row is its preload list',
});

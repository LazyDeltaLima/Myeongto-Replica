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
  // 号角 S2's Full Burst shots: BurstRangedAttack.GetProjectileKey picks `_burstProjectiles`[bullets left − 1] (공식 클라에서 확인) —
  // fired only by the manual early close while overloaded (BurstCastSkill `_burstOnOverload`), which the auto battle never does
  ...Object.fromEntries(['02', '03', '04', '05'].flatMap((i) => [[`full_${i}`, `hit_02_02_${i}`], [`melee_${i}`, `hit_02_02_${i}`], [`full_${i}`, `trail_02_${i}`]]
    .map(([p, n]) => [`projectile_chr_horn_s2_${p}|horn_skill_02_${n}`, "ok: 号角 S2's Full Burst shot (rules/fx.md 「투사체 정지 이펙트·스킬 투사체 명중」): never in the auto battle"]))),
  "projectile_chr_svash2_s3_bird|svash2_skill_03_trail_left_01": "ok: 凛御银灰 S3's bird on an ally (BirdAttack_Ally): only the ally the player hands 风雪之眼 to (svash2_s_3[target_bird_onuse] → [summon_bird], CreateBuffToCardUidCharacter) fires it — the auto battle never hands it out (kits chess_char_5_14-svash2.js)",
  "projectile_chr_svash2_s3_bird|svash2_skill_03_trail_right_01": "ok: 凛御银灰 S3's bird on an ally (BirdAttack_Ally): only the ally the player hands 风雪之眼 to (svash2_s_3[target_bird_onuse] → [summon_bird], CreateBuffToCardUidCharacter) fires it — the auto battle never hands it out (kits chess_char_5_14-svash2.js)",
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

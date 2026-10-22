// test/render/fx-bindings.test.js — the hand-written effect tables of render/ checked against the binding table
// (docs/rules/fx.md 「바인딩 표」, maintainer decision 2026-10-22). Each `cite`d entry (render/fx/cite.js) names the client key
// it stands for; the rows of that key (tools/assets/fx-templates.json, tracked; public/assets/local/fx/bindings.json, the
// client-only rows, git-ignored) must hold the entry's prefabs with a lifetime and a side that agree — or the entry is in
// KNOWN with the reason. The template rows nothing in render/ plays are listed in UNPLAYED (local: it needs the extracted
// effects). Without the client-only rows only what the template rows show is judged (test/helpers/fxBindings.js judge).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadTables, handEntries, judge, unplayed, renderNames } from '../helpers/fxBindings.js';
import { KIT_OFFICIAL } from '../../public/js/render/fx/kitofficial.js';
import { KEY_FX, SOURCE_FX, LAYER_FX, STACK_FX, END_FX } from '../../public/js/render/fxstatus.js';
import { TALENT_ALWAYS, NOTE_FX } from '../../public/js/render/fxmap.js';

const T = loadTables();
const LOCAL = !!T.local;

/**
 * fxgame.js: the prefab names its functions hold (not the KIT_OWNED list: kitofficial.js plays those) → the client key
 * each stands for. Checked like the tables' cites (presence only: the functions decide the lifetime).
 */
const FXGAME = {
  token_wang_skill_01_hit: 'projectile_chr_wang_stone1', token_wang_skill_02_hit: 'projectile_chr_wang_stone2',
  token_wang_skill_02_hit_02: 'projectile_chr_wang_stone2', token_wang_skill_03_hit: 'projectile_chr_wang_stone3',
  token_wang_skill_03_hit_02: 'projectile_chr_wang_stone3',
  token_wang_birth_01_buff: 'token_10064_wang_stone1', token_wang_01_buff: 'token_10064_wang_stone1',
  token_wang_passive_01_line: 'token_10064_wang_stone1',
  wang_passive_01_buff: 'projectile_chr_wang_stone1', wang_passive_01_buff_02: 'projectile_chr_wang_stone1',
  wang_passive_01_start: 'char_2027_wang/Modes/Default/Body/GeneralAbilities/SpawnToken/BuildStone',
  screen_desert_up_to_down: 'sand_storm[camera_effect]', screen_desert_down_to_up: 'sand_storm[camera_effect]',
  screen_desert_right_to_left: 'sand_storm[camera_effect]', screen_desert_left_to_right: 'sand_storm[camera_effect]',
  map_desert_02_left: 'sand_storm[trap]',
  yu_skill3_range_01_root: 'skchr_yu_3', yu_skill3_range_01: 'skchr_yu_3', yu_skill3_range_01_R: 'skchr_yu_3',
  yu_skill3_range_01_L_end: 'skchr_yu_3', yu_skill3_range_01_R_end: 'skchr_yu_3', yu_skill3_annex_01: 'skchr_yu_3/Aura/EnemyAura',
  whitw2_skill_03_token_trail_01: 'projectile_chr_whitw2_funnel_s3_1', whitw2_skill_03_token_hit_01: 'whitw2_s3_p[create_projectile]',
  common_buff_parry_01: 'DefaultEffects.BLOCK', mudrok_buff_01_hit: 'mudrok_t_1',
  common_firedamage_hit: 'ep_break_fire_enemy', common_waterElementExplosion: 'ep_break_water_char',
  common_waterdamage_hit: 'ep_break_water_enemy', common_darkdamage_hit: 'ep_break_dark_enemy',
  common_nerve_injury_01_hit: 'ep_break_sanity_char',
  clemnt_skill_02_bullet_01: 'skchr_clemnt_2', clemnt_skill_02_bullet_02: 'skchr_clemnt_2', clemnt_skill_02_bullet_range_01: 'skchr_clemnt_2',
  clemnt_skill_02_mark_01: 'clemnt_s2[emit_projectile]', clemnt_skill_02_mark_02: 'clemnt_s2[sync_passenger_info]',
  clemnt_skill_02_mark_enemy: 'clemnt_s2[projectile_hit]', clemnt_skill_03_Mark_all_01: 'projectile_chr_clemnt_s3',
  kalts2_skill_02_range_heal_01: 'projectile_chr_kalts2_s2_heal', kalts2_skill_02_range_damage_01: 'projectile_chr_kalts2_s2_dmg',
  kalts2_skill_02_indicator_heal_01: 'projectile_chr_kalts2_s2_heal', kalts2_skill_02_range_damage_01_delay: 'projectile_chr_kalts2_s2_heal',
  kalts2_skill_02_indicator_damage_01: 'projectile_chr_kalts2_s2_dmg', kalts2_skill_02_range_heal_01_delay: 'projectile_chr_kalts2_s2_dmg',
  kalts2_skill_03_teleport_01: 'char_1052_kalts2/Others/Direction/Talents/-1', kalts2_skill_03_teleport_trail_01: 'projectile_chr_kalts2_s3_2',
  kalts2_skill_03_teleport_end_01: 'char_1052_kalts2/Others/Direction/CommonAbility/RespawnBorn',
  aglna2_skill_03_fly_trail_01: 'char_1015_aglna2/Modes/S3Move/Body/GeneralAbilities/Ability0', aglna2_skill_03_buff_right_01: 'aglna2_s_3[mode]',
  aglna2_skill_02_fly_trail_up_01: 'skchr_aglna2_2', aglna2_skill_02_fly_range_01: 'skchr_aglna2_2',
  aglna2_skill_02_fly_end_01: 'skchr_aglna2_2', aglna2_skill_02_fly_end_02: 'skchr_aglna2_2', aglna2_skill_02_fly_end_03: 'skchr_aglna2_2',
  token_aglna2_agairp_01: 'token_10071_aglna2_agairp/Others/Direction/CommonAbilities/Passive',
  svash2_skill_03_trail_02: 'svash2_s_3[bird_on_target]',
  vigil_token_start: 'token_10028_vigil_wolf/Modes/Recharge/Body/Talents/1', vigil_token_ghost: 'token_10028_vigil_wolf/Modes/Recharge/Body/Talents/1',
  vigil_token_sub_start_1: 'vigil_wolf_t_1_enhance[holder]', vigil_token_sub_die_1: 'vigil_wolf_t_1[listener]',
  vigil_token_die: 'vigil_wolf_t_1[listener]', vigil_token_buff_1: 'vigil_wolf_t_1[block_cnt]',
  vigil_token_sub_attack_1: 'token_10028_vigil_wolf/Modes/Default/Body/Attack', vigil_token_skill_02_ready: 'vigil_s_2',
  vigil_token_skill_02_hint: 'vigil_wolf_s_2', vigil_token_heal: 'vigil_wolf_s_1[enhance]',
  vigil_token_attack_hit_1: 'vigil_wolf_hit_effect', vigil_token_attack_hit_extra: 'vigil_wolf_hit_effect',
  chen3_skill_02_hit_01: 'skchr_chen3_2', wisdel_bomb_01_hit: 'wisdel_t_1[projectile_shock]',
  oblvns_combat_01_start: 'char_4182_oblvns/Modes/Default/Body/Combat', reed2_debuff_boom_01: 'skchr_reed2_3',
  lemuen_skill_03_crosshair_01: 'lemuen_proj_s3_effect', lemuen_skill_03_trail_01: 'projectile_chr_lemuen_s3_aim',
  lemuen_skill_03_crosshair_range: 'projectile_chr_lemuen_s3', lemuen_skill_03_crosshair_02: 'projectile_chr_lemuen_s3_aim',
  lemuen_skill_03_hit_01: 'projectile_chr_lemuen_s3_attack', lemuen_skill_03_trail_02: 'projectile_chr_lemuen_s3_attack',
};

/**
 * Known disagreements, 'TABLE entry|prefab' (prefab '*': the entry's keys have no row) → [kind, reason]. A bug candidate
 * stays here until it is fixed (then the line goes) or judged (the reason says why the hand entry is right).
 */
const KNOWN = {
  'KIT_OFFICIAL shield.agoat2|agoat2_skill_02_range_01': ['missing', 'the prefab is skchr_agoat2_2/Shield/Aura `_effects`, not the buff agoat2_s_2[shield]\'s: lives with the Aura [추정: as long as the barrier]'],
  'KIT_OFFICIAL candle.etlchi|etlchi_skill_03_ghosting_01': ['missing', 'held by the summoned 心烛 (enemy_5601_entlec) prefab: an enemy outside the pool extract'],
  'KIT_OFFICIAL candle.etlchi|etlchi_skill_03_line_01': ['life', 'entlec_a[line_effect_core] CreateLineEffect at ON_BUFF_START (once); drawn while both stand [추정: the line prefab loops]'],
  'KIT_OFFICIAL airstrike.angel2|angel2_skill_3_begin_start_001': ['life', 'S3FireToToken `_castEffects` hold for the cast; an empty prefab, played once'],
  'KIT_OFFICIAL talent.bpipe|bpipe_attack_02_hit': ['missing', 'bpipe_t_1 SplashDamage `_createEffect` reads the talent blackboard `effect`: no effect node in the tables'],
  'KEY_FX svash2:barrier|*': ['untabled', 'no svash2_s_1[build] in either template dataset or the client rows: the 屏障 card\'s buff key is unconfirmed'],
  'STACK_FX rmixer:t1|rmixer_buff_02': ['missing', 'swapped in by rmixer_buff_01\'s own SwitchableEffectByBuffStackCnt (a component of the prefab), not a buff row'],
  'DEPLOY_FX DEPLOY_FX|*': ['untabled', 'the client\'s default effects (DefaultEffects), not a binding row'],
  'fxgame screen_desert_up_to_down|screen_desert_up_to_down': ['missing', 'sand_storm[camera_effect] creates screen_desert_*_empty (SwitchDirection branches): bug candidate — the _empty prefab or this one'],
  'fxgame screen_desert_down_to_up|screen_desert_down_to_up': ['missing', 'as screen_desert_up_to_down'],
  'fxgame screen_desert_right_to_left|screen_desert_right_to_left': ['missing', 'as screen_desert_up_to_down'],
  'fxgame screen_desert_left_to_right|screen_desert_left_to_right': ['missing', 'as screen_desert_up_to_down'],
  'fxgame yu_skill3_range_01_root|yu_skill3_range_01_root': ['missing', '余 S3 wall pieces: picked by name in fxgame.js yuWallPieces; no client field names them'],
  'fxgame yu_skill3_range_01|yu_skill3_range_01': ['missing', 'as yu_skill3_range_01_root'],
  'fxgame yu_skill3_range_01_R|yu_skill3_range_01_R': ['missing', 'as yu_skill3_range_01_root'],
  'fxgame yu_skill3_range_01_L_end|yu_skill3_range_01_L_end': ['missing', 'as yu_skill3_range_01_root'],
  'fxgame yu_skill3_range_01_R_end|yu_skill3_range_01_R_end': ['missing', 'as yu_skill3_range_01_root'],
  'fxgame token_wang_01_buff|token_wang_01_buff': ['missing', '望\'s stone glow: not in the stone token\'s fields (maintainer capture 2026-10-07)'],
  'fxgame token_wang_passive_01_line|token_wang_passive_01_line': ['missing', '望\'s link line: not in the stone token\'s fields (maintainer capture 2026-10-07)'],
  'fxgame common_buff_parry_01|*': ['untabled', 'the client\'s default block effect (a shield buff without `_specifyBlockEffect`)'],
  'fxgame mudrok_buff_01_hit|*': ['untabled', 'mudrok_t_1\'s charpack blackboard `effect`, not an effect field'],
  'fxgame clemnt_skill_02_bullet_01|clemnt_skill_02_bullet_01': ['missing', '克莱门莎 S2 anchor (CN client): not in the skill prefab\'s fields [추정: a projectile the tables miss]'],
  'fxgame clemnt_skill_02_bullet_02|clemnt_skill_02_bullet_02': ['missing', 'as clemnt_skill_02_bullet_01'],
  'fxgame clemnt_skill_02_bullet_range_01|clemnt_skill_02_bullet_range_01': ['missing', 'as clemnt_skill_02_bullet_01'],
  'fxgame kalts2_skill_02_indicator_heal_01|kalts2_skill_02_indicator_heal_01': ['missing', '凯尔希·思衡托 S2 follow-up shot: not in projectile_chr_kalts2_s2_* fields [추정: emitted by the range prefab]'],
  'fxgame kalts2_skill_02_range_damage_01_delay|kalts2_skill_02_range_damage_01_delay': ['missing', 'as kalts2_skill_02_indicator_heal_01'],
  'fxgame kalts2_skill_02_indicator_damage_01|kalts2_skill_02_indicator_damage_01': ['missing', 'as kalts2_skill_02_indicator_heal_01'],
  'fxgame kalts2_skill_02_range_heal_01_delay|kalts2_skill_02_range_heal_01_delay': ['missing', 'as kalts2_skill_02_indicator_heal_01'],
  'fxgame aglna2_skill_02_fly_trail_up_01|aglna2_skill_02_fly_trail_up_01': ['missing', '予愿安洁莉娜 S2 flight (CN client): picked by direction in fxgame.js; no client field names it'],
  'fxgame aglna2_skill_02_fly_range_01|aglna2_skill_02_fly_range_01': ['missing', 'as aglna2_skill_02_fly_trail_up_01'],
  'fxgame aglna2_skill_02_fly_end_01|aglna2_skill_02_fly_end_01': ['missing', 'as aglna2_skill_02_fly_trail_up_01'],
  'fxgame aglna2_skill_02_fly_end_02|aglna2_skill_02_fly_end_02': ['missing', 'as aglna2_skill_02_fly_trail_up_01 (also a trail\'s OnFinishEmitter child)'],
  'fxgame aglna2_skill_02_fly_end_03|aglna2_skill_02_fly_end_03': ['missing', 'as aglna2_skill_02_fly_trail_up_01'],
  'fxgame svash2_skill_03_trail_02|svash2_skill_03_trail_02': ['missing', '凛御银灰 S3 eagle: svash2_s_3 creates svash2_eagle_* (UNPLAYED), not this trail — bug candidate'],
};

/** The template rows whose prefab nothing in render/ plays: 'key|prefab' → reason (test/helpers/fxBindings.js unplayed). */
const UNPLAYED = {
  'aglna2_s_2[enemy][levitate]|aglna2_levitate_01_emit': 'condOther',
  'akkord_t_1[atk]|akkord_buff_01': 'unconditional',
  'angel_t_2[atk]|angel2_buff_02': 'condOther',
  'ascln_s_2[enemy]|ascln_skill_02_death_01': 'condOther',
  'blkkgt_s_2[blocked]|blkkgt_skill_02_hit_2': 'condOther',
  'blkkgt_s_2[not_blocked]|blkkgt_skill_02_hit_2': 'condOther',
  'branch_t_1|branch_talent_01': 'unconditional',
  'bubble_t_1[atk_down]|bubble_talent_buff': 'unconditional',
  'cello_s_3[effect_hp]|cello_skill_03_buff_04': 'unconditional',
  'cello_s_3[effect_def]|cello_skill_03_buff_05': 'unconditional',
  'chen3_s2[respawn_effect_2]|chen3_skill_02_F_buff_02': 'unconditional',
  'clemnt_t1[dice_damage]|clemnt_talent_hit_01': 'condOther',
  'excu2_passive[effect][skill]|excu2_cherub_buff_01': 'unconditional',
  'excu2_s_3[mark]|excu2_skill_03_aim_01': 'unconditional',
  'excu2_s_3[effect][b]|excu2_skill_03_buff_01_back': 'directional',
  'flamtl_t_1[evade]|flamtl_buff_01': 'unconditional',
  'flamtl_t_1+[evade]|flamtl_buff_01': 'unconditional',
  'flamtl_t_1|flamtl_flash_01': 'cond',
  'flamtl_t_1+|flamtl_flash_01': 'cond',
  'ghost2_s_3[attack]|ghost2_skill_03_hit_02': 'condOther',
  'gnosis_s_2_enhance_judge|gnosis_skill_02_range_02': 'condOther',
  'gvial2_s_3[final_bleed]|gvial2_skill_3_bleed': 'unconditional',
  'haini_s_2[full_effect2]|haini_skill_02_weapon_01': 'condOther',
  'humus_t_1[effect_holder]|humus_buff_03': 'condOther',
  'humus_trait[heal][effect]|humus_recover_01': 'unconditional',
  'indigo_s_2[damage]|indigo_skill_02_buff_03': 'unconditional',
  'ines_t_2[effect2]|ines_range_02': 'cond',
  'kalts2_s3_fx_1|kalts2_skill_03_buff_02_left_01': 'directional',
  'kalts2_s3_fx_2|kalts2_skill_03_buff_weapon_01': 'unconditional',
  'lemuen_s2_aim_attack[effect]|lemuen_skill_02_crosshair_02': 'unconditional',
  'lumen_t_2[listener]|lumen_buff_01_hit': 'cond',
  'lumen_t_2[enable]|lumen_buff_01_start': 'unconditional',
  'malist_t_1|malist_hit_extra': 'condOther',
  'mizuki_t_2[atk]|mizuki_buff_01': 'condOther',
  'nearl2_s_3[combo_effect]|nearl2_buff_01_start': 'condOther',
  'papyrs_s_2[target]|papyrs_skill2_mark_01': 'unconditional',
  'pasngr_t_2[atk_up]|pasngr_beidong_buff_02': 'condOther',
  'pepe_e_003_t[aoe]|pepe_skill_01_hit_01_optimize': 'unconditional',
  'pepe_e_003_t[aoe][finish]|pepe_skill_01_hit_01_optimize': 'unconditional',
  'philae_s_2[ep]|philae_skill_02_hit_02': 'cond',
  'reed2_e_002_t|reed2_treat_01': 'condOther',
  'reed2_t_2|reed2_treat_01': 'condOther',
  'reed2_tr_heal[effect]|reed2_treat_01': 'unconditional',
  'rmixer_sk1[ammo-recover]|rmixer_skill_01_tip_01': 'unconditional',
  'rmixer_sk3[ammo-recover]|rmixer_skill_01_tip_01': 'condOther',
  'rockr_s_effetct_1|rockr_skill_buff_01': 'unconditional',
  'rockr_s_effetct_2|rockr_skill_buff_02': 'unconditional',
  'rockr_s_2[overload]|rockr_stun_01': 'condOther',
  'rockr_s_2[overload]|rockr_stun_02': 'condOther',
  'sbell2_t1[enemy_character]|sbell2_buff_01_hit_01': 'cond',
  'sbell2_t1[enemy_enter]|sbell2_buff_01_hit_01': 'cond',
  'sbell2_t1[s2_dot]|sbell2_buff_01_hit_02': 'cond',
  'sbell2_s3[switch_mode]|sbell2_skill_03_flow': 'condOther',
  'sbell2_s3[attract_effect]|sbell2_skill_03_hint': 'condOther',
  'skadi2_e_003_t_2[atk][1]|skadi2_buff_01_eye': 'condOther',
  'skadi2_e_003_t_2[atk][2]|skadi2_buff_01_eye': 'condOther',
  'skadi2_t_2[atk][2]|skadi2_buff_01_eye': 'condOther',
  'skadi2_s_1[protect]|skadi2_skill_01_hit_02': 'unconditional',
  'snhunt_t[effect]|snhunt_talent_01_hit_02': 'condOther',
  'snhunt_t[effect]|snhunt_talent_01_hit': 'condOther',
  'svash2_s_3[target_bird_onuse]|svash2_eagle_fly_01': 'unconditional',
  'svash2_s_3[bird_eff]|svash2_eagle_flyToHand_01': 'unconditional',
  'svash2_s_3|svash2_eagle_sit_01': 'unconditional',
  'svash2_t_1|svash2_eagle_sit_birth_01': 'condOther',
  'svash2_s_3[bird_eff]|svash2_eagle_sit_showAndHide_01': 'emitted',
  'swire2_t_2[heal]|swire2_buff_02_start': 'condOther',
  'thorn2_s2_damage|thorn2_skill_hit': 'unconditional',
  'thorn2_s3_enemy_buff|thorn2_skill_hit': 'unconditional',
  'thorn2_t_1[effect]|thorn2_weapon_buff_05': 'condOther',
  'tinman_s_2[buff][ally]|tinman_skill_02_heal_01': 'condOther',
  'ulpia_t_2|ulpia_recover_01': 'unconditional',
  'vendla_tr[effect]|vendla_attack_hit_02': 'condOther',
  'vulpis_t_1[vfx]|vulpis_buff_01': 'cond',
  'vulpis_e_003_t_2[camouflage]|vulpis_buff_02': 'condOther',
  'vulpis_s_3[cam][interval]|vulpis_buff_02': 'condOther',
  'wang_born_effect_s2|wang_birth_02': 'cond',
};

const entries = () => [
  ...handEntries(),
  ...Object.entries(FXGAME).map(([n, k]) => ({ table: 'fxgame', entry: n, src: [k].flat(), plays: [{ n }] })),
];

test('the template table: rows of the template source, in the row shape', () => {
  assert.ok(T.template.length > 300, 'tools/assets/fx-templates.json has its rows (node tools/build-fx-templates.mjs)');
  for (const r of T.template) {
    assert.equal(r.src, 'template');
    for (const f of ['key', 'moment', 'kind', 'fx']) assert.equal(typeof r[f], 'string', `${r.key}: ${f}`);
    assert.ok(Array.isArray(r.conds) && r.conds.every((c) => typeof c === 'string'), `${r.key}: conds are node names`);
  }
});

test('every hand-table entry cites the client key it stands for', () => {
  const none = [];
  for (const [ev, by] of Object.entries(KIT_OFFICIAL)) for (const [b, fn] of Object.entries(by)) if (!fn.src) none.push(`KIT_OFFICIAL ${ev}.${b}`);
  for (const [name, t] of Object.entries({ KEY_FX, LAYER_FX, STACK_FX, END_FX, TALENT_ALWAYS, NOTE_FX })) {
    for (const [k, v] of Object.entries(t)) if (!v.src) none.push(`${name} ${k}`);
  }
  for (const [k, per] of Object.entries(SOURCE_FX)) {
    for (const [b, v] of Object.entries(per)) if (!v.src && !Object.values(v).every((x) => x.src)) none.push(`SOURCE_FX ${k}.${b}`);
  }
  assert.deepEqual(none, []);
});

test("the cited keys' rows hold each entry's prefabs, lifetime and side (KNOWN aside)", () => {
  const got = {};
  let skipped = 0;
  for (const e of entries()) {
    const r = judge(e, T);
    if (r.skipped) { skipped++; continue; }
    for (const m of r.out) got[`${e.table} ${e.entry}|${m.n}`] = m.kind;
  }
  const unknown = Object.entries(got).filter(([k, kind]) => KNOWN[k]?.[0] !== kind).map(([k, kind]) => `${k}: ${kind}`);
  assert.deepEqual(unknown, [], 'fix the entry or its cite, or add it to KNOWN with the reason');
  // with the client-only rows every KNOWN line must still disagree (a fixed one leaves the list)
  if (LOCAL) assert.deepEqual(Object.keys(KNOWN).filter((k) => !got[k]), [], 'no longer a disagreement: drop it from KNOWN');
  else assert.ok(skipped >= 0);
});

test('the fxgame.js names are still in fxgame.js', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/render/fxgame.js'), 'utf8');
  const { patterns } = renderNames();
  for (const n of Object.keys(FXGAME)) assert.ok(src.includes(`'${n}'`) || patterns.some((r) => r.test(n)), n);
});

test('the template rows nothing plays are exactly UNPLAYED', { skip: !T.index && 'needs the extracted effects (public/assets/local/fx/index.json)' }, () => {
  const got = Object.fromEntries(unplayed(T).filter((x) => x.src === 'template').map((x) => [`${x.key}|${x.fx}`, x.reason]));
  const diff = [...new Set([...Object.keys(got), ...Object.keys(UNPLAYED)])].filter((k) => got[k] !== UNPLAYED[k])
    .map((k) => `${k}: ${UNPLAYED[k] ?? '(new)'} → ${got[k] ?? '(played now: drop it)'}`);
  assert.deepEqual(diff, []);
});

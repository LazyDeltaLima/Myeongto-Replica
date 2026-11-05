// test/render/mode-switch-list.js — the modes a skill switches its operator to on the way (tools/assets/local-char-modes.json
// `switchTo`, char_modes.py skill_switches: every SwitchMode of the skill's buffs, official client) that the effect layer does
// not follow: not the mode it draws the skill's attacks in (fxmap.js attackMode — the name rule, shared/skill-modes.js
// skillModeIndex), not a mode it switches to on the way (SKILL_SUB_MODES, VARIANT_MODES) and not the `<mode>_Restore` a
// 【返回】 comes back in (fxgame.js returnMode). Each has a status:
//   'ok: …'   nothing to draw differently (the same effects, no attack in it) or drawn another way — say which;
//   'todo: …' the official effects of that mode are not drawn yet.
// Mon3tr S3's S3_Reborn was such a mode before 2026-11-04: her attacks there drew the S3 mode's heal shot.
// test/render/mode-switch-coverage.test.js checks the list both ways. charId → { 'S<n> <mode name>': status }.

export const MODE_SWITCH_STATUS = Object.freeze({
  char_4222_taraxa: {
    'S1 S1_FlyStart': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event (kitofficial.js)',
    'S1 S1_FlyEnd': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event, its START bank the end sound',
    'S2 S2_FlyStart': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event (kitofficial.js)',
    'S2 S2_FlyEnd': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event, its START bank the end sound',
  },
  char_1016_agoat2: { 'S3 S3_End': 'ok: the closing mode (`skillEnd`: its START bank is the end sound); no effects of its own' },
  char_1034_jesca2: { 'S3 S3[D]': 'todo: S3 饱和迸射 facing down — its _down start effects (modes.json dirs) not compared yet' },
  char_1023_ghost2: { 'S1 Empty': 'ok: the 替身\'s mode (render/units.js FORMS doll); no attack effects of its own' },
  char_1032_excu2: { 'S3 S3_End': 'todo: the closing mode\'s cast excu2_skill_03_end_01 / _end_02 as S3 ends' },
  char_1033_swire2: { 'S3 S3_End': 'ok: the kit plan draws the closing cast (render/fx/kitofficial.js, Skill_3_End)' },
  char_1041_angel2: {
    'S2 S2_Down': 'ok: facing down — the same effects; its clips by the keys\' downMode',
    'S3 S2_Down': 'todo: S3\'s prefab switch_mode loads mode 2 (S2_Down) — which facing selects it',
    'S3 S3_Down': 'todo: facing down her S3 shots are S3_Down\'s (angel2_attack_loop_hit_01 / _trail_01), the render keeps S3\'s',
  },
  char_1052_kalts2: { 'S3 s3_transporting': 'ok: carried by the transport (kalts2_s_3[disarm]) she does not attack; the move is the kit\'s' },
  char_206_gnosis: { 'S2 S2+': 'ok: the same effects; the charged cast\'s clips are SKILL_VARIANTS\'' },
  char_249_mlyss: {
    'S2 S3': 'todo: mlyss_s_2[token_buff_range_finish] switches a mode — hers or her 流形\'s',
    'S3 S2': 'todo: mlyss_s_3[token_buff_melee_finish] switches a mode — hers or her 流形\'s',
  },
  char_4026_vulpis: { 'S3 S3_Down': 'ok: the same effects (another order); its clips by the keys\' downMode' },
  char_4039_horn: { 'S3 S3(D)': 'ok: the same effects; its clips by the keys\' downMode' },
  char_4072_ironmn: { 'S2 S1': 'todo: S2\'s prefab switch_mode loads mode 1 (S1) beside an S2 mode the render picks by name' },
  char_4100_caper: { 'S2 S2[Down]': 'ok: the same effects; its clips by the keys\' downMode' },
  char_4133_logos: { 'S3 S3_End': 'ok: the kit plan draws its cast (render/fx/kitofficial.js bulletClear)' },
  char_4137_udflow: { 'S2 S2_Down': 'ok: the same effects; its clips by the keys\' downMode' },
  char_4182_oblvns: {
    'S2 S2_Atk': 'todo: the piano side\'s effects (oblvns_skill_02_start_A, _hit_02, _trail_02, _buff_01)',
    'S2 S2_Fever': 'todo: the piano side\'s effects in 狂热 (oblvns_skill_02_start_A, _hit_02, _trail_02, _buff_01)',
    'S2 S2_Fever_Mag': 'ok: the same effects as S2_AttackSpeed',
  },
  char_4191_tippi: {
    'S1 S1_TakeOff': 'todo: the take-off cast tippi_takeoff_F (its clip: anim-keys side modes)',
    'S1 S1_Landing': 'todo: the landing cast tippi_land_F and common_land_ground (its clip: anim-keys side modes)',
    'S2 S2_TakeOff': 'todo: the take-off cast tippi_takeoff_F (its clip: anim-keys side modes)',
    'S2 S2_Landing': 'todo: the landing cast tippi_land_F and common_land_ground (its clip: anim-keys side modes)',
  },
  char_4193_lemuen: { 'S3 S3_End': 'ok: fxgame.js draws its crosshair range as S3 ends' },
  char_426_billro: {
    'S1 S1_Enhance': 'ok: the charged cast (kit \'shell\' `charged`, render/fx/kitofficial.js); the same attack effects',
    'S2 S2_Enhance': 'ok: the same effects; the charged cast\'s clips are SKILL_VARIANTS\'',
    'S3 S3_Enhance': 'ok: the same effects; the charged cast\'s clips are SKILL_VARIANTS\'',
  },
  char_431_ashlok: {
    'S2 S2(D)': 'ok: a facing mode — the same effects; its clips by facing (anim-keys)',
    'S2 S2(LR)': 'ok: a facing mode — the same effects; its clips by facing (anim-keys)',
  },
  char_469_indigo: {
    'S1 S1_T1': 'ok: T1\'s upgraded mode — the same effects',
    'S2 S2_T1': 'ok: T1\'s upgraded mode — the same effects',
  },
});

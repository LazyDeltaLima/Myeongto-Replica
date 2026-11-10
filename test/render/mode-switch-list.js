// test/render/mode-switch-list.js — the modes a skill switches its operator to on the way (tools/assets/local-char-modes.json
// `switchTo`, char_modes.py skill_switches: every SwitchMode of the skill's buffs, official client) that the effect layer does
// not follow: not the mode it draws the skill's attacks in (fxmap.js attackMode — the name rule, shared/skill-modes.js
// skillModeIndex), not a mode it switches to on the way (SKILL_SUB_MODES, VARIANT_MODES, FACE_DOWN_MODES) and not the `<mode>_Restore` a
// 【返回】 comes back in (fxgame.js returnMode). Each has a status:
//   'ok: …'   nothing to draw differently (the same effects, no attack in it) or drawn another way — say which;
//   'todo: …' the official effects of that mode are not drawn yet.
// Mon3tr S3's S3_Reborn was such a mode before 2026-11-04: her attacks there drew the S3 mode's heal shot.
// test/render/mode-switch-coverage.test.js checks the list both ways. charId → { 'S<n> <mode name>': status }.

export const MODE_SWITCH_STATUS = Object.freeze({
  char_4041_chnut: { 'S2 S2(Down)': 'ok: modes.json downMode (chnut_s_2[switch_mode] CheckCharacterDefaultDirection DOWN): deployed facing down her S2 attacks are drawn in it — the same attack and effects; its Skill2_Down_* clips are render.md\'s' },
  char_4230_mcnist: {
    'S2 S2_Down': 'ok: modes.json downMode (mcnist_s_2_mode CheckCharacterDefaultDirection DOWN → 3): deployed facing down her S2 attacks are drawn in it, its attack start mcnist_skill_02_start_01_down',
    'S3 S1': 'ok: not hers — mcnist_s_3_projectile_token\'s SwitchMode 1 is on its BUFF_OWNER, the 结构性原理 the charge moves (then InstantKill)',
    'S3 S2': 'ok: not hers — mcnist_s_3_projectile_mode\'s SwitchMode 2 is on its BUFF_OWNER, the charging 结构性原理',
  },
  char_4222_taraxa: {
    'S1 S1_FlyStart': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event (kitofficial.js)',
    'S1 S1_FlyEnd': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event, its START bank the end sound',
    'S2 S2_FlyStart': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event (kitofficial.js)',
    'S2 S2_FlyEnd': 'ok: no attack in it; its cast effect is the kit\'s taraxaFly event, its START bank the end sound',
  },
  char_1016_agoat2: { 'S3 S3_End': 'ok: the closing mode (`skillEnd`: its START bank is the end sound); no effects of its own' },
  char_1034_jesca2: { 'S3 S3[D]': 'ok: facing down — the same cast, hit and trail lists (modes.json `dirs` is a list of groups, not by mode); its clips by the keys\' downMode' },
  char_1023_ghost2: { 'S1 Empty': 'ok: the 替身\'s mode (render/units.js FORMS doll); no attack effects of its own' },
  char_1032_excu2: { 'S3 S3_End': 'ok: the closing cast as S3 ends (fxmap.js SKILL_END_CAST)' },
  char_1033_swire2: { 'S3 S3_End': 'ok: the kit plan draws the closing cast (render/fx/kitofficial.js, Skill_3_End)' },
  char_1041_angel2: {
    'S2 S2_Down': 'ok: facing down — the same effects; its clips by the keys\' downMode',
    'S3 S2_Down': 'ok: nothing reads the prefab\'s blackboard `mode` 2: angel2_s_3[switch_mode] has fixed modes, 4 S3_Down or 3 S3 (FACE_DOWN_MODES)',
  },
  char_1052_kalts2: { 'S3 s3_transporting': 'ok: carried by the transport (kalts2_s_3[disarm]) she does not attack; the move is the kit\'s' },
  char_206_gnosis: { 'S2 S2+': 'ok: the same effects; the charged cast\'s clips are SKILL_VARIANTS\'' },
  char_249_mlyss: {
    'S2 S3': 'ok: her 流形\'s — the buff is on the token and checks its modes (Range_S2 4 → Range 3), not hers; audio.js tokenModeName reads them',
    'S3 S2': 'ok: her 流形\'s — the buff is on the token and checks its modes (Melee_S3 5 → Melee 2), not hers; audio.js tokenModeName reads them',
  },
  char_4026_vulpis: { 'S3 S3_Down': 'ok: the same effects (another order); its clips by the keys\' downMode' },
  char_4039_horn: { 'S3 S3(D)': 'ok: the same effects; its clips by the keys\' downMode' },
  // (2026-11-10: the first full CN run of char_modes.py since `switchTo` / `downMode` — these were there before, unread)
  char_1015_aglna2: {
    'S1 S1_Landing': 'ok: her landing after S1\'s take-off: no attack, no effect in the mode; its clip is the keys\' (render/units.js glide)',
    'S2 S2_Landing': 'ok: her landing after S2: no attack, no effect in the mode (the kit\'s aglnaFlight end draws aglna2_skill_02_fly_end_*)',
    'S2 S2_Chant': 'ok: S2\'s chant: no attack, no effect in the mode; its clip is the keys\' (SpineActor.chant)',
    'S3 S3Move': 'ok: the flight: its attach aglna2_skill_03_fly_trail_01 is drawn by the kit\'s aglnaFlight (fxgame.js, with aglna2_s_3[move_mode]\'s side buff)',
    'S3 S3_TakeOff': 'ok: her take-off into S3\'s flight: no attack, no effect in the mode',
    'S3 S3_Landing': 'ok: her landing after S3\'s flight: no attack, no effect in the mode',
  },
  char_4231_clemnt: {
    'S2 S2[Down]': 'ok: modes.json downMode (CheckCharacterDefaultDirection DOWN): deployed facing down her S2 attacks are drawn in it — the same lists',
    'S3 S3[Down]': 'ok: modes.json downMode: deployed facing down her S3 is drawn in it — the same cast, hit and attach lists',
  },
  char_4072_ironmn: { 'S2 S1': 'ok: the prefab\'s switch_mode (`_buffs`, mode 1, `_selfOption` 0: not himself) is his devices\'; his own is the `_passiveBuffs` ironmn_s_2, mode 2 S2, which the render picks' },
  char_4100_caper: { 'S2 S2[Down]': 'ok: the same effects; its clips by the keys\' downMode' },
  char_4133_logos: { 'S3 S3_End': 'ok: the kit plan draws its cast (render/fx/kitofficial.js bulletClear)' },
  char_4137_udflow: { 'S2 S2_Down': 'ok: the same effects; its clips by the keys\' downMode' },
  char_4182_oblvns: {
    'S2 S2_Atk': 'ok: held by the form from the deployment (fxmap.js FORM_HELD_MODES): its swings cast start_A, its buff _buff_01; the notes draw _trail_02 / _hit_02 (NOTE_FX piano)',
    'S2 S2_Fever': 'ok: the same effects as S2_Atk (FORM_HELD_MODES `also`)',
    'S2 S2_Fever_Mag': 'ok: the same effects as S2_AttackSpeed',
  },
  char_4165_ctrail: {
    'S1 S1_TakeOff': 'ok: no attack in it; its cast effect is the kit\'s takeoff event (kitofficial.js)',
    'S1 S1_Landing': 'ok: no attack in it; the closing cast (fxmap.js SKILL_END_CAST)',
    'S2 S2_TakeOff': 'ok: no attack in it; its cast effect is the kit\'s takeoff event (kitofficial.js)',
    'S2 S2_Landing': 'ok: no attack in it; the closing cast (fxmap.js SKILL_END_CAST)',
  },
  char_4191_tippi: {
    'S1 S1_TakeOff': 'ok: no attack in it; its cast effect is the kit\'s takeoff event (kitofficial.js)',
    'S1 S1_Landing': 'ok: no attack in it; the closing cast (fxmap.js SKILL_END_CAST)',
    'S2 S2_TakeOff': 'ok: no attack in it; its cast effect is the kit\'s takeoff event (kitofficial.js)',
    'S2 S2_Landing': 'ok: no attack in it; the closing cast (fxmap.js SKILL_END_CAST)',
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
  char_4047_pianst: { 'S2 Empty': 'ok: NeverTrigger, no attack in it (the kit holds her attacks); FinalAttack\'s cast effects come from the kit at this switch (kitofficial.js kitHit pianst:final, fxgame.js KIT_OWNED)' },
});

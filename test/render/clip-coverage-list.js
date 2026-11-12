// test/render/clip-coverage-list.js — every Spine clip of an operator model that the renderer does not reach through
// the model's roles (data/assets.json `anims`) or render/units.js FORMS / FORTRESS_CLIPS, per charId, with its status.
// test/render/clip-coverage.test.js fails on a clip missing here and on an entry that no longer applies; the rules and
// how to settle an entry: docs/rules/render.md 「Spine 클립 커버리지」.
//
// Status (one string, the reason after the colon):
//   'render: <file> <how>' — the renderer plays it by name outside the roles (<file> under public/js/, which must
//                        name the clip);
//   'none: <evidence>' — the official client does not play it in this mode, or it needs no drawing here (cite the
//                        prefab field / client method / recording that shows it);
//   'todo: <groups> — <where>' — the client plays it and the renderer does not yet. Every entry of the first listing
//                        (2026-10-12) was checked against the client on 2026-10-14 (maintainer's notes); the letter names
//                        the client mechanism that plays the clip, one renderer change per letter (docs/rules/render.md
//                        「Spine 클립 커버리지」): A blocked-target attack, B alternate attack clip, C first-attack begin /
//                        attack end, D skill sub-mode clip pairs, E equipped skill default mode, F skill mode Die pair,
//                        G skill prefab clip, H talent / trait state, I mix clip, J skin key table, U up-facing clip.
//                        [ASSUMED] where the client fields leave the timing open.
// The facing-down clips (`*Down*`) play through the roles' `down` / `beginDown` / `downMode` since 2026-10-23; the ones no
// client key calls are listed like any other.

export const UNPLAYED = {
  char_4177_brigid: {
    Skill_2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table: no mix; skchr_brigid_2 `_playSkillBeginAnim` off)',
    Skill_2_End: 'none: no client key names it (abilities, mode pairs, skin key table: no mix)',
    Skill_Down_2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table: no mix)',
    Skill_Down_2_End: 'none: no client key names it (abilities, mode pairs, skin key table: no mix)',
  },
  char_4198_christ: {
    Skill_2_Idle: 'none: mode S2 `_excludeAnimKeys` Idle, the skill channel is Skill_2_Begin / _Loop / _End; no client key names it',
  },
  char_455_nothin: {
    Skill_2_End: 'none: S2 is a toggle this mode never closes (PRTS 卫戍协议/帮助 技能操作): it runs until she leaves, so its end clip does not come',
  },
  char_1015_aglna2: {
    Skill_2_Takeoff_Begin: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_End: 'render: render/units.js UnitView.glide → SpineActor.chant',
    Skill_2_Takeoff_Loop: 'render: render/units.js UnitView.glide → SpineActor.chant',
  },
  char_1023_ghost2: {
    Attack2: 'none: back-only clip, not a key of the skin SpineAnimator._animations (the client plays clips by key only)',
    Attack_Down: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; facing down, S3 attacks with Skill_3_Attack_Down',
  },
  char_1028_texas2: {
    Default_2: 'none: setup pose (0 s); no ability, mode pair or mix names it',
    Default_3: 'none: setup pose (0 s); no ability, mode pair or mix names it',
  },
  char_1035_wisdel: {
    Skill_2_End: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
  },
  char_1041_angel2: {
    Skill_1_Close: 'none: the S1 burst after a stop by hand (Modes/S1_Burst_Mode); this mode has no manual stop — no client message stops a skill and server/sim/skills.js stop() has no caller',
    Skill_Down_1_Loop: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; the S1 mode attack has no facing-down key',
    Skill_Down_2_End: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; the skin mixes Skill_Down_2_Idle (mode S2_Down) into Idle with Skill_Down_3_End',
    Skill_Down_3_Skill: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; S3FireToToken of mode S3_Down plays Skill_3_Skill',
  },
  char_1045_svash2: {
    Skill_3_Deploy: 'none: only when the 风雪之眼 card is used by hand during S3 (skchr_svash2_3 BirdAura AnimationEmitBehaviour via svash2_s_3[*_bird_onuse]); no hand deployment in this mode [ASSUMED]',
  },
  char_143_ghost: {
    Attack_Down: 'none: not a key of the skin SpineAnimator._animations (the client plays clips by key only); no ability names it; client keys 2026-10-23',
  },
  char_2027_wang: {
    Default_2: 'none: setup pose of mode S2 (replaces Default, 0 s; charpack Modes/S2 _replaceAnimPairs)',
  },
  char_222_bpipe: {
    Skill_2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S3 attacks with the Skill_2_Loop of its mode (S2 is the one-shot Skill)',
    Skill_2_End: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S3 attacks with the Skill_2_Loop of its mode (S2 is the one-shot Skill)',
  },
  char_279_excu: {
    Skill_Down_Begin: 'none: not a key of the skin SpineAnimator._animations (the client plays clips by key only); the S2 ThreePartOneshotAnimation has no facing-down bundle (`_overrideDownAnimation` off); client keys 2026-10-23',
    Skill_Down_End: 'none: not a key of the skin SpineAnimator._animations (the client plays clips by key only); the S2 ThreePartOneshotAnimation has no facing-down bundle (`_overrideDownAnimation` off); client keys 2026-10-23',
    Skill_Down_Loop: 'none: not a key of the skin SpineAnimator._animations (the client plays clips by key only); the S2 ThreePartOneshotAnimation has no facing-down bundle (`_overrideDownAnimation` off); client keys 2026-10-23',
    Skill_Up_Begin: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_End: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
    Skill_Up_Loop: 'none: S2 ThreePartOneshotAnimation has no up bundle (_GetAnimBundle: _down or Skill_Right_*); only the template of another unit (nasti_nstchr) names it',
  },
  char_291_aglina: {
    Skill2_Begin: 'none: not a key of the skin SpineAnimator._animations (S3 key Skill_2_Begin plays Skill1_Begin; the client plays clips by key only)',
  },
  char_4016_kazema: {
    Default_B: 'none: setup pose of the stand-in form (0 s); only the buff template of another unit (parrot_m1_t) names it',
  },
  char_4064_mlynar: {
    Idle_2: 'none: the clip of her Default mode\'s animation-only Body/AnimAttack, but the official game keeps her on Idle outside her skills even with an enemy in her range (maintainer report 2026-10-30)',
  },
  char_4039_horn: {
    Skill_Down_2_B_Loop: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; S2 switches to no facing-down mode (only S3 does: S3(D))',
  },
  char_4079_haini: {
    Skill_2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
    Skill_2_End: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
  },
  char_4087_ines: {
    Start_Skill: 'todo: G — on hold (maintainer 2026-10-14: the client logic is not certain): skchr_ines_3/First _animKey; S3 is cast only as she deploys (ON_DEPLOY) and the official game shows no Start_Skill after the deployment, so the renderer does not play it — when the client plays it, if ever, is open',
  },
  char_4114_harold: {
    Skill_2_End: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
  },
  char_4116_blkkgt: {
    Skill_2_B: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); S2 plays Skill_2',
    Skill_Down_2_B: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; facing down, S2 plays Skill_Down_2',
  },
  char_4148_philae: {
    Skill_2_Start: 'none: back-only clip; no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 is its channel',
  },
  char_4217_makoto: {
    // 结城理 (自选, 2026-11-12): the <替身> is a persona per skill with its own clips; wiring them is the fx-V bundle's
    Doll_Skill_1_Attack: 'todo: D — Stand_S1 _replaceAnimPairs Attack (op-makoto.js persona s1; the <替身> FORMS are *_B)',
    Doll_Skill_1_Die: 'todo: D — Stand_S1 _replaceAnimPairs Die (op-makoto.js persona s1; the <替身> FORMS are *_B)',
    Doll_Skill_1_Idle: 'todo: D — Stand_S1 _replaceAnimPairs Idle (op-makoto.js persona s1; the <替身> FORMS are *_B)',
    Doll_Skill_1_Stun: 'todo: D — Stand_S1 _replaceAnimPairs Stun (op-makoto.js persona s1; the <替身> FORMS are *_B)',
    Doll_Skill_1_SwitchIn: 'todo: H — makoto[switch2stand_s1]/SwitchEnd _animKey (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Doll_Skill_1_SwitchOut: 'todo: D — Stand_S1 _replaceAnimPairs SwitchOut (op-makoto.js persona s1; the <替身> FORMS are *_B)',
    Doll_Skill_2_Die: 'todo: D — Stand_S2 _replaceAnimPairs Die (op-makoto.js persona s2; the <替身> FORMS are *_B)',
    Doll_Skill_2_Loop: 'todo: D — Stand_S2 _replaceAnimPairs Idle (op-makoto.js persona s2; the <替身> FORMS are *_B)',
    Doll_Skill_2_Stun: 'todo: D — Stand_S2 _replaceAnimPairs Stun (op-makoto.js persona s2; the <替身> FORMS are *_B)',
    Doll_Skill_2_SwitchIn: 'todo: H — makoto[switch2stand_s2]/SwitchEnd _animKey (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Doll_Skill_2_SwitchOut: 'todo: D — Stand_S2 _replaceAnimPairs SwitchOut (op-makoto.js persona s2; the <替身> FORMS are *_B)',
    Doll_Skill_3_P1_Attack_A: 'todo: D — Stand_S3_1 _replaceAnimPairs Attack_A (op-makoto.js persona s3_1; the <替身> FORMS are *_B)',
    Doll_Skill_3_P1_Attack_B: 'todo: B — Stand_S3_1 UberAnimationEffectEmitter _replaceGroup Attack_B (op-makoto.js persona s3_1)',
    Doll_Skill_3_P1_Idle: 'todo: D — Stand_S3_1 _replaceAnimPairs Idle (op-makoto.js persona s3_1; the <替身> FORMS are *_B)',
    Doll_Skill_3_P1_Stun: 'todo: D — Stand_S3_1 _replaceAnimPairs Stun (op-makoto.js persona s3_1; the <替身> FORMS are *_B)',
    Doll_Skill_3_P1_SwitchIn: 'todo: H — makoto[switch2stand_s3_1]/SwitchEnd _animKey (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Doll_Skill_3_P1_SwitchOut: 'todo: D — Stand_S3_1 _replaceAnimPairs SwitchOut (op-makoto.js persona s3_1; the <替身> FORMS are *_B)',
    Doll_Skill_3_P1toP2_ChangeBegin: 'todo: H — makoto[switch2stand_s3_2]/Die2Stand _animKey, 0.5 s (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Doll_Skill_3_P1toP2_ChangeEnd: 'todo: H — makoto[switch2stand_s3_2]/SwitchEnd _animKey, 1 s (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Doll_Skill_3_P2_Die: 'todo: D — Stand_S3_2 _replaceAnimPairs Die (op-makoto.js persona s3_2; the <替身> FORMS are *_B)',
    Doll_Skill_3_P2_Loop: 'todo: D — Stand_S3_2 _replaceAnimPairs Idle (op-makoto.js persona s3_2; the <替身> FORMS are *_B)',
    Doll_Skill_3_P2_Stun: 'todo: D — Stand_S3_2 _replaceAnimPairs Stun (op-makoto.js persona s3_2; the <替身> FORMS are *_B)',
    Doll_Skill_3_P2_SwitchOut: 'todo: D — Stand_S3_2 _replaceAnimPairs SwitchOut (op-makoto.js persona s3_2; the <替身> FORMS are *_B)',
    Skill_AllOutAttack_End: 'todo: H — S.E.E.S.队长: makoto[switch2normal_allout] Switch2Normal mode, Allout_LoopEnd _animKey (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    Skill_AllOutAttack_Loop: 'todo: H — S.E.E.S.队长: Switch2Normal _replaceAnimPairs Idle (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
    SwitchOut: 'todo: H — makoto[switch2stand_*]/Die2Stand _animKey (the <本体> leaving) (op-makoto.js; the shared 傀儡师 switch draws the *_B clips)',
  },
  char_4231_clemnt: {
    Attack_Down: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; the Default attack has no facing-down key',
    Skill_Down_3_End: 'none: only an entry of the skin key table (SpineAnimator._animations: animKey = its name); no ability (`_downAnimKey`, a ThreePart / channel `_down` bundle), mode pair, skill `_beginAnimDown` or mix calls it; client keys 2026-10-23; the skin mixes mode S3[Down] into Idle with Skill_3_End',
  },
  char_4247_oxi: {
    Skill_2_Attack: 'none: no client key names it (abilities Attack / BuffedAttack → Attack, skchr_oxi_2 → Skill_2_Cambat, mode pair S3NoAttack Idle → Skill_3_Loop, skin key table Born → Start, mixes to / from Skill_3_Loop); CN client keys 2026-11-01',
  },
  char_426_billro: {
    Skill_2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table, mix — the mixes go to Idle only), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; a skill switches to its mode SN / SN_Enhance (Skill_Idle / Skill_2_Idle) without an opening clip',
    Skill_Begin: 'none: no client key names it (abilities, mode pairs, skin key table, mix — the mixes go to Idle only), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; a skill switches to its mode SN / SN_Enhance (Skill_Idle / Skill_2_Idle) without an opening clip',
  },
  char_472_pasngr: {
    Skill2_Begin: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
    Skill2_End: 'none: no client key names it (abilities, mode pairs, skin key table, mix), and no buff template plays it (PlayUnitAnimation plays only Idle / Default); client keys 2026-10-23; S2 attacks with its mode',
  },
  char_498_inside: {
    Attack_Idle: 'none: no ability, mode pair, buff, mix or code string names it (EN/CN); attack is Attack_Begin/Loop/End',
  },
  char_4037_demetr: {
    Skill_3_End: 'none: only the skin mix from Skill_3_Idle / _Loop_A / _Loop_B to Idle names it, and S3 never goes there: RespawnEnd flies her off and mode S3_Restore (`_excludeAnimKeys` Idle) comes back on Skill_3_Back',
    Skill_3_Restart_Begin: 'none: the Back model\'s own spelling: no key names it, and the client looks a clip up by its exact name (SkeletonData.FindAnimation; a key the model lacks is invalid and plays nothing)',
    Skill_3_Restart_End: 'none: the Back model\'s own spelling: no key names it, and the client looks a clip up by its exact name (SkeletonData.FindAnimation; a key the model lacks is invalid and plays nothing)',
  },
  char_1051_headb2: {
    Skill_2_Die: 'none: only an entry of the skin key table (SpineAnimator._animations): no ability, mode pair, skill prefab, buff template or mix names it; mode s2 pairs only Idle',
  },
  char_4179_monstr: {
    Skill_2_End: 'none: only an entry of the skin key table (SpineAnimator._animations): no ability, mode pair, skill prefab, buff template or mix names it; her skin has no mixes',
  },
  // 黍 / 老鲤 / 森蚺 / 黑键 (2026-11-04)
  char_322_lmlee: {
    Skill_2_Attack: 'none: only an entry of the skin key table (SpineAnimator._animations): no ability, mode pair, skill prefab, buff template or mix names it; the S2 RunePaper ability has no clip',
    Skill_2_start: 'none: the Back model\'s own spelling: no key names it, and the client looks a clip up by its exact name (SkeletonData.FindAnimation; a key the model lacks is invalid and plays nothing)',
    Skill_3_End: 'none: only an entry of the skin key table (SpineAnimator._animations): no ability, mode pair, skill prefab, buff template or mix names it; his skin mixes name `Skill_End`, which the model lacks, and S3 lasts until he leaves',
  },
  char_416_zumama: {
    Attack_Down: 'none: only an entry of the skin key table (SpineAnimator._animations): no ability, mode pair, skill prefab, buff template or mix names it; only S3 has a facing-down attack (Skill_2_Loop_Down)',
  },
  // 涤火杰西卡 / 鸿雪 (2026-11-04)
  char_4055_bgsnow: {
    Skill_1_End: 'none: Back only, no key or mix names it: the skin mixes go to Idle from Attack_Loop and Skill_3 only',
  },
  // 棘刺 / 艾丽妮 (2026-11-04)
  char_293_thorns: {
    Skill2_1: 'none: no key names it: key Skill_2 → Skill2_2 is the S3 attack, `_faceToFront` so the Back model that lacks it is not drawn; the S2 Thorn ability has no clip',
  },
  // 赫德雷, 机械师 (规程 pieces, 2026-11-08, the maintainer's to-do list: bundle fx-V)
  char_4088_hodrer: {
    Skill_2_End: 'none: skchr_hodrer_2 (ToggleSkillWithEndAnimation) `_endAnim`, played as the toggle goes off; this mode never closes it (kits/ops/op-hodrer.js `toggle`), as 乌有 S2',
  },
  char_4230_mcnist: {
    Attack_B: 'none: no client key names it (CN charpack: Body/Attack and Body/Combat `_animKey` Attack_A; skill prefabs skchr_mcnist_1-3; skin key table Born only; no mix)',
  },
  // W, 클로저 (2026-11-06, the maintainer's to-do list: bundle fx-V)
  char_113_cqbw: {
    Attack_Down: 'none: no client key names it (Front model abilities, mode pairs, skin key table: no mix; her attack has no down key)',
  },
  char_4228_closur: {
    Skill_2_End: 'none: no client key names it; the skin mix table has only the facing-down row (Skill_Down_2_Idle → Idle)',
    Skill_3_End: 'none: no client key names it; the skin mix table has only the facing-down row (Skill_Down_3_Idle → Idle)',
  },
  char_4165_ctrail: {
    Attack_Down: "none: her Default attack has no `_downAnimKey`; in S1 / S2 the `_downAnimKey` Attack_Down goes through the mode's pair to Skill_Down_Loop / Skill_Down_2_Loop, which the renderer plays",
  },
};

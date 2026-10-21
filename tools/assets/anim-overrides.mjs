// Per-model skill clip overrides (local patch, docs/LOCAL-PATCH.md "우타게 S2 애니메이션"): anim-roles.mjs gives every
// skill index of a model without numbered Skill_n clips the unnumbered Skill_* family. For a skill whose official
// ability attacks with the plain Attack clip that is wrong — the renderer then plays another skill's stance while it
// is active.
//
// 宴 (char_337_utage): her only skill clips Skill_Start/Skill_Loop/Skill_End are S1 分神 (停止攻击, the phone stance).
// EN client battle/prefabs/[uc]skills.ab: skchr_utage_1 carries the anim component `_default { beginAnim "Skill_Start",
// loopAnim "Skill_Loop", endAnim "Skill_End" }` (+ switch_mode 1); skchr_utage_2 has no anim component at all (only
// switch_mode 2, utage_s_2[self_damage], utage_s_2[respawn]).
// EN client charpack char_337_utage.ab: the operator has 3 modes; the S2 落地斩·破门 mode (_addIndexToSignalId 1)
// attacks with `_animKey "Attack"`, `_damageType 2` (arts) and the utage_skill_02_start/_hit effects, while the S1
// mode carries an animator hooker (`_excludeAnimKeys ["Idle","Attack","Born"]`) that swaps her clips to the Skill_*
// family. So S2 = the normal Attack clip (skill clip `via: 'attack'`, like resolveSkill's own fallback).
//
// A clip object replaces the skill's clips outright (one with `via: 'attack'` keeps the attack role's clip for its attacks;
// an `end` may be an array of clips played in a row) — models whose clip numbers are not their skill numbers (the S1 is a
// common buff without clips of its own, so the numbers shift; maintainer report 2026-10-07, maintainer's notes 2026-10-07):
// 泥岩 (char_311_mudrok): S2 岩崩锤 strikes with `Skill_1` ([uc]skills.ab skchr_mudrok_2 attack ability `_animKey
// "Skill_1"`, 1.6 s) — `strike: true`: the clip is that empowered attack's, played by the attack, not at the cast
// (render/spine.js). `Skill_2_*` is S3 秽壤的血脉's (SleepAura `_default {Skill_2_Begin, Skill_2_Sleep, Skill_2_Awake}`,
// then charpack mode S3 `_replaceAnimPairs` Idle→Skill_2_Idle, Attack→Skill_2_Attack). The 10 s sleep (Skill_2_Begin →
// Skill_2_Sleep, Skill_2_Awake as she wakes) is a model form of its own: render/units.js FORMS (kit fx 'stone' / 'rockfall').
// 莫斯提马 (char_213_mostma): S2 荒时之锁 = skchr_mostma_2's anim component `_default {Skill_Begin, Skill_Loop, Skill_End}`;
// S3 序时之匙 switches to charpack mode 1 (switch_mode_restart_fsm blackboard `mode 1`), whose attack is `_animKey
// "Skill_2_Loop"` / `_endAnimKey "Skill_2_Idle"` (Graphic Idle→Skill_2_Idle) — resolveSkill had the two swapped, so her
// S3 stood in S2's channel pose without an attack motion.
import { skillModeIndex } from '../../shared/skill-modes.js';

const clips = (o) => Object.freeze({ begin: null, loop: null, end: null, idle: null, ...o });

/** model key (tools/assets/plan.mjs `op:<charId>:<dir>`) prefix → { [0-based skill index]: 'attack' | clip object } */
export const SKILL_CLIP_OVERRIDES = Object.freeze({
  'op:char_337_utage:': Object.freeze({ 1: 'attack' }),
  'op:char_311_mudrok:': Object.freeze({
    1: clips({ loop: 'Skill_1', strike: true }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Attack', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // 焰影苇草 (char_1020_reed2): S3's charpack mode pairs Attack→Skill_3_Attack, Idle→Skill_3_Loop (EN client) — resolveSkill
  // used the Loop stance as her attack, so she stood through S3 with no attack motion (maintainer report 2026-10-07)
  'op:char_1020_reed2:': Object.freeze({
    2: clips({ begin: 'Skill_3_Begin', loop: 'Skill_3_Attack', end: 'Skill_3_End', idle: 'Skill_3_Loop' }),
  }),
  'op:char_213_mostma:': Object.freeze({
    1: clips({ begin: 'Skill_Begin', loop: 'Skill_Loop', end: 'Skill_End' }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // The skill prefabs and charpack modes of the EN client (docs/rules/render.md 「Spine 클립 커버리지」, maintainer's notes
  // 2026-10-14), where the resolver's guess by name plays another skill's clips:
  // 灵知 (char_206_gnosis): S3 失温症 = skchr_gnosis_3 ThreePartChannelingAnimation `_default {Skill_4_Begin, Skill_4_Loop,
  // Skill_4_End}`; Skill_3 is the charged S2's (charpack mode S2+ pairs Skill_2→Skill_3).
  'op:char_206_gnosis:': Object.freeze({
    2: clips({ begin: 'Skill_4_Begin', loop: 'Skill_4_Loop', end: 'Skill_4_End' }),
  }),
  // 歌蕾蒂娅 (char_474_glady): S2's cast clip is skchr_glady_2 `_beginAnim "Skill_2_Startup"` (`_playSkillBeginAnim 1`);
  // Skill_2_Begin / _Loop / _End are the S2 mode's attack channel.
  // S3 = an ability sequence: Chant `_animKey "Skill_3_Startup"` for the duration, the S3 mode (Idle→Skill_3_Chant, her
  // plain Attack), and the closing FinalAttack channel `_default {Skill_3_Begin, Skill_3_Loop, Skill_3_End}` — `via:
  // 'attack'` keeps the attack clip; `end` is the three clips in a row.
  'op:char_474_glady:': Object.freeze({
    1: clips({ begin: 'Skill_2_Startup', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
    2: Object.freeze({ via: 'attack', begin: 'Skill_3_Startup', idle: 'Skill_3_Chant', end: Object.freeze(['Skill_3_Begin', 'Skill_3_Loop', 'Skill_3_End']) }),
  }),
  // 伊内丝 (char_4087_ines): S3 独影归途 = an ability group whose first ability (`_animKey "Start_Skill"`) leaves the
  // shadow sentry; her attacks stay the ordinary ones. It is cast only as she deploys (spType ON_DEPLOY), and the official
  // game shows no Start_Skill after the deployment (maintainer 2026-10-14) — only her Start drop: the skill has no clip of
  // its own (Start_Skill: test/render/clip-coverage-list.js, on hold), so a cast during the drop never cuts it.
  'op:char_4087_ines:': Object.freeze({ 2: 'attack' }),
  // 缄默德克萨斯 (char_1028_texas2): the S2 / S3 deploy burst (skchr_texas2_{2,3} AnimationEmitBehaviour ON_CAST_START
  // anim `Start_n`; charpack modes S2 / S3 pair Born→Start_n, Idle→Skill_n_Idle) opens the skill.
  'op:char_1028_texas2:': Object.freeze({
    1: clips({ begin: 'Start_2', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
    2: clips({ begin: 'Start_3', loop: 'Skill_3_Loop', end: 'Skill_3_End', idle: 'Skill_3_Idle' }),
  }),
  // 赤刃明霄陈 (char_1050_chen3): S2 attacks with her plain clips; its Skill_2_Begin → Skill_2_Disappear (she vanishes while
  // she slashes) and Start_2 (back, mode S2Respawn) are a model form (render/units.js FORMS)
  'op:char_1050_chen3:': Object.freeze({ 1: 'attack' }),
  // 银灰 (char_172_svrash): every attack of the S2 mode is `Modes/S2/Body/Attack _animKey "Combat"`; `Skill` is S3's.
  'op:char_172_svrash:': Object.freeze({
    1: clips({ loop: 'Combat' }),
  }),
  // The client plays clips by key only: the skill prefabs and modes name keys, and the skin's key table (chararts
  // DefaultSkin SpineAnimator._animations) turns each into a clip name. Where the clip numbers are not the skill numbers:
  // 安洁莉娜 (char_291_aglina): S1 is a mode with the plain Attack and no clip of its own; S2's `_default` keys
  // Skill_1_Begin / _Loop / _End are the clips Skill1_*; S3's Skill_2_Begin / _Loop / _End are Skill1_Begin, Skill2_Loop,
  // Skill2_End (no key names Skill2_Begin).
  'op:char_291_aglina:': Object.freeze({
    0: 'attack',
    1: clips({ begin: 'Skill1_Begin', loop: 'Skill1_Loop', end: 'Skill1_End' }),
    2: clips({ begin: 'Skill1_Begin', loop: 'Skill2_Loop', end: 'Skill2_End' }),
  }),
  // 焰尾 (char_420_flamtl): S1 is a buff without a clip; S2 skchr_flamtl_2 `_animKey "Skill_2"` is the clip Skill_1; S3's
  // keys Skill_3_* (its begin and the S3 mode's Idle / Attack pairs) are the clips Skill_2_*.
  'op:char_420_flamtl:': Object.freeze({
    0: 'attack',
    1: clips({ loop: 'Skill_1' }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Loop', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // 予愿安洁莉娜 (char_1015_aglna2, CN client): S1's take-off key Skill_1_Begin is the clip Start_2 (CN chararts DefaultSkin
  // SpineAnimator._animations; skchr_aglna2_1 `_defaultModeIndex` 5 = S1_TakeOff, whose attack `_animKey` is that key).
  'op:char_1015_aglna2:': Object.freeze({
    0: clips({ begin: 'Start_2', loop: 'Skill_1_Loop', end: 'Skill_1_End', idle: 'Skill_1_Idle' }),
  }),
  // 丰川祥子 (char_4182_oblvns): S2 满月的舞会's cast clip is skchr_oblvns_2 `_beginAnim "Skill_2_Trans_B"` (`_playSkillBeginAnim
  // 1), which the piano mode pairs Trans_B→Trans_A (SKILL_VARIANTS: from the organ, Trans_B); Skill_2_Start / _Idle_A / _Loop_A
  // are the piano mode's (EQUIP_ROLES), _Idle_B / _Loop_B the organ's (render/units.js FORMS).
  'op:char_4182_oblvns:': Object.freeze({
    1: clips({ loop: 'Skill_2_Trans_A' }),
  }),
  // 塞雷娅 (char_202_demkni): S1 skchr_demkni_1 attacks with `_animKey "Attack"`; S2's heal key `Heal` is the clip
  // Attack_2; Skill_Begin / _Loop / _End are S3 钙质化's.
  'op:char_202_demkni:': Object.freeze({
    0: 'attack',
    1: clips({ loop: 'Attack_2' }),
  }),
  // 耀骑士临光 (char_1014_nearl2): S2's mode attacks with the plain `Attack_Loop` and pairs Die→Skill_2_Die (SKILL_STATE_CLIPS);
  // the skill casts no clip (skchr_nearl2_2 has no animated ability) — the name guess took Skill_2_Die for its clip.
  'op:char_1014_nearl2:': Object.freeze({ 1: 'attack' }),
});

/**
 * How a skill's mode attacks (docs/rules/render.md 「스킬 중 공격 클립」): the attack ability of the charpack mode the skill
 * switches to (tools/assets/local-attack-timing.json, tools/local-extract/attack_timing.py — its `_animKey` after the mode's
 * `_replaceAnimPairs`; shared/skill-modes.js skillModeIndex) against the Default mode's. A key `""` where the Default has one
 * = the mode's attacks play no clip: the skill's idle — else its loop — stays on as the stance (`stance`; 烛煌 S3, 白面鸮 S2,
 * 塞雷娅 S3 …: the attack used to cut the loop, End, Idle at every heal / shot). The Default's own key on a skill whose clip
 * is one clip without a Begin or an idle = its attacks are the plain attack clip and the skill's clip is its cast, played
 * once (`plainAttack`; 瑕光 S2, 归溟幽灵鲨 S1 …: every attack played the cast clip). A skill with Begin / Loop / End clips
 * and a mode on the plain key (乌尔比安 S3, 处刑者 S1) is left as it is [ASSUMED: its skill prefab channels the loop].
 * MODE_ATTACK_KEEP leaves a skill out, PLAIN_ATTACK adds one with no mode of its own.
 */
export const MODE_ATTACK_KEEP = Object.freeze({
  // 歌蕾蒂娅 S2: the mode's `_animKey ""`, but her S2 strikes through its own attack channel (Skill_2_Begin / _Loop / _End,
  // FIRST_ATTACK_BEGIN `attackBegin`)
  'op:char_474_glady:': Object.freeze([1]),
});
export const PLAIN_ATTACK = Object.freeze({
  // 焰影苇草 S2: no mode (her attacks stay the Default `Attack`); skchr_reed2_2's own ability plays Skill_2 once per skill
  // duration (tools/assets/local-skill-cast.json `cd 20`, `cdKey duration`) as it fires the flame
  'op:char_1020_reed2:': Object.freeze([1]),
});

/**
 * Apply the client's mode attacks (the rule above) to the skill clips of operator model `key` (mutates `anims`).
 * `timing` = local-attack-timing.json, `charModes` = local-char-modes.json (its `skillMode`); either may be empty.
 */
export function applyModeAttacks(key, anims, timing, charModes) {
  if (!anims?.skills || typeof key !== 'string' || !key.startsWith('op:')) return anims;
  const id = key.split(':')[1];
  const keep = Object.entries(MODE_ATTACK_KEEP).find(([p]) => key.startsWith(p))?.[1] || [];
  const plain = Object.entries(PLAIN_ATTACK).find(([p]) => key.startsWith(p))?.[1] || [];
  const t = timing?.ops?.[id];
  const dflt = t?.attack?.[0]?.anim;
  for (const [i, sk] of Object.entries(anims.skills)) {
    const n = Number(i);
    if (!sk || keep.includes(n)) continue;
    let how = plain.includes(n) ? 'plain' : null;
    const m = t ? skillModeIndex(t.modes, n, charModes?.[id]?.skillMode ?? null) : -1;
    const a = m > 0 ? t.attack?.[m] : null;
    if (!how && a && typeof dflt === 'string' && dflt) {
      if (a.anim === '') how = 'stance';
      else if (a.anim === dflt && !sk.begin && !sk.idle) how = 'plain';
    }
    if (how === 'plain' && (sk.via === 'attack' || !anims.attack || sk.loop === anims.attack.loop)) how = null;
    if (!how) continue;
    for (const clip of new Set([sk, anims.skill?.index === n ? anims.skill : null])) {
      if (clip) clip[how === 'stance' ? 'stance' : 'plainAttack'] = true;
    }
  }
  return anims;
}

/**
 * Attack clips that take turns (docs/rules/render.md 「Spine 클립 커버리지」 B, EN client charpacks and skill prefabs,
 * maintainer's notes 2026-10-14): model key prefix → { [the role's loop clip]: { alts, pick } }. Every role clip (attack,
 * skill, skills[i]) whose loop is that clip gains `alts` (the clips, in the client's order) and `pick`; render/spine.js
 * chooses one per swing. `pick`: 'loop' = in turn (an UberAnimationEffectEmitter `_replaceGroup` with `_loopType` LOOP, an
 * AbilitySelectableGroup `_selectAbilitySequentially` — from the first; AbilityRandomGroup `_selectMethod` 1 — `from: 1`,
 * see below); 'random' = any (`_selectMethod` 0, `_loopType` RANDOM); 'other' = a random first, then never the clip just
 * played (`_diffFromLastOneIfNotFirst`). Client code (2026-10-21, docs/rules/render.md 「Spine 클립 커버리지」 B):
 * `AbilityRandomGroup._GetAbilityInternal` (RVA 0xC19A50) casts one child per attack; Loop adds 1 to `m_loopIndex` before
 * reading it and `Reset` (0xC197A0, every attach — a mode switch) sets it to 0, so its first attack after an attach is the
 * second child (`from: 1`); `_SelectAbilityDifferentFromLastOne` (0xC19C30) leaves out the child just cast — by object, so
 * 山's [Attack_1, Attack_2, Attack_1] (the same Attack_1 twice) alternates.
 */
export const ATTACK_ALTS = Object.freeze({
  // 维什戴尔: Modes/Default/Body/Attack AbilityRandomGroup Random [Attack_A, Attack_B, Attack_C], `_diffFromLastOneIfNotFirst`
  'op:char_1035_wisdel:': { Attack_A: { alts: ['Attack_A', 'Attack_B', 'Attack_C'], pick: 'other' } },
  // 迷迭香: Modes/Default/Body/Attack AbilityRandomGroup Random [Attack_A, Attack_B], `_diffFromLastOneIfNotFirst`
  'op:char_391_rosmon:': { Attack_A: { alts: ['Attack_A', 'Attack_B'], pick: 'other' } },
  // 阿斯卡纶: Modes/Default/Body/Attack AbilityRandomGroup Loop [Attack_A, Attack_B]
  'op:char_4132_ascln:': { Attack_A: { alts: ['Attack_A', 'Attack_B'], pick: 'loop', from: 1 } },
  // 隐德来希 S3: Modes/S3/Body/Attack AbilityRandomGroup Loop [Skill_3_Loop_A, Skill_3_Loop_B]
  'op:char_4010_etlchi:': { Skill_3_Loop_A: { alts: ['Skill_3_Loop_A', 'Skill_3_Loop_B'], pick: 'loop', from: 1 } },
  // 望: Modes/Default/Body/Attack UberAnimationEffectEmitter LOOP [Attack_A, Attack_B] (skin keys → Attack_1_A / _B);
  // S3 skchr_wang_3/SpawnAnim LOOP [Skill_3_Attack_A, Skill_3_Attack_B]
  'op:char_2027_wang:': {
    Attack_1_A: { alts: ['Attack_1_A', 'Attack_1_B'], pick: 'loop' },
    Skill_3_Attack_A: { alts: ['Skill_3_Attack_A', 'Skill_3_Attack_B'], pick: 'loop' },
  },
  // 维娜·维多利亚: Modes/Default/Body/Attack UberAnimationEffectEmitter RANDOM [Attack_1, Attack_2]
  'op:char_1019_siege2:': { Attack_1: { alts: ['Attack_1', 'Attack_2'], pick: 'random' } },
  // 凛御银灰: Modes/Default/Body/Attack AbilityRandomGroup Random [Attack_A, Attack_B, Attack_C]
  'op:char_1045_svash2:': { Attack_A: { alts: ['Attack_A', 'Attack_B', 'Attack_C'], pick: 'random' } },
  // 圣聆初雪 S3: Modes/S3/Body/Attack UberAnimationEffectEmitter LOOP [Skill_3_Attack_A, _B, _C]
  'op:char_1046_sbell2:': { Skill_3_Attack_A: { alts: ['Skill_3_Attack_A', 'Skill_3_Attack_B', 'Skill_3_Attack_C'], pick: 'loop' } },
  // 伺夜 S3: Modes/S3/Body/Attack ability group `_selectAbilitySequentially` [Skill3_Attack_A, _B, _C]
  'op:char_427_vigil:': { Skill3_Attack_A: { alts: ['Skill3_Attack_A', 'Skill3_Attack_B', 'Skill3_Attack_C'], pick: 'loop' } },
  // 山: Modes/Default/Body/Attack AbilityRandomGroup Random [Attack_1, Attack_2, Attack_1] with
  // `_diffFromLastOneIfNotFirst` (skin keys Attack_1 / _2 → Attack_A / _B)
  'op:char_264_f12yin:': { Attack_A: { alts: ['Attack_A', 'Attack_B'], pick: 'other' } },
});

/**
 * The clip an attack plays on an enemy the unit blocks (docs/rules/render.md 「Spine 클립 커버리지」 A, EN / CN client
 * charpacks, maintainer's notes 2026-10-14): a mode's `_combat` (UnitMode) is the ability of the COMBAT state, whose target
 * is the first enemy the unit blocks (Character._FetchCombatTarget); the sim marks such a swing (ai.js 'swing' 7th field).
 * Model key prefix → { attack?: combat, skills?: { [0-based skill index]: combat } } with combat = a clip name or
 * { alts, pick } (ATTACK_ALTS' turns) → the role clip's `combat` { loop, alts?, pick? } (render/spine.js _swingClip).
 */
export const COMBAT_CLIPS = Object.freeze({
  // 拉普兰德: Modes/Default and S2 Body/Combat `_animKey "Combat"` (S2's other attacks: Skill)
  'op:char_140_whitew:': { attack: 'Combat', skills: { 1: 'Combat' } },
  // 银灰 (its S2 attacks with Combat throughout: SKILL_CLIP_OVERRIDES), 断崖: Modes/Default Body/Combat "Combat"
  'op:char_172_svrash:': { attack: 'Combat' },
  'op:char_294_ayer:': { attack: 'Combat' },
  // 伊内丝: Modes/Default, S2, S3 Body/Combat "Combat"; the S2 mode pairs Combat→Skill_2_Combat
  'op:char_4087_ines:': { attack: 'Combat', skills: { 1: 'Skill_2_Combat' } },
  // 丰川祥子: Modes/Default Body/Combat "Combat" (the S2 timbre modes' `_combat` is their Attack key)
  'op:char_4182_oblvns:': { attack: 'Combat' },
  // 仇白: Modes/Default and S2 Body/Combat = AbilityRandomGroup Random [Combat_A, Combat_B]; S3's `_combat` is its attack
  'op:char_4082_qiubai:': {
    attack: { alts: ['Combat_A', 'Combat_B'], pick: 'random' },
    skills: { 1: { alts: ['Combat_A', 'Combat_B'], pick: 'random' } },
  },
  // 予愿安洁莉娜 (CN client): mode S3 Body/Combat Skill_3_Combat
  'op:char_1015_aglna2:': { skills: { 2: 'Skill_3_Combat' } },
  // 领主·Sharp (char_617_sharp2): Modes/Default and S1 Body/Combat "Combat", the melee strike while it blocks
  'op:char_617_sharp2:': { attack: 'Combat' },
});

/**
 * Clips of an attack the sim marks as another ability of the client (docs/rules/render.md 「Spine 클립 커버리지」 D·H,
 * maintainer's notes 2026-10-14): the 'atk' event's signal (Battle.forceAttack `signal`: a talent's own attack 'T.1') →
 * that attack plays its clip (render/spine.js _signalStrike); an fx's `signal` (an attack behaviour that strikes nothing:
 * 秘术师 'store') → the clip as a whole swing (render/spine.js signalSwing). Model key prefix → { attack?: { [signal]: clip }, skills?:
 * { [0-based skill index]: { [signal]: clip } } } → the role clip's `signals`.
 */
export const SIGNAL_CLIPS = Object.freeze({
  // 圣约送葬人: the 受选之人 shot is each mode's talent ability (charpack Modes/*/Body/Talents/1 `_animKey "Attack_B"`, 2
  // shots); the S2 / S3 modes pair Attack_B→Skill_n_Attack_B
  'op:char_1032_excu2:': { attack: { 'T.1': 'Attack_B' }, skills: { 1: { 'T.1': 'Skill_2_Attack_B' }, 2: { 'T.1': 'Skill_3_Attack_B' } } },
  // 深靛: the 秘术师 store (no valid target: one energy instead of an attack) is the Default mode's attack behaviour with
  // Attack_Charge (the sim's fx 'mysticStore' { signal: 'store' }); her skill modes store nothing
  'op:char_469_indigo:': { attack: { store: 'Attack_Charge' } },
  // 新约能天使 S3: Modes/S3/Body/Attack trigger group [S3FireToToken `_animKey "Skill_3_Skill"`, Common Skill_3_Loop] — the
  // strike at the 投递坐标 as the skill opens (the kit's 'airstrike' fx { signal: 'fireToToken' })
  'op:char_1041_angel2:': { skills: { 2: { fireToToken: 'Skill_3_Skill' } } },
  // 凯尔希·思衡托 (CN client) S3: the transport's take-off Skill_3_Restart_Begin (the kit's fx 'kalts2Takeoff')
  'op:char_1052_kalts2:': { skills: { 2: { takeoff: 'Skill_3_Restart_Begin' } } },
  // 焰尾 S3 (焰心): 前锋剑术's strike after a dodge is the S3 mode's talent attack, key Skill_3_Attack_2 → the clip
  // Skill_2_Attack_2 (skin key table; the kit's 'riposte' fx { signal, strike })
  'op:char_420_flamtl:': { skills: { 2: { riposte: 'Skill_2_Attack_2' } } },
  // 予愿安洁莉娜 (CN client) S3 ending away from her tile: the Comback flight home opens on Skill_3_Restart_Begin [ASSUMED]
  // (the kit's 'aglnaFlight' { signal: 'comeback' }, sent as the skill ends — it closes the skill instead of Skill_3_End)
  'op:char_1015_aglna2:': { skills: { 2: { comeback: 'Skill_3_Restart_Begin' } } },
});

/**
 * The begin and end of a spell of attacks (docs/rules/render.md 「Spine 클립 커버리지」 C, EN client charpacks, maintainer's
 * notes 2026-10-14): a ThreePartOneshotAnimation attack plays its `_beginAnim` before the first attack only
 * (`_onlyPlayBeginAnimWhenFirstAttack` 1 on every one of the roster) and the ability's `_endAnimKey` as the attacks stop.
 * Model key prefix → { attack?: { begin?, end? }, skills?: { [0-based skill index]: { attackBegin?, attackEnd? } } }: the
 * attack role gains `firstBegin` (its begin is that first-attack clip; begin / end fill in clips the resolver left out), a
 * skill clip `firstAttackBegin` (a ThreePart begin of the skill's mode) or `attackBegin` / `attackEnd` (an attack channel's;
 * its own begin / end being the skill's) — render/spine.js swing / update. The sim flags the first attacks and adds the
 * begin to their wind-up (server/sim/ai.js attackTiming, data `attackAnim.begin`).
 */
export const FIRST_ATTACK_BEGIN = Object.freeze({
  // the attack roles the resolver already framed with Attack_Begin (texas: the key Attack_Begin is the clip Attack_Start;
  // 凯尔希·思衡托: CN client, Modes/default and s1)
  ...Object.fromEntries(['char_102_texas', 'char_1041_angel2', 'char_1045_svash2', 'char_107_liskam', 'char_222_bpipe',
    'char_4036_forcer', 'char_4193_lemuen', 'char_4194_rmixer', 'char_4211_snhunt', 'char_498_inside', 'char_1052_kalts2'].map((id) => [`op:${id}:`, { attack: {} }])),
  // 送葬人: Modes/S2 Body/Attack `_beginAnim "Skill_Right_Begin"`, `_oneshotAnim "Skill_Right_Loop"`
  'op:char_279_excu:': { skills: { 1: { firstAttackBegin: 'Skill_Right_Begin' } } },
  // 斯卡蒂: Modes/Default, S2, S3 Body/Attack `_beginAnim "Attack_Begin"`, `_oneshotAnim "Attack"`, `_endAnimKey "Attack_End"`
  'op:char_263_skadi:': { attack: { begin: 'Attack_Begin', end: 'Attack_End' } },
  // 伺夜: Modes/Default Body/Attack the same; Modes/S3 Attack_A / _B / _C `_endAnimKey "Skill3_ABC_Idle_Into"`
  'op:char_427_vigil:': { attack: { begin: 'Attack_Begin', end: 'Attack_End' }, skills: { 2: { attackEnd: 'Skill3_ABC_Idle_Into' } } },
  // 歌蕾蒂娅: the S2 mode's attack is a channel `_default {Skill_2_Begin, Skill_2_Loop, Skill_2_End}`
  'op:char_474_glady:': { skills: { 1: { attackBegin: 'Skill_2_Begin', attackEnd: 'Skill_2_End' } } },
});

/**
 * Facing-up clips (docs/rules/render.md 「Spine 클립 커버리지」 U, EN client, maintainer's notes 2026-10-14): an ability with
 * `_upAnimKey` plays it when its unit faces up (`AbstractAnimatedAbility.GetAnimKey`: down, up, then its key; `_faceToTarget`
 * → the facing, else the deploy direction), and these clips live in the Back skeleton, which the renderer draws facing
 * up only. Charid → { attack?: clip, skills?: { [0-based skill index]: clip } } → the Back roles' `up` (render/spine.js
 * _loopOf, an instant skill's clip).
 */
export const UP_CLIPS = Object.freeze({
  // 送葬人: Modes/Default and S1 Body/Attack `_upAnimKey "Attack_Up"` (S2's ThreePartOneshotAnimation has no up bundle)
  char_279_excu: { attack: 'Attack_Up' },
  // 诗怀雅: Modes/Default, S1, S2 Body/Attack `_upAnimKey "Attack_Up"`
  char_308_swire: { attack: 'Attack_Up' },
  // 松果: skchr_pinecn_1 `_upAnimKey "Skill_1_Up"`, Modes/S2 Body/Attack `_upAnimKey "Skill_2_Up"`
  char_440_pinecn: { skills: { 0: 'Skill_1_Up', 1: 'Skill_2_Up' } },
});

/**
 * The resting clips a skill sets for the whole battle (docs/rules/render.md 「Spine 클립 커버리지」 E, maintainer's notes
 * 2026-10-14): a skill whose prefab root has `_defaultModeIndex` ≥ 0 makes that charpack mode the operator's default mode
 * (`Character._GetDefaultModeIndex` → `Unit.OnInit` SwitchMode), so the mode's `_replaceAnimPairs` (Born → Start_n,
 * Idle → …, Attack → …) hold from the deployment on. Model key prefix → { [0-based skill index]: { deploy?, idle?,
 * attack? } } → anims.equip (render/spine.js setSkillIndex).
 */
export const EQUIP_ROLES = Object.freeze({
  // 引星棘刺 (char_1039_thorn2) S3: skchr_thorn2_3 `_defaultModeIndex` 1 = mode S3 (Born→Start_2, Idle→Skill_3_Idle)
  'op:char_1039_thorn2:': { 2: { deploy: 'Start_2', idle: 'Skill_3_Idle' } },
  // 望 (char_2027_wang) S2: skchr_wang_2 `_defaultModeIndex` 1 = mode S2 (Born→Start_2, Idle→Idle_2, Attack_A/_B→Attack_2_A/_B,
  // the emitter's LOOP turns)
  'op:char_2027_wang:': {
    1: { deploy: 'Start_2', idle: 'Idle_2', attack: { begin: null, loop: 'Attack_2_A', end: null, alts: ['Attack_2_A', 'Attack_2_B'], pick: 'loop' } },
  },
  // 丰川祥子 (char_4182_oblvns) S2: skchr_oblvns_2 `_defaultModeIndex` 2 = mode S2_Atk, the piano (Born→Skill_2_Start,
  // Idle→Skill_2_Idle_A, Attack→Skill_2_Loop_A; its `_combat` is that attack too)
  'op:char_4182_oblvns:': { 1: { deploy: 'Skill_2_Start', idle: 'Skill_2_Idle_A', attack: { begin: null, loop: 'Skill_2_Loop_A', end: null } } },
  // 安洁莉娜 (char_291_aglina) S2 / S3: `_defaultModeIndex` 1 = mode Disarmed (no normal attack; Idle→Idle2, skin key → Idle_Charge)
  'op:char_291_aglina:': { 1: { idle: 'Idle_Charge' }, 2: { idle: 'Idle_Charge' } },
  // 予愿安洁莉娜 (char_1015_aglna2, CN client) S1: skchr_aglna2_1 `_defaultModeIndex` 5 = S1_TakeOff — she deploys taking
  // off (maintainer 2026-10-14 「배치부터 이륙이 맞아」): her take-off clip Start_2 (skin key Skill_1_Begin; down from above
  // into her hover) instead of the ground Start (a swoop in from behind)
  'op:char_1015_aglna2:': { 0: { deploy: 'Start_2' } },
});

/**
 * A cast's clip variants (docs/rules/render.md 「Spine 클립 커버리지」 G, maintainer's notes 2026-10-14): the sim names the
 * variant of a cast in its 'skill' event (a kit's `castVariant`, server/sim/skills.js _evOn) and the skill clip's
 * `variants[name]` overlays its clips for that cast (render/spine.js setSkill). Model key prefix → { [0-based skill
 * index]: { [variant]: { begin?, loop?, end?, idle? } } }.
 */
export const SKILL_VARIANTS = Object.freeze({
  // 灵知 S2 cast with every charge stored: charpack mode S2+ pairs Skill_2→Skill_3
  'op:char_206_gnosis:': { 1: { charged: { loop: 'Skill_3' } } },
  // 缄默德克萨斯 S3 recast by 德克萨斯传统 (her first kill): skchr_texas2_3 plays Start_3_2 for Start_3
  'op:char_1028_texas2:': { 2: { recast: { begin: 'Start_3_2' } } },
  // 丰川祥子 S2 cast from the organ (mode S2_AttackSpeed: no Trans pair) plays the key's own clip Skill_2_Trans_B
  'op:char_4182_oblvns:': { 1: { fromOrgan: { loop: 'Skill_2_Trans_B' } } },
});

/**
 * The death, stun and deploy clips of a skill's mode (docs/rules/render.md 「Spine 클립 커버리지」 D·E·F, maintainer's notes
 * 2026-10-14): the mode a skill switches the operator to pairs Die (or Stun) with a clip of its own (`_replaceAnimPairs`,
 * or a mode's animator hooker), so an operator knocked out or stunned while that skill runs plays it; a 【移动】 by the skill
 * redeploys on a clip of its own; a mode's Born pair (`deploy`) is the deploy clip while the skill is on — a skill cast
 * as the operator deploys (spType ON_DEPLOY) puts her in that mode before the deploy clip plays. Model key prefix →
 * { [0-based skill index]: { die?, stun?, deploy?, deploys?: { [key]: clip } } } → the skill clip's `die` / `stun` /
 * `deploy` / `deploys` (render/spine.js dieClip / _enterStun / deploy — the key from the sim's 'deploy' event,
 * Battle.moveRedeploy `clip`).
 */
export const SKILL_STATE_CLIPS = Object.freeze({
  // 予愿安洁莉娜 (CN client): the S1 / S2 / S3 modes (with their take-off, 吟唱 and landing modes) pair Die→Skill_n_Die
  'op:char_1015_aglna2:': { 0: { die: 'Skill_1_Die' }, 1: { die: 'Skill_2_Die' }, 2: { die: 'Skill_3_Die' } },
  // 乌尔比安: the S2 mode (a toggle) pairs Die→Skill_2_Die; S3's 【移动】 to the anchor restarts on Skill_3_ReStart_A, on
  // his own tile on Skill_3_ReStart_B [ASSUMED: which node plays it], its 【返回】 on Skill_3_Back
  'op:char_4145_ulpia:': {
    1: { die: 'Skill_2_Die' },
    2: { deploys: { anchor: 'Skill_3_ReStart_A', here: 'Skill_3_ReStart_B', back: 'Skill_3_Back' } },
  },
  // 凯尔希·思衡托 (CN client) S3: she lands from the transport on Skill_3_Restart_End (the 【移动】's key 'land')
  'op:char_1052_kalts2:': { 2: { deploys: { land: 'Skill_3_Restart_End' } } },
  // 耀骑士临光: the S2 mode pairs Die→Skill_2_Die (and Stun→Die, not drawn: a stun keeps the Stun clip)
  'op:char_1014_nearl2:': { 1: { die: 'Skill_2_Die' } },
  // 缇比: the S1 / S2 flight modes (take-off and landing included) pair Die→Die_2
  'op:char_4191_tippi:': { 0: { die: 'Die_2' }, 1: { die: 'Die_2' } },
  // 迷迭香: only mode S3's animator hooker is the Graphic SimpleUnitAnimatorHooker with Stun→Stun_Skill_3
  'op:char_391_rosmon:': { 2: { stun: 'Stun_Skill_3' } },
  // 缄默德克萨斯: S2 / S3 are cast as she deploys (spType ON_DEPLOY; the Damage / AppearSwordRain ability plays Start_n
  // from its first frame at the cast) and their modes S2 / S3 pair Born→Start_n — she comes in on Start_2 (diagonally,
  // from behind and above) / Start_3, not on the plain Start drop (maintainer report 2026-10-14)
  'op:char_1028_texas2:': { 1: { deploy: 'Start_2' }, 2: { deploy: 'Start_3' } },
});

/**
 * Apply SKILL_CLIP_OVERRIDES to resolveRoles' result for model `key` (mutates and returns `anims`). `names` (the
 * skeleton's clip names, optional): an override clip the model lacks is dropped — one side's skeleton can miss a clip
 * the other has (泥岩 Back has no Skill_2_Begin / _Awake / _Sleep: its S3 starts straight in Skill_2_Attack / _Idle).
 */
export function applyAnimOverrides(key, anims, names = null) {
  if (!anims || typeof key !== 'string') return anims;
  for (const [prefix, map] of Object.entries(SKILL_CLIP_OVERRIDES)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, how] of Object.entries(map)) {
      let clip = null;
      if (how === 'attack' && anims.attack) clip = { ...anims.attack, via: 'attack', index: Number(i), idle: null };
      else if (how && typeof how === 'object') {
        clip = how.via === 'attack' && anims.attack ? { ...anims.attack, idle: null, ...how, index: Number(i) } : { ...how, index: Number(i) };
        for (const f of ['begin', 'loop', 'end', 'idle']) {
          if (Array.isArray(clip[f])) clip[f] = names ? clip[f].filter((n) => names.includes(n)) : [...clip[f]];
          else if (names && clip[f] && !names.includes(clip[f])) clip[f] = null;
        }
      }
      if (!clip) continue;
      if (anims.skills && anims.skills[i]) anims.skills[i] = clip;
      if (anims.skill && anims.skill.index === Number(i)) anims.skill = clip;
    }
  }
  for (const [prefix, map] of Object.entries(ATTACK_ALTS)) {
    if (!key.startsWith(prefix)) continue;
    for (const c of [anims.attack, anims.skill, ...Object.values(anims.skills || {})]) {
      const alt = c && map[c.loop];
      if (!alt) continue;
      const alts = names ? alt.alts.filter((n) => names.includes(n)) : [...alt.alts];
      if (alts.length > 1) Object.assign(c, { alts, pick: alt.pick }, alt.from ? { from: alt.from } : {});
    }
  }
  for (const [prefix, map] of Object.entries(COMBAT_CLIPS)) {
    if (!key.startsWith(prefix)) continue;
    const combatOf = (how) => {
      const c = typeof how === 'string' ? { loop: how } : { loop: how.alts[0], ...how };
      if (c.alts) c.alts = c.alts.filter((n) => !names || names.includes(n));
      if (c.alts && c.alts.length < 2) { c.loop = c.alts[0] ?? c.loop; delete c.alts; delete c.pick; }
      return !names || names.includes(c.loop) ? c : null;
    };
    const put = (clip, how) => { const c = clip && how ? combatOf(how) : null; if (c) clip.combat = c; };
    put(anims.attack, map.attack);
    for (const [i, how] of Object.entries(map.skills || {})) {
      put(anims.skills?.[i], how);
      if (anims.skill?.index === Number(i) && anims.skill !== anims.skills?.[i]) put(anims.skill, how);
    }
  }
  for (const [prefix, map] of Object.entries(EQUIP_ROLES)) {
    if (!key.startsWith(prefix)) continue;
    const has = (n) => typeof n === 'string' && (!names || names.includes(n));
    for (const [i, roles] of Object.entries(map)) {
      const e = {};
      if (has(roles.deploy)) e.deploy = roles.deploy;
      if (has(roles.idle)) e.idle = roles.idle;
      if (roles.attack && has(roles.attack.loop)) {
        const a = { ...roles.attack };
        if (a.alts) a.alts = a.alts.filter(has);
        if (!(a.alts?.length > 1)) { delete a.alts; delete a.pick; }
        e.attack = a;
      }
      if (Object.keys(e).length) (anims.equip ||= {})[i] = e;
    }
  }
  for (const [id, map] of Object.entries(UP_CLIPS)) {
    if (key !== `op:${id}:back`) continue;
    const has = (n) => typeof n === 'string' && (!names || names.includes(n));
    if (anims.attack && has(map.attack)) anims.attack.up = map.attack;
    for (const [i, up] of Object.entries(map.skills || {})) {
      if (!has(up)) continue;
      for (const clip of new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])) if (clip) clip.up = up;
    }
  }
  for (const [prefix, map] of Object.entries(FIRST_ATTACK_BEGIN)) {
    if (!key.startsWith(prefix)) continue;
    const has = (n) => typeof n === 'string' && (!names || names.includes(n));
    const at = anims.attack;
    if (map.attack && at) {
      for (const f of ['begin', 'end']) if (has(map.attack[f])) at[f] = map.attack[f];
      if (has(at.begin)) at.firstBegin = true;
      // (a skill slot attacking with the attack clip, `via: 'attack'`, attacks through the attack role: render/spine.js)
    }
    for (const [i, o] of Object.entries(map.skills || {})) {
      for (const clip of new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])) {
        if (!clip) continue;
        for (const f of ['firstAttackBegin', 'attackBegin', 'attackEnd']) if (has(o[f])) clip[f] = o[f];
      }
    }
  }
  for (const [prefix, map] of Object.entries(SIGNAL_CLIPS)) {
    if (!key.startsWith(prefix)) continue;
    const put = (clip, sigs) => {
      const o = Object.fromEntries(Object.entries(sigs || {}).filter(([, n]) => !names || names.includes(n)));
      if (clip && Object.keys(o).length) clip.signals = o;
    };
    put(anims.attack, map.attack);
    for (const [i, sigs] of Object.entries(map.skills || {})) {
      for (const clip of new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])) put(clip, sigs);
    }
  }
  for (const [prefix, map] of Object.entries(SKILL_VARIANTS)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, vars] of Object.entries(map)) {
      for (const clip of new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])) {
        if (!clip) continue;
        for (const [name, v] of Object.entries(vars)) {
          const o = Object.fromEntries(Object.entries(v).filter(([, n]) => !names || names.includes(n)));
          if (Object.keys(o).length) (clip.variants ||= {})[name] = o;
        }
      }
    }
  }
  for (const [prefix, map] of Object.entries(SKILL_STATE_CLIPS)) {
    if (!key.startsWith(prefix)) continue;
    for (const [i, st] of Object.entries(map)) {
      for (const clip of new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])) {
        if (!clip) continue;
        for (const f of ['die', 'stun', 'deploy']) if (st[f] && (!names || names.includes(st[f]))) clip[f] = st[f];
        const deploys = Object.fromEntries(Object.entries(st.deploys || {}).filter(([, n]) => !names || names.includes(n)));
        if (Object.keys(deploys).length) clip.deploys = deploys;
      }
    }
  }
  return anims;
}

// Per-model skill clip overrides (local patch, docs/LOCAL-PATCH.md "우타게 S2 애니메이션"; docs/rules/render.md 「Spine 클립
// 커버리지」 J). Where the client's clip keys are extracted (.cache/anim-keys.json) the skill roles come from them
// (anim-keys.mjs keyRoles / overlayKeyRoles) and these tables apply after; the rows the keys now give (宴 S2, 莫斯提马 S2 / S3,
// 灵知 S3, 焰影苇草 S3, 缄默德克萨斯 S2 / S3, 银灰 S2, 安洁莉娜, 焰尾, 予愿安洁莉娜 S1, 塞雷娅 S1 / S2, 耀骑士临光 S2, 水月 S3;
// 2026-10-23) are gone. What stays is what the keys cannot say: a model form, a strike per attack, a cast the official game
// does not show. The same holds for the tables below it: the keys give the rows of ATTACK_ALTS, COMBAT_CLIPS, UP_CLIPS,
// EQUIP_ROLES, SKILL_STATE_CLIPS, FIRST_ATTACK_BEGIN and MODE_STANCE (anim-keys.mjs keyTables, through the put* appliers
// here; 2026-10-23), and the rows left in them are the keys' exceptions or the sim's own keys.
//
// A clip object replaces the skill's clips outright (one with `via: 'attack'` keeps the attack role's clip for its attacks;
// an `end` may be an array of clips played in a row):
// 泥岩 (char_311_mudrok): S2 岩崩锤 strikes with `Skill_1` ([uc]skills.ab skchr_mudrok_2 attack ability `_animKey
// "Skill_1"`, 1.6 s) — `strike: true`: the clip is that empowered attack's, played by the attack, not at the cast
// (render/spine.js). `Skill_2_*` is S3 秽壤的血脉's (SleepAura `_default {Skill_2_Begin, Skill_2_Sleep, Skill_2_Awake}`,
// then charpack mode S3 `_replaceAnimPairs` Idle→Skill_2_Idle, Attack→Skill_2_Attack). The 10 s sleep (Skill_2_Begin →
// Skill_2_Sleep, Skill_2_Awake as she wakes) is a model form of its own: render/units.js FORMS (kit fx 'stone' / 'rockfall').
import { skillModeIndex } from '../../shared/skill-modes.js';

const clips = (o) => Object.freeze({ begin: null, loop: null, end: null, idle: null, ...o });

/** model key (tools/assets/plan.mjs `op:<charId>:<dir>`) prefix → { [0-based skill index]: 'attack' | clip object } */
export const SKILL_CLIP_OVERRIDES = Object.freeze({
  'op:char_311_mudrok:': Object.freeze({
    1: clips({ loop: 'Skill_1', strike: true }),
    2: clips({ begin: 'Skill_2_Begin', loop: 'Skill_2_Attack', end: 'Skill_2_End', idle: 'Skill_2_Idle' }),
  }),
  // The skill prefabs and charpack modes of the EN client (docs/rules/render.md 「Spine 클립 커버리지」, maintainer's notes
  // 2026-10-14), where the resolver's guess by name plays another skill's clips:
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
  // 赤刃明霄陈 (char_1050_chen3): S2 attacks with her plain clips; its Skill_2_Begin → Skill_2_Disappear (she vanishes while
  // she slashes) and Start_2 (back, mode S2Respawn) are a model form (render/units.js FORMS)
  'op:char_1050_chen3:': Object.freeze({ 1: 'attack' }),
  // 丰川祥子 (char_4182_oblvns): S2 满月的舞会's cast clip is skchr_oblvns_2 `_beginAnim "Skill_2_Trans_B"` (`_playSkillBeginAnim
  // 1), which the piano mode pairs Trans_B→Trans_A (SKILL_VARIANTS: from the organ, Trans_B); Skill_2_Start / _Idle_A / _Loop_A
  // are the piano mode's (EQUIP_ROLES), _Idle_B / _Loop_B the organ's (render/units.js FORMS).
  'op:char_4182_oblvns:': Object.freeze({
    1: clips({ loop: 'Skill_2_Trans_A' }),
  }),
  // 蕾缪安 (char_4193_lemuen): skchr_lemuen_2 casts no clip (`_playSkillBeginAnim` 0); its mode S2 attacks with `Normal`, the
  // plain Attack_Begin / Attack_Loop, and aims with `Aim`, a channel `_default {Skill_2_Begin, Skill_2_Idle, Skill_2_End}` —
  // the aim is the S2 skill clip's `aim` signal (SIGNAL_CLIPS)
  'op:char_4193_lemuen:': Object.freeze({ 1: 'attack' }),
  // 水月 (char_437_mizuki): S2 switches to his mode 2 `S1`, whose attack `Skill_1` is played by each attack (`strike`, as 泥岩 S2)
  'op:char_437_mizuki:': Object.freeze({
    1: clips({ loop: 'Skill_1', strike: true }),
  }),
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
 * MODE_ATTACK_KEEP leaves a skill out, PLAIN_ATTACK adds one with no mode of its own, MODE_STANCE a stance the rule cannot
 * tell (the Default mode has no key to compare).
 */
export const MODE_ATTACK_KEEP = Object.freeze({
  // 歌蕾蒂娅 S2: the mode's `_animKey ""`, but her S2 strikes through its own attack channel (Skill_2_Begin / _Loop / _End,
  // FIRST_ATTACK_BEGIN `attackBegin`)
  'op:char_474_glady:': Object.freeze([1]),
});
export const MODE_STANCE = Object.freeze({
  // the stances the timing file cannot tell come from the keys (薄绿 S2, 信仰搅拌机 S3, 小满 S2: the mode's own `_animKey ""`
  // attack; anim-keys.mjs overlayKeyRoles `stance`, 2026-10-23)
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
  const stance = Object.entries(MODE_STANCE).find(([p]) => key.startsWith(p))?.[1] || [];
  const t = timing?.ops?.[id];
  const dflt = t?.attack?.[0]?.anim;
  for (const [i, sk] of Object.entries(anims.skills)) {
    const n = Number(i);
    if (!sk || keep.includes(n)) continue;
    let how = stance.includes(n) ? 'stance' : plain.includes(n) ? 'plain' : null;
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
 * played (`_diffFromLastOneIfNotFirst`). Official client (2026-10-21, docs/rules/render.md 「Spine 클립 커버리지」 B):
 * `AbilityRandomGroup._GetAbilityInternal` casts one child per attack; Loop adds 1 to `m_loopIndex` before
 * reading it and `Reset` (every attach — a mode switch) sets it to 0, so its first attack after an attach is the
 * second child (`from: 1`); `_SelectAbilityDifferentFromLastOne` leaves out the child just cast — by object, so
 * 山's [Attack_1, Attack_2, Attack_1] (the same Attack_1 twice) alternates.
 */
export const ATTACK_ALTS = Object.freeze({
  // every row comes from the keys now (the eleven of 2026-10-14: 维什戴尔, 迷迭香, 阿斯卡纶, 隐德来希 S3, 望 and its S3, 维娜·维多利亚,
  // 凛御银灰, 圣聆初雪 S3, 伺夜 S3, 山; 2026-10-23)
});

/**
 * The clip an attack plays on an enemy the unit blocks (docs/rules/render.md 「Spine 클립 커버리지」 A, EN / CN client
 * charpacks, maintainer's notes 2026-10-14): a mode's `_combat` (UnitMode) is the ability of the COMBAT state, whose target
 * is the first enemy the unit blocks (Character._FetchCombatTarget); the sim marks such a swing (ai.js 'swing' 7th field).
 * Model key prefix → { attack?: combat, skills?: { [0-based skill index]: combat } } with combat = a clip name or
 * { alts, pick } (ATTACK_ALTS' turns) → the role clip's `combat` { loop, alts?, pick? } (render/spine.js _swingClip).
 */
export const COMBAT_CLIPS = Object.freeze({
  // 丰川祥子: Modes/Default Body/Combat "Combat" — her keys' attack is that Combat (Body/Combat before the resolver's Attack), so
  // the attack role stays the guess and its row stays here (the others come from the keys, 2026-10-23)
  'op:char_4182_oblvns:': { attack: 'Combat' },
});

/**
 * Clips of an attack the sim marks as another ability of the client (docs/rules/render.md 「Spine 클립 커버리지」 D·H,
 * maintainer's notes 2026-10-14): the 'atk' event's signal (Battle.forceAttack `signal`: a talent's own attack 'T.1') →
 * that attack plays its clip (render/spine.js _signalStrike); an fx's `signal` (an attack behaviour that strikes nothing:
 * 秘术师 'store') → the clip as a whole swing (render/spine.js signalSwing); a channel { begin, loop, end } for an fx `signal` held
 * from `on` 1 to 0 (render/spine.js holdSignal: 蕾缪安 S2's Aim). Model key prefix → { attack?: { [signal]: clip }, skills?:
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
  // 琳琅诗怀雅 S1 / S2 (passive: the render never turns the skill on, her attacks keep the attack role): the modes'
  // Body/Trigger groups pick HealAlly `_animKey "Skill_1"` (a coin's heal, the whole attack turn — the kit's 'swire2Heal'
  // fx { signal: 'healAlly', t }) or SpawnToken `_animKey "Skill_2"` (the champagne throw — 'swire2Throw') over Attack
  'op:char_1033_swire2:': { attack: { healAlly: 'Skill_1', spawnToken: 'Skill_2' } },
  'op:char_4193_lemuen:': { skills: { 1: { aim: { begin: 'Skill_2_Begin', loop: 'Skill_2_Idle', end: 'Skill_2_End' } } } },
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
  // the attack roles' first-attack begins come from the keys (texas … 凯尔希·思衡托, 斯卡蒂, 伺夜 and its S3 spell end; 2026-10-23)
  // 歌蕾蒂娅: the S2 mode's attack is a channel `_default {Skill_2_Begin, Skill_2_Loop, Skill_2_End}` (her S2 clips are a hand
  // row of SKILL_CLIP_OVERRIDES, which replaces what the keys give)
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
  // every row comes from the keys now (送葬人, 诗怀雅, 松果; 2026-10-23)
});

/**
 * The resting clips a skill sets for the whole battle (docs/rules/render.md 「Spine 클립 커버리지」 E, maintainer's notes
 * 2026-10-14): a skill whose prefab root has `_defaultModeIndex` ≥ 0 makes that charpack mode the operator's default mode
 * (`Character._GetDefaultModeIndex` → `Unit.OnInit` SwitchMode), so the mode's `_replaceAnimPairs` (Born → Start_n,
 * Idle → …, Attack → …) hold from the deployment on. Model key prefix → { [0-based skill index]: { deploy?, idle?,
 * attack? } } → anims.equip (render/spine.js setSkillIndex).
 */
export const EQUIP_ROLES = Object.freeze({
  // every row comes from the keys now (引星棘刺 S3, 望 S2, 丰川祥子 S2, 安洁莉娜 S2 / S3, 予愿安洁莉娜 S1's take-off mode; 2026-10-23)
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
  // 卡涅利安 S1 / S2 / S3 cast with every charge stored: the skill buff billro_s_N switches to mode SN_Enhance (Idle→Skill_2_Idle,
  // Attack Skill_2_Loop; the skin mix Skill_2_Loop / _Idle → Idle is Skill_2_End) when she carries billro_talent_enhance_mark
  // (billro_talent_enhance_judge: ≥ 2 charges available), else to SN (Skill_Idle / Skill_Loop / Skill_End — the keys)
  'op:char_426_billro:': Object.fromEntries([0, 1, 2].map((i) => [i, { charged: { loop: 'Skill_2_Loop', idle: 'Skill_2_Idle', end: 'Skill_2_End' } }])),
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
  // the die / stun / deploy pairs come from the keys (予愿安洁莉娜, 乌尔比安 S2, 耀骑士临光 S2, 缇比, 迷迭香 S3, 缄默德克萨斯; 2026-10-23); the
  // 【移动】 clips by the sim's key stay:
  // 乌尔比安: S3's 【移动】 to the anchor restarts on Skill_3_ReStart_A, on his own tile on Skill_3_ReStart_B [ASSUMED: which node
  // plays it], its 【返回】 on Skill_3_Back
  'op:char_4145_ulpia:': {
    2: { deploys: { anchor: 'Skill_3_ReStart_A', here: 'Skill_3_ReStart_B', back: 'Skill_3_Back' } },
  },
  // 凯尔希·思衡托 (CN client) S3: she lands from the transport on Skill_3_Restart_End (the 【移动】's key 'land')
  'op:char_1052_kalts2:': { 2: { deploys: { land: 'Skill_3_Restart_End' } } },
});

// The appliers of the tables below SKILL_CLIP_OVERRIDES, one row each (mutate `anims`; `names` = the skeleton's clips, null =
// keep every clip): applyAnimOverrides runs them with the hand rows, anim-keys.mjs overlayKeyRoles first with the rows the
// client's keys give.
const hasIn = (names) => (n) => typeof n === 'string' && (!names || names.includes(n));
/** The role clips of skill index i: skills[i] and the `skill` role when it is that skill. */
const skillClips = (anims, i) => [...new Set([anims.skills?.[i], anims.skill?.index === Number(i) ? anims.skill : null])].filter(Boolean);

/** An ATTACK_ALTS row: every role clip whose loop is a row key gains its `alts` / `pick` (/ `from`). */
export function putAlts(anims, map, names = null) {
  for (const c of [anims.attack, anims.skill, ...Object.values(anims.skills || {})]) {
    const alt = c && map[c.loop];
    if (!alt) continue;
    const alts = names ? alt.alts.filter((n) => names.includes(n)) : [...alt.alts];
    if (alts.length > 1) Object.assign(c, { alts, pick: alt.pick }, alt.from ? { from: alt.from } : {});
  }
  return anims;
}

/** A COMBAT_CLIPS row: the role clips' `combat`. */
export function putCombat(anims, map, names = null) {
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
  return anims;
}

/** An EQUIP_ROLES row: anims.equip[i]. */
export function putEquip(anims, map, names = null) {
  const has = hasIn(names);
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
  return anims;
}

/** A UP_CLIPS row (the Back model's): the role clips' `up`. */
export function putUp(anims, map, names = null) {
  const has = hasIn(names);
  if (anims.attack && has(map.attack)) anims.attack.up = map.attack;
  for (const [i, up] of Object.entries(map.skills || {})) {
    if (!has(up)) continue;
    for (const clip of skillClips(anims, i)) clip.up = up;
  }
  return anims;
}

/** A FIRST_ATTACK_BEGIN row: the attack role's `firstBegin` (and begin / end), the skill clips' first-attack begin / spell end. */
export function putFirst(anims, map, names = null) {
  const has = hasIn(names);
  const at = anims.attack;
  if (map.attack && at) {
    for (const f of ['begin', 'end']) if (has(map.attack[f])) at[f] = map.attack[f];
    if (has(at.begin)) at.firstBegin = true;
    // (a skill slot attacking with the attack clip, `via: 'attack'`, attacks through the attack role: render/spine.js)
  }
  for (const [i, o] of Object.entries(map.skills || {})) {
    for (const clip of skillClips(anims, i)) {
      for (const f of ['firstAttackBegin', 'attackBegin', 'attackEnd']) if (has(o[f])) clip[f] = o[f];
    }
  }
  return anims;
}

/** A SKILL_STATE_CLIPS row: the skill clips' `die` / `stun` / `deploy` / `deploys`. */
export function putStates(anims, map, names = null) {
  const has = hasIn(names);
  for (const [i, st] of Object.entries(map)) {
    for (const clip of skillClips(anims, i)) {
      for (const f of ['die', 'stun', 'deploy']) if (has(st[f])) clip[f] = st[f];
      const deploys = Object.fromEntries(Object.entries(st.deploys || {}).filter(([, n]) => has(n)));
      if (Object.keys(deploys).length) clip.deploys = deploys;
    }
  }
  return anims;
}

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
  const rows = (table) => Object.entries(table).filter(([prefix]) => key.startsWith(prefix)).map(([, map]) => map);
  for (const map of rows(ATTACK_ALTS)) putAlts(anims, map, names);
  for (const map of rows(COMBAT_CLIPS)) putCombat(anims, map, names);
  for (const map of rows(EQUIP_ROLES)) putEquip(anims, map, names);
  for (const [id, map] of Object.entries(UP_CLIPS)) if (key === `op:${id}:back`) putUp(anims, map, names);
  for (const map of rows(FIRST_ATTACK_BEGIN)) putFirst(anims, map, names);
  for (const [prefix, map] of Object.entries(SIGNAL_CLIPS)) {
    if (!key.startsWith(prefix)) continue;
    const has = (n) => !names || names.includes(n);
    // a channel keeps the clips the skeleton has, and needs its loop
    const keep = (v) => (typeof v === 'string' ? (has(v) ? v : null)
      : v && has(v.loop) ? Object.fromEntries(Object.entries(v).filter(([, n]) => has(n))) : null);
    const put = (clip, sigs) => {
      const o = Object.fromEntries(Object.entries(sigs || {}).map(([k, v]) => [k, keep(v)]).filter(([, v]) => v));
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
  for (const map of rows(SKILL_STATE_CLIPS)) putStates(anims, map, names);
  return anims;
}

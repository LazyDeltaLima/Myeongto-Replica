// public/js/render/fx/kitofficial.js — kit 'fx' events drawn with the prefabs the client creates at that moment
// (2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). For an operator whose official effects play, fxgame.js
// standInOff drops the procedural stand-in of a kit event; most of those moments are a skill's start or an attack, which
// the 'skill' / 'atk' / 'dmg' bindings draw. The ones below are talent / buff moments the client draws from its buff
// templates (config/buff_template_holder.ab: a CreateBuff's `overrideEffectKey`, a CreateEffect node) or a projectile's
// `_effectsWhenReached`; without them the moment drew nothing. Pure: fxgame.js executes the plan (kitOfficialFx).
// Each plan carries the client key(s) it stands for (`cite`: test/render/fx-bindings.test.js checks them against the
// binding table, docs/rules/fx.md 「바인딩 표」). 2026-10-23 (묶음 K2): a play may name one of those keys instead of a prefab,
// `{ tpl: key, on, life }` — the table's rows of that key with no condition give the prefabs (tplPlays).

import { cite } from './cite.js';
import { whenPlays } from './conds.js';

/**
 * One play: `n` the prefab (of the operator's bundle, or of `bundle`), on `on` ('op' the event's operator, 'point' the event's
 * x / y on the ground, else the event's field naming a unit: 'id', 'tgt' …) — circling it with `orbit` { r, spd } —, for `life`:
 *   'once'     its own duration
 *   number     seconds
 *   'skill'    until the operator's skill ends (a buff entry: fxgame stopBuffs) or it leaves
 *   'deployed' until the operator leaves the field
 *   'unit'     until the `on` unit's 'die' — then `end` [prefab] plays where it stood (a buff template's ON_OWNER_FINISH)
 *   'tag'      until a later event's `stop` names `tag` (with `leave`: also when the operator leaves)
 * A play whose `on` field holds a list plays on each of its units; `unit` names one unit by its id instead of `on`.
 * 2026-10-21: a `cast` play is the operator's own cast effect, played as its attacks' casts are (fxgame.js play: its
 * mode's `turn` — `_useFourDirectionalFace` — applies), for its prefab's duration.
 * or a line `line: [from, to]` (the event's fields naming two units; `to` may name a list) while both stand, or for the
 * line prefab's own duration with `life: 'once'` (2026-10-24: a line with `tag` also ends when a later plan's `stop` names
 * it, one with `life: 'skill'` as the operator's skill ends; `line: [field]` with one field naming a list runs through its
 * units in order); or a flight `fly` (tiles / s) from the operator to the event's point —
 * a play with `after: 'fly'` starts when it lands. A 'point' play may name its own ground point `at: [x, y]`.
 * 2026-10-21: a flight with `to` (the event's field naming units) is a projectile at each unit from the operator's muzzle,
 * `gap` s apart, followed, playing `hit` [names] on it as it lands; one with `from: 'point'` flies from the event's point
 * back to the operator; either may carry `rope` (a line from the operator to the flying head) and `pass` { n, on } (`n` on
 * each unit of field `on` as the head passes it). A `harpoon` { out, back, moving? } play is a line from the operator to
 * a head going out to the event's point in `out` s and back in `back` s (`moving` on the head from its arrival).
 * A `slot` play holds one effect per operator and slot until the operator leaves: a later play of the same prefab in that
 * slot keeps it running, another prefab replaces it, `{ slot, off: true }` ends it (AttachListenerToTileAbility
 * `_HoldCastedEffectOnTile` with `_dontCreateNewEffectWhenCastedTimesSame`); on a 'point' (or `at`) or on / circling a
 * unit as any play, with `ready` a prefab played there once when the slot was empty.
 * 2026-10-23: `tpl` (a key the plan cites) in place of `n`: each prefab the key holds (tools/build-fx-plays.mjs `held`) plays
 * as this play for `life` (none given: the key's LIMITED seconds) — with life 'unit' its `end` prefab as `end` —, and each
 * prefab it creates once (`once`) for its own duration. A projectile's key (its `trail` / `reach` / `hit`): with `fly`, the
 * flight is its one `_mainEffect`, with its `_effectsWhenHit` as `hit` when it flies `to` units, and each of its
 * `_effectsWhenReached` plays once on the event's point as it lands (`after: 'fly'`); without `fly`, they play once on `on`.
 * 2026-10-23 (묶음 K3): `when` (a state, render/fx/conds.js) also plays the key's rows behind conditions that hold in it —
 * `{ back }` the deployed direction, `{ stacks, bb }` a stack count and its bounds, `{ all: true }` the event stands for
 * every condition of the key's rows (the sim decided them; never a choice between prefabs — fx-bindings.test.js).
 */
const once = (n, on = 'op') => ({ n, on, life: 'once' });
/** The event stands for every condition of the key's rows. */
const ALL = Object.freeze({ all: true });

/**
 * event → operator bundle → (o, ctx) → { stop?: tag[], play: plays[], pass?: the event keeps its stand-in } | null.
 * ctx: { skill: the operator's skill index 0–2, back: it faces UP (deployed facing the back), foe: the event's `id` unit is
 * an enemy }.
 */
export const KIT_OFFICIAL = {
  // 号角 T2 血战 (horn_t_1[muso] → buff horn_t_1[reborn_effect], effect horn_buff_01_start_front INFINITY; its start creates
  // [effect_01] / [effect_02] convert_start / _02 for 4 s and [effect_03] convert_start_03 INFINITY)
  bloodBattle: {
    horn: cite('horn_t_1[muso]', () => ({ play: [
      { n: 'horn_buff_01_convert_start', on: 'op', life: 4 }, { n: 'horn_buff_01_convert_start_02', on: 'op', life: 4 },
      { n: 'horn_buff_01_convert_start_03', on: 'op', life: 'deployed' }, { n: 'horn_buff_01_start_front', on: 'op', life: 'deployed' },
    ] })),
  },
  // 号角 S2 / S3 过载 (horn_s_2 / horn_s_3[overload_switch_effect]: INFINITY derived buffs of the skill — _back when her
  // default direction is UP, else _front — CheckCharacterDefaultDirection: the key's rows by `back`)
  // 纯烬艾雅法拉 S2 云霭荫佑 (2026-10-22): the barrier is the buff agoat2_s_2[shield] for its `duration` (kits/ops agoat2 'shield'
  // { duration }); its effect agoat2_skill_02_range_01 lives with it — the instant skill's activation window (~1 s) ended it.
  // (2026-10-23) The effect is the `_effects` of the ability skchr_agoat2_2/Shield/Aura that holds the buff, and the buff's
  // ON_BUFF_TRIGGER interrupts that ability once its `value` is spent: its level follows what the barrier can still absorb,
  // and a spent barrier ends it early (fxgame.js buffProgress)
  shield: { agoat2: cite(['skchr_agoat2_2/Shield/Aura', 'agoat2_s_2[shield]'], (o) => ({ play: [{ tpl: 'skchr_agoat2_2/Shield/Aura', on: 'op', life: Math.max(0.1, Number(o.duration) || 12) }] })) },
  overload: {
    horn: cite(['horn_s_2[overload_switch_effect]', 'horn_s_3[overload_switch_effect]'], (o, c) => {
      const tpl = c.skill === 1 ? 'horn_s_2[overload_switch_effect]' : c.skill === 2 ? 'horn_s_3[overload_switch_effect]' : null;
      return tpl ? { play: [{ tpl, on: 'op', life: 'skill', when: { back: c.back } }] } : null;
    }),
    // 洛洛 S2 过载: her drones' S2Funnel `_overloadIdleEffect` rockr_token_overload_01 for the rest of the skill, and their
    // hits take the projectile's `_overloadGroups` (`skillFlag` 'overDrones': fxgame.js droneShot, cleared at the skill's end)
    rockr: cite('char_4040_rockr/Modes/S2/Body/Attack/S2Funnel', () => ({ play: [{ n: 'rockr_token_overload_01', on: 'op', life: 'skill' }], skillFlag: 'overDrones' })),
  },
  // 泥岩 T1 沃土予身: the last layer broken (mudrok_t_1[shield_c] BlockDamage → CreateEffect mudrok_buff_01_end) …
  shieldBreak: {
    mudrok: cite('mudrok_t_1[shield_c]', (o) => (Number(o.left) === 0 ? { play: [once('mudrok_buff_01_end')] } : { play: [] })),
  },
  // … and a layer gained (mudrok_t_1[init] at deploy / [recharge]: CreateEffect mudrok_buff_01_begin, then the layer's buff —
  // its loop is fxstatus.js LAYER_FX, from the same event's `n`). 卡涅利安's mark stacks: fxstatus.js STACK_FX only.
  // 佩佩 S3: each attack's pepe_s_3_fx on the main target picks its range effect by her pepe_s3_range[atk] stacks before the
  // attack adds one (the ability's _activeBuffsToMainTarget: [fx] before [range][active]): ≥ max_stack_cnt _03, ≥ 2 _02, else
  // _01 (the key's FilterByBuffStackCount rows, `max` the kit's max_stack_cnt) — at the target's feet (`tgt`), facing UP
  // (_constDirection)
  stacks: {
    mudrok: cite(['mudrok_t_1[init]', 'mudrok_t_1[recharge]'], () => ({ play: [once('mudrok_buff_01_begin')] })),
    pepe: cite('pepe_s_3_fx', (o) => ({ play: [{ tpl: 'pepe_s_3_fx', on: 'tgt',
      when: { stacks: { 'pepe_s3_range[atk]': Number(o.n) || 0 }, bb: { max_stack_cnt: Number(o.max) || 0 } } }] })),
  },
  // 赤刃明霄陈 T2: the dodge held again (chen3_t2[timer] at stack_time: CreateEffect chen3_buff_start_01, and the heal's
  // chen3_Shield_buff_02); its loop is the 'chen3:evade' status (fxstatus.js KEY_FX)
  evadeReady: { chen3: cite('chen3_t2[timer]', () => ({ play: [once('chen3_buff_start_01'), once('chen3_Shield_buff_02')] })) },
  // 焰尾 T1 前锋剑术 (2026-10-24, 묶음 S1): each dodge — flamtl_t_1 ON_EVADE_DAMAGE: CreateEffect flamtl_flash_01, and the buff
  // flamtl_t_1[evade] (flamtl_buff_01 INFINITY, not again while she holds it) until her next attack strikes twice (the sim's
  // 'riposte' — ends it). The dodge keeps its text (`pass`).
  dodge: {
    flamtl: cite(['flamtl_t_1', 'flamtl_t_1[evade]'], () => ({ pass: true, play: [once('flamtl_flash_01'), { tpl: 'flamtl_t_1[evade]', on: 'op', slot: 'flamtlEvade' }] })),
  },
  riposte: { flamtl: cite('flamtl_t_1[evade]', () => ({ play: [{ slot: 'flamtlEvade', off: true }] })) },
  // 信仰搅拌机 S1 铳骑主考官 (2026-10-24, 묶음 S1): the bullets reloaded into a 拉特兰 operator (its `src` him) — the buff
  // rmixer_sk1[ammo-recover] ON_BUFF_START: CreateEffect rmixer_skill_01_tip_01 on it
  reload: { rmixer: cite('rmixer_sk1[ammo-recover]', () => ({ play: [{ tpl: 'rmixer_sk1[ammo-recover]', on: 'id' }] })) },
  // 蕾缪安 S2 归乡邀约 (2026-10-24, 묶음 S2): the aim (her 'lock' while S2 runs: `src` her, `id` the target) — the buff
  // lemuen_s2_aim_attack on the target creates [effect]: its crosshair_02 there and CreateLineEffect lemuen_skill_02_trail_01 from
  // her (the prefab `_holdByOwner`), both until the aim ends — the snipe or a lost target ('lemuenAim' on 0). Hand names: the key's
  // line row is no `tpl` play. Her S3 locks are fxgame.js's ('lock' with S3).
  lock: {
    lemuen: cite('lemuen_s2_aim_attack[effect]', (o, c) => (c.skill === 1 ? { stop: ['lemuenAim'], play: [
      { n: 'lemuen_skill_02_crosshair_02', on: 'id', life: 'tag', tag: 'lemuenAim' },
      { n: 'lemuen_skill_02_trail_01', line: ['src', 'id'], tag: 'lemuenAim' },
    ] } : null)),
  },
  // 溯光星源 S3 并流连锁 (2026-10-24, 묶음 S4): her S3 mode's LinkEnemy (a LockTargetAbility) holds the locked enemies and one
  // `_lineEffect` halo2_skill_03_line_01 through them — 「被锁定的敌人会互相链接」; the sim's 'link' { ids } as the locks change,
  // until the skill ends [추정: the line runs through the locks in order — the ability keeps one effect whose LineRenderers
  // take their places]. Her S2 'link' (the pulled pair) keeps its stand-in.
  link: {
    halo2: cite('char_1047_halo2/Modes/S3/Body/GeneralAbilities/LinkEnemy', (o, c) => (c.skill === 2 ? { stop: ['halo2Link'], play: [
      { n: 'halo2_skill_03_line_01', line: ['ids'], tag: 'halo2Link', life: 'skill' },
    ] } : null)),
  },
  // 莎草 S2 临考发挥 (2026-10-24, 묶음 S2): the ally she locks as it starts ('buff' kind 'lock': `src` her, `id` the ally) —
  // papyrs_s_2[switch_mode]'s CreateBuffUseAbilitySelector puts papyrs_s_2[target] (papyrs_skill2_mark_01, ended with the skill) on it
  buff: { papyrs: cite('papyrs_s_2[target]', () => ({ play: [{ tpl: 'papyrs_s_2[target]', on: 'id', life: 'skill' }] })) },
  // 流明 T2 应急处理 (2026-10-24, 묶음 S2): the emergency heal ('emergency': `src` her, `id` the ally) — her lumen_t_2[listener]
  // ON_OTHER_RESISTABLE_BUFF_START creates lumen_buff_01_hit on her (its HP-ratio and cooldown conditions are the sim's). The
  // mark stays (`pass`). Her ready glow ([enable] after [cooldown]) is not drawn.
  emergency: { lumen: cite('lumen_t_2[listener]', () => ({ pass: true, play: [once('lumen_buff_01_hit')] })) },
  lemuenAim: { lemuen: cite('lemuen_s2_aim_attack[effect]', (o) => (Number(o.on) ? null : { stop: ['lemuenAim'], play: [] })) },
  // 伊内丝 T2 影哨: projectile_chr_ines_guard `_effectsWhenReached` label_start_01 + label_01 + range_01 where it lands;
  // they last while the sentry stands (a new one replaces it, S3's recall — her 'beam' — ends it)
  sentry: {
    ines: cite('projectile_chr_ines_guard', () => ({ stop: ['inesSentry'], play: [
      { n: 'ines_label_start_01', on: 'point', life: 'once' },
      { n: 'ines_label_01', on: 'point', life: 'tag', tag: 'inesSentry' },
      { n: 'ines_range_01', on: 'point', life: 'tag', tag: 'inesSentry' },
    ] })),
  },
  // 伊内丝 S3 独影归途 (2026-10-21): the sentry recalled — projectile_chr_ines_guard_back (10 tiles / s) from where it stood back
  // to her: `_mainEffect` label_trail_01, its line pullLabel_line_01 from her to it (`_useEndPointAsStartPos`), label_hit_01
  // on each enemy it strikes on its way (`_effectsWhenHit`, the kit's `hits`), getLabel_01 + getLabel_range_01 where it
  // reaches her (`_effectsWhenReached`, `_useTraceTargetWhenReach`). 2026-10-24 (묶음 S4): the standing sentry stops there —
  // projectile_chr_ines_guard's `_effectsWhenStop` pullLabel_01 where it stood
  beam: {
    ines: cite(['projectile_chr_ines_guard_back', 'projectile_chr_ines_guard'], () => ({ stop: ['inesSentry'], play: [
      { n: 'ines_skill_03_pullLabel_01', on: 'point', life: 'once' },
      { n: 'ines_skill_03_label_trail_01', fly: 10, from: 'point', rope: 'ines_skill_03_pullLabel_line_01', pass: { n: 'ines_skill_03_label_hit_01', on: 'hits' } },
      { n: 'ines_skill_03_getLabel_01', on: 'op', life: 'once', after: 'fly' },
      { n: 'ines_skill_03_getLabel_range_01', on: 'op', life: 'once', after: 'fly' },
    ] })),
  },
  // 琳琅诗怀雅 S3 (2026-10-21): the purse paid out as the skill ends — her common ability RandomGold (charpack Others/Direction/
  // CommonAbilities, `_triggerDelta` 0.07 s) shoots projectile_chr_swire2_s_3 (8 tiles / s, `_mainEffect` swire2_skill_03_trail,
  // `_effectsWhenHit` swire2_skill_03_hit_02) at each marked enemy a coin goes to (the kit's `targets`, in order)
  // (2026-10-21) The skill's end switches her to mode S3_End (swire2_skill_3 ON_BUFF_FINISH SwitchMode), whose Body/Trigger
  // ability (Skill_3_End) casts swire2_skill_03_start_03, _start_03_02 and swire2_skill_03_range (`_useFourDirectionalFace`)
  // from its ON_CAST_START — coins or not [추정: for the prefabs' own duration; the client ends them at its ON_CAST_END]
  coin: {
    swire2: cite(['projectile_chr_swire2_s_3', 'char_1033_swire2/Modes/S3_End/Body/Trigger'], (o) => (o.skill === 'swire2_3' ? { play: [
      { tpl: 'char_1033_swire2/Modes/S3_End/Body/Trigger', cast: true },
      ...(Array.isArray(o.targets) && o.targets.length ? [{ tpl: 'projectile_chr_swire2_s_3', fly: 8, to: 'targets', gap: 0.07 }] : []),
    ] } : null)),
  },
  // 圣聆初雪 S2 (2026-10-21): the frozen protection point (token_10058_sbell2_icetgt, pkgrps/btl_pfb_tokens_4.ab): its Effect
  // ability's INFINITY buff icetgt_a[effect] shows sbell2_tile_frozen (`overrideEffectKey`) while it stands, and the
  // template's ON_OWNER_FINISH CreateEffect plays sbell2_tile_defrost on it as it goes
  summon: {
    sbell2: cite('icetgt_a[effect]', (o) => (/icetgt/.test(String(o.token ?? ''))
      ? { play: [{ tpl: 'icetgt_a[effect]', on: 'id', life: 'unit' }] } : null)),
  },
  // 凯尔希·思衡托 S3 (2026-10-21, CN client): kalts2_s_3[withdraw]'s ON_BUFF_START CreateEffect kalts2_skill_03_teleport_02 on
  // each 待投放 operator (`picks`) as the transport starts …
  kalts2Takeoff: { kalts2: cite('kalts2_s_3[withdraw]', () => ({ play: [{ tpl: 'kalts2_s_3[withdraw]', on: 'picks' }] })) },
  // … and, S3 picked, the head mark kalts2_skill_03_indicator_head_01 on the operators it would pick while she is not
  // flying (skchr_kalts2_3/Indicator → kalts2_s_3[indicator_fx][fx]): `ids` marked now, `off` no longer
  kalts2Mark: {
    kalts2: cite('kalts2_s_3[indicator_fx]', (o) => ({ play: [
      ...(Array.isArray(o.off) ? o.off : []).map((id) => ({ slot: `mark${id}`, off: true })),
      ...(Array.isArray(o.ids) ? o.ids : []).map((id) => ({ tpl: 'kalts2_s_3[indicator_fx]', unit: id, slot: `mark${id}` })),
    ] })),
  },
  // 烛煌 T2 绝处重燃: downed (blaze2_t_2 → buff [reborn_state], effect blaze2_revive_buff — behind !CheckUnitCurrentMode(1),
  // the event's —, and its [vfx1] blaze2_revive_buff_03 — [추정: kept until she stands, the sim has no shield-break event]) …
  downed: {
    // (its 'down' stand-in is no skill stand-in: it stays — `pass`)
    blaze2: cite('blaze2_t_2', () => ({ stop: ['blazeDown'], pass: true, play: [{ tpl: 'blaze2_t_2', on: 'op', life: 'tag', tag: 'blazeDown', leave: true, when: ALL }] })),
  },
  // … and back up: blaze2[to_default_state]'s cast blaze2_revive_end_start
  revive: { blaze2: cite('char_1040_blaze2/Others/Direction/CommonAbilities/blaze2[to_default_state]', () => ({ stop: ['blazeDown'], play: [once('blaze2_revive_end_start')] })) },
  // 圣聆初雪 T2: the lethal hit escaped (sbell2_t2[heal] → CreateEffect sbell2_revive on her)
  blessing: { sbell2: cite('sbell2_t2[heal]', () => ({ play: [once('sbell2_revive')] })) },
  // 圣聆初雪 T1 无垠的雪景: each tile's snow (charpack Talents/1/SnowAccumulation, an AttachListenerToTileAbility: one effect
  // per tile, the `_effectSettings` entry whose castedTimeThreshold equals its layers — kept while the prefab stays the
  // same, replaced when it changes, ended at 0 layers and when she leaves: OnDetached → _ClearEffects). `cells` [[x, y,
  // layers]…] are the tiles that changed (sim kit chess_char_6_02-sbell2.js); svrash's 'snow' is its S2's.
  snow: {
    sbell2: cite('char_1046_sbell2/Others/Direction/Talents/1/SnowAccumulation', (o) => ({ play: (Array.isArray(o.cells) ? o.cells : []).map(([x, y, L]) => {
      const slot = `snow${x},${y}`, n = SNOW_GROUND[Math.min(Number(L) || 0, SNOW_GROUND.length - 1)];
      return n ? { n, on: 'point', at: [x, y], slot } : { slot, off: true };
    }) })),
  },
  // 阿罗玛 S2: a levitated enemy lands (aroma_s_2 → CreateEffect aroma_skill_02_hit_02 on it)
  splash: { aroma: cite('aroma_s_2', () => ({ play: [once('aroma_skill_02_hit_02', 'id')] })) },
  // 寒芒克洛丝 S2: warmed up (kroos2_s_2[warming_counter] at its stacks, in mode 2 → [warmed_effect_01–03] INFINITY until the
  // skill's [warmed_finish]; the event is that moment)
  quadShot: {
    kroos2: cite('kroos2_s_2[warming_counter]', () => ({ play: [{ tpl: 'kroos2_s_2[warming_counter]', on: 'op', life: 'skill', when: ALL }] })),
  },
  // 妮芙 T1: an enemy in 凋亡 burst (nymph_t_1[listener] → buff [ep_damage], effect nymph_talent_buff_01, until its burst ends: `t`)
  soul: { nymph: cite('nymph_t_1[listener]', (o) => ({ play: [{ tpl: 'nymph_t_1[listener]', on: 'id', life: Math.max(0.1, Number(o.t) || 0), when: ALL }] })) },
  // 隐德来希 S3: a summoned 心烛 (etlchi_s3[to_enemy] SummonEnemiesOnAttackRange: buff entlec_effect, effect
  // etlchi_skill_03_ghosting_01 on it, whose CreateLineEffect etlchi_skill_03_line_01 joins it to the enemy it copies, `of`
  // [추정: drawn from that enemy to the candle]) — both while it stands
  candle: {
    etlchi: cite(['etlchi_s3[to_enemy]', 'entlec_effect', 'entlec_a[line_effect_core]'], () => ({ play: [
      { n: 'etlchi_skill_03_ghosting_01', on: 'id', life: 'unit' },
      { n: 'etlchi_skill_03_line_01', line: ['of', 'id'] },
    ] })),
  },
  // 魔王 T1 微尘 (projectile_chr_cetsyr_talent*, orbiting her): one touching an operator — its `_effectsWhenHit` cetsyr_hit_01
  // on it; under S2 the motes hit enemies (projectile_chr_cetsyr_talent_s2: cetsyr_skill_02_hit_01; the bind's
  // cetsyr_skill_02_tie is the 'bind' status' — fxstatus.js SOURCE_FX). S1's start (her own `id`) is S1's buff.
  mote: { cetsyr: cite(['projectile_chr_cetsyr_talent', 'projectile_chr_cetsyr_talent_s2'], (o, c) => (o.id === o.src ? { play: [] } : { play: [once(c.foe ? 'cetsyr_skill_02_hit_01' : 'cetsyr_hit_01', 'id')] })) },
  // 魔王 T1 微尘 always on: her motes are projectiles circling her (projectile_chr_cetsyr_talent `_mainEffect` cetsyr_trail_01;
  // S1 the same; S2 _talent_s2 cetsyr_skill_02_trail_01; S3 _talent_s3 cetsyr_skill_03_trail_01), one effect each while it is
  // there; one coming back plays `_coolDownReadyEffectOnProjectilePos` cetsyr_trail_start (S2 cetsyr_skill_02_trail_start)
  // where it is. `n` of `cap` and the orbit (`r` tiles, `spd` °/s: the blackboards' range_radius / dynamic_spd, S2's
  // outside_radius / dynamic_spd — the prefabs' `_projectileAroundRadius` 1 / `_aroundSpeed` 150 (S2 0.01) without them)
  // from the sim [추정: the blackboard values replace the prefab's; evenly spread, the sense of the turn; which mote goes
  // when one is used]
  motes: {
    cetsyr: cite(['projectile_chr_cetsyr_talent', 'projectile_chr_cetsyr_talent_s2', 'projectile_chr_cetsyr_talent_s3'], (o) => {
      const cap = Math.max(0, Math.min(12, Number(o.cap) || 0)), k = Number(o.n) || 0, sk = Number(o.sk) || 0;
      const r = Number(o.r) > 0 ? Number(o.r) : 1, spd = o.spd != null && Number.isFinite(Number(o.spd)) ? Number(o.spd) : sk === 2 ? 0.01 : 150;
      const trail = sk === 2 ? 'cetsyr_skill_02_trail_01' : sk === 3 ? 'cetsyr_skill_03_trail_01' : 'cetsyr_trail_01';
      const ready = sk === 2 ? 'cetsyr_skill_02_trail_start' : sk === 3 ? null : 'cetsyr_trail_start';
      const play = [];
      for (let i = 0; i < 12; i++) {
        play.push(i < k && i < cap
          ? { n: trail, on: 'op', slot: `mote${i}`, ready, orbit: { r, spd, phase: (360 * i) / cap } }
          : { slot: `mote${i}`, off: true });
      }
      return { play };
    }),
  },
  // 魔王 S3: each HP share (cetsyr_s_3[collect_hp_ratio]'s tick: CreateEffect cetsyr_skill_03_burst_01 on her)
  redistribute: { cetsyr: cite('cetsyr_s_3[collect_hp_ratio]', () => ({ play: [once('cetsyr_skill_03_burst_01')] })) },
  // 卡涅利安: while skill N runs, billro_s_N[eff_cond] (every 0.1 s) keeps derived INFINITY buffs on her — cast with every
  // charge stored (billro_talent_enhance_mark) its [full] + [half] (S3 also [full2] + [half2]), else its [half] (S3 [half] +
  // [half2]); its off-skill branch is 'charges' below. fxgame.js KIT_OWNED keeps the name rules from playing these at the
  // skill's start. S2's own events keep their stand-ins (`pass`).
  // (2026-10-21, maintainer decision 2026-10-21) a charged S1 switches to S1_Enhance (billro_s_1 ON_BUFF_START: SwitchMode 2
  // with billro_talent_enhance_mark, else 1), whose `_generalAbilities` keep the trait's Trait_Eff buff billro_trait_eff →
  // billro_beidong_buff_03 (modes.json attach[2]): her Default mode's look stays through that skill (fxgame.js
  // defaultModeFx ends it at the start, this plays it again until the end)
  shell: {
    billro: cite(['billro_s_1[eff_cond]', 'billro_trait_eff'], (o) => {
      const p = billro(0, o.charged);
      if (Number(o.charged)) p.play.push({ n: 'billro_beidong_buff_03', on: 'op', life: 'skill' });
      return p;
    }),
  },
  // … and outside the skill (`n` the charges stored, -1 while it runs: the branch above): 2 → [full] _buff_02 + [half]
  // _buff_01_02 (S3 _buff_01_02 + _buff_01_01_02), 1 → [half] _buff_01 (S3 _buff_01_01), 0 → none — held until the count
  // changes (FinishDerivedBuff, then the new ones)
  charges: {
    billro: cite(['billro_s_1[eff_cond]', 'billro_s_2[eff_cond]', 'billro_s_3[eff_cond]'], (o, c) => {
      const k = Number(o.n) || 0, s = `0${c.skill + 1}`;
      const [full, half, one] = c.skill === 2
        ? ['billro_skill_03_buff_01_02', 'billro_skill_03_buff_01_01_02', 'billro_skill_03_buff_01_01']
        : [`billro_skill_${s}_buff_02`, `billro_skill_${s}_buff_01_02`, `billro_skill_${s}_buff_01`];
      const a = k >= 2 ? full : k === 1 ? one : null, b = k >= 2 ? half : null;
      return { play: [a ? { n: a, on: 'op', slot: 'chargeA' } : { slot: 'chargeA', off: true }, b ? { n: b, on: 'op', slot: 'chargeB' } : { slot: 'chargeB', off: true }] };
    }),
    // 灵知 / 流明 S2: [eff_cond] (every 0.1 s) keeps one derived INFINITY buff by the charges stored — 1 → [effect1] / [effect_1],
    // 2 → the other one finished and [effect2] / [effect_2] (each one prefab: `all`, the sim counts the charges); every cast
    // finishes both (_enhance_judge), 灵知's also creating gnosis_skill_02_range_02 cast with every charge stored, else
    // gnosis_skill_02_range_01. fxgame.js KIT_OWNED keeps the name rules from looping these through the skill.
    gnosis: cite(['gnosis_s_2[eff_cond]', 'gnosis_s_2[effect1]', 'gnosis_s_2[effect2]', 'gnosis_s_2_enhance_judge'], (o) => chargeStage(o, 'gnosis_s_2[effect1]', 'gnosis_s_2[effect2]',
      Number(o.n) < 0 ? [once(Number(o.charged) ? 'gnosis_skill_02_range_02' : 'gnosis_skill_02_range_01')] : [])),
    lumen: cite(['lumen_s_2[eff_cond]', 'lumen_s_2[effect_1]', 'lumen_s_2[effect_2]', 'lumen_s_2_enhance_judge'], (o) => chargeStage(o, 'lumen_s_2[effect_1]', 'lumen_s_2[effect_2]', [])),
  },
  sandChains: { billro: cite('billro_s_2[eff_cond]', () => ({ ...billro(1, false), pass: true })) },
  sandChainsCharged: { billro: cite('billro_s_2[eff_cond]', () => ({ ...billro(1, true), pass: true })) },
  devour: { billro: cite('billro_s_3[eff_cond]', (o) => ({ ...billro(2, o.charged), pass: true })) },
  // 缇缇 S3: a sleeper wakes (titi_s_3[dmg_ticker]: CreateEffect titi_skill_03_hit_02 on it) and puts the enemies around it to
  // sleep (`to`), each joined to it by titi_s_3[effect_line]'s CreateLineEffect titi_skill_03_line_01
  wake: { titi: cite(['titi_s_3[dmg_ticker]', 'titi_s_3[effect_line]'], () => ({ play: [once('titi_skill_03_hit_02', 'id'), { n: 'titi_skill_03_line_01', line: ['id', 'to'], life: 'once' }] })) },
  // 泥岩 S3: skchr_mudrok_3/SleepAura casts mudrok_skill_03_sleep from its start to its end (`_castEffects` _startEvent 2 →
  // _endEvent 6) and its Aura's `_effects` mudrok_skill_03_range lasts as long; at its end — the wake, 'rockfall' — the
  // oneshot mudrok_skill_03_awake / _02, and the Awake ability's buff mudrok_s_3 carries mudrok_skill_03_buff for the rest
  // of the skill (fxgame.js KIT_OWNED keeps the activation from playing them all at the start). 'stone' keeps its stand-in.
  stone: {
    mudrok: cite('skchr_mudrok_3/SleepAura', () => ({ stop: ['mudSleep'], pass: true, play: ['mudrok_skill_03_sleep', 'mudrok_skill_03_range']
      .map((n) => ({ n, on: 'op', life: 'tag', tag: 'mudSleep', leave: true })) })),
  },
  rockfall: {
    mudrok: cite(['skchr_mudrok_3/SleepAura', 'mudrok_s_3'], () => ({ stop: ['mudSleep'], play: [
      once('mudrok_skill_03_awake'), once('mudrok_skill_03_awake_02'), { n: 'mudrok_skill_03_buff', on: 'op', life: 'skill' },
    ] })),
  },
  // 新约能天使: S3's strike on her coordinate (`signal` fireToToken: S3FireToToken fires projectile_chr_angel2_s3_start —
  // `_mainEffect` angel2_skill_3_begin_trail_01 at `_speed` 10, its `_effectsWhenReached` angel2_skill_3_begin_range_01 where
  // it lands; its cast angel2_skill_3_begin_start_001 — an empty prefab — on her: char_modes.py keeps that ability's casts out
  // of the S3 mode's attack bindings, which played it with every attack, 2026-10-21); her talent's bomb
  // (CommonAbilities/TalentBomb: projectile_chr_angel2_t1 without a trail, `_hitEffects` angel2_buff_01_trail_01 on the
  // enemy it marks, `tgt`). angel2_skill_3_ground_01: no client reference.
  airstrike: {
    angel2: cite(['char_1041_angel2/Modes/S3/Body/Attack/S3FireToToken', 'projectile_chr_angel2_s3_start', 'char_1041_angel2/Others/Direction/CommonAbilities/TalentBomb'], (o) => (o.signal === 'fireToToken'
      ? { play: [{ tpl: 'char_1041_angel2/Modes/S3/Body/Attack/S3FireToToken', on: 'op', life: 'once' }, { tpl: 'projectile_chr_angel2_s3_start', fly: 10 }] }
      : { play: [once('angel2_buff_01_trail_01', 'tgt')] })),
  },
  // 缪尔赛思: her 流形 copies an operator (mlyss_wtrman_switch_melee_trigger / _range_trigger: CreateEffect
  // token_10030_mlyss_wtrman_c1_to_c2 / _c1_to_c3 on the token, `id`) — the token's own bundle
  copy: {
    mlyss: cite(['mlyss_wtrman_switch_melee_trigger', 'mlyss_wtrman_switch_range_trigger'], (o) => ({ play: [{ tpl: o.mode === 'Range' ? 'mlyss_wtrman_switch_range_trigger' : 'mlyss_wtrman_switch_melee_trigger', bundle: 'mlyss_token', on: 'id' }] })),
  },
  // 焰影苇草 S2: each carrier's fireball (projectile_chr_reed2_fire: `_mainEffect` reed2_skill_02_fireball_01 circling it at
  // `_projectileAroundRadius` 1, `_aroundSpeed` 150 °/s) until her skill ends [추정: the sense of the turn; its cooldown look
  // _02 and the effects of each strike are not drawn]
  ember: { reed2: cite('projectile_chr_reed2_fire', () => ({ play: [{ n: 'reed2_skill_02_fireball_01', on: 'id', life: 'skill', orbit: { r: 1, spd: 150 } }] })) },
  // 隐德来希 T2 重盈: the talent's toggle (charpack Talents/2 `_unmanagedBuffsWhenToggleOn` etlchi_t_2[heal], lifeTime 3 s)
  reborn: { etlchi: cite('etlchi_t_2[heal]', () => ({ play: [{ tpl: 'etlchi_t_2[heal]', on: 'op', life: 3 }] })) },
  // 流明 S1: the shot's heal rain (lumen_s_1[effect] on the target, LIMITED: projectile_life_time `t`; projectile_chr_lumen_s1's
  // `_mainEffect` is the same prefab) [추정: lumen_s_1[heal]'s lumen_skill_01_hit on each healed ally per tick is not drawn]
  healField: { lumen: cite('lumen_s_1[effect]', (o) => ({ play: [{ tpl: 'lumen_s_1[effect]', on: 'tgt', life: Math.max(0.1, Number(o.t) || 0) }] })) },
  // 寒檀 S2: an icicle (projectile_chr_sntlla_s2 `_effectsWhenReached` sntlla_skill_02_start_01 where it lands)
  iceSpike: { sntlla: cite('projectile_chr_sntlla_s2', () => ({ play: [{ tpl: 'projectile_chr_sntlla_s2', on: 'point' }] })) },
  talent: {
    // 蕾缪安 T2: 引渡 ready (lemuen_t_2 → buff lemuen_t_2[buff], effect lemuen_talent_buff_02, INFINITY)
    lemuen: cite('lemuen_t_2[buff]', (o) => (o.name === 'extradition' ? { play: [{ tpl: 'lemuen_t_2[buff]', on: 'op', life: 'deployed' }] } : null)),
    // 卡涅利安 T1 生命之餐 (her only 'talent'): the heal at each skill start — charpack Talents/1's abilities Billro_Heal_Self /
    // _Enhance, each with a oneshot `_castEffects` at ON_SPELL_ON: billro_beidong_buff_01, cast with every charge _02 (the
    // pairing by `m_GameObject`: each cast component shares its GameObject with one of the two abilities)
    billro: cite('char_426_billro/Talents/1', (o) => ({ play: [once(Number(o.charged) ? 'billro_beidong_buff_02' : 'billro_beidong_buff_01')] })),
    // 风笛 T1 精密填弹 (her only 'talent'): bpipe_t_1's SplashDamage `_createEffect` with its blackboard `effect`
    // bpipe_attack_02_hit on the extra enemy the boosted attack hits (`id`)
    bpipe: cite('bpipe_t_1', () => ({ play: [once('bpipe_attack_02_hit', 'id')] })),
  },
  // 灵知 T2 殊途同归 (his only 'kitHit', 10 s after the deploy): charpack Talents/2's wrapper ability gnosis_t_2_buff casts
  // gnosis_beidong_buff from ON_CAST_START to ON_CAST_END, and the wrapper is `_isInfinity` (ActiveAbilityWrapper._GetLifeTime
  // returns no end): its cast never ends, so the effect, a burst with a looping glow, stays while he is deployed
  kitHit: { gnosis: cite('char_206_gnosis/Others/Direction/Talents/2', () => ({ play: [{ n: 'gnosis_beidong_buff', on: 'op', life: 'deployed' }] })) },
  // 烛煌 S2: the burning tiles (charpack Modes/S2/Body/Talents/3 DoTile, an AttachListenerToTileAbility: `_effectSettings`
  // blaze2_skill_02_hit_plot from the first cast on a tile, castedTimeThreshold 1, ended with the ability at the skill's end
  // — OnDetached → _ClearEffects). `cells` [[x, y, 1 on / 0 off]…] (sim kit chess_char_5_03-blaze2.js)
  burnTiles: {
    blaze2: cite('char_1040_blaze2/Modes/S2/Body/Talents/3', (o) => ({ play: (Array.isArray(o.cells) ? o.cells : []).map(([x, y, on]) => {
      const slot = `burn${x},${y}`;
      return Number(on) > 0 ? { n: 'blaze2_skill_02_hit_plot', on: 'point', at: [x, y], slot } : { slot, off: true };
    }) })),
  },
  // 歌蕾蒂娅 S3 (2026-10-21): her opening ability skchr_glady_3/Chant's `_activeBuffs` glady_s3[effect] (INFINITY, overrideEffectKey
  // glady_skill_03_buff — its OnPlayEmitter adds _02) on the target it binds, the kit's `tgt` [추정: until the skill ends — the
  // ability's active buffs]; the tornado itself is fxgame.js zoneFx's. Its 束缚 glady_skill_03_buff_to_enemy is the status layer's
  tornado: { glady: cite('glady_s3[effect]', () => ({ play: [{ tpl: 'glady_s3[effect]', on: 'tgt', life: 'skill' }] })) },
  // 歌蕾蒂娅 S3: each pull of the tornado (projectile_chr_glady_s3_2 `_interval`: `_castEffect` glady_skill_03_range_03)
  tornadoPulse: { glady: cite('projectile_chr_glady_s3_2', () => ({ play: [{ n: 'glady_skill_03_range_03', on: 'point', life: 'once' }] })) },
  // 歌蕾蒂娅 S3's end, the 捕网 (2026-10-21): projectile_chr_glady_s3_3 hooked to her muzzle (`_hookedStartPointType` 2) —
  // `_harpoonEffect` glady_skill_03_line out to the tornado's point in `_firstPartTime` 0.3 s and pulled back in
  // `_secondPartTime` 1 s; `_effectsWhenReached` glady_skill_03_range_05 where it lands, `_movingEffectsWhenReached`
  // glady_skill_03_range_04 on the head coming back [추정: the moving effect rides the head]
  pull: {
    glady: cite('projectile_chr_glady_s3_3', () => ({ play: [
      { n: 'glady_skill_03_line', harpoon: { out: 0.3, back: 1, moving: 'glady_skill_03_range_04' } },
      { n: 'glady_skill_03_range_05', on: 'point', life: 'once', after: 'fly' },
    ] })),
  },
};

/** 圣聆初雪's tile effect by snow layers (SnowAccumulation `_effectSettings`: thresholds 1 → _01, 2 / 3 / 4 → _02, 5 → _03). */
const SNOW_GROUND = [null, 'sbell2_ground_01', 'sbell2_ground_02', 'sbell2_ground_02', 'sbell2_ground_02', 'sbell2_ground_03'];

/** 卡涅利安's eff_cond buffs of skill index `i` while it runs (KIT_OFFICIAL shell / sandChains / devour). */
function billro(i, charged) {
  const set = [
    { full: ['billro_skill_01_buff_02', 'billro_skill_01_buff_01_02'], half: ['billro_skill_01_buff_01_02'] },
    { full: ['billro_skill_02_buff_02', 'billro_skill_02_buff_01_02'], half: ['billro_skill_02_buff_01_02'] },
    { full: ['billro_skill_03_buff_01_02', 'billro_skill_03_buff_01_01_02', 'billro_skill_03_buff_02_02', 'billro_skill_03_buff_02_01'],
      half: ['billro_skill_03_buff_02_01', 'billro_skill_03_buff_01_01_02'] },
  ][i];
  return { play: set[charged ? 'full' : 'half'].map((n) => ({ n, on: 'op', life: 'skill' })) };
}

/** 灵知 / 流明 S2's charge stage: `n` 1 → key `one`, 2 → `two` (held in one slot until the count changes), else none; `more` too. */
function chargeStage(o, one, two, more) {
  const k = Number(o.n) || 0, key = k >= 2 ? two : k === 1 ? one : null;
  return { play: [key ? { tpl: key, on: 'op', slot: 'charge', when: ALL } : { slot: 'charge', off: true }, ...more] };
}

// events whose `src` is no operator of the moment: 缪尔赛思's 'copy' (`src` the operator her 流形 copies, `by` her)
const OPERATOR_FIELD = { copy: 'by' };
/** The operator id of kit event `name` (fxgame.js standInOff's too): `src`, else `by`, else `id`. */
export const kitOperator = (o, name) => (o ? (OPERATOR_FIELD[name] ? o[OPERATOR_FIELD[name]] : null) ?? o.src ?? o.by ?? o.id : null);

/**
 * The plan for kit event `name` with fields `o` when its operator's bundle is `bundle`, or null (no rule).
 * @param {string} name
 * @param {any} o
 * @param {string | null} bundle
 * @param {{ skill?: number, back?: boolean, foe?: boolean }} [ctx]
 */
export function kitOfficialPlan(name, o, bundle, ctx = {}) {
  const rule = bundle ? KIT_OFFICIAL[name]?.[bundle] : null;
  if (typeof rule !== 'function' || !o || typeof o !== 'object') return null;
  const r = rule(o, { skill: Number.isInteger(ctx.skill) ? ctx.skill : 0, back: !!ctx.back, foe: !!ctx.foe });
  const play = (r?.play || []).flatMap((p) => (p.tpl ? tplPlays(p, ctx.plays) : [p]));
  return r ? { stop: r.stop || [], play, pass: !!r.pass, ...(r.skillFlag ? { skillFlag: r.skillFlag } : {}) } : null;
}

/**
 * A `tpl` play as the plays of its key in `plays` (the loaded public/assets/local/fx/plays.json; tools/build-fx-plays.mjs)
 * — none when the file or the key is missing (the event then keeps its stand-in).
 */
export function tplPlays(p, plays) {
  const k = plays?.keys?.[p.tpl];
  if (!k) return [];
  const { tpl, when, ...rest } = p;
  const reach = (on, after) => (k.reach || []).map((n) => ({ n, on, life: 'once', ...after }));
  if (rest.fly != null) {
    if (k.trail?.length !== 1) return [];
    return [{ ...rest, n: k.trail[0], ...(rest.to && k.hit?.length ? { hit: [...k.hit] } : {}) }, ...reach('point', { after: 'fly' })];
  }
  const on = whenPlays(k, when);
  const of = (role) => [...new Set([...(k[role] || []), ...on.filter((r) => r.role === role).map((r) => r.n)])];
  const life = rest.life ?? k.lim;
  const endOf = of('end');
  const end = life === 'unit' && endOf.length ? { end: endOf[0] } : {};
  return [...of('held').map((n) => ({ ...rest, n, ...(life != null ? { life } : {}), ...end })), ...of('once').map((n) => ({ ...rest, n, life: 'once' })),
    ...reach(rest.on ?? 'op', {})];
}

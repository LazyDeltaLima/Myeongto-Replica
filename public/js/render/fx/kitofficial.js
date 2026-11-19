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
 * a play with `after: 'fly'` starts when it lands; with `tag`, a later plan's `stop` ends it in the air. A 'point' play may
 * name its own ground point `at: [x, y]`.
 * 2026-11-10: a flight with `start` / `land` [x, y] leaves from / lands on a ground point of its own, `delay` s after the event
 * (a projectile's `_delayToStart`); a rule reads `left` (the event's unit faces left: the client's CheckFaceLOrR).
 * 2026-10-21: a flight with `to` (the event's field naming units) is a projectile at each unit from the operator's muzzle,
 * `gap` s apart, followed, playing `hit` [names] on it as it lands; one with `from: 'point'` flies from the event's point
 * back to the operator; either may carry `rope` (a line from the operator to the flying head) and `pass` { n, on } (`n` on
 * each unit of field `on` as the head passes it). A `harpoon` { out, back, moving? } play is a line from the operator to
 * a head going out to the event's point in `out` s and back in `back` s (`moving` on the head from its arrival).
 * A `slot` play holds one effect per operator and slot until the operator leaves: a later play of the same prefab in that
 * slot keeps it running, another prefab replaces it, `{ slot, off: true }` ends it (AttachListenerToTileAbility
 * `_HoldCastedEffectOnTile` with `_dontCreateNewEffectWhenCastedTimesSame`); on a 'point' (or `at`) or on / circling a
 * unit as any play, with `ready` a prefab played there once when the slot was empty.
 * 2026-11-10: `{ slot, off: true, now: true }` ends it at once (no fade). An `edge` play (the event's field naming tiles
 * [[x, y]…]) is its prefab's LineRenderers along each loop of those tiles' outline, one effect per loop, kept in its `slot`
 * and moved to the new outline by a later play (the official RangeLineEffectHandler), until the operator leaves — with
 * `life: 'skill'` (2026-11-16) also as the operator's skill ends.
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
const CRAB_SPEED = 10;   // kits/ops/op-ironmn.js CRAB_SPEED: the sim's shot lands then
const CRAB_START = Object.freeze({ UP: 'token_ironmn_pile3_skill_03_start_up', DOWN: 'token_ironmn_pile3_skill_03_start_down' });
/** 余's 灼燃损伤 moments (the sim's 'dmg' 9th field). */
const YU_HIT = Object.freeze(['yu_s_1[inverse_damage]', 'yu_t_1[enemy]', 'yu_s_3[ally]']);
/** The event stands for every condition of the key's rows. */
const ALL = Object.freeze({ all: true });
// 维伊's ChargeAttack abilities' `_mountPointForProjectiles`: SPECIAL_0 / 1 / 2 / 3 / 4
const VEEN_MOUNTS = Object.freeze([5, 6, 8, 9, 10]);
// 黑键's Default / S1 ExChargeAttack `_mountPointForProjectiles`: SPECIAL_0 / 1 / 2 / 3 (2026-11-16)
const EBNHLZ_MOUNTS = Object.freeze([5, 6, 8, 9]);
/** 缪尔赛思's 流形: the form of each of its modes in its effects' names (c0 is Recharge's puddle). */
const MANIFOLD_FORM = Object.freeze({ Default: 'c1', Melee: 'c2', Range: 'c3' });
/** Its Recharge mode's switch casts (mlyss_wtrman_switch / _melee / _range): `_preDelay` 1 s (kits chess_char_6_11-mlyss.js MANIFOLD_REBORN). */
const MANIFOLD_SWITCH = 1;
/** Its mlyss_wtrman_born_trigger's `triggerInterval` (BornTrigger, the token prefab): a split copy's switch then. */
const MANIFOLD_BORN_TRIGGER = 0.2;

/**
 * `<bundle>|<event>`: a kit event whose kind fxgame.js STAND_IN keeps (a mark every operator shows: a lift ring, a crit flash,
 * a blink, a counter) and whose moment the client draws with prefabs of its own elsewhere (a buff's effect, the cast's):
 * the generic mark would draw on top of them (test/render/pick-event-list.js says what draws each).
 */
export const KIT_NO_STAND_IN = Object.freeze(new Set(['aglna2|takeoff', 'bgsnow|crit', 'chen3|teleport', 'haruka|heal', 'haruka|levitate', 'irene|slash', 'judge|crit',
  'kalts2|takeoff', 'lmlee|mark', 'mcnist|shield', 'oblvns|spGain', 'thorns|thorns']));

// (2026-11-16, official client) 予愿安洁莉娜's S3 edge line: skchr_aglna2_3/Toggle/BlockToggle's RangeLineEffectEmitter
// (`_edgeLineRendererEffectKey` aglna2_skill_03_range_line_01, `_heightOffset` 0.4, `_lineOffsetToMapCenter` as 테리토리야's)
// shows on the ability's ON_ATTACHED and hides on its ON_DETACHED — the Toggle wrapper (ActiveAbilityWrapper `_isInfinity`)
// attaches it as the skill starts and detaches it as it ends; the block toggle switches only its buffs. The sim sends her
// range tiles `cells` on S3's 'takeoff' and on each landing while S3 runs ('aglnaFlight' off; kits op-aglna2.js edgeCells)
// (her S1 / S2 takeoffs and S3's own carry no prefab at that moment, so no lift ring either: KIT_NO_STAND_IN 'aglna2|takeoff')
const AGLNA2_EDGE = cite('skchr_aglna2_3/Toggle/BlockToggle', (o) => (Array.isArray(o.cells)
  ? { play: [{ n: 'aglna2_skill_03_range_line_01', edge: 'cells', slot: 'aglna2Edge', life: 'skill' }] } : null));

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
  shield: {
    agoat2: cite(['skchr_agoat2_2/Shield/Aura', 'agoat2_s_2[shield]'], (o) => ({ play: [{ tpl: 'skchr_agoat2_2/Shield/Aura', on: 'op', life: Math.max(0.1, Number(o.duration) || 12) }] })),
    // 老鲤 T2 有备无患: the guard bought (lmlee_t_2[bounce], INFINITY), held on him until it stops a stun or a freeze ('counter')
    lmlee: cite('lmlee_t_2[bounce]', (o) => (o.kind === 'lmlee' ? { play: [{ n: 'lmlee_buff_02_start', on: 'op', slot: 'lmleeGuard' }] } : null)),
  },
  // … and its stun on the one who tried (lmlee_t_2[stuneff], LIMITED by the stun; `tgt`: none when no enemy did)
  counter: {
    lmlee: cite(['lmlee_t_2[bounce]', 'lmlee_t_2[stuneff]'], (o) => ({ play: [{ slot: 'lmleeGuard', off: true }, ...(o.tgt != null ? [{ n: 'lmlee_buff_02_hit', on: 'tgt', life: Number(o.t) }] : [])] })),
  },
  overload: {
    horn: cite(['horn_s_2[overload_switch_effect]', 'horn_s_3[overload_switch_effect]'], (o, c) => {
      const tpl = c.skill === 1 ? 'horn_s_2[overload_switch_effect]' : c.skill === 2 ? 'horn_s_3[overload_switch_effect]' : null;
      // (2026-11-16) S2: her shots from now to the skill's end are overloaded — each one's 'shellReach' plan below (skillFlag
      // 'shellReach': fxgame.js marks the shot at its 'atk' and plays the plan as it reaches its target)
      return tpl ? { play: [{ tpl, on: 'op', life: 'skill', when: { back: c.back } }], ...(c.skill === 1 ? { skillFlag: 'shellReach' } : {}) } : null;
    }),
    // 洛洛 S2 过载: her drones' S2Funnel `_overloadIdleEffect` rockr_token_overload_01 for the rest of the skill, and their
    // hits take the projectile's `_overloadGroups` (`skillFlag` 'overDrones': fxgame.js droneShot, cleared at the skill's end)
    rockr: cite('char_4040_rockr/Modes/S2/Body/Attack/S2Funnel', () => ({ play: [{ n: 'rockr_token_overload_01', on: 'op', life: 'skill' }], skillFlag: 'overDrones' })),
  },
  // (2026-11-16) 号角 S2 过载: an overloaded shot reaching its target (fxgame.js shellReachFx: `src` her, `id` the shot's
  // target) — her S2 attack abilities' `_conditionalActions` (OverloadValidator: she holds horn_s_2[overload_mark] when the
  // shell is made) create horn_skill_02_hit_02_02 on the projectile's trace target at ON_REACHED_TARGET: once per shell, on the
  // enemy it was fired at, not on every enemy its splash hits (the arts splash is the ON_HIT_OBJECT action)
  shellReach: {
    horn: cite(['char_4039_horn/Modes/S2/Body/Attack/RangedAttack', 'char_4039_horn/Modes/S2/Body/Attack/BlockedRangedAttack',
      'char_4039_horn/Modes/S2/Body/Attack/SelfRangedAttack'], (o, c) => (c.skill === 1 ? { play: [once('horn_skill_02_hit_02_02', 'id')] } : null)),
  },
  // 泥岩 T1 沃土予身: the last layer broken (mudrok_t_1[shield_c] BlockDamage → CreateEffect mudrok_buff_01_end) …
  shieldBreak: {
    mudrok: cite('mudrok_t_1[shield_c]', (o) => (Number(o.left) === 0 ? { play: [once('mudrok_buff_01_end')] } : { play: [] })),
    // (2026-11-10) 메커니스트 (규정 기물) S2: mcnist_s_2_shield ON_TAKE_DAMAGE as the 屏障 breaks — _end on its holder while S2 runs
    // (CheckContainsBuff mcnist_s_2), else _end_02 (`on`)
    mcnist: cite('mcnist_s_2_shield', (o) => ({ play: [once(Number(o.on) ? 'mcnist_skill_02_buff_01_end' : 'mcnist_skill_02_buff_01_end_02', 'id')] })),
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
    // (2026-11-01) 塔露拉 T1 奥术 (the sim's count `n` of oxi_t_1_arcane_stack, `max` its max_stack_cnt): the stacked buff's one
    // effect oxi_buff_02 while she has a stack, and oxi_t_1_arcane_full_fx's oxi_buff_03 from the stack that fills it
    // (oxi_t_1_arcane_manager's GE row) until her next attack takes one off (oxi_t_1_attack_completed FinishBuffsById)
    oxi: cite(['oxi_t_1_arcane_stack', 'oxi_t_1_arcane_full_fx'], (o) => {
      const n = Number(o.n) || 0, max = Number(o.max) || 0;
      return { play: [n > 0 ? { n: 'oxi_buff_02', on: 'op', slot: 'oxiArcane' } : { slot: 'oxiArcane', off: true },
        max > 0 && n >= max ? { n: 'oxi_buff_03', on: 'op', slot: 'oxiArcaneFull' } : { slot: 'oxiArcaneFull', off: true }] };
    }),
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
  // 涤火杰西卡's shield taking the field beside her (2026-11-06; 'buff' kind 'turn': `id` her, `shield` it): jesca2_jckshd_dir_set
  // runs on her with the shield as its source, and its CreateBuff jesca2_jckshd_dir_set[effect] has `_buffOwner` BUFF_SOURCE, so
  // token_jesca2_jckshd_turnaround_01 plays on the shield
  buff: {
    papyrs: cite('papyrs_s_2[target]', () => ({ play: [{ tpl: 'papyrs_s_2[target]', on: 'id', life: 'skill' }] })),
    jesca2: cite('jesca2_jckshd_dir_set[effect]', (o) => (o.kind === 'turn' && o.shield != null ? { play: [{ n: 'token_jesca2_jckshd_turnaround_01', bundle: 'jesca2_token', on: 'shield', life: 1 }] } : null)),
  },
  // 流明 T2 应急处理 (2026-10-24, 묶음 S2): the emergency heal ('emergency': `src` her, `id` the ally) — lumen_t_2[listener]
  // ON_OTHER_RESISTABLE_BUFF_START creates lumen_buff_01_hit on its BUFF_OWNER, the ally it heals (묶음 S3: S2 had it on her;
  // its HP-ratio and cooldown conditions are the sim's). The mark stays (`pass`). Her ready glow ([enable] after [cooldown])
  // is not drawn.
  emergency: { lumen: cite('lumen_t_2[listener]', () => ({ pass: true, play: [once('lumen_buff_01_hit', 'id')] })) },
  // (2026-10-24, 묶음 S3) the official effect moments of a hit / heal: the sim's 'dmg' 9th / 'heal' 5th field (damage.js
  // fxField) — `k` the moment's key, `src` its owner (the operator), `id` the unit hit / healed, `by` the attacker / healer,
  // `life` the sim's seconds. Each rule answers only its own keys.
  hit: {
    // (2026-11-12) 结城理's personas (kits/ops/op-makoto.js moments): S2 塔纳托斯's damage makoto_s2_fear_damage (ON_BUFF_START
    // AdvancedApplyDamage, CreateEffect makoto_skill_02_hit_01 on the enemy), its execute makoto_s2_fear_aura_inst_kill
    // (_hit_01_finish); S3 塔纳托斯's makoto_s3_1_attack_weak_effect (makoto_skill_03_p1_weak_01) with makoto_s3_1_standin's
    // ON_CALCULATE_DAMAGE CheckDamageType — PHYSICAL makoto_skill_03_p1_hit_02, MAGICAL _hit_01 (the moment names the type)
    makoto: cite(['makoto_s2_fear_damage', 'makoto_s2_fear_aura_inst_kill', 'makoto_s3_1_attack_weak_effect', 'makoto_s3_1_standin'], (o) => (
      o.k === 'makoto_s2_fear_damage' ? { play: [once('makoto_skill_02_hit_01', 'id')] }
        : o.k === 'makoto_s2_fear_aura_inst_kill' ? { play: [once('makoto_skill_02_hit_01_finish', 'id')] }
          : o.k === 'makoto_s3_1_standin[phys]' ? { play: [once('makoto_skill_03_p1_weak_01', 'id'), once('makoto_skill_03_p1_hit_02', 'id')] }
            : o.k === 'makoto_s3_1_standin[arts]' ? { play: [once('makoto_skill_03_p1_weak_01', 'id'), once('makoto_skill_03_p1_hit_01', 'id')] } : null)),
    // (2026-11-10) 테리토리야 T1 实质坍缩: dminon_t_1[dmg] ON_BUFF_START, its AdvancedApplyDamage and CreateEffect dminon_talent_hit_01
    // on the enemy (`_constDirection` UP: the prefab turns with nothing). Its GatherEffect ability's `_hitEffects` only lists it
    dminon: cite(['dminon_t_1[dmg]', 'char_4246_dminon/Others/Direction/CommonAbilities/GatherEffect'], (o) => (o.k === 'dminon_t_1[dmg]' ? { play: [once('dminon_talent_hit_01', 'id')] } : null)),
    // (2026-11-05) 矩 S2's extra damage: ju_s_2[damage] ON_BUFF_FINISH, its AdvancedApplyDamage and hit_02 on the enemy (its start: juExtra)
    ju: cite('ju_s_2[damage]', (o) => (o.k === 'ju_s_2[damage]' ? { play: [once('ju_skill_02_hit_02', 'id')] } : null)),
    // 泡泡 T1 尖刺盾: bubble_t_1 ON_TAKE_DAMAGE puts bubble_t_1[atk_down] (overrideEffectKey bubble_talent_buff, its blackboard
    // duration) on the attacker; a later hit extends the one buff (maxStackCnt 1) — one slot per attacker
    bubble: cite('bubble_t_1[atk_down]', (o) => (o.k === 'bubble_t_1[atk_down]'
      ? { play: [{ n: 'bubble_talent_buff', on: 'by', life: Number(o.life) > 0 ? Number(o.life) : 5, slot: `spike:${o.by}` }] } : null)),
    // 浊心斯卡蒂 S1: skadi2_s_1[protect] ON_TAKE_DAMAGE of the ally (its DamageSplit) creates _hit on her (BUFF_SOURCE) and _hit_02
    // on the ally (BUFF_OWNER)
    skadi2: cite('skadi2_s_1[protect]', (o) => (o.k === 'skadi2_s_1[protect]'
      ? { play: [once('skadi2_skill_01_hit'), once('skadi2_skill_01_hit_02', 'id')] } : null)),
    // 乌尔比安 本性的坚守: ulpia_t_2 ON_TAKE_DAMAGE heals him (FixedValueHeal) and creates ulpia_recover_01 on him
    ulpia: cite('ulpia_t_2', (o) => (o.k === 'ulpia_t_2' ? { play: [once('ulpia_recover_01')] } : null)),
    // 引星棘刺 S2's alchemy unit (thorn2_s2_damage ON_BUFF_TRIGGER) and S3's sea (thorn2_s3_enemy_buff ON_BUFF_START): their
    // NoSourceDamage and thorn2_skill_hit on the enemy it damages
    thorn2: cite(['thorn2_s2_damage', 'thorn2_s3_enemy_buff'], (o) => (o.k === 'thorn2_s2_damage' || o.k === 'thorn2_s3_enemy_buff'
      ? { play: [once('thorn2_skill_hit', 'id')] } : null)),
    // 休谟斯's 收割者 trait heal (sim fx 'trait'): humus_trait[heal] heals her and creates humus_trait[heal][effect]
    // (overrideEffectKey humus_recover_01, 0.1 s)
    humus: cite('humus_trait[heal][effect]', (o) => (o.k === 'trait' ? { play: [{ tpl: 'humus_trait[heal][effect]', on: 'op' }] } : null)),
    // 焰影苇草: her 咒愈师 trait heal (sim fx 'trait': reed2_tr's buff reed2_tr_heal[effect] — FixedValueHeal and reed2_treat_01
    // on the ally it heals) and 映耀's share of a heal on another (reed2_t_2 / module reed2_e_002_t ON_OUTPUT_MODIFIER IsHeal,
    // !IfTargetEqual: FixedValueHeal and reed2_treat_01 on her)
    // (2026-11-10) 아미야 의료 형태 (규정 기물): her 咒愈师 trait heal (sim fx 'trait'): amiya3_instant_heal ON_BUFF_START, its
    // FixedValueHeal and CreateEffect amiya3_characteristic_01_hit on the ally it heals (TARGET, `_constDirection` UP)
    amiya3: cite('amiya3_instant_heal', (o) => (o.k === 'trait' ? { play: [once('amiya3_characteristic_01_hit', 'id')] } : null)),
    reed2: cite(['reed2_tr_heal[effect]', 'reed2_t_2', 'reed2_e_002_t'], (o) => (o.k === 'trait' ? { play: [once('reed2_treat_01', 'id')] }
      : o.k === 'reed2_t_2' ? { play: [once('reed2_treat_01')] } : null)),
    // (2026-10-24, 묶음 S11) 余: yu_skill3_annex_02 where his 灼燃损伤 lands — S1 yu_s_1[inverse_damage] on the attacker, T1
    // yu_t_1[enemy] on each enemy he blocks, S3 yu_s_3[ally] on the enemy an ally's arts hit across the wall
    yu: cite(YU_HIT, (o) => (YU_HIT.includes(o.k) ? { play: [once('yu_skill3_annex_02', 'id')] } : null)),
    // 百炼嘉维尔 S1: gvial2_s_1 (template heal_via_damage, ON_AFTER_OUTPUT_DAMAGE) heals her by the damage and creates its
    // blackboard `effect` gvial2_skill_1_heal on her
    gvial2: cite('gvial2_s_1', (o) => (o.k === 'gvial2_s_1' ? { play: [once('gvial2_skill_1_heal', 'id')] } : null)),
    // (2026-11-15) 望 S3's 跟子 burst (skchr_wang_3/SpawnTokenS3/BuildStone: wang_stone3_t[damage] `_extraActions`, TARGET,
    // IMMEDIATELY) — doroth_bomb_hit, 多萝西's prefab, on each enemy it damages
    wang: cite('wang_stone3_t[damage]', (o) => (o.k === 'wang_stone3_t[damage]' ? { play: [once('doroth_bomb_hit', 'id')] } : null)),
    // (2026-10-26) 酒神 S2: each tick of 本能的召唤's exit (phatm2_s_2[damage], ON_BUFF_TRIGGER) creates
    // phatm2_skill_02_debuff_hit_01 on the enemy it damages
    phatm2: cite('phatm2_s_2[damage]', (o) => (o.k === 'phatm2_s_2[damage]' ? { play: [once('phatm2_skill_02_debuff_hit_01', 'id')] } : null)),
    // (2026-11-01) 冻河 T1: tocka_t1[sp_and_heal]'s heal makes tocka_t1[heal_core] on the ally (ON_BUFF_START CreateEffect
    // tocka_heal_01_hit_01)
    tocka: cite('tocka_t1[heal_core]', (o) => (o.k === 'tocka_t1[heal_core]' ? { play: [once('tocka_heal_01_hit_01', 'id')] } : null)),
    // 折桠 T1 简易包扎: branch_t_1 ON_SKILL_FINISH heals her (HealViaMaxHpRatio) and creates branch_talent_01 on her
    branch: cite('branch_t_1', (o) => (o.k === 'branch_t_1' ? { play: [once('branch_talent_01')] } : null)),
    // 圣约送葬人 S3: excu2_s_3[mark][effect] ON_OUTPUT_DAMAGE puts excu2_s_3[mark] (INFINITY, excu2_skill_03_aim_01) on each enemy
    // it hits — the ones its end damages; the sim sends the first hit on each, the mark goes as the skill ends
    excu2: cite('excu2_s_3[mark]', (o) => (o.k === 'excu2_s_3[mark]' ? { play: [{ n: 'excu2_skill_03_aim_01', on: 'id', life: 'skill' }] } : null)),
    // (2026-10-24, 묶음 S6) rows behind a condition the sim decides as it deals the hit — the moment is sent only when it held:
    // 克莱门莎 T1 生死定夺: clemnt_t1[dice_damage] ON_AFTER_OUTPUT_DAMAGE after a won roll (Dice) — clemnt_talent_hit_01 on the target
    clemnt: cite('clemnt_t1[dice_damage]', (o) => (o.k === 'clemnt_t1[dice_damage]' ? { play: [once('clemnt_talent_hit_01', 'id')] } : null)),
    // 归溟幽灵鲨 S3: ghost2_s_3[attack] on a target whose HP ratio is ≥ hers (FilterByTargetHpRatio) — the extra damage and hit_02
    ghost2: cite('ghost2_s_3[attack]', (o) => (o.k === 'ghost2_s_3[attack]' ? { play: [once('ghost2_skill_03_hit_02', 'id')] } : null)),
    // (2026-11-11) 温蒂 S3 / her cannon's 液氮炮 (projectile_weedy_s3, speed 8: it lands after the cast, past the skill's pending
    // hits) on the target it traced: `_effectsWhenReached` weedy_skill_03_hit, `_effectsWhenHit` weedy_skill_01_hit
    // (`_onlyPlayHitEffectOnTraceTarget`)
    weedy: cite('projectile_weedy_s3', (o) => (o.k === 'projectile_weedy_s3' ? { play: [once('weedy_skill_03_hit', 'id'), once('weedy_skill_01_hit', 'id')] } : null)),
    // 锏 S2: blkkgt_s_2[check_block] gives the enemy [blocked] or [not_blocked] by CheckBlocked — both blkkgt_skill_02_hit_2, with the
    // first of its slashes
    blkkgt: cite(['blkkgt_s_2[blocked]', 'blkkgt_s_2[not_blocked]'], (o) => (o.k === 'blkkgt_s_2[blocked]' || o.k === 'blkkgt_s_2[not_blocked]'
      ? { play: [once('blkkgt_skill_02_hit_2', 'id')] } : null)),
    // 圣聆初雪 T1: a ground enemy stepping onto snow (sbell2_t1[enemy_enter]: CheckMotionMode WALK, !CheckAbnormalFlags) takes the
    // talent damage and sbell2_buff_01_hit_01; S2's tick on the enemies in snow (sbell2_t1[s2_dot]) _hit_02
    sbell2: cite(['sbell2_t1[enemy_enter]', 'sbell2_t1[s2_dot]'], (o) => (o.k === 'sbell2_t1[enemy_enter]' ? { play: [once('sbell2_buff_01_hit_01', 'id')] }
      : o.k === 'sbell2_t1[s2_dot]' ? { play: [once('sbell2_buff_01_hit_02', 'id')] } : null)),
    // 忍冬 T1 追凶: each arts addition (vulpis_t_1 ON_OUTPUT_MODIFIER, the enemy without [mark]) renews vulpis_t_1[vfx]
    // (vulpis_buff_01, LIMITED `interval` s) on it — one slot per enemy
    vulpis: cite('vulpis_t_1[vfx]', (o) => (o.k === 'vulpis_t_1[vfx]'
      ? { play: [{ n: 'vulpis_buff_01', on: 'id', life: Number(o.life) > 0 ? Number(o.life) : 10, slot: `hunt:${o.id}` }] } : null)),
    // 阿斯卡纶 S2: a ground enemy of her range knocked out (ascln_s_2[enemy] ON_OWNER_KILLED, CheckMotionMode WALK) —
    // ascln_skill_02_death_01 where it falls (the blow that felled it carries the moment)
    ascln: cite('ascln_s_2[enemy]', (o) => (o.k === 'ascln_s_2[enemy]' ? { play: [once('ascln_skill_02_death_01', 'id')] } : null)),
    // 妮芙 S3: her S3 attack on a target in an apoptosis burst (the ability's FilterEPBreakRecoveryType action) — nymph_skill_03_hit_02
    nymph: cite('char_4146_nymph/Modes/S3/Body/Attack', (o) => (o.k === 'char_4146_nymph/Modes/S3/Body/Attack' ? { play: [once('nymph_skill_03_hit_02', 'id')] } : null)),
    // 雪猎 T1 裂云兽: its strike (snhunt_t[effect]; the EN client's Talents/1 ability) — _hit_02 on a flying target (IfTarget
    // FLY_ONLY / CheckMotionMode), else _hit: `fly` the hit unit flies (hitMoments)
    snhunt: cite(['snhunt_t[effect]', 'char_4211_snhunt/Others/Direction/Talents/1'], (o) => (o.k === 'snhunt_t[effect]'
      ? { play: [once(Number(o.fly) ? 'snhunt_talent_01_hit_02' : 'snhunt_talent_01_hit', 'id')] } : null)),
    // 刺玫's 咒愈师 trait heal (sim fx 'trait'): vendla_tr[heal] — FixedValueHeal unless the ally is HEAL_FREE (the sim heals none
    // then) and vendla_tr[effect] (vendla_attack_hit_02, 1 s) on it
    vendla: cite('vendla_tr[heal]', (o) => (o.k === 'trait' ? { play: [{ n: 'vendla_attack_hit_02', on: 'id', life: 1 }] } : null)),
    // (2026-10-24, 묶음 S8) 菲莱 S2: each enemy of the blast holds philae_s_2[ep], whose trigger creates _hit_02 on it while she holds
    // philae_s_2[atk] (her rage — the sim's 'skill:philae_rage'), else _hit_01: the sim's two keys
    philae: cite('philae_s_2[ep]', (o) => (o.k === 'philae:blast:rage' ? { play: [once('philae_skill_02_hit_02', 'id')] }
      : o.k === 'philae:blast' ? { play: [once('philae_skill_02_hit_01', 'id')] } : null)),
    // 至简 T1 忽有所悟: a won roll (Dice) — malist_hit_extra on the target of that damage
    malist: cite('malist_t_1', (o) => (o.k === 'malist_t_1' ? { play: [once('malist_hit_extra', 'id')] } : null)),
    // 真言 T1 噤声限域: mantra_t_1 ON_TRIGGER_PALSY — the talent's 元素伤害 and mantra_bounce_hit_01 on the enemy whose attack 麻痹 cut
    mantra: cite('mantra_t_1', (o) => (o.k === 'mantra_t_1' ? { play: [once('mantra_bounce_hit_01', 'id')] } : null)),
    // (2026-11-16) 棘刺 T1 神经腐蚀: each poisoning hit (thorns_t_1, his Talents/1 `_additiveActiveBuffs`: overrideEffectKey
    // thorns_buff_01_start; LIMITED without a durationKey — Buff.FetchDuration reads the blackboard `duration`) holds the poison's look
    // on the enemy for that long from the latest hit (the sim's `life`), one slot per enemy of his (independentCharacterSource)
    thorns: cite('thorns_t_1', (o) => (o.k === 'thorns_t_1'
      ? { play: [{ n: 'thorns_buff_01_start', on: 'id', life: Number(o.life) > 0 ? Number(o.life) : 3, slot: `poison:${o.id}` }] } : null)),
    // 深靛 S2: indigo_s_2[aura] holds indigo_s_2[damage] (indigo_skill_02_buff_03) on each bound enemy of her range — renewed by
    // each damage tick for `life` s, one slot per enemy
    indigo: cite('indigo_s_2[damage]', (o) => (o.k === 'indigo_s_2[damage]'
      ? { play: [{ n: 'indigo_skill_02_buff_03', on: 'id', life: Number(o.life) > 0 ? Number(o.life) : 0.65, slot: `dot:${o.id}` }] } : null)),
    // 海霓 S2: haini_s_2[modify_talent] on a raise of her talent (the killing blow carries it) — below max_talent_up [not_full_effect]
    // (buff_02) once; at it, [not_full_effect] finished and [full_effect] (buff_01) + [full_effect2] (weapon_01) — derived
    // INFINITY buffs ended with the skill (fxgame.js KIT_OWNED keeps the `_buff` name rule from looping both from its start)
    haini: cite(['haini_s_2[not_full_effect]', 'haini_s_2[full_effect]', 'haini_s_2[full_effect2]'], (o) => (o.k === 'haini:up'
      ? { stop: ['hainiStage'], play: [{ n: 'haini_skill_02_buff_02', on: 'op', life: 'skill', tag: 'hainiStage' }] }
      : o.k === 'haini:full' ? { stop: ['hainiStage'], play: ['haini_skill_02_buff_01', 'haini_skill_02_weapon_01'].map((n) => ({ n, on: 'op', life: 'skill', tag: 'hainiStage' })) }
        : null)),
  },
  // 荒芜拉普兰德 S3 (2026-10-24, 묶음 S8): each wolf's target ('whitw2Drones' `t`: [id, 0 chasing / 1 held] per drone, every
  // 0.15 s) — the funnel's `_traceTargetBuff` whitw2_s3_a[trace_target_mark] (mark_01) on the one it chases, its attached
  // projectile's whitw2_s3_p[aura_effect] (mark_02) on the one it holds; one slot per enemy, kept by the next sample (a held
  // one over a chased one), gone a moment after the wolves leave it
  whitw2Drones: {
    whitw2: cite(['whitw2_s3_a[trace_target_mark]', 'whitw2_s3_p[aura_effect]'], (o) => {
      const by = new Map();
      for (const m of Array.isArray(o.t) ? o.t : []) if (Array.isArray(m) && m[0] != null) by.set(m[0], Math.max(by.get(m[0]) ?? 0, Number(m[1]) ? 1 : 0));
      return { play: [...by].map(([id, held]) => ({ n: held ? 'whitw2_skill_03_mark_02' : 'whitw2_skill_03_mark_01', unit: id, life: 0.4, slot: `wolfMark:${id}` })) };
    }),
  },
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
  // S1's HealAlly and S2's SpawnToken are children of her attack group that fire on her coins (swire2_can_use_gold), so the
  // kit sends them apart: their `_castEffects` as the cast starts, HealAlly's `_hitEffects` on the ally it heals ('coin' `heal`)
  coin: {
    swire2: cite(['projectile_chr_swire2_s_3', 'char_1033_swire2/Modes/S3_End/Body/Trigger', 'char_1033_swire2/Modes/S1/Body/Trigger/HealAlly'], (o) => (o.skill === 'swire2_3' ? { play: [
      { tpl: 'char_1033_swire2/Modes/S3_End/Body/Trigger', cast: true },
      ...(Array.isArray(o.targets) && o.targets.length ? [{ tpl: 'projectile_chr_swire2_s_3', fly: 8, to: 'targets', gap: 0.07 }] : []),
    ] } : o.skill === 'swire2_1' && o.heal != null ? { play: [once('swire2_skill_01_hit', 'heal')] } : null)),
  },
  swire2Heal: { swire2: cite('char_1033_swire2/Modes/S1/Body/Trigger/HealAlly', () => ({ play: [{ tpl: 'char_1033_swire2/Modes/S1/Body/Trigger/HealAlly', cast: true }] })) },
  swire2Throw: { swire2: cite('char_1033_swire2/Modes/S2/Body/Trigger/SpawnToken', () => ({ play: [{ tpl: 'char_1033_swire2/Modes/S2/Body/Trigger/SpawnToken', cast: true }] })) },
  // 圣聆初雪 S2 (2026-10-21): the frozen protection point (token_10058_sbell2_icetgt, pkgrps/btl_pfb_tokens_4.ab): its Effect
  // ability's INFINITY buff icetgt_a[effect] shows sbell2_tile_frozen (`overrideEffectKey`) while it stands, and the
  // template's ON_OWNER_FINISH CreateEffect plays sbell2_tile_defrost on it as it goes
  // (2026-11-07) 미틈's 체리 3호, the token's own effects in her plans (a summon's view has no bundle of its own)
  disappear: {
    // trshrb_t_1[dead_listener] ON_BEFORE_TRY_SET_HP_ZERO, where it fell
    mitm: cite('trshrb_t_1[dead_listener]', () => ({ play: [{ ...once('token_mitm_trshrb_die_01', 'point'), bundle: 'mitm_token' }] })),
  },
  // (2026-11-07) 만트라: S3's 溢出 on its holder (projectile_chr_mantra_s3_2's hit); T2's mark on the tile it listens to (`_effectSettings` castedTimeThreshold 1)
  mantraArc: { mantra: cite('projectile_chr_mantra_s3_2', () => ({ play: [once('mantra_bounce_hit_01', 'point')] })) },
  mantraGate: { mantra: cite('char_4204_mantra/Others/Direction/Talents/2/TileListener', () => ({ play: [once('mantra_mark_01', 'point')] })) },
  // (2026-11-11) 蜜蜡 S2: the 沙之碑 (token_10011_beewax_oblisk) casts its own skill sktok_beewax as it is placed — the stun burst
  // the kit's 'obelisk' stands for — whose `_castEffects` ON_CAST_START plays token_beewax_skill_02_range on it once
  // (pkgrps/btl_pfb_fx_token_0.ab → bundle beewax_token); no stand-in pillar
  obelisk: {
    beewax: cite('sktok_beewax', () => ({ play: [{ ...once('token_beewax_skill_02_range', 'id'), bundle: 'beewax_token' }] })),
  },
  mitmReborn: {
    // Modes/Reborn trshrb_switch `_castEffects`, as its ReBorn clip starts
    mitm: cite('token_10037_mitm_trshrb/Modes/Reborn/Body/Talents/1', () => ({ play: [{ n: 'token_mitm_trshrb_birth_01', on: 'point', life: 1, bundle: 'mitm_token' }] })),
  },
  summon: {
    // a 残骸: trshrb_t_1[trash_born] ON_BUFF_START (a 小车's trshrb_switch is the kit's 'mitmReborn' at each deployment)
    mitm: cite('trshrb_t_1[trash_born]', (o) => (o.waste ? { play: [{ ...once('token_mitm_trshrb_waste_01', 'id'), bundle: 'mitm_token' }] } : null)),
    sbell2: cite('icetgt_a[effect]', (o) => (/icetgt/.test(String(o.token ?? ''))
      ? { play: [{ tpl: 'icetgt_a[effect]', on: 'id', life: 'unit' }] } : null)),
  },
  // 凯尔希·思衡托 S3 (2026-10-21, CN client): kalts2_s_3[withdraw]'s ON_BUFF_START CreateEffect kalts2_skill_03_teleport_02 on
  // each 待投放 operator (`picks`) as the transport starts …
  // (2026-11-05) 矩 S2: ju_s_2[damage] ON_BUFF_START — hit_01 or hit_04 on the enemy, by turns (the `isFront` of his ju_s_2[host])
  juExtra: { ju: cite('ju_s_2[damage]', (o) => ({ play: [once(o.front ? 'ju_skill_02_hit_01' : 'ju_skill_02_hit_04', 'id')] })) },
  // (2026-11-06) 蒂比: S1_TakeOff / S2_TakeOff's cast effect (tippi_s_1[swtich_mode], tippi_s_2[switch_mode] ON_BUFF_START), a loop
  // ending with its clip Skill_Begin / Skill_2_Begin (1 s); the landing: fxmap.js SKILL_END_CAST
  // (2026-11-07) 云迹: the same modes and prefab names as 蒂比's
  takeoff: {
    aglna2: AGLNA2_EDGE,
    tippi: cite(['char_4191_tippi/Modes/S1_TakeOff/Body/Attack', 'char_4191_tippi/Modes/S2_TakeOff/Body/Attack'], () => ({ play: [{ n: 'tippi_takeoff_F', on: 'op', life: 1 }] })),
    ctrail: cite(['char_4165_ctrail/Modes/S1_TakeOff/Body/Attack', 'char_4165_ctrail/Modes/S2_TakeOff/Body/Attack'], () => ({ play: [{ n: 'ctrail_takeoff_F', on: 'op', life: 1 }] })),
  },
  // (2026-11-16) and 予愿安洁莉娜 S3's landing: her range where she landed (AGLNA2_EDGE)
  aglnaFlight: { aglna2: AGLNA2_EDGE },
  // (2026-11-05) 风絮: the FlyStart / FlyEnd modes' cast effects (their attack ability's `_castEffects`), the 'skill' / 'atk' bindings
  // draw only the mode that attacks; S2's second heal (taraxa_s2[second_heal], projectile_chr_taraxa_s2_1 at speed 10)
  taraxaFly: { taraxa: cite(['char_4222_taraxa/Modes/S1_FlyStart/Body/Attack', 'char_4222_taraxa/Modes/S1_FlyEnd/Body/Attack'], (o) => ({ play: [{ n: o.up ? 'taraxa_land' : 'taraxa_takeoff', on: 'op', life: 1 }] })) },
  // 2026-11-06: 薇薇安娜 S1's 蓄力 state: vvana_s_1[mode] (the SP full twice) creates vvana_s_1_enhance_mark, which holds vvana_skill_01_S_buff until the skill ends
  vvanaCharge: { vvana: cite('vvana_s_1_enhance_mark', (o) => ({ stop: ['vvanaS1'], play: o.form === 'charged' ? [{ tpl: 'vvana_s_1_enhance_mark', on: 'op', life: 'tag', tag: 'vvanaS1' }] : [] })) },
  taraxaSecond: { taraxa: cite('projectile_chr_taraxa_s2_1', () => ({ play: [{ tpl: 'projectile_chr_taraxa_s2_1', fly: 10, to: 'tgt', on: 'op' }] })) },
  // 2026-11-06: the splash heals (taraxa_s2[splash], projectile_chr_taraxa_s2_2 at speed 5) fly from the unit her heal reached, its hit on each as it lands
  taraxaSplash: { taraxa: cite('projectile_chr_taraxa_s2_2', () => ({ play: [{ tpl: 'projectile_chr_taraxa_s2_2', fly: 5, to: 'tgt', from: 'from', on: 'op' }] })) },
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
  revive: {
    blaze2: cite('char_1040_blaze2/Others/Direction/CommonAbilities/blaze2[to_default_state]', () => ({ stop: ['blazeDown'], play: [once('blaze2_revive_end_start')] })),
    // 琳琅诗怀雅 破财消灾 (2026-10-24, 묶음 S6): the DP-paid save — swire2_e_003[talent] ON_BEFORE_TRY_SET_HP_ZERO, when she holds
    // no swire2_t_2[heal] and the DP cover its cost (the sim's), creates swire2_t_2[heal] (swire2_buff_02_start) on her — for
    // the prefab's own duration [추정: the 0.01 s buff (its finish heals her) does not cut it]
    swire2: cite('swire2_t_2[heal]', () => ({ play: [once('swire2_buff_02_start')] })),
  },
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
  // 涤火杰西卡 S3's shell (kits/ops/op-jesca2.js): ExtraBomb's `_castEffects` as it fires, projectile_chr_jesca2_s3_bomb's
  // `_mainEffect` along its flight to the end point of her range ('bombardShell' x / y; speed 5), and its `_effectsWhenStop`
  // where it stops — the first enemy it touches, often before that end point ('bombard' x / y), which ends the flight
  bombardShell: {
    jesca2: cite(['char_1034_jesca2/Modes/S3/Body/Attack/ExtraBomb', 'projectile_chr_jesca2_s3_bomb'], () => ({
      play: [{ n: 'jesca2_skill_03_start_02', life: 'once', cast: true }, { n: 'jesca2_skill_03_trail_02', fly: 5, tag: 'jesca2Shell' }],
    })),
  },
  // 위셔델's 혼령의 그림자 strike: sktok_wisdel_wward `_castEffects` on the shade, then projectile_chr_wisdel_token (`_speed` 15, `_throwEffect`
  // `_mainEffect`) with its `_effectsWhenHit` on the target. The sim strikes at once: the cast and the shot leave at that moment
  burst: {
    wisdel: cite(['sktok_wisdel_wward', 'projectile_chr_wisdel_token'], () => ({
      play: [
        { ...once('token_wisdel_attack_01_start', 'id'), bundle: 'wisdel_token' },
        { n: 'token_wisdel_attack_01_line', fly: 15, from: 'id', to: 'target', bundle: 'wisdel_token' },
        { ...once('token_wisdel_attack_01_hit', 'target'), after: 'fly', bundle: 'wisdel_token' },
      ],
    })),
  },
  bombard: {
    jesca2: cite('projectile_chr_jesca2_s3_bomb', () => ({ stop: ['jesca2Shell'], play: [once('jesca2_skill_03_hit_02', 'point')] })),
  },
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
  // (2026-11-07) … a ranged 流形 splits (talent 2 SpawnTokenCommon every N attacks, S3 SpawnTokenS3 on its x-5 tiles): the copy
  // `id` takes mlyss_wtrman_summon[trigger] (INFINITY, `overrideEffectKey` token_10030_mlyss_wtrman_split_start_01) while it
  // stands, and the 流形's EmitProjectile / EmitProjectileS3 flies projectile_chr_mlyss_wtrman (`_mainEffect` _split_trail_01,
  // `_speed` 4) from it (`src`) to that tile — `_raiseHeight` 0.8 only beyond `_noRaiseHeightThreshold` 1.3, so none to a
  // neighbouring tile. (2026-11-16) The copy is born in mode Recharge (its mlyss_wtrman_t_1[trigger] puddle token_10030_mlyss_wtrman_c0)
  // with mlyss_wtrman_range[mark]: its mlyss_wtrman_born_trigger (triggerInterval 0.2 s) casts mlyss_wtrman_switch_range with
  // _c0_to_c3, whose `_preDelay` 1 s ends the mode; its mlyss_wtrman_summon[override] ON_BUFF_FINISH plays _c3_to_c0 as it goes
  split: {
    mlyss: cite(['mlyss_wtrman_summon[trigger]', 'projectile_chr_mlyss_wtrman', 'mlyss_wtrman_t_1[trigger]', 'mlyss_wtrman_born_trigger', 'mlyss_wtrman_summon[override]'], () => ({ play: [
      { tpl: 'mlyss_wtrman_summon[trigger]', bundle: 'mlyss_token', on: 'id', life: 'unit', end: 'token_10030_mlyss_wtrman_c3_to_c0' },
      { n: 'token_10030_mlyss_wtrman_c0', bundle: 'mlyss_token', on: 'id', life: MANIFOLD_BORN_TRIGGER + MANIFOLD_SWITCH },
      { n: 'token_10030_mlyss_wtrman_c0_to_c3', bundle: 'mlyss_token', on: 'id', life: 'once', after: MANIFOLD_BORN_TRIGGER },
      { tpl: 'projectile_chr_mlyss_wtrman', bundle: 'mlyss_token', fly: 4, from: 'src', to: 'id' }] })),
  },
  // … S3 refills a 流形 or copy already on those tiles (`_buffsToExistToken` mlyss_wtrman_[summon_refresh]: ON_BUFF_START
  // token_10030_mlyss_wtrman_refresh_01 on it); the casting 流形 is one of them (its own tile is in x-5), and its cast is
  // sktok_mlyss_wtrman_3/SpawnTokenS3's `_castEffects` _split_start_01 on it
  refresh: {
    mlyss: cite(['mlyss_wtrman_[summon_refresh]', 'sktok_mlyss_wtrman_3/SpawnTokenS3'], (o) => ({ play: [
      { tpl: 'mlyss_wtrman_[summon_refresh]', bundle: 'mlyss_token', on: 'id' },
      ...(o.src != null && o.src === o.id ? [{ n: 'token_10030_mlyss_wtrman_split_start_01', bundle: 'mlyss_token', on: 'id', life: 'once' }] : [])] })),
  },
  // … and each S3 pulse of a melee 流形 (mlyss_s_3[token_melee_trigger]: ON_BUFF_TRIGGER token_10030_mlyss_wtrman_c2_skill_03_range_01 on it)
  pulse: {
    // (its trigger, not its start: named, as build-fx-plays.mjs keeps ON_BUFF_START rows only)
    mlyss: cite('mlyss_s_3[token_melee_trigger]', () => ({ play: [{ n: 'token_10030_mlyss_wtrman_c2_skill_03_range_01', bundle: 'mlyss_token', on: 'id', life: 'once' }] })),
  },
  // (2026-11-16) … a 流形 falls (its mode's mlyss_wtrman_t_1[listener] ON_BEFORE_TRY_SET_HP_ZERO: CreateEffect of its blackboard
  // `effect` — Default token_10030_mlyss_wtrman_c1_to_c0, Melee / Melee_S3 _c2_to_c0, Range / Range_S2 _c3_to_c0 — where it
  // stands) into mode Recharge, whose mlyss_wtrman_t_1[trigger] (`overrideEffectKey` token_10030_mlyss_wtrman_c0) holds its
  // puddle until the reborn buff switches the mode (`t`: the sim's wait + the switch cast's `_preDelay`) …
  manifoldDown: {
    mlyss: cite(['mlyss_wtrman_t_1[listener]', 'mlyss_wtrman_t_1[trigger]'], (o) => ({ play: [
      { n: `token_10030_mlyss_wtrman_${MANIFOLD_FORM[o.mode] ?? 'c1'}_to_c0`, bundle: 'mlyss_token', on: 'point', life: 'once' },
      { n: 'token_10030_mlyss_wtrman_c0', bundle: 'mlyss_token', on: 'point', life: Math.max(0.05, Number(o.t) || 0) }] })),
  },
  // … and as it stands again: that buff's ON_BUFF_TRIGGER plays _c0_to_c2 (mlyss_wtrman_melee[mark]), _c0_to_c3
  // (mlyss_wtrman_range[mark]) or _c0_to_c1 (uncopied) where it lies with the switch cast. `born`: a 流形's deployment, born in
  // mode Recharge too — its mlyss_wtrman_born_trigger (ON_BUFF_START: no split copy) casts mlyss_wtrman_switch with _c0_to_c1
  // at once, the puddle until the cast's `_preDelay` ends
  manifoldUp: {
    mlyss: cite(['mlyss_wtrman_t_1[trigger]', 'mlyss_wtrman_born_trigger'], (o) => ({ play: [
      { n: `token_10030_mlyss_wtrman_c0_to_${MANIFOLD_FORM[o.mode] ?? 'c1'}`, bundle: 'mlyss_token', on: o.born ? 'id' : 'point', life: 'once' },
      ...(o.born ? [{ n: 'token_10030_mlyss_wtrman_c0', bundle: 'mlyss_token', on: 'id', life: MANIFOLD_SWITCH }] : [])] })),
  },
  // 焰影苇草 S2: each carrier's fireball (projectile_chr_reed2_fire: `_mainEffect` reed2_skill_02_fireball_01 circling it at
  // `_projectileAroundRadius` 1, `_aroundSpeed` 150 °/s) until her skill ends [추정: the sense of the turn]
  ember: { reed2: cite('projectile_chr_reed2_fire', () => ({ play: [{ n: 'reed2_skill_02_fireball_01', on: 'id', life: 'skill', orbit: REED2_ORBIT }] })) },
  // … (2026-10-24, 묶음 S8) and each strike of one ('strike': `src` the carrier, `by` her, `cd` its cooldown): its
  // `_hitEffectOnProjectilePos` fireball_hit where the fireball is, and its `_coolDownEffect` fireball_02 on it until it may
  // strike again [추정: beside the main effect, which the client keeps]; the hit on the enemy is the skill's
  strike: {
    reed2: cite('projectile_chr_reed2_fire', (o) => ({ play: [
      { n: 'reed2_skill_02_fireball_hit', on: 'src', life: 'once', orbit: REED2_ORBIT },
      { n: 'reed2_skill_02_fireball_02', on: 'src', life: Number(o.cd) > 0 ? Number(o.cd) : 1.5, orbit: REED2_ORBIT, slot: `fireCd:${o.src}` },
    ] })),
  },
  // 隐德来希 T2 重盈: the talent's toggle (charpack Talents/2 `_unmanagedBuffsWhenToggleOn` etlchi_t_2[heal], lifeTime 3 s)
  reborn: { etlchi: cite('etlchi_t_2[heal]', () => ({ play: [{ tpl: 'etlchi_t_2[heal]', on: 'op', life: 3 }] })) },
  // 流明 S1: the shot's heal rain (lumen_s_1[effect] on the target, LIMITED: projectile_life_time `t`; projectile_chr_lumen_s1's
  // `_mainEffect` is the same prefab) [추정: lumen_s_1[heal]'s lumen_skill_01_hit on each healed ally per tick is not drawn]
  healField: { lumen: cite('lumen_s_1[effect]', (o) => ({ play: [{ tpl: 'lumen_s_1[effect]', on: 'tgt', life: Math.max(0.1, Number(o.t) || 0) }] })),
    // (2026-11-07) 슈 T1: DoFarm (AttachListenerToTileAbility `_effectSettings`) holds shu_talent_buff_01 on every sown tile until she leaves (`tiles`: the new ones)
    shu: cite('char_2025_shu/Others/Direction/Talents/1', (o) => ({ play: (Array.isArray(o.tiles) ? o.tiles : []).map(([c, r]) => ({ n: 'shu_talent_buff_01', on: 'point', at: [c, r], slot: `shuTile:${r}:${c}` })) })) },
  // (2026-11-07) 탈룰라 S2's counter: skchr_oxi_2 `_inputTargetEffects` ON_SPELL_ON on its centre. Her S3's explosions (`w`) are fxgame.js 'blast'
  blast: { oxi: cite('skchr_oxi_2', (o) => (o.w == null ? { play: [once('oxi_skill_02_hit_01', 'tgt')] } : null)) },
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
  // 圣聆初雪 S3 (2026-10-24, 묶음 S6): the lure at its start ('lure') — sbell2_s3[switch_mode] ON_BUFF_START creates sbell2_skill_03_flow
  // on her while she stands (CheckUnitAlive); the pulled enemies' sbell2_skill_03_hint is the 'attract' status's (fxstatus.js SOURCE_FX)
  lure: { sbell2: cite('sbell2_s3[switch_mode]', () => ({ play: [once('sbell2_skill_03_flow')] })) },
  // 灵知 T2 殊途同归 (his only 'kitHit', 10 s after the deploy): charpack Talents/2's wrapper ability gnosis_t_2_buff casts
  // gnosis_beidong_buff from ON_CAST_START to ON_CAST_END, and the wrapper is `_isInfinity` (ActiveAbilityWrapper._GetLifeTime
  // returns no end): its cast never ends, but the prefab's own `_maxLifetime` 2 s ends it (2026-10-27, official client:
  // ParticleEffect._CheckIfAlive; render/fxgame.js `maxLife`) — a burst with a glow that loops for those 2 s
  // (2026-11-10) 메커니스트 S3: the 结构性原理's charge is mcnist_s_3_projectile_real's EmitProjectileToTileUseSelector — by its deploy
  // direction (UP / DOWN, else the side) and whether it faces left (CheckFaceLOrR): projectile_chr_mcnist_s3_token[_right / _up /
  // _up_right / _down / _down_right], each one's `_mainEffect` from its tile to the stop tile (`_delayToStart` 0.2, speed 20:
  // kits/ops/op-mcnist.js CHARGE_DELAY / CHARGE_SPEED); its `_effectsWhenReached` at the landing is the 'aoe' below
  charge: {
    mcnist: cite(['projectile_chr_mcnist_s3_token', 'projectile_chr_mcnist_s3_token_right', 'projectile_chr_mcnist_s3_token_up',
      'projectile_chr_mcnist_s3_token_up_right', 'projectile_chr_mcnist_s3_token_down', 'projectile_chr_mcnist_s3_token_down_right'], (o, c) => {
      const left = !!c.left;
      const n = o.dir === 'UP' ? (left ? 'trail_02_up_left' : 'trail_02_up_right')
        : o.dir === 'DOWN' ? (left ? 'trail_03_down_left' : 'trail_03_down_right') : left ? 'trail_01_left' : 'trail_01_right';
      return { play: [{ n: `token_mcnist_mcgraf_skill_03_${n}`, bundle: 'mcnist_token', fly: 20, delay: 0.2, start: [Number(o.x), Number(o.y)], land: [Number(o.tx), Number(o.ty)] }] };
    }),
  },
  kitHit: {
    // (2026-11-12) 结城理 S3 俄耳甫斯: makoto[s3_heal_others] puts makoto_s3_2_be_healed (0.5 s, its heal ON_BUFF_FINISH) on each
    // ally it picks — ON_BUFF_START CreateEffect makoto_skill_03_p2_heal_01 on the ally (op-makoto.js 'makoto:heal')
    makoto: cite('makoto_s3_2_be_healed', (o) => (o.k === 'makoto:heal' ? { play: [once('makoto_skill_03_p2_heal_01', 'tgt')] } : null)),
    // 水月 S3 镜花水月: an attack hitting fewer than 3 enemies gives her mizuki_s_3[damage] — its DamageViaMaxHpRatio on her (the
    // sim's HP loss, silent: the node creates no effect) and its CreateEffect common_magic_hit_01, bound to mizuki_skill_03_hit_02
    // in her binding, on her (chess_char_4_09-mizuki.js)
    mizuki: cite('mizuki_s_3[damage]', (o) => (o.k === 'mizuki_s_3[damage]' ? { play: [once('mizuki_skill_03_hit_02')] } : null)),
    // (2026-11-10) 메테오라이트 S2: its shell projectile_meteo_s2 (`_speed` 8, `_raiseHeight` 0.3; its `_effectsWhenHit` once, on the
    // enemy it traces: `_onlyPlayHitEffectOnTraceTarget`) — the kit's projectile, fired at the skill clip's strike (op-meteo.js)
    meteo: cite('projectile_meteo_s2', (o) => (o.k === 'meteo:shell' ? { play: [{ n: 'meteo_skill_02_trail', fly: 8, to: 'target', arc: 0.3, hit: ['meteo_skill_02_hit'] }] } : null)),
    // (2026-11-10) 아미야 의료 형태 S1: amiya3_s_1 ON_CALCULATE_DAMAGE of her attacks (family ATTACK) — CreateEffect
    // amiya3_skill_01_range on her as it heals the allies round her (kits/ops/op-amiya3.js 'amiya3:s1')
    amiya3: cite('amiya3_s_1', (o) => (o.k === 'amiya3:s1' ? { play: [once('amiya3_skill_01_range')] } : null)),
    // (2026-11-07) 로베르타's 전자동 스타일러: robrta_mach_t ON_TAKE_DAMAGE with its last layer spent, on the unit it served
    robrta: cite('robrta_mach_t', (o) => (o.k === 'robrta:end' ? { play: [{ ...once('token_robrta_buff_end', 'id'), bundle: 'robrta_token' }] } : null)),
    // (2026-11-06) 클로저 S3: closur_s_3[eff] on the enemy struck (CachedBuffToCastTargetsBehaviour; the kit keeps its mark's second)
    closur: cite('closur_s_3[eff]', (o) => (o.k === 'closur:plane' ? { play: [once('closur_skill_03_airplane_01', 'tgt')] } : null)),
    // (2026-11-06) 크리스틴 T1: the aura ability's `_effects` on her while she stands
    christ: cite('char_4198_christ/Others/Direction/Talents/1', (o) => (o.k === 'christ:aura' ? { play: [{ n: 'christ_buff_01', on: 'op', life: 'deployed' }] } : null)),
    // (2026-11-06) 브리지드 S2: brigid_s2[cut] ON_BUFF_TRIGGER, on the enemy: the buff's hit_cnt 1 / 2 / 3 picks the prefab
    brigid: cite('brigid_s2[cut]', (o) => (o.k === 'brigid:cut' ? { play: [once(['brigid_skill_02_hit_02', 'brigid_skill_02_hit_02_02', 'brigid_skill_02_hit_02_03'][o.n - 1] ?? 'brigid_skill_02_hit_02', 'tgt')] } : null)),
    // (2026-11-06) 체르니 T1: pianst_t_1 ON_TAKE_DAMAGE CreateEffect on MODIFIER_SOURCE, the attacker it answers
    // … S2's FinalAttack, `interval` s into the skill: its `_castEffects` for the cast's clip, its `_hitEffects` on each enemy struck
    pianst: cite(['pianst_t_1', 'skchr_pianst_2/FinalAttack'], (o) => (o.k === 'pianst:echo' ? { play: [once('pianst_beidong_hit', 'tgt')] }
      : o.k === 'pianst:final' ? { play: [{ n: 'pianst_skill_02_end', on: 'op', life: Number(o.t) }, once('pianst_skill_02_end_range')] }
        : o.k === 'pianst:finalHit' ? { play: [once('pianst_skill_02_end_hit', 'tgt')] } : null)),
    // (2026-11-07) 만트라: S1 / S2's hit (skchr_mantra_1 and Modes/S2/Body/Attack `_actions`: IsTargetInEPBreakRecovery → mantra_bounce_hit_01, else the skill's
    // own); each 溢出 jump of S3 (projectile_chr_mantra_s3_2 `_effectsWhenHit`, `_mainEffect`); S2's chain flies projectile_chr_mantra_s2's
    // `_overwritedMainEffectAfterFirstHit`, the same trail. Speed: the sim's jump (op-mantra.js)
    mantra: cite(['skchr_mantra_1', 'char_4204_mantra/Modes/S2/Body/Attack', 'projectile_chr_mantra_s2', 'projectile_chr_mantra_s3_2'], (o) => (o.k === 'mantra:s1' ? { play: [once('mantra_skill_01_hit_01', 'point')] }
      : o.k === 'mantra:s2' ? { play: [once('mantra_skill_02_hit_01', 'point')] }
        : o.k === 'mantra:s1el' || o.k === 'mantra:s2el' || o.k === 'mantra:s3' ? { play: [once('mantra_bounce_hit_01', 'point')] }
          : o.k === 'mantra:s2jump' || o.k === 'mantra:s3jump' ? { play: [{ n: 'mantra_bounce_trail_01', fly: 3.2, from: 'from', to: 'target' }] } : null)),
    // (2026-11-06) W: S1's grenade projectile_chr_cqbw_s1 (`_speed` 8, `_raiseHeight` 0.3: its `_effectsWhenHit` once, on the target it
    // traces: `_onlyPlayHitEffectOnTraceTarget`); S3's bomb projectile_chr_cqbw_s3 (no flight: `_effectsToTargetWhenStart` on the target
    // until it stops, then `_effectsWhenStop`); 此面向敌's skill sktok_cqbw_token (`_castEffects`: start as it arms, hit as it goes off)
    cqbw: cite(['projectile_chr_cqbw_s1', 'projectile_chr_cqbw_s3'], (o) => (o.k === 'cqbw:grenade'
      ? { play: [{ n: 'cqbw_skill_01_trail', fly: 8, to: 'target', arc: 0.3, hit: ['cqbw_skill_01_hit'] }] }
      : o.k === 'cqbw:bomb' ? { play: ['cqbw_skill_03_buff', 'cqbw_skill_03_buff_02', 'cqbw_skill_03_buff_03'].map((n) => ({ n, on: 'target', life: 'tag', tag: `cqbwBomb${o.target}` })) }
        : o.k === 'cqbw:bombHit' ? { stop: [`cqbwBomb${o.target}`], play: [once('cqbw_skill_03_hit', 'point')] }
          : o.k === 'cqbw:mineArm' ? { play: [once('cqbw_skill_02_start', 'id')] }
            : o.k === 'cqbw:mineHit' ? { play: [once('cqbw_skill_02_hit_01', 'point')] } : null)),
    // (2026-11-06) 오올헤약: S3's whirlwinds projectile_chr_heyak_s3 (`_speed` 1, from the lane's start `sx` / `sy` to the event's point;
    // gone at a hit, `_effectsWhenHit` on the unit hit, or `_effectsWhenReached` at the end of the flight); the 浮空 of her skills
    // (heyak_s_1[levitate], heyak_s[levitate]: their ON_BUFF_START heyak_cyclone_01_emit)
    heyak: cite(['projectile_chr_heyak_s3', 'heyak_s_1[levitate]', 'heyak_s[levitate]'], (o) => (o.k === 'heyak:wind'
      ? { play: [{ n: 'heyak_skill_03_trail_01', fly: 1, start: [o.sx, o.sy], tag: `heyakWind${o.n % 12}` }] }
      : o.k === 'heyak:windHit' ? { stop: [`heyakWind${o.n % 12}`], play: [once('heyak_skill_03_hit_01', 'id')] }
        : o.k === 'heyak:windEnd' ? { stop: [`heyakWind${o.n % 12}`], play: [once('heyak_skill_03_trail_01_end', 'point')] }
          : o.k === 'heyak:lift' ? { play: [once('heyak_cyclone_01_emit', 'id')] } : null)),
    gnosis: cite('char_206_gnosis/Others/Direction/Talents/2', () => ({ play: [{ n: 'gnosis_beidong_buff', on: 'op', life: 'deployed' }] })),
    // (2026-11-03) 遥 T1 浮光泡影: a bubble breaking (haruka_t_1_delay ON_BUFF_TRIGGER) creates haruka_talent_02_hit on its holder
    // with the T2 heal only (FilterByBlackboardValue heal_scale > 0 — the sim's `heal`); its S1's next bubble is the 'shield'
    haruka: cite('haruka_t_1_delay', (o) => (o.k === 'haruka:break' ? { play: Number(o.heal) ? [once('haruka_talent_02_hit', 'id')] : [] } : null)),
    // (2026-11-03) 白铁 T2 节约经费: a device of his recovered (ironmn_t_2 ON_OWNER_FINISH, a won Dice: RechargeToken) creates
    // ironmn_beidong_buff on him (BUFF_SOURCE)
    // (2026-11-07) and his crab device's cast: sktok_ironmn_pile3 `_castEffects` (`_directionType` 3: _up / _down / the plain one by its facing) on the device, its shot's `_mainEffect` to the target
    ironmn: cite(['ironmn_t_2', 'sktok_ironmn_pile3'], (o) => (o.k === 'ironmn_t_2' ? { play: [once('ironmn_beidong_buff')] }
      : o.k === 'ironmn:crab' ? { play: [{ n: CRAB_START[o.dir] ?? 'token_ironmn_pile3_skill_03_start', bundle: 'ironmn_token', on: 'from', life: 'once' },
        { n: 'token_ironmn_pile3_skill_03_trail', bundle: 'ironmn_token', fly: CRAB_SPEED, to: 'tgt', from: 'from', fromDead: true }] } : null)),
    // 黍 S3 the mark an enemy holds on a sown tile until the skill ends (shu_s_3[enemy][mark], INFINITY)
    shu: cite('shu_s_3[enemy][mark]', (o) => (o.k === 'shu:mark' ? { play: [{ n: 'shu_talent_buff_03', on: 'tgt', life: 'skill' }] } : null)),
    // 老鲤 S3 lmlee_s_3[knockback] past its Dice: on the enemy struck
    lmlee: cite('lmlee_s_3[knockback]', (o) => (o.k === 'lmlee:s3push' ? { play: [once('lmlee_skill_03_range_hit', 'tgt')] } : null)),
    // 黑键 T2 倚音 on the target: alone, ebnhlz_beidong_hit; with others round it (the module's AOEDamage), ebnhlz_mozu_hit
    ebnhlz: cite(['ebnhlz_t_2', 'ebnhlz_e_003_t_2'], (o) => (o.k === 'ebnhlz:yiyin' ? { play: [once('ebnhlz_beidong_hit', 'tgt')] }
      : o.k === 'ebnhlz:yiyinAoe' ? { play: [once('ebnhlz_mozu_hit', 'tgt')] } : null)),
    // (2026-11-03) 缇缇 T1 凝固的时光: each tick on a sleeping enemy (titi_t_1[enemy_sleeping] ON_BUFF_TRIGGER, CheckAbnormalCombo
    // SLEEPING) creates titi_attack_hit_01 on it with the damage (`ids`); her S3's spread from a sleeper knocked out
    // (titi_s_3[effect_line] on each enemy it puts to sleep: CreateLineEffect titi_skill_03_line_01 from that enemy, BUFF_SOURCE)
    titi: cite(['titi_t_1[enemy_sleeping]', 'titi_s_3[effect_line]'], (o) => (o.k === 'titi:t1' ? { play: [once('titi_attack_hit_01', 'ids')] }
      : o.k === 'titi:spread' ? { play: [{ n: 'titi_skill_03_line_01', line: ['from', 'to'], life: 'once' }] } : null)),
    // (2026-11-03) 斥罪 T1 律法卫士: judge_t_1[effect] on each change of her barrier — its start judge_shield_start_01 / break
    // judge_shield_break_01 by the stack count the kit keeps (`on` 1 / 0, kits/ops/op-judge.js barrierFx: the conditions
    // are the sim's). Her barrier's loop is judge_t_1's judge_shield_all_01 (the talent's buff; fxgame.js judgeShield takes the event's `level`)
    judge: cite('judge_t_1[effect]', (o) => (o.k === 'judge:barrier' ? { play: [once(Number(o.on) ? 'judge_shield_start_01' : 'judge_shield_break_01')] } : null)),
    // (2026-11-03) 逻各斯: S2 提喻's lock — logos_s_2[lock] on the target, its ON_BUFF_ENABLE line logos_skill2_line_01 from him
    // (BUFF_SOURCE) until the lock ends (`on` 0); T1 语汇演化's shot projectile_chr_logos_t (PARACURVE `_speed` 8,
    // `_raiseHeight` 0.3: its `_effectsWhenStart` logos_talent_start_01, its flight — its hit lands with the sim's
    // 'logosLexicon'); S1 殁亡's follow-up projectile_chr_logos_s1_2 (`_speed` 3, `_raiseHeight` 0.5) from the enemy it
    // executed (`from`) to `target`, its `_effectsWhenHit` as it lands
    logos: cite(['logos_s_2[lock]', 'projectile_chr_logos_t', 'projectile_chr_logos_s1_2'], (o) => (o.k === 'logos:lock'
      ? { stop: ['logosLock'], play: Number(o.on) ? [{ n: 'logos_skill2_line_01', line: ['src', 'id'], tag: 'logosLock' }] : [] }
      : o.k === 'logos:t1shot' ? { play: [once('logos_talent_start_01'), { n: 'logos_talent_trail_01', fly: 8, to: 'target', arc: 0.3 }] }
        : o.k === 'logos:s1shot' ? { play: [{ n: 'logos_skill1_trail_02', fly: 3, to: 'target', from: 'from', fromDead: true, arc: 0.5, hit: ['logos_skill1_hit_02'] }] } : null)),
  },
  // (2026-11-03) 斥罪 T2 荆棘环身: judge_t_2 ON_TAKE_DAMAGE — InverseDamage, then judge_reboun_hit_01 on the MODIFIER_SOURCE (`target`)
  thorns: { judge: cite('judge_t_2', () => ({ play: [once('judge_reboun_hit_01', 'target')] })) },
  // (2026-11-03) 斥罪 S2 坚心苦修: each pulse (judge_s_2[aoe] ON_BUFF_TRIGGER: AOEDamage, then CreateEffect
  // judge_skill_02_weapon_hit_01 on her — enemies hit or not)
  // 折桠 S2's FirstAttack (held by branch_s_2[first], no damage, no target needed: the skill's opening 战栗 blast, the sim's 'aoe')
  aoe: {
    // (2026-11-10) 레이지 아이언하이드 T1 荒蛮之心: knocked out, acrbot[t2] fires projectile_chr_acrbot_t2 on its tile — its
    // `_effectsWhenStart` char_acrbot_ability_02_die_01 there (the CN char pack, battle/prefabs/effects/char.ab)
    acrbot: cite('projectile_chr_acrbot_t2', (o) => (o.skill === 'acrbot_t2' ? { play: [{ ...once('char_acrbot_ability_02_die_01', 'point'), bundle: 'acrbot' }] } : null)),
    // (2026-11-10) 메커니스트 S3: the charge's landing (projectile_chr_mcnist_s3_token* `_effectsWhenReached`, on the stop tile) and
    // each attack's cross (projectile_chr_mcnist_s3 `_effectsToTileWhenStart`, on its target's tile as it is thrown, 0.8 s before it lands)
    mcnist: cite(['projectile_chr_mcnist_s3_token', 'projectile_chr_mcnist_s3'], (o) => (o.skill === 'mcnist:charge'
      ? { play: [{ ...once('token_mcnist_mcgraf_skill_03_hit_01', 'point'), bundle: 'mcnist_token' }] }
      : o.skill === 'mcnist:cross' ? { play: [once('mcnist_skill_03_hit_01', 'point')] } : null)),
    // (2026-11-10) 테리토리야 S3's spread (dminon_s_3[spread] CreateTileEffectInRange x-5) and T2 此身为界 landing (its projectile
    // projectile_chr_dminon_dead / _withdraw `_tileEffectKeyOnStop` on each tile of its `_targetRange`, the 国度 it cached):
    // dminon_talent_range_hit_01 on each tile (`cells`)
    dminon: cite(['dminon_s_3[spread]', 'projectile_chr_dminon_dead', 'projectile_chr_dminon_withdraw'], (o) => (o.skill === 'dminon:spread' || o.skill === 'dminon:boundary'
      ? { play: (Array.isArray(o.cells) ? o.cells : []).map(([x, y]) => ({ n: 'dminon_talent_range_hit_01', on: 'point', at: [x, y], life: 'once' })) } : null)),
    // (2026-11-07) 스테인리스's crab device: projectile_chr_ironmn_pile3 `_effectsWhenHit` where it lands (its splash centre), whether the target lives or not
    ironmn: cite('sktok_ironmn_pile3', (o) => (o.skill === 'ironmn:crab' ? { play: [{ n: 'token_ironmn_pile3_skill_03_hit', bundle: 'ironmn_token', on: 'point', life: 'once' }] } : null)),
    // (2026-11-07) 미틈 S1: mitm_s_1 ON_BUFF_START on the 체리 3호 in mode Default, where it explodes
    mitm: cite('mitm_s_1', (o) => (o.skill === 'mitm:s1' ? { play: [once('mitm_skill_01_hit_01', 'point')] } : null)),
    // (2026-11-06) 리프레사 S2: each of her delayed shots projectile_chr_liesel_s2_1 / _2 / _3 `_effectsWhenReached` where it lands
    liesel: cite(['projectile_chr_liesel_s2_1', 'projectile_chr_liesel_s2_2', 'projectile_chr_liesel_s2_3'], () => ({ play: [once('liesel_skill_02_hit_01', 'point')] })),
    // (2026-11-07) … and its `_hitEffectKey` judge_skill_02_hit_01 on each enemy it hits (`targets`)
    judge: cite('judge_s_2[aoe]', (o) => (o.skill === 'judge:atonement' ? { play: [once('judge_skill_02_weapon_hit_01'), { n: 'judge_skill_02_hit_01', on: 'targets', life: 'once' }] } : null)),
    // (2026-11-07) 怒潮凛冬's 高台 taking effect (Headb2AttackHighlandAOE._PropagateEffect): `_tileEffectKey` headb2_highground on the
    // tile, `_hitEffectKey` headb2_highground_hit on each enemy it damages (_DealDamageAndEffect)
    headb2: cite(['char_1051_headb2/Modes/Default/Body/Attack', 'skchr_headb2_3'], (o) => (o.skill === 'headb2:highland' ? { play: [once('headb2_highground', 'point'), { n: 'headb2_highground_hit', on: 'targets', life: 'once' }] } : null)),
    // (2026-11-07) 黑键's 残影 闪回: sktok_ebnhlz_token `_castEffects` on the token, _start_01 as it casts (ON_CAST_START), _hit and
    // _range at its strike (ON_SPELL_ON, `_preDelay` 0.93: the sim's `t`)
    ebnhlz: cite('sktok_ebnhlz_token', (o) => (o.skill === 'ebnhlz:flashback' ? { play: [
      { n: 'token_ebnhlz_skill_02_start_01', bundle: 'ebnhlz_token', on: 'id', life: 'once' },
      { n: 'token_ebnhlz_skill_02_hit', bundle: 'ebnhlz_token', on: 'id', life: 'once', after: Number(o.t) || 0 },
      { n: 'token_ebnhlz_skill_02_range', bundle: 'ebnhlz_token', on: 'id', life: 'once', after: Number(o.t) || 0 },
    ] } : null)),
    // 折桠 S2: her first attack's strike triggers SpAttack, whose `_hitEffects` land on each enemy it makes 战栗 (the swing itself:
    // the FirstAttack row of modes.json talentAtk)
    branch: cite('skchr_branch_2/SpAttack', (o) => (o.skill === 'resolve' ? { play: [{ n: 'branch_skill_02_hit_01', on: 'targets', life: 'once' }] } : null)),
  },
  // (2026-11-03) 逻各斯 S1 殁亡: logos_s_1 on the enemy it executes — CreateEffect logos_skill1_hit_03 there (the HP check is the
  // sim's); T1's shot landing: projectile_chr_logos_t `_effectsWhenHit` logos_talent_hit_01; S3 延异视阈's clearing end: the
  // S3_End mode's cast logos_skill3_range_end_01 (logos_s_3 ON_BUFF_FINISH CheckCanUseAtkOrCbt → SwitchMode; the kit sends
  // it on every such end, shots cleared or not)
  logosExecute: { logos: cite('logos_s_1', () => ({ play: [once('logos_skill1_hit_03', 'target')] })) },
  logosLexicon: { logos: cite('projectile_chr_logos_t', () => ({ play: [once('logos_talent_hit_01', 'target')] })) },
  bulletClear: { logos: cite('char_4133_logos/Modes/S3_End/Body/Attack', () => ({ play: [once('logos_skill3_range_end_01')] })) },
  // (2026-11-03) 维伊: the stored energies and 转置能量 leaving with an attack — her ChargeableGroup's ChargeAttackDefault /
  // ChargeAttackS2 fire projectile_chr_veen / _merged (under S2 projectile_chr_veen_s2 / _s2_merged: the same effects; TRACE,
  // `_speed` 10 all): `_mainEffect` veen_trail_01 / veen_trail_02 to the attack's `target`, `_effectsWhenHit`
  // veen_attack_rank_01_hit_02 / veen_attack_rank_02_hit_02. (2026-11-06) MergeableChargeRangeAttack.CreateProjectile: the
  // i-th projectile leaves from `_mountPointForProjectiles`[i], the merged ones first. Under S3 no energy flies:
  // ChargeAttackS3's `_onlyAssignChargeCntToBaseAbility` hands the count to her attack (its bounces) and fires nothing
  veenVolley: {
    veen: cite(['projectile_chr_veen', 'projectile_chr_veen_merged', 'projectile_chr_veen_s2', 'projectile_chr_veen_s2_merged'], (o) => {
      if (Number(o.s3)) return null;
      const merged = Math.max(0, Number(o.merged) || 0), total = merged + Math.max(0, Number(o.stored) || 0);
      return {
        play: VEEN_MOUNTS.slice(0, total).map((mount, i) => (i < merged
          ? { n: 'veen_trail_02', fly: 10, to: 'target', mount, hit: ['veen_attack_rank_02_hit_02'] }
          : { n: 'veen_trail_01', fly: 10, to: 'target', mount, hit: ['veen_attack_rank_01_hit_02'] })),
      };
    }),
  },
  // (2026-11-16) 黑键: the energies leaving with an attack — the mode's ExChargeAttack ability (CreateProjectile): the trait's
  // n first, the i-th from `_mountPointForProjectiles`[i] (SPECIAL_0–3) with its `_projectileKey`, then, only at an elite or
  // leader target (`ValidateTarget`), the elite e, the i-th from `_exMounts`[i] with its `_exProjectileKey`: Default
  // projectile_chr_ebnhlz_charge / _elite (SPECIAL_4), S1 _s1_charge / _s1_elite, S3 _s3_elite_charge (SPECIAL_0–4); TRACE,
  // `_speed` 10 all, their `_mainEffect` and `_effectsWhenHit`. The sim sends `e` only when they leave.
  ebnhlzVolley: {
    ebnhlz: cite(['projectile_chr_ebnhlz_charge', 'projectile_chr_ebnhlz_elite', 'projectile_chr_ebnhlz_s1_charge', 'projectile_chr_ebnhlz_s1_elite',
      'projectile_chr_ebnhlz_s3_elite_charge'], (o) => {
      const shot = (trail, hit) => (mount) => ({ n: trail, fly: 10, to: 'target', mount, hit: [hit] });
      const n = Math.max(0, Number(o.n) || 0), e = Math.max(0, Number(o.e) || 0);
      const [norm, ex, exMounts] = Number(o.s3) ? [null, shot('ebnhlz_skill_03_trail_red', 'ebnhlz_skill_03_hit_red'), [5, 6, 8, 9, 10]]
        : Number(o.s1) ? [shot('ebnhlz_skill_01_trail_orange', 'ebnhlz_skill_01_hit_orange'), shot('ebnhlz_skill_01_trail_red', 'ebnhlz_skill_01_hit_red'), [10]]
          : [shot('ebnhlz_attack_trail_orange', 'ebnhlz_attack_hit_orange'), shot('ebnhlz_attack_trail_red', 'ebnhlz_attack_hit_red'), [10]];
      // (CreateProjectile fires no ex shot when the count passes its mounts)
      const play = [...(norm ? EBNHLZ_MOUNTS.slice(0, n).map(norm) : []), ...(e <= exMounts.length ? exMounts.slice(0, e).map(ex) : [])];
      return play.length ? { play } : null;
    }),
  },
  // (2026-11-03) 维伊 S3 用赤铁铭记: each bounce of projectile_chr_veen_s3 — after its first hit its
  // `_overwritedMainEffectAfterFirstHit` veen_skill_03_trail_02 flies on from the enemy it leaves (`from`) to the next
  // (`target`), `_repalceEffectsWhenHit` veen_skill_03_hit_02 as it lands (the sim deals the bounce as it leaves)
  veenBounce: { veen: cite('projectile_chr_veen_s3', () => ({ play: [{ n: 'veen_skill_03_trail_02', fly: 10, to: 'target', from: 'from', fromDead: true, hit: ['veen_skill_03_hit_02'] }] })) },
  // (2026-11-03) 赫拉格 SBL-Y 热的雪: the revive (helage_trait_e → helage_trait_e[heal], ON_BUFF_FINISH: HealViaMaxHpRatio and
  // CreateEffect uniequip_002_musha_02 on him) — a prefab of the shared module effects (bundle `uniequip`)
  undying: {
    helage: cite('helage_trait_e[heal]', () => ({ play: [{ n: 'uniequip_002_musha_02', bundle: 'uniequip', on: 'op', life: 'once' }] })),
    // (2026-11-10) 사일런스 더 패러디그매틱 S3: slent2_s_3 ON_BEFORE_TRY_SET_HP_ZERO creates slent2_shallow_grave (UNDEADABLE,
    // overrideEffectKey slent2_skill_03_buff_02, grave_duration s) on the ally it saves (`id`, `duration`)
    slent2: cite('slent2_shallow_grave', (o) => ({ play: [{ n: 'slent2_skill_03_buff_02', on: 'id', life: Math.max(0.1, Number(o.duration) || 0) }] })),
  },
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
  // (2026-10-24, 묶음 S11) 余 S2 厚礼上宾: yu_s_2[try_tp] puts each reachable ground enemy on his tile (ForceSetToTilePosition)
  // and creates yu_skill2_teleport_02 on it
  // (2026-11-03) 贝洛内 S3 清算: each 【移动】 (FlyToTarget / FlyToTargetSecond) and the 【返回】 (RespawnEnd, in place too) carry
  // demetr_s3[effect_1] — ON_BUFF_START CreateEffect demetr_skill3_restart_begin_01 on him (`_constDirection` UP).
  // Mon3tr S3 策略：熔毁: the 【移动】 onto her 重构体's tile — the S3_Reborn mode's monstr_s_3[reborned_passive] creates
  // monstr_skill_03_begin_02 on her; the 路标形态 marker on the tile she left (a 重构体 switched to its mode 2: prosts_s_3[mode]
  // holds prost_s_3[[effect] monstr_skill_03_begin_03, its model hidden by common_spine_hide) until the skill ends; the 【返回】
  // (`back`): that mode ends where she lands — ON_BUFF_FINISH CreateEffect monstr_skill_03_end_02. (2026-11-04) the 重构体 she
  // lands on is withdrawn with token_monstr_prosts[eff] token_monstr_prosts_skill_03_start (monstr_s_3_buff[self] ON_BUFF_START)
  teleport: {
    yu: cite('yu_s_2[try_tp]', () => ({ play: [once('yu_skill2_teleport_02', 'id')] })),
    // 黍 S3: a marked enemy put back (shu_s_3[enemy][mark] ON_BUFF_TRIGGER): one effect where it stood, one where it lands
    shu: cite('shu_s_3[enemy][mark]', () => ({ play: [once('shu_teleport_hit', 'id'), once('shu_teleport_hit_02', 'point')] })),
    demetr: cite('demetr_s3[effect_1]', () => ({ play: [once('demetr_skill3_restart_begin_01')] })),
    monstr: cite(['monstr_s_3[reborned_passive]', 'prost_s_3[[effect]', 'prosts_s_3[mode]', 'token_monstr_prosts[eff]'], (o) => (Number(o.back)
      ? { play: [once('monstr_skill_03_end_02', 'point')] }
      : { play: [{ ...once('token_monstr_prosts_skill_03_start', 'point'), bundle: 'monstr_token' }, once('monstr_skill_03_begin_02'),
        { n: 'monstr_skill_03_begin_03', on: 'point', at: [Number(o.fromX), Number(o.fromY)], life: 'skill' }] })),
  },
  // (2026-11-10) 테리토리야's 国度 (Others/Direction/CommonAbilities/Kingdom): TileEffectFollowRangeBehaviour's `_tileEffectKey`
  // dminon_talent_range_01 on each tile of his range — one slot a tile, so a tile that stays keeps its effect; a tile the range
  // leaves ends at once (`_recycleImmediatelyExceptDying`: `now`) — and RangeLineEffectEmitter's `_edgeLineRendererEffectKey`
  // dminon_range_line_01, one effect per loop of the range's outline (`edge`: fxgame.js edgeLines, render/fx/edges.js). Both
  // until he leaves (sim kit op-dminon.js showField: `cells` the range's tiles, `gone` the ones it left)
  field: {
    dminon: cite('char_4246_dminon/Others/Direction/CommonAbilities/Kingdom', (o) => ({ play: [
      ...(Array.isArray(o.gone) ? o.gone : []).map(([x, y]) => ({ slot: `dminonField${x},${y}`, off: true, now: true })),
      ...(Array.isArray(o.cells) ? o.cells : []).map(([x, y]) => ({ n: 'dminon_talent_range_01', on: 'point', at: [x, y], slot: `dminonField${x},${y}` })),
      { n: 'dminon_range_line_01', edge: 'cells', slot: 'dminonEdge' },
    ] })),
  },
  // 引星棘刺 T2 视界: Talent/2 tiles_ally (CharacterSharedTileAuraAbility `_showEffectWhenAttach`, `_tileEffectKey` thorn2_buff)
  // on each tile her card chose, until she leaves — `cells` [[x, y]…] (sim kit chess_char_5_15-thorn2.js). The client lays them
  // `_effectInterval` 0.06 s apart; here all at once
  roadTiles: {
    thorn2: cite('char_1039_thorn2/Others/Talent/2/tiles_ally', (o) => ({ play: (Array.isArray(o.cells) ? o.cells : [])
      .map(([x, y]) => ({ n: 'thorn2_buff', on: 'point', at: [x, y], slot: `road${x},${y}` })) })),
  },
  // (2026-11-01) 冻河: a 触发型效果 put on an ally (`s` the skill 1–3) — the ON_BUFF_START CreateEffect of tocka_s1[trigger]
  // (tocka_skill_01_buff_02_start_01), tocka_s2[trigger] (_02_buff_02_start_01), tocka_s3[trigger] (_03_buff_start_02,
  // `_constDirection` UP); S2's arriving by its projectile_chr_tocka_s2 (`shot`) also plays its `_effectsWhenHit`
  // tocka_skill_02_hit_01. The effects the trigger buffs hold (tocka_skill_01_buff_02 / _02_buff_02) are paused while no
  // operator menu is open (PauseEffectIfCharMenuNotOpen) — never in a battle of this mode: not drawn
  tockaFx: {
    tocka: cite(['tocka_s1[trigger]', 'tocka_s2[trigger]', 'tocka_s3[trigger]', 'projectile_chr_tocka_s2'], (o) => {
      const k = Number(o.s);
      const start = k === 1 ? 'tocka_skill_01_buff_02_start_01' : k === 2 ? 'tocka_skill_02_buff_02_start_01' : k === 3 ? 'tocka_skill_03_buff_start_02' : null;
      return start ? { play: [once(start, 'id'), ...(k === 2 && o.shot ? [once('tocka_skill_02_hit_01', 'id')] : [])] } : null;
    }),
  },
  // … and her S3 effect moving on (`from` the ally it leaves, `id` the next holder): tocka_s3[trigger]'s EmitProjectile
  // projectile_tocka_s3_effect (`_mainEffect` tocka_skill_03_buff_trail_01, AdvancedMovement 6 tiles / s) to the new
  // holder [추정·엔진: from the ally it leaves — the node's SOURCE in a forced ON_BUFF_TRIGGER read as the buff's owner]
  tockaMove: { tocka: cite('projectile_tocka_s3_effect', () => ({ play: [{ n: 'tocka_skill_03_buff_trail_01', fly: 6, to: 'id', from: 'from' }] })) },
  // (2026-11-01) 塔露拉 T2's footprint (a tile her oxi_fire_field_lease holds, `dur` s from its latest lease — the sim sends a
  // re-lease again): the TimedTileLeaseAbility's `_effectKey` oxi_buff_01 on the tile, one per tile
  zone: {
    oxi: cite('char_4247_oxi/Others/Direction/CommonAbilities/oxi_fire_field_lease', (o) => ({ play: [{ n: 'oxi_buff_01', on: 'point',
      life: Math.max(0.1, Number(o.dur) || 4), slot: `oxiTile:${o.tile}` }] })),
  },
  pull: {
    glady: cite('projectile_chr_glady_s3_3', () => ({ play: [
      { n: 'glady_skill_03_line', harpoon: { out: 0.3, back: 1, moving: 'glady_skill_03_range_04' } },
      { n: 'glady_skill_03_range_05', on: 'point', life: 'once', after: 'fly' },
    ] })),
  },
};

/** 焰影苇草 S2's fireball orbit: one phase on the carrier (fxgame.js orbiter), so its strike effects ride the fireball drawn. */
const REED2_ORBIT = Object.freeze({ r: 1, spd: 150, phase: 0 });

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

// events whose `src` is no operator of the moment: 缪尔赛思's 'copy' (`src` the operator her 流形 copies, `by` her) and her
// 流形's 'split' / 'refresh' / 'pulse' (`src` / `id` the 流形, `by` her; 2026-11-07) —
// and 焰影苇草 S2's 'strike' (`src` the ally that carries her fireball, `by` her; the other kits' strikes have no `by`)
const OPERATOR_FIELD = { copy: 'by', strike: 'by', split: 'by', refresh: 'by', pulse: 'by' };
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
  if (!o || typeof o !== 'object') return null;
  const rule = bundle ? KIT_OFFICIAL[name]?.[bundle] : null;
  const r = typeof rule === 'function' ? rule(o, { skill: Number.isInteger(ctx.skill) ? ctx.skill : 0, back: !!ctx.back, foe: !!ctx.foe, left: !!ctx.left }) : null;
  if (!r) return name === 'hit' ? momentPlan(o, bundle, ctx.plays) : null;
  const play = (r?.play || []).flatMap((p) => (p.tpl ? tplPlays(p, ctx.plays) : [p]));
  return r ? { stop: r.stop || [], play, pass: !!r.pass, ...(r.skillFlag ? { skillFlag: r.skillFlag } : {}) } : null;
}

/**
 * 2026-11-05: a 'hit' moment with no rule: the one prefab the binding rows say its key plays on the unit hit, when that key belongs
 * to the operator's bundle (tools/build-fx-plays.mjs `moment`, `b`). A rule above comes first; a key the rows leave open has one.
 */
function momentPlan(o, bundle, plays) {
  const k = plays?.keys?.[o.k];
  return k?.moment && k.b === bundle ? { stop: [], play: [once(k.moment, 'id')], pass: false } : null;
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

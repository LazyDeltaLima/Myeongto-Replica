// public/js/render/fx/kitofficial.js — kit 'fx' events drawn with the prefabs the client creates at that moment
// (2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). For an operator whose official effects play, fxgame.js
// standInOff drops the procedural stand-in of a kit event; most of those moments are a skill's start or an attack, which
// the 'skill' / 'atk' / 'dmg' bindings draw. The ones below are talent / buff moments the client draws from its buff
// templates (config/buff_template_holder.ab: a CreateBuff's `overrideEffectKey`, a CreateEffect node) or a projectile's
// `_effectsWhenReached`; without them the moment drew nothing. Pure: fxgame.js executes the plan (kitOfficialFx).

/**
 * One play: `n` the prefab (of the operator's bundle, or of `bundle`), on `on` ('op' the event's operator, 'point' the event's
 * x / y on the ground, else the event's field naming a unit: 'id', 'tgt' …) — circling it with `orbit` { r, spd } —, for `life`:
 *   'once'     its own duration
 *   number     seconds
 *   'skill'    until the operator's skill ends (a buff entry: fxgame stopBuffs) or it leaves
 *   'deployed' until the operator leaves the field
 *   'unit'     until the `on` unit's 'die'
 *   'tag'      until a later event's `stop` names `tag` (with `leave`: also when the operator leaves)
 * or a line `line: [from, to]` (the event's fields naming two units; `to` may name a list) while both stand, or for the
 * line prefab's own duration with `life: 'once'`; or a flight `fly` (tiles / s) from the operator to the event's point —
 * a play with `after: 'fly'` starts when it lands. A 'point' play may name its own ground point `at: [x, y]`.
 * A `slot` play holds one effect per operator and slot until the operator leaves: a later play of the same prefab in that
 * slot keeps it running, another prefab replaces it, `{ slot, off: true }` ends it (AttachListenerToTileAbility
 * `_HoldCastedEffectOnTile` with `_dontCreateNewEffectWhenCastedTimesSame`); on a 'point' (or `at`) or on / circling a
 * unit as any play, with `ready` a prefab played there once when the slot was empty.
 */
const once = (n, on = 'op') => ({ n, on, life: 'once' });

/**
 * event → operator bundle → (o, ctx) → { stop?: tag[], play: plays[], pass?: the event keeps its stand-in } | null.
 * ctx: { skill: the operator's skill index 0–2, back: it faces UP (deployed facing the back), foe: the event's `id` unit is
 * an enemy }.
 */
export const KIT_OFFICIAL = {
  // 号角 T2 血战 (horn_t_1[muso] → buff horn_t_1[reborn_effect], effect horn_buff_01_start_front INFINITY; its start creates
  // [effect_01] / [effect_02] convert_start / _02 for 4 s and [effect_03] convert_start_03 INFINITY)
  bloodBattle: {
    horn: () => ({ play: [
      { n: 'horn_buff_01_convert_start', on: 'op', life: 4 }, { n: 'horn_buff_01_convert_start_02', on: 'op', life: 4 },
      { n: 'horn_buff_01_convert_start_03', on: 'op', life: 'deployed' }, { n: 'horn_buff_01_start_front', on: 'op', life: 'deployed' },
    ] }),
  },
  // 号角 S2 / S3 过载 (horn_s_2 / horn_s_3[overload_switch_effect]: INFINITY derived buffs of the skill — _back when her
  // default direction is UP, else _front — CheckCharacterDefaultDirection)
  overload: {
    horn: (o, c) => {
      const base = c.skill === 1 ? 'horn_skill_02_buff_03' : c.skill === 2 ? 'horn_skill_03_buff_02_03' : null;
      return base ? { play: [{ n: `${base}_${c.back ? 'back' : 'front'}`, on: 'op', life: 'skill' }] } : null;
    },
    // 洛洛 S2 过载: her drones' S2Funnel `_overloadIdleEffect` rockr_token_overload_01 for the rest of the skill, and their
    // hits take the projectile's `_overloadGroups` (`skillFlag` 'overDrones': fxgame.js droneShot, cleared at the skill's end)
    rockr: () => ({ play: [{ n: 'rockr_token_overload_01', on: 'op', life: 'skill' }], skillFlag: 'overDrones' }),
  },
  // 泥岩 T1 沃土予身: the last layer broken (mudrok_t_1[shield_c] BlockDamage → CreateEffect mudrok_buff_01_end) …
  shieldBreak: {
    mudrok: (o) => (Number(o.left) === 0 ? { play: [once('mudrok_buff_01_end')] } : { play: [] }),
  },
  // … and a layer gained (mudrok_t_1[init] at deploy / [recharge]: CreateEffect mudrok_buff_01_begin, then the layer's buff —
  // its loop is fxstatus.js LAYER_FX, from the same event's `n`). 卡涅利安's mark stacks: fxstatus.js STACK_FX only.
  stacks: { mudrok: () => ({ play: [once('mudrok_buff_01_begin')] }) },
  // 伊内丝 T2 影哨: projectile_chr_ines_guard `_effectsWhenReached` label_start_01 + label_01 + range_01 where it lands;
  // they last while the sentry stands (a new one replaces it, S3's recall — her 'beam' — ends it)
  sentry: {
    ines: () => ({ stop: ['inesSentry'], play: [
      { n: 'ines_label_start_01', on: 'point', life: 'once' },
      { n: 'ines_label_01', on: 'point', life: 'tag', tag: 'inesSentry' },
      { n: 'ines_range_01', on: 'point', life: 'tag', tag: 'inesSentry' },
    ] }),
  },
  beam: { ines: () => ({ stop: ['inesSentry'], play: [], pass: true }) },
  // 烛煌 T2 绝处重燃: downed (blaze2_t_2 → buff [reborn_state], effect blaze2_revive_buff, and its [vfx1]
  // blaze2_revive_buff_03 — [추정: kept until she stands, the sim has no shield-break event]) …
  downed: {
    // (its 'down' stand-in is no skill stand-in: it stays — `pass`)
    blaze2: () => ({ stop: ['blazeDown'], pass: true, play: [
      { n: 'blaze2_revive_buff', on: 'op', life: 'tag', tag: 'blazeDown', leave: true },
      { n: 'blaze2_revive_buff_03', on: 'op', life: 'tag', tag: 'blazeDown', leave: true },
    ] }),
  },
  // … and back up: blaze2[to_default_state]'s cast blaze2_revive_end_start
  revive: { blaze2: () => ({ stop: ['blazeDown'], play: [once('blaze2_revive_end_start')] }) },
  // 圣聆初雪 T2: the lethal hit escaped (sbell2_t2[heal] → CreateEffect sbell2_revive on her)
  blessing: { sbell2: () => ({ play: [once('sbell2_revive')] }) },
  // 圣聆初雪 T1 无垠的雪景: each tile's snow (charpack Talents/1/SnowAccumulation, an AttachListenerToTileAbility: one effect
  // per tile, the `_effectSettings` entry whose castedTimeThreshold equals its layers — kept while the prefab stays the
  // same, replaced when it changes, ended at 0 layers and when she leaves: OnDetached → _ClearEffects). `cells` [[x, y,
  // layers]…] are the tiles that changed (sim kit chess_char_6_02-sbell2.js); svrash's 'snow' is its S2's.
  snow: {
    sbell2: (o) => ({ play: (Array.isArray(o.cells) ? o.cells : []).map(([x, y, L]) => {
      const slot = `snow${x},${y}`, n = SNOW_GROUND[Math.min(Number(L) || 0, SNOW_GROUND.length - 1)];
      return n ? { n, on: 'point', at: [x, y], slot } : { slot, off: true };
    }) }),
  },
  // 阿罗玛 S2: a levitated enemy lands (aroma_s_2 → CreateEffect aroma_skill_02_hit_02 on it)
  splash: { aroma: () => ({ play: [once('aroma_skill_02_hit_02', 'id')] }) },
  // 寒芒克洛丝 S2: warmed up (kroos2_s_2[warming_counter] at its stacks → [warmed_effect_01–03] INFINITY until the skill's
  // [warmed_finish])
  quadShot: {
    kroos2: () => ({ play: ['kroos2_skill_02_buff_01', 'kroos2_skill_02_buff_02', 'kroos2_skill_02_buff_03'].map((n) => ({ n, on: 'op', life: 'skill' })) }),
  },
  // 妮芙 T1: an enemy in 凋亡 burst (nymph_t_1[listener] → buff [ep_damage], effect nymph_talent_buff_01, until its burst ends: `t`)
  soul: { nymph: (o) => ({ play: [{ n: 'nymph_talent_buff_01', on: 'id', life: Math.max(0.1, Number(o.t) || 0) }] }) },
  // 隐德来希 S3: a summoned 心烛 (etlchi_s3[to_enemy] SummonEnemiesOnAttackRange: buff entlec_effect, effect
  // etlchi_skill_03_ghosting_01 on it, whose CreateLineEffect etlchi_skill_03_line_01 joins it to the enemy it copies, `of`
  // [추정: drawn from that enemy to the candle]) — both while it stands
  candle: {
    etlchi: () => ({ play: [
      { n: 'etlchi_skill_03_ghosting_01', on: 'id', life: 'unit' },
      { n: 'etlchi_skill_03_line_01', line: ['of', 'id'] },
    ] }),
  },
  // 魔王 T1 微尘 (projectile_chr_cetsyr_talent*, orbiting her): one touching an operator — its `_effectsWhenHit` cetsyr_hit_01
  // on it; under S2 the motes hit enemies (projectile_chr_cetsyr_talent_s2: cetsyr_skill_02_hit_01; the bind's
  // cetsyr_skill_02_tie is the 'bind' status' — fxstatus.js SOURCE_FX). S1's start (her own `id`) is S1's buff.
  mote: { cetsyr: (o, c) => (o.id === o.src ? { play: [] } : { play: [once(c.foe ? 'cetsyr_skill_02_hit_01' : 'cetsyr_hit_01', 'id')] }) },
  // 魔王 T1 微尘 always on: her motes are projectiles circling her (projectile_chr_cetsyr_talent `_mainEffect` cetsyr_trail_01;
  // S1 the same; S2 _talent_s2 cetsyr_skill_02_trail_01; S3 _talent_s3 cetsyr_skill_03_trail_01), one effect each while it is
  // there; one coming back plays `_coolDownReadyEffectOnProjectilePos` cetsyr_trail_start (S2 cetsyr_skill_02_trail_start)
  // where it is. `n` of `cap` and the orbit (`r` tiles, `spd` °/s: the blackboards' range_radius / dynamic_spd, S2's
  // outside_radius / dynamic_spd — the prefabs' `_projectileAroundRadius` 1 / `_aroundSpeed` 150 (S2 0.01) without them)
  // from the sim [추정: the blackboard values replace the prefab's; evenly spread, the sense of the turn; which mote goes
  // when one is used]
  motes: {
    cetsyr: (o) => {
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
    },
  },
  // 魔王 S3: each HP share (cetsyr_s_3[collect_hp_ratio]'s tick: CreateEffect cetsyr_skill_03_burst_01 on her)
  redistribute: { cetsyr: () => ({ play: [once('cetsyr_skill_03_burst_01')] }) },
  // 卡涅利安: while skill N runs, billro_s_N[eff_cond] (every 0.1 s) keeps derived INFINITY buffs on her — cast with every
  // charge stored (billro_talent_enhance_mark) its [full] + [half] (S3 also [full2] + [half2]), else its [half] (S3 [half] +
  // [half2]); its off-skill branch is 'charges' below. fxgame.js KIT_OWNED keeps the name rules from playing these at the
  // skill's start. S2's own events keep their stand-ins (`pass`).
  shell: { billro: (o) => billro(0, o.charged) },
  // … and outside the skill (`n` the charges stored, -1 while it runs: the branch above): 2 → [full] _buff_02 + [half]
  // _buff_01_02 (S3 _buff_01_02 + _buff_01_01_02), 1 → [half] _buff_01 (S3 _buff_01_01), 0 → none — held until the count
  // changes (FinishDerivedBuff, then the new ones)
  charges: {
    billro: (o, c) => {
      const k = Number(o.n) || 0, s = `0${c.skill + 1}`;
      const [full, half, one] = c.skill === 2
        ? ['billro_skill_03_buff_01_02', 'billro_skill_03_buff_01_01_02', 'billro_skill_03_buff_01_01']
        : [`billro_skill_${s}_buff_02`, `billro_skill_${s}_buff_01_02`, `billro_skill_${s}_buff_01`];
      const a = k >= 2 ? full : k === 1 ? one : null, b = k >= 2 ? half : null;
      return { play: [a ? { n: a, on: 'op', slot: 'chargeA' } : { slot: 'chargeA', off: true }, b ? { n: b, on: 'op', slot: 'chargeB' } : { slot: 'chargeB', off: true }] };
    },
  },
  sandChains: { billro: () => ({ ...billro(1, false), pass: true }) },
  sandChainsCharged: { billro: () => ({ ...billro(1, true), pass: true }) },
  devour: { billro: (o) => ({ ...billro(2, o.charged), pass: true }) },
  // 缇缇 S3: a sleeper wakes (titi_s_3[dmg_ticker]: CreateEffect titi_skill_03_hit_02 on it) and puts the enemies around it to
  // sleep (`to`), each joined to it by titi_s_3[effect_line]'s CreateLineEffect titi_skill_03_line_01
  wake: { titi: () => ({ play: [once('titi_skill_03_hit_02', 'id'), { n: 'titi_skill_03_line_01', line: ['id', 'to'], life: 'once' }] }) },
  // 泥岩 S3: skchr_mudrok_3/SleepAura casts mudrok_skill_03_sleep from its start to its end (`_castEffects` _startEvent 2 →
  // _endEvent 6) and its Aura's `_effects` mudrok_skill_03_range lasts as long; at its end — the wake, 'rockfall' — the
  // oneshot mudrok_skill_03_awake / _02, and the Awake ability's buff mudrok_s_3 carries mudrok_skill_03_buff for the rest
  // of the skill (fxgame.js KIT_OWNED keeps the activation from playing them all at the start). 'stone' keeps its stand-in.
  stone: {
    mudrok: () => ({ stop: ['mudSleep'], pass: true, play: ['mudrok_skill_03_sleep', 'mudrok_skill_03_range']
      .map((n) => ({ n, on: 'op', life: 'tag', tag: 'mudSleep', leave: true })) }),
  },
  rockfall: {
    mudrok: () => ({ stop: ['mudSleep'], play: [
      once('mudrok_skill_03_awake'), once('mudrok_skill_03_awake_02'), { n: 'mudrok_skill_03_buff', on: 'op', life: 'skill' },
    ] }),
  },
  // 新约能天使: S3's strike on her coordinate (`signal` fireToToken: S3FireToToken fires projectile_chr_angel2_s3_start —
  // `_mainEffect` angel2_skill_3_begin_trail_01 at `_speed` 10, its `_effectsWhenReached` angel2_skill_3_begin_range_01 where
  // it lands; its cast angel2_skill_3_begin_start_001 — an empty prefab — on her: char_modes.py keeps that ability's casts out
  // of the S3 mode's attack bindings, which played it with every attack, 2026-10-21); her talent's bomb
  // (CommonAbilities/TalentBomb: projectile_chr_angel2_t1 without a trail, `_hitEffects` angel2_buff_01_trail_01 on the
  // enemy it marks, `tgt`). angel2_skill_3_ground_01: no client reference.
  airstrike: {
    angel2: (o) => (o.signal === 'fireToToken'
      ? { play: [once('angel2_skill_3_begin_start_001'), { n: 'angel2_skill_3_begin_trail_01', fly: 10 }, { n: 'angel2_skill_3_begin_range_01', on: 'point', life: 'once', after: 'fly' }] }
      : { play: [once('angel2_buff_01_trail_01', 'tgt')] }),
  },
  // 缪尔赛思: her 流形 copies an operator (mlyss_wtrman_switch_melee_trigger / _range_trigger: CreateEffect
  // token_10030_mlyss_wtrman_c1_to_c2 / _c1_to_c3 on the token, `id`) — the token's own bundle
  copy: {
    mlyss: (o) => ({ play: [{ n: o.mode === 'Range' ? 'token_10030_mlyss_wtrman_c1_to_c3' : 'token_10030_mlyss_wtrman_c1_to_c2', bundle: 'mlyss_token', on: 'id', life: 'once' }] }),
  },
  // 焰影苇草 S2: each carrier's fireball (projectile_chr_reed2_fire: `_mainEffect` reed2_skill_02_fireball_01 circling it at
  // `_projectileAroundRadius` 1, `_aroundSpeed` 150 °/s) until her skill ends [추정: the sense of the turn; its cooldown look
  // _02 and the effects of each strike are not drawn]
  ember: { reed2: () => ({ play: [{ n: 'reed2_skill_02_fireball_01', on: 'id', life: 'skill', orbit: { r: 1, spd: 150 } }] }) },
  // 隐德来希 T2 重盈: the talent's toggle (charpack Talents/2 `_unmanagedBuffsWhenToggleOn` etlchi_t_2[heal], lifeTime 3 s)
  reborn: { etlchi: () => ({ play: [{ n: 'etlchi_innate_hit_01', on: 'op', life: 3 }] }) },
  // 流明 S1: the shot's heal rain (lumen_s_1[effect] on the target, LIMITED: projectile_life_time `t`; projectile_chr_lumen_s1's
  // `_mainEffect` is the same prefab) [추정: lumen_s_1[heal]'s lumen_skill_01_hit on each healed ally per tick is not drawn]
  healField: { lumen: (o) => ({ play: [{ n: 'lumen_skill_01_range', on: 'tgt', life: Math.max(0.1, Number(o.t) || 0) }] }) },
  // 寒檀 S2: an icicle (projectile_chr_sntlla_s2 `_effectsWhenReached` sntlla_skill_02_start_01 where it lands)
  iceSpike: { sntlla: () => ({ play: [{ n: 'sntlla_skill_02_start_01', on: 'point', life: 'once' }] }) },
  talent: {
    // 蕾缪安 T2: 引渡 ready (lemuen_t_2 → buff lemuen_t_2[buff], effect lemuen_talent_buff_02, INFINITY)
    lemuen: (o) => (o.name === 'extradition' ? { play: [{ n: 'lemuen_talent_buff_02', on: 'op', life: 'deployed' }] } : null),
    // 卡涅利安 T1 生命之餐 (her only 'talent'): the heal at each skill start — charpack Talents/1's abilities Billro_Heal_Self /
    // _Enhance, each with a oneshot `_castEffects` at ON_SPELL_ON: billro_beidong_buff_01, cast with every charge _02 (the
    // pairing by `m_GameObject`: each cast component shares its GameObject with one of the two abilities)
    billro: (o) => ({ play: [once(Number(o.charged) ? 'billro_beidong_buff_02' : 'billro_beidong_buff_01')] }),
    // 风笛 T1 精密填弹 (her only 'talent'): bpipe_t_1's SplashDamage `_createEffect` with its blackboard `effect`
    // bpipe_attack_02_hit on the extra enemy the boosted attack hits (`id`)
    bpipe: () => ({ play: [once('bpipe_attack_02_hit', 'id')] }),
  },
  // 灵知 T2 殊途同归 (his only 'kitHit', 10 s after the deploy): charpack Talents/2's wrapper ability gnosis_t_2_buff casts
  // gnosis_beidong_buff from ON_CAST_START to ON_CAST_END, and the wrapper is `_isInfinity` (ActiveAbilityWrapper._GetLifeTime
  // returns no end): its cast never ends, so the effect, a burst with a looping glow, stays while he is deployed
  kitHit: { gnosis: () => ({ play: [{ n: 'gnosis_beidong_buff', on: 'op', life: 'deployed' }] }) },
  // 烛煌 S2: the burning tiles (charpack Modes/S2/Body/Talents/3 DoTile, an AttachListenerToTileAbility: `_effectSettings`
  // blaze2_skill_02_hit_plot from the first cast on a tile, castedTimeThreshold 1, ended with the ability at the skill's end
  // — OnDetached → _ClearEffects). `cells` [[x, y, 1 on / 0 off]…] (sim kit chess_char_5_03-blaze2.js)
  burnTiles: {
    blaze2: (o) => ({ play: (Array.isArray(o.cells) ? o.cells : []).map(([x, y, on]) => {
      const slot = `burn${x},${y}`;
      return Number(on) > 0 ? { n: 'blaze2_skill_02_hit_plot', on: 'point', at: [x, y], slot } : { slot, off: true };
    }) }),
  },
  // 歌蕾蒂娅 S3: each pull of the tornado (projectile_chr_glady_s3_2 `_interval`: `_castEffect` glady_skill_03_range_03)
  tornadoPulse: { glady: () => ({ play: [{ n: 'glady_skill_03_range_03', on: 'point', life: 'once' }] }) },
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
  return r ? { stop: r.stop || [], play: r.play || [], pass: !!r.pass, ...(r.skillFlag ? { skillFlag: r.skillFlag } : {}) } : null;
}

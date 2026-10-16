// public/js/render/fx/kitofficial.js — kit 'fx' events drawn with the prefabs the client creates at that moment
// (2026-10-16, docs/rules/fx.md 「키트 이벤트의 공식 이펙트」). For an operator whose official effects play, fxgame.js
// standInOff drops the procedural stand-in of a kit event; most of those moments are a skill's start or an attack, which
// the 'skill' / 'atk' / 'dmg' bindings draw. The ones below are talent / buff moments the client draws from its buff
// templates (config/buff_template_holder.ab: a CreateBuff's `overrideEffectKey`, a CreateEffect node) or a projectile's
// `_effectsWhenReached`; without them the moment drew nothing. Pure: fxgame.js executes the plan (kitOfficialFx).

/**
 * One play: `n` the prefab (of the operator's bundle), on `on` ('op' the event's operator, 'id' the event's `id` unit,
 * 'point' the event's x / y on the ground), for `life`:
 *   'once'     its own duration
 *   number     seconds
 *   'skill'    until the operator's skill ends (a buff entry: fxgame stopBuffs) or it leaves
 *   'deployed' until the operator leaves the field
 *   'unit'     until the `on` unit's 'die'
 *   'tag'      until a later event's `stop` names `tag` (with `leave`: also when the operator leaves)
 * or a line `line: [from, to]` (the event's fields naming two units) while both stand.
 */
const once = (n, on = 'op') => ({ n, on, life: 'once' });

/**
 * event → operator bundle → (o, ctx) → { stop?: tag[], play: plays[], pass?: the event keeps its stand-in } | null.
 * ctx: { skill: the operator's skill index 0–2, back: it faces UP (deployed facing the back) }.
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
  },
  // 泥岩 T1 沃土予身: the last layer broken (mudrok_t_1[shield_c] BlockDamage → CreateEffect mudrok_buff_01_end; the layer
  // loops 01–03_start come with layer gains the sim does not announce — §11)
  shieldBreak: {
    mudrok: (o) => (Number(o.left) === 0 ? { play: [once('mudrok_buff_01_end')] } : { play: [] }),
  },
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
};

/** The operator id of a kit event (standInOff's: `src`, else `by`, else `id`). */
export const kitOperator = (o) => (o ? o.src ?? o.by ?? o.id : null);

/**
 * The plan for kit event `name` with fields `o` when its operator's bundle is `bundle`, or null (no rule).
 * @param {string} name
 * @param {any} o
 * @param {string | null} bundle
 * @param {{ skill?: number, back?: boolean }} [ctx]
 */
export function kitOfficialPlan(name, o, bundle, ctx = {}) {
  const rule = bundle ? KIT_OFFICIAL[name]?.[bundle] : null;
  if (typeof rule !== 'function' || !o || typeof o !== 'object') return null;
  const r = rule(o, { skill: Number.isInteger(ctx.skill) ? ctx.skill : 0, back: !!ctx.back });
  return r ? { stop: r.stop || [], play: r.play || [], pass: !!r.pass } : null;
}

// server/sim/content/items/effects/status.js — item buff behaviours: states the carrier gives or refuses — stun, 麻痹, 寒冷, silence, its own 隐匿, the 浓缩嗅盐 immunity.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, fxOn, tplFx, inRange } from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { early, late, chance, ENEMY_RECORD, onAttackEnemies, onDamageEnemies } from '../shared.js';

/** @import { Battle } from '../../../Battle.js' */
/** @import { Unit } from '../../../units.js' */

/**
 * 驱逐者防暴装备's 传递 (act3autochess_equip_acarm145_buff[enemy]): the main buffs whose abnormal flag it passes on — STUNNED,
 * FEARED, ATTRACTED, COLD, FROZEN (passed on as COLD: the template copies COLD for it), PALSY, GROUND_BOUND.
 */
/** @type {Readonly<Record<string, string>>} */
const PASSED = Object.freeze({ stun: 'stun', fear: 'fear', attract: 'attract', cold: 'cold', freeze: 'cold', palsy: 'palsy', groundbind: 'groundbind' });

/** Enemies in `u`'s range now (the dynamic abilities of 规程's items select over the carrier's attack range: "攻击范围内"). */
const enemiesInRangeOf = (/** @type {Battle} */ battle, /** @type {Unit} */ u) => (onField(u) ? battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true }) : []);

/** 浓缩嗅盐 "免疫晕眩、冻结等特殊状态" — the client buff graph act1autochess_equip_acarm059: abnormalImmunes FROZEN,
 * SILENCED, STUNNED, LEVITATE + abnormalComboImmunes SLEEPING (no 麻痹). 寒冷 is a debuff, not a control state: it still
 * applies, but the freeze of a second 寒冷 is itself a `freeze` status and is cancelled. */
const CC = new Set(['stun', 'freeze', 'silence', 'levitate', 'sleep']);

/** chess_item_3_11_e, chess_item_4_04_e, chess_item_4_10_e, chess_item_5_01_e, chess_item_5_02_e, silence_attachment (early);
 * 规程: 雪祀之衣, 驱逐者瓦斯, 驱逐者防暴装备, 不退者卫护系统 */
export const BUFFS = {
  // 雪祀之衣 (规程): 阻挡数 block_cnt (−1) and 嘲讽等级 taunt_level (−1: "更不容易受到攻击") — the global buff's attributes;
  // its HP is the record's attr_common_global_buff
  act3autochess_equip_acarm127_global_buff: early(function act3_snowCloak(battle, u, p, S) {
    const mods = {};
    if (num(p.block_cnt)) mods.blockCnt = num(p.block_cnt);
    if (num(p.taunt_level)) mods.taunt = num(p.taunt_level);
    if (Object.keys(mods).length) S.stat('snowCloak', mods);
  }),
  // 驱逐者瓦斯 (规程; also 驱逐者防暴装备): the enemies in the carrier's attack range get ONE_MINUS_STATUS_RESISTANCE
  //   +one_minus_status_resistance (char_dynamic_ability act3autochess_equip_acarm143_ability) — the client runs a
  //   resistable buff's time by dt ÷ that attribute (Battle.applyStatus `statusTimeAdd`), so a 晕眩 / 冻结 / 恐惧 … landing
  //   on them lasts 1 + value times as long ("影响时间提高100%"). An aura refreshed every 0.25 s while the carrier stands
  //   [ASSUMED·CN: the ability prefab is CN-only — its selector is read from the text's 攻击范围内]
  act3autochess_equip_acarm143_ability: late(function act3_expellerGas(battle, u, p, S) {
    const v = num(p.one_minus_status_resistance);
    if (!(v > 0)) return;
    const key = S.key('gas');
    S.every(0.25, () => {
      for (const e of enemiesInRangeOf(battle, u)) S.buff(e, { key, duration: 0.35, refresh: 'replace', data: { statusTimeAdd: v } });
    }, { immediate: true });
  }),
  // 驱逐者防暴装备 (规程): during the carrier's skill (act3autochess_equip_acarm145_global_buff: ON_SKILL_START triggers
  //   act3autochess_equip_acarm145_ability, ON_SKILL_FINISH interrupts it), a 晕眩 / 恐惧 / 诱导 / 寒冷 / 冻结 / 麻痹 / 缚地 the
  //   carrier puts on an enemy in its range (buff [enemy]: ON_OTHER_BUFF_START whose main buff's source is the carrier) is
  //   passed on with prob to one random other enemy within 1 tile of it (CreateBuffInCircleRange radius 1, the target
  //   left out) for ab_buff_duration s — a 冻结 as 寒冷. The passed state comes from that enemy's own creator buff
  //   (abnormal_buff[creator]), not from the carrier, so it passes on no further. [ASSUMED·CN: the projectile
  //   projectile_ac_equip_acarm145_abbuff that carries it is not timed here — the state lands at once]
  act3autochess_equip_acarm145_ability: late(function act3_riotGear(battle, u, p, S) {
    const pr = num(p.prob), dur = num(p.ab_buff_duration, 3);
    if (!(pr > 0 && dur > 0)) return;
    let on = false, passing = false;
    S.on('skillStart', (c) => { if (c.unit === u) on = true; });
    S.on('skillEnd', (c) => { if (c.unit === u) on = false; });
    S.on('deploy', (c) => { if (c.unit === u) on = false; });
    S.on('statusApplied', (c) => {
      const t = c.target, st = PASSED[c.status];
      if (!on || passing || !st || c.source !== u || !t || t.side !== 'enemy' || !t.alive || !inRange(u, t)) return;
      if (!chance(battle, pr)) return;
      const near = battle.foesInColliderRadius(t.x, t.y, 1).filter((e) => e !== t);
      const to = battle.rng.pick(near);
      if (!to) return;
      passing = true;
      try {
        battle.applyStatus(to, st, st === 'palsy' ? { value: 1, source: to } : { duration: dur, source: to, ...(st === 'attract' ? { point: [u.tileR, u.tileC] } : {}) });
      } finally { passing = false; }
    });
  }),
  // 驱逐者防暴装备's act3autochess_equip_acarm145_global_buff only opens and closes the ability's skill window — run by the
  // act3autochess_equip_acarm145_ability entry above
  act3autochess_equip_acarm145_global_buff: late(function act3_riotGearWindow() {}),
  // 不退者卫护系统's act3autochess_equip_acarm148_ability is the tile selector of [attract]'s fallback (the nearest passable
  // tile when the carrier's own is not walkable — a deployed operator's tile always is here); 动能轰击弩's
  // act3autochess_equip_acarm151_ability is its splash's target selector (the act3autochess_equip_acarm149_global_buff entry)
  act3autochess_equip_acarm148_ability: late(function act3_guardSystemSelector() {}),
  act3autochess_equip_acarm151_ability: late(function act3_kineticSplashSelector() {}),
  // 不退者卫护系统 (规程, act3autochess_equip_acarm148_global_buff): each skill cast (ON_SKILL_CAST_SUCCEED) ⇒ every enemy
  //   within range_radius of the carrier (CreateBuffInCircleRange reads the blackboard's range_radius, its own 1 the
  //   default; 공식 클라에서 확인 — a collider overlap) gets 诱导 to the carrier's tile for attract_duration s, and the
  //   carrier the effect trap_acarm148_buff for as long
  act3autochess_equip_acarm148_global_buff: late(function act3_guardSystem(battle, u, p, S) {
    const r = num(p.range_radius, 1), d = num(p.attract_duration, 3);
    if (!(d > 0)) return;
    S.on('skillStart', (c) => {
      if (c.unit !== u || !onField(u)) return;
      for (const e of battle.foesInColliderRadius(u.x, u.y, r)) battle.applyStatus(e, 'attract', { duration: d, source: u, point: [u.tileR, u.tileC] });
      tplFx(battle, u, 'trap_acarm148_buff', u);
    });
  }),
  // 突袭手雷: within `duration` s after each deploy, every damage the carrier deals stuns the target `stun` s (client buff
  // graph act1autochess_equip_acarm064 [core] ON_OUTPUT_DAMAGE: skills and area hits too)
  act1autochess_equip_acarm064_global_buff: late(function chess_item_3_11_e(battle, u, p, S) {
    const win = num(p.duration), st = num(p.stun);
    if (!(win > 0 && st > 0)) return;
    onDamageEnemies(S, u, (t) => { if (battle.time - u.deployedAt <= win + 1e-9) battle.applyStatus(t, 'stun', { duration: st, source: u }); });
  }),
  // 伪装服: first damage taken in each deployment ⇒ 隐匿 `duration` s (a 流失 is not 受到伤害: damage.js isHpLoss).
  //   Client buff graph act2autochess_equip_acarm055_global_buff: ON_TAKE_DAMAGE → CreateBuff [invisible] → FinishBuff;
  //   the global buff starts again with every deployment (like 黄沙罗盘's), so each deployment hides once
  //   (until 2026-10-31: once per battle)
  act2autochess_equip_acarm055_global_buff: late(function chess_item_4_04_e(battle, u, p, S, rec) {
    const d = num(p.duration);
    if (!(d > 0)) return;
    let usedSeq = -1;
    S.on('damaged', (c) => {
      if (c.target !== u || usedSeq === u.deploySeq || !(c.amount > 0) || !u.alive || isHpLoss(c.dmg)) return;
      usedSeq = u.deploySeq;
      battle.applyStatus(u, 'stealth', { duration: d, source: u });
      fxOn(battle, 'camouflage', u, 'item:chess_item_4_04_e', rec.id, { duration: d });
    });
  }),
  // 浓缩嗅盐: while HP ratio > hp_ratio, immune to 晕眩/冻结 … special states
  act1autochess_equip_acarm059_global_buff: late(function chess_item_4_10_e(battle, u, p, S) {
    const thr = num(p.hp_ratio, 1);
    S.on('beforeStatus', (c) => { if (c.target === u && CC.has(c.status) && u.hpRatio > thr) c.cancel = true; });
  }),
  // 催泪瓦斯: every damage instance (client graph act1autochess_equip_acarm058 ON_OUTPUT_MODIFIER IsDamage → Dice) prob
  // ⇒ 1 麻痹 stack
  act1autochess_equip_acarm058_global_buff: late(function chess_item_5_01_e(battle, u, p, S) {
    const pr = num(p.prob);
    if (pr > 0) onDamageEnemies(S, u, (t) => { if (chance(battle, pr)) battle.applyStatus(t, 'palsy', { value: 1, source: u }); });
  }),
  // 谢拉格不融冰: every damage instance (client graph act1vautochess_acarm003_buff ON_OUTPUT_DAMAGE → Dice) prob ⇒ 寒冷
  // `cold` s — skills and damage over time too, not only normal attacks (GitHub #489: 阿斯卡纶's talent ticks)
  act1vautochess_equip_acarm003_global_buff: late(function chess_item_5_02_e(battle, u, p, S) {
    const pr = num(p.prob), d = num(p.cold);
    if (pr > 0 && d > 0) onDamageEnemies(S, u, (t) => { if (chance(battle, pr)) battle.applyStatus(t, 'cold', { duration: d, source: u }); });
  }),
  // 奥术法阵: 攻击使目标失去特殊能力 silence s. PRTS 盟约记录 备注 (as 源石溶剂's): "携带后，全场范围内的所有敌人类我方单位也会获得
  // 此装备的“造成伤害时使目标失去特殊能力5秒”效果（该效果的付与为我方阵营索敌，可对空，无视目标可选性）" — the damage of every
  // enemy-record unit on our side (炎佑, a partner's too) silences its target while a carrier is on the field [ASSUMED: it
  // ends with its carriers]; one effect per damage instance however many carriers.
  silence_attachment: early(function silence_attachment(battle, u, p, S) {
    const d = num(p.silence);
    if (!(d > 0)) return;
    onAttackEnemies(S, u, (t) => battle.applyStatus(t, 'silence', { duration: d, source: u }));
    S.on('damaged', (c) => {
      const a = c.source, t = c.target;
      if (!a || a === u || a.side !== 'ally' || !ENEMY_RECORD.test(a.defId ?? '') || !t || t.side !== 'enemy' || !t.alive || !onField(u)) return;
      if (c.type === 'element') return; // an element 损伤 (the gauge) is no damage instance
      if (c.dmg) { if (c.dmg.arcaneSilence) return; c.dmg.arcaneSilence = true; }
      battle.applyStatus(t, 'silence', { duration: d, source: a });
    });
  }),
};

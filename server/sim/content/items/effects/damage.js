// server/sim/content/items/effects/damage.js — item buff behaviours: damage taken and dealt — multipliers by distance, blocking and time since deployment, flat reduction, the
// 源石溶剂 drain.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, tplFx } from '../../support/index.js';
import { periodicDamage, hasHp } from '../../../damage.js';
import { RESIST_STATUSES } from '../../../buffs.js';
import { hypot } from '../../../detmath.js';
import { early, late, ENEMY_RECORD, mitigated, isAddition, isContinuous, procTags, chance } from '../shared.js';

/**
 * The carrier's own damage to an enemy at the `hit` hook (no 元素损伤) — its item procs too: these graphs scale or roll on
 * every damage it outputs (ON_OUTPUT_DAMAGE / ON_CALCULATE_DAMAGE), and a multiplier is no proc of its own.
 */
const ownHit = (c, u) => c.source === u && !!c.target && c.target.side === 'enemy' && c.dmg.type !== 'element';
/**
 * Does the target hold a buff the client marks status-resistable (CheckContainsStatusResistableBuff — the buffs 抵抗
 * shortens: 晕眩, 冻结, 寒冷, 恐惧, 诱导 here, buffs.js RESIST_STATUSES)?
 */
const holdsResistable = (t) => t.buffs.some((b) => b.status && RESIST_STATUSES.has(b.status));

/** chess_item_3_02_e, chess_item_4_05_e, chess_item_4_07_e, periodic_damage (early), halfidle_block_fixed_damage (early);
 * 规程: 伊比利亚骨刺刀, 驱逐者警棍, 动能单手弩, 天马之耀, 瓶装烈性反应 */
export const BUFFS = {
  // 伊比利亚骨刺刀 (规程, act3autochess_equip_acarm133_global_buff): after each damage the carrier outputs that is neither
  //   附加 (ADDITION) nor 持续 ⇒ 1 (double_damage > 0: 2) extra arts damage of atk_scale × its ATK to that target, of the
  //   attack type ADDITION (so it carries nothing further), with the effect trap_acarm133_hit_02 (two: trap_acarm133_hit)
  act3autochess_equip_acarm133_global_buff: late(function act3_iberiaSpike(battle, u, p, S) {
    const sc = num(p.atk_scale, 0.25), n = num(p.double_damage) > 0 ? 2 : 1;
    if (!(sc > 0)) return;
    S.on('damaged', (c) => {
      const t = c.target;
      if (c.source !== u || c.type === 'element' || isAddition(c.dmg) || isContinuous(c.dmg) || !t || t.side !== 'enemy' || !hasHp(t)) return;
      for (let i = 0; i < n && hasHp(t); i++) battle.dealDamage(u, t, { amount: u.s.atk * sc, type: 'arts', tags: [...procTags('iberiaSpike'), 'addition'] });
      if (t.alive) tplFx(battle, t, n > 1 ? 'trap_acarm133_hit' : 'trap_acarm133_hit_02', u);
    });
  }),
  // 驱逐者警棍 (规程, act3autochess_equip_acarm144_global_buff; also 驱逐者防暴装备): the carrier's damage (not 持续) to a
  //   target holding a status-resistable buff ×damage_scale (DamageScale)
  act3autochess_equip_acarm144_global_buff: late(function act3_expellerBaton(battle, u, p, S) {
    const sc = num(p.damage_scale, 1);
    if (sc === 1) return;
    S.on('hit', (c) => { if (ownHit(c, u) && !isContinuous(c.dmg) && holdsResistable(c.target)) c.dmg.mul *= sc; });
  }),
  // 动能单手弩 (规程, act3autochess_equip_acarm150_global_buff; also 动能轰击弩): ON_CALCULATE_DAMAGE Dice prob ⇒ AtkScaleUp
  //   atk_scale — that damage's attack multiplier ×1.3 ("使该次攻击力提升至130%"): the amount before DEF / RES
  act3autochess_equip_acarm150_global_buff: late(function act3_kineticCrossbow(battle, u, p, S) {
    const pr = num(p.prob), sc = num(p.atk_scale, 1);
    if (!(pr > 0) || sc === 1) return;
    S.on('hit', (c) => { if (ownHit(c, u) && c.dmg.amount > 0 && chance(battle, pr)) c.dmg.amount *= sc; });
  }),
  // 天马之耀 (规程, act3autochess_equip_acarm156_global_buff): each damage the carrier outputs that is not 附加 also deals
  //   atk_scale × that damage's amount (AssignModifierOriginAtkToBB: the amount after the attack multiplier, before DEF /
  //   RES) as 无来源 真实 附加 damage (FixedValueDamage `_noSourceDamage`, ADDITION) — 天马之枪's graph without the partner;
  //   and 生命回复 hp_recovery_per_sec_by_max_hp_ratio × max HP per second (the global buff's attribute)
  act3autochess_equip_acarm156_global_buff: late(function act3_pegasusGlory(battle, u, p, S) {
    const sc = num(p.atk_scale), r = num(p.hp_recovery_per_sec_by_max_hp_ratio);
    if (r > 0) S.stat('regen', { hpRegenRatio: r });
    if (!(sc > 0)) return;
    S.on('hit', (c) => {
      if (c.source !== u || isAddition(c.dmg) || !(c.dmg.amount > 0) || !c.target || c.target.side !== 'enemy' || !c.target.alive || c.dmg.type === 'element') return;
      battle.dealDamage(u, c.target, { amount: c.dmg.amount * sc, type: 'true', canDodge: false, sourceless: true, tags: [...procTags('pegasusGlory'), 'addition'] });
    });
  }),
  // 瓶装烈性反应 (规程, act3autochess_equip_acarm158_global_buff): the carrier's damage (not 持续) to a target in its 元素爆发
  //   recovery (IsTargetInEPBreakRecovery — the burst cooldown, flag burstLock) ×damage_scale
  act3autochess_equip_acarm158_global_buff: late(function act3_volatileReaction(battle, u, p, S) {
    const sc = num(p.damage_scale, 1);
    if (sc === 1) return;
    S.on('hit', (c) => { if (ownHit(c, u) && !isContinuous(c.dmg) && c.target.s.flags.burstLock) c.dmg.mul *= sc; });
  }),
  // 精准狙击镜: damage ×damage_scale against targets more than radius tiles away — the client graph act1autochess_acarm063_buff
  // scales when CheckDistance (squared distance ≤ radius²) fails, so a target exactly radius away gets none (the text
  // says "3格及以上")
  act1autochess_equip_acarm063_global_buff: late(function chess_item_3_02_e(battle, u, p, S) {
    const r = num(p.radius, 3), sc = num(p.damage_scale, 1);
    S.on('hit', (c) => {
      if (c.source !== u || !c.target || c.target.side !== 'enemy' || c.dmg.type === 'element') return;
      if (hypot(c.target.x - u.x, c.target.y - u.y) > r + 1e-6) c.dmg.mul *= sc;
    });
  }),
  // 防暴盾: while blocking, damage from units it does not block ×damage_scale
  act1autochess_equip_acarm060_global_buff: late(function chess_item_4_05_e(battle, u, p, S) {
    const sc = num(p.damage_scale, 1);
    S.on('hit', (c) => {
      // "受到来自非自身阻挡单位的伤害": only damage whose source is a unit the carrier does not block (terrain / sourceless
      // bursts and its own HP loss are not "from a unit")
      const src = c.source;
      if (c.target !== u || !u.blocking.length || c.dmg.type === 'element' || !src || src === u) return;
      if (u.blocking.indexOf(src) >= 0) return;
      c.dmg.mul *= sc;
    });
  }),
  // 卡西米尔竞技旗: damage ×damage_scale for `interval` s after each deploy, then −damage_scale_minus every ex_interval s.
  //   Client buff graph act2autochess_equip_acarm120_global_buff: its first tick (after `interval`) hands over to [ending],
  //   whose ticks (every ex_interval s, waitFirstTriggerInterval) add damage_scale_minus and end the buff once below 1 —
  //   so the first decrease comes ex_interval s after the window (until 2026-10-31: at once)
  act2autochess_equip_acarm120_global_buff: late(function chess_item_4_07_e(battle, u, p, S) {
    const sc = num(p.damage_scale, 1), win = num(p.interval, 15), step = Math.max(0.1, num(p.ex_interval, 0.5)), minus = num(p.damage_scale_minus);
    S.on('hit', (c) => {
      if (c.source !== u || c.dmg.type === 'element') return;
      const t = battle.time - u.deployedAt;
      let m = sc;
      if (t > win + 1e-9) m = minus < 0 ? Math.max(1, sc + minus * Math.floor((t - win) / step + 1e-9)) : 1;
      if (m !== 1) c.dmg.mul *= m;
    });
  }),
  // 源石溶剂: the text's "每秒流失 damage 点生命值" is officially 每秒受到 damage 点真实伤害 (PRTS 盟约记录 修正 "并非流失", 备注
  // "造成无来源真实持续环境伤害"; the `periodic_damage` template — also 狂暴宿主 "自身每秒受到N无来源真实伤害"): a damage instance,
  // not a 流失 — shields, damage-taken modifiers and the target-side `hit` effects apply, and it is a "受到伤害" for 受击回复
  // SP, the 重装 TAKE_DAMAGE trigger and 信仰搅拌机 S3's counters (player report D1). 无来源: hooks see no source; the carrier
  // keeps the credit (a carrier the drain finishes off is its own kill, as before). May kill.
  // The same 备注: "携带后，全场范围内的所有敌人类我方单位也会获得此装备的“每秒受到60真实伤害”效果（该效果的付与为我方阵营索敌，
  // 可对空，无视目标可选性）" — every enemy-record unit on our side of the whole field (炎佑 enemy_9012_acloon, a partner's
  // too; flying, 孤立) takes the same tick, credited to nobody, while a carrier is on the field [ASSUMED: it ends with its
  // carriers]; one effect per unit however many carriers (PRTS 作战机制 "同名buff的默认叠加策略buff只能表现出一个").
  periodic_damage: early(function periodic_damage(battle, u, p, S) {
    const d = num(p.damage);
    if (!(d > 0)) return;
    S.stat('drain', null, { interval: 1, onTick: ({ unit }) => {
      if (!unit.deployed) return;
      battle.dealDamage(unit, unit, periodicDamage(d));
      for (const a of battle.allies()) {
        if (a === unit || !ENEMY_RECORD.test(a.defId ?? '') || battle.time - (a.mem.solventAt ?? -Infinity) < 1 - 1e-6) continue;
        a.mem.solventAt = battle.time;
        battle.dealDamage(null, a, periodicDamage(d));
      }
    } });
  }),
  // 海沟实验体: 伤害减免 value per damage instance (after DEF/RES)
  halfidle_block_fixed_damage: early(function halfidle_block_fixed_damage(battle, u, p, S) {
    const v = num(p.value);
    if (!(v > 0)) return;
    S.on('hit', (c) => {
      if (c.target !== u) return;
      const d = c.dmg;
      if (d.type === 'element') return;
      const base = mitigated(d.amount * d.mul, d.type, u, c.source, d);
      if (!(base > 0)) return;
      d.mul *= Math.max(0, base - v) / base;
    }, -10);
  }),
};

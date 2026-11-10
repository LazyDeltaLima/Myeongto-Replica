// server/sim/content/items/effects/status.js — item buff behaviours: states the carrier gives or refuses — stun, 麻痹, 寒冷, silence, its own 隐匿, the 浓缩嗅盐 immunity.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, fxOn } from '../../support/index.js';
import { isHpLoss } from '../../../damage.js';
import { early, late, chance, ENEMY_RECORD, onAttackEnemies, onDamageEnemies } from '../shared.js';

/** 浓缩嗅盐 "免疫晕眩、冻结等特殊状态" — the client buff graph act1autochess_equip_acarm059: abnormalImmunes FROZEN,
 * SILENCED, STUNNED, LEVITATE + abnormalComboImmunes SLEEPING (no 麻痹). 寒冷 is a debuff, not a control state: it still
 * applies, but the freeze of a second 寒冷 is itself a `freeze` status and is cancelled. */
const CC = new Set(['stun', 'freeze', 'silence', 'levitate', 'sleep']);

/** chess_item_3_11_e, chess_item_4_04_e, chess_item_4_10_e, chess_item_5_01_e, chess_item_5_02_e, silence_attachment (early) */
export const BUFFS = {
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

// server/sim/content/items/effects/resource.js — item buff behaviours: SP and ammunition.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, unitBonds, fxOn, tplFx, inRange, battleStore } from '../../support/index.js';
import { late, chance } from '../shared.js';

/** chess_item_3_05_e, chess_item_4_08_e; 规程: 莱塔尼亚小鼓, 可靠怀表 */
export const BUFFS = {
  // 莱塔尼亚小鼓 (规程): the ability act3autochess_equip_acarm134_ability puts act3autochess_equip_acarm134_buff on the units in
  //   the carrier's range; one knocked out under it (ON_OWNER_FINISH HP_ZERO / HP_ZERO_WITH_NO_SOURCE / FALLDOWN) gives the
  //   carrier +sp SP (ModifySp). [ASSUMED·CN: the ability prefab is CN-only — enemies in the carrier's range, read from
  //   "攻击范围内每次有单位被击倒"]
  act3autochess_equip_acarm134_ability: late(function act3_leithanienDrum(battle, u, p, S) {
    const sp = num(p.sp);
    if (!(sp > 0)) return;
    S.on('death', (c) => {
      const t = c.unit;
      if (c.reason !== 'killed' || !t || t.side !== 'enemy' || !onField(u) || !u.skill || !inRange(u, t)) return;
      u.skill.gainSp(sp, 'item');
    });
  }),
  // 可靠怀表 (规程, act3autochess_equip_acarm137_global_buff): [skill_cost] — once per operator and battle, whatever the
  //   copies (a shared flag keyed by its chess) — its skill's SP cost × sp_cost_scale, not below sp_cost_min, and only when
  //   the cost is above sp_cost_min (ModifySpData `_onlyUpdateSpCost`); during each skill ATTACK_SPEED MULTIPLIER
  //   attack_speed (−25 %: aspdPct)
  act3autochess_equip_acarm137_global_buff: late(function act3_reliableWatch(battle, u, p, S) {
    const sk = u.skill;
    const scale = num(p.sp_cost_scale, 1), min = num(p.sp_cost_min), as = num(p.attack_speed);
    const done = battleStore(battle, 'item:reliableWatch', () => new Set());
    if (sk && !done.has(u) && scale !== 1) {
      done.add(u);
      const cost = sk.baseSpCost * sk.spCostMul;
      if (cost > min && cost > 0) {
        const want = Math.max(min, cost * scale);
        sk.spCostMul = sk.spCostMul * (want / cost);
      }
    }
    if (!as) return;
    const key = S.key('skillAspd');
    S.on('skillStart', (c) => { if (c.unit === u) S.buff(u, { key, mods: { aspdPct: as }, refresh: 'replace' }); });
    S.on('skillEnd', (c) => { if (c.unit === u) battle.removeBuff(u, key); });
  }),
  // 迅捷作战粮: on deploy SP += sp_each_person × (1 + other operators sharing a bond). The client's
  // AutoChessAssignSameBondCharacterCntToBB counts the player's characters in battle sharing a bond with it, itself
  // included — none at all for an operator without a bond, so it gains nothing
  act1autochess_equip_acarm051_global_buff: late(function chess_item_3_05_e(battle, u, p, S) {
    const each = num(p.sp_each_person);
    if (!(each > 0)) return;
    S.on('deploy', (c) => {
      if (c.unit !== u || !u.skill) return;
      const mine = unitBonds(u, battle);
      if (!mine.length) return;
      let n = 0;
      for (const a of battle.allyUnits) {
        if (a === u || a.kind !== 'op' || a.ownerId !== u.ownerId || a.removed) continue;
        if (!(c.initial ? !a.removed : onField(a))) continue;
        if (unitBonds(a, battle).some((b) => mine.includes(b))) n++;
      }
      u.skill.gainSp(each * (1 + n), 'item');
    });
  }),
  // 拉特兰桥夹 (client buff graph act1autochess_equip_acarm057): the first attack of a skill cast that leaves ≤ 1 bullet
  // rolls prob ONCE for that cast (the graph marks `triggered` before the Dice; ON_SKILL_START clears it) ⇒
  // +CeilToInt(maxCount × ammo_percent) bullets (node AmmoSkillCountModifier.Execute: float32 product,
  // MathUtil.CeilToInt; maxCount = the cast's full count, 拉特兰 bullets included), ≤ max_trigger_cnt per deployment
  act1autochess_equip_acarm057_global_buff: late(function chess_item_4_08_e(battle, u, p, S, rec) {
    const cap = Math.floor(num(p.max_trigger_cnt, 3));
    let seq = -1, n = 0, rolled = -1;
    S.on('ammoUsed', (c) => {
      if (c.unit !== u || !(c.left <= 1) || !c.skill || rolled === c.skill.activations) return;
      if (u.deploySeq !== seq) { seq = u.deploySeq; n = 0; }
      if (n >= cap) return;
      rolled = c.skill.activations;
      if (!chance(battle, num(p.prob))) return;
      n++;
      const max = Math.max(c.skill.ammoMax || 0, c.skill.ammo || 0);
      c.skill.recoverAmmo(Math.max(1, Math.ceil(Math.fround(Math.fround(max) * Math.fround(num(p.ammo_percent))))));
      fxOn(battle, 'buff', u, 'item:chess_item_4_08_e', rec.id);
      tplFx(battle, u, 'bond_laterano_reload_01', u); // act1autochess_acarm057_buff ON_AFTER_ATTACK, after the refill
    });
  }),
};

// server/sim/content/items/effects/resource.js — item buff behaviours: SP and ammunition.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, unitBonds, fxOn, tplFx } from '../../support/index.js';
import { late, chance } from '../shared.js';

/** chess_item_3_05_e, chess_item_4_08_e */
export const BUFFS = {
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

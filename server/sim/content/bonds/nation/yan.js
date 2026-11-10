// server/sim/content/bonds/nation/yan.js — 炎 (yanShip).
//
//   act1autochess_bond_eff_yan   members ATK +(base_atk + atk_per_stack·L) (直接乘算); 6: one “炎佑” (its template ATK /
//                                max HP + 30 % of the 炎 ATK / max HP sums at battle start — PRTS "增加…（最终加算）");
//                                9: two 炎佑, ATK ×atk, damage taken ×(1 − damage_resistance)
//   act3autochess_bond_eff_yan   (卫戍协议：规程, bondeffect_yan_2) members ATK +(atk_base + atk_per_stack·L) (MULTIPLIER,
//                                直接乘算); 6: every damage a member deals but an 附加 one adds a random element's 元素损伤
//                                of ATK × min(ex_atk_scale_max, ex_atk_scale_base + per·L) (RandomSetter element_type 1…5:
//                                神经 · 侵蚀 · 灼燃 · 凋亡 · 狂躁) — and every enemy of the field recovers from its 爆发冷却
//                                ×(1 + min(max, base + per·L)) faster (yan[enemy] EP_BREAK_RECOVER_SPEED MULTIPLIER, the
//                                field's highest 炎 layers)

import * as S from '../../support/index.js';
import { spawnYanyou } from '../../tokens.js';
import { isHpLoss } from '../../../damage.js';
import { TICK } from '../../../constants.js';
import { num, reached, onLayers, onDealt, standing, fieldMaxLayers, isFoe, isAddition, isElement } from '../shared.js';

/** "总和的30%" → 0.3 (炎佑 stat share, text only; the scope's data, support dataFile). */
export function yanyouShare(scope = null) {
  const rec = S.bondRecord('yanShip', scope);
  const text = String(rec?.effectDesc ?? rec?.desc ?? '');
  const m = /总和的\s*(\d+(?:\.\d+)?)\s*%/.exec(text);
  const v = m ? +m[1] / 100 : NaN;
  return v > 0 && v <= 10 ? v : 0.3;
}

function installYan(battle, pid, bb, members) {
  const L = () => S.bondLayers(battle, pid, 'yanShip');
  const apply = () => {
    const mods = S.directMods({ atk: num(bb.base_atk) + num(bb.atk_per_stack) * L() });
    for (const u of members) S.passiveBuff(battle, u, 'bond:yan', mods);
  };
  apply();
  onLayers(battle, pid, 'yanShip', apply);
  if (!reached(battle, pid, 'yanShip', bb.power_bond_char_cnt)) return;
  const ex = reached(battle, pid, 'yanShip', bb.ex_bond_char_cnt);
  battle.on('battleStart', () => {
    // PRTS: the sums count real 炎 operators only (调和 operators' stats are not collected unless they are 炎 too). The
    // client's acloon_gather_attribute (AutoChessAssignGatheredAttributeToBlackboard) sums every character of the field
    // whose bonds hold yanShip, whoever owns it: in a two-player field the partner's 炎 operators count too
    let atk = 0, hp = 0;
    for (const u of battle.allyUnits) {
      if (u.kind !== 'op' || !S.onField(u) || !S.unitBonds(u, battle).includes('yanShip')) continue;
      atk += num(u.s.atk, 0);
      hp += num(u.s.maxHp, 0);
    }
    if (!(hp > 0)) return;
    const share = yanyouShare(battle);
    const out = spawnYanyou(battle, pid, {
      atk: atk * share, hp: hp * share, count: ex ? 2 : 1,
      atkMul: ex ? num(bb.atk, 1) : 1,
      dmgTakenMul: ex ? Math.max(0, 1 - num(bb.damage_resistance, 0)) : 1,
    });
    for (const y of out) y.mem.bondYan = true;
  }, { once: true });
}

/** The element of RandomSetter element_type 1…5 (ElementType: 1 神经 · 2 侵蚀 · 3 灼燃 · 4 凋亡 · 5 狂躁, CN only). */
export const YAN_ELEMENTS = Object.freeze(['neural', 'erosion', 'burn', 'apoptosis', null]);

function installYanAct3(battle, pid, bb, members) {
  standing(battle, pid, 'yanShip', members, 'bond:yan', { atk: [bb.atk_base, bb.atk_per_stack] });
  if (!reached(battle, pid, 'yanShip', bb.power_bond_char_cnt)) return;
  const scale = () => Math.min(num(bb.ex_atk_scale_max, Infinity), num(bb.ex_atk_scale_base) + num(bb.ex_atk_scale_per_stack) * S.bondLayers(battle, pid, 'yanShip'));
  const onDmg = (c) => {
    const u = c.source, t = c.target;
    if (!isFoe(t) || !c.dmg || isElement(c) || isAddition(c.dmg) || isHpLoss(c.dmg) || !(c.amount > 0)) return;
    const el = YAN_ELEMENTS[battle.rng.int(YAN_ELEMENTS.length)];
    // 狂躁 (element 5) is CN-only and not in this engine: that roll fills nothing [ASSUMED·CN]
    if (!el) return;
    const amount = num(u.s.atk) * scale();
    if (amount > 0) battle.dealDamage(u, t, { amount, type: 'element', element: el, tags: ['bond:yan'] });
  };
  for (const u of members) onDealt(battle, u, onDmg);
  // yan[enemy]: one per field, from the field's highest 炎 layers among the players at 6 (_useMaxBondStackCntInCurArea)
  const st = S.battleStore(battle, 'bond:yan2:recover', () => ({ on: false }));
  if (st.on) return;
  st.on = true;
  battle.every(0, () => {
    const L = fieldMaxLayers(battle, 'yanShip', bb.power_bond_char_cnt);
    if (L < 0) return;
    const v = Math.min(num(bb.ep_break_recover_speed_max, Infinity), num(bb.ep_break_recover_speed_base) + num(bb.ep_break_recover_speed_per_stack) * L);
    if (!(v > 0)) return;
    for (const e of battle.enemies) {
      if (!e.alive || !e.s.flags.burstLock) continue;
      for (const b of e.buffs) if (b.flags && b.flags.burstLock && Number.isFinite(b.timeLeft)) b.timeLeft -= TICK * v;
    }
  });
}

export const TEMPLATES = Object.freeze({
  act1autochess_bond_eff_yan: { bond: 'yanShip', battle: installYan },
  act3autochess_bond_eff_yan: { bond: 'yanShip', battle: installYanAct3, bb: 'record' },
});

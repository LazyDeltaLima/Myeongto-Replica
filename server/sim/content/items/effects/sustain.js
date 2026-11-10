// server/sim/content/items/effects/sustain.js — item buff behaviours: HP, healing, shields and the 复活.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, frontTile, fxOn, tplFx, directMods } from '../../support/index.js';
import { late, isProc, chance, PRIO_RESPAWN, reviveNow, addShieldLayer } from '../shared.js';

const SHIELD_KEY = 'item:shield_drone';

/** chess_item_3_06_e, chess_item_4_06_e, chess_item_4_11_e, chess_item_4_12_e */
export const BUFFS = {
  // 歌利亚头盔: HP +init_max_hp; deploy with no operator on the tile in front ⇒ HP +ex_max_hp (until it leaves)
  act1autochess_equip_acarm049_global_buff: late(function chess_item_3_06_e(battle, u, p, S) {
    if (num(p.init_max_hp)) S.stat('hp', directMods({ hp: num(p.init_max_hp) }));
    const ex = num(p.ex_max_hp);
    if (!ex) return;
    const key = S.key('front');
    const check = (initial) => {
      const [fr, fc] = frontTile(u);
      let occupied = false;
      for (const a of battle.allyUnits) {
        if (a === u || a.kind !== 'op' || a.removed) continue;
        const here = initial ? a.homeR === fr && a.homeC === fc : onField(a) && a.tileR === fr && a.tileC === fc;
        if (here) { occupied = true; break; }
      }
      if (!occupied) {
        S.buff(u, { key, mods: directMods({ hp: ex }), refresh: 'replace' });
        // client buff template act1autochess_acarm049_buff ON_BUFF_START: the CreateEffect of the no-one-in-front branch
        tplFx(battle, u, 'map_act1autochess_reinforce_02', u);
      } else battle.removeBuff(u, key);
    };
    S.on('deploy', (c) => { if (c.unit === u) check(!!c.initial); });
    if (onField(u)) check(false);
  }),
  // 休眠子裔: each damage instance the carrier deals ⇒ heal self hp_ratio × max HP. Client buff graph
  //   act1vautochess_acarm025_buff: ON_OUTPUT_DAMAGE → HealViaMaxHpRatio `_skipModifierEvent` — every instance (skill hits,
  //   each target of an area hit, damage over time, a dodged one), and the heal fires no heal event (heal `noEvent`: 有限加速器
  //   does not count it). Not 元素损伤, not item procs (this fork's rule). Until 2026-10-31: once per attacked target
  act1vautochess_equip_acarm025_global_buff: late(function chess_item_4_06_e(battle, u, p, S) {
    const r = num(p.hp_ratio);
    if (!(r > 0)) return;
    S.on('hit', (c) => {
      const t = c.target;
      if (c.source !== u || !t || t.side !== 'enemy' || c.dmg.type === 'element' || isProc(c.dmg)) return;
      battle.heal(u, u, u.s.maxHp * r, { self: true, noEvent: true });
    });
  }),
  // 护盾无人机: heals ⇒ prob: target gets 1 shield layer (≤ max_stack_cnt)
  act1autochess_equip_acarm061_global_buff: late(function chess_item_4_11_e(battle, u, p, S, rec) {
    const pr = num(p.prob), cap = Math.max(1, Math.floor(num(p.max_stack_cnt, 1)));
    S.on('heal', (c) => {
      if (c.source !== u || !c.target || (c.opts && (c.opts.regen || c.opts.self)) || !(c.amount > 0)) return;
      const cur = c.target.findBuff(SHIELD_KEY);
      if (cur && cur.shieldHits >= cap) return;
      if (!chance(battle, pr)) return;
      if (addShieldLayer(battle, c.target, SHIELD_KEY, cap)) fxOn(battle, 'shield', c.target, 'item:chess_item_4_11_e', rec.id);
    });
  }),
  // M3茧甲: knocked down in battle ⇒ 立刻复活 (max_respawn_cnt per battle) — PRTS's form: the knock-out stands (its
  // 被击倒时 effects run) and the carrier redeploys at once, free, where it lies (reviveNow; in place until 0.2.0)
  act1autochess_equip_acarm068_global_buff: late(function chess_item_4_12_e(battle, u, p, S, rec) {
    const max = Math.floor(num(p.max_respawn_cnt, 1));
    if (!(max > 0)) return;
    let used = 0;
    S.on('death', (c) => {
      if (c.unit !== u || used >= max || !reviveNow(battle, c, 'item')) return;
      used++;
      fxOn(battle, 'revive', u, 'item:chess_item_4_12_e', rec.id, { left: max - used });
      tplFx(battle, u, 'map_act1autochess_reinforce_02', u); // act1autochess_acarm068_buff ON_OWNER_FINISH
    }, PRIO_RESPAWN); // a knock-out: after every 不死 (the hammer's lock), whatever the equip order (header)
  }),
};

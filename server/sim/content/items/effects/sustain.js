// server/sim/content/items/effects/sustain.js — item buff behaviours: HP, healing, shields and the 复活.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, frontTile, fxOn, tplFx, directMods, battleStore } from '../../support/index.js';
import { hasHp } from '../../../damage.js';
import { early, late, isProc, chance, PRIO_RESPAWN, reviveNow, addShieldLayer } from '../shared.js';

/** @import { BuffRec } from '../../bonds/shared.js' */

const SHIELD_KEY = 'item:shield_drone';

/** chess_item_3_06_e, chess_item_4_06_e, chess_item_4_11_e, chess_item_4_12_e; 规程: 虹彩活血饮料, 聚合急救箱, 不退者力场,
 * 汲取者之喙 / 之心 / 之镰 */
export const BUFFS = {
  // 虹彩活血饮料 (规程, act3autochess_equip_acarm126_global_buff): 无法被治疗 (禁疗 that stops its own heals too: flag
  //   healFree) and 生命回复 value HP per second — the unit's own regeneration attribute, which 禁疗 does not stop
  act3autochess_equip_acarm126_global_buff: early(function act3_rainbowTonic(battle, u, p, S) {
    const v = num(p.value);
    S.stat('rainbow', v > 0 ? { hpRegen: v } : null, { flags: { healFree: true } });
  }),
  // 聚合急救箱 (规程): the ability act3autochess_equip_acarm136_ability puts act3autochess_equip_acarm136_buff on the allies in
  //   the carrier's range; the first time an ally's HP ratio is below check_hp_ratio under it (ON_APPLIED_MODIFIER) it is
  //   healed hp_ratio × its max HP (HealViaMaxHpRatio, effect common_heal_hit_01) — once per ally and battle, whatever
  //   the kits (the flag is the ally's shared blackboard). [ASSUMED·CN: the ability prefab is CN-only — the allies in
  //   the carrier's range, from the text's "攻击范围内每个友方干员"]
  act3autochess_equip_acarm136_ability: late(function act3_firstAidKit(battle, u, p, S) {
    const r = num(p.hp_ratio), thr = num(p.check_hp_ratio, 0.5);
    if (!(r > 0)) return;
    const healed = battleStore(battle, 'item:firstAidKit', () => new Set());
    S.on('damaged', (c) => {
      const a = c.target;
      if (!a || a.side !== 'ally' || a.kind === 'device' || healed.has(a) || !hasHp(a) || !(a.hpRatio < thr) || !onField(u)) return;
      if (!battle.alliesInGrid(u).includes(a)) return;
      healed.add(a);
      battle.heal(u, a, a.s.maxHp * r);
      tplFx(battle, a, 'common_heal_hit_01', u);
    });
  }),
  // 不退者力场 (规程, act3autochess_equip_acarm147_global_buff; also 不退者卫护系统): 阻挡数 +block_cnt (the global buff's
  //   attribute), and each enemy it blocks max HP and DEF +hp_cell / +def_cell (MULTIPLIER × the blocked count: 直接乘算),
  //   updated when its blockees change (ON_OWNER_BLOCKEE_CHANGED)
  act3autochess_equip_acarm147_global_buff: late(function act3_holdfastField(battle, u, p, S) {
    if (num(p.block_cnt)) S.stat('block', { blockCnt: num(p.block_cnt) });
    const hc = num(p.hp_cell), dc = num(p.def_cell);
    if (!hc && !dc) return;
    const key = S.key('perBlock');
    let last = 0;
    S.every(0.1, () => {
      const n = onField(u) ? u.blocking.length : 0;
      if (n === last) return;
      last = n;
      if (n) S.buff(u, { key, mods: directMods({ hp: hc * n, def: dc * n }), refresh: 'replace' });
      else battle.removeBuff(u, key);
    }, { immediate: true });
  }),
  // 汲取者之喙 (规程, act3autochess_equip_acarm152_global_buff; also 汲取者之镰): after each damage the carrier deals
  //   (ON_AFTER_OUTPUT_DAMAGE IsDamage) it heals itself heal_scale × that damage, through 禁疗 (`_ignoreHealFree`); with
  //   can_double (汲取者之镰) twice that during its skills
  act3autochess_equip_acarm152_global_buff: late(function act3_reaperBeak(battle, u, p, S) {
    const sc = num(p.heal_scale), dbl = num(p.can_double) > 0;
    if (!(sc > 0)) return;
    S.on('damaged', (c) => {
      if (c.source !== u || c.type === 'element' || !(c.amount > 0) || c.target === u || !u.alive) return;
      const k = dbl && u.skill && u.skill.active ? 2 : 1;
      battle.heal(u, u, c.amount * sc * k, { self: true, ignoreHealFree: true });
    });
  }),
  // 汲取者之心 (规程, act3autochess_equip_acarm153_global_buff; also 汲取者之镰): ATK +atk (MULTIPLIER, 直接乘算) and ASPD
  //   +attack_speed; [dot]: each second a 流失 of hp_ratio_base × max HP that never takes the last HP (DamageViaMaxHpRatio
  //   PURE `_isUndeadable` `_ignoreForSp` `_skipModifierEvent`). With can_double (汲取者之镰) all of it twice during its skills
  act3autochess_equip_acarm153_global_buff: late(function act3_reaperHeart(battle, u, p, S) {
    const atk = num(p.atk), as = num(p.attack_speed), loss = num(p.hp_ratio_base), dbl = num(p.can_double) > 0;
    const key = S.key('stats');
    const k = () => (dbl && u.skill && u.skill.active ? 2 : 1);
    const sync = () => S.buff(u, { key, mods: { aspd: as * k(), ...directMods({ atk: atk * k() }) }, refresh: 'replace', persist: true, allowDead: true });
    sync();
    if (dbl) {
      S.on('skillStart', (c) => { if (c.unit === u) sync(); });
      S.on('skillEnd', (c) => { if (c.unit === u) sync(); });
    }
    if (loss > 0) {
      S.every(1, () => {
        if (!onField(u) || !(u.hp > 1)) return;
        battle.loseHp(u, Math.min(u.hp - 1, u.s.maxHp * loss * k()), { source: u, silent: true });
      });
    }
  }),
  // 汲取者之镰 (规程, act3autochess_equip_acarm154_global_buff): during each skill the carrier 无法被治疗 (HEAL_FREE, effect
  //   trap_acarm154_buff_01 — 'item:reaperScythe'); 汲取者之喙's heal goes through it
  act3autochess_equip_acarm154_global_buff: late(function act3_reaperScythe(battle, u, p, S) {
    S.on('skillStart', (c) => { if (c.unit === u) S.buff(u, { key: 'item:reaperScythe', flags: { healFree: true }, visible: true, refresh: 'replace' }); });
    S.on('skillEnd', (c) => { if (c.unit === u) battle.removeBuff(u, 'item:reaperScythe'); });
  }),
  // 歌利亚头盔: HP +init_max_hp; deploy with no operator on the tile in front ⇒ HP +ex_max_hp (until it leaves)
  act1autochess_equip_acarm049_global_buff: late(function chess_item_3_06_e(battle, u, p, S) {
    if (num(p.init_max_hp)) S.stat('hp', directMods({ hp: num(p.init_max_hp) }));
    const ex = num(p.ex_max_hp);
    if (!ex) return;
    const key = S.key('front');
    const check = (/** @type {boolean} */ initial) => {
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
      const cur = /** @type {BuffRec | null} */ (c.target.findBuff(SHIELD_KEY));
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

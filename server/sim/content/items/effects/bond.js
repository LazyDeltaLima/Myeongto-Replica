// server/sim/content/items/effects/bond.js — item buff behaviours: the bond items and their combos — 【X】 carriers, a partner item that raises the effect.
// Keyed by the official buff key (bbStr.key of the item record's battle buff); items/battle.js runs them for every record
// that carries the key, whatever its item id (items/shared.js: the entry shape and the early / late order).

import { num, onField, unitBonds, alliesAround, passiveBuff, tplFx, contentInfo, directMods, battleStore, gainLayers, activeBondIds } from '../../support/index.js';
import { isHpLoss, isNormalDamage } from '../../../damage.js';
import { early, late, partnerOf, isProc, procTags, chance, isAddition, memberOf, carries, isContinuous as isContinuousDmg } from '../shared.js';

/** chess_item_5_09_e, chess_item_6_01_e, chess_item_6_02_e, chess_item_6_03_e, chess_item_6_04_e, chess_item_6_06_e, chess_item_6_07_e, chess_item_6_11_e, act2autochess_equip_acarm121_ability (early) */
export const BUFFS = {
  // 多功能补剂 (规程, act3autochess_equip_acarm131_global_buff): each damage the carrier outputs (not 持续; ON_OUTPUT_DAMAGE
  //   `_filterModifierCancelled`) ⇒ 临时层数 +temp_stack_count_add for each active bond of its own (AutoChessAddBondStackCount
  //   `_useTargetBond` `_isTemp`), until temp_stack_count_max in the battle — one count per operator however many copies
  //   (a shared blackboard keyed by its chess). Item procs do not count (this fork's rule: procs never re-trigger items)
  act3autochess_equip_acarm131_global_buff: late(function act3_multiTonic(battle, u, p, S) {
    const add = Math.floor(num(p.temp_stack_count_add)), max = Math.floor(num(p.temp_stack_count_max));
    if (!(add > 0 && max > 0)) return;
    const used = battleStore(battle, 'item:multiTonic', () => new Map());
    S.on('damaged', (c) => {
      if (c.source !== u || c.type === 'element' || isProc(c.dmg) || isContinuousDmg(c.dmg) || !c.target || c.target.side !== 'enemy') return;
      const cur = used.get(u) ?? 0;
      if (cur >= max) return;
      const next = Math.min(max, cur + add);
      used.set(u, next);
      gainLayers(battle, { playerId: u.ownerId, bonds: unitBonds(u, battle), n: next - cur, temp: true, reason: 'item', source: u });
    });
  }),
  // 佣兵名牌 (规程, act3autochess_equip_acarm141_global_buff): ATK and max HP +atk / +hp × the player's active bonds
  //   (AutoChessAssignActiveGarrisonBondCntToBlackboard, clamped to max_layer; MULTIPLIER, 直接乘算), counted when the buff
  //   starts — each deployment
  act3autochess_equip_acarm141_global_buff: late(function act3_mercTag(battle, u, p, S) {
    const atk = num(p.atk), hp = num(p.hp), cap = Math.max(0, Math.floor(num(p.max_layer, 8)));
    if (!atk && !hp) return;
    const key = S.key('bonds');
    const sync = () => {
      const n = Math.min(cap, activeBondIds(battle, u.ownerId).length);
      if (n > 0) S.buff(u, { key, mods: directMods({ atk: atk * n, hp: hp * n }), refresh: 'replace', persist: true, allowDead: true });
      else battle.removeBuff(u, key);
    };
    S.on('deploy', (c) => { if (c.unit === u) sync(); });
    sync();
  }),
  // 天马之盔: with 天马之枪 ⇒ 生命回复 hp_recovery_per_sec_by_max_hp_ratio × max HP per second. Client buff graph
  //   act2autochess_equip_acarm118_global_buff ON_BUFF_START: AutoChessCheckHasEquip → [ex] with the attribute
  //   HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO — the unit's own regeneration (hpRegenRatio: continuous, no 治疗 event), judged
  //   when the buff starts (each deployment, or a lend). Until 2026-10-31: a heal once a second
  act2autochess_equip_acarm118_global_buff: late(function chess_item_5_09_e(battle, u, p, S) {
    const partner = partnerOf(p, battle);
    const r = num(p.hp_recovery_per_sec_by_max_hp_ratio);
    if (!partner || !(r > 0)) return;
    const key = S.key('set');
    const sync = () => {
      if (carries(battle, u, partner)) S.buff(u, { key, mods: { hpRegenRatio: r }, refresh: 'replace' });
      else battle.removeBuff(u, key);
    };
    S.on('deploy', (c) => { if (c.unit === u) sync(); });
    sync();
  }),
  // 天马之枪: with 天马之盔 ⇒ each of the carrier's non-附加 damage instances also deals atk_scale × that instance's damage as 无来源
  // 真实附加伤害 — "额外造成的伤害基于原伤害计算攻击倍率后、计算单位防御力/法术抗性以及所有伤判效果前的伤害数值，且先于原伤害
  // 处理完毕" (PRTS 盟约记录 下半 装备数据库 备注): the base is the instance's amount at the `hit` hook (after the attack
  // multiplier, before DEF / RES and the dealt / taken multipliers), and it lands before the instance does. 无来源: hooks
  // see no source, the kill and the stats stay the carrier's (credit). A dodged instance still carries it: the client graph
  // act2autochess_equip_acarm117_global_buff filters ON_OUTPUT_DAMAGE only by attack type (FilterDamageModifer ADDITION →
  // IfNot, no `_filterModifierCancelled`), so 持续 / 溅射 instances and cancelled ones carry it too
  act2autochess_equip_acarm117_global_buff: late(function chess_item_6_01_e(battle, u, p, S) {
    const partner = partnerOf(p, battle);
    const sc = num(p.atk_scale);
    if (!partner || !(sc > 0)) return;
    S.on('hit', (c) => {
      if (c.source !== u || isAddition(c.dmg) || !(c.dmg.amount > 0) || !c.target || c.target.side !== 'enemy' || !c.target.alive) return;
      if (!carries(battle, u, partner)) return;
      battle.dealDamage(u, c.target, { amount: c.dmg.amount * sc, type: 'true', canDodge: false, sourceless: true, tags: [...procTags('pegasus'), 'addition'] });
    });
  }),
  // 铳骑之威 (拉特兰): on attack 35 % ⇒ extra bullet at 1 enemy in range, atk_scale_1 (with 拉特兰桥夹 atk_scale_2) × ATK phys
  act1autochess_equip_acarm076_global_buff: late(function chess_item_6_02_e(battle, u, p, S, rec) {
    const partner = partnerOf(p, battle);
    S.on('attack', (c) => {
      if (c.attacker !== u || !c.targets.some((t) => t && t.side === 'enemy') || !memberOf(battle, u, 'lateranoShip')) return;
      if (!chance(battle, num(p.prob))) return;
      const cands = battle.enemiesInKeys(u.rangeKeys, u, u.profile);
      const t = battle.rng.pick(cands);
      if (!t) return;
      const sc = partner && carries(battle, u, partner) ? num(p.atk_scale_2) : num(p.atk_scale_1);
      battle.fx('strike', { x: t.x, y: t.y, id: t.id, src: 'item:chess_item_6_02_e', key: rec.id, from: u.id });
      battle.dealDamage(u, t, { amount: u.s.atk * sc, type: 'phys', tags: procTags('gunknight') });
    });
  }),
  // 天师古鼎 (炎): ASPD +attack_speed × min(operators gained this round, max_cnt) for the battle
  act1autochess_equip_acarm077_global_buff: late(function chess_item_6_03_e(battle, u, p, S) {
    if (!memberOf(battle, u, 'yanShip')) return;
    const k = Math.min(Math.floor(num(p.max_cnt, 3)), Math.max(0, Math.floor(num(contentInfo(battle, u.ownerId).roundStats?.gainedChess))));
    if (k > 0) S.stat('yan', { aspd: num(p.attack_speed) * k });
    // act1autochess_acarm077_buff's CreateBuff [attr] (INFINITY, overrideEffectKey trap_acarm40_buff) runs for a 炎 carrier
    // whatever the count [추정: a count of 0 makes it with +0]: 'item:cauldron' (render/fxstatus.js KEY_FX)
    if (passiveBuff(battle, u, 'item:cauldron', null, { visible: true })) S.track(u, 'item:cauldron');
  }),
  // 海沟实验体 (阿戈尔): hit taken ⇒ atk_scale × ATK arts to the source (lock_duration CD); + 阿戈尔重刃 ⇒ one more hit.
  //   Client buff graph act2autochess_equip_acarm078_global_buff: ON_BUFF_START AutoChessFilterCharacterBondIds egirShip
  //   without `_considerManiShip` (own bonds only — no 调和 member); ON_TAKE_DAMAGE (any damage, not a cancelled one) takes
  //   the [lock] before the damage nodes, so damage with no source to hit back still uses the 0.5 s
  act2autochess_equip_acarm078_global_buff: late(function chess_item_6_04_e(battle, u, p, S) {
    const partner = partnerOf(p, battle);
    const cd = num(p.lock_duration, 0.5), sc = num(p.atk_scale);
    let ready = -Infinity;
    S.on('damaged', (c) => {
      if (c.target !== u || battle.time < ready || isProc(c.dmg) || isHpLoss(c.dmg)) return;
      if (!u.alive || !unitBonds(u, battle).includes('egirShip')) return;
      ready = battle.time + cd;
      const src = c.source;
      if (!src || src.side !== 'enemy' || !src.alive) return;
      const hits = partner && carries(battle, u, partner) ? 2 : 1;
      for (let i = 0; i < hits && src.alive; i++) battle.dealDamage(u, src, { amount: u.s.atk * sc, type: 'arts', tags: procTags('trench') });
    });
  }),
  // 耶拉冈德之泪 (谢拉格): cold/frozen enemies in range take atk_scale (+不融冰: atk_scale_ex) × ATK arts every interval s.
  //   Client ability act2autochess_equip_acarm102_ability on each enemy in range: while it is 寒冷 / 冻结 a [buff] ticks
  //   (bb `interval`, waitFirstTriggerInterval false) — at once, then every interval s, a timer per enemy that stops when
  //   it thaws or leaves the range; the damage has no source (`_noSource`: hooks see none, the carrier keeps the credit).
  //   Until 2026-10-31: one battle-wide 1 s clock with a source
  act2autochess_equip_acarm102_ability: late(function chess_item_6_06_e(battle, u, p, S) {
    const partner = partnerOf(p, battle);
    const iv = Math.max(0.1, num(p.interval, 1));
    const next = new Map();
    S.every(0, () => {
      if (!onField(u) || !memberOf(battle, u, 'kjeragShip')) { next.clear(); return; }
      const seen = new Set();
      for (const e of battle.enemiesInKeys(u.rangeKeys, u, { canHitFly: true })) {
        const f = e.s.flags;
        if (!f.cold && !f.freeze) continue;
        seen.add(e);
        const due = next.get(e);
        if (due !== undefined && battle.time < due - 1e-9) continue;
        next.set(e, (due ?? battle.time) + iv);
        const sc = partner && carries(battle, u, partner) ? num(p.atk_scale_ex) : num(p.atk_scale);
        battle.dealDamage(u, e, { amount: u.s.atk * sc, type: 'arts', canDodge: false, sourceless: true, tags: procTags('tears') });
      }
      for (const e of next.keys()) if (!seen.has(e)) next.delete(e);
    });
  }),
  // 黄沙罗盘: 初始技力 +init_sp each deploy; (萨尔贡) first skill end of each deployment +sp; + 萨尔贡浓茶: each cast all 萨尔贡 +addition_sp
  //   every SP of it ignores 阻回 and the running-skill lock (PRTS; client buff template act1autochess_acarm103_buff: its three
  //   ModifySp nodes have _forceFlag, which skips the SpController's spRecoverStopped check — init_sp is 'init' already)
  act1autochess_equip_acarm103_global_buff: late(function chess_item_6_07_e(battle, u, p, S) {
    const partner = partnerOf(p, battle);
    const init = num(p.init_sp);
    if (init > 0) {
      S.on('deploy', (c) => { if (c.unit === u && u.skill) u.skill.gainSp(init, 'init'); });
      if (onField(u) && u.skill) u.skill.gainSp(init, 'init');
    }
    // "first skill end" per deployment: client buff template act1autochess_acarm103_buff resets has_used_skill on
    // ON_BUFF_START (every deployment) and ON_SKILL_FINISH gives `sp` only while it is 0 (until 2026-10-11: once per battle)
    let doneSeq = -1;
    S.on('skillEnd', (c) => {
      if (c.unit !== u || doneSeq === u.deploySeq || c.reason === 'death' || !memberOf(battle, u, 'sargonShip')) return;
      doneSeq = u.deploySeq;
      if (u.skill && u.alive) u.skill.gainSp(num(p.sp), 'item', false, { ignoreLock: true });
      tplFx(battle, u, 'bond_charge_battle_01', u); // act1autochess_acarm103_buff ON_SKILL_FINISH, after ModifySp
    });
    S.on('skillStart', (c) => {
      if (c.unit !== u || !partner || !memberOf(battle, u, 'sargonShip') || !carries(battle, u, partner)) return;
      const n = num(p.addition_sp);
      if (!(n > 0)) return;
      for (const a of battle.allyUnits) {
        if (a.kind === 'op' && a.ownerId === u.ownerId && onField(a) && a.skill && memberOf(battle, a, 'sargonShip')) a.skill.gainSp(n, 'item', false, { ignoreLock: true });
      }
    });
  }),
  // 家族徽章 (叙拉古): while 隐匿 ATK grows atk_per_sec/s up to +max_atk until the first damage after 隐匿 ends
  //   (or leaving the field); + 叙拉古正装 ⇒ that first hit also deals atk_scale × ATK true damage.
  //   Client buff graph act2autochess_equip_acarm122_global_buff: entering 隐匿 starts a [buff] that ticks once a second
  //   (waitFirstTriggerInterval) adding atk_per_sec — so it grows in whole seconds of each 隐匿 stint; leaving 隐匿 hands
  //   the value to [end] (and [ex] with the partner), which end on the first 普通伤害 instance (FilterDamageModifer NORMAL:
  //   not 溅射 / 持续 / 附加, not a dodged one). Until 2026-10-31: a smooth growth and any damage ended it
  act2autochess_equip_acarm122_global_buff: late(function chess_item_6_11_e(battle, u, p, S, rec) {
    const partner = partnerOf(p, battle);
    const key = S.key('stealth');
    const per = num(p.atk_per_sec), max = num(p.max_atk, 1);
    /** @type {{ bonus: number, seq: number, since: number | null, ticks: number }} */
    const st = { bonus: 0, seq: -1, since: null, ticks: 0 };
    S.every(0, () => {
      if (u.deploySeq !== st.seq) { st.seq = u.deploySeq; st.bonus = 0; st.since = null; }
      if (!onField(u) || !memberOf(battle, u, 'siracusaShip') || !u.s.flags.stealth) { st.since = null; return; }
      if (st.since === null) { st.since = battle.time; st.ticks = 0; }
      const k = Math.floor(battle.time - st.since + 1e-6);
      if (k <= st.ticks) return;
      st.ticks = k;
      if (st.bonus >= max) return;
      st.bonus = Math.min(max, st.bonus + per);
      S.buff(u, { key, mods: directMods({ atk: st.bonus }), refresh: 'replace' });
    });
    S.on('damaged', (c) => {
      if (c.source !== u || !isNormalDamage(c.dmg) || !(c.amount > 0) || st.bonus <= 0
        || u.deploySeq !== st.seq || !onField(u) || u.s.flags.stealth) return;
      // Read stealth at the damage event: the first hit can land before the next growth poll.
      // Claim the bonus before the combo's synchronous damage can re-enter this handler; keep its ATK for the combo.
      st.bonus = 0;
      if (partner && carries(battle, u, partner) && c.target && c.target.alive && c.target.side === 'enemy') {
        battle.dealDamage(u, c.target, { amount: u.s.atk * num(p.atk_scale), type: 'true', canDodge: false, tags: procTags('crest') });
        battle.fx('strike', { x: c.target.x, y: c.target.y, id: c.target.id, src: 'item:chess_item_6_11_e', key: rec.id, from: u.id });
      }
      battle.removeBuff(u, key);
    });
    S.on('death', (c) => { if (c.unit === u) st.bonus = 0; });
  }),
  // 叙拉古正装: allies on the two tiles beside the carrier ("左右两格", perpendicular to its direction: the facing-RIGHT
  // offsets (±1, 0) rotated by its dir) get ASPD +attack_speed
  act2autochess_equip_acarm121_ability: early(function act2autochess_equip_acarm121_ability(battle, u, p, S) {
    const v = num(p.attack_speed);
    if (!v) return;
    const key = S.key('side');
    const mods = { aspd: v };
    const SIDES = [[1, 0], [-1, 0]];
    S.every(0.5, () => {
      if (!onField(u)) return;
      for (const a of alliesAround(battle, u, SIDES)) if (a.kind === 'op') S.buff(a, { key, duration: 0.6, mods, refresh: 'replace' });
    }, { immediate: true });
  }),
};

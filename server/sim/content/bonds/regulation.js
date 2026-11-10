// server/sim/content/bonds/regulation.js — the battle side of 卫戍协议：规程's bond effects (shared/seasons.js `act3autochess`,
// its own bonds.json): the effects whose buff template is that season's (`act3autochess_bond_eff_*`). A bond's template
// key (its first buff's bbStr.key) picks the installer, so the default season's bonds never reach this file and the
// season's bonds that keep an older template (维多利亚, 阿戈尔: act1 keys, new numbers) stay in core.js. 萨尔贡's and
// 谢拉格's base effects keep their act-1 shape and run in core.js too (it knows both keys).
//
//   炎 (bondeffect_yan_2)       members ATK +(atk_base + atk_per_stack·L) (MULTIPLIER, 直接乘算); 6: every damage a member
//                               deals but an 附加 one adds a random element's 元素损伤 of ATK × min(ex_atk_scale_max,
//                               ex_atk_scale_base + per·L) (RandomSetter element_type 1…5: 神经 · 侵蚀 · 灼燃 · 凋亡 · 狂躁) —
//                               and every enemy of the field recovers from its 爆发冷却 ×(1 + min(max, base + per·L)) faster
//                               (yan[enemy] EP_BREAK_RECOVER_SPEED MULTIPLIER, the field's highest 炎 layers)
//   乌萨斯 (bondeffect_ursus)    members ATK / max HP +(base + per·L); a member's knock-out of an enemy → 临时层数 +2 (6: +4);
//                               6: every 1 s a blocking member deals ATK × (atk_scale_base + per·L) arts (持续) to each
//                               enemy it blocks, and the damage it takes from a living source (not 真实, not 持续) is cut by
//                               min(1, base + per·L), the cut part lost again over 10 s (one HP loss per second, 真实,
//                               credited to that source) unless the source is knocked out first
//   伊比利亚 (bondeffect_iberia) every damage a member deals to an enemy but an 附加 one (≤ 1 per 0.2 s per member and enemy)
//                               stacks a 持续法术伤害 on it (per member, ≤ 10, 10 s from the first, refreshed at 10): each
//                               second ATK × (base + per·L) × stacks arts; 6: twice that, −4 % move speed per hit (≤ 20, 10 s),
//                               and p = prob_base + per·L that the damage bounces to one random other enemy within 1.0 for
//                               atk_scale × ATK arts (溅射; a bounce never bounces)
//   莱塔尼亚 (bondeffect_lethania) members ATK +(atk_base + atk_per_stack·L). Its summons (“一个小节” / “一个乐部”) are not
//                               written yet (the maintainer's work list, bundle sim-K)
//   叙拉古 (bondeffect_siracusa_2) a member's deployment: ASPD +(base + per·L) for (base_duration + per·L) s; 6: an attack's
//                               damage (攻击 / 技能 ability family, not 持续; ≤ 1 per 0.2 s per member) rolls `prob`: one random
//                               status of 6 — 晕眩 · 恐惧 · 诱导 · 寒冷 · 麻痹 · 缚地 — for min(max, base + per·L) s; every
//                               1 s an enemy with 2 or more of them deals damage_value_base + per·L 真实 (无来源) to itself
//                               and the enemies within 1.1
//   卡西米尔 (bondeffect_kazimierz_2) every deployment on the field: members ATK +atk_when_born (≤ base + per·L, 直接乘算);
//                               6: for ex_damage_duration s after its deployment or a skill's cast, each damage a member
//                               deals but an 附加 one adds ATK × ex_atk_scale 真实 (附加). The 6-tier switch with the
//                               preparation bench's rightmost member is not written yet (bundle sim-K)
//   奥术 (bondeffect_arcane, act3 template) each damage a member deals but an 附加 or element one adds ATK × (atk_base +
//                               per·L) arts (附加); 3: each damage an enemy takes (not element) lowers its RES by 1, down to
//                               magic_res_max_base + per·L (≥ magic_res_max_min). The 3-tier 「攻击范围内的敌人隐匿效果失效」
//                               (the ability act3autochess_bond_mag_power[immune_invisible]) is not written yet
//   聚合 (bondeffect_doc)        allies in a member's attack range regenerate ATK × (heal_base + per·L) HP and recover
//                               ATK × (ep_heal_base + per·L) 元素损伤 per second; 3: they also have 庇护 damage_res_base + per·L
//
// Numbers: the season's bonds.json `buffs[].bb` (support buffParams by the template key). Live layers: buffs refresh one
// tick after a layerGain; procs read the layers when they happen. 「在场N名不同」 = the bond's count (core.js reached).
// [ASSUMED·CN] every rule here is read from the season's buff templates; the CN-only nodes (AutoChessAddBondStackCount,
// the runtime abilities) and the server's bookkeeping are not readable here — the comments name what each choice rests on.

import * as S from '../support/index.js';
import { reached } from './core.js';
import { isHpLoss, reduceElement } from '../../damage.js';
import { holdProtect } from '../kits/shared/tier1.js';
import { TICK } from '../../constants.js';

const num = S.num;

const KEY = Object.freeze({
  yan: 'act3autochess_bond_eff_yan',
  ursus: 'act3autochess_bond_eff_ursus',
  iberia: 'act3autochess_bond_eff_iberia[enemy]',
  lethania: 'act3autochess_bond_eff_lethania',
  siracusa: 'act3autochess_bond_eff_siracusa',
  kazimierz: 'act3autochess_bond_eff_kazimierz',
  arcane: 'act3autochess_bond_eff_arcane',
  doc: 'act3autochess_bond_eff_doc',
});

/** The element of RandomSetter element_type 1…5 (ElementType: 1 神经 · 2 侵蚀 · 3 灼燃 · 4 凋亡 · 5 狂躁, CN only). */
export const YAN_ELEMENTS = Object.freeze(['neural', 'erosion', 'burn', 'apoptosis', null]);
/** 叙拉古's random status (abnormal_buff[random_creator] AssignRandomKeyToBlackboard order). */
export const SIRACUSA_STATUSES = Object.freeze(['stun', 'fear', 'attract', 'cold', 'palsy', 'groundbind']);

const isFoe = (t) => !!t && t.side === 'enemy' && t.alive;
/** 附加伤害 (attack type ADDITION): the riders of items, bonds and kits (tag 'addition' / 'item'). */
const isAddition = (dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('addition') || dmg.tags.includes('item'));
/** 持续伤害 (the IS_CONTINUOUS shared flag / attack type BUFF). */
const isDot = (dmg) => !!dmg && Array.isArray(dmg.tags) && (dmg.tags.includes('dot') || dmg.tags.includes('periodic'));
const isElement = (c) => c.type === 'element' || c.dmg?.type === 'element' || c.dmg?.type === 'elemental';

/** Per-battle dispatch of the `damaged` hook by source unit (one hook for the whole module). */
function onDealt(battle, unit, fn) {
  const st = S.battleStore(battle, 'bonds:act3:dealt', () => ({ map: new Map(), hooked: false }));
  if (!st.map.has(unit)) st.map.set(unit, []);
  st.map.get(unit).push(fn);
  if (st.hooked) return;
  st.hooked = true;
  battle.on('damaged', (c) => {
    const list = c.source ? st.map.get(c.source) : undefined;
    if (list) for (let i = 0; i < list.length; i++) list[i](c);
  });
}

/** Re-run `fn` one tick after the bond's layers change (the gain is written after the hook). */
function onLayers(battle, pid, bondId, fn) {
  let pending = false;
  battle.on('layerGain', (c) => {
    if (c.playerId !== pid || c.bondId !== bondId || pending) return;
    pending = true;
    battle.after(0, () => { pending = false; fn(); });
  }, { priority: -100 });
}

/** Members' standing ATK / HP bonus `+(base + per·L)`, live. */
function standing(battle, pid, bondId, members, key, parts) {
  const apply = () => {
    const L = S.bondLayers(battle, pid, bondId);
    const v = {};
    for (const [stat, [base, per]] of Object.entries(parts)) v[stat] = num(base) + num(per) * L;
    const mods = S.directMods(v);
    for (const u of members) S.passiveBuff(battle, u, key, mods);
  };
  apply();
  onLayers(battle, pid, bondId, apply);
}

/** The highest layers of `bondId` among the field's players that reached `cnt` members (…InCurArea). */
function fieldMaxLayers(battle, bondId, cnt) {
  let best = -1;
  for (const p of battle.players) if (reached(battle, p.playerId, bondId, cnt)) best = Math.max(best, S.bondLayers(battle, p.playerId, bondId));
  return best;
}

// =====================================================================================================================
// 炎

function installYan(battle, pid, bb, members) {
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

// =====================================================================================================================
// 乌萨斯

/** Extra 临时层数 per knock-out a strategy adds (the AUTOCHESS global `<player>.ursus_extra_bond_stack_cnt[power]`). */
export function ursusExtra(battle, pid) {
  return S.battleStore(battle, 'bond:ursus:extra', () => new Map()).get(pid) ?? { normal: 0, power: 0 };
}

function installUrsus(battle, pid, bb, members) {
  standing(battle, pid, 'ursusShip', members, 'bond:ursus', { atk: [bb.atk_base, bb.atk_per_stack], hp: [bb.hp_base, bb.hp_per_stack] });
  const memberSet = new Set(members);
  const power = reached(battle, pid, 'ursusShip', bb.power_bond_char_cnt);
  // ON_TARGET_KILLED: a member knocks out a unit ("击倒其他单位"; [ASSUMED·CN: an enemy — the units a member's damage knocks out;
  // the event's target kinds are a CN-only node])
  battle.on('death', (c) => {
    if (c.reason !== 'killed' || !c.killer || !memberSet.has(c.killer) || !c.unit || c.unit.side !== 'enemy') return;
    const extra = ursusExtra(battle, pid);
    const n = power ? num(bb['temp_bond_stack_cnt[power]']) + num(extra.power) : num(bb.temp_bond_stack_cnt) + num(extra.normal);
    S.gainLayers(battle, { playerId: pid, bonds: 'ursusShip', n, source: c.killer, reason: 'bond', temp: true });
  });
  if (!power) return;
  // [block_enemy]: every 1 s from the member's arrival (triggerInterval 1, waitFirstTriggerInterval) while it blocks
  const blockScale = () => num(bb.atk_scale_base) + num(bb.atk_scale_per_stack) * S.bondLayers(battle, pid, 'ursusShip');
  const next = new Map();
  battle.every(0, () => {
    for (const m of members) {
      if (!S.onField(m)) { next.delete(m); continue; }
      const due = next.get(m);
      if (due === undefined) { next.set(m, battle.time + 1); continue; }
      if (battle.time < due - 1e-9) continue;
      next.set(m, due + 1);
      const k = blockScale();
      if (!(k > 0) || !m.blocking || !m.blocking.length) continue;
      for (const e of m.blocking.slice()) if (isFoe(e)) battle.dealDamage(m, e, { amount: k * num(m.s.atk), type: 'arts', tags: ['bond:ursus', 'dot'] });
    }
  });
  // ON_TAKE_DAMAGE: the cut (DamageScale one-minus) and its 10 s HP loss
  const cutOf = () => Math.min(num(bb.damage_one_minus_max, 1), num(bb.damage_one_minus_base) + num(bb.damage_one_minus_per_stack) * S.bondLayers(battle, pid, 'ursusShip'));
  battle.on('hit', (c) => {
    const t = c.target, dmg = c.dmg, src = c.source;
    if (!memberSet.has(t) || !dmg || dmg.cancel || dmg.ursusCut || !src || !src.alive || dmg.sourceless) return;
    if (dmg.type === 'true' || dmg.type === 'element' || isDot(dmg) || isHpLoss(dmg)) return;
    // (the cap, 1, is past the 999 layers: 0.15 + 0.0005·L reaches it at 1700)
    const f = cutOf();
    if (!(f > 0) || f >= 1) return;
    dmg.mul *= Math.max(0, 1 - f);
    dmg.ursusCut = f;
  }, { priority: -30 });
  battle.on('damaged', (c) => {
    const t = c.target, dmg = c.dmg, src = c.source;
    if (!memberSet.has(t) || !dmg || !dmg.ursusCut) return;
    const f = dmg.ursusCut;
    dmg.ursusCut = 0;
    const lost = (num(c.amount) / (1 - f)) * f;
    if (!(lost > 0) || !src) return;
    bleed(battle, t, src, lost / num(bb.bleed_duration, 10), Math.round(num(bb.bleed_duration, 10)));
  });
}

/** [bleed]: `per` 真实 each second for `ticks` s, credited to `src`, ended when `src` is knocked out (one per hit). */
function bleed(battle, t, src, per, ticks) {
  let n = 0;
  const s = battle.every(1, () => {
    if (!t.alive || !src.alive || ++n > ticks) { s.cancel(); return; }
    battle.dealDamage(src, t, { amount: per, type: 'true', canDodge: false, tags: ['bond:ursus:bleed', 'dot'] });
    if (n >= ticks) s.cancel();
  });
}

// =====================================================================================================================
// 伊比利亚

function installIberia(battle, pid, bb, members) {
  const st = S.battleStore(battle, 'bond:iberia', () => ({ owners: new Map(), dots: new Map(), slow: new Map(), cd: new Map(), hooked: false }));
  for (const u of members) st.owners.set(u, { pid, bb });
  if (st.hooked) return;
  st.hooked = true;
  const L = (o) => S.bondLayers(battle, o.pid, 'iberiaShip');
  battle.on('damaged', (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    const o = u ? st.owners.get(u) : null;
    if (!o || !isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg) || dmg.tags?.includes('bond:iberia:dot')) return;
    // [enemy_cd]: 0.2 s per enemy and member
    const cdKey = `${t.id}|${u.id}`;
    if (battle.time < (st.cd.get(cdKey) ?? -Infinity) - 1e-9) return;
    st.cd.set(cdKey, battle.time + 0.2);
    const power = reached(battle, o.pid, 'iberiaShip', o.bb.power_bond_char_cnt);
    addDot(battle, st, t, u, o);
    if (!power) return;
    slowStack(battle, st, t, o.bb);
    if (dmg.tags?.includes('bond:iberia:bounce') || !t.alive) return;
    const p = num(o.bb.prob_base) + num(o.bb.prob_per_stack) * L(o);
    if (!battle.rng.chance(p)) return;
    const near = battle.foesInRadius(t.x, t.y, 1.0).filter((e) => e !== t && e.alive);
    if (!near.length) return;
    const e = battle.rng.pick(near);
    battle.dealDamage(u, e, { amount: num(o.bb.atk_scale, 3) * num(u.s.atk), type: 'arts', isSplash: true, tags: ['bond:iberia:bounce'] });
    S.tplFx(battle, e, 'map_v079_water_hit_01', u);
  });
}

/** [enemy][dot]: STACK ≤ 10 per (enemy, member), 10 s from its first stack (refreshed only at 10), a tick per second. */
function addDot(battle, st, t, u, o) {
  const key = `${t.id}|${u.id}`;
  const cur = st.dots.get(key);
  const dur = num(o.bb.dot_duration, 10);
  if (cur && !cur.done) {
    if (cur.stacks < 10) cur.stacks++;
    else cur.until = battle.time + dur;
    return;
  }
  const d = { stacks: 1, until: battle.time + dur, done: false, atk: num(u.s.atk) };
  st.dots.set(key, d);
  const s = battle.every(1, () => {
    if (!t.alive || battle.time > d.until + 1e-9) { d.done = true; s.cancel(); return; }
    const L = S.bondLayers(battle, o.pid, 'iberiaShip');
    let k = (num(o.bb.dot_atk_scale_base) + num(o.bb.dot_atk_scale_per_stack) * L) * d.stacks;
    if (reached(battle, o.pid, 'iberiaShip', o.bb.power_bond_char_cnt)) k *= 2;
    if (!(k > 0)) return;
    // a living source deals it (its ATK now, cached); a gone one: 无来源 damage of the cached ATK
    if (u.alive) { d.atk = num(u.s.atk); battle.dealDamage(u, t, { amount: k * d.atk, type: 'arts', canDodge: false, noSp: true, tags: ['bond:iberia:dot', 'dot'] }); }
    else battle.dealDamage(null, t, { amount: k * d.atk, type: 'arts', canDodge: false, sourceless: true, tags: ['bond:iberia:dot', 'dot'] });
    if (battle.time >= d.until - 1e-9) { d.done = true; s.cancel(); }
  });
}

/** [enemy][speed]: one STACK per enemy (≤ max_stack_cnt), move speed ×(1 + move_speed × stacks), 10 s, refreshed at max. */
function slowStack(battle, st, t, bb) {
  const pre = 'act3autochess_bond_eff_iberia[enemy][speed].';
  const max = Math.max(1, Math.floor(num(bb[pre + 'max_stack_cnt'], 20)));
  const per = num(bb[pre + 'move_speed'], -0.04);
  const dur = num(bb[pre + 'speed_duration'], 10);
  const cur = st.slow.get(t);
  const live = cur && t.findBuff('bond:iberia:slow');
  const stacks = live ? Math.min(max, cur.stacks + 1) : 1;
  const refresh = !live || (cur.stacks >= max);
  st.slow.set(t, { stacks });
  const mods = { moveMul: Math.max(0, 1 + per * stacks) };
  if (refresh) battle.addBuff(t, { key: 'bond:iberia:slow', duration: dur, refresh: 'replace', mods, onExpire: () => st.slow.delete(t) });
  else { live.mods = mods; t.markDirty(); }
}

// =====================================================================================================================
// 莱塔尼亚 (ATK; the summons are not written yet)

function installLethania(battle, pid, bb, members) {
  standing(battle, pid, 'lethaniaShip', members, 'bond:lethania', { atk: [bb.atk_base, bb.atk_per_stack] });
}

// =====================================================================================================================
// 叙拉古

function installSiracusa(battle, pid, bb, members) {
  const memberSet = new Set(members);
  battle.on('deploy', ({ unit }) => {
    if (!memberSet.has(unit)) return;
    const L = S.bondLayers(battle, pid, 'siracusaShip');
    const dur = num(bb.base_duration) + num(bb.duration_per_stack) * L;
    if (dur > 0) battle.addBuff(unit, { key: 'bond:siracusa', duration: dur, mods: { aspd: num(bb.base_attack_speed) + num(bb.attack_speed_per_stack) * L } });
  });
  if (!reached(battle, pid, 'siracusaShip', bb.power_bond_char_cnt)) return;
  const next = new Map();
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    // FilterAbilityFamily ATTACK_OR_COMBAT: the member's attacks and skills, not a bond's / an item's rider; not 持续
    if (!isFoe(t) || !dmg || isElement(c) || isDot(dmg) || isAddition(dmg) || isHpLoss(dmg) || dmg.sourceless) return;
    if (dmg.tags?.some((x) => typeof x === 'string' && x.startsWith('bond:'))) return;
    if (battle.time < (next.get(u) ?? -Infinity) - 1e-9) return;
    if (!battle.rng.chance(num(bb.prob))) return;
    next.set(u, battle.time + 0.2);
    const dur = Math.min(num(bb.ab_buff_duration_max, Infinity), num(bb.ab_buff_duration_base) + num(bb.ab_buff_duration_per_stack) * S.bondLayers(battle, pid, 'siracusaShip'));
    const status = SIRACUSA_STATUSES[battle.rng.int(SIRACUSA_STATUSES.length)];
    if (dur > 0) battle.applyStatus(t, status, { duration: dur, source: u, ...(status === 'palsy' ? { value: 1 } : {}) });
  };
  for (const u of members) onDealt(battle, u, onDmg);
  // siracusa_power[enemy]: one per field (the highest 叙拉古 layers among the players at 6), every 1 s per enemy
  const st = S.battleStore(battle, 'bond:siracusa2:enemy', () => ({ on: false }));
  if (st.on) return;
  st.on = true;
  battle.every(1, () => {
    const L = fieldMaxLayers(battle, 'siracusaShip', bb.power_bond_char_cnt);
    if (L < 0) return;
    const amount = num(bb.damage_value_base) + num(bb.damage_value_per_stack) * L;
    const limit = num(bb.abnormal_buff_count_limit, 2);
    for (const e of battle.enemies.slice()) {
      if (!e.alive || !e.deployed || abnormalCount(e) < limit) continue;
      for (const x of battle.enemiesInRadius(e.x, e.y, 1.1)) {
        if (x.alive) battle.dealDamage(null, x, { amount, type: 'true', canDodge: false, sourceless: true, isSplash: true, tags: ['bond:siracusa'] });
      }
      S.tplFx(battle, e, 'map_v079_hit01', e);
    }
  });
}

/** abnormal_buff[count]: 晕眩, 恐惧, 诱导, 寒冷 or 冻结 (one), 麻痹, 缚地. */
export function abnormalCount(u) {
  const f = u.s.flags;
  return (f.stun && !f.freeze ? 1 : 0) + (f.fear ? 1 : 0) + (f.attract ? 1 : 0) + (f.cold || f.freeze ? 1 : 0)
    + (u.findBuff('palsy') ? 1 : 0) + (f.groundbind ? 1 : 0);
}

// =====================================================================================================================
// 卡西米尔

function installKazimierz(battle, pid, bb, members) {
  // kazimierz_born: one count for the field (core.js installKazimierz, the same global blackboard)
  const st = S.battleStore(battle, 'bond:kazimierz:born', () => ({ deploys: 0, applies: [] }));
  const apply = () => {
    const cap = num(bb.base_max_atk_when_born) + num(bb.max_atk_when_born_per_stack) * S.bondLayers(battle, pid, 'kazimierzShip');
    const bonus = Math.max(0, Math.min(cap, st.deploys * num(bb.atk_when_born)));
    if (bonus > 0) for (const u of members) S.passiveBuff(battle, u, 'bond:kazimierz', S.directMods({ atk: bonus }));
  };
  st.applies.push(apply);
  battle.on('deploy', ({ unit }) => {
    if (!S.isOp(unit) || unit.ownerId !== pid) return;
    st.deploys++;
    for (const f of st.applies) f();
  });
  onLayers(battle, pid, 'kazimierzShip', apply);
  if (!reached(battle, pid, 'kazimierzShip', bb.power_bond_char_cnt)) return;
  const memberSet = new Set(members);
  const dur = num(bb.ex_damage_duration, 30);
  const until = new Map();
  // [ex_damage] (EXTEND): from the member's arrival (kazimierz_power ON_BUFF_START) and every skill cast
  battle.on('deploy', ({ unit }) => { if (memberSet.has(unit)) until.set(unit, battle.time + dur); });
  battle.on('skillStart', ({ unit }) => { if (memberSet.has(unit)) until.set(unit, battle.time + dur); });
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    if (!isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg) || battle.time > (until.get(u) ?? -Infinity) + 1e-9) return;
    const k = Math.min(num(bb.ex_atk_scale_max, Infinity), num(bb.ex_atk_scale_base) + num(bb.ex_atk_scale_per_stack) * S.bondLayers(battle, pid, 'kazimierzShip'));
    if (k > 0) battle.dealDamage(u, t, { amount: k * num(u.s.atk), type: 'true', canDodge: false, tags: ['bond:kazimierz', 'addition'] });
  };
  for (const u of members) onDealt(battle, u, onDmg);
}

// =====================================================================================================================
// 奥术

function installArcane(battle, pid, bb, members) {
  const onDmg = (c) => {
    const u = c.source, t = c.target, dmg = c.dmg;
    if (!isFoe(t) || !dmg || isElement(c) || isAddition(dmg) || isHpLoss(dmg)) return;
    const k = num(bb.atk_base) + num(bb.atk_per_stack) * S.bondLayers(battle, pid, 'arcaneShip');
    if (k > 0) battle.dealDamage(u, t, { amount: k * num(u.s.atk), type: 'arts', tags: ['bond:arcane', 'addition'] });
  };
  for (const u of members) onDealt(battle, u, onDmg);
  if (!reached(battle, pid, 'arcaneShip', bb.power_bond_char_cnt)) return;
  // arcane_power[enemy]: one per field, the highest 奥术 layers among the players at 3
  const st = S.battleStore(battle, 'bond:arcane3:enemy', () => ({ on: false, cut: new Map() }));
  if (st.on) return;
  st.on = true;
  battle.on('damaged', (c) => {
    const t = c.target;
    if (!isFoe(t) || !c.dmg || isElement(c) || isHpLoss(c.dmg)) return;
    const L = fieldMaxLayers(battle, 'arcaneShip', bb.power_bond_char_cnt);
    if (L < 0) return;
    const floor = Math.max(num(bb.magic_res_max_min, -100), num(bb.magic_res_max_base) + num(bb.magic_res_max_per_stack) * L);
    const cur = st.cut.get(t) ?? 0;
    if (!(cur > floor)) return;
    const v = Math.max(floor, cur + num(bb.magic_res_add, -1));
    st.cut.set(t, v);
    S.passiveBuff(battle, t, 'bond:arcane:res', { resFlat: v });
  });
}

// =====================================================================================================================
// 聚合

function installDoc(battle, pid, bb, members) {
  const st = S.battleStore(battle, 'bond:doc', () => ({ list: [] }));
  st.list.push({ pid, bb, members });
  if (st.list.length > 1) return;
  // [aura] from each member on the allies of its attack range, kept for one tick at a time (the strongest per stat)
  battle.every(0, () => {
    const regen = new Map(), ep = new Map(), shelter = new Map();
    for (const { pid: p, bb: b, members: ms } of st.list) {
      const L = S.bondLayers(battle, p, 'docShip');
      const power = reached(battle, p, 'docShip', b.power_bond_char_cnt);
      for (const m of ms) {
        if (!S.onField(m)) continue;
        const atk = num(m.s.atk);
        const h = atk * (num(b.heal_base) + num(b.heal_per_stack) * L);
        const e = atk * (num(b.ep_heal_base) + num(b.ep_heal_per_stack) * L);
        const d = power ? num(b.damage_res_base) + num(b.damage_res_per_stack) * L : 0;
        for (const a of alliesInRange(battle, m)) {
          regen.set(a, (regen.get(a) ?? 0) + h);
          ep.set(a, (ep.get(a) ?? 0) + e);
          if (d > (shelter.get(a) ?? 0)) shelter.set(a, d);
        }
      }
    }
    for (const a of battle.allyUnits) {
      const h = regen.get(a) ?? 0;
      if (h > 0) battle.addBuff(a, { key: 'bond:doc:regen', duration: 1.5 * TICK, refresh: 'replace', mods: { hpRegen: h } });
      const e = ep.get(a) ?? 0;
      if (e > 0) reduceElement(a, e * TICK);
      const d = shelter.get(a) ?? 0;
      if (d > 0) holdProtect(battle, a, d, 1.5 * TICK, a);
    }
  });
}

/** 「攻击范围内的我方单位」: deployed allies whose tile is in the member's range (Battle.allySelectable). */
function alliesInRange(battle, m) {
  const set = m.rangeKeySet || new Set(m.rangeKeys || []);
  return battle.allyUnits.filter((a) => a.alive && a.deployed && !a.hidden && a.kind !== 'device' && set.has(a.tileR * S.COLS + a.tileC) && battle.allySelectable(a, m));
}

// =====================================================================================================================
// entry point

const INSTALLERS = Object.freeze({
  [KEY.yan]: ['yanShip', installYan],
  [KEY.ursus]: ['ursusShip', installUrsus],
  [KEY.iberia]: ['iberiaShip', installIberia],
  [KEY.lethania]: ['lethaniaShip', installLethania],
  [KEY.siracusa]: ['siracusaShip', installSiracusa],
  [KEY.kazimierz]: ['kazimierzShip', installKazimierz],
  [KEY.arcane]: ['arcaneShip', installArcane],
  [KEY.doc]: ['docShip', installDoc],
});

/**
 * The bond's numbers when its record has template `key` — every buff's blackboard of the record together (its env buffs
 * on the members and on the enemies, `[enemy]`, share one bond blackboard) —, else null.
 */
export function regulationBb(bondId, key, scope) {
  const rec = S.bondRecord(bondId, scope);
  if (!S.buffParams(rec, key)) return null;
  const out = {};
  for (const b of S.buffsOf(rec)) Object.assign(out, b.p);
  return out;
}

export function install(battle) {
  if (!battle || !Array.isArray(battle.players)) return;
  for (const p of battle.players) {
    const pid = p.playerId;
    if (!p.bonds || typeof p.bonds !== 'object') continue;
    for (const [key, [bondId, fn]] of Object.entries(INSTALLERS)) {
      if (!S.bondActive(battle, pid, bondId)) continue;
      const bb = regulationBb(bondId, key, battle);
      if (!bb) continue;
      const members = S.bondMembers(battle, pid, bondId);
      if (!members.length) continue;
      fn(battle, pid, bb, members);
    }
  }
}

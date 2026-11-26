// server/sim/content/enemies/reborn.js — REBORN 复苏 kits of 卫戍协议：规程 (factions.json type REBORN, "此类敌人首次被击倒后会重生")
// and the units they bring: the 萨卡兹子裔 of the main story (official prefabs battle/enm_pfb_10 / _14, EN and CN alike),
// 规程's own 萨卡兹子裔寄生者 (CN prefab battle/enm_pfb_36), the 变异 beasts that split (enm_pfb_7), the 饲育者 and 集养者 of
// the sea (enm_pfb_17) and two 骑士团 knights (enm_pfb_6). Their part of KITS.
//
// The 子裔 do not stand up again themselves: their first knock-out summons a 重生造物 (enemy_vampires[bloodsucker_summon] /
// enemy_dthrow_summon[dzoms]: ON_OWNER_KILLED, not a FALLDOWN, SummonEnemiesFollowMyRoute — the blackboard `delay` s after
// the knock-out, where it fell, on the rest of its route). The 重生造物 (大君之触 / 仁慈之触 / 大君之赐 / 慷慨之赐) carry
// enemy_bloodsucker_mark, which the auras of the 补给车 and the 集恨者 look for.

import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { T, elem, hurt, areaAllies, allTargets, remainingRoute, spawnChildren, auraBuff, watchDeaths, silenced, mode, setForm, atCastEvent } from './helpers.js';
import { interruptEnemyCast } from '../../ai.js';
import { ep, reborn, skill } from './archetypes.js';
import { hypot, powi } from '../../detmath.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { AbState, AbSkill, AbList, AbFn, AbKit, EnemyAbility, EnemyKit } from '../enemies.js' */
/** @import { BuffTick } from './helpers.js' */

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** How often the auras below are refreshed (their own update is the engine's every tick; a timed buff refreshed this often). */
const AURA_EVERY = 0.1;
/**
 * 萨卡兹子裔责罚者's StunAttack range: its `Skills/StunAttack/Selector` CircleRange radius (prefab CircleCollider2D 1) — a
 * range selector, so a unit is in when its collider touches the circle, as the engine reads an enemy's attack range
 * (ALLY_COLLIDER_RADIUS).
 */
const DFAT_STUN_RADIUS = 1, DFAT_STUN_REACH = DFAT_STUN_RADIUS + ALLY_COLLIDER_RADIUS;
/** The 重生造物 (enemy_bloodsucker_mark holders: prefab `CommonAbility/mark`). */
const CONSTRUCTS = new Set(['enemy_1220_dzoms', 'enemy_1220_dzoms_2', 'enemy_1221_dzomg', 'enemy_1221_dzomg_2']);
/** 萨卡兹子裔寄生者's aura validator (SingleIdTargetValidator `_targetId`, `_reverse`, not from the blackboard): this one id is left out. */
const PARASITE_SKIPS = 'enemy_1220_dzoms';

/** The summon nodes' `_randomOffsetBound` where the blackboard has no `offset_bound` (spawnChildren `spot`): 子裔 / 掷骨者
 *  (enemy_vampires[bloodsucker_summon], enemy_dthrow_summon[dzoms]), 血珀 (enemy_dfello_summon[dseed]) and the 变异 beasts'
 *  split (deathrattle_sum[walk_only]) 0.1; 集养者's copy (dsdivi_tr_1, …WithBuff) 1.2; the others 0. */
const SUMMON_JITTER = 0.1, DSDIVI_JITTER = 1.2;

const isConstruct = (/** @type {Unit} */ u) => !!u && u.alive && !u.hidden && CONSTRUCTS.has(u.defId);

// ---------------------------------------------------------------------------------------------------------------
// shared pieces

/**
 * The 子裔's summon on its first knock-out: `key` (the talent's `enemy_key`), `delay` s later (the blackboard `delay`,
 * SummonEnemiesFollowMyRoute reads it over its `_delayTime`), at the spot it fell, on the rest of its route. Only a
 * knock-out (`killed` — not a leak, not a FALLDOWN), silenced or not (neither template checks 沉默). The battle waits for
 * it (`holdsBattle`). The spot: the centre of the tile it fell on ± `offset_bound` (SUMMON_JITTER) on each axis
 * (spawnChildren `spot`). [추정·엔진: the summoned unit's own `_delayToBorn` (1 s, Enemy.States.BornState: it waits that
 * long before it moves) is not modelled, as for every enemy (server/sim/routePreview.js) — an engine rule for all seasons]
 * @param {string | null | undefined} key @param {number} delay @param {number} [bound] @returns {EnemyAbility}
 */
const rebornSummon = (key, delay, bound = SUMMON_JITTER) => ({
  death(c, b, e) {
    if (c.reason !== 'killed' || !key) return;
    const route = remainingRoute(e), pos = [e.y, e.x];
    const go = () => spawnChildren(b, e, key, 1, { route, pos, spot: { bound } });
    if (delay > 0) b.after(delay, go, { holdsBattle: true }); else go();
  },
});
/** @param {string} prefix @returns {AbKit} */
const kitReborn = (prefix) => (ab) => [rebornSummon(ab.tS[`${prefix}.enemy_key`], T(ab, `${prefix}.delay`) ?? 0, T(ab, `${prefix}.offset_bound`) ?? SUMMON_JITTER)];

/**
 * A 重生造物: physical and arts damage taken × (1 − `dmg_res.damage_resistance`) (enemy_dzoms_t[damage_resistance], the
 * `damage_resistance` template); while blocked (Talents/buff_to_blocker: BlockedToggleChecker `_blockMinCnt` 1, its
 * `_buffsToBlockee` enemy_bloodsucker_block_cnt[control]) its blocker blocks `buff_to_blocker.block_cnt` more — one stack per
 * 重生造物 it blocks, at most `buff_to_blocker.max_valid_stack_cnt` (「最多+6」). With a 补给车 of a kind on the field (each
 * kind its own buff, enemy_dsuply_t / enemy_dsuply_2_t): ATK × (1 + `atk` × n) for n of them up to `max_valid_stack_cnt`,
 * and each damage it deals adds 凋亡 of its ATK × `ep_damage_ratio` × n (ApplyElementDamage DARK `_multiplyWithBuffValidStackCnt`).
 * @type {AbKit}
 */
function kitConstruct(ab) {
  const cut = 1 - (T(ab, 'dmg_res.damage_resistance') ?? 0);
  const add = T(ab, 'buff_to_blocker.block_cnt') ?? 0, cap = T(ab, 'buff_to_blocker.max_valid_stack_cnt') ?? Infinity;
  return [{
    spawn(b, e) {
      if (cut !== 1) b.addBuff(e, { key: 'ab:construct', persist: true, mods: { physTakenMul: cut, artsTakenMul: cut } });
    },
  }, {
    iv: AURA_EVERY,
    tick(b, e) {
      const u = e.blockedBy;
      if (!u || !(add > 0)) return;
      let n = 0;
      for (const o of b.aliveEnemies()) if (isConstruct(o) && o.blockedBy === u) n++;
      if (n > 0) auraBuff(b, u, 'ab:bloodsuckerBlock', AURA_EVERY, { blockCnt: add * Math.min(cap, n) }, null, true);
    },
  }, {
    iv: AURA_EVERY,
    tick(b, e, /** @type {EnemyAbility & { ep: number }} */ a) {
      a.ep = 0;
      const atk = supply(b);
      let pct = 0;
      for (const s of atk) { pct += s.atk * s.n; a.ep += s.ep * s.n; }
      if (pct > 0) auraBuff(b, e, 'ab:dsuply', AURA_EVERY, { atkPct: pct }, null, true);
    },
    dealt(c, b, e, a) { if (/** @type {number} */ (a.ep) > 0) elem(b, e, c.target, 'apoptosis', e.s.atk * /** @type {number} */ (a.ep)); },
  }];
}

/** The 补给车 on the field by kind: [{ n (capped), atk, ep }] — a silenced one gives nothing (its talent is SilenceableTalent).
 * @param {Battle} b */
function supply(b) {
  const by = new Map();
  for (const o of b.aliveEnemies()) {
    if (o.hidden || silenced(o) || !SUPPLY.has(o.defId) || !o.mem.ab) continue;
    const k = o.defId, p = SUPPLY.get(k), t = o.mem.ab;
    const r = by.get(k) ?? { n: 0, cap: T(t, `aura.${p}[attr_buff].max_valid_stack_cnt`) ?? Infinity, atk: T(t, `aura.${p}[attr_buff].atk`) ?? 0, ep: T(t, 'aura.ep_damage_ratio') ?? 0 };
    r.n = Math.min(r.cap, r.n + 1);
    by.set(k, r);
  }
  return [...by.values()];
}
/** 补给车 key → its aura buff's blackboard prefix (enemy_dsuply_t[aura] / enemy_dsuply_2_t[aura]). */
const SUPPLY = new Map([['enemy_1224_dsuply', 'enemy_dsuply_t'], ['enemy_1224_dsuply_2', 'enemy_dsuply_2_t']]);

/** 萨卡兹子裔补给车 · no ability of its own here: the 重生造物 read the aura (kitConstruct, supply); SILENCE turns it off. */
const kitSupply = () => [{ silAware: true }];

/**
 * 萨卡兹子裔工匠 / 组长: its charge_gunctrl (SILENCE line) charges a 伦蒂尼姆城防副炮 — the selector takes only units tagged
 * `gunctrl` over the field and this mode has none, so it never casts (marked silence-aware: its line is that skill's).
 */
const kitMech = (/** @type {AbState} */ ab) => [...kitReborn('deathrattle')(ab), { silAware: true }];

/**
 * 萨卡兹子裔集恨者 / 集怒者: a GlobalAuraAbility on every 重生造物 (FilterBuffTargetValidator enemy_bloodsucker_mark), each
 * giving it one stack of enemy_dklord_atk — ATK × (1 + `aura.atk` × n), n up to `aura.max_valid_stack_cnt`. Not silenceable
 * (a plain Talent, a NORMAL line).
 * @type {AbKit}
 */
function kitLord(ab) {
  const per = T(ab, 'aura.atk') ?? 0, cap = T(ab, 'aura.max_valid_stack_cnt') ?? Infinity;
  return [...kitReborn('deathrattle')(ab), {
    iv: AURA_EVERY,
    tick(b, e) {
      let n = 0;
      for (const o of b.aliveEnemies()) if (isConstruct(o)) n++;
      n = Math.min(cap, n);
      if (n > 0 && per > 0) auraBuff(b, e, 'ab:dklord', AURA_EVERY, { atkPct: per * n }, null, true);
    },
  }];
}

/**
 * 萨卡兹子裔链术师: an arts attack with 凋亡 of ATK × `epdamage.attack@ep_damage_ratio` that jumps on to
 * `epdamage.attack@max_target` units in all, each jump from the last one hit to the nearest unit within
 * `epdamage.attack@projectile_range` its area selection takes, its damage × `epdamage.attack@chain.atk_scale` once more per
 * jump — the official client's projectile_enemy_dkmage (ChainLightningHitBehaviour + ChainedSelector: the nearest to the
 * spot hit first, then the nearest not hit yet from the last one, all at once; from the second on the scale goes through
 * Projectile.ApplyAtkScaleToDamageNode with `alsoApplyToElementDamage`, so the 凋亡 falls off with the damage).
 * @type {AbKit}
 */
function kitChainMage(ab) {
  const ratio = T(ab, 'epdamage.attack@ep_damage_ratio') ?? 0, n = T(ab, 'epdamage.attack@max_target') ?? 1;
  const fall = T(ab, 'epdamage.attack@chain.atk_scale') ?? 1, jr = T(ab, 'epdamage.attack@projectile_range') ?? 0;
  return [...kitReborn('deathrattle')(ab), ep('apoptosis', ratio), {
    dealt(c, b, e) {
      let prev = c.target;
      const hit = new Set([prev]);
      for (let k = 1; k < n; k++) {
        const from = prev;
        const nx = areaAllies(b, e, from.x, from.y, jr).filter((u) => !hit.has(u))
          .sort((p, q) => hypot(p.x - from.x, p.y - from.y) - hypot(q.x - from.x, q.y - from.y))[0];
        if (!nx) break;
        hit.add(nx);
        const s = powi(fall, k);
        hurt(b, e, nx, e.s.atk * s, 'arts', { isSkill: false });
        if (ratio > 0) elem(b, e, nx, 'apoptosis', e.s.atk * ratio * s);
        prev = nx;
      }
    },
  }];
}

/**
 * 萨卡兹子裔轰击者 / 毁击者: its shell (projectile_enemy_dthrow, `_projectileDestination` 1 — to the target's spot) lies
 * there `Attack.attack@projectile_delay_time` s, then blows up: physical ATK × 1 to every unit its area selection takes
 * within `Attack.attack@projectile_radius` — the target included only if still there. The ATK is the one it fired with.
 * @type {AbKit}
 */
function kitThrower(ab) {
  const wait = T(ab, 'Attack.attack@projectile_delay_time') ?? 0, r = T(ab, 'Attack.attack@projectile_radius') ?? 0;
  return [...kitReborn('Attack')(ab), {
    hitOut(c, b, e) {
      if (!c.dmg.isAttack || !c.target) return;
      c.dmg.cancel = true;
      const x = c.target.x, y = c.target.y, atk = e.s.atk;
      b.fx('telegraph', { x, y, r, dur: wait, kind: 'dthrowShell', id: e.id });
      b.after(wait, () => {
        b.fx('explode', { x, y, r, kind: 'dthrowShell' });
        for (const u of areaAllies(b, e, x, y, r)) hurt(b, e, u, atk, 'phys', { isSkill: false });
      }, { holdsBattle: false });
    },
  }];
}

/**
 * 萨卡兹子裔责罚者 / 惩戒者: StunAttack (SILENCE line, `spCost` 3 — one SP per normal attack). With the SP full it is cast
 * at an attack slot in place of the normal attack (content/enemies.js onSkillSlot, its `skillCast`: the `Skill` clip, the
 * ATTACK and COMBAT families) and, at the clip's attack event, its blocker and every unit within DFAT_STUN_REACH its
 * selection takes (EnemyBlockerOrAdvancedSelector: the blocker first, then the range; no `_limitTargetNum`, so all — taken
 * as the cast starts; `_targetMotion` 1, so never a flying ally — until 2026-11-20 the 炎佑 dragon was taken too) take
 * physical ATK × 1 and `stun` s of 晕眩. The cast reports its clip: fx 'enemySkill' (ability
 * StunAttack) and `skillAnimUntil` to the cast's end; its readiness as fx 'enemySkillReady': on 1 as the SP fills, on 0 as
 * the cast finishes or is cut (ReadyEnemySkillEffect clears its effect in OnCastFinish — `_stopBeforeCast` 0 — and
 * OnDetach, as the official client does).
 * SP comes on silenced attacks too (Entity.SpController._RecoverMp stops only for SP_RECOVER_STOPPED, not SILENCED — as the
 * 乐团's counters).
 * @type {AbKit}
 */
function kitPunisher(ab) {
  const s = ab.sk.StunAttack, cost = s && s.sp > 0 ? s.sp : 0, dur = (s && s.bb.stun) || 0;
  /** @type {{ sp: number, lit: number, n?: number }} */
  const P = { sp: 0, lit: 0 };
  const pick = (/** @type {Battle} */ b, /** @type {Unit} */ e) => {
    const out = e.blockedBy && e.blockedBy.alive ? [e.blockedBy] : [];
    for (const u of areaAllies(b, e, e.x, e.y, DFAT_STUN_REACH)) if (!u.isFlying && !out.includes(u)) out.push(u);
    return out;
  };
  // the prefab's ReadyEnemySkillEffect (enemy_dfat_skill_hint): fx 'enemySkillReady' on 1 as the SP fills, on 0 as the cast ends
  const ready = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {number} */ on) => b.fx('enemySkillReady', { x: e.x, y: e.y, id: e.id, ability: 'StunAttack', on });
  const off = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {number} */ n) => { if (n && P.lit === n) { P.lit = 0; ready(b, e, 0); } };   // once per fill
  return [...kitReborn('Attack')(ab), { attack(_c, b, e) {
    if (!(cost > 0) || P.sp >= cost) return;
    P.sp++;
    if (P.sp >= cost) { P.lit = (P.n = (P.n ?? 0) + 1); ready(b, e, 1); }
  } }, { ...skill(s, (b, e) => {
    P.sp = 0;
    const k = e.mem.ab && e.mem.ab.casting, n = P.lit;
    if (k) e.skillAnimUntil = k.until;
    if (k && k.until > b.time) b.after(k.until - b.time, () => off(b, e, n), { owner: e }); else off(b, e, n);
    const hit = pick(b, e);
    atCastEvent(b, e, s, () => {
      b.fx('explode', { x: e.x, y: e.y, r: DFAT_STUN_RADIUS, kind: 'dfatStun', id: e.id, ability: 'StunAttack' });
      for (const u of hit) hurt(b, e, u, e.s.atk, 'phys');   // one gone meanwhile (knocked out, withdrawn) is not alive
      if (dur > 0) for (const u of hit) if (u.alive) b.applyStatus(u, 'stun', { duration: dur, source: e });
    });
  }, { sil: true, cond: (b, e) => cost > 0 && P.sp >= cost && pick(b, e).length > 0 }), onCut(b, e) { off(b, e, P.lit); } }];
}

/**
 * 新生血裔: arts; its damage × |`DamageUp.scale_ratio` × (enemies its target blocks now) + `DamageUp.add_on`|
 * (enemy_dfello_damge_up, ON_CALCULATE_DAMAGE); heals itself the damage dealt × `vampire.heal_scale` (enemy_dslime_vampire
 * HealViaDamage DAMAGE_SCALE); knocked out, it leaves `Summon.cnt` <血珀> on its route (enemy_dfello_summon[dseed]). Its
 * ranged `Attack` picks only units holding enemy_bmbcar1_passive (none in this mode): it fights only what blocks it.
 * @type {AbKit}
 */
function kitFello(ab) {
  const k = T(ab, 'DamageUp.scale_ratio') ?? 0, add = T(ab, 'DamageUp.add_on') ?? 1, heal = T(ab, 'vampire.heal_scale') ?? 0;
  const key = ab.tS['Summon.enemy_key'], cnt = T(ab, 'Summon.cnt') ?? 0;
  return [{
    hitOut(c, b) {
      if (!c.dmg.isAttack || !c.target) return;
      const n = b.aliveEnemies().filter((o) => o.blockedBy === c.target).length;
      c.dmg.amount *= Math.abs(k * n + add);
    },
    dealt(c, b, e) { if (heal > 0 && c.amount > 0) b.heal(e, e, c.amount * heal, { self: true }); },
    death(c, b, e) { if (c.reason === 'killed' && key && cnt > 0) spawnChildren(b, e, key, cnt, { route: remainingRoute(e), spot: { bound: T(ab, 'Summon.offset_bound') ?? SUMMON_JITTER } }); },
  }];
}

/**
 * 萨卡兹骸骨卫士长 (规程's 萨卡兹子裔寄生者 escort; EN client prefab enemy_1363_spnshd_2): 嘲讽 2 (its table's taunt level);
 * every damage it takes (enemy_spnshd_atk_speed: ON_TAKE_DAMAGE, VertifyTarget — the source on the other side, any
 * motion) puts enemy_spnshd_atkspeed[d] on the source: ATTACK_SPEED `Summon.attack_speed` (−40) for `Summon.duration` (5) s,
 * UNIQUE — while a unit holds it, a new one adds nothing (no refresh). Knocked out (not a FALLDOWN), `Summon.cnt` <血珀> on
 * its route (enemy_dfello_summon[dseed], 新生血裔's). Its BmbcarBuff aura stops only units holding
 * enemy_bmbcar1_passive (反巫术变位炸弹) — none in this mode.
 * @type {AbKit}
 */
function kitBoneGuard(ab) {
  const aspd = T(ab, 'Summon.attack_speed') ?? 0, dur = T(ab, 'Summon.duration') ?? 0;
  const key = ab.tS['Summon.enemy_key'], cnt = T(ab, 'Summon.cnt') ?? 0;
  return [{
    taken(c, b) {
      const s = c.source;
      if (!s || !s.alive || s.side !== 'ally' || !(dur > 0) || s.findBuff('ab:spnshdSlow')) return;
      // (`source`: the 领袖 — the status's applier, whose binding draws the buff's enemy_spnshd_debuff on the operator; display only)
      b.addBuff(s, { key: 'ab:spnshdSlow', duration: dur, refresh: 'keep', visible: true, mods: { aspd }, source: c.target, fxTag: 'buff:enemy_spnshd_atkspeed[d]' });
    },
    death(c, b, e) { if (c.reason === 'killed' && key && cnt > 0) spawnChildren(b, e, key, cnt, { route: remainingRoute(e), spot: { bound: T(ab, 'Summon.offset_bound') ?? SUMMON_JITTER } }); },
  }];
}

/**
 * 萨卡兹子裔寄生者 (规程 only): an AuraAbility (SILENCE line; radius `Aura.range_radius`, its own side, every motion, itself
 * left out — `_selfOption` EXCLUDE — and 大君之触 `enemy_1220_dzoms` too, its validator) gives acpara[core]: an enemy holding
 * it that is knocked out summons one `Aura.enemy_key` (大君之赐) where it fell, on its route, at once — not when that one is a
 * 大君之赐 itself (the template's FilterId on the blackboard `enemy_key`).
 * @type {AbKit}
 */
function kitParasite(ab) {
  const r = T(ab, 'Aura.range_radius') ?? 0, key = ab.tS['Aura.enemy_key'];
  return [{
    sil: true,
    spawn(b, e) { watchDeaths(b, e); },
    otherDeath(c, b, e) {
      const u = c.unit;
      if (!key || c.reason !== 'killed' || !u || u === e || u.side !== 'enemy' || u.defId === PARASITE_SKIPS || u.defId === key) return;
      if (hypot(u.x - e.x, u.y - e.y) > r + 1e-9) return;
      spawnChildren(b, u, key, 1, { route: remainingRoute(u), pos: [u.y, u.x], spot: { bound: T(ab, 'Aura.offset_bound') ?? 0 } });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 变异 beasts (enm_pfb_7): split on death, 畸变恶性瘤 slows its blocker

/**
 * 变异沙地兽 / 变异岩蛛 / 变异巨岩蛛 (and their α): knocked out — not a FALLDOWN, not while silenced (deathrattle_sum[walk_only]:
 * ON_OWNER_KILLED, CheckAbnormalFlag SILENCED unset, IfNot FilterDeathReason FALLDOWN, SummonEnemiesFollowMyRoute) — they
 * split into `deathrattle.cnt` `deathrattle.enemy_key` `deathrattle.delay` s later where they fell, on the rest of the route:
 * each at the centre of that tile ± `deathrattle.offset_bound` (0.2) on each axis (spawnChildren `spot`). The projectile
 * that flies to each spot is the view's.
 * @param {AbState} ab @returns {EnemyAbility}
 */
function splitOnDeath(ab) {
  const key = ab.tS['deathrattle.enemy_key'], n = T(ab, 'deathrattle.cnt') ?? 0, delay = T(ab, 'deathrattle.delay') ?? 0;
  const bound = T(ab, 'deathrattle.offset_bound') ?? SUMMON_JITTER;
  return {
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed' || !key || !(n > 0)) return;
      const route = remainingRoute(e);
      const pos = [e.y, e.x];
      const go = () => spawnChildren(b, e, key, n, { route, pos, spot: { bound } });
      if (delay > 0) b.after(delay, go, { holdsBattle: true }); else go();
    },
  };
}
const kitSplitBeast = (/** @type {AbState} */ ab) => [splitOnDeath(ab)];


/**
 * 变异巨岩蛛 / α: the splits on death, and SummonToken (SILENCE line; AlwaysTrigger, cooldown 5 s from the start) — one
 * `enemy_key` at its own spot on its route at the clip's event (harchn[sum_token]).
 * @type {AbKit}
 */
function kitHugeSpider(ab) {
  const s = ab.sk.SummonToken, key = s && s.bs.enemy_key, n = (s && s.bb.cnt) ?? 1;
  return [splitOnDeath(ab), skill(s, (b, e) => atCastEvent(b, e, s, () => {
    if (key) spawnChildren(b, e, key, n, { route: remainingRoute(e), pos: [e.y, e.x], spot: { bound: (s && s.bb.offset_bound) ?? 0 } });
  }), { sil: true })];
}

/**
 * 畸变恶性瘤: while blocked (BlockedToggleChecker `_blockMinCnt` 1) its blocker's attack speed × (1 + `atkSpeedDown.attack_speed`)
 * (tumor_t_buff_blocker: ATTACK_SPEED MULTIPLIER, one buff however many block it — max stack 1). Its talent is a
 * SilenceableTalent, but it is silence-immune and its line NORMAL: never off.
 * @type {AbKit}
 */
function kitTumor(ab) {
  const v = T(ab, 'atkSpeedDown.attack_speed') ?? 0;
  return [{
    iv: AURA_EVERY,
    tick(b, e) { const u = e.blockedBy; if (u && v) auraBuff(b, u, 'ab:tumorSlow', AURA_EVERY, { aspdPct: v }, null, true); },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 海怪 of the 饲育者 (enm_pfb_17)

/**
 * 赘生甲壳 (character_table trap_156_dsshell, phase 0 — a TRAP token our data does not carry): HP, DEF, RES, block count;
 * its prefab (공식 클라에서 확인): the TrapMode's `_tileOptions.overrideObstacleLikeMoveCost` makes its tile obstacle-like as
 * a 阻隔工事 crate's (enemies route around it at cost 1000 and walk into it only when it is the only way — the `crate`
 * obstacle; 「甲壳可以影响敌人移动」), and its `_blockRadiusSquare` 0.5 is the ground block reach, not the crates' 0.2.
 */
export const SHELL = 'trap_156_dsshell';
/** dspred_tr_1[switch_mode_2]'s MAX_HP MULTIPLIER `value` (the blackboard has no `max_hp`: kitShellEater). */
const DSPRED_HP = 0.6;
/** 复核洋流使者 `Skills/0/Selector`'s CircleRange collider radius: `_scaleble`, so its reach is this × `range_radius`. */
const DSPRED_RANGE = 1.5;
const SHELL_STATS = Object.freeze({ hp: 3000, def: 320, res: 0, blockCnt: 20, name: '赘生甲壳', obstacle: true, obstacleKind: 'crate', blockRadiusSq: 0.5 });

/**
 * A tile the shell may take (dsshel_t_1 SpawnTokenOnTargetTileWithCondition: buildable MELEE, LOWLAND, move cost 1 — not an
 * obstacle-like tile — and not tile_start / tile_end / tile_telin / tile_telout); spawnDevice refuses one a unit holds.
 * @param {Battle} b @param {number} r @param {number} c
 */
function shellTile(b, r, c) {
  if (!b.grid.inRect(r, c)) return false;
  const t = b.grid.tile(r, c);
  return t.height === 'LOW' && (t.build === 'MELEE' || t.build === 'ALL') && !t.special && !b.grid.isObstacle(r, c);
}

/**
 * 微核沉积者: knocked out, a 赘生甲壳 on its tile (an ally-side TRAP: blocks 20, enemies stop at it and break it). Its skill
 * (a high-ground operator deployed onto it; its redeploy −35 % when the shell breaks) has no use in a battle without
 * deployment.
 * @type {AbKit}
 */
const kitShellBearer = () => [{
  death(c, b, e) {
    if (c.reason !== 'killed') return;
    const r = Math.round(e.y), col = Math.round(e.x);
    if (shellTile(b, r, col)) b.spawnDevice(SHELL, r, col, SHELL_STATS);
  },
}];

/** The 赘生甲壳 within `r` of (x, y) — its 0.25 collider met (ALLY_COLLIDER_RADIUS) —, the nearest (null when none).
 * @param {Battle} b @param {number} x @param {number} y @param {number} r */
function shellNear(b, x, y, r) {
  let best = null, bd = Infinity;
  for (const u of b.allyUnits) {   // (devices: not in b.allies())
    if (!u.alive || u.defId !== SHELL) continue;
    const d = hypot(u.x - x, u.y - y);
    if (d <= r + ALLY_COLLIDER_RADIUS + 1e-9 && d < bd) { best = u; bd = d; }
  }
  return best;
}

/**
 * 复核洋流使者: devours a 赘生甲壳 (prefab enm_pfb_17 `Skills/0` · `1`, 공식 클라에서 확인). Skill `0` (an EnemySkill of both
 * families with a SelectorTrigger — the enemy side's 赘生甲壳 (`trap_156_dsshell_passive`) whose collider meets its circle,
 * one: a `_scaleble` CircleRange, 1.5 × `range_radius` 0.35 (`CircleRange.InitCollidersIfNot`), so 0.775 from its centre —
 * a blocked eater (0.7071) is in reach; cooldown 1000000 from 0: once) is cast at an attack slot; its buff (dspred_tr_1, unless the devour mark is on)
 * casts skill `1` on that shell at once (dspred_tr_1[blockee] TriggerEnemySkill, `_interruptCurAbility`). Skill `1`: the
 * `Skill` clip (`_timeMode` 1, 2.6 s), standing; its `_waitForAttackEvent` finds no OnAttack in the clip, so its spell
 * comes at the clip's end (`WaitForNextEvent` bounded by the cast's duration): dspred_tr_1[kill] — the shell, if still
 * there, dies at once and the eater takes the devour mark —, then (BuffAfterAffecting dspred_tr_1[switch_mode_2]) with
 * the mark: mode `1` (its B_ clips, a plain melee attack, no skills) and dspred_tr_1[attribute] for good — MAX_HP and ATK
 * MULTIPLIER loaded from the blackboard by the attribute's name (`Buff._LoadAttributesModifier`: `HGString.Enum2Str`, the
 * enum's name, matched case aside — `Blackboard._TryGetNumber`): `ATK` finds the skill's `atk` 0.4, `MAX_HP` finds no
 * key (the table writes `maxhp`) and keeps the template's 0.6. A cast cut before its end eats nothing; skill `1` casts
 * once (`_maxTriggerTime` 1). The HP ratio stays as the maximum grows (units.js).
 * @type {AbKit}
 */
function kitShellEater(ab) {
  const s0 = ab.sk['0'], s1 = ab.sk['1'];
  if (!s0 || !s1) return [];
  const reach = DSPRED_RANGE * (s0.bb.range_radius ?? 0), atk = s1.bb.atk ?? 0, len = s1.cast && /** @type {number} */ (s1.cast.dur) > 0 ? /** @type {number} */ (s1.cast.dur) : 0;   // `_timeMode` 1: the clip as it is
  return [{
    // its handbook line is SILENCE-flagged: silenced, no cast (EnemySkill.CheckAvailable)
    sil: true, name: s0.name, cd: s0.cd, icd: s0.icd,
    cond: (b, e, a) => !a.ate && !!shellNear(b, e.x, e.y, reach),
    fire(b, e, a) {
      const sh = shellNear(b, e.x, e.y, reach);
      if (a.ate || !sh || !(len > 0)) return;
      a.next = { dur: len };
      e.skillAnimUntil = b.time + len;
      b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: s1.name, n: 1 });
      atCastEvent(b, e, s1, () => {
        if (!sh.alive || a.ate) return;
        b.kill(sh, e);
        a.ate = true;
        mode(b, e, '1');
        setForm(b, e, '1');   // the view's B_* clips (fx 'phase')
        b.addBuff(e, { key: 'ab:dspredEat', persist: true, visible: true, fxTag: 'buff:dspred_tr_1[attribute]', mods: { hpPct: DSPRED_HP, atkPct: atk } });
      });
    },
  }];
}

/**
 * 蕴核饲育者 / 异光体饲育者: as it comes in (dsfull_tr_1 ON_BUFF_START, a nested RandomAction) it draws the sea monster it
 * will breed — `0.enemy_1` with `0.prob1`, else `0.enemy_2` with `0.prob2`, else `0.enemy_3` — and puts on the matching
 * dsfull_tr_1[derived][1] / [2] / [3] (their overrideEffectKey enemy_dsfull_buff_01 / _04 / none show which: the buff's
 * `fxTag`); knocked out (that buff's ON_OWNER_KILLED, no death-reason check), that monster where it fell, on its route,
 * whose move speed × (1 + `0.move_speed`) for good (dsfull_tr_1[speed_up], MOVE_SPEED MULTIPLIER).
 * @type {AbKit}
 */
function kitBreeder(ab) {
  const p1 = T(ab, '0.prob1') ?? 0, p2 = T(ab, '0.prob2') ?? 0, spd = T(ab, '0.move_speed') ?? 0, n = T(ab, '0.cnt') ?? 1;
  const keys = [ab.tS['0.enemy_1'], ab.tS['0.enemy_2'], ab.tS['0.enemy_3']];
  return [{
    spawn(b, e, a) {
      a.pick = b.rng.chance(p1) ? 1 : b.rng.chance(p2) ? 2 : 3;
      b.addBuff(e, { key: 'ab:dsfullDerived', persist: true, visible: true, fxTag: `buff:dsfull_tr_1[derived][${a.pick}]` });
    },
    death(c, b, e, a) {
      if (c.reason !== 'killed' || !a.pick) return;
      const key = keys[/** @type {number} */ (a.pick) - 1];
      if (!key) return;
      // dsfull_tr_1[derived]: `_passableMask` NONE (any tile), `_randomOffsetBound` 0
      for (const o of spawnChildren(b, e, key, n, { route: remainingRoute(e), pos: [e.y, e.x], spot: { bound: 0, walk: false } })) {
        b.addBuff(o, { key: 'ab:dsfullSpeed', persist: true, visible: true, mods: { moveMul: 1 + spd } });
      }
    },
  }];
}

/**
 * 诡核集养者 / 异光体集养者: the first time its HP falls below `0.hp_ratio` (dsdivi_tr_1[listener], ON_APPLIED_MODIFIER — not
 * while silenced, the listener waits) it casts skill `0` (TriggerEnemySkill, interrupting what it casts): the `Skill` clip,
 * unmovable (BuffDuringCastingFixed UNMOVABLE_PRIVATE), then a copy of itself (dsdivi_tr_1: the skill's `enemy_key`) on its
 * route with its HP ratio (CopyHealth by ratio) and the split mark, so the copy never splits; the listener is gone.
 * The copy's spot: the centre of its tile ± the skill's `offset_bound` (0.3) on each axis (spawnChildren `spot`).
 * [추정·미조사: the clip has no attack event in the data — the copy comes at the clip's end]
 * @type {AbKit}
 */
function kitDivider(ab) {
  const ratio = T(ab, '0.hp_ratio') ?? 0.5, s = ab.sk['0'], key = s && s.bs.enemy_key, len = (s && s.cast && s.cast.dur) || 0;
  return [{
    sil: true,
    spawn(_b, e, a) { a.armed = !e.mem.splitMark; },
    taken(_c, b, e, a) {
      if (!a.armed || !e.alive || !(e.hpRatio < ratio)) return;
      a.armed = false;
      interruptEnemyCast(b, e);
      e.swing = null; e.castLeft = 0;   // its normal swing too (`_interruptCurAbility`; its 缴械 no longer cuts one, ai.js)
      e.skillAnimUntil = b.time + len;
      b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: '0', n: 1 });
      b.addBuff(e, { key: 'ab:dsdiviCast', duration: len, flags: { noMove: true, disarm: true } });
      b.after(len, () => {
        if (!e.alive || !key) return;
        const hp = e.hpRatio;
        for (const o of spawnChildren(b, e, key, 1, { route: remainingRoute(e), spot: { bound: (s && s.bb.offset_bound) ?? DSDIVI_JITTER } })) {
          o.mem.splitMark = true;
          if (o.mem.ab) for (const x of o.mem.ab.list) if ('armed' in x) x.armed = false;
          o.hp = Math.max(1, o.s.maxHp * hp);
        }
      }, { owner: e });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 骑士团 (enm_pfb_6)

/**
 * 沸血骑士团精锐: a GlobalAuraAbility on its own side (TargetValidator `targetSide` 1, every motion) — each of those enemies
 * knocked out (enemy_wdkght_t, ON_OWNER_KILLED) gives it a stack of ATK × (1 + `enhance.atk`) (MULTIPLIER) and ASPD
 * + `enhance.attack_speed` (ADDITION), at most `enhance.max_stack_cnt`; full, its next attack switches it to the mode Rage
 * (enemy_wdkght_t[switch_mode] ON_BEFORE_ATTACK, no FSM restart: the same attack, its Skill clip). The stacks are the client
 * buff wdkght_t[enhance] (`fxTag`: its overrideEffectKey enemy_wdkght_skill_01_buff on it, render/fxstatus.js). The knock-out
 * that brings the stacks to the cap also puts on wdkght_t[effect] for good (enemy_wdkght_t: FilterByBuffStackCount EQUALS
 * `max_stack_cnt`, then CreateBuff — its overrideEffectKey enemy_wdkght_skill_01_start_03: the buff's `fxTag`).
 * @type {AbKit}
 */
function kitBloodKnight(ab) {
  const atk = T(ab, 'enhance.atk') ?? 0, as = T(ab, 'enhance.attack_speed') ?? 0, cap = T(ab, 'enhance.max_stack_cnt') ?? Infinity;
  return [{
    spawn(b, e, a) { a.n = 0; watchDeaths(b, e); },
    otherDeath(c, b, e, a) {
      const u = c.unit, A = /** @type {EnemyAbility & { n: number }} */ (a);
      if (c.reason !== 'killed' || !u || u === e || u.side !== 'enemy' || !(A.n < cap)) return;
      A.n++;
      b.addBuff(e, { key: 'ab:wdkght', persist: true, visible: true, refresh: 'replace', mods: { atkPct: atk * A.n, aspd: as * A.n }, fxTag: 'buff:wdkght_t[enhance]' });
      if (A.n >= cap) b.addBuff(e, { key: 'ab:wdkghtFull', persist: true, visible: true, fxTag: 'buff:wdkght_t[effect]' });
    },
    // mode Rage's Combat swings Skill: the view's attack clip follows (render/units.js FORMS 'Rage')
    before(_c, b, e, a) { if (/** @type {number} */ (a.n) >= cap && !a.rage) { a.rage = true; mode(b, e, 'Rage', false); setForm(b, e, 'Rage'); } },
  }];
}

/**
 * 锋盔骑士团学徒's ATK cut on its target (lfkght_s[weaken]: the selector leaves out a unit that has it; `fxTag` and its source —
 * the buff's overrideEffectKey wind_buff_01 on the operator, drawn from the 学徒's binding: render/fxstatus.js).
 */
const WEAKEN = 'ab:lfkghtWeaken';

/**
 * 锋盔骑士团学徒 / “左手”泰特斯·白杨: AtkDesWeaken (SILENCE line; GlobalRange, the operator side, every motion, ATK_DES — the
 * highest ATK — one unit without the cut) — at the clip's event its ATK × (1 + `atk`) (FINAL_SCALER) for `duration` s; and
 * 重生 (RebornTalent: `reborn.duration` s, full HP — `hp_ratio` defaults to 1, one respawn).
 * @type {AbKit}
 */
function kitLfKnight(ab) {
  const s = ab.sk.AtkDesWeaken, cut = (s && s.bb.atk) ?? 0, dur = (s && s.bb.duration) ?? 0;
  const pick = (/** @type {Battle} */ b, /** @type {Unit} */ e) => allTargets(b, e).filter((u) => !u.findBuff(WEAKEN)).sort((p, q) => q.s.atk - p.s.atk)[0];
  return [skill(s, (b, e) => {
    const u = pick(b, e);
    if (!u) return;
    atCastEvent(b, e, s, () => {
      if (!u.alive || u.findBuff(WEAKEN)) return;
      b.addBuff(u, { key: WEAKEN, duration: dur, visible: true, mods: { atkMul: 1 + cut }, source: e, fxTag: 'buff:lfkght_s[weaken]' });
    });
  }, { sil: true, cond: (b, e) => !!pick(b, e) }), reborn({ dur: T(ab, 'reborn.duration') ?? 0 })];
}

// ---------------------------------------------------------------------------------------------------------------
// this module's part of KITS

export const REBORN_KITS = /** @type {Record<string, EnemyKit>} */ ({
  enemy_1220_dzoms: kitConstruct,                          // 大君之触 · 重生造物: damage taken −90 %, its blocker blocks +1
  enemy_1220_dzoms_2: kitConstruct,                        // 仁慈之触 · same
  enemy_1221_dzomg: kitConstruct,                          // 大君之赐 · same
  enemy_1221_dzomg_2: kitConstruct,                        // 慷慨之赐 · same
  enemy_1222_dpvt: kitReborn('deathrattle'),               // 萨卡兹子裔战士 · knocked out: 大君之触
  enemy_1222_dpvt_2: kitReborn('deathrattle'),             // 萨卡兹子裔战士组长 · knocked out: 仁慈之触
  enemy_1223_dmech: kitMech,                               // 萨卡兹子裔工匠 · no 城防副炮 to charge; knocked out: 大君之触
  enemy_1223_dmech_2: kitMech,                             // 萨卡兹子裔工匠组长 · same; 仁慈之触
  enemy_1224_dsuply: kitSupply,                            // 萨卡兹子裔补给车 · 重生造物 ATK +10 % and 凋亡 (kitConstruct)
  enemy_1224_dsuply_2: kitSupply,                          // 萨卡兹子裔改装补给车 · same
  enemy_1225_dkmage: kitChainMage,                         // 萨卡兹子裔链术师 · 4-unit arts chain + 凋亡; knocked out: 大君之赐
  enemy_1225_dkmage_2: kitChainMage,                       // 萨卡兹子裔链术师组长 · same; 慷慨之赐
  enemy_1226_dklord: kitLord,                              // 萨卡兹子裔集恨者 · ATK +15 % per 重生造物; knocked out: 大君之赐
  enemy_1226_dklord_2: kitLord,                            // 萨卡兹子裔集怒者 · +25 %; 慷慨之赐
  enemy_1360_dfello: kitFello,                             // 新生血裔 · block-scaled arts, life steal; leaves 血珀
  enemy_1361_dthrow: kitThrower,                           // 萨卡兹子裔轰击者 · delayed shell; knocked out: 大君之触
  enemy_1361_dthrow_2: kitThrower,                         // 萨卡兹子裔毁击者 · same; 仁慈之触
  enemy_1362_dfat: kitPunisher,                            // 萨卡兹子裔责罚者 · every 4th attack stuns all around; 大君之赐
  enemy_1362_dfat_2: kitPunisher,                          // 萨卡兹子裔惩戒者 · same; 慷慨之赐
  enemy_1363_spnshd_2: kitBoneGuard,                       // 萨卡兹骸骨卫士长 · damage taken → its source ASPD −40 5 s; leaves 2 血珀
  enemy_9030_acpara: kitParasite,                          // 萨卡兹子裔寄生者 · enemies knocked out near it: 大君之赐
  enemy_1131_sbeast: kitSplitBeast,                        // 变异沙地兽 · knocked out: 2 畸变赘生物
  enemy_1131_sbeast_2: kitSplitBeast,                      // 变异沙地兽α · 2 畸变恶性瘤
  enemy_1132_sarchn: kitSplitBeast,                        // 变异岩蛛 · 3 畸变赘生物
  enemy_1132_sarchn_2: kitSplitBeast,                      // 变异岩蛛α · 3 畸变恶性瘤
  enemy_1133_harchn: kitHugeSpider,                        // 变异巨岩蛛 · one 畸变赘生物 every 5 s; knocked out: 4
  enemy_1133_harchn_2: kitHugeSpider,                      // 变异巨岩蛛α · same, 畸变恶性瘤
  enemy_1138_tumor: kitTumor,                              // 畸变恶性瘤 · its blocker's ASPD −80 %
  enemy_1434_dsshel: kitShellBearer,                       // 微核沉积者 · knocked out: a 赘生甲壳 on its tile
  enemy_1438_dspred: kitShellEater,                        // 复核洋流使者 · a 赘生甲壳 at hand: eats it (mode 1, HP +60 %, ATK +40 %)
  enemy_1436_dsdivi: kitDivider,                           // 诡核集养者 · below half HP once: a copy of itself
  enemy_1436_dsdivi_2: kitDivider,                         // 异光体集养者 · same
  enemy_1437_dsfull: kitBreeder,                           // 蕴核饲育者 · knocked out: a fast sea monster (20 / 40 / 40 %)
  enemy_1437_dsfull_2: kitBreeder,                         // 异光体饲育者 · same (20 / 56 / 24 %)
  enemy_1103_wdkght_2: kitBloodKnight,                     // 沸血骑士团精锐 · ATK +10 %, ASPD +5 per enemy knocked out (×10)
  enemy_1104_lfkght: kitLfKnight,                          // 锋盔骑士团学徒 · highest-ATK unit ATK −50 % 25 s; 重生
  enemy_1104_lfkght_3: kitLfKnight,                        // “左手”泰特斯·白杨 · same, every 10 s
});

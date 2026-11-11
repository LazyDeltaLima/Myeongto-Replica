// server/sim/content/enemies/reborn.js — REBORN 复苏 kits of 卫戍协议：规程 (factions.json type REBORN, "此类敌人首次被击倒后会重生")
// and the units they bring: the 萨卡兹子裔 of the main story (official prefabs battle/enm_pfb_10 / _14, EN and CN alike) and
// 规程's own 萨卡兹子裔寄生者 (CN prefab battle/enm_pfb_36). Their part of KITS.
//
// The 子裔 do not stand up again themselves: their first knock-out summons a 重生造物 (enemy_vampires[bloodsucker_summon] /
// enemy_dthrow_summon[dzoms]: ON_OWNER_KILLED, not a FALLDOWN, SummonEnemiesFollowMyRoute — the blackboard `delay` s after
// the knock-out, where it fell, on the rest of its route). The 重生造物 (大君之触 / 仁慈之触 / 大君之赐 / 慷慨之赐) carry
// enemy_bloodsucker_mark, which the auras of the 补给车 and the 集恨者 look for.

import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { T, elem, hurt, areaAllies, remainingRoute, spawnChildren, auraBuff, watchDeaths, silenced } from './helpers.js';
import { ep } from './archetypes.js';
import { hypot, powi } from '../../detmath.js';

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

const isConstruct = (u) => !!u && u.alive && !u.hidden && CONSTRUCTS.has(u.defId);

// ---------------------------------------------------------------------------------------------------------------
// shared pieces

/**
 * The 子裔's summon on its first knock-out: `key` (the talent's `enemy_key`), `delay` s later (the blackboard `delay`,
 * SummonEnemiesFollowMyRoute reads it over its `_delayTime`), at the spot it fell, on the rest of its route. Only a
 * knock-out (`killed` — not a leak, not a FALLDOWN), silenced or not (neither template checks 沉默). The battle waits for
 * it (`holdsBattle`). [추정·미조사: the summoned unit's own `_delayToBorn` (1 s, its born effect) is not modelled, as for
 * every enemy (server/sim/routePreview.js); nor the template's `_randomOffsetBound` 0.1 jitter of the spot]
 */
const rebornSummon = (key, delay) => ({
  death(c, b, e) {
    if (c.reason !== 'killed' || !key) return;
    const route = remainingRoute(e), pos = [e.y, e.x];
    const go = () => spawnChildren(b, e, key, 1, { route, pos });
    if (delay > 0) b.after(delay, go, { holdsBattle: true }); else go();
  },
});
const kitReborn = (prefix) => (ab) => [rebornSummon(ab.tS[`${prefix}.enemy_key`], T(ab, `${prefix}.delay`) ?? 0)];

/**
 * A 重生造物: physical and arts damage taken × (1 − `dmg_res.damage_resistance`) (enemy_dzoms_t[damage_resistance], the
 * `damage_resistance` template); while blocked (Talents/buff_to_blocker: BlockedToggleChecker `_blockMinCnt` 1, its
 * `_buffsToBlockee` enemy_bloodsucker_block_cnt[control]) its blocker blocks `buff_to_blocker.block_cnt` more — one stack per
 * 重生造物 it blocks, at most `buff_to_blocker.max_valid_stack_cnt` (「最多+6」). With a 补给车 of a kind on the field (each
 * kind its own buff, enemy_dsuply_t / enemy_dsuply_2_t): ATK × (1 + `atk` × n) for n of them up to `max_valid_stack_cnt`,
 * and each damage it deals adds 凋亡 of its ATK × `ep_damage_ratio` × n (ApplyElementDamage DARK `_multiplyWithBuffValidStackCnt`).
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
    tick(b, e, a) {
      a.ep = 0;
      const atk = supply(b);
      let pct = 0;
      for (const s of atk) { pct += s.atk * s.n; a.ep += s.ep * s.n; }
      if (pct > 0) auraBuff(b, e, 'ab:dsuply', AURA_EVERY, { atkPct: pct }, null, true);
    },
    dealt(c, b, e, a) { if (a.ep > 0) elem(b, e, c.target, 'apoptosis', e.s.atk * a.ep); },
  }];
}

/** The 补给车 on the field by kind: [{ n (capped), atk, ep }] — a silenced one gives nothing (its talent is SilenceableTalent). */
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
const kitMech = (ab) => [...kitReborn('deathrattle')(ab), { silAware: true }];

/**
 * 萨卡兹子裔集恨者 / 集怒者: a GlobalAuraAbility on every 重生造物 (FilterBuffTargetValidator enemy_bloodsucker_mark), each
 * giving it one stack of enemy_dklord_atk — ATK × (1 + `aura.atk` × n), n up to `aura.max_valid_stack_cnt`. Not silenceable
 * (a plain Talent, a NORMAL line).
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
 * jump. [추정·미조사: the jumps' 凋亡 falls off with the damage (one atk scale for both), and the nearest unit is the next —
 * projectile_enemy_dkmage's bounce behaviour was not read]
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
 * 萨卡兹子裔责罚者 / 惩戒者: StunAttack (SILENCE line, `spCost` attacks then the next) — instead of that attack, its blocker
 * and every unit within DFAT_STUN_REACH its selection takes (EnemyBlockerOrAdvancedSelector: the blocker first, then the
 * range; no `_limitTargetNum`, so all) take physical ATK × 1 and `stun` s of 晕眩.
 */
function kitPunisher(ab) {
  const s = ab.sk.StunAttack, every = s && s.sp > 0 ? s.sp + 1 : 0, dur = (s && s.bb.stun) || 0;
  return [...kitReborn('Attack')(ab), {
    sil: true,
    spawn(_b, _e, a) { a.n = 0; },
    attack(c, b, e, a) {
      if (!every || ++a.n % every) return;
      const hit = new Set(c.targets.filter((t) => t && t.alive));
      for (const u of areaAllies(b, e, e.x, e.y, DFAT_STUN_REACH)) {
        if (hit.has(u)) continue;
        hit.add(u);
        hurt(b, e, u, e.s.atk, 'phys', { isSkill: false });
      }
      b.fx('explode', { x: e.x, y: e.y, r: DFAT_STUN_RADIUS, kind: 'dfatStun' });
      if (dur > 0) for (const u of hit) if (u.alive) b.applyStatus(u, 'stun', { duration: dur, source: e });
    },
  }];
}

/**
 * 新生血裔: arts; its damage × |`DamageUp.scale_ratio` × (enemies its target blocks now) + `DamageUp.add_on`|
 * (enemy_dfello_damge_up, ON_CALCULATE_DAMAGE); heals itself the damage dealt × `vampire.heal_scale` (enemy_dslime_vampire
 * HealViaDamage DAMAGE_SCALE); knocked out, it leaves `Summon.cnt` <血珀> on its route (enemy_dfello_summon[dseed]). Its
 * ranged `Attack` picks only units holding enemy_bmbcar1_passive (none in this mode): it fights only what blocks it.
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
    death(c, b, e) { if (c.reason === 'killed' && key && cnt > 0) spawnChildren(b, e, key, cnt, { route: remainingRoute(e) }); },
  }];
}

/**
 * 萨卡兹子裔寄生者 (规程 only): an AuraAbility (SILENCE line; radius `Aura.range_radius`, its own side, every motion, itself
 * left out — `_selfOption` EXCLUDE — and 大君之触 `enemy_1220_dzoms` too, its validator) gives acpara[core]: an enemy holding
 * it that is knocked out summons one `Aura.enemy_key` (大君之赐) where it fell, on its route, at once — not when that one is a
 * 大君之赐 itself (the template's FilterId on the blackboard `enemy_key`).
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
      spawnChildren(b, u, key, 1, { route: remainingRoute(u), pos: [u.y, u.x] });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// this module's part of KITS

export const REBORN_KITS = {
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
  enemy_9030_acpara: kitParasite,                          // 萨卡兹子裔寄生者 · enemies knocked out near it: 大君之赐
};

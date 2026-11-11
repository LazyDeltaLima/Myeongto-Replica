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
import { T, elem, hurt, areaAllies, allTargets, remainingRoute, spawnChildren, auraBuff, watchDeaths, silenced, mode, atCastEvent } from './helpers.js';
import { interruptEnemyCast } from '../../ai.js';
import { ep, reborn, skill } from './archetypes.js';
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
 * 萨卡兹骸骨卫士长 (规程's 萨卡兹子裔寄生者 escort; EN client prefab enemy_1363_spnshd_2): 嘲讽 2 (its table's taunt level);
 * every damage it takes (enemy_spnshd_atk_speed: ON_TAKE_DAMAGE, VertifyTarget — the source on the other side, any
 * motion) puts enemy_spnshd_atkspeed[d] on the source: ATTACK_SPEED `Summon.attack_speed` (−40) for `Summon.duration` (5) s,
 * UNIQUE — while a unit holds it, a new one adds nothing (no refresh). Knocked out (not a FALLDOWN), `Summon.cnt` <血珀> on
 * its route (enemy_dfello_summon[dseed], 新生血裔's). Its BmbcarBuff aura stops only units holding
 * enemy_bmbcar1_passive (反巫术变位炸弹) — none in this mode.
 */
function kitBoneGuard(ab) {
  const aspd = T(ab, 'Summon.attack_speed') ?? 0, dur = T(ab, 'Summon.duration') ?? 0;
  const key = ab.tS['Summon.enemy_key'], cnt = T(ab, 'Summon.cnt') ?? 0;
  return [{
    taken(c, b) {
      const s = c.source;
      if (!s || !s.alive || s.side !== 'ally' || !(dur > 0) || s.findBuff('ab:spnshdSlow')) return;
      b.addBuff(s, { key: 'ab:spnshdSlow', duration: dur, refresh: 'keep', visible: true, mods: { aspd }, fxTag: 'buff:enemy_spnshd_atkspeed[d]' });
    },
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
// 变异 beasts (enm_pfb_7): split on death, 畸变恶性瘤 slows its blocker

/**
 * 变异沙地兽 / 变异岩蛛 / 变异巨岩蛛 (and their α): knocked out — not a FALLDOWN, not while silenced (deathrattle_sum[walk_only]:
 * ON_OWNER_KILLED, CheckAbnormalFlag SILENCED unset, IfNot FilterDeathReason FALLDOWN, SummonEnemiesFollowMyRoute) — they
 * split into `deathrattle.cnt` `deathrattle.enemy_key` `deathrattle.delay` s later where they fell, on the rest of the route.
 * [추정·미조사: the `deathrattle.offset_bound` jitter of each spot is spawnChildren's fixed spread here — see the 子裔's
 * `_randomOffsetBound` note; the projectile that flies to each spot is the view's]
 */
function splitOnDeath(ab) {
  const key = ab.tS['deathrattle.enemy_key'], n = T(ab, 'deathrattle.cnt') ?? 0, delay = T(ab, 'deathrattle.delay') ?? 0;
  return {
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed' || !key || !(n > 0)) return;
      const route = remainingRoute(e);
      const go = () => spawnChildren(b, e, key, n, { route });
      if (delay > 0) b.after(delay, go, { holdsBattle: true }); else go();
    },
  };
}
const kitSplitBeast = (ab) => [splitOnDeath(ab)];


/**
 * 变异巨岩蛛 / α: the splits on death, and SummonToken (SILENCE line; AlwaysTrigger, cooldown 5 s from the start) — one
 * `enemy_key` at its own spot on its route at the clip's event (harchn[sum_token]).
 */
function kitHugeSpider(ab) {
  const s = ab.sk.SummonToken, key = s && s.bs.enemy_key, n = (s && s.bb.cnt) ?? 1;
  return [splitOnDeath(ab), skill(s, (b, e) => atCastEvent(b, e, s, () => {
    if (key) spawnChildren(b, e, key, n, { route: remainingRoute(e), pos: [e.y, e.x] });
  }), { sil: true })];
}

/**
 * 畸变恶性瘤: while blocked (BlockedToggleChecker `_blockMinCnt` 1) its blocker's attack speed × (1 + `atkSpeedDown.attack_speed`)
 * (tumor_t_buff_blocker: ATTACK_SPEED MULTIPLIER, one buff however many block it — max stack 1). Its talent is a
 * SilenceableTalent, but it is silence-immune and its line NORMAL: never off.
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

/** 赘生甲壳 (character_table trap_156_dsshell, phase 0 — a TRAP token our data does not carry): HP, DEF, RES, block count. */
const SHELL = 'trap_156_dsshell';
const SHELL_STATS = Object.freeze({ hp: 3000, def: 320, res: 0, blockCnt: 20, name: '赘生甲壳' });

/**
 * A tile the shell may take (dsshel_t_1 SpawnTokenOnTargetTileWithCondition: buildable MELEE, LOWLAND, move cost 1 — not an
 * obstacle-like tile — and not tile_start / tile_end / tile_telin / tile_telout); spawnDevice refuses one a unit holds.
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
 */
const kitShellBearer = () => [{
  death(c, b, e) {
    if (c.reason !== 'killed') return;
    const r = Math.round(e.y), col = Math.round(e.x);
    if (shellTile(b, r, col)) b.spawnDevice(SHELL, r, col, SHELL_STATS);
  },
}];

/**
 * 蕴核饲育者 / 异光体饲育者: knocked out (dsfull_tr_1, no death-reason check), one sea monster where it fell, on its route —
 * `0.enemy_1` with `0.prob1`, else `0.enemy_2` with `0.prob2`, else `0.enemy_3` (nested RandomAction) — whose move speed
 * × (1 + `0.move_speed`) for good (dsfull_tr_1[speed_up], MOVE_SPEED MULTIPLIER).
 */
function kitBreeder(ab) {
  const p1 = T(ab, '0.prob1') ?? 0, p2 = T(ab, '0.prob2') ?? 0, spd = T(ab, '0.move_speed') ?? 0, n = T(ab, '0.cnt') ?? 1;
  const keys = [ab.tS['0.enemy_1'], ab.tS['0.enemy_2'], ab.tS['0.enemy_3']];
  return [{
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const key = b.rng.chance(p1) ? keys[0] : b.rng.chance(p2) ? keys[1] : keys[2];
      if (!key) return;
      for (const o of spawnChildren(b, e, key, n, { route: remainingRoute(e), pos: [e.y, e.x] })) {
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
 * [추정·미조사: the clip has no attack event in the data — the copy comes at the clip's end; the copy's spot offset
 * (`offset_bound`) is spawnChildren's]
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
      e.skillAnimUntil = b.time + len;
      b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: '0', n: 1 });
      b.addBuff(e, { key: 'ab:dsdiviCast', duration: len, flags: { noMove: true, disarm: true } });
      b.after(len, () => {
        if (!e.alive || !key) return;
        const hp = e.hpRatio;
        for (const o of spawnChildren(b, e, key, 1, { route: remainingRoute(e) })) {
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
 * buff wdkght_t[enhance] (`fxTag`: its overrideEffectKey enemy_wdkght_skill_01_buff on it, render/fxstatus.js).
 */
function kitBloodKnight(ab) {
  const atk = T(ab, 'enhance.atk') ?? 0, as = T(ab, 'enhance.attack_speed') ?? 0, cap = T(ab, 'enhance.max_stack_cnt') ?? Infinity;
  return [{
    spawn(b, e, a) { a.n = 0; watchDeaths(b, e); },
    otherDeath(c, b, e, a) {
      const u = c.unit;
      if (c.reason !== 'killed' || !u || u === e || u.side !== 'enemy' || !(a.n < cap)) return;
      a.n++;
      b.addBuff(e, { key: 'ab:wdkght', persist: true, visible: true, refresh: 'replace', mods: { atkPct: atk * a.n, aspd: as * a.n }, fxTag: 'buff:wdkght_t[enhance]' });
    },
    before(_c, b, e, a) { if (a.n >= cap && !a.rage) { a.rage = true; mode(b, e, 'Rage', false); } },
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
 */
function kitLfKnight(ab) {
  const s = ab.sk.AtkDesWeaken, cut = (s && s.bb.atk) ?? 0, dur = (s && s.bb.duration) ?? 0;
  const pick = (b, e) => allTargets(b, e).filter((u) => !u.findBuff(WEAKEN)).sort((p, q) => q.s.atk - p.s.atk)[0];
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
  enemy_1436_dsdivi: kitDivider,                           // 诡核集养者 · below half HP once: a copy of itself
  enemy_1436_dsdivi_2: kitDivider,                         // 异光体集养者 · same
  enemy_1437_dsfull: kitBreeder,                           // 蕴核饲育者 · knocked out: a fast sea monster (20 / 40 / 40 %)
  enemy_1437_dsfull_2: kitBreeder,                         // 异光体饲育者 · same (20 / 56 / 24 %)
  enemy_1103_wdkght_2: kitBloodKnight,                     // 沸血骑士团精锐 · ATK +10 %, ASPD +5 per enemy knocked out (×10)
  enemy_1104_lfkght: kitLfKnight,                          // 锋盔骑士团学徒 · highest-ATK unit ATK −50 % 25 s; 重生
  enemy_1104_lfkght_3: kitLfKnight,                        // “左手”泰特斯·白杨 · same, every 10 s
};

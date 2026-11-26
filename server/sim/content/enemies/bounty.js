// server/sim/content/enemies/bounty.js — the main-story enemies only 卫戍协议：规程's 悬赏 cards bring (effects.json ENEMY_GAIN
// `add_enemy_kill_gain_coin`: "为自身…添加1只<X>，将其击倒者获得N资金"; the spawn itself is match/waves.js bountySpawns) and that
// no other kit file has: 开天汽水瓶, 遮天面包机, 暴走食人花, 破城者, 聆风猎手, 炫目刀技厨师, 内测版自助出餐终端. Not the bounty
// leaders of leaders.js. Their official prefabs: EN battle/enm_pfb_0 / _2 / _27 / _29, CN _33 / _34 (聆风猎手 and 炫目刀技厨师
// are not in the EN client); the buff templates are the CN table's. The two others of the cards sit with their kin:
// 搏命养家者 and 赏金猎人“骑士” in special.js.

import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { canTargetAlly } from '../../targeting.js';
import { interruptEnemyCast } from '../../ai.js';
import { T, hurt, areaAllies, byPriority, remainingRoute, spawnChildren, auraBuff, atCastEvent, castStrikeAt, canCast, mode, setForm } from './helpers.js';
import { blockWeight, skill } from './archetypes.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { AbState, AbSkill, AbList, AbFn, AbKit, EnemyAbility, EnemyKit } from '../enemies.js' */
/** @import { BuffTick } from './helpers.js' */
/** @import { BuffRec } from '../bonds/shared.js' */
/**
 * A kit's own ability fields (the ability's counter, its cooldown end, its next check).
 * @typedef {EnemyAbility & { n: number }} CountAb
 * @typedef {EnemyAbility & { until: number, next: number }} TimedAb
 */

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 开天汽水瓶's HP loss period, s: enemy_nscola[passive]'s trigger (the prefab's `triggerInterval` 0.1, blackboard `interval`
 *  default 0.1 — the loss per trigger is `fixed_value_damage` × that interval). */
const NSCOLA_LOSS_EVERY = 0.1;
/** 遮天面包机's bomb flight, s: projectile_enemy_nsbomb AdvancedMovement `_onlyReachedInTime` 0.5 (`_forceReachedWhenTimeup`). */
const NSBOMB_FALL = 0.5;
/** 破城者's volley: MultiRangedAttack `_triggerDelta` (s between its shots) and its shot count without a 指挥官's order
 *  (uareap_s[assign_addition_cnt]: blackboard `times` 3; 6 with enemy_uacomd_extra_power, which no 规程 enemy gives). */
const UAREAP_SHOT_EVERY = 0.2, UAREAP_SHOTS = 3;
/** 破城者's missile: projectile_enemy_uareap_skill — AttachToTarget `_delayToStart` 0.6 s, then its CircleRange 1.1. */
const UAREAP_MISSILE_DELAY = 0.6, UAREAP_MISSILE_RADIUS = 1.1;
/** 暴走食人花's bite reach (its Attack's ParallelGroupSelector: CircleRange 1.0 — no range in its data to scale it). */
const TRWLPL_BITE_RADIUS = 1;
/** What 暴走食人花 shrugs off while it bites (BuffToOwnerDuringAbility enemy_trwlpl_eat: abnormalImmunes STUNNED, LEVITATE,
 *  FROZEN, combo SLEEPING) and while it digests (BuffDuringCastingFixed enemy_trwlpl_s: the same and FEARED). */
const TRWLPL_BITE_IMMUNE = Object.freeze(['stun', 'levitate', 'freeze', 'sleep']);
const TRWLPL_EAT_IMMUNE = Object.freeze([...TRWLPL_BITE_IMMUNE, 'fear']);

// ---------------------------------------------------------------------------------------------------------------
// kits

/** 晕眩 / 束缚 (the client's STUNNED / UNMOVABLE flags) — not 冻结, 沉睡 or 浮空, which hold flags.stun here too (as kitRush). */
const held = (/** @type {Unit} */ e) => /** @type {BuffRec[]} */ (e.buffs).some((x) => x.status === 'stun' || x.status === 'bind');

/**
 * 开天汽水瓶 (enemy_10146_nscola, 悬赏·飞行; EN prefab battle/enm_pfb_29: Talents/Passive, two buffs):
 * - enemy_nscola[passive]: every NSCOLA_LOSS_EVERY s it loses `Passive.fixed_value_damage` × 0.1 HP (NoSourceDamage PURE,
 *   `_damageWithoutModify`, `_ignoreForSp`) — 120 a second, sourceless: nothing reacts to it as a hit;
 * - enemy_nscola[speed]: every `Passive.enemy_nscola[speed].interval` (0.5) s — 束缚, blocked or 晕眩: its count back to 0;
 *   else +1 up to `max_time` (25) — then, not blocked, its move speed × (1 + `move_speed` (0.3) × count) (MULTIPLIER, one
 *   modifier rewritten each time). A flyer is never blocked: only a stun or a bind starts it over.
 * Its only attack ability is a Combat one (a blocked melee hit): a flyer never makes it.
 * @type {AbKit}
 */
function kitNscola(ab) {
  const loss = (T(ab, 'Passive.fixed_value_damage') ?? 0) * NSCOLA_LOSS_EVERY;
  const ms = T(ab, 'Passive.enemy_nscola[speed].move_speed') ?? 0, iv = T(ab, 'Passive.enemy_nscola[speed].interval') ?? 0.5;
  const max = T(ab, 'Passive.enemy_nscola[speed].max_time') ?? 0;
  return [{
    iv: NSCOLA_LOSS_EVERY,
    tick(b, e) { if (loss > 0) b.loseHp(e, loss, { silent: true, sourceless: true, tags: ['nscola'] }); },
  }, {
    iv,
    spawn(b, e, a) { a.n = 0; },
    tick(b, e, /** @type {CountAb} */ a) {
      if (held(e) || e.blockedBy) a.n = 0;
      else if (a.n < max) a.n++;
      if (e.blockedBy) return;
      if (a.n > 0 && ms > 0) b.addBuff(e, { key: 'ab:nscola', mods: { moveMul: 1 + ms * a.n }, persist: true });
      else b.removeBuff(e, 'ab:nscola');
    },
  }];
}

/**
 * 遮天面包机 (enemy_10147_nsbomb, 悬赏·飞行; EN prefab battle/enm_pfb_29): every `Passive.interval` (2.5) s, the first that
 * long after it appears, while not blocked (enemy_nsbomb[passive] → TriggerAbility Bomb, `_castDirectly`) it drops a bomb
 * on the spot under it (RangedAttack, SelfSelector, `_projectileDestination` INPUT_VEC3_WITH_TILE_HEIGHT): NSBOMB_FALL s
 * later the bomb hits every ground ally within `Passive.range_radius` (1) of that spot (HitBehaviour: the other side,
 * ground, `_ignoreCamouflage`) for ATK × `Passive.atk_scale` (2) physical. It needs no target — it bombs empty ground as
 * well. Stunned (frozen, 失衡 …) it still drops them (공식 클라에서 확인): the node's `_checkCanUseAblityFlag` is off, so
 * nothing asks `canUseAtkOrCbt`; AbilityStandard.CastDirectly and its `_DoCast` test no stun, and Entity.OnTick ticks the
 * buff and the ability whatever the abnormal state — an enemy skill's stun check (EnemySkill.CheckAvailable) is not on this
 * path. Until 2026-11-12: none while stunned.
 * @type {AbKit}
 */
function kitNsbomb(ab) {
  const every = T(ab, 'Passive.interval') ?? 2.5, r = T(ab, 'Passive.range_radius') ?? 1, scale = T(ab, 'Passive.atk_scale') ?? 0;
  return [{
    iv: every,
    tick(b, e) {
      if (e.blockedBy || !e.alive || e.hidden) return;
      const x = e.x, y = e.y, atk = e.s.atk * scale;
      b.fx('telegraph', { x, y, r, dur: NSBOMB_FALL, kind: 'nsbomb', id: e.id, ability: 'Bomb' });
      b.after(NSBOMB_FALL, () => {
        b.fx('explode', { x, y, r, kind: 'nsbomb', id: e.id, ability: 'Bomb' });
        if (atk > 0) for (const u of areaAllies(b, e, x, y, r)) if (!u.isFlying) hurt(b, e, u, atk, 'phys', { tags: ['splash', 'nsbomb'] });
      }, { holdsBattle: true });
    },
  }];
}

/**
 * 炫目刀技厨师 (enemy_10229_agactr_2, 悬赏·精英; CN prefab battle/enm_pfb_34: Talents/AuraAttributeUp, an AuraAbility of radius
 * `AuraAttributeUp.range_radius` (2.5) over the ground enemies of its side): those there gain `attack_speed` (+50) attack
 * speed and `magic_resistance` (+25) RES (ADDITION; its `def` 0), one buff per cook (`disableOverride`). It is among
 * them itself: the aura's `_selfOption` is DEFAULT (see 搏命享受者, special.js kitUbba).
 * @type {AbKit}
 */
function kitAgactr(ab) {
  const r = T(ab, 'AuraAttributeUp.range_radius') ?? 2.5;
  const mods = { aspd: T(ab, 'AuraAttributeUp.attack_speed') ?? 0, resFlat: T(ab, 'AuraAttributeUp.magic_resistance') ?? 0, defFlat: T(ab, 'AuraAttributeUp.def') ?? 0 };
  const every = 0.2;
  return [{
    iv: every,
    tick(b, e) {
      const key = `ab:agactr:${e.id}`;
      for (const o of b.enemiesInRadius(e.x, e.y, r)) if (!o.isFlying) auraBuff(b, o, key, every, mods);
    },
  }];
}

/**
 * 内测版自助出餐终端 (enemy_10077_mpbarr, 悬赏·精英; EN prefab battle/enm_pfb_2): Skills/Spawn (AnimatedActionToOwnerAbility on
 * the Skill clip, AlwaysTrigger, cooldown 5 s, the first 3 s in) — at the clip's event one `enemy_key` (迷茫的修理小助手
 * enemy_10073_mpcar) at its own spot on the rest of its route (SummonEnemiesFollowMyRoute, `_stopSummonIfHostDead`). Its
 * Attack is an EmptyActiveAbility that never triggers: unblocked it only walks and summons; blocked it hits its blocker.
 * The helper's enemy_mpbarr_summon (IgnoreAllButMoveCp) has nothing to skip on a 规程 route.
 * @type {AbKit}
 */
function kitMpbarr(ab) {
  const s = ab.sk.Spawn, key = s && s.bs.enemy_key;
  return [skill(s, (b, e) => atCastEvent(b, e, s, () => {
    if (key) spawnChildren(b, e, key, 1, { route: remainingRoute(e), pos: [e.y, e.x] });
  }), { sil: true })];
}

/**
 * 破城者 (enemy_10123_uareap, 悬赏·精英; EN prefab battle/enm_pfb_27):
 * - `_blockVolume` 3: only a blocker with 3 free block stops it (its talent BlockMcreep's 矿工游击队 do not exist here);
 * - its normal attack is a single missile (projectile_enemy_uareap, no area) — the engine's;
 * - Skills/SkyProjectile (cooldown 10 s, the first 5 s in; SelectorTrigger: a ground ally in its range): a sequence of
 *   uareap_s[assign_addition_cnt] (blackboard `times` UAREAP_SHOTS) and the F_Skill clip, a MultiRangedAttack whose shots
 *   — the first at the clip's event, the next UAREAP_SHOT_EVERY apart — each take a ground ally in range not hit yet this
 *   cast (AdvancedSelectorWithExCludeWhenSucceeded: the ones a shot succeeded on are filtered out, cleared at the cast's
 *   start). Each missile lands UAREAP_MISSILE_DELAY s later on its target (AttachToTarget) and hits every ground ally
 *   within UAREAP_MISSILE_RADIUS for ATK × `atk_scale` (0.7) physical, camouflage ignored. With fewer allies in range
 *   than shots, the later shots find nobody and fire nothing, the volley playing on (공식 클라에서 확인: with
 *   `_allowNoTarget` AbilityStandard.UpdateTargets succeeds on no target, so the shot's spell runs and counts, and
 *   RangedAttack.DoCastOnTargets would emit to the input position only with `_emitToInputPosWhenTargetIsInvalid` or
 *   `_emitToInputRootTileWhenTargetIsInvalid`, both off here).
 * Its 指挥官 order (enemy_uacomd_extra_power: 6 missiles, F_Attack_B) never comes: no 规程 enemy gives it.
 * @type {AbKit}
 */
function kitUareap(ab) {
  const s = ab.sk.SkyProjectile, scale = (s && s.bb.atk_scale) ?? 0;
  const inRange = (/** @type {Battle} */ b, /** @type {Unit} */ e) => b.alliesInRadius(e.x, e.y, (e.base.rangeRadius || 0) + ALLY_COLLIDER_RADIUS, null).filter((u) => !u.isFlying && canTargetAlly(e, u, true));
  const land = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {Unit} */ t, /** @type {number} */ atk) => {
    let x = t.x, y = t.y;
    b.after(UAREAP_MISSILE_DELAY, () => {
      if (t.alive && t.deployed) { x = t.x; y = t.y; }
      b.fx('explode', { x, y, r: UAREAP_MISSILE_RADIUS, kind: 'uareap', id: e.id, ability: 'SkyProjectile' });
      if (atk > 0) for (const u of areaAllies(b, e, x, y, UAREAP_MISSILE_RADIUS)) if (!u.isFlying) hurt(b, e, u, atk, 'phys', { tags: ['splash', 'uareap'] });
    }, { holdsBattle: true });
  };
  return [blockWeight(3), skill(s, (b, e) => {
    // the F_Skill clip plays once over the whole sequence (the buff's two ticks + the clip): the cast's end, not castSkill's 0.5 s
    const k = e.mem.ab && e.mem.ab.casting;
    if (k) e.skillAnimUntil = k.until;
    const hit = new Set();
    const atk = e.s.atk * scale;
    // the first shot at the sequence's spell: its ActiveBuffAbility's two fixed updates, then F_Skill's event (castStrikeAt)
    const first = castStrikeAt(e, s.cast, s.bb) ?? 0;
    for (let i = 0; i < UAREAP_SHOTS; i++) {
      atCastEvent(b, e, s, () => {
        const t = byPriority(e, inRange(b, e).filter((u) => !hit.has(u)))[0];
        if (!t) return;
        hit.add(t);
        b._ev(['atk', e.id, t.id, 'uareapMissile']);
        land(b, e, t, atk);
      }, first + i * UAREAP_SHOT_EVERY);
    }
  }, { cond: (b, e) => inRange(b, e).length > 0 })];
}

/** The tile 聆风猎手 blinks to next to `u`: `u`'s own tile when the hunter can stand there, else the nearest such tile (by
 *  distance, the first in row order on a tie) — not an exit (AssignNearestReachableTileToBB `_checkOnSameTile`,
 *  `_excludedTileKey` tile_end).
 * @param {Battle} b @param {Unit} u @returns {number[] | null} */
function blinkTile(b, u) {
  const g = b.grid, R = g.rect;
  const ok = (/** @type {number} */ r, /** @type {number} */ c) => g.groundPassable(r, c) && g.tile(r, c).special !== 'end';
  const r0 = Math.round(u.y), c0 = Math.round(u.x);
  let best = null, bd = Infinity;
  for (let r = R.r0; r <= R.r1; r++) {
    for (let c = R.c0; c <= R.c1; c++) {
      if (!ok(r, c)) continue;
      const d = (c - c0) * (c - c0) + (r - r0) * (r - r0);
      if (d < bd) { bd = d; best = [r, c]; }
    }
  }
  return best;
}

/**
 * 聆风猎手 (enemy_2135_shkrbt, 悬赏·特异; CN prefab battle/enm_pfb_33): CommonAbilities/BlinkCheck (enemy_shkrbt_blink_check,
 * ON_TAKE_DAMAGE) — damaged by an ally while not blocked and not cooling down, it casts Skills/Blink at its attacker
 * (TriggerEnemySkill, `_interruptCurAbility`): enemy_shkrbt_blink puts the `cooldown` (30 s) on it and blinks it onto
 * blinkTile of that ally (BlinkNode); `_resetMainAbilityCdWhenCastEnd` (no wait-first): its attack is ready at once.
 * Its attack hits a ground ally within its range (1.1) blocked or not — the engine's ranged attack, its data's.
 * Stunned, it does not blink (공식 클라에서 확인): Enemy.TriggerEnemySkill casts in the attack or combat state, else only
 * when the current state's CheckSwitchOut lets it go to ATTACK (2) — StunState allows only states 5, 8, 9, 10 and 14
 * while the enemy is stunned.
 * [추정·CN: the reachable-tile search's tie order and whether it asks for a path to the tile — AssignNearestReachableTileToBB
 * is not in the EN client and the CN code cannot be read]
 * @type {AbKit}
 */
function kitShkrbt(ab) {
  const s = ab.sk.Blink, cool = (s && (s.bb.cooldown ?? s.cd)) ?? 30;
  return [{
    spawn(b, e, a) { a.until = -Infinity; },
    taken(c, b, e, a) {
      const src = c.source;
      if (!e.alive || !src || src.side !== 'ally' || !src.alive || e.blockedBy || b.time < /** @type {number} */ (a.until) - 1e-9 || !canCast(e, false, b)) return;
      const tile = blinkTile(b, src);
      if (!tile) return;
      a.until = b.time + cool;
      if (e.castLeft > 0 && !e.castSwing) interruptEnemyCast(b, e);
      e.swing = null;
      e.castLeft = 0;
      b._cutAttackStand(e);
      e.atkStandUntil = -Infinity;
      const fromX = e.x, fromY = e.y;
      e.x = tile[1]; e.y = tile[0];
      if (e.route) e.route.pts = null;
      if (b._indexEnemy) b._indexEnemy(e);
      e.atkCd = 0;
      b.fx('teleport', { x: e.x, y: e.y, fromX, fromY, id: e.id, kind: 'shkrbt', ability: 'Blink' });
    },
  }];
}

/**
 * 暴走食人花 (enemy_10003_trwlpl_2, 悬赏·特异; EN prefab battle/enm_pfb_0). ATK 0: its Attack (MeleeAttack, the same ability
 * for attack and combat, `_timeMode` 1: the Attack_Begin clip is its time and cooldown) takes, blocked or not, the first
 * of: an ally within TRWLPL_BITE_RADIUS (any motion), a 食物 device (TRFOOD) or an enemy carrying enemy_trtrsl_t — the
 * last two do not exist here. While it bites it stands, 失衡-immune, immune to 晕眩 / 浮空 / 冻结 / 沉睡. At the clip's
 * event (enemy_trwlpl_on_eat) an ally still on the field is devoured: enemy_common[devour] → devour_holder → InstantKill
 * (the main story keeps its deploy card for later; a 规程 battle has no redeploy, so it is gone). Then (enemy_trwlpl_eat
 * finishing with enemy_trwlpl_eat_success) it switches to mode Eat and casts Skills/Eat: `duration` (20) s of digesting
 * where it stands (Attack_Idle, then Attack_End), the same immunities and 恐惧 too, no attack; then back to Default.
 * Killed meanwhile it plays Attack_Die and gives back what it ate — its food's tokens (GainToken), which this mode has no
 * use for. Its talent InitEat (a 40 s digest as it appears, with 2 下脚料) starts only from a stage that sets its mode
 * blackboard to 2 (enemy_trwlpl_eat ON_BUFF_FINISH); the buff here has none, so it never does.
 * @type {EnemyKit}
 */
function kitTrwlpl(ab, e0) {
  const anim = (e0 && e0.def && e0.def.attackAnim) || {};
  const biteDur = anim.dur > 0 ? anim.dur : 1.5, biteHit = Number.isFinite(anim.hit) ? anim.hit : biteDur;
  const eat = ab.sk.Eat, eatDur = (eat && eat.bb.duration) ?? 20;
  const reach = TRWLPL_BITE_RADIUS + ALLY_COLLIDER_RADIUS;
  const setImmune = (/** @type {Unit} */ e, /** @type {readonly string[] | null} */ list) => { e.mem.ab.immune = list ? new Set([...(e.mem.ab.baseImmune ?? []), ...list]) : (e.mem.ab.baseImmune ? new Set(e.mem.ab.baseImmune) : null); };
  const done = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {EnemyAbility} */ a) => {
    a.state = null;
    b.removeBuff(e, 'ab:trwlplHold');
    setImmune(e, null);
    mode(b, e, null);
    setForm(b, e, null);
  };
  return [{
    spawn(b, e, a, abx) { a.state = null; a.next = 0; abx.baseImmune = abx.immune ? [...abx.immune] : null; },
    tick(b, e, /** @type {TimedAb} */ a) {
      if (a.state === 'eat') { if (b.time >= a.until - 1e-9) done(b, e, a); return; }
      if (a.state || b.time < a.next - 1e-9 || e.hidden || !canCast(e, false, b) || e.s.flags.fear) return;
      const t = byPriority(e, b.alliesInRadius(e.x, e.y, reach, null).filter((u) => canTargetAlly(e, u, true)))[0];
      if (!t) return;
      a.state = 'bite';
      a.next = b.time + biteDur;
      e.atkCd = biteDur;
      e.castLeft = biteDur;
      e.castSwing = true;
      e.atkStandUntil = Math.max(/** @type {number} */ (e.atkStandUntil), b.time + biteDur);
      b.addBuff(e, { key: 'ab:trwlplHold', duration: biteDur, flags: { noMove: true, noDisplace: true } });
      setImmune(e, TRWLPL_BITE_IMMUNE);
      b._ev(['swing', e.id, Math.round(biteHit * 1000) / 1000, 'none']);
      b.after(biteHit - 1e-9, () => {
        if (!e.alive || a.state !== 'bite') return;
        if (t.alive && t.deployed) { b._ev(['atk', e.id, t.id, 'devour']); b.kill(t, e); a.ate = true; } else a.ate = false;
      }, { owner: e });
      b.after(biteDur - 1e-9, () => {
        if (!e.alive || a.state !== 'bite') return;
        if (!a.ate) { a.state = null; b.removeBuff(e, 'ab:trwlplHold'); setImmune(e, null); return; }
        a.state = 'eat';
        a.until = b.time + eatDur;
        mode(b, e, 'Eat');
        setForm(b, e, 'eat');
        b.addBuff(e, { key: 'ab:trwlplHold', duration: eatDur + 1, refresh: 'replace', flags: { noMove: true, noDisplace: true } });
        setImmune(e, TRWLPL_EAT_IMMUNE);
        b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: 'Eat', n: 1 });
      }, { owner: e });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const BOUNTY_KITS = /** @type {Readonly<Record<string, EnemyKit>>} */ (Object.freeze({
  enemy_10146_nscola: kitNscola,                                     // 开天汽水瓶 (规程 悬赏) · loses 120 HP/s, speeds up ×(1 + 0.3 n), n ≤ 25
  enemy_10147_nsbomb: kitNsbomb,                                     // 遮天面包机 (规程 悬赏) · a bomb under it every 2.5 s (r 1, ATK ×2)
  enemy_10229_agactr_2: kitAgactr,                                   // 炫目刀技厨师 (规程 悬赏) · ground enemies within 2.5: ASPD +50, RES +25
  enemy_10077_mpbarr: kitMpbarr,                                     // 内测版自助出餐终端 (规程 悬赏) · summons 迷茫的修理小助手 every 5 s
  enemy_10123_uareap: kitUareap,                                     // 破城者 (规程 悬赏) · block ≥ 3; volley of 3 missiles (r 1.1, ATK ×0.7)
  enemy_2135_shkrbt: kitShkrbt,                                      // 聆风猎手 (规程 悬赏) · hit while free: blinks to its attacker (30 s)
  enemy_10003_trwlpl_2: kitTrwlpl,                                   // 暴走食人花 (规程 悬赏) · devours an ally within 1, digests 20 s
}));

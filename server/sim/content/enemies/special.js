// server/sim/content/enemies/special.js — SPECIAL 特异 kits (prisoners, 穿刺手, 暴虐兵长, 镜卫, chimeras, 圣杯, the act-2 specials
// …) and their part of KITS (split from content/enemies.js).

import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { canTargetAlly, areaSelectable } from '../../targeting.js';
import { periodicDamage } from '../../damage.js';
import {
  nthOf, stOf, T, elem, hurt, targetsNear, allTargets, areaAllies, areaAlliesInTiles, byPriority,
  stayRoute, spawnChildren, expose, auraBuff, watchDeaths, onTerrain, mode, setForm, atCastEvent, castLength,
} from './helpers.js';
import {
  unblockable, runWhenHit, blockWeight, taunt, maxTargets, ep, nthAttackPower, lowHpBuff, deathBoom, setFloat, float,
  reborn, frontGuard, faceMove, unbalanced, skill, kitEp, kitPrisoner, kitStun3,
} from './archetypes.js';
import { hypot, roundHalfEven } from '../../detmath.js';
import { enemyShot, shotSpeed } from '../../ai.js';

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 孽罪奇美拉 污染模式 aura (PRTS 天赋 "自身半径1.2范围内的所有单位…每0.5秒受到50真实持续伤害（同类效果取最高）"): radius,
 *  damage period (s). */
const CHIMERA_AURA_RADIUS = 1.2, CHIMERA_AURA_EVERY = 0.5;

/** 萨卡兹枯朽前锋 / 辟路前锋 / “灵幛”: the period of their mode checks (공식 클라에서 확인 2026-11-20 — each mode's talent buff
 *  enemy_lrsldr / enemy_lrnazg[switchMode][toOrig] / [toDefault], `triggerInterval` 0.5, the first one a period after its
 *  mode attaches). */
const ORIGINIUM_CHECK = 0.5;
const CHIMERA_KEYS = new Set(['enemy_1425_lrcmra', 'enemy_1425_lrcmra_2']);

/** 自行炮 Cannon (PRTS 高准度伦蒂尼姆城防自行炮 技能 "以攻击范围内生命上限最高的我方单位为中心，生成9格的炮击区域，6s内每0.5s对炮击
 *  区域中生命比例最高的我方单位进行攻击…(最多进行10次攻击)"; 공식 클라에서 확인 — projectile_enemy_stmgun_s: SelectorHitBehaviour
 *  `_interval` 0.5 / `_waitFirstPeriod`, `_maxHitNum` 10, life 6 s): shot interval (s), shot cap; and the delay of each shot's
 *  damage — the hit puts the ability's active buff enemy_stmgun_s[damage] on the ally it picked, whose one trigger
 *  (`triggerInterval` 0.2, `waitFirstTriggerInterval`) deals it. */
const CANNON_EVERY = 0.5, CANNON_SHOTS = 10, CANNON_DAMAGE_DELAY = 0.2;

const CANNON_IMMUNE = Object.freeze(['stun', 'freeze', 'cold', 'levitate', 'sleep']);

/** Radius of 骸骨拷打者's "周围" death sensing when its talent has no Attack.range_radius [ASSUMED]. */
const TORTURER_RADIUS = 1;

/** Barrel zone radius of 咸鳞汁推荐者 [ASSUMED]. */
const BARREL_RADIUS = 1.5;

/** 伊利昂的木驮兽 passengers (client prefab `Talents/bus`, a DurbusAbility): the boarding circle (its Selector's
 *  CircleCollider2D, radius in tiles) and the drop-off scatter (`_randomOffsetBound`, ± per axis). The stacked −20 % per
 *  passenger reaches 0 at 5; the engine's 移动速度 floor (constants.js MOVE_SPEED_MIN) keeps it at 0.1. */
const BUS_RADIUS = 0.5, BUS_DROP_SCATTER = 0.2;

// ---------------------------------------------------------------------------------------------------------------
// kits

/** 萨卡兹枯朽前锋 / 辟路前锋: arts attacks in the prefab's mode Originium (its Combat `_damageType` MAGICAL, Default's PHYSICAL;
 *  공식 클라에서 확인 2026-11-20 — until then by the tile under it as each hit landed). */
function infectionArts() {
  return { hitOut(c, b, e) { if (c.dmg.isAttack && e.mode === 'Originium') c.dmg.type = 'arts'; }, ...originiumMode() };
}

/**
 * Whether unit `u` counts as on 源石 for these modes and selectors (공식 클라에서 확인 2026-11-20: they check for any of the
 * buffs `buff_originum[tile]` — a 源石污染区 tile — `enemy_lrcmra[originum][mark]` and `enemy_bigstorm[mark]`, the last not in
 * this mode): an infection tile, or the aura of a 孽罪 / 渎罪奇美拉 in its mode Originium (its `OrigAura`, an AuraAbility of
 * radius CHIMERA_AURA_RADIUS on ground units of both sides, hands out that mark — an operator there holds `ab:originium`).
 */
function onOriginium(b, u) {
  if (onTerrain(b, u, 'infection')) return true;
  if (u.side === 'ally') return !!u.findBuff('ab:originium');
  if (u.isFlying) return false;
  for (const o of b.enemiesInRadius(u.x, u.y, CHIMERA_AURA_RADIUS, true)) if (o !== u && CHIMERA_KEYS.has(o.defId) && o.mode === 'Originium') return true;
  return false;
}

/**
 * 萨卡兹枯朽前锋 / 辟路前锋 / “灵幛”: the prefab's mode Originium while it is on 源石 (onOriginium), the first one off it: each
 * mode's talent buff (enemy_lrsldr / enemy_lrnazg[switchMode][toOrig] in Default, [toDefault] in Originium) checks every
 * ORIGINIUM_CHECK s from the moment its mode attached and switches with a state-machine restart (ai.js enemyMode). Until
 * 2026-11-20 every 0.25 s [추정].
 */
function originiumMode() {
  return {
    spawn(b, e, a) { a.next = b.time + ORIGINIUM_CHECK; },
    tick(b, e, a) {
      if (a.next == null || b.time + 1e-9 < a.next) return;
      a.next += ORIGINIUM_CHECK;
      mode(b, e, onOriginium(b, e) ? 'Originium' : null);
    },
  };
}

function kitChimera(ab) {
  const dmg = T(ab, 'OrigAura.damage') ?? 0, spr = T(ab, 'OrigAura.sp_recover_ratio') ?? 0;
  const activate = (b, e, a) => {
    if (a.on || !onTerrain(b, e, 'infection')) return;
    a.on = true;
    e.mem.ab.atkType = 'arts';
    mode(b, e, 'Originium');   // enemy_lrcmra[switchMode] SwitchMode 1: its attack Attack_2
    setForm(b, e, 'Originium');   // Skills/triggerAnim's Skill, then the *_2 clips (render/units.js FORMS)
    b.fx('telegraph', { x: e.x, y: e.y, r: CHIMERA_AURA_RADIUS, kind: 'chimera', id: e.id });
  };
  return [{
    hitOut(c, b, e, a) { if (c.dmg.isAttack && !a.on) { activate(b, e, a); if (a.on) c.dmg.type = 'arts'; } },
    iv: 0.25,
    tick(b, e, a) {
      activate(b, e, a);
      if (!a.on) return;
      a.acc = (a.acc ?? 0) + 0.25;
      const pulse = a.acc >= CHIMERA_AURA_EVERY - 1e-9;
      if (pulse) a.acc -= CHIMERA_AURA_EVERY;
      // its OrigAura's TargetValidator: ground units only (`targetMotion` 1) — never the 炎佑 dragon (until 2026-11-20 it was)
      for (const u of b.alliesInRadius(e.x, e.y, CHIMERA_AURA_RADIUS)) {
        if (u.isFlying) continue;
        auraBuff(b, u, 'ab:originium', 0.25, { spRecoveryMul: Math.max(0, 1 + spr) }, null, true);
        // PRTS "持续视为受到源石污染区影响…每0.5秒受到50真实持续伤害": a damage instance (受击回复, the 重装 trigger), not a
        // 流失 — 无来源 like the 源石污染区 terrain it stands for [ASSUMED], the chimera keeps the credit; "同类效果取最高": one
        // tick per unit per period however many chimeras reach it (`mem.chimeraAt`; every chimera's is 50). A terrain
        // effect, not an area selection: 隐匿 allies inside are reached too ("所有单位" [ASSUMED], DESIGN §22.12)
        if (!pulse || !(dmg > 0) || b.time - (u.mem.chimeraAt ?? -Infinity) < CHIMERA_AURA_EVERY - 1e-6) continue;
        u.mem.chimeraAt = b.time;
        b.dealDamage(e, u, { ...periodicDamage(dmg), tags: ['dot', 'pollution'] });
      }
    },
  }];
}

function kitNazg(ab, e) {
  const r = (e.def.raw && e.def.raw.stats && e.def.raw.stats.rawRangeRadius) || e.base.rangeRadius || 1.3;
  return [{
    before(c, b, e2) {
      const l = targetsNear(b, e2, r);
      // mode Originium: its selector Selector_p2 also takes, anywhere on the field, the ground units on 源石 (onOriginium)
      if (e2.mode === 'Originium') for (const u of b.allies()) if (!l.includes(u) && onOriginium(b, u) && canTargetAlly(e2, u, true)) l.push(u);
      if (l.length) c.targets = byPriority(e2, l);
    },
  }, originiumMode()];
}

/** 吉兆飞鳞 【失温坠落】: the stun when a freeze ends (PRTS "冻结结束时，获得0.05秒晕眩"). */
const PARROT_CHILL_STUN = 0.05;

/**
 * 吉兆飞鳞 (PRTS): 近地悬浮 (失衡免疫), no normal attack; 受晕眩/无法行动/沉睡/缚地影响后进入晕眩模式 — the float is off, it
 * cannot be blocked and is stunned `Stun.duration` (8) s — and floats again once none of those effects holds it
 * (初始模式); 冻结 grounds it only when the freeze ends (【失温坠落】: 0.05 s stun). 首次受到伤害后 its speed is ×
 * `M0SpeedUp.move_speed` for `M0SpeedUp.duration` s ("最终提升至300%"; never in 晕眩模式, dropped when its mode
 * changes). 搬运模式 (carrying a 寻险水手) needs a level checkpoint (`ThrowEnemy.checkpoint` 0 = never) — not in this mode.
 */
function kitParrot(ab) {
  const down = T(ab, 'Stun.duration') ?? 0;
  return [float(), {
    taken(c, b, e, a) {
      if (a.ran || a.down) return;
      a.ran = true;
      b.addBuff(e, { key: 'ab:parrotRun', duration: T(ab, 'M0SpeedUp.duration') ?? 0, mods: { moveMul: T(ab, 'M0SpeedUp.move_speed') ?? 1 } });
    },
    status(c, b, e, a) {
      if (c.status === 'freeze') { a.chill = true; return; }
      if (a.down || !(c.status === 'stun' || c.status === 'sleep' || c.status === 'groundbind')) return;
      a.down = true;
      setFloat(b, e, false);
      b.removeBuff(e, 'ab:parrotRun');
      b.addBuff(e, { key: 'ab:parrotDown', flags: { unblockable: true }, persist: true });
      mode(b, e, 'Stun', false);   // parrot_a[fly] ON_BUFF_DISABLE SwitchMode 2 (no restart): no attack ability there
      if (down > 0) b.applyStatus(e, 'stun', { duration: down, source: null });
      b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'grounded' });
    },
    tick(b, e, a) {
      if (a.chill && !e.s.flags.freeze) { a.chill = false; b.applyStatus(e, 'stun', { duration: PARROT_CHILL_STUN, source: null }); }
      // "离开上述异常效果影响后进入初始模式": s.flags.stun also holds while asleep / frozen (units.js), so a sleep that
      // outlasts the mode stun keeps it down; so does a 缚地 (flag `groundbind`)
      if (a.down && !e.s.flags.stun && !e.s.flags.groundbind) {
        a.down = false;
        b.removeBuff(e, 'ab:parrotDown');
        b.removeBuff(e, 'ab:parrotRun');
        setFloat(b, e, true);
        mode(b, e, null);   // parrot_a[fly] ON_BUFF_ENABLE SwitchMode 0
        b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'float' });
      }
    },
  }];
}

/**
 * 萨卡兹穿刺手 (PRTS 天赋; the battle prefab's Rush / FirstAttack abilities — templates dlancer_t_listener[a] / [b] / [c],
 * dlancer_t[trigger], dlancer_t_atk): every RUSH_LISTEN (0.1) s — 晕眩 (STUNNED) or 束缚 (UNMOVABLE) ends the acceleration
 * and its speed layers with it; not blocked and not accelerating starts it. While it accelerates, every
 * `rush.dlancer_t[trigger].interval` (0.5) s — the first one 0.5 s after the start — one more layer of move speed
 * +`move_speed` (50 %, MULTIPLIER, the layers add up), at most `trig_cnt` (25) tries — blocked or not, frozen, asleep or
 * slowed or not (only the two flags stop it). Every normal attack carries dlancer_t_atk: while it accelerates, the hit
 * adds 当前移动速度 × `firstattack.atk_scale` (600) physical damage — a second instance, melee, no 受击回复 (ignoreForSp) —
 * and ends the acceleration, so once blocked only its first hit has it. Until 0.2.0 it kept accelerating through a stun
 * and kept the speed after it, and the first hit after a block multiplied the attack instead (×(1 + 6 × layers / 25)),
 * a stun in between included (community report of 2026-10-06, item 36).
 */
const RUSH_LISTEN = 0.1;

/**
 * The rush of 萨卡兹穿刺手 (talent keys `rush.dlancer_t[trigger].*` / `firstattack.atk_scale`, physical) — and of 赏金猎人“骑士”
 * (enemy_1413_mmstck, 规程's 悬赏·特异 card; official prefab battle/enm_pfb_16: templates enemy_mmstck_t_listener[a] / [b],
 * enemy_mmstck_t[trigger], enemy_mmstck_t_atk — the same nodes, its listener [a] checking 晕眩 and 束缚 together
 * (CheckAbnormalFlags) where 穿刺手 has one listener each, its speed layers ended with the trigger
 * (`_finishDerivedBuffIfParentFinish`, as here for both), and its bonus hit MAGICAL: `Rush.enemy_mmstck_t[trigger].*`,
 * `FirstAttack.atk_scale` 550, arts). Its RopeTriggerAbility answers a stage rope no 规程 stage has.
 */
function kitRush(ab, { prefix = 'rush.dlancer_t[trigger]', scaleKey = 'firstattack.atk_scale', type = 'phys' } = {}) {
  const ms = T(ab, `${prefix}.move_speed`) ?? 0, iv = T(ab, `${prefix}.interval`) ?? 0.5;
  const max = T(ab, `${prefix}.trig_cnt`) ?? 0, scale = T(ab, scaleKey) ?? 0;
  // 晕眩 / 束缚 only (the client's STUNNED / UNMOVABLE flags: not 冻结, 沉睡 or 浮空, which hold flags.stun here too)
  const held = (e) => e.buffs.some((x) => x.status === 'stun' || x.status === 'bind');
  const stop = (b, e, a) => { a.on = false; a.n = 0; b.removeBuff(e, 'ab:rush'); };
  return [{
    iv: RUSH_LISTEN,
    // the listeners first look at once (waitFirstTriggerInterval 0): a walker spawned unblocked starts at t = 0
    spawn(b, e, a) { a.on = !e.blockedBy && !held(e); a.n = 0; a.tries = 0; a.acc = 0; },
    tick(b, e, a, dt) {
      if (held(e)) { if (a.on) stop(b, e, a); return; }
      if (!a.on) {
        if (!e.blockedBy) { a.on = true; a.tries = 0; a.acc = 0; }
        return;
      }
      if (a.tries >= max || !(iv > 0)) return;
      a.acc += dt;
      let grew = false;
      while (a.acc >= iv - 1e-9 && a.tries < max) { a.acc -= iv; a.tries++; a.n++; grew = true; }
      if (grew) b.addBuff(e, { key: 'ab:rush', mods: { moveMul: 1 + ms * a.n }, persist: true });
    },
    dealt(c, b, e, a) {
      if (!a.on) return;
      const t = c.target;
      const amount = e.s.moveSpeed * scale;
      stop(b, e, a);
      if (t && t.alive && amount > 0) b.dealDamage(e, t, { amount, type, canDodge: false, isSkill: true, noSp: true, tags: ['enemyAbility', 'rush'] });
    },
  }];
}

/**
 * 萨卡兹悖谬暴虐兵长: blocked only by a blocker with ≥ 3 free block; its first hit also strikes the units around its target
 * (PRTS 技能0 暴击 "对目标和周围4格的我方单位造成攻击力150%的物理普通伤害（无视无法选择，无视迷彩）※此技能仅能触发一次"):
 * the splash ignores 无法选择, so it reaches an airborne 起飞 ally too (`ignoreSelect`).
 */
function kitFirstAoe(ab) {
  const scale = T(ab, 'AOEAttack.atk_scale') ?? 0;
  return [blockWeight(3), {
    dealt(c, b, e, a) {
      if (a.done) return;
      a.done = true;
      b.fx('explode', { x: c.target.x, y: c.target.y, r: 1, kind: 'aoeAttack' });
      for (const u of b.alliesInRadius(c.target.x, c.target.y, 1)) {
        if (u !== c.target) hurt(b, e, u, e.s.atk * scale, 'phys', { ignoreSelect: true, tags: ['aoeAttack'] });
      }
    },
  }];
}

function kitDefDecay(ab) {
  const max = T(ab, 'def_reduce.max_stack_cnt') ?? 0, def = T(ab, 'def_reduce.def') ?? 0, res = T(ab, 'def_reduce.magic_resistance') ?? 0;
  return [{
    taken(c, b, e) {
      if (!(max > 0)) return;
      b.addBuff(e, { key: 'ab:defDecay', refresh: 'stack', stacks: 1, maxStacks: max, persist: true, mods: { defFlat: def / max, resFlat: res / max } });
    },
  }];
}

function kitExposeOnHit(ab) {
  const dur = T(ab, 'Expose.weak[limit]') ?? 0, scale = T(ab, 'Expose.damage_scale') ?? 1;
  return [{ sil: true, taken(c, b) { const s = c.source; if (s && s.side === 'ally' && s.alive && s.kind !== 'device') expose(b, s, dur, scale); } }];
}

/**
 * 伊利昂的木驮兽 (handbook "可以装载最多5名乘客，每名乘客使移动速度下降一定比例"), the client's DurbusAbility on the prefab's
 * `Talents/bus` (docs/rules/sim.md 「나무 버든비스트 승객」):
 * - every tick it is not stunned / frozen / levitated / asleep (`OnTick` → `_SearchPassengers`), it takes on board the
 *   enemies inside its circle (Selector: same side, not itself, no `machine`, not untargetable; TargetValidator: NORMAL /
 *   ELITE only — no leader —, ground only) until it carries `bus.max_cnt`. A passenger leaves the field
 *   (`SetDisappeared`: hidden, it does not move or act) and the 驮兽 takes one stack of `bus.move_speed` (buff
 *   enemy_mntrjn_add → enemy_mntrjn_move[stack], MOVE_SPEED MULTIPLIER: the stacks add up, 1 + n × −0.2, floored at
 *   the attribute minimum). Boarding order inside the circle: nearest first [ASSUMED].
 * - when it leaves the field (`OnDetached` → `ReleaseAllPassengers`: knocked out, leaked, any removal) every passenger
 *   gets off at its position ± `_randomOffsetBound` and walks on along the 驮兽's own route from where it was
 *   (`_useHostRoute`: the host's route and cursor index); a leaked 驮兽 drops them at the exit, where they leak in turn.
 *   Getting off takes one stack back (enemy_mntrjn_reduce); a passenger lost on board keeps its stack, as in the client.
 * Neither boarding nor getting off has an effect of its own (`_effectWhenAddPassenger` / `_effectOnPassengerWhenRelease`
 * are empty). The cart's spine skin (default → half at `bus.half_cnt` → full at max) is the model form (below).
 *
 * “越长尘” (`enemy_1302_ymtro_2`, `camel` false; PRTS 天赋&能力 as upstream 18cb28fe reads it): the same boarding, up to
 * `Bus.max_cnt` (4, its talent blackboard), no slow and no model form; each passenger gets off on the centre of the
 * carrier's tile (rounded half to even, as body.js) and walks on along its OWN remaining route from where it boarded
 * [ASSUMED, upstream: PRTS names no route replacement for this one]. Its block weight stays (blockWeight 4).
 */
function kitBus(ab, { camel = true } = {}) {
  const max = (camel ? T(ab, 'bus.max_cnt') : T(ab, 'Bus.max_cnt')) ?? 0;
  const per = camel ? (T(ab, 'bus.move_speed') ?? 0) : 0, half = T(ab, 'bus.half_cnt') ?? Infinity;
  const slow = (b, e, a) => {
    if (!camel) return;
    if (a.stacks <= 0) b.removeBuff(e, 'ab:bus');
    else b.addBuff(e, { key: 'ab:bus', persist: true, mods: { moveMul: Math.min(1, Math.max(0, 1 + a.stacks * per)) } });
    // enemy_mntrjn_mark: the Spine skin by the stack count — default, Half (half_cnt), Full (max_cnt) — as the model form
    // 'half' / 'full' (render/units.js SKIN_FORMS); a silent 'phase' fx (render/fx/kinds.js SILENT_PHASES)
    const form = max > 0 && a.stacks >= max ? 'full' : a.stacks >= half ? 'half' : null;
    if ((e.form ?? null) === form) return;
    e.form = form;
    b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'passengers', form });
  };
  const board = (b, e, o) => {
    if (o === e || !o.alive || o.hidden || o.motion === 'FLY' || o.isBoss || (o.def && o.def.rank === 'BOSS')) return false;
    if ((o.def && Array.isArray(o.def.tags) && o.def.tags.includes('machine')) || o.s.flags.untargetable) return false;
    return true;
  };
  const bus = {
    spawn(b, e, a) { a.pax = []; a.stacks = 0; },
    tick(b, e, a) {
      a.pax = a.pax.filter((p) => p.alive);
      if (e.hidden || e.s.flags.stun || a.pax.length >= max) return;
      const near = b.enemiesInRadius(e.x, e.y, BUS_RADIUS).filter((o) => board(b, e, o))
        .map((o) => ({ o, d: hypot(o.x - e.x, o.y - e.y) })).sort((p, q) => p.d - q.d || p.o.spawnSeq - q.o.spawnSeq);
      let n = 0;
      for (const { o } of near) {
        if (a.pax.length >= max) break;
        b._cutAttackStand(o);
        b._setHidden(o, true, { fx: false });
        o.pauseUntil = Infinity;   // carried: it neither walks its route nor waits out its legs
        o.mem.busOf = e;
        a.pax.push(o);
        a.stacks++;
        n++;
      }
      if (n) slow(b, e, a);
      // enemy_mntrjn_add's PlayAudio for each passenger taken on (audio; “越长尘”'s bus has none)
      if (n && camel) b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'mntrjn:add', n });
    },
    death(c, b, e, a) {
      for (const p of a.pax) {
        if (!p.alive) continue;
        if (camel) {
          p.x = e.x + b.rng.range(-BUS_DROP_SCATTER, BUS_DROP_SCATTER);
          p.y = e.y + b.rng.range(-BUS_DROP_SCATTER, BUS_DROP_SCATTER);
        } else {
          p.x = roundHalfEven(e.x);
          p.y = roundHalfEven(e.y);
        }
        b._clampPos(p);
        // the camel's route from its cursor (`_useHostRoute`); “越长尘”: the passenger's own route from where it boarded
        const R = camel ? e.route : p.route;
        if (R) p.route = { legs: R.legs.slice(), legIdx: R.legIdx, pts: null, ptIdx: 0, suffix: null, version: -1, waitLeft: R.waitLeft };
        p.pauseUntil = -Infinity;
        p.mem.busOf = null;
        b._setHidden(p, false, { fx: false });
        a.stacks--;
      }
      a.pax = [];
      slow(b, e, a);
    },
  };
  return camel ? [unblockable(), bus] : [bus];
}

/**
 * 自制投石机 (PRTS 天赋, upstream 31a172e2). A stone is a physical attack that splashes every ally within 1.5 of the impact
 * (the page's 半径1.5; the blackboard `projectile_range` 0.5 belongs to the 入戏 random-offset stone, which no table of
 * this mode grants). `times` stones land `hit_interval` (0.3 s) apart, each its own damage instance — DEF, shields and
 * 「每次受到攻击」 effects (坚守 thorns) see them separately. The attack does not end when the target is lost: a later
 * stone still splashes at the last aim, and a stone already thrown or scheduled still lands if the catapult dies (no
 * `owner` on the timers). A stone hits its locked ally while that one is still selectable, then splashes around the impact.
 */
const CATAPULT_SPLASH = 1.5;
const CATAPULT_STONE = 'catapult:stone';

function catapultStone(b, e, aim) {
  const t = aim.target;
  if (t && t.alive) { aim.x = t.x; aim.y = t.y; }
  let skip = null;
  if (t && t.alive && canTargetAlly(e, t, true)) {
    b.dealDamage(e, t, { amount: e.s.atk, type: 'phys', isAttack: true, tags: [CATAPULT_STONE] });
    skip = t;
  }
  for (const u of areaAllies(b, e, aim.x, aim.y, CATAPULT_SPLASH)) {
    if (u === skip) continue;
    b.dealDamage(e, u, { amount: e.s.atk, type: 'phys', isAttack: true, isSplash: true, tags: [CATAPULT_STONE] });
  }
}

/**
 * The volley: stone i is thrown `hit_interval` × i after the strike and flies its official shot (data `proj`, PARACURVE
 * 8 tiles/s: the horizontal distance to the aim at the throw / speed — ai.js shotSpeed) before it lands. Every stone flies
 * like the first (maintainer decision 2026-10-17; upstream lands them without a flight); the 'atk' event draws one shot
 * (profile.shot 'enemy').
 */
function catapultVolley(ab, b, e, aim) {
  const n = Math.max(1, Math.floor(T(ab, 'Attack.attack@times') ?? 1));
  const interval = T(ab, 'Attack.attack@hit_interval') ?? 0.3;
  const speed = shotSpeed(enemyShot(e));
  const land = () => catapultStone(b, e, aim);
  const toss = () => {
    const t = aim.target;
    if (t && t.alive) { aim.x = t.x; aim.y = t.y; }
    const flight = speed > 0 ? hypot(aim.x - e.x, aim.y - e.y) / speed : 0;
    if (flight > 0) b.after(flight, land); else land();
  };
  for (let i = 0; i < n; i++) {
    if (i === 0 || !(interval > 0)) toss();
    else b.after(interval * i, toss);
  }
}

/**
 * A death blast's projectile life (data/enemies.json talentProj[name].life — its prefab's `_lifeTime`; deathBoom `delay`), or
 * `dflt` when the data has none.
 */
const boomLife = (e, name, dflt) => { const l = e?.def?.raw?.talentProj?.[name]?.life; return Number.isFinite(l) && l > 0 ? l : dflt; };
/** The death blasts' projectiles (EN client battle/prefabs/[uc]projectiles): CircleCollider2D radius and `_lifeTime`. */
const BSLIME_BOOM = { r: 1.25, life: 1 }, SNSLIME_BOOM = { r: 1.65, life: 1 }, LRBOOM_LIFE = 1;
/** 冰爆源石虫 / ·α: knocked out, `boom.atk_scale` physical within projectile_snslime's radius + `boom.freeze` s cold, as the
 *  projectile's life ends (deathBoom; until 2026-11-14 at once, within its attack range 1.75). */
const kitIceSlime = (ab, e) => [deathBoom({ scale: T(ab, 'boom.atk_scale') ?? 0, r: SNSLIME_BOOM.r, delay: boomLife(e, 'Boom', SNSLIME_BOOM.life), status: { key: 'cold', dur: T(ab, 'boom.freeze') ?? 0 }, ability: 'boom' })];

/** 雪怪小队 / 雪怪小队破冰者: its attack on a 冻结 target × `atkup.atk_scale` (template e2c_frozen_atkscale: ON_CALCULATE_DAMAGE,
 *  CheckAbnormalFlag FROZEN on the target, AtkScaleUp). */
const kitFrozenAtk = (ab) => [{ hitOut(c) { if (c.dmg.isAttack && c.target.s.flags.freeze) c.dmg.amount *= T(ab, 'atkup.atk_scale') ?? 1; } }];

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

/** projectile_lrboom's CircleCollider2D radius (its death blast: ground units only, `_ignoreCamouflage`). */
const LRBOOM_RADIUS = 1.3;
/** enemy_10196_ubba(_2) Talents/Talent1: the AuraAbility's CircleCollider2D radius. */
const UBBA_AURA_RADIUS = 1.7;
/** How often the 搏命享受者 aura is refreshed on the enemies around it (the aura's own tick is the engine's). */
const UBBA_AURA_EVERY = 0.2;

/**
 * 搏命享受者 (enemy_10196_ubba_2, 规程's leader waves h07_08 / h08_04) and 搏命养家者 (enemy_10196_ubba, its 悬赏·精英 card and
 * the same waves; official prefabs battle/enm_pfb_30, the same tree): Talents/Talent1, an AuraAbility (radius 1.7, its
 * validator the owner's side, all motions) — the enemies there take physical and arts damage × (1 −
 * `Talent1.damage_resistance`) (enemy_ubba_damage_resistance: DamageScale `_isOneMinus`, `disableOverride` — one buff per
 * giver, so two multiply). The giver is among them: the aura's `_selfOption` is DEFAULT, and only EXCLUDE leaves the
 * owner out (`AuraAbility.DealTargetTouched`; INCLUDE adds it at attach) — the aura has a body of its own (a kinematic
 * Rigidbody2D on Talent1), so its trigger meets the owner's collider like any other enemy's (공식 클라에서 확인). Until
 * this the aura skipped its giver. Its 警戒 mode (Modes/Warning: faster, chasing the unit that set it off) starts from
 * units holding ubtower_warning_mask[target], which only the main story's watchtower gives: no 规程 stage has one, so it
 * never starts here.
 */
function kitUbba(ab) {
  const m = 1 - (T(ab, 'Talent1.damage_resistance') ?? 0);
  return [{
    iv: UBBA_AURA_EVERY,
    tick(b, e) {
      const key = `ab:ubba:${e.id}`;
      for (const o of b.enemiesInRadius(e.x, e.y, UBBA_AURA_RADIUS)) auraBuff(b, o, key, UBBA_AURA_EVERY, { physTakenMul: m, artsTakenMul: m });
    },
  }];
}

/**
 * 假想敌：丛生 (enemy_9040_accrit, 规程 精锐 type CRITIC, in the leader wave h08_05; official CN prefab battle/enm_pfb_37 and
 * the buff table's accrit[critical-hit]): every damage it deals (ON_OUTPUT_DAMAGE) to a unit without its own
 * accrit[critical-mark] is × `CriticalHit.damage_scale` and marks it for good, and that unit cannot be healed for
 * `CriticalHit.duration` s (accrit[heal-free], HEAL_FREE). Its Skills/Critical only swaps the clip (Attack_B) for an
 * unmarked target it blocks.
 */
function kitCritic(ab) {
  const scale = T(ab, 'CriticalHit.damage_scale') ?? 1, dur = T(ab, 'CriticalHit.duration') ?? 0;
  const marked = new Set();
  return [{
    hitOut(c, b) {
      const t = c.target;
      if (!t || t.side !== 'ally' || marked.has(t)) return;
      marked.add(t);
      c.dmg.amount *= scale;
      if (dur > 0) b.addBuff(t, { key: 'ab:accritHealFree', duration: dur, refresh: 'replace', visible: true, flags: { noHeal: true, healFree: true } });
    },
  }];
}

export const SPECIAL_KITS = Object.freeze({
  // --- SPECIAL 特异 / others
  enemy_1045_hammer: kitStun3,                                       // 粉碎攻坚手 · every 3rd attack stuns
  enemy_1045_hammer_2: kitStun3,                                     // 粉碎攻坚组长 · same
  enemy_1116_liprr: kitPrisoner(),                                   // 普通囚犯 · confined (ASPD −50) → freed after 4 attacks (ATK +50 %)
  enemy_1116_liprr_2: kitPrisoner(),                                 // 老练囚犯 · same
  enemy_1118_lidbox_2: kitPrisoner(),                                // 拳师囚犯 · + DEF penetration when freed
  enemy_1119_vofsd: kitPrisoner(),                                   // 强壮囚犯 · + RES and regen when freed
  enemy_1121_lifbos: kitPrisoner(true),                              // 重犯 · confined DEF up; first liberation frees every prisoner
  enemy_1121_lifbos_2: kitPrisoner(true),                            // 传奇重犯 · same
  enemy_1072_dlancer: (ab) => kitRush(ab),                          // 萨卡兹穿刺手 · accelerates while walking; first hit after block ×speed
  enemy_1320_wdrrl_2: kitFirstAoe,                                   // 萨卡兹悖谬暴虐兵长 · block ≥3 only; first attack splashes
  enemy_1302_ymtro_2: (ab) => [blockWeight(4), ...kitBus(ab, { camel: false })],  // “越长尘” · block ≥4; carries up to 4 passengers (no slow)
  enemy_1329_cbshld: kitDefDecay,                                    // 弧光镜卫 · DEF/RES drop with every damage instance
  enemy_1329_cbshld_2: kitDefDecay,                                  // 弧光镜卫长 · same
  enemy_1249_lysdb_2: (ab) => [{ spawn(b, e, a, ab2) { ab2.hitShield = T(ab, 'Shield.max_block_damage_cnt') ?? 0; } }], // 莱茵生命防卫科高级成员 · blocks one phys/arts hit
  enemy_1402_tgshd_2: kitExposeOnHit,                                // 重装侦察兵 · exposes its attackers 5 s
  enemy_1081_sotisd: (ab) => [taunt(T(ab, 'taunt.taunt_level') ?? 0)], // 游击队盾卫 · taunt +1
  enemy_1427_lrnazg: kitNazg,                                        // “灵幛” · attack hits everyone around it (+ on infection tiles)
  enemy_1422_lrsldr: () => [infectionArts()],                        // 萨卡兹枯朽前锋 · arts attacks on 源石污染区 (infection tiles)
  enemy_1422_lrsldr_2: () => [infectionArts()],                      // 萨卡兹枯朽辟路前锋 · same
  // 恶尘源石虫 (规程's leader wave h07_09) · death: phys blast (Boom: projectile_on_killed → projectile_lrboom, radius 1.3, ground
  // only); its 源石污染区 is a switch of the dynamic REED_TILE under it (enemy_lrboom[triggerTile]) and 活性源石风暴 a stage
  // device — no 规程 stage has either
  enemy_1424_lrboom: (ab, e) => [deathBoom({ scale: T(ab, 'Boom.atk_scale') ?? 0, r: LRBOOM_RADIUS, delay: boomLife(e, 'Boom', LRBOOM_LIFE), ability: 'Boom' })],
  enemy_10196_ubba_2: kitUbba,                                       // 搏命享受者 (规程) · damage taken ×0.75 for the enemies around it (itself too)
  enemy_10196_ubba: kitUbba,                                         // 搏命养家者 (规程 悬赏 / leader waves) · same
  enemy_1413_mmstck: (ab) => kitRush(ab, { prefix: 'Rush.enemy_mmstck_t[trigger]', scaleKey: 'FirstAttack.atk_scale', type: 'arts' }), // 赏金猎人“骑士” (规程 悬赏) · as 穿刺手, arts bonus
  enemy_9040_accrit: kitCritic,                                      // 假想敌：丛生 (规程) · first damage on each unit ×2 + 5 s HEAL_FREE
  enemy_1425_lrcmra: kitChimera,                                     // 孽罪奇美拉 · activated on infection: arts attacks + pollution aura
  enemy_1425_lrcmra_2: kitChimera,                                   // 渎罪奇美拉 · same
  enemy_1430_lrrook: (ab) => [{                                      // 愧悔魂灵圣杯 · shares damage taken by nearby ground enemies
    spawn(b, e, a) { a.r = T(ab, 'takeDmg.range_radius') ?? 1.7; a.share = T(ab, 'takeDmg.damage_scale') ?? 0; stOf(b).chalices = (stOf(b).chalices ?? 0) + 1; },
    death(c, b) { stOf(b).chalices = Math.max(0, (stOf(b).chalices ?? 1) - 1); },
  }],
  enemy_1025_reveng: (ab) => [lowHpBuff(0.5, { atkPct: T(ab, 'atkup.atk') ?? 0 }, 'ab:lowhp', 'buff:reveng_t_atkup')],     // 寻仇者 · ATK up below half HP
  enemy_1021_bslime: (ab, e) => [deathBoom({ scale: T(ab, 'boom.atk_scale') ?? 0, r: BSLIME_BOOM.r, delay: boomLife(e, 'Boom', BSLIME_BOOM.life), ability: 'boom' })],   // 高能源石虫 · death: phys blast 1 s after
  enemy_1067_snslime: kitIceSlime,                                   // 冰爆源石虫 · death: phys blast + cold
  enemy_1067_snslime_2: kitIceSlime,                                 // 冰爆源石虫·α (规程) · same (EN prefab: the same Boom talent)
  enemy_1069_icebrk_2: kitFrozenAtk,                                 // 雪怪小队破冰者 · ×3 vs frozen
  enemy_1064_snsbr: kitFrozenAtk,                                    // 雪怪小队 (规程) · ×1.5 vs frozen (EN prefab: template e2c_frozen_atkscale)
  enemy_1026_aghost: () => [unblockable()],                          // 幽灵组长 · unblockable
  enemy_1062_rager_2: (ab) => [{ iv: 1, tick(b, e) { const v = T(ab, 'periodic_damage.damage') ?? 0; if (v > 0) b.dealDamage(null, e, periodicDamage(v)); } }], // 狂暴宿主组长 · "自身每秒受到500无来源真实伤害" (damage, not 流失)
  enemy_1183_mlasrt: (ab) => [ep('erosion', T(ab, 'EpDamage.attack@ep_damage_ratio') ?? 0), nthAttackPower(nthOf(ab.sk.PowerAttack), (ab.sk.PowerAttack && ab.sk.PowerAttack.bb.atk_scale) || 1)], // 无胄盟清扫小队 · erosion; every 4th attack ×1.5
  enemy_1273_stmgun_2: (ab) => {                                     // 高准度伦蒂尼姆城防自行炮 · locks the highest max-HP unit in range, bombards the highest HP% on its 9 tiles
    // the allies in its range (the engine's ranged reach: radius + the ally collider)
    const inRange = (b, e) => allTargets(b, e).filter((a) => hypot(a.x - e.x, a.y - e.y) <= (e.base.rangeRadius || 0) + ALLY_COLLIDER_RADIUS + 1e-9);
    const sk = ab.sk.Cannon;
    // the cast (공식 클라에서 확인 — prefab Skills/Cannon, a RangedAttack playing `Skill` as it is, 10 s): its target, the
    // highest max-HP ally in range (its trigger), is taken as it starts; BuffDuringCastingFixed stmgun_s[immunes] (失衡, 晕眩,
    // 冻结, 浮空, 沉睡 immune — PRTS 备注 "技能动画期间") holds for the whole cast, cleared as it finishes for any reason; at
    // the clip's OnAttack (4.033 s, castStrikeAt) it fires projectile_enemy_stmgun_s onto that target (AttachToTarget,
    // reached at once; the target's tile when it is gone, `_emitToInputPosWhenTargetIsInvalid`) — the bombardment. Until
    // 2026-11-20 the shots began as the cast did and the immunity lasted the 5 s of shots.
    let cast = null;
    const release = (b, e) => {
      if (!cast) return;
      e.mem.ab.immune = cast.had;
      b.removeBuff(e, 'ab:cannon');
      cast = null;
    };
    const a = skill(sk, (b, e) => {
      cast = null;
      const lock = inRange(b, e).sort((p, q) => q.s.maxHp - p.s.maxHp)[0];
      if (!lock) return;
      const ab2 = e.mem.ab;
      const c = { r: Math.round(lock.y), c: Math.round(lock.x), had: new Set(ab2.immune || []) };
      cast = c;
      ab2.immune = new Set([...c.had, ...CANNON_IMMUNE]);
      const len = castLength(e, sk.cast, sk.bb);
      b.addBuff(e, { key: 'ab:cannon', duration: len, flags: { noDisplace: true } });
      b.after(len - 1e-9, () => { if (cast === c) release(b, e); }, { owner: e });
    }, {
      cond: (b, e) => inRange(b, e).length > 0,
      atStrike: (b, e) => {
        const c = cast;
        if (!c) return;
        const { r: r0, c: c0 } = c;
        // the zone shows as the projectile reaches (`_effectsWhenReached`) until it stops after its last hit
        b.fx('telegraph', { x: c0, y: r0, r: 1.5, dur: CANNON_SHOTS * CANNON_EVERY, kind: 'cannon' });
        for (let i = 1; i <= CANNON_SHOTS; i++) b.after(i * CANNON_EVERY, () => {
          if (!e.alive) return;   // `_stopWhenSourceInvalid`
          // each shot picks inside the 9-tile zone (ConstBoxRange x-4, 格子判定): an area selection — a 迷彩 ally may be shot,
          // an unblocking 隐匿 one not (areaSelectable; it used to skip 迷彩 like a normal attack)
          const t = b.allies().filter((u) => areaSelectable(e, u) && Math.abs(Math.round(u.y) - r0) <= 1 && Math.abs(Math.round(u.x) - c0) <= 1)
            .sort((p, q) => q.hpRatio - p.hpRatio)[0];
          if (!t) return;
          b.fx('explode', { x: t.x, y: t.y, r: 0.5, kind: 'cannon' });
          // the hit itself deals nothing (the attack's `_atkScale` 0 merged with atk_scale); its buff deals the arts damage
          b.after(CANNON_DAMAGE_DELAY, () => hurt(b, e, t, e.s.atk * (sk.bb.atk_scale ?? 0), 'arts'), { owner: e });
        }, { owner: e });
      },
    });
    if (a) a.onCut = release;
    return [a];
  },
  // 萨卡兹骸骨拷打者 · heals + ATK stack when a unit within Attack.range_radius is knocked out; leaves 2 血珀 on death — they
  // stay where it fell, not counted, and bleed out (enemy_1367_dseed)
  enemy_1364_spnaxe_2: (ab) => [{
    death(c, b, e) {
      const key = ab.tS['Summon.enemy_key'], n = T(ab, 'Summon.cnt') ?? 0;
      if (c.reason !== 'killed' || !key || !(n > 0)) return;
      spawnChildren(b, e, key, n, { route: stayRoute(e), countInTotal: false, mods: null });
    },
  }, {
    spawn(b, e) { watchDeaths(b, e); },
    otherDeath(c, b, e) {
      const u = c.unit;
      if (!u || u === e || c.reason !== 'killed' || hypot(u.x - e.x, u.y - e.y) > (T(ab, 'Attack.range_radius') ?? TORTURER_RADIUS) + 1e-9) return;
      b.heal(e, e, e.s.maxHp * (T(ab, 'Attack.hp_ratio') ?? 0), { self: true });
      b.addBuff(e, { key: 'ab:torture', refresh: 'stack', stacks: 1, maxStacks: T(ab, 'Attack.max_stack_cnt') ?? 1, persist: true, mods: { atkPct: T(ab, 'Attack.atk') ?? 0 } });
    },
    hitOut(c, b, e) { if (c.dmg.isAttack && c.target !== e.blockedBy) c.dmg.amount *= T(ab, 'Attack.attack@ranged_atk_scale') ?? 1; },
  }],
  // 血珀 · no 唤血祭坛 in this mode to pulse it (its handbook line): it loses Passive.hp_ratio of its max HP every 1 s
  // (the enemy table's talent Passive, `hp_ratio` 0.1 — until 2026-10-29 it stayed inert for good); a loss, not a kill:
  // no credit, no reward
  enemy_1367_dseed: (ab) => [{
    iv: 1,
    tick(b, e) {
      const r = T(ab, 'Passive.hp_ratio') ?? 0;
      // (silent: enemy_dseed_hp_loss's DamageViaMaxHpRatio creates no effect; the buff's own enemy_dseed_idle_02 lasts —
      // docs/rules/fx.md 「효과 없는 주기적 유실」)
      if (r > 0) b.loseHp(e, e.s.maxHp * r, { silent: true });
    },
  }],
  enemy_1501_demonk: () => [maxTargets(2)],                          // 萨卡兹百夫长 · attacks 2 targets
  enemy_10018_sgrobh: () => [maxTargets(2)],                         // “独轮车玩具” · attacks 2 targets
  enemy_2001_duckmi: (ab) => [unblockable(), runWhenHit(T(ab, 'run.attack@move_speed') ?? 0)],   // 鸭爵 · unblockable, no attack; runs +400 % once hurt
  enemy_2001_duckmi_2: (ab) => [unblockable(), runWhenHit(T(ab, 'run.attack@move_speed') ?? 0)], // 鸭爵 (鸭爵 strategy) · same, +300 %
  enemy_10159_mntrjn: (ab) => kitBus(ab),                                       // 伊利昂的木驮兽 · unblockable; carries up to 5 passengers, −20 % speed each
  enemy_2009_csaudc: kitEp('neural', 'combat.attack@ep_damage_ratio'), // 骇笑看客 · neural on hit
  enemy_2010_csdcr: (ab) => [ep('neural', T(ab, 'attack.attack@ep_damage_ratio') ?? 0), { // 绯红歌伶 · neural on hit; every 20 hits taken: global enemy ASPD up
    taken(c, b, e, a) {
      a.n = (a.n ?? 0) + 1;
      if (a.n < (T(ab, 'AttackSpeedUp.stack_cnt') ?? Infinity)) return;
      a.n = 0;
      b.fx('telegraph', { x: e.x, y: e.y, r: 99, kind: 'songOfWar', id: e.id });
      for (const o of b.aliveEnemies()) b.addBuff(o, { key: 'ab:songOfWar', duration: T(ab, 'AttackSpeedUp.duration') ?? 0, refresh: 'extend', mods: { aspd: T(ab, 'AttackSpeedUp.attack_speed') ?? 0 }, visible: true });
    },
  }],
  enemy_10001_trslim: (ab) => [skill(ab.sk.StartRun, (b, e) => {    // 简饲源石虫 · below half: runs (faster, unblockable 3 s)
    const s = ab.sk.StartRun.bb;
    setForm(b, e, 'Run');   // the view: the skill's Skill_Begin, then its B_* clips (render/units.js FORMS)
    // the ability's spell as its Skill_Begin has played (no attack event on it: the cast's end — content/enemies.js
    // castStrikeAt): the skill's mode Run for good (its attack Attack_B) and the run
    atCastEvent(b, e, ab.sk.StartRun, () => {
      mode(b, e, 'Run');
      b.addBuff(e, { key: 'ab:run', duration: s.block_free_time ?? 0, mods: { moveMul: 1 + (s.move_speed ?? 0) }, flags: { unblockable: true }, visible: true });
    });
  }, { sil: true, cond: (b, e) => e.hpRatio < 0.5 })],
  enemy_10027_vtsk: (ab) => {                                        // “帝国的甲胄” · entrance barrage on the highest-HP unit; ranged ×0.8; 3-hit charge attack
    const ap = ab.sk.Appear, mc = ab.sk.MultiCombat;
    return [{
      spawn(b, e) {
        const n = ap ? ap.bb.times ?? 0 : 0;
        b.after(0.5, () => {
          if (!e.alive || !n) return;
          const lock = allTargets(b, e).sort((p, q) => q.hp - p.hp)[0];
          if (!lock) return;
          b.fx('telegraph', { x: lock.x, y: lock.y, r: 1, kind: 'barrage', id: e.id });
          for (let i = 0; i < n; i++) {
            // "对碰撞范围内的1名当前生命值最高的我方单位" — an area selection: never an airborne 起飞 ally nor an unblocking
            // 隐匿 one (PRTS “帝国的甲胄”; areaAlliesInTiles)
            const t = areaAlliesInTiles(b, e, lock.tileR, lock.tileC, 'box', 1).sort((p, q) => q.hp - p.hp)[0];
            if (t) hurt(b, e, t, e.s.atk, 'phys');
          }
        }, { owner: e });
      },
      hitOut(c, b, e) { if (c.dmg.isAttack && c.target !== e.blockedBy) c.dmg.amount *= T(ab, 'range.attack@atk_scale_range') ?? 1; },
    }, mc ? {
      // MultiCombat's `_familyMask` is COMBAT only: cast while blocked, on the blocker (content/enemies.js onSkillSlot;
      // until 2026-10-22 its ranged attacks took it too). A battle replaces it with content/local-patch.js chargedTriple.
      name: mc.name, cd: mc.cd, icd: mc.icd, fire(b, e) { e.mem.ab.multi = mc.bb.times ?? 1; },
      dealt(c, b, e) {
        const m = e.mem.ab.multi;
        if (!(m > 1)) return;
        e.mem.ab.multi = 0;
        for (let i = 1; i < m; i++) hurt(b, e, c.target, e.s.atk, 'phys');
      },
    } : null];
  },
  enemy_10044_wintun: (ab) => {                                      // 咸鳞汁推荐者 · fast with the barrel; first attack (SILENCE): big hit + buff zone for enemies
    const s = ab.sk.BlockedBoom ? ab.sk.BlockedBoom.bb : {};
    const bc = ab.sk.BlockedBoom?.cast;
    const boomClip = bc && bc.dur > 0 ? { clip: bc.clip, dur: bc.dur, hit: bc.hit, max: bc.max ?? 1 } : null;
    const boom = {
      sil: true,                                                     // silenced: the barrel is kept (and its speed) until an unsilenced attack
      spawn(b, e) { b.addBuff(e, { key: 'ab:barrel', persist: true, mods: { moveMul: T(ab, '1.move_speed') ?? 1 } }); },
      hitOut(c, b, e, a) { if (!a.done && c.dmg.isAttack) c.dmg.amount *= s.blockee_atk_scale ?? 1; },
      attack(c, b, e, a) {
        if (a.done) return;
        a.done = true;
        b.removeBuff(e, 'ab:barrel');
        const x = e.x, y = e.y, life = s.fixed_duration ?? 0;
        b.fx('zone', { x, y, r: BARREL_RADIUS, dur: life, kind: 'barrel' });
        let left = life;
        const h = b.every(0.5, () => {
          // projectile_enemy_wintun_range's AuraHitBehaviour: its own side's ground units (`targetMotion` 1) — no flying
          // enemy (until 2026-11-20 they were buffed too)
          for (const o of b.enemiesInRadius(x, y, BARREL_RADIUS)) if (!o.isFlying) auraBuff(b, o, 'ab:barrelZone', 0.5, { aspd: s.attack_speed ?? 0, dodgePhys: s.prob ?? 0 });
          left -= 0.5;
          if (left <= 0) h.cancel();
        });
      },
    };
    return [boom, {
      // its first mode M1 has no attack ability: blocked, it switches to M2 for good (wintun_m0_t[switch_mode]
      // ON_OWNER_BLOCKEE_CHANGED → CheckBlocked → SwitchMode 1), whose Combat is B_Attack — silenced too.
      // GitHub #14: the view's clips follow (render/units.js FORMS) — M2's hooker plays B_Idle / B_Move / B_Die from the
      // switch; its swing is BlockedBoom's Attack (the barrel smash) until that strike, then the Combat's B_Attack — and
      // B_Attack while silenced, which casts no BlockedBoom (form 'M2boom' / 'M2'; a swing running keeps its clip)
      // 2026-11-14 (공식 클라에서 확인 — data skillCast.blockedboom: Skills/BlockedBoom, ATTACK | COMBAT family, `_timeMode` 1,
      // clip `Attack` 1.467 s with its OnAttack at 0.7 s): the swing that smashes the barrel is that skill's cast at the attack
      // slot, timed by its clip — not by the Combat's B_Attack (1.2 s, 0.467 s); ai.js attackClipOf `swingClip`
      tick(b, e) {
        if (e.blockedBy) mode(b, e, 'M2');
        if (e.mode !== 'M2') { if (e.profile.swingClip) e.profile.swingClip = null; return; }
        const f = boom.done || e.s.flags.silence ? 'M2' : 'M2boom';
        e.profile.swingClip = f === 'M2boom' ? boomClip : null;
        if (e.form !== f) setForm(b, e, f);
      },
    }];
  },
  enemy_10045_parrot: kitParrot,                                     // 吉兆飞鳞 · 近地悬浮 (grounded 8 s when stunned); sprints when first hit
  enemy_10087_hlchgr: (ab) => [{                                     // 圣堂剑士 · spends ammo (every 6 s, max 5) for permanent speed/ATK
    iv: T(ab, 'SkillTrigger.interval') ?? 6,
    tick(b, e, a) {
      a.n = (a.n ?? 0) + 1;
      if (a.n > 5) return;
      const s = ab.sk.ForeverEnhance ? ab.sk.ForeverEnhance.bb : {};
      b.addBuff(e, { key: 'ab:enhance', refresh: 'stack', stacks: 1, maxStacks: 5, persist: true, mods: { moveFlat: (s.move_speed_add ?? 0) * e.base.moveSpeed, atkPct: s.atk_add ?? 0 } });
    },
  }],
  enemy_10094_crstf: kitEp('neural', 'ep.ep_damage_ratio'),          // 临时收音师 · neural on hit (filming zones n/a → always)
  enemy_10097_crshd: (ab) => [                                       // 心虚设计师 · neural to its blocker every s; front damage −80 % (faces its walk)
    { iv: 1, tick(b, e) { if (e.blockedBy) elem(b, e, e.blockedBy, 'neural', e.s.atk * (T(ab, 'block.ep_damage_ratio') ?? 0)); } },
    frontGuard(T(ab, 'weakness.damage_resistance') ?? 0, faceMove),  // 减少来自正面的物理/法术伤害 (cameras absent: it never turns)
  ],
  enemy_10098_crhro: (ab) => [ep('neural', T(ab, 'inside.attack@ep_damage_ratio') ?? 0), // 主角阵营角色 · neural on hit; 重生 once (reborn.duration s, full HP)
    reborn({ dur: T(ab, 'reborn.duration') ?? 0, invincible: T(ab, 'reborn.invincible') ?? 0 })],
  enemy_10099_crvln: kitEp('neural', 'inside.attack@ep_damage_ratio'), // 反派阵营角色 · neural on hit
  enemy_10116_ymgtop: (ab) => {                                     // 水遁忍者 · spinning phase (SILENCE): phys AoE every s; 失衡 stops it
    const spin = {
      sil: true, cd: ab.sk.SwitchModeTrigger ? ab.sk.SwitchModeTrigger.cd : 60, icd: ab.sk.SwitchModeTrigger ? ab.sk.SwitchModeTrigger.icd : 10,
      // 2026-11-14 (공식 클라에서 확인 — the prefab's Modes/Default/Body/Skills/SwitchModeTrigger, an EnemySkill of the Default
      // mode; Enemy.OnSwitchMode, EnemySkill.Detach / Attach): the cast is cut as the mode switches (`_interruptAbilityOnDetach`)
      // and its cooldown restarts in full then; the skill is detached for the whole spin, its cooldown standing still, so it
      // spins again `cd` s after it comes back (from a 失衡 too). Until 2026-11-14 the cooldown ran on through the spin —
      // `cd` 60 = `rotate_duration` 60: it spun again the moment it stopped
      pause: (b, e) => e.mode === 'M1',
      fire(b, e, a) { a.until = b.time + (T(ab, 'EndRotate.rotate_duration') ?? 0); b.fx('telegraph', { x: e.x, y: e.y, r: 1, kind: 'spin', id: e.id }); },
      iv: T(ab, 'RotateDamage.interval') ?? 1,
      // "每秒对半径1.0范围内的所有我方单位造成…（无视迷彩，不可对空），自身受阻止攻击类异常效果影响期间无法造成此伤害": an area
      // selection, skipped while 晕眩 / 冻结 / 浮空 (flag stun), 沉睡 or 缴械 hold it (PRTS 异常效果 §阻止攻击; until 0.1.3 it spun on);
      // 不可对空: never a flying ally (the 炎佑 dragon — until 0.2.1 it was hit)
      tick(b, e, a) {
        if (!(a.until > b.time) || e.s.flags.stun || e.s.flags.sleep || e.s.flags.disarm) return;
        let n = 0;
        for (const u of areaAllies(b, e, e.x, e.y, T(ab, 'RotateDamage.attack@range_radius') ?? 1)) if (!u.isFlying) { hurt(b, e, u, e.s.atk * (T(ab, 'RotateDamage.attack@atk_scale') ?? 1), 'phys'); n++; }
        // ymgtop_m1_t[rotate_attack]'s PlayAudio on each unit it hits (audio)
        if (n) b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'ymgtop:hit', n });
      },
    };
    // 漩涡形态 "不进行普通攻击" (PRTS 天赋): no blocked attack while it spins (until 0.1.3 its blocker took both)
    // (the mode M1 while it spins — ymgtop_m0_s[switch_mode] SwitchMode 1, back to the first at ymgtop_m1_t[end_rotate] or
    // as 失衡 ends it: its Default attack attaches ready again)
    // the view's clips follow the mode (render/units.js FORMS 'M1'): BeginAnim's Skill_Begin into the hooker's Skill_Loop
    // (Idle / Move / Default), Skill_End (Default's EndAnim) as it comes back
    const noAtk = {
      tick(b, e) {
        e.profile.noAttack = spin.until > b.time;
        if (mode(b, e, e.profile.noAttack ? 'M1' : null)) setForm(b, e, e.profile.noAttack ? 'M1' : null);
      },
    };
    return [spin, noAtk, unbalanced((b, e) => { if (spin.until > b.time) { spin.until = 0; b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'spinStop' }); } })];
  },
  enemy_10118_ymgprc: (ab) => {                                      // 澪 · double hits; 寒晖: every 4th attack (spCost 3) is a ×1.5 double hit
    const scale = (ab.sk.PowerAttack && ab.sk.PowerAttack.bb.atk_scale) || 1;
    const pw = nthAttackPower(nthOf(ab.sk.PowerAttack), scale);
    return [pw, { dealt(c, b, e) { hurt(b, e, c.target, e.s.atk * (pw.power ? scale : 1), 'phys', { isSkill: false }); } }];
  },
  // 异质裂兽·α · M0 shield: physical / arts damage taken ×(1 − damage_resistance), ASPD +attack_speed. Its stone
  // (rkmbst_m0_t[shield], init_shield_hp_ratio of its max HP) blocks only the physical damage of a unit holding
  // enemy_mcreep_self_mark (the 矿工游击队) and breaks into mode M1 there; every other source takes the DamageScale
  // branch, so with no 矿工游击队 in this mode the stone never absorbs or breaks (until 2026-11-20 a barrier of 5 % max HP
  // took the players' damage first)
  enemy_10127_rkmbst_2: (ab) => [taunt(1), { spawn(b, e) {
    const keep = 1 - (T(ab, 'M0Shield.damage_resistance') ?? 0);
    b.addBuff(e, { key: 'ab:m0', persist: true, visible: true, mods: { physTakenMul: keep, artsTakenMul: keep, aspd: T(ab, 'M0Shield.attack_speed') ?? 0 } });
  } }],
  enemy_10156_mncrer: (ab) => [{ sil: true, death(c, b, e) {         // 新手祭司学徒 · death: heals nearby enemies
    if (c.reason !== 'killed') return;
    const r = T(ab, 'Boom.projectile_range') ?? 1, amt = e.s.atk * (T(ab, 'Boom.heal_scale') ?? 0);
    b.fx('explode', { x: e.x, y: e.y, r, kind: 'heal' });
    for (const o of b.enemiesInRadius(e.x, e.y, r)) if (o !== e) b.heal(e, o, amt);
  } }],
  enemy_10162_mnctpt: (ab) => [{                                     // 自制投石机 · 3 physical stones 0.3 s apart, 1.5 splash; 索敌不受阻挡影响
    // PRTS 天赋 「索敌不受阻挡影响，且不会因丢失目标而结束攻击」: its target selection ignores its block — a 隐匿 blocker (an
    // operator on the 排气格栅) is no target, so with nobody else in range it does not attack (the official game, community
    // report of 2026-10-06, item 24); it picks by 仇恨值, not its blocker first. The volley itself is the kit's
    // (profile.deferHit): `times` physical attacks `hit_interval` apart, each splashing, also after the target is lost.
    spawn(b, e) { e.profile.blockFree = true; e.profile.deferHit = true; e.profile.shot = 'enemy'; },
    attack(c, b, e) {
      const t = c.targets && c.targets[0];
      catapultVolley(ab, b, e, t ? { target: t, x: t.x, y: t.y } : { target: null, x: e.x, y: e.y });
    },
  }],
});

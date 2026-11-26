// server/sim/content/enemies/element.js — ELEMENT 元素 kits (element damage, 海嗣 / 萨卡兹 / 孽生 enemies) and their part of
// KITS (split from content/enemies.js).

import { periodicDamage } from '../../damage.js';
import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { hypot } from '../../detmath.js';
import {
  stOf, T, elem, hurt, targetsNear, areaAllies, areaAlliesInTiles, targetAndArea, byPriority, setForm, onTerrain, canCast, mode,
  castStrikeAt, remainingRoute, spawnChildren,
} from './helpers.js';
import { shotSpeed } from '../../ai.js';
import { taunt, ep, deathBoom, setFloat, float, skill, kitEp, kitStun3 } from './archetypes.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { AttackProfile } from '../../ai.js' */
/** @import { AbState, AbSkill, AbList, AbFn, AbKit, EnemyAbility, EnemyKit } from '../enemies.js' */
/** @import { BuffTick } from './helpers.js' */
/** @import { Scheduled } from '../../battle/hooks.js' */

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 赘生甲壳 (content/enemies/reborn.js SHELL: 微核沉积者 leaves it, 复核洋流使者 eats it). */
const SHELL_KEY = 'trap_156_dsshell';

/** 术师快艇: how long after its knock-out its 控潮术师 appears — the blackboard `delay` of its talent DeathRattle's buff
 *  (magmot_deathrattle, template enemy_magmot_summon) in the prefab; enemy_database's talent blackboard lacks it. */
const MAGMOT_SUMMON_DELAY = 0.8;
/** 潜水员: how often its talent Swim (enemy_divman_swim, `triggerInterval` 0.2) looks for deep water — the prefab's value. */
const DIVER_SWIM_CHECK = 0.2;
/** 假想敌：淤困: element damage its host's burst spreads to the allies of the 4 tiles around (PRTS 假想敌：淤困 "附着对象元素爆发时
 *  …对附着对象及周围4格内的所有我方单位…造成1000同类型元素损伤"; the host itself is in its 爆发冷却). */
const PARASITE_SPREAD = 1000;
/** 假想敌：淤困: how often its host must still block it — `enemy_acelem[check_block]` triggerInterval 0.2, from the attachment. */
const CHECK_BLOCK_INTERVAL = 0.2;
/** 假想敌：淤困: its Combat cast — the length of its clip Parasitic (enemy_9007_acelem.skel), which has no OnAttack event. */
const PARASITIC_CLIP = 1.2;

// ---------------------------------------------------------------------------------------------------------------
// kits

/** @param {AbState} ab @param {{ swim?: boolean, drown?: boolean }} opts @returns {AbList} */
function kitDeepsea(ab, { swim = false, drown = false }) {
  return [{
    iv: swim ? DIVER_SWIM_CHECK : 0.25,
    spawn(b, e) { if (swim) e.mem.immuneDrown = true; },
    tick(b, e, a, dt) {
      const wet = onTerrain(b, e, 'deepsea');
      if (swim) {
        if (wet && !a.wet) b.addBuff(e, { key: 'ab:swim', mods: { atkPct: T(ab, 'Swim.atk') ?? 0 }, flags: { stealth: true }, visible: true });
        if (!wet && a.wet) b.removeBuff(e, 'ab:swim');
        // the prefab's mode Swim in deep water (its attack Attack_2, the same timing), the first one out of it (공식 클라에서
        // 확인 2026-11-20: talent Swim's buff enemy_divman_swim checks every DIVER_SWIM_CHECK s for the deep-water buff
        // `buff_sea` and creates / finishes its derived buff enemy_divman_switch_mode — ATK up, `switch_mode_restart_fsm`
        // mode 1: both ways restart the state machine); the view's clips follow (render/units.js FORMS 'Swim': Attack02 / Idle02 / Move02)
        if (wet !== !!a.wet && mode(b, e, wet ? 'Swim' : null)) setForm(b, e, wet ? 'Swim' : null);
        if (wet) b.removeBuff(e, 'terrain:deepsea');   // 免疫水蚀: drop devices.js' deep-water debuff
      }
      // PRTS 码头水手 "水蚀状态下或处于清澈水域时，每秒受到1000点无来源真实伤害" (伤害分类: 深水区/涨潮水蚀 is BUFF damage):
      // damage, not a 流失 — 脆弱 scales it (player report D1 audit)
      if (drown && wet) { const v = T(ab, 'Drown.damage') ?? 0; if (v > 0) b.dealDamage(null, e, { ...periodicDamage(v * dt), tags: ['dot', 'periodic', 'drown'] }); }
      a.wet = wet;
    },
    // 免疫水蚀: the deep-water tick (devices.js, tag 'deepsea') and drowning — not 环境伤害 ('terrain', e.g. 活性源石)
    hitIn(c, b, e, a) { if (swim && a.wet && c.dmg.tags && c.dmg.tags.some((/** @type {string} */ t) => t === 'deepsea' || t === 'drown')) c.dmg.cancel = true; },
  }];
}

/** @type {AbKit} */
function kitTidmag(ab) {
  return [ep('erosion', T(ab, 'EpDamage.attack@ep_damage_ratio') ?? 0), {
    // PRTS 控潮术师 "对目标所在地块及周围四格内的所有我方单位造成法术普通伤害": one shot at its target (the client attack's
    // max target count 1, one projectile_enemy_tidmag whose hit effect draws the cross); as it lands the others of the
    // target's 周围四格 take the same attack (on-hit erosion included). An area selection (格子判定: a 迷彩 ally is hit; an
    // unblocking 隐匿 or an airborne 起飞 one is not — areaAlliesInTiles). Until 2026-11-03 each of them drew a shot of its own.
    hitOut(c, b, e) {
      const t = c.target;
      if (!c.dmg.isAttack || !t || c.dmg.tags?.includes('splash')) return;
      for (const u of areaAlliesInTiles(b, e, t.tileR, t.tileC, 'plus', 1)) {
        if (u === t) continue;
        b.dealDamage(e, u, { amount: e.s.atk * (e.profile?.atkScale ?? 1), type: c.dmg.type, isAttack: true,
          attackId: c.dmg.attackId, isProjectile: c.dmg.isProjectile, tags: ['splash'] });
      }
    },
  }];
}

/** 掠海漂移体 爬行模式: the stun it takes on dropping (PRTS "进入爬行模式并晕眩0.5秒"; not in its blackboard). */
const SYUFO_CRAWL_STUN = 0.5;

/**
 * 掠海漂移体 (PRTS): 初始模式 近地悬浮 + 失衡免疫, 不会攻击飞行单位; 受晕眩/无法行动/沉睡/冻结/缚地影响后进入爬行模式 for
 * good and is stunned 0.5 s — a ground unit (blockable, melee operators hit it) that "仅进行阻挡攻击" (only its blocker).
 * The engine has 晕眩 / 冻结 / 沉睡 / 缚地 (予愿安洁莉娜 S2; no operator here applies 无法行动). Erosion on every attack.
 * @type {AbKit}
 */
function kitSyufo(ab) {
  return [float(), ep('erosion', T(ab, 'EpDamage.attack@ep_damage_ratio') ?? 0), {
    spawn(b, e) { /** @type {AttackProfile} */ (e.profile).canTarget = (/** @type {Unit} */ u) => !u.isFlying; },
    status(c, b, e, a) {
      if (a.crawl || !(c.status === 'stun' || c.status === 'freeze' || c.status === 'sleep' || c.status === 'groundbind')) return;
      a.crawl = true;
      setFloat(b, e, false);
      /** @type {AttackProfile} */ (e.profile).melee = true;
      b.applyStatus(e, 'stun', { duration: SYUFO_CRAWL_STUN, source: null });
      setForm(b, e, 'crawl');
      mode(b, e, 'Normal', false);   // enemy_syufo_fly's ON_BUFF_DISABLE SwitchMode (no restart): its blocked attack Attack_02
    },
  }];
}

/** @type {EnemyKit} */
function kitDeathEye(ab, e) {
  const s = ab.sk.DeathEye;
  const r = e.base.rangeRadius || 2.5;
  // the sequence's first child, LineAttack: it does not wait for an attack event, its spell (the line) comes after its
  // `_preDelay` (castStrikeAt of that child, 0.6 s); the line (projectile_enemy_dwlock_line, a HarpoonMovement at its
  // `_speed`, ai.js shotSpeed) links once it reaches the target
  const line = s && s.cast && s.cast.subs ? s.cast.subs[0] : null;
  const eye = skill(s, (b, e2) => {
    // the target is taken as the cast starts (the skill's trigger)
    const t = byPriority(e2, targetsNear(b, e2, r))[0];
    if (!t) return;
    const dur = s.bb.hit_duration ?? 0;
    const pre = line ? castStrikeAt(e2, line, s.bb) ?? 0 : 0;
    const v = shotSpeed(s.proj);
    const fly = v > 0 ? hypot(t.x - e2.x, t.y - e2.y) / v : 0;
    b.addBuff(e2, { key: 'ab:channel', duration: pre + fly + dur, flags: { disarm: true } });
    let n = 0, /** @type {Scheduled | null} */ h = null, linked = false;
    const stop = (/** @type {boolean} */ cut) => {
      if (e2.mem.deathEye !== ch) return;
      if (h) h.cancel();
      e2.mem.deathEye = null;
      if (cut) { b.removeBuff(e2, 'ab:channel'); if (linked) b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'deathEyeEnd' }); }
    };
    const ch = { stop };
    // a stun or the locked target's fall interrupts the channel: no burst. Not a silence: the skill holds 沉默反制
    // while it casts (PRTS 「※技能期间，持有沉默反制」; prefab LineAttack / ChargeAttack `dwlock_skill_anti_flag[silence]`,
    // abnormalAntis SILENCED, during the cast) — until 2026-11-07 a silence cut it
    const broken = () => e2.s.flags.stun || !t.alive;
    const hit = () => hurt(b, e2, t, e2.s.atk * (s.bb.atk_scale ?? 0), 'arts');
    b.after(pre + fly - 1e-9, () => {
      if (e2.mem.deathEye !== ch) return;
      if (!e2.alive) { stop(false); return; }
      if (broken()) { stop(true); return; }
      // the link (LassoProjectile.DoLink): it hits on every fixed tick, its target again once `_keepAlreadyHitTime` 1 s
      // has passed — the first as it links, then each second, `hit_duration` hits; the link's life over, LineAttack ends
      // and ChargeAttack (`_timeMode` 2, `_cooldown` 0) bursts at once (its projectile_enemy_dwlock_charge reached on the
      // target as it is put on)
      linked = true;
      b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'deathEye', dur });
      hit();
      n = 1;
      h = b.every(1, () => {
        if (!e2.alive) { stop(false); return; }
        if (broken()) { stop(true); return; }
        if (n >= dur) {
          stop(false);
          b.fx('explode', { x: t.x, y: t.y, r: 1, kind: 'apoptosis' });
          // "对目标及其周围4格的我方单位": the locked target (a 隐匿 it gained mid-channel does not save it) + an area around it
          for (const u of targetAndArea(t, areaAllies(b, e2, t.x, t.y, 1))) elem(b, e2, u, 'apoptosis', e2.s.atk * (s.bb.ep_damage_ratio ?? 0));
          return;
        }
        hit();
        n++;
      }, { owner: e2 });
    }, { owner: e2 });
    e2.mem.deathEye = ch;
    return t;   // the cast's target (content/enemies.js castSkill: the view's link line)
  }, { sil: true, cond: (b, e2) => targetsNear(b, e2, r).length > 0 });
  if (eye) {
    // the skill is a sequence (공식 클라에서 확인): LineAttack — a RangedAttack with `_waitForProjectileInvalid`, the channel's
    // line projectile, no wait for an end clip — then ChargeAttack (`_timeMode` 2, `_cooldown` 0: no time). The cast lasts
    // while the channel lives (content/enemies.js projCastOver): the enemy stands without normal attacks, and the 24 s
    // cooldown restarts as it ends (upstream #904). A cut cast (freeze, levitation, leaving the field …) ends the channel,
    // before the line too. Its effects come at their own frames (above; castStrikeAt has none for the sequence: its second
    // child starts when the line is gone — until 2026-11-20 the channel began as the cast did, its first hit 1 s in and the
    // burst with the last hit)
    eye.projAlive = (b, e2) => !!e2.mem.deathEye;
    // the view: LineAttack's ThreePartChannelingAnimation (data skillCast.deatheye's LineAttack `chan`,
    // `_waitForAttachFinishEvent`; ChargeAttack after it plays no clip) loops until the cast ends — content/enemies.js
    // castSkill / chanEnd
    eye.onCut = (b, e2) => { if (e2.mem.deathEye) e2.mem.deathEye.stop(true); };
  }
  return [ep('apoptosis', T(ab, 'empty.attack@ep_damage_ratio') ?? 0), eye];
}

/**
 * 淤困's "受到的元素损伤提高至130%" on its host: an `elementHit` multiplier (SIM.md §7.2 — every "受到的元素损伤±N%"; on an
 * operator at priority 20, before a 损伤屏障), never 元素伤害. One battle-wide handler, installed with the first host.
 * @param {Battle} b
 */
function ensureParasiteHook(b) {
  const st = stOf(b);
  if (st.parasiteHook) return;
  st.parasiteHook = true;
  b.on('elementHit', (c) => {
    const bf = c.target && c.dmg && c.dmg.type === 'element' ? c.target.findBuff('ab:parasite') : null;
    const m = bf && bf.data ? bf.data.epMul : 1;
    if (m > 0 && m !== 1) c.dmg.mul *= m;
  }, { priority: 20 });
}

/**
 * 假想敌：淤困 附着: blocked, it casts its mode Default's Combat ability on its blocker — the clip Parasitic (1.2 s, `_timeMode`
 * FROM_ANIMATION) has no OnAttack event, so the cast waits the whole clip (EasyToStartAbility `_waitForAttackEvent` up to
 * the cached duration) and then lands (AbilityStandard.OnCastOnTarget → AbilityAttachment.Apply: Talents/1's
 * PassiveAttachmentAbility gives the target `enemy_acelem[to_parasitic]`). The enemy has no Attack ability (applyWay NONE):
 * this is all it does. Attached it switches to mode Parasitic, blinks onto the host's tile centre and is 自缚
 * (`ab:parasiteAttached` noMove + selfBound); the host takes arts damage every second and element damage ×. Every 0.2 s from
 * the attachment (`enemy_acelem[check_block]`) the host must still block it, else the attachment ends (PRTS "附着效果在解除阻挡时
 * 解除"); its death ends it too. The cast follows the client's COMBAT state: it starts as the enemy enters it on being blocked
 * (`CombatState.OnEnter`); while it runs the state waits (`OnTick` returns while the ability casts), so losing the block does
 * not cut it — it lands on the operator it started on, who must still be on the field; a stun switches the state and
 * `OnExit` interrupts it (so does a freeze, a levitation or the palsy halt).
 * @typedef {EnemyAbility & { host: Unit | null, next: number, checkBlock: boolean, castOn: Unit | null, castEnd: number }} ParasiteAb
 * @type {AbKit}
 */
function kitParasite(ab) {
  const scale = T(ab, '1.atk_scale') ?? 0, elMul = T(ab, '1.ep_damage_scale') ?? 1;
  const attach = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {ParasiteAb} */ a, /** @type {Unit} */ host) => {
    a.host = host;
    a.next = b.time + CHECK_BLOCK_INTERVAL;
    ensureParasiteHook(b);
    // to_parasitic's BlinkNode (`_forceToMapPosition`, the host's grid from AssignGridPositionToBlackboard) → Enemy.Blink(grid):
    // onto a tile its motion can pass, it is let go by its blocker (ReleaseFromBlocker — the block slide ends) and set on the
    // tile centre at once; the host's next search (≤ 3 ticks, battle/blocking.js) blocks it again there, at its own centre.
    // fx 'teleport' kind 'parasite' makes the client cut this short move instead of sliding it (render/interp.js). The client
    // prefab has no effect for the blink: mode Parasitic plays Parasitic once and then Idle_2 for Idle (`_replaceAnimPairs`) —
    // form 'parasitic' (render/units.js FORMS), no stand-in puff (fx/kinds.js)
    const fromX = e.x, fromY = e.y;
    // the buff's action list stops at a failed node (ActionUtil.RunActions): a blink onto a tile it cannot pass returns false
    // and the next node, the check_block buff, is never created — it attaches where it stands, still blocked, and the
    // attachment outlives the block: it ends only as the host leaves the field or this enemy dies
    a.checkBlock = e.isFlying || b.grid.groundPassable(host.tileR, host.tileC);
    if (a.checkBlock) {
      b._unblock(e);
      e.x = host.tileC; e.y = host.tileR;
      if (e.route) e.route.pts = null;
    }
    b.addBuff(e, { key: 'ab:parasiteAttached', flags: { noMove: true, selfBound: true } });
    e.form = 'parasitic';
    b.fx('teleport', { x: e.x, y: e.y, fromX, fromY, id: e.id, kind: 'parasite', form: 'parasitic' });
    b.fx('beam', { x: e.x, y: e.y, from: e.id, to: host.id, kind: 'parasite' });
    b.addBuff(host, {
      // "受到的元素损伤提高至130%": a 元素损伤 multiplier on the element hit (ensureParasiteHook), not 元素伤害
      key: 'ab:parasite', visible: true, interval: 1, data: { src: e, spread: PARASITE_SPREAD, epMul: elMul },
      onTick: (/** @type {BuffTick} */ { battle, unit }) => { if (e.alive) battle.dealDamage(e, unit, { amount: e.s.atk * scale, type: 'arts', canDodge: false, ignoreSelect: true, tags: ['enemyAbility', 'parasite'] }); },
    });
  };
  const detach = (/** @type {Battle} */ b, /** @type {Unit} */ e, /** @type {ParasiteAb} */ a) => {
    b.removeBuff(a.host, 'ab:parasite');
    b.removeBuff(e, 'ab:parasiteAttached');
    a.host = null;
    // back to the prefab's mode Default (to_parasitic's ON_BUFF_FINISH SwitchMode 0); a silent 'phase' (render/fx/kinds.js)
    e.form = null;
    b.fx('phase', { x: e.x, y: e.y, id: e.id, kind: 'detached', form: null });
  };
  return [taunt(-1), {
    tick(b, e, /** @type {ParasiteAb} */ a) {
      // the host leaving the field ends to_parasitic (INFINITY, on the host) at once: Entity.OnFinish → BuffContainer.Clear
      // finishes each of its buffs, and the finish switches this enemy back
      if (a.host && !(a.host.alive && a.host.deployed)) detach(b, e, a);
      while (a.host && a.checkBlock && b.time >= a.next - 1e-9) {
        a.next += CHECK_BLOCK_INTERVAL;
        if (e.blockedBy !== a.host) detach(b, e, a);
      }
      if (a.host) return;
      if (a.castOn) {
        const t = a.castOn;
        // (stun covers freeze and levitate — their statuses set it —; the palsy halt is the other state that interrupts)
        if (!canCast(e, false, b) || b.time < /** @type {number} */ (e.palsyUntil) - 1e-9 || !t.alive || !t.deployed) { a.castOn = null; setForm(b, e, null); }
        else {
          if (b.time >= a.castEnd - 1e-9) { a.castOn = null; attach(b, e, a, t); }
          return;
        }
      }
      const bl = e.blockedBy && e.blockedBy.alive && canCast(e, false, b) ? e.blockedBy : null;
      // the view plays the Combat's clip Parasitic while it casts (render/units.js FORMS 'cast'; null if the cast is cut)
      if (bl) { a.castOn = bl; a.castEnd = b.time + PARASITIC_CLIP; setForm(b, e, 'cast'); }
    },
    death(c, b, e, a) { if (a.host) b.removeBuff(/** @type {Unit} */ (a.host), 'ab:parasite'); b.removeBuff(e, 'ab:parasiteAttached'); },
  }];
}

/** 卷心籽 (ignited): its boom is projectile_enemy_ftzlc — CircleCollider2D 1.25, `_lifeTime` 0.4 s (deathBoom `delay`;
 *  until 2026-11-14 at the knock-out). */
const FTZLC_BOOM = { r: 1.25, life: 0.4 };
/** @type {AbKit} */
function kitIgnitable(ab) {
  return [deathBoom({ scale: T(ab, 'boom.atk_scale') ?? 0, type: 'arts', r: FTZLC_BOOM.r, delay: FTZLC_BOOM.life, cond: (e) => !!e.mem.ab.ignited, sil: true, ability: 'boom' })];
}

/**
 * 灼藤's ramp stage (2026-11-20, official client): its prefab's Talents/pow buff enemy_ftsjc[first_attack] carries the
 * blackboard effect_1 0.5 and effect_2 0.99, and its ON_BUFF_TRIGGER sets effect_level 1 while the ramp's ratio (the ATK
 * gained ÷ add_max_atk) is below effect_1, 2 below effect_2, else 3 — the level the buff's effect enemy_ftsjc_buff
 * (SwitchableEffectByBlackboardValue) shows enemy_ftsjc_buff_01…03 by.
 */
const FLAME_VINE_STAGES = Object.freeze([0.5, 0.99]);
const flameVineStage = (/** @type {number} */ ratio) => 1 + FLAME_VINE_STAGES.filter((x) => ratio >= x).length;

/** @type {AbKit} */
function kitFlameVine(ab) {
  const add = T(ab, 'pow.add_max_atk') ?? 0, time = T(ab, 'pow.time') ?? 0;
  const first = T(ab, 'pow.attack@ep_damage_ratio') ?? 0, normal = T(ab, 'pow.attack@ep_damage_ratio_normal') ?? 0;
  return [{
    iv: 0.5,
    spawn(b, e, a) { a.t0 = b.time; a.first = true; },
    tick(b, e, /** @type {EnemyAbility & { t0: number }} */ a) {
      if (!a.first || !(time > 0)) return;
      const k = Math.min(1, (b.time - a.t0) / time);
      // the status stands for enemy_ftsjc[first_attack] (its effect: render/fxgame.js stepSwitchBB); its count is the stage
      b.addBuff(e, { key: 'ab:pow', mods: { atkPct: add * k }, persist: true, visible: true, fxTag: 'buff:enemy_ftsjc[first_attack]' });
      const stage = flameVineStage(k);
      if (stage !== a.stage) { a.stage = stage; b.fx('stacks', { x: e.x, y: e.y, id: e.id, buff: 'ab:pow', n: stage }); }
    },
    dealt(c, b, e, a) {
      const t = c.target;
      if (a.first) {
        // 首次攻击 (PRTS 灼藤): every other ally of the target's 3×3 (range x-4, "格子判定，不受迷彩制约") takes 100 % ATK
        // arts splash and everyone there 25 % ATK burn — an area selection (no unblocking 隐匿 ally); then the ATK ramp
        // ends and later attacks add 20 %
        a.first = false;
        b.fx('explode', { x: t.x, y: t.y, r: 1.5, kind: 'flameVine' });
        for (const u of targetAndArea(t, areaAlliesInTiles(b, e, t.tileR, t.tileC, 'box', 1))) { if (u !== t) hurt(b, e, u, e.s.atk, 'arts'); elem(b, e, u, 'burn', e.s.atk * first); }
        b.removeBuff(e, 'ab:pow');
      } else elem(b, e, t, 'burn', e.s.atk * normal);
    },
    attack(c, b, e) {
      // ignites nearby 卷心籽
      // (enemy_ftzlc[on_fire] SwitchMode 1: the mode OnFire, its attack 2_Attack)
      for (const o of b.enemiesInRadius(e.x, e.y, 1.5)) if (o.defId === 'enemy_10065_ftzlc' && o.mem.ab && !o.mem.ab.ignited) { o.mem.ab.ignited = true; mode(b, o, 'OnFire', false); setForm(b, o, 'OnFire', 'ignite'); }
    },
  }];
}

/**
 * 元核孽生者 / 异光体孽生者 (prefab enm_pfb_17, 공식 클라에서 확인). dslntf_tr_1: the first damage taken — or a block by a
 * 赘生甲壳 (`ON_OWNER_BLOCKEE_CHANGED`, the blocker holding `trap_156_dsshell[core]`) — puts it in the 临战 state: move
 * speed × `0.move_speed`, mode `1` (its first mode's Combat is an EmptyActiveAbility: blocked by an operator, it does
 * not attack until hurt) and the PlayAudio `Awake`. Mode `1` carries two auras: talent `1`'s neural pulse and talent
 * `3`'s dslntf_s_1[block] — on each ally-side unit within `3.range_radius` (its collider met), every category and
 * profession; on a 赘生甲壳 (`[core]`) it takes `3.hp_ratio` of its own max HP as 真实 damage (DamageViaMaxHpRatio reads
 * `hp_ratio`, `_multiplyByKey` off), effect enemy_dslntf_buff_02 on itself, and the shell dies at once.
 * @type {AbKit}
 */
function kitNucleus(ab) {
  const st = { on: false };   // the 临战 state (one kit per enemy)
  const wake = (/** @type {Battle} */ b, /** @type {Unit} */ e) => {
    if (st.on) return;
    st.on = true;
    // dslntf_tr_1[aura_effect] comes with it (overrideEffectKey enemy_dslntf_buff_03 on it: the buff's `fxTag`)
    b.addBuff(e, { key: 'ab:combat', persist: true, visible: true, mods: { moveMul: T(ab, '0.move_speed') ?? 1 }, fxTag: 'buff:dslntf_tr_1[aura_effect]' });
    mode(b, e, '1');
    setForm(b, e, '1');   // the view's mode-1 clips (fx 'phase': Skill_Idle / Skill_Move / Skill_Attack)
    // dslntf_tr_1's PlayAudio `Awake` as it switches to mode 1 (sound only)
    b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'dslntf:awake' });
  };
  const breakR = (T(ab, '3.range_radius') ?? 0) + ALLY_COLLIDER_RADIUS, ratio = T(ab, '3.hp_ratio') ?? 0;
  return [{
    taken(_c, b, e) { wake(b, e); },
    blocked(c, b, e) { if (c.blocker && c.blocker.defId === SHELL_KEY) wake(b, e); },
    iv: T(ab, '1.interval') ?? 1,
    // 【孽生者的神经毒素】 "（无视迷彩，同名效果不叠加…）": an area selection (no unblocking 隐匿 ally)
    tick(b, e) { if (!st.on) return; for (const u of areaAllies(b, e, e.x, e.y, T(ab, '1.range_radius') ?? 0)) elem(b, e, u, 'neural', e.s.atk * (T(ab, '1.ep_damage_ratio') ?? 0)); },
  }, {
    // talent 3 (mode 1 only): every 赘生甲壳 it touches breaks, at a fifth of its HP each
    tick(b, e) {
      if (!st.on) return;
      for (const u of b.allyUnits) {   // (devices: not in b.allies())
        if (!u.alive || u.defId !== SHELL_KEY || hypot(u.x - e.x, u.y - e.y) > breakR + 1e-9) continue;
        hurt(b, e, e, e.s.maxHp * ratio, 'true');
        b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'dslntf:break' });
        b.kill(u, e);
        if (!e.alive) return;
      }
    },
  }];
}

/**
 * 术师快艇's talent DeathRattle (공식 클라에서 확인 2026-11-21): template enemy_magmot_summon — ON_OWNER_KILLED, not a
 * FALLDOWN, no 沉默 check — runs SummonEnemiesFollowMyRoute with `_onlySummonOneInTheSamePlace`, whose path spawns one
 * `enemy_key` at the boat's own spot as it falls (its mapPosition) with `ignoreOffset` set: no jitter, and neither the
 * nearest walkable tile's centre (`_useMapPosition` off) nor `_randomOffsetBound` 0.1 is used there. It comes the blackboard
 * `delay` later (MAGMOT_SUMMON_DELAY; Scheduler.SpawnSummonedEnemyTrackedInGameMode waits it out) on the route the boat had
 * as it fell, and the battle waits for it (`_managedByScheduler`, not `_dontBlockWave`). A boat that fell grazing a wall:
 * its spot pulled out as every dead spawn's (spawnChildren `spot.map` → groundSpot). Until 2026-11-21 at once
 * (docs/rules/sim.md 「사망 소환물의 자리」).
 * @param {AbState} ab @returns {EnemyAbility}
 */
function magmotSummon(ab) {
  const key = ab.tS['DeathRattle.enemy_key'], delay = T(ab, 'DeathRattle.delay') ?? MAGMOT_SUMMON_DELAY;
  return {
    death(c, b, e) {
      if (c.reason !== 'killed' || !key) return;
      const route = remainingRoute(e), pos = [e.y, e.x];
      const go = () => spawnChildren(b, e, key, 1, { route, pos, spot: { map: true, bound: 0 } });
      if (delay > 0) b.after(delay, go, { holdsBattle: true }); else go();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const ELEMENT_KITS = /** @type {Readonly<Record<string, EnemyKit>>} */ (Object.freeze({
  // --- ELEMENT 元素
  enemy_1148_dssbr: kitEp('neural', 'epdamage.attack@ep_damage_ratio'),       // 底海滑动者 · neural on hit
  enemy_1148_dssbr_2: kitEp('neural', 'epdamage.attack@ep_damage_ratio'),     // 富营养的滑动者 · neural on hit
  enemy_1158_divman: (ab) => kitDeepsea(ab, { swim: true }),          // 潜水员 · in deep water: ATK up + stealth; immune to 水蚀
  enemy_1160_hvyslr: (ab) => [...kitStun3(ab), ...kitDeepsea(ab, { drown: true })],   // 码头水手 · every (spCost+1)th attack stuns; drowns in deep water
  enemy_1160_hvyslr_2: (ab) => [...kitStun3(ab), ...kitDeepsea(ab, { drown: true })], // 码头水手长 · same
  enemy_1161_tidmag: kitTidmag,                                      // 控潮术师 · attack hits target + 4 neighbours, erosion
  enemy_1161_tidmag_2: kitTidmag,                                    // 领潮员 · same
  enemy_1162_magmot: (ab) => [...kitTidmag(ab), magmotSummon(ab)],  // 术师快艇 · same + 控潮术师 0.8 s after its knock-out
  enemy_1305_mhslim: kitEp('burn', 'EpDamage.attack@ep_damage_ratio'),        // 灼热源石虫 · burn on hit
  enemy_1305_mhslim_2: kitEp('burn', 'EpDamage.attack@ep_damage_ratio'),      // 炽焰源石虫 · burn on hit
  enemy_2021_syfish: kitEp('erosion', 'EpDamage.attack@ep_damage_ratio'),     // 骨海漂流体 · erosion on hit
  enemy_2025_syufo: kitSyufo,                                        // 掠海漂移体 · 近地悬浮 (drops to 爬行模式 when stunned) + erosion
  enemy_1229_darmy: kitEp('apoptosis', 'epdamage.attack@ep_damage_ratio'),    // 萨卡兹王庭军战士 · apoptosis on hit
  enemy_1229_darmy_2: kitEp('apoptosis', 'epdamage.attack@ep_damage_ratio'),  // 萨卡兹王庭军精锐战士 · apoptosis on hit
  enemy_1275_dwlock_2: kitDeathEye,                                  // 萨卡兹王庭军精锐术师 · apoptosis on hit + DeathEye channel → group apoptosis
  enemy_1439_dslntf: kitNucleus,                                     // 元核孽生者 · first damage: combat state (speed ×, neural pulse around)
  enemy_1439_dslntf_2: kitNucleus,                                   // 异光体孽生者 · same
  enemy_9007_acelem: kitParasite,                                    // 假想敌：淤困 · taunt −1; parasitises its blocker (arts/s, element taken ×, its burst spreads 1000)
  enemy_10065_ftzlc: kitIgnitable,                                   // 卷心籽 · ignited by 灼藤 → arts death blast
  enemy_10067_ftsjc: kitFlameVine,                                   // 灼藤 · ATK ramps until the 1st attack (3×3 arts + burn), burn on hit, ignites 卷心籽
}));

// server/sim/content/enemies/invisible.js — INVISIBLE 隐匿 kits (stealthy enemies) and their part of KITS (split from
// content/enemies.js).

import { enemyStealthed } from '../../targeting.js';
import { ALLY_COLLIDER_RADIUS } from '../../constants.js';
import { T, elem, hurt, targetsNear, byPriority, auraBuff, auraAllies, lineShot, crossTargets, mode } from './helpers.js';
import { stealth, onHitStatus, skill, kitStealth } from './archetypes.js';
import { hypot } from '../../detmath.js';
import { interruptEnemyCast } from '../../ai.js';
/** @import { Battle } from '../../Battle.js' */
/** @import { Unit } from '../../units.js' */
/** @import { AttackProfile } from '../../ai.js' */
/** @import { AbState, AbSkill, AbList, AbFn, AbKit, EnemyAbility, EnemyKit } from '../enemies.js' */
/** @import { BuffTick } from './helpers.js' */

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/** 假想敌：骨刺's targets at once while its 隐匿 holds: 3 — the level's own description 「隐匿；隐匿状态下同时攻击3个目标。」
 *  (enemy_database; the handbook line says 「数个目标」) and PRTS 天赋 「隐匿期间可同时攻击3个目标」 (GitHub #365). */
const ACBUNN_TARGETS = 3;
/** 假想敌：骨刺's mode check (2026-11-03, EN client prefab): the passive of each mode — enemy_acbunn[horror] in Horror (0, its
 *  隐匿 one), [cute] in Cute (1) — triggers every 0.3 s (its BuffData blackboard `interval`) and switches to the other mode
 *  when the INVISIBLE flag says so; entering a mode starts its passive, whose audioSignal sounds (ON_BUFF_START). */
const ACBUNN_SWITCH_IV = 0.3;

/** 重弩突袭者 直击: the skill's length and its charge before the bolt (PRTS 直击 "蓄力1.4s后向目标方向发射1支弩箭…※技能持续2.5s"). Its
 *  reach is no number: helpers.js crossTargets (until 2026-11-14 an assumed 6 tiles). */
const CROSS_SKILL = 2.5;
const CROSS_BOLT_SPEED = 5;   // projectile_enemy_msnip `_speed` (the data's skills CrossAttack.proj when present)
/** 重弩突袭者 直击's MUZZLE (map tiles from its position: forward along its facing, up a row) as the bolt leaves — the
 *  `Muzzle` bone at the OnAttack event (0.067 s) of the clip its ThreePartChannelingAnimation ends on, by its direction:
 *  Skill_End (212.74, 165.83), Skill_End_Down (151.49, 19.99), Skill_End_Up (153.57, 319.45) in skeleton units (EN client
 *  enemy_1404_msnip.skel); × 0.01 × its Graphic's 0.27, turned with the Graphic (X −30°: a row = cos 30° of the model's
 *  height) and moved by its local (0, −0.2, −0.06).
 * @type {Record<string, { f: number, up: number }>} */
const CROSS_MUZZLE = { side: { f: 0.574, up: 0.188 }, DOWN: { f: 0.409, up: -0.153 }, UP: { f: 0.415, up: 0.547 } };

// ---------------------------------------------------------------------------------------------------------------
// kits

/** @type {AbKit} */
function kitCrossbow(ab) {
  const s = ab.sk.CrossAttack;
  // its prefab's Skills/CrossAttack/Selector (공식 클라에서 확인, 2026-11-14): a CrossTileRange — every tile of its own row and
  // column, no distance (until 2026-11-14 an assumed 6 tiles of it) — through AdvancedSelectorWithTrapSheltr
  // `_checkOnTheSameLine` with the uneven offsets X −0.5/0.5, Y −0.5/0.1 (2026-10-21; until then ±0.5 both ways):
  // helpers.js crossTargets, as 速射轻弩手's
  // PRTS 重弩突袭者: 天赋 "隐匿（被阻挡，主动攻击期间均可解除）"; 直击 "蓄力1.4s后向目标方向发射1支弩箭，对击中的首个目标造成攻击力100%
  // 的法术伤害与5s晕眩 ※技能持续2.5s": revealed for the whole skill, the bolt leaves in the way of the unit it aimed at as
  // the cast starts, at the ability's spell — Skill_End's attack event, 2.5 − 1.1 + 0.067 = 1.467 s in (`atStrike`,
  // content/enemies.js castStrikeAt; until 2026-11-20 PRTS 「蓄力1.4s」), none when the cast is cut first (a stun …; a
  // silence meanwhile does not cut it — the enemy's AttackState.OnTick does not look at it; until 2026-11-20 it did [ASSUMED]). The skill's length is its
  // ability's (RangedAttack `_timeMode` 2, `_cooldown` 2.5, a ThreePartChannelingAnimation: content/enemies.js castLength):
  // it stands without a normal attack through the cast, which a stun cuts (until 2026-11-07 a buff of this kit held it 2.5 s
  // whatever happened [ASSUMED]). The blackboard's duration (2) is not the skill's length. Until 0.1.3: revealed 2 s, the
  // bolt at once.
  // Never begun while blocked: its `_familyMask` is ATTACK only (content/enemies.js onSkillSlot; until 2026-10-22 it shot
  // its blocker too); a shot begun before the block still leaves.
  // The cast turns it to that unit (CrossAttack `_faceToTarget` 1: the ability's DealWithFaceDirection at its start, before
  // its ThreePartChannelingAnimation picks the _Down / _Up set by the body's way — 공식 클라에서 확인 2026-11-26): its fire
  // returns `{ faceTo }` — the 'enemySkill' `face`, not `tgt` (whose trail the view would fly from the cast's start; the
  // bolt is the 'enemyShot' at the spell). Until 2026-11-26 it returned nothing and the set followed its walk.
  return [stealth(), skill(s, (b, e, a) => {
    const t = crossTargets(b, e)[0];
    a.aim = t ? { x: t.x, y: t.y } : null;
    if (!t) return;
    b.addBuff(e, { key: 'ab:revealed', duration: CROSS_SKILL, flags: { reveal: true } });
    return { faceTo: t };
  }, { sil: true, cond: (b, e) => crossTargets(b, e).length > 0, atStrike: (b, e, a) => {
    const aim = /** @type {{ x: number, y: number } | null} */ (a.aim), bb = s.bb;
    a.aim = null;
    if (!aim) return;
    // the bolt: its official projectile (data/enemies.json skills CrossAttack.proj — projectile_enemy_msnip, FIXED_DIRECTION
    // at 5 tiles/s; until 2026-10-10 12) flies straight along the axis towards the aimed spot and stops on the first ally
    // it touches — the aimed unit or one in front of it, or one behind when the aimed unit is gone; nobody: it flies on
    // for its 10 s life (helpers.js lineShot; until 2026-10-10 it homed on the nearest unit still in line)
    // 2026-10-23: from its MUZZLE (the projectile's `_mountPointType`) at the frame it shoots, not its centre; the
    // clip by its direction to the aimed spot — Entity.get_direction, the FOUR_WAYS axis nearest (UP, RIGHT, DOWN,
    // LEFT: a tie takes the first); its model faces the spot's side [추정: straight above / below it faces right]
    const dx = aim.x - e.x, dy = aim.y - e.y;
    const ways = [dy, dx, -dy, -dx];
    const m = CROSS_MUZZLE[['UP', 'side', 'DOWN', 'side'][ways.indexOf(Math.max(...ways))]], face = dx < 0 ? -1 : 1;
    lineShot(b, e, aim, s.proj || { key: 'projectile_enemy_msnip', move: 'FIXED_DIRECTION', speed: CROSS_BOLT_SPEED, delay: 0, life: 10 }, (u) => {
      if (!u || !u.alive) return;
      hurt(b, e, u, e.s.atk * (bb.atk_scale ?? 1), 'arts');
      if (bb.stun > 0 && u.alive) b.applyStatus(u, 'stun', { duration: bb.stun, source: e });
    }, { source: e, at: { x: e.x + face * m.f, y: e.y + m.up } });
  } })];
}

/**
 * 山海众头目 / 山海众秘使 (PRTS 天赋 "隐匿，该隐匿每次生效后自身获得强击标记（不可叠加）"; 技能 破隐一击 "仅持有强击标记且被阻挡时可
 * 触发：对阻挡目标造成攻击力200%的物理普通伤害，技能开始时消耗强击标记"): the mark comes with its 隐匿 — at the spawn and every
 * time it hides again (3 s after a block, Battle._stealthSwitch; or once a 反隐 ends) — and its next attack (a melee
 * one: blocked) spends it at InvisibleCombat.atk_scale. A new block inside the 3 s gives no new mark (until 0.1.2 every
 * block did).
 * @type {AbKit}
 */
function kitShadowKiller(ab) {
  const scale = (ab.sk.InvisibleCombat && ab.sk.InvisibleCombat.bb.atk_scale) || 1;
  return [stealth(), {
    spawn(b, e, a) { a.power = true; a.on = true; },
    tick(b, e, a) { const on = enemyStealthed(e); if (on && !a.on) a.power = true; a.on = on; },
    hitOut(c, b, e, a) { if (a.power && c.dmg.isAttack) c.dmg.amount *= scale; },
    attack(c, b, e, a) { a.power = false; },
  }];
}

/** @type {EnemyKit} */
function kitJazz(ab, e) {
  const s = ab.sk.fire;
  const r = (e.def.raw && e.def.raw.stats && e.def.raw.stats.rawRangeRadius) || 2.5;
  const revealed = (/** @type {Unit} */ u) => !enemyStealthed(u);                  // blocked, 反隐 (its 隐匿 returns 0 s after a block)
  // the channel's ticks (狂欢式演奏 below): floor(duration / hit_interval), 0 = none
  const jazzTicks = () => {
    const dur = s?.bb['enemy_cnvsax[cd].duration'] ?? 0, iv = s?.bb.hit_interval ?? 0.5;
    return dur > 0 && iv > 0 ? Math.max(1, Math.floor(dur / iv + 1e-9)) : 0;
  };
  return [stealth(), {
    // PRTS 天赋 "隐匿期间不进行普通攻击；未受隐匿影响时进入反击模式：仅进行阻挡攻击，造成100%物理伤害": its normal attack only ever
    // hits its blocker (`melee`), so a revealed (反隐) unblocked one neither shoots nor stands for its attack clip (until
    // 0.1.3 it shot everyone within its 2.5 range and stood still while it had a target — ai.js attackStand)
    spawn(b, e2) { /** @type {AttackProfile} */ (e2.profile).noAttack = true; /** @type {AttackProfile} */ (e2.profile).melee = true; },
    // 平时不攻击，失去隐匿时反击: its first mode has no attack ability, the counter is the mode Attack's (attached ready as it
    // is revealed, ai.js enemyMode)
    // 2026-11-14 (공식 클라에서 확인): the talent's buff `enemy_act38side[mode]` switches to mode 0 (Default) while 隐匿 holds
    // and to 1 (Attack) otherwise, without `_restartFSM`; `fire` is a skill of the Attack mode, so going back to 隐匿 detaches
    // it (Enemy.OnSwitchMode → EnemySkill.Detach) and its RangedAttack, `_interruptAbilityOnDetach`, is interrupted there —
    // the cast ends with its channel (RangedAttack.OnCastEnd clears the projectile of a `_waitForProjectileInvalid` cast,
    // whatever ended it) and its cooldown restarts
    // (EnemySkill._OnCastFinish). Until 2026-11-14 the channel ran on under 隐匿 and the enemy then stood up to a minute
    // (an open cast's stand, content/enemies.js PROJ_WAIT_MAX) where its blocker had been
    tick(b, e2) {
      /** @type {AttackProfile} */ (e2.profile).noAttack = !revealed(e2);
      if (mode(b, e2, /** @type {AttackProfile} */ (e2.profile).noAttack ? null : 'Attack', false) && /** @type {AttackProfile} */ (e2.profile).noAttack && e2.castLeft > 0 && !e2.castSwing) interruptEnemyCast(b, e2);
    },
  }, s ? {
    // 狂欢式演奏 (PRTS 节日爵士乐手, 反击模式): "仅攻击范围内存在我方单位时可触发：锁定目标持续施法，最多持续10.6s，每0.5s对目标
    // 造成攻击力20%的法术伤害和攻击力10%的灼燃损伤 ※施法期间受到沉默影响后，立即结束技能" — ONE locked target (its own
    // priority: the blocker first), floor(10.6 / 0.5) = 21 ticks at 0.5 … 10.5 s. The channel also ends when that target
    // is gone. Its ability (prefab `Modes/Attack/Body/Skills/fire`, 공식 클라에서 확인) is a RangedAttack with
    // `_waitForProjectileInvalid`: the cast lasts while its projectile — the channel — lives (`projAlive`, content/enemies.js
    // projCastOver), the enemy stands and makes no normal attack meanwhile, and the 10 s cooldown (enemy_database skill
    // 'fire') restarts as the channel ends (EnemySkill._OnCastFinish; upstream #904). The channel's buff
    // `enemy_cnvsax[cd]` is stunnable, freezable and levitatable as well as silenceable: a cut cast (`onCut`) ends it too.
    sil: true, name: s.name, cd: s.cd, icd: s.icd, cond: (b, e2) => revealed(e2) && targetsNear(b, e2, r).length > 0,
    projAlive: (b, e2) => !!e2.mem.jazzChannel,
    // detached while 隐匿 holds (mode Default, above): its cooldown stands still until the Attack mode comes back
    // (Enemy.OnTick ticks the enabled skills only; content/enemies.js onTick `pause`)
    pause: (b, e2) => e2.mode !== 'Attack',
    onCut: (b, e2) => { if (e2.mem.jazzChannel) e2.mem.jazzChannel.end(); },
    // the view: the ability's ThreePartChannelingAnimation (data skillCast.fire.chan, `_waitForAttachFinishEvent`) loops
    // until the cast ends — content/enemies.js castSkill / chanEnd; the fire returns its locked target (`tgt`: its link line)
    fire(b, e2) {
      const dur = s.bb['enemy_cnvsax[cd].duration'] ?? 0, iv = s.bb.hit_interval ?? 0.5;
      const t = byPriority(e2, targetsNear(b, e2, r))[0];
      const n = jazzTicks();
      if (!t || !n) return null;
      const buff = b.addBuff(e2, { key: 'ab:channel', duration: dur, flags: { disarm: true } });
      let k = 0;
      const end = () => {
        if (e2.mem.jazzChannel !== ch) return;
        h.cancel(); e2.mem.jazzChannel = null; if (buff) b.removeBuff(e2, buff);
      };
      const ch = { end };
      const h = b.every(iv, () => {
        if (!e2.alive || e2.s.flags.silence || !t.alive || !t.deployed) { end(); return; }
        b.fx('beam', { x: e2.x, y: e2.y, from: e2.id, to: t.id, kind: 'jazzFire' });
        hurt(b, e2, t, e2.s.atk * (s.bb.atk_scale ?? 0), 'arts');
        elem(b, e2, t, 'burn', e2.s.atk * (s.bb.ep_damage_ratio ?? 0));
        if (++k >= n) end();
      }, { owner: e2 });
      e2.mem.jazzChannel = ch;
      return t;
    },
  } : null];
}

/** @type {AbKit} */
function kitShadowBlade(ab) {
  const bat = ab.t['traitAbility.base_attack_time'] ?? 0;
  return [stealth(), {
    iv: 0.5,
    tick(b, e) {
      const partner = b.enemiesInRadius(e.x, e.y, 3).find((o) => /enemy_1174_duholy/.test(o.defId));
      const r = partner && partner.mem.ab ? (T(partner.mem.ab, 'traitAbility.range_radius') ?? 1.1) : 1.1;
      if (partner && hypot(partner.x - e.x, partner.y - e.y) <= r + 1e-9 && e.base.bat > 0) auraBuff(b, e, 'ab:shadowSync', 0.5, { batPct: bat / e.base.bat });
    },
  }];
}

/**
 * 假想敌：骨刺 — PRTS 天赋 (级别0): 「自身普通攻击索敌不受阻挡影响」 — profile `blockFree` (as 自制投石机): blocked, and so out of its
 * 隐匿, it still picks by priority among the allies in reach, not its blocker first, and a 隐匿 / 迷彩 blocker is no target
 * (targeting.js canTargetAlly); 「不会攻击飞行单位」 — profile `canTarget`; 「隐匿（解除阻挡0秒后恢复）」 — stealth(); 「隐匿期间
 * 可同时攻击3个目标」: while its 隐匿 holds, the first ACBUNN_TARGETS by priority among the allies its normal attack could hit
 * (ai.js attackTargets: the same reach — rangeRadius + the ally collider — and the same rules); one otherwise. Until
 * 0.2.2 (PR #365 by @Sukvii, the PRTS lines checked for this port): blocker first, flyers hit, the 3 picked within the bare
 * rangeRadius.
 * @type {AbKit}
 */
function kitBoneSpike() {
  /** The ability's own fields: its mode, the next switch check. @typedef {EnemyAbility & { mode: number, next: number }} BunnAb */
  return [stealth(), {
    spawn(b, e, /** @type {BunnAb} */ a) {
      /** @type {AttackProfile} */ (e.profile).blockFree = true;
      /** @type {AttackProfile} */ (e.profile).canTarget = (/** @type {Unit} */ u) => !u.isFlying;
      // its Horror mode is attached as it spawns (sound only, docs/rules/audio.md 「적 버프·커스텀 트리거 소리」)
      a.mode = 0;
      a.next = b.time + ACBUNN_SWITCH_IV;
      b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: 'acbunn:horror' });
    },
    tick(b, e, /** @type {BunnAb} */ a) {
      if (b.time + 1e-9 < a.next) return;
      a.next = b.time + ACBUNN_SWITCH_IV;
      const m = enemyStealthed(e) ? 0 : 1;
      if (m === a.mode) return;
      a.mode = m;
      mode(b, e, m ? 'Cute' : null);   // the other mode's attack ability (Cute: Attack_B), attached ready
      b.fx('kitHit', { x: e.x, y: e.y, id: e.id, k: m ? 'acbunn:cute' : 'acbunn:horror' });
    },
    before(c, b, e) {
      if (!enemyStealthed(e)) return;
      const l = byPriority(e, targetsNear(b, e, e.base.rangeRadius + ALLY_COLLIDER_RADIUS).filter(/** @type {AttackProfile} */ (e.profile).canTarget));
      if (l.length) c.targets = l.slice(0, ACBUNN_TARGETS);
    },
  }];
}

/**
 * 假想敌：影役 (规程 only; CN client prefab enemy_9034_acblk): 隐匿 (its talent `Invisible`: ToggleablePassiveBuffAbility
 * with AdvancedCompoundToggleChecker `_disableWhenBlocked`, `_restoreDelay` 3 — the common 隐匿, stealth()), and its `Aura`
 * (AuraAbility, NORMAL line: silence does not stop it; CircleRange of radius `Aura.range_radius` 1.8 taking an operator
 * whose collider meets it — + ALLY_COLLIDER_RADIUS as the other enemy auras —, TargetValidator: the other side, ground
 * and air) gives acblk[aura-blockVolume]: BLOCK_CNT `Aura.block_cnt` (−1), maxStackCnt 1 — one key, so two 影役 take
 * one block (「不可叠加」); `_removeBuffWhenTargetLeave`, `_removeBuffWhenAbilityDetached`: it goes with the unit leaving
 * or the 影役's end. A blocker over its new count lets its last enemy go (Battle blocking). Whom the aura reaches: the
 * operators a buff aura of an enemy takes (auraAllies — no 隐匿 one). Its ranged arts attack is the engine's.
 * @type {AbKit}
 */
function kitShadowServant(ab) {
  const r = (T(ab, 'Aura.range_radius') ?? 0) + ALLY_COLLIDER_RADIUS, n = T(ab, 'Aura.block_cnt') ?? 0;
  return [stealth(), {
    spawn(b, e) { e.mem.ab.blockAura = { r, n }; },
    tick(b) { syncBlockAura(b); },
    death(c, b) { syncBlockAura(b); },   // the aura ends with it
  }];
}

const BLOCK_AURA = 'ab:acblkAura';

/**
 * 影役's auras, all at once: every operator inside one living 影役's aura holds the one BLOCK_AURA buff (the value of the
 * first 影役 that reaches it), every other loses it — so a unit inside two auras keeps it until it has left both, and an
 * aura ends with its 影役.
 * @param {Battle} b
 */
function syncBlockAura(b) {
  const want = new Map();
  for (const o of b.enemies) {
    const k = o && o.alive && o.mem.ab && o.mem.ab.blockAura;
    if (!k || !k.n) continue;
    for (const u of auraAllies(b, o, o.x, o.y, k.r)) if (!want.has(u)) want.set(u, k.n);
  }
  for (const u of b.allies()) {
    const has = !!u.findBuff(BLOCK_AURA), n = want.get(u);
    if (n != null && !has) b.addBuff(u, { key: BLOCK_AURA, persist: true, visible: true, mods: { blockCnt: n }, fxTag: 'buff:acblk[aura-blockVolume]' });
    else if (n == null && has) b.removeBuff(u, BLOCK_AURA);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// this family's part of KITS (content/enemies.js spreads the parts in this order)

export const INVISIBLE_KITS = /** @type {Readonly<Record<string, EnemyKit>>} */ (Object.freeze({
  // --- INVISIBLE 隐匿
  enemy_1009_lurker: kitStealth,                                     // 潜伏者 · stealth
  enemy_1019_jshoot: kitStealth,                                     // 隐形弩手 · stealth
  enemy_1019_jshoot_2: kitStealth,                                   // 隐形弩手组长 · stealth
  enemy_1023_jmage: kitStealth,                                      // 隐形术师 · stealth
  enemy_1283_sgkill: kitStealth,                                     // 家族灭迹人 · stealth (清算时刻 n/a)
  enemy_1283_sgkill_2: kitStealth,                                   // 家族暗影灭迹人 · stealth
  enemy_1299_ymkilr: kitShadowKiller,                                // 山海众头目 · stealth; its 隐匿 turning on brings the mark: next attack ×InvisibleCombat.atk_scale (§22.8)
  enemy_1299_ymkilr_2: kitShadowKiller,                              // 山海众秘使 · same
  enemy_1389_winbab_2: kitStealth,                                   // 访问团强攻冠军 · stealth (供暖器 priority n/a)
  enemy_1404_msnip: kitCrossbow,                                     // 重弩突袭者 · stealth + 直击 (row/column bolt: arts + stun, reveals itself)
  enemy_10031_cnvsld: kitStealth,                                    // 业余竞演者 · stealth
  enemy_10034_cnvsax: kitJazz,                                       // 节日爵士乐手 · stealth; revealed: attacks its blocker only; channel on one target (arts + burn)
  enemy_10042_prtrop: kitStealth,                                    // 架桥船工 · stealth (bridges n/a)
  enemy_10042_prtrop_2: kitStealth,                                  // 扶桥老手 · stealth
  enemy_9008_acbunn: kitBoneSpike,                                   // 假想敌：骨刺 · stealth; hits 3 targets while stealthed
  enemy_9034_acblk: kitShadowServant,                                // 假想敌：影役 · stealth; operators within 1.8 block −1 (one, however many)
  enemy_1175_dushdo_2: kitShadowBlade,                               // 深池伙友影刃精英 · stealth; BAT −1.3 s next to 卫队精英
  enemy_2034_sythef: (ab) => [stealth(), onHitStatus('stun', T(ab, 'Combat.attack@stun'))],   // 流泪小子 · stealth, attacks stun
  enemy_2034_sythef_2: (ab) => [stealth(), onHitStatus('stun', T(ab, 'Combat.attack@stun'))], // 流泪小子 · same
}));

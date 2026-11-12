// server/sim/content/enemies/critic.js — CRITIC 精锐 kits of 卫戍协议：规程 (factions.json type CRITIC, a new type of 规程) and
// the escorts their entries bring (factions.json entries[*].N / E): main-story enemies, every prefab in the EN client
// (battle/enm_pfb_9 / _10 / _15 / _16). Their part of KITS.
//
// The type itself carries no rule of its own: activity_table's enemyInfoDict CRITIC is the handbook's list of the type's
// enemies, and none of the kits below reads the type.

import { canTargetAlly, areaSelectable } from '../../targeting.js';
import { ALLY_COLLIDER_RADIUS, TICK } from '../../constants.js';
import { T, hurt, areaAllies, lineShot, shoot, atCastEvent, mode, setForm, targetsNear, byPriority } from './helpers.js';
import { unbalancedBleed, skill } from './archetypes.js';
import { hypot, sin, cos } from '../../detmath.js';
import { hitFx } from '../../damage.js';

// ---------------------------------------------------------------------------------------------------------------
// constants (numbers that exist nowhere in the data)

/**
 * 冰原卫法者 / 冰原御法者's knock-out blast, projectile_enemy_krgrg (battle/prefabs/[uc]projectiles): its CircleCollider2D
 * radius, and its LIMITED `_lifeTime` — no movement, `_alwaysReachInTheEnd` with `_onlyCheckHitWhenReachTarget`, so it
 * strikes as its life ends (docs/rules/sim.md 「오퍼레이터 투사체」: the same reading as 迷迭香 S2's shell). The data's
 * talentProj.Boom.life is the same 1.2.
 */
const KRGRG_BLAST_RADIUS = 1.65, KRGRG_BLAST_DELAY = 1.2;

/**
 * The later OnAttack events of 马特奥的近卫's CrossBomb clip (Skill_1 / _Down / _Up: 1.867, 2.033, 2.233 s — data/assets.json
 * `hits`, from its skeleton): its MultiRangedAttack waits for an event for every shot (`_waitAttackEventForAllAttacks`), and
 * the blackboard `times` 2 makes it 2 shots (MultiRangedAttack.DoSetData: additional = times − 1) — the first at the
 * clip's first event (`skillCast.hit`), the second at this one.
 */
const BDGUAD_SECOND_BOMB = 2.033;
/** A bomb's touch radius: projectile_enemy_bdguad / projectile_enemy_boomer, BoomerHitBehaviour's selectors (CircleRange 0.3). */
const BOMB_TOUCH = 0.3;

// ---------------------------------------------------------------------------------------------------------------
// shared pieces

/**
 * Units of both sides within `r` of (x, y) a projectile of `src` with HitBehaviour `targetSide` 3 (SideType
 * BOTH_ALLY_AND_ENEMY) and `targetMotion` 1 (ground) strikes: the allies an area effect of `src` selects (areaAllies,
 * ground ones), and the other enemies on the ground there — no untargetable one (a 重生 in progress).
 * [추정·미조사: whether a same-side selection skips a 隐匿 or 无敌 enemy; here only 无法选中 does]
 */
function bothSidesAt(b, src, x, y, r) {
  const allies = areaAllies(b, src, x, y, r).filter((u) => !u.isFlying);
  const foes = b.enemiesInRadius(x, y, r).filter((o) => o !== src && !o.isFlying && !o.s.flags.untargetable);
  return [...allies, ...foes];
}

/**
 * The allies a 直击 of enemy `e` can aim at: the client's CrossTileRange (every tile of the enemy's own row and column, no
 * distance — CrossTileRange.CheckTargetIn: the selector's grid row or column) through AdvancedSelectorWithTrapSheltr
 * `_checkOnTheSameLine` with the prefab's offsets X −0.5…0.5 / Y −0.5…0.1 (the candidate's position minus the target's,
 * within either — as 重弩突袭者's, content/enemies/invisible.js kitCrossbow), every motion; nearest first.
 */
function crossTargets(b, e) {
  const r = Math.round(e.y), c = Math.round(e.x);
  const between = (v, lo, hi) => v > lo - 1e-9 && v < hi + 1e-9;
  return b.allies().filter((u) => canTargetAlly(e, u, true) && (u.tileR === r || u.tileC === c)
    && (between(e.x - u.x, -0.5, 0.5) || between(e.y - u.y, -0.5, 0.1)))
    .sort((p, q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || p.id - q.id);
}

/**
 * One FIXED_DIRECTION shot of `e` at `t` (its position when the shot leaves, the aimed spot once it is gone —
 * `_emitToInputPosWhenTargetIsInvalid`), along the nearest map axis (helpers.js lineShot); `onHit(u)` on the first ally it
 * touches.
 */
function crossShot(b, e, t, aim, proj, onHit, radius = undefined) {
  const at = t && t.alive && t.deployed ? { x: t.x, y: t.y } : aim;
  return lineShot(b, e, at, proj, (u) => { if (u && u.alive) onHit(u); }, { source: e, ...(radius != null ? { radius } : {}) });
}

/** A bomb's blast where it touched `u`: physical ATK × `scale` on the allies within `r` of it (BoomerHitBehaviour). */
function bombBlast(b, e, u, r, scale, atk = e.s.atk) {
  const x = u.x, y = u.y;
  b.fx('explode', { x, y, r, kind: 'bomb', id: e.id });
  for (const o of areaAllies(b, e, x, y, r)) hurt(b, e, o, atk * scale, 'phys', { tags: ['splash'] });
}

// ---------------------------------------------------------------------------------------------------------------
// kits

/**
 * 冰原卫法者 / 冰原御法者 (enm_pfb_9). Talents/Boom: a BslimeTalent_1 whose buff krgrg_t_boom (projectile_on_killed: on its
 * knock-out, not while 沉默 — the handbook line is SILENCE) emits projectile_enemy_krgrg where it fell; KRGRG_BLAST_DELAY s
 * later every ground unit of both sides within KRGRG_BLAST_RADIUS takes its ATK × `boom.atk_scale` as arts (the projectile's
 * AdvancedApplyDamage MAGICAL, SPLASH) and `boom.cold` s of 寒冷 (its buff enemy_krgrg_boom: e2c_cold on an operator, c2e_cold
 * on an enemy — the second cold of an enemy freezes it, Battle.applyStatus). Talents/unbalanced_bleed: unbalancedBleed.
 * The battle waits for the blast.
 */
function kitIceGuard(ab) {
  const scale = T(ab, 'boom.atk_scale') ?? 0, cold = T(ab, 'boom.cold') ?? 0;
  return [{
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const x = e.x, y = e.y, atk = e.s.atk;
      // the projectile appears where it fell (its `_effectsToTargetWhenStart`), the blast is its end
      b.fx('telegraph', { x, y, r: KRGRG_BLAST_RADIUS, dur: KRGRG_BLAST_DELAY, kind: 'deathBoom', id: e.id, ability: 'Boom' });
      b.after(KRGRG_BLAST_DELAY, () => {
        b.fx('explode', { x, y, r: KRGRG_BLAST_RADIUS, kind: 'deathBoom', id: e.id, ability: 'Boom' });
        for (const u of bothSidesAt(b, e, x, y, KRGRG_BLAST_RADIUS)) {
          if (scale > 0) hurt(b, e, u, atk * scale, 'arts', { tags: ['splash'] });
          if (cold > 0 && u.alive) b.applyStatus(u, 'cold', { duration: cold, source: e });
        }
      }, { holdsBattle: true });
    },
  }, ...unbalancedBleed(ab)];
}

/**
 * 战线推进者 (enm_pfb_16). Talents/DmgUp (enemy_chghmr_t) gives it the mark enemy_chghmr_damage_up[mark] as it spawns and
 * again whenever its block ends without it (ON_OWNER_BLOCKEE_CHANGED, not blocked). Skills/PowerHit (SILENCE line; EnemySkill
 * `_familyMask` 3, its trigger a self selector that needs the mark): a MeleeAttack on its target — with no range, its
 * blocker; none, no cast — in its own clip (Skill,
 * `skillCast`), its ATK × (1 + `atk`) while it casts (BuffToOwnerDuringAbility, ATK MULTIPLIER), and the mark spent at the
 * clip's event (ActionToOwner on the attack event) — so its first attack each time it is blocked. The talent's
 * `sheltr_atk_scale` is against 掩体 (trap_sheltr), which no 规程 field has.
 */
function kitLinePusher(ab) {
  const s = ab.sk.PowerHit, up = (s && s.bb.atk) ?? 0;
  const BUFF = 'ab:chghmrPower', MARK = 'ab:chghmrMark';
  const P = { mark: true, was: false };
  // the mark is a buff of its own, enemy_chghmr_damage_up[mark] (its effect enemy_chghmr_buff while it lasts)
  const setMark = (b, e, on) => {
    P.mark = on;
    if (on) b.addBuff(e, { key: MARK, persist: true, visible: true, fxTag: 'buff:enemy_chghmr_damage_up[mark]' });
    else b.removeBuff(e, MARK);
  };
  return [{
    spawn(b, e) { setMark(b, e, true); },
    tick(b, e) {
      const now = !!e.blockedBy;
      if (P.was && !now && !P.mark) setMark(b, e, true);
      P.was = now;
    },
  }, s ? {
    ...skill(s, (b, e) => {
      const t = e.blockedBy;
      if (up) b.addBuff(e, { key: BUFF, persist: true, mods: { atkPct: up } });
      atCastEvent(b, e, s, () => {
        if (t && t.alive && t.deployed) hurt(b, e, t, e.s.atk * (s.bb.atk_scale ?? 1), 'phys');
        setMark(b, e, false);
        b.removeBuff(e, BUFF);
      });
    }, { sil: true, cond: (b, e) => P.mark && !!e.blockedBy }),
    onCut(b, e) { b.removeBuff(e, BUFF); },
  } : null];
}

/**
 * 速射轻弩手 / 速射劲弩手 (enm_pfb_16). Skills/CrossAttack (SILENCE line; ATTACK family — never begun while blocked): on the
 * nearest ally in its 直击 cross (crossTargets) a MultiRangedAttack of 1 + `_additionalTimes` 2 = 3 bolts (no blackboard
 * `times`), the first at its clip's event (`skillCast.hit`), the others `_triggerDelta` 0.1 s apart; each its official
 * projectile_enemy_gunsho (FIXED_DIRECTION, as 重弩突袭者's: the first ally it touches) for physical ATK × `atk_scale`.
 * [추정·미조사: the bolts leave from its centre, not its MUZZLE point]
 */
function kitRapidCrossbow(ab) {
  const s = ab.sk.CrossAttack, n = 3, step = 0.1;
  if (!s) return [];
  return [skill(s, (b, e) => {
    const t = crossTargets(b, e)[0];
    if (!t) return;
    const aim = { x: t.x, y: t.y };
    const hit = s.cast && Number.isFinite(s.cast.hit) ? s.cast.hit : 0;
    for (let i = 0; i < n; i++) {
      atCastEvent(b, e, s, () => crossShot(b, e, t, aim, s.proj, (u) => hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'phys')), hit + i * step);
    }
  }, { sil: true, cond: (b, e) => crossTargets(b, e).length > 0 })];
}

/**
 * 马特奥的近卫 (enm_pfb_16). Skills/CrossBomb (SILENCE line; ATTACK family, cooldown 10 / 2): on the nearest ally in its 直击
 * cross 2 bombs (blackboard `times`) at its clip's events (BDGUAD_SECOND_BOMB), each projectile_enemy_bdguad (FIXED_DIRECTION,
 * BoomerHitBehaviour: it bursts on the first ally it touches) for physical ATK × `atk_scale` on the allies within
 * `projectile_range` of that spot. Talents/DmgResist: while unblocked (BlockedToggleChecker) physical and arts damage taken
 * × (1 − `DmgResist.damage_resistance`) (damage_resistance[inf]).
 * [추정·미조사: the bombs leave from its centre, not its MUZZLE points; the blast is centred on the ally touched]
 */
function kitMatteoGuard(ab) {
  const s = ab.sk.CrossBomb, cut = 1 - (T(ab, 'DmgResist.damage_resistance') ?? 0);
  const out = [{
    tick(b, e, a) {
      const on = !e.blockedBy && cut !== 1;
      if (on === !!a.on) return;
      a.on = on;
      if (on) b.addBuff(e, { key: 'ab:bdguadResist', persist: true, mods: { physTakenMul: cut, artsTakenMul: cut } });
      else b.removeBuff(e, 'ab:bdguadResist');
    },
  }];
  if (s) {
    const r = s.bb.projectile_range ?? 1, scale = s.bb.atk_scale ?? 1;
    const hit = s.cast && Number.isFinite(s.cast.hit) ? s.cast.hit : 0;
    const times = [hit, BDGUAD_SECOND_BOMB].slice(0, Math.max(1, s.bb.times ?? 1));
    out.push(skill(s, (b, e) => {
      const t = crossTargets(b, e)[0];
      if (!t) return;
      const aim = { x: t.x, y: t.y };
      for (const at of times) atCastEvent(b, e, s, () => crossShot(b, e, t, aim, s.proj, (u) => bombBlast(b, e, u, r, scale), BOMB_TOUCH), at);
    }, { sil: true, cond: (b, e) => crossTargets(b, e).length > 0 }));
  }
  return out;
}

/**
 * 无畏掷弹兵 (enm_pfb_16). Its first damage taken while unblocked and not 沉默 (enemy_boomer_skill_trigger, ON_TAKE_DAMAGE)
 * switches it to the mode D2L (the state machine restarted): there Skills/Bomb (AlwaysTrigger, once, `_ignoreSilence`) casts
 * its clip (Skill_1) and at the event throws projectile_enemy_boomer 4 ways — right, up, left, down (NoTargetRangedAttack
 * `_projectileNum` 4 over 270°) —, each bursting on the first ally it touches for physical ATK × `atk_scale` within
 * `projectile_range`; the cast over (enemy_boomer_switch2light), the mode Light: move speed + `Light.move_speed` and weight
 * + `Light.mass_level` (both ADDITION), its own melee attack.
 * [추정·미조사: the blast is centred on the ally touched]
 */
function kitGrenadier(ab) {
  const s = ab.sk.Bomb;
  const ms = T(ab, 'Light.move_speed') ?? 0, mass = T(ab, 'Light.mass_level') ?? 0;
  const light = (b, e) => {
    if (e.mode === 'Light') return;
    mode(b, e, 'Light', false);
    setForm(b, e, 'Light');   // the view's clips and effects of the mode (fx 'phase')
    b.addBuff(e, { key: 'ab:boomerLight', persist: true, mods: { moveFlat: ms, massFlat: mass } });
  };
  const trigger = {
    sil: true,
    taken(c, b, e, a) {
      if (a.done || e.blockedBy || !e.alive) return;
      a.done = true;
      mode(b, e, 'D2L', true);
    },
  };
  if (!s) return [trigger];
  const r = s.bb.projectile_range ?? 1, scale = s.bb.atk_scale ?? 1;
  return [trigger, {
    ...skill(s, (b, e, a) => {
      a.fired = true;
      atCastEvent(b, e, s, () => {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          lineShot(b, e, { x: e.x + dx, y: e.y + dy }, s.proj, (u) => { if (u && u.alive) bombBlast(b, e, u, r, scale); }, { source: e, radius: BOMB_TOUCH });
        }
      });
      const c = s.cast, end = c && c.dur > 0 ? c.dur : 0;
      b.after(end, () => { if (e.alive) light(b, e); }, { owner: e });
    }, { cond: (b, e, a) => e.mode === 'D2L' && !a.fired }),
    onCut(b, e) { if (e.alive) light(b, e); },
  }];
}

/** The 寻路者 trio's second prefab mode, the one their ammo turns on (enm_pfb_9 / _10 `Modes/HeadShot`). */
const HEAD = 'HeadShot';

/**
 * Half the side of 寻路者破阵者's shell box: projectile_enemy_cansld's BoxCollider2D 3 × 3 (battle/prefabs/[uc]projectiles),
 * its HitBehaviour taking every ally (`targetMotion` 3: ground and air, `_ignoreCamouflage`) whose collider meets the box
 * as the shell arrives (`_onlyCheckHitWhenReachTarget`).
 */
const CANSLD_BOX = 1.5;

/**
 * Enemy `e` is in its attack state, as the client's CheckUnitInAttackState reads it: a swing or a cast plays, or its
 * cooldown runs with a target still in reach (the attack state waits there for the next attack — ai.js enemyAttack's
 * reach: rangeRadius + an ally's collider; its blocker when it is blocked).
 */
function inAttackState(b, e) {
  if (e.swing || e.castLeft > 0) return true;
  if (!(e.atkCd > 0)) return false;
  if (e.blockedBy) return true;
  const r = e.profile.melee ? 0 : e.base.rangeRadius;
  return r > 0 && targetsNear(b, e, r + ALLY_COLLIDER_RADIUS).length > 0;
}

/**
 * The 寻路者 trio (CRITIC, enm_pfb_9 / _10): ammo as SP (enemy_database spData INCREASE_WITH_TIME with no increment: the
 * initial `initSp`, never refilled in this mode — the HUD shows it as bullets, `_showSpAsBulletMode`), two prefab modes,
 * Default and HeadShot, and the talent ShotBuff's buffs that move between them:
 * - enemy_spmode_check (every one), ON_BEFORE_ATTACK: with SP ≥ 1 in the first mode it switches to HeadShot, with less in
 *   HeadShot back to the first — no state restart, so the attack it comes before is still the old mode's and the next
 *   follows it at once (docs/rules/sim.md 「적의 모드 전환」: Enemy.CombatWrapper._DoCast). Run here as that attack is made
 *   (the 'attack' hook), on the SP it began with: the same switch, the same attack in the old mode.
 * - enemy_melee_and_ranged_spmode_check (`idle`: 破阵者, 传令兵), every 0.1 s while unblocked and not in its attack state
 *   (inAttackState): SP ≥ 1 in the first mode → HeadShot, less in HeadShot → the first — so an unblocked one with ammo
 *   shoots at once, and one out of ammo with nobody in reach walks on in its first mode.
 * HeadShot's attack ability (`blackboardPrefix` headshot_: ATK × `shotbuff.attack@headshot_atk_scale`) fires its own
 * projectile (data projModes.HeadShot) and spends `headshot_sp` (−1) at its attack event (BuffToOwner enemy_spmode_sp_reduce,
 * ModifySp); the attack is made by the engine and hit here (profile.deferHit while in HeadShot, so its swing and
 * attack events carry no engine shot: the fx 'enemyShot' draws the official one). `meleeDefault`: the first mode has only a
 * `_combat` MeleeAttack — its blocker alone (破阵者, 传令兵); 狙击手's first mode shoots plain shots and fights its blocker
 * in melee (`Attack_2`). `hit(b, e, t, x, y)`: HeadShot's effect where the shot lands. The `headshot_trapdamage` fixed arts
 * damage of 破阵者 / 传令兵 is on traps tagged TAG_TRAP_WPNSTS (冰淇淋机) only, which no 规程 field has.
 */
function pathfinder(ab, e, { meleeDefault = false, idle = false, hit, pick = null }) {
  const spd = (e.def.raw && e.def.raw.sp) || {};
  const init = Math.max(0, Number.isFinite(spd.initSp) ? spd.initSp : 1);
  const cost = -(T(ab, 'shotbuff.attack@headshot_sp') ?? -1);
  const shot = (e.def.projModes && e.def.projModes[HEAD]) || null;
  const set = (b, e2, on) => {
    if ((e2.mode === HEAD) === on) return;
    mode(b, e2, on ? HEAD : null, false);
    setForm(b, e2, on ? HEAD : null);
    e2.profile.deferHit = on;
    if (meleeDefault) e2.profile.melee = !on;
  };
  return [{
    iv: idle ? 0.1 : undefined,
    spawn(b, e2, a) {
      a.sp = init;
      a.head = false;
      if (meleeDefault) e2.profile.melee = true;
      e2.profile.shot = 'none';
    },
    tick(b, e2, a) {
      if (!idle || e2.blockedBy || inAttackState(b, e2)) return;
      if (a.sp >= 1 && e2.mode !== HEAD) set(b, e2, true);
      else if (a.sp < 1 && e2.mode === HEAD) set(b, e2, false);
    },
    // the attack about to be made is HeadShot's (its mode as it began: the switches below come after its strike)
    before(c, b, e2, a) {
      a.head = e2.mode === HEAD;
      e2.profile.deferHit = a.head;
      if (a.head && pick && c.targets.length) {
        const t = pick(b, e2, c.targets);
        if (t) c.targets = [t];
      }
    },
    attack(c, b, e2, a) {
      const was = a.head, sp = a.sp;
      a.head = false;
      if (was) {
        const t = c.targets[0];
        if (t) {
          const x = t.x, y = t.y;
          shoot(b, e2, t, shot, (u) => hit(b, e2, u, x, y), { hitDead: true });
        }
        a.sp = Math.max(0, a.sp - cost);
      }
      // enemy_spmode_check, on the SP this attack began with
      if (sp >= 1 && !was) set(b, e2, true);
      else if (sp < 1 && was) set(b, e2, false);
    },
  }];
}

/** HeadShot's hit on `u`: ATK × `scale` of `type`, the normal attack's (its projectile: 远程途径). */
const headHit = (b, e, u, scale, type) => {
  if (!u || !u.alive || !u.deployed) return false;
  b.dealDamage(e, u, { amount: e.s.atk * scale, type, isAttack: true, isProjectile: true });
  return true;
};

/** 寻路者狙击手 (enm_pfb_9): HeadShot shoots projectile_enemy_mtrsnp_headshot for physical ATK × `headshot_atk_scale` (2). */
function kitPfSniper(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  return pathfinder(ab, e, { hit: (b, e2, u) => headHit(b, e2, u, scale, 'phys') });
}

/**
 * 寻路者破阵者 (enm_pfb_9): its first mode fights only its blocker; HeadShot (`_useDynamicAttackType`) lobs
 * projectile_enemy_cansld (PARACURVE 4 tiles/s, to its target's spot at the attack) whose 3 × 3 box (CANSLD_BOX) strikes
 * every ally there — ground and air — for physical ATK × `headshot_atk_scale` (1) as it arrives, on a dead target too
 * (`_alwaysHitTraceTargetInTheEnd`).
 */
function kitPfBreaker(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const R = CANSLD_BOX + ALLY_COLLIDER_RADIUS;
  return pathfinder(ab, e, {
    meleeDefault: true, idle: true,
    hit(b, e2, _u, x, y) {
      b.fx('explode', { x, y, r: CANSLD_BOX, kind: 'cansld', id: e2.id });
      for (const o of b.allies()) {
        if (o.alive && o.deployed && Math.abs(o.x - x) <= R + 1e-9 && Math.abs(o.y - y) <= R + 1e-9 && areaSelectable(e2, o)) {
          b.dealDamage(e2, o, { amount: e2.s.atk * scale, type: 'phys', isAttack: true, isProjectile: true, tags: ['splash'] });
        }
      }
    },
  });
}

/**
 * 寻路者传令兵 (enm_pfb_10): its first mode fights only its blocker (arts); HeadShot shoots projectile_enemy_mtrbty for arts
 * ATK × `headshot_atk_scale` (1.5) and, on that hit, the client's buff disarmed_and_cant_use_skill (its buff table row:
 * buff key `disarmed`, abnormal flags DISARMED + SILENCED, `disarmed_duration` = `headshot_disarmed_duration` 15 s) — no
 * normal attack and no skill, 抵抗 shortening both. Its selector (SecondaryFilterAdvancedSelector `_buffKey` disarmed,
 * `_withoutThisBuff`) prefers the candidates without it: with one target its OnPostFilter keeps only those when any is
 * there, else all.
 */
function kitPfHerald(ab, e) {
  const scale = T(ab, 'shotbuff.attack@headshot_atk_scale') ?? 1;
  const dur = T(ab, 'shotbuff.attack@headshot_disarmed_duration') ?? 0;
  return pathfinder(ab, e, {
    meleeDefault: true, idle: true,
    pick(b, e2, targets) {
      if (!targets[0].s.flags.disarm) return null;
      const r = e2.base.rangeRadius + ALLY_COLLIDER_RADIUS;
      const l = byPriority(e2, targetsNear(b, e2, r)).filter((u) => !u.s.flags.disarm);
      return l[0] || null;
    },
    hit(b, e2, u) {
      if (!headHit(b, e2, u, scale, 'arts') || !u.alive || !(dur > 0)) return;
      b.applyStatus(u, 'disarm', { duration: dur, source: e2 });
      b.applyStatus(u, 'silence', { duration: dur, source: e2 });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// the 乐团 trio (残党乐团 / 巫王乐团 圆号手 · 管乐家 · 鼓手, enm_pfb_15)

/**
 * The 乐团's 变奏 is off in this mode. Each one's Talents/switchMode (PassiveBuffAbility) puts on
 * enemy_act29side[siwtch_mode_enthu] (圆号手, 鼓手) or [siwtch_mode_depressed] (管乐家) and
 * [switchmode_buff_creator]: both look for the environment system env_008_act29side_audio_type_switcher
 * (CheckContainsEnvSystem) as they start and, without it, finish there — so no mode switch, no buff_enthu /
 * buff_depressed numbers (the `switchMode.enemy_act29side[…]` blackboards), no 激昂 / 沉郁 mode abilities — and the first
 * leaves only its decoration, [enthu_fx_deco_only] (effect common_radical_01) or [depressed_fx_deco_only]
 * (common_gloomyl_01), not derived, for good. No 规程 level (levels/activities/act1autochess, every
 * level_act3autochess_*) and no buff of activity_table's act3autochess has that system.
 */
const bandDeco = (key) => ({
  spawn(b, e) { b.addBuff(e, { key: `ab:${key}`, persist: true, visible: true, fxTag: `buff:enemy_act29side[${key}]` }); },
});

/**
 * 鼓手's attack range: the prefab's CircleRange (Combat / Attack / Skills/aoeAttack selectors, CircleCollider2D 1.5). Its
 * table rangeRadius is −1, and CircleRange.InitCollidersIfNot keeps the collider's own radius for a negative one.
 */
const LTNDRU_RANGE = 1.5;
/**
 * 鼓手's aoeAttack blast: enemy_ltndru[AOE] (BuffToOwner at the clip's attack event, `lifeTime` 0.2 s — the skill
 * blackboard has no `duration_aoe`), ON_BUFF_FINISH an AOEDamage `_radius` 2 (no `range_radius` blackboard) around it.
 */
const LTNDRU_AOE_DELAY = 0.2, LTNDRU_AOE_RADIUS = 2;
/** 圆号手's attackTwoTarget: its selector BlockedOrAdvancedSelector `_maxNum` 2 (the normal attack's 1). */
const LTNHOR_TARGETS = 2;
/** 管乐家's atkboostCore: enemy_ltnclr[boost_atk] `triggerInterval` 0.5 s. */
const LTNCLR_BOOST_IV = 0.5;

/**
 * The SP of 圆号手 / 鼓手 (enemy_database spData maxSp 2): +1 for each normal attack as it strikes — 圆号手's
 * enemy_ltnhor[charge_sp] (BuffToOwner of its Combat and Attack abilities, ON_SPELL_ON: ModifySp +1; its spType
 * INCREASE_WITH_TIME has no increment), 鼓手's INCREASE_WHEN_ATTACK —, not for its skill's cast. Its skill (EnemySkill
 * `_familyMask` 3: blocked or not) waits for SP = `spCost` and spends it as it casts: 2 attacks, then the skill.
 */
function bandSp(s) {
  const cost = s && s.sp > 0 ? s.sp : 0;
  const P = { sp: 0 };
  return {
    P, cost,
    counter: { attack() { P.sp = Math.min(cost, P.sp + 1); } },
    ready: () => cost > 0 && P.sp >= cost,
    spend: () => { P.sp = Math.max(0, P.sp - cost); },
  };
}

/**
 * 残党乐团圆号手 / 巫王乐团圆号手: after 2 attacks (bandSp) Skills/attackTwoTarget (SILENCE line; SelectorTrigger: a target
 * in its 1.5 range) — a RangedAttack in its Attack clip on up to LTNHOR_TARGETS allies (its blocker first, then by its
 * targeting order), each its projectile_enemy_ltnhor for physical ATK at the clip's event. bandDeco: enthu.
 */
function kitBandHorn(ab) {
  const s = ab.sk.attackTwoTarget;
  const sp = bandSp(s);
  const pick = (b, e) => {
    const l = byPriority(e, targetsNear(b, e, e.base.rangeRadius + ALLY_COLLIDER_RADIUS));
    const k = e.blockedBy;
    const out = k && l.includes(k) ? [k, ...l.filter((u) => u !== k)] : l;
    return out.slice(0, LTNHOR_TARGETS);
  };
  return [bandDeco('enthu_fx_deco_only'), sp.counter, skill(s, (b, e) => {
    sp.spend();
    const ts = pick(b, e);
    const scale = s.bb.atk_scale ?? 1;
    atCastEvent(b, e, s, () => {
      for (const t of ts) {
        if (!t.alive || !t.deployed) continue;
        shoot(b, e, t, s.proj, (u) => { if (u && u.alive && u.deployed) b.dealDamage(e, u, { amount: e.s.atk * scale, type: 'phys', isAttack: true, isProjectile: true }); });
      }
    });
  }, { sil: true, cond: (b, e) => sp.ready() && pick(b, e).length > 0 })];
}

/**
 * 残党乐团管乐家 / 巫王乐团管乐家 (melee: only a Combat ability, its blocker): Talents/atkboostCore — every LTNCLR_BOOST_IV s
 * while unblocked (no enemy_ltnclr[blocked_flag], atkboostChecker's BlockedToggleChecker) a stack of
 * enemy_ltnclr[atk_boost_stack], ATK FINAL_ADDITION `atkboostCore.atk`, below `atkboostCore.max_stack_count`; its attack's
 * end (enemy_ltnclr[revert_atk], ON_CAST_END) clears them — the first attack after a walk carries the boost. The
 * `atkboostCore.attack@stun_duration` stun is the 沉郁 mode's attack, off here (bandDeco: depressed).
 */
function kitBandClarinet(ab) {
  const add = T(ab, 'atkboostCore.atk') ?? 0, max = T(ab, 'atkboostCore.max_stack_count') ?? 0;
  const KEY = 'ab:ltnclrBoost';
  const clear = (b, e) => { if (e.alive) b.removeBuff(e, KEY); };
  return [bandDeco('depressed_fx_deco_only'), {
    iv: LTNCLR_BOOST_IV,
    tick(b, e) {
      if (e.blockedBy || !(add > 0) || !(max > 0)) return;
      b.addBuff(e, { key: KEY, refresh: 'stack', stacks: 1, maxStacks: max, persist: true, mods: { atkFinal: add } });
    },
    attack(c, b, e) {
      const end = e.castLeft > 0 ? e.castLeft : 0;
      if (end > 1e-9) b.after(end, () => clear(b, e), { owner: e });
      else clear(b, e);
    },
  }];
}

/**
 * 残党乐团鼓手 / 巫王乐团鼓手 (ranged arts, LTNDRU_RANGE): after 2 attacks (bandSp) Skills/aoeAttack (SILENCE line;
 * AlwaysTrigger, `_allowNoTarget`) — its Attack clip, and LTNDRU_AOE_DELAY s after the clip's event arts ATK on every
 * ally within LTNDRU_AOE_RADIUS of it (AOEDamage MAGICAL, every motion). bandDeco: enthu. Gone from the field within
 * those 0.2 s (knocked out, through the exit), the blast comes at once where it was: the client finishes a leaving
 * enemy's buffs (Enemy.FinishMe → Entity.OnFinish → BuffContainer.Clear → Buff.OnFinish), which runs their
 * ON_BUFF_FINISH whether the owner lives or not (Buff._RunActions checks `alive` only to fill the context's tile).
 */
function kitBandDrummer(ab) {
  const s = ab.sk.aoeAttack;
  const sp = bandSp(s);
  const P = { aoe: null };   // the enemy_ltndru[AOE] buff on it, until it finishes
  const blast = (b, e) => {
    P.aoe = null;
    b.fx('explode', { x: e.x, y: e.y, r: LTNDRU_AOE_RADIUS, kind: 'ltndruAoe', id: e.id, ability: 'aoeAttack' });
    for (const u of areaAllies(b, e, e.x, e.y, LTNDRU_AOE_RADIUS)) hurt(b, e, u, e.s.atk * (s.bb.atk_scale ?? 1), 'arts', { tags: ['splash'] });
  };
  return [bandDeco('enthu_fx_deco_only'), {
    spawn(b, e) { e.base.rangeRadius = Math.max(e.base.rangeRadius || 0, LTNDRU_RANGE); },
    death(_c, b, e) { if (P.aoe) blast(b, e); },
  }, sp.counter, skill(s, (b, e) => {
    sp.spend();
    atCastEvent(b, e, s, () => {
      const t = (P.aoe = {});
      b.after(LTNDRU_AOE_DELAY, () => { if (P.aoe === t && e.alive) blast(b, e); }, { owner: e });
    });
  }, { sil: true, cond: () => sp.ready() })];
}

// ---------------------------------------------------------------------------------------------------------------
// “投石机” / “榴弹炮” and “喷射罐” / “喷爆罐” (enm_pfb_15)

/**
 * “投石机”'s snowball, projectile_enemy_wingnt (battle/prefabs/[uc]projectiles): two BoxCollider2D, 1 × 3 and 3 × 1, about
 * its centre — a cross —, its HitBehaviour taking every ally (`targetMotion` 3: ground and air, `_ignoreCamouflage`) whose
 * collider meets either box as it arrives (`_onlyCheckHitWhenReachTarget`, as 寻路者破阵者's shell). Half sizes.
 */
const WINGNT_CROSS = [[0.5, 1.5], [1.5, 0.5]];

/** Does an ally's collider (ALLY_COLLIDER_RADIUS) at (ux, uy) meet the box of half sizes `hw` × `hh` about (x, y)? */
function inBox(ux, uy, x, y, hw, hh) {
  const dx = Math.max(0, Math.abs(ux - x) - hw), dy = Math.max(0, Math.abs(uy - y) - hh);
  return dx * dx + dy * dy <= ALLY_COLLIDER_RADIUS * ALLY_COLLIDER_RADIUS + 1e-9;
}

/**
 * “投石机” / “榴弹炮” (enm_pfb_15; the handbook lines are NORMAL — nothing silenceable). Two prefab modes:
 * - Default: its only ability (`_attack` and `_combat` alike) is a RangedAttack in its A_Attack clip — the table's
 *   rangeRadius is 0 (applyWay MELEE), the official one `rawRangeRadius` (2.5, the selector's CircleRange × it), ground
 *   and air, its blocker too — that lobs projectile_enemy_wingnt (PARACURVE 4 tiles/s, on a dead target too:
 *   `_alwaysHitTraceTargetInTheEnd`) for arts ATK × `FirstAttack.attack@first_atk_scale` (1.5; the RangedAttack's
 *   `_damageType` MAGICAL — the handbook's PHYSIC is its melee, PRTS 「首次攻击…法术伤害」) on every ally in its cross
 *   (WINGNT_CROSS: the target's tile and the 4 beside it);
 * - Normal (clips B_*): a MeleeAttack, physical ATK on its blocker.
 * The switch: its RangedAttack's BuffToOwner gives it enemy_wingnt_first_atk[succes_flag] at ON_SPELL_END and
 * enemy_wingnt_t[check_mode] at ON_CAST_END, whose ON_BUFF_START switches to Normal when the flag is there (SwitchMode
 * `_restartFSM` off) and clears it. ON_CAST_END comes however the cast ends — AbilityStandard.OnCastEnd raises it for any
 * finish reason (공식 클라에서 확인) —, so a throw stunned after its strike still ends the Default mode, one cut before
 * it does not.
 */
function kitSnowballer(ab, e) {
  const scale = T(ab, 'FirstAttack.attack@first_atk_scale') ?? 1;
  const range = (e.def.raw && e.def.raw.stats && e.def.raw.stats.rawRangeRadius) || 0;
  const shot = e.def.proj || null;
  const melee = (b, e2) => {
    mode(b, e2, 'Normal', false);
    setForm(b, e2, 'Normal');   // the view's B_* clips (fx 'phase')
    e2.profile.melee = true;
    e2.profile.deferHit = false;
  };
  return [{
    spawn(b, e2, a) {
      a.thrown = false;
      e2.base.rangeRadius = Math.max(e2.base.rangeRadius || 0, range);
      e2.profile.melee = false;
      e2.profile.deferHit = true;
      e2.profile.shot = 'none';
    },
    // the cast's end (its clip played out, or cut): enemy_wingnt_t[check_mode]
    tick(b, e2, a) {
      if (a.thrown && !(e2.castLeft > 0) && !e2.swing && e2.mode !== 'Normal') melee(b, e2);
    },
    attack(c, b, e2, a) {
      if (e2.mode === 'Normal' || a.thrown) return;
      const t = c.targets[0];
      if (!t) return;
      a.thrown = true;   // succes_flag: the spell ended
      const x = t.x, y = t.y;
      shoot(b, e2, t, shot, () => {
        b.fx('explode', { x, y, r: 1.5, kind: 'wingnt', tiles: 'plus', id: e2.id });
        for (const o of b.allies()) {
          if (!o.alive || !o.deployed || !areaSelectable(e2, o)) continue;
          if (!WINGNT_CROSS.some(([hw, hh]) => inBox(o.x, o.y, x, y, hw, hh))) continue;
          b.dealDamage(e2, o, { amount: e2.s.atk * scale, type: 'arts', isAttack: true, isProjectile: true, tags: o === t ? [] : ['splash'] });
        }
      }, { hitDead: true });
    },
  }];
}

/**
 * “喷射罐”'s normal attack, Default/Body/Flame (a MultiMeleeAttack with a ThreePartChannelingAnimation): `_timeMode` 3 —
 * its attack time is the talent blackboard's `Boom.attack@cooldown` (4 s), not the attack interval («普通攻击不依赖攻击间隔») —
 * and ThreePartChannelingAnimation.UpdatePlaybackSpeed plays Attack_Begin (0.6 s) and Attack_End (0.267 s) as they are
 * with the loop in between (an attack time longer than the two clips: scale 1, the loop the rest — 공식 클라에서
 * 확인); `_waitAttackEventForAllAttacks`: one hit at each
 * OnAttack event, Attack_Loop's at its 0 s — so 0.6, 1.6, 2.6 s for its `Boom.attack@times` (3) hits.
 */
const WINBOM_BEGIN = 0.6, WINBOM_LOOP = 1;
/**
 * “喷射罐”'s knock-out blast, projectile_enemy_winbom: its CircleCollider2D radius and LIMITED `_lifeTime` (no movement,
 * `_alwaysReachInTheEnd` with `_onlyCheckHitWhenReachTarget` — it strikes as its life ends, as 冰原卫法者's).
 */
const WINBOM_BLAST_RADIUS = 1.55, WINBOM_BLAST_DELAY = 1;

/**
 * “喷射罐” / “喷爆罐” (enm_pfb_15). Its normal attack (WINBOM_BEGIN): an arts channel on its target within range (1, ground
 * and air) — `Boom.attack@times` hits of arts ATK × 1 (the ability's `atk_scale`, none in the blackboard) over
 * `Boom.attack@cooldown` s standing, and as the cast ends (ON_CAST_END, for any finish reason — AbilityStandard.OnCastEnd)
 * BuffToOwner enemy_winbom_attack_cd: DISARMED for `Boom.attack@attack_cd` (3) s — the next attack 7 s after the last
 * began (PRTS 「单次普通攻击持续4s…结束后进入3s冷却」). Talents/Boom (BslimeTalent_1, SILENCE line): knocked out, not while
 * 沉默 (projectile_on_killed), projectile_enemy_winbom where it fell — WINBOM_BLAST_DELAY s later arts ATK ×
 * `Boom.atk_scale` (AdvancedApplyDamage MAGICAL, SPLASH) and `Boom.freeze` (10) s of 寒冷 (`_projectileBuffs` e2c_cold) on
 * the ground allies within WINBOM_BLAST_RADIUS (HitBehaviour `targetSide` 2: the operators' side only). Its
 * enemy_winbom_t[extinguish] puts out 紧急供暖器 (trap_winfire) in its 3 × 3, which no 规程 field has. The battle waits
 * for the blast.
 * Each hit strikes the target the channel began on, none once it has fallen (the official client: Flame's
 * `_selectTargetTiming` 0 AT_BEGINING, so AbilityStandard._DoCast picks no new target for the later hits, and with
 * `_refreshInputTargetOnCheckSpell` off MultiMeleeAttack.CheckAnotherSpell keeps the input target).
 */
function kitJetCanister(ab) {
  const times = Math.max(1, T(ab, 'Boom.attack@times') ?? 1), chan = T(ab, 'Boom.attack@cooldown') ?? 0;
  const rest = T(ab, 'Boom.attack@attack_cd') ?? 0;
  const scale = T(ab, 'Boom.atk_scale') ?? 0, cold = T(ab, 'Boom.freeze') ?? 0;
  const CD = 'ab:winbomAttackCd';
  return [{
    spawn(b, e) {
      e.profile.deferHit = true;
      e.profile.shot = 'none';
    },
    // the channel's end, played out or cut: enemy_winbom_attack_cd
    tick(b, e, a) {
      if (!a.chan || e.castLeft > 0) return;
      a.chan = false;
      if (rest > 0) b.addBuff(e, { key: CD, duration: rest, flags: { disarm: true } });
    },
    attack(c, b, e, a) {
      const t = c.targets[0];
      if (!t || !(chan > 0)) return;
      a.chan = true;
      // the ability's cooldown, its attack time, runs from the cast's start; one frame more, so the frame the channel ends
      // (ai.js counts castLeft and atkCd down before it looks for a swing, the content's tick after) starts no swing
      // before enemy_winbom_attack_cd is on
      e.atkCd = chan + TICK;
      e.castLeft = chan;
      e.castSwing = true;
      e.atkStandUntil = Math.max(e.atkStandUntil, b.time + chan);
      const hit = () => {
        if (!e.alive || !(e.castLeft > 0) || !t.alive || !t.deployed) return;
        b.dealDamage(e, t, { amount: e.s.atk, type: 'arts', isAttack: true });
      };
      // the swing struck at Attack_Loop's event (data attackAnim hit 0): the channel's start
      for (let i = 0; i < times; i++) {
        const at = WINBOM_BEGIN + i * WINBOM_LOOP;
        if (at < chan - 1e-9) b.after(at - 1e-9, hit, { owner: e });
      }
    },
  }, {
    sil: true,
    death(c, b, e) {
      if (c.reason !== 'killed') return;
      const x = e.x, y = e.y, atk = e.s.atk;
      b.fx('telegraph', { x, y, r: WINBOM_BLAST_RADIUS, dur: WINBOM_BLAST_DELAY, kind: 'deathBoom', id: e.id, ability: 'Boom' });
      b.after(WINBOM_BLAST_DELAY, () => {
        b.fx('explode', { x, y, r: WINBOM_BLAST_RADIUS, kind: 'deathBoom', id: e.id, ability: 'Boom' });
        for (const u of areaAllies(b, e, x, y, WINBOM_BLAST_RADIUS)) {
          if (u.isFlying) continue;
          if (scale > 0) hurt(b, e, u, atk * scale, 'arts', { tags: ['splash'] });
          if (cold > 0 && u.alive) b.applyStatus(u, 'cold', { duration: cold, source: e });
        }
      }, { holdsBattle: true });
    },
  }];
}

// ---------------------------------------------------------------------------------------------------------------
// 魂灵 group: 注能 / 粹影魂灵法骸 (enemy_1431_lrmzrd / _2) with the escorts 魂灵涡流 (enemy_1428_lrsoul, N) and 聚焦 / 棱镜
// 魂灵残迹 (enemy_1429_lrwzrd / _2, E) — battle/enm_pfb_16, the official client (EN)

/**
 * The capture aura of 魂灵法骸 / 魂灵残迹 (Talents/CaptureSoul AuraAbility): its CircleCollider2D radius, and the radius of
 * 魂灵涡流's own collider (its root CircleCollider2D) — the aura takes a vortex whose collider meets it.
 */
const SOUL_AURA = 0.25, SOUL_BODY = 0.25;
/** enemy_lrmzrd[captureSoul] / enemy_lrwzrd[captureSoul]: a capturer holding this many souls (soulBuff ≥ 3) takes none. */
const SOUL_MAX = 3;
const SOUL_MARK = 'ab:lrsoulMark';
/**
 * 魂灵法骸's soul fireball, projectile_enemy_lrmzrd: RotateAroundMovement (`_rotateAndMoving`) puts it `_projectileAroundRadius`
 * from its caster's position and turns it `_aroundSpeed` degrees a second about the map's forward axis (Transform.RotateAround:
 * counter-clockwise with the map's y up); its CircleCollider2D radius. It is born on the side the caster faces
 * (RangedAttackWithProjectilesRotatingAround._CalculateProjectileGeneratePos: the caster ± faceSign × `_radius` along x).
 */
const LRMZRD_ORBIT = 0.9, LRMZRD_TURN = 50, LRMZRD_BALL = 0.45;
/**
 * 魂灵残迹's laser, projectile_enemy_lrwzrd_* (LaserHitBehaviour + MultiHitBehaviour): `_laserWidth`, a unit struck again
 * after `_keepAlreadyHitTime` s, gone after `_lifeTime` s at the latest; LrwzrdRangedAttack's `_preDelay` before it is fired.
 */
const LRWZRD_WIDTH = 0.65, LRWZRD_REHIT = 1, LRWZRD_LIFE = 8, LRWZRD_PRE = 0.2;
/** BuffDuringCastingFixed enemy_lrwzrd[atk_boost]: its `triggerInterval` (first trigger one interval after the cast starts). */
const LRWZRD_BOOST_EVERY = 1;

/** 魂灵涡流: a melee walker carrying the mark the capturers look for (Talents/mark: enemy_lrsoul[mark], no duration). */
function kitSoulVortex() {
  return [{ spawn(b, e) { b.addBuff(e, { key: SOUL_MARK, persist: true }); } }];
}

/**
 * The souls a 魂灵法骸 / 魂灵残迹 holds (`P.souls`, its soulBuff — STACK, kept as the buff `ab:soul` with as many stacks
 * for the view, fxTag `buff:<template>[soulBuff]`: enemy_lrmzrd[fx_ctrl] / enemy_lrwzrd[fx_ctrl] show 1 to 3), and its
 * capture: Talents/CaptureSoul, an AuraAbility (AppearSyncedTalent: from its appearance; no silence line) whose
 * FilterBuffTargetValidator takes ground units of its own side marked enemy_lrsoul[mark]. A vortex is offered as it
 * enters the aura (AuraAbility.OnTick only ticks its validator and its enter / exit handler; the validator has no tick of
 * its own), once until it has left again: enemy_lrxxxx[captureSoul] ON_BUFF_START — the capturer at 3 souls or more takes
 * nothing (FinishBuff, the vortex walks on), else +1 soul (audioSignal enemy_lrxxxx_capture_soul) and the vortex dies
 * (InstantKill `_skipReborn`). fx 'capture' { id (the capturer), from (the vortex), n (souls) }.
 */
function soulHolder(P, tpl) {
  const KEY = 'ab:soul';
  P.souls = 0;
  P.setSouls = (b, e, n) => {
    P.souls = n;
    b.removeBuff(e, KEY);
    if (n > 0) b.addBuff(e, { key: KEY, persist: true, refresh: 'stack', stacks: n, maxStacks: 99, fxTag: `buff:${tpl}[soulBuff]` });
  };
  const inside = new Set();
  return {
    tick(b, e) {
      const reach = SOUL_AURA + SOUL_BODY;
      for (const o of b.enemies) {
        if (o === e || !o.alive || o.hidden || o.isFlying || !o.findBuff(SOUL_MARK)) { inside.delete(o.id); continue; }
        const inAura = hypot(o.x - e.x, o.y - e.y) <= reach + 1e-9;
        if (!inAura) { inside.delete(o.id); continue; }
        if (inside.has(o.id)) continue;
        inside.add(o.id);
        if (P.souls >= SOUL_MAX) continue;
        P.setSouls(b, e, P.souls + 1);
        b.fx('capture', { x: e.x, y: e.y, id: e.id, from: o.id, n: P.souls });
        b.kill(o, null);
      }
    },
  };
}

/**
 * 注能 / 粹影魂灵法骸 (enm_pfb_16). Melee (its Attack ability never triggers: blocked, it strikes its blocker), it captures
 * 魂灵涡流 (soulHolder). Skills/summonFireball (EnemySkill, ATTACK and COMBAT families; the table's cooldown 15, no initial
 * one), while it holds a soul and is not locked (GroupTrigger of soulBuff present AND enemy_lrmzrd[lock_skill] absent): its
 * clip Skill, and at the clip's event (`_waitForAttackEvent`; SPELL_ON, `_runActionOnEvent` 4) one fireball
 * (`projectile_count_each_trigger` 1) starts circling it (LRMZRD_ORBIT), BuffToOwner enemy_lrmzrd[clear_buff] spends one soul
 * (`_decCntIfStack`) and [record_projectile_count] counts the fireball (projectile_stack) — at `max_projectile_count` (3)
 * enemy_lrmzrd[lock_skill] stops further casts. A fireball strikes the first operator-side unit its collider meets (ground
 * and air, 迷彩 ignored, through walls; `_maxHitNum` 1, `_stopAfterMaxHit`): arts ATK × the skill's `atk_scale`, and its
 * active buff enemy_lrmzrd[unlock_skill] on the struck unit takes one off its caster's count and the lock off. Fireballs
 * last until they strike (`_lifeTimeType` 2) and vanish with their caster (`_stopWhenSourceInvalid`; OnDetached interrupts
 * them). fx 'orbit' { id, n, key, r, ang (degrees, map frame), speed (degrees / s) } as one starts, 'orbitEnd' { id, n,
 * tgt } as it strikes or vanishes.
 */
function kitSoulMage(ab) {
  const s = ab.sk.summonFireball;
  const scale = (s && s.bb.atk_scale) ?? 1, cap = (s && s.bb.max_projectile_count) ?? SOUL_MAX;
  const key = (s && s.proj && s.proj.key) || 'projectile_enemy_lrmzrd';
  const P = { stack: 0, balls: [], n: 0, facing: -1, px: null };
  const holder = soulHolder(P, 'enemy_lrmzrd');
  const end = (b, e, ball, tgt) => {
    P.balls = P.balls.filter((x) => x !== ball);
    b.fx('orbitEnd', { x: e.x, y: e.y, id: e.id, n: ball.n, tgt: tgt ? tgt.id : null });
  };
  return [holder, {
    tick(b, e, a, dt) {
      if (P.px != null && Math.abs(e.x - P.px) > 1e-6) P.facing = e.x > P.px ? 1 : -1;
      P.px = e.x;
      const reach = LRMZRD_BALL + ALLY_COLLIDER_RADIUS;
      for (const ball of P.balls.slice()) {
        ball.ang += LRMZRD_TURN * dt;
        const rad = (ball.ang * Math.PI) / 180;
        const x = e.x + LRMZRD_ORBIT * cos(rad), y = e.y + LRMZRD_ORBIT * sin(rad);
        let hit = null, hd = Infinity;
        for (const u of b.allies()) {
          if (!u.alive || !u.deployed || !areaSelectable(e, u)) continue;
          const d = hypot(u.x - x, u.y - y);
          if (d <= reach + 1e-9 && (d < hd || (d === hd && u.id < hit.id))) { hit = u; hd = d; }
        }
        if (!hit) continue;
        end(b, e, ball, hit);
        b.dealDamage(e, hit, { amount: e.s.atk * scale, type: 'arts', isSkill: true, isProjectile: true, tags: ['enemyAbility'] });
        P.stack = Math.max(0, P.stack - 1);   // enemy_lrmzrd[unlock_skill]
        P.lock = false;
        if (!e.alive) break;
      }
    },
    death(c, b, e) { for (const ball of P.balls.slice()) end(b, e, ball, null); },
  }, s ? skill(s, (b, e) => atCastEvent(b, e, s, () => {
    const ball = { n: ++P.n, ang: P.facing > 0 ? 0 : 180 };
    P.balls.push(ball);
    b.fx('orbit', { x: e.x, y: e.y, id: e.id, n: ball.n, key, r: LRMZRD_ORBIT, ang: ball.ang, speed: LRMZRD_TURN });
    P.setSouls(b, e, P.souls - 1);
    P.stack += 1;
    if (P.stack >= cap) P.lock = true;
  }), { cond: () => P.souls > 0 && !P.lock }) : null];
}

/**
 * 聚焦 / 棱镜魂灵残迹 (enm_pfb_16). Ranged arts attack (its table); it captures 魂灵涡流 (soulHolder). Skills/Laser (EnemySkill,
 * ATTACK and COMBAT families; the table's cooldown 15, no initial one), while it holds a soul (BuffTrigger) and an
 * operator-side unit of any motion stands in its own grid row or column at any distance (CrossTrigger: GlobalRange,
 * `_postFilter` CROSS_ONLY_WITH_HATRED_DES — FilterUtil._Filter_CrossOnlyWithHatredDes: the candidate's grid row or column
 * is the caster's; the highest 仇恨值 first): LrwzrdRangedAttack, `_timeMode` 2 — an 8 s channel (Skill_Begin / _Loop /
 * _End). Through the cast BuffDuringCastingFixed enemy_lrwzrd[atk_boost]: on its start the souls held fix its cap
 * (`atk_ladder` × souls), and every LRWZRD_BOOST_EVERY s ATK × (1 + boost), boost += `atk_step` up to that cap (gone with the
 * cast). After `_preDelay` (LRWZRD_PRE) BuffToOwner enemy_lrwzrd[clear_buff] (SPELL_ON) spends every soul — no
 * `_decCntIfStack` — and one laser leaves (DoCastOnTargets): along the map axis toward its target (x if |dx| ≥ |dy|, right
 * on a tie of positions) from its position to the edge of the map (x 0 / width − 1, y 0 / height − 1). The laser strikes
 * every operator-side unit whose collider meets it (`_laserWidth` LRWZRD_WIDTH; ground and air, 迷彩 ignored, through
 * walls) for arts ATK × the skill's `atk_scale`, a unit again LRWZRD_REHIT s after its last hit, and ends with the cast
 * (OnCastEnd interrupts it, a cut cast too) or after LRWZRD_LIFE s. fx 'laser' { id, x, y, to: [x, y], key, w, tgt } as it
 * leaves, 'laserEnd' { id } as it ends.
 */
function kitSoulWizard(ab) {
  const s = ab.sk.Laser;
  const scale = (s && s.bb.atk_scale) ?? 0, step = (s && s.bb.atk_step) ?? 0, ladder = (s && s.bb.atk_ladder) ?? 0;
  const key = (s && s.proj && s.proj.key) || 'projectile_enemy_lrwzrd_right';
  const BOOST = 'ab:lrwzrdBoost';
  const P = {};
  const holder = soulHolder(P, 'enemy_lrwzrd');
  const pick = (b, e) => {
    const r = Math.round(e.y), c = Math.round(e.x);
    return byPriority(e, b.allies().filter((u) => canTargetAlly(e, u, true) && (u.tileR === r || u.tileC === c)))[0] ?? null;
  };
  const stop = (b, e, a) => {
    if (a.laser) b.fx('laserEnd', { x: e.x, y: e.y, id: e.id });
    a.laser = null;
    a.boost = null;
    b.removeBuff(e, BOOST);
  };
  const laser = s ? {
    ...skill(s, (b, e, a) => {
      const t = pick(b, e);
      if (!t) return;
      const at = { x: t.x, y: t.y };
      a.boost = { v: 0, cap: ladder * P.souls, next: b.time + LRWZRD_BOOST_EVERY, until: b.time + LRWZRD_LIFE };
      a.laser = null;
      b.after(LRWZRD_PRE - 1e-9, () => {
        if (!e.alive || !(e.castLeft > 0) || !a.boost) return;
        P.setSouls(b, e, 0);
        const dx = at.x - e.x, dy = at.y - e.y;
        const dir = Math.abs(dy) <= Math.abs(dx) ? [dx < 0 ? -1 : 1, 0] : [0, dy < 0 ? -1 : 1];
        const to = dir[0] > 0 ? [b.grid.cols - 1, e.y] : dir[0] < 0 ? [0, e.y] : dir[1] > 0 ? [e.x, b.grid.rows - 1] : [e.x, 0];
        a.laser = { x: e.x, y: e.y, to, dir, last: new Map() };
        b.fx('laser', { x: e.x, y: e.y, id: e.id, to, key, w: LRWZRD_WIDTH, tgt: t.id });
      }, { owner: e });
    }, { cond: (b, e) => P.souls > 0 && !!pick(b, e) }),
    tick(b, e, a) {
      if (!a.boost) return;
      if (!(e.castLeft > 0) || b.time >= a.boost.until - 1e-9) { stop(b, e, a); return; }
      if (b.time >= a.boost.next - 1e-9) {   // enemy_lrwzrd[atk_boost] ON_BUFF_TRIGGER
        a.boost.next += LRWZRD_BOOST_EVERY;
        a.boost.v = Math.min(a.boost.v + step, a.boost.cap);
        b.addBuff(e, { key: BOOST, persist: true, refresh: 'replace', mods: { atkPct: a.boost.v } });
      }
      const L = a.laser;
      if (!L) return;
      const len = Math.abs((L.to[0] - L.x) * L.dir[0] + (L.to[1] - L.y) * L.dir[1]);
      const half = LRWZRD_WIDTH / 2 + ALLY_COLLIDER_RADIUS;
      for (const u of b.allies()) {
        if (!u.alive || !u.deployed || !areaSelectable(e, u)) continue;
        const along = (u.x - L.x) * L.dir[0] + (u.y - L.y) * L.dir[1];
        const perp = Math.abs((u.x - L.x) * L.dir[1] - (u.y - L.y) * L.dir[0]);
        if (perp > half + 1e-9 || along < -ALLY_COLLIDER_RADIUS - 1e-9 || along > len + ALLY_COLLIDER_RADIUS + 1e-9) continue;
        const last = L.last.get(u.id);
        if (last != null && b.time < last + LRWZRD_REHIT - 1e-9) continue;
        L.last.set(u.id, b.time);
        hurt(b, e, u, e.s.atk * scale, 'arts');
        if (!e.alive) return;
      }
    },
    onCut(b, e, a) { stop(b, e, a); },
    death(c, b, e, a) { stop(b, e, a); },
  } : null;
  return [holder, laser];
}

// ---------------------------------------------------------------------------------------------------------------
// 规程 精锐 entry 假想敌：丛生 (enemy_9040_accrit): its escorts 狂暴凶豕兽 (N) and 神勇的帕拉杜利斯 (E), main-story enemies
// (EN client prefabs enemy_1309_mhboar_2 in enm_pfb_13, enemy_10163_mnctur_2 in enm_pfb_29)

/** 狂暴凶豕兽's `_blockVolume` (its Enemy component): 2 — the table's blockCnt says 1; 「只能被阻挡数大于等于2的单位阻挡」. */
const MHBOAR_BLOCK_VOLUME = 2;
/** Its Crash AuraAbility's CircleCollider2D radius; 神勇的帕拉杜利斯's CollideChar aura radius (Modes/Run). */
const MHBOAR_CRASH_RADIUS = 0.5, MNCTUR_COLLIDE_RADIUS = 0.45;
/** 狂暴凶豕兽's listeners (mhboar_t_listener[a]…[e]: `triggerInterval` 0.1, from the prefab's BuffData). */
const MHBOAR_LISTEN = 0.1;

/**
 * 狂暴凶豕兽 (规程: 假想敌：丛生's escort N). Weight 2 (MHBOAR_BLOCK_VOLUME: an operator blocks it only with 2 free blocks).
 * 【冲撞】 (talent Rush, five listeners every MHBOAR_LISTEN s): not blocked and not 晕眩 / 束缚 (UNMOVABLE) / 冻结 / 浮空, with no
 * charge running, it starts one (mhboar_t[trigger], INFINITY, `Rush.mhboar_t[trigger].trig_cnt` 35 triggers every
 * `….interval` 0.333 s — Buff.Reset: the blackboard's `trig_cnt` / `interval` override the BuffData; official client) and a
 * `Rush.mhboar_t_predelay.predelay` (3) s wait; each trigger past the wait adds one stack of MOVE_SPEED MULTIPLIER
 * `….move_speed` (0.333; the stacks add up: × (1 + 0.333 n), 26 at most — the first 9 triggers fall in the wait). Being blocked
 * does not end it; 晕眩 / 束缚 / 冻结 / 浮空 do (listeners [a]–[d]), all stacks with it.
 * FirstAttack (PassiveAttachmentAbility on its attacks → enemy_mhboar_t_atk): an attack landing while it charges deals
 * MOVE_SPEED × `FirstAttack.atk_scale` (600) physical to the target and ends the charge (DamageViaAttr; PRTS 「当前移动速度
 * ×600的预计算近战途径物理伤害，成功造成该额外伤害后停止冲撞」).
 * Crash (AuraAbility, radius MHBOAR_CRASH_RADIUS + the operator's collider, TargetRootTileValidator: units on low tiles,
 * ground or air — PRTS 「可以命中空中…只能命中低地」): a unit entering it while the boar walks on its own
 * (IfEnemyIsMovingBySelf) takes MOVE_SPEED × `Crash.atk_scale` (800) physical — once until it leaves (`_removeBuffWhenTargetLeave`);
 * its `Crash.stun` is 0. Whom it reaches: an area selection (areaAllies) on low tiles — the official client's
 * TargetRootTileValidator.Validate: the base TargetValidator (its advanced options on but all at their defaults) and
 * TileSelector.Options.Verify with only `checkHeightType` LOWLAND set.
 */
function kitRagingBoar(ab) {
  const mul = T(ab, 'Rush.mhboar_t[trigger].move_speed') ?? 0, iv = T(ab, 'Rush.mhboar_t[trigger].interval') ?? 0;
  const cnt = T(ab, 'Rush.mhboar_t[trigger].trig_cnt') ?? 0, wait = T(ab, 'Rush.mhboar_t_predelay.predelay') ?? 0;
  const first = T(ab, 'FirstAttack.atk_scale') ?? 0, crash = T(ab, 'Crash.atk_scale') ?? 0;
  const KEY = 'ab:mhboarRush';
  const held = (e) => { const f = e.s.flags; return !!(f.stun || f.freeze || f.levitate || f.bind || f.noMove); };
  const stop = (b, e, a) => { a.rush = null; b.removeBuff(e, KEY); };
  return [{
    spawn(b, e, a) { e.blockWeight = MHBOAR_BLOCK_VOLUME; a.rush = null; a.listen = 0; a.inside = new Set(); },
    tick(b, e, a, dt) {
      a.listen += dt;
      if (a.listen >= MHBOAR_LISTEN - 1e-9) {
        a.listen -= MHBOAR_LISTEN;
        if (a.rush && held(e)) stop(b, e, a);
        else if (!a.rush && !e.blockedBy && !held(e) && iv > 0) a.rush = { start: b.time, n: 0, stacks: 0, next: b.time + iv };
      }
      const r = a.rush;
      while (r && r.n < cnt && b.time >= r.next - 1e-9) {
        const at = r.next;
        r.n++; r.next += iv;
        if (at - r.start < wait - 1e-9) continue;   // mhboar_t_predelay still on: the try fails
        r.stacks++;
        b.addBuff(e, { key: KEY, persist: true, visible: true, mods: { moveMul: 1 + mul * r.stacks }, fxTag: 'buff:mhboar_t[core]' });
      }
      // Crash: units entering the aura while it walks on its own
      const now = new Set(areaAllies(b, e, e.x, e.y, MHBOAR_CRASH_RADIUS + ALLY_COLLIDER_RADIUS).filter((u) => b.grid.isLow(u.tileR, u.tileC)));
      const walking = e.moving && !e.blockedBy && !held(e);
      // (the hit's effect moment 'buff:mhboar_crash': the crash buff's enemy_mhboar_hit_02 on the unit — display only, damage.js hitFx)
      for (const u of now) if (!a.inside.has(u) && walking && crash > 0 && hurt(b, e, u, e.s.moveSpeed * crash, 'phys', { tags: ['mhboarCrash'] }) > 0) hitFx(b, u, 'buff:mhboar_crash', e);
      a.inside = now;
    },
    dealt(c, b, e, a) {
      if (!a.rush || !c.dmg.isAttack || !c.target || !c.target.alive) return;
      const v = e.s.moveSpeed * first;
      stop(b, e, a);
      hurt(b, e, c.target, v, 'phys', { tags: ['mhboarFirst'] });
    },
  }];
}

/**
 * 神勇的帕拉杜利斯 (规程: 假想敌：丛生's escort E). 【冲锋】 (Skills/rush of Default, the ATTACK family: unblocked, at its attack
 * slot, cooldown / initial cooldown from the table; PRTS 「仅未被阻挡、且移动方向同一行/列的前方存在非飞行我方单位时可触发：标记并开始
 * 追踪目标所在地块中心」): CrossTileRangeWithDist (`_checkDirection`, no distance) + AdvancedSelector (ground units, HATRED_DES)
 * pick one operator on its own row (walking left / right) or column (up / down) ahead of it. It plays Skill_Begin (its clip,
 * 1 s); as the cast ends (ActionToOwner) it switches to the mode Run and walks (enemy_mnctur_direction:
 * EnemyForceTracePosition — the engine's trace, at its own speed [추정·화면: no speed in the prefab or on PRTS]) to the
 * centre of the target's tile as it was marked (on a high tile: the last walkable tile of the line before it). In Run (no attack) its CollideChar aura (radius MNCTUR_COLLIDE_RADIUS + the
 * operator's collider, ground units) hits the first unit it meets — 碰撞 ATK × `CollideChar.atk_scale_collide` (2) physical,
 * once (enemy_mnctur_collide_mark) — then it stops tracing and plays rushEndNormal (Skill_End, 0.333 s) back to Default.
 * Reaching the spot with nobody met: rushEndNormal too (enemy_mnctur_check_target every 0.1 s: CheckEnemyIsTracingTarget).
 * Blocked during the walk: it counts as meeting its blocker [추정·엔진: our block contact (0.707) is a hair farther than the
 * aura's 0.70 — in the client the aura is the one that fires]. 入戏 (trap_pirene_func[enemy][real], a stage device's buff —
 * none in this mode) and so rushEndAdvance (撞墙: true damage, 15 s stun, 20 s cooldown) never come.
 */
function kitParadulis(ab) {
  const s = ab.sk.rush, scale = T(ab, 'CollideChar.atk_scale_collide') ?? 1;
  const endDur = (ab.sk.rushEndNormal && ab.sk.rushEndNormal.cast && ab.sk.rushEndNormal.cast.dur) || 0;
  const reach = MNCTUR_COLLIDE_RADIUS + ALLY_COLLIDER_RADIUS;
  const P = { state: 'idle', dir: null, px: 0, py: 0 };
  // the operators ahead on its line of walk: its row going left / right, its column going up / down
  const ahead = (b, e) => {
    const d = P.dir;
    if (!d) return [];
    const r = Math.round(e.y), c = Math.round(e.x);
    return b.allies().filter((u) => canTargetAlly(e, u) && !u.isFlying
      && (d[0] ? u.tileR === r && (u.x - e.x) * d[0] > 0 : u.tileC === c && (u.y - e.y) * d[1] > 0));
  };
  const endRun = (b, e) => { // rushEndNormal: Skill_End, then Default
    P.state = 'end';
    e.trace = null;
    if (e.route) e.route.pts = null;
    b.fx('enemySkill', { x: e.x, y: e.y, id: e.id, ability: 'rushEndNormal', n: 1 });
    const back = () => { if (!e.alive || P.state !== 'end') return; P.state = 'idle'; b.removeBuff(e, 'ab:mncturEnd'); mode(b, e, null); setForm(b, e, null); };
    if (endDur > 0) {
      b.addBuff(e, { key: 'ab:mncturEnd', duration: endDur, flags: { noMove: true } });
      b.after(endDur, back, { owner: e });
    } else back();
  };
  const rush = skill(s, (b, e) => {
    const t = byPriority(e, ahead(b, e))[0];
    if (!t) return;
    P.state = 'begin';
    // the marked tile, or — when it cannot be walked (a unit on a high tile) — the last walkable tile of the line before it
    // [추정·엔진: EnemyForceTracePosition's path to a tile it cannot stand on was not read]
    const d = P.dir, g = b.grid;
    let r = Math.round(e.y), c = Math.round(e.x);
    while ((r !== t.tileR || c !== t.tileC) && g.walkable(r + d[1], c + d[0])) { r += d[1]; c += d[0]; }
    const to = { r, c };
    atCastEvent(b, e, s, () => {   // (a cast cut short never gets here: onCut below)
      P.state = 'run';
      mode(b, e, 'Run');
      setForm(b, e, 'Run');
      e.trace = to;
    });
  }, { cond: (b, e) => P.state === 'idle' && !e.blockedBy && ahead(b, e).length > 0 });
  // a cast cut short (stun, freeze …) never runs
  if (rush) rush.onCut = () => { if (P.state === 'begin') P.state = 'idle'; };
  return [{
    spawn(b, e) { P.px = e.x; P.py = e.y; },
    tick(b, e) {
      // its way of walk (the last step it took)
      const dx = e.x - P.px, dy = e.y - P.py;
      if (e.moving && dx * dx + dy * dy > 1e-12) P.dir = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      P.px = e.x; P.py = e.y;
      if (P.state !== 'run' || !e.alive) return;
      const hit = e.blockedBy && e.blockedBy.alive ? e.blockedBy
        : areaAllies(b, e, e.x, e.y, reach).filter((u) => !u.isFlying).sort((p, q) => hypot(p.x - e.x, p.y - e.y) - hypot(q.x - e.x, q.y - e.y) || p.id - q.id)[0];
      if (hit) {
        // (the moment 'buff:enemy_mnctur_collide_char': its template's enemy_mnctur_rush_hit on the unit — display only, hitFx)
        if (hurt(b, e, hit, e.s.atk * scale, 'phys', { tags: ['mncturRush'] }) > 0) hitFx(b, hit, 'buff:enemy_mnctur_collide_char', e);
        endRun(b, e);
        return;
      }
      const t = e.trace;
      if (!t || hypot(e.x - t.c, e.y - t.r) <= 1e-6) endRun(b, e);
    },
  }, rush].filter(Boolean);
}

// ---------------------------------------------------------------------------------------------------------------
// this module's part of KITS

export const CRITIC_KITS = {
  enemy_1191_krgrg: kitIceGuard,                           // 冰原卫法者 · knocked out: arts blast + cold on both sides; bleeds in 失衡
  enemy_1191_krgrg_2: kitIceGuard,                         // 冰原御法者 · same
  enemy_1406_chghmr: kitLinePusher,                        // 战线推进者 · first attack after each block: PowerHit, ATK +80 %
  enemy_1403_gunsho: kitRapidCrossbow,                     // 速射轻弩手 · 直击: 3 bolts along its row / column
  enemy_1403_gunsho_2: kitRapidCrossbow,                   // 速射劲弩手 · same
  enemy_1409_bdguad_2: kitMatteoGuard,                     // 马特奥的近卫 · 直击: 2 bombs; damage taken −40 % unblocked
  enemy_1405_boomer_2: kitGrenadier,                       // 无畏掷弹兵 · first hit unblocked: 4 bombs, then faster and lighter
  enemy_1213_mtrsnp: kitPfSniper,                          // 寻路者狙击手 · ammo 1: HeadShot ATK × 2
  enemy_1216_cansld: kitPfBreaker,                         // 寻路者破阵者 · melee; ammo 2: a 3 × 3 shell
  enemy_1219_mtrbty: kitPfHerald,                          // 寻路者传令兵 · melee; ammo 1: ATK × 1.5 arts + 15 s 缴械·沉默
  enemy_1373_ltnhor: kitBandHorn,                          // 残党乐团圆号手 · 2 attacks, then 2 targets; no 变奏 here
  enemy_1373_ltnhor_2: kitBandHorn,                        // 巫王乐团圆号手 · same
  enemy_1375_ltnclr: kitBandClarinet,                      // 残党乐团管乐家 · unblocked ATK +30 per 0.5 s (30 max), spent by its attack
  enemy_1375_ltnclr_2: kitBandClarinet,                    // 巫王乐团管乐家 · same
  enemy_1376_ltndru: kitBandDrummer,                       // 残党乐团鼓手 · 2 attacks, then arts ATK within 2
  enemy_1376_ltndru_2: kitBandDrummer,                     // 巫王乐团鼓手 · same
  enemy_1388_wingnt: kitSnowballer,                        // “投石机” · first: an arts ATK × 1.5 cross snowball (2.5), then melee
  enemy_1388_wingnt_2: kitSnowballer,                      // “榴弹炮” · same
  enemy_1385_winbom: kitJetCanister,                       // “喷射罐” · 4 s channel of 3 arts hits, 3 s rest; knocked out: arts + 10 s cold within 1.55
  enemy_1385_winbom_2: kitJetCanister,                     // “喷爆罐” · same
  enemy_1428_lrsoul: kitSoulVortex,                        // 魂灵涡流 · melee; marked for the soul capturers
  enemy_1431_lrmzrd: kitSoulMage,                          // 注能魂灵法骸 · captures vortices (3 max); a soul → an orbiting arts fireball (3 at most)
  enemy_1431_lrmzrd_2: kitSoulMage,                        // 粹影魂灵法骸 · same
  enemy_1429_lrwzrd: kitSoulWizard,                        // 聚焦魂灵残迹 · captures vortices; all souls → an 8 s arts laser along its row / column
  enemy_1429_lrwzrd_2: kitSoulWizard,                      // 棱镜魂灵残迹 · same
  enemy_1309_mhboar_2: kitRagingBoar,                      // 狂暴凶豕兽 · weight 2; unblocked: speed +33.3 % every 0.333 s after 3 s; crash / first attack × speed
  enemy_10163_mnctur_2: kitParadulis,                      // 神勇的帕拉杜利斯 · 冲锋 at an operator ahead: ATK × 2 on the first unit met
};
